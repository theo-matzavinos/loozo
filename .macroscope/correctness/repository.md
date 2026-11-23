These instructions restate rules from `AGENTS.md` at the repository root.

## Breaking changes are intentional

The origami-ui and fold-ui packages publish `0.0.x` versions and Launch `0.x` versions since 0.1.0; none of them owes compatibility before 1.0. The router follows semantic versioning from 1.0.0, over the public contract in its `SPEC.md` "Stability" section. Changes don't bump versions; Publish picks the bump: a break in Launch ships in its next minor and a break in the router from 1.0.0 in its next major, which Publish enforces from `!` commit subjects. A change may break any public API, contract, behavior or generated output when that improves the design, in the router after 1.0 too. Do not report:

- a missing deprecation, compatibility shim, alias or fallback for an old shape
- a missing migration note or migration path
- stale output left behind by an earlier version, such as generated files a removed generator used to write, or the lack of cleanup for them
- a breaking change that doesn't bump a package version, since Publish picks the bump (do report a release that ships a Launch break as a patch, or a router break from 1.0.0 as anything but a major)

Do report an in-repo caller, example, doc or spec that the change left out of date.
