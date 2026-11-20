// The shared bench runner: flags, output directory, results.json, phases, table and budget check.
// A runner owns its metric registry, scenarios and measurements; see tools/bench/README.md.
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { checkBudgets, readBudgets, report, validateRules } from "./budgets.mjs";
import { load, machine } from "./machine.mjs";
import { outputDirectory } from "./process.mjs";
import { median, percentile } from "./statistics.mjs";
import { table } from "./table.mjs";

export function progress(message) {
  console.error(`[bench] ${message}`);
}

function usage(message, samples) {
  console.error(`${message}

Shared flags: [--scenarios <a,b,…>] [--out <dir>] [--samples ${Object.keys(samples)
    .map((name) => `${name}=<count>`)
    .join(",")}]
              [--timeout <seconds>] [--check [file]] [--deterministic]`);
  process.exit(2);
}

function parseArguments(config, argv) {
  const options = {
    scenarios: [...config.scenarios.default],
    out: undefined,
    samples: { ...config.samples },
    timeoutMs: 1200 * 1000,
    check: undefined,
    deterministic: false,
  };
  let samplesGiven = false;

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    // pnpm forwards a separating "--" to the script.
    if (argument === "--") {
      continue;
    }

    if (argument === "--deterministic") {
      options.deterministic = true;
      continue;
    }

    // The runner's budgets file unless one is given.
    if (argument === "--check") {
      options.check = config.budgets;

      const next = argv[index + 1];

      if (next !== undefined && !next.startsWith("--")) {
        options.check = resolve(next);
        index++;
      }

      continue;
    }

    const value = argv[index + 1];

    if (value === undefined) {
      usage(`Missing a value for ${argument}`, config.samples);
    }

    index++;

    if (argument === "--scenarios") {
      options.scenarios = [];

      for (const scenario of value.split(",")) {
        try {
          config.scenarios.validate(scenario);
        } catch (error) {
          usage(error.message, config.samples);
        }

        if (options.scenarios.includes(scenario)) {
          usage(`--scenarios lists ${scenario} twice`, config.samples);
        }

        options.scenarios.push(scenario);
      }
    } else if (argument === "--out") {
      options.out = resolve(value);
    } else if (argument === "--samples") {
      samplesGiven = true;

      for (const part of value.split(",")) {
        const [name, count] = part.split("=");
        const samples = Number(count);

        if (!Object.hasOwn(options.samples, name) || !Number.isInteger(samples) || samples < 1) {
          usage(
            `--samples takes name=count with a count of at least 1 for ${Object.keys(options.samples).join(", ")}, got "${part}"`,
            config.samples,
          );
        }

        options.samples[name] = samples;
      }
    } else if (argument === "--timeout") {
      const seconds = Number(value);

      if (!Number.isFinite(seconds) || seconds <= 0) {
        usage(`--timeout takes a positive number of seconds, got "${value}"`, config.samples);
      }

      options.timeoutMs = seconds * 1000;
    } else {
      usage(`Unknown argument ${argument}`, config.samples);
    }
  }

  if (options.deterministic) {
    if (samplesGiven) {
      usage(
        "--samples doesn't combine with --deterministic, which takes one sample each",
        config.samples,
      );
    }

    for (const name of Object.keys(options.samples)) {
      options.samples[name] = 1;
    }
  }

  // Runner-declared scenarios every run measures come first, in declared order, whether or not
  // they were selected.
  const always = config.scenarios.always ?? [];
  const scenarios = [...always];

  for (const scenario of options.scenarios) {
    if (!always.includes(scenario)) {
      scenarios.push(scenario);
    }
  }

  options.scenarios = scenarios;

  return options;
}

// The registry's rules as results.json carries them, with each statistic resolved.
function snapshot(metrics) {
  const rules = [];

  for (const { key, label, unit, deterministic, statistic = "median", budget } of metrics) {
    rules.push({ key, label, unit, deterministic, statistic, budget });
  }

  return rules;
}

