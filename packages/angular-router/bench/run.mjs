// The scale benchmark: node bench/run.mjs [--sizes 100,300,1000] [--out <dir>]
// [--samples generate=3,edits=3,build=1,ngc=3,tsc=1] [--timeout <seconds>] [--check [file]]
// See bench/README.md for what each number means.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { measureBundle } from "./bundle.mjs";
import { cachePolicy, createConsumer, packageDirectory, setCache } from "./consumer.mjs";
import { editedRoute, groupSize, writeFixture } from "./fixture.mjs";
import { load, machine } from "./machine.mjs";
import { checkBudgets, median, readBudgets, table } from "./metrics.mjs";

const bench = fileURLToPath(new URL("./", import.meta.url));
const require = createRequire(join(packageDirectory, "package.json"));
const pollMs = 20;
const settleMs = 1500;

function usage(message) {
  console.error(`${message}

Usage: node bench/run.mjs [--sizes 100,300,1000] [--out <dir>]
         [--samples generate=3,edits=3,build=1,ngc=3,tsc=1] [--timeout <seconds>] [--check [file]]`);
  process.exit(2);
}

function parseArguments(argv) {
  const options = {
    sizes: [100, 300, 1000],
    out: undefined,
    samples: { generate: 3, edits: 3, build: 1, ngc: 3, tsc: 1 },
    timeoutMs: 1200 * 1000,
    check: undefined,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    // pnpm forwards a separating "--" to the script.
    if (argument === "--") {
      continue;
    }

    if (argument === "--check") {
      options.check = join(bench, "budgets.json");

      const next = argv[index + 1];

      if (next !== undefined && !next.startsWith("--")) {
        options.check = resolve(next);
        index++;
      }

      continue;
    }

    const value = argv[index + 1];

    if (value === undefined) {
      usage(`Missing a value for ${argument}`);
    }

    index++;

    if (argument === "--sizes") {
      options.sizes = [];

      for (const part of value.split(",")) {
        const size = Number(part);

        if (!Number.isInteger(size) || size <= 0 || size % groupSize !== 0) {
          usage(`--sizes takes positive multiples of ${groupSize}, got "${part}"`);
        }

        if (options.sizes.includes(size)) {
          usage(`--sizes lists ${size} twice`);
        }

        options.sizes.push(size);
      }
    } else if (argument === "--out") {
      options.out = resolve(value);
    } else if (argument === "--samples") {
      for (const part of value.split(",")) {
        const [name, count] = part.split("=");
        const samples = Number(count);

        if (!Object.hasOwn(options.samples, name) || !Number.isInteger(samples) || samples < 1) {
          usage(
            `--samples takes name=count with a count of at least 1 for ${Object.keys(options.samples).join(", ")}, got "${part}"`,
          );
        }

        options.samples[name] = samples;
      }
    } else if (argument === "--timeout") {
      const seconds = Number(value);

      if (!Number.isFinite(seconds) || seconds <= 0) {
        usage(`--timeout takes a positive number of seconds, got "${value}"`);
      }

      options.timeoutMs = seconds * 1000;
    } else {
      usage(`Unknown argument ${argument}`);
    }
  }

  return options;
}

async function exists(path) {
  try {
    await access(path);

    return true;
  } catch {
    return false;
  }
}

async function prerequisites() {
  const installed = await exists(join(packageDirectory, "node_modules/@angular/cli/package.json"));

  if (!installed) {
    throw new Error(
      "Dependencies aren't installed: run pnpm install --frozen-lockfile at the repo root.",
    );
  }

  for (const file of [
    "node/src/generation/generate.js",
    "node/src/builders/serve.js",
    "dist/fesm2022/loozo-angular-router.mjs",
  ]) {
    const built = await exists(join(packageDirectory, file));

    if (!built) {
      throw new Error(
        `The package isn't built (${file} is missing): run pnpm --dir packages/angular-router build.`,
      );
    }
  }
}

async function outputDirectory(out) {
  if (out === undefined) {
    return mkdtemp(join(os.tmpdir(), "angular-router-bench-"));
  }

  const present = await exists(out);

  if (present) {
    const entries = await readdir(out);

    if (entries.length > 0) {
      throw new Error(`--out ${out} isn't empty; pass a new or empty directory.`);
    }
  }

  await mkdir(out, { recursive: true });

  return out;
}

async function bin(name, command) {
  const manifestPath = require.resolve(`${name}/package.json`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  let entry = manifest.bin;

  if (typeof entry === "object") {
    entry = entry[command];
  }

  return join(dirname(manifestPath), entry);
}

// Runs a Node script, keeps its combined output in a log, and fails on a nonzero exit or once it
// outlives the timeout.
async function node(args, { cwd, log, timeoutMs }) {
  const started = performance.now();
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, NG_CLI_ANALYTICS: "false" },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  let output = "";

  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });

  const { code, signal } = await new Promise((resolvePromise, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode, exitSignal) => {
      resolvePromise({ code: exitCode, signal: exitSignal });
    });
  });
  const wallMs = performance.now() - started;

  await writeFile(log, output);

  if (signal && wallMs >= timeoutMs) {
    throw new Error(`Timed out after ${timeoutMs / 1000} s: node ${args.join(" ")}; see ${log}`);
  }

  if (code !== 0) {
    throw new Error(`Failed (${signal ?? `exit ${code}`}): node ${args.join(" ")}; see ${log}`);
  }

  return { wallMs, output };
}

