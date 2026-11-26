# @loozo/angular-router specification

This is the package's contract. From 1.0.0 it follows semantic versioning (§1 "Stability"): a breaking change to anything public here waits for a major release.

Requirements below are normative unless explicitly marked as examples, limitations, or unspecified behavior. Structure and algorithms are free within that boundary.

## 1. Product and compatibility boundary [P]

Angular Router continues to own matching, decoding, activation, history, guards, lazy component loading, native resolver execution, redirects, and navigation promises/events. This package adds typed declarations, URL values, generated route configuration, route-local handles, and Angular build/serve integration. It is not a replacement router.

The concrete consumer is an Angular application that:

1. Authors route declarations and standalone pages.
2. Generates and commits route configuration and, beside each declaration, its destination and route copies.
3. Installs generated `routes` with `provideRouter`.
4. Imports route destinations for URLs, links, navigation, redirects and active-route tests; its colocated parameterless `injectRoute()` for typed values, data, links, and navigation; and the generated `injectActiveRoute()` where it reads the active route from outside the route's page, such as a shell. Application code never imports a declaration module (§10).
5. Uses Angular's application build, dev-server, SSR, and hydration.

### Supported surfaces

| Surface                                | Contract                                                                                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@loozo/angular-router`                | `defineRoute`, `createUrl`, `localeUrls`, `serverRoutePath`, `stringParam`, `numberParam`, `booleanParam`, `enumParam`, `withFallback`, `arrayParam`, `retained`, `remembered`; exported types `Route`, `ParamCodec`, `Destination`, `LocaleUrl`, `ParamsOf`, `SearchOf`, `TargetOf`, `SearchStorage`, `SearchRestore` |
| `@loozo/angular-router/package.json`   | Package metadata subpath                                                                                                                                                                                 |
| `@loozo/angular-router:application`    | Angular Architect application companion                                                                                                                                                                  |
| `@loozo/angular-router:serve`          | Angular Architect dev-server companion                                                                                                                                                                   |
| Colocated `destination.generated` module | Inert typed `destination` reference (§6)                                                                                                                                                               |
| Colocated `route.generated` module     | `route`, the declaration's browser route copy (§11), and, for an activating declaration, parameterless `injectRoute()`                                                                                  |
| Global `routes.generated` module       | `routes: Routes`, `injectActiveRoute()`, its `ActiveRoute` and `ActiveHandle` types, the type-only `RouteTypes` map they're typed with, `provideActiveRouteHydration()`, `provideSearchStorage()` and `currentSearchRestore()` (§7)                            |
| Colocated `children.generated` module  | `routes`, the records of a route's children, which that route's record loads through `loadChildren` (§11); generator-owned and not imported by applications                                            |

The root has no `injectRoute(route)`, `parseSearch`, `defineRedirect`, resolver executor, or general parser export. Do not expose private helper APIs merely to accommodate tests written against them. There is no supported programmatic source-graph API: the old `/tooling`, `buildRouteSourceGraph()`, and exported graph/diagnostic types are deliberately outside compatibility.

### Generation-first boundary

Generate the Angular configuration, route-specific guard/resolver/redirect adapters, typed route-local handles and destination references, and navigation/link bindings that Angular and the application consume. Resolve known authored ancestry, `..` targets, and redirect mappings during generation rather than shipping a second source-graph interpreter to the application.

Generated modules never reference a declaration module. Each declaration is reproduced beside itself as two generated copies (§11): a destination copy holding its URL facts, and a route copy holding its browser behavior. Generated configuration, handles and application code read those; a declaration module is imported only by its children's declarations, as their `parent` (§10).

Generated code necessarily executes at runtime. Small shared helpers may perform codec parsing, serialization, or reusable Angular adaptation where sharing addresses a concrete need. Helpers must not become a separate routing framework that owns matching, navigation, or resolver execution. No `/generated-runtime` layer or particular helper entry-point name is required. Helper exports needed by generated modules are generator-owned coupling, not an independently supported application API.

Node-side source analysis/generation is private implementation used by the application/serve builders. It needs separation from browser code, not a public secondary entry point. Its internal graph/model, functions, return shapes, immutability, and module layout are not product contracts.

The root, generated application modules, and any helpers they import must remain browser-safe. Node, filesystem, compiler, watcher, and Architect dependencies must not enter their browser dependency closures. The builders own Node-side generation. No `loozo-routegen` bin, separate CLI flags/exit protocol, or public generator API is supported. Generate through Angular build/serve; check committed output through an application-builder CI configuration.

### Stability

The package is published to npm under the MIT license; its version is the one in `package.json`. From 1.0.0, releases follow [semantic versioning](https://semver.org/spec/v2.0.0.html) over the public contract below: a fix is a patch, a compatible addition is a minor, and an incompatible change is a major. Supported Angular versions are part of the contract, with one exception: moving to a new Angular minor is a minor release, and moving to a new Angular major is a major. The README's [Angular versions](README.md#angular-versions) owns that policy and its example. Behavior this spec leaves unspecified (§15) is outside the contract.

**Public.** Breaking any of these needs a major release:

- The root's values and exported types (Supported surfaces), and the types they infer for application code.
- The semantics this spec gives declarations, codecs, URLs, destinations and handles (§2–§9).
- Generated modules: their locations and file names (§11), their application-facing exports in Supported surfaces and those exports' types, the exact ownership markers (§11), and their lifecycle: discovery, validation, seeding and synchronization, writing, check mode and stale removal (§10–§13).
- Both builder names; the router options, their defaults and their validation (§12, §13); the Angular options they pass through, which are the supported Angular version's own schema; and their `BuilderOutput` and logger behavior.
- The supported environment: Angular core, common and router peers `^22.0.0`, `@angular/build` `~22.3.0` (the application builder schema embeds that minor's application schema) and the optional `@angular/localize` `^22.0.0`, which `translateSegments` needs (§12). Releases are tested against Angular **22.3.0**, RxJS **7.8.2** and generator TypeScript **6.0.3**, not every version a peer range admits, and support covers those tested versions.
- The `@loozo/angular-router/package.json` metadata subpath. Its fields beyond the version, peers and builders aren't individually contractual.
- The behaviors kept below.

Having no CLI or graph API does not remove discovery, validation, or read-only generated-output checking.

**Private.** These may change in any release:

- The `_core`, `_generated` and `_generation` subpaths, generator-owned coupling for generated code and `@loozo/angular-launch`, not supported application APIs. `_core` also carries the route extension seam (§2 "Route extensions"): `createRouteFactory`, `RouteFactory`, `routeContributions` and their types. Its one intended extension is `@loozo/angular-launch`; the seam changes with Launch, outside the compatibility this spec gives the root.
- Node-side source analysis and its graph, model and functions (Generation-first boundary).
- Private module paths, helper names, caches, symbols, generic implementation machinery, generated local identifiers, emitter formatting, and exact generated bytes.
- Bundle size, execution speed and generated-source growth: no guarantee is made.

**Generated output.** Generated consumer contracts are stable within a major; emitted bytes are not. Any release, a patch included, may change generated bytes, and generated code and its helpers may be redesigned together within the generation-first boundary, so regenerate after every upgrade. Generated output from one release used with another release's helpers is not supported.

**Diagnostics.** Which conditions fail, the error class where this spec names one (such as `TypeError`), when the failure is reported (declaration, option validation, generation preflight, navigation), how a builder fails (§12, §13) and the output channel it uses are contractual. Human-readable message text, wherever this spec or the README quotes it, is illustrative: it may improve in any release. Ownership markers (§11) aren't diagnostics; they are exact strings.

**Angular's behavior.** Where this spec describes what Angular does with generated configuration (matching, activation, error boundaries, SSR, the dev server), the router guarantees what it generates and forwards, and Angular owns the rest. `.errorComponent` is developer preview in Angular: the router guarantees that it validates the component and forwards it unchanged (§7 "Error components"); how Angular renders it, and the outcomes §7 describes, follow the supported Angular version. A statement dated to an earlier Angular release, such as one naming Angular 22.2.2, records the evidence a rule was based on; it isn't a claim that every later Angular release was checked for it.

**Kept behaviors.** These are part of the 1.x contract as they stand. Changing them needs a major; an improvement in 1.x comes as an opt-in or a warning:

- A lone pathless group, a pathless declaration with children and no pathless sibling, isn't a sibling pathless group (§10 "Matching shapes and diagnostics"). It keeps Angular's native matching and gets no ownership guard, so its `canMatch` guards run, and once they pass its children table loads, for every URL that reaches it, including one that nothing beneath it matches.
- When a source-tree catchall shadows another route (as §10 defines shadowing) and the pair passes §3's and §10's catchall validation, generation accepts it without a diagnostic and Angular's table order decides, as in plain Angular: a root `docs/special` beside `docs/$rest[]` is unreachable. Shadowing that a locale's translated tree adds over the source tree is checked separately (§10 "Per locale").
- The active route's `localeUrls` (§6 "Active route") serialize each entry's own primary-outlet destination only. Open named-outlet branches are left out, so a language switch built from them closes an open outlet.

## 2. Route declarations [R]

### Consumer usage

```ts
import { defineRoute, enumParam, numberParam, withFallback } from "@loozo/angular-router";

const product = defineRoute("products/$productId", {
  params: { productId: numberParam },
  search: { tab: withFallback(enumParam(["details", "reviews"]), "details") },
  fragments: ["summary", "reviews"],
}).title(({ params }) => `Product ${params.productId}`);

product.path; // literal type and value: "products/$productId"
```

`defineRoute(path, facts)` requires an authored literal path and a URL facts object. Callers do not supply generic arguments to obtain inference; generation rejects them on a declaration's root call (§10). Widened `string` paths fail at compile time.

URL facts are `parent`, `params`, `search`, `fragments`, and `outlet`; nothing else. Behavior follows as chained steps, each taking exactly one argument: `.canMatch`, `.canActivate`, `.canActivateChild`, `.canDeactivate`, `.resolve`, `.title`, `.providers`, `.data`, `.runGuardsAndResolvers`, `.errorComponent`, `.onInvalidParams`, and `.redirect`. Guard, resolver, title and `onInvalidParams` signatures are specified in §8; `canDeactivate`, providers, data, and rerun policies otherwise use the supported Angular version's native types and behavior (§1 "Stability"), and `errorComponent` its behavior with its declared type, `Type<unknown>` from `@angular/core`, so the declarations type-check against any router in the peer range (§7 "Error components").

Steps come in any order, each at most once. `.redirect` is terminal: no step follows it, and it is not offered once `canMatch`, `canActivate`, `canActivateChild`, `canDeactivate`, `onInvalidParams` or `errorComponent` was used (§9). `.onInvalidParams` is offered only on paths with local placeholders. A step that is used or not offered is absent from the returned value: TypeScript reports a missing property at the offending call, and at runtime a captured reference to it throws a TypeError when called.

Generation owns paths, matching strategy, ancestry/children, component discovery/loading, outlet placement, and typed redirects. `path`, `pathMatch`, `matcher`, `children`, `component`, `loadComponent`, `loadChildren`, and `redirectTo` are neither URL facts nor steps; do not blindly spread an Angular Route. Any key in the facts object other than the five URL facts is rejected: an excess-property error at that key, `Unknown URL facts key` at runtime declaration, and a generation diagnostic that names the step to chain instead when the key is a behavior key. Deprecated `canLoad` is outside this target; use `canMatch`.

- Local `params` must exactly cover distinct local `$name` and `$name[]` placeholders, using the bare name as key. Missing, renamed, or extra keys fail. Extra local codec keys introduced through a variable also fail typing.
- A path without local placeholders forbids `params`, including `{ params: {} }`, and offers no `.onInvalidParams`.
- Repeated local placeholders share one codec and one URL-creation value.
- Search maps infer optional, fallback, array, enum, and custom values without manual generics.
- `withFallback` and `arrayParam` codecs cannot be path codecs, at type level or at runtime declaration.
- A codec whose `parse` result type is a Promise/PromiseLike is a type error where it is declared in a params or search map (catchall element codecs included) and as a `withFallback` or `arrayParam` argument.
- Malformed URL facts and codec records, unknown facts keys, and invalid paths fail at runtime independently of TypeScript, at `defineRoute`; a malformed step value fails at the step that supplies it. Codec entries must have callable parse/stringify methods.
- Declaration does not execute parsers, stringifiers, guards, resolvers, title callbacks, provider factories, or resolver-policy predicates.
- Native behavioral values are emitted/referenced without generation-time evaluation. Angular owns their DI, execution, ordering, and semantics. Static data is forwarded as authored, under any key: generated identity doesn't live in data (§11).
- Guard arrays and fragment-name lists are snapshotted without freezing caller-owned objects. Callback/provider identities are retained; no deep freezing of application values is promised.

### Named outlets

```ts
// A root-level branch: /(chat:chat/7) beside any primary page.
const chat = defineRoute("chat/$id", { outlet: "chat", params: { id: numberParam } });
// A branch below a primary route: /products/(detail:item/3), in the products page's outlet.
const item = defineRoute("item/$id", { parent: products, outlet: "detail", params: { id: numberParam } });
// Inside the chat branch, in the chat page's primary outlet: /(chat:chat/7/settings).
const settings = defineRoute("settings", { parent: chat });
```

`outlet` puts a declaration, its **branch root**, and its descendants, its **branch members**, into that named outlet of its parent's level. The name is a letter followed by letters, digits, `-` or `_`, and not `primary` (Angular's own name); it's emitted raw into URLs, so other characters are rejected (§3). A branch root's **anchor** is its parent's effective primary segments (empty at the root; a pathless or empty-path parent adds none); descendants inherit it unchanged. A branch member has one outlet: a declaration below a branch member can't name another (`Named outlets don't nest: the parent is in outlet <name>`); nested outlets are native routes inside a branch page. A branch root needs a nonempty path (`A named-outlet route needs a path: an empty one activates with its anchor and can't be closed`). Branch members declare no `search` and no `fragments` (`Routes in a named outlet can't declare search or fragments: the query and fragment belong to the primary route`): one query string and fragment serve the whole URL, and they belong to the primary route; members still read the search they inherit from primary ancestors. Each rule is a type error at the offending fact, a TypeError at declaration and a generation diagnostic (§10).

A branch root can't hang at a sibling pathless group's own path (§10 "Matching shapes and diagnostics"), directly or through empty-path declarations below the group: Angular reaches such a branch only by piercing that group for the outlet, and from a page of the group's sibling it would commit the primary route under one group and the branch under the other, which it rejects. Generation fails with `A named-outlet route can't hang at a pathless group's own path while the group has pathless siblings: <id>; give it a parent with a path, or declare it beside the groups`. A branch below a group's descendant with a path (`+authenticated/products` → a `detail` branch) is valid, and so is one beside the groups.

The type carries the outlet on a string-keyed optional `__outlet` witness (the outlet name, `undefined` in the primary outlet) beside the others, through every chain stage, route copy and destination. `__outlet` is reserved like the other witness names.

### Declared fragment names

`fragments: ["summary", "reviews"]` declares logical names without a delimiter; a literal list infers its string union without caller generics. Fragment values are optional, but when present in `createUrl`, `link`, or `navigate` they must belong to the selected destination's declared list. Omission of `fragments` and an explicit empty list both allow **no fragment option**. Lists contain strings; malformed lists and unknown explicit fragment values fail at runtime. Caller list edits cannot alter retained membership.

Names belong to that declaration, not implicitly to descendants. Shared anchor names can be explicitly reused in authored lists. Raw incoming hashes remain Angular's concern: unknown incoming names do not cause package input-parse errors or block activation. This feature does not create DOM anchors, infer IDs from templates, add a fragment signal, or enable scrolling. Consumers supply matching DOM anchors and Angular's native scrolling configuration.

### Parent composition

```ts
const team = defineRoute("teams/$teamId", {
  params: { teamId: numberParam },
  search: { query: stringParam },
});

const report = defineRoute("reports/$reportId/detail", {
  parent: team,
  params: { reportId: numberParam },
});

report.path; // "reports/$reportId/detail", not the effective URL
```

Parent links compose transitively. Empty/pathless declarations contribute no segment but retain their declarations and inherited input ownership. Child params cover local placeholders, not ancestor placeholders. Children cannot redeclare an ancestor-owned param or search key, even using the same codec. Param and search namespaces are independent: one name may occur in both. Two keys of one effective search map, a declaration's own and its ancestors', can't be remembered under one id (§4): composing such a declaration or destination throws a TypeError naming the id, both keys and, for an inherited one, its owner's path. A lazily loaded child's destination composes when its children table loads, so that navigation fails before any guard or storage operation.

All URL inputs and resolver/handle types retain effective inherited codec value types, including search fallbacks. Ancestors cannot see descendant inputs.

A parent must be the actual route created by this package instance. Structural fakes, spreads/copies, inherited impostors, foreign-instance routes, destinations (§6), null, and explicit `parent: undefined` fail at runtime; a destination also fails typing. Parent construction must already have completed when a child is declared; arbitrary module initialization cycles are not repaired.

### Immutability and public route type

Route values are frozen and nominal, not structurally constructible. Codec records are copied; later caller map edits cannot replace the retained declarations. Caller-owned codec objects are retained and not frozen: changing their methods can affect later behavior.

The exact local `path` is the value's only enumerable own property. It is always the authored text: with translated segments (§11) a route copy's `path` stays canonical, and only URLs and Angular paths use the build's words. The steps it still offers are non-enumerable own functions. Parent links, effective paths, codec maps and behavior values (resolver maps, policies, guards and the rest) are not public properties. Each step returns a new frozen route and leaves the one it was called on unchanged, so earlier values in a chain stay valid and one value can start several chains; the declaration is the chain's last value, the one the module default-exports. A declaration module exports nothing else (§10).

`Route<Path, Params, Search, Resolvers>` remains an exported nominal type: the first three parameters retain their meaning and are required; the fourth is a local resolver callback map and defaults to an empty map. Additional defaulted type parameters may support new inference, but callers need no generic arguments. `Route` has no step members: a chain value's type is its `Route` plus the steps it still offers, so it stays assignable to `Route`. Generated code reads the step-free `Route` through a private type-only member. The search values URL creation accepts derive from `Search`: every key optional, `undefined` allowed. For a retained key, `link` and `navigate` tell the two apart at runtime: omission keeps the current value, `undefined` drops it (§6 "Retained search keys"). Readonly optional `__params`, `__search`, `__data`, `__title` and `__outlet` type witnesses preserve inferred inputs, unwrapped effective resolver data, whether the declaration or an ancestor declares a title (§8), and the named outlet (above); an optional `__contribution` witness carries a route extension's contribution chain. They do not promise populated runtime fields. `__data` excludes redirect commands. The branding mechanism itself is private.

Resolver maps are copied and shallow-frozen, retain original callback identities, and reject non-functions, non-records and inherited resolver entries.

Native policy values are the Angular names `pathParamsChange`, `pathParamsOrQueryParamsChange`, `paramsChange`, `paramsOrQueryParamsChange`, `always`, or a native snapshot predicate. Omission preserves Angular's default. Explicit undefined, null, invalid names, and other invalid values fail at runtime. Declaration never evaluates the predicate.

### Route extensions

A route extension is a factory with the root `defineRoute`'s first call whose routes offer extra steps before the router's. It is internal coupling for `@loozo/angular-launch` (§1), built from `@loozo/angular-router/_core`:

```ts
import { createRouteFactory } from "@loozo/angular-router/_core";

// LaunchSpec: the ExtensionSpec below, written as a type
export const defineRoute = createRouteFactory<LaunchSpec>({
  steps: [
    { name: "context", serverOnly: true, arity: { min: 1, max: 1 } },
    { name: "use", serverOnly: true, arity: { min: 0, max: null } },
    { name: "remote", serverOnly: true, arity: { min: 1, max: 1 } },
  ],
  input: (chain) => ({ remote: client(chain) }),
  handle: (chain, injector) => {
    let built: Remote | undefined;

    return {
      get remote() {
        built ??= runInInjectionContext(injector, () => client(chain));

        return built;
      },
    };
  },
});
```

- **Spec.** `ExtensionSpec` has `steps`, a fixed-length tuple of manifest entries; `input`, a higher-kinded type that maps the contribution chain to extra callback-input members; and `witness`, the extension's own unique symbol. Each entry has a literal `name`, a literal `serverOnly` flag, an `arity` of literal `{ min, max }` (`max: null` is unbounded; otherwise `max ≥ max(min, 1)`), and `type`, a `StepSignature` higher-kinded type: from `chain` and the inferred argument tuple `args`, it gives the step's `parameters` (callbacks in them are contextually typed) and its `own` record entry. The runtime half, `RuntimeExtension<E>`, repeats the entries without `type`, checked per position against the spec, plus the `input` and `handle` functions.
- **Order.** Contributed steps come first, before any router step. Each is optional and used at most once, in manifest order: using one removes it and every earlier entry. A contributed call outside its arity is TS2554 and, at runtime, throws `Route step <name> takes <min>…<max> arguments` (or `takes at least <min> arguments`).
- **Storage.** A contributed call stores, under its step name in the route's own record, its single argument when `arity.max` is 1 and otherwise a frozen array of its arguments. Values keep their identity and are neither validated nor deep-frozen. The `own` type must describe exactly this; the router can't check that, so it is the extension's responsibility, like the agreement between `input`'s type and its runtime function.
- **Chain.** A route's contribution chain is its same-extension ancestors' own records, then its own, root first; records and the chain are frozen. A route made by the extension that uses no contributed step adds no record and reuses its parent's chain. A route made by the router's own `defineRoute` below an extension route forwards the chain, and its callbacks get no extra members. `routeContributions(factory, route)` returns the chain for that factory's extension, or `undefined`. Types carry the same chain on the router-owned optional `__contribution` witness and on the extension's `witness` key, the opaque type witness the extension reads. Declaration emit must be able to name every type a route's inferred type mentions, so an extension exports the types its spec names (its step signatures, input contribution and witness symbol).
- **Input.** `input(chain)` builds the extra members for authored callbacks only (§7 "Sharing", §8). It must not return `params` or `search`: doing so fails that callback phase with `Route extension input cannot replace params or search`. Declaration never calls it.
- **Handle.** `handle(chain, injector)` builds the members a handle of a route the extension's factory made adds: its `injectRoute()` handle's (§6) and its narrowed active handles' (§6 "Active route"). It runs synchronously when the handle is created, and the handle takes its result's own property descriptors, so a getter runs at its first read, not before; nothing spreads or reads the members. A first read may come later, outside any injection context (an event, a timer, after an `await`), so a member that injects builds inside `runInInjectionContext(injector, …)`. `injector` is the handle creator's: the page component's for `injectRoute()`, whose environment parent is the activated route's, and the `injectActiveRoute()` caller's for an active handle, which sees no route-scoped providers. Members are typed only when generation is told of them (§11). `createRouteFactory` keeps the validated `handle` in the frozen runtime every route's metadata points at, and throws `Route extension handle must be a function` without one.
- **Copies.** A route copy (§11) of an extension route whose contributed steps are all `serverOnly`, at least one used, is typed from its declaration: generation starts it with `authoredRouteOf<typeof Authored>()(factory, destination, parent, own)`, where `Authored` is an erased type import of the declaration (§10), so its kept router callbacks see what the stripped steps added. Its type is the declaration's own record over the parent copy's chain (`OwnOf`, `AuthoredCopy`); at runtime, `own`, when the extension's generation supplies data for the route, is a frozen plain record that becomes the copy's own contribution record and closes its contributed steps. The two differ by design: the type holds the authored arguments, the runtime record the extension's data, and only the extension reads either. `authoredRouteOf` rejects the router's own `defineRoute` and a non-record `own` (`Route copy own record must be a plain record`).
- **Record stamp.** The native record of every non-redirect route an extension's factory made spreads `extension(route)` from `@loozo/angular-router/_generated`: a private own symbol property holding the copy's runtime and contribution chain, which Angular's record copies keep. It's how an active handle finds the extension's members without loading a route copy itself. A copy no extension's factory made throws `Route extension stamp needs an extension route copy` when the record module evaluates.
- **Names.** Manifest names are unique and can't be a router step name, `path`, `then`, `__params`, `__search`, `__data`, `__title`, `__outlet`, `__contribution` or any `Object.prototype` member (`__proto__`, `constructor`, `toString`, `valueOf`, `hasOwnProperty` and the rest): a route inherits those, so they would stay reachable after their step is used. Generation rejects the same names. `createRouteFactory` validates the manifest and throws a TypeError for a reserved or duplicate name, a non-boolean `serverOnly` or an invalid arity.
- **Server-only steps.** Generation removes every step whose manifest entry is `serverOnly: true` from the route's browser copy, with the imports and helpers only it uses (§11); the destination copy holds no steps at all. Every other step is copied as written. A route that keeps a contributed step isn't typed from its declaration (the authored record would hold that step twice), so its kept steps can't read what a stripped one added.
- **One extension per ancestry.** A route made by one extension's factory under an ancestor made by another fails at declaration (`Route ancestry mixes route extensions`) and in generation (§10).
- **Limits.** A contributed step can't declare type parameters of its own, overloads, or types that relate one argument to another; its parameters come from the chain alone, not from URL facts.

