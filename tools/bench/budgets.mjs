// Budgets: reading, checking and recording them against a run's results, and the record/check
// CLI. The rules come from the run's own `metrics` snapshot, so nothing here imports package code.
//
// node tools/bench/budgets.mjs record|check <results.json> <budgets.json> [--deterministic]
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exists } from "./process.mjs";
import { format } from "./table.mjs";

const statistics = new Set(["median", "p95"]);

function isRule(budget) {
  return (
    Array.isArray(budget) &&
    budget.length === 2 &&
    Number.isFinite(budget[0]) &&
    budget[0] >= 1 &&
    Number.isFinite(budget[1]) &&
    budget[1] > 0
  );
}

// Fails on a missing or invalid rule list: a registry, or the `metrics` snapshot of a results
// file named by `source`.
export function validateRules(metrics, source) {
  if (!Array.isArray(metrics)) {
    throw new Error(
      `${source} has no metric rules (results.metrics); it was written before the shared harness, so re-run the bench`,
    );
  }

  const problems = [];
  const keys = new Set();

  for (const metric of metrics) {
    const { key, deterministic, statistic = "median", budget } = metric;

    if (typeof key !== "string") {
      problems.push(`a metric has no string key: ${JSON.stringify(metric)}`);
      continue;
    }

    if (keys.has(key)) {
      problems.push(`"${key}" is listed twice`);
    }

    keys.add(key);

    if (typeof deterministic !== "boolean") {
      problems.push(`"${key}" needs a boolean deterministic`);
    }

    if (!statistics.has(statistic)) {
      problems.push(`"${key}" has statistic "${statistic}"; use median or p95`);
    }

    if (budget !== null && !isRule(budget)) {
      problems.push(
        `"${key}" has budget ${JSON.stringify(budget)}; use null or [factor ≥ 1, step > 0]`,
      );
    }

    if (deterministic === true && budget === null) {
      problems.push(`"${key}" is deterministic, so it needs a budget rule`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid metric rules in ${source}:\n- ${problems.join("\n- ")}`);
  }
}

function decimals(step) {
  const text = String(step);
  const dot = text.indexOf(".");

  if (dot === -1) {
    return 0;
  }

  return text.length - dot - 1;
}

function round(value, places) {
  const scale = 10 ** places;

  return Math.round(value * scale) / scale;
}

// x rounded up to a multiple of step, with the step's decimals and no -0. The quotient is rounded
// first, so float noise (-9799.9999999999998 / 100) doesn't cost a step.
export function ceilToStep(x, step) {
  const steps = Math.ceil(round(x / step, 9));
  const value = round(steps * step, decimals(step));

  if (value === 0) {
    return 0;
  }

  return value;
}

// Over the maximum. A timing gets a millionth of its rule's step of slack: browser timers aren't
// exact multiples of their 0.1 ms resolution, so a median of ticks such as 1.3000000045 meets a 1.3
// maximum, and any real excess is a whole sample tick, far above it. Bytes and counts are exact.
export function exceeds(value, max, rule) {
  if (rule.unit === "ms") {
    return value - max > rule.budget[1] * 1e-6;
  }

  return value > max;
}

// D20: the growth the factor allows, on the value's magnitude, so a negative baseline isn't
// tightened. Identical to value × factor for value ≥ 0.
export function maximum(value, [factor, step]) {
  return ceilToStep(value + Math.abs(value) * (factor - 1), step);
}

// The file's scenario entries, without its bench name.
function scenarioEntries(budgets) {
  const entries = [];

  for (const [scenario, limits] of Object.entries(budgets)) {
    if (scenario !== "bench") {
      entries.push([scenario, limits]);
    }
  }

  return entries;
}

// budgets.json: { "bench": "<results.bench>", "<scenario>": { "<metric key>": maximum } }, every
// maximum a finite number in the metric's results.json unit. `bench` is the run's bench name, which
// the file must carry. `validate` checks a scenario key (the runner's; the CLI has none).
export function validateBudgets(budgets, { metrics, bench, file, validate }) {
  if (typeof budgets !== "object" || budgets === null || Array.isArray(budgets)) {
    throw new Error(`${file} must be an object keyed by scenario`);
  }

  if (!Object.hasOwn(budgets, "bench")) {
    throw new Error(
      `${file} names no bench; add "bench": "${bench}" if it holds ${bench}'s budgets`,
    );
  }

  if (budgets.bench !== bench) {
    throw new Error(
      `${file} holds ${JSON.stringify(budgets.bench)}'s budgets, not ${bench}'s (wrong budgets file?)`,
    );
  }

  const rules = new Map();

  for (const metric of metrics) {
    rules.set(metric.key, metric);
  }

  const problems = [];
  const unknown = new Set();

  for (const [scenario, limits] of scenarioEntries(budgets)) {
    if (validate) {
      try {
        validate(scenario);
      } catch (error) {
        problems.push(`"${scenario}": ${error.message}`);
        continue;
      }
    }

    if (typeof limits !== "object" || limits === null || Array.isArray(limits)) {
      problems.push(`"${scenario}" must map metric keys to maximums`);
      continue;
    }

    for (const [key, max] of Object.entries(limits)) {
      const rule = rules.get(key);

      if (!rule) {
        unknown.add(key);
        continue;
      }

      if (rule.budget === null) {
        problems.push(`"${scenario}"."${key}" is never budgeted (its rule is null)`);
      }

      if (typeof max !== "number" || !Number.isFinite(max)) {
        problems.push(`"${scenario}"."${key}" must be a finite number`);
      }
    }
  }

  if (unknown.size > 0) {
    throw new Error(
      `${file} has keys ${bench} doesn't define: ${[...unknown].join(", ")} (wrong budgets file?)`,
    );
  }

  if (problems.length > 0) {
    throw new Error(`Invalid budgets in ${file}:\n- ${problems.join("\n- ")}`);
  }

  return budgets;
}

export async function readBudgets(file, options) {
  let text;

  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `No budgets file at ${file}. Budgets are added once they're agreed; pass --check <file> to use another file.`,
      );
    }

    throw error;
  }

  return validateBudgets(JSON.parse(text), { ...options, file });
}

