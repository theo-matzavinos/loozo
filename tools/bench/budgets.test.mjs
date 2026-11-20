// node --test tools/bench/budgets.test.mjs
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  ceilToStep,
  checkBudgets,
  maximum,
  readBudgets,
  recordBudgets,
  validateBudgets,
  validateRules,
} from "./budgets.mjs";
import { format } from "./table.mjs";

const cli = fileURLToPath(new URL("./budgets.mjs", import.meta.url));
const benchModule = new URL("./bench.mjs", import.meta.url).href;
// machine() resolves Angular and TypeScript from the first measured package.
const routerPackage = fileURLToPath(new URL("../../packages/angular-router/", import.meta.url));

// The mixed registry of the plan's recording example.
const metrics = [
  {
    key: "generate.ms",
    label: "First generation: generate()",
    unit: "ms",
    deterministic: false,
    statistic: "median",
    budget: [1.3, 1000],
  },
  {
    key: "generate.processMs",
    label: "First generation: fresh process",
    unit: "ms",
    deterministic: false,
    statistic: "median",
    budget: null,
  },
  {
    key: "typecheck.instantiations",
    label: "Type-check: tsc instantiations",
    unit: "count",
    deterministic: true,
    statistic: "median",
    budget: [1.1, 1000],
  },
  {
    key: "bundle.initial.brotli",
    label: "Initial bundle: brotli",
    unit: "bytes",
    deterministic: true,
    statistic: "median",
    budget: [1.02, 1000],
  },
  {
    key: "bundle.initial.files",
    label: "Initial bundle: JS/CSS files",
    unit: "count",
    deterministic: true,
    statistic: "median",
    budget: [1, 1],
  },
];

function results(scenarios, { finished = true, rules = metrics } = {}) {
  const value = {
    bench: "example",
    mode: "all",
    startedAt: "2026-11-21T00:00:00.000Z",
    metrics: rules,
    scenarios: {},
  };

  if (finished) {
    value.finishedAt = "2026-11-21T00:10:00.000Z";
  }

  for (const [scenario, values] of Object.entries(scenarios)) {
    value.scenarios[scenario] = { metrics: values, samples: {}, load: {} };
  }

  return value;
}

const measured = {
  "generate.ms": 2112.4,
  "generate.processMs": 2950,
  "typecheck.instantiations": 174520,
  "bundle.initial.brotli": 63480,
  "bundle.initial.files": 2,
};

const before = {
  100: {
    "generate.ms": 3000,
    "typecheck.instantiations": 192000,
    "bundle.initial.brotli": 65500,
    "bundle.initial.files": 2,
  },
  300: { "typecheck.instantiations": 422000, "bundle.initial.files": 2 },
};

function check(run, budgets, deterministic = false) {
  return checkBudgets(run, budgets, { deterministic, file: "budgets.json" });
}

