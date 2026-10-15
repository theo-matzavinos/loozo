# @loozo/angular-router — clean-room product contract

Status: **revised after loozo's scope review; not frozen or launch authorization**.

This document is the intended product target for the experiment: retained implemented application behavior plus the explicitly agreed changes below, not the unfinished Version 1 roadmap. Use generation-first Angular integration, small justified helpers, and private generation internals. Requirements below are normative unless explicitly marked as examples, limitations, or unspecified behavior. Structure and algorithms remain free within that boundary.

Agreed differences from the reference: no standalone generation CLI or public graph-library API; named terminal catchalls using `$segments[]`; native behavioral route options and phase-specific typed guards; declared-only fragment names; URL-segment-relative navigation; generated destination-reference overloads; filesystem route definitions by default: directories give paths and parents, and the builder seeds editable definitions and synchronizes only the specified structural fields (§12); `autoDefineRoutes: false` selects explicit mode, where paths and parents are authored and definition files are never created or rewritten. The catchall notation is directory-safe. **Authored route/page candidates are `.ts` only**. Historical `.mts`, `.cts`, and `.tsx` discovery does not establish a product need or an authoring-interoperability requirement. Evaluation separates retained behavior from these intentional target differences.

## 1. Product and compatibility boundary [P]

Angular Router continues to own matching, decoding, activation, history, guards, lazy component loading, native resolver execution, redirects, and navigation promises/events. This package adds typed declarations, URL values, generated route configuration, route-local handles, and Angular build/serve integration. It is not a replacement router.

The concrete consumer is an Angular application that:

1. Authors route declarations and standalone pages.
2. Generates and commits route configuration and route-local facades.
3. Installs generated `routes` with `provideRouter`.
4. Imports its colocated parameterless `injectRoute()` for typed values, data, links, and navigation.
5. Uses Angular's application build, dev-server, SSR, and hydration.

### Supported surfaces

| Surface                              | Contract                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `@loozo/angular-router`              | `defineRoute`, `createUrl`, `stringParam`, `numberParam`, `booleanParam`, `enumParam`, `withFallback`; exported types `Route` and `ParamCodec` |
| `@loozo/angular-router/package.json` | Package metadata subpath                                                                                                              |
| `@loozo/angular-router:application`  | Angular Architect application companion                                                                                               |
| `@loozo/angular-router:serve`        | Angular Architect dev-server companion                                                                                                |
| Colocated `route.generated` module   | Parameterless `injectRoute()` and inert typed `destination` reference                                                                 |
| Global `routes.generated` module     | `routes: Routes`                                                                                                                      |

The root has no `injectRoute(route)`, `parseSearch`, `defineRedirect`, resolver executor, or general parser export. Do not expose private helper APIs merely to accommodate tests written against them. There is no supported programmatic source-graph API: the old `/tooling`, `buildRouteSourceGraph()`, and exported graph/diagnostic types are deliberately outside compatibility.

### Generation-first boundary

Generate the Angular configuration, route-specific guard/resolver/redirect adapters, typed route-local handles and destination references, and navigation/link bindings that Angular and the application consume. Resolve known authored ancestry, destination selection, and redirect mappings during generation rather than shipping a second source-graph interpreter to the application.

Generated code necessarily executes at runtime. Small shared helpers may perform codec parsing, serialization, or reusable Angular adaptation where sharing addresses a concrete need. Helpers must not become a separate routing framework that owns matching, navigation, or resolver execution. No `/generated-runtime` layer or particular helper entry-point name is required. Helper exports needed by generated modules are generator-owned coupling, not an independently supported application API.

Node-side source analysis/generation is private implementation used by the application/serve builders. It needs separation from browser code, not a public secondary entry point. Its internal graph/model, functions, return shapes, immutability, and module layout are not product contracts.

The package is published to npm under the MIT license; its version is the one in `package.json`. Angular core/router peer declarations retain `^22.0.0`. The `@angular/build` peer is `~22.2.0`: the application builder schema embeds that minor's application schema. The experiment verifies Angular **22.2.2**, RxJS **7.8.2**, and generator TypeScript **6.0.3**, not all versions admitted by a peer range. The evaluator pins the remaining environment separately.

The root, generated application modules, and any helpers they import must remain browser-safe. Node, filesystem, compiler, watcher, and Architect dependencies must not enter their browser dependency closures. The builders own Node-side generation. No `loozo-routegen` bin, separate CLI flags/exit protocol, or public generator API is supported. Generate through Angular build/serve; check committed output through an application-builder CI configuration.

### What compatibility means

Preserve the consumer contracts, builder names/options, generated file names, ownership markers, and lifecycle behavior specified here, except for the explicit target differences above. Removing the CLI/graph API is not removal of discovery, validation, or read-only generated-output checking. Native behavioral configuration, catchalls, strict fragment declarations, and revised navigation are new acceptance targets, not claims about the reference.

Do not preserve private module paths, helper names, caches, symbols, generic implementation machinery, generated variable names, emitter formatting, or exact old artifact bytes. Generated code and any helpers may be redesigned together within the generation-first boundary. A consumer must regenerate with the new implementation; mixing old generated bodies with new helpers is not promised.

No bundle-size reduction, execution-speed improvement, universal linear source growth, or support outside the verification envelope is promised.

## 2. Route declarations [R]

### Consumer usage

```ts
import { defineRoute, enumParam, numberParam, withFallback } from "@loozo/angular-router";

const product = defineRoute("products/$productId", {
  params: { productId: numberParam },
  search: { tab: withFallback(enumParam(["details", "reviews"]), "details") },
  fragments: ["summary", "reviews"],
});

product.path; // literal type and value: "products/$productId"
```

`defineRoute(path, config)` requires an authored literal path and config. Callers do not supply generic arguments to obtain inference. Widened `string` paths fail at compile time.

Accepted config keys are `parent`, `params`, `search`, `resolve`, `runGuardsAndResolvers`, `redirect`, `fragments`, `canActivate`, `canActivateChild`, `canMatch`, `onInvalidParams`, `canDeactivate`, `providers`, `title`, and `data`. Guard, resolver, title and `onInvalidParams` signatures are specified in §8; `canDeactivate`, providers, data, and rerun policies otherwise use Angular 22.2.2's native types/behavior.

Generation owns paths, matching strategy, ancestry/children, component discovery/loading, primary-outlet placement, and typed redirects. Reject config overrides `path`, `pathMatch`, `matcher`, `children`, `component`, `loadComponent`, `loadChildren`, `outlet`, and `redirectTo`; do not blindly spread an Angular Route. Deprecated `canLoad` is outside this target; use `canMatch`.

- Local `params` must exactly cover distinct local `$name` and `$name[]` placeholders, using the bare name as key. Missing, renamed, or extra keys fail. Extra local codec keys introduced through a variable also fail typing.
- A path without local placeholders forbids `params`, including `{ params: {} }`, and `onInvalidParams`.
- Repeated local placeholders share one codec and one URL-creation value.
- Search maps infer optional, fallback, enum, and custom values without manual generics.
- `withFallback` codecs cannot be path codecs, at type level or at runtime declaration.
- A codec whose `parse` result type is a Promise/PromiseLike is a type error where it is declared in a params or search map (catchall element codecs included) and as a `withFallback` argument.
- Malformed config/codec records, unknown top-level keys, and invalid paths fail at runtime independently of TypeScript. Codec entries must have callable parse/stringify methods.
- Declaration does not execute parsers, stringifiers, guards, resolvers, title callbacks, provider factories, or resolver-policy predicates.
- Native behavioral values are emitted/referenced without generation-time evaluation. Angular owns their DI, execution, ordering, and semantics. Static data cannot supply the reserved generated identity key `__loozoAngularRouterRouteId`; ordinary application data must not overwrite binding identity.
- Guard arrays and fragment-name lists are snapshotted without freezing caller-owned objects. Callback/provider identities are retained; no deep freezing of application values is promised.

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