function inClass(rule, deterministic) {
  return !deterministic || rule.deterministic;
}

// A deterministic run's timings are single samples, so its results are only ever checked or
// recorded in the deterministic class, whatever the caller asked for.
function isDeterministic(results, deterministic) {
  return deterministic || results.mode === "deterministic";
}

// A check of class "all", or "deterministic" under `deterministic`, passes only when every
// budget of the class was measured and is within its maximum, every deterministic metric the run
// measured has a budget, no phase failed and the run finished.
export function checkBudgets(results, budgets, { deterministic: requested = false, file }) {
  const deterministic = isDeterministic(results, requested);
  const rules = new Map();

  for (const metric of results.metrics) {
    rules.set(metric.key, metric);
  }

  const exceeded = [];
  const unmeasured = [];
  const unbudgeted = [];
  const failed = [];

  for (const [scenario, limits] of scenarioEntries(budgets)) {
    const checked = [];

    for (const [key, max] of Object.entries(limits)) {
      if (inClass(rules.get(key), deterministic)) {
        checked.push([key, max]);
      }
    }

    if (checked.length === 0) {
      continue;
    }

    const measured = results.scenarios[scenario];

    if (!measured) {
      unmeasured.push(`${scenario}: (scenario not in this run)`);
      continue;
    }

    for (const [key, max] of checked) {
      if (!Object.hasOwn(measured.metrics, key)) {
        unmeasured.push(`${scenario}: ${key}`);
        continue;
      }

      const value = measured.metrics[key];

      if (!Number.isFinite(value)) {
        failed.push(`${scenario}: ${key} isn't a finite number (${JSON.stringify(value)})`);
        continue;
      }

      const rule = rules.get(key);

      if (exceeds(value, max, rule)) {
        const shownValue = format(rule, value);
        const shownMax = format(rule, max);
        let line = `${scenario}: ${key} = ${shownValue} exceeds ${shownMax}`;

        // Just over the maximum at the shown resolution: the raw values tell them apart.
        if (shownValue === shownMax) {
          line += ` (${value} > ${max})`;
        }

        exceeded.push(line);
      }
    }
  }

  for (const [scenario, measured] of Object.entries(results.scenarios)) {
    const limits = budgets[scenario] ?? {};

    for (const rule of results.metrics) {
      const isUnbudgeted =
        rule.deterministic &&
        Object.hasOwn(measured.metrics, rule.key) &&
        !Object.hasOwn(limits, rule.key);

      if (isUnbudgeted) {
        unbudgeted.push(`${scenario}: ${rule.key}`);
      }
    }
  }

  if (results.failure) {
    const { scenario, phase, message } = results.failure;

    failed.push(`${scenario}: ${phase}: ${message}`);
  } else if (!results.finishedAt) {
    failed.push("(the run didn't finish)");
  }

  let checkedClass = "all";

  if (deterministic) {
    checkedClass = "deterministic";
  }

  return {
    file,
    class: checkedClass,
    passed:
      exceeded.length === 0 &&
      unmeasured.length === 0 &&
      unbudgeted.length === 0 &&
      failed.length === 0,
    exceeded,
    unmeasured,
    unbudgeted,
    failed,
  };
}

