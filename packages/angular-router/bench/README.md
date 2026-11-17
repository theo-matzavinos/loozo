# Scale benchmark

Measures how `@loozo/angular-router` scales with the number of routes: first generation, regeneration while serving, `ng build`, type-checking and bundle size, each on a generated fixture of 100, 300 and 1,000 routes by default. A second workload measures the same routes declared through `@loozo/angular-launch`'s route extension; see [Launch workload](#launch-workload).

It runs on demand only, not in CI. Timings depend on the machine and on whatever else it's running, so compare numbers from one machine under similar load, and read them next to the machine and load averages recorded with them.

## Running

Prerequisites, once per checkout and again after changing the package's source:

```sh
pnpm install --frozen-lockfile                # at the repo root
pnpm --dir packages/angular-router build      # the benchmark runs the built package
pnpm --dir packages/angular-launch build      # the Launch workload also runs built Launch
```

The benchmark checks that the package is built but not that the build is current. From `packages/angular-router`:

```sh
pnpm run bench                                # 100, 300 and 1,000 routes
pnpm run bench --sizes 10,100 --out /tmp/new-directory
pnpm run bench --check                        # also compare against bench/budgets.json
pnpm run bench --workload launch --check      # the Launch workload, against bench/launch-budgets.json
```

| Option                | Default                                  | Meaning                                                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--workload <name>`   | `router`                                 | `router` or `launch` (see [Launch workload](#launch-workload)).                                                                                                                                                                            |
| `--sizes <list>`      | `100,300,1000`                           | Comma-separated route counts, each a positive multiple of 10. Each size gets its own fresh consumer.                                                                                                                                       |
| `--out <dir>`         | a new directory under the OS temp dir    | Where consumers, logs and `results.json` go. It must not exist yet or be empty.                                                                                                                                                            |
| `--samples <list>`    | `generate=3,edits=3,build=1,ngc=3,tsc=1` | Samples per measurement; give only the ones to change, such as `--samples build=3`. Metrics are medians.                                                                                                                                   |
| `--timeout <seconds>` | `1200`                                   | Limit for each command and each wait. Exceeding one fails the run. A wait checks its limit between polls, so a long synchronous generation pass can overrun it; the serve process as a whole is killed at the limit times (3 + 2 × edits). |
| `--check [file]`      | the workload's budgets file              | After the run, compare every budgeted metric against its budget and exit nonzero, listing each one exceeded. The router workload reads `bench/budgets.json`, the Launch workload `bench/launch-budgets.json`.                              |

Sizes run one after another and every heavy step runs alone; don't start two runs at once on one machine. The 1,000-route size dominates: expect it to take tens of minutes. Progress goes to stderr; the results table goes to stdout at the end, ready to paste below.

Each run writes `<out>/results.json` and, per size, `<out>/<routes>/consumer` (the scratch app) and `<out>/<routes>/logs` (every command's output, the serve phase's edit samples and its Architect logs).

## Fixture

The fixture is the repository's `examples/angular-router` app with a generated route tree in place of its routes, a pure function of the size. Route definitions are authored up front (`route.ts` files with paths, parents and config), in filesystem mode. The tree repeats a block of ten declarations, four digits naming each block:

```text
src/routes/gNNNN/            layout page with a RouterOutlet; canMatch, resolve and title,
  guard-helper.ts            whose guard and resolver call these two helper modules
  resolver-helper.ts
  static/l0 … static/l6      seven static leaves; l1 has a title
  $id/                       numberParam id, layout page
    detail/                  leaf, inherited id