## 3. Authored path grammar [A]

Paths contain **decoded segment text**, not URLs. They are never normalized or pre-decoded.

| Accepted                                                                              | Rejected                                                          |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `""` for root/pathless                                                                | `"/"`, leading/trailing/repeated slashes                          |
| Nonempty slash-separated segments                                                     | Empty interior segments                                           |
| A whole segment beginning `$` declares a param                                        | Empty param name; names containing `?` or `*`, or beginning `...` |
| Broad names such as `a-b`, `α`, `constructor`, `toString`, `id#`, `id;`, `$name`, `.` | Param name `__proto__`                                            |
| Repeated local `$id/$id`                                                              | Redeclaration of an ancestor-owned name                           |
| Static punctuation, spaces, Unicode, backslashes, embedded colons                     | Static segments beginning `:`                                     |
| Static `a?b`, `a#b`, `a;b`, `a%b`, `a(b)`                                             | Exact static `.`, `..`, `*`, `**`                                 |
| `.well-known`, `a.b`, `...`, `a*b`, `a$b`                                             | Optional scalar params and unnamed wildcard forms                 |
| Literal `%2e` and `%2F`                                                               | Ill-formed static Unicode at declaration/generation boundaries    |

Only whole `$`-prefixed segments are parameters. Static text may spell outlet syntax, such as `products/(detail:item)`: it's one primary segment, encoded `%28detail%3Aitem%29`, never a branch. An outlet name (§2) matches `^[A-Za-z][A-Za-z0-9_-]*$` and isn't `primary`. Literal `%2e` is three authored characters, not a dot. Static slashes are segment separators; a dynamic value may contain a slash and will be encoded.

### Named terminal catchalls

```ts
const docs = defineRoute("docs/$segments[]", {
  params: { segments: stringParam },
});

createUrl(docs, { params: { segments: ["guides", "setup"] } });
// /docs/guides/setup
```

A whole `$name[]` segment captures zero-or-more remaining URL segments. Its codec applies **per segment**; an element codec `ParamCodec<Value>` produces `readonly Value[]`. The bare name is the params key. `[]` is reserved as the terminal capture marker, not part of a scalar parameter name. Empty names, repeated array markers, mixing scalar/catchall occurrences of one name, multiple catchalls, or a nonterminal catchall fail typing/runtime/generation. The ordinary name restrictions still apply. A catchall declaration is a leaf: it cannot have authored children. Ordinary repeated scalar placeholders remain supported.

Serialize each supplied element separately, preserving a slash inside an element as `%2F`; never join decoded elements and then encode. `[]` emits no suffix segments, so the example also addresses `/docs`. Parse each consumed remainder segment once per parse operation, preserving `/docs/a%2Fb/c` as `["a/b", "c"]`. Custom codecs retain their scalar contracts; outer list types are readonly, with no recursive freezing of codec values.

Generation emits native Angular terminal `**` matching (`docs/**` is supported by the pinned Angular version), not a custom matcher or runtime routing engine. Ordinary siblings precede fallback catchalls. A sibling pathless group (§10) holding a catchall is a fallback too: its record is tried after its table's other records, so every sibling's ordinary routes, the other group's included, are tried first, and a URL a sibling's guard refuses falls back to it. A catchall in a group may not shadow a route outside that group where their chains part at the group (§10). Reject overlapping competing catchalls in the same generated sibling set; disjoint catchalls and nested fallback scopes are permitted. Intentional ordinary-route/catchall fallback overlap is not an ordinary collision error. A translation that makes a catchall shadow a route it doesn't shadow in the source words fails generation in that locale (§10). A root `$segments[]` can provide a not-found fallback. The notation is legal in Linux/Windows directory names. Explicit mode does not infer routing from directories; filesystem mode (§12) derives paths from them.

Runtime definitions, literal-path types, and generator validation share the structural grammar. Literal types are not required to validate Unicode well-formedness; runtime and generator validation must do so.

A path codec's **stringified output** must be nonempty and neither `.` nor `..`. These restrictions apply only to path serialization, at every segment position. Search and fragment may contain those strings. Native URL normalization makes dot values unrepresentable even when percent-encoded.

### Translated static segments

With `translateSegments` (§12), each static segment's text is a message (§11), and a build's translation of it must itself be one static segment: nonempty, not exactly `.`, `..`, `*` or `**`, not beginning `:` or `$`, without `/`, with well-formed Unicode, and without placeholders. Translation therefore keeps every declaration's segment count, parameter names and positions, and catchall. Generation rejects any other translation (§10). A destination that receives one anyway, in a build run without generation after a catalog edit, throws a TypeError naming the declaration and the segment when it evaluates.

## 4. Codecs [C]

```ts
export interface ParamCodec<Value> {
  parse(raw: string): Value;
  stringify(value: Value): string;
}
```

Parsing receives one logical, already percent-decoded value. Stringification returns one logical, unencoded value. Both are synchronous. Custom object-valued codecs work; built-in rich-object/schema adapters are excluded, not custom object values.

Parsing must be synchronous, pure and deterministic, like Angular's own planning callbacks: path and search codecs run during matching and again for activation (§7), so a codec that disagrees with itself is a programming error. A codec whose value type is a Promise/PromiseLike is a type error where it is declared (§2). At runtime, a `parse` that returns a thenable is a programming error, not invalid input: generated parsing throws a TypeError and observes the stray thenable's rejection so it cannot become an unhandled rejection. Because the generated matching guard parses every record's path and effective search on every navigation, query-only ones included (§8), the TypeError fails the navigation; it never makes a route fall through, reaches `onInvalidParams`, or leaves a search key absent. Codecs get no Angular injection context and need none.

| Codec                        | Required behavior                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `stringParam`                | Preserve strings, including empty strings and literal percent sequences                                                                     |
| `numberParam`                | For nonblank input, JavaScript `Number` coercion followed by finite-result validation; stringify finite numbers as JavaScript string values |
| `booleanParam`               | Accept/emit only lowercase `true` and `false` representations                                                                               |
| `enumParam(values)`          | Exact case-sensitive membership for parsing/stringification; infer the literal union; empty string is valid only when listed                |
| `withFallback(codec, value)` | Search only: read `value` in place of a missing, repeated or invalid value; delegate present values to the original codec                   |
| `arrayParam(codec)`          | Search only: read every repeated value as a readonly array, each value delegated to the original codec                                      |
| `retained(codec)`            | Search only: reads and writes as `codec`; `link` and `navigate` keep the key's current value when the caller omits it (§6 "Retained search keys") |
| `remembered(codec, id)`      | Search only: reads and writes as `codec`; its last committed value is stored under `id` and restored when a navigation enters its owner without it (§7 "Remembered search keys") |

Number examples: `" 42 " → 42`, `"1e3" → 1000`, `"0x10" → 16`. Blank/whitespace-only, NaN, Infinity, and nonnumeric inputs fail. Nonfinite stringify values fail. Invalid boolean/enum raw representations fail with an Error.

### Search params

Search never takes part in matching (§8), and every search key is optional: a search value never fails input parsing.

```ts
search: {
  page: withFallback(numberParam, 1), // reads number; URLs may omit it
  sort: enumParam(["asc", "desc"]), // reads "asc" | "desc" | undefined
  tag: arrayParam(enumParam(["news", "guides"])), // reads readonly ("news" | "guides")[]
}
```

| Search key     | Missing  | One value | Repeated              | Invalid (parser throw, non-string raw) |
| -------------- | -------- | --------- | --------------------- | -------------------------------------- |
| Plain codec    | Absent   | The value | Absent                | Absent                                 |
| `withFallback` | Fallback | The value | Fallback              | Fallback                               |
| `arrayParam`   | `[]`     | `[value]` | Every value, in order | `[]` when any value is invalid         |

A plain key reads as `Value | undefined` (an optional property). A fallback key reads as the codec's value type, never `undefined`. An array key reads as `readonly Value[]`, never `undefined`: each raw value parses with the wrapped codec in URL order, duplicates kept, and one invalid value makes the whole key read `[]`, as an invalid scalar reads as absent. The array is shallow-frozen. URL creation, links, navigation and redirect replacements may omit any search key or pass `undefined`, and redirects never treat a search key as required. Omission and `undefined` write nothing, except that `link` and `navigate` copy an omitted retained key's current value (§6 "Retained search keys"); `createUrl`, `localeUrls` and redirects never do. An array key is written as `readonly Value[]`; `[]` writes nothing (Angular has no spelling for an empty list), so an empty list and a missing key share one URL. The fallback is returned as is, neither parsed nor copied. `withFallback` validates its codec like a declaration does and rejects a codec that already has a fallback, or an `arrayParam` codec, with a TypeError; a fallback may itself be `undefined` or `null`. `arrayParam` validates its codec the same way and rejects a fallback codec or another array codec with a TypeError: a list takes no fallback, because writing `[]` omits the key and would read the fallback back. Both rejections are type errors too. `retained(codec)` validates its codec the same way and wraps it outermost: it rejects an already retained codec, and `withFallback`, `arrayParam` and path params reject a retained one, each with a TypeError and a type error. So `retained(withFallback(numberParam, 1))` and `retained(arrayParam(stringParam))` are the retained forms, and the wrapper keeps the wrapped codec's fallback and array reads. `remembered(codec, id)` validates and wraps the same way, outermost, in either order with `retained` (`retained(remembered(c, id))` and `remembered(retained(c), id)` are both retained and remembered): it rejects an already remembered codec, and `withFallback`, `arrayParam` and path params reject a remembered one, each with a TypeError and a type error. Its id is a nonempty string of letters, digits, `.`, `_` and `-`, else a TypeError at the call, so it's a cookie name and storage key without encoding.

Delegation preserves wrapped codec throws and returned value identity. The package does not freeze custom codec-produced values.

## 5. URL creation [U]

```ts
import { destination as product } from "./routes/products/$productId/destination.generated.js";

createUrl(product, {
  params: { productId: 42 },
  search: { tab: "reviews" },
  fragment: "summary",
});
// /products/42?tab=reviews#summary
```

`createUrl(target, values)` synchronously returns a root-relative string, typed `` `/${string}` ``, and never calls parsers. `target` is a genuine destination (§6) or a genuine route of this package instance: an inline or authored declaration, or a route copy. A declaration, its route copy and its destination give the same bytes, except with translated segments (§11): a destination and its route copy then serialize the running build's words, while a declaration evaluated directly serializes its canonical ones. Generated and application code never evaluate a declaration (§10). The values are typed from the destination's referenced schema, as from the route's.

The string is relative to the router root. In an Angular localize build, the locale's `subPath` or base href is outside it: the German build's `createUrl(product, …)` is `/produkte/42`, which `RouterLink` and router navigation prefix with `/de/`, and a raw `href` doesn't. For a document URL in this or another locale, use `localeUrls` ("URLs in every locale" below).

### Input typing and runtime boundary

- All effective inherited/local path values are required and codec-typed.
- Every search key is optional: the search record may be omitted, `{ search: {} }`, or any subset of declared keys, each codec-typed or `undefined`. Keys with a fallback are optional here too. An `arrayParam` key takes a readonly array of element-codec values, including `[]`; a single value fails typing, and a non-array value is a TypeError before any stringifier runs.
- Searchless routes forbid the search option.
- Routes with no effective path params forbid a params map.
- Fragment is optional and restricted to the selected declaration's own declared names; without a list, the fragment option is forbidden.
- Catchall values are required readonly arrays of element-codec values, including a valid empty array, except for a branch root whose whole path is one catchall (below). Scalar and catchall cardinalities are distinct.
- A destination in a named outlet takes params only: a `search` or `fragment` key fails typing and throws `TypeError("A destination in outlet <name> takes params only")`, inherited primary search included.
- Literal unknown value/option keys and wrong values fail typing; exact local codec-key typing also covers variables as described in §2.
- The values are one record: a string, array, function or other value sharing no values key fails typing, here and for a handle's link/navigate record (§6), including a string on a route with search whose `search` method would otherwise match.
- Runtime rejects a target that is neither a genuine route nor a genuine destination of this package instance with `TypeError("Expected a genuine route or destination from this package instance")`, and malformed records, unknown options, missing path/extra input keys, wrong fragment types, non-array catchall and `arrayParam` values, and non-string codec outputs with TypeError.

Do not promise universally exact TypeScript object types: normal structural assignability may admit extra properties through variables where no exactness requirement above exists. Runtime input validation still rejects unknown keys.

### Serialization

1. Concatenate authored ancestry without normalization. Empty effective path is `/`.
2. Component-encode every static segment and stringified dynamic value, additionally escaping parentheses. A dynamic slash becomes `%2F`.
3. Repeat a repeated scalar placeholder's supplied value at each occurrence; expand a catchall array element-by-element with the same segment encoding and output restrictions.
4. Emit present search keys in globally lexical key order across ancestry. Encode keys and values at the URL boundary. An `arrayParam` key emits one `key=value` pair per element, contiguously and in array order, duplicates kept.
5. Omit search keys that are absent or equal to undefined, and `arrayParam` keys equal to `[]`. Present empty strings produce `key=`, including an empty-string array element.
6. Component-encode an optional fragment after the query string.

```ts
const literal = defineRoute("a(b)/%2e/$id", { params: { id: stringParam } });
createUrl(literal, { params: { id: "c(d)" } });
// /a%28b%29/%252e/c%28d%29
```

A destination in a named outlet creates its branch below its anchor's primary path, with no other branch: `/products/(detail:item/3)`, or `/(chat:chat/7)` at the root. Anchor and group segments are serialized by the steps above. The group needs at least one segment: an empty array for a branch root whose path is one catchall throws `TypeError("A destination in outlet <name> needs at least one path segment: <id>")` when the URL is built, on every surface that builds one (`createUrl`, `link`, `navigate`, redirects); the types admit it. A catchall below a nonempty branch path (`/products/(detail:panel)`) or after a static prefix (`/(chat:files)`) takes `[]`. The URL is the exact one, not a composition with the current URL (§6).

Existing codec exceptions remain observable. Malformed dynamic/search/fragment Unicode produces URIError at encoding. Authored invalid static Unicode is rejected at declaration. Supported URLs must preserve decoded segment meaning through native URL handling and Angular serializer/matcher APIs; byte-identical Angular href/URL spelling is not required.

### URLs in every locale

```ts
import { localeUrls } from "@loozo/angular-router";
import { destination as product } from "./routes/products/$productId/destination.generated.js";

localeUrls(product, { params: { productId: 42 }, fragment: "reviews" });
// [{ locale: "en", url: "/en/products/42#reviews" }, { locale: "de", url: "/de/produkte/42#reviews" }]
```

`localeUrls(destination, values)` synchronously returns a frozen `readonly LocaleUrl[]`, `{ locale, url }` each, frozen: the destination's document URL in every locale of the build's locale table (§12), in the table's order (the source locale first, then `angular.json` `i18n.locales` in order). `url` is that locale's base href joined with the destination's path, so it's absolute when the base is; a base without a trailing slash gets one, and the root destination gives the base itself. It takes a genuine destination only; anything else, a route included, throws `TypeError("Expected a genuine destination")`, and the values are typed as `createUrl`'s.

Each locale's URL is `createUrl`'s serialization of the destination's URL facts with every static segment's text replaced by that locale's text for its authored word: the table's translation, else the authored word. In a translated build (§11) each translated static segment keeps its authored word beside its build text, inherited and anchor segments included, so the mapping doesn't depend on which build runs. Param, catchall, search and fragment values are kept as given; validation, encoding, errors and application stringifier failures are `createUrl`'s, and a stringifier runs once per locale. A named-outlet destination gives its exact branch URL under each base, anchor and group words mapped, outlet name unchanged (`/de/produkte/(detail:artikel/3)`).

Without a table it returns an empty list after checking the values as `createUrl` would: an unlocalized build, a multi-locale `ng serve` (§13), `ng test`, a build that doesn't run the router's or Launch's builders, and plain Node. Its URLs are document URLs for a plain `href` or `<link>`, not for `RouterLink`, `navigateByUrl` or a redirect, which compose a URL under this build's base; `createUrl` stays this build's router-root-relative URL.

## 6. Generated route-local handle and navigation [H, N]

```ts
import { injectRoute } from "./route.generated.js";

const route = injectRoute();
```

`injectRoute()` takes no arguments or caller generics and binds its route copy to its **own exact activated Angular route record**. It requires an Angular injection context. Its identity is the destination the generated record carries as its own property (§11): a missing or different own destination on `ActivatedRoute.snapshot.routeConfig` is a synchronous wiring error. Inherited properties and snapshot data are not identity evidence.

The returned handle is not callable. Its readonly properties expose readonly Angular Signals:

```ts
readonly params: Signal<EffectiveParams>;
readonly search: Signal<EffectiveSearch>;
readonly data: Signal<EffectiveResolvedData>;
readonly title: Signal<string> | Signal<undefined>; // string when the route or an ancestor declares a title
```

Values are the committed snapshot's and are available on the first read, including synchronously in the page constructor: there is no loading, reloading or undefined state. There is no writable set API, and callers cannot reassign the signal properties through the typed interface. §7 specifies when the values change.

### Calls

```ts
route.navigate({ params, search, replaceUrl: true }); // Promise<boolean>, exact bound declaration
route.navigate({ to: "..", params: parentParams }); // parent route
route.navigate({ to: otherDestination, params: destinationParams, info });

route.link({ params, search }); // UrlTree, no navigation
route.link({ to: "..", params: parentParams });
route.link({ to: otherDestination, params: destinationParams });

chat.navigate({ close: true }); // inside a named-outlet branch: closes it
route.link({ to: chatDestination, close: true }); // closes chat wherever the handle is
```

Each call takes **exactly one target record**. `to` selects the destination; omitting it selects the exact bound declaration. `params`, `search` and `fragment` use the selected declaration's effective params/search types and URL-creation rules, including optional fragment; a destination in a named outlet takes params only (§5). All target path inputs must be supplied; current inputs are never implicitly reused, except an omitted retained search key's value (below). `close: true`, with no URL values, closes a named-outlet branch instead (below): the bound declaration's own (only offered in a named outlet), or the `to` destination's. `close` with URL values throws `TypeError("close takes no URL values")`, any other `close` value `TypeError("close must be true")`, and a close of a primary destination `TypeError("close needs a destination in a named outlet: <id>")`.

`to` is omitted, `".."` (when admitted), or a genuine destination; never a path or a concrete URL. Any other string (authored paths, `"."`, other relative expressions), widened strings, unions of destinations with different ids, routes (authored, inline or route copies), handles and concrete substitutions fail typing. At runtime, anything but one non-null, non-array object argument throws a TypeError; a string `to` other than an admitted `".."` throws `Unknown generated selector: <to>`, and any other `to` that isn't a genuine destination throws `Expected a genuine destination`. All of these throw synchronously before Angular is called. No arbitrary URL overload, second argument, implicit query merge/preservation, or inferred current-value reuse exists beyond retained search keys. The unions-of-destinations rule covers the close forms too.

For `navigate`, every other key of the record is Angular's `NavigationBehaviorOptions` (`replaceUrl`, `state`, `info`, `skipLocationChange`, `onSameUrlNavigation`, `browserUrl`, `scroll` and any Angular adds), typed by Angular's own interface. They are passed unvalidated, as one object of the record's own remaining keys, to Angular. `navigate` serializes with the selected declaration, composes the result with the current URL (below) and calls `Router.navigateByUrl(composedTree, options)`. It returns Angular's **same Promise object**, not a wrapper or transformed result. Angular owns guards, redirects, same-URL skips, final activation, history and rejection behavior.

`link` takes no behavior options: they fail typing, and any key besides `to`, `params`, `search`, `fragment` and `close` throws a TypeError before Angular is called. It serializes, parses with `Router.parseUrl` and composes with the current URL, returning a UrlTree without navigating. Ordinary Angular RouterLink consumes it. RouterLink owns href/LocationStrategy, native-versus-SPA clicks, target, non-anchor tabindex, and inputs such as replaceUrl/state/info. URL-creation RouterLink inputs must not accompany a supplied UrlTree. Angular may reserialize valid URLs differently from `createUrl`.

### Composition with the current URL

`link` and `navigate` build their tree from the current URL B and the selected destination's own URL T (`parseUrl(createUrl(destination, values))`, where `values` include retained keys, below), or, for a close, from the destination's outlet and anchor pattern. Positions count primary URL segments; comparisons use decoded segment paths and ignore matrix params; kept named groups keep their own subtrees and matrix params.

| Input | Primary path | Named branches | Query, fragment |
| --- | --- | --- | --- |
| Primary destination (own, `..`, `to`) | T's segments (B's matrix params aren't carried) | each of B's branches at position n kept when B's first n primary segments equal T's | T's |
| Branch destination whose concrete anchor equals B's first n primary segments | B's, matrix params included | that outlet at n replaced, the rest kept | B's |
| Branch destination whose anchor isn't on B's path | its anchor | its branch, plus B's branches that survive against the anchor | none |
| Close | B's, matrix params included | the outlet removed at the position its anchor pattern matches (a static entry equals the segment, a scalar takes any one); nothing else changes | B's |

