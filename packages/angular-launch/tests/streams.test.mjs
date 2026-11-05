import "@angular/compiler";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mock, test } from "node:test";
import { createEnvironmentInjector, PLATFORM_ID, runInInjectionContext } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { defineContext, defineRpc, forbidden, middleware } from "../dist/server/index.js";
import { createRequestScope, handleRpc } from "../dist/server/generated.js";
import { dispatch } from "../dist/server/dispatch.js";
import { injectClient } from "../dist/generated.js";
import { RpcError } from "../dist/index.js";

const application = {
  id: "launch-stream-test-app",
  context: defineContext((request) => ({ user: request.headers.get("cookie") })),
};
const nullSchema = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value) => {
      if (value !== null) {
        return { issues: [{ message: "Expected null" }] };
      }

      return { value: null };
    },
  },
};
const countSchema = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value) => {
      if (typeof value !== "number") {
        return { issues: [{ message: "Expected a count" }] };
      }

      return { value };
    },
  },
};
const signedIn = middleware(async ({ context, next }) => {
  if (context.user === null) {
    throw forbidden();
  }

  return next();
});

function post(path, input, { cookie = "alice" } = {}) {
  const headers = { origin: "http://test", "content-type": "application/json" };

  if (cookie !== null) {
    headers.cookie = cookie;
  }

  return new Request(`http://test${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ input }),
  });
}

function handle(registry, request) {
  return handleRpc(registry, application, request, { allowedHosts: ["test"] });
}

async function events(response) {
  const text = await response.text();

  return text.split("\n\n").filter((event) => event !== "");
}

// Runs `run` with console.error captured, returning what it logged.
async function logged(run) {
  const entries = [];
  const previous = console.error;

  console.error = (...args) => entries.push(args);

  try {
    await run();
  } finally {
    console.error = previous;
  }

  return entries;
}

test("a stream answers with one value event per yield, then end, as an uncached event stream", async () => {
  const registry = {
    live: defineRpc("live", ({ stream }) => ({
      count: stream({
        input: countSchema,
        handler: async function* ({ input, context }) {
          for (let index = 0; index < input; index += 1) {
            yield { index, user: context.user };
          }
        },
      }),
    })),
  };
  const response = await handle(registry, post("/_rpc/live/count", 2));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  assert.equal(response.headers.get("cache-control"), "private, no-store, no-transform");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-accel-buffering"), "no");
  assert.deepEqual(await events(response), [
    'event: value\ndata: {"index":0,"user":"alice"}',
    'event: value\ndata: {"index":1,"user":"alice"}',
    "event: end\ndata: null",
  ]);
});

test("failures before the handler returns are ordinary replies; later ones end the stream with an error event", async () => {
  let returned = 0;
  const registry = {
    live: defineRpc(
      "live",
      ({ stream }) => ({
        fail: stream({
          input: countSchema,
          errors: { GONE: { status: 410, message: "Gone", data: nullSchema } },
          handler: async function* ({ input, errors }) {
            try {
              yield 1;

              if (input === 0) {
                throw errors.GONE(null);
              }

              if (input === 1) {
                throw forbidden();
              }

              if (input === 2) {
                throw new Error("Private stream failure");
              }

              yield { at: new Date() };
            } finally {
              returned += 1;
            }
          },
        }),
      }),
      { use: [signedIn] },
    ),
  };

  const refused = await handle(registry, post("/_rpc/live/fail", 0, { cookie: null }));

  assert.equal(refused.status, 403);
  assert.equal(refused.headers.get("content-type"), "application/json");
  assert.deepEqual(await refused.json(), {
    error: { code: "FORBIDDEN", message: "RPC forbidden", data: null },
  });

  const invalid = await handle(registry, post("/_rpc/live/fail", "zero"));

  assert.equal(invalid.status, 400);
  assert.deepEqual((await invalid.json()).error.data, {
    issues: [{ path: [], message: "Expected a count" }],
  });

  const declared = await handle(registry, post("/_rpc/live/fail", 0));

  assert.equal(declared.status, 200);
  assert.deepEqual(await events(declared), [
    "event: value\ndata: 1",
    'event: error\ndata: {"status":410,"error":{"code":"GONE","message":"Gone","data":null}}',
  ]);

  const refusedLater = await handle(registry, post("/_rpc/live/fail", 1));

  assert.deepEqual(
    (await events(refusedLater))[1],
    'event: error\ndata: {"status":403,"error":{"code":"FORBIDDEN","message":"RPC forbidden","data":null}}',
  );

  const internal =
    'event: error\ndata: {"status":500,"error":{"code":"INTERNAL","message":"Internal server error","data":null}}';
  let thrown;
  const thrownLog = await logged(async () => {
    thrown = await events(await handle(registry, post("/_rpc/live/fail", 2)));
  });

  assert.deepEqual(thrown, ["event: value\ndata: 1", internal]);
  assert.match(String(thrownLog[0][1]), /Private stream failure/);

  // A value that isn't strict JSON fails the call, and the suspended handler still returns.
  const before = returned;
  let notJson;

  await logged(async () => {
    notJson = await events(await handle(registry, post("/_rpc/live/fail", 3)));
  });
  assert.deepEqual(notJson, ["event: value\ndata: 1", internal]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(returned - before, 1);
});

test("middleware wraps the whole stream: next() settles when the stream ends", async () => {
  const seen = [];
  const registry = {
    live: defineRpc(
      "live",
      ({ stream }) => ({
        count: stream({
          input: countSchema,
          handler: async function* ({ input }) {
            seen.push("handler");
            yield 1;
            seen.push("after yield");

            if (input === 1) {
              throw new Error("Private failure");
            }
          },
        }),
      }),
      {
        use: [
          middleware(async ({ next }) => {
            seen.push("before");

            try {
              const result = await next();

              seen.push("resolved");

              return result;
            } catch (error) {
              seen.push(`rejected: ${error.message}`);

              throw error;
            }
          }),
        ],
      },
    ),
  };

  await events(await handle(registry, post("/_rpc/live/count", 0)));
  assert.deepEqual(seen, ["before", "handler", "after yield", "resolved"]);
  seen.length = 0;
  await logged(async () => {
    await events(await handle(registry, post("/_rpc/live/count", 1)));
  });
  assert.deepEqual(seen, ["before", "handler", "after yield", "rejected: Private failure"]);
});

test("cancelling the body aborts the call's signal, and next() resolves once the handler returned", async () => {
  const seen = [];
  const gate = Promise.withResolvers();
  let signal;
  const registry = {
    live: defineRpc(
      "live",
      ({ stream }) => ({
        forever: stream({
          handler: async function* (args) {
            signal = args.signal;

            try {
              yield 0;
              // Work that ignores the signal, such as a database call.
              await gate.promise;
              seen.push("work finished");
              yield 1;
            } finally {
              seen.push("returned");
            }
          },
        }),
      }),
      {
        use: [
          middleware(async ({ next }) => {
            const result = await next();

            seen.push("next resolved");

            return result;
          }),
        ],
      },
    ),
  };
  const response = await handle(registry, post("/_rpc/live/forever", null));
  const reader = response.body.getReader();

  await reader.read();
  // The body pulls the next value, so the handler is now waiting on its work.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(signal.aborted, false);
  await reader.cancel(new Error("client went away"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(signal.aborted, true);
  // Middleware wrapping the stream doesn't clean up while the handler still works.
  assert.deepEqual(seen, []);
  gate.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, ["work finished", "returned", "next resolved"]);
});

test("a failure in the handler's pending step reaches middleware even when the body is cancelled meanwhile", async () => {
  const seen = [];
  const gate = Promise.withResolvers();
  const registry = {
    live: defineRpc(
      "live",
      ({ stream }) => ({
        failing: stream({
          handler: async function* () {
            try {
              yield 0;
              await gate.promise;
              yield 1;
            } finally {
              seen.push("returned");
            }
          },
        }),
      }),
      {
        use: [
          middleware(async ({ next }) => {
            try {
              return await next();
            } catch (error) {
              seen.push(`next rejected: ${error.message}`);

              throw error;
            }
          }),
        ],
      },
    ),
  };
  const response = await handle(registry, post("/_rpc/live/failing", null));
  const reader = response.body.getReader();

  await reader.read();
  await new Promise((resolve) => setImmediate(resolve));
  await reader.cancel(new Error("client went away"));

  const log = await logged(async () => {
    gate.reject(new Error("database failed"));
    await new Promise((resolve) => setImmediate(resolve));
  });

  assert.deepEqual(seen, ["returned", "next rejected: database failed"]);
  assert.match(String(log[0][1]), /database failed/);
});

test("a request aborted before its stream is read stops the stream, also before the handler started", async () => {
  const seen = [];
  const gate = Promise.withResolvers();
  let signal;
  const registry = {
    live: defineRpc(
      "live",
      ({ stream }) => ({
        waiting: stream({
          handler: async function* (args) {
            signal = args.signal;
            seen.push("handler started");

            try {
              // An abort-aware wait, such as for the next change.
              await new Promise((resolve) => args.signal.addEventListener("abort", resolve));
              yield "late";
            } finally {
              seen.push("returned");
            }
          },
        }),
      }),
      {
        use: [
          middleware(async ({ next }) => {
            await gate.promise;

            const result = await next();

            seen.push("next resolved");

            return result;
          }),
        ],
      },
    ),
  };

  // The client leaves after the stream started but before anything read its body.
  {
    const client = new AbortController();
    const request = new Request(post("/_rpc/live/waiting", null), { signal: client.signal });

    gate.resolve();

    const response = await handle(registry, request);

    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(seen, ["handler started"]);
    client.abort();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(signal.aborted, true);
    assert.deepEqual(seen, ["handler started", "returned", "next resolved"]);
    await assert.rejects(response.body.getReader().read());
  }

  // The client leaves while middleware still runs: the body is already over when it exists.
  {
    seen.length = 0;

    const client = new AbortController();
    const request = new Request(post("/_rpc/live/waiting", null), { signal: client.signal });
    const later = Promise.withResolvers();
    const pausing = {
      live: defineRpc("live", () => ({ waiting: registry.live.procedures.waiting }), {
        use: [
          middleware(async ({ next }) => {
            await later.promise;

            const result = await next();

            seen.push("next resolved");

            return result;
          }),
        ],
      }),
    };
    const pending = handle(pausing, request);

    await new Promise((resolve) => setImmediate(resolve));
    client.abort();
    later.resolve();

    const response = await pending;

    await new Promise((resolve) => setImmediate(resolve));
    await assert.rejects(response.body.getReader().read());
    // The generator was returned before its body ever ran.
    assert.deepEqual(seen, ["next resolved"]);
  }
});

test("an idle stream sends a keep-alive comment every 15 s", async () => {
  mock.timers.enable({ apis: ["setInterval"] });

  try {
    const gate = Promise.withResolvers();
    const registry = {
      live: defineRpc("live", ({ stream }) => ({
        idle: stream({
          handler: async function* () {
            await gate.promise;
            yield 1;
          },
        }),
      })),
    };
    const response = await handle(registry, post("/_rpc/live/idle", null));
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    const first = reader.read();

    mock.timers.tick(15_000);
    assert.deepEqual(await first, { done: false, value: ": keep-alive\n\n" });
    gate.resolve();
    await reader.cancel();
  } finally {
    mock.timers.reset();
  }
});

test("streams are refused during server rendering before any middleware runs", async () => {
  let ran = false;
  const registry = {
    live: defineRpc(
      "live",
      ({ stream }) => ({
        watch: stream({
          handler: async function* () {
            yield 1;
          },
        }),
      }),
      {
        use: [
          middleware(async ({ next }) => {
            ran = true;

            return next();
          }),
        ],
      },
    ),
  };
  const page = new Request("http://test/live", { headers: { cookie: "alice" } });
  const scope = await createRequestScope(application, page);
  const reply = await dispatch(
    registry,
    "/_rpc/live/watch",
    { input: null },
    scope,
    application,
    scope.request,
    "rendering",
  );

  assert.deepEqual(reply, {
    status: 403,
    body: { error: { code: "FORBIDDEN", message: "RPC forbidden", data: null } },
  });
  assert.equal(ran, false);
});

// Bodies a Launch server doesn't send, each in one chunk.
const rawBodies = {
  "/_rpc/raw/truncated": "event: value\ndata: 1\n\n",
  "/_rpc/raw/batch": "event: value\ndata: 1\n\nevent: value\ndata: 2\n\nevent: end\ndata: null\n\n",
  "/_rpc/raw/garbled": "event: value\ndata: {oops\n\n",
};

// The browser client over a real HTTP server whose host cancels the body when the
// connection closes, as Angular's writeResponseToNodeResponse does.
async function serve(registry) {
  const server = createServer(async (incoming, outgoing) => {
    // A refusal whose body never finishes arriving.
    if (incoming.url === "/_rpc/raw/slowRefusal") {
      outgoing.writeHead(403, { "content-type": "application/json" });
      outgoing.write('{"error":');

      return;
    }

    const chunks = [];

    for await (const chunk of incoming) {
      chunks.push(chunk);
    }

    const request = new Request(`http://${incoming.headers.host}${incoming.url}`, {
      method: incoming.method,
      headers: incoming.headers,
      body: Buffer.concat(chunks),
    });
    const response = await handleRpc(registry, application, request, {
      allowedHosts: ["127.0.0.1"],
    });

    outgoing.writeHead(response.status, Object.fromEntries(response.headers));

    const reader = response.body.getReader();

    outgoing.once("close", () => {
      reader.cancel().catch(() => undefined);
    });

    while (true) {
      const chunk = await reader.read().catch(() => ({ done: true }));

      if (chunk.done) {
        break;
      }

      outgoing.write(chunk.value);
    }

    outgoing.end();
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const base = `http://127.0.0.1:${server.address().port}`;
  const realFetch = globalThis.fetch;
  const requests = [];

  // Browsers resolve /_rpc/ against the page and send the cookie and Origin themselves.
  globalThis.fetch = (url, init) => {
    requests.push(url);

    if (Object.hasOwn(rawBodies, url)) {
      return Promise.resolve(
        new Response(rawBodies[url], {
          headers: { "content-type": "text/event-stream; charset=utf-8" },
        }),
      );
    }

    return realFetch(new URL(url, base), {
      ...init,
      headers: { ...Object.fromEntries(new Headers(init.headers)), origin: base, cookie: "alice" },
    });
  };

  return {
    requests,
    close() {
      globalThis.fetch = realFetch;
      server.closeAllConnections();
      server.close();
    },
  };
}

