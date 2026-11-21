# Origami benches

Origami's performance benches run on the shared harness: its flags, `results.json`, budgets and the `record`/`check` CLI are described in [`tools/bench/README.md`](../../../tools/bench/README.md). This file covers what Origami's benches measure.

## Build bench

For every code entry point, the initial-bundle bytes a consumer pays for that entry's documented working anatomy; and for one app that uses every entry, `ng build` time, ngc time and `tsc` instantiations. Bytes and instantiations are deterministic.

### Running

Prerequisites, once per checkout and again after changing the library's source:

```sh
pnpm install --frozen-lockfile          # at the repo root
pnpm --dir packages/origami-ui build    # the bench links the built dist/
```

The bench checks that every entry is built but not that the build is current. From `packages/origami-ui`:

```sh
pnpm run bench:build                                    # baseline, every entry and all
pnpm run bench:build --scenarios checkbox,select        # baseline is always measured first
pnpm run bench:build --check                            # also compare against bench/budgets/build.json
pnpm run bench:build --deterministic --check            # bytes and instantiations only; what CI checks
```

The script runs under the machine-wide gate lock (`tests/acceptance/gate-lock.sh`): while an acceptance run or another bench holds it, it prints `origami gate: waiting for …` and starts once it's released.

- **Scenarios.** `baseline`, one per `exports` key of `package.json` except `.` (its public API is empty) and `./package.json`, and `all`. The entries are read from `package.json` at run time, so a new entry is measured as soon as it's exported; without a workload the run fails, and without a budget `--check` fails until one is recorded.
- **Samples.** `build=1,ngc=3,tsc=1`. Each entry builds once, for its bytes. `all`'s builds are `build.ms`'s samples.
- **Time.** A full run takes about a minute on a 16-core laptop: 32 builds of 1.4–2.5 s each, plus ngc and `tsc` on `all`. `--deterministic` skips ngc.

Each run writes `<out>/results.json`, `<out>/consumer` (the scratch app, with every scenario's build under `dist/<scenario>`) and, per scenario, `<out>/<scenario>/logs` (every command's output).

### The consumer

`bench/consumer.mjs` writes one scratch app per run, outside the repository: one browser application project, `bench`, whose `src/main.ts` bootstraps `Workload` from `src/workload.ts`. Each scenario has a build configuration that replaces `src/workload.ts` with its workload and writes to `dist/<scenario>`.

- **Origami** is `packages/origami-ui/dist`, linked as `node_modules/@loozo/origami-ui`: the same files the package publishes, with the same `exports` and `sideEffects: false`. Angular and the other packages are links to this package's own `node_modules`, so the app has exactly one Angular.
- **Build options**: a production browser build with scripts and styles optimization (fonts off), `statsJson`, no source maps and hashed file names. No server build. Angular's disk cache is off, so every build is cold.
- **Program**: `tsconfig.app.json` includes every file under `src/`, with `strict` and `strictTemplates`. Every build type-checks every workload, and ngc and `tsc` check them all.

### Workloads

`bench/workloads/<entry>.ts` holds one standalone `Workload` component per entry. Its template renders the entry's minimal working anatomy, as the entry's README documents it, with live bindings. A workload imports only:

- `@angular/core`;
- `@angular/forms` where the documented anatomy needs it (Field, whose errors come from Signal Forms);
- `@loozo/origami-ui/<entry>`;
- the entry's declared companions.

Optional wrappers the READMEs' snippets show are left out: Field labels around a control, an `ogButton` opener where the entry has its own Trigger, a Menu opening an AlertDialog, Toolbar groups that take another entry's items. Controls bind their own `value` or `checked` model instead of a form. Styles are left out too.

A **companion** is another entry the README makes part of the entry's working anatomy. `bench/build-workloads.mjs` declares them, each with its reason. Today there's one: Date Picker's popup holds an ordinary Calendar, which the picker binds, so `workloads/date-picker.ts` renders a Calendar with its full grid. The table labels it `date-picker (+ calendar)`. Entries that arrive through another entry, such as Popover and Date Field inside Date Picker, aren't companions.

