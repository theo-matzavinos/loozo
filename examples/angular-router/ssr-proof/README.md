# Native Angular SSR and hydration proof

Independent handwritten dark-mode application; supplied `examples/angular-router/src/` and its configuration remain untouched. `teams/$teamId` owns numeric teamId and optional75ms numeric score; child `items/$id` owns75ms id and deterministic local catalog resolution. The alias drops query/fragment. Typed links demonstrate direct, alias and query-only native navigation. `handle-only/$id` has delayed input parsing and no resolver.

Ordinary generated facades/routes/destinations live here only. Shared native hydration config has no blocking initial navigation or HTTP transfer cache. No custom renderer, router, product-state transfer, graph service or input cache.

After ordinary pinned workspace install and package build, run from repository root:

```sh
pnpm_config_pm_on_fail=error pnpm_config_verify_deps_before_run=error pnpm --filter @loozo/angular-router run test:ssr /absolute/owned/absent-evidence-directory
```

The durable harness copies this actual app, binds genuine installed dependency leaves/current package, and runs official Architect build/serve. Inspect raw HTTP302/HTML/headers, native strict template/type commands, before/after generated inventory, Chromium exact-original-Node hydration/component/query reuse and document-request/error journals, and production esbuild closure/lazy-chunk evidence in that directory. Generated inputs and local resolved output have distinct DOM elements. All owned runs/browser/server processes stop afterward.

For ordinary manual demonstration after the app's normal dependency leaves are bound, run the actual Angular CLI in this directory:

```sh
node ../../../packages/angular-router/node_modules/@angular/cli/bin/ng.js run proof:build
node ../../../packages/angular-router/node_modules/@angular/cli/bin/ng.js run proof:build:ci
node ../../../packages/angular-router/node_modules/@angular/cli/bin/ng.js run proof:serve
```

`proof:build` delegates production to `@angular/build:application`; `proof:serve` delegates development to the official dev-server. The loopback built Node entry is intentionally only the SSR HTTP proof surface, not a production static-asset hosting solution. No frozen Ginitial/final qualification is implied.
