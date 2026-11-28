These instructions restate rules from `AGENTS.md` at the repository root.

## Breaking changes are intentional

The origami-ui and fold-ui packages publish `0.0.x` versions and Launch `0.x` versions since 0.1.0; none of them owes compatibility before 1.0. The router and Launch each follow semantic versioning from their own 1.0.0, over the public contract in their `SPEC.md` "Stability" section. Changes don't bump versions; Publish picks the bump: a break in Launch on `0.x` ships in its next minor and a break in the router or Launch from its 1.0.0 in its next major, which Publish enforces from `!` commit subjects. Launch pins the router exactly, so a pin move sets a floor on Launch's next release: while Launch is on `0.x`, a router minor or major makes it a minor; from Launch 1.0.0, a router minor makes it at least a minor, and a router major or a move of its `@tanstack/angular-query` peer range to a new major makes it a major. Publish enforces these floors. A change may break any public API, contract, behavior or generated output when that improves the design, in the router and Launch after their 1.0 too. Do not report:

- a missing deprecation, compatibility shim, alias or fallback for an old shape
- a missing migration note or migration path
- stale output left behind by an earlier version, such as generated files a removed generator used to write, or the lack of cleanup for them
- a breaking change that doesn't bump a package version, since Publish picks the bump (do report a release that ships a Launch break on `0.x` as a patch, or a router or Launch break from its 1.0.0 as anything but a major)

Do report an in-repo caller, example, doc or spec that the change left out of date.
