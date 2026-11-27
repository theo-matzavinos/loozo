import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import { forbidden, middleware } from "../dist/server/index.js";
import { handleChannelUpgrade, handleRpc } from "../dist/server/generated.js";
import { bound } from "./fixtures/application.mjs";

// What a host's `waitUntil` receives: each request hands over one promise, which the tests
// check stays pending until the call's awaited cleanup ran.

const application = {
  id: "launch-wait-until-test-app",
  context: ({ request }) => {
    if (request.headers.get("cookie") === "refused") {
      throw forbidden();
    }

    return { user: request.headers.get("cookie") };
  },
};
const anySchema = {
  "~standard": { version: 1, vendor: "test", validate: (value) => ({ value }) },
};

// The promises `waitUntil` received, in order.
function host() {
  const held = [];

  return { held, waitUntil: (settled) => held.push(settled) };
}

function post(path, input = null, { cookie = "alice", origin = "http://test", body } = {}) {
  return new Request(`http://test${path}`, {
    method: "POST",
    headers: { origin, cookie, "content-type": "application/json" },
    body: body ?? JSON.stringify({ input }),
  });
}

function upgradeRequest(path, { cookie = "alice", origin = "http://test", signal } = {}) {
  return new Request(`http://test${path}?input=null`, {
    method: "GET",
    headers: { connection: "Upgrade", upgrade: "websocket", origin, cookie },
    signal,
  });
}

function rpc(namespaces, request, waitUntil) {
  return handleRpc(bound(application, namespaces), request, { allowedHosts: ["test"], waitUntil });
}

function upgrade(namespaces, request, waitUntil) {
  return handleChannelUpgrade(bound(application, namespaces), request, {
    allowedHosts: ["test"],
    waitUntil,
  });
}

// The server side of a WHATWG WebSocket.
class FakeSocket extends EventTarget {
  readyState = 1;
  bufferedAmount = 0;
  sent = [];

  send(frame) {
    this.sent.push(frame);
  }

  close() {
    if (this.readyState === 3) {
      return;
    }

    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }

  // The client goes away.
  leave() {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
}

// Whether `promise` is still pending after the event loop has turned a few times.
async function pending(promise) {
  let settled = false;

  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 20));

  return !settled;
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

// An iterator whose `return()` the test can count; it never yields.
function countedIterable() {
  const counts = { returns: 0 };
  const iterable = {
    [Symbol.asyncIterator]: () => ({
      next: () => new Promise(() => {}),
      return: async () => {
        counts.returns += 1;

        return { done: true, value: undefined };
      },
    }),
  };

  return { counts, iterable };
}

