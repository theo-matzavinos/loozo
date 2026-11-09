import "@angular/compiler";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { test } from "node:test";
import { Component, PLATFORM_ID, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { defineContext, defineRpc } from "../dist/server/index.js";
import { handleChannelUpgrade, handleRpc } from "../dist/server/generated.js";
import { createUpgradeHandler } from "../dist/node/index.js";
import { injectClient } from "../dist/generated.js";
import { RpcError } from "../dist/index.js";

// A browser application on Node: platform-browser over a DOM-emulated document, so render
// hooks and effects run as in a browser.
const require = createRequire(
  new URL("../../../examples/angular-launch/package.json", import.meta.url),
);
const { ɵDominoAdapter: DominoAdapter } = await import(require.resolve("@angular/platform-server"));
const { bootstrapApplication } = await import(require.resolve("@angular/platform-browser"));

globalThis.ngServerMode = false;

const application = {
  id: "launch-connect-test-app",
  context: defineContext((request) => ({ user: request.headers.get("cookie") })),
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
const anySchema = schema(() => true, "");
const roomSchema = schema(
  (value) => typeof value === "object" && value !== null && typeof value.room === "string",
  "Expected a room",
);
const countSchema = schema(
  (value) => typeof value === "object" && value !== null && typeof value.count === "number",
  "Expected a count",
);

const log = [];
let stallGate = Promise.withResolvers();
let foldGate = Promise.withResolvers();
const registry = {
  live: defineRpc("live", ({ channel, stream }) => ({
    talk: channel({
      input: roomSchema,
      message: schema((value) => typeof value?.text === "string", "Expected a text"),
      errors: { GONE: { status: 410, message: "Gone", data: nullSchema } },
      handler: async function* ({ input, messages, signal, errors }) {
        log.push(`open ${input.room}`);
        signal.addEventListener("abort", () => log.push(`aborted ${input.room}`));
        yield { kind: "history", room: input.room };

        for await (const message of messages) {
          if (message.text === "fail") {
            throw errors.GONE(null);
          }

          yield { kind: "echo", text: message.text };
        }
      },
    }),
    // Never reads its messages; fails once the test opens its gate.
    stall: channel({
      message: anySchema,
      errors: { GONE: { status: 410, message: "Gone", data: nullSchema } },
      handler: async function* ({ errors }) {
        yield "ready";
        await stallGate.promise;
        throw errors.GONE(null);
      },
    }),
    // Never reads its messages; yields "boom" once the test opens its gate.
    fold: channel({
      message: anySchema,
      handler: async function* ({ signal }) {
        yield "ready";
        await foldGate.promise;
        yield "boom";
        await new Promise((resolve) => signal.addEventListener("abort", resolve));
      },
    }),
    // Never reads its messages, and runs until closed.
    deaf: channel({
      input: roomSchema,
      message: anySchema,
      handler: async function* ({ input, signal }) {
        yield `ready ${input.room}`;
        await new Promise((resolve) => signal.addEventListener("abort", resolve));
      },
    }),
    ticks: stream({
      input: countSchema,
      handler: async function* ({ input }) {
        for (let tick = 0; tick < input.count; tick += 1) {
          yield tick;
        }
      },
    }),
    hello: stream({
      handler: async function* () {
        yield "hello";
      },
    }),
  })),
};
const metadata = {
  live: {
    methods: [
      {
        name: "talk",
        input: true,
        kind: "channel",
        errors: [{ code: "GONE", status: 410, message: "Gone" }],
      },
      {
        name: "stall",
        input: false,
        kind: "channel",
        errors: [{ code: "GONE", status: 410, message: "Gone" }],
      },
      { name: "fold", input: false, kind: "channel", errors: [] },
      { name: "deaf", input: true, kind: "channel", errors: [] },
      { name: "ticks", input: true, kind: "stream", errors: [] },
      { name: "hello", input: false, kind: "stream", errors: [] },
    ],
  },
};

// A Node server for both transports; fetch and WebSocket resolve the client's relative URLs
// against it and send what a browser sends by itself.
async function serve() {
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

    for await (const chunk of response.body) {
      outgoing.write(chunk);
    }

    outgoing.end();
  });

  server.on(
    "upgrade",
    createUpgradeHandler((request) =>
      handleChannelUpgrade(registry, application, request, { allowedHosts: ["127.0.0.1"] }),
    ),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const base = `http://127.0.0.1:${server.address().port}`;
  const realFetch = globalThis.fetch;
  const RealWebSocket = globalThis.WebSocket;
  const opened = [];

  globalThis.fetch = (url, init) => {
    opened.push(url);

    return realFetch(new URL(url, base), {
      ...init,
      headers: { ...Object.fromEntries(new Headers(init.headers)), origin: base, cookie: "alice" },
    });
  };
  globalThis.WebSocket = class extends RealWebSocket {
    constructor(url) {
      opened.push(url);
      super(new URL(url, base.replace("http", "ws")), {
        headers: { origin: base, cookie: "alice" },
      });
    }
  };

  return {
    opened,
    close() {
      globalThis.fetch = realFetch;
      globalThis.WebSocket = RealWebSocket;
      server.closeAllConnections();
      server.close();
    },
  };
}

// The browser platform keeps the first document it sees, so every app mounts into this one.
globalThis.document = new DominoAdapter().createHtmlDocument();

async function bootstrap(server, Root, selector, platform = "browser") {
  document.body.appendChild(document.createElement(selector));

  try {
    const app = await bootstrapApplication(Root, {
      providers: [
        { provide: HttpClient, useValue: {} },
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });

    return { app, root: app.components[0].instance };
  } catch (error) {
    server.close();

    throw error;
  }
}

async function until(check, what) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (check()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  assert.fail(`Timed out waiting for ${what}`);
}

function stable(app) {
  return Promise.race([
    app.whenStable().then(() => "stable"),
    new Promise((resolve) => setTimeout(() => resolve("unstable"), 1000)),
  ]);
}

test("connect() runs a channel as signals: reduce, input changes, idle, failure, reconnect and send", async () => {
  const server = await serve();

  class Chat {
    rpc = injectClient(metadata);
    room = signal("a");
    chat = this.rpc.live.talk.connect({
      input: () => {
        const room = this.room();

        if (room === undefined) {
          return undefined;
        }

        return { room };
      },
      initial: () => ["initial"],
      reduce: (lines, event) => {
        if (event.kind === "history") {
          return [...lines, `history ${event.room}`];
        }

        return [...lines, event.text];
      },
    });
    stall = this.rpc.live.stall.connect({ initial: () => null });
  }

  Component({ selector: "connect-chat", template: "{{ chat.value().length }}" })(Chat);

  const { app, root } = await bootstrap(server, Chat, "connect-chat");
  const { chat, stall } = root;

  try {
    assert.deepEqual(chat.value(), ["initial"]);
    await until(() => chat.value().length === 2, "the first value");
    assert.deepEqual(chat.value(), ["initial", "history a"]);
    assert.equal(chat.status(), "open");
    assert.equal(chat.error(), undefined);
    // An open connection doesn't keep the app from becoming stable.
    assert.equal(await stable(app), "stable");

    await chat.send({ text: "hi" });
    await until(() => chat.value().length === 3, "the echo");
    assert.deepEqual(chat.value(), ["initial", "history a", "hi"]);

    // A new input closes the socket and opens another; the value stays until its first value,
    // which folds into the initial state.
    root.room.set("b");
    await until(() => log.includes("aborted a"), "the old call to abort");
    await until(() => chat.value().at(-1) === "history b", "the new call");
    assert.deepEqual(chat.value(), ["initial", "history b"]);
    assert.equal(chat.status(), "open");

    // undefined closes it: idle, value kept, send refused.
    root.room.set(undefined);
    await until(() => chat.status() === "idle", "idle");
    await until(() => log.includes("aborted b"), "the call to abort");
    assert.deepEqual(chat.value(), ["initial", "history b"]);
    await assert.rejects(chat.send({ text: "nobody" }), {
      name: "TypeError",
      message: "Launch connection isn't open",
    });

    // A failure keeps the value and shows the procedure's error.
    root.room.set("c");
    await until(() => chat.value().at(-1) === "history c", "room c");
    await chat.send({ text: "fail" });
    await until(() => chat.status() === "failed", "the failure");
    assert.ok(root.rpc.live.talk.isError(chat.error()));
    assert.equal(chat.error().code, "GONE");
    assert.deepEqual(chat.value(), ["initial", "history c"]);
    await assert.rejects(chat.send({ text: "late" }), TypeError);

    // reconnect() opens a new call from the handler's first value.
    const opens = log.filter((entry) => entry === "open c").length;

    chat.reconnect();
    assert.equal(chat.status(), "connecting");
    assert.equal(chat.error(), undefined);
    await until(() => log.filter((entry) => entry === "open c").length === opens + 1, "reopen");
    await until(() => chat.status() === "open", "open again");
    assert.deepEqual(chat.value(), ["initial", "history c"]);

    // A send still waiting when the connection fails rejects with the error error() shows.
    await until(() => stall.value() === "ready", "the stalled channel");

    const sends = [];

    for (let index = 0; index < 33; index += 1) {
      sends.push(stall.send(index));
    }

    await Promise.all(sends.slice(0, 32));
    stallGate.resolve();

    const rejection = await sends[32].catch((error) => error);

    await until(() => stall.status() === "failed", "the stalled failure");
    assert.ok(rejection instanceof RpcError);
    assert.equal(rejection, stall.error());
    assert.equal(stall.value(), "ready");

    // Destroying the injection context closes the socket.
    app.destroy();
    await until(() => log.includes("aborted c"), "destroy to close the socket");
  } finally {
    if (!app.destroyed) {
      app.destroy();
    }

    server.close();
    stallGate = Promise.withResolvers();
  }
});

test("connect() sends still waiting: a throwing reduce rejects them with error(), a new input with AbortError", async () => {
  const server = await serve();
  const boom = new Error("bad fold");
  let thrown;

  class Sender {
    rpc = injectClient(metadata);
    room = signal("a");
    fold = this.rpc.live.fold.connect({
      initial: () => [],
      reduce: (values, value) => {
        if (value === "boom") {
          throw thrown;
        }

        return [...values, value];
      },
    });
    deaf = this.rpc.live.deaf.connect({
      input: () => ({ room: this.room() }),
      initial: () => null,
    });
  }

  Component({ selector: "connect-sender", template: "" })(Sender);

  const { app, root } = await bootstrap(server, Sender, "connect-sender");
  const { fold, deaf } = root;

  async function stalled(connection) {
    const sends = [];

    for (let index = 0; index < 33; index += 1) {
      sends.push(connection.send(index));
    }

    await Promise.all(sends.slice(0, 32));

    return sends[32];
  }

  try {
    await until(() => fold.value().length === 1, "the fold's first value");

    // An Error is error() as is; anything else, also null or undefined, becomes an Error
    // with it as cause. Either way the waiting send rejects with that same object.
    for (const value of [boom, null, undefined, "text"]) {
      thrown = value;

      if (value !== boom) {
        foldGate = Promise.withResolvers();
        fold.reconnect();
        await until(() => fold.status() === "open", `the reconnected fold for ${value}`);
      }

      const waiting = stalled(fold);

      foldGate.resolve();

      const rejection = await waiting.catch((error) => error);

      assert.equal(fold.status(), "failed", String(value));
      assert.equal(rejection, fold.error(), String(value));
      assert.deepEqual(fold.value(), ["ready"], String(value));

      if (value === boom) {
        assert.equal(fold.error(), boom);
      } else {
        assert.ok(fold.error() instanceof Error, String(value));
        assert.equal(fold.error().message, "Launch connection's reduce threw a non-Error value");
        assert.equal(fold.error().cause, value, String(value));
      }
    }

    await until(() => deaf.value() === "ready a", "the deaf channel");

    const queued = stalled(deaf);

    root.room.set("b");
    await assert.rejects(queued, { name: "AbortError" });
    await until(() => deaf.value() === "ready b", "the new call");
    assert.equal(deaf.error(), undefined);
  } finally {
    app.destroy();
    server.close();
    foldGate = Promise.withResolvers();
  }
});

test("connect() follows a stream: the latest value without reduce, input changes, ended", async () => {
  const server = await serve();

  class Ticks {
    rpc = injectClient(metadata);
    count = signal(3);
    ticks = this.rpc.live.ticks.connect({
      input: () => ({ count: this.count() }),
      initial: () => -1,
    });
    hello = this.rpc.live.hello.connect({ initial: () => "initial" });
    never = this.rpc.live.hello.connect({ input: () => undefined, initial: () => "closed" });
  }

  Component({ selector: "connect-ticks", template: "{{ ticks.value() }}" })(Ticks);

  const { app, root } = await bootstrap(server, Ticks, "connect-ticks");

  try {
    assert.equal(root.ticks.value(), -1);
    await until(() => root.ticks.status() === "ended", "the end");
    assert.equal(root.ticks.value(), 2);

    root.count.set(1);
    await until(() => root.ticks.status() === "ended" && root.ticks.value() === 0, "the new input");

    await until(() => root.hello.status() === "ended", "hello");
    assert.equal(root.hello.value(), "hello");
    assert.equal(root.never.status(), "idle");
    assert.equal(root.never.value(), "closed");

    root.ticks.reconnect();
    assert.equal(root.ticks.status(), "connecting");
    await until(() => root.ticks.status() === "ended", "the reconnected end");
  } finally {
    app.destroy();
    server.close();
  }
});

test("connect() on the server stays idle with the initial value and opens nothing", async () => {
  const server = await serve();

  class Rendered {
    rpc = injectClient(metadata);
    chat = this.rpc.live.talk.connect({ input: () => ({ room: "a" }), initial: () => "initial" });
    ticks = this.rpc.live.ticks.connect({ input: () => ({ count: 1 }), initial: () => -1 });
  }

  Component({ selector: "connect-rendered", template: "{{ chat.value() }}" })(Rendered);

  const { app, root } = await bootstrap(server, Rendered, "connect-rendered", "server");

  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(root.chat.status(), "idle");
    assert.equal(root.chat.value(), "initial");
    assert.equal(root.ticks.status(), "idle");
    assert.equal(root.ticks.value(), -1);
    assert.deepEqual(server.opened, []);
  } finally {
    app.destroy();
    server.close();
  }
});