describe("checkBudgets", () => {
  const budgets = {
    100: {
      "generate.ms": 3000,
      "typecheck.instantiations": 192000,
      "bundle.initial.brotli": 65500,
      "bundle.initial.files": 2,
    },
  };

  it("passes a run within every budget", () => {
    const outcome = check(results({ 100: measured }), budgets);

    assert.equal(outcome.passed, true);
    assert.equal(outcome.class, "all");
    assert.deepEqual(outcome.exceeded, []);
  });

  it("fails a value over its budget, formatted", () => {
    const outcome = check(
      results({ 100: { ...measured, "bundle.initial.brotli": 66812 } }),
      budgets,
    );

    assert.equal(outcome.passed, false);
    assert.deepEqual(outcome.exceeded, ["100: bundle.initial.brotli = 66,812 B exceeds 65,500 B"]);
  });

  it("fails a budgeted scenario the run didn't measure", () => {
    const outcome = check(results({ 100: measured }), {
      ...budgets,
      1000: { "bundle.initial.files": 2 },
    });

    assert.equal(outcome.passed, false);
    assert.deepEqual(outcome.unmeasured, ["1000: (scenario not in this run)"]);
  });

  it("fails a budgeted metric the run didn't measure", () => {
    const { "generate.ms": _generate, ...rest } = measured;
    const outcome = check(results({ 100: rest }), budgets);

    assert.equal(outcome.passed, false);
    assert.deepEqual(outcome.unmeasured, ["100: generate.ms"]);
  });

  it("fails a deterministic metric measured without a budget", () => {
    const { "bundle.initial.files": _files, ...rest } = budgets[100];
    const outcome = check(results({ 100: measured }), { 100: rest });

    assert.equal(outcome.passed, false);
    assert.deepEqual(outcome.unbudgeted, ["100: bundle.initial.files"]);
  });

  it("ignores timing budgets under --deterministic and still enforces deterministic ones", () => {
    const slow = { ...measured, "generate.ms": 9000 };

    assert.equal(check(results({ 100: slow }), budgets, true).passed, true);
    assert.equal(check(results({ 100: slow }), budgets, false).passed, false);

    const outcome = check(
      results({ 100: { ...slow, "typecheck.instantiations": 200000 } }),
      budgets,
      true,
    );

    assert.equal(outcome.class, "deterministic");
    assert.deepEqual(outcome.exceeded, ["100: typecheck.instantiations = 200,000 exceeds 192,000"]);
  });

  it("skips a scenario under --deterministic when it budgets timings only", () => {
    const outcome = check(
      results({ 100: measured }),
      { ...budgets, 300: { "generate.ms": 1 } },
      true,
    );

    assert.equal(outcome.passed, true);
  });

  it("fails a run with a failed phase", () => {
    const run = results({ 100: measured }, { finished: false });

    run.failure = { scenario: "100", phase: "bundle", message: "boom" };

    const outcome = check(run, budgets);

    assert.equal(outcome.passed, false);
    assert.deepEqual(outcome.failed, ["100: bundle: boom"]);
  });

  it("fails an unfinished run without a failed phase, whatever it measured", () => {
    const outcome = check(results({ 100: measured }, { finished: false }), budgets);

    assert.equal(outcome.passed, false);
    assert.deepEqual(outcome.failed, ["(the run didn't finish)"]);
    assert.deepEqual(outcome.exceeded, []);
    assert.deepEqual(outcome.unmeasured, []);
  });

  it("passes the unchanged negative baseline D20 recorded and fails growth past it", () => {
    const rules = [
      {
        key: "delta",
        label: "Delta",
        unit: "bytes",
        deterministic: true,
        statistic: "median",
        budget: [1.02, 100],
      },
    ];
    const recorded = { 1: { delta: -9800 } };

    assert.equal(check(results({ 1: { delta: -10000 } }, { rules }), recorded).passed, true);
    assert.equal(check(results({ 1: { delta: -9850 } }, { rules }), recorded).passed, true);
    assert.equal(check(results({ 1: { delta: -9700 } }, { rules }), recorded).passed, false);
  });
});

describe("recordBudgets", () => {
  it("records the mixed-registry example under --deterministic", () => {
    const { budgets, changes } = recordBudgets(results({ 100: measured }), before, {
      deterministic: true,
      file: "results.json",
    });

    assert.deepEqual(budgets, {
      bench: "example",
      100: {
        "generate.ms": 3000,
        "typecheck.instantiations": 192000,
        "bundle.initial.brotli": 65000,
        "bundle.initial.files": 2,
      },
      300: { "typecheck.instantiations": 422000, "bundle.initial.files": 2 },
    });
    assert.deepEqual(changes, ["100: bundle.initial.brotli 65500 → 65000"]);
  });

  it("records timings too without --deterministic, never a null-rule key", () => {
    const { budgets } = recordBudgets(
      results({ 100: { ...measured, "generate.ms": 2112.4 } }),
      { 100: { ...before[100], "generate.ms": 5000 } },
      { file: "results.json" },
    );

    assert.equal(budgets[100]["generate.ms"], 3000);
    assert.equal(Object.hasOwn(budgets[100], "generate.processMs"), false);
  });

  it("keeps untouched scenarios and entries outside the class, appends new scenarios in run order", () => {
    // Named scenarios: JavaScript orders integer-like keys numerically whatever the insertion order.
    const { budgets } = recordBudgets(
      results({ tooltip: measured, popover: measured }),
      { bench: "example", dialog: before[300], popover: { "generate.ms": 7000 } },
      { deterministic: true, file: "results.json" },
    );

    assert.deepEqual(Object.keys(budgets), ["bench", "dialog", "popover", "tooltip"]);
    assert.deepEqual(budgets.dialog, before[300]);
    assert.deepEqual(Object.keys(budgets.popover), [
      "generate.ms",
      "typecheck.instantiations",
      "bundle.initial.brotli",
      "bundle.initial.files",
    ]);
    assert.equal(budgets.popover["generate.ms"], 7000);
  });

  it("refuses an unfinished run and a run with a failed phase", () => {
    assert.throws(
      () => recordBudgets(results({ 100: measured }, { finished: false }), {}, { file: "r.json" }),
      /r\.json is an incomplete run; budgets are recorded only from a finished run/,
    );

    const failed = results({ 100: measured });

    failed.failure = { scenario: "100", phase: "tsc", message: "boom" };
    assert.throws(() => recordBudgets(failed, {}, { file: "r.json" }), /incomplete run/);
  });
});

