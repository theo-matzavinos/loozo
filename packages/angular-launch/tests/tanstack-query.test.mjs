import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  Component,
  PLATFORM_ID,
  createEnvironmentInjector,
  runInInjectionContext,
} from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Observable } from "rxjs";
import { QueryClient, provideTanStackQuery, skipToken } from "@tanstack/angular-query";
import { provideLaunchQueries } from "../dist/tanstack-query/index.js";
import { createQueries } from "../dist/tanstack-query/generated.js";
import { hydrationWindow } from "../dist/tanstack-query/hydration.js";
import { injectClient } from "../dist/generated.js";
import { RpcError } from "../dist/client.js";

const metadata = {
  todos: {
    list: { kind: "query", input: false },
    byId: { kind: "query", input: true },
    add: { kind: "mutation", input: true },
    clear: { kind: "mutation", input: false },
  },
};

// Fake callables recording their exact arguments.
function recordingRpc() {
  const calls = [];
  const rpc = { todos: {} };

  for (const name of Object.keys(metadata.todos)) {
    rpc.todos[name] = (...args) => {
      calls.push({ name, args });

      return Promise.resolve({ name });
    };
  }

  return { rpc, calls };
}

function setup({ platform = "browser", client = new QueryClient(), launch = true } = {}) {
  const parent = createEnvironmentInjector([]);
  const providers = [
    { provide: PLATFORM_ID, useValue: platform },
    { provide: QueryClient, useValue: client },
  ];

  if (launch) {
    providers.push(provideLaunchQueries());
  }

  const injector = createEnvironmentInjector(providers, parent);
  const { rpc, calls } = recordingRpc();
  const queries = runInInjectionContext(injector, () => createQueries(rpc, metadata));

  return {
    queries,
    calls,
    client,
    hydration: injector.get(hydrationWindow, null),
    destroy: () => {
      injector.destroy();
      parent.destroy();
    },
  };
}

test("keys are namespace, procedure and the caller's input; skipToken disables without input", () => {
  const { queries, destroy } = setup();
  const input = { id: "todo-1" };

  try {
    assert.deepEqual(queries.todos.$key(), ["launch", "todos"]);
    assert.deepEqual(queries.todos.list.key(), ["launch", "todos", "list"]);
    assert.deepEqual(queries.todos.byId.key(), ["launch", "todos", "byId"]);
    assert.deepEqual(queries.todos.byId.key(input), ["launch", "todos", "byId", input]);
    assert.equal(queries.todos.byId.key(input)[3], input);
    assert.deepEqual(queries.todos.add.key(), ["launch", "todos", "add"]);
    assert.deepEqual(queries.todos.list.queryOptions().queryKey, ["launch", "todos", "list"]);
    assert.equal(queries.todos.byId.queryOptions(input).queryKey[3], input);
    assert.deepEqual(queries.todos.add.mutationOptions().mutationKey, ["launch", "todos", "add"]);

    const skipped = queries.todos.byId.queryOptions(skipToken);

    assert.deepEqual(skipped.queryKey, ["launch", "todos", "byId"]);
    assert.equal(skipped.queryFn, skipToken);
    assert.equal("queryOptions" in queries.todos.add, false);
    assert.equal("mutationOptions" in queries.todos.list, false);
  } finally {
    destroy();
  }
});

test("query functions forward the signal with transferCache false; arity follows input", async () => {
  const { queries, calls, client, destroy } = setup();
  const input = { id: "todo-1" };

  try {
    const list = await client.fetchQuery(queries.todos.list.queryOptions());
    const byId = await client.fetchQuery(queries.todos.byId.queryOptions(input));

    assert.deepEqual(list, { name: "list" });
    assert.deepEqual(byId, { name: "byId" });
    assert.equal(calls[0].args.length, 1);
    assert.ok(calls[0].args[0].signal instanceof AbortSignal);
    assert.deepEqual(Object.keys(calls[0].args[0]).sort(), ["signal", "transferCache"]);
    assert.equal(calls[0].args[0].transferCache, false);
    assert.equal(calls[1].args.length, 2);
    assert.equal(calls[1].args[0], input);
    assert.ok(calls[1].args[1].signal instanceof AbortSignal);
    assert.equal(calls[1].args[1].transferCache, false);

    await queries.todos.add.mutationOptions().mutationFn("title", { client });
    await queries.todos.clear.mutationOptions().mutationFn(undefined, { client });
    assert.deepEqual(calls[2], { name: "add", args: ["title"] });
    assert.deepEqual(calls[3], { name: "clear", args: [] });
  } finally {
    destroy();
  }
});

