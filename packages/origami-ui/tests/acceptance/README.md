# Origami UI acceptance suite

Authority: the product specifications ([SPEC.md](../../SPEC.md), [SPEC-POPOVER.md](../../SPEC-POPOVER.md)) and [`acceptance/CASES.md`](../../acceptance/CASES.md). This directory holds independent public-package checks and browser assertions; it never imports library source. The only product under test is the real built APF package, packed with `npm pack` and installed into the one consumer application.

The consumer's authored sources are the workspace example [`examples/origami-ui`](../../../../examples/origami-ui). Acceptance never installs into the example: every sync stages its authored files into the ignored scratch consumer `packages/origami-ui/.scratch/consumer`, which has its own strict npm installation of the packed tarball. The scratch manifest is the example's with only the library reference replaced by the tarball and the workspace-only `devDependencies` and `scripts` removed.

## Layout

| Path                                                                                                                                                     | Role                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `examples/origami-ui/` → `.scratch/consumer/`                                                                                                            | The one Angular SSR consumer: lazy fixture routes (`src/fixtures/*`), eager/incremental hydration configurations and the SSR-only fixtures (`server-*.ts`) that only the Node checks compile |
| `playwright.config.ts`                                                                                                                                   | The one browser configuration: the 24 product projects and, with `ORIGAMI_SUITE=calibration`, the observer calibration                                                                       |
| `{core,composition,popover,toggle,tabs,toggle-group,toolbar,radio-group,button,tooltip,field,checkbox,switch,dialog,hydration,errors,lifetimes}.spec.ts` | Product cases, 308 per project                                                                                                                                                               |
| `boolean-controls.ts`                                                                                                                                    | The case bodies `checkbox.spec.ts` and `switch.spec.ts` share                                                                                                                                |
| `co-applied-description.ts`                                                                                                                              | The case bodies `tooltip.spec.ts`, `field.spec.ts`, `checkbox.spec.ts`, `switch.spec.ts` and `toggle.spec.ts` share for a Tooltip Trigger co-applied with a Field control                    |
| `contract-test.ts`, `observation.ts`, `geometry.ts`                                                                                                      | Central runtime-error capture, SSR/hydration retention observer, independent geometry oracle                                                                                                 |
| `observer-calibration.test.ts`                                                                                                                           | Native calibration of `observation.ts`; no product imports or servers                                                                                                                        |
| `prepare-consumer.mjs`, `consumer-install.mjs`                                                                                                           | Pack the build; stage the example; warm-refresh the installed APF or install the consumer from clean                                                                                         |
| `type-checks.mjs`                                                                                                                                        | P2: public declaration positives/negatives and strict AOT template checks                                                                                                                    |
| `utility-checks.mjs`, `ssr-checks.mjs`                                                                                                                   | Node checks: utility helpers, and real AOT + `renderApplication` SSR order/identity/error cases                                                                                              |
| `package-checks.mjs`, `inventory.mjs`                                                                                                                    | P1: entrypoint, declaration and runtime export inventories, installed bytes, Core identity                                                                                                   |
| `docs-checks.mjs`                                                                                                                                        | D1 machine check: public subject inventory and authored TSDoc retention                                                                                                                      |
| `bundle-checks.mjs`, `bundle-context-audit.mjs`, `bundle-context-calibration.mjs`                                                                        | P1 bundle identity over the four AOT outputs, and its graph calibration                                                                                                                      |
| `browser-readiness.mjs`, `webkit-launch.ts`, `setup-webkit.py`, `webkit-packages.json`                                                                   | Engine launch check and the optional private WebKit library setup                                                                                                                            |
| `matrix-summary.mjs`                                                                                                                                     | Completeness check and release record for the full product matrix                                                                                                                            |
| `skip-checks.mjs`                                                                                                                                        | Source check that no spec outside `hydration.spec.ts` skips, focuses or expects failure                                                                                                      |
| `warm-servers.mjs`                                                                                                                                       | Global setup: one sequential request per fixture route on every started server before the parallel workers begin                                                                             |
| `source-identity.mjs`, `source-freshness.mjs`                                                                                                            | Optional forensic hooks (`ORIGAMI_FORENSIC=1`)                                                                                                                                               |