describe("invalid values and deterministic artifacts", () => {
  it("fails a check on a budgeted value that isn't a finite number, as saved JSON writes it", () => {
    const saved = JSON.parse(
      JSON.stringify(results({ 100: { ...measured, "bundle.initial.brotli": Number.NaN } })),
    );
    const checked = check(saved, { bench: "example", 100: before[100] }, true);

    assert.equal(checked.passed, false);
    assert.deepEqual(checked.failed, ["100: bundle.initial.brotli isn't a finite number (null)"]);
  });

  it("refuses to record a value that isn't a finite number", () => {
    const saved = JSON.parse(
      JSON.stringify(results({ 100: { ...measured, "bundle.initial.brotli": Number.NaN } })),
    );

    assert.throws(
      () => recordBudgets(saved, before, { deterministic: true, file: "results.json" }),
      /100: bundle\.initial\.brotli isn't a finite number \(null\); nothing was recorded/,
    );
  });

  it("records and checks a deterministic run in the deterministic class without the flag", () => {
    const run = { ...results({ 100: { ...measured, "generate.ms": 900 } }), mode: "deterministic" };
    const file = { bench: "example", 100: { ...before[100], "generate.ms": 12000 } };
    const { budgets } = recordBudgets(run, file, { file: "results.json" });

    assert.equal(budgets[100]["generate.ms"], 12000);
    assert.equal(check(run, file).class, "deterministic");
  });
});

describe("D20 and step rounding", () => {
  it("records -10,000 at [1.02, 100] as -9,800 and -20 as 0", () => {
    assert.equal(maximum(-10000, [1.02, 100]), -9800);
    assert.equal(maximum(-20, [1.02, 100]), 0);
    assert.equal(maximum(63480, [1.02, 100]), 64800);
  });

  it("writes -0 as 0", () => {
    assert.ok(Object.is(ceilToStep(-0.4, 1), 0));

    const { budgets } = recordBudgets(
      results(
        { 1: { delta: -20 } },
        {
          rules: [
            {
              key: "delta",
              label: "Delta",
              unit: "bytes",
              deterministic: true,
              statistic: "median",
              budget: [1.02, 100],
            },
          ],
        },
      ),
      {},
      { file: "results.json" },
    );

    assert.equal(JSON.stringify(budgets), '{"1":{"delta":0},"bench":"example"}');
  });

  it("rounds to a fractional step's decimals", () => {
    assert.equal(maximum(0.31, [1.3, 0.1]), 0.5);
  });

  it("doesn't let float noise cost a step", () => {
    assert.equal(maximum(190000, [1.1, 1000]), 209000);
  });
});

