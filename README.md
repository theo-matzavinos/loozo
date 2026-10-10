# @loozo/angular-router

An experimental typed layer over Angular’s native router: authored route declarations, codecs, URL creation, generated destinations, navigation and route handles.

- [Package API and development commands](packages/angular-router/README.md)
- [Public contract](SPEC.md)
- [Handwritten SSR/hydration consumer](consumer/ssr-proof/README.md)

## Development

Requires Node 24.21.0 and pnpm 12.9.1.

```sh
pnpm_config_pm_on_fail=error pnpm_config_verify_deps_before_run=error pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm typecheck
pnpm test
pnpm consumer:build
pnpm consumer:check
```

`pnpm test` runs the durable public-root runtime regressions. The package also provides native application, navigation, lifecycle, packed-package and SSR/browser proofs; their commands require separate fresh evidence directories. See the package README.

The independent rebuild acceptance suite and its preserved results live outside this product repository. All 126 cases passed using the explicitly approved fixture corrections described in the package README; the original suite is not being relabeled as passing.

`@loozo/angular-router@0.0.1` is experimental and [MIT-licensed](LICENSE). The workspace and proof applications remain private.
