# Launch names its route-extension types through a private /_route entry with stable names

A route made by Launch's `defineRoute` has an inferred type that names `LaunchSpec`, Launch's route-extension spec, and, for each step the route still offers, `LaunchStep` and that step's signature (`ContextStep`, `UseStep` or `RemoteStep`). When an application or library emits declarations for an exported route, TypeScript must spell those names through a package export, or it fails with TS2883. Launch stopped exporting its route-seam types from the root before 1.0, so they could change without a major. These five therefore move to a types-only `@loozo/angular-launch/_route` entry. The subpath and the five names are public within a major, because declarations a library already published spell `import("@loozo/angular-launch/_route").LaunchSpec` and the like. Their members stay private: both sides of a type check read the installed copy. `LaunchInput` and `ChainNamespaces` stay unexported, since only Launch's own declarations reference them.

## Considered options

- **Keep the five on the root entry.** Declarations are byte-identical, but types the 1.0 audit decided to un-export would stay public and frozen.
- **Move only `LaunchSpec`** (the first approved design). Not viable: a route that hasn't used every step, such as `defineRoute('x', {}).context(stage)`, fails declaration emit naming `LaunchStep`, `UseStep` and `RemoteStep`.
- **Remove them from every entry.** Not viable: a consumer emitting declarations for an exported route fails with TS2883, and router SPEC §2 requires an extension to export the types its spec names.
- **A fully private `/_route`.** A 1.x patch could move the path or rename a type and break declarations libraries already published against the public `defineRoute`.

## Consequences

One underscore entry carries a narrow promise that the others (`/_server`, `/_source-text`, `/_redirects`) don't: SPEC §Stability lists it under Public, limited to the path and the five names. `packed.mjs` pins them with a declaration file in an earlier release's spelling, and checks that fresh emit of full and partial route chains still writes them. The docs site lists `/_route` on Launch's generated-API page, like the other underscore entries. `public-types.test.mjs` no longer requires every referenced type to be public: a fixed list of package-local types may stay unexported.

Evidence: plan-4.md (decision D2, revised in decisions.md after `session.test.mjs` found the partial-chain case), prototype-1.md and design-review-1/2/3 in the Launch 1.0 freeze-breaks work evidence (2026-11-28T14-05-26-669Z…af3327ec).
