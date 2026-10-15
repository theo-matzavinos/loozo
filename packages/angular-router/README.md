# @loozo/angular-router

Typed routes for Angular's own router. You declare each route once with `defineRoute`: its path, its parent, and codecs for its path params, search params and fragments. A build step turns those declarations into an ordinary Angular `Routes` array plus a small typed module next to each route. Pages read parsed inputs as Angular signals and build links and navigations that TypeScript checks against the target route.

Angular still does all the routing: matching, activation, guards, resolvers, redirects, history and lazy loading. This package doesn't add a second router; it generates the configuration Angular consumes.

Use it when you want route params, query params and links to be type-checked end to end in an Angular 22 application, and you're happy to run generation through the provided Angular builders.

**Status:** experimental and not yet broadly battle-tested. Version `0.0.3`, MIT license.

## Install

```sh
pnpm add @loozo/angular-router
```

Peer dependencies:

| Package           | Range     |
| ----------------- | --------- |
| `@angular/core`   | `^22.0.0` |
| `@angular/router` | `^22.0.0` |
| `@angular/build`  | `~22.2.0` |

The package is tested against Angular 22.2.2. The `@angular/build` range is narrow on purpose: the application builder's options schema is Angular's own application schema at the version the package was built against. An option added in a later Angular minor is rejected until the package is rebuilt against that minor.

## Setup

Generation runs inside two Angular builders that replace your project's `build` and `serve` builders. Both run the official Angular builders (`@angular/build:application` and `@angular/build:dev-server`) after generating, so everything else about your build stays the same.

In `angular.json`:

[angular.json](snippets/angular.json)

