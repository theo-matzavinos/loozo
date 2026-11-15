# Scale benchmark

Measures how `@loozo/angular-router` scales with the number of routes: first generation, regeneration while serving, `ng build`, type-checking and bundle size, each on a generated fixture of 100, 300 and 1,000 routes by default.

It runs on demand only, not in CI. Timings depend on the machine and on whatever else it's running, so compare numbers from one machine under similar load, and read them next to the machine and load averages recorded with them.

## Running

Prerequisites, once per checkout and again after changing the package's source:

```sh
pnpm install --frozen-lockfile                # at the repo root
pnpm --dir packages/angular-router build      # the benchmark runs the built package
```

The benchmark checks that the package is built but not that the build is current. From `packages/angular-router`:

```sh
pnpm run bench                                # 100, 300 and 1,000 routes
pnpm run bench --sizes 10,100 --out /tmp/new-directory
pnpm run bench --check                        # also compare against bench/budgets.json
```

| Option                | Default                                  | Meaning                                                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--sizes <list>`      | `100,300,1000`                           | Comma-separated route counts, each a positive multiple of 10. Each size gets its own fresh consumer.                                                                                                                                       |
| `--out <dir>`         | a new directory under the OS temp dir    | Where consumers, logs and `results.json` go. It must not exist yet or be empty.                                                                                                                                                            |
| `--samples <list>`    | `generate=3,edits=3,build=1,ngc=3,tsc=1` | Samples per measurement; give only the ones to change, such as `--samples build=3`. Metrics are medians.                                                                                                                                   |
| `--timeout <seconds>` | `1200`                                   | Limit for each command and each wait. Exceeding one fails the run. A wait checks its limit between polls, so a long synchronous generation pass can overrun it; the serve process as a whole is killed at the limit times (3 + 2 × edits). |
| `--check [file]`      | `bench/budgets.json`                     | After the run, compare every metric against its budget and exit nonzero, listing each one exceeded.                                                                                                                                        |

Sizes run one after another and every heavy step runs alone; don't start two runs at once on one machine. The 1,000-route size dominates: expect it to take tens of minutes. Progress goes to stderr; the results table goes to stdout at the end, ready to paste below.

Each run writes `<out>/results.json` and, per size, `<out>/<routes>/consumer` (the scratch app) and `<out>/<routes>/logs` (every command's output, the serve phase's edit samples and its Architect logs).

## Fixture

The fixture is the repository's `examples/angular-router` app with a generated route tree in place of its routes, a pure function of the size. Route definitions are authored up front (`route.ts` files with paths, parents and config), in filesystem mode. The tree repeats a group of ten declarations, four digits naming each group:

```text
src/routes/gNNNN/            layout page with a RouterOutlet
  static/l0 … static/l6      seven static leaves; l1 has a title
  $id/                       numberParam id, layout page
    detail/                  leaf, inherited id
