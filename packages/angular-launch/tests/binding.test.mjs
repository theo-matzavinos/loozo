import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { DOCUMENT, REQUEST, REQUEST_CONTEXT, createEnvironmentInjector } from "@angular/core";
import {
  HttpBackend,
  FetchBackend,
  HttpRequest,
  HttpParams,
  HttpContext,
  HttpErrorResponse,
  HttpResponse,
} from "@angular/common/http";
import { firstValueFrom, of } from "rxjs";
import {
  defineContext,
  defineRpc,
  finishLaunchRendering,
  forbidden,
  middleware,
} from "../dist/server/index.js";
import { createRequestScope, handleRpc, provideLaunchServer } from "../dist/server/generated.js";
import { dispatch } from "../dist/server/dispatch.js";
import { RPC_CALL } from "../dist/generated.js";

const require = createRequire(
  new URL("../../../examples/angular-launch/package.json", import.meta.url),
);
const { sanitizeRequestHeaders } = await import(
  new URL("./_validation-chunk.mjs", `file://${require.resolve("@angular/ssr")}`)
);
const id = "test";
const path = `/_rpc/${id}/read`;

const prerenderedPage = "http://localhost:4200/about";

function backend(registry, application, scope, nativeRequest, fallback) {
  const parent = createEnvironmentInjector([]);
  const injector = createEnvironmentInjector(
    [
      { provide: REQUEST_CONTEXT, useValue: scope },
      { provide: REQUEST, useValue: nativeRequest },
      { provide: DOCUMENT, useValue: { location: { href: prerenderedPage } } },
      { provide: FetchBackend, useValue: { handle: fallback } },
      provideLaunchServer(registry, application),
    ],
    parent,
  );

  return {
    value: injector.get(HttpBackend),
    injector,
    destroy() {
      injector.destroy();
      parent.destroy();
    },
  };
}

// A stand-in for the bootstrapped application finishLaunchRendering receives.
function renderedApp(rendering) {
  const app = {
    injector: rendering.injector,
    destroyed: false,
    whenStable: async () => {},
    destroy: () => {
      app.destroyed = true;
    },
  };

  return app;
}

function prerenderFixture() {
  const seen = { factories: 0, middlewareRuns: 0, handlers: 0 };
  const application = {
    id: "prerendering",
    context: defineContext((request) => {
      seen.factories += 1;

      return { number: seen.factories, request };
    }),
  };
  const counted = middleware(async ({ next }) => {
    seen.middlewareRuns += 1;

    return next();
  });
  const registry = {
    [id]: defineRpc(
      "test",
      ({ query, mutation }) => ({
        read: query({
          handler: ({ context, request }) => {
            seen.handlers += 1;

            return {
              context: context.number,
              sameRequest: context.request === request,
              method: request.method,
              url: request.url,
              cookie: request.headers.get("cookie"),
            };
          },
        }),
        refuse: query({
          handler: () => {
            throw forbidden();
          },
        }),
        remember: query({
          handler: ({ response }) => {
            response.setCookie("seen", "1");

            return null;
          },
        }),
        waitForAbort: query({
          handler: ({ signal }) =>
            new Promise((resolve) => {
              signal.addEventListener("abort", () => resolve(null));
            }),
        }),
        write: mutation({ handler: () => null }),
      }),
      { use: [counted] },
    ),
  };

  return { seen, application, registry };
}

function call(rendering, url, marked = false) {
  return firstValueFrom(
    rendering.value.handle(
      new HttpRequest(
        "POST",
        url,
        { input: null },
        { context: new HttpContext().set(RPC_CALL, marked) },
      ),
    ),
  );
}