Parent links compose transitively. Empty/pathless declarations contribute no segment but retain their declarations and inherited input ownership. Child params cover local placeholders, not ancestor placeholders. Children cannot redeclare an ancestor-owned param or search key, even using the same codec. Param and search namespaces are independent: one name may occur in both.

All URL inputs and resolver/handle types retain effective inherited codec value types, including search fallbacks. Ancestors cannot see descendant inputs.

A parent must be the actual route created by this package instance. Structural fakes, spreads/copies, inherited impostors, foreign-instance routes, null, and explicit `parent: undefined` fail at runtime. Parent construction must already have completed when a child is declared; arbitrary module initialization cycles are not repaired.

### Immutability and public route type

Route values are frozen and nominal, not structurally constructible. Codec records are copied; later caller map edits cannot replace the retained declarations. Caller-owned codec objects are retained and not frozen: changing their methods can affect later behavior.

The public value retains exact local `path`, optional local `resolve`, and optional native `runGuardsAndResolvers`. Parent links, effective paths, and codec maps are not public properties. A declaration using none of the additional behavioral/fragment options and neither resolve nor policy retains only `path` as its enumerable string-keyed property. Additional-option exposure/enumerability is not a new inspection API requirement.

`Route<Path, Params, Search, Resolvers>` remains an exported nominal type: the first three parameters retain their meaning and are required; the fourth is a local resolver callback map and defaults to an empty map. Additional defaulted type parameters may support new inference, but callers need no generic arguments. The search values URL creation accepts derive from `Search`: every key optional, `undefined` allowed. Readonly optional `__params`, `__search`, and `__data` type witnesses preserve inferred inputs and unwrapped local data. They do not promise populated runtime fields. `__data` excludes redirect commands and ancestor resolver data. The branding mechanism itself is private.

Resolver maps are copied and shallow-frozen, retain original callback identities, and reject non-functions, non-records, inherited resolver entries, and the reserved key `__loozoAngularRouterRouteId`.

Native policy values are the Angular names `pathParamsChange`, `pathParamsOrQueryParamsChange`, `paramsChange`, `paramsOrQueryParamsChange`, `always`, or a native snapshot predicate. Omission preserves Angular's default. Explicit undefined, null, invalid names, and other invalid values fail at runtime. Declaration never evaluates the predicate.

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

Only whole `$`-prefixed segments are parameters. Literal `%2e` is three authored characters, not a dot. Static slashes are segment separators; a dynamic value may contain a slash and will be encoded.

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

Generation emits native Angular terminal `**` matching (`docs/**` is supported by the pinned Angular version), not a custom matcher or runtime routing engine. Ordinary siblings precede fallback catchalls. Reject overlapping competing catchalls in the same generated sibling set; disjoint catchalls and nested fallback scopes are permitted. Intentional ordinary-route/catchall fallback overlap is not an ordinary collision error. A root `$segments[]` can provide a not-found fallback. The notation is legal in Linux/Windows directory names. Explicit mode does not infer routing from directories; filesystem mode (§12) derives paths from them.

Runtime definitions, literal-path types, and generator validation share the structural grammar. Literal types are not required to validate Unicode well-formedness; runtime and generator validation must do so.

A path codec's **stringified output** must be nonempty and neither `.` nor `..`. These restrictions apply only to path serialization, at every segment position. Search and fragment may contain those strings. Native URL normalization makes dot values unrepresentable even when percent-encoded.

## 4. Scalar codecs [C]

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
| `withFallback(codec, value)` | Search only: read `value` in place of a missing, repeated or invalid value; delegate present values to the original codec                  |

Number examples: `" 42 " → 42`, `"1e3" → 1000`, `"0x10" → 16`. Blank/whitespace-only, NaN, Infinity, and nonnumeric inputs fail. Nonfinite stringify values fail. Invalid boolean/enum raw representations fail with an Error.

### Search params

Search never takes part in matching (§8), and every search key is optional: a search value never fails input parsing.

```ts
search: {
  page: withFallback(numberParam, 1), // reads number; URLs may omit it
  sort: enumParam(["asc", "desc"]), // reads "asc" | "desc" | undefined
}
```

| Search key     | Missing  | Repeated, or invalid (parser throw, non-string raw) |
| -------------- | -------- | --------------------------------------------------- |
| Plain codec    | Absent   | Absent                                              |
| `withFallback` | Fallback | Fallback                                            |

A plain key reads as `Value | undefined` (an optional property). A fallback key reads as the codec's value type, never `undefined`. URL creation, links, navigation and redirect replacements may omit any search key or pass `undefined`, and redirects never treat a search key as required. The fallback is returned as is, neither parsed nor copied. `withFallback` validates its codec like a declaration does and rejects a codec that already has a fallback with a TypeError; a fallback may itself be `undefined` or `null`.

Delegation preserves wrapped codec throws and returned value identity. The package does not freeze custom codec-produced values.

## 5. URL creation [U]

```ts
createUrl(product, {
  params: { productId: 42 },
  search: { tab: "reviews" },
  fragment: "summary",
});
// /products/42?tab=reviews#summary
```

`createUrl(route, values)` synchronously returns a root-relative string and never calls parsers.

### Input typing and runtime boundary

- All effective inherited/local path values are required and codec-typed.
- Every search key is optional: the search record may be omitted, `{ search: {} }`, or any subset of declared keys, each codec-typed or `undefined`. Keys with a fallback are optional here too.
- Searchless routes forbid the search option.
- Routes with no effective path params forbid a params map.
- Fragment is optional and restricted to the selected declaration's own declared names; without a list, the fragment option is forbidden.
- Catchall values are required readonly arrays of element-codec values, including a valid empty array. Scalar and catchall cardinalities are distinct.
- Literal unknown value/option keys and wrong values fail typing; exact local codec-key typing also covers variables as described in §2.
- Runtime rejects non-nominal routes, malformed records, unknown options, missing path/extra input keys, wrong fragment types, and non-string codec outputs with TypeError.

Do not promise universally exact TypeScript object types: normal structural assignability may admit extra properties through variables where no exactness requirement above exists. Runtime input validation still rejects unknown keys.

### Serialization

1. Concatenate authored ancestry without normalization. Empty effective path is `/`.
2. Component-encode every static segment and stringified dynamic value, additionally escaping parentheses. A dynamic slash becomes `%2F`.
3. Repeat a repeated scalar placeholder's supplied value at each occurrence; expand a catchall array element-by-element with the same segment encoding and output restrictions.
4. Emit present search keys in globally lexical key order across ancestry. Encode keys and values at the URL boundary.
5. Omit search keys that are absent or equal to undefined. Present empty strings produce `key=`.
6. Component-encode an optional fragment after the query string.

```ts
const literal = defineRoute("a(b)/%2e/$id", { params: { id: stringParam } });
createUrl(literal, { params: { id: "c(d)" } });
// /a%28b%29/%252e/c%28d%29
```