## Prerequisites

Run everything from `packages/origami-ui`, or from the repository root as `pnpm --filter @loozo/origami-ui run <script>`.

```sh
pnpm install --frozen-lockfile   # at the repository root
# Genuine Playwright 1.63 engines; no --with-deps or host package installation:
pnpm exec playwright install chromium firefox webkit
```

WebKit 26.6 (revision 2359) needs Ubuntu 24.04 libraries that many hosts lack. Without them, provide private copies once, outside the repository, and export their location for every later command:

```sh
export ORIGAMI_WEBKIT_DEPS_ROOT="$HOME/.cache/origami-webkit-deps"
pnpm run acceptance:webkit-setup --runtime-root "$ORIGAMI_WEBKIT_DEPS_ROOT" \
  --webkit-bundle "$HOME/.cache/ms-playwright/webkit-2359"
```

pnpm 12 passes arguments after the script name straight through; do not insert `--`. See [Private WebKit libraries](#private-webkit-libraries).

Whenever `examples/origami-ui/package.json` or the library's version or dependencies change, install the consumer from clean:

```sh
pnpm run acceptance:prepare
```

On a fresh checkout there is no installation yet, so the first `acceptance:sync` (and with it `pnpm test`, `test:fast` and `test:focus`) runs this clean installation itself, says so in one line, and then continues.

On small hosts, set `NG_BUILD_MAX_WORKERS=2` for builds; servers started for one matrix group always receive it.

## Browser-free checks: `pnpm test`

The package's `test`, which the repository root `pnpm test` also runs:

1. `acceptance:skips`: no `skip`, `fixme`, `fail` or `only` call in a spec other than `hydration.spec.ts`, the only file whose skips `matrix-summary.mjs` can accept. It fails in seconds what the matrix summary would reject only after the matrix.
2. `acceptance:sync`: build the library, stage the example into the scratch consumer and refresh only the installed APF from the new tarball. Without a verified installation, it runs the clean strict installation instead.
3. `typecheck`: the library sources and the runner sources.
4. `snippets:check`: the README's code examples in `snippets/`, against the built package.
5. `acceptance:typecheck`: the staged consumer, against the installed package.
6. `acceptance:types`: P2.
7. `acceptance:node`: utility and SSR checks.

## Fast loop: `pnpm run test:fast`

`pnpm test`, then:

1. `acceptance:browser-readiness:fast`: Chromium launch.
2. `acceptance:observer-calibration:fast`: observer calibration in Chromium.
3. `acceptance:test:fast`: every product case in one project, `chromium-development-eager-no-preference`, against one development server.

Both need the clean installation above. A missing one is created by the sync; an outdated one fails with the command to run. Neither builds production outputs, reinstalls dependencies or runs the release checks. A green `test` or `test:fast` is developer feedback, not qualification.

Staging copies changed authored files from the example and removes staged files the example no longer has; the scratch consumer's `node_modules`, `dist`, `.angular` and `.runtime` are kept. The warm refresh then replaces only `.scratch/consumer/node_modules/@loozo/origami-ui` with the tarball's bytes and records the tarball integrity in npm's hidden lockfile. The dev server's dependency pre-bundling is keyed on that lockfile, so it rebuilds the library chunk instead of serving the previous build. A library change to `dependencies`/`peerDependencies` or the version fails the refresh and needs `acceptance:prepare`. After the refresh, every installed file must equal the current build.

## Focused loop: `pnpm run test:focus`

`acceptance:sync`, then `acceptance:test:fast` with your arguments passed to Playwright. Positional arguments filter spec files by regular expression; `-g` filters titles:

```sh
pnpm run test:focus popover
pnpm run test:focus core.spec.ts -g "A1"
```

The project is `chromium-development-eager-no-preference`, so incremental-only hydration cases skip. To focus one of those, run the incremental project directly after a sync:

```sh
ORIGAMI_MATRIX_TARGET=development-incremental pnpm run acceptance:test --project=chromium-development-incremental-no-preference hydration
```

It skips every static and calibration step, so it is iteration feedback only.

## Commit gate: `pnpm run test:commit`

`test:full` with `ORIGAMI_TIER=commit`: the same static steps, then each matrix axis only where it reaches the library.

| Group                                                                   | `no-preference`                                                          | `reduce`                                                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `development-eager`                                                     | every case                                                               | the Presence specs: `core`, `composition`, `popover`, `tooltip`, `lifetimes`, `hydration` |
| `development-incremental`, `production-eager`, `production-incremental` | `hydration.spec.ts`, `errors.spec.ts` and every case with an `H` case ID | not run                                                                                   |

All three engines run every selected cell. Reduced motion changes only Presence and its composers, because consumer CSS removes the animations Presence would wait for. Incremental hydration changes how a fixture is created, which the hydration cases check primitive by primitive. Production changes the build, the server and the shape of Angular's DI errors, which the hydration and error cases cover. `matrix-summary.mjs` certifies the tier's own selection and records `"tier": "commit"`. A commit-tier summary is not release evidence.

## Release gate: `pnpm run test:full`

1. `acceptance:skips`: the source skip check.
2. `acceptance:prepare`: build the library, stage the example and run a clean, strict npm installation (`--strict-peer-deps`, no legacy/force resolution, no lifecycle scripts) of the whole pinned closure, then verify it.
3. `typecheck`, `snippets:check` (the README's code examples, against the built package) and `acceptance:typecheck`.
4. `acceptance:check`: P1 package inventory and bytes, P2 types, D1 docs, Node checks.
5. `acceptance:aot`: the four genuine AOT/SSR builds (development/production × eager/incremental).
6. `acceptance:bundles`: P1 bundle identity over those builds, from each build's separate browser and server metafiles (`browser-stats.json`, `server-stats.json`).
7. `acceptance:browser-readiness`: all three engines.
8. `acceptance:observer-calibration`: all three engines.
9. `acceptance:matrix`: the 24 product projects as four sequential runtime-hydration groups, one server each, with test files spread over workers on half the logical cores, serving the production outputs from step 5 (`ORIGAMI_PREBUILT=1`). Then `matrix-summary.mjs`.

Both `test:full` and `acceptance:matrix` start with `matrix-summary.mjs --reset`. It refuses an inherited `ORIGAMI_SUITE`, `ORIGAMI_BROWSER` or `ORIGAMI_MATRIX_TARGET`, so calibration and the matrix always cover every engine and group, and it deletes the group results and summary from earlier runs. The summary takes no arguments; pnpm appends extra `test:full` arguments to it, so they fail the gate instead of focusing it.

It stops at the first failing step. Use `NG_BUILD_MAX_WORKERS=2 pnpm run test:full` on small hosts. Every product run warms its servers first (`warm-servers.mjs`): under concurrent first requests, a cold development server can render a deferred route without its content. On the reference host (16 logical cores), `test:full` takes about 40 minutes and `test:commit` about 15.

`matrix-summary.mjs` lists the complete product inventory from the configuration and requires that:

- each of the four group results was written after the reset;
- every discovered row in the tier's projects (all 24 for `test:full`, 15 for `test:commit`) was executed exactly once;
- every row passed or is a known hydration applicability skip: one of the listed `hydration.spec.ts` tests (by title), skipped by an authored `test.skip(condition, reason)` in a project whose `hydration` metadata it does not apply to. Any other skip fails, so a new applicability skip must be added to that list;
- there were no unexpected, flaky or interrupted results and no top-level errors.

It writes `.acceptance-evidence/product/matrix-summary.json`, which records:

- the commit and any uncommitted paths;
- browser versions from the readiness check;
- the consumer's Angular, APF and Floating UI versions, Playwright and Node;
- per-project counts and the skip reasons.

## Focused runs

```sh
# One group's server and its six projects:
ORIGAMI_MATRIX_TARGET=development-incremental pnpm run acceptance:test
# One project, selected cases:
ORIGAMI_MATRIX_TARGET=development-incremental pnpm run acceptance:test \
  --project=chromium-development-incremental-no-preference --grep 'H1 H2 H3'
# One engine's calibration:
ORIGAMI_SUITE=calibration ORIGAMI_BROWSER=firefox pnpm run acceptance:observer-calibration
```

Always set `ORIGAMI_MATRIX_TARGET` for focused product runs. `--project`/`--grep` alone do not select a server, so every group's server would start. Plain `acceptance:test` without a target starts all four servers at once; use it only on a host that can afford that. Add `--workers=1` to run tests one at a time, for example to rule out load-dependent timing. Focused runs are diagnostics, never qualification.

| Variable                   | Effect                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORIGAMI_SUITE`            | `product` (default) or `calibration`                                                                                                                                      |
| `ORIGAMI_MATRIX_TARGET`    | `development-eager`, `development-incremental`, `production-eager` or `production-incremental`: one server and its six projects                                           |
| `ORIGAMI_BROWSER`          | `chromium`, `firefox` or `webkit`: restrict projects; other engines' setup is not evaluated                                                                               |
| `ORIGAMI_PREBUILT=1`       | Production servers serve existing `.scratch/consumer/dist/consumer-{eager,incremental}` instead of building first; only `test:full` sets it, right after `acceptance:aot` |
| `ORIGAMI_TIER`             | `release` (default) or `commit`: the commit gate's selection (see [Commit gate](#commit-gate-pnpm-run-testcommit))                                                        |
| `ORIGAMI_FORENSIC=1`       | Record whole-source/dependency fingerprints before and after a run and fail if they differ                                                                                |
| `ORIGAMI_WEBKIT_DEPS_ROOT` | Private WebKit libraries; when set, a missing or stale setup is an error                                                                                                  |

## Optional checks

| Command                                   | Use                                                                                                                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run acceptance:docs:audit`          | D1 plus regex probes for frozen defaults and semantic facets. They support the D1 review; they cannot replace it                                                                                                      |
| `pnpm run acceptance:bundles:audit`       | P1 plus byte pins of the reviewed SDK/builder/host sources, the exact SSR engine-manifest shape and classification of every emitted output. Run after an Angular SDK or `server.ts` change, and review any pin change |
| `pnpm run acceptance:bundles:calibration` | Seven native esbuild pass/rejection controls for the bundle graph collector, including split browser/server metafiles. Run whenever `bundle-context-audit.mjs` changes                                                |
| `pnpm run acceptance:forensic`            | `test:full` with the forensic fingerprint hooks, for evidence from an uncommitted tree                                                                                                                                |

## Evidence

Results go to `packages/origami-ui/.acceptance-evidence/` (ignored). Each selection has a fixed directory, and rerunning that selection replaces it:

- product runs: `product/<group>/`, or `product/all/` without a target, plus `-<browser>` with `ORIGAMI_BROWSER`;
- calibration: `calibration/`;
- each directory holds `playwright-results.json` and `browser-results/` (traces and screenshots of failures, case attachments).

Copy a run elsewhere to keep it.

Release qualification is:

- `test:full` green from a clean checkout of an identified commit (`tier` `release` and `uncommitted` empty in `matrix-summary.json`);
- that summary plus the four group results and the readiness, package, type and bundle receipts in `.acceptance-evidence/`;
- the D1 whole-subject semantic review, below.

A run from an uncommitted tree needs a saved patch or `acceptance:forensic`; a commit SHA does not identify unrecorded edits.

Further rules:

- **D1 review.** The machine check proves that every supported public subject is documented and that the authored TSDoc survives packaging. Accuracy of purpose, defaults, ownership, composition, lifecycle, errors, hydration and browser limits is a human review of every subject in `public-tsdoc-inventory.json`. CASES.md requires it before release, and no automated check certifies it.
- **B1** (formal Baseline audit) is skipped by agreement. No Baseline claim is made.
- **B2** runs real development and production servers, eager and incremental hydration, both motion preferences and all three engines. WebKit automation is not Safari, iOS or physical-device certification.
- Discovery (`--list`), readiness, calibration and focused or fast runs are not product qualification.

## Fixture and observation rules

- Fixtures use public package imports only: no source aliases, private Context access or guessed IDs. Generated IDs and values are compared for equality, uniqueness and stability, never for spelling.
- `observation.ts` holds the real main response to capture raw SSR HTML and pre-bootstrap node, parent, ID, association and value references, then passively records transient removal, duplicate IDs/labels and unexpected entrances while hydration proceeds. It does not replace DOM constructors, HTML, annotations or Angular hydration metadata. `hydration.spec.ts` additionally holds genuine lazy responses to prove deferred replay.
- Replay readiness is established from genuine listener registration before the trusted action. `data-shell-attached` and `data-client-render-seen` are ordinary owner callbacks, not hydration-complete barriers.
- `contract-test.ts` captures every page error and console error with structured arguments and fails a test on any it did not explicitly expect. Expected native errors are declared exactly (`expectExactly`).
- `geometry.ts` derives expected placement from measured DOM edges and independent logical-axis arithmetic, never Floating UI.
- Waits are bounded observable predicates or real animation/frame observations, not fixed sleeps. Trusted input comes from Playwright; synthetic events are labelled as handler checks, never as trusted evidence.
- Managed-lifetime cases use genuine `ViewContainerRef`/`ComponentRef` and `ApplicationRef` destruction.
- `injectUniqueId` SSR identity matching is guaranteed only for an ID rendered as its host element's `id`. Other allocations, and every `injectUniqueValue` allocation, are checked for validity, uniqueness and stability, never for server/client correspondence.

## Observer calibration

`observer-calibration.test.ts` runs 15 native DOM cases per engine against the real `observation.ts` collector and its `assertReferences` assertion. The cases cover duplicates, wrappers, same-turn moves, relabeling, entrance markers, ancestor removal and the record flush on stop. It proves the collector detects what the product cases rely on it to detect; it is not product acceptance. Keep it green in all three engines whenever `observation.ts` changes.

## Known evidence limits

These stay open and must be reported as such, not as passes:

- **L4/A3:** native find-in-page is unproven where not observed. Trusted fragment navigation is asserted wherever `onbeforematch` exists; disabled-native enhancement is unproven.
- **V6:** trusted mismatched-pointer/device gestures are unproven. WebKit's completed native drag emits no pointercancel and is annotated `platform-cancel-unobserved`.
- **V13:** out-of-order asynchronous geometry resolution is unproven without recorded interleaving.
- **V10/V12:** in the suppressed-entrance case, the platform style-cancels the obsolete paused entrance before the test can cancel it explicitly.
- **V10:** the browser paint probe is a real frame sample, not universal physical-display certification.

## Private WebKit libraries

`setup-webkit.py` authenticates the signed Ubuntu noble/security/updates indices and exactly the 13 pinned packages (versions, SHA-256 and sizes) in `webkit-packages.json`. It extracts only their data archives, without package scripts, verifies the native relocation closure, and writes inventories and a success receipt under the runtime root's `metadata/`. Pins that are missing from later indices, changed hashes, failed signatures or unresolved symbols stop the setup; a pin refresh needs review. The runtime root must be private and outside the repository and system directories.

Prerequisites: Linux x86_64, Python 3, curl, gpg/gpgv, ar, tar with xz/zstd, and ldd.

`webkit-launch.ts` checks that receipt against `webkit-packages.json` and the installed `webkit-2359` bundle. It then launches the unchanged bundled MiniBrowser with the private library path, applied to WebKit projects only. Without `ORIGAMI_WEBKIT_DEPS_ROOT`, Playwright's ordinary WebKit launch is used.