test("overrides can't replace the key or function, and replace the defaults", async () => {
  const { queries, calls, destroy } = setup();
  const select = (data) => data.name;

  try {
    const options = queries.todos.list.queryOptions({
      queryKey: ["other"],
      queryFn: () => "other",
      retry: 7,
      refetchOnMount: "always",
      staleTime: 5,
      select,
    });

    assert.deepEqual(options.queryKey, ["launch", "todos", "list"]);
    assert.equal(options.retry, 7);
    assert.equal(options.refetchOnMount, "always");
    assert.equal(options.staleTime, 5);
    assert.equal(options.select, select);
    await options.queryFn({ signal: new AbortController().signal });
    assert.equal(calls.at(-1).name, "list");

    const onSuccess = () => undefined;
    const mutation = queries.todos.add.mutationOptions({
      mutationKey: ["other"],
      mutationFn: () => "other",
      onSuccess,
    });

    assert.deepEqual(mutation.mutationKey, ["launch", "todos", "add"]);
    assert.equal(mutation.onSuccess, onSuccess);
    await mutation.mutationFn("title");
    assert.deepEqual(calls.at(-1), { name: "add", args: ["title"] });
  } finally {
    destroy();
  }
});

test("retry skips RpcErrors and otherwise follows the client default, else three; errors keep identity", async () => {
  const client = new QueryClient();
  const { queries, destroy } = setup({ client });
  const network = new Error("network");

  try {
    const { retry } = queries.todos.list.queryOptions();
    const byIdRetry = queries.todos.byId.queryOptions({ id: "1" }).retry;

    // No client default: TanStack's three retries.
    assert.equal(retry(0, new RpcError("INTERNAL", 500)), false);
    assert.equal(retry(0, network), true);
    assert.equal(retry(2, network), true);
    assert.equal(retry(3, network), false);

    // TanStack's adapter sets this default on the server.
    client.setDefaultOptions({ queries: { retry: false } });
    assert.equal(retry(0, network), false);

    client.setDefaultOptions({ queries: { retry: true } });
    assert.equal(retry(10, network), true);
    assert.equal(retry(0, new RpcError("INTERNAL", 500)), false);

    client.setDefaultOptions({ queries: { retry: 1 } });
    assert.equal(retry(0, network), true);
    assert.equal(retry(1, network), false);

    const seen = [];

    client.setQueryDefaults(["launch", "todos", "list"], {
      retry: (failures, error) => {
        seen.push({ failures, error });

        return failures < 5;
      },
    });
    assert.equal(retry(4, network), true);
    assert.equal(retry(5, network), false);
    assert.deepEqual(seen, [
      { failures: 4, error: network },
      { failures: 5, error: network },
    ]);

    // Query defaults are per key: byId still sees the client's number.
    assert.equal(byIdRetry(0, network), true);
    assert.equal(byIdRetry(1, network), false);

    // A function default isn't asked about an RpcError.
    assert.equal(retry(0, new RpcError("INTERNAL", 500)), false);
    assert.equal(seen.length, 2);

    assert.equal(queries.todos.list.queryOptions({ retry: false }).retry, false);
  } finally {
    destroy();
  }

  let failure;
  let attempts = 0;
  const realClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  const parent = createEnvironmentInjector([]);
  const injector = createEnvironmentInjector(
    [
      provideLaunchQueries(),
      { provide: PLATFORM_ID, useValue: "browser" },
      { provide: QueryClient, useValue: realClient },
      {
        provide: HttpClient,
        useValue: new HttpClient({
          handle: () =>
            new Observable((subscriber) => {
              attempts += 1;
              subscriber.error(failure);
            }),
        }),
      },
    ],
    parent,
  );
  const methods = [{ name: "list", input: false, kind: "query", errors: [] }];
  const rpc = runInInjectionContext(injector, () => injectClient({ todos: { methods } }));
  const real = runInInjectionContext(injector, () =>
    createQueries(rpc, { todos: { list: { kind: "query", input: false } } }),
  );

  try {
    failure = new HttpErrorResponse({
      status: 500,
      error: { error: { code: "INTERNAL", message: "Internal server error", data: null } },
    });
    await assert.rejects(
      realClient.fetchQuery({ ...real.todos.list.queryOptions(), retry: undefined }),
      (error) => {
        assert.ok(rpc.todos.list.isError(error));
        assert.equal(
          realClient.getQueryCache().find({ queryKey: ["launch", "todos", "list"] }).state.error,
          error,
        );

        return true;
      },
    );

    realClient.clear();
    attempts = 0;
    failure = new HttpErrorResponse({
      status: 500,
      error: { error: { code: "INTERNAL", message: "Internal server error", data: null } },
    });
    await assert.rejects(realClient.fetchQuery(real.todos.list.queryOptions()), (error) =>
      rpc.todos.list.isError(error),
    );
    assert.equal(attempts, 1);

    realClient.clear();
    attempts = 0;
    failure = new HttpErrorResponse({ status: 0, error: new Error("offline") });
    await assert.rejects(
      realClient.fetchQuery(real.todos.list.queryOptions()),
      (error) => error === failure,
    );
    assert.equal(attempts, 4);
  } finally {
    injector.destroy();
    parent.destroy();
  }
});