test("every request that reaches dispatch is handed over once, as it starts; refusals before it aren't", async () => {
  const gate = Promise.withResolvers();
  const namespaces = {
    todos: {
      build: ({ query }) => ({
        list: query({ handler: () => ["a"] }),
        slow: query({
          handler: async () => {
            await gate.promise;

            return "done";
          },
        }),
        broken: query({
          handler: () => {
            throw new Error("Private failure");
          },
        }),
      }),
    },
  };

  const refusals = [
    post("/_rpc/todos/list", null, { origin: "http://evil.example" }),
    post("/_rpc/todos/list", null, { body: "{" }),
    new Request("http://elsewhere/_rpc/todos/list", { method: "POST" }),
    new Request("http://test/_rpc/todos/list", { method: "GET" }),
  ];

  for (const request of refusals) {
    const { held, waitUntil } = host();

    await logged(async () => {
      await rpc(namespaces, request, waitUntil);
    });
    assert.equal(held.length, 0, request.url);
  }

  const dispatched = [
    [post("/_rpc/todos/list"), 200],
    [post("/_rpc/todos/missing"), 404],
    [post("/_rpc/todos/list", null, { cookie: "refused" }), 403],
    [post("/_rpc/todos/broken"), 500],
  ];

  for (const [request, status] of dispatched) {
    const { held, waitUntil } = host();
    let response;

    await logged(async () => {
      response = await rpc(namespaces, request, waitUntil);
    });
    assert.equal(response.status, status);
    assert.equal(held.length, 1, request.url);
    assert.equal(await held[0], undefined);
  }

  // Handed over while the call still runs, before the response exists.
  const { held, waitUntil } = host();
  const slow = rpc(namespaces, post("/_rpc/todos/slow"), waitUntil);

  for (let turn = 0; turn < 10 && held.length === 0; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  assert.equal(held.length, 1);
  assert.ok(await pending(slow));
  gate.resolve();
  assert.equal((await slow).status, 200);
  await held[0];

  const upgradeRefusals = [
    upgradeRequest("/_rpc/chat/talk", { origin: "http://evil.example" }),
    new Request("http://test/_rpc/chat/talk", {
      headers: { upgrade: "websocket", origin: "http://test" },
    }),
  ];
  const channels = {
    chat: {
      build: ({ channel }) => ({
        talk: channel({
          message: anySchema,
          handler: async function* () {
            yield 1;
          },
        }),
      }),
    },
  };

  for (const request of upgradeRefusals) {
    const { held: upgradeHeld, waitUntil: upgradeWaitUntil } = host();

    await logged(async () => {
      const result = await upgrade(channels, request, upgradeWaitUntil);

      assert.ok(result instanceof Response);
    });
    assert.equal(upgradeHeld.length, 0);
  }

  // An upgrade is handed over while its call still runs, before its result exists.
  const upgradeGate = Promise.withResolvers();
  const gatedChannels = {
    chat: {
      build: ({ channel }) => ({
        talk: channel({
          message: anySchema,
          use: [
            middleware(async ({ next }) => {
              await upgradeGate.promise;

              return next();
            }),
          ],
          handler: async function* () {
            yield 1;
          },
        }),
      }),
    },
  };
  const { held: gatedHeld, waitUntil: gatedWaitUntil } = host();
  const gatedUpgrade = upgrade(gatedChannels, upgradeRequest("/_rpc/chat/talk"), gatedWaitUntil);

  assert.equal(gatedHeld.length, 1);
  assert.ok(await pending(gatedUpgrade));
  upgradeGate.resolve();

  const gatedSocket = new FakeSocket();

  (await gatedUpgrade).accept(gatedSocket);
  gatedSocket.leave();
  await gatedHeld[0];

  const { held: stageHeld, waitUntil: stageWaitUntil } = host();
  const refused = await upgrade(
    channels,
    upgradeRequest("/_rpc/chat/talk", { cookie: "refused" }),
    stageWaitUntil,
  );
  const socket = new FakeSocket();

  refused.accept(socket);
  assert.equal(stageHeld.length, 1);
  await stageHeld[0];
  assert.match(socket.sent[0], /FORBIDDEN/);
});

test("a stream whose client left is held until its handler's awaited step, finally and middleware ran", async () => {
  const gate = Promise.withResolvers();
  const waiting = Promise.withResolvers();
  const cleaning = Promise.withResolvers();
  const cleanup = Promise.withResolvers();
  const seen = [];
  const namespaces = {
    live: {
      use: [
        middleware(async ({ next }) => {
          try {
            return await next();
          } finally {
            seen.push("middleware");
          }
        }),
      ],
      build: ({ stream }) => ({
        ticks: stream({
          handler: async function* () {
            try {
              yield 0;
              // Waiting, like a timer, when the client leaves.
              waiting.resolve();
              await gate.promise;
              seen.push("resumed");
              yield 1;
            } finally {
              // Cleanup that waits too, like releasing a connection.
              cleaning.resolve();
              await cleanup.promise;
              seen.push("finally");
            }
          },
        }),
      }),
    },
  };
  const { held, waitUntil } = host();
  const response = await rpc(namespaces, post("/_rpc/live/ticks"), waitUntil);
  const reader = response.body.getReader();

  await reader.read();
  await waiting.promise;
  await reader.cancel();
  assert.equal(held.length, 1);
  assert.ok(await pending(held[0]));
  assert.deepEqual(seen, []);

  gate.resolve();
  await cleaning.promise;
  assert.ok(await pending(held[0]));
  assert.deepEqual(seen, ["resumed"]);

  cleanup.resolve();
  await held[0];
  assert.deepEqual(seen, ["resumed", "finally", "middleware"]);
});

test("a channel whose socket closed is held until its middleware's awaited cleanup ran", async () => {
  const gate = Promise.withResolvers();
  const seen = [];
  const namespaces = {
    chat: {
      build: ({ channel }) => ({
        talk: channel({
          message: anySchema,
          use: [
            middleware(async ({ next }) => {
              try {
                return await next();
              } finally {
                // Cleanup that waits, like a timer, after the socket closed.
                await gate.promise;
                seen.push("cleanup");
              }
            }),
          ],
          handler: async function* ({ messages }) {
            try {
              for await (const message of messages) {
                yield message;
              }
            } finally {
              seen.push("finally");
            }
          },
        }),
      }),
    },
  };
  const { held, waitUntil } = host();
  const result = await upgrade(namespaces, upgradeRequest("/_rpc/chat/talk"), waitUntil);
  const socket = new FakeSocket();

  result.accept(socket);
  await new Promise((resolve) => setTimeout(resolve, 5));
  socket.leave();
  assert.equal(held.length, 1);
  assert.ok(await pending(held[0]));
  assert.deepEqual(seen, ["finally"]);

  gate.resolve();
  await held[0];
  assert.deepEqual(seen, ["finally", "cleanup"]);
});

test("a timeout middleware's reply goes out first; the hold waits for the handler it left running", async () => {
  const gate = Promise.withResolvers();
  const seen = [];
  const namespaces = {
    todos: {
      build: ({ mutation }) => ({
        save: mutation({
          use: [
            middleware(async ({ next }) => {
              const timedOut = new Promise((resolve) => setTimeout(() => resolve("timeout"), 5));
              const winner = await Promise.race([next(), timedOut]);

              if (winner === "timeout") {
                throw forbidden();
              }

              return winner;
            }),
          ],
          handler: async () => {
            try {
              await gate.promise;

              return "saved";
            } finally {
              seen.push("handler finally");
            }
          },
        }),
      }),
    },
  };
  const { held, waitUntil } = host();
  const response = await rpc(namespaces, post("/_rpc/todos/save"), waitUntil);

  assert.equal(response.status, 403);
  assert.ok(await pending(held[0]));

  gate.resolve();
  await held[0];
  assert.deepEqual(seen, ["handler finally"]);
});

test("the hold drains nested and rejected continuations that start after the reply", async () => {
  const validation = Promise.withResolvers();
  const handler = Promise.withResolvers();
  let runs = 0;
  let cleaned = false;
  const gatedSchema = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: async (value) => {
        await validation.promise;

        return { value };
      },
    },
  };
  const namespaces = {
    todos: {
      use: [
        middleware(async ({ next }) => {
          // Starts the rest of the call and refuses without waiting for it.
          void next();

          throw forbidden();
        }),
      ],
      build: ({ mutation }) => ({
        save: mutation({
          input: gatedSchema,
          use: [
            middleware(async ({ next }) => {
              // The first call runs the handler; the second rejects, which fails this chain
              // while the handler still runs.
              void next();

              return next();
            }),
          ],
          handler: async () => {
            runs += 1;

            try {
              await handler.promise;

              return "saved";
            } finally {
              cleaned = true;
            }
          },
        }),
      }),
    },
  };
  const { held, waitUntil } = host();
  let response;

  await logged(async () => {
    response = await rpc(namespaces, post("/_rpc/todos/save", 1), waitUntil);
    assert.equal(response.status, 403);

    validation.resolve();
    assert.ok(await pending(held[0]));
    assert.equal(runs, 1);

    handler.resolve();
    await held[0];
  });

  assert.equal(runs, 1);
  assert.equal(cleaned, true);
});