function client(platform = "browser") {
  const parent = createEnvironmentInjector([]);
  const injector = createEnvironmentInjector(
    [
      { provide: HttpClient, useValue: {} },
      { provide: PLATFORM_ID, useValue: platform },
    ],
    parent,
  );
  const rpc = runInInjectionContext(injector, () =>
    injectClient({
      live: {
        methods: [
          { name: "count", input: true, kind: "stream", errors: [] },
          {
            name: "fail",
            input: false,
            kind: "stream",
            errors: [{ code: "GONE", status: 410, message: "Gone" }],
          },
          { name: "forever", input: false, kind: "stream", errors: [] },
        ],
      },
      raw: {
        methods: [
          { name: "truncated", input: false, kind: "stream", errors: [] },
          { name: "batch", input: false, kind: "stream", errors: [] },
          { name: "garbled", input: false, kind: "stream", errors: [] },
          { name: "slowRefusal", input: false, kind: "stream", errors: [] },
        ],
      },
    }),
  );

  return {
    rpc,
    destroy: () => {
      injector.destroy();
      parent.destroy();
    },
  };
}

async function collect(iterable, stopAfter) {
  const values = [];

  for await (const value of iterable) {
    values.push(value);

    if (values.length === stopAfter) {
      break;
    }
  }

  return values;
}