test("prerendering delegates foreign and non-RPC requests and runs own-origin calls with one cookie-less page context", async () => {
  const { seen, application, registry } = prerenderFixture();
  const forwarded = [];
  const response = new HttpResponse({ status: 206, body: "ordinary external service" });
  const fallback = (request) => {
    forwarded.push(request);

    return of(response);
  };
  const rendering = backend(registry, application, null, null, fallback);
  const app = renderedApp(rendering);

  try {
    for (const url of [
      `https://external.example${path}`,
      `//external.example${path}`,
      `https://launch.invalid${path}`,
      "/ordinary",
    ]) {
      const request = new HttpRequest(
        "POST",
        url,
        { input: null },
        { params: new HttpParams().set("extra", "1") },
      );

      assert.equal(await firstValueFrom(rendering.value.handle(request)), response);
      assert.equal(forwarded.at(-1), request);
    }

    assert.equal(seen.factories, 0);

    for (const [url, marked] of [
      [path, false],
      [path.slice(1), false],
      [`http://localhost:4200${path}`, false],
      [path, true],
    ]) {
      const reply = await call(rendering, url, marked);

      assert.equal(reply.status, 200);
      assert.deepEqual(reply.body, {
        context: 1,
        sameRequest: true,
        method: "GET",
        url: prerenderedPage,
        cookie: null,
      });
    }

    assert.equal(forwarded.length, 4);
    assert.equal(seen.factories, 1);
    assert.equal(seen.middlewareRuns, 4);
    assert.equal(seen.handlers, 4);
    assert.equal(await finishLaunchRendering(app), app);
    assert.equal(app.destroyed, false);
  } finally {
    rendering.destroy();
  }
});

