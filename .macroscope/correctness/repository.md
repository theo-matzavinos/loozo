These instructions restate rules from `AGENTS.md` at the repository root.

## Breaking changes are intentional

The packages have no consumers and publish `0.0.x` versions, so there are no compatibility obligations. A change may break any public API, contract, behavior or generated output when that improves the design. Do not report:

- a missing deprecation, compatibility shim, alias or fallback for an old shape
- a missing migration note or migration path
- stale output left behind by an earlier version, such as generated files a removed generator used to write, or the lack of cleanup for them
- a breaking change that ships without a major or minor version bump

Do report an in-repo caller, example, doc or spec that the change left out of date.