test("a stream iterable that arrives after the call replied is returned, and its middleware finishes", async () => {
  const gate = Promise.withResolvers();
  const { counts, iterable } = countedIterable();
  const seen = [];
  const namespaces = {
    live: {
      use: [
        middleware(async ({ next }) => {
          void next();

          throw forbidden();
        }),
      ],
      build: ({ stream }) => ({
        ticks: stream({
          use: [
            middleware(async ({ next }) => {
              // Waits, like for a connection, before the handler runs.
              await gate.promise;

              try {
                return await next();
              } finally {
                seen.push("inner cleanup");
              }
            }),
          ],
          handler: () => iterable,
        }),
      }),
    },
  };
  const { held, waitUntil } = host();
  let response;

  await logged(async () => {
    response = await rpc(namespaces, post("/_rpc/live/ticks"), waitUntil);
    assert.equal(response.status, 403);
    gate.resolve();
    await held[0];
  });

  assert.equal(counts.returns, 1);
  assert.deepEqual(seen, ["inner cleanup"]);
});

test("a channel iterable that arrives after the upgrade was refused is returned", async () => {
  const gate = Promise.withResolvers();
  const { counts, iterable } = countedIterable();
  const seen = [];
  const namespaces = {
    chat: {
      use: [
        middleware(async ({ next }) => {
          void next();

          throw forbidden();
        }),
      ],
      build: ({ channel }) => ({
        talk: channel({
          message: anySchema,
          use: [
            middleware(async ({ next }) => {
              // Waits, like for a connection, before the handler runs.
              await gate.promise;

              try {
                return await next();
              } finally {
                seen.push("inner cleanup");
              }
            }),
          ],
          handler: () => iterable,
        }),
      }),
    },
  };
  const { held, waitUntil } = host();
  const socket = new FakeSocket();

  await logged(async () => {
    const result = await upgrade(namespaces, upgradeRequest("/_rpc/chat/talk"), waitUntil);

    // The handler returns its iterable before the socket is accepted.
    gate.resolve();
    await held[0];
    result.accept(socket);
  });

  assert.equal(counts.returns, 1);
  assert.deepEqual(seen, ["inner cleanup"]);
  assert.match(socket.sent[0], /FORBIDDEN/);
});

