import "@angular/compiler";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { test } from "node:test";
import {
  createEnvironmentInjector,
  PLATFORM_ID,
  REQUEST,
  REQUEST_CONTEXT,
  RESPONSE_INIT,
  runInInjectionContext,
} from "@angular/core";
import {
  FetchBackend,
  HttpBackend,
  HttpClient,
  HttpErrorResponse,
  HttpRequest,
} from "@angular/common/http";
import { firstValueFrom, Observable } from "rxjs";
import { QueryClient } from "@tanstack/angular-query";
import { defineContext, defineRpc, middleware, notFound, redirect } from "../dist/server/index.js";
import { createRequestScope, handleRpc, provideLaunchServer } from "../dist/server/generated.js";
import { injectClient } from "../dist/generated.js";
import { RpcNotFound, RpcRedirect, rpcNavigationErrors } from "../dist/index.js";
import { createQueries } from "../dist/tanstack-query/generated.js";
import { provideLaunchQueries } from "../dist/tanstack-query/index.js";

const application = {
  id: "launch-outcomes-test-app",
  context: defineContext((request) => ({ user: request.headers.get("cookie") })),
};
const idSchema = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value) => {
      if (typeof value !== "string") {
        return { issues: [{ message: "Expected an id" }] };
      }

      return { value };
    },
  },
};
const signedIn = middleware(async ({ context, next }) => {
  if (context.user === null) {
    throw redirect("/sign-in?next=%2Ftodos");
  }

  return next();
});
const order = [];
// Wrapping middleware sees the outcome as next()'s rejection and rethrows it.
const logging = middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    order.push(`threw ${error.message}`);

    throw error;
  }
});
const registry = {
  todos: defineRpc(
    "todos",
    ({ query, stream }) => ({
      get: query({
        input: idSchema,
        use: [logging],
        handler: ({ input }) => {
          if (input === "missing") {
            throw notFound();
          }

          if (input === "moved") {
            throw redirect("/todos/2#title");
          }

          return { id: input };
        },
      }),
      lookalike: query({ handler: () => ({ redirect: { to: "/elsewhere" } }) }),
      lookalikeMissing: query({ handler: () => ({ notFound: null }) }),
      watch: stream({
        input: idSchema,
        handler: async function* ({ input }) {
          yield { id: input };

          if (input === "missing") {
            throw notFound();
          }

          throw redirect("/todos");
        },
      }),
    }),
    { use: [signedIn] },
  ),
};
const methods = [
  { name: "get", input: true, kind: "query", errors: [] },
  { name: "lookalike", input: false, kind: "query", errors: [] },
  { name: "lookalikeMissing", input: false, kind: "query", errors: [] },
  { name: "watch", input: true, kind: "stream", errors: [] },
];

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

function handle(request) {
  return handleRpc(registry, application, request, { allowedHosts: ["test"] });
}

test("redirect() takes only root-relative URLs, and outcomes never reach JSON", () => {
  for (const to of ["/", "/sign-in?next=%2Ftodos", "/todos/2#title", "/a//b"]) {
    assert.equal(JSON.stringify(redirect(to)), "{}");
  }

  for (const to of [
    "https://example.com/",
    "//example.com/",
    "/\\example.com/",
    "/\t/example.com/",
    "/\n/example.com/",
    "sign-in",
    "",
    42,
  ]) {
    assert.throws(() => redirect(to), TypeError, JSON.stringify(to));
  }

  assert.equal(JSON.stringify(notFound()), "{}");
});