test("refetchOnMount is false while hydrating, then the client default, else true; overrides win", () => {
  const client = new QueryClient();
  const browser = setup({ client });
  const query = (key) => client.getQueryCache().build(client, { queryKey: key });

  try {
    const { refetchOnMount } = browser.queries.todos.list.queryOptions();
    const listQuery = query(["launch", "todos", "list"]);

    assert.equal(browser.hydration.open, true);
    assert.equal(refetchOnMount(listQuery), false);
    assert.equal(
      browser.queries.todos.list.queryOptions({ refetchOnMount: "always" }).refetchOnMount,
      "always",
    );

    browser.hydration.open = false;
    assert.equal(refetchOnMount(listQuery), true);

    client.setDefaultOptions({ queries: { refetchOnMount: false } });
    assert.equal(refetchOnMount(listQuery), false);

    client.setQueryDefaults(["launch", "todos"], { refetchOnMount: "always" });
    assert.equal(refetchOnMount(listQuery), "always");

    const seen = [];

    client.setQueryDefaults(["launch", "todos", "list"], {
      refetchOnMount: (candidate) => {
        seen.push(candidate);

        return false;
      },
    });
    assert.equal(refetchOnMount(listQuery), false);
    assert.deepEqual(seen, [listQuery]);
    assert.equal(
      browser.queries.todos.byId
        .queryOptions({ id: "1" })
        .refetchOnMount(query(["launch", "todos", "byId", { id: "1" }])),
      "always",
    );
  } finally {
    browser.destroy();
  }

  const server = setup({ platform: "server" });

  try {
    assert.equal(server.hydration.open, false);
    assert.equal(
      server.queries.todos.list
        .queryOptions()
        .refetchOnMount(server.client.getQueryCache().build(server.client, { queryKey: ["x"] })),
      true,
    );
  } finally {
    server.destroy();
  }
});

test("injectQueries() requires provideLaunchQueries() on every platform", () => {
  for (const platform of ["browser", "server"]) {
    assert.throws(
      () => setup({ platform, launch: false }),
      /injectQueries\(\) requires provideLaunchQueries\(\)/,
    );
  }
});

// Regression: the window must stay open for pages constructed during the initial navigation.
// Starting whenStable() from a provider factory or environment initializer resolves before
// bootstrap registers pending work, which closed the window before the page mounted.
test("the hydration window stays open through initial navigation and closes after stability", async () => {
  const require = createRequire(
    new URL("../../../examples/angular-launch/package.json", import.meta.url),
  );
  const { bootstrapApplication } = await import(require.resolve("@angular/platform-browser"));
  const { renderApplication, provideServerRendering } = await import(
    require.resolve("@angular/platform-server")
  );
  const { provideRouter, RouterOutlet } = await import(require.resolve("@angular/router"));
  const timeline = [];
  let options;
  let stable = Promise.resolve();

  class Page {
    constructor() {
      const { rpc } = recordingRpc();
      const queries = createQueries(rpc, metadata);

      options = queries.todos.list.queryOptions();
      timeline.push({ at: "page", hydrating: isHydrating() });
    }
  }

  Component({ selector: "hydration-page", template: "page" })(Page);

  class Root {}

  Component({ selector: "hydration-root", imports: [RouterOutlet], template: "<router-outlet />" })(
    Root,
  );

  let probe;

  function isHydrating() {
    return options.refetchOnMount(probe) === false;
  }

  await renderApplication(
    async (context) => {
      const app = await bootstrapApplication(
        Root,
        {
          providers: [
            provideServerRendering(),
            provideRouter([
              {
                path: "",
                component: Page,
                resolve: {
                  slow: () => new Promise((resolve) => setTimeout(() => resolve(true), 50)),
                },
              },
            ]),
            provideTanStackQuery(() => new QueryClient()),
            provideLaunchQueries(),
            // The window opens only in the browser.
            { provide: PLATFORM_ID, useValue: "browser" },
          ],
        },
        context,
      );
      const client = app.injector.get(QueryClient);

      probe = client.getQueryCache().build(client, { queryKey: ["probe"] });
      options = runInInjectionContext(app.injector, () =>
        createQueries(recordingRpc().rpc, metadata),
      ).todos.list.queryOptions();
      timeline.push({ at: "bootstrapped", hydrating: isHydrating() });
      stable = app.whenStable();

      return app;
    },
    { document: "<hydration-root></hydration-root>", url: "/" },
  );
  await stable;
  await Promise.resolve();
  timeline.push({ at: "after", hydrating: isHydrating() });

  assert.deepEqual(timeline, [
    { at: "bootstrapped", hydrating: true },
    { at: "page", hydrating: true },
    { at: "after", hydrating: false },
  ]);
});
