import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { REQUEST, REQUEST_CONTEXT, createEnvironmentInjector } from "@angular/core";
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
import { defineContext, defineRpc, query, finishLaunchRendering } from "../dist/server/index.js";
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

function backend(registry, application, scope, nativeRequest, fallback) {
  const parent = createEnvironmentInjector([]);
  const injector = createEnvironmentInjector(
    [
      { provide: REQUEST_CONTEXT, useValue: scope },
      { provide: REQUEST, useValue: nativeRequest },
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

test("without native REQUEST foreign unmarked RPC-looking HTTP delegates without poisoning rendering; local/marked RPC fails", async () => {
  let factories = 0;
  let guards = 0;
  let handlers = 0;
  const application = {
    id: "without-native-request",
    context: defineContext(() => {
      factories += 1;

      return {};
    }),
  };
  const registry = {
    [id]: defineRpc(
      "test",
      {
        read: query({
          handler: () => {
            handlers += 1;

            return "unexpected";
          },
        }),
      },
      {
        canActivate: [
          () => {
            guards += 1;

            return true;
          },
        ],
      },
    ),
  };
  const forwarded = [];
  const response = new HttpResponse({ status: 206, body: "ordinary external service" });
  const fallback = (request) => {
    forwarded.push(request);

    return of(response);
  };
  const absent = backend(registry, application, null, null, fallback);
  let destroyed = false;
  const rendering = {
    injector: absent.injector,
    whenStable: async () => {},
    destroy: () => {
      destroyed = true;
    },
  };

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

      assert.equal(await firstValueFrom(absent.value.handle(request)), response);
      assert.equal(forwarded.at(-1), request);
    }

    assert.equal(forwarded.length, 4);
    // The public finishing hook uses native DI; this minimal application double
    // proves ordinary fallback did not set the private prerender fault.
    assert.equal(await finishLaunchRendering(rendering), rendering);
    assert.equal(destroyed, false);

    for (const [url, marked] of [
      [path, false],
      [path.slice(1), false],
      [`http://launch.invalid${path}`, false],
      [`//launch.invalid${path}`, false],
      [`https://external.example${path}`, true],
      [`//external.example${path}`, true],
      [path, true],
    ]) {
      const request = new HttpRequest(
        "POST",
        url,
        { input: null },
        { context: new HttpContext().set(RPC_CALL, marked) },
      );

      await assert.rejects(firstValueFrom(absent.value.handle(request)), /live request context/);
    }

    assert.equal(forwarded.length, 4);
    await assert.rejects(finishLaunchRendering(rendering), /live request context/);
    assert.equal(destroyed, true);
    assert.equal(factories, 0);
    assert.equal(guards, 0);
    assert.equal(handlers, 0);
  } finally {
    absent.destroy();
  }

  // A scope alone is not a live REQUEST or an origin configuration.
  const scope = await createRequestScope(
    application,
    new Request("https://external.example/document"),
  );
  const scopeOnly = backend(registry, application, scope, null, fallback);

  try {
    assert.equal(
      await firstValueFrom(
        scopeOnly.value.handle(
          new HttpRequest("POST", `https://external.example${path}`, { input: null }),
        ),
      ),
      response,
    );
    await assert.rejects(
      firstValueFrom(scopeOnly.value.handle(new HttpRequest("POST", path, { input: null }))),
      /live request context/,
    );
    assert.equal(factories, 1);
    assert.equal(guards, 0);
    assert.equal(handlers, 0);
  } finally {
    scopeOnly.destroy();
  }
});

test("scope matches native request and generated application across Angular sanitization clones; mismatches reject before guards/handlers", async () => {
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
      {
        read: query({
          handler: ({ context }) => {
            calls.push("handler");

            return context.user;
          },
        }),
      },
      {
        canActivate: [
          ({ request }) => {
            calls.push("guard");
            assert.equal(request, native);

            return true;
          },
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
  assert.deepEqual(calls, ["guard", "handler"]);
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

  assert.deepEqual(calls, ["guard", "handler"]);
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
    [id]: defineRpc("test", { read: query({ handler: ({ context }) => context.body }) }),
  };
  const reply = await handleRpc(
    registry,
    app,
    new Request(`http://127.0.0.1${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"input":null}',
    }),
  );

  assert.equal(reply.status, 200);
  assert.equal(await reply.json(), '{"input":null}');
  assert.equal(factories, 2, "exactly one additional factory for the HTTP request");
});

test("native params/setParams marked/unmarked targets use effective URLs and match real HTTP rejection without fallback", async () => {
  let factories = 0;
  let guards = 0;
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
      {
        read: query({
          handler: () => {
            handlers += 1;

            return "ok";
          },
        }),
      },
      {
        canActivate: [
          () => {
            guards += 1;

            return true;
          },
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
          headers: { "content-type": "application/json" },
          body: '{"input":null}',
        }),
      );

      assert.equal(http.status, 400);
    }
  }

  assert.equal(factories, 1);
  assert.equal(guards, 0);
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
    /live request context/,
  );
  assert.equal(fallbackCalls, 0);
  absent.destroy();
});
