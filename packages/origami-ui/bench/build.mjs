// The Origami build bench: node bench/build.mjs plus the shared flags ([--scenarios a,b,…]
// [--out <dir>] [--samples build=1,ngc=3,tsc=1] [--timeout <seconds>] [--check [file]]
// [--deterministic]). The package's bench:build script runs it under the machine-wide gate lock.
// See bench/README.md for what each number means and tools/bench/README.md for the shared contract.
import { readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bench, progress } from "../../../tools/bench/bench.mjs";
import { measureBundle } from "../../../tools/bench/bundle.mjs";
import { bin, exists, node } from "../../../tools/bench/process.mjs";
import { format } from "../../../tools/bench/table.mjs";
import { parseDiagnostics } from "../../../tools/bench/typescript.mjs";
import { metrics } from "./build-metrics.mjs";
import { companions, entries, scanWorkloads } from "./build-workloads.mjs";
import { buildOptions, createConsumer, packageDirectory, workloadsDirectory } from "./consumer.mjs";

const here = fileURLToPath(new URL("./", import.meta.url));
const require = createRequire(join(packageDirectory, "package.json"));
const manifest = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
const names = entries(manifest);
const scenarios = ["baseline", ...names, "all"];
const sizes = ["raw", "gzip", "brotli"];
// An Origami FESM in esbuild's inputs; the group is its entry, absent for the package root.
const origamiInput = /loozo-origami-ui(?:-([a-z-]+))?\.mjs$/;
const angularCoreInput = /^(.*?(?:^|\/)@angular\/core)\//;

// Read by prerequisites, before the output directory exists, so a workload error fails at once.
let workloads;

function validate(key) {
  if (!scenarios.includes(key)) {
    throw new Error(
      `--scenarios takes baseline, all or an Origami entry (${names.join(", ")}), got "${key}"`,
    );
  }
}

function label(key) {
  const declared = companions[key];

  if (declared) {
    return `${key} (+ ${declared.join(", ")})`;
  }

  return key;
}

function duration(ms) {
  return format({ unit: "ms" }, ms);
}

async function prerequisites() {
  const installed = await exists(join(packageDirectory, "node_modules/@angular/cli/package.json"));

  if (!installed) {
    throw new Error(
      "Dependencies aren't installed: run pnpm install --frozen-lockfile at the repo root.",
    );
  }

  for (const name of names) {
    const file = join(packageDirectory, `dist/fesm2022/loozo-origami-ui-${name}.mjs`);
    const built = await exists(file);

    if (!built) {
      throw new Error(
        `The package isn't built (${file} is missing): run pnpm --dir packages/origami-ui build.`,
      );
    }
  }

  workloads = await scanWorkloads({
    packageDirectory,
    workloads: workloadsDirectory,
    entries: names,
  });
}

// The entries a scenario's initial bundle must ship bytes of: an entry and its companions, or every
// entry for all.
function retained(scenario) {
  if (scenario === "all") {
    return names;
  }

  return [scenario, ...(companions[scenario] ?? [])];
}

// Origami's minified bytes in the initial files, per input and grouped by entry FESM.
function origamiBytes(bundle, stats) {
  const inputs = [];
  const byEntry = {};
  let total = 0;

  for (const file of bundle.files) {
    if (!file.initial) {
      continue;
    }

    for (const [input, contribution] of Object.entries(stats.outputs[file.path].inputs)) {
      const match = origamiInput.exec(input);

      if (!match || contribution.bytesInOutput === 0) {
        continue;
      }

      const entry = match[1] ?? ".";

      inputs.push({ input, bytes: contribution.bytesInOutput });
      byEntry[entry] = (byEntry[entry] ?? 0) + contribution.bytesInOutput;
      total += contribution.bytesInOutput;
    }
  }

  return { inputs, byEntry, total };
}

// The realpaths of the @angular/core installations behind the initial inputs.
async function angularCoreRoots(consumer, inputs) {
  const roots = new Set();

  for (const input of inputs) {
    const match = angularCoreInput.exec(input);

    if (match) {
      roots.add(await realpath(resolve(consumer, match[1])));
    }
  }

  return [...roots].sort((a, b) => a.localeCompare(b, "en"));
}

