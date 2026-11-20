# Bench harness

The shared part of every bench in the repository: flags, the output directory, `results.json`, phases, the results table, budgets and the `record`/`check` CLI. Each bench owns its metric registry, scenarios, fixtures and measurements; [`packages/angular-router/bench/`](../../packages/angular-router/bench/README.md) is one.

These are plain ES modules imported by relative path. There's no `package.json`, and nothing here resolves Angular, TypeScript or a package by itself: a runner passes its directories in (`machine({ packages })`, `bin(require, …)`).

| Module             | What it holds                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `bench.mjs`        | `bench(config, argv)`: flags, output directory, `results.json`, phases, table, `--check`, exit code    |
| `budgets.mjs`      | `readBudgets`, `checkBudgets`, `recordBudgets`, and the `record`/`check` CLI                           |
| `statistics.mjs`   | `median` (midpoint average for an even count) and `percentile` (nearest rank)                          |
| `table.mjs`        | `format(metric, value)` and `table(results, { label, layout })`                                        |
| `machine.mjs`      | `load()` and `machine({ packages })`                                                                   |
| `process.mjs`      | `node`, `bin`, `exists`, `files`, `outputDirectory`                                                    |
| `typescript.mjs`   | `parseDiagnostics` for `tsc --extendedDiagnostics` output                                              |
| `bundle.mjs`       | `measureBundle({ output, entryPoint, index })`: initial and lazy bytes from `browser-stats.json`       |
| `budgets.test.mjs` | The check, record, validation and formatting rules: `node --test tools/bench/budgets.test.mjs` (in CI) |

## The gate lock

Every bench script runs under the machine-wide gate lock, outermost and exactly once, so timings don't compete with acceptance runs or another bench from any checkout:

```json
"bench": "sh ../origami-ui/tests/acceptance/gate-lock.sh node bench/run.mjs"
```

While another run holds the lock, the script prints `origami gate: waiting for …` and starts once it's released. A runner spawns its tools (`ng`, `ngc`, `tsc`, Node) directly, never a `pnpm run` script or another command that takes the lock, which would wait on itself.

## Flags

