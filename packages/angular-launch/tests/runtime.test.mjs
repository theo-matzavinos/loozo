import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createEnvironmentInjector,
  runInInjectionContext,
  REQUEST,
  REQUEST_CONTEXT,
} from "@angular/core";
import {
  HttpBackend,
  FetchBackend,
  HttpClient,
  HttpRequest,
  HttpParams,
  HttpContext,
  HttpResponse,
  HttpErrorResponse,
} from "@angular/common/http";
import { Observable, firstValueFrom } from "rxjs";
import { defineContext, defineRpc, query } from "../dist/server/index.js";
import { createRequestScope, handleRpc, provideLaunchServer } from "../dist/server/generated.js";
import { isRequestScope, dispatch } from "../dist/server/dispatch.js";
import { injectClient, RPC_CALL } from "../dist/generated.js";
import { RpcError, recognizedFailure, frameworkFailures } from "../dist/client.js";
import { serializeJson } from "../dist/json.js";

const id = "test";
const path = `/_rpc/${id}/read`;

function registry(procedures, canActivate = []) {
  return { [id]: defineRpc("test", procedures, { canActivate }) };
}

function schema(order) {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: async (value) => {
        order.push("validation");

        if (typeof value !== "string") {
          return { issues: [{ message: "secret vendor detail" }] };
        }

        return { value: { length: value.length } };
      },
    },
  };
}

const context = defineContext(async (request) => ({
  request,
  user: request.headers.get("cookie"),
}));
const application = { id: "launch-runtime-test-app", context };
const request = new Request("http://127.0.0.1/todos", { headers: { cookie: "alice" } });

