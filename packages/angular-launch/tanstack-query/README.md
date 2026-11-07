# TanStack Query

`@loozo/angular-launch/tanstack-query` connects Launch procedures to [TanStack Query for Angular](https://tanstack.com/query/latest/docs/framework/angular/overview) (`@tanstack/angular-query`). Generation writes typed query and mutation options and keys for your groups, and server-rendered query data reaches the browser through TanStack's own hydration, with no request on load even with `staleTime: 0`.

It's optional. Without it, Launch never imports TanStack.

## Setup

Install the adapter. Launch supports `@tanstack/angular-query` `^5.0.0-rc.5` as an optional peer dependency, and is tested with `5.0.0-rc.5`:

```sh
pnpm add @tanstack/angular-query@5.0.0-rc.5
```

Turn on the `tanstackQuery` generation option in your `@loozo/angular-launch:application` build target (or pass `tanstackQuery: true` to `generate`):

```json
"options": {
  "tsconfig": "tsconfig.app.json",
  "scanDirectories": ["src/routes"],
  "outDirectory": "generated",
  "tanstackQuery": true
}
```

Each `rpc.generated.ts` then also exports `injectQueries()` and its type `Queries`, for the same groups as its `injectRpc()`. With the option off, generated files are exactly as without this entry point.

Add TanStack's provider and `provideLaunchQueries()` to the application's providers, which the server config inherits:

```ts
// src/config.ts
import { provideHttpClient } from "@angular/common/http";
import { provideClientHydration } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import type { ApplicationConfig } from "@angular/core";
import { provideLaunchQueries } from "@loozo/angular-launch/tanstack-query";
import { provideTanStackQuery, QueryClient } from "@tanstack/angular-query";
import { routes } from "../generated/routes.generated";

export const config: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideClientHydration(),
    provideRouter(routes),
    provideTanStackQuery(() => new QueryClient()),
    provideLaunchQueries(),
  ],
};
```

Pass `provideTanStackQuery` a factory, as above, not a shared client: the factory runs once per application, so every server render gets its own cache and one user's data never reaches another's page. `provideLaunchQueries()` belongs in the application's providers, not a route's or component's. `injectQueries()` throws without it.

## Queries and mutations

Call `injectQueries()` in an injection context, like `injectRpc()`, and pass its options to TanStack:

```ts
// src/routes/+authenticated/todos/page.ts
import { Component, inject } from "@angular/core";
import { injectMutation, injectQuery, QueryClient } from "@tanstack/angular-query";
import { injectQueries, injectRpc } from "./rpc.generated";

@Component({/* … */})
export default class Todos {
  readonly #rpc = injectRpc();
  readonly #queries = injectQueries();
  readonly #client = inject(QueryClient);
  readonly todos = injectQuery(() => this.#queries.todos.list.queryOptions());
  readonly #complete = injectMutation(() =>
    this.#queries.todos.complete.mutationOptions({
      onSuccess: () => this.#client.invalidateQueries({ queryKey: this.#queries.todos.$key() }),
    }),
  );

  async complete(id: string): Promise<void> {
    try {
      await this.#complete.mutateAsync({ id });
    } catch (error) {
      if (this.#rpc.todos.complete.isError(error) && error.code === "NOT_FOUND") {
        const missingId: string = error.data.id;
      }
    }
  }
}
```

Each query procedure has `queryOptions` and each mutation procedure `mutationOptions`, never both:

```ts
queries.todos.list.queryOptions(overrides?);           // a query without input
queries.todos.byId.queryOptions(input, overrides?);    // a query with input
queries.todos.byId.queryOptions(skipToken);            // disabled until there's an input
queries.todos.add.mutationOptions(overrides?);         // variables are the input
queries.todos.clear.mutationOptions(overrides?);       // no input: mutate() takes none
```

The options work anywhere TanStack takes them: `injectQuery`, `injectMutation`, `QueryClient.fetchQuery`, `ensureQueryData` and the like. `overrides` are any other TanStack options, such as `staleTime`, `select`, `enabled`, `onSuccess` or `onError`. They can't replace the key or the query or mutation function. Queries call the procedure with TanStack's `signal`, so a cancelled query aborts its HTTP request; mutations aren't cancelled.

The data is the procedure's output, or `select`'s result. Errors are typed `unknown`: narrow them with the callable's `isError`, as above. The rejection is the callable's own, so `isError` recognizes it.

## Keys

Keys start with `"launch"` and the namespace, so a shorter key matches every longer key under it:

| Call                                  | Key                                        |
| ------------------------------------- | ------------------------------------------ |
| `queries.todos.$key()`                | `["launch", "todos"]`                      |
| `queries.todos.list.key()`            | `["launch", "todos", "list"]`              |
| `queries.todos.byId.key()`            | `["launch", "todos", "byId"]`              |
| `queries.todos.byId.key({ id: "1" })` | `["launch", "todos", "byId", { id: "1" }]` |
| `queries.todos.add.key()`             | `["launch", "todos", "add"]`               |

`queryOptions` uses the full key: with the input as you passed it, or without one for a query without input. A query disabled with `skipToken` is keyed without input. `mutationOptions` uses the mutation's `key()` as its `mutationKey`.

Full query keys are tagged with the procedure's output type, so `client.getQueryData(queries.todos.list.key())` and `client.setQueryData(...)` are typed. `$key` can't clash with a procedure: Launch names can't contain `$`.

## Invalidation

Launch invalidates nothing itself; TanStack does, with the keys above. Invalidate in a mutation's `onSuccess`, by group, procedure or input:

```ts
onSuccess: () => client.invalidateQueries({ queryKey: queries.todos.$key() }),
```

Returning the promise, as here, keeps the mutation pending until the refetch finishes. A failed refetch doesn't fail the mutation, though: `invalidateQueries` resolves anyway, and the query keeps its previous data next to the error. To treat it as a failure, for example to tell the user the list may be out of date, pass `throwOnError`:

```ts
onSuccess: () =>
  client.invalidateQueries({ queryKey: queries.todos.$key() }, { throwOnError: true }),
```

`mutateAsync` then rejects with the refetch's error, although the write itself succeeded, and TanStack runs the mutation's `onError` for it. Don't combine this with an [optimistic update](#optimistic-updates): its rollback would undo a write that succeeded.

### After every write

To read every Launch query on screen again after any write, give the `QueryClient` a `MutationCache`, as the example does:

```ts
provideTanStackQuery(() => {
  // Writes whose onSettled has run: their server call is done.
  const settled = new WeakSet<object>();

  return new QueryClient({
    mutationCache: new MutationCache({
      onSettled: (_data, _error, _input, _result, mutation, { client }) => {
        settled.add(mutation);

        const unsettled = client.getMutationCache().findAll({
          mutationKey: ["launch"],
          status: "pending",
          predicate: (other) => !settled.has(other),
        });

        // A write still on its way reads for this one when it settles.
        if (unsettled.length > 0) {
          return undefined;
        }

        return client.invalidateQueries({ queryKey: ["launch"] });
      },
    }),
  });
}),
```

- Every Launch key starts with `"launch"`, so this matches every Launch query and mutation, of every group, and nothing else in the cache. Only active queries, ones a component observes, refetch; the others are marked stale and refetch when they next mount.
- `onSettled` also runs after a failed write, which can still mean the data changed: a declared `NOT_FOUND` for a todo deleted elsewhere does.
- TanStack awaits the cache's callbacks, before the mutation's own, so the mutation stays pending until the read finishes.
- Skipping while another write is still on its way keeps an earlier write's read from replacing a later write's optimistic data, and the last write reads once for all. Count only writes that haven't reached `onSettled`: a mutation stays pending until its callbacks finish, so with `isMutating() > 1` two writes that settle together, in different scopes, each see the other and both skip the read.
- Don't pass `throwOnError` here, for the reason above. To tell the user the read failed, show the query's own error next to its data: `todos.isError()` while `todos.data()` is still there.

## Optimistic updates

Launch adds nothing here either: TanStack's `onMutate` and `onError` work on the generated options, typed by the procedure. The [todos example](../../../examples/angular-launch/src/routes/+authenticated/todos/page.ts) completes and deletes todos this way:

```ts
const key = queries.todos.list.key();

injectMutation(() =>
  queries.todos.complete.mutationOptions({
    scope: { id: "todos" },
    onMutate: async ({ id }, { client }) => {
      // A read in flight would replace the optimistic data when it lands.
      await client.cancelQueries({ queryKey: key });

      const before = client.getQueryData(key)?.todos.find((todo) => todo.id === id);

      client.setQueryData(key, (list) => markCompleted(list, id));

      return { before };
    },
    onError: (error, { id }, result, { client }) => {
      // The server says it's gone: show that instead of the todo as it was.
      if (rpc.todos.complete.isError(error) && error.code === "NOT_FOUND") {
        client.setQueryData(key, (list) => withoutTodo(list, id));

        return;
      }

      const before = result?.before;

      if (before !== undefined) {
        client.setQueryData(key, (list) => withTodo(list, before));
      }
    },
  }),
);
```

`markCompleted`, `withoutTodo` and `withTodo` stand for updates of your procedure's output; the example's are on its page. The list is read again by the [`MutationCache` above](#after-every-write), or by your own `onSettled`.

- The key is tagged with the procedure's output, so `getQueryData` and `setQueryData` are typed, and `onMutate`'s result reaches `onError` typed, without annotations. `context.client` is the `QueryClient`.
- `cancelQueries` aborts the query's HTTP request, since generated queries pass TanStack's `signal`, so the handler sees its `signal` abort.
- The declared errors decide the rollback. The rejection is the callable's own, so `isError` recognizes the write's declared errors and framework codes, and nothing else: not a failed read of the list. Anything it doesn't recognize, such as a network failure, leaves the write's outcome unknown; restore the row and let the read tell.
- Undo the row you changed, not a snapshot of the whole list: with two writes pending, restoring the first's snapshot would also undo the second's change.
- Mutations with the same `scope` id reach the server one at a time, in order. TanStack still runs each `onMutate` at once, so the page shows every pending write.
- Don't let two pending writes change the same row: the second's `onMutate` saves the first's optimistic row, and if both fail, its rollback restores that. The example disables a row's controls while a write to it is pending.
- A read that starts while a write is pending replaces its optimistic data with the server's older state. The example disables Refresh while any write is pending. A refetch on window focus can do the same; the read after the last write corrects it.
- During server rendering, mutations are refused with `FORBIDDEN`, so none of this runs. A click made before the app hydrates is replayed by Angular's event replay, which `provideClientHydration()` turns on with incremental hydration, and the write then runs as above. Until then there's no feedback.

For an add, which needs the id the server gives it, TanStack's other approach fits better: render the pending mutation's `variables()` instead of writing to the cache.

## Server rendering and hydration

During server rendering, queries run in-process with the page request's context, like direct calls, and Angular waits for them before rendering. TanStack then writes the successful queries' data into the HTML, and the browser's `QueryClient` starts with it. Generated query functions call with `transferCache: false`, so the data appears in the HTML once, as TanStack's, not again in Angular's HTTP transfer cache. Direct calls, such as from resolvers, still use the transfer cache as described in the [package README](../README.md#server-rendering-and-hydration).

In the browser, a query with data normally refetches when it mounts if it's stale, which with the default `staleTime: 0` is always. Generated query options default `refetchOnMount` to `false` while the app hydrates, from bootstrap until the app is first stable, the same window Angular's HTTP transfer cache uses. So with `staleTime: 0` the first render shows the server's data and no RPC is made on load. After that, `refetchOnMount` follows your `QueryClient` defaults (`true` unless you change them), invalidation always refetches, and a query mounted later, for example after navigating back or from a `@defer` block that hydrates on interaction, refetches if it's stale. A `refetchOnMount` override replaces the default, including during hydration.

The window opens in any browser app, also one without server rendering. Queries without data load regardless, since `refetchOnMount` only applies to data that's already there; but a query with `initialData`, or one you put in the cache before the first page mounts, doesn't refetch on mount until the app is first stable.

The limits follow from TanStack's hydration:

- Only successful queries reach the browser. A query that fails during server rendering, with a declared error or a framework code, runs again over HTTP in the browser, with a fresh context. The handler runs twice, and the page shows whatever the second call returns.
- Queries are part of the HTML: only return data the user may see, and serve personalized pages with `Cache-Control: private, no-store`.
- Mutations are refused during server rendering with `FORBIDDEN`, as for direct calls.
- A query that rejects with `RpcRedirect` or `RpcNotFound` doesn't navigate: only guards and resolvers do, through [`rpcNavigationErrors`](../README.md#navigating-on-outcomes). Read the error and act on it in the page.
- Prerendering a page that runs a query fails the build, as for direct calls.

## Defaults

| Option           | Default                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retry`          | No retry for an `RpcError` (a framework failure or declared error), an `RpcRedirect` or an `RpcNotFound`; for anything else, your `QueryClient` default for the key, or three retries |
| `refetchOnMount` | `false` while hydrating; then your `QueryClient` default for the key, or `true`                                                                                                       |

Everything else is TanStack's or your `QueryClient`'s. Overrides replace either default per call. Your `QueryClient` defaults still apply through them: a default `retry` decides retries for errors other than those three, and a default `refetchOnMount` applies after hydration. On the server, TanStack's adapter defaults `retry` to `false`, so a failed query doesn't retry during server rendering.

## Limitations

- No infinite queries, mutation cancellation or persistence. Optimistic updates and invalidation are TanStack's, as [above](#invalidation): Launch adds no helpers for them.
- No options for [streams](../README.md#calling-streams): `injectQueries()` leaves them out. TanStack's `streamedQuery` keeps a query fetching until its stream ends, and the Angular adapter keeps the app from becoming stable while a query is fetching, which would hold hydration open as long as the stream runs. It's also still `experimental_streamedQuery` in query-core 5.104. Call the stream directly instead.
- Errors aren't dehydrated: a failed server query runs again in the browser.
- Only `@tanstack/angular-query`, not `@tanstack/angular-query-experimental`.
- No special handling for `@defer`: queries in a deferred block follow the same window, so ones that mount after the app is stable refetch when stale.
- TanStack also exports an `injectQueries` (for running several queries); import one of the two under another name if you need both in a file.
