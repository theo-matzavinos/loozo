# Launch exports its route-extension types from a private /_route entry

A route made by Launch's `defineRoute` has an inferred type that names `LaunchSpec`, Launch's route-extension spec. For each step the route still offers, it also names `LaunchStep` and that step's signature (`ContextStep`, `UseStep` or `RemoteStep`). When an application emits declarations for an exported route, TypeScript must spell those names through a package export, or it fails with TS2883. Generation's own type check covers route declarations when the tsconfig sets `declaration`, so without an export, generation itself fails for those apps.

Launch stopped exporting these seam types from its root before 1.0, so they can change without a major. They move to a types-only `@loozo/angular-launch/_route` entry. The entry is private, like the router's `_core`, which the same emitted files also name. A route's emitted declarations aren't published API: routes are application code, library routes aren't supported, and you rebuild with the Launch and router you run. The router decided the same for its routes.

## Considered options

- **Keep the five on the root entry.** Declarations are byte-identical, but types the 1.0 audit decided to un-export would stay public and frozen.
- **Remove them from every entry.** Not viable: declaration emit fails with TS2883, so generation fails for any app whose tsconfig sets `declaration`.
- **Make `/_route`'s path and names stable within a major,** so declarations a library published keep resolving across patches. Rejected: the same files spell router `_core` types, which the router doesn't make stable, so the promise would buy little and commit Launch to more than the router.
- **Export only `LaunchSpec`** (the first design). Not viable: a route that hasn't used every step, such as `defineRoute('x', {}).context(stage)`, names `LaunchStep`, `UseStep` and `RemoteStep`.

## Consequences

Declaration emit works for full and partial route chains, which `packed.mjs` checks on an installed consumer. A library that publishes route declarations can break on a Launch patch; that's unsupported. `public-types.test.mjs` no longer requires every referenced type to be public: types on `/_route` and a fixed list of package-local types may stay off the public entries. The docs site lists `/_route` on Launch's generated-API page, with the other underscore entries.

Evidence: plan-4.md (decision D2) and decisions.md (its two revisions), prototype-1.md, and design-review-1/2/3 in the Launch 1.0 freeze-breaks work evidence (2026-11-28T14-05-26-669Z…af3327ec).