So a primary navigation keeps a root branch (position 0) always, and a nested one while its concrete anchor stays on the path: `teams/4` → `teams/5/list` drops a detail anchored at `teams/4`. A close reads no params and doesn't compare what the outlet shows, so it closes a not-found panel too. With nothing to close (the outlet absent, or the anchor not on B's path), the tree equals B, and Angular's `onSameUrlNavigation` decides the navigation: under its default `"ignore"` it's skipped and the promise resolves `false`; under `"reload"` (router-wide or the call's own option) Angular reprocesses the URL, running matching and `canMatch` again, while activation guards and resolvers follow the route's `runGuardsAndResolvers` (default `paramsChange`, so they don't rerun), and the promise resolves as that navigation does. The package adds no same-URL check. Composition never asks which declaration made a branch, so hand-written native named routes follow the same keep and replace rules. It never mutates B or shares a group, segment or parameter map with it.

B is the router state's URL (`routerState.snapshot.url`), except in the browser before the first successful navigation, when it's the browser URL (`Location.path(true)`), the URL Angular's initial navigation reads: a server render, the first client render of a hydrated page and clicks before the initial navigation commits all compose against the same URL. During a later navigation's activation the snapshot already holds the activating state, as for Angular's relative commands. Each handle factory (`injectRoute()`, `injectActiveRoute()`) captures this base once, in its injection context, so `link` and `navigate` need none, on seeded, live and later active entries alike. Each call reads `lastSuccessfulNavigation()`, so a `link` called in a template or `computed` follows every commit; a link stored once in a field keeps the branches open when it ran. Build links where they render. `createUrl` and `Router.navigateByUrl(createUrl(destination, values))` give the exact URL instead, every branch cleared.

### Retained search keys

A declaration marks a search key it owns as retained by wrapping its codec: `search: { workspace: retained(stringParam) }`. The key's **owner** is the declaration that declares it; its descendants inherit it (§2 "Parent composition"). `link` and `navigate` with a primary destination T that has the key in its effective search copy the key's value from the current URL when:

- the caller's `search` record has no own entry for the key (`Object.hasOwn`): an own entry, `undefined` included, is the caller's choice, so `undefined` drops the key;
- the current URL is inside the key's owner: the owner is in the declaration ancestry of the deepest generated primary record of a router state of that URL (below); and
- the URL holds a present valid value: a scalar key exactly one value that parses to something other than `undefined`, an array key at least one value, each parsing (§4). A missing, repeated or invalid value, `[]` and a fallback copy nothing.

The copy is the parsed value, which `createUrl` stringifies and validates like a caller's, so the URL is canonical. Which handle calls doesn't matter: a page's, an ancestor layout's or the active route's handle, with an own, `..` or `to` target, retains the same keys. A key of the same name owned by an unrelated declaration is a different key: its value is copied only into destinations below that owner, and only while the URL is inside it. A branch destination takes params only (§5) and retains nothing. Types are unchanged: every search key may still be omitted or `undefined`; the difference is runtime presence, so `{ ...defaults, workspace: undefined }` drops the key.

Each call reads the URL and its owners once, from one state of that URL, so values and owners never come from different URLs:

1. After the first successful navigation, and on the server: B and the owners of the router state.
2. In the browser before the first success, B is the browser URL (above), and the owners come from, in order: the router state, when its URL without the fragment equals B (Angular installed it during this navigation's activation; its initial empty state never matches); the published hydration seed, when the browser URL it was published for equals B (§7 "Hydrated pages"); otherwise there are none and nothing is retained.

So with `urlUpdateStrategy: "eager"`, while the first client navigation is pending after the browser URL changed, links read in that window omit retained keys; they are read again at the commit. Under the default deferred updates the browser URL and the router state change together, and the window doesn't occur. A link value stored outside a template or `computed` keeps its earlier href until it's read again. Without `provideActiveRouteHydration()`, or when the server sent no seed (an authored symbol resolver key in the chain, §7), shell links retain nothing until the first navigation installs its state.

`createUrl`, `localeUrls` and typed redirects (§9) never retain: they are pure functions of their arguments. Retention needs no provider; remembering is separate (§7 "Remembered search keys"), and a key may be both.

### Shared paths

A path's identity is its matching position (§10 "Matching shapes and diagnostics"): its outlet, its anchor and its **effective authored path** in the group, `/` for an empty one. So the primary literal `products/(detail:item)` and a `detail` branch `item` under `products` are different paths with independent winners. Codec/search differences do not disambiguate matching shape.

A path's **winner** is the declaration that ends there. When one declaration has that path, it's the winner, whether or not it has children (`teams` with `teams/$id`). When several share it (an ancestor and its pathless descendants, in one chain or across sibling pathless groups, §10), the winner is the one among them without retained children, which is always an empty-path record such as an index. Sibling pathless groups never end a path themselves. So a path they share is won by the one childless declaration below them, in whichever group it sits, and has no winner when there is none. That leaf alone receives `pathMatch: "full"`, unless it is an empty leaf at a named branch's anchor, which matches by prefix with gated callbacks so it renders beside the branch (§11); ancestors remain prefix matching. If no winner exists, the shared path is no `..` target and no redirect target (§9). Every retained record still has its own destination and its exact-current call without `to`.

Selection controls typing and serialization, not exclusive activation: parent and pathless child may activate together. Query values do not choose a winner. Nonleaf pathless records must not receive full matching that blocks longer descendants. A group's own destination and its exact-current call serialize its parent's URL. That URL renders its winner, possibly in another group. When it has none, it renders the parent's page alone, or only the app shell at the root. A URL carries no group identity.

### Exact-current and parent selectors

- Omitting `to` selects the exact bound declaration, not a canonical pathless descendant. No `"."` selector exists.
- `".."` selects the parent route: the nearest ancestor declaration whose effective path is shorter than the bound declaration's, or the root path `/` for a declaration without one. Inside a named outlet the walk stays in the branch, comparing in-branch paths, and ends at the branch root: a branch root has no `..` (close it instead). Pathless ancestors share their child's path, so they are skipped. The target is that path's winner (above), which can be a redirect source; when the path has no winner, or the bound declaration has the root path itself, `".."` is not admitted. From inside a sibling pathless group, `..` targets the shared parent path's winner, which may sit in another group; with no winner there, `..` isn't admitted. Catchall-bound handles have a parent like any other.
- Generation resolves the winner and imports its destination into the bound declaration's route copy and into the table that holds the declaration's record (`routes.generated.ts` or a children table, §11), which carries it on that record; `RouteTypes` in `routes.generated.ts` types it. The handle's `..` overload is typed from that destination, and absent without one.
- No other relative expression exists. `../`, `./`, `./suffix`, `../..` and `../suffix` fail typing and throw synchronously like other unknown selectors. Each handle admits at most one relative selector, so each route copy imports at most one destination for it.
- Destination values remain explicit and use the selected target's effective params/search and declared fragment names; `..` never implicitly reuses current values beyond retained search keys, which it retains like any target.

For `/teams/$teamId/members/$memberId` declared under `teams/$teamId`, `..` addresses `/teams/$teamId`, however many segments the child adds. A top-level `/projects` addresses `/` when a root route exists. Serialize resolved targets as root-relative URLs; no Angular `relativeTo` command surface is added.

### Destinations

```ts
import { destination as product } from "../products/$productId/destination.generated.js";

route.link({
  to: product,
  params: { productId: 42 },
  fragment: "reviews", // when declared by that target
});
```

Every admitted declaration's `destination.generated.ts` exports an inert `destination`, usable without an injection context or target activation and without loading the declaration's route copy. Its type, `Destination<Target, Id>`, carries the referenced declaration's URL schema (effective params and search, own fragment names, catchall shape) and its generated id in a type-only brand. `navigate({ to: destination, ... })` and `link({ to: destination, ... })` use the same serialization/native behavior as their other forms, as do `createUrl` (§5), `.redirect` (§9) and the active route's `is`/`contains` (below). A destination is genuine when this physical package instance's generated code defined it; any genuine destination is a target, whatever generated tree it came from. Structural copies, spreads and fakes, destinations of another package instance, routes (authored, inline or route copies) and handles are not destinations. Registration/branding representation is private.

With translated segments (§11), a destination serializes, links, navigates and redirects with the words of the build that evaluated it; its type, id and canonical path don't change. A destination selects its own declaration, like that declaration's own call without `to`; it does not silently substitute a canonical pathless winner. A redirect source's destination addresses the source URL with source inputs. Destinations are not a public graph/model API.

A destination is not a route: it offers no steps, can't be a `parent`, and the route type extractors don't read it, so `ParamsOf<typeof destination>` is `{}`. `TargetOf<D>` is the URL schema a destination references (`undefined` for anything else), so `ParamsOf<TargetOf<typeof destination>>` and `SearchOf<TargetOf<typeof destination>>` name its values.

### Active route

```ts
import { injectActiveRoute } from "../generated/routes.generated.js";
import { destination as team } from "./routes/teams/$teamId/destination.generated.js";
import { destination as item } from "./routes/teams/$teamId/items/$id/destination.generated.js";

const active = injectActiveRoute(); // Signal<ActiveRoute | undefined>
const teamId = active()?.chain.find((route) => route.is(team))?.params().teamId; // number | undefined
const route = active();

if (route?.is(item)) {
  void route.navigate({ params: { teamId: 7, id: 10 }, replaceUrl: true });
}
```

`routes.generated.ts` exports parameterless `injectActiveRoute()`. It requires an Angular injection context and returns a readonly Signal of the **deepest active generated record** in the primary outlet. Its value is `undefined` before the first navigation commits, unless the page was server-rendered with `provideActiveRouteHydration()` (§7 "Hydrated pages"), and when no generated record is active. Walk the committed chain from the root through each route's primary child, never a named outlet's, so a branch member is never the active route; records that carry no generated destination of their own (native routes) are skipped, so the deepest record can be any retained declaration: a parent with children at its own URL, a componentless parent, or an authored pathless child. Each entry's values come from the generated records of the committed snapshot alone, its destination and `..` target from its own record (§11), and, for an extension route, its members from the record's extension stamp (§2), built with the reader's injector, once per entry; there is no route table, and the reader loads no route copy. Route-scoped providers (an `HttpClient` interceptor or a `QueryClient` in `.providers()`) reach `injectRoute()`'s members, not an active handle's. Nothing filters records by tree: every generated record installed in the router takes part, typed as this tree's `RouteTypes`, so install one generated tree per router.

`RouteTypes` is a type-only map from each retained primary-outlet declaration's id (branch members are never active, so `is` and `contains` reject their destinations at compile time) to its schema, its `..` destination when it has one, and, for an extension route whose generation named handle members (§11), those `members`. `injectActiveRoute()` passes it to the package's internal reader, so callers write no type argument.

```ts
// routes.generated.ts (excerpt). A route copy is a value import where its record reads it at
// runtime (native options, callbacks, redirects) and an `import type` otherwise.
import { route as route_teams_$teamId_items_$id_route } from "../src/routes/teams/$teamId/items/$id/route.generated.js";
import { route as route_teams_$teamId_route } from "../src/routes/teams/$teamId/route.generated.js";
import { destination as destination_teams_$teamId_route } from "../src/routes/teams/$teamId/destination.generated.js";

export type RouteTypes = {
  "src/routes/teams/$teamId/items/$id/route.ts": { schema: RouteSchema<typeof route_teams_$teamId_items_$id_route>; up: typeof destination_teams_$teamId_route };
  "src/routes/teams/$teamId/route.ts": { schema: RouteSchema<typeof route_teams_$teamId_route> }; // no `..` target: no `up`
};
export type ActiveHandle<Id extends keyof RouteTypes> = GeneratedActiveHandle<RouteTypes, Id>;
export type ActiveRoute = GeneratedActiveRoute<RouteTypes>;

// The package's internal generic types they alias:
type UpOf<Entry> = Entry extends { readonly up: infer Up extends Destination<AnyRoute> } ? Up : never;
type MembersOf<Entry> = Entry extends { readonly members: infer Members } ? Members : {};
interface ActiveBase<Types extends RouteTypeMap> {
  is<Id extends keyof Types & string>(destination: Destination<any, Id>): this is GeneratedActiveHandle<Types, Id>;
  contains(destination: Destination<any, keyof Types & string>): boolean;
  readonly chain: readonly GeneratedActiveRoute<Types>[];
  readonly localeUrls: Signal<readonly LocaleUrl[]>;
}
type GeneratedActiveHandle<Types extends RouteTypeMap, Id extends keyof Types> =
  Handle<Types[Id]["schema"], UpOf<Types[Id]>> & MembersOf<Types[Id]> & ActiveBase<Types>;
type GeneratedActiveRoute<Types extends RouteTypeMap> =
  Pick<Handle<Types[keyof Types]["schema"]>, "params" | "search" | "data" | "title"> &
  ActiveBase<Types> &
  DestinationNavigation; // link/navigate with `to`: a destination, or a destination and close
```

Active handles, seeded ones included, retain search keys like page handles ("Retained search keys" above). `ActiveRoute` is a common read interface, not a union of handles: `params`, `search`, `data` and `title` read the union of the tree's values (`title` is `Signal<string | undefined>` unless every retained declaration's chain declares a title), and `link`/`navigate` take a destination (`to`, its close form included) before narrowing, so a shell opens and closes branches through it; the own and `..` forms exist only after `is()` narrows. Data holds the same effective resolver keys as the page handle's (§8). `is(destination)` holds for exactly that declaration, not an ancestor, and narrows to its full handle, with the §6 calls. `contains(destination)` is a plain boolean: that declaration is this route or one of its active ancestors; it does not narrow. `chain` lists the active generated records, top-level first, ending with this one; it is frozen, and each entry's own `chain` is the prefix ending at that entry. `localeUrls` is a computed signal, on every entry, narrowed or not and in `chain`, of `localeUrls(destination, values)` (§5) for the entry's own destination and its current values: its params when it has any, its declared search keys present in its search, without each value that is `Object.is` its codec's `withFallback` value, and no fragment. Undeclared query keys aren't route state and are left out. So are open named-outlet branches: the entry's destination is primary-outlet, so its URLs carry the primary page alone, and following one closes an open branch (§1 "Stability", kept behaviors). It reads the entry's own params and search signals, and a seeded entry's are the seed's (§7). Generated ids stay private; callers pass `destination`s, typed to the tree's retained declarations. `is` and `contains` compare destination identity: `is` holds for the record's own destination, `contains` for it and the destinations of its declaration ancestors. A genuine destination of a tree not installed in this router is never active, so both return false for it; anything that isn't a genuine destination throws `TypeError("Expected a genuine destination")`, like `link`.

Each call is its own reader with its own handles: within a reader, an active record keeps one handle object while its ActivatedRoute stays active, so a reused route with new values keeps its handle and only its signals change; leaving and re-entering gives a new handle. Two readers' handles for the same route are different objects with equal values, and neither is that page's `injectRoute()` handle. A handle that has left the chain keeps its last values and its `link`/`navigate`; it is never re-attached. So is a seeded handle (§7 "Hydrated pages") that the handover doesn't adopt. §7 specifies when the value changes.

## 7. Parsed values and navigation lifecycle [L]

### Input ownership and errors

Angular owns matching and decoding. Obtain declared path values from each authored record's positional consumed URL segments through its ancestry, not inherited/matrix-merged param maps. Descendant or same-segment matrix entries cannot override positional values:

```text
/teams/7/items/9;teamId=999;id=888
→ effective params { teamId: 7, id: 9 }
```

This holds under Angular's `always` and `emptyOnly` parameter-inheritance strategies. Repeated local placeholders use the last positional occurrence for parsing, matching Angular. Pathless records contribute no positions. Decoded values are not decoded again. Search uses Angular's shared decoded query map.

A route's owners are its route copy and the copy's parent copies, by parent links. The copy's own record must carry its own declaration id, else `Error("Generated route wiring identity mismatch: <id>")`. Each parent copy is paired with the nearest proper ancestor record carrying any generated declaration id, without comparing that id; when none is left, reading fails with `Error("Generated route ancestor missing: <id>")`. Records without a generated id (hand-written native routes between generated ones) are skipped. Positional values, resolver data and titles are read from each owner's paired record.

Each declared path scalar requires exactly one raw value. A catchall instead has zero-or-more positional raw values and invokes its element codec independently for each; it is not a repeated-scalar error. Search keys never fail: a missing, repeated or invalid value is absent, or reads as the key's fallback, and an `arrayParam` key reads every repeated value, or `[]` (§4). Ignore undeclared query keys. Within one parse operation, validate every relevant path raw cardinality before starting any parser; missing/repeated values cannot trigger partial codec side effects first. Parsing is synchronous and stops at the first failing path codec, in declaration order; search is parsed only after the path values succeed.

Observable input errors are path-only: Errors with `source: "path"`, `key`, `reason: "missing" | "repeated" | "invalid"`, and retained cause for invalid inputs/codec throws. Malformed raw input and codec throws classify as invalid. The error class is not a new root export. A thenable parse result is not an input error but the TypeError of §4.

Because invalid local path params make a route not match (§8), activation reparses only path values that already parsed once: a path error after matching needs a codec that disagrees with itself (nondeterministic or stateful), a programming error. Path and search codecs therefore run during matching and again on activation; no cross-phase cache exists.

### Sharing

One route and exact complete Angular snapshot share one full effective parse result/failure across typed activation guards, local resolvers, title callbacks, and handles. A route is identified by its destination: its route copy and every stage of that copy share it. A canActivateChild adapter uses the declaring parent's snapshot for that input operation while preserving Angular's native child snapshot argument. Matching-phase local input parsing is separate: its partial snapshot does not supply ancestry, and no cross-phase parse reuse exists. New snapshots create new parse results, even when URLs/values are equal. Different declarations never share merely because paths/codecs match. This is not a URL or resolved-data cache.

A route made by an extension factory (§2 "Route extensions") changes only what its authored callbacks receive. Its authored activation guards, resolvers and title callbacks for one snapshot share one container that adds the extension's members to the shared parse result, whose `params` and `search` maps it reuses; its authored `canMatch` callbacks share another per matching candidate. Handles, the generated matching guard, `onInvalidParams` and native `canDeactivate` keep the plain container, so a handle's container is not the callbacks' container, though their `params` and `search` maps are identical. The extension's `input` runs at most once per declaration, snapshot and phase, at the first authored callback of that phase, in the injection context Angular gives that callback (the declaring route's); a throw is kept and fails every callback of that phase for that snapshot. Router-only routes keep the single container above.

Successful top-level params/search maps are shallow-frozen and reference-shared for that snapshot, as are catchall and `arrayParam` arrays. Plain search keys without a valid value are absent; fallback and array keys are always present. Arbitrary nested codec values are opaque, not recursively frozen.

### Handle values

Handle signals read the route's committed snapshot. Angular replaces an ActivatedRoute's snapshot only when a navigation activates, so while a navigation is pending the signals keep the current values, and a navigation that is cancelled, skipped as same-URL, or fails before activation (matching, guards, resolvers) leaves them unchanged. When a navigation fails during activation, such as a routed component's constructor throwing, Angular has already advanced the reused routes above it and does not roll them back: their handles, page and active alike, read those values until the next commit. A page whose outlet the same navigation creates (the page holding that outlet is new too) is created later, while that view renders: without `withErrorBoundaries`, or with it but no `errorComponent` on the failing route and no `defaultErrorComponent`, its constructor error leaves that render instead, and the navigation completes rather than failing. With the feature and a fallback for the failing route, the navigation doesn't fail at all ("Error components" below). When a navigation commits a new snapshot for a reused route record, params, search, data and title change together, from that one snapshot. The handle follows the ActivatedRoute's own observables as well as router events, so a subscriber to either sees the new values, with two exceptions. A subscriber to the same ActivatedRoute observable that subscribed before the handle was created runs first. A router-event listener registered before the handle, reading it during the route's own `ActivationEnd`, sees the previous values when only an ancestor's path params or resolver data changed and none of the route's own observables emit (under `paramsInheritanceStrategy: 'emptyOnly'`, such as an ancestor with `.runGuardsAndResolvers("always")` rerunning its resolvers, or when a matrix param shadows the ancestor's). Create the handle first; once that event has been delivered, the signals are current. Pending-navigation UI uses Angular's `Router.currentNavigation()` signal; the package adds nothing for it. A failed navigation's errors stay Angular's (rejection, event, error handler); do not alter Angular's native promise rejection value.

Handle parsing shares the snapshot's parse result with guards and resolvers. A route with neither typed activation guards, resolvers nor a title callback is parsed when its handle is first read. If that parse fails, which takes a nondeterministic path codec, reading params or search throws that error; data and title are unaffected. Injector destruction releases the handle's subscriptions.

Parsing involves no package-owned pending work: server rendering contains the handle values because they are synchronous, while Angular tracks resolvers and other asynchronous navigation work itself.

### Error components

`.errorComponent(C)` forwards `C` unchanged to the record's Angular `errorComponent`, shown in place of the page when the page throws while it's created or rendered; at declaration it must be a function, else `TypeError("errorComponent must be a component class")`. Generation rejects it on a declaration without a colocated page (`errorComponent requires a colocated page`), page-less named-outlet branch roots included, although Angular's `standardizeConfig` gives those its own outlet component, whose boundary would read the value when a descendant page's error bubbles up to it, and before `.redirect` (`Redirect cannot follow errorComponent`). `C` and the modules it imports load with the table holding the record (§11), eagerly relative to the page. Angular owns everything that happens around it; `errorComponent` is developer preview in Angular 22.3.

Where an error thrown while Angular creates a failing page (its constructor or dependency injection) goes depends on its outlet: the `<router-outlet>` that shows it, in the nearest ancestor page's template or the root component's for a top-level page. If the outlet already existed (the page holding it was on screen), Angular creates the failing page during the navigation's activation. If the page holding the outlet is created in the same navigation, the outlet is new, and Angular creates the failing page later, while rendering that view.

- Without `withErrorBoundaries`, Angular ignores the value and logs a development warning once. When the failing page's outlet already existed, the navigation rejects. When its outlet is new, the error is thrown during that later view render instead: the navigation completes with the pages above on screen, and the error reaches `ErrorHandler`.
- With `withErrorBoundaries`, when the failing route has its own `errorComponent`, that component renders in the page's place with the thrown value as its `error` input, and the navigation completes, whether its outlet already existed or is new. It takes precedence over `defaultErrorComponent`.
- When the failing route has none and a `defaultErrorComponent` is set, the default renders in the page's place instead. The pages above stay, and the navigation completes, whether its outlet already existed or is new.
- When neither exists, Angular rethrows. If the failing page's outlet already existed, the navigation rejects and the pages above stay; no other page's `errorComponent` is consulted. If its outlet is new, the error continues through Angular's view error handling to the pages above it, nearest first, whether they were created in this navigation or already on screen. The first with its own `errorComponent` has its page replaced by it, and the navigation completes. If none has one, the error reaches `ErrorHandler`, and the navigation still completes. That is view bubbling, not configuration inheritance; the failing route's record still has no `errorComponent`. This package's evidence covers one level (a parent's `errorComponent` replacing the parent); deeper combinations, and the path where no page above has one, follow from Angular's source and aren't covered by its proofs.
- `loadComponent`, `loadChildren`, guard and resolver failures happen before activation and reach no boundary; they fail the navigation as before. The outlet rules above are for creation errors. A page's errors while it renders (lifecycle hooks, template expressions, `resource()` loaders its template reads) never reject the navigation, whichever outlet shows it: Angular's view error handling takes them to the page's own `errorComponent` or `defaultErrorComponent`, else the nearest page above with its own, else `ErrorHandler`. This package's proofs cover constructor errors only.
- While the error component is on screen, it is the outlet's component: the route's `canDeactivate` guards receive its instance, not the page's, when navigating away, so a guard that uses page members must check the instance first. Server rendering renders the error component with status 200. Hydration of a server-rendered error component isn't covered by this package's proofs.

### Active route values

The active route's value changes only after a navigation commits, when the router reports it as its last successful navigation; a listener for that navigation's `NavigationEnd` already reads the new route, whenever it subscribed. While a navigation is pending the value is unchanged, and a navigation that is cancelled, skipped as same-URL, or fails before activation (matching, guards, resolvers) leaves it unchanged. The value changes when the deepest record's ActivatedRoute changes; a reused deepest record with new values keeps its handle, and its signals change as §7 "Handle values" specifies.

A reader first read while a guard or resolver is pending reads the committed route at once. A reader first read during Angular's activation phase reads `undefined` until that navigation ends: a routed component's constructor activated into an existing outlet, or a parent page's constructor on a direct load. It then reads what has committed; after a failed activation, that is the route still committed, or `undefined` when the router's live tree no longer matches its state. A reader already read before the navigation, or created before the last commit, keeps the last committed value throughout, whether or not it was read at that commit; one created after the last commit and first read during activation is a reader first read during activation. Page code reads its own `injectRoute()` handle instead. Rarely, a navigation to the already-committed URL that creates new components (after `resetConfig`, or with a custom reuse strategy) and fails activation looks committed: a reader first read in such a constructor can read that failed route until the next commit. A hydrated page is the exception §7 "Hydrated pages" specifies.

Chain handles follow their ActivatedRoutes as page handles do, and Angular activates ancestors first. A synchronous subscriber to a route's observable during activation can therefore read an ancestor's new values next to a descendant's old ones; once the navigation commits, templates, computeds and effects never see that mix. A navigation that fails during activation commits nothing, so the value stays, but reused ancestors keep their advanced values (§7 "Handle values"): the chain mixes an ancestor's new values with the selected route's old ones, for templates, computeds and effects too, until the next commit. The chain is not atomic.

A reader reads itself at every `NavigationEnd`, so it reconciles each commit while it lives, consumed or not. It subscribes for each record it creates a handle for, outside the reactive context, and releases a departed record's subscriptions at the commit that removes it. Injector destruction releases the rest and its `NavigationEnd` listener, and the reader then keeps its last value without following the router.

### Hydrated pages

Without `provideActiveRouteHydration()`, a reader on a hydrated page reads `undefined` until the client's initial navigation commits, so a server-rendered shell renders its `undefined` state in between, then the committed route.

`routes.generated.ts` re-exports `provideActiveRouteHydration()`, environment providers for the application config the server and the browser share. With it, a reader reads the server's committed route from its first read until the client's first navigation reaches a terminal outcome:

1. On the server, the provider registers a TransferState serialization callback. When Angular serializes TransferState, after the page is stable, it records the committed URL without its fragment and, for each generated record of the committed primary chain, top-level first: its private id, the range of the URL's primary segments it consumed (native wrappers consume segments too), its own authored resolver results when it declares resolvers, and its resolved title when it declares one.
2. In the browser, the provider's environment initializer, which Angular runs before every app initializer, takes that record out of TransferState and starts observing navigation outcomes. No record leaves everything as without the provider.
3. Its app initializer checks the record against the URL Angular's initial navigation reads, finds each record by id from `Router.config` down (searching native eager `children`, never loading native lazy branches), imports the children table of each seeded record but the last through its generated loader, and builds a plain snapshot per record over the browser URL, which it parses once. If nothing retired the seed meanwhile, no navigation has succeeded and the URL is unchanged, it publishes the chain; the root component is created after that.

| First terminal outcome                                                     | Seed                                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `NavigationEnd`                                                            | Handed over to that navigation's commit                                 |
| `NavigationCancel` with code `Redirect` or `SupersededByNewNavigation`     | Kept until the navigation that follows reaches its outcome              |
| Any other `NavigationCancel`, `NavigationError`, `NavigationSkipped`       | Retired: readers read what has committed, `undefined` until something does |

Outcomes of navigations that app initializers request count, since observation starts first; an outcome before the seed is published retires it. A published seed is handed over once a navigation has succeeded, whichever outcome reaches the provider first: a `NavigationEnd` listener that navigates again can deliver that navigation's synchronous outcome before the `NavigationEnd`. Environment initializers listed before the provider run before observation starts, so list the provider before environment initializers that navigate: a navigation Angular skips synchronously from one of them would leave the seed published next to an empty outlet. With no navigation at all (`withDisabledInitialNavigation()` and an application that never navigates), the seed stays published.

Seeded params and search come from the browser URL through the genuine codecs, never from the server. Data and title are the server's, as the server's resolvers and title callbacks produced them; the client's resolvers still run, and their values replace these at the handover. Resolver results are sent only when every authored resolver value of the chain is transferable: `null`, booleans, strings, finite numbers other than `-0`, arrays with `Array.prototype`, no holes and no other own keys, and objects with `Object.prototype` or a `null` prototype and string keys only, every property an enumerable data property holding a transferable value, with no cycle. A value reached twice through different paths is two equal copies in the browser. Any other value (`undefined`, a Date, Map, Set, BigInt, class instance, getter, or an array with extra keys) or a symbol resolver key gives that page no seed; in dev mode the server warns, naming the route and the key.

Seeded handles are full handles: the four signals, `is`, `contains`, `chain`, `link` and `navigate`. The published seed records the browser URL it was checked against, and supplies retained-key owners (§6 "Retained search keys") to every handle's reads only while that URL equals the current browser URL; a router state installed for the current URL takes priority. A redirect or a superseding navigation keeps the seed for display, but once the browser URL has moved on, the seed no longer decides what is retained. At the commit the seed is handed over to, each reader keeps each seeded handle whose record that commit activated at the same generated depth below a kept parent, and the handle then follows the live record; the rest are departed handles (§6). A reader adopts nothing from a seed retired by any other outcome, whether or not it was read in between.

No provider, no recorded chain, a URL different from the browser's (before the loads or after them), an unknown id (including a generated record reachable only through a native lazy branch), invalid segment ranges, a failed or non-array children load, or a parse failure give no seed: readers read `undefined` until the first commit, as without the provider. In dev mode the browser warns `@loozo/angular-router: active route not seeded (<reason>)` for each of these except a missing record.

The package never starts, awaits or alters a navigation and writes no router or route-configuration field: Angular's initial navigation still starts from its bootstrap listener. What changes is bootstrap timing and order on seeded pages:

- Root creation waits for the seeded chain's children tables and their static import closure, including route copies and their step modules, to load and evaluate. Those modules must finish evaluating without waiting on the application's bootstrap: a top-level `await` on a promise that the root component, a bootstrap listener or the first navigation resolves deadlocks bootstrap on every page seeded through that module, leaving the server HTML inert. A children-table request that hangs holds root creation, not only the initial navigation.
- The tables along the server's committed chain evaluate before client matching (§11 "Children tables"), even when the client's `canMatch` then refuses the route.
- The Router and everything its constructor injects (`UrlHandlingStrategy`, `RouteReuseStrategy`, `Location`, `ROUTES`, `ROUTER_CONFIGURATION`, the component input binder) are created during environment initialization, before any app initializer runs, so an app initializer can't prepare state their factories need. Prepare it before `bootstrapApplication` or in a non-navigating environment initializer listed before the provider, or leave the provider out.

The seed is display state, not a cache: it skips no guard, resolver or load, and the context drops it at the first terminal outcome. A restore of a remembered key (below) is a `Redirect` cancellation, so it keeps the seed.

### Remembered search keys

A declaration marks a search key it owns as remembered by wrapping its codec with an id: `search: { pageSize: remembered(withFallback(numberParam, 20), "orders.pageSize") }`. Its last committed value is stored under that id and written back into the URL when a navigation enters the key's **owner** (§6 "Retained search keys") without it. The URL stays the only source of the values handles, guards and resolvers read: a stored value reaches them only through a URL. The id names the stored value: the same id is the same value wherever it's used, so unrelated subtrees share a value only by choosing one id, and changing the id (`"orders.pageSize.v2"`) starts afresh. Within one effective search map ids are unique (§2).

**Storage.** `routes.generated.ts` re-exports `provideSearchStorage(storage)`, environment providers for the application config the server and the browser share. `storage` is `"local"`, `"session"` or a factory returning a `SearchStorage`, run once per application injector in its environment injection context (per request on the server); anything else is a TypeError at the call, and a factory result without `read`, `write` and `forget` methods is a TypeError when the application starts. Installing it twice keeps one store. `"local"` and `"session"` use the browser's Web Storage under `search:<id>`; on the server, decided by `PLATFORM_ID`, never by probing a global, they read nothing and store nothing. They treat storage the browser blocks (`SecurityError`) or that is full (`QuotaExceededError`) as empty and keep nothing; other errors propagate.

```ts
export interface SearchStorage {
  read(id: string): string | undefined;
  write(id: string, text: string): void;
  forget(id: string): void;
}
```

The methods are synchronous. A throwing `read` fails the navigation that restores. The router catches a throwing `write` or `forget` and reports it to Angular's `ErrorHandler`, and carries on: the other keys are still written or forgotten, and the redirect chain's bookkeeping is unchanged. A navigation whose target has a remembered key fails with `Error("Remembered search keys need provideSearchStorage(): <id>")` when the application has no store, at the point where the restore would run, so a guard that refuses wins first. The router never reads a request or writes a response; an adapter that does (the README's cookie adapter) owns that.

**Text.** A stored value is the committed value written back by the key's codec: each value (one for a scalar, each element for an array) `stringify`'d, then `encodeURIComponent`'d, joined with `&`: `"50"`, `"news&guides"`, `""` for one empty string. Text the codec accepts as an alias is stored in its canonical form, so `numberParam` commits `?pageSize=0x32` as `"50"` and the next entry restores `?pageSize=50`. A `stringify` that returns something other than a string is a TypeError at the commit, as in `createUrl` (§5). It's a valid cookie value and storage value as is. Read back, it splits on `&`, decodes each part and reads by §4's rules; text that doesn't read as a present valid value (malformed percent-encoding, a repeated scalar, a value its codec rejects) is forgotten and not restored. A stored value equal to the fallback is restored, and the next commit forgets it.

**Commit.** At every `NavigationEnd` that is the router's last successful navigation and whose router state is committed (the discipline the active route uses, §7 "Active route values"), each remembered key of the effective search of the committed state's deepest generated primary record is written when the URL holds a present valid value that isn't `Object.is` its fallback, and forgotten otherwise: absent, repeated for a scalar, invalid, `[]` (it shares the missing key's URL) or the fallback. A query-only navigation inside the owner that drops the key therefore forgets it, though Angular reruns no resolver for it. Nothing is written for a cancelled, failed or skipped navigation, and a hydration seed is no commit. A navigation started while a `NavigationEnd` is delivered may make that commit write before its own does; the last commit's values are what's stored.

**Entering.** A navigation enters an owner when the owner is in the declaration ancestry of the target's deepest generated primary record and not in that of the router state the navigation leaves; the first navigation, on the server and in the browser, leaves the empty state and enters every owner. Entry is per declaration, not per param value: `/teams/1?pageSize=50` to `/teams/2` is inside the owner, so a missing key there means cleared. Only the primary outlet counts (named-outlet declarations have no search, §2).

**Restore.** The restore runs once per navigation, synchronously, as the first thing every resolver and dynamic-title adapter of a generated primary-outlet record does (§8), plus the restore's own resolve entry on records under a remembered key. For each entered owner's remembered key that the URL lacks and that the navigation's redirect chain hasn't read yet (nothing is written during a chain, so a chain reads each id at most once), it reads the stored text; a present valid value is collected and the id joins the chain, an invalid one is forgotten. When it collected anything, it returns a `RedirectCommand` to a fresh tree of the same URL plus every collected key, with the navigation's `state`; Angular cancels the attempt with a `Redirect` and continues the navigation, its promise and its history behavior (a RouterLink or `navigate` from another page adds one entry after it; `replaceUrl` replaces it; Back and Forward into a history entry of the owner without the key restore and replace that entry's URL). With Angular 22.3:

- Angular runs every guard of the whole target tree, named outlets and ancestors' `canActivateChild` included, before the resolve phase, so every guard sees the original URL first, a guard refusal or redirect wins before any storage read, and no storage operation happens while a guard of that navigation is pending.
- The resolve phase runs routes one at a time, primary children first, and a `RedirectCommand` that a resolver returns synchronously stops the rest. So the first adapter Angular calls restores, and no authored resolver or title of the abandoned attempt runs; a named-outlet record never resolves before its primary owner and isn't gated.
- On the restored attempt, matching, `canDeactivate`, guards and the resolvers Angular schedules run again: each scheduled resolver and title once, on the restored URL. Native rerun policies are kept: a reused ancestor whose policy skips the restored attempt runs nothing and keeps its data.

These are Angular 22.3 implementation details, not documented guarantees; the proofs (§14) fail if a later Angular changes them. Guards run twice on a restoring entry, `canDeactivate` of the page left included. A guard that requires a remembered key refuses the original URL before any restore: guards read an absent remembered key as its fallback. Hand-written native records in the primary chain aren't gated.

**Redirect chains.** A navigation and the navigations that continue it after a `Redirect` cancellation form a chain: a guard's, resolver's or `canMatch`'s redirect, a typed redirect, a restore, and a navigation error handler's `RedirectCommand` all continue it. A chain reads and restores each id at most once; a restored id suppresses itself for the rest of the chain. A chain ends at its navigation's `NavigationEnd`, at another cancellation, at `NavigationError` or at `NavigationSkipped`, including a continuation Angular skips before it starts (a redirect back to the current URL), which forgets nothing; an outcome of a navigation that isn't the chain's current one belongs to a superseded navigation and is ignored. When the chain's own navigation ends in `NavigationError`, `GuardRejected` or `NoDataFromResolver`, every id it restored is forgotten, so a stored value the application now refuses can't fail every later entry; a superseded or aborted chain forgets nothing. A guard that refuses a remembered value should redirect to the owner's URL without the key: the id stays suppressed, the bare URL commits, and the commit forgets it. A redirect away from the owner keeps the value.

**Retry.** `routes.generated.ts` re-exports `currentSearchRestore(): SearchRestore | undefined`, which needs an injection context. It returns a view only during the current navigation of a chain that restored a value and hasn't retried, otherwise `undefined`, and without `provideSearchStorage()` it returns `undefined` and creates nothing.

```ts
export interface SearchRestore {
  readonly originalUrl: string;
  forget(): void;
}
```

`originalUrl` is the URL of the attempt the chain's first restore redirected from, as Angular serialized it, unrelated query and fragment included; a later restore in the chain doesn't change it. `forget()` forgets every id the chain restored and uses up its one retry: the ids stay suppressed, so the next attempt restores nothing, and `currentSearchRestore()` returns `undefined` until the chain ends. Calling it again, or from a view whose chain ended, does nothing. A navigation error handler that recognizes a not-found error asks for the view before setting any status, calls `forget()` and returns `new RedirectCommand(router.parseUrl(originalUrl), { state })`: that continues the chain, which commits at the original URL with fallbacks, and a page missing anyway fails again with no view, so the handler's normal not-found follows after one retry. The retry forgets every restored value, valid ones included, and reruns guards and resolvers. A handler that doesn't call it gets no retry and the restored value stays stored. On the server, a not-found whose browser URL is the restored one differs from the request URL, so Angular's server engine answers with a redirect carrying the handler's 404 status: development throws, and production sends a bodyless 404 with `Location`. `@loozo/angular-launch`'s `rpcNavigationErrors` calls it, before it sets any status (Launch SPEC §Outcomes).

**Server rendering.** With an adapter that reads the request's cookies (README "Remembered search keys on the server"), the server's first navigation restores, commits the restored URL, and Angular's `AngularAppEngine`/`AngularNodeAppEngine` answer a changed final URL with a redirect to it, keeping response headers; the browser then renders the restored URL through hydration. A retry commits at the request URL, so the response is the page with fallbacks. Browser storage stores nothing on the server, so the client restores after hydration. A restore and a retry are `Redirect` cancellations, so an active-route seed is kept through them (§7 "Hydrated pages").

## 8. Angular-native guards and resolver data [D, Q]

### Guard adaptation

A guard in a named-outlet branch belongs to the same navigation as the primary route's: Angular refuses, redirects or waits for the whole navigation, so a refusing `canActivate` in an opened branch cancels a primary change made in the same navigation.

The `.canActivate`, `.canActivateChild`, and `.canMatch` steps take arrays of parsed-input callbacks. Zero-argument callbacks remain usable; imported snapshot-first native guards can be invoked explicitly inside an adapter callback. No new guard-class/token adaptation protocol is required for these three steps. `.canDeactivate` retains Angular's native function/token forms and component-first signature.

| Step               | Package callback signature and scope                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canActivate`      | `(inputs, snapshot, state)`; declaring route's effective inherited/local params/search                                                               |
| `canActivateChild` | `(inputs, childSnapshot, state)`; declaring parent's effective params/search, not unknown descendant-local fields                                    |
| `canMatch`         | `(inputs, routeConfig, segments, partialSnapshot)`; **local** positional params plus effective inherited/local search; no ancestor positional params |
| `onInvalidParams`  | `(error, routeConfig, segments, partialSnapshot)`; one callback, not an array; see "Matching" below                                                  |
| `canDeactivate`    | Native `(component, currentSnapshot, currentState, nextState)`; no automatic codec parsing/waiting                                                   |

Typed inputs are readonly, codec-inferred, and contain only params/search, plus, on a route made by an extension factory, that extension's input members (§2 "Route extensions", §7 "Sharing"); the generated matching guard, `onInvalidParams` and `canDeactivate` never receive extension members. Preserve each native argument's Angular type. Ordinary scalar/Promise/Observable `GuardResult` values (`boolean`, `UrlTree`, `RedirectCommand`) are supported. Angular owns invocation/order, matching fallback, cancellation, redirects, and results; do not add a guard scheduler.

Generate phase-specific adapters that validate exact record identity and positional ownership, parse inputs synchronously, and call the authored callback in the same synchronous call Angular made, inside the injection context Angular provides; no injection-context restoration exists. `inject()` works at callback entry, before the callback's own first await. Callback results (scalar, Promise or Observable) are returned to Angular unchanged, so Angular keeps its native Observable first-result/teardown behavior. The one exception is a restoring navigation's resolve phase (§7 "Remembered search keys"), which guards don't take part in. For activation callbacks, a parse failure propagates as a navigation error **before the callback**, not an implicit `false`. A successfully parsed `canMatch` returning false uses Angular's native next-candidate behavior.

Adapters are built from the route copy (§11) that the table holding the record imports, never from the declaration module, when that table evaluates. The callbacks they call are the copy's steps, which are the declaration's router steps as written (§2 "Route extensions" for server-only steps).

Adapters forward Angular's native arguments as they are. The native `Route` of every record with retained children has `loadChildren` and no `children` (§11), before and after Angular loads them: Angular keeps loaded routes privately and never fills `children`. So `canMatch`'s route argument and a snapshot's `routeConfig` show no children; a portable has-children check is `children?.length || loadChildren`. A policy over a route's descendants belongs on the route's own static data, or the routes it inspects become top-level declarations. Neither the generated records nor the adapters synthesize `children` or expose Angular's loaded-route cache.

### Matching

**A local path param that fails to parse means the route doesn't match.** Generation gives every non-redirect record whose own path has a param (`$name` or `$name[]`) or that has effective search a generated `canMatch`, ahead of any authored ones, that parses that record's local path params and, once they succeed, its effective search. Valid path params match; an input error returns `false`, so Angular tries its next candidate and backtracks, typically to the closest catchall (§3). A thenable parse result (§4), path or search, instead fails the navigation with its TypeError; Angular runs this guard on every navigation, query-only ones included, so no navigation commits one. A resolver, guard or handle therefore never sees a value its path codec rejects, such as an unknown `enumParam` member. Ancestor params are absent from Angular's partial match snapshot, so each ancestor's own generated guard checks its own params. Search never decides the match: it never produces an input error, and only the thenable TypeError, a programming error, escapes its parsing. Existence checks (a value that parses but names nothing) remain application logic, for example a `canActivate` returning `new RedirectCommand(notFoundUrl, { browserUrl: state.url })` to a not-found URL that the route itself can't match.

`onInvalidParams` replaces the `false`:

```ts
export default defineRoute("items/$id", { params: { id: numberParam } }).onInvalidParams(
  (error, routeConfig, segments, partialSnapshot) => {
    // error: the path input error (§7), with the codec failure as its cause
    return new RedirectCommand(inject(Router).parseUrl("/items"));
  },
);
```

It is called synchronously in the route's injection context, like other callbacks. It returns `false`, a `UrlTree` or a `RedirectCommand`, synchronously or as a Promise/Observable. `true` is a type error, and at runtime `true` or any other value, including one a Promise or an Observable's first emission delivers, fails the navigation with a TypeError; a throw or rejection fails it with that error. The step is offered only on routes with local path params, and a route that uses it offers no `.redirect` (§9); both rules hold at type level, at runtime declaration and in generation preflight.

Angular passes one partial snapshot to all of a candidate's `canMatch` guards and calls each of them, preferring the first non-`true` result in array order, while any guard's error fails the navigation. So all of them share one path parse and one search parse per candidate, and an authored `canMatch` adapter never errors because of invalid path params: if that parse fails, it returns `false` without calling the callback, leaving the generated guard ahead of it to decide. After a successful path parse, its inputs are those path values plus effective search.

**Sibling pathless groups match only the URLs their routes own.** A sibling pathless group's record (§10) keeps `path: ""` and gets a generated ownership guard ahead of its other `canMatch` guards: it admits the remaining segments only when one of the group's claims fits them (the paths, relative to the group, of its descendants in its own outlet group: static text exactly and decoded, one segment per param, zero or more for a catchall's rest). Each of the record's generated and authored `canMatch` adapters checks the same fit first and refuses without calling its callback when nothing fits. Angular runs `canMatch` before `loadChildren`, so in primary recognition a group that doesn't own a URL calls none of its matching guards and loads neither its children table nor its layout, and the URL reaches the group that owns it. A group's own `canMatch` returning a `UrlTree` still redirects the URLs the group owns; one returning `false` lets a later record match, which is a group holding a catchall (§3) or nothing.

Angular still does these to a group that doesn't own a URL:

- It builds the group's route injector before running any `canMatch`, so environment initializers in its `.providers(…)` run the first time Angular tries the group, on any URL that reaches it. Ordinary provider factories stay lazy until something injects them.
- When every route of a named outlet refuses that outlet's segments (an invalid param, the branch's own guard, or no route of that shape), Angular tries the segments against the groups too. A group whose claims fit them, through a route of the same shape or a catchall, runs its `.canMatch` guards with them (a `UrlTree` they return redirects the navigation) or loads its children table before the navigation fails with NG04002. Its matching callbacks can't tell this attempt from a primary one: Angular gives them the same route, the named outlet's segments and a snapshot whose `outlet` is `"primary"`.
- Under a preloading strategy Angular preloads the group's table: its preloader skips `canMatch`.

A pathless declaration without a pathless sibling isn't a group and gets no ownership guard; its matching guards run, and its table loads, for any URL that reaches it, as for any empty-path record.

All authored callbacks for one matching candidate share that candidate's local input operation/container. The public matching inputs container is shallow-frozen; its params/search maps retain shared identity and shallow freezing, while nested codec values remain opaque. Full-snapshot activation guards share the full operation described in §7; callbacks do not promise fresh resolver data before Angular executes resolvers. Matching inputs must come from candidate consumed segments/global query data, not an invented parent snapshot or a runtime matching-context subsystem. Native canDeactivate may explicitly inspect its component's typed handle, but merely configuring it never forces parsing or prevents leaving because of invalid package inputs.

### Resolver data

Here `ItemCatalog` is an application-owned injection token whose provider accepts these parsed values.

```ts
// team.route.ts
import { defineRoute, numberParam } from "@loozo/angular-router";

export default defineRoute("teams/$teamId", {
  params: { teamId: numberParam },
  search: { score: numberParam },
});
```

```ts
// item.route.ts
import { inject } from "@angular/core";
import { defineRoute, numberParam } from "@loozo/angular-router";
import team from "./team.route.js";
import { ItemCatalog } from "./catalog.js";

export default defineRoute("items/$id", { parent: team, params: { id: numberParam } })
  .runGuardsAndResolvers("paramsOrQueryParamsChange")
  .resolve({
    item: ({ params, search }) =>
      inject(ItemCatalog)({ teamId: params.teamId, id: params.id, score: search.score }),
  });
```

A callback receives `(inputs, ActivatedRouteSnapshot, RouterStateSnapshot)`. Local callbacks for one exact declaration/snapshot receive the same shallow-frozen public `inputs` container. Its `params/search` maps retain the shared identity and shallow freezing described in §7, and infer readonly effective codec-parsed values including pathless ancestry. Only top-level bindings are readonly; nested codec-produced objects retain their types. This public callback-container contract does not prescribe any private intermediate result representation. Raw snapshots are an escape hatch, not the package's positional-ownership source.

No manual generic or ResolveFn annotation is needed. Raw native ResolveFn's snapshot-first signature is not interchangeable with this parsed-input callback signature. Resolver values must be functions.

Scalar/object, Promise, Observable, and RedirectCommand results are supported. Data inference unwraps asynchronous outputs and excludes RedirectCommand; a redirect-only resolver has never as activated data.

Handle data is the route's effective resolver data: the resolver results of its whole declaration chain, the outermost ancestor's first, then nearer ones, then its own, including pathless and componentless ancestors. Each owner contributes only its own authored resolver keys, read from its own record of the committed snapshot. The keys are the ones the generated callbacks stamp onto the record (§11), not the keys of Angular's native resolve map, which Angular extends with its own title entry during resolution. The type follows the same merge.

- A nearer route's resolver key hides an ancestor's key of the same name, as in Angular's own data inheritance; the hidden value isn't reachable through the handle.
- The merge doesn't depend on `paramsInheritanceStrategy`. Under `'emptyOnly'`, a route below a component (layout) parent has that parent's resolver data in its handle although Angular's own `snapshot.data` doesn't. Angular 22's default is `'always'`.
- Only resolver results take part: native static `data`, and the Angular title (read through the handle's `title`, below) stay out. A static value can be exposed through a resolver, such as `.resolve({ label: () => "Teams" })`.

Generated adapters must:

- Check the exact record before parsing/callback invocation.
- Parse effective inputs synchronously before calling the callback.
- Let resolvers and handles share the same declaration/snapshot parse, including failure.
- Call the callback synchronously inside Angular's injection context; `inject()` works there, before the callback's own await. Later awaits/emissions and codecs receive no DI-context guarantee.
- Return the callback's result to Angular unchanged, preserving native first-emission, empty-Observable cancellation, redirects, errors, execution ordering, activation, SSR, and returned Observable teardown.
- On a primary-outlet record, first call the restore (§7 "Remembered search keys"). On an attempt that restores, the first resolver or title adapter Angular calls returns the restore's `RedirectCommand` without calling its callback or parsing, and no other authored resolver or title of that attempt runs. Every other attempt calls the callback as above.

A record whose effective search has a remembered key gets one more native resolve entry under a module-private symbol, the restore itself, which resolves `true`. It isn't stamped (§11), so handles, typed data and hydration seeds never see it; Angular's own `ActivatedRoute.data` holds it.

A resolver-run parse error rejects navigation before callbacks/activation; first activation therefore creates no handle. With neither typed activation-guard, resolver nor title input demand, handle parsing happens after commitment, and a parse failure there throws on handle read without failing navigation (§7). Do not cache or share resolved data independently of Angular.

An explicit native runGuardsAndResolvers policy/predicate is passed through unchanged. Omission preserves Angular's default paramsChange behavior: query-only navigation can produce new parsed search alongside old resolver data. Consumers choose paramsOrQueryParamsChange or a predicate when required; unrelated query/matrix changes may also trigger that native policy. No automatic dependency tracking, forced rerun, extra resolver pending-work lifecycle, loader, timeout, data cache, or transfer cache exists.

### Titles

The `.title` step takes a string or a parsed-input callback `(inputs, ActivatedRouteSnapshot, RouterStateSnapshot)` returning a string, Promise or Observable of one. Inputs are the declaring route's effective inherited/local params/search, the same shared container its resolvers receive. Angular runs a title as a resolver, so the callback is adapted like one: same record check, shared parse, injection context, rerun policy and navigation-error behavior, and it cannot read the route's resolved data. Angular's native snapshot-first `ResolveFn` and class/token title forms are not accepted, for the same reason as resolvers. A redirect record never activates, so it has no title.

A handle's `title` is the resolved title of the nearest declaration in its chain that uses `.title`: its own, else the nearest ancestor's, pathless and componentless ones included. It is read from that declaration's own record of the committed snapshot (`ActivatedRouteSnapshot.title`), so it doesn't depend on `paramsInheritanceStrategy` and changes with params, search and data (§7). The type follows the same rule: `Signal<string>` when the declaration or an ancestor declares a title, `Signal<undefined>` otherwise.

- The value changes only when Angular reruns the declaring route's title, under its rerun policy: with the default `paramsChange`, a query-only navigation keeps the old title, as it keeps resolver data. A title that reads search needs `paramsOrQueryParamsChange`.
- The signal notifies only when the string changes, not for every new snapshot.
- Only the generated declarations of the chain take part. A native Angular route above or between them that declares a title is not read, so Angular's `TitleStrategy` can then set a different document title.
- A route without its own title reads its ancestor's, so the titles of an active `chain` (§6) repeat across untitled routes.

## 9. Typed redirects [X]

```ts
import { destination as target } from "../items/$itemId/destination.generated.js";

export default defineRoute("old/$oldId", { parent: team, params: { oldId: numberParam } }).redirect({
  to: target,
  params: { teamId: "teamId", itemId: "oldId" },
  search: { mode: "drop" },
  fragment: { mode: "preserve" },
});
```

`to` is a genuine destination (§6), never a URL expression or a route. Static authoring requires an identifier bound to a named `destination` import (aliases allowed) whose specifier resolves to an admitted declaration's `destination.generated.ts`; the file need not exist yet, as on a first generation. Anything else fails generation with `Redirect target must directly reference a destination import`, or `Redirect target is not an admitted declaration's destination: <spec>`. At runtime, `.redirect` throws `TypeError("Redirect target must be a genuine destination")` for anything but a genuine destination of this package instance, a route included; a route also fails typing. The target declaration's path/ancestry determine the effective URL. Folder names do not participate in explicit mode; filesystem mode (§12) synchronizes those declaration fields before generation.

An explicit params map covers every destination path key exactly and names compatible effective source path keys. Omission forwards by the same name only when every target key exists with compatible inferred values. Source value types must be usable by destination codecs; mere equal parameter names do not suffice. Mapping cannot invent constants, use query keys, or omit required target params.

Both search and fragment policies are mandatory:

| Policy                        | Search behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `{ mode: "preserve" }`        | Preserve unknown keys, repeated values, and original decoded query text rather than re-stringifying it; destination search recovers on its own (§4), so nothing is validated, and a destination `arrayParam` key reads the preserved repeated values                                                                                                                                                                                                                                                                                                   |
| `{ mode: "drop" }`            | Remove all incoming query values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `{ mode: "replace", values }` | Destination-typed values for any subset of keys, omitting absent or `undefined` ones; an `arrayParam` key writes one value per element and nothing for `[]`, and a non-array value for it is a TypeError at declaration; literal unknown keys fail typing. Declared-search replacement variables may admit extra keys through structural assignability; searchless replacement typing rejects string keys even through variables. Runtime and static validation reject all unknown replacement keys. `{}` is always valid and removes incoming queries |

Fragment accepts preserve, drop, or `{ mode: "replace", value }`. Explicit replacement values use the target's declared fragment-name union and runtime membership; without target names replacement is forbidden. Preserve carries raw incoming fragment text without imposing declaration membership, consistent with raw incoming hashes remaining Angular's concern; drop always removes it. The redirect adapter itself does not parse or validate any search values; ordinary matching candidates can independently demand their own inputs before a fallback redirect is reached.

Runtime declaration keeps the destination object and snapshots mapping/replacement/fragment records, validates structure/missing/unknown keys (including that `arrayParam` replacements are arrays) without running codecs, and rejects unknown redirect properties. `createUrl` remains distinct: it still forbids a search option for a searchless route even though redirect replace accepts `{}`.

Redirects never retain (§6 "Retained search keys"): a `preserve` policy keeps the incoming query text as is, `drop` and `replace` write only what they say. A typed redirect into an owner without its remembered key is followed by a restore (§7 "Remembered search keys"), since restores run after recognition.

Redirect execution:

1. Check mapped scalar source cardinalities before any parser starts; mapped catchalls allow zero-or-more elements.
2. Parse mapped source paths synchronously with source codecs, including catchall element parsing.
3. Stringify those logical values with destination codecs and target scalar/catchall shape; never copy raw path text. Mapping compatibility uses logical value types, including readonly catchall arrays.
4. Apply search/fragment policies and return an Angular UrlTree for native redirect execution.

Within the redirect adapter, only mapped source params are parsed; unmapped source params are ignored. Equal value types do not guarantee codec success. A codec throw, an input error or a thenable parse result fails through Angular navigation errors. Under default handling, one NavigationError is emitted and navigateByUrl rejects while prior committed URL remains. No parallel router lifecycle or new timeout is added.

Redirect rules are positional. `.redirect` is the chain's last step, and it is not offered after any guard step (`.canMatch`, `.canActivate`, `.canActivateChild`, `.canDeactivate`, including empty arrays), `.onInvalidParams` or `.errorComponent`: Angular rejects `canActivate`/`canMatch` with native redirect records (Angular 22.2.2 threw RuntimeError 4014 for `canMatch` with `redirectTo`), a redirect record never activates or deactivates, so it has no page for an error component to replace, and it gets no generated matching guard, so an invalid mapped source param fails through the redirect adapter as a navigation error. Literal typing (the step is absent), runtime declaration (the value has no `redirect` or no later step) and generation preflight (`Redirect cannot follow <step>`, `No step may follow redirect: <step>`) reject the other orders; generation fails before changing outputs. Do not silently discard the guard or invent its execution. This restriction does not apply to retained source ancestors' matching guards.

`.resolve` and `.title` may come before `.redirect`, and so may `.providers`, `.data` and `.runGuardsAndResolvers` on a redirect source without a parent, with these effects:

- Resolver and title callbacks never run: a redirect record never activates, so no adapter is generated for them.
- Providers, static data and the rerun policy are still forwarded to the generated redirect record. Data and the policy have no effect there but are visible in `router.config`.
- With Angular preloading enabled (such as `withPreloading(PreloadAllModules)`), Angular builds an environment injector for any record with providers and doesn't skip redirects (as read in Angular 22.2.2's `RouterPreloader.processRoutes`), so an environment initializer in a pre-redirect `.providers(…)` runs although the redirect never activates.

A redirect source with a parent reads its route copy lazily. Its hoisted record keeps its place, effective path, `pathMatch: "full"` and facts helper, and its `redirectTo` is a lazy adapter: called in the injection context Angular provides, it captures the environment injector, loads the source's route copy through `import()`, then runs the execution above inside that injector. A failed load fails the navigation like any adapter error, with no fallback. So neither the source's copy nor its ancestors' copies load until it first redirects, and nothing loads a children table for it. Because the record is built before the copy loads, such a source can't carry native options read from its copy: generation preflight rejects `.providers`, `.data` and `.runGuardsAndResolvers` on it with `A redirect with a parent can't use .<step>: its record is hoisted into the eager table and would load its route copy`. A redirect source without a parent reads its copy when `routes.generated.ts` evaluates.

A redirect source can't be in a named outlet (`Redirect sources can't be in a named outlet: <id>`): a UrlTree redirect replaces the whole URL, so a branch source would drop the primary route. A redirect **into** a branch is allowed: it replaces the whole URL with that destination's own URL (§5), the anchor's primary path plus the branch, every other branch gone, and keeps the search and fragment policies above over the target's effective search, which for a nested branch member is its primary ancestors' (`replace` can write `products`' `sort` for `item`, unlike ordinary branch navigation, which takes params only and keeps the page's query). A fragment `replace` into a branch fails, as branch members declare no fragments. An empty primary winner at the anchor renders beside the branch (§11), on a client-side redirect as on a direct load: Angular recognizes a fresh URL after splitting empty-path routes out beside its root's named outlets, but matches an absolute redirect's tree as returned, so a redirect into a root-level branch returns the tree with an empty primary group when the root configuration has an empty-path primary route that matches by prefix, and as built otherwise.

Static generation rejects inadmissible targets, incorrect selected shared-path identity, incompatible/incomplete maps/policies, self redirects/cycles, and redirect sources with components, children, or the step orders above. Ordinary redirects become **root-level full-match effective-path records before the ordinary nested tree**, not nested redirect records. Catchall redirect sources remain root-level/full-match but come **after the ordinary tree**, so fallback behavior does not swallow ordinary destinations. Include hoisted catchall redirects in the same generated-sibling competition checks as other catchalls.

Hoisting does not activate source ancestors on the source URL or run their activation guards/resolvers merely because of authored ancestry. Catchall redirects follow the ordinary tree, so ordinary candidates—including retained source ancestors—may execute native `canMatch` first; their results, parsing demands, and errors retain Angular's behavior. Guard fields on redirect records likewise follow actual native dispatch; do not introduce guard execution that Angular does not perform.

A redirect source gets both per-route files (§11); its route copy has no `injectRoute()`, since a redirect record never activates. Newly empty componentless ancestors are pruned: they get no record and stay out of the active table and its types, but keep both per-route files, because the redirect sources below them import their parent's destination and route copy. A redirect source's destination addresses its source URL with source inputs. A retained ordinary componentless ancestor may be a redirect target when it is its path's winner (§6); a pruned ancestor cannot be a redirect target.

## 10. Generator source analysis and validation [G]

### Observable generation contract

The builders read configured application sources without importing/executing application modules or evaluating codecs, guards, resolvers, title callbacks, provider factories, or policies. Source analysis is private; no public graph result, type inventory, frozen intermediate object, or particular analysis function is required. It is not whole-program semantic validation or Angular/template checking; the application still typechecks/builds separately. Filesystem mode (§12) additionally checks syntax and semantic diagnostics of admitted declaration files against the combined authored/generated overlay, including codec maps, inherited ownership and callback references. Both modes check every generated copy and the application's module references ("Module references and the import rule"). Unrelated included-source semantic errors and compiler option/global diagnostics remain the native application's responsibility; existing module-reference preflight still covers application sources.

Require exactly one configured scan root in both modes. Empty authored input is valid and follows the stale-output cleanup rules in §11. Expected configuration/I/O failures must be reported clearly and prevent generation before output changes. Unexpected internal failures may propagate as errors.

Verify discovery, authoring, ancestry, and validation through application/serve builders, generated behavior, actionable diagnostics, and filesystem effects—not by importing an internal graph API.

### Discovery and identity

- Resolve tsconfig/outDirectory against the Angular workspace root or as absolute paths; scan roots against the tsconfig directory.
- Candidates are **parsed TypeScript tsconfig root files intersected with the single scan root**. Filesystem mode (§12) also plans prospective seeds and requires their membership in the same native config.
- Honor extends/files/include/exclude. Explicit files may override exclusion. Imports do not expand the candidate set; project references are not recursively scanned.
- Admit implementation `.ts` route/page candidates only; ignore `.mts`, `.cts`, `.tsx`, declarations, JavaScript, and dependency sources, even with allowJs. This candidate rule does not constrain dependency formats or prescribe Node-side builder packaging.
- There is no route/page/test naming convention.
- Multiple scan entries are rejected in both modes. The single root anchors filesystem paths in filesystem mode (§12); in explicit mode it confers no authored-file ownership.
- Generated record source IDs are relative to the tsconfig directory, preserve case and source extensions, and use `/`; this emitted binding identity does not expose an analysis model.
- Roots outside the project are allowed when relative IDs are representable. Use `../` IDs; reject incompatible source identity such as another Windows drive. Directory containment is boundary-aware, not a string-prefix test.
- Moving source changes its ID; changing route paths/scan boundaries does not.
- Generation and diagnostic presentation are deterministic across equivalent discovery inputs. Do not infer Angular matching precedence from source discovery order.

Source-tree file/directory/root links and links below admitted source/root paths are errors. Traversal audits encountered links even when their targets would be tsconfig-excluded. Dependency package-manager links remain valid and compare by physical identity. A symlinked ancestor outside the canonical workspace, used only to access the checkout, is canonicalized; relative/absolute roots through that alias have equivalent identity. Once a path enters the canonical workspace, preserve all suffix spellings for audit. A link inside the workspace remains unsafe even when its target is the workspace root itself; neither explicit files nor virtual wildcard membership may hide it.

### Authoring and provenance

Admit direct `export default defineRoute(literalPath, inlineFacts).step(argument)…` chains using the real package named import, including import aliases, or a route extension's factory (below). The chain is plain calls: element access, optional calls, and parenthesized, asserted, non-null or `satisfies` expressions inside it fail, and only the default-exported chain end is the declaration. The root call, the router's `defineRoute` or an extension factory, takes no type arguments: they fail with `Route declaration root call takes no type arguments: remove them; defineRoute infers its types from the URL facts`, because a type argument naming the parent would mean the parent's destination in the destination copy (§11); a step's type arguments are allowed. Steps are named members of the chain; unknown, repeated or misordered steps (§2, §9) fail at the step. A router step takes exactly one argument, a contributed step the manifest's arity, and spread arguments fail, because generation counts arguments statically: a spread into a variadic contributed step type-checks but fails generation. Only filesystem mode (§12) may create editable declaration seeds. Do not admit constants exported later, nongenuine wrappers/local factory aliases, application barrels/reexports, type-only factory imports, indirect defaults, unknown defaults, or multiple competing defaults.

URL facts use unique explicit keys from §2, without top-level spreads/accessors/computed/duplicate/unknown keys; a behavior key there fails with a diagnostic naming the step to chain instead. Params is required for local placeholders and forbidden without them. Step arguments are opaque expressions, as facts values are, except the `.redirect` argument, which must be an inline object (§9), and a literal `.data` argument, which is checked for the generated identity key. In explicit mode, params/search expressions otherwise remain opaque: source analysis does not certify codec/map typing or all inherited search-key uniqueness. Filesystem mode (§12) checks admitted declaration semantics without evaluating those expressions, and rejects opaque or ambiguous structural codec edits rather than guessing. Ordinary helper imports may resolve to ambient modules; parent/factory provenance requires concrete source identity. A top-level binding that the path, the URL facts or the statements they reach read (what the destination copy keeps, §11) may not be written anywhere in the module: an assignment, compound assignment, `++`/`--`, destructuring assignment target or `for … in`/`for … of` target naming it, inside functions included, fails at the written name with `a binding the URL facts read is reassigned; declare it const`, because the destination copy keeps the declaration but drops the write. Bindings only steps read are unaffected.

Parents directly reference default imports of admitted declarations; redirect targets directly reference `destination` imports of admitted declarations' destination files (§9). In the path, the URL facts and the top-level statements they reach (what the destination copy keeps, §11), the parent import appears only as the facts' `parent` value (`{ parent }` or `parent: parent`): any other reference, type or value (`ParamsOf<typeof parent>`, `parent.path`), fails at that reference with `` URL facts may use the parent import only as `parent:`; for its URL types use ParamsOf<TargetOf<typeof d>> with d imported from the parent's destination.generated.js ``, because the destination copy binds that name to the parent's destination. Steps and what only they reach use it freely; the route copy binds it to the parent's route copy. Excluded-but-importable parents fail membership. Parent cycles fail. In explicit mode, authored parents alone determine ancestry and directories introduce no implicit nodes. Filesystem mode (§12) synchronizes each record's path and nearest record parent before applying the same ancestry validation. Grammar validation precedes matching-shape comparison.

Factory provenance is anchored to this router package's concrete public entry. A matching import spelling or impostor manifest does not establish it. An import spelled `@loozo/angular-router`, or one that resolves to that same physical entry (a dependency link or path alias to the same file), is judged as the router's own factory by this rule. Angular decorator provenance is anchored to the component consumer's installed `@angular/core`, resolved without application paths/baseUrl redirection or package self-name impostors. Genuine aliases/dependency links work. Consumer Angular may be physically separate from tooling's development installation. Installed dependencies are trusted provenance evidence, not independently authenticated.

Any other `defineRoute` import is a route extension candidate (§2 "Route extensions"). It is admitted only when all of these hold, judged without application `paths`/`baseUrl` redirection where a resolution is called canonical:

- The import is a named value import of `defineRoute` (renaming allowed) from a bare package root, scoped included, that the application and canonical resolution resolve to the same physical file.
- The binding is that entry's `defineRoute` export, anchored by declaration identity.
- The application's `@loozo/angular-router` resolves to this router package's public types entry, whose `defineRoute` export is not redirected.
- The application's `@loozo/angular-router/_core` resolves to the physical `_core` types entry named by this router package's own `exports` map.
- The export's declared type references `RouteFactory` from that physical `_core` entry, by declaration identity, with exactly one type argument; assignability, spelling or a copied brand doesn't count. `RouteFactory` imported from the public entry fails with a message pointing at `_core`.
- That type argument's `steps` is a fixed-length tuple of required entries whose `name`, `serverOnly` and `arity` are literal types satisfying §2's manifest rules.

Generation reads the manifest from the factory's declared type; it never executes the extension. It strips every step whose manifest entry is `serverOnly: true` from the route copy (§11); every other step goes into the browser build as written. A route whose ancestry mixes two extensions fails. Anchoring authenticates the factory's declaration, not its runtime: an installed package that asserts the genuine `RouteFactory` type over a different implementation, or whose manifest lies, is admitted, like any installed dependency (above).

A directory may contain one route declaration and one directly default-exported standalone Angular component class, associated by exact colocation, never names or directory ancestry. Declaration-only directories are allowed during source analysis; generation still rejects ordinary componentless leaves as specified in §11. Component-only candidates fail in explicit mode; filesystem mode (§12) seeds their colocated declarations. Competing candidates fail in both modes. Named-only modules are ignored; unknown default exports are errors.

Component recognition requires genuine Angular Component provenance. Inline metadata must prove omitted standalone or final literal true. False, indirect/asserted/uncertain standalone fail. Duplicate explicit standalone properties fail generator validation, even when both are literal true. An earlier opaque metadata spread followed by a single explicit literal `standalone: true` is admissible; a later unknown spread that may override it is not. Other metadata remains opaque and is not evaluated.

### Module references and the import rule

A declaration module has exactly one export, its default route. Named exports (value or type), `export *`, `export =` and re-exports fail with `Route declaration module may only default-export its route`; an empty `export {}` is allowed.

Generation scans every file of the validation program outside dependencies and the default library for module references: import and export declarations (value and type), dynamic `import()`, import types (`import("m")` in type positions), `import x = require("m")`, literal `require("m")` calls (the identifier `require` called with one string literal, resolved in CommonJS mode), and `/// <reference path>`. A computed `import()` or `require()` specifier anywhere in that program fails with `Computed module specifier: <text>`. A literal `require` that doesn't resolve isn't an unresolved-import failure; it simply makes no edge.

**The import rule.** A resolved declaration module may be referenced only by its child declaration's `parent` import: one default value import, with no named or namespace bindings. Two generated references are admitted too, each exactly as written: a route copy typed from its declaration (§2 "Copies") names its own declaration with one erased `import type Authored from "./route.js"` (a default binding only, no named bindings, never a value import or re-export, and never from the destination copy or another declaration's files); and, in Launch mode, Launch's server aggregate `<out-dir>/server.generated.ts`, when it is in the generated set, value-imports a declaration with a `serverOnly` step by one default import with no named bindings. Neither puts a declaration module in a browser runtime graph: the first is erased, the second is server-only. Every other reference, in any form above and type-only included, fails at the referencing line: `Import of a route declaration: <spec>. Import its destination from <dir>/destination.generated.js instead.`, or, from a generated file, `Generated file imports a route declaration: <spec>`. Declaration modules are identified by discovery, not file name, so explicit mode's declaration names are covered. Server-side application code in the program is bound too, and so are the runtime files the program's modules run (through a runtime edge below or a dynamic `import()`) that the program doesn't hold, such as a `.js` or `.cjs` behind its `.d.ts` or `.d.cts` sibling without `allowJs`, and the runtime files those run in turn; they're scanned for module references without type-checking. Other files outside the configured tsconfig's program are not checked.

