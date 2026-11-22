import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import {
  Component,
  PLATFORM_ID,
  createEnvironmentInjector,
  runInInjectionContext,
} from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Observable } from "rxjs";
import {
  QueryClient,
  QueryObserver,
  provideTanStackQuery,
  skipToken,
} from "@tanstack/angular-query";
import { provideLaunchQueries } from "../dist/tanstack-query/index.js";
import { createQueries } from "../dist/tanstack-query/create-queries.js";
import { hydrationWindow } from "../dist/tanstack-query/hydration-window.js";
import { injectClient } from "../dist/remote-client.js";
import { RpcError } from "../dist/client.js";
import { defineRoute } from "../dist/index.js";
import { authoredRouteOf, defineDestination, routeMetadata } from "@loozo/angular-router/_core";

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

test("structural sharing keeps __proto__ result keys as data and shares equal data; overrides win", async () => {
  // What Angular's HTTP backends do with a JSON response: JSON.parse keeps "__proto__" as an
  // own key. TanStack only corrupts a key whose object replaces an object in the old data.
  const bodies = [
    '{"a":{},"b":[1]}',
    '{"a":{"__proto__":{"x":1}},"b":[1],"__proto__":{"canDelete":true}}',
    '{"a":{},"b":[{}]}',
    '{"a":{},"b":[{"__proto__":{"y":1}}]}',
    '{"a":{},"b":[1]}',
    '{"a":{},"b":[1]}',
    '{"a":{},"b":[2]}',
  ];
  const rpc = {
    profile: {
      read: () => Promise.resolve(JSON.parse(bodies.shift())),
      byId: () => Promise.resolve(null),
    },
  };
  const parent = createEnvironmentInjector([]);
  const client = new QueryClient();
  const injector = createEnvironmentInjector(
    [
      { provide: PLATFORM_ID, useValue: "browser" },
      { provide: QueryClient, useValue: client },
      provideLaunchQueries(),
    ],
    parent,
  );
  const queries = runInInjectionContext(injector, () =>
    createQueries(rpc, {
      profile: {
        read: { kind: "query", input: false },
        byId: { kind: "query", input: true },
      },
    }),
  );
  // What injectQuery reads.
  const observer = new QueryObserver(client, queries.profile.read.queryOptions());

  async function refetch() {
    const result = await observer.refetch();

    return result.data;
  }

  try {
    await refetch();

    // Top level and nested: the prototype stays Object's and the key stays own data.
    const own = await refetch();

    assert.equal(Object.getPrototypeOf(own), Object.prototype);
    assert.equal(own.canDelete, undefined);
    assert.deepEqual(Object.getOwnPropertyDescriptor(own, "__proto__").value, { canDelete: true });
    assert.equal(Object.getPrototypeOf(own.a), Object.prototype);
    assert.equal(own.a.x, undefined);
    assert.deepEqual(Object.getOwnPropertyDescriptor(own.a, "__proto__").value, { x: 1 });

    // Only nested, inside an array.
    await refetch();

    const nested = await refetch();

    assert.equal(Object.getPrototypeOf(nested.b[0]), Object.prototype);
    assert.equal(nested.b[0].y, undefined);
    assert.deepEqual(Object.getOwnPropertyDescriptor(nested.b[0], "__proto__").value, { y: 1 });

    // The global prototype was never written.
    assert.equal({}.canDelete, undefined);
    assert.equal({}.x, undefined);
    assert.equal({}.y, undefined);

    // Equal data keeps its identity, and unchanged parts of changed data are shared.
    const before = await refetch();
    const equal = await refetch();
    const changed = await refetch();

    assert.equal(equal, before);
    assert.notEqual(changed, equal);
    assert.equal(changed.a, equal.a);
    assert.deepEqual(changed.b, [2]);

    // Queries with input, and disabled ones, get the same default.
    const old = { a: {} };
    const proto = JSON.parse('{"a":{"__proto__":{"x":1}}}');

    for (const options of [
      queries.profile.byId.queryOptions("1"),
      queries.profile.byId.queryOptions(skipToken),
    ]) {
      assert.equal(options.structuralSharing(old, { a: {} }), old);
      assert.equal(options.structuralSharing(old, proto), proto);
    }

    const replace = (old, data) => data;

    assert.equal(
      queries.profile.read.queryOptions({ structuralSharing: false }).structuralSharing,
      false,
    );
    assert.equal(
      queries.profile.read.queryOptions({ structuralSharing: replace }).structuralSharing,
      replace,
    );
  } finally {
    injector.destroy();
    parent.destroy();
  }
});