// results.options fields the harness sets from the flags; a runner's options can't replace them.
const sharedOptions = ["scenarios", "samples", "timeoutMs"];

async function run(config, argv) {
  for (const key of sharedOptions) {
    if (Object.hasOwn(config.options ?? {}, key)) {
      throw new Error(
        `${config.name}'s options can't set ${key}; the harness sets it from the flags`,
      );
    }
  }

  const options = parseArguments(config, argv);
  const metrics = snapshot(config.metrics);

  validateRules(metrics, `${config.name}'s metric registry`);

  if (options.deterministic && !metrics.some((metric) => metric.deterministic)) {
    throw new Error(`${config.name} has no deterministic metrics; run it without --deterministic`);
  }

  const rules = new Map();

  for (const metric of metrics) {
    rules.set(metric.key, metric);
  }

  let budgets;

  // Fail on a missing or invalid budgets file before anything runs.
  if (options.check) {
    budgets = await readBudgets(options.check, {
      metrics,
      bench: config.name,
      validate: config.scenarios.validate,
    });
  }

  await config.prerequisites?.();

  const out = await outputDirectory(options.out, config.name);
  const resultsPath = join(out, "results.json");
  let mode = "all";

  if (options.deterministic) {
    mode = "deterministic";
  }

  const results = {
    bench: config.name,
    mode,
    startedAt: new Date().toISOString(),
    finishedAt: undefined,
    out,
    options: {
      scenarios: options.scenarios,
      samples: options.samples,
      timeoutMs: options.timeoutMs,
      ...config.options,
    },
    metrics,
    conditions: config.conditions,
    machine: await machine({ packages: config.packages }),
    scenarios: {},
  };

  async function save() {
    await writeFile(resultsPath, `${JSON.stringify(results, null, 2)}\n`);
  }

  progress(`writing to ${out}`);
  await save();

  const shared = await config.setup?.({
    out,
    timeoutMs: options.timeoutMs,
    deterministic: options.deterministic,
  });

  for (const scenario of options.scenarios) {
    const directory = join(out, scenario);
    const result = { metrics: {}, samples: {}, load: {} };
    const label = config.scenarios.label(scenario);
    const logs = join(directory, "logs");

    results.scenarios[scenario] = result;
    await mkdir(logs, { recursive: true });

    async function phase(name, body, { deterministic = false } = {}) {
      if (options.deterministic && !deterministic) {
        progress(`${label}: ${name} (skipped by --deterministic)`);

        return;
      }

      const before = load();

      progress(`${label}: ${name}`);

      try {
        await body();
      } catch (error) {
        results.failure = { scenario, phase: name, message: error.message };
        await save();

        throw error;
      }

      result.load[name] = { before, after: load() };
      await save();
    }

    function record(key, values) {
      const rule = rules.get(key);

      if (!rule) {
        throw new Error(`${key} isn't in ${config.name}'s metric registry`);
      }

      if (values.length === 0) {
        throw new Error(`${key} has no samples`);
      }

      result.samples[key] = values;

      if (rule.statistic === "p95") {
        result.metrics[key] = percentile(values, 0.95);
      } else {
        result.metrics[key] = median(values);
      }
    }

    await config.measure(scenario, {
      directory,
      logs,
      samples: options.samples,
      timeoutMs: options.timeoutMs,
      deterministic: options.deterministic,
      phase,
      record,
      result,
      results,
      shared,
    });
  }

  results.finishedAt = new Date().toISOString();
  await save();
  progress(`results: ${resultsPath}`);
  console.log(table(results, config.scenarios));

  if (budgets) {
    results.check = checkBudgets(results, budgets, {
      deterministic: options.deterministic,
      file: options.check,
    });
    await save();
    console.log(report(results.check));

    if (!results.check.passed) {
      process.exitCode = 1;
    }
  }
}

// Runs one bench: config is the runner's (see README.md), argv its remaining flags.
export async function bench(config, argv) {
  try {
    await run(config, argv);
  } catch (error) {
    progress(error.message);
    process.exitCode = 1;
  }
}
