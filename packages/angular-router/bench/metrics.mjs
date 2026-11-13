// The metric keys results.json and budgets share, the markdown table, and the budget check.
import { readFile } from "node:fs/promises";

// Times are milliseconds, sizes bytes, memory kilobytes; the table shows times in seconds.
export const metrics = [
  { key: "generate.ms", label: "First generation: generate()", unit: "ms" },
  { key: "generate.processMs", label: "First generation: fresh process", unit: "ms" },
  { key: "serve.startupMs", label: "Serve: startup to first build", unit: "ms" },
  { key: "serve.generatedMs", label: "Serve: edit → routes.generated.ts", unit: "ms" },
  { key: "serve.servedMs", label: "Serve: edit → served main.js", unit: "ms" },
  { key: "build.ms", label: "ng build (incl. generator preflight)", unit: "ms" },
  { key: "typecheck.ngcMs", label: "Type-check: ngc --noEmit", unit: "ms" },
  { key: "typecheck.tscMs", label: "Type-check: tsc --noEmit", unit: "ms" },
  { key: "typecheck.tscCheckMs", label: "Type-check: tsc check time", unit: "ms" },
  { key: "typecheck.instantiations", label: "Type-check: tsc instantiations", unit: "count" },
  { key: "typecheck.memoryKB", label: "Type-check: tsc memory used", unit: "KB" },
  { key: "bundle.initial.raw", label: "Initial bundle: raw", unit: "bytes" },
  { key: "bundle.initial.gzip", label: "Initial bundle: gzip", unit: "bytes" },
  { key: "bundle.initial.brotli", label: "Initial bundle: brotli", unit: "bytes" },
  { key: "bundle.lazy.raw", label: "Lazy chunks: raw", unit: "bytes" },
  { key: "bundle.lazy.gzip", label: "Lazy chunks: gzip", unit: "bytes" },
  { key: "bundle.lazy.brotli", label: "Lazy chunks: brotli", unit: "bytes" },
];

const keys = new Set(metrics.map((metric) => metric.key));

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function format(metric, value) {
  if (metric.unit === "ms") {
    return `${(value / 1000).toFixed(2)} s`;
  }

  let unit = "";

  if (metric.unit === "bytes") {
    unit = " B";
  }

  if (metric.unit === "KB") {
    unit = " KB";
  }

  return `${Math.round(value).toLocaleString("en-US")}${unit}`;
}

export function table(results) {
  const sizes = Object.keys(results.sizes);
  const { machine } = results;
  let dirty = "";

  if (machine.git.dirty) {
    dirty = " (dirty)";
  }

  const lines = [
    `${machine.cpu.model} (${machine.cpu.logicalCores} logical cores), ${Math.round(machine.memoryBytes / 2 ** 30)} GiB RAM, ${machine.os.type} ${machine.os.release}; Node ${machine.node}, pnpm ${machine.pnpm}, Angular ${machine.angular.core}, TypeScript ${machine.typescript}, router ${machine.router} at ${machine.git.commit.slice(0, 7)}${dirty}.`,
    "",
    `| Metric (median) | ${sizes.map((size) => `${size} routes`).join(" | ")} |`,
    `| --- | ${sizes.map(() => "---:").join(" | ")} |`,
  ];

  for (const metric of metrics) {
    const cells = [];

    for (const size of sizes) {
      cells.push(format(metric, results.sizes[size].metrics[metric.key]));
    }

    lines.push(`| ${metric.label} | ${cells.join(" | ")} |`);
  }

  return lines.join("\n");
}

// budgets.json: { "<routes>": { "<metric key>": max } }, every max in the metric's results.json
// unit. Invalid files fail before anything runs.
export async function readBudgets(path) {
  let text;

  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `No budgets file at ${path}. Budgets are added once they're agreed; pass --check <file> to use another file.`,
      );
    }

    throw error;
  }

  const budgets = JSON.parse(text);
  const problems = [];

  if (typeof budgets !== "object" || budgets === null || Array.isArray(budgets)) {
    throw new Error(`${path} must be an object keyed by route count`);
  }

  for (const [size, limits] of Object.entries(budgets)) {
    if (!/^[1-9]\d*0$/.test(size)) {
      problems.push(`"${size}" isn't a route count (a positive multiple of 10)`);
      continue;
    }

    if (typeof limits !== "object" || limits === null || Array.isArray(limits)) {
      problems.push(`"${size}" must map metric keys to maximums`);
      continue;
    }

    for (const [key, max] of Object.entries(limits)) {
      if (!keys.has(key)) {
        problems.push(`"${size}"."${key}" isn't a metric key`);
      }

      if (typeof max !== "number" || !Number.isFinite(max) || max < 0) {
        problems.push(`"${size}"."${key}" must be a non-negative number`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid budgets in ${path}:\n- ${problems.join("\n- ")}`);
  }

  return budgets;
}

// Every exceeded budget, plus the budgeted sizes this run didn't measure.
export function checkBudgets(results, budgets) {
  const exceeded = [];
  const skipped = [];

  for (const [size, limits] of Object.entries(budgets)) {
    const measured = results.sizes[size];

    if (!measured) {
      skipped.push(size);
      continue;
    }

    for (const [key, max] of Object.entries(limits)) {
      const value = measured.metrics[key];

      if (value > max) {
        exceeded.push(`${size} routes: ${key} = ${Math.round(value)} exceeds ${max}`);
      }
    }
  }

  return { exceeded, skipped };
}