**The runtime import graph.** The copy rules below follow a graph of the references that execute their module synchronously while the referencing module evaluates:

| Reference                                                                                         | Runtime edge                                                                                                     |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `import type …`, `export type … from`, `import type x = require()`                                | No                                                                                                               |
| Import or export-from whose every specifier is inline `type`, with no default or namespace binding | Only under `verbatimModuleSyntax`                                                                                |
| Any other import or export-from declaration, `export *`, side-effect `import "m"`                 | Yes, even when a value specifier is used only as a type: Angular's compiler keeps imports decorated classes use for DI |
| `import x = require("m")`, literal `require("m")`                                                 | Yes                                                                                                              |
| Dynamic `import()`, import types, `/// <reference path>`                                          | No                                                                                                               |

Each reference resolves from its file with TypeScript's module resolution. A package entry is a leaf. A resolved implementation file with any extension TypeScript admits (`.ts .tsx .mts .cts .js .jsx .mjs .cjs`) is scanned with the same visitor, program file or not. A resolved declaration file is followed to its runtime sibling: `.d.ts` to `.js` and `.jsx`, `.d.mts` to `.mjs`, `.d.cts` to `.cjs`. Arbitrary-extension declarations (`.d.<ext>.ts`), JSON modules and declarations without a runtime sibling are leaves. The graph has no edge through a runtime file a declaration describes from elsewhere (a build step or bundler alias), a package entry that imports an application's generated files, or a `require` spelled other than as a literal call.