test("outcomes become 303 and 404 frames over HTTP, from middleware before validation or the handler", async () => {
  order.length = 0;

  const missing = await handle(post("/_rpc/todos/get", "missing"));

  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("content-type"), "application/json");
  assert.deepEqual(await missing.json(), { notFound: null });

  const moved = await handle(post("/_rpc/todos/get", "moved"));

  assert.equal(moved.status, 303);
  assert.equal(moved.headers.get("location"), null);
  assert.deepEqual(await moved.json(), { redirect: { to: "/todos/2#title" } });
  assert.deepEqual(order, ["threw RPC not found outcome", "threw RPC redirect outcome"]);

  // Group middleware runs before validation, so invalid input still gets its redirect.
  const signedOut = await handle(post("/_rpc/todos/get", 7, { cookie: null }));

  assert.equal(signedOut.status, 303);
  assert.deepEqual(await signedOut.json(), { redirect: { to: "/sign-in?next=%2Ftodos" } });

  // Only 200 is a result: data shaped like a frame stays data.
  const lookalike = await handle(post("/_rpc/todos/lookalike", null));

  assert.equal(lookalike.status, 200);
  assert.deepEqual(await lookalike.json(), { redirect: { to: "/elsewhere" } });
});

function serverInjector(cookie = "alice") {
  return createRequestScope(
    application,
    new Request("http://test/todos/1", cookie === null ? {} : { headers: { cookie } }),
  ).then((scope) => {
    const parent = createEnvironmentInjector([]);
    const injector = createEnvironmentInjector(
      [
        { provide: REQUEST_CONTEXT, useValue: scope },
        { provide: REQUEST, useValue: scope.request },
        { provide: PLATFORM_ID, useValue: "server" },
        { provide: FetchBackend, useValue: { handle: () => assert.fail("left the server") } },
        { provide: HttpClient, useFactory: () => new HttpClient(injectBackend()) },
        provideLaunchServer(registry, application),
      ],
      parent,
    );

    function injectBackend() {
      return injector.get(HttpBackend);
    }

    return {
      injector,
      destroy() {
        injector.destroy();
        parent.destroy();
      },
    };
  });
}

test("during server rendering, outcomes are error responses and generated calls reject with them", async () => {
  const { injector, destroy } = await serverInjector();

  try {
    const backend = injector.get(HttpBackend);

    // The prototype's trap: a 303 under 400 must not arrive as a successful response.
    await assert.rejects(
      firstValueFrom(
        backend.handle(new HttpRequest("POST", "/_rpc/todos/get", { input: "moved" })),
      ),
      (error) =>
        error instanceof HttpErrorResponse &&
        error.status === 303 &&
        error.error.redirect.to === "/todos/2#title",
    );

    const rpc = runInInjectionContext(injector, () => injectClient({ todos: { methods } }));

    await assert.rejects(rpc.todos.get("missing"), (error) => {
      assert.ok(error instanceof RpcNotFound);
      assert.equal(rpc.todos.get.isError(error), false);

      return true;
    });
    await assert.rejects(
      rpc.todos.get("moved"),
      (error) => error instanceof RpcRedirect && error.to === "/todos/2#title",
    );
    assert.deepEqual(await rpc.todos.get("1"), { id: "1" });
    assert.deepEqual(await rpc.todos.lookalike(), { redirect: { to: "/elsewhere" } });
    assert.deepEqual(await rpc.todos.lookalikeMissing(), { notFound: null });
  } finally {
    destroy();
  }
});