test("a channel iterable that arrives after its caller left and the upgrade answered is returned", async () => {
  const entered = Promise.withResolvers();
  const gate = Promise.withResolvers();
  const left = new AbortController();
  const { counts, iterable } = countedIterable();
  const seen = [];
  const namespaces = {
    chat: {
      use: [
        middleware(async ({ next, signal }) => {
          void next();
          await new Promise((resolve) => signal.addEventListener("abort", resolve));

          throw forbidden();
        }),
      ],
      build: ({ channel }) => ({
        talk: channel({
          message: anySchema,
          use: [
            middleware(async ({ next }) => {
              try {
                return await next();
              } finally {
                seen.push("inner cleanup");
              }
            }),
          ],
          // Only an untyped handler can be inside the call when its caller leaves: Launch skips
          // the handler once the signal aborted, and a typed one returns its iterable at once.
          handler: async () => {
            entered.resolve();
            await gate.promise;

            return iterable;
          },
        }),
      }),
    },
  };
  const { held, waitUntil } = host();
  const socket = new FakeSocket();

  await logged(async () => {
    const result = upgrade(
      namespaces,
      upgradeRequest("/_rpc/chat/talk", { signal: left.signal }),
      waitUntil,
    );

    await entered.promise;
    left.abort();
    (await result).accept(socket);
    gate.resolve();
    await held[0];
  });

  assert.equal(counts.returns, 1);
  assert.deepEqual(seen, ["inner cleanup"]);
  assert.deepEqual(socket.sent, []);
});

test("a refused upgrade's socket closing ends what's left of its call", async () => {
  const gate = Promise.withResolvers();
  const seen = [];
  const namespaces = {
    chat: {
      use: [
        middleware(async ({ next }) => {
          void next();

          throw forbidden();
        }),
      ],
      build: ({ channel }) => ({
        talk: channel({
          message: anySchema,
          use: [
            middleware(async ({ next, signal }) => {
              await gate.promise;

              try {
                return await next();
              } finally {
                // Cleanup that waits for the call to end, like a lease tied to the signal.
                if (!signal.aborted) {
                  await new Promise((resolve) => signal.addEventListener("abort", resolve));
                }

                seen.push("cleanup");
              }
            }),
          ],
          handler: async function* () {
            yield 1;
          },
        }),
      }),
    },
  };
  const { held, waitUntil } = host();
  const socket = new FakeSocket();

  await logged(async () => {
    const result = await upgrade(namespaces, upgradeRequest("/_rpc/chat/talk"), waitUntil);

    result.accept(socket);
    gate.resolve();
    await held[0];
  });

  assert.match(socket.sent[0], /FORBIDDEN/);
  assert.deepEqual(seen, ["cleanup"]);
});