```

`static/` is a plain directory without a page, so it contributes a URL segment but no declaration; it keeps the leaves from overlapping `$id`. URLs and declarations are at most three levels deep. Besides each block's root, the fixture has one resolver (`g0000/static/l2`). Each block's helpers read distinct globals, so the bundler can't fold them together.

`gNNNN` and `gNNNN/$id` have children, so both are route groups: their children's records load from their `children.generated.ts` (two per block). The root callbacks keep each block's root copy and its two helpers in the startup bundle, the edge that split it into a file per block before route groups.

Every page uses the generated route shape a consumer would: `injectRoute()` from its colocated `route.generated.ts`, `title()` read in its template (and `params().id` or `data()` where it has them), its `params`, `search` and `data` signals, and a typed `link({ to })` to a sibling's `destination` from that sibling's `destination.generated.ts`. The shell uses `injectActiveRoute()` from `generated/routes.generated.ts`, reads the active title and narrows with `is()` to read and navigate with `g0000/$id`'s typed `id`.

## Metrics

Each metric key below is how `results.json` and the budgets file name it. Times are milliseconds, sizes bytes; the table shows times in seconds.

| Key                                                    | What it measures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate.ms`                                          | First generation: the awaited internal `generate()` call in a fresh Node process, with every generated file removed and no persistent compiler state. Excludes Node startup and module loading. The OS file cache is warm, so this isn't a cold-disk number. Every sample must publish identical files and leave the authored files untouched.                                                                                                                                                                                                                                                            |
| `generate.processMs`                                   | The same sample's whole process, from spawn to exit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `serve.startupMs`                                      | Serve: from scheduling the router serve target to its first successful build. Includes its initial generation (which finds nothing to change). Angular's dependency prebundling starts in this window but can finish after it, so the first edit may overlap it.                                                                                                                                                                                                                                                                                                                                          |
| `serve.generatedMs`                                    | Serve: from writing an edit to `g0000/static/l0/route.ts` until both files it changes hold their full expected bytes: the route's `route.generated.ts`, whose copy gains or loses the `.title` step, and `src/routes/g0000/children.generated.ts`, whose record gains or loses its callbacks and the import of that copy (`routes.generated.ts` only types the route, so it doesn't change). Edits alternate adding and removing a `title`, a route with no other callbacks. The expected bytes come from the generator itself, run once each way before serving starts; any other content fails the run. |
| `serve.servedMs`                                       | Serve: from the same write until the dev server serves the changed record in `g0000`'s children chunk, found by following the `import()` of `g0000`'s loader in `main.js`. Includes Angular's rebuild after generation and the dev server's file watching.                                                                                                                                                                                                                                                                                                                                                |
| `build.ms`                                             | `ng build proof` through the router's application builder, whole process, so it includes the generator preflight and CLI startup: a production browser build with scripts and styles optimization (fonts off), stats, no source maps and hashed file names.                                                                                                                                                                                                                                                                                                                                               |
| `typecheck.ngcMs`                                      | `ngc -p tsconfig.app.json --noEmit`, whole process: the app's TypeScript plus its Angular templates under `strictTemplates`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `typecheck.tscMs`                                      | `tsc -p tsconfig.app.json --noEmit --extendedDiagnostics --incremental false`, whole process: TypeScript only, no templates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `typecheck.tscCheckMs`, `.instantiations`, `.memoryKB` | That `tsc` run's own `Check time`, `Instantiations` and `Memory used` (TypeScript's figure, not the process's peak). Every reported diagnostic is kept in `results.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `bundle.initial.raw`, `.gzip`, `.brotli`               | Initial bundle: the build's output for `src/main.ts` and every JS/CSS file it reaches through static imports in `browser-stats.json` (dynamic imports, such as lazy pages, excluded), cross-checked against `index.html`. Each file is compressed on its own (gzip level 9, Brotli quality 11) and the sizes summed. The manifest's `routeTables` flag marks the files holding generated route code: `routes.generated.ts`, the children tables and the per-route destinations and route copies.                                                                                                          |
| `bundle.initial.files`                                 | Initial bundle: the number of those JS/CSS files. A small constant count relies on Angular's chunk optimizer, which runs in optimized production builds; `results.json` also lists every input module with bytes in them (`bundle.initial.inputs`).                                                                                                                                                                                                                                                                                                                                                       |
| `bundle.initial.routeCopies`                           | Initial bundle: the distinct `route.generated.ts` modules with bytes in those initial files, each counted once across them. It guards that `main` loads only the route copies its records' native options, callbacks and redirects read, not every copy. Counted by file name, so a rename of the route copies would need its pattern in `bundle.mjs` updated.                                                                                                                                                                                                                                            |
| `bundle.lazy.raw`, `.gzip`, `.brotli`                  | Every other emitted JS/CSS file, summed the same way.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Boundaries worth keeping in mind:

- Type-check numbers are absolute: there's no untyped baseline, so they aren't the generated types' cost on their own.
- The serve phase runs Architect in the benchmark's own process, polling every 20 ms. Generation blocks that process's event loop, which can delay an observation; there's no "generation settled" event to wait for. Each edit waits for the served change and 1.5 s more before the next.
- Serve uses Angular's disk cache, on for every environment, in the consumer's fresh `.angular/cache`: a developer's first `ng serve` with dependency prebundling. `ng build` runs with the disk cache off, so every build is cold.
- After the serve phase the edited route is restored, so the build, type-check and bundle measure the same fixture first generation did; the build's generated files must match first generation's.
- No browser loads the app; correctness stays with the package's own tests.

## results.json

- `options` and `conditions`: workload, sizes, samples, timeout, poll interval, and each phase's setup, including the serve and build cache policies.
- `machine`: CPU model, logical cores and available parallelism, RAM, OS, Node, pnpm, Angular, TypeScript, router and Launch versions, and the git commit with whether the checkout had changes.
- `machine.environment`: inherited `NG_*` variables and `NODE_OPTIONS`, which can change Angular's workers, type checking or output; run without them for comparable numbers.
- `sizes["<routes>"]`: `metrics` (each key's median), `samples` (each key's raw values), `load` (load averages and free memory before and after each phase), `fixture` (declaration counts), `generated` (hash of first generation's files), `serve` (each edit's timings and before/after hashes), `tscDiagnostics`, and `bundle` (totals plus a per-file manifest: path, initial or lazy, whether it holds the generated route tables, raw, gzip and Brotli bytes).

## Budgets

`--check` reads a JSON file of maximums by route count, using the metric keys above in their `results.json` units, and fails on any value above its maximum and on a budgeted metric the run didn't record, such as a serve budget in a Launch run. Sizes the run didn't measure are skipped, and the file is validated before anything runs:

```text
{ "<routes>": { "<metric key>": <maximum>, … }, … }
```

For example, `"1000": { "serve.generatedMs": …, "bundle.initial.gzip": … }` budgets two metrics at 1,000 routes.

`bench/budgets.json` holds regression guards for the recorded run below, not targets: timings are its median plus 30%, rounded up to the second; `typecheck.instantiations` plus 10%; `bundle.initial.raw`, `bundle.initial.gzip` and `bundle.initial.brotli` plus 2%; byte and instantiation budgets rounded up to the thousand; `bundle.initial.files` and `bundle.initial.routeCopies` at their measured counts, since a count doesn't vary between machines, so a change that adds an initial file or keeps one more copy in `main` re-records it in the same change. They describe the machine that recorded them. A change that makes generation faster tightens them in the same change, from a new recorded run.

## Results

Recorded 2026-11-16 on top of `006bef2`, with route groups (every route with children loads them through `loadChildren`) and the fixture's root callbacks: 13th Gen Intel Core i7-13620H (16 logical cores), 31 GiB RAM, Linux 7.2.15; Node v24.21.0, pnpm 12.9.1, Angular 22.2.6, TypeScript 6.0.3, router 0.0.9. The one-minute load average stayed between 0.7 and 2.5.

| Metric (median)                      | 100 routes | 300 routes | 1000 routes |
| ------------------------------------ | ---------: | ---------: | ----------: |
| First generation: generate()         |     2.30 s |     4.66 s |     11.61 s |
| First generation: fresh process      |     2.50 s |     4.87 s |     11.83 s |
| Serve: startup to first build        |     4.29 s |     8.93 s |     21.72 s |
| Serve: edit → generated files        |     1.27 s |     3.29 s |     10.64 s |
| Serve: edit → served children chunk  |     2.50 s |     4.52 s |     13.11 s |
| ng build (incl. generator preflight) |     5.78 s |     9.88 s |     23.86 s |
| Type-check: ngc --noEmit             |     2.10 s |     3.51 s |      7.86 s |
| Type-check: tsc --noEmit             |     1.07 s |     1.75 s |      3.63 s |
| Type-check: tsc check time           |     0.61 s |     1.17 s |      2.68 s |
| Type-check: tsc instantiations       |    152,157 |    329,197 |     948,837 |
| Type-check: tsc memory used          | 140,029 KB | 226,902 KB |  430,517 KB |
| Initial bundle: raw                  |  230,831 B |  240,655 B |   275,095 B |
| Initial bundle: gzip                 |   70,244 B |   71,936 B |    77,891 B |
| Initial bundle: brotli               |   62,447 B |   63,364 B |    66,050 B |
| Initial bundle: JS/CSS files         |          2 |          2 |           2 |
| Initial bundle: route copies         |         10 |         30 |         100 |
| Lazy chunks: raw                     |  100,355 B |  301,855 B | 1,007,450 B |
| Lazy chunks: gzip                    |   60,493 B |  181,848 B |   607,432 B |
| Lazy chunks: brotli                  |   53,310 B |  160,351 B |   536,115 B |

What it shows:

- Generation grows with the route count: 3.3× the routes from 300 to 1,000 take 2.5× as long.
- Type-checking grows roughly linearly with the route count.
- The initial bundle is `main` plus one framework chunk at every size. It holds the global table, each block root's record with its route copy, its two helpers and its destination, and the shell's `g0000/$id` destination; every children table and every descendant's copy and destination are lazy. Lazy page chunks and children tables grow linearly with the routes.

### Route groups

The same machine on 2026-11-16, at `006bef2` before (no route groups, the previous fixture) and after (route groups, the fixture with root callbacks). Sizes and instantiations are deterministic; the "before" run took one timing sample per metric, so its timings aren't compared. Its initial bundle had 12, 32 and 102 files, `main` plus about one shared chunk per block of ten routes.

| Metric                         | 100 routes          | 300 routes          | 1000 routes                |
| ------------------------------ | ------------------- | ------------------- | -------------------------- |
| Initial bundle: JS/CSS files   | 12 → 2              | 32 → 2              | 102 → 2                    |
| Initial bundle: raw            | 246,941 → 230,831 B | 289,990 → 240,655 B | 441,356 → 275,095 B (−38%) |
| Initial bundle: gzip           | 74,448 → 70,244 B   | 84,451 → 71,936 B   | 118,878 → 77,891 B (−34%)  |
| Initial bundle: brotli         | 65,886 → 62,447 B   | 73,510 → 63,364 B   | 99,990 → 66,050 B (−34%)   |
| Initial bundle: route copies   | 31 → 10             | 91 → 30             | 301 → 100                  |
| Lazy chunks: raw               | 73,351 → 100,355 B  | 220,231 → 301,855 B | 734,311 → 1,007,450 B      |
| Lazy chunks: brotli            | 42,082 → 53,310 B   | 126,056 → 160,351 B | 421,175 → 536,115 B        |
| Type-check: tsc instantiations | 128,809 → 152,157   | 259,529 → 329,197   | 717,049 → 948,837 (+32%)   |

Why the numbers moved:

- `main` no longer reaches any descendant's destination or route copy, so nothing a lazy page imports is shared between `main` and one block's pages, and the per-block chunks are gone. The 1,000-route initial Brotli is under `acff08c`'s 82,179 B, before per-route copies split the bundle.
- The remaining initial copies are the block roots': their `canMatch`, `resolve` and `title` keep each root's copy and two helpers in `main` (a route's own record stays in its parent's table), and Angular's chunk optimizer folds them into it.
- Lazy bytes grow with the fixture's new root callbacks and helpers, and the children tables themselves.
- Instantiations grow mostly with the fixture: without the root callbacks, the route-group tree took 724,455 at 1,000 routes, 1.0% over the "before" run. The rest is the 100 roots' three extra steps.

### Route copies and destination files

The same machine on 2026-11-14 (`acff08c`) and 2026-11-15 (the run recorded then), same fixture and samples:

| Metric (median)                | 100 routes          | 300 routes          | 1000 routes                |
| ------------------------------ | ------------------- | ------------------- | -------------------------- |
| First generation: generate()   | 1.71 → 2.12 s       | 3.74 → 4.61 s       | 8.84 → 11.01 s (+25%)      |
| Serve: edit → generated files  | 1.66 → 1.06 s       | 2.69 → 4.08 s       | 8.86 → 10.54 s (+19%)      |
| Serve: edit → served main.js   | 3.38 → 2.31 s       | 4.49 → 5.63 s       | 14.36 → 14.16 s            |
| ng build                       | 7.10 → 6.07 s       | 10.29 → 10.51 s     | 22.29 → 23.35 s (+5%)      |
| Type-check: ngc --noEmit       | 2.02 → 2.25 s       | 3.47 → 3.59 s       | 9.34 → 7.92 s (−15%)       |
| Type-check: tsc instantiations | 95,470 → 129,629    | 265,590 → 262,049   | 861,010 → 725,519 (−16%)   |
| Initial bundle: raw            | 271,014 → 259,199 B | 365,462 → 330,986 B | 696,638 → 583,382 B (−16%) |
| Initial bundle: brotli         | 63,746 → 66,658 B   | 68,089 → 75,321 B   | 82,179 → 104,684 B (+27%)  |
| Initial bundle: files          | 1 → 12              | 1 → 32              | 1 → 102                    |
| Lazy chunks: brotli            | 42,624 → 38,953 B   | 128,700 → 116,893 B | 428,086 → 390,622 B (−9%)  |

Why the numbers moved:

- Generation takes longer because each route copy is semantic-checked during generation, and type-checking covers each route's chain twice: in its `route.ts`, which stays in the program, and in its copy.
- Instantiations fall at 300 and 1,000 routes and rise at 100, where the router's generic types' one-time cost weighs more. Without the generated `loadComponent` return annotation (`(): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import(…)`), TypeScript's array subtype reduction in `routes.generated.ts` compares every lazy page module's class, including its route handle's fluent types; that took 3,102,184 instantiations at 1,000 routes, 260% over `acff08c`. The annotation stops the comparison at Angular's declared loader type and still checks each page import against it. It changes no emitted JavaScript.
- The initial bundle's split into per-group chunks was accepted then (2026-11-15) and fixed by route groups (above).

### Records carry their destinations

Each generated record now carries its own destination, and `injectActiveRoute()` reads the active route from the records instead of a table that imported every route copy into `main`. The same machine on 2026-11-15 (`0414b3d`, before) and 2026-11-16 (after), same fixture and samples. Sizes are deterministic; the timings of both runs were taken under unrelated machine load (one-minute load average 4 to 8) and aren't comparable to the recorded run above. Alternating fresh-process `generate()` runs of both versions on the same 1,000-route fixture took a median 21.85 s before and 22.15 s after.

| Metric                         | 100 routes          | 300 routes          | 1000 routes         |
| ------------------------------ | ------------------- | ------------------- | ------------------- |
| Initial bundle: route copies   | 100 → 31            | 300 → 91            | 1,000 → 301         |
| Initial bundle: raw            | 259,199 → 245,520 B | 330,986 → 288,569 B | 583,382 → 439,935 B |
| Initial bundle: gzip           | 75,758 → 74,289 B   | 88,842 → 84,270 B   | 132,900 → 118,605 B |
| Initial bundle: brotli         | 66,635 → 65,748 B   | 75,346 → 73,193 B   | 104,736 → 99,149 B  |
| Initial bundle: files          | 12 → 12             | 32 → 32             | 102 → 102           |
| Lazy chunks: raw               | 67,609 → 73,351 B   | 202,829 → 220,231 B | 676,099 → 734,311 B |
| Type-check: tsc instantiations | 129,629 → 128,809   | 262,049 → 259,529   | 725,519 → 717,049   |

The route copies left in `main` are the ones a record's native options, callbacks or redirect read: at 1,000 routes, the 100 param-bearing copies, the 100 titled leaves, their 100 parent copies and the one resolver leaf. The others moved to the lazy chunks of the pages that import them. Every destination is still initial, and `main` still splits into about one chunk per group of ten routes.

### Directory lookups

The previous recorded run (2026-11-13, `9bd0f30`) found generation growing faster than the route count: 3.3× the routes from 300 to 1,000 took 5.9× as long. About 85% of a 300-route `generate()` went to the validation program's `directoryExists`, which compared every directory the compiler asked about against every generated file; the overlay host for authored route files did the same with those. Both now answer from a precomputed set of the files' directories, with the same answers.

The same machine on 2026-11-14, at `0292b5c` before and after the change:

| Metric (median)                      | 300 routes, before | 300 routes, after | 1000 routes, before | 1000 routes, after |
| ------------------------------------ | -----------------: | ----------------: | ------------------: | -----------------: |
| First generation: generate()         |             7.22 s |            3.38 s |             61.88 s |            11.25 s |
| Serve: edit → routes.generated.ts    |             5.98 s |            2.59 s |             68.39 s |             9.73 s |
| Serve: edit → served main.js         |             7.48 s |            4.35 s |             76.92 s |            16.91 s |
| ng build (incl. generator preflight) |            12.84 s |            8.62 s |            180.05 s |            22.03 s |
| One-minute load average              |          2.5 – 3.4 |         5.9 – 6.9 |          3.3 – 11.4 |          3.1 – 5.2 |

Generated files are byte-identical before and after at every size. At 100 routes the scan was small enough that load differences dominate the comparison.

## Launch workload

`--workload launch` measures the same block of routes declared through `@loozo/angular-launch`'s route extension: the type cost of the extension's members on every handle, Launch generation, the SSR build and what Launch's record stamps keep in the startup bundle. From `packages/angular-router`, after building both packages:

```sh
pnpm run bench --workload launch                # 100, 300 and 1,000 routes
pnpm run bench --workload launch --check        # also compare against bench/launch-budgets.json
```

The consumer is the repository's `examples/angular-launch` app: its `@loozo/angular-launch:application` build target (generation with `tanstackQuery`, SSR with `outputMode: "server"`), server entry, server config and rendering config, under the project name `proof`, with the router workload's production build options. Its proof routes, verification entry and prerender configurations are left out, and its `config.ts` drops the navigation error handler that names the example's not-found route. The example's installed dependencies are linked in, with `@loozo/angular-router` and `@loozo/angular-launch` linked to the built packages, so the router has no package dependency on Launch.

The fixture repeats the router fixture's block of ten declarations (see [Fixture](#fixture)), each `route.ts` importing `defineRoute` from `@loozo/angular-launch`:

```text
src/routes/gNNNN/            context stage that refuses a call without a user header and narrows the
                             user to a string, .use(timing), and the gNNNN namespace (one query, one
                             mutation); then the router fixture's canMatch, resolve and title
  static/l0 … static/l6      no server steps; l1 has a title, as in the router fixture
  $id/                       the gNNNNItem namespace (one query, one mutation), and a canActivate,
                             resolve and title that call its query through remote
    detail/                  no server steps