test("async validation, guards and handler ordering; false denies explicitly, no inheritance; no-input envelopes", async () => {
  const order = [];
  const scope = await createRequestScope(application, request);

  assert.equal(isRequestScope(scope), true);
  assert.equal(isRequestScope({ request, value: {} }), false);

  const routes = registry(
    {
      read: query({
        input: schema(order),
        canActivate: [
          ({ input, context, request }) => {
            order.push("procedure");
            assert.equal(input.length, 3);
            assert.equal(context.user, "alice");
            assert.equal(request, scope.request);

            return true;
          },
        ],
        handler: ({ input }) => {
          order.push("handler");

          return { length: input.length };
        },
      }),
    },
    [
      () => {
        order.push("group");

        return true;
      },
    ],
  );
  const reply = await dispatch(routes, path, { input: "abc" }, scope, application, scope.request);

  assert.deepEqual(reply, { status: 200, body: { length: 3 } });
  assert.deepEqual(order, ["validation", "group", "procedure", "handler"]);
  order.length = 0;

  const invalid = await dispatch(routes, path, { input: 1 }, scope, application, scope.request);

  assert.equal(invalid.status, 400);
  assert.deepEqual(order, ["validation"]);
  assert.equal(JSON.stringify(invalid).includes("secret"), false);

  const denied = registry(
    {
      read: query({
        handler: () => {
          throw new Error("must not run");
        },
      }),
    },
    [() => false],
  );

  assert.equal(
    (await dispatch(denied, path, { input: null }, scope, application, scope.request)).status,
    403,
  );

  const deniedProcedure = registry({
    read: query({
      canActivate: [() => false],
      handler: () => {
        throw new Error("must not run");
      },
    }),
  });

  assert.equal(
    (await dispatch(deniedProcedure, path, { input: null }, scope, application, scope.request))
      .status,
    403,
  );

  const noInput = registry({
    read: query({
      handler: ({ input }) => {
        assert.equal(input, undefined);

        return 7;
      },
    }),
  });

  assert.equal(
    (await dispatch(noInput, path, { input: null }, scope, application, scope.request)).status,
    200,
  );

  for (const body of [
    {},
    null,
    [],
    { input: 1 },
    { input: null, kind: "query" },
    { input: null, extra: true },
  ]) {
    assert.equal(
      (await dispatch(noInput, path, body, scope, application, scope.request)).status,
      400,
    );
  }

  assert.equal(
    (
      await dispatch(
        noInput,
        `/_rpc/${id}/unknown`,
        { input: null },
        scope,
        application,
        scope.request,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await dispatch(
        noInput,
        "/_rpc/unknown/read",
        { input: null },
        scope,
        application,
        scope.request,
      )
    ).status,
    404,
  );
});

test("HTTP/direct JSON parity and generic exception/context failures with server logging", async () => {
  const values = [
    new Date(),
    Infinity,
    undefined,
    () => 1,
    { private: "detail", date: new Date() },
  ];
  const logs = [];
  const previous = console.error;

  console.error = (...args) => logs.push(args);

  try {
    for (const value of values) {
      const routes = registry({ read: query({ handler: () => value }) });
      const scope = await createRequestScope(application, request);
      const direct = await dispatch(
        routes,
        path,
        { input: null },
        scope,
        application,
        scope.request,
      );
      const http = await handleRpc(
        routes,
        application,
        new Request(`http://127.0.0.1${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"input":null}',
        }),
      );

      assert.equal(direct.status, 500);
      assert.deepEqual(await http.json(), direct.body);
      assert.equal(JSON.stringify(direct.body).includes("detail"), false);
    }

    const routes = registry({
      read: query({
        handler: () => {
          throw new Error("hidden exception");
        },
      }),
    });
    const failure = await handleRpc(
      routes,
      {
        id: application.id,
        context: defineContext(() => {
          throw new Error("hidden context");
        }),
      },
      new Request(`http://test${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"input":null}',
      }),
    );

    assert.equal(failure.status, 500);
    assert.equal(JSON.stringify(await failure.json()).includes("hidden"), false);
    assert.ok(logs.length >= 11);
  } finally {
    console.error = previous;
  }

  const sparse = [];

  sparse[1] = 1;

  for (const value of [
    new Date(),
    NaN,
    Infinity,
    undefined,
    () => 1,
    sparse,
    { value: undefined },
  ]) {
    assert.throws(() => serializeJson(value), TypeError);
  }
});

test("native backend direct dispatch, exact MIME/origin/method/credentials and unmarked local interception", async () => {
  const scope = await createRequestScope(application, request);
  let fallbackCalls = 0;
  const parent = createEnvironmentInjector([]);
  const injector = createEnvironmentInjector(
    [
      { provide: REQUEST_CONTEXT, useValue: scope },
      { provide: REQUEST, useValue: scope.request },
      {
        provide: FetchBackend,
        useValue: {
          handle: () => {
            fallbackCalls += 1;

            return new Observable((sub) => {
              sub.next(new HttpResponse({ body: "external" }));
              sub.complete();
            });
          },
        },
      },
      provideLaunchServer(
        registry({ read: query({ handler: ({ context }) => context.user }) }),
        application,
      ),
    ],
    parent,
  );
  const backend = injector.get(HttpBackend);
  const valid = new HttpRequest("POST", path, { input: null });

  assert.equal((await firstValueFrom(backend.handle(valid))).body, "alice");
  assert.equal(fallbackCalls, 0);

  for (const changed of [
    valid.clone({
      url: "http://elsewhere.test" + path,
      context: new HttpContext().set(RPC_CALL, true),
    }),
    valid.clone({ method: "GET" }),
    valid.clone({ setHeaders: { "content-type": "application/json-fake" } }),
    valid.clone({ setHeaders: { authorization: "Bearer x" } }),
    valid.clone({ setHeaders: { cookie: "bob" } }),
    valid.clone({ withCredentials: true }),
    valid.clone({ credentials: "include" }),
    valid.clone({ credentials: "same-origin" }),
    valid.clone({ credentials: "omit" }),
    valid.clone({ url: path + "?input=x" }),
    valid.clone({ params: new HttpParams().set("extra", "1") }),
    valid.clone({ setParams: { extra: "1" }, context: new HttpContext().set(RPC_CALL, true) }),
    valid.clone({ body: "bad JSON" }),
    valid.clone({ url: "/ordinary", context: new HttpContext().set(RPC_CALL, true) }),
  ]) {
    await assert.rejects(
      firstValueFrom(backend.handle(changed)),
      (error) => error instanceof HttpErrorResponse && error.status === 400,
    );
  }

  assert.equal(fallbackCalls, 0);
  assert.equal(
    (await firstValueFrom(backend.handle(new HttpRequest("GET", "/ordinary")))).body,
    "external",
  );
  assert.equal(fallbackCalls, 1);

  for (const contentType of ["application/json-fake", "text/plain", ""]) {
    const response = await handleRpc(
      registry({ read: query({ handler: () => 1 }) }),
      application,
      new Request(`http://test${path}`, {
        method: "POST",
        headers: { "content-type": contentType },
        body: '{"input":null}',
      }),
    );

    assert.equal(response.status, 400);
  }

  assert.equal(
    (
      await firstValueFrom(
        backend.handle(
          valid.clone({ setHeaders: { "content-type": "Application/JSON; charset=utf-8" } }),
        ),
      )
    ).body,
    "alice",
  );
  injector.destroy();
  parent.destroy();
});

test("constructor/toString namespaces and own procedures work through native HttpClient and shared dispatch", async () => {
  const scope = await createRequestScope(application, request);

  for (const namespace of ["constructor", "toString"]) {
    const routes = {
      [namespace]: defineRpc(namespace, {
        constructor: query({ handler: () => `${namespace}.constructor` }),
        toString: query({ handler: () => `${namespace}.toString` }),
      }),
    };
    const http = new HttpClient({
      handle: (request) =>
        new Observable((subscriber) => {
          void dispatch(routes, request.url, request.body, scope, application, scope.request).then(
            (reply) => {
              if (reply.status >= 400) {
                subscriber.error(
                  new HttpErrorResponse({
                    status: reply.status,
                    error: reply.body,
                    url: request.urlWithParams,
                  }),
                );

                return;
              }

              subscriber.next(
                new HttpResponse({
                  status: reply.status,
                  body: reply.body,
                  url: request.urlWithParams,
                }),
              );
              subscriber.complete();
            },
          );
        }),
    });
    const parent = createEnvironmentInjector([]);
    const injector = createEnvironmentInjector([{ provide: HttpClient, useValue: http }], parent);

    try {
      const client = runInInjectionContext(injector, () =>
        injectClient({
          [namespace]: {
            methods: [
              { name: "constructor", input: false, kind: "query", errors: [] },
              { name: "toString", input: false, kind: "query", errors: [] },
            ],
          },
        }),
      );

      assert.equal(Object.getPrototypeOf(client), null);
      assert.equal(Object.hasOwn(client, namespace), true);
      assert.equal(Object.getPrototypeOf(client[namespace]), null);

      for (const method of ["constructor", "toString"]) {
        assert.equal(Object.hasOwn(routes[namespace].procedures, method), true);
        assert.equal(Object.hasOwn(client[namespace], method), true);
        assert.equal(client[namespace][method].kind, "query");
        assert.equal(await client[namespace][method](), `${namespace}.${method}`);
      }
    } finally {
      injector.destroy();
      parent.destroy();
    }
  }
});

test("recognized framework frames vs network errors; HttpClient cancellation unsubscribes, including synchronous transfer responses", async () => {
  let unsubscribed = 0;
  const parent = createEnvironmentInjector([]);
  const injector = createEnvironmentInjector(
    [
      {
        provide: HttpClient,
        useValue: new HttpClient({
          handle: () =>
            new Observable(() => () => {
              unsubscribed += 1;
            }),
        }),
      },
    ],
    parent,
  );
  const client = runInInjectionContext(injector, () =>
    injectClient({
      test: { methods: [{ name: "read", input: false, kind: "query", errors: [] }] },
    }),
  );
  const controller = new AbortController();
  const pending = client.test.read({ signal: controller.signal });

  controller.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError");
  assert.equal(unsubscribed, 1);

  const preAborted = new AbortController();

  preAborted.abort();
  await assert.rejects(
    client.test.read({ signal: preAborted.signal }),
    (error) => error.name === "AbortError",
  );
  assert.equal(unsubscribed, 1);
  assert.equal(client.test.read.kind, "query");

  for (const [code, frame] of Object.entries(frameworkFailures)) {
    assert.equal(
      recognizedFailure({ error: { code, message: frame.message, data: null } }, frame.status),
      code,
    );
    assert.equal(
      recognizedFailure({ error: { code, message: "spoof", data: null } }, frame.status),
      undefined,
    );
    assert.equal(
      recognizedFailure(
        { error: { code, message: frame.message, data: { secret: true } } },
        frame.status,
      ),
      undefined,
    );
    assert.equal(
      recognizedFailure({ error: { code, message: frame.message, data: null } }, 0),
      undefined,
    );
    assert.equal(client.test.read.isError(new RpcError(code, frame.status)), false);
  }

  assert.equal(client.test.read.isError(new Error("network")), false);
  injector.destroy();
  parent.destroy();

  for (const mode of ["sync", "framework", "network"]) {
    const upstream = new HttpClient({
      handle: () =>
        new Observable((sub) => {
          if (mode === "sync") {
            sub.next(new HttpResponse({ body: 7 }));
            sub.complete();
          }

          if (mode === "framework") {
            sub.error(
              new HttpErrorResponse({
                status: 403,
                error: { error: { code: "FORBIDDEN", message: "RPC forbidden", data: null } },
              }),
            );
          }

          if (mode === "network") {
            sub.error(new HttpErrorResponse({ status: 0, error: new Error("offline") }));
          }
        }),
    });
    const parent = createEnvironmentInjector([]);
    const injector = createEnvironmentInjector(
      [{ provide: HttpClient, useValue: upstream }],
      parent,
    );
    const client = runInInjectionContext(injector, () =>
      injectClient({
        test: { methods: [{ name: "read", input: false, kind: "query", errors: [] }] },
      }),
    );

    if (mode === "sync") {
      assert.equal(await client.test.read(), 7);
    }

    if (mode === "framework") {
      await assert.rejects(
        client.test.read(),
        (error) =>
          client.test.read.isError(error) &&
          error instanceof RpcError &&
          error.code === "FORBIDDEN",
      );
    }

    if (mode === "network") {
      await assert.rejects(
        client.test.read(),
        (error) => error instanceof HttpErrorResponse && error.status === 0,
      );
    }

    injector.destroy();
    parent.destroy();
  }
});