**Copy rules.** For each declaration, over that graph:

- Destination copy: no module its runtime imports reach, other than its parent's destination file and package entries, may reach a generated file of this tree or a declaration module: `` URL facts import reaches a generated file: <chain>. URL fact modules may import only packages and other non-generated modules; make <edge> `import type` if it only needs types. ``
- Route copy: no module its runtime imports reach, other than its parent's route copy, may reach a `route.generated.ts` (its own included), a `children.generated.ts` (which imports copies), `routes.generated.ts` or a declaration module. Destination files may be reached; they end the walk, since the rule above keeps them from reaching back: `` Route copy import reaches a generated route module: <chain>. Import a destination.generated.js for URLs, or make <edge> `import type` if it only needs types. ``
- Server modules: a runtime import kept in either copy whose specifier starts with `node:` or that resolves to a file whose name contains `.server.` fails: `` Browser route copy imports a server module: <spec>. Use `import type` for types. `` Only the copies' own imports are checked, not the modules they reach.

Each message is located at the declaration's import line. `<chain>` lists every hop as `file:line (edge kind)`, edge kinds `value import`, `require`, `import =` and `type-specifier import under verbatimModuleSyntax`, ending at the reached file; `<edge>` is the last hop. Together these keep module initialization safe: no generated module reads an imported binding while it evaluates, except a route copy reading its own destination and its parent's copy, both initialized first, and `routes.generated.ts` and the children tables reading route copies.

