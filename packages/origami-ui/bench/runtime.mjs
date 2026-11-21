// The Origami runtime bench: node bench/runtime.mjs plus the shared flags ([--scenarios a,b,…]
// [--out <dir>] [--samples mount=10,hydrate=10,open=20] [--timeout <seconds>] [--check [file]]
// [--deterministic]). The package's bench:runtime script runs it under the machine-wide gate lock.
// It builds the perf app in bench/runtime-app/ once, serves it, and measures it in Chromium. See
// bench/README.md for what each number means and tools/bench/README.md for the shared contract.
import { spawn } from "node:child_process";
import { cp, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bench, progress } from "../../../tools/bench/bench.mjs";
import { bin, exists, node } from "../../../tools/bench/process.mjs";
import { format } from "../../../tools/bench/table.mjs";
import { linkConsumer, packageDirectory } from "./consumer.mjs";
import { metrics } from "./runtime-metrics.mjs";

const here = fileURLToPath(new URL("./", import.meta.url));
const require = createRequire(join(packageDirectory, "package.json"));
const appDirectory = join(here, "runtime-app");
// The perf app's server uses express, as the example app's does; this package doesn't depend on it.
const express = join(packageDirectory, "../../examples/origami-ui/node_modules/express");

// The list scenarios, by the list their routes render. Their mount and hydrate samples alternate
// between the two by pair when both run.
const lists = { "checkbox-1000": "checkbox", "plain-1000": "plain" };
const opens = {
  "select-1000": { route: "/select-1000", input: "click" },
  "menu-100": { route: "/menu-100", input: "click" },
  popover: { route: "/popover", input: "click" },
  tooltip: { route: "/tooltip", input: "focus" },
};
const scenarios = [...Object.keys(lists), ...Object.keys(opens)];
const routes = [];

for (const kind of Object.values(lists)) {
  routes.push(`/hydrate/${kind}-1000`, `/mount/${kind}-1000`);
}

for (const { route } of Object.values(opens)) {
  routes.push(route);
}

const contextOptions = {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
};
const warmupOpens = 3;
const heapCycles = 5;
// Each list's mount and hydrate checks click these controls.
const clicked = [0, 999];

// The server and browser the setup starts; stopped after the run, however it ends.
let session;

function validate(key) {
  if (!scenarios.includes(key)) {
    throw new Error(`--scenarios takes ${scenarios.join(", ")}, got "${key}"`);
  }
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

  for (const name of ["checkbox", "popover", "tooltip", "select", "menu"]) {
    const file = join(packageDirectory, `dist/fesm2022/loozo-origami-ui-${name}.mjs`);
    const built = await exists(file);

    if (!built) {
      throw new Error(
        `The package isn't built (${file} is missing): run pnpm --dir packages/origami-ui build.`,
      );
    }
  }

  const expressInstalled = await exists(join(express, "package.json"));

  if (!expressInstalled) {
    throw new Error(
      `${express} is missing: run pnpm install --frozen-lockfile at the repo root, which installs the example app's dependencies.`,
    );
  }

  const { chromium } = require("playwright");
  const browserInstalled = await exists(chromium.executablePath());

  if (!browserInstalled) {
    throw new Error(
      "Playwright's Chromium isn't installed: run pnpm --dir packages/origami-ui exec playwright install chromium.",
    );
  }
}