describe("rule and budget validation", () => {
  it("rejects a results file without metric rules", () => {
    assert.throws(
      () => validateRules(undefined, "old.json"),
      /old\.json has no metric rules \(results\.metrics\); it was written before the shared harness, so re-run the bench/,
    );
  });

  it("rejects a deterministic key with a null rule", () => {
    assert.throws(
      () =>
        validateRules([{ key: "a", deterministic: true, statistic: "median", budget: null }], "r"),
      /"a" is deterministic, so it needs a budget rule/,
    );
  });

  it("rejects a duplicate key", () => {
    const rule = { key: "a", deterministic: false, statistic: "median", budget: null };

    assert.throws(() => validateRules([rule, rule], "r"), /"a" is listed twice/);
  });

  it("rejects a factor below 1 and a nonpositive step", () => {
    assert.throws(
      () => validateRules([{ key: "a", deterministic: false, budget: [0.9, 1] }], "r"),
      /"a" has budget/,
    );
    assert.throws(
      () => validateRules([{ key: "a", deterministic: false, budget: [1, 0] }], "r"),
      /"a" has budget/,
    );
  });

  it("rejects a budgets key the rules don't define", () => {
    assert.throws(
      () =>
        validateBudgets(
          { bench: "example", 100: { "heap.liveInstances": 3 } },
          { metrics, bench: "example", file: "build.json" },
        ),
      /build\.json has keys example doesn't define: heap\.liveInstances \(wrong budgets file\?\)/,
    );
  });

  it("rejects a file without the run's bench name", () => {
    assert.throws(
      () => validateBudgets({ 100: {} }, { metrics, bench: "example", file: "b.json" }),
      /b\.json names no bench; add "bench": "example" if it holds example's budgets/,
    );
    assert.throws(
      () =>
        validateBudgets({ bench: "other", 100: {} }, { metrics, bench: "example", file: "b.json" }),
      /b\.json holds "other"'s budgets, not example's \(wrong budgets file\?\)/,
    );
  });

  it("rejects a budget for a null-rule key", () => {
    assert.throws(
      () =>
        validateBudgets(
          { bench: "example", 100: { "generate.processMs": 3000 } },
          { metrics, bench: "example", file: "b.json" },
        ),
      /"100"\."generate\.processMs" is never budgeted/,
    );
  });

  it("accepts negative and fractional maxima and checks scenario keys with the runner's validate", async () => {
    const directory = await mkdtemp(join(os.tmpdir(), "bench-budgets-"));
    const file = join(directory, "budgets.json");

    try {
      await writeFile(
        file,
        JSON.stringify({ bench: "example", 100: { "bundle.initial.brotli": -9800.5 } }),
      );
      await readBudgets(file, { metrics, bench: "example" });

      await writeFile(file, JSON.stringify({ bench: "example", x: { "bundle.initial.files": 2 } }));
      await assert.rejects(
        readBudgets(file, {
          metrics,
          bench: "example",
          validate: (key) => {
            if (key === "x") {
              throw new Error("not a route count");
            }
          },
        }),
        /"x": not a route count/,
      );
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});

describe("format", () => {
  const ms = { unit: "ms" };

  it("keeps the precision of short durations", () => {
    assert.equal(format(ms, 0.297), "0.297 ms");
    assert.equal(format(ms, 1), "1.000 ms");
    assert.equal(format(ms, 9.9996), "10.00 ms");
    assert.equal(format(ms, 15.9), "15.90 ms");
    assert.equal(format(ms, 999.996), "1.00 s");
    assert.equal(format(ms, 10200), "10.20 s");
  });

  it("rounds bytes and counts with separators", () => {
    assert.equal(format({ unit: "bytes" }, 66812), "66,812 B");
    assert.equal(format({ unit: "count" }, 174520), "174,520");
    assert.equal(format({ unit: "KB" }, 140029), "140,029 KB");
  });
});

describe("exceeded lines", () => {
  it("formats both sides with the metric's unit", () => {
    const rules = [
      {
        key: "open.p50Ms",
        label: "Open p50",
        unit: "ms",
        deterministic: false,
        statistic: "median",
        budget: [1.3, 0.1],
      },
    ];
    const outcome = check(results({ tooltip: { "open.p50Ms": 1.4 } }, { rules }), {
      tooltip: { "open.p50Ms": 1.3 },
    });

    assert.deepEqual(outcome.exceeded, ["tooltip: open.p50Ms = 1.400 ms exceeds 1.300 ms"]);
  });

  it("adds the raw values when both sides print the same", () => {
    const rules = [
      {
        key: "heap.retainedJsBytesPerCycle",
        label: "Heap",
        unit: "bytes",
        deterministic: false,
        statistic: "median",
        budget: [1.5, 65536],
      },
    ];
    const outcome = check(
      results({ "checkbox-1000": { "heap.retainedJsBytesPerCycle": 262144.4 } }, { rules }),
      { "checkbox-1000": { "heap.retainedJsBytesPerCycle": 262144 } },
    );

    assert.deepEqual(outcome.exceeded, [
      "checkbox-1000: heap.retainedJsBytesPerCycle = 262,144 B exceeds 262,144 B (262144.4 > 262144)",
    ]);
  });
});

describe("the record/check CLI", () => {
  it("records into a budgets file and checks a saved run against it", async () => {
    const directory = await mkdtemp(join(os.tmpdir(), "bench-cli-"));
    const resultsFile = join(directory, "results.json");
    const budgetsFile = join(directory, "budgets.json");

    try {
      await writeFile(resultsFile, JSON.stringify(results({ 100: measured })));
      await writeFile(budgetsFile, JSON.stringify({ bench: "example", 100: before[100] }));

      const recorded = spawnSync(
        process.execPath,
        [cli, "record", resultsFile, budgetsFile, "--deterministic"],
        {
          encoding: "utf8",
        },
      );

      assert.equal(recorded.status, 0, recorded.stderr);
      assert.match(recorded.stdout, /100: bundle\.initial\.brotli 65500 → 65000/);

      const written = await readFile(budgetsFile, "utf8");

      assert.ok(written.endsWith("}\n"));
      assert.equal(JSON.parse(written)[100]["bundle.initial.brotli"], 65000);

      const checked = spawnSync(process.execPath, [cli, "check", resultsFile, budgetsFile], {
        encoding: "utf8",
      });

      assert.equal(checked.status, 0, checked.stdout);

      await writeFile(
        resultsFile,
        JSON.stringify({ ...results({ 100: measured }), metrics: undefined }),
      );

      const old = spawnSync(process.execPath, [cli, "check", resultsFile, budgetsFile], {
        encoding: "utf8",
      });

      assert.equal(old.status, 1);
      assert.match(old.stderr, /has no metric rules/);
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it("keeps timing budgets when recording a deterministic run without --deterministic", async () => {
    const directory = await mkdtemp(join(os.tmpdir(), "bench-cli-"));
    const resultsFile = join(directory, "results.json");
    const budgetsFile = join(directory, "budgets.json");

    try {
      const run = {
        ...results({ 100: { ...measured, "generate.ms": 900 } }),
        mode: "deterministic",
      };

      await writeFile(resultsFile, JSON.stringify(run));
      await writeFile(
        budgetsFile,
        JSON.stringify({ bench: "example", 100: { ...before[100], "generate.ms": 12000 } }),
      );

      const recorded = spawnSync(process.execPath, [cli, "record", resultsFile, budgetsFile], {
        encoding: "utf8",
      });

      assert.equal(recorded.status, 0, recorded.stderr);
      assert.equal(JSON.parse(await readFile(budgetsFile, "utf8"))[100]["generate.ms"], 12000);
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it("refuses to record a value that isn't a finite number and leaves the file alone", async () => {
    const directory = await mkdtemp(join(os.tmpdir(), "bench-cli-"));
    const resultsFile = join(directory, "results.json");
    const budgetsFile = join(directory, "budgets.json");
    const file = JSON.stringify({ bench: "example", 100: before[100] });

    try {
      await writeFile(
        resultsFile,
        JSON.stringify(results({ 100: { ...measured, "bundle.initial.brotli": Number.NaN } })),
      );
      await writeFile(budgetsFile, file);

      for (const command of ["record", "check"]) {
        const refused = spawnSync(
          process.execPath,
          [cli, command, resultsFile, budgetsFile, "--deterministic"],
          { encoding: "utf8" },
        );

        assert.equal(refused.status, 1);
        assert.match(
          refused.stdout + refused.stderr,
          /100: bundle\.initial\.brotli isn't a finite number \(null\)/,
        );
      }

      assert.equal(await readFile(budgetsFile, "utf8"), file);
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it("names the bench in a new file and refuses another bench's file", async () => {
    const directory = await mkdtemp(join(os.tmpdir(), "bench-cli-"));
    const resultsFile = join(directory, "results.json");
    const budgetsFile = join(directory, "budgets.json");
    const otherFile = join(directory, "other-budgets.json");

    try {
      await writeFile(resultsFile, JSON.stringify(results({ 100: measured })));

      const recorded = spawnSync(process.execPath, [cli, "record", resultsFile, budgetsFile], {
        encoding: "utf8",
      });

      assert.equal(recorded.status, 0, recorded.stderr);
      assert.equal(JSON.parse(await readFile(budgetsFile, "utf8")).bench, "example");

      const other = { ...JSON.parse(await readFile(budgetsFile, "utf8")), bench: "other" };

      await writeFile(otherFile, JSON.stringify(other));

      for (const command of ["record", "check"]) {
        const refused = spawnSync(process.execPath, [cli, command, resultsFile, otherFile], {
          encoding: "utf8",
        });

        assert.equal(refused.status, 1);
        assert.match(refused.stderr, /holds "other"'s budgets, not example's/);
      }

      assert.deepEqual(JSON.parse(await readFile(otherFile, "utf8")), other);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});

// Runs bench() in a child process with a one-metric runner that records `key` once per scenario.
function runBench(
  argv,
  { always = ["baseline", "empty"], options = {}, key = "example.count", value = "1" },
) {
  const script = `
import { bench } from ${JSON.stringify(benchModule)};

await bench(
  {
    name: "example",
    metrics: [
      { key: "example.count", label: "Count", unit: "count", deterministic: true, budget: [1, 1] },
    ],
    scenarios: {
      default: ["checkbox"],
      always: ${JSON.stringify(always)},
      validate() {},
      label: (scenario) => scenario,
      layout: "metric-rows",
    },
    samples: {},
    budgets: "budgets.json",
    options: ${JSON.stringify(options)},
    conditions: {},
    packages: [${JSON.stringify(routerPackage)}],
    measure: async (scenario, run) => {
      await run.phase("count", () => run.record(${JSON.stringify(key)}, [${value}]), {
        deterministic: true,
      });
    },
  },
  process.argv.slice(1),
);
`;

  return spawnSync(process.execPath, ["--input-type=module", "--eval", script, "--", ...argv], {
    encoding: "utf8",
  });
}

describe("bench()", () => {
  it("measures the always scenarios first, in declared order, selected or not", async () => {
    const directory = await mkdtemp(join(os.tmpdir(), "bench-run-"));

    try {
      for (const selected of ["checkbox", "checkbox,empty,baseline"]) {
        const out = join(directory, selected);
        const run = runBench(["--scenarios", selected, "--out", out], {
          options: { workload: "x" },
        });

        assert.equal(run.status, 0, run.stderr);

        const saved = JSON.parse(await readFile(join(out, "results.json"), "utf8"));

        assert.deepEqual(saved.options.scenarios, ["baseline", "empty", "checkbox"]);
        assert.deepEqual(Object.keys(saved.scenarios), ["baseline", "empty", "checkbox"]);
        assert.equal(saved.options.workload, "x");
      }
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it("refuses runner options that would replace a shared field, before anything runs", async () => {
    const directory = await mkdtemp(join(os.tmpdir(), "bench-run-"));
    const out = join(directory, "out");

    try {
      for (const field of ["scenarios", "samples", "timeoutMs"]) {
        const run = runBench(["--out", out], { options: { [field]: 1 } });

        assert.equal(run.status, 1);
        assert.match(
          run.stderr,
          new RegExp(`example's options can't set ${field}; the harness sets it from the flags`),
        );
      }

      const created = await readFile(join(out, "results.json"), "utf8").catch(() => undefined);

      assert.equal(created, undefined);
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it("fails a run that records a key outside the registry", async () => {
    const directory = await mkdtemp(join(os.tmpdir(), "bench-run-"));
    const out = join(directory, "out");

    try {
      const run = runBench(["--out", out], { key: "example.missing" });

      assert.equal(run.status, 1);
      assert.match(run.stderr, /example\.missing isn't in example's metric registry/);

      const saved = JSON.parse(await readFile(join(out, "results.json"), "utf8"));

      assert.deepEqual(saved.failure, {
        scenario: "baseline",
        phase: "count",
        message: "example.missing isn't in example's metric registry",
      });
      assert.equal(saved.finishedAt, undefined);
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it("fails a run that records a sample that isn't a finite number", async () => {
    const directory = await mkdtemp(join(os.tmpdir(), "bench-run-"));
    const out = join(directory, "out");

    try {
      const run = runBench(["--out", out], { value: "NaN" });

      assert.equal(run.status, 1);
      assert.match(run.stderr, /example\.count has a sample that isn't a finite number: NaN/);

      const saved = JSON.parse(await readFile(join(out, "results.json"), "utf8"));

      assert.equal(saved.failure.phase, "count");
      assert.equal(saved.finishedAt, undefined);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