**Generated targets.** An import of a colocated generated file name (`route.generated.ts`, `destination.generated.ts`, `children.generated.ts`) in a scan root, or of `routes.generated.ts`, that this pass doesn't produce fails with `Generated import is not a retained owned target: <spec>`. Every `import()` in `routes.generated.ts` and in each children table must resolve, with the application's options, to exactly its target: a discovered page (`Lazy page import does not resolve to its discovered component: <spec>`), a children table this pass produces, or the route copy of a redirect source with a parent (§9).

**Copy diagnostics.** Every generated copy is a root of the validation program. Its syntax and semantic diagnostics are reported at the declaration file and the same line as `<file>:<line>:<column>: TS<code>: <text> (in its generated destination copy)` or `(in its generated route copy)`; columns are the copy's, which differ from the declaration's on rewritten lines. A copy typed from its declaration keeps the stripped steps' types; in any other copy, a kept step whose types came from a stripped server-only step fails here.

**Reserved prefix.** A declaration module's top-level bindings and import local names can't start with `routegen$`, which generated copies use for their own bindings: `Reserved generated binding prefix: <name>`.

### Matching shapes and diagnostics

A matching position's identity is a structural key: the outlet (`primary` outside a named one), the anchor and the effective in-group segments, each in authored spelling. Two declarations compete only in the same outlet with equal-length compatible anchors; the rules below then apply to their in-group segments. Equal paths in different outlets, or under anchors that can't match the same URL, pass; the same outlet and path under a parent and its pathless child collide. A primary literal `products/(detail:item)` and a `detail` branch `item` under `products` have different keys. Diagnostics print the readable display path, outlet-qualified (`/products/(detail:item/$id)`, `/(chat:chat/$id)`), with both ids.

A **sibling pathless group** is a retained empty-path declaration with at least one retained child and at least one retained empty-path sibling under the same parent (parentless declarations share one parent), such as `+authenticated` and `+signed-in` directories under one parent. It ends no path: a URL reaches it only through its descendants, which are its **claims**. Groups therefore never collide; their descendants' claims compete with every other claim, across groups too. A pathless declaration with children and no pathless sibling isn't a group: it ends its own path and collides like any route.

Equal unrelated ordinary effective shapes fail, including nonleaf declarations and pathless siblings that aren't groups. Parameter names, codecs, queries, or guards do not establish disjointness. Equality within an ancestor/pathless chain is valid. Nonidentical ordinary same-length shapes overlap when every position can match the same value; diagnose them without inventing precedence and block generation. Static comparison is case-sensitive. A collision between descendants of two sibling groups adds `, in sibling pathless groups <id> and <id>`, naming the groups directly below their common parent. Catchalls have the deliberate fallback exception and competing-sibling validation specified in §3/§9; discovery order is never their priority rule. A catchall inside a group that shadows (below) a route outside that group, where their chains part at that group, fails: `Catchall in a pathless group shadows a route outside it: <catchall> (<path>) is tried before <route> (<path>)`. With fallback groups tried last, that's two groups both holding catchalls whose prefixes cross, and a group's catchall before a root-level catchall or catchall redirect. Pairs inside one group keep §3's fallback overlap. So do pairs whose chains part at an ordinary record above the groups: that record's table order decides, as without groups, so a root `docs` with groups `+a/$rest[]` and `+b/other` shadows a root `docs/intro` the way `docs/$rest[]` would.

Builder diagnostics identify the failure and the relevant input/source location when available. Collision/overlap diagnostics identify both participants; missing files must not invent a source span. Invalid input, configuration/I/O/syntax errors, provenance/authoring failures, unsafe paths, ancestry/ownership errors, and redirect/matching conflicts must be distinguishable enough to fix the source.

**Per locale.** With `translateSegments` (§12), every locale in the project's `i18n` configuration, the source locale and each entry of `locales`, whatever `localize` selects, gets the same matching, catchall and redirect-target rules on its translated tree, before any write. A word a locale's catalogs don't translate stands as its source text, the text Angular's inliner ships for it. A translation that breaks §3's rule names the locale, the message id, the text and the catalog file it came from; a tree failure carries the canonical diagnostic prefixed `Locale <code>: `, with the translated paths. Missing and duplicate translations are Angular's: its `i18nMissingTranslation` and `i18nDuplicateTranslation` options apply in the Angular build, and generation reports neither. Check mode and every serve regeneration validate the same way, so a catalog edit changes only whether generation passes, never its output.

A retained catchall C shadows another selected declaration D (a route or a redirect source) in the same outlet group when D isn't C's ancestor, C's fixed segments can match D's leading ones, and Angular tries C's branch first where their parent chains diverge (a hoisted redirect is one record of the root table). C's fixed segments can match when each is compatible with D's segment at the same index: over all of them for an ordinary D, which needs at least as many segments; over the shorter of the two fixed prefixes for a D that ends in a catchall. Tried first is emitted order (§9's root groups; within a table, ordinary local paths before catchalls and groups holding one, then authored source path, then id), except in the table where a named group is entered (the root for an empty anchor, otherwise the children of the non-empty primary record that ends the anchor), where that outlet's records come first. This relies on named outlets not nesting and on non-empty branch-root paths. A locale fails with `Catchall shadows a route: …`, after its collision checks, for a pair its tree has and the canonical tree doesn't. Pairs the canonical tree has are §3's fallback overlap and pass.

There is no public diagnostic union, serialized target/reference object, graph-result shape, or deep-freezing guarantee. Exact message wording, numeric-code vocabulary, intermediate severity representation, and universal multi-error accumulation/order policy are not compatibility requirements. Retain TypeScript diagnostic numbers where reporting TypeScript configuration/syntax failures; keep diagnostics deterministic across equivalent inputs/root order.

## 11. Generation, artifacts, and CI checking [F]

### Generated product

One builder generation pass produces:

1. `<out-dir>/routes.generated.ts`, exporting `routes: Routes`, `injectActiveRoute()`, its types and `RouteTypes` (§6), and re-exporting `provideActiveRouteHydration()`, `provideSearchStorage()` and `currentSearchRestore()` (§7). Each re-export tree-shakes when unused.
2. Beside every admitted declaration, redirect sources and pruned ancestors included (§9), a pair of per-route files: `destination.generated.ts`, exporting its inert typed `destination` (§6), and `route.generated.ts`, exporting its route copy as `route` and, for a declaration whose record activates, parameterless `injectRoute()`.
3. Beside every retained declaration with at least one retained child, `children.generated.ts`, exporting `routes: Routes`, those children's records.

**Children tables.** Every retained declaration with a retained child is loaded lazily below its own record: its record stays in its containing table with every field it has, and has `loadChildren`, which imports its `children.generated.ts` and resolves to that module's `routes`, instead of `children`. A retained child's parent is always retained (§9 pruning), so every retained declaration's record is in exactly one table: `routes.generated.ts` for a declaration without a parent, its parent's children table otherwise; hoisted redirect records are always in `routes.generated.ts` (§9). A route whose only children are redirect sources is a plain record without `loadChildren` or a children table, and a pruned ancestor emits nothing. Nothing opts out. No native route node is added, so Angular's matching, activation, guard and resolver dispatch, active-route reading and typed inputs are those of the same tree with `children` (§8 for the one difference a callback can observe). Angular evaluates a record's own `canMatch` before it loads its children, so a refusing route loads nothing below it, except on a server-rendered page with `provideActiveRouteHydration()`, where the browser imports the tables along the server's committed chain before client matching (§7 "Hydrated pages").

Each table imports only for its own records: the route copies they read, their own and their `..` winners' destinations, wherever those live, and the helpers they use. `routes.generated.ts` also holds `RouteTypes` for every retained primary-outlet declaration (a branch member is never the active route, §7); a copy or `..` winner destination that only `RouteTypes` names there is an `import type`. So no eager module value-imports a descendant's route copy: a route's descendants' records, copies, destinations and step modules load with the children tables below it, except destinations the application's eager code imports, each top-level record's `..` winner's destination chain and each hoisted redirect source's destination chain.

A branch root's record (§2 "Named outlets") carries Angular's `outlet: "<name>"` after its `path`, in whichever table holds it: `routes.generated.ts` for a root-level branch, its parent's children table otherwise, a pathless parent's included; its descendants are primary records in its own children table, with no `outlet`. Angular never matches a full-path empty route while its group has named children, so an empty leaf winner at a branch root's anchor (`/` below a root branch, `/products` below a `detail` branch) gets no `pathMatch: "full"` and its generated callbacks are spread as `callbacks(route, { onlyAtEnd: true })`: each canMatch adapter, the generated matching guard included, refuses before building any input when primary segments remain, so the leaf's callbacks run only where it ends the primary path (at `/`, `/(chat:…)`, `/products`, `/products/(detail:…)`), with their redirects and waits, and never on longer URLs. Every other empty leaf keeps `full`. A hand-written native named route anchored at a generated empty leaf leaves that leaf `full`, so the primary renders empty there: declare the branch with `outlet`. Angular SSR picks a server route by pathname, so named-outlet URLs reach the `**` server route, and an app needs a root catchall declaration (its not-found page) for them to render instead of answering 404; `serverRoutePath` rejects a branch destination (`serverRoutePath(<id>): a destination in outlet <name> has no server path; named-outlet URLs match the ** server route`). `RouteTypes` lists primary-outlet declarations only.

A sibling pathless group's record (§10) spreads `owned(<claims>, callbacks(route))`, or `owned(<claims>)` when it has no callbacks, in place of `callbacks(route)`: the group's claims as literal arrays, deduplicated and sorted, with `":"` for a param and a final `"**"` for a catchall's rest, under `translateSegments` each static word as its `$localize` message (§11 "Translated segments"). It adds no native route node and keeps `path: ""`, so the group's injector, layout, `loadChildren` table and identity are as for any empty-path record (§8 "Matching"). Angular SSR's route extraction walks `path: ""` records without consulting `canMatch` and keeps the first among equal paths, so it attributes a shared path such as `/` to the first group in table order: an SSR response for `/` carries a `modulepreload` hint for that group's layout chunk, which the browser downloads and never evaluates; the group's children table isn't hinted, and the browser loads it neither for hydration (the seed holds only the rendered chain, §7) nor for recognition. Those are four different kinds of load: extraction, preload hints, hydration-seed imports and recognition imports. A group that has callbacks value-imports its route copy into the table that holds it, so the copy evaluates with that table, at startup for a root group, whichever URL is requested.

Preserve explicit authored nesting/local decoded paths, translate whole scalar `$name` segments to Angular `:name`, and terminal `$name[]` to native `**`. Every record, redirect records included, spreads the facts helper of `@loozo/angular-router/_generated` with its own destination and, for a retained declaration with one, its `..` winner's destination: a private, frozen own symbol property that Angular's shallow record copies (standardization, `resetConfig`, lazy `loadChildren`) keep. It is the record's identity; `data` carries only authored static data. A record whose route copy declares resolvers also gets, from the generated callbacks, a private own symbol property holding the frozen list of the authored resolver keys, kept beside the native resolve map, never on it.

Colocated default standalone components use lazy loadComponent. Componentless ancestors with children are valid. Ordinary componentless leaves fail generation before writing. Apply §9 redirect pruning/ordering and §6 shared-path matching. A table imports a route copy at runtime only where one of its records reads it: native options, top-level redirects, and the guard/resolver/title adapters and the generated matching guard (§8) every non-redirect record receives when it has local path params or it or an ancestor declares `search`, and the extension stamp (§2) of every non-redirect record an extension's factory made. `routes.generated.ts` imports the other retained primary-outlet copies with `import type`, for `RouteTypes` alone. Each table imports its records' destinations and each distinct `..` winner's destination of its records, and no declaration module. Page components remain lazy; a route's error component loads with the table holding its record (§7 "Error components"). Forward providers/static data/native canDeactivate/rerun policy/error component to Angular, and a static title; adapt a title callback like a resolver (§8). Static data remains observable through native Angular snapshots/data; the package handle's data signal holds **effective resolver keys only** (§8), never static data. Do not assign authored parsed-input resolve maps directly to native Angular Route.resolve.

Generated TypeScript and emitted relative JavaScript specifiers must typecheck/build under the Angular application consumer environment. Authored `.ts` imports use emitted `.js` specifiers. Root-package NodeNext consumer checks and Angular application/Bundler checks are distinct; admitting a source extension does not imply every module-mode or CommonJS interoperability combination. Generator bootstrapping tolerates missing/removable stale per-route files at their known generated locations for admitted declarations, including a `destination` imported by application code or a redirect. This is not permission for arbitrary unresolved imports or references to undeclared/unadmitted generated targets. This is private analysis behavior needed to generate an application's first outputs, not a public graph option.

Codecs and resolver dependencies may be eager. No generated module reads an imported binding while it evaluates, except a route copy reading its own destination and its parent's route copy, which initialize first, and `routes.generated.ts` and the children tables reading route copies and destinations. A children table evaluates only through its loader, after the tables above it; its records' parents' copies are already initialized, or initialize first in the same dynamically imported closure. §10's copy rules keep application modules from closing an initialization cycle through a generated module, for the reference forms and file formats §10 scans; a cycle through anything else is not promised safe.

Adding or removing an independent declaration (one that no other declaration names as its `parent` or redirect target) that changes no existing `..` winner changes only its own pair, the table that holds its record (and, when its parent thereby gains its first or loses its last retained child, that parent's record in its own table, and the parent's children table appears or goes stale), and, for a primary-outlet declaration, `RouteTypes`' lines in `routes.generated.ts`. A branch root that becomes the first or stops being the last at its anchor also changes the record of the anchor's empty leaf winner, when there is one (its `pathMatch` and its callbacks spread, above), in the table that holds it. One that becomes or stops being a `..` winner also changes the route copies of the declarations whose winner it becomes or stops being, and every table holding their records, `routes.generated.ts` included. Every other per-route file and table, every destination file included, keeps its bytes. A declaration below a sibling pathless group also changes each enclosing group's record (its claims) in the table that holds it, often `routes.generated.ts`. A redirect source isn't independent in this sense: its hoisted record is in `routes.generated.ts`. Shared information belongs in `routes.generated.ts` rather than requiring every per-route file to repeat the entire graph. Its helper export names/representation and overall module organization are not prescribed. Deep trees may retain quadratic relationship counts; no universal byte-count target is imposed.

### Per-route copies

Both per-route files are copies of the declaration's final text (after filesystem synchronization, §12), line-aligned with it: line *k* of each copy is line *k* of the declaration, with LF line endings and no BOM. A generated tail follows the declaration's last line and ends with the ownership marker. Edits replace spans of the declaration in place: a removed span keeps its line breaks, and a line left with only whitespace becomes empty, so stack traces and copy diagnostics (§10) point at the declaration's lines.