Every bench takes these, after its own (such as the router's `--workload`):

| Flag                  | Default                       | Meaning                                                                                                                                                     |
| --------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--scenarios <list>`  | the runner's default list     | Comma-separated scenario keys; the runner validates them. Scenarios the runner always measures are prepended.                                               |
| `--out <dir>`         | new dir under the OS temp dir | Where `results.json`, and per scenario its logs and scratch files, go. It must not exist yet or be empty; parents are created.                              |
| `--samples <list>`    | the runner's sample counts    | `name=count`, giving only the ones to change, such as `--samples build=3`. A usage error with `--deterministic`.                                            |
| `--timeout <seconds>` | `1200`                        | Limit for each command and each wait.                                                                                                                       |
| `--check [file]`      | the runner's budgets file     | After the run, check the budgets (see [Checking](#checking)) and exit 1 on any failure. The file is validated before anything runs.                         |
| `--deterministic`     | off                           | Run only the phases marked deterministic, one sample each, and check only deterministic budgets. `results.mode` is `"deterministic"`. CI runs exactly this. |

## Metric registry

A runner declares every metric it records, in table order:

```js
{ key: "bundle.initial.brotli", label: "Initial bundle: brotli", unit: "bytes", deterministic: true, budget: [1.02, 1000] },
{ key: "generate.processMs", label: "First generation: fresh process", unit: "ms", deterministic: false, budget: null },
```

- `unit` is `ms`, `bytes`, `KB` or `count`; values are recorded in it.
- `deterministic` marks a metric that doesn't depend on the machine or its load: bytes, counts, TypeScript instantiations. Deterministic metrics form the class CI checks.
- `statistic` is `"median"` (the default) or `"p95"`, nearest rank. A p95 over 10 samples or fewer is just the maximum, so such a key gets `budget: null`.
- `budget: [factor, step]` is the rule `record` applies (see [Recording](#recording)); `step` may be fractional. `budget: null` means the key is never budgeted, and a budgets file entry for it is rejected.
- Checked when the registry loads: keys are unique, a deterministic metric has a rule, `factor ≥ 1` and `step > 0`. `record(key, …)` rejects a key the registry doesn't define.

## Writing a runner

```js
import { bench } from "../../../tools/bench/bench.mjs";

await bench(
  {
    name: "angular-router-router", // results.bench and the temp-dir prefix
    metrics, // the registry
    scenarios: { default: ["100", "300"], validate, label, layout: "metric-rows", always: [] },
    samples: { generate: 3, build: 1 }, // the runner's sample names and default counts
    budgets: "/abs/path/budgets.json", // --check's default file
    options: { workload: "router" }, // extra fields for results.options; not scenarios, samples or timeoutMs
    conditions: { build: "…" }, // texts describing each phase's setup
    packages: [packageDirectory], // the measured packages; Angular resolves from the first
    prerequisites: async () => {}, // optional: fail before the output directory exists
    setup: async ({ out, timeoutMs, deterministic }) => shared, // optional, once per run
    measure: async (scenario, run) => {}, // once per scenario
  },
  argv,
);
```

- `options` adds the runner's own settings to `results.options`. It can't set `scenarios`, `samples` or `timeoutMs`, which the harness records from the flags; a runner that tries fails before anything runs.
- `validate(key)` throws a usage message for a bad scenario key; it also checks the budgets file's scenario keys. `label(key)` names a scenario in the table and progress lines. `layout` is `"metric-rows"` (a metric per row, a scenario per column) or `"scenario-rows"` (the reverse).
- `measure` gets `run = { directory, logs, samples, timeoutMs, deterministic, phase, record, result, results, shared }`. `directory` is `<out>/<scenario>`; `logs` is created in it.
- `run.phase(name, body, { deterministic })` runs `body` and records the load before and after it. Under `--deterministic`, a phase without `deterministic: true` is skipped. `results.json` is saved after every phase, so a failed run keeps its evidence.
- `run.record(key, values)` stores the raw samples and the key's statistic.
- `run.result` is the scenario's object in `results.json`; a runner adds its evidence fields there. It never writes `results.json` itself.
- `--deterministic` with a registry that has no deterministic metric fails with "`<name>` has no deterministic metrics; run it without --deterministic".

## results.json

```jsonc
{
  "bench": "angular-router-router",
  "mode": "all", // or "deterministic"
  "startedAt": "…", // after the gate lock is acquired
  "finishedAt": "…", // only on a finished run
  "out": "…",
  "options": { "scenarios": ["100"], "samples": { … }, "timeoutMs": 1200000, … }, // plus the runner's options
  "metrics": [ { "key": "generate.ms", "label": "…", "unit": "ms", "deterministic": false, "statistic": "median", "budget": [1.3, 1000] }, … ],
  "conditions": { … },
  "machine": {
    "cpu": { … }, "memoryBytes": …, "os": { … },
    "node": "v24.21.0", "zlib": "…", "brotli": "…",
    "pnpm": "12.9.1", "angular": { "core": …, "build": …, "cli": …, "compilerCli": … }, "typescript": "6.0.3",
    "packages": { "@loozo/angular-router": "0.1.0" },
    "git": { "commit": "…", "dirty": false },
    "ci": false, // process.env.CI === "true"
    "environment": { … } // inherited NG_* variables and NODE_OPTIONS
  },
  "scenarios": {
    "100": { "metrics": { … }, "samples": { … }, "load": { … }, … } // statistic, raw values, load per phase, runner evidence
  },
  "failure": { "scenario": "100", "phase": "build", "message": "…" }, // only on a failed run
  "check": { "file": "…", "class": "all", "passed": false, "exceeded": […], "unmeasured": […], "unbudgeted": […], "failed": […] } // with --check
}
```

`metrics` is a copy of the registry's rules taken when the run starts. It's the only rule source for the `record`/`check` CLI, so a downloaded CI artifact is recorded and checked with the rules of the commit that produced it. `samples` keeps every raw value, so the count behind each statistic is visible.

## Budgets

A budgets file names its bench and holds maximums by scenario, in each metric's `results.json` unit:

```text
{ "bench": "<results.bench>", "<scenario>": { "<metric key>": <maximum>, … }, … }
```

A maximum is any finite number, negative included. `bench` is reserved, so no scenario can be named `bench`. The file is rejected when its `bench` is missing or isn't the run's (two benches can share every metric key, so the keys alone can't tell their files apart), when it names a key the rules don't define ("wrong budgets file?"), budgets a key whose rule is `null`, or has a scenario key the runner's `validate` refuses.

### Checking

A check of class `all`, or `deterministic` under `--deterministic`, passes only when all of these hold:

- every budget in the file whose metric is in the class was measured and is within its maximum; a budgeted scenario missing from the run fails the check, so narrowing `--scenarios` needs a budgets file of its own;
- every deterministic metric the run measured has a budget, so a new scenario or metric fails until its budget is recorded;
- no phase failed, and the run finished (`finishedAt` is set), so an interrupted run's saved results can't pass; it's listed under `failed` as `(the run didn't finish)`.

It prints and stores four lists, each line formatted as the table formats values:

```text
failed:
  100: build: Failed (exit 1): node …/ng build proof; see …/build-1.log
exceeded:
  300: bundle.initial.brotli = 66,812 B exceeds 66,500 B
unmeasured:
  1000: (scenario not in this run)
  100: serve.generatedMs
unbudgeted:
  100: bundle.lazy.brotli
```

### Recording

`record` writes each measured statistic's maximum by its rule `[factor, step]`:

```text
maximum = ceilToStep(v + |v| × (factor − 1), step)
```

For v ≥ 0 that's v × factor; for a negative v it allows the same growth on the magnitude, so the unchanged baseline passes its own budget. The result is rounded up to a multiple of `step` with the step's decimals, and `-0` is written as `0`. With `[1.02, 100]`: 63,480 records 64,800; -10,000 records -9,800; -20 records 0.

## The CLI

```sh
node tools/bench/budgets.mjs record <results.json> <budgets.json> [--deterministic]
node tools/bench/budgets.mjs check  <results.json> <budgets.json> [--deterministic]
```

- Both read the rules from `results.metrics`; a results file without them was written before this harness and fails with a request to re-run the bench.
- `record` refuses an unfinished run or one with a failed phase, and a budgets file whose `bench` isn't the run's. It writes the run's `bench` into the file, so a new file gets it. For each scenario in the run it writes the maximum of every key with a rule whose statistic was measured (only deterministic keys under `--deterministic`), and keeps every other entry, including scenarios not in the run. Scenarios keep the file's order with new ones appended in run order (JavaScript orders integer-like keys, such as route counts, numerically), keys follow the registry's order, and the file is written as 2-space JSON with a trailing newline. It prints one line per changed value: `300: bundle.initial.brotli 66500 → 65000`.
- `check` runs the same check as `--check` and exits 1 on failure. Use it to re-check a saved run or a downloaded CI artifact without re-running.

## How values read

The table and every budget line format a value by its unit:

- `ms`, by the value rounded to the range's decimals, so nothing prints as `10.000 ms` or `1000.00 ms`:
  - below 10 ms: ms with 3 decimals (`0.297 ms`, `1.000 ms`);
  - from 10 ms up to 1 s: ms with 2 decimals (`15.90 ms`, `192.60 ms`);
  - from 1 s: s with 2 decimals (`1.19 s`, `10.20 s`).

  Chromium timings tick at 0.1 ms and a midpoint median adds 0.05 ms, so 2 decimals are exact from 10 ms; Node-timed values are finer, and 3 decimals show 1 µs below 10 ms. From 1 s, 2 decimals show the finest budget step in use (10 ms).

- `bytes`, `KB` and `count`: rounded, with thousands separators (`66,812 B`, `140,029 KB`, `174,520`).
- An exceeded line reads `<scenario>: <key> = <value> exceeds <maximum>`. When both print the same, it adds the raw values: `… = 262,144 B exceeds 262,144 B (262144.4 > 262144)`.
- `results.json` keeps raw values at full precision.

The table's first header is `Metric` (or `Scenario` in the scenario-rows layout); labels carry their statistic where it isn't the median.

## Cross-run fit

The harness compares no runs: each `results.json` holds one run. Proofs and re-recordings judge repeatability this way:

- **Cross-run fit, the pass criterion.** Take N runs on one machine (N = 3 for proofs). For each run, `record` a temporary budgets file from it; every other run must pass `check` against it. That's what `--check` will enforce later. Its threshold is the slowest / fastest run statistic, which must fit inside the rule's factor after step rounding.
- **Mean-relative deviation, reported only.** The largest absolute deviation of a run statistic from the mean of the run statistics. For two runs it's half the range around the midpoint.

For example, medians of 6.431 s and 5.132 s are ±11.24% mean-relative and fit under `[1.3, 1000]`: recording from 5.132 s gives 7,000 ms, which 6.431 s passes, and recording from 6.431 s gives 9,000 ms, which 5.132 s passes.