async function files(directory, predicate, found = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      await files(path, predicate, found);
    } else if (predicate(entry.name)) {
      found.push(path);
    }
  }

  return found;
}

function isGenerated(name) {
  return name.endsWith(".generated.ts");
}

function isAuthored(name) {
  return name === "route.ts" || name === "page.ts";
}

// One hash over the paths and bytes of the consumer's route files that match.
async function digest(consumer, predicate) {
  const roots = [join(consumer, "src/routes")];
  const generated = join(consumer, "generated");
  const hasGenerated = await exists(generated);

  if (hasGenerated) {
    roots.push(generated);
  }

  const paths = [];

  for (const root of roots) {
    await files(root, predicate, paths);
  }

  paths.sort((a, b) => a.localeCompare(b));

  const hash = createHash("sha256");

  for (const path of paths) {
    hash.update(relative(consumer, path));
    hash.update("\0");
    hash.update(await readFile(path));
    hash.update("\0");
  }

  return { files: paths.length, sha256: hash.digest("hex") };
}

async function removeGenerated(consumer) {
  await rm(join(consumer, "generated"), { recursive: true, force: true });

  for (const path of await files(join(consumer, "src/routes"), isGenerated)) {
    await rm(path);
  }
}

function parseDiagnostics(output) {
  const diagnostics = {};

  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z][\w ./-]*?):\s+(\S+)\s*$/);

    if (match) {
      diagnostics[match[1]] = match[2];
    }
  }

  for (const name of ["Check time", "Instantiations", "Memory used"]) {
    if (!Object.hasOwn(diagnostics, name)) {
      throw new Error(`tsc --extendedDiagnostics printed no "${name}"`);
    }
  }

  return diagnostics;
}

