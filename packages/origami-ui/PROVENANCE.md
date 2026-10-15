# Provenance

This package was rebuilt clean-room in a separate repository, `origami-ui-rebuild` (branch `rebuild`), and moved into this monorepo on 2026-10-15 as one squashed change, `6e2007f`. The source history is not imported. Its commits:

| Commit                                     | Date       | Content                                                         |
| ------------------------------------------ | ---------- | --------------------------------------------------------------- |
| `5391a4cacebfe8c883d138f5a175ff052a0d0796` | 2026-10-11 | Implementation-free seed: frozen contracts, consumer seeds      |
| `ba58b39c659854c154115ee71b3a5d4b45a5dbee` | 2026-10-12 | Library implementation and the full acceptance matrix           |
| `dc5675ebaea1cf4ddff8df54a195d9b2a28bdddb` | 2026-10-14 | Per-area regressions migrated into the acceptance suite         |
| `bc8c86d96d9296cf3a4ea140e60127edb6d670de` | 2026-10-14 | One acceptance runner; per-area harnesses retired (moved state) |

The rebuild was pinned to Angular 22.1.5. The move requalified it on Angular 22.2.2 with the unchanged 24-project release gate.

## Changes in loozo

| Commit                                     | Date       | Content                                                                                   |
| ------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------- |
| `6e2007fa8aefc1510de281e227952139057d1d9a` | 2026-10-15 | The move above; library sources byte-identical to `bc8c86d`                               |
| `8c0190c9359a882a41d97e96dae7ca1578aaa322` | 2026-10-15 | Popover positioning failure and outside-pointer completion; SPEC and CASES V6 amended     |
| `884df3f21d1c9389d5014ecc1baee69687a752d1` | 2026-10-15 | Collection sorted-order reuse; redundant signal facades dropped                           |
| `b2388f10a60fc97ecc3c1b03815d0bbc397aa18e` | 2026-10-15 | Popover participants and preparation split out of the context                             |
| `c75ef6600ee9a5182b86c52eb4256b8a22f8070d` | 2026-10-15 | README usage documentation and snippets; TSDoc corrections; provider helper types unified |
| `29ee42a17666fa24803dc994176b3c3bc4349690` | 2026-10-15 | Collection skips order validation until first read                                        |
| —                                          | 2026-10-15 | 0.0.1 release preparation: `~22.2.2` peers, no longer private, README for npm             |
| —                                          | 2026-10-15 | Specs restated as the current product contract; scope-and-growth policy                   |

## Where things moved

| In `origami-ui-rebuild`        | Here                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/origami-ui/`         | `packages/origami-ui/` (library sources, ng-packagr config)                                                                |
| `specs/origami-ui.md`          | [`SPEC.md`](SPEC.md)                                                                                                       |
| `specs/origami-ui-popover.md`  | [`SPEC-POPOVER.md`](SPEC-POPOVER.md)                                                                                       |
| `specs/origami-ui-acceptance/` | [`acceptance/`](acceptance/)                                                                                               |
| `tests/acceptance/`            | [`tests/acceptance/`](tests/acceptance/)                                                                                   |
| `apps/consumer/`               | [`examples/origami-ui/`](../../examples/origami-ui), staged into `.scratch/consumer` for acceptance                        |
| `specs/origami-ui-rebuild.md`  | [`docs/rebuild/HANDOFF.md`](docs/rebuild/HANDOFF.md)                                                                       |
| `README.md`, `REBUILD.md`      | [`docs/rebuild/README.md`](docs/rebuild/README.md), [`docs/rebuild/REBUILD.md`](docs/rebuild/REBUILD.md)                   |
| `AGENTS.md`, `CODING.md`       | [`docs/rebuild/AGENTS.seed.md`](docs/rebuild/AGENTS.seed.md), [`docs/rebuild/CODING.seed.md`](docs/rebuild/CODING.seed.md) |
| `INPUTS.sha256`                | [`docs/rebuild/INPUTS.sha256`](docs/rebuild/INPUTS.sha256)                                                                 |
| `.verification/acceptance/`    | `.acceptance-evidence/` (ignored)                                                                                          |

Everything under `docs/rebuild/` is historical: seed-era instructions and authority, kept as written. Their paths refer to the rebuild repository's layout above, and their authority statements no longer apply.

## Input receipts

- [`docs/rebuild/INPUTS.sha256`](docs/rebuild/INPUTS.sha256) is the seed's original receipt, from `5391a4c`, over the rebuild's `specs/` paths. It predates the approved element-host-only SSR identity amendment to the main contract, so its `specs/origami-ui.md` line no longer matches that file at `bc8c86d` (`8c91928d…`).
- [`INPUTS.sha256`](INPUTS.sha256) is the current receipt for the moved contracts, generated on 2026-10-14 and regenerated on 2026-10-15 after the R3 contract amendments (outside-pointer completion, positioning failure, V6), and again on 2026-10-15 after the specs were restated as the current product contract. Verify it from this directory with `sha256sum -c INPUTS.sha256`.
