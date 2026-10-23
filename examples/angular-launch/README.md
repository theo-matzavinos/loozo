# Personal todos: native Launch consumer

A bounded read/write consumer using actual static generation, not handwritten generated facades or routes. Requires built workspace packages.

```sh
pnpm --filter @loozo/angular-router build
pnpm --filter @loozo/angular-launch build
pnpm --dir examples/angular-launch build
pnpm --dir examples/angular-launch exec ng run todos:build:verification
node examples/angular-launch/dist/todos/server/server.mjs
# LAUNCH_READY http://127.0.0.1:PORT
node examples/angular-launch/verify.mjs http://127.0.0.1:PORT /absolute/absent/evidence
```

The loopback server uses **test-only** `proof-user=alice` / `proof-user=bob` cookies and an in-memory database. It is not production authentication or deployment infrastructure. Visit `/todos`, `/identity`, `/uncached` or `/static`; dark mode is the default.

The server's maintenance rule is `angular.handle(scope.request, scope)`, using the generated app binding. The private request token survives Angular's proxy-header sanitization clone; it is never added to browser RPC headers. This detects wrong app/request/scope pairing, not incorrect authentication or arbitrary server code.

Generation runs with `tanstackQuery: true`, and the app provides `provideTanStackQuery(() => new QueryClient())` and `provideLaunchQueries()` with TanStack's default `staleTime: 0`. The todos page reads `todos.list` through `injectQuery` and writes through `injectMutation`; the todos resolver still calls ancestor/pathless `session.current` directly. Both use the one context value per HTML request. Hydration makes no RPC: TanStack hydrates the list from its own state in the HTML, and the resolver reuses its native POST transfer cache entry. Refresh after stability refetches over real HTTP with a fresh context. `/identity` reads `session.current` only through `injectQuery`. Context, handler, database and schema modules never enter the browser graph.

The labelled native form adds trimmed titles of 1–200 characters. Complete sets an owned todo's `completed` state to true idempotently; it does not toggle. Pending controls are disabled, status/error feedback is live, failed input is retained, and each successful mutation invalidates the `todos` group, which reads the list again before the mutation settles. The invalidation uses `throwOnError`, so if that read fails the page asks you to refresh instead of reporting success. The per-user in-memory store survives **browser refresh**, not server restart. Foreign/missing IDs return declared `NOT_FOUND` with `{id}` and do not change either user's rows. No optimistic UI or automatic invalidation is included.

`pnpm generate -- --check` checks artifacts without writing. Outputs are ignored and owned by the genuine generator. Do not format generated outputs independently.

Native qualification:

```sh
pnpm --dir examples/angular-launch exec ng run todos:build:prerender # prerenders /identity; must exit nonzero
pnpm --dir examples/angular-launch exec ng run todos:build:static    # emits /static/index.html
```

The `verification` configuration uses a test-only browser entry exposing cancellation, typed-error and client-navigation hooks, not extra product UI; the normal entry has no hooks. A test-only delay cookie makes the same read slow enough to prove native HTTP cancellation without claiming server cancellation. The loopback-only `proof-failure` cookie exercises generic unexpected-failure normalization; private exception details never appear in the client frame. `proof-ssr-failure` fails the list only while rendering HTML, so the browser's own call succeeds. Cancelled writes may already have committed; there is no rollback guarantee.

`verify.mjs` uses `/usr/bin/chromium` and saves private HTML, request/context, cancellation and browser-closure evidence only in the supplied new directory. Package tests cover generator scopes, mutation kinds, async schema input/output typing, semantic prepublication, genuine factory provenance, procedure-owned declared errors, actual native SSR mutation denial and runtime boundaries. Browser verification includes zero load-time RPCs with `staleTime: 0` (with a client-navigation control that does refetch), each user's todos in the server-rendered list even with a slow handler, TanStack state in the HTML without a duplicate HTTP transfer entry, keyboard add → complete → reload with invalidation refetches, a write whose list refetch fails reporting the refresh warning instead of success, a failed server query loading in the browser, second-user isolation, invalid/denied no-write checks, typed declared payloads, generic failures and one batched desktop/narrow screenshot pass. It finally runs the prerender build, which must fail for `/identity`. There is no storage adapter, production auth/CSRF/CORS policy or Launch builder/watch.
