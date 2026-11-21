These instructions restate rules from `AGENTS.md` at the repository root.

## Breaking changes are intentional

The packages publish pre-1.0 versions: origami-ui, fold-ui and ui-sdk-angular on `0.0.x`, the router and Launch on `0.x` since 0.1.0. None owes compatibility before 1.0. Changes don't bump versions; Publish picks the bump, and a break in the router or Launch ships in their next minor, which Publish enforces from `!` commit subjects. A change may break any public API, contract, behavior or generated output when that improves the design. Do not report:

- a missing deprecation, compatibility shim, alias or fallback for an old shape
- a missing migration note or migration path
- stale output left behind by an earlier version, such as generated files a removed generator used to write, or the lack of cleanup for them
- a breaking change that doesn't bump a package version, since Publish picks the bump (do report a release that ships a router or Launch break as a patch)

Do report an in-repo caller, example, doc or spec that the change left out of date.
