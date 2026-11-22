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
  replaceEqualDeep,
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

// Asserts that `value` keeps Object's prototype and an own, ordinary "__proto__" data key, and
// returns the key's value.
function protoKey(value) {
  assert.equal(Object.getPrototypeOf(value), Object.prototype);

  const descriptor = Object.getOwnPropertyDescriptor(value, "__proto__");

  assert.deepEqual(Object.keys(descriptor).sort(), [
    "configurable",
    "enumerable",
    "value",
    "writable",
  ]);
  assert.equal(descriptor.writable && descriptor.enumerable && descriptor.configurable, true);

  return descriptor.value;
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
    const initial = await refetch();

    // Top level and nested: the prototype stays Object's and the key stays own data, while
    // unchanged branches keep their identity.
    const own = await refetch();

    assert.equal(own.canDelete, undefined);
    assert.deepEqual(protoKey(own), { canDelete: true });
    assert.equal(own.a.x, undefined);
    assert.deepEqual(protoKey(own.a), { x: 1 });
    assert.equal(own.b, initial.b);

    // Only nested, inside an array.
    const plain = await refetch();
    const nested = await refetch();

    assert.equal(nested.b[0].y, undefined);
    assert.deepEqual(protoKey(nested.b[0]), { y: 1 });
    assert.equal(nested.a, plain.a);

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
      assert.deepEqual(protoKey(options.structuralSharing(old, proto).a), { x: 1 });
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

test("structuralSharing follows the client default for the key, else Launch's sharing; overrides win", () => {
  const client = new QueryClient();
  const { queries, destroy } = setup({ client });
  const old = { a: {} };
  const equal = { a: {} };
  const proto = JSON.parse('{"a":{"__proto__":{"x":1}}}');

  try {
    const { structuralSharing } = queries.todos.list.queryOptions();
    const byIdSharing = queries.todos.byId.queryOptions({ id: "1" }).structuralSharing;

    // No client default: TanStack's sharing, keeping "__proto__" as data.
    assert.equal(structuralSharing(old, equal), old);
    assert.deepEqual(protoKey(structuralSharing(old, proto).a), { x: 1 });

    client.setDefaultOptions({ queries: { structuralSharing: true } });
    assert.equal(structuralSharing(old, equal), old);
    assert.deepEqual(protoKey(structuralSharing(old, proto).a), { x: 1 });

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

// Where a shared `result` reuses the old data ("old") or the new data ("new"), path by path.
function sharingOf(result, old, data) {
  if (result === old) {
    return "old";
  }

  if (result === data) {
    return "new";
  }

  if (typeof result !== "object" || result === null) {
    return result;
  }

  let shape = {};

  if (Array.isArray(result)) {
    shape = [];
  }

  for (const key of Object.keys(result)) {
    shape[key] = sharingOf(result[key], old?.[key], data?.[key]);
  }

  return shape;
}

test("structural sharing matches TanStack's replaceEqualDeep on ordinary data", () => {
  class Point {
    constructor(x) {
      this.x = x;
    }
  }

  const nullPrototype = (entries) => Object.assign(Object.create(null), entries);
  const sparse = (value) => {
    const items = [];

    items[1] = value;

    return items;
  };
  const chain = (depth, leaf) => {
    let value = { leaf };

    for (let level = 0; level < depth; level += 1) {
      value = { next: value };
    }

    return value;
  };
  const date = new Date(0);
  const point = new Point(1);
  const read = () => 1;
  const pairs = [
    ["equal", { a: 1, b: [1, 2], c: { d: "x" } }, { a: 1, b: [1, 2], c: { d: "x" } }],
    ["changed", { a: { x: 1 }, b: { y: 2 }, c: [1] }, { a: { x: 1 }, b: { y: 3 }, c: [1] }],
    ["array grown", [1, { a: 1 }], [1, { a: 1 }, { b: 2 }]],
    ["array shrunk", [1, { a: 1 }, { b: 2 }], [1, { a: 1 }]],
    ["key removed", { a: 1, b: 2 }, { a: 1 }],
    ["key added", { a: {} }, { a: {}, b: 1 }],
    ["undefined swapped", { a: undefined }, { b: undefined }],
    ["undefined added", { a: 1 }, { a: 1, b: undefined }],
    ["reordered", { a: { x: 1 }, b: 2 }, { b: 2, a: { x: 1 } }],
    [
      "nested",
      {
        list: [
          { id: 1, tags: ["a"] },
          { id: 2, tags: ["b"] },
        ],
      },
      {
        list: [
          { id: 1, tags: ["a"] },
          { id: 2, tags: ["c"] },
        ],
      },
    ],
    [
      "non-plain values",
      { date, other: new Date(0), map: new Map([[1, {}]]), point, read },
      { date, other: new Date(0), map: new Map([[1, {}]]), point, read },
    ],
    ["class instances", { p: new Point(1) }, { p: new Point(1) }],
    ["top-level instances", new Point(1), new Point(1)],
    ["null prototype equal", nullPrototype({ a: { x: 1 } }), nullPrototype({ a: { x: 1 } })],
    [
      "null prototype changed",
      nullPrototype({ a: { x: 1 }, b: 1 }),
      nullPrototype({ a: { x: 1 }, b: 2 }),
    ],
    ["null prototype and plain", nullPrototype({ a: { x: 1 } }), { a: { x: 1 } }],
    ["array and object", [1], { 0: 1 }],
    ["sparse arrays", sparse({ a: 1 }), sparse({ a: 1 })],
    ["no old data", undefined, { a: 1 }],
    ["primitives", 1, 2],
    ["null to object", null, {}],
    ["object to null", { a: 1 }, null],
    ["past the depth limit", chain(600, 1), chain(600, 2)],
    ["equal past the depth limit", chain(600, 1), chain(600, 1)],
  ];
  const { queries, destroy } = setup();

  try {
    const { structuralSharing } = queries.todos.list.queryOptions();

    for (const [name, old, data] of pairs) {
      const launch = structuralSharing(old, data);
      const tanstack = replaceEqualDeep(old, data);

      assert.deepEqual(launch, tanstack, name);
      assert.deepEqual(sharingOf(launch, old, data), sharingOf(tanstack, old, data), name);
    }
  } finally {
    destroy();
  }
});

test("structural sharing never compares or reuses the old data's prototype", () => {
  const { queries, destroy } = setup();

  try {
    const { structuralSharing } = queries.todos.list.queryOptions();

    // The old object has no own key, so its prototype isn't taken as the old value.
    const empty = structuralSharing({}, JSON.parse('{"__proto__":{}}'));

    assert.notEqual(protoKey(empty), Object.prototype);
    assert.deepEqual(protoKey(empty), {});

    // An own key on both sides is compared and shared like any other.
    const old = JSON.parse('{"__proto__":{"x":1},"a":1}');
    const changed = structuralSharing(old, JSON.parse('{"__proto__":{"x":1},"a":2}'));

    assert.equal(structuralSharing(old, JSON.parse('{"__proto__":{"x":1},"a":1}')), old);
    assert.equal(protoKey(changed), protoKey(old));
    assert.equal(changed.a, 2);

    // A key the new data dropped isn't copied.
    const dropped = structuralSharing(old, { a: 1 });

    assert.equal(Object.hasOwn(dropped, "__proto__"), false);
    assert.equal(Object.getPrototypeOf(dropped), Object.prototype);
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

test("structural sharing shares a cyclic plain object from select, keeping __proto__ as data", () =>
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

    // Shared the same way, with the key kept as data at every copied level.
    const third = (await observer.refetch()).data;

    assert.notEqual(third, selected[2]);
    assert.equal(third.n, 3);

    for (const level of [third, third.self]) {
      assert.equal(Object.getPrototypeOf(level), Object.prototype);
      assert.equal(level.x, undefined);
      assert.deepEqual(Object.getOwnPropertyDescriptor(level, "__proto__").value, { x: 1 });
    }
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

test("structural sharing reads a selected getter only where TanStack reads it", async () => {
  // Lazy getters, at a key and at an array index, that log each read and throw while armed.
  const reads = [];
  let armed = true;

  function view(n, { added = false } = {}) {
    const getter = (name) => ({
      enumerable: true,
      get() {
        reads.push(`${n}.${name}`);

        if (armed) {
          throw new Error(`${name} read`);
        }

        return { n };
      },
    });
    const rows = [];

    Object.defineProperty(rows, 0, getter("rows[0]"));

    const value = { n, rows };

    Object.defineProperty(value, "lazy", getter("lazy"));

    if (added) {
      value.added = { n };
    }

    return value;
  }

  const selected = [];
  let fetched = 0;
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
    createQueries(
      { profile: { read: () => Promise.resolve({ n: ++fetched }) } },
      { profile: { read: { kind: "query", input: false } } },
    ),
  );
  const observer = new QueryObserver(
    client,
    queries.profile.read.queryOptions({
      select: ({ n }) => {
        const value = view(n, { added: n === 2 });

        selected.push(value);

        return value;
      },
    }),
  );

  try {
    // Nothing to share with yet: the selected value comes back as it is, unread.
    const first = await observer.refetch();

    assert.equal(first.status, "success");
    assert.equal(first.data, selected[0]);
    assert.deepEqual(reads, []);

    // A new branch makes TanStack compare every key; nothing is read more than it reads.
    armed = false;

    const second = await observer.refetch();
    const observed = reads.splice(0);

    assert.equal(second.status, "success");
    replaceEqualDeep(view(1), view(2, { added: true }));
    assert.deepEqual(observed, reads);
    assert.deepEqual(observed, ["1.rows[0]", "2.rows[0]", "1.lazy", "2.lazy"]);
  } finally {
    observer.destroy();
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