test("the client recognizes only exact outcome frames with their own status", async () => {
  const responses = [];
  const parent = createEnvironmentInjector([]);
  const injector = createEnvironmentInjector(
    [
      {
        provide: HttpClient,
        useValue: new HttpClient({
          handle: () =>
            new Observable((subscriber) => {
              subscriber.error(new HttpErrorResponse(responses.shift()));
            }),
        }),
      },
      { provide: PLATFORM_ID, useValue: "browser" },
    ],
    parent,
  );
  const rpc = runInInjectionContext(injector, () => injectClient({ todos: { methods } }));
  const unrecognized = [
    { status: 404, error: { redirect: { to: "/a" } } },
    { status: 303, error: { notFound: null } },
    { status: 303, error: { redirect: { to: "/a" }, extra: 1 } },
    { status: 303, error: { redirect: { to: "/a", extra: 1 } } },
    { status: 303, error: { redirect: { to: "//evil.example/" } } },
    { status: 303, error: { redirect: { to: "/\\evil.example/" } } },
    { status: 303, error: { redirect: { to: "https://evil.example/" } } },
    { status: 404, error: { notFound: false } },
    { status: 404, error: [null] },
  ];

  try {
    responses.push({ status: 303, error: { redirect: { to: "/sign-in" } } });
    await assert.rejects(
      rpc.todos.get("1"),
      (error) => error instanceof RpcRedirect && error.to === "/sign-in",
    );
    responses.push({ status: 404, error: { notFound: null } });
    await assert.rejects(rpc.todos.get("1"), RpcNotFound);

    for (const response of unrecognized) {
      responses.push(response);
      await assert.rejects(
        rpc.todos.get("1"),
        (error) => error instanceof HttpErrorResponse && error.status === response.status,
        JSON.stringify(response),
      );
    }
  } finally {
    injector.destroy();
    parent.destroy();
  }
});