// The perf app's sources under src/, on the shared consumer links, as one server-rendered
// application project, `bench`, built for production.
async function createRuntimeConsumer(consumer) {
  await linkConsumer(consumer);
  await symlink(express, join(consumer, "node_modules/express"), "dir");
  await cp(appDirectory, join(consumer, "src"), { recursive: true });

  const angular = {
    version: 1,
    cli: { cache: { enabled: false }, analytics: false },
    projects: {
      bench: {
        projectType: "application",
        root: "",
        sourceRoot: "src",
        architect: {
          build: {
            builder: "@angular/build:application",
            options: {
              outputPath: "dist/runtime",
              browser: "src/main.ts",
              server: "src/main.server.ts",
              index: "src/index.html",
              tsConfig: "tsconfig.app.json",
              outputMode: "server",
              ssr: { entry: "src/server.ts" },
              security: { allowedHosts: ["127.0.0.1"] },
              optimization: { scripts: true, styles: true, fonts: false },
              sourceMap: false,
              outputHashing: "all",
            },
          },
        },
      },
    },
  };
  const tsconfigApp = {
    extends: "./tsconfig.json",
    compilerOptions: { types: ["node"] },
    include: ["src/**/*.ts"],
  };

  await writeFile(join(consumer, "angular.json"), `${JSON.stringify(angular, null, 2)}\n`);
  await writeFile(join(consumer, "tsconfig.app.json"), `${JSON.stringify(tsconfigApp, null, 2)}\n`);
}

// Starts the built server on a free loopback port. The child comes back at once, so the run can
// stop it and save its log however startup ends; `listening` resolves its origin.
function startServer(consumer, timeoutMs) {
  const child = spawn(process.execPath, [join(consumer, "dist/runtime/server/server.mjs")], {
    cwd: consumer,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";

  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });

  const listening = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`The perf app's server didn't listen within ${timeoutMs / 1000} s`));
    }, timeoutMs);

    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`The perf app's server exited (${signal ?? `exit ${code}`}): ${output}`));
    });
    child.stdout.on("data", () => {
      const listening = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(output);

      if (listening) {
        clearTimeout(timer);
        resolve(listening[1]);
      }
    });
  });

  return { child, listening, output: () => output };
}

// Settles as the promise does, or rejects once --timeout passes. Playwright's default timeout
// doesn't reach page.evaluate, CDP calls, a locator count or a key press; the caller's context
// close then ends whatever was left waiting.
async function withinTimeout(run, what, promise) {
  let timer;
  const expired = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${what} didn't finish within ${run.timeoutMs / 1000} s`));
    }, run.timeoutMs);
  });

  try {
    return await Promise.race([promise, expired]);
  } finally {
    clearTimeout(timer);
  }
}

async function setup({ out, timeoutMs, deterministic }) {
  const consumer = join(out, "consumer");

  await createRuntimeConsumer(consumer);
  progress("building the perf app");

  const ng = await bin(require, "@angular/cli", "ng");
  const build = await node([ng, "build", "bench"], {
    cwd: consumer,
    log: join(out, "build.log"),
    timeoutMs,
  });

  progress(`  built in ${duration(build.wallMs)}`);

  const server = startServer(consumer, timeoutMs);

  session = { server, browser: undefined, log: join(out, "server.log") };

  const origin = await server.listening;

  // One untimed request per route, so no sample pays for the server's first render of it. The
  // signal bounds the body read too. A deterministic run measures only the heap, on the mount
  // routes, so it warms only those.
  let warmed = routes;

  if (deterministic) {
    warmed = routes.filter((route) => route.startsWith("/mount/"));
  }

  for (const route of warmed) {
    const response = await fetch(`${origin}${route}`, { signal: AbortSignal.timeout(timeoutMs) });

    await response.text();

    if (!response.ok) {
      throw new Error(`Warming ${route} failed with ${response.status}`);
    }
  }

  const { chromium } = require("playwright");
  const browser = await chromium.launch({ timeout: timeoutMs });

  session.browser = browser;

  return {
    origin,
    browser,
    app: { buildMs: build.wallMs, chromium: browser.version() },
    // Mount and hydrate samples one list scenario took for its partner, by phase.
    handed: { mount: {}, hydrate: {} },
  };
}

async function stop() {
  if (!session) {
    return;
  }

  await session.browser?.close();

  const { child } = session.server;

  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => {
      child.once("exit", resolve);
    });

    child.kill("SIGTERM");
    await exited;
  }

  await writeFile(session.log, session.server.output());
}