`baseline.ts` is an empty component, bootstrapped the same way. `all.ts` imports every entry's workload and renders them all; each workload's selector lists `bench-root`, the element `index.html` hosts, and its own `bench-<entry>`, which `all` uses.

To add an entry: export it, write `workloads/<entry>.ts` from its README's anatomy, add it to `all.ts`, then record its budgets (see [Budgets](#budgets)). Declare a companion only when the README makes it part of the working anatomy, and give the reason.

Three guards fail the run:

1. **Import scan**, before anything runs. TypeScript's `preProcessFile` lists each workload's static, side-effect and dynamic imports. An entry's `@loozo/origami-ui/*` imports must be exactly the entry and its companions; `baseline` and `all` import no entry directly, `all` must import every entry's workload, and only `all` may import another workload. Every exported entry needs a workload, and every companion must be an entry.
2. **Tree-shake guard.** The entry's FESM, and each companion's, must ship bytes in the scenario's initial bundle, and in `all` every entry's must, along with every workload module itself (`src/workloads/<entry>.ts` among the initial inputs), since one primitive can retain another's library code. It catches an import left unused or a fixture dropped from `all`'s template. For a companion it proves only that the companion's code is retained, not that its anatomy is rendered: a Date Picker whose Content is empty still keeps about 500 bytes of Calendar. The full grid in the workload, its sha256 in `results.json` and review hold the anatomy.
3. **One Angular.** Every `@angular/core` input in the initial bundle must resolve, by realpath, to one installation. Angular splits core across several input modules, so the check is per installation, not per path.

### Metrics