- **Destination copy.** The default export becomes a local constant; the root call becomes a destination definition with the authored path and URL facts as written; every step is removed; the parent default import becomes an import of the parent's `destination`. Only the imports and top-level statements the path and facts reach are kept; everything else is removed, side-effect imports and top-level effects included. It never evaluates a codec.
- **Route copy.** The default export becomes a local constant; the root call becomes a route copy of the declaration's factory (the authored binding, so an extension's runtime and contributed steps carry over) built from its own destination and its parent's route copy, and its URL facts are removed; `serverOnly` contributed steps (§2) are removed; every other step stays byte for byte. The parent default import becomes an import of the parent's `route`. Liveness: imports and top-level statements reachable only from removed parts (the facts, and stripped steps' type arguments and arguments), to a fixpoint, are removed. Whatever the kept steps, the factory, the parent binding or authored top-level code outside the default export reach stays, including side-effect imports and top-level effects. A top-level statement that binds several names stays whole when any of them is kept.
- **Tail.** The router helper imports, the own and `..` destination imports, and the exports `destination`, or `route` and `injectRoute`, as export aliases of `routegen$`-prefixed locals (§10 reserves the prefix), so authored names never collide with them. A route copy typed from its declaration (§2) also has its erased own-declaration import.
- **Launch mode.** Launch discovers with `discoverLaunchRoutes` in the `_generation` seam: the router's own discovery of the one scan directory, which also admits Launch's server aggregate to the import rule (§10) and validates it as a generated file. Discovery recognizes route declarations only; Launch reads its steps from them.
- **Extension descriptors.** Launch's generation (`emitLaunchRoutes` in the `_generation` seam, which also takes `{ translateSegments }` and re-exports `validateLocales`, `segmentMessage`, `Localization` and the builders' `localization` normalizer as `projectLocalization`, so Launch localizes exactly as §11 does; and, for the locale table §12 and §13 define, `LocaleWords` (what `validateLocales` returns), `projectI18n`, `localeTable`, `localeTableWarnings`, `withLocaleTable`, `changedTableWarning`, the reserved-key check as `checkLocaleTableDefine`, and `LocaleTable`, so Launch's builders define it exactly as the router's do; `isInertFileEvent`, so Launch's serve builder skips exactly the watcher events §13 does; and `watchConfigInputs` with its `ConfigWatch` handle, so it checks exactly the config inputs §13 does) supplies, per declaration, the copy's `own` data, written as a JSON literal its root reads; type descriptors `{ name, type, from }`, each emitted on every extension route copy as an exported type `<name>` = `<type><typeof route>`, with `type` imported type-only from `from` and the alias declared under a `routegen$` local name, so `<name>` can match a binding the declaration keeps; and member descriptors `{ member, type }`, each a `readonly <member>: <type>` that the copy's `injectRoute()` handle type and its `RouteTypes` entry (§6) add. A redirect copy gets the type exports but no `injectRoute`. The router emits what it's told and doesn't know the names.

A route copy is a genuine route whose canonical identity is its destination; its parent must be the parent declaration's route copy, whose destination is the destination's parent. Generated bytes beyond this shape are unspecified (§1).

### Translated segments

With `translateSegments` (§12), each destination copy passes, after its id and on the root call's line, one `$localize` message per local static segment of its declaration. A message's id is `route.segment.` followed by the segment's canonical text, percent-encoded with `encodeURIComponent`; its meaning is `URL path segment` and its description `One segment of page URLs, without "/". Changing it changes links and bookmarks.` So a word has one message, translated once for the whole tree, and its id survives file moves. Angular's inliner replaces the messages per locale in browser and server bundles, lazy chunks included, so each build's destinations hold that build's words (§3, §5, §6).

Every record whose Angular `path` holds a static segment reads it from its destination: its local segments, or a hoisted redirect's effective ones. Records whose path has only parameters, catchalls or nothing keep their literal `path`. The route copy, `RouteTypes`, ids, `..` winners and selectors stay canonical.

Generated bytes depend only on the authored sources and the option, never on a translation catalog, so check mode stays deterministic. Without the option the output is byte for byte what it is without this feature. The locale table `localeUrls` reads (§5, §12) isn't a generated artifact: the builders compute it in memory from the catalogs and define it per build, so a catalog edit changes it and no generated byte.

`@angular/build:extract-i18n` finds the route messages in the generated destination copies on disk, which the browser build reaches, lazy children tables included. After adding a route with a new word: run `ng build` (or keep `ng serve` running), which writes the new copies, and, under `i18nMissingTranslation: "error"`, fails in Angular naming the new `route.segment.*` id; run `ng extract-i18n`; translate the unit; build again.

### Ownership and filesystem effects

Exact markers, on the first line of `routes.generated.ts` and of each `children.generated.ts`, and on the last non-empty line of the per-route files:

```ts
// @loozo/angular-router routegen: owned routes.generated.ts
// @loozo/angular-router routegen: owned children.generated.ts
// @loozo/angular-router routegen: owned destination.generated.ts
// @loozo/angular-router routegen: owned route.generated.ts
```

In Launch mode, Launch's markers are owned too: `// @loozo/angular-launch: owned server.generated.ts` on the first line of its server aggregate, `// @loozo/angular-launch: owned redirects.generated.ts` on the first line of its redirect word table, and two retired ones, for the `rpc.generated.ts` and `context.generated.d.ts` an earlier Launch wrote, which no generation emits any more and which are kept so a marked leftover is found and deleted as stale.

Only the corresponding exact-name marked generated outputs at the configured global or colocated locations may be replaced/removed. In explicit mode, never create, scaffold or rewrite authored `defineRoute` files, even when a configuration file is missing. Filesystem mode (§12) may seed and surgically synchronize editable declarations after combined preflight. Neither mode ever automatically removes authored definitions. Necessary generated typing helpers may live in the already owned artifacts; they are not source-file scaffolding. Do not use a directory-wide cleanup or require an ownership manifest. Never overwrite an unmarked expected-path collision. Leave unrelated files/directories intact.

Output directory must be disjoint from every scan root. Reject unsafe/symlink output paths and unmarked collisions. Preflight source-validation failures, all matching overlaps, leaves, ownership, and paths before output modification. A failed preflight must leave all previous output bytes unchanged.

Do not rewrite byte-identical outputs or change their mtimes. Outputs are written with LF line endings. A marked output whose only difference from the desired bytes is every LF written as CRLF, as Git's `core.autocrlf` checks text files out on Windows, is owned (its marker line may end in CR) and current: neither rewritten nor drift in check mode. Remove stale marked per-route files after authored declarations disappear, a stale marked children table when its route loses its last retained child or disappears, and stale global artifacts when no longer needed. When no authored routes remain, remove marked stale artifacts, not unrelated content. Stale generated files can be removed even when their old authored imports are broken.

Changes may be published by individual file replacement, not an atomic all-output transaction. Interruption may leave mixed versions; a successful rerun repairs them. Preserve no promise of rollback or whole-directory atomicity.

### Angular build/serve entry points and CI

```sh
ng build app                    # generate, then official application build
ng serve app                    # watch/generate, then official dev-server
ng build app --configuration ci  # application companion configured with check: true
```

The CI configuration belongs to the consumer's application-companion target. `check` is read-only, including cleanup: missing, changed, stale artifacts and generation errors fail before delegating to Angular. Coexisting drift reports priority **changed, then missing, then stale**. Diagnostic wording and removed CLI stdout/exit conventions are not prescribed; §12 and §13 prescribe the builders' output channel. Hand edits to marked files are drift and are replaced in normal write mode.

Package build/check/test/typecheck/SSR verification scripts run in the workspace's pinned environment. There is no `routegen`/`build:routegen` script, CLI packaging/prepack protocol, or standalone generation command.

Angular's `@angular/build:unit-test` and `@angular/build:extract-i18n` builders may name the application companion as their `buildTarget`. They read its options directly and run neither generation nor check, so they consume the generated files already on disk; the package adds no companion for them. The unit-test builder's unsupported-builder warning is expected.

Maintain and commit generated outputs with authored definitions; check them in CI. Check compares against the generator's own deterministic output. Any release, a patch included, may change generated bytes, so regenerate and commit after upgrading.

## 12. Companion application builder [B]

Builder name: `@loozo/angular-router:application`.

Options are the router options below plus `@angular/build:application` options, which pass through unchanged. Configure ordinary Angular options inline on this target; there is no separate official target. The builder schema is generated at package build from the installed `@angular/build` application schema plus the router options (`scripts/builder-schemas.mjs`), keeping Angular's defaults, required options and `additionalProperties: false`; a test fails when the committed schema is stale.

- Required nonempty `tsconfig: string`.
- Required `scanDirectories: string[]` containing exactly one nonempty string, in both modes.
- Required nonempty `outDirectory: string`.
- Optional `check: boolean`, default false.
- Optional `translateSegments: boolean`, default false. Every static segment becomes a `$localize` message (§11), translated per Angular localize build. It needs `@angular/localize` (an optional peer) and `@angular/localize/init` in the build's `polyfills`; generation fails naming the missing piece. The route and application tsconfigs need `"types": ["@angular/localize"]`; a copy's `TS2304` for `$localize` says so. Launch's builders offer it too, passing it to `emitLaunchRoutes`; Launch's README owns that behavior.
- Optional `autoDefineRoutes: false | { filename?: string }`. Omitted or an object selects editable filesystem definitions (filesystem mode), seeding `filename`, default `route.ts`; `false` selects explicit mode: no seeding or synchronization, and authored paths and parents alone determine the tree. No additional nested keys. Filename must be a simple implementation `.ts` basename, not `.d.ts`, traversal or any generated artifact filename. It affects only new seeds, not discovery or renaming.

### Editable filesystem definitions

The single scan root anchors path `''`; there is no separate root setting. An included directory, the scan root included, is a record exactly when it contains an admitted page or an admitted declaration. Every other included directory contributes its path segment to the records below it instead. The scan root and `+dirname` contribute `''`; any other included directory contributes its basename. A record's parent is its nearest record ancestor, or none when it has none (in particular, top-level records have no parent unless the scan root has a page or declaration). Its path joins, with `/`, the nonempty contributions of the directories from just below that ancestor (or from the scan root) down to itself: with a `$package` record, `$package/guide/$guide/page.ts` and no page or declaration in `guide`, the record's path is `guide/$guide` (Angular `guide/:guide`) and its parent the `$package` declaration, as explicit authoring would write it. The accumulated path must satisfy §3; a violation, such as a page-less catchall directory with descendants, fails before writes. A `-dirname` is transparent: never a record and no path contribution; descendants remain eligible and attach to the nearest record ancestor. A page-less directory gets behavior (guards, resolvers) only from an authored declaration there, which makes it a componentless record; Angular then also matches its bare URL when no child matches, and @angular/ssr prerendering enumerates it like any other route. A `+dirname` record with children is a sibling pathless group (§10) when it has at least one other empty-path record under the same parent, with or without children, such as a second group or a leaf `+home/page.ts` or `+index`; a `+dirname` record with children and no such sibling stays an ordinary pathless record. Each group's descendants reach it by URL, and a group's bare URL renders only through a descendant that ends it, such as a `+index`, or as the parent's page alone when there is none. At the root, with no `+index` and no root catchall, `/` renders the app shell alone: 200 under SSR, and a shell-only file if the app prerenders `/`. Nothing turns it into a 404. Helper/empty directories and page-less ancestors are not seeded. Transparent-node declarations remain authored files but cannot create records; URL facts other than `parent`, any step, and pages there are rejected.

Admission remains content/provenance-based direct default `defineRoute` chains and genuine standalone default Component classes, intersecting native tsconfig implementation `.ts` roots with the scan. Any admitted declaration in a directory prevents a duplicate seed, irrespective of filename. Seeds must themselves be admitted by native tsconfig files/include/exclude/extension semantics, including explicit files and wildcard includes through permitted external workspace-access aliases; reject excluded seeds before writes. Virtual directory lookup uses the same restricted access-prefix equivalence, while native matcher result spellings remain subject to source canonicalization/auditing. Source/root suffix links never gain admission by unrestricted realpath.

Seed only record directories without a declaration: an ordinary editable declaration with the record's path, the nearest record's declaration as a default import named `parent` (omitted without one) and a local `stringParam` codec for every param in the path, per element for splats; empty URL facts are `{}`, and a seed has no steps. Synchronization edits only the path literal and the URL facts object, so chained steps keep their bytes. Existing declarations' paths/parent fields/imports track moves, renames and records appearing or disappearing above them. Use surgical AST-position text edits; preserve other authored bytes/expressions, including UTF-8 BOM, CRLF and statement-bound directives. Insert new static imports after the module's last top-level import declaration, following that import's same-line trailing comments unless one of them spans lines or carries a directive (then directly after the import), so every existing statement/comment attachment, shebang and triple-slash reference is preserved. Name a new parent binding `parent` when no identifier in the module other than a property name uses it, otherwise `filesystemParent` (suffixed until unused). When an existing parent import still resolves, but to another file than the nearest record's declaration, and its default binding has no other references, retarget the specifier and rename the binding to `parent` if free, writing the property as shorthand when only whitespace separates key and value; an unresolvable parent specifier is only retargeted. When the declaration's params already match the path the directories give (a direct inline object with explicit unique keys equal to the path's params, or no `params` property for a path without params), rewrite only the path and keep the params bytes. Otherwise, a one-local-param rename (one param removed, one added) on a direct inline params property preserves its codec expression; pure additions (no param removed) onto an inline params object whose keys are exactly the old placeholders, through direct or shorthand properties, keep every existing property and append a `stringParam` codec per added param; a declaration without params gains a `stringParam` codec per added param. An added codec reuses the module's existing non-type `stringParam` import from `@loozo/angular-router` under its local name, else imports it as `stringParam` when no identifier in the module uses that name, otherwise as `filesystemStringParam` (suffixed until unused). Reject other opaque/ambiguous codec changes (including removing an authored local codec) rather than guessing or replacing custom behavior. That diagnostic, including the one for params that aren't a direct inline object with explicit keys (opaque maps, spreads, computed or numeric keys) and for a rename whose old param is a shorthand property, names the declaration file, the path the directories give, the params removed/added and, for unreadable params, why; it directs the fix to that file's params (removing them for a path without params, writing each as a plain `name: codec` property when unreadable or shorthand) or the directory layout, never to the builder-owned path. The builder never removes a params key itself. Do not rename application callback accesses/navigation inputs. Do not change parent-import bindings used elsewhere; count actual binding references, including shorthand values, not property/member names. Retain valid imports or reject unresolvable stale imports with unrelated uses. Inspect leading trivia, the entire removed parent import/property syntax and adjacent retained trivia through the next actual token/EOF for scoped directives, including compiler-control pragmas (`@ts-check`/`@ts-nocheck`, triple-slash reference/AMD and JSX pragmas); reject deletion rather than transferring suppression, activating a dormant pragma at module start or deleting authored rationale. Retain ordinary comments while removing obsolete syntax. Collect replacement text only from within the removed span; adjacent retained trivia is validated, never copied or deleted. Never delete editable definitions automatically.

Synchronization edits only a declaration's path literal, `parent` and params, so an authored `outlet` keeps its bytes through moves; seeds never write one, and directory names carry no outlet convention.

Plan all source edits/seeds in memory, then discover/resolve/compile the combined authored/generated overlay. Preflight source syntax/provenance, admitted declaration-file semantic diagnostics, tree/catchall/componentless-leaf/matching/redirect rules, application module references and generated copies (§10), safe paths and generated ownership before any source or generated write. Do not take over whole-program semantic, compiler option/global or Angular/template validation; unrelated type errors may fail the official native build after structurally valid source/generated files have been published. Check mode validates the identical desired result and reports source/generated drift without writes. Write only changed bytes, preserve byte-identical ns mtimes, check stopped before the synchronous publication section, and retain serialized/coalesced native watch/repair/stop. No ownership manifests, sidecars, CLI, public graph API or runtime additions.

Resolve config/out relative to the Angular workspace root or as absolute paths. Resolve scans against the route config directory. Architect validates router and Angular options against the combined schema before the builder runs, so invalid options fail before outputs are touched. Reject resolved `watch: true`.

With `translateSegments`, the builder reads the project's `i18n` configuration through Architect's project metadata, as Angular's application builder does: `sourceLocale` is a string or `{ code }` (`en-US` when omitted), each `locales` entry a file, a list of files or `{ translation }`, and file paths are joined to the workspace root. It passes them, with the resolved `polyfills`, to generation. Generation loads each locale's catalogs with the public parsers of `@angular/localize/tools` in Angular's order (ARB, JSON, XLIFF 1.2, XLIFF 2, XTB): the first parser whose analysis accepts a file parses it, diagnostics a parser returns are ignored as Angular's loader ignores them, a later file wins on a duplicate id, and a file no parser accepts, or a parser that throws, fails generation.

A localized build (`localize: true` or a nonempty list, with or without `translateSegments`) gets the locale table `localeUrls` reads (§5): after generation and before scheduling Angular, the builder adds `define.loozoRouterLocales`, the JSON of `{ locales: [{ code, baseHref, words }] }`, to the passthrough options, merged with the application's own `define`. Angular's esbuild replaces the identifier in package code in every browser and server bundle of every locale, lazy chunks included, so prerendering and live rendering read the same constant. `define.loozoRouterLocales` is reserved: an application `define` with that key fails option validation with `define.loozoRouterLocales is reserved by @loozo/angular-router: remove it from the build options`, before generation.

- **Locales:** every locale configured in `i18n`, whatever `localize` selects, so separately built locales give reciprocal lists: the source locale first (a string, `{ code, baseHref, subPath }`, or `en-US`), then `i18n.locales` in `angular.json` order, as Angular's i18n options order them.
- **Base hrefs:** each locale build's `<base href>` as Angular 22.3.0's `getLocaleBaseHref` computes it, reimplemented from its source: the locale's `baseHref` (only in the `{ translation }` form), else its `subPath` (the code by default) and `/`, joined under the build's `baseHref` with Angular's URL joining (an `http(s)://` base stays absolute; a relative one stays relative). Where Angular gives none (an empty suffix), the table uses the build's `baseHref`, else `/`; an `index.html` base other than `/` without a `baseHref` option isn't read. A relative base logs one warning per locale naming it: its `localeUrls` URLs are relative too. A test compares the table's bases with Angular's private code for every shape.
- **Words:** with `translateSegments`, each locale's text for each route word from the catalogs generation validated, only where it differs from the authored word, sorted by authored word, as `[word, text]` pairs (a word may be `__proto__`). Without it, no words.

Run generation/check before scheduling `@angular/build:application` by name (Architect `scheduleBuilder`) with the passthrough options and the current target. Generation/check/validation failure prevents the official build: the builder logs the failure, with every diagnostic the generator collected, through the Architect logger and returns `{ success: false }` rather than throwing. Forward the first native BuilderOutput unchanged, including failure fields; propagate official exceptions. Stop the official run after the first output, including one that otherwise remains alive. This is one-shot, not watch mode. Consumer supplies Angular's normal application build dependencies. No experimental `@angular/build` API or `@angular/build/private` is used; the locale table's `define` is a public application option.

## 13. Companion serve builder [S]

Builder name: `@loozo/angular-router:serve`.

Options are `@angular/build:dev-server` options, from the workspace configuration or the command line, which pass through unchanged, plus the ones below. The builder schema is generated at package build from the installed `@angular/build` dev-server schema (`scripts/builder-schemas.mjs`), replacing its `poll` with the one below and keeping Angular's other options, defaults, checks and `additionalProperties: false`, so the CLI offers every option as a flag and rejects unknown ones; a test fails when the committed schema is stale. Architect applies the copied defaults before serve runs; they equal the defaults the dev server applies to the forwarded options itself, so they change nothing it sees.

- Required `buildTarget`: a target using `@loozo/angular-router:application`, resolved as Angular's dev server resolves it. Router options come from that target and are not repeated. Angular's dev server reads the target's options itself and validates them against the companion schema, which carries Angular's application defaults and checks. Reject a resolved `check: true`: serve always writes. Serve never executes the companion application builder.
- Optional `poll: number | false`. Omitted, serve passes `poll: 1000` to the dev server; `false` passes none, so the router adds no default and Angular's own configuration applies (native file events unless the build target sets `poll`). Other values must be positive milliseconds. The CLI flag accepts milliseconds only; `false` is workspace configuration. `0` is rejected: Angular 22.2.2 turned any numeric `poll`, zero included, into chokidar polling with that interval, so it can't mean native events.

1. Architect validates the options against the builder schema before the builder runs. Validate the build target before watching or generating.
2. Start watching configured route roots, and checking the config inputs (item 5) and with `translateSegments` the build target's translation files, **before initial generation** so initial edits are not missed.
3. Initial generation must succeed before scheduling `@angular/build:dev-server` by name with the passthrough options and the current target. A failed initial generation is logged, emitted as `{ success: false }`, and completes the builder without starting the dev server.
4. Forward continuous native success/failure outputs unchanged.
5. Add/change/remove implementation files in route roots trigger serialized, coalesced regeneration; output safety/ownership rules remain. A pass starts once changes have been quiet for 150 ms: each accepted signal, a watcher event serve doesn't skip or a change the config check below sees, restarts that delay; an event pending when the initial generation starts is covered by it. An `add`, `change` or `unlink` event triggers none when it arrives while no pass runs or is queued, its path's lower-cased extension is `.html`, `.css`, `.scss`, `.sass`, `.less`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`, `.svg`, `.ico`, `.woff`, `.woff2`, `.ttf`, `.otf` or `.md`, the path isn't a translation file or the file one resolves to (compared without case; while one doesn't resolve, none is inert), `lstat` finds a regular file there (or nothing, for `unlink`), and, checked again after the `lstat`, serve isn't stopping, no pass runs or is queued and the last completed pass succeeded (`isInertFileEvent` in the `_generation` seam holds the path rules). Generation never reads such a file as a source: it runs no template compiler, and TypeScript resolves an import of one to a declaration (a `.d.<ext>.ts` companion or a `declare module` wildcard), never to the file. A generation tsconfig, or a config it extends, with one of those extensions is still covered by the config check below. A write of an owned per-route file (`destination.generated.ts` or `route.generated.ts` whose last non-empty line is its marker, LF or CRLF) triggers none; an unmarked file with either name does. An event for a filesystem definition the latest pass seeded or synchronized triggers none when, as the 150 ms delay ends, every other signal in that delay was one that triggers none and the path is still a regular file, not a link, holding exactly the bytes that pass wrote; otherwise the delay runs a pass, so an edit right after the write regenerates even when the watcher reports no event of its own for it. The record holds the latest pass's writes only: it's cleared when a pass starts, so a pass that writes nothing or fails leaves none. The stale owned files a pass removes aren't recorded, so a move that leaves its old parent's children table stale runs a second pass for that removal. Skipping the pass after a filesystem-definition write leaves two changes unreported until the next signal, which that pass would have reported: a seeded `destination.generated.ts` displacing a hand-written `.d.ts` of the same stem that a wildcard include admitted, and an ancestor of the scan root replaced by a link. The watcher watches the scan root only, without following links. Wherever each lives, inside the scan root or not, serve checks the generation tsconfig, every config its `extends` chain resolves to (a package base at the path TypeScript resolves), every package manifest the parse reads to resolve a base (its `exports` choose the file, even under `node_modules`), every other path it probes outside `node_modules` (a candidate that would join or change the chain once created), the workspace's `package.json` and the translation files every 500 ms (`watchConfigInputs` in the `_generation` seam), which also catches what the watcher misses inside the scan root (a rewrite that keeps the modification time, an event skipped as inert). An input inside the scan root can reach both: the signals share the 150 ms delay, so it normally runs one pass; a signal whose delay ends after a pass that already read the change started runs one more, such as a save during a pass, so a failing edit can log its error twice. A path's state is what `stat` reports through every link in it: absent, a directory, another entry, an error code, or a regular file's device, inode, size, modification and change times; a check that finds any path's state changed runs the same regeneration as a watcher event, after the 150 ms settle. Before every pass, the initial one included, serve lists the inputs again and takes their state as the baseline, from the stat taken just before TypeScript read each file, so a pass's own read isn't reported again and a change after it is; an input no longer listed is no longer checked, unless it's absent: one deleted (an installed base or a package manifest TypeScript can't read while it's missing) stays checked, so its return runs a pass. The listing never opens a path that isn't a regular file and ignores the parse's diagnostics, which generation reports. Not covered: a package-local `#imports` alias to a base in a directory that doesn't exist yet (TypeScript checks the directory before probing the file; the next tsconfig or `package.json` save picks it up), dependency reinstalls that move a package base, and other imported files outside the scan root.
6. Later generation errors are logged but leave the server running for the next repair. Angular may serve the prior successful build or display a build error after removed inputs.
7. Changed consumed generated files permit Angular rebuilding without server restart. Byte-identical outputs are not touched and do not guarantee an Angular rebuild.
8. Stop closes the watcher, the config check and the official run. Edits after stop cause no generation writes.
9. A translation file edit runs the same regeneration. Generated bytes don't depend on catalogs (§11), so only the per-locale check (§10) runs, and that pass logs its result (a failure, or nothing once repaired). With no pass running, it starts 150 ms after the last accepted signal (item 5): for a change only the 500 ms check sees, after the next check and the same delay, about 0.65 s at most when timers run on time and no later signal restarts the delay; a catalog inside the scan directory can reach both. Angular's dev server reloads catalogs on every rebuild but doesn't watch them as catalogs: a catalog edit reaches the served app at the next Angular rebuild, which is the next source save or restart unless Angular watches that file for another reason (imported, an asset, or under an `NG_BUILD_WATCH_ROOT` root), in which case the edit itself triggers it. Until that rebuild the previous catalog is served. After a rebuild with a bad catalog, a collision lets the earlier record win, and a translation that breaks §3's rule throws when its destination evaluates, so server rendering fails and the app doesn't boot; repairing the catalog clears the log at its pass and the app at the next rebuild. A multi-locale `localize: true` dev server serves unlocalized source, so serve a single locale (`localize: ["de"]`).