// A fresh context and page on a route, collecting the page's errors.
async function openPage(run, route) {
  const { browser, origin } = run.shared;
  const context = await withinTimeout(run, "a new context", browser.newContext(contextOptions));

  context.setDefaultTimeout(run.timeoutMs);

  const page = await withinTimeout(run, "a new page", context.newPage());
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  await page.goto(`${origin}${route}`);

  return { context, page, errors };
}

// Waits for a condition in the page; a timeout names what it waited for and the page's errors.
async function waitFor(page, errors, what, condition, argument) {
  try {
    await page.waitForFunction(condition, argument);
  } catch (error) {
    let pageErrors = "";

    if (errors.length > 0) {
      pageErrors = `; page errors: ${errors.join("; ")}`;
    }

    throw new Error(`Waiting for ${what}: ${error.message.split("\n")[0]}${pageErrors}`);
  }
}

// What's wrong with a mount or hydrate sample's readiness and interactivity results, if anything.
function problems(readiness, errors) {
  const found = [];

  if (errors.length > 0) {
    found.push(`page errors: ${errors.join("; ")}`);
  }

  if (!readiness.passed) {
    found.push(`the readiness snapshot failed: ${JSON.stringify(readiness.snapshot)}`);

    return found;
  }

  for (const index of clicked) {
    const dispatched = readiness.dispatched.find((entry) => entry.index === index);
    const rendered = readiness.rendered.find((entry) => entry.index === index);
    const settled = readiness.settled.find((entry) => entry.index === index);

    if (
      !dispatched ||
      dispatched.before !== false ||
      dispatched.after !== true ||
      dispatched.changesBefore !== 0 ||
      dispatched.changesAfter !== 1
    ) {
      found.push(
        `control ${index} didn't change once during its click: ${JSON.stringify(dispatched)}`,
      );
    }

    if (
      !rendered ||
      rendered.model !== true ||
      rendered.changes !== 1 ||
      rendered.ariaChecked !== "true" ||
      !rendered.dataChecked ||
      !rendered.retained
    ) {
      found.push(
        `control ${index}'s next render doesn't show its click: ${JSON.stringify(rendered)}`,
      );
    }

    if (!settled || settled.model !== true || settled.changes !== 1) {
      found.push(`control ${index} didn't stay checked once stable: ${JSON.stringify(settled)}`);
    }
  }

  return found;
}

// One hydrate sample: a fresh page on the server-rendered list; the span ends at its readiness
// probe, and interactivity is checked after it.
async function hydrateSample(run, kind) {
  const { context, page, errors } = await openPage(run, `/hydrate/${kind}-1000`);

  try {
    await waitFor(page, errors, "the hydration probe", () => {
      return window.__benchHydration?.done === true;
    });

    const readiness = await withinTimeout(
      run,
      "reading the hydration probe",
      page.evaluate(() => {
        return window.__benchHydration;
      }),
    );

    return { readiness, errors };
  } finally {
    await context.close();
  }
}

// One mount sample: a fresh page on the empty shell; #bench-mount renders the list, timed from
// its handler to the list's readiness probe, and interactivity is checked after it.
async function mountSample(run, kind) {
  const { context, page, errors } = await openPage(run, `/mount/${kind}-1000`);

  try {
    await waitFor(page, errors, "the hydrated shell", () => {
      return window.__benchReady === true;
    });

    const before = await withinTimeout(
      run,
      "counting the controls",
      page.locator("#items button").count(),
    );

    if (before !== 0) {
      throw new Error(`/mount/${kind}-1000 rendered ${before} controls before #bench-mount`);
    }

    await page.locator("#bench-mount").click();
    await waitFor(page, errors, "the mount probe", () => {
      return window.__benchMount?.done === true;
    });

    const readiness = await withinTimeout(
      run,
      "reading the mount probe",
      page.evaluate(() => {
        return window.__benchMount;
      }),
    );

    return { readiness, errors };
  } finally {
    await context.close();
  }
}

