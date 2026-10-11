# @loozo/angular-router

Typed route declarations, codecs, URLs and navigation on top of Angular’s native router. Static generation supplies route configuration, typed destinations and route handles without introducing a second router. Angular owns matching, activation, guards, resolvers, redirects, history and stability.

This is an experimental implementation. The reviewed rebuild passed all 126 cases in the approved acceptance copy, plus source review and native consumer/build/browser checks. It is not yet broadly battle-tested. Version `0.0.1` is experimental and MIT-licensed.

```ts
import {
  defineRoute,
  createUrl,
  numberParam,
  enumParam,
  optionalSearchParam,
} from "@loozo/angular-router";

const product = defineRoute("products/$productId", {
  params: { productId: numberParam },
  search: { tab: optionalSearchParam(enumParam(["details", "reviews"])) },
  fragments: ["summary", "reviews"],
});

createUrl(product, {
  params: { productId: 42 },
  search: { tab: "reviews" },
  fragment: "summary",
}); // /products/42?tab=reviews#summary
```

Root runtime exports are exactly `defineRoute`, `createUrl`, `stringParam`, `numberParam`, `booleanParam`, `enumParam`, `optionalSearchParam`, `nullableSearchParam`. Public types are `Route` and `ParamCodec`. `_core` is internal package coupling, not an application metadata/graph API.

Paths are decoded authored text. `$id` consumes one logical value (repeated local occurrences reuse that value); terminal `$parts[]` consumes a required readonly array, including `[]`. Parent declarations inherit input ownership through pathless nodes. Catchalls cannot have children. Search keys are globally sorted; fragment names are local, never inherited. Codecs stringify synchronously; no parsing or native callbacks run during declaration/URL creation.

Route membership is per physical package instance. Routes and owned containers are shallow-frozen; application codecs, callbacks/providers and opaque values retain identity and are not recursively frozen. `Route<Path, Params, Search, Resolvers = {}>` has readonly optional input/data witnesses. Callback inputs infer effective params/search, except matching guards see only local positional params. Local data unwraps Promise/Observable outputs and excludes RedirectCommand.

- [Public contract](SPEC.md)
- [Consumer example](../../examples/angular-router/)
- [Handwritten SSR/hydration proof](../../examples/angular-router/ssr-proof/README.md)

## Commands

Prerequisites: Node 24.21.0, pnpm 12.9.1, ordinary workspace installation. Run installation from the workspace with `pnpm_config_pm_on_fail=error pnpm_config_verify_deps_before_run=error pnpm install --frozen-lockfile`.

From this package directory:

```sh
pnpm run build                 # NodeNext tsc + native ng-packagr primary/_core/_generated APF
pnpm run check                 # no-fix source formatting/lint checks
pnpm run typecheck             # strict source check, no output
pnpm run typecheck:consumers   # strict NodeNext and ESNext/Bundler against actual APF
pnpm run test                  # durable public-root runtime regressions; plain Node
pnpm run test:root             # explicit alias for the same runtime suite
pnpm run test:application /absolute/task-owned/absent-evidence-directory
pnpm run test:navigation /absolute/task-owned/absent-evidence-directory
pnpm run test:lifecycle /absolute/task-owned/absent-evidence-directory
pnpm run test:ssr /absolute/task-owned/absent-evidence-directory
node tests/packed.mjs /absolute/task-owned/fresh-evidence-directory
```

Build cleans/emits only package `node/`, then ng-packagr cleans/emits `dist/` and uses package `node_modules/.cache/ng-packagr`; it cannot generate/repair application files. Private Node generation/builders use ordinary NodeNext tsc; manifests/schemas/Node JS are copied as APF assets. Source and packed builder manifests use the same relative paths. Source metadata points to built APF output; ng-packagr rewrites dist metadata to its own paths. Packed verification writes only the supplied fresh evidence directory, packs the actual dist manifest, checks the handwritten TypeScript consumer under NodeNext and ESNext/Bundler, nominal declaration brands, eight-value namespace, plain-Node loading and distinct physical instances. It reuses actual installed dependency bindings; there is no loader/compiler adapter or publication.

## Authored application → native Angular

The application installs `routes` from `generated/routes.generated.js` with native `provideRouter`. The companion targets in `examples/angular-router/angular.json` generate only exact-name marked artifacts and delegate directly to the official application/dev-server targets. Source candidates are native tsconfig roots intersected with configured scans; analysis never imports/evaluates app modules. Definitions/pages remain application-owned. `_generated` is internal generator coupling, not a supported graph API.

From the workspace root, after package build:

```sh
pnpm --filter @loozo/angular-router run example:build  # generation + official Angular build
pnpm --filter @loozo/angular-router run example:check  # read-only generation check + build
pnpm --filter @loozo/angular-router run example:serve  # generation + official dev-server
```

The colocated facade exports parameterless `injectRoute()` and an inert `destination`. Definition getters/reference construction avoid eager ESM binding reads. Normal lazy page imports are extensionless direct import promises; emitted `.js` is used only when native Bundler resolution needs it to preserve the discovered identity.

Durable public Architect/filesystem/real-browser development regression (requires `/usr/bin/chromium`):

```sh
pnpm --filter @loozo/angular-router run test:application /absolute/task-owned/absent-evidence-directory
```

The evidence-directory argument is required and must not exist. This creates an owned consumer copy, checks concrete facade-factory provenance, literal module-reference preflight, native exact/wildcard ambient helpers, drift priority/nonwrites/byte-identical modes/nanosecond mtimes, and native watch/repair/stop. Its page.js.ts + named-only page.ts collision is built by real Angular and rendered in Chromium.