```

`static/` is a plain directory without a page, so it contributes a URL segment but no declaration; it keeps the leaves from overlapping `$id`. URLs and declarations are at most three levels deep. The whole fixture has one resolver (`g0000/static/l2`).

Every page uses the generated route shape a consumer would: `injectRoute()` from its colocated `route.generated.ts`, `title()` read in its template (and `params().id` or `data()` where it has them), its `params`, `search` and `data` signals, and a typed `link({ to })` to a sibling's `destination` from that sibling's `destination.generated.ts`. The shell uses `injectActiveRoute()`, reads the active title and narrows with `is()` to read and navigate with `g0000/$id`'s typed `id`.

## Metrics

Each metric key below is how `results.json` and the budgets file name it. Times are milliseconds, sizes bytes; the table shows times in seconds.

| Key                                                    | What it measures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate.ms`                                          | First generation: the awaited internal `generate()` call in a fresh Node process, with every generated file removed and no persistent compiler state. Excludes Node startup and module loading. The OS file cache is warm, so this isn't a cold-disk number. Every sample must publish identical files and leave the authored files untouched.                                                                                                                                                                                |
| `generate.processMs`                                   | The same sample's whole process, from spawn to exit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `serve.startupMs`                                      | Serve: from scheduling the router serve target to its first successful build. Includes its initial generation (which finds nothing to change). Angular's dependency prebundling starts in this window but can finish after it, so the first edit may overlap it.                                                                                                                                                                                                                                                              |
| `serve.generatedMs`                                    | Serve: from writing an edit to `g0000/static/l0/route.ts` until both files it changes hold their full expected bytes: the route's `route.generated.ts`, whose copy gains or loses the `.title` step, and `generated/routes.generated.ts`, whose record gains or loses its callbacks and the import of that copy. Edits alternate adding and removing a `title`, a route with no other callbacks. The expected bytes come from the generator itself, run once each way before serving starts; any other content fails the run. |
| `serve.servedMs`                                       | Serve: from the same write until the dev server's `main.js` serves the changed record. Includes Angular's rebuild after generation and the dev server's file watching.                                                                                                                                                                                                                                                                                                                                                        |
| `build.ms`                                             | `ng build proof` through the router's application builder, whole process, so it includes the generator preflight and CLI startup: a production browser build with scripts and styles optimization (fonts off), stats, no source maps and hashed file names.                                                                                                                                                                                                                                                                   |
| `typecheck.ngcMs`                                      | `ngc -p tsconfig.app.json --noEmit`, whole process: the app's TypeScript plus its Angular templates under `strictTemplates`.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `typecheck.tscMs`                                      | `tsc -p tsconfig.app.json --noEmit --extendedDiagnostics --incremental false`, whole process: TypeScript only, no templates.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `typecheck.tscCheckMs`, `.instantiations`, `.memoryKB` | That `tsc` run's own `Check time`, `Instantiations` and `Memory used` (TypeScript's figure, not the process's peak). Every reported diagnostic is kept in `results.json`.                                                                                                                                                                                                                                                                                                                                                     |
| `bundle.initial.raw`, `.gzip`, `.brotli`               | Initial bundle: the build's output for `src/main.ts` and every JS/CSS file it reaches through static imports in `browser-stats.json` (dynamic imports, such as lazy pages, excluded), cross-checked against `index.html`. Each file is compressed on its own (gzip level 9, Brotli quality 11) and the sizes summed. The manifest's `routeTables` flag marks the files holding generated route code: the shared route tables and the per-route destinations and route copies.                                                 |
| `bundle.lazy.raw`, `.gzip`, `.brotli`                  | Every other emitted JS/CSS file, summed the same way.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Boundaries worth keeping in mind:

- Type-check numbers are absolute: there's no untyped baseline, so they aren't the generated types' cost on their own.
- The serve phase runs Architect in the benchmark's own process, polling every 20 ms. Generation blocks that process's event loop, which can delay an observation; there's no "generation settled" event to wait for. Each edit waits for the served change and 1.5 s more before the next.
- Serve uses Angular's disk cache, on for every environment, in the consumer's fresh `.angular/cache`: a developer's first `ng serve` with dependency prebundling. `ng build` runs with the disk cache off, so every build is cold.
- After the serve phase the edited route is restored, so the build, type-check and bundle measure the same fixture first generation did; the build's generated files must match first generation's.
- No browser loads the app; correctness stays with the package's own tests.

## results.json

- `options` and `conditions`: sizes, samples, timeout, poll interval, and each phase's setup, including the serve and build cache policies.
- `machine`: CPU model, logical cores and available parallelism, RAM, OS, Node, pnpm, Angular, TypeScript and router versions, and the git commit with whether the checkout had changes.
- `machine.environment`: inherited `NG_*` variables and `NODE_OPTIONS`, which can change Angular's workers, type checking or output; run without them for comparable numbers.
- `sizes["<routes>"]`: `metrics` (each key's median), `samples` (each key's raw values), `load` (load averages and free memory before and after each phase), `fixture` (declaration counts), `generated` (hash of first generation's files), `serve` (each edit's timings and before/after hashes), `tscDiagnostics`, and `bundle` (totals plus a per-file manifest: path, initial or lazy, whether it holds the generated route tables, raw, gzip and Brotli bytes).