Existing codec exceptions remain observable. Malformed dynamic/search/fragment Unicode produces URIError at encoding. Authored invalid static Unicode is rejected at declaration. Supported URLs must preserve decoded segment meaning through native URL handling and Angular serializer/matcher APIs; byte-identical Angular href/URL spelling is not required.

## 6. Generated route-local handle and navigation [H, N]

```ts
import { injectRoute } from "./route.generated.js";

const route = injectRoute();
```

The facade takes no arguments or caller generics and binds its declaration to its **own exact activated Angular route record**. It requires an Angular injection context. Missing/different `__loozoAngularRouterRouteId` in `ActivatedRoute.snapshot.routeConfig.data` is a synchronous wiring error. Inherited snapshot data is not identity evidence.

The returned handle is not callable. Its readonly properties expose readonly Angular Signals:

```ts
readonly params: Signal<EffectiveParams>;
readonly search: Signal<EffectiveSearch>;
readonly data: Signal<LocalResolvedData>;
```

Values are the committed snapshot's and are available on the first read, including synchronously in the page constructor: there is no loading, reloading or undefined state. There is no writable set API, and callers cannot reassign the signal properties through the typed interface. §7 specifies when the values change.

### Calls

```ts
route.navigate(values); // Promise<boolean>, exact bound declaration
route.navigate(".", values); // same exact bound declaration
route.navigate("/teams/$teamId/items/$id", destinationValues);
route.navigate("../elsewhere/$siblingId", destinationValues);
route.navigate(otherDestination, destinationValues);

route.link(values); // UrlTree, no navigation
route.link(".", values);
route.link("/teams/$teamId/items/$id", destinationValues);
route.link("../elsewhere/$siblingId", destinationValues);
route.link(otherDestination, destinationValues);
```

All value forms use the selected declaration's effective params/search types and URL-creation rules, including optional fragment. All target path inputs must be supplied; current inputs are never implicitly reused.

Two-argument selectors are admitted **literal authored expressions** or generated destination references, not concrete URLs. Unknown expressions, unresolved shared paths, widened strings, selector unions, raw definition/handle objects, and concrete substitutions fail typing. Unknown/invalid untyped expressions or references throw synchronously before Angular is called. No arbitrary URL overload, third argument, navigation extras, implicit query merge/preservation, or inferred current-value reuse exists.

`navigate` serializes with the selected declaration and calls `Router.navigateByUrl(rootRelativeUrl)`. It returns Angular's **same Promise object**, not a wrapper or transformed result. Angular owns guards, redirects, same-URL skips, final activation, and rejection behavior.

`link` serializes and calls `Router.parseUrl`, returning Angular's UrlTree without navigating. Ordinary Angular RouterLink consumes it. RouterLink owns href/LocationStrategy, native-versus-SPA clicks, target, non-anchor tabindex, and inputs such as replaceUrl/state/info. URL-creation RouterLink inputs must not accompany a supplied UrlTree. Angular may reserialize valid URLs differently from `createUrl`.

### Absolute destinations and shared paths

An absolute selector is `/` plus the **effective authored path**, or `/` for empty effective path. Codec/search differences do not disambiguate matching shape.

If one effective path belongs to an ancestor/pathless-descendant chain, the selected destination is its deepest terminal pathless child **only if that record has no children**. That leaf alone receives `pathMatch: "full"`; ancestors remain prefix matching. If no terminal winner exists, the shared path has no two-argument destination. Every retained record still has its one-argument exact-current call.

Selection controls typing and serialization, not exclusive activation: parent and pathless child may activate together. Query values do not choose a winner. Nonleaf pathless records must not receive full matching that blocks longer descendants.

### URL-segment-relative expressions

- Bare `"."` selects the exact bound declaration, identical to the values-only overload, not a canonical pathless descendant.
- For fixed-width effective paths, each leading `..` removes **one URL-template segment**, regardless of authored parent boundaries. Pathless records add no segment; scalar placeholders occupy one segment even when their value contains an encoded slash.
- `./suffix` appends to the bound effective path. A leading chain such as `../..` may have a suffix; `..`, `../..`, and legacy empty trailing-slash forms are admitted only when their result resolves to a known typed destination.
- Resolve the resulting effective authored expression during generation. Except for exact-current `"."`, use the same winner as an absolute selector. Legacy `./` remains a canonical effective-path lookup, not an alias promising exact pathless-record identity.
- Generated literal sets exclude above-root traversal and unresolved prefixes/suffixes. An intermediate prefix without a known destination is not admitted even if it stays under `/`. No anonymous destination/value schema is invented.
- Destination values remain explicit and use the selected target's effective params/search and declared fragment names; traversal never implicitly reuses current values.

For `/teams/$teamId/projects/$projectId`, `..` addresses `/teams/$teamId/projects`, while `../..` addresses `/teams/$teamId`. The former can be excluded while the latter is admitted. Parent links spanning several segments and pathless parents do not change that count.

A catchall is **not one URL segment**. On a catchall-bound handle, depth-dependent relative climbs and extensions are excluded rather than guessing the captured length or adding a dynamic target interpreter. Use `"."`/values-only for that declaration or a known absolute selector/generated destination reference. Fixed-width handles may target a known catchall declaration with explicit array values.

Reject mixed `./../` prefixes, empty interior suffix segments, internal dot/dotdot traversal, query/fragment characters in suffixes, unknown destinations, and concrete values replacing placeholders. Static `?/#` routes remain eligible for absolute selectors but not relative suffixes. Serialize resolved targets as root-relative URLs; no Angular `relativeTo` command surface is added.

### Generated object targets

```ts
import { destination as productRoute } from "../products/$productId/route.generated.js";

route.link(productRoute, {
  params: { productId: 42 },
  fragment: "reviews", // when declared by that target
});
```

Every retained ordinary facade exports an inert `destination` usable without an injection context or target activation. It carries/inferably represents that declaration's effective input schema and fragment names. `navigate(destination, values)` and `link(destination, values)` use the same serialization/native behavior as their other forms. These references belong to the **same generated route set** as the calling handle; foreign-set references, structural copies/fakes, raw `defineRoute` values, and injected handles are not object targets. Registration/branding representation is private.

A generated reference selects its own retained declaration, like its values-only call; it does not silently substitute a canonical pathless winner. References are not a public graph/model API. Object-target support does not add a new `createUrl(destination, ...)` overload requirement: the root function retains its authored-definition contract.

## 7. Parsed values and navigation lifecycle [L]

### Input ownership and errors

Angular owns matching and decoding. Obtain declared path values from each authored record's positional consumed URL segments through its ancestry, not inherited/matrix-merged param maps. Descendant or same-segment matrix entries cannot override positional values:

```text
/teams/7/items/9;teamId=999;id=888
→ effective params { teamId: 7, id: 9 }
```

This holds under Angular's `always` and `emptyOnly` parameter-inheritance strategies. Repeated local placeholders use the last positional occurrence for parsing, matching Angular. Pathless records contribute no positions. Decoded values are not decoded again. Search uses Angular's shared decoded query map.

Each declared path scalar requires exactly one raw value. A catchall instead has zero-or-more positional raw values and invokes its element codec independently for each; it is not a repeated-scalar error. Search keys never fail: a missing, repeated or invalid value is absent, or reads as the key's fallback (§4). Ignore undeclared query keys. Within one parse operation, validate every relevant path raw cardinality before starting any parser; missing/repeated values cannot trigger partial codec side effects first. Parsing is synchronous and stops at the first failing path codec, in declaration order; search is parsed only after the path values succeed.