Sizes are bytes, times milliseconds; the table formats them by the shared rule ([How values read](../../../tools/bench/README.md#how-values-read)). `bench/build-metrics.mjs` holds each key's class and budget rule.

The phases run in this order: `build` and `bundle` for every scenario, then `ngc` and `tsc` for `all`. `--deterministic` skips `ngc` and builds `all` once.

| Key                                      | Scenarios      | What it measures                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bundle.initial.raw`, `.gzip`, `.brotli` | all            | Initial bundle: the build's output for `src/main.ts` and every JS/CSS file it reaches through static imports in `browser-stats.json`, cross-checked against `index.html`. Each file is compressed on its own (gzip level 9, Brotli quality 11) and the sizes summed.                                   |
| `bundle.added.raw`, `.gzip`, `.brotli`   | entries, `all` | The scenario's initial bytes minus `baseline`'s from the same run: what the workload's working anatomy adds to a consumer's first load, Angular code it pulls in included (Field's Signal Forms, for example). For `date-picker`, that's a usable picker: Date Picker, Calendar and what they compose. |
| `bundle.origami.raw`                     | entries, `all` | esbuild's `bytesInOutput` for the Origami FESMs in the initial files: all of Origami's minified code in the first load, before compression. It separates Origami's bytes from the Angular code a primitive pulls in.                                                                                   |
| `build.ms`                               | `all`          | `ng build bench --configuration all`, whole process, disk cache off.                                                                                                                                                                                                                                   |
| `typecheck.ngcMs`                        | `all`          | `ngc -p tsconfig.app.json --noEmit`, whole process: every workload's TypeScript and templates under `strictTemplates`. The only number that covers template type-checking.                                                                                                                             |
| `typecheck.instantiations`               | `all`          | `tsc -p tsconfig.app.json --noEmit --extendedDiagnostics --incremental false`'s `Instantiations`: the workloads' TypeScript (imports, `inject*` calls, bindings in class bodies), **not** Angular's template type-check, which ngc runs without reporting statistics.                                  |

Boundaries worth keeping in mind:

- Compressed `added` values aren't additive across entries: shared code compresses together, and an entry's delta can even be slightly negative. Raw deltas overlap too, since entries compose each other: Select's `added` includes the Popover and Collection code it uses.
- Each workload is a choice: a richer or poorer anatomy changes its bytes. A workload edit shows in review through its sha256 in `results.json`.
- `utils`, `collection` and `presence` have no visible anatomy of their own; their workloads use the documented minimal API, so their numbers are small.
- `typecheck.instantiations` doesn't see template typing, so a template-typing regression shows only in the local `typecheck.ngcMs`.
- No browser loads the builds; correctness stays with the package's acceptance tests.

### results.json

The shape is the shared harness's ([results.json](../../../tools/bench/README.md#resultsjson)); scenarios are the names above. What the build bench adds per scenario, besides `metrics`, `samples` and `load` (per phase):

- `workload`: the workload's path, sha256 and companions;
- `buildMs`: every build's whole-process time, also for entries, whose builds aren't a metric;
- `bundle`: the shared manifest: the entry file, initial and lazy totals, the initial input modules and every file's path, inputs and sizes;
- `origamiInputs`: `[{ input, bytes }]`, the Origami FESMs' bytes in each initial file;
- `origamiByEntry`: those bytes grouped by entry, such as `{ "date-picker": …, "calendar": …, "popover": … }`. It attributes a scenario's Origami bytes to entries and isn't budgeted;
- `angularCoreRoots`: the `@angular/core` installation behind the initial bundle, exactly one on a passing run;
- `tscDiagnostics` (`all` only): every diagnostic `tsc` reported.

### Budgets

`bench/budgets/build.json` holds regression guards, not targets, keyed by scenario and named for its bench (`"bench": "origami-ui-build"`). It's written with the shared CLI from a full run, by each metric's rule in `bench/build-metrics.mjs`:

```sh
node ../../tools/bench/budgets.mjs record /tmp/new-dir/results.json bench/budgets/build.json                   # every budgeted metric
node ../../tools/bench/budgets.mjs record /tmp/new-dir/results.json bench/budgets/build.json --deterministic   # bytes and instantiations only
```

- bytes (`bundle.*`): plus 2%, rounded up to 100 bytes. A negative compressed `added` value gets the same room on its magnitude;
- `typecheck.instantiations`: plus 10%, rounded up to 100;
- `build.ms`: median plus 30%, rounded up to the second; `typecheck.ngcMs`: plus 30%, rounded up to 100 ms.

A change that moves bytes re-records them in the same change; one that shrinks them can tighten them. An Angular bump moves every scenario's bytes, so it re-records the whole file. The timing budgets describe the machine that recorded them; bytes and instantiations don't depend on it.

### Results

Recorded 2026-11-21 on top of `ba0bcfe`: 13th Gen Intel Core i7-13620H (16 logical cores), 31 GiB RAM, Linux 7.2.15; Node v24.21.0, pnpm 12.9.1, Angular 22.3.0, TypeScript 6.0.3, Origami 0.0.4. The one-minute load average stayed between 2.6 and 3.4.

| Scenario                 | Initial: raw | Initial: gzip | Initial: brotli | Added: raw | Added: gzip | Added: brotli | Origami: raw | ng build | Type-check: ngc | Type-check: tsc instantiations |
| ------------------------ | -----------: | ------------: | --------------: | ---------: | ----------: | ------------: | -----------: | -------: | --------------: | -----------------------------: |
| baseline                 |     90,666 B |      30,127 B |        27,244 B |            |             |               |              |          |                 |                                |
| collection               |    112,087 B |      37,574 B |        33,821 B |   21,421 B |     7,447 B |       6,577 B |      2,348 B |          |                 |                                |
| presence                 |    115,738 B |      38,483 B |        34,632 B |   25,072 B |     8,356 B |       7,388 B |      3,311 B |          |                 |                                |
| collapsible              |    119,964 B |      39,229 B |        35,235 B |   29,298 B |     9,102 B |       7,991 B |      9,103 B |          |                 |                                |
| accordion                |    134,182 B |      43,404 B |        38,868 B |   43,516 B |    13,277 B |      11,624 B |     15,124 B |          |                 |                                |
| popover                  |    169,327 B |      55,904 B |        50,040 B |   78,661 B |    25,777 B |      22,796 B |     30,297 B |          |                 |                                |
| toggle                   |    119,359 B |      39,252 B |        35,342 B |   28,693 B |     9,125 B |       8,098 B |      6,819 B |          |                 |                                |
| tabs                     |    121,758 B |      40,060 B |        35,934 B |   31,092 B |     9,933 B |       8,690 B |     10,612 B |          |                 |                                |
| toggle-group             |    132,124 B |      42,873 B |        38,423 B |   41,458 B |    12,746 B |      11,179 B |     15,376 B |          |                 |                                |
| toolbar                  |    130,221 B |      42,479 B |        38,099 B |   39,555 B |    12,352 B |      10,855 B |     13,436 B |          |                 |                                |
| radio-group              |    128,599 B |      42,131 B |        37,755 B |   37,933 B |    12,004 B |      10,511 B |     11,927 B |          |                 |                                |
| button                   |    105,262 B |      35,145 B |        31,717 B |   14,596 B |     5,018 B |       4,473 B |        905 B |          |                 |                                |
| tooltip                  |    170,334 B |      55,832 B |        49,948 B |   79,668 B |    25,705 B |      22,704 B |     35,628 B |          |                 |                                |
| field                    |    188,963 B |      59,197 B |        52,486 B |   98,297 B |    29,070 B |      25,242 B |      7,030 B |          |                 |                                |
| checkbox                 |    120,401 B |      39,549 B |        35,590 B |   29,735 B |     9,422 B |       8,346 B |      7,481 B |          |                 |                                |
| switch                   |    119,475 B |      39,234 B |        35,301 B |   28,809 B |     9,107 B |       8,057 B |      7,061 B |          |                 |                                |
| dialog                   |    139,588 B |      44,717 B |        40,144 B |   48,922 B |    14,590 B |      12,900 B |     26,647 B |          |                 |                                |
| select                   |    197,339 B |      64,030 B |        57,040 B |  106,673 B |    33,903 B |      29,796 B |     46,715 B |          |                 |                                |
| calendar                 |    159,883 B |      51,861 B |        46,427 B |   69,217 B |    21,734 B |      19,183 B |     31,540 B |          |                 |                                |
| date-field               |    152,145 B |      50,407 B |        45,219 B |   61,479 B |    20,280 B |      17,975 B |     21,828 B |          |                 |                                |
| date-picker (+ calendar) |    235,215 B |      75,481 B |        66,728 B |  144,549 B |    45,354 B |      39,484 B |     80,063 B |          |                 |                                |
| menu                     |    190,264 B |      61,713 B |        54,932 B |   99,598 B |    31,586 B |      27,688 B |     48,787 B |          |                 |                                |
| combobox                 |    197,491 B |      63,983 B |        57,021 B |  106,825 B |    33,856 B |      29,777 B |     46,810 B |          |                 |                                |
| toast                    |    133,365 B |      43,831 B |        39,260 B |   42,699 B |    13,704 B |      12,016 B |     12,861 B |          |                 |                                |
| slider                   |    131,691 B |      43,758 B |        39,293 B |   41,025 B |    13,631 B |      12,049 B |     10,877 B |          |                 |                                |
| progress                 |    111,466 B |      37,443 B |        33,717 B |   20,800 B |     7,316 B |       6,473 B |      2,199 B |          |                 |                                |
| number-field             |    141,616 B |      46,482 B |        41,591 B |   50,950 B |    16,355 B |      14,347 B |     17,940 B |          |                 |                                |
| otp-field                |    143,437 B |      47,740 B |        42,790 B |   52,771 B |    17,613 B |      15,546 B |     11,803 B |          |                 |                                |
| file-field               |    127,302 B |      42,192 B |        37,798 B |   36,636 B |    12,065 B |      10,554 B |      8,127 B |          |                 |                                |
| avatar                   |    113,504 B |      37,904 B |        34,048 B |   22,838 B |     7,777 B |       6,804 B |      2,572 B |          |                 |                                |
| utils                    |     94,514 B |      31,512 B |        28,470 B |    3,848 B |     1,385 B |       1,226 B |        599 B |          |                 |                                |
| all                      |    479,825 B |     137,292 B |       114,469 B |  389,159 B |   107,165 B |      87,225 B |    233,664 B |   2.49 s |          1.32 s |                          4,927 |