## Budgets

`--check` reads a JSON file of maximums by route count, using the metric keys above in their `results.json` units, and fails on any value above its maximum. Sizes the run didn't measure are skipped, and the file is validated before anything runs:

```text
{ "<routes>": { "<metric key>": <maximum>, … }, … }
```

For example, `"1000": { "serve.generatedMs": …, "bundle.initial.gzip": … }` budgets two metrics at 1,000 routes.

`bench/budgets.json` holds regression guards for the recorded run below, not targets: timings are its median plus 30%, rounded up to the second; `typecheck.instantiations` plus 10%; `bundle.initial.raw`, `bundle.initial.gzip` and `bundle.initial.brotli` plus 2%; byte and instantiation budgets rounded up to the thousand. They describe the machine that recorded them. A change that makes generation faster tightens them in the same change, from a new recorded run.

## Results

Recorded 2026-11-15 on top of `acff08c`, with per-route destination files and route copies: 13th Gen Intel Core i7-13620H (16 logical cores), 31 GiB RAM, Linux 7.2.15; Node v24.21.0, pnpm 12.9.1, Angular 22.2.2, TypeScript 6.0.3, router 0.0.9. The one-minute load average stayed between 1.8 and 3.9.

| Metric (median)                      | 100 routes | 300 routes | 1000 routes |
| ------------------------------------ | ---------: | ---------: | ----------: |
| First generation: generate()         |     2.12 s |     4.61 s |     11.01 s |
| First generation: fresh process      |     2.31 s |     4.83 s |     11.23 s |
| Serve: startup to first build        |     5.09 s |     9.00 s |     21.45 s |
| Serve: edit → generated files        |     1.06 s |     4.08 s |     10.54 s |
| Serve: edit → served main.js         |     2.31 s |     5.63 s |     14.16 s |
| ng build (incl. generator preflight) |     6.07 s |    10.51 s |     23.35 s |
| Type-check: ngc --noEmit             |     2.25 s |     3.59 s |      7.92 s |
| Type-check: tsc --noEmit             |     1.13 s |     1.83 s |      3.80 s |
| Type-check: tsc check time           |     0.65 s |     1.23 s |      2.85 s |
| Type-check: tsc instantiations       |    129,629 |    262,049 |     725,519 |
| Type-check: tsc memory used          | 175,980 KB | 222,754 KB |  478,518 KB |
| Initial bundle: raw                  |  259,199 B |  330,986 B |   583,382 B |
| Initial bundle: gzip                 |   75,769 B |   88,854 B |   132,910 B |
| Initial bundle: brotli               |   66,658 B |   75,321 B |   104,684 B |
| Initial bundle: files                |         12 |         32 |         102 |
| Lazy chunks: raw                     |   67,609 B |  202,829 B |   676,099 B |
| Lazy chunks: gzip                    |   44,370 B |  133,205 B |   444,000 B |
| Lazy chunks: brotli                  |   38,953 B |  116,893 B |   390,622 B |

The initial bundle's file count comes from `results.json`'s per-file manifest; it isn't a metric key.

What it shows:

- Generation grows with the route count: 3.3× the routes from 300 to 1,000 take 2.4× as long.
- Type-checking grows roughly linearly with the route count.
- The initial bundle splits into chunks at scale: `main` plus about one shared chunk per group of ten routes, holding the destination files and route copies that both `main` (through the route table) and that group's lazy pages import. Each chunk compresses on its own, so compressed bytes and request count rise while raw bytes fall. Lazy page chunks grow linearly with the pages.

### Route copies and destination files

The same machine on 2026-11-14 (`acff08c`) and 2026-11-15 (this run), same fixture and samples:

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
- The initial bundle's split into per-group chunks is accepted for now (2026-11-15). Lazy route groups (B2, parked item `f94e566a`) will fix it, measured with this benchmark at 1,000 routes (follow-up `e84e039d`).

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