test("a refused upgrade whose socket closes before it opens ends what's left of its call", async () => {
  const gate = Promise.withResolvers();
  const seen = [];
  const namespaces = {
    chat: {
      use: [
        middleware(async ({ next }) => {
          void next();

          throw forbidden();
        }),
      ],
      build: ({ channel }) => ({
        talk: channel({
          message: anySchema,
          use: [
            middleware(async ({ next, signal }) => {
              // The rest of the call reaches the handler only after the refusal answered.
              await gate.promise;

              try {
                return await next();
              } finally {
                if (!signal.aborted) {
                  await new Promise((resolve) => signal.addEventListener("abort", resolve));
                }

                seen.push("cleanup");
              }
            }),
          ],
          handler: async function* ({ messages }) {
            for await (const message of messages) {
              yield message;
            }
          },
        }),
      }),
    },
  };
  const { held, waitUntil } = host();
  const socket = new FakeSocket();

  socket.readyState = 0;

  await logged(async () => {
    const result = await upgrade(namespaces, upgradeRequest("/_rpc/chat/talk"), waitUntil);

    result.accept(socket);
    // The handshake fails: the socket closes without ever opening.
    socket.leave();
    gate.resolve();
    await held[0];
  });

  assert.deepEqual(socket.sent, []);
  assert.deepEqual(seen, ["cleanup"]);
});

// A refusal whose detached rest of the call waits for the call's signal before it cleans up.
function refusedWithLeasedCleanup(gate, seen) {
  return {
    chat: {
      use: [
        middleware(async ({ next }) => {
          void next();

          throw forbidden();
        }),
      ],
      build: ({ channel }) => ({
        talk: channel({
          message: anySchema,
          use: [
            middleware(async ({ next, signal }) => {
              await gate.promise;

              try {
                return await next();
              } finally {
                if (!signal.aborted) {
                  await new Promise((resolve) => signal.addEventListener("abort", resolve));
                }

                seen.push("cleanup");
              }
            }),
          ],
          handler: async function* () {
            yield 1;
          },
        }),
      }),
    },
  };
}

test("after hand-off, a refused upgrade's call follows its socket closing, not its request", async () => {
  const gate = Promise.withResolvers();
  const left = new AbortController();
  const seen = [];
  const { held, waitUntil } = host();
  // A real socket closes some time after close(): its close handshake.
  const socket = new FakeSocket();

  socket.close = () => {
    socket.readyState = 2;
  };

  await logged(async () => {
    const result = await upgrade(
      refusedWithLeasedCleanup(gate, seen),
      upgradeRequest("/_rpc/chat/talk", { signal: left.signal }),
      waitUntil,
    );

    result.accept(socket);
    // The host's HTTP side ends while the socket is still closing.
    left.abort();
    gate.resolve();
    assert.ok(await pending(held[0]));
    assert.deepEqual(seen, []);

    socket.leave();
    await held[0];
  });

  assert.match(socket.sent[0], /FORBIDDEN/);
  assert.deepEqual(seen, ["cleanup"]);
});

test("a refused upgrade handed an already closed socket ends what's left of its call", async () => {
  const gate = Promise.withResolvers();
  const seen = [];
  const { held, waitUntil } = host();
  const socket = new FakeSocket();

  socket.readyState = 3;

  await logged(async () => {
    const result = await upgrade(
      refusedWithLeasedCleanup(gate, seen),
      upgradeRequest("/_rpc/chat/talk"),
      waitUntil,
    );

    result.accept(socket);
    gate.resolve();
    await held[0];
  });

  assert.deepEqual(socket.sent, []);
  assert.deepEqual(seen, ["cleanup"]);
});

test("a waitUntil that throws is logged, and the stream still streams and ends", async () => {
  const namespaces = {
    live: {
      build: ({ stream }) => ({
        ticks: stream({
          handler: async function* () {
            yield 0;
            yield 1;
          },
        }),
      }),
    },
  };
  let text;
  const logs = await logged(async () => {
    const response = await rpc(namespaces, post("/_rpc/live/ticks"), () => {
      throw new TypeError("Illegal invocation");
    });

    assert.equal(response.status, 200);
    text = await response.text();
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "Launch couldn't hand a call to waitUntil");
  assert.match(text, /event: value\ndata: 1\n\nevent: end/);
});
