# Clean-room Origami rebuild

> **Historical.** Seed-era document from the `origami-ui-rebuild` repository, kept as written. Its paths refer to that repository's layout, and its authority statements no longer apply. See [PROVENANCE.md](../../PROVENANCE.md) for where everything moved.

Read `CODING.md`, `REBUILD.md` and the complete frozen product contracts before work. Apply the owner's general instructions and current planning-session/implement-review-loop workflow; hand applicable standards to children explicitly.

Current authority: isolated dependency/build/SSR seed setup and one implementation-free seed commit on `rebuild`. Product implementation, product commits, original-repository integration and publication require later explicit authority. No behavior is authorized merely because source directories exist.

The library is in `packages/origami-ui`; its seed entrypoints are deliberately empty, not placeholder primitives. `apps/consumer` is an ordinary Angular SSR setup smoke app, not product acceptance. `specs/origami-ui-acceptance` contains public consumer seeds/case definitions, not an executed evaluator.

Do not consult/copy archived Origami implementation, tests, consumers or Git history. Official dependency docs/source and this seed's public contract/material are allowed. Keep the original `loozo` repository and unrelated work untouched.

Once the entire rebuild is explicitly authorized, ONE fresh main session owns bounded delegated slices, current-result review, verified integration and whole-contract completion. Manual human review remains on request. Formal Baseline auditing was explicitly skipped; make no qualification claim. Full packaged public TSDoc and Chromium/Firefox/WebKit × dev/prod × eager/incremental qualification remain mandatory.