// Takes a list scenario's mount or hydrate samples. When its partner list runs too, the first of
// the two to run samples both by pairs, alternating which goes first, and hands the partner its
// samples; the partner's phase only records them.
async function listSamples(scenario, run, phase) {
  const { result, record, results, samples, shared } = run;
  const handed = shared.handed[phase];
  const metric = { hydrate: "hydration", mount: "mount" }[phase];
  let taken = handed[scenario];

  if (taken === undefined) {
    const partner = Object.keys(lists).find((key) => key !== scenario);
    const workloads = [];

    for (const key of Object.keys(lists)) {
      if (key === scenario || (key === partner && results.options.scenarios.includes(partner))) {
        workloads.push(key);
      }
    }

    const byWorkload = {};

    for (const key of workloads) {
      byWorkload[key] = [];
    }

    // Evidence goes in as each sample lands, so a failed check keeps it.
    result[phase] = byWorkload[scenario];

    const sampled = { hydrate: hydrateSample, mount: mountSample }[phase];
    let current;

    try {
      for (let pair = 1; pair <= samples[phase]; pair++) {
        let order = workloads;

        if (pair % 2 === 0) {
          order = [...workloads].reverse();
        }

        for (const key of order) {
          current = { workload: key, pair };

          const { readiness, errors } = await sampled(run, lists[key]);
          const found = problems(readiness, errors);
          const sample = { pair, ...readiness, errors };

          byWorkload[key].push(sample);

          if (found.length > 0) {
            throw new Error(found.join("; "));
          }

          progress(`  ${key} ${phase} ${pair}: ${duration(readiness.ms)}`);
        }
      }
    } catch (error) {
      // The partner's samples aren't handed over until every pair passes, so a failure keeps both
      // lists' here, by workload.
      result[`${phase}Failure`] = { ...current, message: error.message, samples: byWorkload };

      let where = "";

      if (current.workload !== scenario) {
        where = ` (paired in ${scenario}'s ${phase} phase)`;
      }

      throw new Error(
        `${current.workload} ${phase} sample ${current.pair}${where}: ${error.message}; both lists' samples are in results.scenarios["${scenario}"].${phase}Failure`,
      );
    }

    for (const key of workloads) {
      if (key !== scenario) {
        handed[key] = byWorkload[key];
      }
    }

    taken = byWorkload[scenario];

    if (workloads.length > 1) {
      result[`${phase}PairedWith`] = workloads.find((key) => key !== scenario);
    }
  } else {
    result[phase] = taken;
    result[`${phase}PairedWith`] = Object.keys(lists).find((key) => key !== scenario);
  }

  const values = [];

  for (const sample of taken) {
    values.push(sample.ms);
  }

  record(`${metric}.p50Ms`, values);
  record(`${metric}.p95Ms`, values);
}

async function collectGarbage(cdp) {
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
}

// The live instances of the class whose prototype the expression evaluates to.
async function countInstances(cdp, expression) {
  const objectGroup = "bench-count";

  try {
    const { result: prototype } = await cdp.send("Runtime.evaluate", { expression, objectGroup });
    const { objects } = await cdp.send("Runtime.queryObjects", {
      prototypeObjectId: prototype.objectId,
      objectGroup,
    });
    const { result: count } = await cdp.send("Runtime.callFunctionOn", {
      objectId: objects.objectId,
      functionDeclaration: "function () { return this.length; }",
      returnByValue: true,
    });

    return count.value;
  } finally {
    await cdp.send("Runtime.releaseObjectGroup", { objectGroup });
  }
}

