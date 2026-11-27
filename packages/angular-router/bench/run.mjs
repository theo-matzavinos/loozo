// The scale benchmark, from the repo root: pnpm --dir packages/angular-router run bench --
// [--workload router|remembered|launch] plus the shared flags ([--scenarios 100,300,1000]
// [--out <dir>] [--samples <name>=<count>,…] [--timeout <seconds>] [--check [file]]
// [--deterministic]). The router workload's samples are
// generate=3,edits=3,build=1,ngc=3,tsc=1,boot=10,cold=10,warm=30, the Launch workload's
// generate=3,build=1,ngc=3,tsc=1,ssr=1000,rpc=1000. The bench script runs it under the machine-wide
// gate lock; a raw node bench/run.mjs refuses to start. See bench/README.md for what each number
// means and tools/bench/README.md for the shared contract.
import { createHash } from "node:crypto";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { bench, progress } from "../../../tools/bench/bench.mjs";
import { measureBundle } from "../../../tools/bench/bundle.mjs";
import { bin, exists, files, node } from "../../../tools/bench/process.mjs";
import { format } from "../../../tools/bench/table.mjs";
import { parseDiagnostics } from "../../../tools/bench/typescript.mjs";
import { routeBundle } from "./bundle.mjs";
import {
  cachePolicy,
  createConsumer,
  packageDirectory,
  readWorkspace,
  setCache,
} from "./consumer.mjs";
import { blockSize, editedRoute, screens, writeFixture } from "./fixture.mjs";
import { createLaunchConsumer, launchDirectory } from "./launch-consumer.mjs";
import { writeLaunchFixture } from "./launch-fixture.mjs";
import { metrics } from "./metrics.mjs";
import {
  measureColdStarts,
  measureNavigation,
  measureRequests,
  requireChromium,
  runtimeConditions,
  startServer,
} from "./runtime.mjs";

const here = fileURLToPath(new URL("./", import.meta.url));
const require = createRequire(join(packageDirectory, "package.json"));
const pollMs = 20;
const settleMs = 1500;

