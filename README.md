# loozo

A monorepo for Angular-related packages. Each package owns its API, contract, documentation and package-specific proofs. Angular Router is the first package, not the scope of the repository.

## Packages

| Package                                                    | Purpose                                                                                           | Status       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------ |
| [@loozo/angular-router](packages/angular-router/README.md) | Typed route declarations, URLs, navigation and route handles over Angular’s native router         | Experimental |
| [@loozo/origami-ui](packages/origami-ui/README.md)         | Headless, accessible Angular primitives: collection, presence, collapsible, accordion and popover | Experimental |

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

Each package’s `build` ends with `scripts/finish-package.mjs`, which makes `packages/<package>/dist/` the complete npm package: its own `package.json`, `README.md`, `LICENSE` and compiled files.

Pack and publish only from `dist/`; publishing from a package root fails on purpose:

```sh
pnpm build
node packages/<package>/tests/packed.mjs <absent absolute directory>
pnpm --dir packages/<package>/dist publish
```

The workspace and example applications remain private. Packages are [MIT-licensed](LICENSE).