test("structuralSharing follows the client default for the key, else the guard; overrides win", () => {
  const client = new QueryClient();
  const { queries, destroy } = setup({ client });
  const old = { a: {} };
  const equal = { a: {} };
  const proto = JSON.parse('{"a":{"__proto__":{"x":1}}}');

  try {
    const { structuralSharing } = queries.todos.list.queryOptions();
    const byIdSharing = queries.todos.byId.queryOptions({ id: "1" }).structuralSharing;

    // No client default: TanStack's sharing, guarded.
    assert.equal(structuralSharing(old, equal), old);
    assert.equal(structuralSharing(old, proto), proto);

    client.setDefaultOptions({ queries: { structuralSharing: true } });
    assert.equal(structuralSharing(old, equal), old);
    assert.equal(structuralSharing(old, proto), proto);

    client.setDefaultOptions({ queries: { structuralSharing: false } });
    assert.equal(structuralSharing(old, equal), equal);

    const seen = [];
    const marker = { shared: true };

    client.setDefaultOptions({
      queries: {
        structuralSharing: (previous, data) => {
          seen.push({ previous, data });

          return marker;
        },
      },
    });
    assert.equal(structuralSharing(old, proto), marker);
    assert.deepEqual(seen, [{ previous: old, data: proto }]);

    // Query defaults for the key take precedence over the client's, and only for that key.
    client.setDefaultOptions({ queries: { structuralSharing: true } });
    client.setQueryDefaults(["launch", "todos", "list"], { structuralSharing: false });
    assert.equal(structuralSharing(old, equal), equal);
    assert.equal(byIdSharing(old, equal), old);

    // An override replaces the generated default entirely.
    assert.equal(
      queries.todos.list.queryOptions({ structuralSharing: true }).structuralSharing,
      true,
    );
  } finally {
    destroy();
  }
});

// Runs `scenario` on a worker thread, so a structural-sharing walk that never ends fails the
// test after `bound` milliseconds instead of blocking the suite. `scenario` is serialized, so
// it uses only what it receives: assert, QueryObserver and setup(read), which gives a
// QueryClient and the queries of a no-input `profile.read` query calling `read`.
function inWorker(scenario, bound = 10_000) {
  const modules = {
    compiler: import.meta.resolve("@angular/compiler"),
    core: import.meta.resolve("@angular/core"),
    query: import.meta.resolve("@tanstack/angular-query"),
    launch: new URL("../dist/tanstack-query/index.js", import.meta.url).href,
    createQueries: new URL("../dist/tanstack-query/create-queries.js", import.meta.url).href,
  };
  const source = `
    const { parentPort, workerData: modules } = require("node:worker_threads");

    (async () => {
      await import(modules.compiler);
      const assert = (await import("node:assert/strict")).default;
      const { PLATFORM_ID, createEnvironmentInjector, runInInjectionContext } = await import(modules.core);
      const { QueryClient, QueryObserver } = await import(modules.query);
      const { provideLaunchQueries } = await import(modules.launch);
      const { createQueries } = await import(modules.createQueries);

      function setup(read) {
        const client = new QueryClient();
        const injector = createEnvironmentInjector(
          [
            { provide: PLATFORM_ID, useValue: "browser" },
            { provide: QueryClient, useValue: client },
            provideLaunchQueries(),
          ],
          createEnvironmentInjector([]),
        );
        const queries = runInInjectionContext(injector, () =>
          createQueries({ profile: { read } }, { profile: { read: { kind: "query", input: false } } }),
        );

        return { client, queries };
      }

      await (${scenario})({ assert, QueryObserver, setup });
      parentPort.postMessage("done");
    })();
  `;

  return new Promise((resolve, reject) => {
    const worker = new Worker(source, { eval: true, workerData: modules });
    // Ends a walk stuck in a loop too: terminate() stops the running script.
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`the scenario didn't finish within ${bound} ms`));
    }, bound);

    worker.once("message", () => {
      clearTimeout(timer);
      // The QueryClient's timers would keep the worker alive.
      worker.terminate().then(() => resolve());
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      worker.terminate();
      reject(error);
    });
  });
}

test("structural sharing returns a cyclic class instance from select as it is", () =>
  inWorker(async ({ assert, QueryObserver, setup }) => {
    class View {
      constructor(n) {
        this.n = n;
        this.self = this;
      }
    }

    let n = 0;
    const { client, queries } = setup(() => Promise.resolve({ n: ++n }));
    const observer = new QueryObserver(
      client,
      queries.profile.read.queryOptions({ select: (data) => new View(data.n) }),
    );

    for (const expected of [1, 2]) {
      const { data } = await observer.refetch();

      assert.ok(data instanceof View);
      assert.equal(data.n, expected);
      assert.equal(data.self, data);
    }
  }));

test("structural sharing shares a cyclic plain object from select, and guards it", () =>
  inWorker(async ({ assert, QueryObserver, setup }) => {
    const selected = [];
    let n = 0;
    const { client, queries } = setup(() => Promise.resolve({ n: ++n }));
    const observer = new QueryObserver(
      client,
      queries.profile.read.queryOptions({
        select: (data) => {
          const view = JSON.parse(data.n === 3 ? '{"__proto__":{"x":1}}' : "{}");

          view.n = data.n;
          view.self = view;
          selected.push(view);

          return view;
        },
      }),
    );

    // Nothing to share with yet.
    const first = (await observer.refetch()).data;

    assert.equal(first, selected[0]);

    // TanStack's sharing, which ends at its depth limit.
    const second = (await observer.refetch()).data;

    assert.equal(second.n, 2);
    assert.equal(Object.getPrototypeOf(second), Object.prototype);

    // The key is found through the cycle, so the selected object replaces the old one whole.
    const third = (await observer.refetch()).data;

    assert.equal(third, selected[2]);
    assert.equal(Object.getPrototypeOf(third), Object.prototype);
    assert.equal(third.x, undefined);
    assert.deepEqual(Object.getOwnPropertyDescriptor(third, "__proto__").value, { x: 1 });
  }));