10. A single-locale dev server (`localize: ["de"]`, the one case Angular's dev server localizes) gets the locale table (§12) in the dev server's `define`, which Angular merges into the build target's. Its output is flat, so the served locale's base is the build's `baseHref`, else `/`; every other locale keeps its production base, which this dev server doesn't serve: its links reach the served locale's catchall, so check other locales in a production build. Any other `localize` gets no table. `define.loozoRouterLocales` is reserved in the serve options too. The dev server reads its `define` once, at its start, so the table is the initial generation's: after a catalog edit or a new route word, served pages change at Angular's next rebuild, but `localeUrls` keeps the started words, and a new word uses its authored text in every locale. When a later successful pass gives a different table, serve logs `Locale words changed (<ids>). Links from localeUrls keep the words ng serve started with until you restart it.`, naming up to three `route.segment.*` ids with their locales, once per distinct table; a pass back to the started table logs nothing. Restarting `ng serve` defines the new table; the define is part of Vite's prebundle configuration, so the prebundled package is rebuilt with it.

An authored file may temporarily trigger Angular's rebuild before generation publishes updated output. No whole-build transaction, automatic restart, watch guarantee for arbitrary imported helper/config changes, or custom application build pipeline is added.

## 14. Required real application proof [V]

Use one self-contained Angular 22.3.0 application with generated configuration, standalone pages, official application build/dev-server, provideRouter, provideClientHydration, and official Angular SSR server rendering. Do not introduce a custom renderer or add blocking initial navigation to the shared hydration configuration. The shared configuration installs `provideActiveRouteHydration()`; its app initializer awaits only the seeded chain's children-table imports before root creation, starts no navigation, and Angular's initial navigation still starts from its bootstrap listener.

The application has:

- Componentless `teams/$teamId`, owning numeric teamId and optional numeric score; its children load from its children table (§11).
- Child `items/$id`, numeric id and local item resolver consuming inherited parsed values through a deterministic application provider; its only child is a redirect, so it stays a plain record.
- Child alias `old-items/$id` redirecting to item's destination, dropping search/fragment, and `items/$id/legacy` redirecting to `handle-only/$id`: both redirect sources with a parent, with lazy copies (§9).
- Typed direct/alias links and a query-only score link.
- Separate DOM evidence for parsed values and local resolved item data.
- A handle-only route without resolvers, whose search includes a `withFallback` key.
- Explicit paramsOrQueryParamsChange on item for query-only resolver reruns.
- A pathless top-level `+workspace` layout owning `workspace: retained(stringParam)`, whose page links from its own handle; below it an `orders` list (a string-keyed resolver) and its `$id` detail; a `login` page outside it; an unrelated `other` with `other/child` that owns a retained `workspace` of its own. The shell links to order 7 and to `other/child` from `injectActiveRoute()`. Resolver keys on these records are strings, so the server's seed stands.
- Remembered keys on that layout and list: `+workspace` remembers `density`, `orders` a retained and remembered `pageSize` (fallback 20) with string-keyed resolvers and a dynamic title that rerun on query-only changes (`paramsOrQueryParamsChange`), and a link that clears it; the orders resolver reports page size 99 missing and `orders/$id` order 42; a typed `old-orders` redirect into `orders`; a `not-found` page. The config installs the README's cookie adapter with `provideSearchStorage()` and its not-found handler with `withNavigationErrorHandler`.

Required observations:

| Action                                        | Expected result                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| SSR `/teams/7/old-items/7?discard=1&score=42` | HTTP 302, Location `/teams/7/items/7`                                                                        |
| SSR `/teams/7/items/7;teamId=999?score=42`    | Team 7, item 7, parsed score 42, matching local resolved data                                                |
| Separate SSR `/teams/8/items/8?score=43`      | Independent team 8/item 8/score 43; no cross-request leakage                                                 |
| SSR handle-only route                         | Parsed params, search and the search fallback rendered without any resolver                                 |
| Hydrate initial page in Chromium              | No hydration/browser errors; original parsed/resolved DOM nodes retained                                     |
| Click typed alias link to id 8                | Correct alias href; canonical target URL, parsed/resolved item 8, dropped query/fragment; no document reload |
| Click typed query-only score 44               | Parsed and resolved score update; pathname, component, host, article, and document identity retained         |
| Inspect browser bundle reachability           | No Node/tooling/compiler/build dependency leakage; component remains lazy                                    |
| Shell reading `injectActiveRoute()`           | SSR renders the active team/item; hydration keeps its node and text, never showing the shell's `undefined` state; the first read is the seeded handle, which the commit hands over; the alias click updates it |
| Client-only guard rejection, error or skip    | The shell shows the server's route, then the `undefined` state after the outcome; a later success at the same route gives new handles |
| Client-only guard redirect                    | The shell goes straight from the server's route to the redirect target, never `undefined`, keeping its handle |
| `NavigationEnd` listener, registered before the provider, navigating again | The nested same-URL skip reaches the provider before the first commit's `NavigationEnd`; the shell keeps the server's route and its seeded handle |
| Client-only parent `canMatch` refusal         | The shell goes straight to the catchall; the seeded table and route copy were evaluated, the table fetched once |
| Seed fallbacks (unknown id, invalid range, missing key, changed URL) | Today's sequence: the server's route, the `undefined` state, the committed route; a dev-mode warning except for a missing key |
| SSR resolver values JSON can't carry unchanged | A Date, BigInt, cycle or array with extra keys gives no seed and the page renders; a shared reference seeds as two copies |
| SSR `/teams/7/items/7/legacy`                 | HTTP 302, Location `/handle-only/7`                                                                          |
| Hydrate `/teams/7/items/7` in Chromium        | `teams/$teamId`'s children table is fetched once, preload hint included, and resolves before activation and stability |
| Inspect the initial browser closure           | No route copy below `teams/$teamId` and no children table                                                    |
| SSR redirect and catchall page in one group   | The ordinary redirect answers 302; the catchall page renders its other URLs                                  |
| SSR `/orders?workspace=acme`, `/orders/7?workspace=acme`, `/login?workspace=acme`, `/other?workspace=beta` | The seed carries `/orders?workspace=acme`; the page's, the layout's and the shell's order links and `..` keep `workspace=acme`, the `workspace: undefined` link drops it; login's link into orders and the shell's links from login have none; below `other`, only its own `beta` |
| Hydrate `/orders?workspace=acme`, click order 7, then login | The shell's first browser read, before any client success, has the server's hrefs; `/orders/7?workspace=acme` in one document; login's link has no workspace |
| Retained links before the first client commit, deferred and eager URL updates: A's first navigation held at its guard or resolver; redirected by A's guard to `other?workspace=beta`, or superseded by a click on it, with `other` held at its guard or resolver | Held A: the shell keeps `acme` from the seed. B pending: deferred, the browser still shows A and the shell keeps `acme`; eager, the browser shows B, neither the router state nor the seed matches, and the shell retains nothing. No link to A ever carries `beta`. B's constructor, before the first success, and every read after B commits: `other/child?workspace=beta`, the order link without a workspace |
| Remembered keys, built production server through Node's writer and the development server: SSR `/orders` with cookie `pageSize` 50; `/orders?origin=kept` with 99; `/orders/42?origin=kept` with 50; each again without the cookie | 302 `Location /orders?pageSize=50`, empty body, the unrelated cookie kept, no remembered write; 200 at 20, no `Location`, one deletion, 3 NavigationStarts, then 200 with 1; 404 not-found page, no `Location`, one deletion, 4 NavigationStarts, then 404 with 2 |
| Remembered keys, both servers, a test-only sequence in the copy: one render of `/orders?pageSize=50` with its cookie that commits 100 and then 50 again under `PendingTasks`; the store's own cookie adapter in one render of `/login` with stored 70 and an unrelated cookie: write 100, read, forget twice, read, write 50 | 200 at 50 with rows and title of 50, `Set-Cookie` 100 then 50 in that order, the unrelated cookie kept; reads of 100 and nothing, `Set-Cookie` 100, one deletion, 50, the request's unrelated cookie untouched. Chromium's jar ends at 50 with the unrelated cookies in both |
| Remembered keys, built server: `/orders?pageSize=50` with its cookie; stored `bad%zz` and `abc`; parallel 30, 70 and `abc`; `/old-orders`; two owners with 99; explicit `?pageSize=99`; explicit fallback | 200 at 50 and a seed of string-keyed data; no redirect, 20, one deletion; 302 to 30 and 70 and 200 for `abc`; 302 to `/orders?pageSize=50`; 200 with both deleted; 404 keeping the value; 200 forgetting it |
| Remembered keys, Chromium: cookie entry to `/orders`; the recovered `/orders?origin=kept` document; from `/login`, a click into orders with stored 99 | The document shows only 50, one client NavigationStart, the shell's link retains it, no errors; only 20, the cookie deleted, no client restore or retry; restore, retry and 20 on the client, the cookie deleted |
| Remembered keys, Chromium: in the hydrated `/orders?pageSize=50`, the clear link, then login and back into orders | 20 with `20 rows` and `Orders (20)`, the cookie deleted; back in orders, still 20 with the same rows and title, no restore |
| Remembered keys, Chromium, from `/login` with the caller's `state`, twice with `/login` between: `/orders/42` with stored 50; `/orders` with stored `pageSize` 99 and `density` | Restore, retry, then the not-found page at `/orders/42`, 4 NavigationStarts and the cookie deleted, then 2; 20 and the default density with the caller's state, both cookies deleted, 3 NavigationStarts, then 1 |
| Sibling pathless groups: SSR `/profile` and `/`, hydrate each | 200 in signed-in's layout, the seed only its chain, no authenticated table or guard in the browser; `/` hints authenticated's layout chunk, which downloads unevaluated, never its table; without an index, 200 with the app shell alone |

A built-browser proof in the navigation suite covers remembered keys beyond this app, with a recording storage adapter: each of a leaf, owner, ancestor (`always`) and `canActivateChild` guard returning true, false, a redirect or an error, with valid and invalid stored values, and latched until released (no storage operation while any guard is pending; refusals touch nothing); restores on entries whose owner, page and ancestor carry string, integer, `__restore`-named and symbol resolver keys and dynamic titles under four ancestor rerun policies (no authored call on the bare URL, each scheduled one once on the restored URL); a query-only clear inside the owner; a named-outlet branch whose `canActivate`, or the owner's `canActivateChild` for that branch only, refuses or requires the key (refused untouched, nothing read), and an accepting branch whose resolver and title run once on the restored URL; a refused child `canMatch`, a lone pathless owner whose children don't match and a sibling pathless group's page (no storage operation); RouterLink, `navigate` and `replaceUrl` history, the same with eager URL updates, and Back into an older bare entry; two owners redirecting to each other's bare URL; a pending restored resolver superseded by an independent entry, an unrelated refusal, an unrelated error and `abort()`; a restored attempt redirected back to the page it came from, which Angular skips, followed by a fresh entry that restores again and by an unrelated refusal and error that forget nothing; `__proto__`-named scalar and array keys restored as own query keys; an alias the codec accepts (`0x32`), stored and restored as `50`; a resolver with no data for the restored URL; and `"local"` storage. The lifecycle suite covers `currentSearchRestore()` in the same app: a recovered value with the caller's state, query and fragment, a page missing anyway, two owners, an explicit value, a stale view and idle reads; commit writes and forgets, a navigation started from `NavigationEnd`; a throwing `read`; a duplicate id in a lazily loaded child; a missing provider after an accepting guard, behind a refusing one and for a route without remembered keys; and blocked Web Storage.

A built-browser proof in the navigation suite covers routes with children beyond this app: a refusing `canMatch` that loads nothing below it on a cold visit; a cold typed-link entry through two nested children tables, fetched in turn after each `canMatch` and before the pages, with params, search, resolver data, title, root providers and `canActivateChild` counts unchanged; prototype-measured native results for denied roots, param roots, componentless roots, denied pathless children and descendant `canActivateChild` data; the §8 `children`/`loadChildren` difference for `canMatch` and `canActivate`; shallow and deep redirect sources with a parent, whose copies and their step modules load only on first use, without a children table, and fail one navigation on a codec or load failure; §9's redirect and catchall ordering; and the initial input modules: no children table, no descendant copy or step module, exactly the top-level copies that records read, and exactly the descendant destinations §11 lists. Its sibling pathless groups proof builds `+authenticated` (`inbox`, `settings`, a redirecting query-driven `canMatch` and an environment initializer) beside `+signed-in` (`+index`, `profile`), cold-visiting each URL: every URL renders in its owning group's layout, `/profile` calls no authenticated guard and requests no authenticated table while the initializer still runs, `..` from inbox renders signed-in's index, a catchall group frames not-found pages and catches a URL signed-in's guard refuses, and without an index `/` reaches a root catchall or commits an empty root outlet with no error; a `products` page with two groups below it and no index renders alone at `/products`.

Use server-safe resolver imports/providers and deterministic server/browser values. The local resolver may run independently on server/browser; there is no guarantee of one execution and no custom transfer cache. Keep handle-only SSR rendering separate from resolver-gated rendering so one path cannot mask failure in the other.

This is development-server Chromium proof, not production serving, cross-engine certification, nondeterministic hydration support, or a complete SSR framework.

### Named outlets proof

`examples/angular-router/outlets-proof` (`test:outlets`) is an explicit-mode SSR app with `provideActiveRouteHydration()`: a guarded `+home`; `products` (`sort`, and a `view` remembered in session storage through `provideSearchStorage("session")`) with a guarded pathless overview, `list` (`page`, and a browser-only resolver that holds the initial navigation on `hold=1`), a `detail` branch `item/$id` and a static `detail` branch `item`; a primary literal `products/(detail:item)` with a child; `teams/$teamId` with `list` and a `detail` branch; root `chat/$id` with a `settings` child, a chat `$rest[]` panel and a chat `files` path with a `$rest[]` child; `account` with a pathless layout holding `profile` and an `aside` branch `help`; redirects into chat, one keeping the query and fragment, and into the nested item; `plain`, `login` and a root catchall. The shell builds its links from `injectActiveRoute()`, first read in its template.

| Action | Expected result |
| --- | --- |
| `ng build --configuration ci` | Committed outputs are current |
| SSR `/products/list(chat:chat/7)`, `/products/(list//detail:item/3)(chat:chat/7)?sort=price`, `/(chat:chat/7)`, `/products/(detail:item/3)`, `/teams/4/(list//detail:item/3)(chat:chat/7)`, `/account/(profile//aside:help)`, `/(chat:a/b)`, `/products/%28detail%3Aitem%29`, `/products/(detail:item)` | 200 with every view, the active route the primary one, the seed's ranges within the primary path |
| SSR `/products%28chat:chat/7%29`; `/old-chat/7`, `/old-chat-kept/7?x=1`, `/old-item/3?sort=price` | The not-found page; 302 to `/(chat:chat/7)`, `/(chat:chat/7)?x=1` and `/products/(detail:item/3)?sort=price`; `/old-chat/7`'s location renders home beside chat |
| Hydrate `/products/(detail:item/3)(chat:chat/7)` and `/(chat:chat/7)` | Every server node retained, no errors or seed warning, active text constant |
| SSR `/products/(list//detail:item/3)` with `view` in session storage, hydrate | The server renders the default view; the browser's initial navigation restores `?view=table` with both outlets, every server node retained, the first client render reads the seeded active route before any commit, one document, no errors |
| `?hold=1`: server, first client render and commit | Identical hrefs for the shell's template and computed open, close and list links |
| Each of those links clicked before the commit | The composed URL commits, nodes retained, no errors; the entry the commit creates links and navigates |
| Link to item 3 from the list; page 2; open chat 8, next chat, next item, close chat, reopen, plain, exact `/plain`; Back and Forward | Each URL as the composition table (§6) says, views kept in place, `RouterLinkActive` on products, each history entry restored, one document |
| Close from `settings`; `to: chat, close` over the chat catchall; close with nothing open (default policy); the `"reload"` control | Whole branch closed; closed; URL unchanged and `false`; `canMatch` runs again, home's resolver doesn't, `true` |
| Close the team detail at `/teams/4`; `teams/5/list` from `/teams/4/(list//detail:item/3)(chat:chat/7)` | `/teams/4`; detail dropped, chat kept |
| Direct `/account/(profile//aside:help)`; open and close `aside` from `profile` | Layout, profile and help; `/account/(profile//aside:help)`; `/account/profile` |
| Guarded home and overview, redirect and async, on `/products/list`, `/plain`; then on `/(chat:chat/7)`, `/products/(detail:item/3)` | No call, no redirect, no wait; the guard runs, redirects to `/login`, waits |
| Chat catchall `a/b`: link, reload, close; an empty array, unnarrowed and narrowed by `is()`, `link` and `navigate`; `[]` for `files`' catchall | Renders and closes; a TypeError before any href or navigation starts; `/plain(chat:files)` |
| Client-side redirects into chat (dropping, and keeping the query and fragment) and into the item | `/(chat:chat/7)` and `/(chat:chat/7)?x=1#f` with home beside chat, its guard (allow, redirect, async) and resolver run once; with the root's empty home removed or full-match, chat alone and no root catchall; `/products/(detail:item/3)?sort=price` with products' `sort` |
| Chat's children table | Loaded with the chat record, not again for settings |
| Sibling pathless groups beside a root `chat` branch, and a `detail` branch below a group's `products` | Each group's pages compose with the branch and the anchored branch renders in its layout; a refused branch no group claims calls no authored group guard; with an authenticated `chat/$id` page or catchall, a refused branch runs authenticated's `canMatch` (its redirect wins) or loads its table before NG04002 (§8) |

The client-only lifecycle suite covers an app without the hydration provider: active entries first read from a timer, and an entry a later commit created, link and navigate outside any injection context.

### Translated segments proof

`examples/angular-router/localize-proof` is a filesystem-mode app built `en` + `de` with `translateSegments`, `localize: true`, `outputMode: "server"` and `i18nMissingTranslation: "error"`: `products` (`produkte`), `products/$productId`, a componentless `teams/$teamId` whose lazy children table holds a pathless overview and `members` (`mitglieder`), a parented redirect `old-products/$productId` (`alte-produkte`) to the product, and a root `$segments[]` catchall. Its server routes name the product with `serverRoutePath` as `Prerender` for id 1, and `**` as `Server`. `tests/localize.mjs` observes:

| Action                                                  | Expected result                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `ng build --configuration ci`                           | Committed outputs are current; the build passes                                                                     |
| Inspect the build                                       | Only `/en/products/1` and `/de/produkte/1` prerendered; each locale's browser and server bundles pass that locale's words to the product and members destinations, members' only in its lazy chunk; no `$localize` message left |
| One fresh server: en product 1, de product 1, en members | 200, English hrefs on the lazy English page after German rendered                                                  |
| Live SSR `/en/products/2`, `/de/produkte/2`             | 200, product 2, hrefs `/en/products/…` and `/de/produkte/…`, `createUrl` without the locale prefix                  |
| SSR `/de/products/2`, `/de/alte-produkte/1`             | The catchall's not-found page with no product; 302 to `/de/produkte/1`                                              |
| Hydrate `/de/produkte/2` in Chromium, click team, members | Server node retained, no errors, one document, the children table fetched once, URL `/de/teams/7/mitglieder`       |
| `ng extract-i18n`                                       | `route.segment.*` units, the lazy-only `members` included, with their meaning and description                       |
| Add an `offers` page, build, extract, translate, build  | Angular fails naming `route.segment.offers` after generation wrote it; extraction lists it; the translated build serves `/de/angebote` |
| `ng serve` (de) through bad catalog edits and a repair  | Errors logged at once with no rebuild; after a source save, the collided route loses and the invalid one fails server rendering; after the repair and a save, both routes render |
| Inspect the build's locale tables | One table object per locale bundle set (browser and server, en and de), bases `/en/` and `/de/`, German words `members`, `old-products`, `products`; generated files unchanged by it |
| Prerendered and live SSR in both locales, the lazy members page included | The switcher links to the same page in both locales, `aria-current` on this one; alternates en, de and x-default → en, absolute on the public origin; the lazy page's own `localeUrls` call gives the same URLs; none on the not-found page `/de/products/2`, whose switcher keeps its captured values |
| Products list `/de/produkte?page=2`, `/de/produkte`, `/de/produkte?page=1` | `/en/products?page=2`; `/en/products`, no `page=1`, for both |
| Hydrate `/de/produkte/2` with `provideActiveRouteHydration()`, click team and members, then the switcher's English link | The switcher's server anchors retained, three alternates in `<head>`; links and alternates follow navigation in one document; a new document at `/en/teams/7/members` rendering the English page |
| The strict build with `offers` translated | Its table has `offers` → `angebote`; `/de/angebote` links to `/en/offers` |
| `ng serve` (de); translate `members` → `mitwirkende`; save a source; restart | Flat own URL `/produkte/1` beside `/en/products/1`; a warning names `route.segment.members`; `/teams/7/mitwirkende` renders and still links to `/teams/7/mitglieder`; after the restart it links to itself |
| Add sibling groups `+authenticated/inbox` and `+signed-in/profile`, translated, build | Their claims carry `$localize` messages; `/de/posteingang` and `/de/profil` render in their groups' layouts, `/de/inbox` the not-found page |

## 15. Deliberate exclusions and unspecified edges [E]

Excluded: replacing Angular Router; route extensions as an application API, more than one extension in one route ancestry, and authentication of an extension's runtime beyond its declared type (§2 "Route extensions", §10: installed extensions are trusted provenance); a separate runtime routing framework; public source-graph/library-generation APIs and their exported model types; required `/tooling` or `/generated-runtime` entry points; standalone generation CLI; general-purpose scaffolding or authored rewrites beyond the structural filesystem fields in §12; `.mts`, `.cts`, or `.tsx` authored route/page support (below), generated routes from other packages (below), or a general authoring-format/interoperability guarantee beyond `.ts` Angular consumers; loader/data/transfer caches (the active-route hydration seed is display state dropped at the first navigation outcome, not a cache); server functions/RPC; custom SSR renderer; rich built-in codecs/schema adapters; unnamed/nonterminal/multiple wildcard forms, custom matchers and other native structural overrides (a sibling pathless group's ownership guard is a `canMatch`, not a matcher, §8); string navigation targets other than `..` (authored paths and other relative selectors), arbitrary URL/query-merge APIs beyond §6 (retained search keys are its one current-value reuse); server-module checks beyond a route's copies' own imports, and a type-only import of a declaration from generated code (§10); an active-route lookup by destination, public route ids, pending-navigation state on the active route, active-route identity shared across readers, and atomic chain values (§6, §7); a lazy error-component convention, and catching loader, guard or resolver failures (§7 "Error components"); stable private helper APIs or generated bytes across releases (§1).

Authored route/page files stay `.ts`-only (§10), for 1.0 and after. Angular templates are HTML, not JSX, so `.tsx` gives a page nothing `.ts` doesn't. When this was decided, Angular 22.2.2 named its template type-check shims for `.ts` and `.tsx` sources only, and its application build didn't resolve extensionless imports of `.mts` or `.cts` files, so neither is an established place for an Angular page. Files with the other extensions are skipped without a diagnostic. Admitting another extension later must be opt-in through a builder option: admitting it by default would pull files that are skipped today into the route tree, where they can add records, change parents and paths, or collide with existing ones.

Generation reads one scan root (§10) and doesn't generate routes declared in other packages, such as a monorepo library. A library contributes native Angular `Routes`, composed by hand next to the generated array (for example through a hand-written `loadChildren` record); generation doesn't validate them, and typed destinations can't reach them. Mounting library routes with typed links needs app-owned copies per mount, source-only library resolution and builder changes against duplicate library code, which costs more than it gives.

Translated static segments (§11) leave out: locale detection and language redirects; switching locale inside one build; per-declaration opt-in, opt-out or message ids; and translating parameter values, search keys or fragments, in this build's URLs and in `localeUrls`' (§5). `localeUrls` and the active route's `localeUrls` leave out: a package head manager for hreflang (the README's snippet is application code); a fragment in the active form; `localeUrls` on `injectRoute()` handles (a page calls the pure form with its destination); live table refresh or automatic restarts in `ng serve` (§13); serving other locales from one dev server; and reading `index.html` for a base href. Launch's builders define the same table (Launch's README covers Launch applications). A locale can also be an ordinary `$locale` parameter in the route tree instead of an Angular localize build; using both gives a doubled prefix such as `/de/de/products`.

Named outlets (§2) leave out: an outlet directory convention in filesystem mode; named outlets inside a named branch (native routes in the branch page instead); empty-path named routes; a type-level check of the nonempty-branch rule (§5); search keys and fragments owned by a branch, and restricting a redirect's `replace` into one; retaining search keys into a branch destination off the current anchor; redirect sources in a branch; gating every generated empty leaf for hand-written outlets; opening branches and changing the primary route, or several branches, in one navigation; a package-owned same-URL check for close; reading named branches through `injectActiveRoute()` or seeding them; generated SSR coverage for named-outlet URLs (the root catchall is the app's); a Launch-specific proof; and guarding hand-written empty-group `UrlTree`s, which Angular commits as `/` with the panel shown. The proofs run on Angular 22.3.0. The peer range admits earlier 22.x releases, which lack 22.2.4's fix for empty-path routes traversed through another outlet (angular/angular@ea8cdc4); this concerns hand-written empty-path routes beside named outlets and generated named routes below a pathless parent.

Sibling pathless groups (§10) leave out: ownership guards for a pathless declaration without a pathless sibling (a kept behavior, §1 "Stability"); the same URL in two groups as guard-ordered alternatives (a guard that redirects is the supported shape); a branch at a group's own path; telling a named outlet's segments from primary ones in a group's guards; attributing a shared path to its owning group in Angular SSR's route extraction; and keeping a group's route-provider initializers from running before its ownership guard.

Remembered search keys (§7) leave out: asynchronous storage; restores that don't rewrite the URL; storage partitioning beyond what an adapter does; request or response handling in the router; values per param instance; a global duplicate-id registry (ids are unique per effective search map only); a memory storage built in; retaining or remembering keys of a named-outlet branch; stripping fallback values from URLs; a recipe for `CommonEngine`, which returns HTML rather than a response, so with host-supplied request tokens it renders the restored page at the bare URL, the browser restores again, the active-route seed recorded for the restored URL is retired, and cookie writes reach the browser only if the host copies them; a server route's explicit non-redirect `status` on a path that can restore (Angular's redirect response then throws in development and keeps the status in production); identifying which restored value made a navigation fail (a retry forgets all); keeping a key named like an `Object.prototype` member, such as `__proto__`, through a URL Angular parses: Angular's `DefaultUrlSerializer` assigns query keys into a plain object and drops it, so a reload or a typed URL loses such a key, though a restore writes it as an own key and the commit stores it; a retry for any error other than one a handler recognizes; and a guarantee that every resolver reruns on a restored entry (Angular's rerun policies decide). Unspecified: which chain a navigation belongs to when a listener starts it while the restore's own `Redirect` cancellation is delivered; hand-written native records with resolvers in a remembered chain; a custom `RouteReuseStrategy` that reattaches a stored owner; how a restore behaves if a later Angular stops resolving routes one at a time or runs resolvers before every guard has settled.

Unspecified rather than new requirements: exotic Proxy/property-descriptor behavior; every malformed untyped codec invocation; enum duplicate/empty-list mutation policies; every wrapper-of-wrapper combination beyond §4; arbitrary any/unknown/thenable type tricks; exhaustive custom serializers/LocationStrategies/detached-route reuse; module cycles through files or reference forms §10 doesn't scan; total diagnostic accumulation policy; byte-level BOM/line-ending/trivia stability of generated output; crash-durable or concurrent-writer filesystem publication.

Unspecified behavior may change in any release. A concrete new requirement is added to this spec before the product relies on it.