// One page on the mount route: a warmup mount and destroy, then the JavaScript heap's growth over
// five more, and for checkbox-1000 the checkboxes still alive after them.
async function heap(scenario, run) {
  const { record, result } = run;
  const kind = lists[scenario];
  const { context, page, errors } = await openPage(run, `/mount/${kind}-1000`);

  try {
    await waitFor(page, errors, "the hydrated shell", () => {
      return window.__benchReady === true;
    });

    const cdp = await withinTimeout(run, "a CDP session", context.newCDPSession(page));

    // Mounts and destroys the list; true when the mount's readiness snapshot held. Each waits for
    // the app to be stable, which a task that never finishes would hold off.
    async function cycle() {
      return withinTimeout(
        run,
        `${scenario}'s heap mount and destroy`,
        page.evaluate(async () => {
          await window.__benchCycle(true);

          const mounted = window.__benchMount?.passed === true;

          await window.__benchCycle(false);

          return mounted;
        }),
      );
    }

    async function heapUsage() {
      await withinTimeout(run, "garbage collection", collectGarbage(cdp));

      return withinTimeout(run, "the heap usage", cdp.send("Runtime.getHeapUsage"));
    }

    const mounts = [await cycle()];
    const before = await heapUsage();

    for (let index = 0; index < heapCycles; index++) {
      mounts.push(await cycle());
    }

    const remaining = await withinTimeout(
      run,
      "counting the controls",
      page.locator("#items button").count(),
    );
    const after = await heapUsage();
    const retainedJsBytesPerCycle = (after.usedSize - before.usedSize) / heapCycles;

    result.heap = { cycles: heapCycles, mounts, before, after, retainedJsBytesPerCycle, remaining };

    if (kind === "checkbox") {
      result.heap.liveInstances = await withinTimeout(
        run,
        "counting the live checkboxes",
        countInstances(cdp, "window.__benchTypes.checkbox"),
      );
    }

    result.heap.errors = errors;
    await withinTimeout(run, "detaching the CDP session", cdp.detach());

    if (errors.length > 0 || !mounts.every(Boolean) || remaining !== 0) {
      throw new Error(
        `${scenario} heap: every mount must render the list and every destroy remove it, without page errors: ${JSON.stringify({ mounts, remaining, errors })}`,
      );
    }

    record("heap.retainedJsBytesPerCycle", [retainedJsBytesPerCycle]);

    if (kind === "checkbox") {
      record("heap.liveInstances", [result.heap.liveInstances]);

      // A leak fails the run outright, whatever the budgets say, so a re-record can't make it the
      // baseline.
      if (result.heap.liveInstances !== 0) {
        throw new Error(
          `${scenario} heap: ${result.heap.liveInstances} destroyed checkboxes are still alive after GC; expected 0`,
        );
      }
    }
  } finally {
    await context.close();
  }
}

// One page: three discarded openings, then the timed ones. Each opening runs from the input's
// capture-phase listener to the revealed and placed state, then closes and settles two frames.
async function open(scenario, run) {
  const { record, result, samples } = run;
  const { route, input } = opens[scenario];
  const { context, page, errors } = await openPage(run, route);

  result.openings = [];
  result.warmups = [];
  result.failures = [];

  try {
    await waitFor(page, errors, "the hydrated page and its open probe", () => {
      return window.__benchReady === true && window.__benchOpen !== undefined;
    });

    const trigger = page.locator("#trigger");

    for (let index = 0; index < warmupOpens + samples.open; index++) {
      if (input === "focus") {
        await trigger.focus();
      } else {
        await trigger.click();
      }

      try {
        await page.waitForFunction((count) => {
          return window.__benchOpen.openings.length === count;
        }, index + 1);
      } catch (error) {
        const diagnostic = await withinTimeout(
          run,
          `${scenario}'s diagnostic`,
          page.evaluate(() => {
            return window.__benchOpen.diagnose();
          }),
        );

        result.failures.push({ opening: index + 1, message: error.message, errors, ...diagnostic });
        throw new Error(
          `${scenario} opening ${index + 1} didn't reach the revealed and placed state; see results.scenarios["${scenario}"].failures`,
        );
      }

      const opening = await withinTimeout(
        run,
        `reading ${scenario}'s opening`,
        page.evaluate((at) => {
          return window.__benchOpen.openings[at];
        }, index),
      );

      if (index < warmupOpens) {
        result.warmups.push(opening);
      } else {
        result.openings.push(opening);
      }

      if (input === "focus") {
        await page.locator("#blur").focus();
      } else {
        await withinTimeout(run, "pressing Escape", page.keyboard.press("Escape"));
      }

      await waitFor(page, errors, `${scenario} to close`, () => {
        return !document.querySelector("#content").matches(":popover-open");
      });
      await withinTimeout(
        run,
        "two animation frames",
        page.evaluate(() => {
          return new Promise((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(resolve);
            });
          });
        }),
      );
    }

    if (errors.length > 0) {
      throw new Error(`${scenario}: page errors: ${errors.join("; ")}`);
    }
  } finally {
    await context.close();
  }

  const values = [];

  for (const opening of result.openings) {
    values.push(opening.ms);
  }

  record("open.p50Ms", values);

  // Tooltip's p95 is shown but not budgeted (see runtime-metrics.mjs).
  if (scenario === "tooltip") {
    record("open.p95UnbudgetedMs", values);
  } else {
    record("open.p95Ms", values);
  }
}