The application builder takes the router options (`tsconfig`, `scanDirectories`, `outDirectory`, and optionally `check` and `autoDefineRoutes`) next to your normal Angular application options, which it passes through unchanged. The serve builder takes normal dev-server options and reads the router options from its `buildTarget`. See [Builder options](#builder-options).

Note that `tsconfig` and `tsConfig` are different options. `tsconfig` is the TypeScript config used to find route declarations; `tsConfig` is Angular's own compilation config. The example app uses a small `tsconfig.routes.json` that extends the app config:

[tsconfig.routes.json](snippets/tsconfig.routes.json)

Your app's `tsconfig.app.json` must include the generated files, as its `"include"` does here:

[tsconfig.app.json](snippets/tsconfig.app.json)

Then install the generated routes with Angular's `provideRouter`:

[src/main.ts](snippets/src/main.ts)

Use the Angular CLI as usual:

```sh
ng build                      # generate, then the official application build
ng serve                      # generate and watch, then the official dev server
ng build --configuration ci   # check generated files without writing them, then build
```

Commit the generated files along with your route declarations, and run the `ci` configuration in CI so drift fails the build.

## Quick start

A route is a directory under the scan directory with a declaration file and, optionally, a page. In explicit mode (the default) the file names are up to you: the builder finds declarations by their `export default defineRoute(...)` and pages by their default-exported standalone component, not by name.

[src/routes/product/definition.ts](snippets/src/routes/product/definition.ts)

[src/routes/product/page.ts](snippets/src/routes/product/page.ts)

Running `ng build` or `ng serve` writes `generated/routes.generated.ts`, `generated/destinations.generated.ts` and `src/routes/product/route.generated.ts`. The page is lazy-loaded with `loadComponent`.

The template reads the signals directly: they hold the activated route's values from the moment the page is created. A URL such as `/products/abc` doesn't match this route at all: a path param that fails to parse makes Angular try its next route, such as a `$segments[]` not-found route. A missing, repeated or unknown `tab` reads as its fallback, `"details"`.

## Declaring routes

```ts
defineRoute(path, config);
```

`path` must be a string literal; TypeScript infers everything else without generic arguments.

### Paths

Paths are decoded segment text, not URLs:

| Path                    | Meaning                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| `""`                    | Root, or a pathless route when it has a parent                           |
| `"products"`            | A static segment                                                         |
| `"products/$productId"` | `$name` as a whole segment declares a path param                         |
| `"docs/$segments[]"`    | A terminal catchall: zero or more remaining segments, parsed as an array |
| `"$id/compare/$id"`     | A repeated param uses the same value in every position                   |

No leading, trailing or repeated slashes. A catchall must be the last segment, a route can have at most one, and a catchall route can't have children. A root `$segments[]` route works as a not-found fallback; ordinary routes still match before it, unless their path params fail to parse.

### Config

| Key                                                           | Purpose                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `parent`                                                      | The parent route, imported as the parent declaration's default export                   |
| `params`                                                      | One codec per path param, keyed by bare name. Required exactly when the path has params |
| `search`                                                      | Codecs for query params                                                                 |
| `fragments`                                                   | The fragment names this route accepts                                                   |
| `resolve`                                                     | Resolvers that receive parsed inputs                                                    |
| `canActivate`, `canActivateChild`, `canMatch`                 | Guards that receive parsed inputs                                                       |
| `onInvalidParams`                                             | What happens when this route's own path params fail to parse, instead of not matching   |
| `title`                                                       | A string, or a callback that receives parsed inputs                                     |
| `canDeactivate`, `providers`, `data`, `runGuardsAndResolvers` | Passed to Angular unchanged                                                             |
| `redirect`                                                    | A typed redirect to another route                                                       |

Structural keys such as `path`, `children`, `component`, `loadComponent`, `redirectTo`, `pathMatch`, `matcher` and `outlet` are rejected: generation owns them.

### Parents

[src/routes/team/definition.ts](snippets/src/routes/team/definition.ts)

[src/routes/member/definition.ts](snippets/src/routes/member/definition.ts)

A child declares only its own params; it inherits its ancestors' params and search params, so the member route above has `params: { teamId, memberId }` and `search: { score }`. A child can't redeclare a param or search key its ancestors own. Pathless routes (`""` with a parent) add no URL segment but still contribute their inputs to descendants. A route with neither a page nor children is an error, unless it's a redirect.

### Codecs

| Codec                        | Value                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `stringParam`                | Any string, including `""`                                                   |
| `numberParam`                | A finite number (`" 42 "`, `"1e3"` and `"0x10"` parse; blank and `NaN` fail) |
| `booleanParam`               | Exactly `true` or `false`                                                    |
| `enumParam(values)`          | One of the listed strings, typed as their union                              |
| `withFallback(codec, value)` | Search only: reads `value` when the key is missing, repeated or invalid      |

For a catchall, the codec applies to each segment, so `$segments[]` with `stringParam` produces `readonly string[]`.

Search params never stop a route from matching, and they never fail. Every search key is optional:

```ts
search: {
  page: withFallback(numberParam, 1),
  sort: enumParam(["asc", "desc"]),
}
```

| Search key           | Missing      | Repeated or invalid |
| -------------------- | ------------ | ------------------- |
| Plain codec (`sort`) | Absent       | Absent              |
| `withFallback`       | The fallback | The fallback        |

`sort` reads as `"asc" | "desc" | undefined`. A key with a fallback always reads a value (`page` is a `number`, never `undefined`). Links, `createUrl`, navigation and redirects can leave out any search key.

A custom codec implements `ParamCodec<Value>`. Both methods are synchronous: `parse` receives the already-decoded text and returns the value, and `stringify` returns the text:

[src/slug.ts](snippets/src/slug.ts)

Parsing should be pure and deterministic. A path codec runs twice per navigation: once while Angular matches routes and again for the activated route. A codec whose `parse` returns a Promise is a type error where you declare it; if one slips through (from JavaScript, say), the navigation fails with a `TypeError` rather than treating the value as invalid. Codecs don't run in an injection context and don't need one: load data in resolvers or guards instead.

`defineRoute` never calls parsers, guards, resolvers or other callbacks; it only records them.

The package root exports exactly `defineRoute`, `createUrl`, `stringParam`, `numberParam`, `booleanParam`, `enumParam` and `withFallback`, plus the types `Route` and `ParamCodec`. The `_core`, `_generated` and `_generation` subpaths are internal coupling for generated code and `@loozo/angular-launch`, not application APIs.

### Fragments

`fragments: ["summary", "reviews"]` lists the fragment names you can pass when creating a URL to this route. Without the list (or with an empty list), the `fragment` option is not allowed. The names belong to this route only; children don't inherit them. Incoming hashes aren't validated, and the package doesn't scroll: provide matching element IDs and configure Angular's scrolling yourself.

## Building URLs

`createUrl` builds a root-relative URL from a declaration, synchronously and without running any parsers:

[src/product-url.ts](snippets/src/product-url.ts)

All path params are required, including inherited ones. Search params are all optional: an omitted or `undefined` value leaves the key out. Query keys are sorted, values are percent-encoded, and a `/` inside a param value becomes `%2F`. Catchall values are arrays:

[src/docs-url.ts](snippets/src/docs-url.ts#catchall)

Pass `{}` for a route without params or search. Wrong values fail to type-check. Unknown keys fail to type-check in an object literal; an object passed through a variable can carry extra keys past TypeScript, but `createUrl` still throws a `TypeError` for them at runtime.

## Reading inputs and navigating

Each route that has a page or descendants with pages gets a colocated `route.generated.ts`; redirect routes, and parents left with only redirects below them, get none. It exports two things:

- `injectRoute()`: call it in an injection context (a field initializer or constructor) to get the handle for this route.
- `destination`: an inert reference to this route that other routes can link to.

[src/routes/item/inputs.ts](snippets/src/routes/item/inputs.ts#inputs)

`params`, `search` and `data` are read-only Angular signals holding the activated route's values. They have a value from the first read, even in the page's constructor, so there's no loading state to check. While a navigation is in progress they keep the values of the page that's still on screen. When a navigation reuses this route with new values (a new id, or new search params), all three change together. When a navigation is cancelled or fails, they keep their values; handle the error where Angular reports it: the rejected `navigate` promise, the `NavigationError` event or `withNavigationErrorHandler`. To show that a navigation is pending, read Angular's `Router.currentNavigation()` signal.

`data` holds this route's own resolver results only, not static `data`, parent data or the title.

Reading `params` or `search` throws only if a path codec rejects a value it accepted while matching, which a pure codec never does.

### Links and navigation

`link` returns an Angular `UrlTree` for `RouterLink`; `navigate` calls `Router.navigateByUrl` and returns Angular's own promise. Both take the same arguments:

[src/routes/item/links.ts](snippets/src/routes/item/links.ts)

The first argument, when given, is a string literal selecting a route by its full authored path, never a concrete URL. Absolute selectors start with `/`. Relative selectors start with `.`, `./` or `..`; each `..` removes one segment of the path template, not one directory or parent. TypeScript only offers selectors that resolve to a known route, and the values are always typed for the selected route.

Values are never carried over from the current URL. Pass every required param and search value explicitly, and pass `fragment` only when the target declares it. There is no extras argument; use `RouterLink` inputs such as `replaceUrl` or `state` for those.

A `destination` must come from the same generated route set as the handle. Destinations are for `link` and `navigate` only; `createUrl` takes declarations.

## Guards, resolvers and redirects

`canActivate`, `canActivateChild` and `canMatch` take arrays of functions whose first argument is the parsed inputs. Angular's native arguments follow:

[src/routes/report/definition.ts](snippets/src/routes/report/definition.ts)

| Guard              | Inputs                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| `canActivate`      | This route's params and search, including inherited ones                     |
| `canActivateChild` | The declaring (parent) route's params and search                             |
| `canMatch`         | This route's own path params plus all search params; no ancestor path params |
| `canDeactivate`    | Angular's native form, unchanged; no parsing                                 |

Guards return anything Angular accepts (`boolean`, `UrlTree`, `RedirectCommand`, or a Promise or Observable of those). Search values recover before any guard runs (absent, or the fallback). Path params that fail to parse decide whether a route matches, so a guard only sees valid ones. Every callback (guards, resolvers, `title` and `onInvalidParams`) is called synchronously in the injection context Angular provides, so `inject()` works at its start, before any `await`.

Every route with path params of its own or with search params gets a generated `canMatch` that parses them, search after the path. Search never decides the match. If a path param fails, the route doesn't match and Angular tries its next route, ending at the closest `$segments[]` catchall, so guards, resolvers and pages never see a value their codec rejects. Your own `canMatch` guards aren't called then. `onInvalidParams` replaces that outcome:

```ts
export default defineRoute("items/$id", {
  params: { id: numberParam },
  onInvalidParams: (error, routeConfig, segments, partialSnapshot) =>
    new RedirectCommand(inject(Router).parseUrl("/items")),
});
```

It receives the parse error (`source: "path"`, `key`, `reason`, and the codec's error as `cause`) and Angular's `canMatch` arguments, runs in the route's injection context, and returns `false` (try the next route), a `UrlTree` or a `RedirectCommand`, or a Promise or Observable of one. It can't return `true`: that, or throwing, fails the navigation. Write `async () => false as const` rather than `async () => false`, which TypeScript widens to `boolean`.

A value that parses but doesn't exist, such as an unknown slug, is still yours to handle, for example with a `canActivate` that returns `new RedirectCommand(notFoundUrl, { browserUrl: state.url })`: Angular renders your not-found route while the address bar keeps the requested URL. The not-found URL must not match the guarded route again, or the redirect loops.

Resolvers get the parsed inputs too:

[src/routes/item/definition.ts](snippets/src/routes/item/definition.ts)

`title` is a string or a callback like a resolver's that returns the title (or a Promise or Observable of it). Angular runs a title callback alongside the route's resolvers, so it can't read their results.

Angular's default rerun policy, `paramsChange`, reruns resolvers and the title callback when the path or its path/matrix params change, but not when only search params change. Set `runGuardsAndResolvers` when a resolver reads search params, as above.

A redirect targets another declaration and must say what happens to search and fragment:

[src/routes/old-item/definition.ts](snippets/src/routes/old-item/definition.ts)

Params with the same name and compatible types are forwarded automatically; otherwise map them with `params: { targetKey: "sourceKey" }`. Values are parsed with the source codecs and written with the target's codecs. A redirect route can't have a page, children, `canActivate`, `canMatch` or `onInvalidParams`; an invalid param in a redirect's source URL fails the navigation.

## Filesystem route definitions

By default you write every declaration, including its path and parent. If you'd rather derive them from directories, set `autoDefineRoutes` on the application target:

```json
"options": {
  "tsconfig": "tsconfig.routes.json",
  "scanDirectories": ["src/routes"],
  "outDirectory": "generated",
  "autoDefineRoutes": {}
}
```

A directory becomes a route when it has a page or a declaration. The builder creates an editable `route.ts` in each directory that has a page but no declaration yet. Every other directory, the scan directory included, isn't a route: it adds its name to the paths of the routes below it. Each route's parent is the nearest route above it.

| Directory          | Path contribution                                                           |
| ------------------ | --------------------------------------------------------------------------- |
| `products`, `$id`  | Its name                                                                    |
| `+layout`          | `""`: a pathless route when it has a page or declaration, otherwise nothing |
| The scan directory | `""`: the root route when it has a page or declaration, otherwise nothing   |
| `-helpers`         | Nothing, and never a route; routes inside attach to the nearest route above |

For example, with pages in `src/routes/$package/` and `src/routes/$package/guide/$guide/` but none in `guide/`:

```text
src/routes/
  $package/
    page.ts
    route.ts          defineRoute("$package", …): no parent
    guide/            no page: adds "guide" to the path below
      $guide/
        page.ts
        route.ts      defineRoute("guide/$guide", …): parent is $package
```

The generated declaration for `$package/guide/$guide/page.ts` looks like this:

```ts
import { defineRoute, stringParam } from "@loozo/angular-router";
import parent from "../../route.js";

export default defineRoute("guide/$guide", { parent, params: { guide: stringParam } });
```

Angular gets `{ path: ":package", children: [{ path: "guide/:guide" }] }`, the same routes as writing those two declarations by hand, so `/angular-router/guide` on its own matches neither of them. If a directory without a page needs behavior of its own, such as a guard or resolver shared by the routes below it, add a declaration to it. It then becomes a componentless route and the parent of the routes below it. Angular also matches its bare URL (`/angular-router/guide`) when no child does, and SSR prerendering lists it as a route.

These files are yours. Change the codecs, add search params, guards and resolvers; the builder leaves them alone. When you move or rename a directory, or a route above it appears or disappears, the builder updates only the path literal, the `parent` property and its import, and the local params where the change is unambiguous: it renames a single changed param key and keeps its codec, and when params are only added (for example, a declaration moved under a page-less `$team` directory) it keeps every existing codec and adds a `stringParam` codec per new param, also to a declaration that had no params. It reuses your `stringParam` import when the file has one, and otherwise imports it as `stringParam`, or `filesystemStringParam` when the file already uses that name. When it can't make an edit safely (for example, a removed param whose codec you customized, or params spread from another object), generation fails and asks you to fix the file. It never deletes declarations.

A new import goes on its own line after the file's last import and any comment on that import's line. When that comment spans lines or carries a directive for the next line (such as `// @ts-expect-error`), the new import goes before the comment instead, so the directive keeps its target. A new parent import is named `parent`, or `filesystemParent` when the file already uses that name. When an existing parent import still points at a route that's no longer the parent, for example because you added a declaration between them, it's repointed and renamed to `parent`. When it no longer resolves, because its file moved or its target was deleted, it's repointed and keeps its name. An import that's used for more than the `parent` property is left alone, and a new parent import is added beside it.

A `-` directory can't contain a page or a declaration with behavior.

Use `{ "filename": "definition.ts" }` to seed a different file name. It must be a plain `.ts` file name that isn't a generated file name. That only affects new files; existing declarations are found by content, whatever their name.

## Server rendering and hydration

The generated routes work with Angular SSR and `provideClientHydration` without extra setup; there's no transfer cache or custom renderer. Parsing is synchronous and resolvers keep Angular's stability pending, so server-rendered HTML contains parsed values and resolved data.

[`examples/angular-router/ssr-proof`](../../examples/angular-router/ssr-proof/README.md) is a working SSR app with a search fallback, a resolver, a redirect and hydration.

## What gets generated

| File                                       | Contents                                                      |
| ------------------------------------------ | ------------------------------------------------------------- |
| `<outDirectory>/routes.generated.ts`       | `routes: Routes` for `provideRouter`                          |
| `<outDirectory>/destinations.generated.ts` | Shared typing and navigation data (when any route has a page) |
| `route.generated.ts` beside each route     | `injectRoute()` and `destination`; none for redirect routes   |

Each generated file starts with an ownership marker comment such as `// @loozo/angular-router routegen: owned route.generated.ts`. The builder only replaces or deletes marked files with those exact names. It never overwrites an unmarked file in their place, and it removes stale marked files when their routes disappear. Hand edits to generated files are overwritten.

Generation reads your source without importing or running it. It validates everything (declarations, overlapping routes, redirects, file ownership) before writing anything, so a run that fails validation leaves your files as they were. Files are then written one at a time, with no rollback: if writing fails partway, for example on a file that isn't writable, or the run is interrupted, some files may already be updated. The next successful run repairs them. Unchanged files aren't rewritten, so their modification times stay the same.

With `check: true`, the builder computes the same result but writes nothing. It fails if any generated file is changed, missing or stale, and the Angular build doesn't run.

Generation checks route structure, not your whole program. Type errors elsewhere still show up in the Angular build itself.

## Builder options

### `@loozo/angular-router:application`

All `@angular/build:application` options, plus:

| Option             | Type                    | Default  | Description                                                                                                                         |
| ------------------ | ----------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `tsconfig`         | `string`                | required | TypeScript config used to find route declarations. Relative to the workspace root.                                                  |
| `scanDirectories`  | `string[]`              | required | Exactly one directory containing your routes. Relative to the `tsconfig` file's directory.                                          |
| `outDirectory`     | `string`                | required | Where `routes.generated.ts` and `destinations.generated.ts` go. Relative to the workspace root; must be outside the scan directory. |
| `check`            | `boolean`               | `false`  | Verify generated files without writing them. Fails on any drift.                                                                    |
| `autoDefineRoutes` | `{ filename?: string }` | omitted  | Enable [filesystem route definitions](#filesystem-route-definitions). `filename` defaults to `route.ts`.                            |

The builder runs generation once, then the official application build. Invalid options stop the build before generation starts. Generation errors, including drift in check mode, are logged and fail the build before the Angular build runs. `watch: true` is rejected; use the serve builder for watching.

### `@loozo/angular-router:serve`

All `@angular/build:dev-server` options, plus:

| Option        | Type              | Default  | Description                                                                          |
| ------------- | ----------------- | -------- | ------------------------------------------------------------------------------------ |
| `buildTarget` | `string`          | required | A target that uses `@loozo/angular-router:application`. Router options come from it. |
| `poll`        | `number \| false` | `1000`   | File-watch polling interval in milliseconds, or `false` for no default.              |

The serve builder validates its dev-server options and the build target before generating anything. It watches the scan directory and regenerates when files are added, changed or removed. The initial generation must succeed before the dev server starts; if it fails, the error is logged and the builder reports a failed build. Later errors are logged, and the server keeps running until you fix them. The build target must not resolve `check: true`, because serving always writes generated files.

Polling is on by default because Angular 22.2.2's native file watcher misses edits to files inside a renamed directory, which leaves the dev server serving stale output. Polling costs some idle CPU (about 3% of one core on the example app at 1000 ms, against under 0.1% without), and more on larger workspaces.

To go back to native file events, set `"poll": false` in the serve target or one of its configurations. The router then adds no default, and Angular's own configuration applies, including a `poll` set on the build target. A positive number overrides the build target's `poll`. `0` is rejected. On the command line, `--poll` accepts milliseconds only; set `false` in `angular.json`.

## Limitations

- No standalone generation CLI or public route-graph API. Generate through the two builders.
- Route and page files must be `.ts`; `.mts`, `.cts` and `.tsx` are ignored.
- Primary outlet only: no named outlets, custom matchers or `loadChildren`.
- One scan directory per application.
- No data, URL or transfer caches. Resolver data lives in Angular.
- Relative navigation from a catchall route isn't supported; use `"."` or an absolute selector.
- Angular 22.2.2 drops a resolver result named `__proto__`, so a resolver with that name has no value in `data`.
- Writes are individual file replacements. A write error or an interrupted run can leave mixed output; the next successful run repairs it.

## Further reading

- [`SPEC.md`](SPEC.md): the full contract, including every edge case
- [`examples/angular-router`](../../examples/angular-router/): a minimal app using the builders
- [`examples/angular-router/ssr-proof`](../../examples/angular-router/ssr-proof/README.md): SSR and hydration

## Developing this package

Requires Node 24.21.0 and pnpm 12.9.1. Install from the workspace root with `pnpm_config_pm_on_fail=error pnpm_config_verify_deps_before_run=error pnpm install --frozen-lockfile`. From this directory:

```sh
pnpm run build                 # Node builders/generation (tsc), then the Angular package (ng-packagr)
pnpm run check                 # formatting and lint
pnpm run typecheck             # strict source typecheck
pnpm run typecheck:consumers   # consumer typecheck against the built package (NodeNext and Bundler)
pnpm run test                  # root runtime, published-docs and schema tests
```

`build` regenerates `schemas/application.json` from the installed `@angular/build`; `pnpm test` fails when the committed schema is stale.

The browser tests use real Angular builds and Chromium (`/usr/bin/chromium`). Each takes a fresh absolute directory, which must not exist yet, for its evidence:

```sh
pnpm run test:application /absolute/new-directory
pnpm run test:navigation /absolute/new-directory
pnpm run test:lifecycle /absolute/new-directory
pnpm run test:ssr /absolute/new-directory
pnpm run test:filesystem /absolute/new-directory
node tests/packed.mjs /absolute/new-directory   # packed-package consumer check
```

To run the example app from the workspace root after building the package:

```sh
pnpm --filter @loozo/angular-router run example:build   # generate + build
pnpm --filter @loozo/angular-router run example:check   # check generated files + build
pnpm --filter @loozo/angular-router run example:serve   # generate + dev server
```
