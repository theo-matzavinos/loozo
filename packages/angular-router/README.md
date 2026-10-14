# @loozo/angular-router

Typed routes for Angular's own router. You declare each route once with `defineRoute`: its path, its parent, and codecs for its path params, search params and fragments. A build step turns those declarations into an ordinary Angular `Routes` array plus a small typed module next to each route. Pages read parsed inputs as Angular Resources and build links and navigations that TypeScript checks against the target route.

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

```json
"build": {
  "builder": "@loozo/angular-router:application",
  "options": {
    "tsconfig": "tsconfig.routes.json",
    "scanDirectories": ["src/routes"],
    "outDirectory": "generated",
    "browser": "src/main.ts",
    "index": "src/index.html",
    "tsConfig": "tsconfig.app.json",
    "outputPath": "dist/app"
  },
  "configurations": { "ci": { "check": true } }
},
"serve": {
  "builder": "@loozo/angular-router:serve",
  "options": { "buildTarget": "app:build" }
}
```

The application builder takes the router options (`tsconfig`, `scanDirectories`, `outDirectory`, and optionally `check` and `autoDefineRoutes`) next to your normal Angular application options, which it passes through unchanged. The serve builder takes normal dev-server options and reads the router options from its `buildTarget`. See [Builder options](#builder-options).

Note that `tsconfig` and `tsConfig` are different options. `tsconfig` is the TypeScript config used to find route declarations; `tsConfig` is Angular's own compilation config. The example app uses a small `tsconfig.routes.json` that extends the app config:

```json
{
  "extends": "./tsconfig.app.json",
  "files": [],
  "include": ["src/**/*.ts"]
}
```

Your app's `tsconfig.app.json` must include the generated files, for example `"include": ["src/**/*.ts", "generated/**/*.ts"]`.

Then install the generated routes with Angular's `provideRouter`:

```ts
import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import Shell from "./shell.js";
import { routes } from "../generated/routes.generated.js";

void bootstrapApplication(Shell, { providers: [provideRouter(routes)] });
```

Use the Angular CLI as usual:

```sh
ng build                      # generate, then the official application build
ng serve                      # generate and watch, then the official dev server
ng build --configuration ci   # check generated files without writing them, then build
```

Commit the generated files along with your route declarations, and run the `ci` configuration in CI so drift fails the build.

## Quick start

A route is a directory under the scan directory with a declaration file and, optionally, a page. In explicit mode (the default) the file names are up to you: the builder finds declarations by their `export default defineRoute(...)` and pages by their default-exported standalone component, not by name.

```ts
// src/routes/product/definition.ts
import { defineRoute, enumParam, numberParam, optionalSearchParam } from "@loozo/angular-router";

export default defineRoute("products/$productId", {
  params: { productId: numberParam },
  search: { tab: optionalSearchParam(enumParam(["details", "reviews"])) },
  fragments: ["summary", "reviews"],
});
```

```ts
// src/routes/product/page.ts
import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterLink],
  template: `
    @if (route.params.hasValue() && route.search.hasValue()) {
      <h1>Product {{ route.params.value().productId }}</h1>
      <p>Tab: {{ route.search.value().tab ?? "details" }}</p>
    } @else if (route.params.error()) {
      <p>This product link isn't valid.</p>
    } @else {
      <p>Loading…</p>
    }
    <a [routerLink]="reviews">Reviews</a>
  `,
})
export default class Product {
  readonly route = injectRoute();
  readonly reviews = this.route.link({
    params: { productId: 42 },
    search: { tab: "reviews" },
    fragment: "reviews",
  });
}
```

Running `ng build` or `ng serve` writes `generated/routes.generated.ts`, `generated/destinations.generated.ts` and `src/routes/product/route.generated.ts`. The page is lazy-loaded with `loadComponent`.

The template checks `hasValue()` before reading values. A URL such as `/products/abc` still activates this route, because it has no guards or resolvers to reject it first, and then the params fail to parse. Reading `value()` in that error state throws.

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

No leading, trailing or repeated slashes. A catchall must be the last segment, a route can have at most one, and a catchall route can't have children. A root `$segments[]` route works as a not-found fallback; ordinary routes still match before it.

### Config

| Key                                                                    | Purpose                                                                                 |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `parent`                                                               | The parent route, imported as the parent declaration's default export                   |
| `params`                                                               | One codec per path param, keyed by bare name. Required exactly when the path has params |
| `search`                                                               | Codecs for query params                                                                 |
| `fragments`                                                            | The fragment names this route accepts                                                   |
| `resolve`                                                              | Resolvers that receive parsed inputs                                                    |
| `canActivate`, `canActivateChild`, `canMatch`                          | Guards that receive parsed inputs                                                       |
| `canDeactivate`, `providers`, `title`, `data`, `runGuardsAndResolvers` | Passed to Angular unchanged                                                             |
| `redirect`                                                             | A typed redirect to another route                                                       |

Structural keys such as `path`, `children`, `component`, `loadComponent`, `redirectTo`, `pathMatch`, `matcher` and `outlet` are rejected: generation owns them.

### Parents

```ts
// src/routes/team/definition.ts
export default defineRoute("teams/$teamId", {
  params: { teamId: numberParam },
  search: { score: optionalSearchParam(numberParam) },
});

// src/routes/item/definition.ts
import team from "../team/definition.js";

export default defineRoute("items/$id", {
  parent: team,
  params: { id: numberParam },
});
```

A child declares only its own params; it inherits its ancestors' params and search params, so the item route above has `params: { teamId, id }` and `search: { score }`. A child can't redeclare a param or search key its ancestors own. Pathless routes (`""` with a parent) add no URL segment but still contribute their inputs to descendants. A route with neither a page nor children is an error, unless it's a redirect.

### Codecs

| Codec                        | Value                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `stringParam`                | Any string, including `""`                                                   |
| `numberParam`                | A finite number (`" 42 "`, `"1e3"` and `"0x10"` parse; blank and `NaN` fail) |
| `booleanParam`               | Exactly `true` or `false`                                                    |
| `enumParam(values)`          | One of the listed strings, typed as their union                              |
| `optionalSearchParam(codec)` | Search only: the key may be absent                                           |
| `nullableSearchParam(codec)` | Search only: the literal value `null` maps to `null`                         |

Search params are required unless wrapped in `optionalSearchParam`. `optionalSearchParam(nullableSearchParam(codec))` distinguishes absent, `null` and a value. For a catchall, the codec applies to each segment, so `$segments[]` with `stringParam` produces `readonly string[]`.

A custom codec implements `ParamCodec<Value>`. `parse` receives the already-decoded text and may be async; `stringify` must be synchronous:

```ts
import type { ParamCodec } from "@loozo/angular-router";

export const slug: ParamCodec<string> = {
  parse(raw) {
    if (!/^[a-z0-9-]+$/.test(raw)) {
      throw new Error("invalid slug");
    }

    return raw;
  },
  stringify(value) {
    return value;
  },
};
```

`defineRoute` never calls parsers, guards, resolvers or other callbacks; it only records them.

The package root exports exactly `defineRoute`, `createUrl`, `stringParam`, `numberParam`, `booleanParam`, `enumParam`, `optionalSearchParam` and `nullableSearchParam`, plus the types `Route` and `ParamCodec`. The `_core`, `_generated` and `_generation` subpaths are internal coupling for generated code and `@loozo/angular-launch`, not application APIs.

### Fragments

`fragments: ["summary", "reviews"]` lists the fragment names you can pass when creating a URL to this route. Without the list (or with an empty list), the `fragment` option is not allowed. The names belong to this route only; children don't inherit them. Incoming hashes aren't validated, and the package doesn't scroll: provide matching element IDs and configure Angular's scrolling yourself.

## Building URLs

`createUrl` builds a root-relative URL from a declaration, synchronously and without running any parsers:

```ts
import { createUrl } from "@loozo/angular-router";
import product from "./routes/product/definition.js";

createUrl(product, {
  params: { productId: 42 },
  search: { tab: "reviews" },
  fragment: "summary",
}); // "/products/42?tab=reviews#summary"
```

All path params are required, including inherited ones. Search params follow their codecs (required, optional or nullable). Query keys are sorted, values are percent-encoded, and a `/` inside a param value becomes `%2F`. Catchall values are arrays:

```ts
const docs = defineRoute("docs/$segments[]", { params: { segments: stringParam } });

createUrl(docs, { params: { segments: ["guides", "setup"] } }); // "/docs/guides/setup"
createUrl(docs, { params: { segments: [] } }); // "/docs"
```

Pass `{}` for a route without params or search. Wrong values fail to type-check. Unknown keys fail to type-check in an object literal; an object passed through a variable can carry extra keys past TypeScript, but `createUrl` still throws a `TypeError` for them at runtime.

## Reading inputs and navigating

Each route that has a page or descendants with pages gets a colocated `route.generated.ts`; redirect routes, and parents left with only redirects below them, get none. It exports two things:

- `injectRoute()`: call it in an injection context (a field initializer or constructor) to get the handle for this route.
- `destination`: an inert reference to this route that other routes can link to.

```ts
import { injectRoute } from "./route.generated.js";

const route = injectRoute();

route.params; // Resource<{ teamId: number; id: number } | undefined>
route.search; // Resource<{ score?: number } | undefined>
route.data; // Resource<{ item: Item } | undefined>, local resolver results only
```

`params`, `search` and `data` are read-only Angular Resources, so `status()`, `isLoading()`, `hasValue()`, `value()` and `error()` all work. Check `hasValue()` before reading `value()`: reading the value of a Resource in the error state throws. While a navigation is in progress they're loading with `undefined` values rather than showing stale ones.

`params` and `search` are parsed together and settle together. If a codec fails after the route has activated, both are in the error state, and the error has `source` (`"path"` or `"search"`), `key` and `reason` (`"missing"`, `"repeated"` or `"invalid"`). `data` settles on its own and isn't affected by that failure, so check `params` or `search` for parsing errors, not `data`. A failed navigation is different: when a guard or resolver throws, for example, the routes still on screen report that error in all three Resources instead of stale values.

`data` holds this route's own resolver results only, not static `data`, parent data or the title.

Parsing keeps Angular's stability pending until the values are published, so server rendering waits for async codecs.

### Links and navigation

`link` returns an Angular `UrlTree` for `RouterLink`; `navigate` calls `Router.navigateByUrl` and returns Angular's own promise. Both take the same arguments:

```ts
import { destination as report } from "../report/route.generated.js";

route.link({ params: { teamId: 7, id: 8 } }); // this route
route.link(".", { params: { teamId: 7, id: 8 } }); // same as above
route.link("/teams/$teamId/items/$id", { params: { teamId: 7, id: 9 } }); // absolute
route.link("../..", { params: { teamId: 7 } }); // relative
route.navigate(report, { params: { reportId: 42 } }); // another route's destination
```

The first argument, when given, is a string literal selecting a route by its full authored path, never a concrete URL. Absolute selectors start with `/`. Relative selectors start with `.`, `./` or `..`; each `..` removes one segment of the path template, not one directory or parent. TypeScript only offers selectors that resolve to a known route, and the values are always typed for the selected route.

Values are never carried over from the current URL. Pass every required param and search value explicitly, and pass `fragment` only when the target declares it. There is no extras argument; use `RouterLink` inputs such as `replaceUrl` or `state` for those.

A `destination` must come from the same generated route set as the handle. Destinations are for `link` and `navigate` only; `createUrl` takes declarations.

## Guards, resolvers and redirects

`canActivate`, `canActivateChild` and `canMatch` take arrays of functions whose first argument is the parsed inputs. Angular's native arguments follow:

```ts
export default defineRoute("teams/$teamId", {
  params: { teamId: numberParam },
  canActivate: [({ params }) => params.teamId > 0],
});
```

| Guard              | Inputs                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| `canActivate`      | This route's params and search, including inherited ones                     |
| `canActivateChild` | The declaring (parent) route's params and search                             |
| `canMatch`         | This route's own path params plus all search params; no ancestor path params |
| `canDeactivate`    | Angular's native form, unchanged; no parsing                                 |

Guards return anything Angular accepts (`boolean`, `UrlTree`, `RedirectCommand`, or a Promise or Observable of those). If a codec fails, the navigation fails with that error before the guard runs.

Resolvers get the parsed inputs too, and `inject()` works at the start of the callback:

```ts
import { inject } from "@angular/core";
import { defineRoute, numberParam } from "@loozo/angular-router";
import team from "../team/definition.js";
import { ItemCatalog } from "../../catalog.js";

export default defineRoute("items/$id", {
  parent: team,
  params: { id: numberParam },
  runGuardsAndResolvers: "paramsOrQueryParamsChange",
  resolve: {
    item: ({ params, search }) => {
      const catalog = inject(ItemCatalog);

      return catalog({ teamId: params.teamId, id: params.id, score: search.score });
    },
  },
});
```

Angular's default rerun policy, `paramsChange`, reruns resolvers when the path or its path/matrix params change, but not when only search params change. Set `runGuardsAndResolvers` when a resolver reads search params, as above.

A redirect targets another declaration and must say what happens to search and fragment:

```ts
import { defineRoute, numberParam } from "@loozo/angular-router";
import team from "../team/definition.js";
import item from "../item/definition.js";

export default defineRoute("old-items/$id", {
  parent: team,
  params: { id: numberParam },
  redirect: {
    to: item,
    search: { mode: "drop" }, // or "preserve", or { mode: "replace", values }
    fragment: { mode: "drop" }, // or "preserve", or { mode: "replace", value }
  },
});
```

Params with the same name and compatible types are forwarded automatically; otherwise map them with `params: { targetKey: "sourceKey" }`. Values are parsed with the source codecs and written with the target's codecs. A redirect route can't have a page, children, `canActivate` or `canMatch`.

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

The builder then creates an editable `route.ts` in each directory that has a page but no declaration yet, and in the directories above it that need one. Directory names map to paths like this:

| Directory          | Path contribution                                                       |
| ------------------ | ----------------------------------------------------------------------- |
| The scan directory | `""`                                                                    |
| `products`, `$id`  | Its name                                                                |
| `+layout`          | `""`: a pathless route                                                  |
| `-helpers`         | Nothing: no route; directories inside attach to the nearest route above |

For `src/routes/products/$productId/page.ts`, the generated declaration looks like this:

```ts
import { defineRoute, stringParam } from "@loozo/angular-router";
import parent from "../route.js";

export default defineRoute("$productId", { parent, params: { productId: stringParam } });
```

These files are yours. Change the codecs, add search params, guards and resolvers; the builder leaves them alone. When you move or rename a directory, it updates only the path literal, the `parent` import, and a param key it can rename unambiguously. When it can't make an edit safely (for example, a removed param whose codec you customized), generation fails and asks you to fix the file. It never deletes declarations.

Directories without pages or declarations, like helper or empty directories, get no route. A `-` directory can't contain a page or a declaration with behavior.

Use `{ "filename": "definition.ts" }` to seed a different file name. It must be a plain `.ts` file name that isn't a generated file name. That only affects new files; existing declarations are found by content, whatever their name.

## Server rendering and hydration

The generated routes work with Angular SSR and `provideClientHydration` without extra setup; there's no transfer cache or custom renderer. Parsing and resolvers keep Angular's stability pending, so server-rendered HTML contains parsed values. A codec whose promise never settles keeps rendering pending; the package adds no timeout.

[`examples/angular-router/ssr-proof`](../../examples/angular-router/ssr-proof/README.md) is a working SSR app with async codecs, a resolver, a redirect and hydration.

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

The builder runs generation once, then the official application build. Invalid options stop the build before generation starts, and generation errors stop it before the Angular build runs. `watch: true` is rejected; use the serve builder for watching.

### `@loozo/angular-router:serve`

All `@angular/build:dev-server` options, plus:

| Option        | Type              | Default  | Description                                                                          |
| ------------- | ----------------- | -------- | ------------------------------------------------------------------------------------ |
| `buildTarget` | `string`          | required | A target that uses `@loozo/angular-router:application`. Router options come from it. |
| `poll`        | `number \| false` | `1000`   | File-watch polling interval in milliseconds, or `false` for no default.              |

The serve builder validates its dev-server options and the build target before generating anything. It watches the scan directory and regenerates when files are added, changed or removed. The initial generation must succeed before the dev server starts; later errors are logged, and the server keeps running until you fix them. The build target must not resolve `check: true`, because serving always writes generated files.

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
