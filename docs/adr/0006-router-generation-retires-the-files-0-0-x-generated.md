# Router generation retires the files 0.0.x generated

`@loozo/angular-router` generation recognizes the two outputs router 0.0.1 through 0.0.9 wrote and no release emits any more, the per-route `route.generated.ts` facade with its ownership marker on the first line and `<out-dir>/destinations.generated.ts`, and replaces or deletes them as its own stale output (SPEC §11 "Ownership and filesystem effects"). A checkout built with 0.0.x, once its authored routes are ported to the current API, then builds on its first run after the upgrade instead of stopping at `Unmarked generated-output collision` and, once those files are moved aside, at import-rule advice about the old shared file's imports. Recognizing an old generated file only to retire it isn't a "fallback for old shapes" under the repository's breaking-change rule: nothing keeps working in the old shape, the file is overwritten or deleted, as Launch already does for its retired `rpc.generated.ts` and `context.generated.d.ts`.

## Considered options

- **Fail once with one diagnostic naming the files and the cleanup**: never deletes without consent, but every upgrader with a built checkout runs a manual step whose command depends on the shell (`find … -delete` isn't Windows, and a bash `**` glob misses nested routes without `globstar`).
- **Treat the first-line facade as an unmarked collision** (the reading the generated-copies redesign, PR #87, took): assumed no external 0.0.x consumers; Estia's port showed there are.

## Consequences

Generation never edits the application's own configuration: an app that lists `generated/destinations.generated.ts` by name in its Angular `tsConfig` `files`, instead of the documented `generated/**/*.ts` include, gets TypeScript's missing-file error for it on that first build. The retired markers are part of the 1.x contract, so dropping them is a major. Recognition is scoped to where 0.0.x wrote each file: the facade in the scan directory, the shared file in the output directory. The serve builder's own-write skip keeps recognizing current output only.

Evidence: plan-4.md, prototype-1.md, prototype-2.md and design-review-1/2/3 in the work evidence for slice a92d3e48 (2026-11-28T16-14-31-007Z…a92d3e48).