async function serve() {
  const server = createServer(async (incoming, outgoing) => {
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
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const base = `http://127.0.0.1:${server.address().port}`;
  const realFetch = globalThis.fetch;
  let cookie = "alice";

  // Real fetch over real HTTP, so a 303 without Location is what fetch actually returns.
  globalThis.fetch = (url, init) => {
    const headers = { ...Object.fromEntries(new Headers(init.headers)), origin: base };

    if (cookie !== null) {
      headers.cookie = cookie;
    }

    return realFetch(new URL(url, base), { ...init, headers });
  };

  return {
    signOut() {
      cookie = null;
    },
    close() {
      globalThis.fetch = realFetch;
      server.closeAllConnections();
      server.close();
    },
  };
}

test("streams carry outcomes as a response before they start and as an error event after", async () => {
  const errorEvents = [];

  for (const input of ["missing", "moved"]) {
    const response = await handle(post("/_rpc/todos/watch", input));
    const text = await response.text();

    errorEvents.push(text.split("\n\n")[1]);
  }

  assert.deepEqual(errorEvents, [
    'event: error\ndata: {"status":404,"notFound":null}',
    'event: error\ndata: {"status":303,"redirect":{"to":"/todos"}}',
  ]);

  const server = await serve();
  const parent = createEnvironmentInjector([]);
  const injector = createEnvironmentInjector(
    [
      { provide: HttpClient, useValue: {} },
      { provide: PLATFORM_ID, useValue: "browser" },
    ],
    parent,
  );
  const rpc = runInInjectionContext(injector, () => injectClient({ todos: { methods } }));

  async function collect(iterable) {
    const values = [];

    try {
      for await (const value of iterable) {
        values.push(value);
      }
    } catch (error) {
      return { values, error };
    }

    return { values, error: undefined };
  }

  try {
    const missing = await collect(rpc.todos.watch("missing"));

    assert.deepEqual(missing.values, [{ id: "missing" }]);
    assert.ok(missing.error instanceof RpcNotFound);

    const moved = await collect(rpc.todos.watch("moved"));

    assert.deepEqual(moved.values, [{ id: "moved" }]);
    assert.ok(moved.error instanceof RpcRedirect);
    assert.equal(moved.error.to, "/todos");

    server.signOut();

    const refused = await collect(rpc.todos.watch("1"));

    assert.deepEqual(refused.values, []);
    assert.ok(refused.error instanceof RpcRedirect);
    assert.equal(refused.error.to, "/sign-in?next=%2Ftodos");
  } finally {
    injector.destroy();
    parent.destroy();
    server.close();
  }
});

test("TanStack queries don't retry redirects or not-found outcomes", () => {
  const parent = createEnvironmentInjector([]);
  const injector = createEnvironmentInjector(
    [
      { provide: PLATFORM_ID, useValue: "browser" },
      { provide: QueryClient, useValue: new QueryClient() },
      provideLaunchQueries(),
    ],
    parent,
  );
  const queries = runInInjectionContext(injector, () =>
    createQueries(
      { todos: { list: () => Promise.resolve([]) } },
      { todos: { list: { kind: "query", input: false } } },
    ),
  );
  const { retry } = queries.todos.list.queryOptions();

  assert.equal(retry(0, new RpcRedirect("/sign-in")), false);
  assert.equal(retry(0, new RpcNotFound()), false);
  assert.equal(retry(0, new Error("network")), true);
  injector.destroy();
  parent.destroy();
});

async function render(url, cookie = "alice") {
  const require = createRequire(
    new URL("../../../examples/angular-launch/package.json", import.meta.url),
  );
  const { bootstrapApplication } = await import(require.resolve("@angular/platform-browser"));
  const { renderApplication, provideServerRendering } = await import(
    require.resolve("@angular/platform-server")
  );
  const { Component } = await import(require.resolve("@angular/core"));
  const { Location } = await import(require.resolve("@angular/common"));
  const { provideHttpClient } = await import(require.resolve("@angular/common/http"));
  const { provideRouter, RouterOutlet, withNavigationErrorHandler } = await import(
    require.resolve("@angular/router")
  );
  const scope = await createRequestScope(
    application,
    new Request(`http://test${url}`, cookie === null ? {} : { headers: { cookie } }),
  );
  const response = { status: 200 };
  let path;

  function page(selector, text) {
    class Page {}

    Component({ selector, template: text })(Page);

    return Page;
  }

  class Root {}

  Component({ selector: "outcome-root", imports: [RouterOutlet], template: "<router-outlet />" })(
    Root,
  );

  const html = await renderApplication(
    async (context) => {
      const app = await bootstrapApplication(
        Root,
        {
          providers: [
            provideServerRendering(),
            provideHttpClient(),
            provideLaunchServer(registry, application),
            provideRouter(
              [
                {
                  path: "todos/:id",
                  component: page("todo-page", "todo"),
                  resolve: {
                    todo: (route) =>
                      injectClient({ todos: { methods } }).todos.get(route.params.id),
                  },
                },
                { path: "sign-in", component: page("sign-in-page", "sign in") },
                { path: "not-found", component: page("not-found-page", "not found") },
              ],
              withNavigationErrorHandler(rpcNavigationErrors({ notFound: "/not-found" })),
            ),
          ],
        },
        context,
      );

      void app.whenStable().then(() => {
        path = app.injector.get(Location).path(true);
      });

      return app;
    },
    {
      document: "<outcome-root></outcome-root>",
      // Angular's server platform resolves relative HTTP URLs against this origin.
      url: `http://test${url}`,
      allowedHosts: ["test"],
      platformProviders: [
        { provide: REQUEST, useValue: scope.request },
        { provide: REQUEST_CONTEXT, useValue: scope },
        { provide: RESPONSE_INIT, useValue: response },
      ],
    },
  );

  return { html, path, status: response.status };
}

test("rpcNavigationErrors follows redirects and renders not-found at the requested URL with 404", async () => {
  const found = await render("/todos/1");

  assert.match(found.html, /<todo-page>todo<\/todo-page>/);
  assert.equal(found.path, "/todos/1");
  assert.equal(found.status, 200);

  const missing = await render("/todos/missing");

  assert.match(missing.html, /<not-found-page>not found<\/not-found-page>/);
  assert.equal(missing.path, "/todos/missing");
  assert.equal(missing.status, 404);

  // A different final URL is what makes Angular's server answer the page with a 302.
  const signedOut = await render("/todos/1", null);

  assert.match(signedOut.html, /<sign-in-page>sign in<\/sign-in-page>/);
  assert.equal(signedOut.path, "/sign-in?next=%2Ftodos");
  assert.equal(signedOut.status, 200);
});
