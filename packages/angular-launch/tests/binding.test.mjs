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
  finishLaunchRendering,
  forbidden,
  middleware,
  notFound,
  redirect,
} from "../dist/server/index.js";
import {
  bindApplication,
  createRequestScope,
  handleRpc,
  provideLaunchServer,
  runProcedure,
} from "../dist/server/generated.js";
import { RPC_CALL } from "../dist/remote-client.js";
import { defineRoute } from "../dist/index.js";
import { application as bind } from "./fixtures/application.mjs";

const require = createRequire(
  new URL("../../../examples/angular-launch/package.json", import.meta.url),
);
const { sanitizeRequestHeaders } = await import(
  new URL("./_validation-chunk.mjs", `file://${require.resolve("@angular/ssr")}`)
);
const id = "test";
const path = `/_rpc/${id}/read`;

const prerenderedPage = "http://localhost:4200/about";

function backend(application, scope, nativeRequest, fallback) {
  const parent = createEnvironmentInjector([]);
  const injector = createEnvironmentInjector(
    [
      { provide: REQUEST_CONTEXT, useValue: scope },
      { provide: REQUEST, useValue: nativeRequest },
      { provide: DOCUMENT, useValue: { location: { href: prerenderedPage } } },
      { provide: FetchBackend, useValue: { handle: fallback } },
      provideLaunchServer(application),
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
    components: [{}],
    destroyed: false,
    whenStable: async () => {},
    destroy: () => {
      app.destroyed = true;
    },
  };

  return app;
}

// `stage` replaces the counting root stage.
function prerenderFixture(stage) {
  const seen = { factories: 0, middlewareRuns: 0, handlers: 0 };
  const counting = ({ request }) => {
    seen.factories += 1;

    return { number: seen.factories, request };
  };
  const counted = middleware(async ({ next }) => {
    seen.middlewareRuns += 1;

    return next();
  });
  const application = bind("prerendering", {
    context: stage ?? counting,
    namespaces: {
      test: {
        use: [counted],
        build: ({ query, mutation }) => ({
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
      },
    },
  });

  return { seen, application };
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
  const { seen, application } = prerenderFixture();
  const forwarded = [];
  const response = new HttpResponse({ status: 206, body: "ordinary external service" });
  const fallback = (request) => {
    forwarded.push(request);

    return of(response);
  };
  const rendering = backend(application, null, null, fallback);
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

test("prerendering fails the render for a call that doesn't answer 200 or sets a cookie", async () => {
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
    const { application } = prerenderFixture();
    const rendering = backend(application, null, null, () => {
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
});

// root → +authenticated (pathless) → todos, each with a stage. +authenticated declares
// `session`, todos declares `todos`. `failing` makes a stage throw (`sync`) or reject.
function provenanceFixture(failing = {}) {
  const runs = { root: 0, auth: 0, own: 0 };

  function stage(name, value) {
    return (args) => {
      runs[name] += 1;

      const failure = failing[name];

      if (failure?.sync) {
        throw failure.error;
      }

      if (failure) {
        return Promise.reject(failure.error);
      }

      return value(args);
    };
  }

  const root = defineRoute("", {}).context(stage("root", () => ({ user: "alice" })));
  const auth = defineRoute("", { parent: root })
    .context(stage("auth", ({ context }) => ({ ...context, user: context.user.toUpperCase() })))
    .remote(({ query }) => ({
      session: { current: query({ handler: ({ context }) => context.user }) },
    }));
  const own = defineRoute("todos", { parent: auth })
    .context(stage("own", ({ context }) => ({ ...context, list: ["milk"] })))
    .remote(({ query }) => ({
      todos: { list: query({ handler: ({ context }) => context.list }) },
    }));
  const application = bindApplication("provenance", [
    [root, "src/routes/route.ts"],
    [auth, "src/routes/+authenticated/route.ts"],
    [own, "src/routes/+authenticated/todos/route.ts"],
  ]);

  return { runs, application };
}

function quietly(run) {
  const previous = console.error;

  console.error = () => {};

  return run().finally(() => {
    console.error = previous;
  });
}

function procedureCall(application, scope, procedure) {
  return runProcedure(`/_rpc/${procedure}`, { input: null }, scope, application, scope.request);
}

test("a failing stage is reported with its own route, sync or async, at the root, in between or last", async () => {
  for (const [name, route, sync] of [
    ["root", "src/routes/route.ts", true],
    ["auth", "src/routes/+authenticated/route.ts", false],
    ["own", "src/routes/+authenticated/todos/route.ts", false],
  ]) {
    const thrown = new Error(`${name} unreachable`);
    const { application } = provenanceFixture({ [name]: { error: thrown, sync } });
    const scope = createRequestScope(application, new Request("http://localhost/todos"));
    const reply = await quietly(() => procedureCall(application, scope, "todos/list"));

    assert.equal(reply.status, 500, name);
    assert.deepEqual(reply.body, {
      error: { code: "INTERNAL", message: "Internal server error", data: null },
    });
    assert.equal(reply.failedStage.route, route, name);
    assert.equal(reply.failedStage.error, thrown, name);
  }
});

test("a memoized stage failure keeps naming its stage for every later chain that reuses it", async () => {
  const thrown = new Error("auth unreachable");
  const { runs, application } = provenanceFixture({ auth: { error: thrown } });
  const scope = createRequestScope(application, new Request("http://localhost/todos"));

  await quietly(async () => {
    const first = await procedureCall(application, scope, "todos/list");
    const other = await procedureCall(application, scope, "session/current");
    const again = await procedureCall(application, scope, "todos/list");

    for (const reply of [first, other, again]) {
      assert.equal(reply.status, 500);
      assert.equal(reply.failedStage.route, "src/routes/+authenticated/route.ts");
      assert.equal(reply.failedStage.error, thrown);
    }
  });

  assert.deepEqual(runs, { root: 1, auth: 1, own: 0 });
});

test("a stage's outcome answers as it would from middleware, without a failed stage", async () => {
  for (const [outcome, status, body] of [
    [() => redirect("/sign-in"), 303, { redirect: { to: "/sign-in" } }],
    [() => notFound(), 404, { notFound: null }],
    [
      () => forbidden(),
      403,
      { error: { code: "FORBIDDEN", message: "RPC forbidden", data: null } },
    ],
  ]) {
    const { application } = provenanceFixture({ auth: { error: outcome(), sync: true } });
    const scope = createRequestScope(application, new Request("http://localhost/todos"));
    const reply = await procedureCall(application, scope, "todos/list");

    assert.equal(reply.status, status);
    assert.deepEqual(reply.body, body);
    assert.equal(reply.failedStage, undefined);
  }
});

test("a failing stage's route and error stay off the wire", async () => {
  const { application } = provenanceFixture({ auth: { error: new Error("secret detail") } });
  const response = await quietly(() =>
    handleRpc(
      application,
      new Request("http://localhost/_rpc/todos/list", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: '{"input":null}',
      }),
      { allowedHosts: ["localhost"] },
    ),
  );
  const text = await response.text();

  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(text), {
    error: { code: "INTERNAL", message: "Internal server error", data: null },
  });
  assert.doesNotMatch(text, /secret|authenticated/);
});

test("prerendering fails with the failing stage's route, and its error as the cause", async () => {
  const thrown = new Error("database unreachable");
  const { application } = provenanceFixture({ auth: { error: thrown } });
  const rendering = backend(application, null, null, () => {
    throw new Error("Unexpected fallback");
  });
  const app = renderedApp(rendering);

  try {
    await quietly(() =>
      assert.rejects(
        call(rendering, "/_rpc/todos/list"),
        (error) => error instanceof HttpErrorResponse && error.status === 500,
      ),
    );
    await assert.rejects(finishLaunchRendering(app), (error) => {
      assert.equal(
        error.message,
        "Launch can't prerender this page: the context stage of src/routes/+authenticated/route.ts threw",
      );
      assert.equal(error.cause, thrown);

      return true;
    });
  } finally {
    rendering.destroy();
  }
});

// Angular checks nothing after bootstrap returns: BEFORE_APP_SERIALIZED callbacks run later,
// and their errors only reach the ErrorHandler.
test("native prerendering fails for calls before the page is first stable, not ones made while it's serialized", async () => {
  const { bootstrapApplication } = await import(require.resolve("@angular/platform-browser"));
  const { renderApplication, provideServerRendering, BEFORE_APP_SERIALIZED } = await import(
    require.resolve("@angular/platform-server")
  );
  const { Component, inject } = await import(require.resolve("@angular/core"));
  const { HttpClient, provideHttpClient } = await import(require.resolve("@angular/common/http"));
  const { provideRouter, RouterOutlet } = await import(require.resolve("@angular/router"));

  class Page {}

  Component({ selector: "prerendered-page", template: "prerendered" })(Page);

  class Root {}

  Component({ selector: "prerender-root", imports: [RouterOutlet], template: "<router-outlet />" })(
    Root,
  );

  function post(url) {
    return firstValueFrom(inject(HttpClient).post(url, { input: null }));
  }

  function prerender(resolved, serialized) {
    const { application } = prerenderFixture();

    return renderApplication(
      async (context) => {
        const app = await bootstrapApplication(
          Root,
          {
            providers: [
              provideServerRendering(),
              provideHttpClient(),
              provideLaunchServer(application),
              provideRouter([
                { path: "about", component: Page, resolve: { result: () => post(resolved) } },
              ]),
              {
                provide: BEFORE_APP_SERIALIZED,
                multi: true,
                useFactory: () => {
                  const http = inject(HttpClient);

                  return async () => {
                    if (serialized) {
                      serialized.result = await firstValueFrom(
                        http.post(serialized.url, { input: null }),
                      );
                    }
                  };
                },
              },
            ],
          },
          context,
        );

        return finishLaunchRendering(app);
      },
      {
        document: "<prerender-root></prerender-root>",
        url: prerenderedPage,
        allowedHosts: ["localhost"],
      },
    );
  }

  await assert.rejects(prerender("/_rpc/test/refuse"), /\/_rpc\/test\/refuse answered 403/);
  await assert.rejects(prerender("/_rpc/test/remember"), /\/_rpc\/test\/remember set a cookie/);

  const serialized = { url: "/_rpc/test/remember" };
  const html = await prerender(path, serialized);

  assert.match(html, /prerendered/);
  assert.equal(serialized.result, null);
});

// Route discovery boots without the root component and releases a blocking initial navigation
// only after the bootstrap returns, then waits for stability itself.
test("native route discovery with blocking initial navigation completes, running a root resolver's call anonymously and only logging its refusal", async () => {
  const { bootstrapApplication } = await import(require.resolve("@angular/platform-browser"));
  const { provideServerRendering } = await import(require.resolve("@angular/platform-server"));
  const { ɵgetRoutesFromAngularRouterConfig: discoverRoutes } = await import(
    require.resolve("@angular/ssr")
  );
  const { Component, inject } = await import(require.resolve("@angular/core"));
  const { HttpClient, provideHttpClient } = await import(require.resolve("@angular/common/http"));
  const { provideRouter, RouterOutlet, withEnabledBlockingInitialNavigation } = await import(
    require.resolve("@angular/router")
  );

  class Page {}

  Component({ selector: "discovered-page", template: "discovered" })(Page);

  class Root {}

  Component({ selector: "discovery-root", imports: [RouterOutlet], template: "<router-outlet />" })(
    Root,
  );

  async function discover(resolved) {
    const { seen, application } = prerenderFixture();
    const results = [];
    const root = { path: "", children: [{ path: "about", component: Page }] };

    if (resolved) {
      root.resolve = {
        result: async () => {
          const result = await firstValueFrom(inject(HttpClient).post(resolved, { input: null }));

          results.push(result);

          return result;
        },
      };
    }

    const logged = [];
    const previousError = console.error;

    console.error = (...args) => logged.push(args);

    try {
      const discovery = discoverRoutes(
        async (context) => {
          const app = await bootstrapApplication(
            Root,
            {
              providers: [
                provideServerRendering(),
                provideHttpClient(),
                provideLaunchServer(application),
                provideRouter([root], withEnabledBlockingInitialNavigation()),
              ],
            },
            context,
          );

          return finishLaunchRendering(app);
        },
        "<discovery-root></discovery-root>",
        new URL("http://localhost/"),
      );
      let timer;
      const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Route discovery didn't finish")), 5000);
      });

      try {
        const { routes, errors } = await Promise.race([discovery, timeout]);

        return { routes: routes.map((route) => route.route), errors, results, seen, logged };
      } finally {
        clearTimeout(timer);
      }
    } finally {
      console.error = previousError;
    }
  }

  const unresolved = await discover(null);

  assert.deepEqual(unresolved.routes, ["/", "/about"]);
  assert.deepEqual(unresolved.errors, []);
  assert.equal(unresolved.seen.factories, 0);

  const resolved = await discover(path);

  assert.deepEqual(resolved.routes, ["/", "/about"]);
  assert.deepEqual(resolved.errors, []);
  assert.deepEqual(resolved.results, [
    { context: 1, sameRequest: true, method: "GET", url: "http://localhost/", cookie: null },
  ]);
  assert.equal(resolved.seen.handlers, 1);

  const refused = await discover("/_rpc/test/refuse");

  assert.deepEqual(refused.routes, ["/", "/about"]);
  assert.deepEqual(refused.errors, []);
  assert.deepEqual(refused.results, []);
  assert.ok(
    refused.logged.some((args) =>
      args.some((value) => value instanceof HttpErrorResponse && value.status === 403),
    ),
    "Angular logs the refusal",
  );
});

test("a prerendering call's signal aborts when the render's application is destroyed", async () => {
  const { application } = prerenderFixture();
  const rendering = backend(application, null, null, () => {
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
  const context = ({ request }) => {
    factories += 1;

    return { user: request.headers.get("cookie") };
  };
  const app = bind("app-a-context-v1", {
    context,
    namespaces: {
      test: {
        use: [
          middleware(async ({ request, next }) => {
            calls.push("middleware");
            assert.equal(request, native);

            return next();
          }),
        ],
        build: ({ query }) => ({
          read: query({
            handler: ({ context }) => {
              calls.push("handler");

              return context.user;
            },
          }),
        }),
      },
    },
  });
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
  const scope = createRequestScope(app, incoming);

  assert.equal(factories, 0, "creating a scope runs no stage");
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

  let fallbackCalls = 0;
  const fallback = () => {
    fallbackCalls += 1;

    throw new Error("RPC must not fall back");
  };
  const valid = backend(app, scope, native, fallback);

  assert.equal(
    (await firstValueFrom(valid.value.handle(new HttpRequest("POST", path, { input: null })))).body,
    "alice",
  );
  valid.destroy();
  assert.deepEqual(calls, ["middleware", "handler"]);
  assert.equal(factories, 1, "the call ran the stage, and backend never creates another scope");
  controller.abort();
  assert.equal(scope.request.signal.aborted, true);
  assert.equal(native.signal.aborted, true);

  const bob = createRequestScope(app, new Request(incoming.url, { headers: { cookie: "bob" } }));
  const otherApp = bind("app-b-context-v1", { context: () => ({ user: "other-app" }) });
  const other = createRequestScope(otherApp, new Request(incoming.url));
  const previousError = console.error;
  const logs = [];

  console.error = (...args) => logs.push(args);

  try {
    for (const [candidate, nativeRequest] of [
      [scope, bob.request],
      [scope, incoming],
      [other, other.request],
    ]) {
      const mismatch = backend(app, candidate, nativeRequest, fallback);

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
      (await runProcedure(path, { input: null }, other, app, other.request)).status,
      500,
    );
  } finally {
    console.error = previousError;
  }

  assert.deepEqual(calls, ["middleware", "handler"]);
  assert.equal(fallbackCalls, 0);
  assert.equal(logs.length, 7);
});

// Angular bundles the server entry, which creates scopes and answers RPCs, apart from the
// server application, which renders: each bundle binds its own copy of the same app.
test("a rendering call runs the stage and handler of the copy that created its scope, not the rendering copy's", async () => {
  const ran = [];

  function copy(name) {
    return bind("one-app-two-bundles", {
      context: () => {
        ran.push(`${name} stage`);

        return { copy: name };
      },
      namespaces: {
        test: {
          build: ({ query }) => ({
            read: query({
              handler: ({ context }) => {
                ran.push(`${name} handler`);

                return context.copy;
              },
            }),
          }),
        },
      },
    });
  }

  const entry = copy("entry");
  const rendering = copy("rendering");
  const scope = createRequestScope(entry, new Request("http://127.0.0.1/todos"));
  const page = backend(rendering, scope, scope.request, () => {
    throw new Error("RPC must not fall back");
  });
  const reply = await firstValueFrom(
    page.value.handle(new HttpRequest("POST", path, { input: null })),
  );

  page.destroy();
  assert.equal(reply.body, "entry");
  assert.deepEqual(ran, ["entry stage", "entry handler"]);
});

test("binding clone preserves original body and signal, and an HTTP request runs its stage once", async () => {
  let factories = 0;
  const app = bind("body-app", {
    context: async ({ request }) => {
      factories += 1;

      const body = await request.clone().text();

      return { body };
    },
    namespaces: {
      test: { build: ({ query }) => ({ read: query({ handler: ({ context }) => context.body }) }) },
    },
  });
  const controller = new AbortController();
  const request = new Request("http://127.0.0.1/input", {
    method: "POST",
    body: '{"input":"one"}',
    signal: controller.signal,
  });
  const scope = createRequestScope(app, request);
  const staged = await runProcedure(path, { input: null }, scope, app, scope.request);

  assert.equal(request.bodyUsed, false);
  assert.equal(scope.request.bodyUsed, false);
  assert.equal(staged.body, '{"input":"one"}');
  assert.equal(await request.text(), '{"input":"one"}');
  assert.equal(await scope.request.text(), staged.body);
  controller.abort();
  assert.equal(scope.request.signal.aborted, true);
  assert.equal(factories, 1);

  const reply = await handleRpc(
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
  assert.equal(factories, 2, "exactly one more stage run for the HTTP request");
});

test("native params/setParams marked/unmarked targets use effective URLs and match real HTTP rejection without fallback", async () => {
  let factories = 0;
  let middlewareRuns = 0;
  let handlers = 0;
  let fallbackCalls = 0;
  const app = bind("params-app", {
    context: () => {
      factories += 1;

      return {};
    },
    namespaces: {
      test: {
        use: [
          middleware(async ({ next }) => {
            middlewareRuns += 1;

            return next();
          }),
        ],
        build: ({ query }) => ({
          read: query({
            handler: () => {
              handlers += 1;

              return "ok";
            },
          }),
        }),
      },
    },
  });
  const scope = createRequestScope(app, new Request("http://127.0.0.1/todos"));
  const direct = backend(app, scope, scope.request, () => {
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

  assert.equal(factories, 0);
  assert.equal(middlewareRuns, 0);
  assert.equal(handlers, 0);
  assert.equal(fallbackCalls, 0);
  direct.destroy();

  const absent = backend(app, null, null, () => {
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
  // The refusal comes before any stage runs.
  assert.equal(factories, 0);
  absent.destroy();
});
