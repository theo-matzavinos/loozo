# TanStack Query

`@loozo/angular-launch/tanstack-query` connects Launch procedures to [TanStack Query for Angular](https://tanstack.com/query/latest/docs/framework/angular/overview) (`@tanstack/angular-query`). Generation writes typed query and mutation options and keys for your groups, and server-rendered query data reaches the browser through TanStack's own hydration, with no request on load even with `staleTime: 0`.

It's optional. Without it, Launch never imports TanStack.

## Setup

Install the adapter. Launch supports `@tanstack/angular-query` `^5.0.0-rc.5` as an optional peer dependency, and is tested with `5.0.0-rc.5`:

```sh
pnpm add @tanstack/angular-query@5.0.0-rc.5
```

Turn on the `tanstackQuery` generation option:

```js
// generate.mjs
import { generate } from "@loozo/angular-launch/generation";

await generate(import.meta.dirname, {
  tsconfig: "tsconfig.app.json",
  scanDirectories: ["src/routes"],
  outDirectory: "generated",
  tanstackQuery: true,
  check: process.argv.includes("--check"),
});
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

Nothing is invalidated for you. Invalidate in a mutation's `onSuccess`, by group, procedure or input:

```ts
onSuccess: () => client.invalidateQueries({ queryKey: queries.todos.$key() }),
```

Returning the promise, as here, keeps the mutation pending until the refetch finishes. A failed refetch doesn't fail the mutation, though: `invalidateQueries` resolves anyway, and the query keeps its previous data next to the error. To treat it as a failure, for example to tell the user the list may be out of date, pass `throwOnError`:

```ts
onSuccess: () =>
  client.invalidateQueries({ queryKey: queries.todos.$key() }, { throwOnError: true }),
```

`mutateAsync` then rejects with the refetch's error, although the write itself succeeded.

## Server rendering and hydration

During server rendering, queries run in-process with the page request's context, like direct calls, and Angular waits for them before rendering. TanStack then writes the successful queries' data into the HTML, and the browser's `QueryClient` starts with it. Generated query functions call with `transferCache: false`, so the data appears in the HTML once, as TanStack's, not again in Angular's HTTP transfer cache. Direct calls, such as from resolvers, still use the transfer cache as described in the [package README](../README.md#server-rendering-and-hydration).

In the browser, a query with data normally refetches when it mounts if it's stale, which with the default `staleTime: 0` is always. Generated query options default `refetchOnMount` to `false` while the app hydrates, from bootstrap until the app is first stable, the same window Angular's HTTP transfer cache uses. So with `staleTime: 0` the first render shows the server's data and no RPC is made on load. After that, `refetchOnMount` follows your `QueryClient` defaults (`true` unless you change them), invalidation always refetches, and a query mounted later, for example after navigating back or from a `@defer` block that hydrates on interaction, refetches if it's stale. A `refetchOnMount` override replaces the default, including during hydration.

The window opens in any browser app, also one without server rendering. Queries without data load regardless, since `refetchOnMount` only applies to data that's already there; but a query with `initialData`, or one you put in the cache before the first page mounts, doesn't refetch on mount until the app is first stable.

The limits follow from TanStack's hydration:

- Only successful queries reach the browser. A query that fails during server rendering, with a declared error or a framework code, runs again over HTTP in the browser, with a fresh context. The handler runs twice, and the page shows whatever the second call returns.
- Queries are part of the HTML: only return data the user may see, and serve personalized pages with `Cache-Control: private, no-store`.
- Mutations are refused during server rendering with `FORBIDDEN`, as for direct calls.
- Prerendering a page that runs a query fails the build, as for direct calls.

## Defaults

| Option           | Default                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `retry`          | No retry for an `RpcError` (a framework failure or declared error); for anything else, your `QueryClient` default for the key, or three retries |
| `refetchOnMount` | `false` while hydrating; then your `QueryClient` default for the key, or `true`                                                                 |

Everything else is TanStack's or your `QueryClient`'s. Overrides replace either default per call. Your `QueryClient` defaults still apply through them: a default `retry` decides retries for errors other than an `RpcError`, and a default `refetchOnMount` applies after hydration. On the server, TanStack's adapter defaults `retry` to `false`, so a failed query doesn't retry during server rendering.

## Limitations

- No infinite queries, optimistic-update helpers, automatic invalidation, mutation cancellation or persistence.
- Errors aren't dehydrated: a failed server query runs again in the browser.
- Only `@tanstack/angular-query`, not `@tanstack/angular-query-experimental`.
- No special handling for `@defer`: queries in a deferred block follow the same window, so ones that mount after the app is stable refetch when stale.
- TanStack also exports an `injectQueries` (for running several queries); import one of the two under another name if you need both in a file.
