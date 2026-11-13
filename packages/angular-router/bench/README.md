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

Every page uses the generated route shape a consumer would: `injectRoute()` from its colocated `route.generated.ts`, `title()` read in its template (and `params().id` or `data()` where it has them), its `params`, `search` and `data` signals, and a typed `link({ to })` to a sibling's `destination`. The shell uses `injectActiveRoute()`, reads the active title and narrows with `is()` to read and navigate with `g0000/$id`'s typed `id`.

## Metrics

Each metric key below is how `results.json` and the budgets file name it. Times are milliseconds, sizes bytes; the table shows times in seconds.

| Key                                                    | What it measures                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate.ms`                                          | First generation: the awaited internal `generate()` call in a fresh Node process, with every generated file removed and no persistent compiler state. Excludes Node startup and module loading. The OS file cache is warm, so this isn't a cold-disk number. Every sample must publish identical files and leave the authored files untouched.                                                             |
| `generate.processMs`                                   | The same sample's whole process, from spawn to exit.                                                                                                                                                                                                                                                                                                                                                       |
| `serve.startupMs`                                      | Serve: from scheduling the router serve target to its first successful build. Includes its initial generation (which finds nothing to change). Angular's dependency prebundling starts in this window but can finish after it, so the first edit may overlap it.                                                                                                                                           |
| `serve.generatedMs`                                    | Serve: from writing an edit to `g0000/static/l0/route.ts` until `generated/routes.generated.ts` holds the full expected bytes. Edits alternate adding and removing a `title`, a route with no other callbacks, so each one changes that record's generated callbacks; any other content fails the run.                                                                                                     |
| `serve.servedMs`                                       | Serve: from the same write until the dev server's `main.js` serves the changed record. Includes Angular's rebuild after generation and the dev server's file watching.                                                                                                                                                                                                                                     |
| `build.ms`                                             | `ng build proof` through the router's application builder, whole process, so it includes the generator preflight and CLI startup: a production browser build with scripts and styles optimization (fonts off), stats, no source maps and hashed file names.                                                                                                                                                |
| `typecheck.ngcMs`                                      | `ngc -p tsconfig.app.json --noEmit`, whole process: the app's TypeScript plus its Angular templates under `strictTemplates`.                                                                                                                                                                                                                                                                               |
| `typecheck.tscMs`                                      | `tsc -p tsconfig.app.json --noEmit --extendedDiagnostics --incremental false`, whole process: TypeScript only, no templates.                                                                                                                                                                                                                                                                               |
| `typecheck.tscCheckMs`, `.instantiations`, `.memoryKB` | That `tsc` run's own `Check time`, `Instantiations` and `Memory used` (TypeScript's figure, not the process's peak). Every reported diagnostic is kept in `results.json`.                                                                                                                                                                                                                                  |
| `bundle.initial.raw`, `.gzip`, `.brotli`               | Initial bundle: the build's output for `src/main.ts` and every JS/CSS file it reaches through static imports in `browser-stats.json` (dynamic imports, such as lazy pages, excluded), cross-checked against `index.html`. Each file is compressed on its own (gzip level 9, Brotli quality 11) and the sizes summed. The manifest's `routeTables` flag marks the files holding the generated route tables. |
| `bundle.lazy.raw`, `.gzip`, `.brotli`                  | Every other emitted JS/CSS file, summed the same way.                                                                                                                                                                                                                                                                                                                                                      |

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

`bench/budgets.json` holds regression guards for the recorded run below, not targets: timings are its median plus 30%, rounded up to the second; `typecheck.instantiations` plus 10%; `bundle.initial.raw` and `bundle.initial.brotli` plus 2%. They describe the machine that recorded them. A change that makes generation faster tightens them in the same change, from a new recorded run.

## Results

Recorded 2026-11-13 at `9bd0f30` plus this benchmark: 13th Gen Intel Core i7-13620H (16 logical cores), 31 GiB RAM, Linux 7.2.15; Node v24.21.0, pnpm 12.9.1, Angular 22.2.2, TypeScript 6.0.3, router 0.0.9. Other work kept the one-minute load average between 9 and 18 throughout, so the timings read high.

| Metric (median)                      | 100 routes | 300 routes | 1000 routes |
| ------------------------------------ | ---------: | ---------: | ----------: |
| First generation: generate()         |     7.94 s |    25.95 s |    152.53 s |
| First generation: fresh process      |     8.52 s |    26.53 s |    153.34 s |
| Serve: startup to first build        |    18.58 s |    36.30 s |    190.15 s |
| Serve: edit → routes.generated.ts    |     6.52 s |    22.12 s |    147.26 s |
| Serve: edit → served main.js         |     8.38 s |    27.29 s |    161.78 s |
| ng build (incl. generator preflight) |    16.45 s |    48.18 s |    173.49 s |
| Type-check: ngc --noEmit             |     6.05 s |    11.42 s |     29.23 s |
| Type-check: tsc --noEmit             |     3.11 s |     4.79 s |     12.73 s |
| Type-check: tsc check time           |     1.64 s |     3.13 s |     10.18 s |
| Type-check: tsc instantiations       |     87,716 |    243,976 |     790,886 |
| Type-check: tsc memory used          | 134,617 KB | 194,259 KB |  466,961 KB |
| Initial bundle: raw                  |  268,839 B |  363,439 B |   694,479 B |
| Initial bundle: gzip                 |   73,129 B |   81,836 B |   109,609 B |
| Initial bundle: brotli               |   63,326 B |   67,564 B |    81,298 B |
| Lazy chunks: raw                     |   73,232 B |  219,732 B |   732,482 B |
| Lazy chunks: gzip                    |   48,295 B |  145,410 B |   482,503 B |
| Lazy chunks: brotli                  |   42,721 B |  128,784 B |   427,404 B |

What it shows:

- Generation grows faster than the route count (3.3× the routes from 300 to 1,000 took 5.9× as long), and regeneration while serving costs about as much as first generation. A CPU profile of a 300-route generation with nothing to change spent about 85% of `generate()` in the validation program's `directoryExists` (`src/generation/validate.ts`), which compares every queried directory against every generated file.
- Type-checking grows roughly linearly with the route count.
- The generated route tables sit in the initial chunk: each route adds about 470 bytes raw and about 20 bytes Brotli to it. Lazy page chunks grow linearly with the pages.