test("the browser client yields values, ends, reconnects by iterating again and owns its errors", async () => {
  const seen = [];
  const registry = {
    live: defineRpc("live", ({ stream }) => ({
      count: stream({
        input: countSchema,
        handler: async function* ({ input }) {
          for (let index = 0; index < input; index += 1) {
            yield index;
          }
        },
      }),
      fail: stream({
        errors: { GONE: { status: 410, message: "Gone", data: nullSchema } },
        handler: async function* ({ errors }) {
          yield "first";
          throw errors.GONE(null);
        },
      }),
      forever: stream({
        handler: async function* ({ signal }) {
          signal.addEventListener("abort", () => seen.push("aborted"));

          try {
            for (let index = 0; ; index += 1) {
              await new Promise((resolve) => setTimeout(resolve, 5));
              yield index;
            }
          } finally {
            seen.push("returned");
          }
        },
      }),
    })),
  };
  const server = await serve(registry);
  const { rpc, destroy } = client();

  try {
    assert.equal(rpc.live.count.kind, "stream");

    const counted = rpc.live.count(3);

    assert.deepEqual(await collect(counted), [0, 1, 2]);
    assert.deepEqual(await collect(counted), [0, 1, 2]);
    assert.equal(server.requests.length, 2);

    const failed = [];
    let error;

    try {
      for await (const value of rpc.live.fail()) {
        failed.push(value);
      }
    } catch (caught) {
      error = caught;
    }

    assert.deepEqual(failed, ["first"]);
    assert.ok(error instanceof RpcError);
    assert.deepEqual(
      [error.code, error.status, error.message, error.data],
      ["GONE", 410, "Gone", null],
    );
    assert.equal(rpc.live.fail.isError(error), true);
    assert.equal(rpc.live.count.isError(error), false);

    // break closes the request: the server aborts the handler's signal and returns it.
    assert.deepEqual(await collect(rpc.live.forever(), 2), [0, 1]);

    for (let attempt = 0; attempt < 100 && seen.length < 2; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    assert.deepEqual(
      seen.toSorted((left, right) => left.localeCompare(right)),
      ["aborted", "returned"],
    );

    const controller = new AbortController();
    const aborted = collect(rpc.live.forever({ signal: controller.signal }));

    setTimeout(() => controller.abort(), 20);
    await assert.rejects(aborted, { name: "AbortError" });
    controller.abort();
    await assert.rejects(collect(rpc.live.forever({ signal: controller.signal })), {
      name: "AbortError",
    });

    // Values that arrived together aren't delivered after an abort.
    const batch = new AbortController();
    const delivered = [];
    const batchError = await (async () => {
      for await (const value of rpc.raw.batch({ signal: batch.signal })) {
        delivered.push(value);
        batch.abort();
      }
    })().catch((error) => error);

    assert.deepEqual(delivered, [1]);
    assert.equal(batchError.name, "AbortError");
    assert.deepEqual(await collect(rpc.raw.batch()), [1, 2]);
    await assert.rejects(collect(rpc.raw.garbled()), {
      name: "TypeError",
      message: "Launch stream sent an event whose data isn't JSON",
    });

    // Aborting while a refusal's body arrives is still an abort, not a transport failure.
    const refusal = new AbortController();
    const refused = collect(rpc.raw.slowRefusal({ signal: refusal.signal }));

    setTimeout(() => refusal.abort(), 50);
    await assert.rejects(refused, { name: "AbortError" });

    // A body that ends without its end event is a transport failure, not a clean end.
    await assert.rejects(collect(rpc.raw.truncated()), {
      name: "TypeError",
      message: "Launch stream ended without its end event",
    });
  } finally {
    destroy();
    server.close();
  }
});

test("the client rejects a refused stream with its own RpcError, and every stream during server rendering", async () => {
  const registry = {
    live: defineRpc("live", ({ stream }) => ({
      count: stream({
        input: countSchema,
        handler: async function* () {
          yield 1;
        },
      }),
    })),
  };
  const server = await serve(registry);
  const browser = client();
  const rendering = client("server");

  try {
    // Bad input is refused before the stream starts, with the usual INVALID_INPUT data.
    const invalid = await collect(browser.rpc.live.count("one")).catch((error) => error);

    assert.ok(browser.rpc.live.count.isError(invalid));
    assert.equal(invalid.code, "INVALID_INPUT");
    assert.deepEqual(invalid.data, { issues: [{ path: [], message: "Expected a count" }] });

    const before = server.requests.length;
    const refused = await collect(rendering.rpc.live.count(1)).catch((error) => error);

    assert.ok(rendering.rpc.live.count.isError(refused));
    assert.equal(refused.code, "FORBIDDEN");
    assert.equal(refused.status, 403);
    assert.equal(server.requests.length, before);
  } finally {
    browser.destroy();
    rendering.destroy();
    server.close();
  }
});
