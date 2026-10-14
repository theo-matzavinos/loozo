# Origami UI rebuild

> **Historical.** Seed-era document from the `origami-ui-rebuild` repository, kept as written. Its paths refer to that repository's layout, and its authority statements no longer apply. See [PROVENANCE.md](../../PROVENANCE.md) for where everything moved.

Contract frozen on 2026-10-11. loozo authorized isolated setup, genuine dependency installation and **one seed commit on branch `rebuild`**. Formal Baseline auditing is explicitly skipped; no qualification claim is made. Product implementation, product commits, original-repository integration and publication are not authorized yet.

The seed commit `5391a4c` was implementation-free. The library (`packages/origami-ui`) and its acceptance suite (`apps/consumer`, `tests/acceptance`) are now implemented on `rebuild`; see `tests/acceptance/README.md` for the checks and how to run them.

Read `REBUILD.md`, the full handoff and contracts in `specs/`, the acceptance README/CASES and `CODING.md`. One later explicitly authorized fresh main session owns the whole delegated rebuild.

## Contents and boundaries

- `specs/`: frozen public contracts, seven independently handwritten public consumer/type seeds, explicit cases and operational handoff. `INPUTS.sha256` identifies these exact supplied bytes.
- `packages/origami-ui/`: the library: ng-packagr metadata and seven entrypoints (an empty root plus `utils`, `collection`, `presence`, `collapsible`, `accordion`, `popover`).
- `apps/consumer/`: the one Angular SSR acceptance consumer. It installs the real packed library build and hosts the fixtures for `tests/acceptance`.
- `tests/acceptance/`: the acceptance suite: `pnpm test` (fast loop) and `pnpm run test:full` (release gate).
- `package.json` / `pnpm-lock.yaml`: genuine dependency closure. Node 24.21.0, pnpm 12.9.1, Angular framework/CLI/build/SSR 22.1.5, TypeScript 6.0.3, ng-packagr 22.1.1; Floating UI DOM/core/utils 1.8.0/1.8.0/0.2.12.
- `AGENTS.md`, `CODING.md`: applicable clean-room/authority/coding guidance.

No original repository/history, archived implementation/tests/consumers, private old attempt or evaluator machinery was copied. The source contract's provenance citation is not retrieval permission.

Metadata and ordinary setup are editable conventions. The frozen API/behavior contract is normative; acceptance additions/corrections need independent review and may not weaken it.

## Ordinary setup commands

```sh
pnpm --store-dir .runtime/pnpm/store --state-dir .runtime/pnpm/state install --frozen-lockfile
pnpm run acceptance:prepare
pnpm run serve
# http://127.0.0.1:4310 — official Angular development server, HMR disabled
```

For real production smoke runtime, stop the development server and run:

```sh
pnpm run build:consumer
PORT=4311 pnpm run serve:production
# http://127.0.0.1:4311
```

The servers bind loopback only. The ordinary Angular application builder's `security.allowedHosts` allows exactly `localhost` and `127.0.0.1`; host validation is not disabled and proxy-header trust is not enabled. Extend deployment configuration only for a real authorized deployment, not to make a test pass.

`acceptance:prepare` builds the library, packs it and installs that tarball into the consumer with a clean strict npm installation. No source aliases or shims stand in for a built library.

Generated builds, dependency stores, Angular caches and verification receipts are ignored, not seed input. Keep installs/caches private to each delegated workspace. No public-source checkout is executed by setup.

## Verified seed setup

On 2026-10-11:

- Native pinned dependency installation and repeated `--frozen-lockfile` installation passed.
- Scoped Vite+ formatting/linting passed for the authored setup sources.
- TypeScript smoke-app typecheck, Angular partial compilation/APF build of all seven empty entrypoints, and official production browser/server build passed.
- Genuine development and production HTTP responses contained smoke content, ordinary Angular SSR context/annotations and initial counter `0`.
- The constrained Chromium browser smoke clicked **Verify Angular binding** in each runtime: `0 → 1`, with no reported console/page/request errors. This did not capture pre-bootstrap node identity and is not product hydration, deferred replay, full accessibility or three-engine qualification.
- Both configured loopback hostnames served production SSR; an unrelated Host header was rejected with HTTP 400. The initial default-host-policy failure was diagnosed and corrected using the official builder allowlist, not a disabled guard.

Receipts live in ignored `.verification/` on the prepared workspace. These were seed-time checks of the empty package; product evidence comes from `pnpm run test:full` (see `tests/acceptance/README.md`).

To check the supplied input identity:

```sh
sha256sum -c INPUTS.sha256
```

To reproduce the input manifest after an explicitly approved input change, use the native producer, then review the changed contract/acceptance semantics before treating the result as frozen:

```sh
find specs -type f -print0 | sort -z | xargs -0 sha256sum > INPUTS.sha256
```

The setup delivery reports the sole seed commit's full SHA. No product execution authority follows from a clean seed, passing setup or this README.
