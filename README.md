# loozo

A monorepo for Angular-related packages. Each package owns its API, contract, documentation and package-specific proofs. Angular Router is the first package, not the scope of the repository.

## Packages

| Package                                                    | Purpose                                                                                   | Status       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------ |
| [@loozo/angular-router](packages/angular-router/README.md) | Typed route declarations, URLs, navigation and route handles over Angular’s native router | Experimental |
| [@loozo/angular-launch](packages/angular-launch/README.md) | Typed server functions for Angular SSR applications built with `@loozo/angular-router`    | Experimental |
| [@loozo/origami-ui](packages/origami-ui/README.md)         | Headless, accessible Angular primitives                                                   | Experimental |
| [@loozo/fold-ui](packages/fold-ui/README.md)               | Styled components over Origami, copied into Angular apps by schematics                    | Experimental |

## Repository layout

- `packages/*` — publishable packages and their contracts, tests and documentation.
- `examples/*` — private, package-specific consumer applications and proofs.
- `docs/` — the private documentation site, published to GitHub Pages.

## Development

Requires Node 24.21.0 and pnpm 12.9.1.

```sh
pnpm_config_pm_on_fail=error pnpm_config_verify_deps_before_run=error pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm typecheck
pnpm test
```

Root commands run the corresponding script across `packages/*`, not the example applications. Run package-specific commands with `pnpm --filter <package-name> run <script>`; see each package’s README for its examples and extended proofs.

Each package’s `build` ends with `scripts/finish-package.mjs`, which makes `packages/<package>/dist/` the complete npm package: its own `package.json`, `README.md`, `LICENSE` and compiled files. The published README inlines its snippet embeds and points its relative links at the package's release tag on GitHub, so they work on npmjs.com.

Pack and publish only from `dist/`; publishing from a package root fails on purpose.

## Releasing

Release a package from the Actions tab: run the **Publish** workflow on `main` and pick the package. The workflow:

1. Bumps the package to the next `0.0.x` with `scripts/bump-version.mjs`. A Launch release also pins Launch to the router version on `main`, so release the router first when it changed. An Origami release also moves the Origami version fold's `ng add` installs to the new release. A fold release ships the Origami version on `main`, so release Origami first when fold relies on unreleased Origami changes.
2. Builds the package and the workspace packages it depends on, then runs its `check`, `typecheck` and `test`, plus `tests/packed.mjs` when the package has one.
3. Commits the bump as `chore(release): <package>@<version>`, tags it `<package>@<version>` and pushes both to `main` over the `publish` deploy key, the only actor that bypasses `main`'s ruleset (pull request with green `checks`, `origami-commit-gate`, the five `router-browser (<test>)` checks and `fold-consumer`, no force-push or deletion). If `main` moved during the run, the push fails and nothing is published.
4. Publishes `dist/` to npm through trusted publishing, with provenance and no stored token. If only this step fails, use **Re-run failed jobs**.

Pull requests into `main` run the **CI** workflow: every package's build, check, typecheck and test, Origami's commit gate, the router's browser tests and fold's consumer check. Every push to `main` runs the **Release gate** workflow, Origami's `test:full`. Publish refuses an Origami release unless the Release gate passed on the commit it releases; a release commit stands for its nearest non-release ancestor.

Every Friday the **Angular canary** workflow pins the workspace to Angular's `latest` release in one job and its `next` release in another, rebuilds the router's builder schemas and runs the router's and Launch's tests. It isn't a required check; its `latest` run stays red from the day Angular ships a minor the router doesn't cover until the router is released against it.

The workspace and example applications remain private. Packages are [MIT-licensed](LICENSE).
