import "@angular/compiler";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  DOCUMENT,
  createEnvironmentInjector,
  PLATFORM_ID,
  REQUEST,
  REQUEST_CONTEXT,
  RESPONSE_INIT,
  inject,
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
import { finishLaunchRendering, middleware, notFound, redirect } from "../dist/server/index.js";
import { createRequestScope, handleRpc, provideLaunchServer } from "../dist/server/generated.js";
import { bound, application as bind } from "./fixtures/application.mjs";
import { defineRoute } from "../dist/index.js";
import { createUrl } from "@loozo/angular-router/_core";
import { REDIRECT_TRANSLATOR, swap } from "../dist/redirect-translation.js";
import { recognizedOutcome } from "../dist/outcomes.js";
import {
  account,
  docsOld,
  help,
  productItem,
  root,
  signIn,
  signInNext,
  teamItem,
  todo,
  todos,
} from "./fixtures/destinations.mjs";
import { injectClient } from "../dist/remote-client.js";
import { RpcNotFound, RpcRedirect, rpcNavigationErrors } from "../dist/index.js";
import { createQueries } from "../dist/tanstack-query/create-queries.js";
import { provideLaunchQueries } from "../dist/tanstack-query/index.js";

const application = {
  id: "launch-outcomes-test-app",
  context: ({ request }) => ({ user: request.headers.get("cookie") }),
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
    throw redirect(signInNext, { search: { next: "/todos" } });
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
const namespaces = {
  todos: {
    use: [signedIn],
    build: ({ query, stream }) => ({
      get: query({
        input: idSchema,
        use: [logging],
        handler: ({ input }) => {
          if (input === "missing") {
            throw notFound();
          }

          if (input === "moved") {
            throw redirect(todo, { params: { id: 2 }, fragment: "title" });
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

          if (input === "panel") {
            throw redirect(productItem, { params: { id: "3" } });
          }

          throw redirect(todos, {});
        },
      }),
    }),
  },
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
  return handleRpc(bound(application, namespaces), request, { allowedHosts: ["test"] });
}

test("redirect() goes to createUrl's URL for a genuine destination only, and outcomes never reach JSON", async () => {
  const application = bind("redirect-targets", {
    namespaces: {
      go: {
        build: ({ query }) => ({
          to: query({
            input: {
              "~standard": { version: 1, vendor: "test", validate: (value) => ({ value }) },
            },
            handler: ({ input }) => {
              throw redirect(targets[input][0], targets[input][1]);
            },
          }),
        }),
      },
    },
  });
  const targets = {
    signIn: [signIn, {}],
    root: [root, {}],
    todo: [todo, { params: { id: 2 }, fragment: "title" }],
    search: [signInNext, { search: { next: "/todos" } }],
    account: [account, { params: { id: "a/b" } }],
    helpEmpty: [help, { params: { topic: [] } }],
    help: [help, { params: { topic: ["x", "y"] } }],
    docsOld: [docsOld, {}],
  };

  for (const [name, [destination, values]] of Object.entries(targets)) {
    const response = await handleRpc(
      application,
      new Request("http://test/_rpc/go/to", {
        method: "POST",
        headers: { origin: "http://test", "content-type": "application/json" },
        body: JSON.stringify({ input: name }),
      }),
      { allowedHosts: ["test"] },
    );

    assert.equal(response.status, 303, name);
    assert.deepEqual(await response.json(), { redirect: { to: createUrl(destination, values) } });
    assert.equal(JSON.stringify(redirect(destination, values)), "{}");
  }

  const route = defineRoute("sign-in", {});

  for (const target of ["/sign-in", { ...signIn }, route, null, 42]) {
    assert.throws(() => redirect(target, {}), TypeError, String(target));
  }

  // createUrl's own refusals reach the caller unchanged.
  assert.throws(() => redirect(todo, { params: {} }), /Missing path value: id/);
  // A named-outlet destination takes params only, as createUrl does.
  assert.throws(
    () => redirect(productItem, { params: { id: "3" }, search: {} }),
    /A destination in outlet detail takes params only/,
  );
  assert.throws(
    () => redirect(productItem, { params: { id: "3" }, fragment: "x" }),
    /A destination in outlet detail takes params only/,
  );
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
  const scope = createRequestScope(
    bound(application, namespaces),
    new Request("http://test/todos/1", cookie === null ? {} : { headers: { cookie } }),
  );

  return Promise.resolve().then(() => {
    const parent = createEnvironmentInjector([]);
    const injector = createEnvironmentInjector(
      [
        { provide: REQUEST_CONTEXT, useValue: scope },
        { provide: REQUEST, useValue: scope.request },
        { provide: DOCUMENT, useValue: { location: { href: scope.request.url } } },
        { provide: PLATFORM_ID, useValue: "server" },
        { provide: FetchBackend, useValue: { handle: () => assert.fail("left the server") } },
        { provide: HttpClient, useFactory: () => new HttpClient(injectBackend()) },
        provideLaunchServer(bound(application, namespaces)),
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
    // Malformed words make the whole frame unrecognized.
    { status: 303, error: { redirect: { to: "/a", words: [] } } },
    { status: 303, error: { redirect: { to: "/a", words: 0 } } },
    { status: 303, error: { redirect: { to: "/a", words: null } } },
    { status: 303, error: { redirect: { to: "/a", words: ["0"] } } },
    { status: 303, error: { redirect: { to: "/a", words: [0.5] } } },
    { status: 303, error: { redirect: { to: "/a", words: [-1] } } },
    { status: 303, error: { redirect: { to: "/a/b", words: [1, 0] } } },
    { status: 303, error: { redirect: { to: "/a/b", words: [0, 0] } } },
    { status: 303, error: { redirect: { to: "/a/b", words: [2] } } },
    { status: 303, error: { redirect: { to: "/a?x=1/2", words: [1] } } },
    { status: 303, error: { redirect: { to: "/", words: [0] } } },
    { status: 303, error: { redirect: { to: "/a", words: [0], extra: 1 } } },
    { status: 303, error: { redirect: { words: [0] } } },
    // An outlet label is no segment, and words need a path createUrl writes.
    { status: 303, error: { redirect: { to: "/(o:b)", words: [1] } } },
    { status: 303, error: { redirect: { to: "/a/(o:b)", words: [2] } } },
    { status: 303, error: { redirect: { to: "/a(o:b)", words: [0] } } },
    { status: 303, error: { redirect: { to: "/a/(o:b)(p:c)", words: [0] } } },
    { status: 303, error: { redirect: { to: "/(o:b//p:c)", words: [0] } } },
    { status: 303, error: { redirect: { to: "/a/(o:b/(p:c))", words: [0] } } },
    { status: 303, error: { redirect: { to: "/a;m=1", words: [0] } } },
    { status: 303, error: { redirect: { to: "/a/", words: [0] } } },
    { status: 303, error: { redirect: { to: "/a/(o:b", words: [0] } } },
    { status: 303, error: { redirect: { to: "/a/(o:)", words: [0] } } },
    { status: 303, error: { redirect: { to: "/a/(1o:b)", words: [0] } } },
    { status: 303, error: { redirect: { to: "/ä", words: [0] } } },
  ];

  try {
    responses.push({ status: 303, error: { redirect: { to: "/sign-in" } } });
    await assert.rejects(
      rpc.todos.get("1"),
      (error) => error instanceof RpcRedirect && error.to === "/sign-in",
    );
    responses.push({ status: 404, error: { notFound: null } });
    await assert.rejects(rpc.todos.get("1"), RpcNotFound);
    // Without a translation installed, a frame's words are recognized and left alone.
    responses.push({ status: 303, error: { redirect: { to: "/sign-in", words: [0] } } });
    await assert.rejects(
      rpc.todos.get("1"),
      (error) => error instanceof RpcRedirect && error.to === "/sign-in",
    );

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

async function serve(description = application) {
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
    const response = await handleRpc(bound(description, namespaces), request, {
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
  const { bootstrapApplication } = await import(
    pathToFileURL(require.resolve("@angular/platform-browser")).href
  );
  const { renderApplication, provideServerRendering } = await import(
    pathToFileURL(require.resolve("@angular/platform-server")).href
  );
  const { Component } = await import(pathToFileURL(require.resolve("@angular/core")).href);
  const { Location } = await import(pathToFileURL(require.resolve("@angular/common")).href);
  const { provideHttpClient } = await import(
    pathToFileURL(require.resolve("@angular/common/http")).href
  );
  const { provideRouter, RouterOutlet, withNavigationErrorHandler } = await import(
    pathToFileURL(require.resolve("@angular/router")).href
  );
  const scope = createRequestScope(
    bound(application, namespaces),
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
            provideLaunchServer(bound(application, namespaces)),
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

test("recognition translates a frame with words once, and leaves every other frame alone", () => {
  const calls = [];
  // Not idempotent, so translating twice would show.
  const translate = (to, words) => {
    calls.push([to, words]);

    return `${to}~t`;
  };

  assert.equal(
    recognizedOutcome({ redirect: { to: "/a/b", words: [0, 1] } }, 303, translate).to,
    "/a/b~t",
  );
  assert.deepEqual(calls, [["/a/b", [0, 1]]]);
  assert.equal(
    recognizedOutcome({ redirect: { to: "/a/(o:b/c)?x=(y:z)", words: [0, 1] } }, 303, translate).to,
    "/a/(o:b/c)?x=(y:z)~t",
  );
  assert.deepEqual(calls[1], ["/a/(o:b/c)?x=(y:z)", [0, 1]]);
  calls.length = 1;
  // Without words, any root-relative `to` stays as it is, outlet syntax or not.
  assert.equal(recognizedOutcome({ redirect: { to: "/a(o:b)" } }, 303, translate).to, "/a(o:b)");
  assert.equal(recognizedOutcome({ redirect: { to: "/a" } }, 303, translate).to, "/a");
  assert.equal(recognizedOutcome({ redirect: { to: "/a", words: [0] } }, 303).to, "/a");
  assert.equal(recognizedOutcome({ redirect: { to: "/a", words: [] } }, 303, translate), undefined);
  assert.equal(calls.length, 1);
  // A translation that leaves the app's origin isn't a redirect Launch recognizes.
  assert.equal(
    recognizedOutcome({ redirect: { to: "/a", words: [0] } }, 303, () => "//evil.example/"),
    undefined,
  );
});

// One redirecting procedure in a translated application, called through HttpClient with a
// recording handler in front of the backend, where an interceptor sits, in the browser, while
// rendering a live request and while prerendering.
const translatedTargets = {
  signIn: {
    outcome: () => redirect(signIn, {}),
    frame: { redirect: { to: "/sign-in", words: [0] } },
    // Not idempotent, so translating twice would show.
    translate: (to) => `${to}~t`,
  },
  // A dynamic anchor whose value is also a word: only the listed segments change.
  teamItem: {
    outcome: () => redirect(teamItem, { params: { team: "products", id: "3" } }),
    frame: { redirect: { to: "/teams/products/(detail:item/3)", words: [0, 2] } },
    translate: (to, words) =>
      swap(
        new Map([
          ["teams", "mannschaften"],
          ["products", "produkte"],
          ["item", "artikel"],
        ]),
        to,
        words,
      ),
  },
};

async function translatedCall(platform, name = "signIn") {
  const target = translatedTargets[name];
  const application = bind(`translated-${platform}-${name}`, {
    translateSegments: true,
    namespaces: {
      go: {
        build: ({ query }) => ({
          [name]: query({
            handler: () => {
              throw target.outcome();
            },
          }),
        }),
      },
    },
  });
  const wire = [];
  const recording = (backend) => ({
    handle: (request) =>
      new Observable((subscriber) =>
        backend.handle(request).subscribe({
          next: (event) => subscriber.next(event),
          complete: () => subscriber.complete(),
          error: (error) => {
            wire.push(error.error);
            subscriber.error(error);
          },
        }),
      ),
  });
  const providers = [
    { provide: HttpClient, useFactory: () => new HttpClient(recording(inject(HttpBackend))) },
    { provide: REDIRECT_TRANSLATOR, useValue: target.translate },
  ];

  if (platform === "browser") {
    providers.push(
      { provide: PLATFORM_ID, useValue: "browser" },
      {
        provide: HttpBackend,
        useValue: {
          handle: () =>
            new Observable((subscriber) =>
              subscriber.error(
                new HttpErrorResponse({ status: 303, error: structuredClone(target.frame) }),
              ),
            ),
        },
      },
    );
  } else {
    const live = platform === "live";
    const scope = live ? createRequestScope(application, new Request("http://test/guarded")) : null;

    providers.push(
      { provide: PLATFORM_ID, useValue: "server" },
      { provide: REQUEST_CONTEXT, useValue: scope },
      { provide: REQUEST, useValue: scope?.request ?? null },
      { provide: DOCUMENT, useValue: { location: { href: "http://test/guarded" } } },
      { provide: FetchBackend, useValue: { handle: () => assert.fail("left the server") } },
      provideLaunchServer(application),
    );
  }

  const parent = createEnvironmentInjector([]);
  const injector = createEnvironmentInjector(providers, parent);
  const rpc = runInInjectionContext(injector, () =>
    injectClient({
      go: { methods: [{ name, input: false, kind: "query", errors: [] }] },
    }),
  );
  let caught;

  try {
    await rpc.go[name]();
  } catch (error) {
    caught = error;
  }

  let fault;

  if (platform === "prerender") {
    const app = {
      injector,
      components: [{}],
      destroyed: false,
      whenStable: async () => {},
      destroy: () => {},
    };

    fault = await finishLaunchRendering(app).then(
      () => undefined,
      (error) => error,
    );
  }

  injector.destroy();
  parent.destroy();

  return { caught, wire, fault };
}

test("a translated redirect reaches the caller in the build's words, after interceptors saw the wire body", async () => {
  const wireBody = { redirect: { to: "/sign-in", words: [0] } };

  for (const platform of ["browser", "live"]) {
    const { caught, wire } = await translatedCall(platform);

    assert.ok(caught instanceof RpcRedirect, platform);
    assert.equal(caught.to, "/sign-in~t", platform);
    assert.deepEqual(wire, [wireBody], platform);
  }

  // Prerendering runs procedures in the localized application, whose redirects are already in
  // its words: the client never translates them, and the build still fails with the raw body.
  const { caught, wire, fault } = await translatedCall("prerender");

  assert.ok(caught instanceof RpcRedirect);
  assert.equal(caught.to, "/sign-in");
  assert.deepEqual(wire, [wireBody]);
  assert.equal(
    fault?.message,
    `Launch can't prerender this page: /_rpc/go/signIn answered 303 ${JSON.stringify(wireBody)}`,
  );
});

test("a translated redirect into a named outlet translates its anchor and group words, and never while prerendering", async () => {
  const wireBody = translatedTargets.teamItem.frame;

  for (const platform of ["browser", "live"]) {
    const { caught, wire } = await translatedCall(platform, "teamItem");

    assert.ok(caught instanceof RpcRedirect, platform);
    assert.equal(caught.to, "/mannschaften/products/(detail:artikel/3)", platform);
    assert.deepEqual(wire, [wireBody], platform);
  }

  const { caught, wire, fault } = await translatedCall("prerender", "teamItem");

  assert.ok(caught instanceof RpcRedirect);
  assert.equal(caught.to, "/teams/products/(detail:item/3)");
  assert.deepEqual(wire, [wireBody]);
  assert.equal(
    fault?.message,
    `Launch can't prerender this page: /_rpc/go/teamItem answered 303 ${JSON.stringify(wireBody)}`,
  );
});

test("in a translated app, a stream's start response and error event redirect in the build's words", async () => {
  const server = await serve({
    ...application,
    id: "launch-outcomes-translated",
    translateSegments: true,
  });
  const parent = createEnvironmentInjector([]);
  const injector = createEnvironmentInjector(
    [
      { provide: HttpClient, useValue: {} },
      { provide: PLATFORM_ID, useValue: "browser" },
      { provide: REDIRECT_TRANSLATOR, useValue: (to, words) => `${to}~${words.join(",")}` },
    ],
    parent,
  );
  const rpc = runInInjectionContext(injector, () => injectClient({ todos: { methods } }));

  async function rejection(iterable) {
    try {
      for await (const value of iterable) {
        void value;
      }
    } catch (error) {
      return error;
    }

    return undefined;
  }

  try {
    // After the stream started: the error event.
    const moved = await rejection(rpc.todos.watch("moved"));

    assert.ok(moved instanceof RpcRedirect);
    assert.equal(moved.to, "/todos~0");

    // A named-outlet target's words reach the translator as segment ordinals.
    const panel = await rejection(rpc.todos.watch("panel"));

    assert.ok(panel instanceof RpcRedirect);
    assert.equal(panel.to, "/products/(detail:item/3)~0,1");

    // Before it started: the 303 response.
    server.signOut();

    const refused = await rejection(rpc.todos.watch("1"));

    assert.ok(refused instanceof RpcRedirect);
    assert.equal(refused.to, "/sign-in?next=%2Ftodos~0");
  } finally {
    injector.destroy();
    parent.destroy();
    server.close();
  }
});