## Generated selection → native navigation

```ts
import { injectRoute } from "./route.generated.js";
import { destination as report } from "../report/route.generated.js";

const route = injectRoute(); // parameterless, noncallable; readonly native Resources
route.link(".", { params: { scopeId: "x" } }); // exact declaration schema
route.link("./", { params: { scopeId: "x" }, search: { leaf: "required" } }); // canonical winner at this path
route.link("/reports/$reportId", { params: { reportId: 42 } }); // literal template, not concrete URL
route.navigate(report, { params: { reportId: 42 } }); // exact exported object declaration
```

Every origin's absolute and URL-segment-relative selections are computed statically into one shared artifact; colocated facades do not duplicate graph tables. Relative climbs count authored template segments, not directories or parent edges. Unknown/intermediate/nonwinning paths, over-climbs, mixed traversal and query/hash relative suffixes are absent. Catchall origins expose exact-current and absolute/reference targets, never depth-dependent relative navigation. Absolute redirect-source selections serialize their source inputs.

Selectors must be single known literals (not widened strings/unions). Values retain the selected target's codecs, required/optional search modifiers and own fragments, with no current-input reuse or third/extras argument. References have a module-local type set identity and authenticate at runtime through weak ownership plus the exact stable generated set object; byte-identical foreign sets and clones are not equivalent. No route expression is parsed against a graph at runtime. Validation/serialization is synchronous before Angular: link calls native parseUrl; navigate calls native navigateByUrl and returns that identical Promise.

`test:navigation` uses handwritten strict generated consumers and genuine Architect/Angular/Chromium to check type negatives (including optional prototype-named keys), canonical/exact/reference targets, foreign sets, invalid-call non-entry, native Promise/RouterLink behavior and unrelated facade stability. Like `test:application`, it requires a fresh absent evidence directory.

## Native inputs and lifecycle

Exact declarations/complete snapshots share one frozen parsed-input operation; matching candidates share a separate local-position/effective-query operation. All raw cardinalities/types are checked before independent codecs launch. Guards/resolvers enter in the captured native Injector only while subscribed; Angular owns ordering, first values, empty/redirect/error semantics and teardown. Local data projects only own native results among declared string and symbol resolver keys, preserving own `undefined` and opaque values; inherited or missing results are not fabricated. Native rerun policy remains authoritative.

Angular 22.1.5 compatibility footnote: Angular’s resolved-data accumulator loses a resolver result named `__proto__`. The handle follows native behavior: it omits the missing value rather than fabricating inherited data. This is an upstream Angular issue, not an added package restriction or an alpha-release blocker. No transport workaround or result cache is added.

Each handle owns paired params/search visibility and independent local data, projected into real readonly native Resources. Navigation hides old values; cancel/skip restores the true survivor without reparsing. Commitment bookkeeping is separate from visibility, including reentrant Start8→End7→Cancel8. Relevant handle work holds native PendingTasks, publishes before release, and releases on error/obsolete commitment/destruction. Constructor-time task handoff covers handles created inside native terminal listeners. Promises are not abortable; late failures are observed and cannot publish obsolete output. No URL/data cache, timeout, or second router exists.

`test:lifecycle` uses actual Architect/Angular/Chromium and public Router/ApplicationRef/PendingTasks with asynchronous gates, a never-settling obsolete survivor, terminal-listener construction, own string/symbol data, nearest declaring-parent ancestry, injector destruction during task acquisition, same-URL skip reentry, iframe/host Promise guards/resolvers, and synchronous preserved-search failure with a later source rejection. Like the other public tests it requires a fresh absent evidence-directory argument.

The independent rebuild acceptance suite and its preserved results live outside this product repository. Full acceptance passed against the reviewed rebuild using the explicitly approved v2 copy. That copy corrects two fixture assumptions: an already-current native redirect resolves `false`, and the SSR route TypeScript program needs Node ambient types. Original inputs and earlier failed results remain preserved separately; this is not a claim that the unchanged original suite passed. The supplied handwritten home consumer remains unchanged.

## Native SSR and hydration proof

`examples/angular-router/ssr-proof/` is a separate handwritten Angular application. Componentless team inputs, delayed item/score codecs (75 ms), local deterministic catalog resolution, a query/hash-dropping alias, and a resolver-free delayed handle page use genuine generated facades. Shared configuration uses native hydration with no HTTP transfer cache and no blocking initial navigation.

`test:ssr` copies that actual application into the required fresh absent evidence directory, runs ordinary Architect production builds and read-only generation checks, and checks strict native TypeScript/Angular templates. Built `AngularNodeAppEngine` + Node HTTP demonstrate native302, matched-position matrix isolation, concurrent request isolation and handle-only stability. Official dev-server + Chromium preserve exact original SSR document/element/text Nodes during hydration, then reuse the same component/DOM for typed alias and query-only SPA navigation. Native production metafile evidence checks browser closure and genuinely lazy page chunks. Servers/browser/Architect runs are stopped in `finally`; raw HTTP HTML/headers, logs, stats and observations remain inspectable.

This is a bounded SSR/hydration proof, not cross-browser certification or exhaustive request/fault coverage. The Node entry is a loopback SSR HTTP proof server, not a production static-asset deployment server; use official companion serve for browser demonstration. See the [SSR proof README](../../examples/angular-router/ssr-proof/README.md).