// What each workload measures with. The router workload is the default; the Launch workload
// measures Launch's route extension on the same block of routes, without the serve phase. Each
// has its own runtime phase: browser bootstrap and navigation for the router, SSR and RPC
// latency for Launch.
const workloads = {
  router: {
    name: "router",
    createConsumer,
    writeFixture,
    generator: "generate.mjs",
    budgets: "budgets.json",
    serve: true,
    samples: {
      generate: 3,
      edits: 3,
      build: 1,
      ngc: 3,
      tsc: 1,
      boot: 10,
      cold: 10,
      warm: 30,
      screens: 30,
    },
    runtime: measureRouterRuntime,
    // Only the runtime phase needs a browser, so a deterministic run doesn't check for one.
    setup: async ({ deterministic }) => {
      if (!deterministic) {
        await requireChromium();
      }
    },
    built: [
      join(packageDirectory, "node/src/generation/generate.js"),
      join(packageDirectory, "node/src/builders/serve.js"),
      join(packageDirectory, "dist/fesm2022/loozo-angular-router.mjs"),
    ],
    conditions: {
      firstGeneration:
        "Fresh Node process per sample with generated files removed and route.ts files preauthored; times the awaited internal generate() without persistent compiler state.",
      serve:
        "The router serve target in-process through Architect, development configuration (optimization off, outputHashing none); title toggles on src/routes/g0000/static/l0/route.ts, then edits of that route page's template moved to page.html, which must start no generation pass.",
      serveCache: cachePolicy.serve,
      build:
        "ng build through the router application target (generator preflight included): browser build, scripts and styles optimization, fonts off, statsJson, no source maps, outputHashing all.",
      runtime: `${runtimeConditions.router} ${runtimeConditions.bound}`,
    },
  },
  // The router workload with a retained and a remembered key on every block root and session
  // storage: it boots with the page size, warm round trips stay inside the owner and write it,
  // and the cold navigation enters another block, which restores it.
  remembered: {
    name: "remembered",
    createConsumer,
    writeFixture: (consumer, routes) => writeFixture(consumer, routes, { remembered: true }),
    generator: "generate.mjs",
    budgets: "remembered-budgets.json",
    serve: false,
    samples: { generate: 3, build: 1, ngc: 3, tsc: 1, boot: 10, cold: 10, warm: 30, screens: 30 },
    runtime: (options) => measureRouterRuntime(options, { bootSearch: "?pageSize=50" }),
    setup: async ({ deterministic }) => {
      if (!deterministic) {
        await requireChromium();
      }
    },
    built: [
      join(packageDirectory, "node/src/generation/generate.js"),
      join(packageDirectory, "dist/fesm2022/loozo-angular-router.mjs"),
    ],
    conditions: {
      firstGeneration:
        "Fresh Node process per sample with generated files removed and route.ts files preauthored; times the awaited internal generate() without persistent compiler state.",
      build:
        "ng build through the router application target (generator preflight included): browser build, scripts and styles optimization, fonts off, statsJson, no source maps, outputHashing all.",
      runtime: `${runtimeConditions.router} ${runtimeConditions.bound} The remembered workload boots at ?pageSize=50, its warm links carry pageSize=50, and its cold navigation enters another block root without it, which restores it from sessionStorage.`,
    },
  },
  launch: {
    name: "launch",
    createConsumer: createLaunchConsumer,
    writeFixture: writeLaunchFixture,
    generator: "launch-generate.mjs",
    budgets: "launch-budgets.json",
    serve: false,
    samples: {
      generate: 3,
      build: 1,
      ngc: 3,
      tsc: 1,
      ssr: 1000,
      rpc: 1000,
      large: 100,
      starts: 10,
    },
    runtime: measureLaunchRuntime,
    built: [
      join(packageDirectory, "node/src/generation/generate.js"),
      join(packageDirectory, "dist/fesm2022/loozo-angular-router.mjs"),
      join(launchDirectory, "dist/generation/index.js"),
      join(launchDirectory, "dist/builders/application.js"),
      join(launchDirectory, "dist/index.js"),
    ],
    conditions: {
      firstGeneration:
        "Fresh Node process per sample with generated files removed and route.ts files preauthored; times the awaited public Launch generate() (tanstackQuery on) without persistent compiler state.",
      build:
        "ng build through the Launch application target (generation preflight included): browser and server builds with SSR (outputMode server), scripts and styles optimization, fonts off, statsJson, no source maps, outputHashing all.",
      runtime: runtimeConditions.launch,
    },
  },
};

// Takes the router-local --workload flag out of argv; the rest are the shared flags.
function takeWorkload(argv) {
  const rest = [];
  let name = "router";

  for (let index = 0; index < argv.length; index++) {
    if (argv[index] !== "--workload") {
      rest.push(argv[index]);
      continue;
    }

    const value = argv[index + 1];

    if (!Object.hasOwn(workloads, value ?? "")) {
      console.error(
        `--workload takes ${Object.keys(workloads).join(" or ")}, got "${value}"

Usage (from the repo root): pnpm --dir packages/angular-router run bench -- [--workload router|remembered|launch] [shared flags; see tools/bench/README.md]`,
      );
      process.exit(2);
    }

    name = value;
    index++;
  }

  return { workload: workloads[name], argv: rest };
}

// A scenario key is a route count: a positive multiple of the fixture's block, written plainly.
function routeCount(key) {
  const routes = Number(key);
  const isRouteCount =
    String(routes) === key && Number.isInteger(routes) && routes > 0 && routes % blockSize === 0;

  if (!isRouteCount) {
    throw new Error(
      `--scenarios takes route counts, positive multiples of ${blockSize}, got "${key}"`,
    );
  }
}