test("structural sharing reads a selected array by index, as TanStack copies it", () =>
  inWorker(async ({ assert, QueryObserver, setup }) => {
    let n = 0;
    const { client, queries } = setup(() => Promise.resolve({ n: ++n }));
    const observer = new QueryObserver(
      client,
      queries.profile.read.queryOptions({
        select: (data) => {
          const rows = JSON.parse(data.n === 2 ? '[{"__proto__":{"x":1}}]' : "[{}]");

          // An iterator that yields nothing hides the row from a walk that iterates.
          Object.defineProperty(rows, Symbol.iterator, { value: function* () {} });

          return rows;
        },
      }),
    );

    await observer.refetch();

    // Indexed, not destructured: destructuring would use the empty iterator.
    const row = (await observer.refetch()).data[0];

    assert.equal(Object.getPrototypeOf(row), Object.prototype);
    assert.equal(row.x, undefined);
    assert.deepEqual(Object.getOwnPropertyDescriptor(row, "__proto__").value, { x: 1 });
  }));

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

// A route copy's handle members, as `injectRoute()` adds them: the copy carries generation's
// data, and Launch's handle hook builds `remote` and `queries` from it on first read.
function routeHandle(injector) {
  const destination = defineDestination("todos", {}, "todos");
  const copy = authoredRouteOf()(defineRoute, destination, undefined, {
    remote: {
      todos: {
        methods: [
          { name: "list", input: false, kind: "query", errors: [] },
          { name: "add", input: true, kind: "mutation", errors: [] },
        ],
      },
      live: { methods: [{ name: "ticks", input: false, kind: "stream", errors: [] }] },
    },
  });
  const { runtime, chain } = routeMetadata(copy).extension;

  return runtime.handle(chain, injector);
}

function routeInjector({ platform = "browser", launch = true } = {}) {
  const parent = createEnvironmentInjector([]);
  const providers = [
    { provide: PLATFORM_ID, useValue: platform },
    { provide: QueryClient, useValue: new QueryClient() },
    { provide: HttpClient, useValue: { post: () => assert.fail("Unexpected HTTP call") } },
  ];

  if (launch) {
    providers.push(provideLaunchQueries());
  }

  const injector = createEnvironmentInjector(providers, parent);

  return {
    injector,
    destroy: () => {
      injector.destroy();
      parent.destroy();
    },
  };
}

test("route.queries requires provideLaunchQueries() on every platform; route.remote doesn't", () => {
  for (const platform of ["browser", "server"]) {
    const { injector, destroy } = routeInjector({ platform, launch: false });

    try {
      const route = routeHandle(injector);

      assert.equal(route.remote.todos.list.kind, "query");
      assert.throws(
        () => route.queries,
        new Error(
          "route.queries requires provideLaunchQueries() from @loozo/angular-launch/tanstack-query in the application providers",
        ),
      );
    } finally {
      destroy();
    }
  }
});

test("route.queries and route.remote work when first read outside an injection context", async () => {
  const { injector, destroy } = routeInjector({ platform: "server" });

  try {
    const route = routeHandle(injector);
    const { options, ticks } = await new Promise((resolve, reject) => {
      // A later macrotask: nothing here runs in an injection context.
      setTimeout(() => {
        try {
          resolve({
            options: route.queries.todos.list.queryOptions(),
            ticks: route.remote.live.ticks()[Symbol.asyncIterator]().next(),
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    assert.deepEqual(options.queryKey, ["launch", "todos", "list"]);
    assert.deepEqual(route.queries.todos.add.mutationOptions().mutationKey, [
      "launch",
      "todos",
      "add",
    ]);
    assert.equal("live" in route.queries, true);
    assert.equal("ticks" in route.queries.live, false);
    // PLATFORM_ID was read lazily from the captured injector: streams don't run on the server.
    await assert.rejects(ticks, (error) => error instanceof RpcError && error.code === "FORBIDDEN");
    assert.equal(route.queries, route.queries);
    assert.equal(route.remote, route.remote);
  } finally {
    destroy();
  }
});

// Regression: the window must stay open for pages constructed during the initial navigation.
// Starting whenStable() from a provider factory or environment initializer resolves before
// bootstrap registers pending work, which closed the window before the page mounted.
test("the hydration window stays open through initial navigation and closes after stability", async () => {
  const require = createRequire(
    new URL("../../../examples/angular-launch/package.json", import.meta.url),
  );
  const { bootstrapApplication } = await import(
    pathToFileURL(require.resolve("@angular/platform-browser")).href
  );
  const { renderApplication, provideServerRendering } = await import(
    pathToFileURL(require.resolve("@angular/platform-server")).href
  );
  const { provideRouter, RouterOutlet } = await import(
    pathToFileURL(require.resolve("@angular/router")).href
  );
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