test("prerendering fails the render for a call that doesn't answer 200, sets a cookie or has no context", async () => {
  const cases = [
    {
      url: "/_rpc/test/refuse",
      reply: 403,
      fault: /\/_rpc\/test\/refuse answered 403 \{"error":\{"code":"FORBIDDEN"/,
    },
    {
      url: "/_rpc/test/write",
      reply: 403,
      fault: /\/_rpc\/test\/write answered 403 \{"error":\{"code":"FORBIDDEN"/,
    },
    { url: "/_rpc/test/missing", reply: 404, fault: /\/_rpc\/test\/missing answered 404/ },
    {
      url: `https://external.example${path}`,
      marked: true,
      reply: 400,
      fault: /\/_rpc\/test\/read answered 400 \{"error":\{"code":"INVALID_INPUT"/,
    },
    { url: "/_rpc/test/remember", reply: 200, fault: /\/_rpc\/test\/remember set a cookie/ },
  ];

  for (const { url, marked, reply, fault } of cases) {
    const { application, registry } = prerenderFixture();
    const rendering = backend(registry, application, null, null, () => {
      throw new Error("Unexpected fallback");
    });
    const app = renderedApp(rendering);

    try {
      if (reply === 200) {
        assert.equal((await call(rendering, url, marked)).status, 200);
      } else {
        await assert.rejects(
          call(rendering, url, marked),
          (error) => error instanceof HttpErrorResponse && error.status === reply,
        );
      }

      // A successful call before or after doesn't clear the fault.
      assert.equal((await call(rendering, path)).status, 200);
      await assert.rejects(
        finishLaunchRendering(app),
        (error) =>
          error.message.startsWith("Launch can't prerender this page: ") &&
          fault.test(error.message),
      );
      assert.equal(app.destroyed, true);
    } finally {
      rendering.destroy();
    }
  }

  const broken = new Error("database unreachable");
  const { registry } = prerenderFixture();
  const throwing = {
    id: "prerendering",
    context: defineContext(() => {
      throw broken;
    }),
  };
  const rendering = backend(registry, throwing, null, null, () => {
    throw new Error("Unexpected fallback");
  });
  const app = renderedApp(rendering);

  try {
    await assert.rejects(
      call(rendering, path),
      (error) => error instanceof HttpErrorResponse && error.status === 500,
    );
    await assert.rejects(
      finishLaunchRendering(app),
      (error) => /its context factory threw/.test(error.message) && error.cause === broken,
    );
  } finally {
    rendering.destroy();
  }
});

test("a prerendering call's signal aborts when the render's application is destroyed", async () => {
  const { application, registry } = prerenderFixture();
  const rendering = backend(registry, application, null, null, () => {
    throw new Error("Unexpected fallback");
  });
  const pending = call(rendering, "/_rpc/test/waitForAbort");

  await new Promise((resolve) => setTimeout(resolve, 10));
  rendering.destroy();

  assert.equal((await pending).status, 200);
});

test("scope matches native request and generated application across Angular sanitization clones; mismatches reject before middleware/handlers", async () => {
  let factories = 0;
  const calls = [];
  const context = defineContext((request) => {
    factories += 1;

    return { user: request.headers.get("cookie") };
  });
  const app = { id: "app-a-context-v1", context };
  const controller = new AbortController();
  const incoming = new Request("http://127.0.0.1/todos", {
    signal: controller.signal,
    headers: {
      cookie: "alice",
      forwarded: "for=127.0.0.1",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "untrusted.example",
    },
  });
  const scope = await createRequestScope(app, incoming);

  assert.equal(factories, 1);
  assert.equal(incoming.headers.has("x-loozo-launch-scope"), false);

  const previousWarn = console.warn;
  const warnings = [];
  let native;

  console.warn = (...args) => warnings.push(args);

  try {
    native = sanitizeRequestHeaders(scope.request, new Set());
  } finally {
    console.warn = previousWarn;
  }

  assert.notEqual(native, scope.request);
  assert.equal(native.headers.get("cookie"), "alice");
  assert.equal(native.headers.has("forwarded"), false);
  assert.equal(native.headers.has("x-forwarded-host"), false);
  assert.equal(native.headers.has("x-forwarded-proto"), false);
  assert.equal(native.headers.get("x-loozo-launch-scope"), scope.binding);
  assert.equal(warnings.length, 3);

  const registry = {
    [id]: defineRpc(
      "test",
      ({ query }) => ({
        read: query({
          handler: ({ context }) => {
            calls.push("handler");

            return context.user;
          },
        }),
      }),
      {
        use: [
          middleware(async ({ request, next }) => {
            calls.push("middleware");
            assert.equal(request, native);

            return next();
          }),
        ],
      },
    ),
  };
  let fallbackCalls = 0;
  const fallback = () => {
    fallbackCalls += 1;

    throw new Error("RPC must not fall back");
  };
  const valid = backend(registry, app, scope, native, fallback);

  assert.equal(
    (await firstValueFrom(valid.value.handle(new HttpRequest("POST", path, { input: null })))).body,
    "alice",
  );
  valid.destroy();
  assert.deepEqual(calls, ["middleware", "handler"]);
  assert.equal(factories, 1, "backend never creates another context");
  controller.abort();
  assert.equal(scope.request.signal.aborted, true);
  assert.equal(native.signal.aborted, true);

  const bob = await createRequestScope(
    app,
    new Request(incoming.url, { headers: { cookie: "bob" } }),
  );
  const otherApp = {
    id: "app-b-context-v1",
    context: defineContext(() => ({ user: "other-app" })),
  };
  const other = await createRequestScope(otherApp, new Request(incoming.url));
  const previousError = console.error;
  const logs = [];

  console.error = (...args) => logs.push(args);

  try {
    for (const [candidate, nativeRequest] of [
      [scope, bob.request],
      [scope, incoming],
      [other, other.request],
    ]) {
      const mismatch = backend(registry, app, candidate, nativeRequest, fallback);

      for (const marked of [false, true]) {
        const request = new HttpRequest(
          "POST",
          path,
          { input: null },
          { context: new HttpContext().set(RPC_CALL, marked) },
        );

        await assert.rejects(firstValueFrom(mismatch.value.handle(request)), (error) => {
          assert.ok(error instanceof HttpErrorResponse);
          assert.equal(error.status, 500);
          assert.deepEqual(error.error, {
            error: { code: "INTERNAL", message: "Internal server error", data: null },
          });
          assert.ok(!JSON.stringify(error.error).includes(candidate.binding));

          return true;
        });
      }

      mismatch.destroy();
    }

    assert.equal(
      (await dispatch(registry, path, { input: null }, other, app, other.request)).status,
      500,
    );
  } finally {
    console.error = previousError;
  }

  assert.deepEqual(calls, ["middleware", "handler"]);
  assert.equal(fallbackCalls, 0);
  assert.equal(logs.length, 7);
});

test("binding clone preserves original body and signal, and HTTP dispatcher creates exactly one context", async () => {
  let factories = 0;
  const app = {
    id: "body-app",
    context: defineContext(async (request) => {
      factories += 1;

      const body = await request.clone().text();

      return { body };
    }),
  };
  const controller = new AbortController();
  const request = new Request("http://127.0.0.1/input", {
    method: "POST",
    body: '{"input":"one"}',
    signal: controller.signal,
  });
  const scope = await createRequestScope(app, request);

  assert.equal(request.bodyUsed, false);
  assert.equal(scope.request.bodyUsed, false);
  assert.equal(scope.value.body, '{"input":"one"}');
  assert.equal(await request.text(), '{"input":"one"}');
  assert.equal(await scope.request.text(), scope.value.body);
  controller.abort();
  assert.equal(scope.request.signal.aborted, true);
  assert.equal(factories, 1);

  const registry = {
    [id]: defineRpc("test", ({ query }) => ({
      read: query({ handler: ({ context }) => context.body }),
    })),
  };
  const reply = await handleRpc(
    registry,
    app,
    new Request(`http://127.0.0.1${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
      body: '{"input":null}',
    }),
    { allowedHosts: ["127.0.0.1"] },
  );

  assert.equal(reply.status, 200);
  assert.equal(await reply.json(), '{"input":null}');
  assert.equal(factories, 2, "exactly one additional factory for the HTTP request");
});

test("native params/setParams marked/unmarked targets use effective URLs and match real HTTP rejection without fallback", async () => {
  let factories = 0;
  let middlewareRuns = 0;
  let handlers = 0;
  let fallbackCalls = 0;
  const app = {
    id: "params-app",
    context: defineContext(() => {
      factories += 1;

      return {};
    }),
  };
  const scope = await createRequestScope(app, new Request("http://127.0.0.1/todos"));
  const registry = {
    [id]: defineRpc(
      "test",
      ({ query }) => ({
        read: query({
          handler: () => {
            handlers += 1;

            return "ok";
          },
        }),
      }),
      {
        use: [
          middleware(async ({ next }) => {
            middlewareRuns += 1;

            return next();
          }),
        ],
      },
    ),
  };
  const direct = backend(registry, app, scope, scope.request, () => {
    fallbackCalls += 1;

    throw new Error("Unexpected fallback");
  });

  for (const marked of [false, true]) {
    const context = new HttpContext().set(RPC_CALL, marked);
    const base = new HttpRequest("POST", path, { input: null }, { context });
    const targets = [
      new HttpRequest(
        "POST",
        path,
        { input: null },
        { context, params: new HttpParams().set("extra", "1") },
      ),
      base.clone({ setParams: { extra: "1" } }),
      base.clone({ params: new HttpParams().set("extra", "1") }),
    ];

    for (const request of targets) {
      assert.equal(request.url, path);
      assert.equal(request.urlWithParams, path + "?extra=1");
      await assert.rejects(
        firstValueFrom(direct.value.handle(request)),
        (error) =>
          error instanceof HttpErrorResponse &&
          error.status === 400 &&
          error.url === request.urlWithParams,
      );

      const http = await handleRpc(
        registry,
        app,
        new Request(`http://127.0.0.1${request.urlWithParams}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
          body: '{"input":null}',
        }),
        { allowedHosts: ["127.0.0.1"] },
      );

      assert.equal(http.status, 400);
    }
  }

  assert.equal(factories, 1);
  assert.equal(middlewareRuns, 0);
  assert.equal(handlers, 0);
  assert.equal(fallbackCalls, 0);
  direct.destroy();

  const absent = backend(registry, app, null, null, () => {
    fallbackCalls += 1;

    throw new Error("Unexpected prerender fallback");
  });

  await assert.rejects(
    firstValueFrom(
      absent.value.handle(
        new HttpRequest(
          "POST",
          path,
          { input: null },
          { params: new HttpParams().set("extra", "1") },
        ),
      ),
    ),
    (error) => error instanceof HttpErrorResponse && error.status === 400,
  );
  assert.equal(fallbackCalls, 0);
  // The refusal comes before a prerender context is created.
  assert.equal(factories, 1);
  absent.destroy();
});
