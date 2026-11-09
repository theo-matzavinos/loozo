import "@angular/compiler";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";
import { Duplex } from "node:stream";
import { test } from "node:test";
import { WebSocketServer } from "ws";
import { createEnvironmentInjector, PLATFORM_ID, runInInjectionContext } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import {
  defineContext,
  defineRpc,
  forbidden,
  middleware,
  notFound,
  redirect,
} from "../dist/server/index.js";
import { createRequestScope, handleChannelUpgrade, handleRpc } from "../dist/server/generated.js";
import { dispatch } from "../dist/server/dispatch.js";
import { createUpgradeHandler } from "../dist/node/index.js";
import { injectClient } from "../dist/generated.js";
import { RpcError, RpcNotFound, RpcRedirect } from "../dist/index.js";

let contexts = 0;
let failingContext = false;
const application = {
  id: "launch-channel-test-app",
  context: defineContext((request) => {
    contexts += 1;

    if (failingContext) {
      throw new Error("Private context failure");
    }

    return { user: request.headers.get("cookie") };
  }),
};

function schema(check, message) {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) => {
        if (!check(value)) {
          return { issues: [{ message }] };
        }

        return { value };
      },
    },
  };
}

const nullSchema = schema((value) => value === null, "Expected null");
const roomSchema = schema(
  (value) => typeof value === "object" && value !== null && typeof value.room === "string",
  "Expected a room",
);
const textSchema = schema(
  (value) => typeof value === "object" && value !== null && typeof value.text === "string",
  "Expected a text",
);
const anySchema = schema(() => true, "");
const signedIn = middleware(async ({ context, next }) => {
  if (context.user === null) {
    throw forbidden();
  }

  return next();
});

// The server side of a WHATWG WebSocket, driven by the test as the client.
class FakeSocket extends EventTarget {
  readyState = 1;
  bufferedAmount = 0;
  sent = [];
  closedWith;

  send(frame) {
    this.sent.push(frame);
  }

  close(code) {
    if (this.readyState === 3) {
      return;
    }

    this.readyState = 3;
    this.closedWith = code;
    this.dispatchEvent(new Event("close"));
  }

  receive(data) {
    if (typeof data === "string") {
      this.dispatchEvent(new MessageEvent("message", { data }));

      return;
    }

    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
  }

  // The client goes away.
  leave() {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }

  frames() {
    return this.sent.map((frame) => JSON.parse(frame));
  }
}

function upgradeRequest(
  path,
  input = null,
  {
    cookie = "alice",
    origin = "http://test",
    host = "test",
    method = "GET",
    upgrade = "websocket",
    query,
    signal,
  } = {},
) {
  const headers = { connection: "Upgrade" };

  if (upgrade !== null) {
    headers.upgrade = upgrade;
  }

  if (origin !== null) {
    headers.origin = origin;
  }

  if (cookie !== null) {
    headers.cookie = cookie;
  }

  let search = query;

  if (search === undefined) {
    search = `?input=${encodeURIComponent(JSON.stringify(input))}`;
  }

  return new Request(`http://${host}${path}${search}`, { method, headers, signal });
}

function handle(registry, request) {
  return handleChannelUpgrade(registry, application, request, { allowedHosts: ["test"] });
}

async function accepted(registry, request) {
  const upgrade = await handle(registry, request);

  assert.ok(upgrade !== null && !(upgrade instanceof Response), "Expected an upgrade");

  const socket = new FakeSocket();

  upgrade.accept(socket);

  return { upgrade, socket };
}