function progress(message) {
  console.error(`[bench] ${message}`);
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(2)} s`;
}

// Fills result (already in results.json) phase by phase, saving after each.
async function measure(result, options, directory, save) {
  const { routes } = result;
  const consumer = join(directory, "consumer");
  const logs = join(directory, "logs");
  const { samples, timeoutMs } = options;

  result.consumer = consumer;

  function record(key, values) {
    result.samples[key] = values;
    result.metrics[key] = median(values);
  }

  async function phase(name, body) {
    const before = load();

    progress(`${routes} routes: ${name}`);
    await body();
    result.load[name] = { before, after: load() };
    await save();
  }

  await mkdir(logs, { recursive: true });
  await createConsumer(consumer);
  result.fixture = await writeFixture(consumer, routes);

  const authored = await digest(consumer, isAuthored);

  await phase("generate", async () => {
    const generateMs = [];
    const processMs = [];
    let first;

    for (let sample = 1; sample <= samples.generate; sample++) {
      await removeGenerated(consumer);

      const { wallMs, output } = await node([join(bench, "generate.mjs"), consumer], {
        cwd: consumer,
        log: join(logs, `generate-${sample}.log`),
        timeoutMs,
      });
      const timing = JSON.parse(output.trim().split("\n").at(-1));
      const generated = await digest(consumer, isGenerated);
      const sources = await digest(consumer, isAuthored);

      if (sources.sha256 !== authored.sha256) {
        throw new Error("First generation rewrote authored route files; the fixture is stale.");
      }

      if (first && generated.sha256 !== first.sha256) {
        throw new Error(`First generation sample ${sample} published different files.`);
      }

      first = generated;
      generateMs.push(timing.generateMs);
      processMs.push(wallMs);
      progress(`  sample ${sample}: generate() ${seconds(timing.generateMs)}`);
    }

    record("generate.ms", generateMs);
    record("generate.processMs", processMs);
    result.generated = first;
  });

  await phase("serve", async () => {
    const resultPath = join(logs, "serve.json");

    await setCache(consumer, cachePolicy.serve);
    await node(
      [
        join(bench, "serve.mjs"),
        consumer,
        resultPath,
        join(logs, "serve-architect.json"),
        JSON.stringify({ edits: samples.edits, timeoutMs, pollMs, settleMs }),
      ],
      {
        cwd: consumer,
        log: join(logs, "serve.log"),
        timeoutMs: timeoutMs * (3 + 2 * samples.edits),
      },
    );

    const serve = JSON.parse(await readFile(resultPath, "utf8"));
    const generatedMs = [];
    const servedMs = [];

    for (const edit of serve.edits) {
      generatedMs.push(edit.generatedMs);
      servedMs.push(edit.servedMs);
    }

    record("serve.startupMs", [serve.startupMs]);
    record("serve.generatedMs", generatedMs);
    record("serve.servedMs", servedMs);
    result.serve = serve;
    progress(`  edit → generated ${seconds(result.metrics["serve.generatedMs"])} (median)`);
    // Later phases measure the first-generation fixture again; the build's preflight republishes.
    await writeFile(join(consumer, editedRoute.path), editedRoute.source(false));
  });

  await phase("build", async () => {
    const ng = await bin("@angular/cli", "ng");
    const buildMs = [];

    await setCache(consumer, cachePolicy.build);

    for (let sample = 1; sample <= samples.build; sample++) {
      const { wallMs } = await node([ng, "build", "proof"], {
        cwd: consumer,
        log: join(logs, `build-${sample}.log`),
        timeoutMs,
      });

      buildMs.push(wallMs);
      progress(`  sample ${sample}: ${seconds(wallMs)}`);
    }

    const generated = await digest(consumer, isGenerated);

    if (generated.sha256 !== result.generated.sha256) {
      throw new Error("The build's generated files differ from first generation's.");
    }

    record("build.ms", buildMs);
  });

  await phase("typecheck", async () => {
    const ngc = await bin("@angular/compiler-cli", "ngc");
    const tsc = await bin("typescript", "tsc");
    const ngcMs = [];
    const tscMs = [];
    const checkMs = [];
    const instantiations = [];
    const memoryKB = [];

    for (let sample = 1; sample <= samples.ngc; sample++) {
      const { wallMs } = await node([ngc, "-p", "tsconfig.app.json", "--noEmit"], {
        cwd: consumer,
        log: join(logs, `ngc-${sample}.log`),
        timeoutMs,
      });

      ngcMs.push(wallMs);
      progress(`  ngc sample ${sample}: ${seconds(wallMs)}`);
    }

    for (let sample = 1; sample <= samples.tsc; sample++) {
      const { wallMs, output } = await node(
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
      const diagnostics = parseDiagnostics(output);

      tscMs.push(wallMs);
      checkMs.push(Number.parseFloat(diagnostics["Check time"]) * 1000);
      instantiations.push(Number.parseInt(diagnostics.Instantiations, 10));
      memoryKB.push(Number.parseInt(diagnostics["Memory used"], 10));
      result.tscDiagnostics = diagnostics;
    }

    record("typecheck.ngcMs", ngcMs);
    record("typecheck.tscMs", tscMs);
    record("typecheck.tscCheckMs", checkMs);
    record("typecheck.instantiations", instantiations);
    record("typecheck.memoryKB", memoryKB);
  });

  await phase("bundle", async () => {
    const bundle = await measureBundle(consumer);

    for (const kind of ["initial", "lazy"]) {
      for (const size of ["raw", "gzip", "brotli"]) {
        record(`bundle.${kind}.${size}`, [bundle[kind][size]]);
      }
    }

    result.bundle = bundle;
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  let budgets;

  // Fail on a missing or invalid budgets file before anything runs.
  if (options.check) {
    budgets = await readBudgets(options.check);
  }

  await prerequisites();

  const out = await outputDirectory(options.out);
  const resultsPath = join(out, "results.json");
  const results = {
    startedAt: new Date().toISOString(),
    finishedAt: undefined,
    out,
    options: {
      sizes: options.sizes,
      samples: options.samples,
      timeoutMs: options.timeoutMs,
      pollMs,
      settleMs,
    },
    conditions: {
      firstGeneration:
        "Fresh Node process per sample with generated files removed and route.ts files preauthored; times the awaited internal generate() without persistent compiler state.",
      serve:
        "The router serve target in-process through Architect, development configuration (optimization off, outputHashing none); title toggles on src/routes/g0000/static/l0/route.ts.",
      serveCache: cachePolicy.serve,
      build:
        "ng build through the router application target (generator preflight included): browser build, scripts and styles optimization, fonts off, statsJson, no source maps, outputHashing all.",
      buildCache: cachePolicy.build,
      typecheck:
        "ngc -p tsconfig.app.json --noEmit, and tsc -p tsconfig.app.json --noEmit --extendedDiagnostics --incremental false; no untyped baseline.",
      compression: "Per file, then summed: gzip level 9, Brotli quality 11.",
    },
    machine: await machine(),
    sizes: {},
  };

  async function save() {
    await writeFile(resultsPath, `${JSON.stringify(results, null, 2)}\n`);
  }

  progress(`writing to ${out}`);
  await save();

  for (const routes of options.sizes) {
    const directory = join(out, String(routes));
    const sizeResults = { routes, metrics: {}, samples: {}, load: {} };

    results.sizes[routes] = sizeResults;
    await measure(sizeResults, options, directory, save);
  }

  results.finishedAt = new Date().toISOString();
  await save();
  progress(`results: ${resultsPath}`);
  console.log(table(results));

  if (budgets) {
    const { exceeded, skipped } = checkBudgets(results, budgets);

    for (const size of skipped) {
      console.error(`Budget check skipped ${size} routes: not measured in this run.`);
    }

    if (exceeded.length > 0) {
      console.error(`Budgets exceeded (${options.check}):\n- ${exceeded.join("\n- ")}`);
      process.exitCode = 1;

      return;
    }

    console.error(`Budgets met (${options.check}).`);
  }
}

try {
  await main();
} catch (error) {
  console.error(`[bench] ${error.message}`);
  process.exitCode = 1;
}