Observable input errors are path-only: Errors with `source: "path"`, `key`, `reason: "missing" | "repeated" | "invalid"`, and retained cause for invalid inputs/codec throws. Malformed raw input and codec throws classify as invalid. The error class is not a new root export. A thenable parse result is not an input error but the TypeError of §4.

Because invalid local path params make a route not match (§8), activation reparses only path values that already parsed once: a path error after matching needs a codec that disagrees with itself (nondeterministic or stateful), a programming error. Path and search codecs therefore run during matching and again on activation; no cross-phase cache exists.

### Sharing

One exact declaration object and exact complete Angular snapshot share one full effective parse result/failure across typed activation guards, local resolvers, title callbacks, and handles. A canActivateChild adapter uses the declaring parent's snapshot for that input operation while preserving Angular's native child snapshot argument. Matching-phase local input parsing is separate: its partial snapshot does not supply ancestry, and no cross-phase parse reuse exists. New snapshots create new parse results, even when URLs/values are equal. Different declarations never share merely because paths/codecs match. This is not a URL or resolved-data cache.

Successful top-level params/search maps are shallow-frozen and reference-shared for that snapshot. Search keys without a value or fallback are absent. Arbitrary nested codec values are opaque, not recursively frozen.

### Handle values

Handle signals read the route's committed snapshot. Angular replaces an ActivatedRoute's snapshot only when a navigation activates, so while a navigation is pending the signals keep the current values, and a cancelled, failed or same-URL-skipped navigation leaves them unchanged. When a navigation commits a new snapshot for a reused route record, params, search and data change together, from that one snapshot. The handle follows the ActivatedRoute's own observables as well as router events, so a subscriber to either sees the new values, with two exceptions. A subscriber to the same ActivatedRoute observable that subscribed before the handle was created runs first. A router-event listener registered before the handle, reading it during the route's own `ActivationEnd`, sees the previous values when only an ancestor's path params changed and none of the route's own observables emit (under `paramsInheritanceStrategy: 'emptyOnly'`, or when a matrix param shadows the ancestor's). Create the handle first; once that event has been delivered, the signals are current. Pending-navigation UI uses Angular's `Router.currentNavigation()` signal; the package adds nothing for it. A failed navigation's errors stay Angular's (rejection, event, error handler); do not alter Angular's native promise rejection value.

Handle parsing shares the snapshot's parse result with guards and resolvers. A route with neither typed activation guards, resolvers nor a title callback is parsed when its handle is first read. If that parse fails, which takes a nondeterministic path codec, reading params or search throws that error; data is unaffected. Injector destruction releases the handle's subscriptions.

Parsing involves no package-owned pending work: server rendering contains the handle values because they are synchronous, while Angular tracks resolvers and other asynchronous navigation work itself.

## 8. Angular-native guards and resolver data [D, Q]

### Guard adaptation

Configured `canActivate`, `canActivateChild`, and `canMatch` values are arrays of parsed-input callbacks. Zero-argument callbacks remain usable; imported snapshot-first native guards can be invoked explicitly inside an adapter callback. No new guard-class/token adaptation protocol is required for these three fields. `canDeactivate` retains Angular's native function/token forms and component-first signature.

| Property           | Package callback signature and scope                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canActivate`      | `(inputs, snapshot, state)`; declaring route's effective inherited/local params/search                                                               |
| `canActivateChild` | `(inputs, childSnapshot, state)`; declaring parent's effective params/search, not unknown descendant-local fields                                    |
| `canMatch`         | `(inputs, routeConfig, segments, partialSnapshot)`; **local** positional params plus effective inherited/local search; no ancestor positional params |
| `onInvalidParams`  | `(error, routeConfig, segments, partialSnapshot)`; one callback, not an array; see "Matching" below                                                  |
| `canDeactivate`    | Native `(component, currentSnapshot, currentState, nextState)`; no automatic codec parsing/waiting                                                   |

Typed inputs are readonly, codec-inferred, and contain only params/search. Preserve each native argument's Angular type. Ordinary scalar/Promise/Observable `GuardResult` values (`boolean`, `UrlTree`, `RedirectCommand`) are supported. Angular owns invocation/order, matching fallback, cancellation, redirects, and results; do not add a guard scheduler.

Generate phase-specific adapters that validate exact record identity and positional ownership, parse inputs synchronously, and call the authored callback in the same synchronous call Angular made, inside the injection context Angular provides; no injection-context restoration exists. `inject()` works at callback entry, before the callback's own first await. Callback results (scalar, Promise or Observable) are returned to Angular unchanged, so Angular keeps its native Observable first-result/teardown behavior. For activation callbacks, a parse failure propagates as a navigation error **before the callback**, not an implicit `false`. A successfully parsed `canMatch` returning false uses Angular's native next-candidate behavior.

### Matching

**A local path param that fails to parse means the route doesn't match.** Generation gives every non-redirect record whose own path has a param (`$name` or `$name[]`) or that has effective search a generated `canMatch`, ahead of any authored ones, that parses that record's local path params and, once they succeed, its effective search. Valid path params match; an input error returns `false`, so Angular tries its next candidate and backtracks, typically to the closest catchall (§3). A thenable parse result (§4), path or search, instead fails the navigation with its TypeError; Angular runs this guard on every navigation, query-only ones included, so no navigation commits one. A resolver, guard or handle therefore never sees a value its path codec rejects, such as an unknown `enumParam` member. Ancestor params are absent from Angular's partial match snapshot, so each ancestor's own generated guard checks its own params. Search never decides the match: it never produces an input error, and only the thenable TypeError, a programming error, escapes its parsing. Existence checks (a value that parses but names nothing) remain application logic, for example a `canActivate` returning `new RedirectCommand(notFoundUrl, { browserUrl: state.url })` to a not-found URL that the route itself can't match.

`onInvalidParams` replaces the `false`:

```ts
export default defineRoute("items/$id", {
  params: { id: numberParam },
  onInvalidParams: (error, routeConfig, segments, partialSnapshot) => {
    // error: the path input error (§7), with the codec failure as its cause
    return new RedirectCommand(inject(Router).parseUrl("/items"));
  },
});
```

It is called synchronously in the route's injection context, like other callbacks. It returns `false`, a `UrlTree` or a `RedirectCommand`, synchronously or as a Promise/Observable. `true` is a type error, and at runtime `true` or any other value, including one a Promise or an Observable's first emission delivers, fails the navigation with a TypeError; a throw or rejection fails it with that error. It is accepted only on routes with local path params and is rejected on redirect declarations (§9), at type level, at runtime declaration and in generation preflight.

Angular passes one partial snapshot to all of a candidate's `canMatch` guards and calls each of them, preferring the first non-`true` result in array order, while any guard's error fails the navigation. So all of them share one path parse and one search parse per candidate, and an authored `canMatch` adapter never errors because of invalid path params: if that parse fails, it returns `false` without calling the callback, leaving the generated guard ahead of it to decide. After a successful path parse, its inputs are those path values plus effective search.

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

export default defineRoute("items/$id", {
  parent: team,
  params: { id: numberParam },
  runGuardsAndResolvers: "paramsOrQueryParamsChange",
  resolve: {
    item: ({ params, search }) =>
      inject(ItemCatalog)({ teamId: params.teamId, id: params.id, score: search.score }),
  },
});
```

A callback receives `(inputs, ActivatedRouteSnapshot, RouterStateSnapshot)`. Local callbacks for one exact declaration/snapshot receive the same shallow-frozen public `inputs` container. Its `params/search` maps retain the shared identity and shallow freezing described in §7, and infer readonly effective codec-parsed values including pathless ancestry. Only top-level bindings are readonly; nested codec-produced objects retain their types. This public callback-container contract does not prescribe any private intermediate result representation. Raw snapshots are an escape hatch, not the package's positional-ownership source.

No manual generic or ResolveFn annotation is needed. Raw native ResolveFn's snapshot-first signature is not interchangeable with this parsed-input callback signature. Resolver values must be functions.

Scalar/object, Promise, Observable, and RedirectCommand results are supported. Local data inference unwraps asynchronous outputs and excludes RedirectCommand; a redirect-only resolver has never as activated data. Handle data includes local resolver keys only, not parent data, Angular title, or generated identity.

Generated adapters must:

- Check the exact record before parsing/callback invocation.
- Parse effective inputs synchronously before calling the callback.
- Let resolvers and handles share the same declaration/snapshot parse, including failure.
- Call the callback synchronously inside Angular's injection context; `inject()` works there, before the callback's own await. Later awaits/emissions and codecs receive no DI-context guarantee.
- Return the callback's result to Angular unchanged, preserving native first-emission, empty-Observable cancellation, redirects, errors, execution ordering, activation, SSR, and returned Observable teardown.

A resolver-run parse error rejects navigation before callbacks/activation; first activation therefore creates no handle. With neither typed activation-guard, resolver nor title input demand, handle parsing happens after commitment, and a parse failure there throws on handle read without failing navigation (§7). Do not cache or share resolved data independently of Angular.

An explicit native runGuardsAndResolvers policy/predicate is passed through unchanged. Omission preserves Angular's default paramsChange behavior: query-only navigation can produce new parsed search alongside old resolver data. Consumers choose paramsOrQueryParamsChange or a predicate when required; unrelated query/matrix changes may also trigger that native policy. No automatic dependency tracking, forced rerun, extra resolver pending-work lifecycle, loader, timeout, data cache, or transfer cache exists.

### Titles

`title` is a string or a parsed-input callback `(inputs, ActivatedRouteSnapshot, RouterStateSnapshot)` returning a string, Promise or Observable of one. Inputs are the declaring route's effective inherited/local params/search, the same shared container its resolvers receive. Angular runs a title as a resolver, so the callback is adapted like one: same record check, shared parse, injection context, rerun policy and navigation-error behavior, and it cannot read the route's resolved data. Angular's native snapshot-first `ResolveFn` and class/token title forms are not accepted, for the same reason as resolvers. A redirect record never activates, so it has no title.

## 9. Typed redirects [X]

```ts
export default defineRoute("old/$oldId", {
  parent: team,
  params: { oldId: numberParam },
  redirect: {
    to: target,
    params: { teamId: "teamId", itemId: "oldId" },
    search: { mode: "drop" },
    fragment: { mode: "preserve" },
  },
});
```

`to` is an actual target route object, never a URL expression. Static authoring requires a direct default import of an admitted declaration. Target's declaration path/ancestry determine the effective URL. Folder names do not participate in explicit mode; filesystem mode (§12) synchronizes those declaration fields before generation.

An explicit params map covers every destination path key exactly and names compatible effective source path keys. Omission forwards by the same name only when every target key exists with compatible inferred values. Source value types must be usable by destination codecs; mere equal parameter names do not suffice. Mapping cannot invent constants, use query keys, or omit required target params.

Both search and fragment policies are mandatory:

| Policy                        | Search behavior                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ mode: "preserve" }`        | Preserve unknown keys, repeated values, and original decoded query text rather than re-stringifying it; destination search recovers on its own (§4), so nothing is validated                                                                                                                                                                                         |
| `{ mode: "drop" }`            | Remove all incoming query values                                                                                                                                                                                                                                                                                                                                     |
| `{ mode: "replace", values }` | Destination-typed values for any subset of keys, omitting absent or `undefined` ones; literal unknown keys fail typing. Declared-search replacement variables may admit extra keys through structural assignability; searchless replacement typing rejects string keys even through variables. Runtime and static validation reject all unknown replacement keys. `{}` is always valid and removes incoming queries |

Fragment accepts preserve, drop, or `{ mode: "replace", value }`. Explicit replacement values use the target's declared fragment-name union and runtime membership; without target names replacement is forbidden. Preserve carries raw incoming fragment text without imposing declaration membership, consistent with raw incoming hashes remaining Angular's concern; drop always removes it. The redirect adapter itself does not parse or validate any search values; ordinary matching candidates can independently demand their own inputs before a fallback redirect is reached.

Runtime declaration snapshots mapping/replacement/fragment records, validates structure/missing/unknown keys without running codecs, and rejects unknown redirect properties. `createUrl` remains distinct: it still forbids a search option for a searchless route even though redirect replace accepts `{}`.

Redirect execution:

1. Check mapped scalar source cardinalities before any parser starts; mapped catchalls allow zero-or-more elements.
2. Parse mapped source paths synchronously with source codecs, including catchall element parsing.
3. Stringify those logical values with destination codecs and target scalar/catchall shape; never copy raw path text. Mapping compatibility uses logical value types, including readonly catchall arrays.
4. Apply search/fragment policies and return an Angular UrlTree for native redirect execution.

Within the redirect adapter, only mapped source params are parsed; unmapped source params are ignored. Equal value types do not guarantee codec success. A codec throw, an input error or a thenable parse result fails through Angular navigation errors. Under default handling, one NavigationError is emitted and navigateByUrl rejects while prior committed URL remains. No parallel router lifecycle or new timeout is added.

A redirect declaration cannot also declare its own `canActivate` or `canMatch` field, including empty arrays, or `onInvalidParams`: Angular rejects `canActivate`/`canMatch` with native redirect records (Angular 22.2.2 throws RuntimeError 4014 for `canMatch` with `redirectTo`), so a redirect record also gets no generated matching guard, and an invalid mapped source param fails through the redirect adapter as a navigation error. Literal typing, runtime declaration validation, and generation preflight must reject them; generation fails before changing outputs. Do not silently discard the guard or invent its execution. This restriction does not apply to retained source ancestors' matching guards.

Static generation rejects inadmissible targets, incorrect selected shared-path identity, incompatible/incomplete maps/policies, self redirects/cycles, and redirect sources with components, children, or the incompatible own guard fields above. Ordinary redirects become **root-level full-match effective-path records before the ordinary nested tree**, not nested redirect records. Catchall redirect sources remain root-level/full-match but come **after the ordinary tree**, so fallback behavior does not swallow ordinary destinations. Include hoisted catchall redirects in the same generated-sibling competition checks as other catchalls.

Hoisting does not activate source ancestors on the source URL or run their activation guards/resolvers merely because of authored ancestry. Catchall redirects follow the ordinary tree, so ordinary candidates—including retained source ancestors—may execute native `canMatch` first; their results, parsing demands, and errors retain Angular's behavior. Guard fields on redirect records likewise follow actual native dispatch; do not introduce guard execution that Angular does not perform.

Redirect sources have no facade. Prune newly empty componentless ancestors and their facades/destinations. Redirect source URLs remain typed destinations using source inputs. A retained ordinary componentless ancestor may be a destination when unambiguous; a pruned ancestor cannot be a redirect target.

## 10. Generator source analysis and validation [G]

### Observable generation contract

The builders read configured application sources without importing/executing application modules or evaluating codecs, guards, resolvers, title callbacks, provider factories, or policies. Source analysis is private; no public graph result, type inventory, frozen intermediate object, or particular analysis function is required. It is not whole-program semantic validation or Angular/template checking; the application still typechecks/builds separately. Filesystem mode (§12) additionally checks syntax and semantic diagnostics of admitted declaration files against the combined authored/generated overlay, including codec maps, inherited ownership and callback references. Unrelated included-source semantic errors and compiler option/global diagnostics remain the native application's responsibility; existing module-reference preflight still covers application sources.

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

Admit direct `export default defineRoute(literalPath, inlineConfig)` using the real package named import, including import aliases. A recognized generator-owned typing re-export may preserve that genuine factory provenance; this does not admit arbitrary application wrappers/barrels. Only filesystem mode (§12) may create editable declaration seeds. Do not admit constants exported later, nongenuine wrappers/local factory aliases, application barrels/reexports, type-only factory imports, indirect defaults, unknown defaults, or multiple competing defaults.

Config uses unique explicit keys from §2, without top-level spreads/accessors/computed/duplicate/unknown keys. Params is required for local placeholders and forbidden without them. In explicit mode, params/search expressions otherwise remain opaque: source analysis does not certify codec/map typing or all inherited search-key uniqueness. Filesystem mode (§12) checks admitted declaration semantics without evaluating those expressions, and rejects opaque or ambiguous structural codec edits rather than guessing. Ordinary helper imports may resolve to ambient modules; parent/factory provenance requires concrete source identity.

Parents and redirect targets directly reference default imports of admitted declarations. Excluded-but-importable parents fail membership. Parent cycles fail. In explicit mode, authored parents alone determine ancestry and directories introduce no implicit nodes. Filesystem mode (§12) synchronizes each record's path and nearest record parent before applying the same ancestry validation. Grammar validation precedes matching-shape comparison.

Factory provenance is anchored to this router package's concrete public entry. A matching import spelling or impostor manifest does not establish it. Angular decorator provenance is anchored to the component consumer's installed `@angular/core`, resolved without application paths/baseUrl redirection or package self-name impostors. Genuine aliases/dependency links work. Consumer Angular may be physically separate from tooling's development installation. Installed dependencies are trusted provenance evidence, not independently authenticated.

A directory may contain one route declaration and one directly default-exported standalone Angular component class, associated by exact colocation, never names or directory ancestry. Declaration-only directories are allowed during source analysis; generation still rejects ordinary componentless leaves as specified in §11. Component-only candidates fail in explicit mode; filesystem mode (§12) seeds their colocated declarations. Competing candidates fail in both modes. Named-only modules are ignored; unknown default exports are errors.

Component recognition requires genuine Angular Component provenance. Inline metadata must prove omitted standalone or final literal true. False, indirect/asserted/uncertain standalone fail. Duplicate explicit standalone properties fail generator validation, even when both are literal true. An earlier opaque metadata spread followed by a single explicit literal `standalone: true` is admissible; a later unknown spread that may override it is not. Other metadata remains opaque and is not evaluated.

### Matching shapes and diagnostics

Equal unrelated ordinary effective shapes fail, including nonleaf declarations and pathless siblings. Parameter names, codecs, queries, or guards do not establish disjointness. Equality within an ancestor/pathless chain is valid. Nonidentical ordinary same-length shapes overlap when every position can match the same value; diagnose them without inventing precedence and block generation. Static comparison is case-sensitive. Catchalls have the deliberate fallback exception and competing-sibling validation specified in §3/§9; discovery order is never their priority rule.

Builder diagnostics identify the failure and the relevant input/source location when available. Collision/overlap diagnostics identify both participants; missing files must not invent a source span. Invalid input, configuration/I/O/syntax errors, provenance/authoring failures, unsafe paths, ancestry/ownership errors, and redirect/matching conflicts must be distinguishable enough to fix the source.

Do not reproduce the old exported diagnostic union, serialized target/reference objects, graph-result shapes, or deep-freezing guarantees. Exact message wording, numeric-code vocabulary, intermediate severity representation, and universal multi-error accumulation/order policy are not compatibility requirements. Retain TypeScript diagnostic numbers where reporting TypeScript configuration/syntax failures; keep diagnostics deterministic across equivalent inputs/root order.

## 11. Generation, artifacts, and CI checking [F]

### Generated product

One builder generation pass produces:

1. `<out-dir>/routes.generated.ts`, exporting `routes: Routes`.
2. `<out-dir>/destinations.generated.ts` when retained facades exist.
3. `route.generated.ts` beside every retained ordinary declaration, exporting parameterless `injectRoute()` and its inert typed `destination`.

Only primary-outlet generation is included. Preserve explicit authored nesting/local decoded paths, translate whole scalar `$name` segments to Angular `:name`, and terminal `$name[]` to native `**`. Put each record's stable authored source ID in its own `Route.data.__loozoAngularRouterRouteId`.

Colocated default standalone components use lazy loadComponent. Componentless ancestors with children are valid. Ordinary componentless leaves fail generation before writing. Apply §9 redirect pruning/ordering and §6 shared-path matching. Declarations are imported only where generated configuration reads them directly (native options and redirects); guard/resolver/title adapters, and the generated matching guard (§8) every non-redirect record receives when it has local path params or it or an ancestor declares `search`, reach them through the route set. Components remain lazy. Forward providers/static data/native canDeactivate/rerun policy to Angular, and a static title; adapt a title callback like a resolver (§8); preserve the generated identity key. Static data remains observable through native Angular snapshots/data; the package handle's data signal retains **local resolved keys only**, not newly merged static or inherited data. Do not assign authored parsed-input resolve maps directly to native Angular Route.resolve.

Generated TypeScript and emitted relative JavaScript specifiers must typecheck/build under the Angular application consumer environment. Authored `.ts` imports use emitted `.js` specifiers. Root-package NodeNext consumer checks and Angular application/Bundler checks are distinct; admitting a source extension does not imply every module-mode or CommonJS interoperability combination. Generator bootstrapping tolerates missing/removable stale facades at the known generated locations for retained declarations, including another declaration's `destination` imported by a consumer. Own-facade typing imports are also tolerated when needed. This is not permission for arbitrary unresolved imports or references to undeclared/unadmitted generated targets. This is private analysis behavior needed to generate an application's first outputs, not a public graph option.

Definitions/codecs and resolver dependencies may be eager. An authored definition may import its facade directly or through a barrel when declaration construction order is valid; merely creating a facade import cycle must not eagerly read uninitialized destination bindings. Parent/target definitions must already exist when defineRoute constructs the referencing declaration. Arbitrary ancestor → facade → descendant initialization cycles are not promised safe.

Adding an independent route must leave existing unrelated facade bytes unchanged. Shared destination information belongs in the shared artifact rather than requiring every facade to repeat the entire graph. The shared artifact's helper export names/representation, getter strategy, relationship tables, and overall module organization are not prescribed. Deep trees may retain quadratic relationship counts; no universal byte-count target is imposed.

### Ownership and filesystem effects

Exact first-line markers:

```ts
// @loozo/angular-router routegen: owned routes.generated.ts
// @loozo/angular-router routegen: owned destinations.generated.ts
// @loozo/angular-router routegen: owned route.generated.ts
```

Only the corresponding exact-name marked generated outputs at the configured global or colocated locations may be replaced/removed. In explicit mode, never create, scaffold or rewrite authored `defineRoute` files, even when a configuration file is missing. Filesystem mode (§12) may seed and surgically synchronize editable declarations after combined preflight. Neither mode ever automatically removes authored definitions. Necessary generated typing helpers may live in the already owned artifacts; they are not source-file scaffolding. Do not use a directory-wide cleanup or require an ownership manifest. Never overwrite an unmarked expected-path collision. Leave unrelated files/directories intact.

Output directory must be disjoint from every scan root. Reject unsafe/symlink output paths and unmarked collisions. Preflight source-validation failures, all matching overlaps, leaves, ownership, and paths before output modification. A failed preflight must leave all previous output bytes unchanged.

Do not rewrite byte-identical outputs or change their mtimes. Remove stale marked facades after authored declarations disappear, and stale shared/global artifacts when no longer needed. When no authored routes remain, remove marked stale artifacts, not unrelated content. Stale generated files can be removed even when their old authored imports are broken.

Changes may be published by individual file replacement, not an atomic all-output transaction. Interruption may leave mixed versions; a successful rerun repairs them. Preserve no promise of rollback or whole-directory atomicity.

### Angular build/serve entry points and CI

```sh
ng build app                    # generate, then official application build
ng serve app                    # watch/generate, then official dev-server
ng build app --configuration ci  # application companion configured with check: true
```

The CI configuration belongs to the consumer's application-companion target. `check` is read-only, including cleanup: missing, changed, stale artifacts and generation errors fail before delegating to Angular. Coexisting drift reports priority **changed, then missing, then stale**. Diagnostic wording and removed CLI stdout/exit conventions are not prescribed; §12 and §13 prescribe the builders' output channel. Hand edits to marked files are drift and are replaced in normal write mode.

Package build/check/test/typecheck/SSR verification scripts must be usable in the pinned environment, but no `routegen`/`build:routegen` script, CLI packaging/prepack protocol, or standalone generation command is required. Publishing/release infrastructure remains excluded.

Maintain and commit generated outputs with authored definitions; check them in CI. The rebuilt generator may change old generated bytes once; subsequent check compares against its own deterministic output, not old emitter snapshots.

## 12. Companion application builder [B]

Builder name: `@loozo/angular-router:application`.

Options are the router options below plus `@angular/build:application` options, which pass through unchanged. Configure ordinary Angular options inline on this target; there is no separate official target. The builder schema is generated at package build from the installed `@angular/build` application schema plus the router options (`scripts/builder-schemas.mjs`), keeping Angular's defaults, required options and `additionalProperties: false`; a test fails when the committed schema is stale.

- Required nonempty `tsconfig: string`.
- Required `scanDirectories: string[]` containing exactly one nonempty string, in both modes.
- Required nonempty `outDirectory: string`.
- Optional `check: boolean`, default false.
- Optional `autoDefineRoutes: false | { filename?: string }`. Omitted or an object selects editable filesystem definitions (filesystem mode), seeding `filename`, default `route.ts`; `false` selects explicit mode: no seeding or synchronization, and authored paths and parents alone determine the tree. No additional nested keys. Filename must be a simple implementation `.ts` basename, not `.d.ts`, traversal or any generated artifact filename. It affects only new seeds, not discovery or renaming.

### Editable filesystem definitions

The single scan root anchors path `''`; there is no separate root setting. An included directory, the scan root included, is a record exactly when it contains an admitted page or an admitted declaration. Every other included directory contributes its path segment to the records below it instead. The scan root and `+dirname` contribute `''`; any other included directory contributes its basename. A record's parent is its nearest record ancestor, or none when it has none (in particular, top-level records have no parent unless the scan root has a page or declaration). Its path joins, with `/`, the nonempty contributions of the directories from just below that ancestor (or from the scan root) down to itself: with a `$package` record, `$package/guide/$guide/page.ts` and no page or declaration in `guide`, the record's path is `guide/$guide` (Angular `guide/:guide`) and its parent the `$package` declaration, as explicit authoring would write it. The accumulated path must satisfy §3; a violation, such as a page-less catchall directory with descendants, fails before writes. A `-dirname` is transparent: never a record and no path contribution; descendants remain eligible and attach to the nearest record ancestor. A page-less directory gets behavior (guards, resolvers) only from an authored declaration there, which makes it a componentless record; Angular then also matches its bare URL when no child matches, and @angular/ssr prerendering enumerates it like any other route. Helper/empty directories and page-less ancestors are not seeded. Transparent-node declarations remain authored files but cannot create records; consequential config behavior and pages there are rejected.

Admission remains content/provenance-based direct default `defineRoute` calls and genuine standalone default Component classes, intersecting native tsconfig implementation `.ts` roots with the scan. Any admitted declaration in a directory prevents a duplicate seed, irrespective of filename. Seeds must themselves be admitted by native tsconfig files/include/exclude/extension semantics, including explicit files and wildcard includes through permitted external workspace-access aliases; reject excluded seeds before writes. Virtual directory lookup uses the same restricted access-prefix equivalence, while native matcher result spellings remain subject to source canonicalization/auditing. Source/root suffix links never gain admission by unrestricted realpath.

Seed only record directories without a declaration: an ordinary editable declaration with the record's path, the nearest record's declaration as a default import named `parent` (omitted without one) and a local `stringParam` codec for every param in the path, per element for splats; an empty config is `{}`. Existing declarations' paths/parent fields/imports track moves, renames and records appearing or disappearing above them. Use surgical AST-position text edits; preserve other authored bytes/expressions, including UTF-8 BOM, CRLF and statement-bound directives. Insert new static imports after the module's last top-level import declaration, following that import's same-line trailing comments unless one of them spans lines or carries a directive (then directly after the import), so every existing statement/comment attachment, shebang and triple-slash reference is preserved. Name a new parent binding `parent` when no identifier in the module other than a property name uses it, otherwise `filesystemParent` (suffixed until unused). When an existing parent import still resolves, but to another file than the nearest record's declaration, and its default binding has no other references, retarget the specifier and rename the binding to `parent` if free, writing the property as shorthand when only whitespace separates key and value; an unresolvable parent specifier is only retargeted. When the declaration's params already match the path the directories give (a direct inline object with explicit unique keys equal to the path's params, or no `params` property for a path without params), rewrite only the path and keep the params bytes. Otherwise, a one-local-param rename (one param removed, one added) on a direct inline params property preserves its codec expression; pure additions (no param removed) onto an inline params object whose keys are exactly the old placeholders, through direct or shorthand properties, keep every existing property and append a `stringParam` codec per added param; a declaration without params gains a `stringParam` codec per added param. An added codec reuses the module's existing non-type `stringParam` import from `@loozo/angular-router` under its local name, else imports it as `stringParam` when no identifier in the module uses that name, otherwise as `filesystemStringParam` (suffixed until unused). Reject other opaque/ambiguous codec changes (including removing an authored local codec) rather than guessing or replacing custom behavior. That diagnostic, including the one for params that aren't a direct inline object with explicit keys (opaque maps, spreads, computed or numeric keys) and for a rename whose old param is a shorthand property, names the declaration file, the path the directories give, the params removed/added and, for unreadable params, why; it directs the fix to that file's params (removing them for a path without params, writing each as a plain `name: codec` property when unreadable or shorthand) or the directory layout, never to the builder-owned path. The builder never removes a params key itself. Do not rename application callback accesses/navigation inputs. Do not change parent-import bindings used elsewhere; count actual binding references, including shorthand values, not property/member names. Retain valid imports or reject unresolvable stale imports with unrelated uses. Inspect leading trivia, the entire removed parent import/property syntax and adjacent retained trivia through the next actual token/EOF for scoped directives, including compiler-control pragmas (`@ts-check`/`@ts-nocheck`, triple-slash reference/AMD and JSX pragmas); reject deletion rather than transferring suppression, activating a dormant pragma at module start or deleting authored rationale. Retain ordinary comments while removing obsolete syntax. Collect replacement text only from within the removed span; adjacent retained trivia is validated, never copied or deleted. Never delete editable definitions automatically.

Plan all source edits/seeds in memory, then discover/resolve/compile the combined authored/generated overlay. Preflight source syntax/provenance, admitted declaration-file semantic diagnostics, tree/catchall/componentless-leaf/matching/redirect rules, application module references, safe paths and generated ownership before any source or generated write. Do not take over whole-program semantic, compiler option/global or Angular/template validation; unrelated type errors may fail the official native build after structurally valid source/generated files have been published. Check mode validates the identical desired result and reports source/generated drift without writes. Write only changed bytes, preserve byte-identical ns mtimes, check stopped before the synchronous publication section, and retain serialized/coalesced native watch/repair/stop. No ownership manifests, sidecars, CLI, public graph API or runtime additions.

Resolve config/out relative to the Angular workspace root or as absolute paths. Resolve scans against the route config directory. Architect validates router and Angular options against the combined schema before the builder runs, so invalid options fail before outputs are touched. Reject resolved `watch: true`.

Run generation/check before scheduling `@angular/build:application` by name (Architect `scheduleBuilder`) with the passthrough options and the current target. Generation/check/validation failure prevents the official build: the builder logs the failure, with every diagnostic the generator collected, through the Architect logger and returns `{ success: false }` rather than throwing. Forward the first native BuilderOutput unchanged, including failure fields; propagate official exceptions. Stop the official run after the first output, including one that otherwise remains alive. This is one-shot, not watch mode. Consumer supplies Angular's normal application build dependencies. No experimental `@angular/build` API or `@angular/build/private` is used.

## 13. Companion serve builder [S]

Builder name: `@loozo/angular-router:serve`.

Options are `@angular/build:dev-server` options, from the workspace configuration or the command line, which pass through unchanged, plus the ones below. The builder schema is generated at package build from the installed `@angular/build` dev-server schema (`scripts/builder-schemas.mjs`), replacing its `poll` with the one below and keeping Angular's other options, defaults, checks and `additionalProperties: false`, so the CLI offers every option as a flag and rejects unknown ones; a test fails when the committed schema is stale. Architect applies the copied defaults before serve runs; they equal the defaults the dev server applies to the forwarded options itself, so they change nothing it sees.

- Required `buildTarget`: a target using `@loozo/angular-router:application`, resolved as Angular's dev server resolves it. Router options come from that target and are not repeated. Angular's dev server reads the target's options itself and validates them against the companion schema, which carries Angular's application defaults and checks. Reject a resolved `check: true`: serve always writes. Serve never executes the companion application builder.
- Optional `poll: number | false`. Omitted, serve passes `poll: 1000` to the dev server; `false` passes none, so the router adds no default and Angular's own configuration applies (native file events unless the build target sets `poll`). Other values must be positive milliseconds. The CLI flag accepts milliseconds only; `false` is workspace configuration. `0` is rejected: Angular 22.2.2 turns any numeric `poll`, zero included, into chokidar polling with that interval, so it can't mean native events.

1. Architect validates the options against the builder schema before the builder runs. Validate the build target before watching or generating.
2. Start watching configured route roots **before initial generation** so initial edits are not missed.
3. Initial generation must succeed before scheduling `@angular/build:dev-server` by name with the passthrough options and the current target. A failed initial generation is logged, emitted as `{ success: false }`, and completes the builder without starting the dev server.
4. Forward continuous native success/failure outputs unchanged.
5. Add/change/remove implementation files in route roots trigger serialized, coalesced regeneration; output safety/ownership rules remain.
6. Later generation errors are logged but leave the server running for the next repair. Angular may serve the prior successful build or display a build error after removed inputs.
7. Changed consumed generated files permit Angular rebuilding without server restart. Byte-identical outputs are not touched and do not guarantee an Angular rebuild.
8. Stop closes both watcher and the official run. Edits after stop cause no generation writes.

An authored file may temporarily trigger Angular's rebuild before generation publishes updated output. No whole-build transaction, automatic restart, watch guarantee for arbitrary imported helper/config changes, or custom application build pipeline is added.

## 14. Required real application proof [V]

Use one self-contained Angular 22.2.2 application with generated configuration, standalone primary-outlet pages, official application build/dev-server, provideRouter, provideClientHydration, and official Angular SSR server rendering. Do not introduce a custom renderer or add blocking initial navigation to the shared hydration configuration.

The application has:

- Componentless `teams/$teamId`, owning numeric teamId and optional numeric score.
- Child `items/$id`, numeric id and local item resolver consuming inherited parsed values through a deterministic application provider.
- Child alias `old-items/$id` targeting item, dropping search/fragment.
- Typed direct/alias links and a query-only score link.
- Separate DOM evidence for parsed values and local resolved item data.
- A handle-only route without resolvers, whose search includes a `withFallback` key.
- Explicit paramsOrQueryParamsChange on item for query-only resolver reruns.

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

Use server-safe resolver imports/providers and deterministic server/browser values. The local resolver may run independently on server/browser; there is no guarantee of one execution and no custom transfer cache. Keep handle-only SSR rendering separate from resolver-gated rendering so one path cannot mask failure in the other.

This is development-server Chromium proof, not production serving, cross-engine certification, nondeterministic hydration support, or a complete SSR framework.

## 15. Deliberate exclusions and unspecified edges [E]

Excluded: replacing Angular Router; a separate runtime routing framework; public source-graph/library-generation APIs and their exported model types; required `/tooling` or `/generated-runtime` entry points; standalone generation CLI; general-purpose scaffolding or authored rewrites beyond the structural filesystem fields in §12; `.mts`, `.cts`, or `.tsx` authored route/page support, or a general authoring-format/interoperability guarantee beyond `.ts` Angular consumers; loader/data/transfer caches; server functions/RPC; custom SSR renderer; rich built-in codecs/schema adapters; named outlets, unnamed/nonterminal/multiple wildcard forms, custom matchers and other native structural overrides; dynamic catchall-relative traversal, arbitrary URL/object-target/query-merge APIs beyond §6; release/publication; unfinished broader Version 1 integration; original implementation/module reuse; preserving private helper APIs or exact old emitter bytes.

Unspecified rather than new requirements: exotic Proxy/property-descriptor behavior; every malformed untyped codec invocation; enum duplicate/empty-list mutation policies; every wrapper-of-wrapper combination beyond §4; arbitrary any/unknown/thenable type tricks; exhaustive custom serializers/LocationStrategies/detached-route reuse; arbitrary invalid module cycles; total diagnostic accumulation policy; byte-level BOM/line-ending/trivia compatibility with the old emitter; crash-durable or concurrent-writer filesystem publication.

Unsupported/unspecified cases must not be used as hidden evaluation requirements. Any concrete new requirement discovered during preparation is resolved before the target is locked; during the measured run it is a spec issue, not permission to silently extend the product.