// The check's lists and verdict, as the bench and the CLI print them.
export function report(check) {
  const lines = [];

  for (const name of ["failed", "exceeded", "unmeasured", "unbudgeted"]) {
    if (check[name].length > 0) {
      lines.push(`${name}:`);

      for (const line of check[name]) {
        lines.push(`  ${line}`);
      }
    }
  }

  if (check.passed) {
    lines.push(`Budgets met (${check.file}, ${check.class}).`);
  } else {
    lines.push(`Budget check failed (${check.file}, ${check.class}).`);
  }

  return lines.join("\n");
}

// Writes the run's bench name and each measured statistic's maximum, by its rule, for every
// scenario in the run (only deterministic metrics under `deterministic`), and keeps every other
// entry. Scenarios keep the file's order with new ones appended in run order; keys follow the
// snapshot's order. `budgets` is a file validated for the run's bench, or {} for a new one.
export function recordBudgets(results, budgets, { deterministic: requested = false, file }) {
  if (!results.finishedAt || results.failure) {
    throw new Error(`${file} is an incomplete run; budgets are recorded only from a finished run`);
  }

  const deterministic = isDeterministic(results, requested);

  const scenarios = [];

  for (const [scenario] of scenarioEntries(budgets)) {
    scenarios.push(scenario);
  }

  for (const scenario of Object.keys(results.scenarios)) {
    if (!scenarios.includes(scenario)) {
      scenarios.push(scenario);
    }
  }

  const next = { bench: results.bench };
  const changes = [];

  for (const scenario of scenarios) {
    const limits = { ...budgets[scenario] };
    const measured = results.scenarios[scenario];

    if (measured) {
      for (const rule of results.metrics) {
        const isRecorded =
          rule.budget !== null &&
          inClass(rule, deterministic) &&
          Object.hasOwn(measured.metrics, rule.key);

        if (!isRecorded) {
          continue;
        }

        const value = measured.metrics[rule.key];

        if (!Number.isFinite(value)) {
          throw new Error(
            `${file}: ${scenario}: ${rule.key} isn't a finite number (${JSON.stringify(value)}); nothing was recorded`,
          );
        }

        const max = maximum(value, rule.budget);
        let previous = "unset";

        if (Object.hasOwn(limits, rule.key)) {
          previous = String(limits[rule.key]);
        }

        if (limits[rule.key] !== max) {
          changes.push(`${scenario}: ${rule.key} ${previous} → ${max}`);
        }

        limits[rule.key] = max;
      }
    }

    const ordered = {};

    for (const rule of results.metrics) {
      if (Object.hasOwn(limits, rule.key)) {
        ordered[rule.key] = limits[rule.key];
      }
    }

    next[scenario] = ordered;
  }

  return { budgets: next, changes };
}

function usage(message) {
  console.error(`${message}

Usage: node tools/bench/budgets.mjs record|check <results.json> <budgets.json> [--deterministic]`);
  process.exit(2);
}

async function main(argv) {
  let deterministic = false;
  const positional = [];

  for (const argument of argv) {
    if (argument === "--deterministic") {
      deterministic = true;
    } else if (argument.startsWith("--")) {
      usage(`Unknown argument ${argument}`);
    } else {
      positional.push(argument);
    }
  }

  const [command, resultsArgument, budgetsArgument] = positional;

  if (positional.length !== 3 || (command !== "record" && command !== "check")) {
    usage("Pass record or check, a results file and a budgets file");
  }

  const resultsFile = resolve(resultsArgument);
  const budgetsFile = resolve(budgetsArgument);
  const results = JSON.parse(await readFile(resultsFile, "utf8"));

  validateRules(results.metrics, resultsFile);

  const options = { metrics: results.metrics, bench: results.bench };

  if (command === "check") {
    const budgets = await readBudgets(budgetsFile, options);
    const check = checkBudgets(results, budgets, { deterministic, file: budgetsFile });

    console.log(report(check));

    if (!check.passed) {
      process.exitCode = 1;
    }

    return;
  }

  let budgets = {};
  const present = await exists(budgetsFile);

  if (present) {
    budgets = await readBudgets(budgetsFile, options);
  }

  const recorded = recordBudgets(results, budgets, { deterministic, file: resultsFile });

  await writeFile(budgetsFile, `${JSON.stringify(recorded.budgets, null, 2)}\n`);

  for (const change of recorded.changes) {
    console.log(change);
  }

  console.log(`${recorded.changes.length} budgets changed in ${budgetsFile}.`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