src/bench.server.ts          the timing middleware and two hand-written Standard Schemas
```

The block root is the top-level route, as in the router fixture, so its stage is the first of its chain. Every page reads its block's query through `injectRoute().queries` with `injectQuery` and calls its block's mutation through `remote`; the pages under `$id` do the same with the item namespace. The shell narrows `injectActiveRoute()` to `g0000/$id` with `is()` and calls that route's mutation through `remote`.

It records every metric above except serve's: the serve phase drives the router's serve builder, and Launch's serve builder isn't in the harness. Otherwise the keys mean the same, except that `generate.ms` times Launch's public `generate()`, which writes the router's files with Launch's additions and `server.generated.ts`; `build.ms` builds the browser and the server, including Angular's route extraction; and the bundle metrics read the browser build, whose index is `index.csr.html`. `bench/launch-budgets.json` follows the same rules as `bench/budgets.json`.

### Launch results

Recorded 2026-11-17 on top of `08ad644` (L1's unified routes, with the working tree's bench changes): 13th Gen Intel Core i7-13620H (16 logical cores), 31 GiB RAM, Linux 7.2.15; Node v24.21.0, pnpm 12.9.1, Angular 22.2.6, TypeScript 6.0.3, router 0.0.9, Launch 0.0.6; default samples (generate 3, build 1, ngc 3, tsc 1). The one-minute load average stayed between 0.8 and 2.6. An earlier run the same day under an unrelated desktop workload (load average 3.3 to 11.4) measured identical sizes, instantiations and counts. The instantiations were re-recorded later that day, after context stages became whole-context (a route's context is its last stage's value): 170, 510 and 1,700 fewer, with identical sizes and counts. That run's load average was 6.0 to 11.2, so the timings and memory are the earlier run's.

| Metric (median)                      | 100 routes | 300 routes | 1000 routes |
| ------------------------------------ | ---------: | ---------: | ----------: |
| First generation: generate()         |     4.12 s |     9.11 s |     25.59 s |
| First generation: fresh process      |     4.34 s |     9.38 s |     25.92 s |
| ng build (incl. generator preflight) |    10.20 s |    20.36 s |     52.92 s |
| Type-check: ngc --noEmit             |     3.38 s |     6.92 s |     19.14 s |
| Type-check: tsc --noEmit             |     1.88 s |     3.54 s |     11.32 s |
| Type-check: tsc check time           |     1.09 s |     2.64 s |      9.87 s |
| Type-check: tsc instantiations       |    222,093 |    621,773 |   2,045,853 |
| Type-check: tsc memory used          | 255,699 KB | 458,477 KB |  880,459 KB |
| Initial bundle: raw                  |  342,601 B |  355,983 B |   402,803 B |
| Initial bundle: gzip                 |  105,984 B |  108,126 B |   115,627 B |
| Initial bundle: brotli               |   93,568 B |   94,501 B |    97,394 B |
| Initial bundle: JS/CSS files         |          2 |          2 |           2 |
| Initial bundle: route copies         |         10 |         30 |         100 |
| Lazy chunks: raw                     |  135,929 B |  407,867 B | 1,359,757 B |
| Lazy chunks: gzip                    |   74,910 B |  224,621 B |   748,666 B |
| Lazy chunks: brotli                  |   66,741 B |  199,935 B |   666,144 B |

Next to the router workload's [recorded run](#results), which has no server steps, no TanStack Query and no SSR:

| Metric                         | 100 routes          | 300 routes          | 1000 routes                    |
| ------------------------------ | ------------------- | ------------------- | ------------------------------ |
| First generation: generate()   | 2.30 → 4.12 s       | 4.66 → 9.11 s       | 11.61 → 25.59 s (×2.20)        |
| ng build                       | 5.78 → 10.20 s      | 9.88 → 20.36 s      | 23.86 → 52.92 s (×2.22)        |
| Type-check: ngc --noEmit       | 2.10 → 3.38 s       | 3.51 → 6.92 s       | 7.86 → 19.14 s (×2.44)         |
| Type-check: tsc instantiations | 152,157 → 222,093   | 329,197 → 621,773   | 948,837 → 2,045,853 (×2.16)    |
| Initial bundle: raw            | 230,831 → 342,601 B | 240,655 → 355,983 B | 275,095 → 402,803 B            |
| Initial bundle: brotli         | 62,447 → 93,568 B   | 63,364 → 94,501 B   | 66,050 → 97,394 B              |
| Initial bundle: JS/CSS files   | 2 → 2               | 2 → 2               | 2 → 2                          |
| Initial bundle: route copies   | 10 → 10             | 30 → 30             | 100 → 100                      |
| Lazy chunks: raw               | 100,355 → 135,929 B | 301,855 → 407,867 B | 1,007,450 → 1,359,757 B (+35%) |

What it shows:

- Instantiations are 1.46×, 1.89× and 2.16× the router workload's, and the gap widens with the routes: 3.3× the routes from 300 to 1,000 take 3.29× the instantiations, against the router workload's 2.88×. The extra is the Launch types: stages, procedures, the `remote` and `queries` members on every handle in `RouteTypes`, and the pages' and shell's reads of them. The run doesn't break it down further.
- The initial bundle carries about 31 KB of Brotli more at every size: the app's providers (`HttpClient`, hydration, TanStack Query and Launch's client), not the routes. From 100 to 1,000 routes it grows by 3,826 B of Brotli against the router workload's 3,603 B.
- Both runs were taken under similar load (one-minute load average up to 2.5 and 2.6), a day apart on different commits. Generation takes 1.8× to 2.2× as long: Launch generation writes the router's files with Launch's additions, its procedure metadata and `server.generated.ts`, and checks them. The build also builds the server and runs Angular's route extraction, so it isn't the router build's like for like.

### Record stamps

Generation stamps every non-redirect Launch record with `...extension(route_x)`, which value-imports that route's copy into the table holding the record. Since route groups, nested records live in their parent's lazily loaded `children.generated.ts`, so only top-level records' stamps reach `routes.generated.ts` and the startup bundle. The stamps don't make every copy initial:

- Initial route copies are 10, 30 and 100: the top-level block roots' only, as in the router workload, where the roots' callbacks already keep them in `main`. In this fixture the stamps add no initial copy. A top-level Launch route without callbacks, which the fixture doesn't have, would add its copy to `main` through its stamp.
- Each root copy in `main` is larger: 333 B minified at 100 routes and above (with Launch's procedure names, kinds and namespaces), against 130 B for the router workload's root copy in a 10-route run.
- All 900 nested copies at 1,000 routes are in lazy chunks that also hold a children table: the stamp loads each copy with its parent's children, before its page. In the router workload, only the copies whose records read them do; at 10 routes, 3 of its 9 nested copies were in a children table's chunk and 6 only in their pages' chunks. That moves bytes into the lazy children chunks, not into `main`.
