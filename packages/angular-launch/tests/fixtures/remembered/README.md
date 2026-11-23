# Remembered search recovery fixture

A Launch app built with Launch's own builder and rendered by `AngularNodeAppEngine`, so `rpcNavigationErrors`' retry runs through generated routes, `provideSearchStorage(searchCookies())`, the router's own `currentSearchRestore()` and `provideActiveRouteHydration()`. Each route remembers a `filter` search key with the fallback `all`:

- `orders`, whose query handler gets the filter as input and throws `notFound()` for one that no longer exists (`archived`). It also remembers `pageSize` (fallback 20) and sets a `launch-own` cookie on every run.
- `cached`, whose `.context()` stage reads the request's `search.cached.filter` cookie and throws `notFound()` for `archived`. Launch keeps a stage's result for the request scope, refusals included, so a server render's retry gets the same refusal.
- `missing`, whose handler throws `notFound()` for every filter.
- `not-found`, the handler's not-found page, and `outside`, where client navigations start.

`src/trace.ts` records the app's router events and each call of the navigation error handler, and on the server sends them as the `x-proof-trace` response header. `src/fixture.server.ts` records every stage and handler run, which `src/server.ts` serves at `/__proof/calls`. In the browser, `src/app.ts` exposes the shell's first active-route read, taken before any navigation succeeded, and a navigate function as `globalThis.proof`. It's a test surface, not production hosting.

Generated files aren't committed. After building the router and Launch, and installing the Launch example's dependencies, run from the repository root:

```sh
pnpm --dir packages/angular-launch run test:remembered /absolute/new-directory
```

It copies the app into a temporary directory, links the example's dependencies, builds the `development` and `production` configurations, and for each one enters every route twice through Node's writer, replaying the first entry's cookies, then in Chromium twice by document (a new tab each time) and twice by client navigation. The directory gets each build's log, the server's output, every response's HTML, screenshots and `<build>.json` with every entry's status, cookies, trace, calls, seed, first read and browser RPCs. The Launch example's `verify` runs it too, which is how CI's `launch-browser` job runs it.