// Fills run.result phase by phase; the shared harness saves after each.
async function measure(scenario, run) {
  const { logs, samples, timeoutMs, phase, record, result, shared } = run;
  const { consumer } = shared;
  const output = join(consumer, "dist", scenario);

  result.workload = shared.workloads[scenario];

  await phase(
    "build",
    async () => {
      const ng = await bin(require, "@angular/cli", "ng");
      const buildMs = [];
      // Entries build once for their bytes; all's builds are its timing samples.
      let count = 1;

      if (scenario === "all") {
        count = samples.build;
      }

      for (let sample = 1; sample <= count; sample++) {
        const { wallMs } = await node([ng, "build", "bench", "--configuration", scenario], {
          cwd: consumer,
          log: join(logs, `build-${sample}.log`),
          timeoutMs,
        });

        buildMs.push(wallMs);
        progress(`  sample ${sample}: ${duration(wallMs)}`);
      }

      result.buildMs = buildMs;

      if (scenario === "all") {
        record("build.ms", buildMs);
      }
    },
    { deterministic: true },
  );

  await phase(
    "bundle",
    async () => {
      const bundle = await measureBundle({
        output,
        entryPoint: buildOptions.browser,
        index: "index.html",
      });
      const stats = JSON.parse(await readFile(join(output, "browser-stats.json"), "utf8"));
      const origami = origamiBytes(bundle, stats);
      const roots = await angularCoreRoots(consumer, bundle.initial.inputs);

      result.bundle = bundle;
      result.origamiInputs = origami.inputs;
      result.origamiByEntry = origami.byEntry;
      result.angularCoreRoots = roots;

      if (roots.length !== 1) {
        throw new Error(
          `Expected one @angular/core installation in ${scenario}'s initial bundle, found ${roots.length}: ${roots.join(", ")}`,
        );
      }

      // An entry's library code can be retained by another primitive (Date Picker keeps Calendar's),
      // so all also needs each workload module itself: a fixture dropped from its template is gone.
      if (scenario === "all") {
        const inputs = new Set(bundle.initial.inputs.map((input) => input.replace(/^\.\//, "")));

        for (const entry of names) {
          if (!inputs.has(`src/workloads/${entry}.ts`)) {
            throw new Error(
              `all's initial bundle doesn't include the ${entry} workload: workloads/all.ts imports it without rendering it`,
            );
          }
        }
      }

      if (scenario !== "baseline") {
        for (const entry of retained(scenario)) {
          const bytes = origami.byEntry[entry] ?? 0;

          if (bytes > 0) {
            continue;
          }

          if (entry === scenario || scenario === "all") {
            throw new Error(
              `${entry}'s module ships no bytes in ${scenario}'s initial bundle: its workload imports it without using it`,
            );
          }

          throw new Error(
            `${scenario}'s companion ${entry} ships no bytes in its initial bundle: workloads/${scenario}.ts imports it without using it`,
          );
        }
      }

      for (const size of sizes) {
        record(`bundle.initial.${size}`, [bundle.initial[size]]);
      }

      if (scenario === "baseline") {
        shared.baseline = bundle.initial;

        return;
      }

      for (const size of sizes) {
        record(`bundle.added.${size}`, [bundle.initial[size] - shared.baseline[size]]);
      }

      record("bundle.origami.raw", [origami.total]);
    },
    { deterministic: true },
  );

  if (scenario !== "all") {
    return;
  }

  // ngc is timing only, so --deterministic skips it; tsc gives the instantiations.
  await phase("ngc", async () => {
    const ngc = await bin(require, "@angular/compiler-cli", "ngc");
    const ngcMs = [];

    for (let sample = 1; sample <= samples.ngc; sample++) {
      const { wallMs } = await node([ngc, "-p", "tsconfig.app.json", "--noEmit"], {
        cwd: consumer,
        log: join(logs, `ngc-${sample}.log`),
        timeoutMs,
      });

      ngcMs.push(wallMs);
      progress(`  ngc sample ${sample}: ${duration(wallMs)}`);
    }

    record("typecheck.ngcMs", ngcMs);
  });

  await phase(
    "tsc",
    async () => {
      const tsc = await bin(require, "typescript", "tsc");
      const instantiations = [];

      for (let sample = 1; sample <= samples.tsc; sample++) {
        const { output: printed } = await node(
          [
            tsc,
            "-p",
            "tsconfig.app.json",
            "--noEmit",
            "--extendedDiagnostics",
            "--incremental",
            "false",
          ],
          { cwd: consumer, log: join(logs, `tsc-${sample}.log`), timeoutMs },
        );
        const diagnostics = parseDiagnostics(printed);

        instantiations.push(Number.parseInt(diagnostics.Instantiations, 10));
        result.tscDiagnostics = diagnostics;
      }

      record("typecheck.instantiations", instantiations);
    },
    { deterministic: true },
  );
}

await bench(
  {
    name: "origami-ui-build",
    metrics,
    scenarios: {
      default: scenarios,
      always: ["baseline"],
      validate,
      label,
      layout: "scenario-rows",
    },
    samples: { build: 1, ngc: 3, tsc: 1 },
    budgets: join(here, "budgets/build.json"),
    conditions: {
      consumer:
        "One scratch app per run: node_modules links this package's dependencies, and @loozo/origami-ui links packages/origami-ui/dist, the built package. Its program is every workload under src/.",
      build:
        "ng build bench --configuration <scenario>, which replaces src/workload.ts with the scenario's workload: browser-only application build, scripts and styles optimization, fonts off, statsJson, no source maps, outputHashing all, Angular's disk cache off. Entries build once; all's builds are timed as whole processes.",
      bundle:
        "Initial files: main's static JS/CSS closure from browser-stats.json. Added: the scenario's initial bytes minus baseline's from the same run. Origami: esbuild's bytesInOutput of the Origami FESM inputs in the initial files.",
      typecheck:
        "ngc -p tsconfig.app.json --noEmit, and tsc -p tsconfig.app.json --noEmit --extendedDiagnostics --incremental false, over every workload; tsc's instantiations exclude Angular's template type-check.",
      compression: "Per file, then summed: gzip level 9, Brotli quality 11.",
    },
    packages: [packageDirectory],
    prerequisites,
    setup: async ({ out }) => {
      const consumer = join(out, "consumer");

      await createConsumer(consumer, scenarios);

      return { consumer, workloads, baseline: undefined };
    },
    measure,
  },
  process.argv.slice(2),
);
