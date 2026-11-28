import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DOCUMENT,
  createEnvironmentInjector,
  REQUEST,
  REQUEST_CONTEXT,
  RESPONSE_INIT,
} from "@angular/core";
import { FetchBackend, HttpBackend, HttpRequest } from "@angular/common/http";
import { forbidden, middleware } from "../dist/server/index.js";
import {
  createRequestScope,
  handleChannelUpgrade,
  handleRpc,
  provideRenderingBackend,
} from "../dist/server/generated.js";
import { application as bind, bound } from "./fixtures/application.mjs";

const application = {
  id: "launch-response-test-app",
  context: ({ request }) => ({ user: request.headers.get("cookie") }),
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

function post(path, input = null) {
  return new Request(`http://test${path}`, {
    method: "POST",
    headers: { origin: "http://test", "content-type": "application/json", cookie: "alice" },
    body: JSON.stringify({ input }),
  });
}

function handle(namespaces, path, input) {
  return handleRpc(bound(application, namespaces), post(path, input), { allowedHosts: ["test"] });
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

const timing = middleware(async ({ next, response }) => {
  try {
    return await next();
  } finally {
    response.headers.append("server-timing", "rpc;dur=1");
  }
});

test("over HTTP, cookies and headers from middleware and the handler go on the RPC response", async () => {
  const namespaces = {
    session: {
      use: [timing],
      build: ({ mutation }) => ({
        login: mutation({
          // Destructuring is safe: the members are function properties.
          handler: ({ response: { setCookie, deleteCookie, headers } }) => {
            setCookie("session", "abc", { maxAge: 60 });
            setCookie("prefs", "dark", {
              path: "/app",
              domain: "example.com",
              expires: new Date(Date.UTC(2030, 0, 1)),
              httpOnly: false,
              secure: false,
              sameSite: "strict",
            });
            deleteCookie("old", { path: "/legacy" });
            headers.set("x-app", "1");
            // Launch's own headers replace these.
            headers.set("cache-control", "public, max-age=60");
            headers.set("content-type", "text/plain");

            return null;
          },
        }),
      }),
    },
  };
  const response = await handle(namespaces, "/_rpc/session/login");

  assert.equal(response.status, 200);
  assert.deepEqual(response.headers.getSetCookie(), [
    "session=abc; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax",
    "prefs=dark; Path=/app; Domain=example.com; Expires=Tue, 01 Jan 2030 00:00:00 GMT; SameSite=Strict",
    "old=; Path=/legacy; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
  ]);
  assert.equal(response.headers.get("x-app"), "1");
  assert.equal(response.headers.get("server-timing"), "rpc;dur=1");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await response.json(), null);
});

test("cookies and headers apply for every outcome: declared errors, FORBIDDEN, INVALID_INPUT and INTERNAL", async () => {
  const marked = middleware(async ({ next, response }) => {
    response.setCookie("seen", "1");
    response.headers.set("x-seen", "1");

    return next();
  });
  const namespaces = {
    calls: {
      use: [marked],
      build: ({ query }) => ({
        declared: query({
          errors: { BUSY: { status: 409, message: "Busy", data: nullSchema } },
          handler: ({ errors }) => {
            throw errors.BUSY(null);
          },
        }),
        refused: query({
          handler: () => {
            throw forbidden();
          },
        }),
        invalid: query({ input: nullSchema, handler: () => null }),
        broken: query({
          handler: () => {
            throw new Error("bug");
          },
        }),
      }),
    },
  };
  const cases = [
    ["declared", null, 409],
    ["refused", null, 403],
    ["invalid", 1, 400],
    ["broken", null, 500],
  ];

  await logged(async () => {
    for (const [name, input, status] of cases) {
      const response = await handle(namespaces, `/_rpc/calls/${name}`, input);

      assert.equal(response.status, status, name);
      assert.deepEqual(
        response.headers.getSetCookie(),
        ["seen=1; Path=/; HttpOnly; Secure; SameSite=Lax"],
        name,
      );
      assert.equal(response.headers.get("x-seen"), "1", name);
    }
  });
});

test("an invalid cookie fails the call with INTERNAL, and a cookie set after the call settled throws", async () => {
  const invalid = [
    ["bad name", "v", {}],
    ["name", "a b", {}],
    ["name", "a;b", {}],
    ["name", "v", { path: "/a;b" }],
    ["name", "v", { maxAge: 1.5 }],
    ["name", "v", { expires: new Date(Number.NaN) }],
    ["name", "v", { sameSite: "none", secure: false }],
  ];
  let kept;
  const namespaces = {
    cookies: {
      build: ({ query }) => ({
        set: query({
          input: { "~standard": { version: 1, vendor: "test", validate: (value) => ({ value }) } },
          handler: ({ input, response }) => {
            kept = response;

            if (input !== null) {
              const [name, value, options] = invalid[input];

              response.setCookie(name, value, options);
            }

            return null;
          },
        }),
      }),
    },
  };

  for (let index = 0; index < invalid.length; index += 1) {
    let response;
    const entries = await logged(async () => {
      response = await handle(namespaces, "/_rpc/cookies/set", index);
    });

    assert.equal(response.status, 500, JSON.stringify(invalid[index]));
    assert.equal(entries[0][1].name, "TypeError");
    assert.deepEqual(response.headers.getSetCookie(), []);
  }

  const settled = await handle(namespaces, "/_rpc/cookies/set", null);

  assert.equal(settled.status, 200);
  assert.throws(() => kept.setCookie("late", "1"), /already sent this call's response/);
  assert.throws(() => kept.deleteCookie("late"), /already sent this call's response/);
});

test("a stream's cookies and headers are the ones set when its handler returned its iterable", async () => {
  const early = middleware(async ({ next, response }) => {
    response.setCookie("early", "1");

    return next();
  });
  const namespaces = {
    live: {
      use: [early, timing],
      build: ({ stream }) => ({
        plain: stream({
          handler: async ({ response }) => {
            response.setCookie("plain", "1");
            response.headers.set("x-plain", "1");

            return (async function* () {
              // Ignored: the response already started.
              response.headers.set("x-late", "1");
              yield 1;
            })();
          },
        }),
        generator: stream({
          handler: async function* ({ response }) {
            yield 1;
            response.setCookie("late", "1");
          },
        }),
      }),
    },
  };
  const plain = await handle(namespaces, "/_rpc/live/plain");

  assert.equal(plain.headers.get("content-type"), "text/event-stream");
  assert.deepEqual(plain.headers.getSetCookie(), [
    "early=1; Path=/; HttpOnly; Secure; SameSite=Lax",
    "plain=1; Path=/; HttpOnly; Secure; SameSite=Lax",
  ]);
  assert.equal(plain.headers.get("x-plain"), "1");
  // The timing middleware's header comes after the stream ended, so it's ignored.
  assert.equal(plain.headers.get("server-timing"), null);
  assert.equal(plain.headers.get("x-late"), null);
  assert.deepEqual(await events(plain), ["event: value\ndata: 1", "event: end\ndata: null"]);

  let generator;
  const entries = await logged(async () => {
    generator = await handle(namespaces, "/_rpc/live/generator");

    assert.deepEqual(generator.headers.getSetCookie(), [
      "early=1; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);
    assert.deepEqual(await events(generator), [
      "event: value\ndata: 1",
      'event: error\ndata: {"status":500,"error":{"code":"INTERNAL","message":"Internal server error","data":null}}',
    ]);
  });

  assert.match(entries[0][1].message, /already sent this call's response/);
});

function render(namespaces, scope, responseInit) {
  const parent = createEnvironmentInjector([]);
  const providers = [
    { provide: REQUEST_CONTEXT, useValue: scope },
    { provide: REQUEST, useValue: scope.request },
    { provide: DOCUMENT, useValue: { location: { href: scope.request.url } } },
    {
      provide: FetchBackend,
      useValue: {
        handle: () => {
          throw new Error("RPC must not fall back");
        },
      },
    },
    provideRenderingBackend(bound(application, namespaces)),
  ];

  if (responseInit !== undefined) {
    providers.push({ provide: RESPONSE_INIT, useValue: responseInit });
  }

  const injector = createEnvironmentInjector(providers, parent);

  return {
    call(path) {
      return new Promise((resolve) => {
        injector
          .get(HttpBackend)
          .handle(new HttpRequest("POST", path, { input: null }))
          .subscribe({ next: resolve, error: resolve });
      });
    },
    destroy() {
      injector.destroy();
      parent.destroy();
    },
  };
}

test("during server rendering, cookies go on RESPONSE_INIT's headers for every outcome, and headers are dropped", async () => {
  const namespaces = {
    page: {
      build: ({ query }) => ({
        read: query({
          handler: ({ response }) => {
            response.setCookie("seen", "1");
            response.headers.set("x-dropped", "1");

            return "ok";
          },
        }),
        refused: query({
          handler: ({ response }) => {
            response.setCookie("refused", "1");

            throw forbidden();
          },
        }),
      }),
    },
  };
  const scope = createRequestScope(bound(application, namespaces), new Request("http://test/page"));
  const headers = new Headers({ "content-type": "text/html" });
  const responseInit = { status: 200, headers };
  const page = render(namespaces, scope, responseInit);

  try {
    const read = await page.call("/_rpc/page/read");
    const refused = await page.call("/_rpc/page/refused");

    assert.equal(read.status, 200);
    assert.equal(read.body, "ok");
    assert.equal(read.headers.has("set-cookie"), false);
    assert.equal(refused.status, 403);
    // The same Headers object Angular builds the page response from.
    assert.equal(responseInit.headers, headers);
    assert.deepEqual(headers.getSetCookie(), [
      "seen=1; Path=/; HttpOnly; Secure; SameSite=Lax",
      "refused=1; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);
    assert.equal(headers.get("x-dropped"), null);
  } finally {
    page.destroy();
  }

  // Headers given as a plain object are replaced by Headers carrying them.
  const plainInit = { headers: { "x-page": "1" } };
  const plainPage = render(namespaces, scope, plainInit);

  try {
    await plainPage.call("/_rpc/page/read");
    assert.ok(plainInit.headers instanceof Headers);
    assert.equal(plainInit.headers.get("x-page"), "1");
    assert.deepEqual(plainInit.headers.getSetCookie(), [
      "seen=1; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);
  } finally {
    plainPage.destroy();
  }

  // Without RESPONSE_INIT the cookies have nowhere to go.
  const bare = render(namespaces, scope, undefined);

  try {
    let failed;
    const entries = await logged(async () => {
      failed = await bare.call("/_rpc/page/read");
    });

    assert.equal(failed.status, 500);
    assert.equal(failed.error.error.code, "INTERNAL");
    assert.match(entries[0][0], /without RESPONSE_INIT/);
  } finally {
    bare.destroy();
  }
});

test("a stage's cookies go on the response of the call that first ran it, once per scope", async () => {
  let stages = 0;
  const app = bind("launch-stage-cookie-test-app", {
    context: ({ response }) => {
      stages += 1;
      response.setCookie("session", "refreshed");

      return {};
    },
    namespaces: {
      page: {
        build: ({ query, stream, channel }) => ({
          read: query({ handler: () => "read" }),
          again: query({ handler: () => "again" }),
          live: stream({
            handler: async function* () {
              yield "tick";
            },
          }),
          talk: channel({
            message: nullSchema,
            handler: async function* () {
              yield "hello";
            },
          }),
        }),
      },
    },
  });
  const cookie = "session=refreshed; Path=/; HttpOnly; Secure; SameSite=Lax";
  const options = { allowedHosts: ["test"] };

  const reply = await handleRpc(app, post("/_rpc/page/read"), options);

  assert.equal(reply.status, 200);
  assert.deepEqual(reply.headers.getSetCookie(), [cookie]);

  const streamed = await handleRpc(app, post("/_rpc/page/live"), options);

  assert.equal(streamed.headers.get("content-type"), "text/event-stream");
  assert.deepEqual(streamed.headers.getSetCookie(), [cookie]);
  await streamed.body.cancel();

  const upgrade = await handleChannelUpgrade(
    app,
    new Request("http://test/_rpc/page/talk?input=null", {
      headers: { origin: "http://test", upgrade: "websocket", connection: "Upgrade" },
    }),
    options,
  );

  assert.deepEqual(upgrade.headers.getSetCookie(), [cookie]);
  assert.equal(stages, 3, "one stage run per request");

  const headers = new Headers();
  const parent = createEnvironmentInjector([]);
  const scope = createRequestScope(app, new Request("http://test/page"));
  const injector = createEnvironmentInjector(
    [
      { provide: REQUEST_CONTEXT, useValue: scope },
      { provide: REQUEST, useValue: scope.request },
      { provide: RESPONSE_INIT, useValue: { headers } },
      { provide: DOCUMENT, useValue: { location: { href: scope.request.url } } },
      { provide: FetchBackend, useValue: { handle: () => assert.fail("Unexpected fallback") } },
      provideRenderingBackend(app),
    ],
    parent,
  );

  function call(path) {
    return new Promise((resolve) => {
      injector
        .get(HttpBackend)
        .handle(new HttpRequest("POST", path, { input: null }))
        .subscribe({ next: resolve, error: resolve });
    });
  }

  try {
    assert.equal((await call("/_rpc/page/read")).body, "read");
    assert.equal((await call("/_rpc/page/again")).body, "again");
    assert.deepEqual(headers.getSetCookie(), [cookie]);
    assert.equal(stages, 4, "the render's scope ran its stage once");
  } finally {
    injector.destroy();
    parent.destroy();
  }
});