async function until(check, what = "the condition") {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (check()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  assert.fail(`Timed out waiting for ${what}`);
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

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

const internal = {
  status: 500,
  error: { code: "INTERNAL", message: "Internal server error", data: null },
};
const malformed = {
  status: 400,
  error: { code: "INVALID_INPUT", message: "Invalid RPC input", data: { issues: [] } },
};

test("a channel sends its values, reads validated messages in order, puts the call's cookies on the 101 and ends", async () => {
  const registry = {
    chat: defineRpc(
      "chat",
      ({ channel }) => ({
        talk: channel({
          input: roomSchema,
          message: textSchema,
          handler: async function* ({ context, input, messages, response }) {
            yield { room: input.room, user: context.user };

            try {
              response.setCookie("late", "1");
            } catch (error) {
              yield { cookie: error.message };
            }

            for await (const message of messages) {
              if (message.text === "bye") {
                return;
              }

              yield { echo: message.text };
            }
          },
        }),
      }),
      {
        use: [
          middleware(async ({ response, next }) => {
            response.setCookie("seen", "1");
            response.headers.set("x-call", "yes");

            return next();
          }),
        ],
      },
    ),
  };
  const { upgrade, socket } = await accepted(
    registry,
    upgradeRequest("/_rpc/chat/talk", { room: "a" }),
  );

  assert.equal(upgrade.headers.get("set-cookie"), "seen=1; Path=/; HttpOnly; Secure; SameSite=Lax");
  assert.equal(upgrade.headers.get("x-call"), "yes");
  socket.receive({ message: { text: "one" } });
  socket.receive({ message: { text: "two" } });
  socket.receive({ message: { text: "bye" } });
  await until(() => socket.closedWith !== undefined, "the end");
  assert.deepEqual(socket.frames(), [
    { value: { room: "a", user: "alice" } },
    { value: { cookie: socket.frames()[1].value.cookie } },
    { value: { echo: "one" } },
    { value: { echo: "two" } },
    { end: null },
  ]);
  assert.match(socket.frames()[1].value.cookie, /already sent this call's response/);
  assert.equal(socket.closedWith, 1000);
});

test("pre-context refusals are HTTP responses, in order: host, then shape, then origin", async () => {
  let ran = false;
  const registry = {
    chat: defineRpc("chat", ({ channel }) => ({
      talk: channel({
        message: anySchema,
        handler: async function* () {
          ran = true;
          yield 1;
        },
      }),
    })),
  };
  const before = contexts;

  assert.equal(await handle(registry, upgradeRequest("/page")), null);

  // A foreign host wins over everything else.
  const host = await logged(async () => {
    const response = await handle(
      registry,
      upgradeRequest("/_rpc/chat/talk", null, { host: "evil", method: "POST", origin: null }),
    );

    assert.equal(response.status, 400);
    assert.equal(response.headers.get("content-type"), "text/plain");
    assert.equal(await response.text(), "Host not allowed");
  });

  assert.match(String(host[0][0]), /host evil/);

  const shapes = [
    { method: "POST" },
    { upgrade: null },
    { upgrade: "h2c" },
    { query: "" },
    { query: "?input=%7Bbroken" },
    // JSON.parse reads an overflowing number as Infinity, which isn't strict JSON.
    { query: "?input=1e400" },
    { query: `?input=${encodeURIComponent('{"room":[1e400]}')}` },
    { query: "?input=null&extra=1" },
    { query: "?value=null" },
    // A malformed request is refused before its origin is checked.
    { upgrade: null, origin: "http://evil" },
  ];

  for (const shape of shapes) {
    const response = await handle(registry, upgradeRequest("/_rpc/chat/talk", null, shape));

    assert.equal(response.status, 400, JSON.stringify(shape));
    assert.deepEqual(await response.json(), {
      error: { code: "INVALID_INPUT", message: "Invalid RPC input", data: { issues: [] } },
    });
  }

  for (const origin of ["http://evil", null]) {
    const log = await logged(async () => {
      const response = await handle(registry, upgradeRequest("/_rpc/chat/talk", null, { origin }));

      assert.equal(response.status, 403);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(await response.json(), {
        error: { code: "FORBIDDEN", message: "RPC forbidden", data: null },
      });
    });

    assert.match(String(log[0][0]), /cross-origin RPC/);
  }

  assert.equal(contexts, before);
  assert.equal(ran, false);
});

test("RPC_NOT_FOUND for a non-channel over handleUpgrade and a channel over handleRequest; FORBIDDEN while rendering", async () => {
  let ran = false;
  const registry = {
    chat: defineRpc(
      "chat",
      ({ query, channel }) => ({
        read: query({ handler: () => 1 }),
        talk: channel({
          message: anySchema,
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
  const notFoundFrame = {
    status: 404,
    error: { code: "RPC_NOT_FOUND", message: "RPC not found", data: null },
  };

  for (const path of ["/_rpc/chat/read", "/_rpc/chat/missing", "/_rpc/other/talk"]) {
    const { socket } = await accepted(registry, upgradeRequest(path));

    assert.deepEqual(socket.frames(), [notFoundFrame], path);
    assert.equal(socket.closedWith, 1000);
  }

  const overHttp = await handleRpc(
    registry,
    application,
    new Request("http://test/_rpc/chat/talk", {
      method: "POST",
      headers: { origin: "http://test", "content-type": "application/json" },
      body: JSON.stringify({ input: null }),
    }),
    { allowedHosts: ["test"] },
  );

  assert.equal(overHttp.status, 404);
  assert.deepEqual((await overHttp.json()).error.code, "RPC_NOT_FOUND");

  const page = new Request("http://test/chat", { headers: { cookie: "alice" } });
  const scope = await createRequestScope(application, page);
  const rendering = await dispatch(
    registry,
    "/_rpc/chat/talk",
    { input: null },
    scope,
    application,
    scope.request,
    "rendering",
  );

  assert.deepEqual(rendering, {
    status: 403,
    body: { error: { code: "FORBIDDEN", message: "RPC forbidden", data: null } },
  });
  assert.equal(ran, false);
});

test("failures before the handler returns are frames on the accepted socket, with the call's cookies", async () => {
  const registry = {
    chat: defineRpc(
      "chat",
      ({ channel }) => ({
        talk: channel({
          input: roomSchema,
          message: anySchema,
          errors: { GONE: { status: 410, message: "Gone", data: nullSchema } },
          handler: async function* ({ input, errors }) {
            yield "first";

            if (input.room === "gone") {
              throw errors.GONE(null);
            }

            if (input.room === "moved") {
              throw redirect("/elsewhere");
            }

            if (input.room === "missing") {
              throw notFound();
            }
          },
        }),
      }),
      {
        use: [
          middleware(async ({ response, next }) => {
            response.setCookie("tried", "1");

            return next();
          }),
          signedIn,
        ],
      },
    ),
  };

  const refused = await accepted(
    registry,
    upgradeRequest("/_rpc/chat/talk", { room: "a" }, { cookie: null }),
  );

  assert.equal(
    refused.upgrade.headers.get("set-cookie"),
    "tried=1; Path=/; HttpOnly; Secure; SameSite=Lax",
  );
  assert.deepEqual(refused.socket.frames(), [
    { status: 403, error: { code: "FORBIDDEN", message: "RPC forbidden", data: null } },
  ]);
  assert.equal(refused.socket.closedWith, 1000);

  const invalid = await accepted(registry, upgradeRequest("/_rpc/chat/talk", { room: 1 }));

  assert.deepEqual(invalid.socket.frames(), [
    {
      status: 400,
      error: {
        code: "INVALID_INPUT",
        message: "Invalid RPC input",
        data: { issues: [{ path: [], message: "Expected a room" }] },
      },
    },
  ]);

  const cases = [
    ["gone", { status: 410, error: { code: "GONE", message: "Gone", data: null } }],
    ["moved", { status: 303, redirect: { to: "/elsewhere" } }],
    ["missing", { status: 404, notFound: null }],
  ];

  for (const [room, frame] of cases) {
    const { socket } = await accepted(registry, upgradeRequest("/_rpc/chat/talk", { room }));

    await until(() => socket.closedWith !== undefined, room);
    assert.deepEqual(socket.frames(), [{ value: "first" }, frame]);
  }

  failingContext = true;

  try {
    let socket;
    const log = await logged(async () => {
      ({ socket } = await accepted(registry, upgradeRequest("/_rpc/chat/talk", { room: "a" })));
    });

    assert.deepEqual(socket.frames(), [internal]);
    assert.match(String(log[0][1]), /Private context failure/);
  } finally {
    failingContext = false;
  }
});

test("a message that fails validation, and every protocol violation, end the call with INVALID_INPUT", async () => {
  const seen = [];
  const registry = {
    chat: defineRpc("chat", ({ channel }) => ({
      talk: channel({
        message: textSchema,
        handler: async function* ({ messages, signal }) {
          signal.addEventListener("abort", () => seen.push("aborted"));
          yield "ready";

          try {
            for await (const message of messages) {
              yield message.text;
            }
          } catch (error) {
            seen.push(error.name);

            throw error;
          }
        },
      }),
      // A handler that swallows the refusal still ends with INVALID_INPUT.
      swallow: channel({
        message: textSchema,
        handler: async function* ({ messages }) {
          try {
            for await (const message of messages) {
              yield message.text;
            }
          } catch {
            yield "swallowed";
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        },
      }),
    })),
  };

  const invalid = await accepted(registry, upgradeRequest("/_rpc/chat/talk"));

  invalid.socket.receive({ message: { text: "ok" } });
  invalid.socket.receive({ message: { text: 1 } });
  await until(() => invalid.socket.closedWith !== undefined, "the refusal");
  assert.deepEqual(invalid.socket.frames(), [
    { value: "ready" },
    { value: "ok" },
    {
      status: 400,
      error: {
        code: "INVALID_INPUT",
        message: "Invalid RPC input",
        data: { issues: [{ path: [], message: "Expected a text" }] },
      },
    },
  ]);
  assert.deepEqual(seen, ["aborted", "MessageRefused"]);

  const swallowed = await accepted(registry, upgradeRequest("/_rpc/chat/swallow"));

  swallowed.socket.receive({ message: {} });
  await until(() => swallowed.socket.closedWith !== undefined, "the swallowed refusal");
  assert.deepEqual(swallowed.socket.frames().at(-1).error.data.issues, [
    { path: [], message: "Expected a text" },
  ]);

  const violations = [
    Buffer.from("binary"),
    "not json",
    '{"message":1e400}',
    '{"message":{"text":[-1e400]}}',
    "[1]",
    "null",
    { other: 1 },
    { message: 1, ready: 1 },
    // One value is outstanding, so granting two is too many.
    { ready: 2 },
    { ready: 0 },
    { ready: 1.5 },
  ];

  for (const violation of violations) {
    seen.length = 0;

    const { socket } = await accepted(registry, upgradeRequest("/_rpc/chat/talk"));

    await until(() => socket.sent.length === 1, "the first value");

    if (Buffer.isBuffer(violation)) {
      socket.dispatchEvent(new MessageEvent("message", { data: violation }));
    } else {
      socket.receive(violation);
    }

    await until(() => socket.closedWith !== undefined, JSON.stringify(violation));
    assert.deepEqual(socket.frames(), [{ value: "ready" }, malformed], String(violation));
    assert.ok(seen.includes("aborted"), String(violation));
  }
});

test("credit windows: the server holds at most 32 unread messages and grants 16 at a time", async () => {
  const gate = Promise.withResolvers();
  const read = [];
  const registry = {
    chat: defineRpc("chat", ({ channel }) => ({
      talk: channel({
        message: anySchema,
        handler: async function* ({ messages }) {
          yield "ready";
          await gate.promise;

          for await (const message of messages) {
            read.push(message);
          }
        },
      }),
    })),
  };

  const { socket } = await accepted(registry, upgradeRequest("/_rpc/chat/talk"));

  for (let index = 0; index < 32; index += 1) {
    socket.receive({ message: index });
  }

  await settle();
  assert.equal(socket.closedWith, undefined);
  assert.deepEqual(socket.frames(), [{ value: "ready" }]);

  gate.resolve();
  await until(() => read.length === 32, "the reads");
  // Two grants of 16 as the handler read the window.
  assert.deepEqual(socket.frames(), [{ value: "ready" }, { ready: 16 }, { ready: 16 }]);

  for (let index = 32; index < 64; index += 1) {
    socket.receive({ message: index });
  }

  await until(() => read.length === 64, "the second window");
  assert.equal(socket.closedWith, undefined);

  // One message beyond the credit breaks the protocol.
  const over = await accepted(registry, upgradeRequest("/_rpc/chat/talk"));

  for (let index = 0; index < 33; index += 1) {
    over.socket.receive({ message: index });
  }

  await until(() => over.socket.closedWith !== undefined, "the over-credit refusal");
  assert.deepEqual(over.socket.frames().at(-1), malformed);
});

test("credit windows: the server sends at most 256 unread values and pauses at the buffered mark", async () => {
  let pulled = 0;
  const registry = {
    chat: defineRpc("chat", ({ channel }) => ({
      flood: channel({
        message: anySchema,
        handler: async function* () {
          while (true) {
            pulled += 1;
            yield pulled;
          }
        },
      }),
      three: channel({
        message: anySchema,
        handler: async function* () {
          yield 1;
          yield 2;
          yield 3;
        },
      }),
    })),
  };

  const flood = await accepted(registry, upgradeRequest("/_rpc/chat/flood"));

  await until(() => flood.socket.sent.length === 256, "the window");
  await settle();
  // The generator stays suspended at its 256th yield: the next value isn't even computed.
  assert.equal(flood.socket.sent.length, 256);
  assert.equal(pulled, 256);

  flood.socket.receive({ ready: 128 });
  await until(() => flood.socket.sent.length === 384, "the grant");
  await settle();
  assert.equal(pulled, 384);

  // Granting more than is outstanding breaks the protocol.
  flood.socket.receive({ ready: 257 });
  await until(() => flood.socket.closedWith !== undefined, "the over-grant refusal");
  assert.deepEqual(flood.socket.frames().at(-1), malformed);

  // A full socket buffer pauses pulling until it drains.
  const upgrade = await handle(registry, upgradeRequest("/_rpc/chat/three"));
  const socket = new FakeSocket();

  socket.bufferedAmount = 2 * 1024 * 1024;
  upgrade.accept(socket);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.deepEqual(socket.sent, []);
  socket.bufferedAmount = 0;
  await until(() => socket.closedWith !== undefined, "the drained buffer");
  assert.deepEqual(socket.frames(), [{ value: 1 }, { value: 2 }, { value: 3 }, { end: null }]);
});

test("closing ends messages and aborts the signal; a handler waiting for credit returns at once", async () => {
  const seen = [];
  const registry = {
    chat: defineRpc(
      "chat",
      ({ channel }) => ({
        listen: channel({
          message: anySchema,
          handler: async function* ({ messages, signal }) {
            signal.addEventListener("abort", () => seen.push("aborted"));
            yield "ready";

            for await (const message of messages) {
              seen.push(`read ${message}`);
            }

            seen.push("messages ended");
          },
        }),
        flood: channel({
          message: anySchema,
          handler: async function* () {
            try {
              for (let index = 0; ; index += 1) {
                yield index;
              }
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

  const listening = await accepted(registry, upgradeRequest("/_rpc/chat/listen"));

  await until(() => listening.socket.sent.length === 1, "the first value");
  listening.socket.receive({ message: 1 });
  listening.socket.leave();
  await until(() => seen.includes("next resolved"), "the handler to return");
  assert.deepEqual(seen, ["aborted", "read 1", "messages ended", "next resolved"]);
  assert.deepEqual(listening.socket.frames(), [{ value: "ready" }]);

  seen.length = 0;

  const flooding = await accepted(registry, upgradeRequest("/_rpc/chat/flood"));

  await until(() => flooding.socket.sent.length === 256, "the window");
  flooding.socket.leave();
  await until(() => seen.includes("next resolved"), "the return");
  assert.deepEqual(seen, ["returned", "next resolved"]);
  assert.equal(flooding.socket.sent.length, 256);
});

test("a client that leaves before accept: the handler doesn't run and next() resolves", async () => {
  const seen = [];
  let gate;
  const delay = middleware(async ({ next }) => {
    await gate.promise;

    const result = await next();

    seen.push("next resolved");

    return result;
  });
  const slowRoom = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: async (value) => {
        await gate.promise;

        return { value };
      },
    },
  };
  const registry = {
    chat: defineRpc(
      "chat",
      ({ channel }) => ({
        talk: channel({
          message: anySchema,
          handler: async function* () {
            seen.push("handler ran");
            yield 1;
          },
        }),
        // An ordinary function returning an iterable runs its setup when called.
        plain: channel({
          message: anySchema,
          handler: () => {
            seen.push("handler ran");

            return (async function* () {
              yield 1;
            })();
          },
        }),
      }),
      { use: [delay] },
    ),
    slow: defineRpc("slow", ({ channel }) => ({
      plain: channel({
        input: slowRoom,
        message: anySchema,
        handler: () => {
          seen.push("handler ran");

          return (async function* () {
            yield 1;
          })();
        },
      }),
    })),
  };

  for (const [path, expected] of [
    ["/_rpc/chat/talk", ["next resolved"]],
    ["/_rpc/chat/plain", ["next resolved"]],
    // Left while its input was being validated.
    ["/_rpc/slow/plain", []],
  ]) {
    seen.length = 0;
    gate = Promise.withResolvers();

    const client = new AbortController();
    const pending = handle(registry, upgradeRequest(path, null, { signal: client.signal }));

    await settle();
    client.abort();
    gate.resolve();

    const upgrade = await pending;

    await settle();
    assert.deepEqual(seen, expected, path);

    // A host that accepts anyway gets a closed socket and no frames.
    const socket = new FakeSocket();

    upgrade.accept(socket);
    assert.equal(socket.closedWith, 1000, path);
    assert.deepEqual(socket.sent, [], path);
  }

  // A request that already left when the call began: the same, with nothing left pending.
  const rejections = [];
  const rejected = (reason) => rejections.push(reason);

  process.on("unhandledRejection", rejected);

  try {
    for (const [path, expected] of [
      ["/_rpc/chat/talk", ["next resolved"]],
      ["/_rpc/chat/plain", ["next resolved"]],
      ["/_rpc/slow/plain", []],
    ]) {
      seen.length = 0;
      gate = Promise.withResolvers();
      gate.resolve();

      const upgrade = await handle(
        registry,
        upgradeRequest(path, null, { signal: AbortSignal.abort() }),
      );

      await settle();
      assert.deepEqual(seen, expected, path);

      const socket = new FakeSocket();

      upgrade.accept(socket);
      await settle();
      assert.equal(socket.closedWith, 1000, path);
      assert.deepEqual(socket.sent, [], path);
      assert.deepEqual(rejections, [], path);
    }
  } finally {
    process.off("unhandledRejection", rejected);
  }
});

test("a yielded value that isn't strict JSON fails the call with INTERNAL, whatever returning its iterator does", async () => {
  const seen = [];

  // Yields NaN, a number that isn't strict JSON; `cleanup` is its iterator's return().
  function nanValues(cleanup) {
    return {
      [Symbol.asyncIterator]() {
        return {
          next: async () => ({ done: false, value: Number.NaN }),
          return: cleanup,
        };
      },
    };
  }

  const registry = {
    chat: defineRpc(
      "chat",
      ({ channel }) => ({
        generator: channel({
          message: anySchema,
          handler: async function* () {
            try {
              yield Number.NaN;
            } finally {
              seen.push("returned");
            }
          },
        }),
        throws: channel({
          message: anySchema,
          handler: () =>
            nanValues(() => {
              seen.push("returned");

              throw new Error("cleanup failed");
            }),
        }),
        rejects: channel({
          message: anySchema,
          handler: () =>
            nanValues(async () => {
              seen.push("returned");

              throw new Error("cleanup failed");
            }),
        }),
      }),
      {
        use: [
          middleware(async ({ next }) => {
            try {
              return await next();
            } finally {
              seen.push("next settled");
            }
          }),
        ],
      },
    ),
  };
  const rejections = [];
  const rejected = (reason) => rejections.push(reason);

  process.on("unhandledRejection", rejected);

  try {
    for (const name of ["generator", "throws", "rejects"]) {
      seen.length = 0;

      await logged(async () => {
        const { socket } = await accepted(registry, upgradeRequest(`/_rpc/chat/${name}`));

        await until(() => socket.closedWith !== undefined, `the ${name} failure`);
        assert.equal(socket.closedWith, 1000, name);
        assert.deepEqual(socket.frames(), [internal], name);
      });

      await settle();
      assert.deepEqual(seen, ["returned", "next settled"], name);
      assert.deepEqual(rejections, [], name);
    }
  } finally {
    process.off("unhandledRejection", rejected);
  }
});

// A real Node server with the upgrade handler, and Node's WebSocket standing in for the
// browser's: it resolves the client's relative URL against the server and sends what a
// browser sends by itself.
async function serve(registry, { maxPayload, origin } = {}) {
  const server = createServer(async (incoming, outgoing) => {
    const chunks = [];

    for await (const chunk of incoming) {
      chunks.push(chunk);
    }

    const response = await handleRpc(
      registry,
      application,
      new Request(`http://${incoming.headers.host}${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers,
        body: Buffer.concat(chunks),
      }),
      { allowedHosts: ["127.0.0.1"] },
    );

    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  const upgrades = [];
  const listener = createUpgradeHandler(
    (request) =>
      handleChannelUpgrade(registry, application, request, { allowedHosts: ["127.0.0.1"] }),
    { maxPayload },
  );

  server.on("upgrade", (incoming, socket, head) => {
    upgrades.push(incoming.url);
    listener(incoming, socket, head);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const base = `http://127.0.0.1:${server.address().port}`;
  const RealWebSocket = globalThis.WebSocket;
  let sockets = 0;

  globalThis.WebSocket = class extends RealWebSocket {
    constructor(url) {
      sockets += 1;
      super(new URL(url, base.replace("http", "ws")), {
        headers: { origin: origin ?? base, cookie: "alice" },
      });
    }
  };

  return {
    base,
    upgrades,
    get sockets() {
      return sockets;
    },
    close() {
      globalThis.WebSocket = RealWebSocket;
      server.closeAllConnections();
      server.close();
    },
  };
}

function rawUpgrade(base, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const sent = httpRequest(`${base}${path}`, {
      headers: {
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        "sec-websocket-version": "13",
        origin: base,
        ...headers,
      },
    });

    sent.on("upgrade", (response, socket) => {
      socket.destroy();
      resolve({ status: response.statusCode, headers: response.headers });
    });
    sent.on("response", async (response) => {
      let body = "";

      for await (const chunk of response) {
        body += chunk;
      }

      resolve({ status: response.statusCode, headers: response.headers, body });
    });
    sent.on("error", reject);
    sent.end();
  });
}

test("the Node upgrade handler writes refusals as HTTP, puts cookies on the 101 and leaves other paths alone", async () => {
  const registry = {
    chat: defineRpc(
      "chat",
      ({ channel }) => ({
        talk: channel({
          message: anySchema,
          handler: async function* () {
            yield 1;
          },
        }),
      }),
      {
        use: [
          middleware(async ({ response, next }) => {
            response.setCookie("seen", "1");

            return next();
          }),
        ],
      },
    ),
  };
  const server = await serve(registry);

  try {
    const query = `?input=${encodeURIComponent("null")}`;
    const accepted = await rawUpgrade(server.base, `/_rpc/chat/talk${query}`);

    assert.equal(accepted.status, 101);
    assert.deepEqual(accepted.headers["set-cookie"], [
      "seen=1; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);

    let refused;

    await logged(async () => {
      refused = await rawUpgrade(server.base, `/_rpc/chat/talk${query}`, {
        origin: "http://evil",
      });
    });

    assert.equal(refused.status, 403);
    assert.equal(refused.headers["content-type"], "application/json");
    assert.equal(refused.headers.connection, "close");
    assert.deepEqual(JSON.parse(refused.body), {
      error: { code: "FORBIDDEN", message: "RPC forbidden", data: null },
    });

    const malformed = await rawUpgrade(server.base, "/_rpc/chat/talk");

    assert.equal(malformed.status, 400);
    assert.equal(JSON.parse(malformed.body).error.code, "INVALID_INPUT");
  } finally {
    server.close();
  }
});

test("a refused socket that resets while it closes doesn't take the process down", async () => {
  const listener = createUpgradeHandler(
    async () => new Response("no", { status: 403, headers: { "content-type": "text/plain" } }),
  );
  const written = [];
  // The raw socket of an upgrade request: the refusal is written, the client hasn't closed.
  const socket = new Duplex({
    read() {},
    write(chunk, encoding, callback) {
      written.push(chunk);
      callback();
    },
  });
  const finished = once(socket, "finish");

  listener(
    {
      headers: { host: "test", connection: "Upgrade", upgrade: "websocket" },
      url: "/_rpc/chat/talk?input=null",
      method: "GET",
      socket: {},
    },
    socket,
    Buffer.alloc(0),
  );
  await finished;
  assert.match(Buffer.concat(written).toString("latin1"), /^HTTP\/1\.1 403 Forbidden\r\n/);

  // An unhandled error event would throw here.
  socket.emit("error", Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }));

  const closed = once(socket, "close");

  socket.resume();
  socket.push(null);
  await closed;
  assert.equal(socket.listenerCount("error"), 0);
});

test("a socket left before accept that fails while it's destroyed doesn't take the process down", async () => {
  const gate = Promise.withResolvers();
  let accepts = 0;
  let requestSignal;
  const listener = createUpgradeHandler(async (request) => {
    requestSignal = request.signal;
    await gate.promise;

    return {
      headers: new Headers(),
      accept() {
        accepts += 1;
      },
    };
  });
  // The raw socket of an upgrade request whose shutdown fails, as after a reset.
  const socket = new Duplex({
    read() {},
    write(chunk, encoding, callback) {
      callback();
    },
    destroy(error, callback) {
      callback(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
    },
  });

  listener(
    {
      headers: { host: "test", connection: "Upgrade", upgrade: "websocket" },
      url: "/_rpc/chat/talk?input=null",
      method: "GET",
      socket: {},
    },
    socket,
    Buffer.alloc(0),
  );

  // The client leaves (FIN) while the pipeline is still waiting.
  const ended = once(socket, "end");

  socket.resume();
  socket.push(null);
  await ended;
  assert.equal(requestSignal.aborted, true);

  // The pipeline still answers with an upgrade; the socket is destroyed instead, and its
  // failed shutdown emits an error that would throw if nothing listened. (events.once would
  // listen for that error itself.)
  const closed = new Promise((resolve) => socket.once("close", resolve));

  gate.resolve();
  await closed;
  assert.equal(accepts, 0);
  assert.equal(socket.listenerCount("error"), 0);
});

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
      chat: {
        methods: [
          { name: "talk", input: true, kind: "channel", errors: [] },
          {
            name: "fail",
            input: true,
            kind: "channel",
            errors: [{ code: "GONE", status: 410, message: "Gone" }],
          },
          { name: "deaf", input: false, kind: "channel", errors: [] },
          { name: "forever", input: false, kind: "channel", errors: [] },
          { name: "bulk", input: false, kind: "channel", errors: [] },
          {
            name: "finite",
            input: true,
            kind: "channel",
            errors: [{ code: "GONE", status: 410, message: "Gone" }],
          },
          { name: "quiet", input: false, kind: "channel", errors: [] },
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

const clientRegistry = (seen) => ({
  chat: defineRpc("chat", ({ channel }) => ({
    talk: channel({
      input: roomSchema,
      message: textSchema,
      handler: async function* ({ input, messages }) {
        yield { room: input.room };

        for await (const message of messages) {
          if (message.text === "bye") {
            return;
          }

          yield { echo: message.text };
        }
      },
    }),
    fail: channel({
      input: roomSchema,
      message: anySchema,
      errors: { GONE: { status: 410, message: "Gone", data: nullSchema } },
      handler: async function* ({ input, errors }) {
        yield "first";

        if (input.room === "gone") {
          throw errors.GONE(null);
        }

        if (input.room === "moved") {
          throw redirect("/elsewhere");
        }

        throw notFound();
      },
    }),
    // Never reads its messages, and ends once told to.
    deaf: channel({
      message: anySchema,
      handler: async function* () {
        yield "ready";
        await seen.deaf.promise;
      },
    }),
    forever: channel({
      message: anySchema,
      handler: async function* ({ signal, messages }) {
        signal.addEventListener("abort", () => seen.log.push("aborted"));

        try {
          yield "ready";

          for await (const message of messages) {
            void message;
          }

          seen.log.push("messages ended");
        } finally {
          seen.log.push("returned");
        }
      },
    }),
  })),
});

test("the browser channel sends typed messages, queues them before open, reads values and ends", async () => {
  const seen = { log: [], deaf: Promise.withResolvers() };
  const server = await serve(clientRegistry(seen));
  const { rpc, destroy } = client();

  try {
    assert.equal(rpc.chat.talk.kind, "channel");

    const chat = rpc.chat.talk({ room: "a" });
    // Sent before the socket opened: they wait, in order.
    const first = chat.send({ text: "one" });
    const second = chat.send({ text: "two" });

    await Promise.all([first, second]);

    const received = [];

    for await (const value of chat) {
      received.push(value);

      if (received.length === 3) {
        await chat.send({ text: "bye" });
      }
    }

    assert.deepEqual(received, [{ room: "a" }, { echo: "one" }, { echo: "two" }]);
    assert.throws(() => chat[Symbol.asyncIterator](), TypeError);
    await assert.rejects(chat.send({ text: "late" }), {
      name: "TypeError",
      message: "Launch channel is closed",
    });
    await assert.rejects(rpc.chat.talk({ room: "b" }).send({ bad: undefined }), TypeError);
  } finally {
    destroy();
    server.close();
  }
});

test("the browser channel owns its errors, aborts, closes on break, and refuses on the server", async () => {
  const seen = { log: [], deaf: Promise.withResolvers() };
  const server = await serve(clientRegistry(seen));
  const browser = client();
  const rendering = client("server");
  const { rpc } = browser;

  async function failure(channel) {
    try {
      for await (const value of channel) {
        void value;
      }
    } catch (error) {
      return error;
    }

    return undefined;
  }

  try {
    const gone = await failure(rpc.chat.fail({ room: "gone" }));

    assert.ok(gone instanceof RpcError);
    assert.deepEqual([gone.code, gone.status, gone.data], ["GONE", 410, null]);
    assert.equal(rpc.chat.fail.isError(gone), true);
    assert.equal(rpc.chat.talk.isError(gone), false);

    const moved = await failure(rpc.chat.fail({ room: "moved" }));

    assert.ok(moved instanceof RpcRedirect);
    assert.equal(moved.to, "/elsewhere");
    assert.ok((await failure(rpc.chat.fail({ room: "missing" }))) instanceof RpcNotFound);

    const invalid = await failure(rpc.chat.talk({ room: 1 }));

    assert.ok(rpc.chat.talk.isError(invalid));
    assert.deepEqual(invalid.data, { issues: [{ path: [], message: "Expected a room" }] });

    // break closes the socket: the handler's messages end and its signal aborts.
    for await (const value of rpc.chat.forever()) {
      assert.equal(value, "ready");

      break;
    }

    await until(() => seen.log.includes("returned"), "the handler to return");
    assert.deepEqual(seen.log.toSorted(), ["aborted", "messages ended", "returned"]);

    // An abort rejects iteration and the sends still waiting.
    const controller = new AbortController();
    const deaf = rpc.chat.deaf({ signal: controller.signal });
    const sends = [];

    for (let index = 0; index < 33; index += 1) {
      sends.push(deaf.send(index));
    }

    const iterator = deaf[Symbol.asyncIterator]();

    assert.deepEqual(await iterator.next(), { done: false, value: "ready" });
    await Promise.all(sends.slice(0, 32));
    controller.abort();
    await assert.rejects(sends[32], { name: "AbortError" });
    await assert.rejects(iterator.next(), { name: "AbortError" });
    assert.deepEqual(await iterator.next(), { done: true, value: undefined });

    const aborted = new AbortController();

    aborted.abort();

    const before = server.sockets;

    assert.equal((await failure(rpc.chat.forever({ signal: aborted.signal }))).name, "AbortError");
    assert.equal(server.sockets, before);

    // A send waiting for credit when the channel ends rejects with the channel's ending.
    const ending = rpc.chat.deaf();
    const waiting = [];

    for (let index = 0; index < 33; index += 1) {
      waiting.push(ending.send(index));
    }

    await Promise.all(waiting.slice(0, 32));
    seen.deaf.resolve();
    await assert.rejects(waiting[32], { name: "TypeError", message: "Launch channel closed" });
    assert.equal(await failure(ending), undefined);

    // Server rendering: FORBIDDEN at once, no connection.
    const refused = await failure(rendering.rpc.chat.talk({ room: "a" }));

    assert.ok(rendering.rpc.chat.talk.isError(refused));
    assert.equal(refused.code, "FORBIDDEN");
    assert.equal(server.sockets, before + 1);
  } finally {
    browser.destroy();
    rendering.destroy();
    server.close();
  }
});

test("a refused handshake, a dropped connection and an oversized message are TypeErrors", async () => {
  const seen = { log: [], deaf: Promise.withResolvers() };
  const foreign = await serve(clientRegistry(seen), { origin: "http://evil" });
  const { rpc, destroy } = client();

  try {
    await logged(async () => {
      await assert.rejects(
        (async () => {
          for await (const value of rpc.chat.forever()) {
            void value;
          }
        })(),
        { name: "TypeError", message: "Launch channel closed before it ended" },
      );
    });
  } finally {
    foreign.close();
  }

  const small = await serve(clientRegistry(seen), { maxPayload: 64 });

  try {
    const chat = rpc.chat.talk({ room: "a" });
    const iterator = chat[Symbol.asyncIterator]();

    assert.deepEqual(await iterator.next(), { done: false, value: { room: "a" } });
    await chat.send({ text: "x".repeat(1000) });
    await assert.rejects(iterator.next(), { name: "TypeError" });
  } finally {
    destroy();
    small.close();
  }
});

// Channels for the client's own flow control and iteration.
const iterationRegistry = (seen) => ({
  chat: defineRpc("chat", ({ channel }) => ({
    // 600 values, then one echo per message once the test opens its gate, until 149.
    bulk: channel({
      message: anySchema,
      handler: async function* ({ messages }) {
        for (let index = 0; index < 600; index += 1) {
          yield index;
        }

        await seen.gate.promise;

        for await (const message of messages) {
          yield { echo: message };

          if (message === 149) {
            return;
          }
        }
      },
    }),
    // Three values, then the end or, for room "gone", an error.
    finite: channel({
      input: roomSchema,
      message: anySchema,
      errors: { GONE: { status: 410, message: "Gone", data: nullSchema } },
      handler: async function* ({ input, errors }) {
        try {
          yield "a";
          yield "b";
          yield "c";

          if (input.room === "gone") {
            throw errors.GONE(null);
          }
        } finally {
          seen.log.push(`done ${input.room}`);
        }
      },
    }),
    quiet: channel({
      message: anySchema,
      handler: async function* ({ signal }) {
        yield "ready";
        await new Promise((resolve) => signal.addEventListener("abort", resolve));
      },
    }),
  })),
});

// A flow-control or read regression stalls instead of failing: fail it after a while.
function within(promise, what) {
  const timeout = new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error(`Timed out waiting for ${what}`)), 5000).unref();
  });

  return Promise.race([promise, timeout]);
}

function range(length) {
  return Array.from({ length }, (_, index) => index);
}

test("a real client crosses both credit windows: its reads grant values, the handler's reads grant sends", async () => {
  const seen = { log: [], gate: Promise.withResolvers() };
  const server = await serve(iterationRegistry(seen));
  const { rpc, destroy } = client();
  // Upgraded sockets outlive the HTTP server's connections: close the channel on failure.
  const controller = new AbortController();

  try {
    const chat = rpc.chat.bulk({ signal: controller.signal });
    const iterator = chat[Symbol.asyncIterator]();
    const values = [];

    // More than two value windows: the server sends past 256 only as this side reads.
    for (let index = 0; index < 600; index += 1) {
      values.push((await within(iterator.next(), `value ${index}`)).value);
    }

    assert.deepEqual(values, range(600));

    // The handler isn't reading yet: 32 sends fit the window, the 33rd waits.
    const sends = [];
    let resumed = false;

    for (let index = 0; index < 33; index += 1) {
      sends.push(chat.send(index));
    }

    void sends[32].then(() => {
      resumed = true;
    });
    await Promise.all(sends.slice(0, 32));
    await settle();
    assert.equal(resumed, false);

    // The handler reads, the server grants more, and the 33rd goes out.
    seen.gate.resolve();
    await within(sends[32], "the 33rd send");

    const echoes = (async () => {
      const received = [];

      while (true) {
        const step = await iterator.next();

        if (step.done) {
          return received;
        }

        received.push(step.value.echo);
      }
    })();

    // Several more message windows, read alongside.
    for (let index = 33; index < 150; index += 1) {
      await within(chat.send(index), `send ${index}`);
    }

    assert.deepEqual(await within(echoes, "the echoes"), range(150));
  } finally {
    controller.abort();
    destroy();
    server.close();
  }
});

test("overlapping reads settle in order, through the end, a failure and an abort", async () => {
  const seen = { log: [], gate: Promise.withResolvers() };
  const server = await serve(iterationRegistry(seen));
  const { rpc, destroy } = client();

  function reads(channel, count) {
    const iterator = channel[Symbol.asyncIterator]();
    const pending = [];

    for (let index = 0; index < count; index += 1) {
      pending.push(iterator.next());
    }

    return within(Promise.allSettled(pending), "the reads");
  }

  function value(item) {
    return { status: "fulfilled", value: { done: false, value: item } };
  }

  const done = { status: "fulfilled", value: { done: true, value: undefined } };

  try {
    assert.deepEqual(await reads(rpc.chat.finite({ room: "a" }), 5), [
      value("a"),
      value("b"),
      value("c"),
      done,
      done,
    ]);

    const failed = await reads(rpc.chat.finite({ room: "gone" }), 5);

    assert.deepEqual(failed.slice(0, 3), [value("a"), value("b"), value("c")]);
    assert.equal(failed[3].status, "rejected");
    assert.equal(failed[3].reason.code, "GONE");
    assert.deepEqual(failed[4], done);

    const controller = new AbortController();
    const quiet = rpc.chat.quiet({ signal: controller.signal });
    const iterator = quiet[Symbol.asyncIterator]();
    const first = iterator.next();
    const second = iterator.next();
    const third = iterator.next();

    assert.deepEqual(await first, { done: false, value: "ready" });
    controller.abort();
    await assert.rejects(second, { name: "AbortError" });
    assert.deepEqual(await third, { done: true, value: undefined });
  } finally {
    destroy();
    server.close();
  }
});

test("an abort after the last frame drops the values not read yet and throws AbortError", async () => {
  const seen = { log: [], gate: Promise.withResolvers() };
  const server = await serve(iterationRegistry(seen));
  const { rpc, destroy } = client();

  try {
    for (const room of ["a", "gone"]) {
      const controller = new AbortController();
      const iterator = rpc.chat
        .finite({ room }, { signal: controller.signal })
        [Symbol.asyncIterator]();

      // Every value and the terminal frame arrive before the first read.
      await until(() => seen.log.includes(`done ${room}`), `room ${room} to finish`);
      await settle();
      assert.deepEqual(await iterator.next(), { done: false, value: "a" }, room);
      controller.abort();
      await assert.rejects(iterator.next(), { name: "AbortError" }, room);
      assert.deepEqual(await iterator.next(), { done: true, value: undefined }, room);
    }
  } finally {
    destroy();
    server.close();
  }
});

test("a value frame that isn't strict JSON is a malformed frame", async () => {
  const sockets = new WebSocketServer({ port: 0, host: "127.0.0.1" });

  await once(sockets, "listening");
  sockets.on("connection", (socket) => {
    socket.send('{"value":"ok"}');
    // JSON.parse reads this as Infinity.
    socket.send('{"value":{"nested":[1e400]}}');
  });

  const base = `ws://127.0.0.1:${sockets.address().port}`;
  const RealWebSocket = globalThis.WebSocket;

  globalThis.WebSocket = class extends RealWebSocket {
    constructor(url) {
      super(new URL(url, base));
    }
  };

  const { rpc, destroy } = client();

  try {
    const iterator = rpc.chat.quiet()[Symbol.asyncIterator]();

    assert.deepEqual(await iterator.next(), { done: false, value: "ok" });
    await assert.rejects(iterator.next(), {
      name: "TypeError",
      message: "Launch channel sent a malformed frame",
    });
  } finally {
    globalThis.WebSocket = RealWebSocket;
    destroy();
    sockets.close();
  }
});
