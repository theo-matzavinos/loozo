// How values read in the results table and in budget lines, and the table itself.

function round(value, decimals) {
  const scale = 10 ** decimals;

  return Math.round(value * scale) / scale;
}

// Durations keep their precision: below 10 ms in ms with 3 decimals, up to 1 s in ms with 2,
// from 1 s in s with 2. The range is chosen on the value rounded to its decimals, so nothing prints
// as 10.000 ms or 1000.00 ms. Bytes, kilobytes and counts are rounded with thousands separators.
export function format(metric, value) {
  if (metric.unit === "ms") {
    const magnitude = Math.abs(value);

    if (round(magnitude, 3) < 10) {
      return `${value.toFixed(3)} ms`;
    }

    if (round(magnitude, 2) < 1000) {
      return `${value.toFixed(2)} ms`;
    }

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

function summary(machine) {
  const packages = [];

  for (const [name, version] of Object.entries(machine.packages)) {
    packages.push(`${name} ${version}`);
  }

  let dirty = "";

  if (machine.git.dirty) {
    dirty = " (dirty)";
  }

  return `${machine.cpu.model} (${machine.cpu.logicalCores} logical cores), ${Math.round(machine.memoryBytes / 2 ** 30)} GiB RAM, ${machine.os.type} ${machine.os.release}; Node ${machine.node}, pnpm ${machine.pnpm}, Angular ${machine.angular.core}, TypeScript ${machine.typescript}, ${packages.join(", ")} at ${machine.git.commit.slice(0, 7)}${dirty}.`;
}

// A markdown table with its columns padded, numbers right-aligned.
function markdown(header, rows) {
  const widths = [];

  for (const [column, cell] of header.entries()) {
    let width = Math.max(3, cell.length);

    for (const row of rows) {
      width = Math.max(width, row[column].length);
    }

    widths.push(width);
  }

  const lines = [];
  const separator = [];

  for (const [column, width] of widths.entries()) {
    if (column === 0) {
      separator.push("-".repeat(width));
    } else {
      separator.push(`${"-".repeat(width - 1)}:`);
    }
  }

  lines.push(`| ${header.map((cell, column) => cell.padEnd(widths[column])).join(" | ")} |`);
  lines.push(`| ${separator.join(" | ")} |`);

  for (const row of rows) {
    const cells = [];

    for (const [column, cell] of row.entries()) {
      if (column === 0) {
        cells.push(cell.padEnd(widths[column]));
      } else {
        cells.push(cell.padStart(widths[column]));
      }
    }

    lines.push(`| ${cells.join(" | ")} |`);
  }

  return lines.join("\n");
}

// The machine summary and every measured metric's statistic by scenario, from results.json alone.
// "metric-rows" puts a metric on each row and a scenario in each column; "scenario-rows" the
// reverse. A metric no scenario measured is left out; a scenario that didn't measure it gets an
// empty cell.
export function table(results, { label, layout }) {
  const scenarios = Object.keys(results.scenarios);
  const measured = [];

  for (const metric of results.metrics) {
    const isMeasured = scenarios.some((scenario) =>
      Object.hasOwn(results.scenarios[scenario].metrics, metric.key),
    );

    if (isMeasured) {
      measured.push(metric);
    }
  }

  function cell(scenario, metric) {
    const values = results.scenarios[scenario].metrics;

    if (!Object.hasOwn(values, metric.key)) {
      return "";
    }

    return format(metric, values[metric.key]);
  }

  let header;
  const rows = [];

  if (layout === "metric-rows") {
    header = ["Metric", ...scenarios.map(label)];

    for (const metric of measured) {
      rows.push([metric.label, ...scenarios.map((scenario) => cell(scenario, metric))]);
    }
  } else {
    header = ["Scenario", ...measured.map((metric) => metric.label)];

    for (const scenario of scenarios) {
      rows.push([label(scenario), ...measured.map((metric) => cell(scenario, metric))]);
    }
  }

  return `${summary(results.machine)}\n\n${markdown(header, rows)}`;
}
