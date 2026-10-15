# Provenance

This package was rebuilt clean-room in a separate repository, `origami-ui-rebuild` (branch `rebuild`), and moved into this monorepo on 2026-10-14 as one squashed change. The source history is not imported. Its commits:

| Commit                                     | Date       | Content                                                         |
| ------------------------------------------ | ---------- | --------------------------------------------------------------- |
| `5391a4cacebfe8c883d138f5a175ff052a0d0796` | 2026-10-11 | Implementation-free seed: frozen contracts, consumer seeds      |
| `ba58b39c659854c154115ee71b3a5d4b45a5dbee` | 2026-10-12 | Library implementation and the full acceptance matrix           |
| `dc5675ebaea1cf4ddff8df54a195d9b2a28bdddb` | 2026-10-14 | Per-area regressions migrated into the acceptance suite         |
| `bc8c86d96d9296cf3a4ea140e60127edb6d670de` | 2026-10-14 | One acceptance runner; per-area harnesses retired (moved state) |

The rebuild was pinned to Angular 22.1.5. The move requalified it on Angular 22.2.2 with the unchanged 24-project release gate.

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
- [`INPUTS.sha256`](INPUTS.sha256) is the current receipt for the moved contracts, generated on 2026-10-14 and regenerated on 2026-10-15 after the R3 contract amendments (outside-pointer completion, positioning failure, V6). Verify it from this directory with `sha256sum -c INPUTS.sha256`.