async function prerequisites(workload) {
  const installed = await exists(join(packageDirectory, "node_modules/@angular/cli/package.json"));

  if (!installed) {
    throw new Error(
      "Dependencies aren't installed: run pnpm install --frozen-lockfile at the repo root.",
    );
  }

  for (const file of workload.built) {
    const built = await exists(file);

    if (!built) {
      throw new Error(
        `A package isn't built (${file} is missing): run pnpm --dir packages/angular-router build, and pnpm --dir packages/angular-launch build for the Launch workload.`,
      );
    }
  }
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

function duration(ms) {
  return format({ unit: "ms" }, ms);
}

// The production build's output directory, as the build phase left it.
async function buildOutput(consumer) {
  const workspace = await readWorkspace(consumer);

  return join(consumer, workspace.projects.proof.architect.build.options.outputPath);
}

// Bootstrap, cold and warm navigation in Chromium against the router build's browser files.
async function measureRouterRuntime({ consumer, run }, { bootSearch = "" } = {}) {
  const { samples, timeoutMs, record, result } = run;
  const output = await buildOutput(consumer);
  const singleBlock = result.fixture.blocks === 1;
  // With one block the cold link stays in the block bootstrap loaded, so it isn't sampled.
  const navigationSamples = singleBlock ? { ...samples, cold: 0 } : samples;
  const navigation = await measureNavigation(join(output, "browser"), {
    samples: navigationSamples,
    timeoutMs,
    bootSearch,
  });
  const { values } = navigation;

  record("runtime.bootstrapMs", values.bootstrapMs);
  record("runtime.bootstrapP95Ms", values.bootstrapMs);
  // A cold leaf in the bootstrap block isn't the new branch and children table the metric measures.
  if (!singleBlock) {
    record("runtime.navigateColdMs", values.navigateColdMs);
  }

  record("runtime.navigateWarmMs", values.navigateWarmMs);
  record("runtime.navigateWarmP95Ms", values.navigateWarmMs);
  record("runtime.navigateBoundMs", values.navigateBoundMs);

  for (const screen of screens) {
    record(`runtime.${screen.metric}`, values[screen.metric]);
  }

  result.runtime = {
    chromium: navigation.chromium,
    coldTarget: navigation.coldTarget,
    documentToBootstrapMs: values.documentToBootstrapMs,
    screens: navigation.screens,
  };
  progress(
    `  bootstrap ${duration(result.metrics["runtime.bootstrapMs"])}, cold ${singleBlock ? "not sampled (one block)" : duration(result.metrics["runtime.navigateColdMs"])}, warm ${duration(result.metrics["runtime.navigateWarmMs"])}, bound ${duration(result.metrics["runtime.navigateBoundMs"])}, links ${duration(result.metrics["runtime.linksNavigateMs"])}, readers ${duration(result.metrics["runtime.readersNavigateMs"])}, active readers ${duration(result.metrics["runtime.activeReadersNavigateMs"])} (medians)`,
  );
}

// Cold starts of the built server, then SSR, query, mutation and the large query and mutation
// against one server, then SSR against the same route count built without the block roots'
// middleware.
async function measureLaunchRuntime({ consumer, routes, run }) {
  const { directory, logs, samples, timeoutMs, record, result } = run;
  const bare = join(directory, "consumer-bare");
  const ng = await bin(require, "@angular/cli", "ng");

  await createLaunchConsumer(bare);
  await writeLaunchFixture(bare, routes, { middleware: false });
  await setCache(bare, cachePolicy.build);

  // Untimed: the bare build only gives the without-middleware server.
  const bareBuild = await node([ng, "build", "proof"], {
    cwd: bare,
    log: join(logs, "build-bare.log"),
    timeoutMs,
  });

  const largePayloadBytes = {};

  result.runtime = { bareConsumer: bare, bareBuildMs: bareBuild.wallMs, largePayloadBytes };

  const entry = join(await buildOutput(consumer), "server/server.mjs");
  const starts = await measureColdStarts(entry, {
    cwd: consumer,
    trials: samples.starts,
    timeoutMs,
    logs,
  });

  record("server.readyMs", starts.values.readyMs);
  record("server.firstSsrMs", starts.values.firstSsrMs);
  record("server.firstRpcMs", starts.values.firstRpcMs);
  result.runtime.coldStarts = { processes: starts.processes, wallMs: starts.wallMs };

  const withMiddleware = await startServer(entry, {
    cwd: consumer,
    log: join(logs, "server.log"),
    timeoutMs,
  });

  try {
    const ssr = await measureRequests(withMiddleware.origin, "ssr", {
      count: samples.ssr,
      timeoutMs,
    });

    record("ssr.p50Ms", ssr);
    record("ssr.p95Ms", ssr);

    const query = await measureRequests(withMiddleware.origin, "query", {
      count: samples.rpc,
      timeoutMs,
    });

    record("rpc.queryP50Ms", query);
    record("rpc.queryP95Ms", query);

    const mutation = await measureRequests(withMiddleware.origin, "mutation", {
      count: samples.rpc,
      timeoutMs,
    });

    record("rpc.mutationP50Ms", mutation);
    record("rpc.mutationP95Ms", mutation);

    const largeStarted = performance.now();

    for (const name of ["largeQuery", "largeMutation"]) {
      const values = await measureRequests(withMiddleware.origin, name, {
        count: samples.large,
        timeoutMs,
        payloadBytes: largePayloadBytes,
      });

      record(`rpc.${name}P50Ms`, values);
      record(`rpc.${name}P95Ms`, values);
    }

    result.runtime.largeWallMs = performance.now() - largeStarted;
  } finally {
    await withMiddleware.stop();
  }

  const withoutMiddleware = await startServer(join(await buildOutput(bare), "server/server.mjs"), {
    cwd: bare,
    log: join(logs, "server-bare.log"),
    timeoutMs,
  });

  try {
    const ssr = await measureRequests(withoutMiddleware.origin, "ssr", {
      count: samples.ssr,
      timeoutMs,
    });

    record("ssr.bareP50Ms", ssr);
    record("ssr.bareP95Ms", ssr);
  } finally {
    await withoutMiddleware.stop();
  }

  progress(
    `  SSR ${duration(result.metrics["ssr.p50Ms"])}, without middleware ${duration(result.metrics["ssr.bareP50Ms"])}, query ${duration(result.metrics["rpc.queryP50Ms"])}, mutation ${duration(result.metrics["rpc.mutationP50Ms"])}, large query ${duration(result.metrics["rpc.largeQueryP50Ms"])}, large mutation ${duration(result.metrics["rpc.largeMutationP50Ms"])}, ready ${duration(result.metrics["server.readyMs"])} (medians)`,
  );
}

// Fills run.result phase by phase; the shared harness saves after each.
async function measure(scenario, run, workload) {
  const routes = Number(scenario);
  const { directory, logs, samples, timeoutMs, phase, record, result } = run;
  const consumer = join(directory, "consumer");

  result.routes = routes;
  result.consumer = consumer;

  await workload.createConsumer(consumer);
  result.fixture = await workload.writeFixture(consumer, routes);

  const authored = await digest(consumer, isAuthored);

  await phase(
    "generate",
    async () => {
      const generateMs = [];
      const processMs = [];
      let first;

      for (let sample = 1; sample <= samples.generate; sample++) {
        await removeGenerated(consumer);

        const { wallMs, output } = await node([join(here, workload.generator), consumer], {
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
        progress(`  sample ${sample}: generate() ${duration(timing.generateMs)}`);
      }

      record("generate.ms", generateMs);
      record("generate.processMs", processMs);
      result.generated = first;
    },
    { deterministic: true },
  );

  // The serve phase drives the router's serve builder, so only the router workload has it.
  if (workload.serve) {
    await phase("serve", async () => {
      const resultPath = join(logs, "serve.json");

      await setCache(consumer, cachePolicy.serve);
      await node(
        [
          join(here, "serve.mjs"),
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

      const templateMs = [];

      for (const edit of serve.templateEdits) {
        templateMs.push(edit.builtMs);
      }

      record("serve.templateMs", templateMs);
      result.serve = serve;
      progress(`  edit → generated ${duration(result.metrics["serve.generatedMs"])} (median)`);
      // Later phases measure the first-generation fixture again; the build's preflight republishes.
      await writeFile(join(consumer, editedRoute.path), editedRoute.source(false));
    });
  }

  await phase(
    "build",
    async () => {
      const ng = await bin(require, "@angular/cli", "ng");
      const buildMs = [];

      await setCache(consumer, cachePolicy.build);

      for (let sample = 1; sample <= samples.build; sample++) {
        const { wallMs } = await node([ng, "build", "proof"], {
          cwd: consumer,
          log: join(logs, `build-${sample}.log`),
          timeoutMs,
        });

        buildMs.push(wallMs);
        progress(`  sample ${sample}: ${duration(wallMs)}`);
      }

      const generated = await digest(consumer, isGenerated);

      if (generated.sha256 !== result.generated.sha256) {
        throw new Error("The build's generated files differ from first generation's.");
      }

      record("build.ms", buildMs);
    },
    { deterministic: true },
  );

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
      const tscMs = [];
      const checkMs = [];
      const instantiations = [];
      const memoryKB = [];

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

      record("typecheck.tscMs", tscMs);
      record("typecheck.tscCheckMs", checkMs);
      record("typecheck.instantiations", instantiations);
      record("typecheck.memoryKB", memoryKB);
    },
    { deterministic: true },
  );

  await phase(
    "bundle",
    async () => {
      const workspace = await readWorkspace(consumer);
      const { outputPath, browser, server } = workspace.projects.proof.architect.build.options;
      // A server build writes the browser's index as index.csr.html.
      let index = "index.html";

      if (server) {
        index = "index.csr.html";
      }

      const measured = await measureBundle({
        output: join(consumer, outputPath),
        entryPoint: browser,
        index,
      });
      const bundle = routeBundle(measured);

      for (const kind of ["initial", "lazy"]) {
        for (const size of ["raw", "gzip", "brotli"]) {
          record(`bundle.${kind}.${size}`, [bundle[kind][size]]);
        }
      }

      record("bundle.initial.files", [bundle.initial.files]);
      record("bundle.initial.routeCopies", [bundle.initial.routeCopies]);

      // The deployed server output: every .mjs under dist/proof/server.
      if (server) {
        const modules = await files(join(consumer, outputPath, "server"), (name) =>
          name.endsWith(".mjs"),
        );
        let raw = 0;

        for (const module of modules) {
          const info = await stat(module);

          raw += info.size;
        }

        record("bundle.server.raw", [raw]);
        bundle.server = { raw, files: modules.length };
      }

      result.bundle = bundle;
    },
    { deterministic: true },
  );

  // Timing only, so --deterministic skips it. It reuses the build phase's production output.
  await phase("runtime", () => workload.runtime({ consumer, routes, run }));
}

const { workload, argv } = takeWorkload(process.argv.slice(2));

await bench(
  {
    lockedCommand: "pnpm --dir packages/angular-router run bench --",
    name: `angular-router-${workload.name}`,
    metrics,
    scenarios: {
      default: ["100", "300", "1000"],
      validate: routeCount,
      label: (key) => `${key} routes`,
      layout: "metric-rows",
    },
    samples: workload.samples,
    budgets: join(here, workload.budgets),
    options: { workload: workload.name, pollMs, settleMs },
    conditions: {
      ...workload.conditions,
      buildCache: cachePolicy.build,
      typecheck:
        "ngc -p tsconfig.app.json --noEmit, and tsc -p tsconfig.app.json --noEmit --extendedDiagnostics --incremental false; no untyped baseline.",
      compression: "Per file, then summed: gzip level 9, Brotli quality 11.",
    },
    packages: [packageDirectory, launchDirectory],
    prerequisites: () => prerequisites(workload),
    setup: workload.setup,
    measure: (scenario, run) => measure(scenario, run, workload),
  },
  argv,
);
