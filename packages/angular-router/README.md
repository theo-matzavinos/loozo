# @loozo/angular-router

Typed routes for Angular's own router. Each route is a directory holding a `defineRoute` declaration and, usually, a page. The declaration holds the route's path, its parent, and codecs for its path params, search params and fragments; the directories give the path and parent, and a build step keeps them in step. The build step then turns the declarations into an ordinary Angular `Routes` array plus two small typed modules next to each route. Pages read parsed inputs as Angular signals and build links and navigations that TypeScript checks against the target route.

Angular still does all the routing: matching, activation, guards, resolvers, redirects, history and lazy loading. This package doesn't add a second router; it generates the configuration Angular consumes.

Use it when you want route params, query params and links to be type-checked end to end in an Angular 22 application, and you're happy to run generation through the provided Angular builders.

**Status:** stable from 1.0.0: from that release on, breaking changes come only in major releases (see [Versions](#versions)). MIT license.

## Install

```sh
pnpm add @loozo/angular-router
```

Peer dependencies:

| Package             | Range     |
| ------------------- | --------- |
| `@angular/core`     | `^22.0.0` |
| `@angular/common`   | `^22.0.0` |
| `@angular/router`   | `^22.0.0` |
| `@angular/build`    | `~22.3.0` |
| `@angular/localize` | `^22.0.0` |

`@angular/localize` is optional for the router: it needs it only for [translated URLs](#translated-urls) (`translateSegments`). Angular's own i18n needs it too, so a localized application installs it either way. The ranges admit more Angular versions than a release supports; see [Angular versions](#angular-versions).

## Versions

From 1.0.0, releases follow [semantic versioning](https://semver.org) over the contract in [`SPEC.md`](SPEC.md): the exports and their types, the builder names and options, the generated file names and what they export, and the behavior it specifies. Its [Stability](SPEC.md#stability) section lists what's public and what isn't.

- A patch (1.0.0 → 1.0.1) fixes bugs or improves the docs.
- A minor (1.0.x → 1.1.0) adds something without breaking the contract, such as an export, an option or a codec. A move to a new Angular minor is a minor too (see [Angular versions](#angular-versions)).
- A major (1.x → 2.0.0) breaks the contract. A move to a new Angular major is a major too.
- Error messages explain a failure; their wording may improve in any release. When and how something fails is part of the contract.
- Generated files aren't part of the contract byte for byte, only their names, locations and what your code uses from them, so any release, a patch included, may change their contents, and a release supports only the generated files it writes itself. After upgrading, run `ng build` (or `ng serve`) once and commit the regenerated files. Until then, the CI check (`ng build --configuration ci`) fails on them, and `ng test`, `ng extract-i18n` and your editor read the old ones, which the new release doesn't support.

Each release's breaking changes, features and fixes are listed in its [GitHub release](https://github.com/theo-matzavinos/loozo/releases?q=angular-router&expanded=true).

## Angular versions

Each release supports one Angular minor: the latest stable one when it was published, named by the `@angular/build` range. This release supports Angular 22.3 and is tested against 22.3.0. One release can't serve two minors: the application builder's options schema is Angular's own application schema at the version the package was built against, so an option added in a later Angular minor is rejected until the package is rebuilt against that minor.

When Angular ships a new minor or major, a release built against it follows within a week. Earlier minors stay on the release that supported them; fixes aren't backported. [`@loozo/angular-launch`](../angular-launch/README.md) pins the router exactly and releases in lockstep: each router release is followed by a Launch release that pins it.

From 1.0.0, a release for a new Angular minor is a router minor, and a release for a new Angular major is a router major. For example, router 1.x supports Angular 22.3; when Angular 22.4 ships, router 1.(x+1) supports 22.4 alone, and when Angular 23 ships, router 2.0 supports 23.0. That minor is the one exception to strict semantic versioning over peer ranges: a `^1.x` range picks it up, and it needs the new Angular minor. Angular minors don't break applications, so update Angular's minor when you update the router. To stay on an Angular minor, keep the router on a `~` range, such as `~1.3.0`, until you move Angular.

A weekly canary builds and tests the package against Angular's `latest` and `next` releases, so the release for a new minor is usually ready when Angular ships it.

## Setup

Generation runs inside two Angular builders that replace your project's `build` and `serve` builders. Both run the official Angular builders (`@angular/build:application` and `@angular/build:dev-server`) after generating, so everything else about your build stays the same.

In `angular.json`:

[angular.json](snippets/angular.json)

The application builder takes the router options (`tsconfig`, `scanDirectories`, `outDirectory`, and optionally `check`, `translateSegments` and `autoDefineRoutes`) next to your normal Angular application options, which it passes through unchanged. The serve builder takes normal dev-server options and reads the router options from its `buildTarget`. See [Builder options](#builder-options).

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

A route is a directory under the scan directory with a page, a `route.ts` declaration, or both. The directories give the path: a page in `src/routes/products/$productId/` is the route `products/$productId`, where `$productId` is a path param. Add the page, and the first `ng build` or `ng serve` creates its declaration with a `stringParam` codec for `productId`. The declaration is yours to edit; here the codec is now `numberParam`, with a search param and fragments added:

[src/routes/products/$productId/route.ts](snippets/src/routes/products/$productId/route.ts)

[src/routes/products/$productId/page.ts](snippets/src/routes/products/$productId/page.ts)

Running `ng build` or `ng serve` also writes `generated/routes.generated.ts`, and `destination.generated.ts` and `route.generated.ts` in `src/routes/products/$productId/`. The page is lazy-loaded with `loadComponent`. See [Filesystem route definitions](#filesystem-route-definitions) for how directories map to paths and parents, and [Explicit authoring](#explicit-authoring) to write every path and parent yourself instead.

The template reads the signals directly: they hold the activated route's values from the moment the page is created. A URL such as `/products/abc` doesn't match this route at all: a path param that fails to parse makes Angular try its next route, such as a `$segments[]` not-found route. A missing, repeated or unknown `tab` reads as its fallback, `"details"`.

## Declaring routes

```ts
defineRoute(path, facts).step(argument)…;
```

`path` must be a string literal; TypeScript infers everything else, and generation rejects type arguments on the `defineRoute` call itself (a step's are fine). In the facts and the helpers they use, the parent import may only be the `parent:` value; for the parent's URL types write `ParamsOf<TargetOf<typeof d>>` with `d` imported from the parent's `destination.generated.js` (steps can use `parent` freely). A top-level `let` or `var` the facts read, directly or through a helper, can't be assigned anywhere in the file, inside functions included (`a binding the URL facts read is reassigned; declare it const`): the generated destination keeps the declaration but not the assignment. `facts` holds the URL facts: the parent and the codecs for params, search and fragments. Behavior follows as chained steps. By default the builder writes `path` and `parent` from the directories, and you write the rest.

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

### URL facts and steps

| URL fact    | Purpose                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- |
| `parent`    | The parent route, imported as the parent declaration's default export                       |
| `params`    | One codec per path param, keyed by bare name. Required exactly when the path has params     |
| `search`    | Codecs for query params                                                                     |
| `fragments` | The fragment names this route accepts                                                       |
| `outlet`    | The named outlet this route and its descendants render in ([Named outlets](#named-outlets)) |

| Step                                                                          | Purpose                                                                                                                |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `.resolve(…)`                                                                 | Resolvers that receive parsed inputs                                                                                   |
| `.canActivate(…)`, `.canActivateChild(…)`, `.canMatch(…)`                     | Guards that receive parsed inputs                                                                                      |
| `.onInvalidParams(…)`                                                         | What happens when this route's own path params fail to parse, instead of not matching                                  |
| `.title(…)`                                                                   | A string, or a callback that receives parsed inputs                                                                    |
| `.canDeactivate(…)`, `.providers(…)`, `.data(…)`, `.runGuardsAndResolvers(…)` | Passed to Angular unchanged                                                                                            |
| `.errorComponent(…)`                                                          | Angular's per-route error component, shown in place of the page when it throws ([Error components](#error-components)) |
| `.redirect(…)`                                                                | A typed redirect to another route                                                                                      |

Each step takes one argument and returns a new route without that step, so steps come in any order, each at most once. `.redirect` comes last and isn't offered after a guard step, `.onInvalidParams` or `.errorComponent`; `.onInvalidParams` is only offered when the path has params of its own. TypeScript reports a step used out of place as a missing property at that call.

The facts object takes nothing else: behavior keys belong in steps, and structural keys such as `path`, `children`, `component`, `loadComponent`, `redirectTo`, `pathMatch` and `matcher` are rejected because generation owns them.

### Parents

[src/routes/teams/$teamId/route.ts](snippets/src/routes/teams/$teamId/route.ts)

[src/routes/teams/$teamId/members/$memberId/route.ts](snippets/src/routes/teams/$teamId/members/$memberId/route.ts)

The member directory is inside the team directory, so the team route is its parent. The team directory has no page, so the team route is componentless: it groups its children and their shared inputs. A child declares only its own params; it inherits its ancestors' params and search params, so the member route above has `params: { teamId, memberId }` and `search: { score }`. A child can't redeclare a param or search key its ancestors own. Pathless routes (`""` with a parent) add no URL segment but still contribute their inputs to descendants. A route with neither a page nor children is an error, unless it's a redirect.

### Codecs

| Codec                        | Value                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `stringParam`                | Any string, including `""`                                                                |
| `numberParam`                | A finite number (`" 42 "`, `"1e3"` and `"0x10"` parse; blank and `NaN` fail)              |
| `booleanParam`               | Exactly `true` or `false`                                                                 |
| `enumParam(values)`          | One of the listed strings, typed as their union                                           |
| `withFallback(codec, value)` | Search only: reads `value` when the key is missing, repeated or invalid                   |
| `arrayParam(codec)`          | Search only: reads every value of a repeated key (`?tag=a&tag=b`) as an array             |
| `retained(codec)`            | Search only: links and navigation keep its current value (below)                          |
| `remembered(codec, id)`      | Search only: its last value comes back when you return ([below](#remembered-search-keys)) |

For a catchall, the codec applies to each segment, so `$segments[]` with `stringParam` produces `readonly string[]`.

Search params never stop a route from matching, and they never fail. Every search key is optional:

```ts
search: {
  page: withFallback(numberParam, 1),
  sort: enumParam(["asc", "desc"]),
  tag: arrayParam(enumParam(["news", "guides"])),
}
```

| Search key           | Missing      | Repeated     | Invalid                       |
| -------------------- | ------------ | ------------ | ----------------------------- |
| Plain codec (`sort`) | Absent       | Absent       | Absent                        |
| `withFallback`       | The fallback | The fallback | The fallback                  |
| `arrayParam` (`tag`) | `[]`         | Every value  | `[]`, if any value is invalid |

`sort` reads as `"asc" | "desc" | undefined`. A key with a fallback always reads a value (`page` is a `number`, never `undefined`). An array key always reads a readonly array: `?tag=news&tag=guides` reads `["news", "guides"]`, `?tag=news` reads `["news"]`, and `?tag=news&tag=other` reads `[]`. Values keep their URL order, duplicates included. Links, `createUrl`, navigation and redirects can leave out any search key. An array key takes an array and writes one `tag=` pair per element; `[]` writes nothing, so an empty list and a missing key are the same URL. For the same reason an array key can't have a fallback: to default to some tags, check `tag.length` in the page. `retained` and `remembered` go outside the other wrappers, in either order: `retained(withFallback(numberParam, 1))`, `retained(arrayParam(stringParam))`, `retained(remembered(withFallback(numberParam, 20), "orders.pageSize"))`.

A custom codec implements `ParamCodec<Value>`. Both methods are synchronous: `parse` receives the already-decoded text and returns the value, and `stringify` returns the text:

[src/slug.ts](snippets/src/slug.ts)

Parsing should be pure and deterministic. A path codec runs twice per navigation: once while Angular matches routes and again for the activated route. A codec whose `parse` returns a Promise is a type error where you declare it; if one slips through (from JavaScript, say), the navigation fails with a `TypeError` rather than treating the value as invalid. Codecs don't run in an injection context and don't need one: load data in resolvers or guards instead.

`defineRoute` never calls parsers, guards, resolvers or other callbacks; it only records them.

The package root exports exactly `defineRoute`, `createUrl`, `localeUrls`, `serverRoutePath`, `stringParam`, `numberParam`, `booleanParam`, `enumParam`, `withFallback`, `arrayParam`, `retained` and `remembered`, plus the types `Route`, `ParamCodec`, `Destination`, `LocaleUrl`, `ParamsOf`, `SearchOf`, `TargetOf`, `SearchStorage` and `SearchRestore`. The `_core`, `_generated` and `_generation` subpaths are internal coupling for generated code and `@loozo/angular-launch`, not application APIs. Route extensions, factories that add their own steps before the router's, are a seam for `@loozo/angular-launch` in `_core`; see [SPEC.md](SPEC.md#route-extensions).

### Fragments

`fragments: ["summary", "reviews"]` lists the fragment names you can pass when creating a URL to this route. Without the list (or with an empty list), the `fragment` option is not allowed. The names belong to this route only; children don't inherit them. Incoming hashes aren't validated, and the package doesn't scroll: provide matching element IDs and configure Angular's scrolling yourself.

## Building URLs

`createUrl` builds a root-relative URL from a route's `destination`, imported from the `destination.generated.ts` beside its declaration, synchronously and without running any parsers. It's typed `` `/${string}` ``, so it fits APIs that take only root-relative URLs:

[src/product-url.ts](snippets/src/product-url.ts)

All path params are required, including inherited ones. Search params are all optional: an omitted or `undefined` value leaves the key out, and an `arrayParam` key repeats once per element (`tag: ["a", "b"]` writes `tag=a&tag=b`). Query keys are sorted, values are percent-encoded, and a `/` inside a param value becomes `%2F`.

`createUrl` also takes a declaration itself, such as one written inline outside the scan directory, and gives the same URL its destination would. Catchall values are arrays:

[src/docs-url.ts](snippets/src/docs-url.ts#catchall)

Pass `{}` for a route without params or search. Wrong values fail to type-check. Unknown keys fail to type-check in an object literal; an object passed through a variable can carry extra keys past TypeScript, but `createUrl` still throws a `TypeError` for them at runtime.

A destination isn't a route: it has no steps and can't be a `parent`, and `ParamsOf<typeof product>` is `{}`. To name a destination's values, unwrap its route type first: `ParamsOf<TargetOf<typeof product>>` is `{ productId: number }`, and `SearchOf` works the same way.

## Reading inputs and navigating

Every route gets two generated files beside its declaration:

- `destination.generated.ts` exports `destination`, an inert reference to the route that holds only its URL facts. Import it wherever you build a URL, link, navigate, redirect or test the active route.
- `route.generated.ts` exports `route`, the browser copy of the declaration that the generated configuration reads, and, for a route that has a page or descendants with pages, `injectRoute()`. Call `injectRoute()` in an injection context (a field initializer or constructor) to get the handle for this route. A page imports it from its own `./route.generated.js`.

[src/routes/teams/$teamId/items/$id/inputs.ts](snippets/src/routes/teams/$teamId/items/$id/inputs.ts#inputs)

`params`, `search`, `data` and `title` are read-only Angular signals holding the activated route's values. They have a value from the first read, even in the page's constructor, so there's no loading state to check. While a navigation is in progress they keep the values of the page that's still on screen. When a navigation reuses this route with new values (a new id, or new search params), they change together. When a navigation is cancelled or fails before activation (in matching, a guard or a resolver), they keep their values. When a routed component's constructor throws during activation, the pages above it that stay on screen already have the new values, and keep them until the next navigation completes. Without Angular's `withErrorBoundaries` (developer preview), handle the error where Angular reports it: the rejected `navigate` promise, the `NavigationError` event or `withNavigationErrorHandler`. The exception is a page whose outlet the same navigation creates, because the page holding that outlet is new too: then the navigation completes with the pages above on screen, and the error reaches Angular's `ErrorHandler`. With `withErrorBoundaries`, when the throwing route has its own `.errorComponent` or you set a `defaultErrorComponent`, that component renders in the page's place and the navigation completes. When neither exists, Angular behaves as without the feature, except that the error from a page in a new outlet goes to the nearest page above with its own `.errorComponent`, if there is one, which replaces that page ([Error components](#error-components)). To show that a navigation is pending, read Angular's `Router.currentNavigation()` signal.

`data` holds the resolver results of this route and its ancestors, pathless and page-less ones included: the outermost ancestor's first, then nearer ones, then this route's own. As in Angular's own data inheritance, a nearer route's key hides an ancestor's key of the same name, and the hidden value isn't reachable through the handle. The merge is the same whatever `paramsInheritanceStrategy` you set, so under `'emptyOnly'` a route below a parent with a page still has that parent's resolver results, which Angular's own `snapshot.data` leaves out. Static `data` and the title aren't included; to read a static value through the handle, return it from a resolver, such as `.resolve({ label: () => "Teams" })`.

`title` is the resolved title of this route, or of its nearest ancestor that has one, and changes with the other signals. It's typed `string` when this route or an ancestor uses `.title`, and `undefined` otherwise. Like resolver data, it only changes when Angular reruns the title: with the default `runGuardsAndResolvers`, a navigation that changes only search params keeps the old title, so a title that reads search needs `'paramsOrQueryParamsChange'`. Only generated routes count; a hand-written Angular route above them with its own title isn't read.

Reading `params` or `search` throws only if a path codec rejects a value it accepted while matching, which a pure codec never does.

### Links and navigation

`link` returns an Angular `UrlTree` for `RouterLink`; `navigate` calls `Router.navigateByUrl` and returns Angular's own promise. Both take one object: `to` picks the route, and `params`, `search` and `fragment` are its URL values:

[src/routes/teams/$teamId/items/$id/links.ts](snippets/src/routes/teams/$teamId/items/$id/links.ts)

Without `to`, the call targets this route. `".."` targets the parent route: the nearest route above it with a shorter path, or the root route for a top-level route; TypeScript offers it only when that route exists. Otherwise `to` is a route's `destination`, imported from its `destination.generated.ts`. There are no string paths and no other relative selectors, and the values are always typed for the target route.

Values aren't carried over from the current URL, except [retained search keys](#retained-search-keys). Pass every required param and search value explicitly, and pass `fragment` only when the target declares it. The URL itself is composed with the current one, so open [named outlets](#named-outlets) stay open where they still fit; call `link` where it renders, in a template or a `computed`, so it follows navigations.

The rest of a `navigate` object is Angular's `NavigationBehaviorOptions`, such as `replaceUrl`, `state`, `info` or `skipLocationChange`, passed to `navigateByUrl` as given. The last call above uses `replaceUrl` to replace the current history entry instead of adding one, as a filter input that updates the search on every keystroke would. `link` takes no behavior options; set them as `RouterLink` inputs instead, such as `[replaceUrl]` or `[state]`.

`to` takes only a genuine destination imported from a `destination.generated.ts`. A spread or copy of one, a declaration, or the `route` a `route.generated.ts` exports fails to type-check and throws a `TypeError` at runtime.

### Retained search keys

Wrap a search key's codec in `retained` to keep it across links and navigation, such as a workspace that every page below a layout shares, or a list's view mode:

[src/routes/projects/route.ts](snippets/src/routes/projects/route.ts)

[src/routes/projects/$projectId/links.ts](snippets/src/routes/projects/$projectId/links.ts)

When `link` or `navigate` targets a route that inherits the key, the current URL is inside the route that declares it, and your `search` leaves the key out, the current value is copied. Pass a value to replace it, and `undefined` to drop it; a spread like `{ ...defaults, view: undefined }` drops it too. Only a valid value is copied, parsed and written again by the codec, so a repeated or invalid one isn't, and a fallback is never written. It doesn't matter which handle calls: a page, a layout above it linking to a child, or the shell's active route all keep the key. A link to a route outside the declaring route, such as a login page, never gets it, and neither does a route below another route that declares a key of the same name. `createUrl`, `localeUrls` and redirects never retain: they build exactly the URL you describe.

The values and the route they belong to always come from the same URL. Before the browser's first navigation completes, a server-rendered shell keeps the key through [`provideActiveRouteHydration()`](#the-active-route-on-hydrated-pages): the server's route says which keys the page is inside. With `urlUpdateStrategy: "eager"`, during that first navigation the browser shows the new URL before any route state matches it, so links read then leave retained keys out until the navigation completes. A route chain whose resolver uses a symbol key isn't seeded, so its shell keeps nothing until then either.

### Named outlets

A route with `outlet` renders in that named outlet of its parent's page, next to the parent's primary child; its children render inside it. Templates own the outlets, as in plain Angular:

```ts
// src/routes/chat/$id/route.ts: a panel next to any page, /(chat:chat/7)
export default defineRoute("chat/$id", { outlet: "chat", params: { id: numberParam } });

// src/routes/products/item/$id/route.ts: a detail pane next to the products list, /products/(list//detail:item/3)
export default defineRoute("item/$id", { parent, outlet: "detail", params: { id: numberParam } });

// src/routes/chat/$rest[]/route.ts: the chat outlet's not-found panel
export default defineRoute("$rest[]", { outlet: "chat", params: { rest: stringParam } });

@Component({ imports: [RouterOutlet], template: `<router-outlet /><router-outlet name="chat" />` })
export default class Shell {}
```

An outlet name is a letter followed by letters, digits, `-` or `_`. A route in a named outlet needs a nonempty path, can't name another outlet below it, and declares no `search` or `fragments`: the query and fragment belong to the primary route, and it still reads the search its primary ancestors declare. Its links take params only.

Links and navigations open, replace and close branches and keep the rest of the URL:

```ts
readonly route = injectRoute(); // in the products list page
readonly openItem = computed(() => this.route.link({ to: item, params: { id: 3 } }));
// /products/(list//detail:item/3)?sort=price, with the branches open now
void this.route.navigate({ to: chat, params: { id: 7 } }); // opens chat, or replaces what it shows

readonly own = injectRoute(); // in the chat page, or any page inside the chat branch
void this.own.navigate({ params: { id: 8 } }); // replaces the branch in place
readonly closeLink = computed(() => this.own.link({ close: true })); // <a [routerLink]="closeLink()">×</a>

readonly active = injectActiveRoute(); // in a shell, no is() needed
void this.active()?.navigate({ to: chat, close: true }); // closes chat, whatever it shows
```

- A primary navigation keeps every open branch whose anchor is still on the new path: chat (at the root) always, a product detail while you stay on products, not when you switch team. Its query and fragment are the target's. Opening or closing a branch whose anchor is on the current path keeps the primary path, query and fragment; opening one whose anchor isn't (an item detail from `/plain`) navigates to its anchor, `/products/(detail:item/3)`, keeping only the branches that still fit there and dropping the query and fragment.
- A close with nothing to close leaves the URL unchanged, and Angular's `onSameUrlNavigation` decides: by default the navigation is skipped and resolves `false`. With `"reload"`, Angular matches the URL again (`canMatch` runs) and activation guards and resolvers follow `runGuardsAndResolvers`.
- `createUrl(chat, { params: { id: 7 } })` is the exact URL, `/(chat:chat/7)`, with no other branch; `router.navigateByUrl(createUrl(plain, {}))` clears every branch.
- Build links where they render. A link stored once in a field keeps the branches that were open when it ran.
- A guard in a branch belongs to the whole navigation: refusing it cancels a primary change too.
- An unknown path or a rejected param in a named outlet fails the navigation; the root catchall covers the primary outlet only, so give each named outlet its own `$rest[]` catchall. Its value needs at least one segment: `[]` for a catchall-only branch path throws when the link is built.
- A redirect into a branch replaces the whole URL with that branch's own URL and keeps its search policy; redirect sources can't be in a named outlet. An empty route at the anchor, such as home beside chat, renders beside it.
- `..` inside a branch stays in the branch; a branch root has no `..`.
- Launch's `redirect()` into a branch, with translated URLs too, is Launch's: see its [Translated URLs](../angular-launch/README.md#translated-urls).

The proofs run on Angular 22.3.0. Earlier 22.x releases lack 22.2.4's fix for empty-path routes traversed through another outlet (angular/angular@ea8cdc4), which concerns hand-written empty-path routes beside named outlets and generated named routes below a pathless parent. [`examples/angular-router/outlets-proof`](../../examples/angular-router/outlets-proof/README.md) is a working SSR app with root and nested branches.

### The active route

Code outside a route's page, such as a shell, breadcrumbs or a nav bar, reads the active route with `injectActiveRoute()` from `routes.generated.ts`:

[src/shell.ts](snippets/src/shell.ts)

`injectActiveRoute()` needs an injection context and returns a signal of the deepest active route in the primary outlet; a route in a [named outlet](#named-outlets) is never the active route. It's `undefined` before the first navigation (on a server-rendered page with [`provideActiveRouteHydration()`](#the-active-route-on-hydrated-pages), the server's route until then), and when no generated route is active. A route with children is the deepest at its own URL: on `/teams/7` it's the team route.

Its `link` and `navigate` keep [retained search keys](#retained-search-keys) like a page's. Until you narrow it, the active route has `params`, `search`, `data` and `title`, typed as the union of every route's values, `link` and `navigate` with a `to` destination (a close included, [Named outlets](#named-outlets)), and:

- `is(destination)`: whether it's exactly that route, not one of its ancestors. It narrows the route to that route's handle, with its `link` and `navigate`.
- `contains(destination)`: whether that route is this one or one of its ancestors.
- `localeUrls`: a signal of this page's URLs in every locale, for a [language switcher and hreflang](#translated-urls) in a localized build; `[]` otherwise.
- `chain`: the active routes, from the top-level one down to this one. `chain.find((route) => route.is(team))` finds an ancestor, already narrowed. For breadcrumbs, `chain.map((route) => route.title())` reads each route's title; a route without its own title repeats its ancestor's.

The value changes only when a navigation completes. It stays the same while a navigation is pending, and when one is cancelled or fails. If it fails during activation, the routes above the failing one that stay active already have the new values, so `chain` can mix a parent's new params with the active route's old ones until the next navigation completes. While a route stays active it keeps its handle, so going from item 9 to item 10 changes that handle's `params`, not the active route. Each `injectActiveRoute()` call has its own handles, separate from the page's `injectRoute()` handle; their values are the same. A handle that's no longer active keeps its last values. `is` and `contains` compare destinations by identity, so a destination from another generated route tree is never active here. Every generated route record carries its own destination, and the active route reads those, so it sees every generated route installed in the router: install one generated tree per router.

Use it outside the page. In the constructor of a page being activated it reads `undefined` until the navigation ends, while the page's own `injectRoute()` has its values right away. On a server-rendered page it's `undefined` from hydration until the browser's first navigation completes, so the shell shows what it shows for `undefined` in between, unless the app installs [`provideActiveRouteHydration()`](#the-active-route-on-hydrated-pages).

## Remembered search keys

Wrap a search key's codec in `remembered` with an id to bring its last value back when the user returns, such as a list's page size or sort order:

[src/routes/inbox/route.ts](snippets/src/routes/inbox/route.ts)

Install storage for the remembered values in your application config, next to `provideRouter`. `"local"` keeps them in the browser's `localStorage`, `"session"` per tab in `sessionStorage`:

```ts
import { provideSearchStorage, routes } from "../generated/routes.generated.js";

providers: [provideRouter(routes), provideSearchStorage("local")];
```

Every navigation that completes inside the route stores the key's value, and forgets it when the URL has none, an invalid one or the fallback. When a navigation enters the route from outside it, the first load included, without the key, the router redirects it to the same URL with the stored value: the URL always shows what the page reads, so links, guards and resolvers see nothing new. Inside the route, a missing key means the user cleared it: navigating from `/inbox?pageSize=50` to `/inbox` shows 20 and forgets 50. Entering is per route, not per param value, so going from `/teams/1?pageSize=50` to `/teams/2` stays inside `teams/$teamId` and clears the key; mark such a key `retained` too to keep it.

The id names the stored value. Keys with the same id share one value wherever they are, on purpose or by accident, so prefix ids with their page (`"inbox.pageSize"`). Change the id (`"inbox.pageSize.v2"`) to start afresh after the key's meaning changes. A route and its parents can't remember two keys under one id: declaring one throws a `TypeError`. An id has letters, digits, `.`, `_` and `-` only, so it works as a cookie name as is.

The redirect follows Angular's rules: from another page, the restored URL gets one history entry after it, `replaceUrl` replaces it as asked, the navigation's `state` is kept, and the bare URL never gets an entry of its own. Back or Forward into an older entry of the route without the key restores and replaces that entry's URL.

Every guard of the navigation, named outlets and `canActivateChild` included, sees the original URL first, and nothing is read from storage until they all accept it. The restore then happens before any resolver or title runs, so they run once, on the restored URL. Guards run again on it, so a guard runs twice on such an entry, `canDeactivate` of the page being left included: remember a confirmation the user gave instead of prompting twice. A guard that requires a remembered key refuses before the restore can add it; read an absent key as its fallback instead. A guard that finds a stored value no longer acceptable should redirect to the route's URL without the key, such as `createUrl(inbox, {})`: the redirect doesn't restore it again, and the URL it commits forgets it. A redirect to another page keeps the value. When a restored value makes a guard or resolver refuse or fail the navigation, the router forgets it, so the next entry works.

A stored value that no longer parses is forgotten silently. Navigating into such a route without `provideSearchStorage()` fails with `Remembered search keys need provideSearchStorage()`; in tests, add the provider next to the router, for example `provideSearchStorage(() => ({ read: () => undefined, write() {}, forget() {} }))` for storage that remembers nothing.

### Custom storage

`provideSearchStorage` also takes a factory that returns a `SearchStorage`. It runs once per application, in its injection context, so it can `inject()` what it needs:

```ts
export interface SearchStorage {
  read(id: string): string | undefined;
  write(id: string, text: string): void;
  forget(id: string): void;
}
```

The methods are synchronous. The text is the router's: the key's value written by its codec, encoded and joined with `&` (`"50"`, `"news&guides"`), safe to store as a cookie value as is. A spelling the codec also accepts is stored in the codec's own, so `?pageSize=0x32` stores `"50"` and comes back as `?pageSize=50`. The router doesn't catch your errors: a throwing `read` fails the navigation that restores, a throwing `write` or `forget` reaches Angular's `ErrorHandler`. The built-in storage stores nothing on the server, so a server-rendered page shows the fallback and the browser restores after hydration, a visible change from 20 to 50. For the server's first render to use the value, store it in a cookie ([Remembered search keys on the server](#remembered-search-keys-on-the-server)).

### Not-found pages

A restored value can make the page's data missing: a page size that no longer exists, a filter on a deleted label. If your navigation error handler renders a not-found page, ask `currentSearchRestore()` from `routes.generated.ts` first. While the failing navigation restored a value and hasn't retried, it returns `{ originalUrl, forget() }`: forget the restored values and navigate again to the URL from before the restore, which renders with the fallbacks.

[src/not-found.ts](snippets/src/not-found.ts)

```ts
providers: [provideRouter(routes, withNavigationErrorHandler(notFoundErrors))];
```

The retry happens once per navigation: a page that is missing anyway fails again, `currentSearchRestore()` returns `undefined`, and your normal not-found page follows, at the original URL. It forgets every value the navigation restored, valid ones too, and guards and resolvers run again. `@loozo/angular-launch`'s `rpcNavigationErrors` doesn't ask for it: it doesn't retry, and the restored value stays stored. During server rendering its not-found then answers for a URL that differs from the request, so Angular's server engine builds a redirect with status 404: development throws `Invalid redirect status code: 404`, and production sends a 404 with a `Location` header and no body, which shows a blank page. Later entries without the key repeat it.

## Guards, resolvers and redirects

`.canActivate`, `.canActivateChild` and `.canMatch` take arrays of functions whose first argument is the parsed inputs. Angular's native arguments follow:

[src/routes/reports/$reportId/route.ts](snippets/src/routes/reports/$reportId/route.ts)

| Guard              | Inputs                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| `canActivate`      | This route's params and search, including inherited ones                     |
| `canActivateChild` | The declaring (parent) route's params and search                             |
| `canMatch`         | This route's own path params plus all search params; no ancestor path params |
| `canDeactivate`    | Angular's native form, unchanged; no parsing                                 |

Guards return anything Angular accepts (`boolean`, `UrlTree`, `RedirectCommand`, or a Promise or Observable of those). Search values recover before any guard runs (absent, the fallback, or `[]` for an array key). Path params that fail to parse decide whether a route matches, so a guard only sees valid ones. Every callback (guards, resolvers, `title` and `onInvalidParams`) is called synchronously in the injection context Angular provides, so `inject()` works at its start, before any `await`.

Every route with path params of its own or with search params gets a generated `canMatch` that parses them, search after the path. Search never decides the match. If a path param fails, the route doesn't match and Angular tries its next route, ending at the closest `$segments[]` catchall, so guards, resolvers and pages never see a value their codec rejects. Your own `canMatch` guards aren't called then. `.onInvalidParams` replaces that outcome:

```ts
export default defineRoute("items/$id", { params: { id: numberParam } }).onInvalidParams(
  (error, routeConfig, segments, partialSnapshot) =>
    new RedirectCommand(inject(Router).parseUrl("/items")),
);
```

It receives the parse error (`source: "path"`, `key`, `reason`, and the codec's error as `cause`) and Angular's `canMatch` arguments, runs in the route's injection context, and returns `false` (try the next route), a `UrlTree` or a `RedirectCommand`, or a Promise or Observable of one. It can't return `true`: that, or throwing, fails the navigation. Write `async () => false as const` rather than `async () => false`, which TypeScript widens to `boolean`.

A value that parses but doesn't exist, such as an unknown slug, is still yours to handle, for example with a `canActivate` that returns `new RedirectCommand(notFoundUrl, { browserUrl: state.url })`: Angular renders your not-found route while the address bar keeps the requested URL. The not-found URL must not match the guarded route again, or the redirect loops.

Resolvers get the parsed inputs too:

[src/routes/teams/$teamId/items/$id/route.ts](snippets/src/routes/teams/$teamId/items/$id/route.ts)

`.title` takes a string or a callback like a resolver's that returns the title (or a Promise or Observable of it). Angular runs a title callback alongside the route's resolvers, so it can't read their results.

Angular's default rerun policy, `paramsChange`, reruns resolvers and the title callback when the path or its path/matrix params change, but not when only search params change. Chain `.runGuardsAndResolvers` when a resolver reads search params, as above.

The generated resolver and title adapters return Angular the callback's result as is, with one exception: on a navigation that restores a [remembered search key](#remembered-search-keys), the first one Angular calls returns the restore's redirect instead of calling its callback. A route under a remembered key also gets one resolver of the router's own under a symbol key; it resolves `true`, and handles and `data()` don't show it, though Angular's own `ActivatedRoute.data` does.

A redirect targets another route's `destination`, imported from its `destination.generated.ts`, and must say what happens to search and fragment:

[src/routes/teams/$teamId/old-items/$id/route.ts](snippets/src/routes/teams/$teamId/old-items/$id/route.ts)

Params with the same name and compatible types are forwarded automatically; otherwise map them with `params: { targetKey: "sourceKey" }`. Values are parsed with the source codecs and written with the target's codecs. Search `preserve` keeps the incoming query text, repeated keys included, so the target's array keys read every value; `replace` writes an array key's values like `createUrl` does. A redirect route can't have a page or children, and `.redirect` isn't offered after a guard step, `.onInvalidParams` or `.errorComponent`; an invalid param in a redirect's source URL fails the navigation. `.resolve` and `.title` may come before `.redirect`, and so may `.providers`, `.data` and `.runGuardsAndResolvers` on a top-level redirect, but its resolvers and title never run, and its providers can still be built by Angular's preloading ([SPEC.md](SPEC.md#9-typed-redirects-x)). A redirect with a parent can't use those three ([Lazy route children](#lazy-route-children)).

## Error components

`.errorComponent` gives a route Angular's per-route error component, which Angular shows in place of the route's page when the page throws while it's created or rendered. It does nothing unless you add Angular's `withErrorBoundaries()` to `provideRouter`. Angular sets the component's `error` input to the thrown value:

[src/routes/reports/$reportId/report-error.ts](snippets/src/routes/reports/$reportId/report-error.ts)

The report route above chains `.errorComponent(ReportError)`, and the app adds `withErrorBoundaries()` in [src/main.ts](snippets/src/main.ts).

- Chain it on a route that has its own page. On a layout or group without one, generation fails with `errorComponent requires a colocated page`. Give its child pages their own `.errorComponent`, or set a `defaultErrorComponent`. `.redirect` isn't offered after it.
- The error component loads with the table that holds the route's record, not with the lazy page: at startup for a top-level route, with the parent's children table for a nested one.
- When the throwing route has its own error component, or you set a `defaultErrorComponent`, that component renders in the page's place (the route's own wins), the pages above stay, and the navigation completes.
- A route's error component doesn't cover its children. When a child page throws while Angular creates it (its constructor or injection) and has neither its own nor a default to use, the outcome depends on whether the outlet showing that child already existed. If the page holding that outlet was already showing, the navigation rejects and the pages above stay. If the navigation creates that page too, the child's error goes up to the nearest page above it with its own error component, which can be a layout that was already showing, and that component replaces that page. If no page above has one, the error reaches Angular's `ErrorHandler`. Either way the navigation completes. An error from a page's template or later rendering never rejects the navigation, whichever outlet shows it: it goes to the page's own or the default error component, else up to the nearest page above with its own, else to `ErrorHandler`. This is Angular's view error handling, not inheritance.
- Errors in `loadComponent`, `loadChildren`, guards and resolvers aren't caught; handle them where Angular reports navigation errors.
- While the error component is showing, the route's `.canDeactivate` guards receive it instead of the page, so a guard that calls a page method must check the instance first.
- Without `withErrorBoundaries`, Angular ignores the component and warns once in development.
- Server rendering renders the error component, with status 200.
- `errorComponent` is developer preview in Angular 22.3.

The full rules are in [SPEC.md](SPEC.md#error-components).

## Lazy route children

There's no API for this: every route with children loads them lazily. Its own record, with its guards, resolvers, title, error component, the modules they import, and its destination, loads with the table that holds it, `routes.generated.ts` for a top-level route. Everything below it (the children's records, their route copies and destinations, and whatever their steps import) loads from a generated `children.generated.ts` beside it the first time Angular matches it, and nested routes with children repeat this a level down. So the startup bundle carries the top-level routes, not the whole tree. A guard on a top-level route still loads at startup; to keep a heavy guard out of it, `import()` the heavy part inside the guard, or put the guard on a child.

What this costs:

- Each level of routes with children between the root and the matched route adds one request, made in turn, before the page loads on a cold visit. Later visits to the same routes fetch nothing new. With SSR, Angular emits `modulepreload` hints for the matched route's children tables (up to 10 per page), so a server-rendered page fetches them alongside its pages, and hydration finishes once the client's initial navigation has loaded them.
- A route that matches fetches its children even at its bare URL, before Angular tries them. A `canMatch` that refuses, a generated param check included, fetches nothing. The exception is a server-rendered page with [`provideActiveRouteHydration()`](#the-active-route-on-hydrated-pages): the browser imports the children tables along the server's route before Angular matches, so they and the route copies they import have run even if the browser's `canMatch` then refuses.
- Angular's `withPreloading` can preload children tables; the router doesn't configure it.

Angular's `Route` for a route with children has `loadChildren` instead of `children`, before and after they load. So a callback that reads its route's configuration (`canMatch`'s route argument, `snapshot.routeConfig` in other guards) doesn't see `children`, and neither does app code that walks `Router.config`, for menus or a sitemap. Write a has-children check as `route.children?.length || route.loadChildren`. A policy that depends on the routes below belongs in the parent's own `.data(...)`, or those routes become top-level declarations whose paths carry the prefix (`defineRoute("admin/users", {})`); that drops the params, providers and `canActivateChild` they inherited. Nothing opts a route out.

A redirect with a parent keeps its record in `routes.generated.ts`, like every redirect, but loads its route copy the first time it redirects, so its copy and its ancestors' copies stay out of the startup bundle. That's why it can't use `.providers`, `.data` or `.runGuardsAndResolvers`: Angular reads them from the record before the copy loads. A redirect source's destination and its parents' destinations load at startup, and so does each top-level record's `..` destination, even when it's inside a children table; they're only URL facts.

The startup bundle stays a small, constant number of files in an optimized production build, because Angular's chunk optimizer runs there by default. Development builds don't run it, so they load more files at startup. The router's benchmark measures 2 initial files at 100, 300 and 1,000 routes, against 12, 32 and 102 before ([`bench/README.md`](bench/README.md#results)).

## Filesystem route definitions

By default, directories give each route its path and parent. A directory becomes a route when it has a page or a declaration. The builder creates an editable `route.ts` in each directory that has a page but no declaration yet. Every other directory, the scan directory included, isn't a route: it adds its name to the paths of the routes below it. Each route's parent is the nearest route above it.

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

Angular gets `{ path: ":package", loadChildren }`, whose children table holds `{ path: "guide/:guide" }` ([Lazy route children](#lazy-route-children)): the same routes as writing those two declarations by hand, so `/angular-router/guide` on its own matches neither of them. If a directory without a page needs behavior of its own, such as a guard or resolver shared by the routes below it, add a declaration to it. It then becomes a componentless route and the parent of the routes below it. Angular also matches its bare URL (`/angular-router/guide`) when no child does, and SSR prerendering lists it as a route.

These files are yours. Change the codecs, add search params, guards and resolvers; the builder leaves them alone. When you move or rename a directory, or a route above it appears or disappears, the builder updates only the path literal, the `parent` property and its import, and the local params where the change is unambiguous: it renames a single changed param key and keeps its codec, and when params are only added (for example, a declaration moved under a page-less `$team` directory) it keeps every existing codec and adds a `stringParam` codec per new param, also to a declaration that had no params. It reuses your `stringParam` import when the file has one, and otherwise imports it as `stringParam`, or `filesystemStringParam` when the file already uses that name. When it can't make an edit safely (for example, a removed param whose codec you customized, or params spread from another object), generation fails before writing anything. The error names the file, the path the directories give and the params it can't reconcile. Make that file's `params` match the directories, with one key per param in that path (or no `params` at all when the path has none), and the next run updates only the path; or move or rename the directory. Params spread from another object, kept in a shared variable or written as shorthand (`{ id }`) must first be written as plain `name: codec` properties. The builder never removes a param's codec itself, and the path always follows the directories. It never deletes declarations.

A new import goes on its own line after the file's last import and any comment on that import's line. When that comment spans lines or carries a directive for the next line (such as `// @ts-expect-error`), the new import goes before the comment instead, so the directive keeps its target. A new parent import is named `parent`, or `filesystemParent` when the file already uses that name. When an existing parent import still points at a route that's no longer the parent, for example because you added a declaration between them, it's repointed and renamed to `parent`. When it no longer resolves, because its file moved or its target was deleted, it's repointed and keeps its name. An import that's used for more than the `parent` property is left alone, and a new parent import is added beside it.

A `-` directory can't contain a page or a declaration with behavior.

Set `"autoDefineRoutes": { "filename": "definition.ts" }` on the application target to seed a different file name. It must be a plain `.ts` file name that isn't a generated file name. That only affects new files; existing declarations are found by content, whatever their name.

### Sibling groups

A `+` directory with routes below it is a **sibling group** when its parent holds another pathless route: another `+` directory with a page or declaration, with or without routes below it. That can be a second group, or a leaf such as `+home/page.ts` or `+index`. Each group gives its pages a layout and guards, and each URL reaches the group whose routes own it:

```text
src/routes/
  +authenticated/
    route.ts        defineRoute("", { parent }).canMatch([requireLogin])
    page.ts         the authenticated layout
    inbox/          /inbox
    settings/       /settings
  +signed-in/
    page.ts         the signed-in layout
    +index/         /
    profile/        /profile
```

`/inbox` renders inside the authenticated layout and `/profile` inside the signed-in one. On `/profile`, `requireLogin` isn't called and `+authenticated`'s routes aren't loaded: the generated record of each group only matches the URLs its own routes have.

- A group ends no URL itself. `/` is `+signed-in/+index`'s, so it renders the signed-in layout with that page, and `..` from `inbox`, `settings` or `profile` goes there. Without an `+index` (or another page at `/`) nothing renders at `/` but the app shell, with status 200 under SSR, and pages have no `..`. Add a `+index`, or a root catchall for a not-found page.
- Two pages at the same URL in different groups still collide; generation names both groups.
- A catchall in a group (`+authenticated/$rest[]`) is tried after every other route of the groups, so it frames not-found pages in that group's layout and catches a URL another group's guard refuses. It may not hide a route of another group or one beside the groups, such as a root catchall. Above the groups, table order decides as without them: a root `docs/intro` is shadowed by `docs/+a/$rest[]` just as by `docs/$rest[]`, because `docs` is tried first.
- Environment initializers in a group's `.providers(…)` run the first time Angular tries the group, even on a URL it doesn't own. Start group-only work from a guard, a resolver or the layout instead.
- A named outlet's route can't hang directly under a group; give it a parent with a path, or declare it beside the groups. When every route of a named outlet refuses its part of the URL (an invalid param, or the branch's own guard), Angular tries that part against the groups too. A group with a route of the same shape, or a catchall, then runs its `.canMatch` guards with those segments (a `UrlTree` they return redirects the navigation) or loads its routes before the navigation fails. Those guards can't tell this attempt from a primary one.

A `+` directory with routes below it and no other pathless route beside it isn't a group: it keeps Angular's own matching, like any pathless route. Its `.canMatch` guards run, and once they pass its routes load, for every URL that reaches it, including one no route below it matches. That stays so in 1.x ([SPEC.md](SPEC.md#stability)). Adding a pathless leaf beside it, such as `+home/page.ts` or `+index`, makes it a group, with the rules above.

### Explicit authoring

To write every path and parent yourself, turn filesystem definitions off:

```json
"options": {
  "tsconfig": "tsconfig.routes.json",
  "scanDirectories": ["src/routes"],
  "outDirectory": "generated",
  "autoDefineRoutes": false
}
```

Declarations look the same, but the builder never creates or edits them, and directory names don't affect paths or parents. File names are up to you: the builder finds declarations by their `export default defineRoute(...)` chain and pages by their default-exported standalone component, not by name. A page still needs a declaration in its own directory; a page without one fails generation.

## Server rendering and hydration

The generated routes work with Angular SSR and `provideClientHydration` without extra setup; [`provideActiveRouteHydration()`](#the-active-route-on-hydrated-pages) is optional. There's no data transfer cache or custom renderer. Parsing is synchronous and resolvers keep Angular's stability pending, so server-rendered HTML contains parsed values and resolved data.

[`examples/angular-router/ssr-proof`](../../examples/angular-router/ssr-proof/README.md) is a working SSR app with a search fallback, a resolver, a redirect, hydration, and remembered search keys in cookies with the not-found recipe.

Angular SSR picks a server route by pathname and doesn't read outlet syntax, so a URL with a named outlet, such as `/products(chat:chat/7)`, reaches your `**` server route. Declare a root catchall (`defineRoute("$segments[]", …)`, your not-found page) so it renders instead of answering 404. `serverRoutePath` rejects a destination in a named outlet.

### The active route on hydrated pages

Without help, `injectActiveRoute()` reads `undefined` in the browser until the first navigation completes, so a server-rendered shell (a nav bar, breadcrumbs) briefly shows its `undefined` state after hydration. Install `provideActiveRouteHydration()` from `routes.generated.ts` next to `provideRouter` in the config the server and the browser share, and the shell keeps showing the server's route:

```ts
import type { ApplicationConfig } from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideClientHydration } from "@angular/platform-browser";
import { provideActiveRouteHydration, routes } from "../generated/routes.generated.js";

export const config: ApplicationConfig = {
  providers: [provideRouter(routes), provideClientHydration(), provideActiveRouteHydration()],
};
```

The server sends its active route in Angular's TransferState. Before the root component exists, the browser loads that route's children tables and parses its params and search from the browser's own URL; `data` and `title` are the server's until the browser's resolvers replace them. The shell's code doesn't change, and the active route is a full handle: `is`, `contains`, `chain`, `link` and `navigate` work before the first navigation. When that navigation commits the same routes, the shell keeps the same handles, so `track route` keeps its nodes.

If the browser's first navigation ends differently:

- A guard redirect goes straight to the target, never `undefined`.
- A rejection, an error or a skipped navigation shows `undefined` after it, matching the empty outlet.

There's no seed, and the shell behaves as without the provider, when:

- a resolver of the active route returns something JSON can't carry unchanged: anything but `null`, booleans, strings, finite numbers, and plain arrays and objects of those (a Date, Map, BigInt, class instance or cycle, for example);
- the browser's URL differs from the one the server rendered, for example after a guard's `RedirectCommand` with `browserUrl`;
- a generated route is only reachable through a hand-written `loadChildren`.

Dev builds warn `active route not seeded (…)` with the reason.

What it costs:

- On a seeded page, bootstrap waits for the active route's children tables and the route copies they import, which `modulepreload` hints usually have fetched already. A route module (or anything it imports) must not top-level `await` something that only bootstrap, the root component or the first navigation settles: that page would never bootstrap.
- The Router and its dependencies (`UrlHandlingStrategy`, `RouteReuseStrategy`, `Location`, the `ROUTES`) are created before app initializers run, so an app initializer can't prepare their configuration. Prepare it before `bootstrapApplication` or in an environment initializer listed before the provider, or leave the provider out.
- List the provider before any environment initializer that navigates.
- An app that never navigates (`withDisabledInitialNavigation()`) keeps showing the server's route.

### Remembered search keys on the server

Browser storage doesn't reach the server, so a server-rendered page shows the fallback until the browser restores the value. To render the remembered value on the server, store it in a cookie with a factory that reads the request's cookies on the server and `document.cookie` in the browser:

[src/search-cookies.ts](snippets/src/search-cookies.ts)

```ts
providers: [
  provideRouter(routes, withNavigationErrorHandler(notFoundErrors)), // if you render not-found pages
  provideClientHydration(),
  provideSearchStorage(cookieSearchStorage),
];
```

With `AngularNodeAppEngine` or `AngularAppEngine`, opening `/inbox` with a remembered page size of 50 answers `302 Location: /inbox?pageSize=50`, keeping your other response headers and cookies, and the browser renders the restored page through hydration with no change in between. A stored value that doesn't parse is forgotten, and its deletion goes out with that response. When a restored value makes the page's data missing, [the not-found recipe](#not-found-pages) retries inside the same render: the response is `200` with the fallbacks and the cookie's deletion, and a page missing anyway gets your handler's `404` at the requested URL. The adapter writes a cookie only when its value changes, so ordinary pages carry no `Set-Cookie` and stay cacheable.

- The cookies have no `HttpOnly`, so the browser can read them, and `Secure`, which browsers accept from `http://localhost`; remove it for plain HTTP elsewhere.
- `CommonEngine` answers with HTML, not a response, so it can't redirect: it renders the restored page at the bare URL, the browser restores again, the shell's [active-route seed](#the-active-route-on-hydrated-pages) is dropped, and cookie writes reach the browser only if your host copies them. Use `AngularNodeAppEngine`.
- A server route that sets its own `status` for a page that can restore breaks the redirect: Angular's development server throws, and production keeps the status on the redirect.
- Prerendered pages have no request, so they render the fallback and the browser restores.

## Translated URLs

With `translateSegments`, each Angular localize build matches, links, redirects, server-renders and prerenders URLs in its own words: the German build serves `/de/produkte/42` and the English one `/en/products/42`, from the same `route.ts` files. Ids, types, `route.path` and generated imports stay in your source words.

```jsonc
// angular.json (excerpt)
"i18n": { "sourceLocale": "en", "locales": { "de": "src/locale/messages.de.xlf" } },
"build": {
  "builder": "@loozo/angular-router:application",
  "options": {
    // …router and Angular options…
    "translateSegments": true,
    "localize": true,
    "polyfills": ["@angular/localize/init"],
    "i18nMissingTranslation": "error"
  }
}
```

Setup is what `ng add @angular/localize` does: install `@angular/localize`, add `@angular/localize/init` to `polyfills`, and add `"@angular/localize"` to `compilerOptions.types` in both the application tsconfig and the router's `tsconfig`. Generation fails with the fix when the package or the polyfill is missing.

**The catalog.** Every static segment becomes a message, one per distinct word, whose id is `route.segment.<word>` (percent-encoded beyond ASCII letters and `-_.!~*'()`). `ng extract-i18n` lists them with a note for translators:

```html
<trans-unit id="route.segment.products" datatype="html">
  <source>products</source>
  <note priority="1" from="description">One segment of page URLs, without "/". Changing it changes links and bookmarks.</note>
  <note priority="1" from="meaning">URL path segment</note>
</trans-unit>
```

A translation must be one segment: not empty, `.`, `..`, `*` or `**`, without `/` or placeholders, and not starting with `:` or `$`. Before writing anything, generation checks each configured locale's tree, with a word a catalog doesn't translate standing as its source text, for those rules and for the same collisions as your source tree. Translating `news` and `new` both to `neu` fails in `de` alone:

```text
Locale de: …/src/routes/new/route.ts:1:1: Ordinary route collision/overlap: src/routes/new/route.ts (/neu); src/routes/news/route.ts (/neu)
```

A locale also fails when its words put a route under another route's catchall that Angular tries first, where your source words don't: with `docs` and its child `$rest[]` next to `manuals/start`, translating `docs` and `manuals` both to `dokumente` would send `/dokumente/anfang` to the catchall.

```text
Locale de: …/src/routes/docs/$rest[]/route.ts:1:1: Catchall shadows a route: src/routes/docs/$rest[]/route.ts (/dokumente/$rest[]) is tried before src/routes/manuals/start/route.ts (/dokumente/anfang)
```

The check compares against your source tree: a route your source words already put under such a catchall, such as a root `docs/special` beside `docs/$rest[]`, is unreachable in every locale and isn't reported. Generation doesn't reject that shadowing in your source tree: Angular's table order decides, as in plain Angular, and that stays so in 1.x ([SPEC.md](SPEC.md#stability)).

Every static word is translatable, including ones an outside system depends on, such as `api`, `.well-known` or an OAuth callback path. Give those a translation equal to their source text.

Missing translations are Angular's to report. Its default, `i18nMissingTranslation: "warning"`, ships the source word, so a German URL can mix translated and untranslated words. Use `"error"` when every URL must be translated. Adding a route with a new word then works like this:

1. Add the route.
2. Run `ng build` (or keep `ng serve` running). Generation writes the new files; Angular then fails, naming `route.segment.<word>`.
3. Run `ng extract-i18n` and translate the new unit.
4. Run `ng build` again.

**URLs and links.** `createUrl` returns the build's words relative to the router root, `/produkte/42`, without the locale's `subPath`; `RouterLink` and router navigation add it, and a raw `href` doesn't. For a document URL with its locale's base, in this locale or another, use `localeUrls`.

**Language switcher and hreflang.** `localeUrls(destination, values)` gives a page's URL in every configured locale, base href included, and every [active route](#the-active-route) entry has a `localeUrls` signal for the current page. The builders compute each locale's words from your catalogs and hand them to the package at build time, so nothing in your route files or generated files changes:

```ts
import { localeUrls } from "@loozo/angular-router";
import { destination as product } from "./routes/products/$productId/destination.generated.js";

localeUrls(product, { params: { productId: 42 } });
// [{ locale: "en", url: "/en/products/42" }, { locale: "de", url: "/de/produkte/42" }]
```

A shell renders the switcher from the active route. Use plain `href`s: each locale is its own build, so a click is a document navigation, and `RouterLink` would put the URL under this build's base (`/de/en/products/42`):

[src/language-switcher.ts](snippets/src/language-switcher.ts)

For `<link rel="alternate" hreflang>`, call this from the shell's constructor. It runs during server rendering and prerendering, so crawlers get the links in the HTML, and it follows client navigation. Set `origin` to your public origin: prerendering has no request, and behind a proxy the request's origin can be an internal one. It removes only its own links, so an RSS alternate stays, adds `x-default` as the source locale, and skips the not-found route:

[src/alternates.ts](snippets/src/alternates.ts)

- **Locales.** Every locale in `angular.json` `i18n`, whatever `localize` builds, the source locale first. Separately built locales (`localize: ["de"]`, then `["en"]`) give the same list, so hreflang stays reciprocal. A configured locale you don't ship yet gets links that 404: remove it from `i18n` until it ships, or filter it out of the list.
- **What's carried.** The active form keeps the page's params and declared search keys, so page 2 of a list links to page 2. A search value equal to its `withFallback` value is left out (`/en/products`, not `/en/products?page=1`), and so are undeclared query keys such as `utm_source` and the fragment. To keep a fragment, narrow with `is()` and call `localeUrls(destination, { …, fragment })`. Open [named outlet](#named-outlets) branches are left out: the URLs carry the primary page alone, so switching language closes an open panel. That stays so in 1.x ([SPEC.md](SPEC.md#stability)). Param and catchall values aren't translated: the not-found page on `/de/products/2` links to `/en/products/2`.
- **Base hrefs.** Each URL starts with that locale build's `<base href>`, as Angular computes it from `baseHref` and the locale's `subPath` or `baseHref`, so it's absolute when the base is. A locale whose base Angular leaves to the build (an empty `baseHref`) uses the build's `baseHref`, else `/`; an `index.html` base other than `/` isn't read. A relative base, such as `baseHref: "app/"`, gives relative URLs, and the build warns about it.
- **No list.** Both forms give `[]` wherever no build defined the locale table: an unlocalized build, a multi-locale `ng serve`, `ng test`, and a build that doesn't run the router's or Launch's builders. A switcher then renders nothing and the snippet adds no links. The values are still checked, so a wrong call fails in unit tests too.
- **Hydrated pages.** The active route is `undefined` from hydration until the browser's first navigation completes, so the switcher re-renders its links and the snippet rewrites its head links then; crawlers and readers without JavaScript have the server's HTML either way. With [`provideActiveRouteHydration()`](#the-active-route-on-hydrated-pages), a page with a usable seed keeps the server's links. The provider has costs and cases without a seed, which that section lists; it's optional for a switcher.

Without `translateSegments`, a localized build still gets the list, with each locale's base and your source words: `/en/products/42` and `/de/products/42`. The builders pass the list as Angular's `define.loozoRouterLocales`, so that key is reserved in your own `define`.

**Server routes.** `serverRoutePath(destination)` gives a route's Angular path in the running build's words, so one server route covers every locale:

```ts
import { LOCALE_ID, inject } from "@angular/core";
import { RenderMode, type ServerRoute } from "@angular/ssr";
import { serverRoutePath } from "@loozo/angular-router";
import { destination as product } from "./routes/products/$productId/destination.generated.js";

export const serverRoutes: ServerRoute[] = [
  {
    path: serverRoutePath(product), // "products/:productId" in en, "produkte/:productId" in de
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const locale = inject(LOCALE_ID); // before any await
      // …ids for this locale…
      return [{ productId: "1" }];
    },
  },
  { path: "**", renderMode: RenderMode.Server },
];
```

A server route that spells out the source words fails Angular's route check in every other locale. `getPrerenderParams` runs once per locale.

**Serving.** A multi-locale `localize: true` dev server serves untranslated source, so serve one locale, for example with `"localize": ["de"]` in the serve target's build configuration. Serve also watches the catalogs and checks them on every edit, logging an error at once. Angular's dev server only reads catalogs when it rebuilds, though, and usually doesn't watch them, so a catalog edit reaches the app at your next source save or restart. Until then the old words are served. (A catalog Angular already watches, because it's imported, listed as an asset or under a root watched with `NG_BUILD_WATCH_ROOT=1`, reaches the app at once instead.) After a rebuild with a broken catalog, a collided route is unreachable in that locale, and a translation that isn't one segment makes server rendering fail.

In a single-locale dev server, `localeUrls` gives the served locale's URLs without its prefix (`/produkte/2`), matching the dev server's flat output, and the other locales' production URLs, which this dev server doesn't serve: they reach the served locale's not-found page, so check other locales in a production build. The dev server reads the locale words once, when it starts. After a translation edit or a new route word, pages change at the next rebuild, but `localeUrls` keeps the words it started with until you restart `ng serve`, and serve says so:

```text
Locale words changed (route.segment.members in de). Links from localeUrls keep the words ng serve started with until you restart it.
```

Launch applications turn it on in Launch's builders; see Launch's [Translated URLs](../angular-launch/README.md#translated-urls). [`examples/angular-router/localize-proof`](../../examples/angular-router/localize-proof/README.md) is a working en + de app with prerendering, a lazy children table, a redirect, the language switcher and hreflang alternates.

## Unit tests and i18n extraction

Point Angular's unit-test and extract-i18n builders at the router's application target, the same way `ng new` points them at the official one:

```json
"test": {
  "builder": "@angular/build:unit-test",
  "options": { "buildTarget": "app:build" }
},
"extract-i18n": {
  "builder": "@angular/build:extract-i18n",
  "options": { "buildTarget": "app:build" }
}
```

Neither builder runs generation; both use the generated files already on disk, including the route messages of [translated URLs](#translated-urls). After you add, move or remove routes, run `ng build` first, or keep `ng serve` running. Otherwise `ng test` can't match the new routes, and `ng extract-i18n` silently leaves out the messages of pages the stale routes don't load. In CI, committed generated files and `ng build --configuration ci` cover this.

`ng test` warns that the `buildTarget` uses `@loozo/angular-router:application`, "which is not supported". The warning is expected: the unit-test builder reads the target's options, and Angular ignores the router's own ones.

The rest is the usual Angular setup. Give specs their own `tsconfig.spec.json` with `"types": ["vitest/globals"]`, and exclude `src/**/*.spec.ts` from the application tsconfig. For `i18n` attributes, add `@angular/localize/init` to the build target's `polyfills`.

### Testing pages

`injectRoute()` throws unless the component's `ActivatedRoute` is the route it was generated for, so `TestBed.createComponent` on a page fails with `Generated route wiring identity mismatch`. Navigate to the page through the generated routes instead, with Angular's `RouterTestingHarness`:

[src/routes/teams/$teamId/items/$id/page.spec.ts](snippets/src/routes/teams/$teamId/items/$id/page.spec.ts)

The navigation runs the real codecs, guards and resolvers. `navigateByUrl` resolves once the page is on screen, with its instance, so the handle already holds the parsed values. Replace what a resolver injects with a provider, as `ItemCatalog` is here. `data` includes the ancestors' resolver results: `team` comes from the `teams/$teamId` route's resolver. With `vitest/globals`, the import from `vitest` is optional.

A component inside the page's template gets the page's `ActivatedRoute`, so the same applies to it: render it through the page's route.

A component that calls `injectActiveRoute()`, such as a shell, doesn't need a route of its own: `TestBed.createComponent` works, and the active route is `undefined` until a navigation, such as the harness's, completes.

## What gets generated

| File                                                    | Contents                                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<outDirectory>/routes.generated.ts`                    | `routes: Routes` for `provideRouter`, `injectActiveRoute()`, the `RouteTypes` it's typed with, `provideActiveRouteHydration()`, `provideSearchStorage()` and `currentSearchRestore()` |
| `destination.generated.ts` beside each route            | `destination`: the route's URL facts                                                                                                                                                  |
| `route.generated.ts` beside each route                  | `route`, the declaration's browser copy, and `injectRoute()` for a route that has a page or descendants with pages                                                                    |
| `children.generated.ts` beside each route with children | `routes`: its children's records, which its own record loads with `loadChildren`; nothing else imports it                                                                             |

The two files beside a route are copies of its declaration with the same line numbers, so a stack trace or a type error in either points at the matching line of the declaration. `destination.generated.ts` keeps only the path and URL facts, and the imports and top-level code they use. `route.generated.ts` takes its URL facts from the destination and keeps the steps, minus any that a route extension marks server-only; imports and top-level helpers that only the removed parts used go too, and other top-level code stays as you wrote it. Generation type-checks both copies and reports their errors at the declaration's line. Redirect routes get both files too, without `injectRoute()`.

Each generated file carries an ownership marker comment such as `// @loozo/angular-router routegen: owned route.generated.ts`: on the first line of `routes.generated.ts` and each `children.generated.ts`, and on the last line of the two copies beside each route, so their other lines can match the declaration's. The builder only replaces or deletes marked files with those exact names. It never overwrites an unmarked file in their place, and it removes stale marked files when their routes disappear. Hand edits to generated files are overwritten. Generated files are written with LF line endings; a copy that Git checked out with CRLF line endings, as it does on Windows by default, counts as up to date.

Generation reads your source without importing or running it. It validates everything (declarations, overlapping routes, redirects, imports, file ownership) before writing anything, so a run that fails validation leaves your files as they were. Files are then written one at a time, with no rollback: if writing fails partway, for example on a file that isn't writable, or the run is interrupted, some files may already be updated. The next successful run repairs them. Unchanged files aren't rewritten, so their modification times stay the same.

With `check: true`, the builder computes the same result but writes nothing. It fails if any generated file is changed, missing or stale, and the Angular build doesn't run.

Generation checks route structure, not your whole program. Type errors elsewhere still show up in the Angular build itself.

### Importing routes

Nothing imports a `route.ts` except its child routes' `route.ts`, as their `parent` default import. Everything else, server code included, imports the route's `destination` from `destination.generated.ts`, and a page imports `injectRoute` from its own `route.generated.ts`. Any other import of a route module, in any form (`import`, `import type`, `export … from`, `import()`, `require`), fails generation. That covers every file in the program of the `tsconfig` option, and the JavaScript files those files run that the program doesn't hold, such as a `helper.js` behind its `helper.d.ts` without `allowJs`:

```text
/workspace/src/config.ts:3:21: Import of a route declaration: ./routes/not-found/route.js. Import its destination from ./routes/not-found/destination.generated.js instead.
```

A route module exports only its route, as its default export; move shared helpers into a module of their own. Its top-level names can't start with `routegen$`, which generated code uses.

A route's copies run when the table that holds its record loads, `routes.generated.ts` at startup or a children table when Angular first matches its parent, so generation also checks what they import, following imports through your own modules:

- The modules a route's URL facts import, such as a custom codec, may import only packages and other non-generated modules (`URL facts import reaches a generated file`).
- The modules a route's steps import, such as a guard helper, may import destination files but no `route.ts`, `route.generated.ts`, `children.generated.ts` or `routes.generated.ts` (`Route copy import reaches a generated route module`): that import would read a route before it exists.
- The copies run in the browser, so neither may keep an import of a `*.server.*` module or a `node:` builtin (`Browser route copy imports a server module`). An import that only server-only steps use leaves with them, and an `import type` is erased.

Each message names the chain of imports that broke the rule. When the last link only needs types, make it `import type`: type-only imports aren't followed, and neither is `import { type X }` with every name marked `type`, unless `verbatimModuleSyntax` is on. A dynamic `import()` isn't followed either, since it runs later. Every other import counts, `require` included, even one used only as a type, because Angular keeps imports that dependency injection uses. Imports with a computed specifier, such as `import(name)`, fail anywhere in the app, because generation can't follow them.

## Builder options

### `@loozo/angular-router:application`

All `@angular/build:application` options, plus:

| Option              | Type                             | Default  | Description                                                                                                                                                        |
| ------------------- | -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tsconfig`          | `string`                         | required | TypeScript config used to find route declarations. Relative to the workspace root.                                                                                 |
| `scanDirectories`   | `string[]`                       | required | Exactly one directory containing your routes. Relative to the `tsconfig` file's directory.                                                                         |
| `outDirectory`      | `string`                         | required | Where `routes.generated.ts` goes. Relative to the workspace root; must be outside the scan directory.                                                              |
| `check`             | `boolean`                        | `false`  | Verify generated files without writing them. Fails on any drift.                                                                                                   |
| `translateSegments` | `boolean`                        | `false`  | Translate static segments per Angular localize build ([Translated URLs](#translated-urls)).                                                                        |
| `autoDefineRoutes`  | `false \| { filename?: string }` | `{}`     | [Filesystem route definitions](#filesystem-route-definitions), seeding `filename` (default `route.ts`). `false` selects [explicit authoring](#explicit-authoring). |

The builder runs generation once, then the official application build. Invalid options stop the build before generation starts. Generation errors, including drift in check mode, are logged and fail the build before the Angular build runs. `watch: true` is rejected; use the serve builder for watching.

### `@loozo/angular-router:serve`

All `@angular/build:dev-server` options, set in `angular.json` or on the command line (`ng serve --port 4300`), plus:

| Option        | Type              | Default  | Description                                                                          |
| ------------- | ----------------- | -------- | ------------------------------------------------------------------------------------ |
| `buildTarget` | `string`          | required | A target that uses `@loozo/angular-router:application`. Router options come from it. |
| `poll`        | `number \| false` | `1000`   | File-watch polling interval in milliseconds, or `false` for no default.              |

Invalid options stop the serve builder before it generates anything, and so does an invalid build target. It watches the scan directory and regenerates when files are added, changed or removed, once changes have been quiet for 150 ms, so saving several files at once runs one pass. Adding, changing or removing a template, style, image, font or Markdown file (`.html`, `.css`, `.scss`, `.sass`, `.less`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`, `.svg`, `.ico`, `.woff`, `.woff2`, `.ttf`, `.otf` or `.md`) doesn't regenerate, since generation never reads one; Angular's dev server still rebuilds for it. Such a file still regenerates when it's a symlink or a translation catalog, or when it changes during a pass or after a failed one. A generation tsconfig, or a config it extends, with one of those extensions inside the scan directory isn't supported: editing it doesn't regenerate. The initial generation must succeed before the dev server starts; if it fails, the error is logged and the builder reports a failed build. Later errors are logged, and the server keeps running until you fix them. The build target must not resolve `check: true`, because serving always writes generated files.

Polling is on by default because Angular's native file watcher missed edits to files inside a renamed directory when this was checked on Angular 22.2.2, which left the dev server serving stale output. Polling costs some idle CPU (about 3% of one core on the example app at 1000 ms, against under 0.1% without), and more on larger workspaces.

To go back to native file events, set `"poll": false` in the serve target or one of its configurations. The router then adds no default, and Angular's own configuration applies, including a `poll` set on the build target. A positive number overrides the build target's `poll`. `0` is rejected. On the command line, `--poll` accepts milliseconds only; set `false` in `angular.json`.

## Limitations

- No standalone generation CLI or public route-graph API. Generate through the two builders.
- Route and page files must be `.ts`; `.mts`, `.cts` and `.tsx` are ignored without a warning. This stays after 1.0: Angular templates aren't JSX, and Angular's tooling isn't set up for components in `.mts` or `.cts` files.
- Route declarations can't use custom matchers or write `loadChildren`; generation emits `loadChildren` for every route with children ([Lazy route children](#lazy-route-children)).
- [Named outlets](#named-outlets) don't nest, have no empty-path routes, own no search or fragments, and can't hold redirect sources. One navigation opens or closes one branch. Filesystem mode has no directory convention for them: write `outlet` in the route file. Hand-written outlet routes aren't validated against generated ones, and next to a generated empty route they leave it full-match, so declare branches with `outlet`.
- One scan directory per application, and routes from other packages aren't generated. Compose a library's own `Routes` by hand next to the generated ones; typed links can't reach them.
- Only marked search keys are carried over by links and navigation ([Retained search keys](#retained-search-keys)); there's no general query merge, and `createUrl` and redirects never carry values over. Under eager URL updates, links read during the first client navigation leave retained keys out until it completes.
- [Remembered search keys](#remembered-search-keys) are stored per origin and browser profile, or as your adapter decides; storage is synchronous only. A value is remembered per route, not per param value, and a restore always rewrites the URL. A guard runs twice on an entry that restores. A key named `__proto__` doesn't survive a reload or a typed URL: Angular's URL parser drops it. The restore depends on how Angular 22.3 orders guards and resolvers, which the package's tests check on every Angular upgrade.
- No data, URL or transfer caches. Resolver data lives in Angular. The active-route hydration seed is display state the browser drops at its first navigation's outcome; it skips no guard, resolver or load.
- [Translated URLs](#translated-urls) have no locale detection or redirects, switching locale inside one build, or translated param, catchall or search values (`localeUrls` keeps them as they are), and no built-in head manager: hreflang links are the documented snippet in your app; for Launch applications, see Launch's [Translated URLs](../angular-launch/README.md#translated-urls). Angular's per-locale builds serve each locale under its own base href (`subPath`), which `RouterLink` and router navigation apply but `createUrl` strings don't include. A `$locale` param puts the locale in the route tree instead, and every typed link passes it. Use one or the other, not both.
- Angular drops a resolver result named `__proto__`, so a resolver with that name has no value in `data`. This was found on Angular 22.2.2, and the package's lifecycle test still checks it on 22.3.0.
- Writes are individual file replacements. A write error or an interrupted run can leave mixed output; the next successful run repairs it.

## Further reading

- [`SPEC.md`](SPEC.md): the full contract, including every edge case
- [`examples/angular-router`](../../examples/angular-router/): a minimal app using the builders
- [`examples/angular-router/ssr-proof`](../../examples/angular-router/ssr-proof/README.md): SSR and hydration
- [`examples/angular-router/localize-proof`](../../examples/angular-router/localize-proof/README.md): translated URLs

## Developing this package

Requires Node 24.21.0 and pnpm 12.9.1. Install from the workspace root with `pnpm_config_pm_on_fail=error pnpm_config_verify_deps_before_run=error pnpm install --frozen-lockfile`. From this directory:

```sh
pnpm run build                 # Node builders/generation (tsc), then the Angular package (ng-packagr)
pnpm run check                 # formatting and lint
pnpm run typecheck             # strict source typecheck
pnpm run typecheck:consumers   # consumer typecheck against the built package (NodeNext and Bundler)
pnpm run test                  # node tests, snippet check, then the consumer typecheck (build first)
```

`build` regenerates `schemas/application.json` from the installed `@angular/build`; `pnpm test` fails when the committed schema is stale.

The browser tests use real Angular builds and Playwright's Chromium (`pnpm exec playwright install chromium`). Each takes a fresh absolute directory, which must not exist yet, for its evidence:

```sh
pnpm run test:application /absolute/new-directory
pnpm run test:navigation /absolute/new-directory
pnpm run test:lifecycle /absolute/new-directory
pnpm run test:ssr /absolute/new-directory
pnpm run test:localize /absolute/new-directory  # translated segments: en + de build, SSR, prerender, extraction, serve
pnpm run test:filesystem /absolute/new-directory
pnpm run test:tooling /absolute/new-directory   # ng test and ng extract-i18n, no browser
node tests/packed.mjs /absolute/new-directory   # packed-package consumer check
```

To measure generation, serving, build, type-check and bundle size at scale, see [`bench/README.md`](bench/README.md).

To run the example app from the workspace root after building the package:

```sh
pnpm --filter @loozo/angular-router run example:build   # generate + build
pnpm --filter @loozo/angular-router run example:check   # check generated files + build
pnpm --filter @loozo/angular-router run example:serve   # generate + dev server
```