async function measure(scenario, run) {
  run.result.conditions = { ...run.shared.app };

  if (lists[scenario] === undefined) {
    run.result.conditions.route = opens[scenario].route;
    await run.phase("open", () => {
      return open(scenario, run);
    });

    return;
  }

  const kind = lists[scenario];

  run.result.conditions.routes = [`/hydrate/${kind}-1000`, `/mount/${kind}-1000`];
  await run.phase("hydrate", () => {
    return listSamples(scenario, run, "hydrate");
  });
  await run.phase("mount", () => {
    return listSamples(scenario, run, "mount");
  });
  // Only checkbox-1000's heap has a deterministic metric, the live instance count.
  await run.phase(
    "heap",
    () => {
      return heap(scenario, run);
    },
    { deterministic: kind === "checkbox" },
  );
}

try {
  await bench(
    {
      name: "origami-ui-runtime",
      metrics,
      scenarios: { default: scenarios, validate, label: (key) => key, layout: "metric-rows" },
      samples: { mount: 10, hydrate: 10, open: 20 },
      budgets: join(here, "budgets/runtime.json"),
      conditions: {
        app: "bench/runtime-app built once per run as a production server-rendered app (ng build bench: scripts and styles optimization, fonts off, no source maps, hashed names, Angular's disk cache off) against packages/origami-ui/dist. Eager hydration, event replay off. Served by its own server on a free loopback port; one untimed request per route first.",
        browser:
          "Playwright's Chromium, one browser per run; viewport 1280×800, device scale factor 1, reduced motion.",
        hydrate:
          "A fresh context per sample on /hydrate/<list>: from performance.mark('bench:bootstrap'), immediately before bootstrapApplication, to the list's afterNextRender probe, timestamped only once 1,000 server-rendered controls are present, initialized, unchanged and the same nodes. The first and last controls are clicked after the span.",
        mount:
          "A fresh context per sample on /mount/<list>, whose server render has no list: from #bench-mount's handler, immediately before it renders the list, to the list's afterNextRender probe, timestamped only once 1,000 controls are connected, initialized and unchanged. The first and last controls are clicked after the span.",
        pairs:
          "With both lists in the run, mount and hydrate samples alternate between them by pair, so neither always gets the warmer browser.",
        heap: "One page on /mount/<list>: one warmup mount and destroy; HeapProfiler.collectGarbage twice; Runtime.getHeapUsage; five more mounts and destroys; the bench's references cleared; collectGarbage twice; Runtime.getHeapUsage, then Runtime.queryObjects on the checkbox class's prototype.",
        open: "One context per scenario: three discarded openings, then the timed ones, each from a capture-phase click (focusin for Tooltip) to the first mutation after which the content is natively open, not inert, fully opaque, clickable, visible, on block-end and 8 px below the anchor's current position, with every item rendered. Each closes by Escape (blur for Tooltip), then waits two animation frames.",
      },
      packages: [packageDirectory],
      prerequisites,
      setup,
      measure,
    },
    process.argv.slice(2),
  );
} finally {
  await stop();
}
