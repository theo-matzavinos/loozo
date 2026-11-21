// The Origami edit bench: node bench/edit.mjs plus the shared flags ([--scenarios consumer,library]
// [--out <dir>] [--samples edits=5,syncs=5] [--timeout <seconds>] [--check [file]]). The package's
// bench:edit script runs it under the machine-wide gate lock. It times two inner development loops:
// a consumer template edit until the dev server serves it, and a library source edit until
// acceptance:sync has put it in the scratch consumer. See bench/README.md for what each number means
// and tools/bench/README.md for the shared contract.
import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join, relative } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { bench, progress } from "../../../tools/bench/bench.mjs";
import { load } from "../../../tools/bench/machine.mjs";
import { bin, exists, files } from "../../../tools/bench/process.mjs";
import { format } from "../../../tools/bench/table.mjs";
import { entries } from "./build-workloads.mjs";
import { createConsumer, packageDirectory } from "./consumer.mjs";
import { metrics } from "./edit-metrics.mjs";

const here = fileURLToPath(new URL("./", import.meta.url));
const require = createRequire(join(packageDirectory, "package.json"));
const execute = promisify(execFile);
const scenarios = ["consumer", "library"];
// Tokens carry it, so nothing a previous run left behind can match this run's.
const runId = randomBytes(4).toString("hex");

// The consumer scenario edits the Checkbox workload's template in its own scratch app.
const editedWorkload = "src/workloads/checkbox.ts";
const anchor = "<button ogCheckbox";
const pollMs = 20;
const settleMs = 1500;

// The library scenario edits this source file and syncs acceptance's scratch consumer.
const sourcePath = "checkbox/src/checkbox.ts";
const source = join(packageDirectory, sourcePath);
const scratchConsumer = join(packageDirectory, ".scratch/consumer");
const stamp = join(scratchConsumer, ".runtime/consumer-install.json");

// The child the run waits on (the dev server or a sync), in its own process group, and the signal
// that interrupted the run, if one did. A signal goes on to the child's group; whatever waits on
// the child then fails, and the scenario cleans up as after any failure.
const exitCodes = { SIGINT: 130, SIGTERM: 143 };
let active;
let interrupted;
// The harness's results object, from the first scenario on. A signal marks it failed at once, so a
// run interrupted after its last phase, while the harness finalizes it, can't pass --check or be
// recorded.
let results;
let current;

function signalGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    // The group has already exited.
    if (error.code !== "ESRCH") {
      throw error;
    }
  }
}

for (const signal of Object.keys(exitCodes)) {
  process.on(signal, () => {
    if (interrupted === undefined) {
      interrupted = signal;
      progress(`${signal}: stopping, then cleaning up`);

      if (results && !results.failure) {
        results.failure = {
          scenario: current,
          phase: "interrupted",
          message: `Interrupted by ${signal}`,
        };
      }
    }

    if (active) {
      signalGroup(active, signal);
    }
  });
}

function checkInterrupted() {
  if (interrupted) {
    throw new Error(`Interrupted by ${interrupted}`);
  }
}

function validate(key) {
  if (!scenarios.includes(key)) {
    throw new Error(`--scenarios takes ${scenarios.join(", ")}, got "${key}"`);
  }
}

function duration(ms) {
  return format({ unit: "ms" }, ms);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function prerequisites() {
  const installed = await exists(join(packageDirectory, "node_modules/@angular/cli/package.json"));

  if (!installed) {
    throw new Error(
      "Dependencies aren't installed: run pnpm install --frozen-lockfile at the repo root.",
    );
  }
}

// Why dist/ can't serve the consumer scenario, if it can't: it's missing, an interrupted build left
// it partial (build starts with rm -rf dist), or an interrupted library run left its last token
// build there. The library scenario doesn't need this: its warmup sync rebuilds dist/.
// The library scenario's token lands in this source map's sourcesContent.
const tokenMap = "dist/fesm2022/loozo-origami-ui-checkbox.mjs.map";

async function unbuiltReason() {
  const manifest = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
  const required = ["dist/package.json", tokenMap];

  for (const name of entries(manifest)) {
    required.push(`dist/fesm2022/loozo-origami-ui-${name}.mjs`);
  }

  for (const path of required) {
    const built = await exists(join(packageDirectory, path));

    if (!built) {
      return `${path} is missing`;
    }
  }

  const map = await readFile(join(packageDirectory, tokenMap));

  if (map.includes("// bench edit ")) {
    return `${tokenMap} holds a library edit token`;
  }

  return undefined;
}

// Builds dist/ once, untimed, when it can't serve the consumer scenario, so the run after an
// interrupted one passes without a manual repair.
async function ensureBuilt(run) {
  const reason = await unbuiltReason();

  if (reason === undefined) {
    return;
  }

  progress(`  dist/ needs a build (${reason}); building it, untimed`);
  run.result.build = { reason, ...(await pnpmRun(run, "build", "build")) };
  progress(`  build: ${duration(run.result.build.ms)}`);

  const remaining = await unbuiltReason();

  if (remaining !== undefined) {
    throw new Error(`dist/ still can't serve the consumer after building: ${remaining}`);
  }
}

// Spawns a command in its own process group, so a signal or a stop reaches everything it starts,
// and makes it the active child until it closes.
function startGroup(command, args, cwd) {
  checkInterrupted();

  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, NG_CLI_ANALYTICS: "false" },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let exited;

  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });

  const closed = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => {
      exited = { code, signal };

      if (active === child) {
        active = undefined;
      }

      resolve(exited);
    });
  });

  active = child;

  // A signal that arrived while the child was being spawned.
  if (interrupted) {
    signalGroup(child, interrupted);
  }

  return {
    child,
    closed,
    output: () => {
      return output;
    },
    exited: () => {
      return exited;
    },
  };
}

// A free loopback port for the dev server.
async function freePort() {
  const server = createServer();

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address();

  await new Promise((resolve) => {
    server.close(resolve);
  });

  return port;
}

// The build bench's consumer, plus a development build configuration of the `all` workload and a
// dev server: optimization off, HMR off, Angular's disk cache on in the new app's .angular/cache.
// The program type-checks src/workload.ts too, so it stays the baseline's copy: all's relative
// imports resolve only from src/workloads/.
async function createEditConsumer(app) {
  await createConsumer(app, ["baseline", "all"]);

  const path = join(app, "angular.json");
  const workspace = JSON.parse(await readFile(path, "utf8"));
  const architect = workspace.projects.bench.architect;

  workspace.cli.cache = { enabled: true, environment: "all" };
  architect.build.configurations.development = {
    outputPath: "dist/development",
    optimization: false,
    extractLicenses: false,
    sourceMap: true,
    statsJson: false,
    outputHashing: "none",
    fileReplacements: [{ replace: "src/workload.ts", with: "src/workloads/all.ts" }],
  };
  architect.serve = {
    builder: "@angular/build:dev-server",
    options: { buildTarget: "bench:build:development", hmr: false },
  };
  await writeFile(path, `${JSON.stringify(workspace, null, 2)}\n`);
}

// Polls the served file every 20 ms until a 200 response holds the token. A failed rebuild since
// the edit, the server's exit or --timeout fails the wait.
async function poll(run, server, url, token) {
  const since = server.output().length;
  const started = performance.now();
  let polls = 0;

  for (;;) {
    checkInterrupted();

    const exited = server.exited();

    if (exited) {
      const { code, signal } = exited;

      throw new Error(
        `The dev server exited (${signal ?? `exit ${code}`}); see ${join(run.logs, "serve.log")}`,
      );
    }

    if (server.output().includes("Application bundle generation failed", since)) {
      throw new Error(
        `The dev server's build failed after ${token} was written; see ${join(run.logs, "serve.log")}`,
      );
    }

    if (performance.now() - started > run.timeoutMs) {
      throw new Error(`${url} didn't serve ${token} within ${run.timeoutMs / 1000} s`);
    }

    polls++;

    // Each request gets at most what's left of --timeout, and a token read after the deadline
    // doesn't count.
    const remaining = run.timeoutMs - (performance.now() - started);

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(Math.max(1, Math.min(2000, remaining))),
      });
      const text = await response.text();

      if (performance.now() - started > run.timeoutMs) {
        throw new Error(`${url} didn't serve ${token} within ${run.timeoutMs / 1000} s`);
      }

      if (response.ok && text.includes(token)) {
        return { polls, bytes: Buffer.byteLength(text), sha256: sha256(text) };
      }
    } catch (error) {
      if (performance.now() - started > run.timeoutMs) {
        throw new Error(`${url} didn't serve ${token} within ${run.timeoutMs / 1000} s`, {
          cause: error,
        });
      }

      // Not listening yet, or the response took too long; the next poll asks again.
    }

    await delay(pollMs);
  }
}

async function serveEdits(run) {
  const { directory, logs, samples, record, result } = run;
  const app = join(directory, "app");

  await ensureBuilt(run);
  await createEditConsumer(app);

  const file = join(app, editedWorkload);
  const original = await readFile(file, "utf8");

  if (original.split(anchor).length !== 2) {
    throw new Error(
      `${editedWorkload} must hold "${anchor}" exactly once; it's where the token goes`,
    );
  }

  function withToken(token) {
    return original.replace(anchor, `${anchor} data-bench-edit="${token}"`);
  }

  // The edit number first: with a fixed-length run id after it, no token is part of another.
  function token(edit) {
    return `e${edit}-${runId}`;
  }

  const port = await freePort();
  const url = `http://127.0.0.1:${port}/main.js`;
  const ng = await bin(require, "@angular/cli", "ng");
  let server;

  result.url = url;
  result.edits = [];

  try {
    await writeFile(file, withToken(token(0)));

    const started = performance.now();

    server = startGroup(
      process.execPath,
      [ng, "serve", "bench", "--host", "127.0.0.1", "--port", String(port)],
      app,
    );

    const served = await poll(run, server, url, token(0));
    const startupMs = performance.now() - started;

    result.startup = { token: token(0), ms: startupMs, ...served };
    record("edit.startupMs", [startupMs]);
    progress(`  startup: ${duration(startupMs)}`);
    await delay(settleMs);

    const servedMs = [];

    for (let edit = 1; edit <= samples.edits; edit++) {
      checkInterrupted();
      await writeFile(file, withToken(token(edit)));

      const editStarted = performance.now();
      const found = await poll(run, server, url, token(edit));
      const ms = performance.now() - editStarted;

      servedMs.push(ms);
      result.edits.push({ token: token(edit), ms, ...found });
      progress(`  edit ${edit}: ${duration(ms)} (${found.polls} polls)`);
      await delay(settleMs);
    }

    record("edit.servedMs", servedMs);
  } finally {
    if (server) {
      if (!server.exited()) {
        signalGroup(server.child, "SIGTERM");
      }

      await server.closed;
      await writeFile(join(logs, "serve.log"), server.output());
    }

    await writeFile(file, original);
  }

  // A signal that arrived outside a wait, such as during the last settle, still fails the scenario
  // after cleanup, so the run can't finish.
  checkInterrupted();
}

// One `pnpm run <script>` in its own process group, timed from spawn to close.
async function pnpmRun(run, script, label) {
  const log = join(run.logs, `${label}.log`);
  const before = load();
  const started = performance.now();
  const group = startGroup("pnpm", ["run", script], packageDirectory);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    signalGroup(group.child, "SIGTERM");
  }, run.timeoutMs);
  let exited;

  try {
    exited = await group.closed;
  } finally {
    clearTimeout(timer);
  }

  const ms = performance.now() - started;
  const after = load();

  await writeFile(log, group.output());

  if (interrupted) {
    throw new Error(`Interrupted by ${interrupted} during ${label}; see ${log}`);
  }

  if (timedOut) {
    throw new Error(`${script} (${label}) timed out after ${run.timeoutMs / 1000} s; see ${log}`);
  }

  if (exited.code !== 0) {
    throw new Error(
      `${script} (${label}) failed (${exited.signal ?? `exit ${exited.code}`}); see ${log}`,
    );
  }

  return { ms, log, load: { before, after } };
}

// The installed package must hold the sample's token, and never the other one, in files equal to
// dist's. A link to dist would prove nothing, so it must be an installed copy.
async function verifyInstalled(token, other) {
  const link = join(scratchConsumer, "node_modules/@loozo/origami-ui");
  const installed = await realpath(link);
  const dist = await realpath(join(packageDirectory, "dist"));
  const info = await stat(installed);

  if (!info.isDirectory() || installed === dist) {
    throw new Error(`${link} must be an installed package directory, not a link to dist`);
  }

  const tokenFiles = [];

  for (const file of await files(installed, () => true)) {
    const bytes = await readFile(file);
    const path = relative(installed, file);

    if (bytes.includes(other)) {
      throw new Error(`The installed package still holds "${other}" in ${path}`);
    }

    if (!bytes.includes(token)) {
      continue;
    }

    const built = await readFile(join(dist, path));

    if (!bytes.equals(built)) {
      throw new Error(`The installed ${path} holds "${token}" but differs from dist/${path}`);
    }

    tokenFiles.push({ path, sha256: sha256(bytes) });
  }

  if (tokenFiles.length === 0) {
    throw new Error(`No installed file holds "${token}"`);
  }

  return { installed, tokenFiles };
}

async function libraryPreconditions() {
  const stamped = await exists(stamp);

  if (!stamped) {
    throw new Error(
      ".scratch/consumer has no verified install: run pnpm --dir packages/origami-ui run acceptance:prepare first.",
    );
  }

  const { stdout } = await execute("git", ["status", "--porcelain", "--", sourcePath], {
    cwd: packageDirectory,
  });

  if (stdout !== "") {
    throw new Error(
      `${sourcePath} has uncommitted changes (${stdout.trim()}); the library scenario edits it, so commit or restore it first.`,
    );
  }
}

// Where a conflict was found, as the report says it.
function where(at, after) {
  if (at === "restore") {
    if (after) {
      return "right after restoring";
    }

    return "before restoring";
  }

  if (after) {
    return `right after ${at}'s write`;
  }

  return `before ${at}'s write`;
}

async function librarySyncs(run) {
  const { directory, samples, record, result } = run;

  await libraryPreconditions();

  // Ownership starts here: the bytes the runner last wrote, the original ones until its first
  // write, and the conflict, once one is found; after that the runner never writes the file again.
  const original = await readFile(source);
  let expected = original;
  let conflict = null;
  let foundWhere;

  result.originalSha256 = sha256(original);
  result.writes = [];
  result.syncs = [];
  result.failures = [];
  console.error(
    `bench:edit: owning ${sourcePath} until it's restored; don't edit, save or check it out meanwhile`,
  );

  function describe(bytes) {
    if (bytes.equals(original)) {
      return "the original";
    }

    const added = bytes.subarray(original.length).toString("utf8").trim();

    return `the original + "${added}"`;
  }

  // Saves what was found and what was expected, reports the conflict and returns false.
  async function stop(at, found, wanted, after) {
    const conflictDirectory = join(directory, "conflict");
    const current = join(conflictDirectory, "current.ts");
    const expectedPath = join(conflictDirectory, "expected.ts");
    let label = at;

    if (after) {
      label = `${at}, after writing`;
    }

    foundWhere = where(at, after);
    conflict = {
      at: label,
      current,
      expected: expectedPath,
      currentSha256: sha256(found),
      expectedSha256: sha256(wanted),
      originalSha256: sha256(original),
    };
    result.conflict = conflict;
    await mkdir(conflictDirectory, { recursive: true });
    await Promise.all([writeFile(current, found), writeFile(expectedPath, wanted)]);

    const lines = [
      `bench:edit: ${sourcePath} changed while the bench owned it (found ${foundWhere}).`,
      "The bench left the file as it is now and stopped. This run is incomplete: it can't pass --check or be recorded.",
      `  in the file now:           ${current}   sha256 ${conflict.currentSha256}`,
      `  what the bench last wrote: ${expectedPath}  sha256 ${conflict.expectedSha256}  (${describe(wanted)})`,
    ];

    if (!wanted.equals(original)) {
      lines.push(
        'If an editor saved the file, it may also contain that "// bench edit" line; remove it by hand.',
      );
    }

    lines.push(
      "Then run `pnpm run acceptance:sync`: dist and .scratch/consumer may still hold the bench's last token build.",
      "Re-run bench:edit without touching the file.",
    );

    const report = lines.join("\n");

    result.failures.push(report);
    console.error(report);

    return false;
  }

  // Every write of the source file goes through here. It writes only over the bytes it last wrote.
  async function writeOwned(next, at) {
    if (conflict) {
      return false;
    }

    const found = await readFile(source);

    if (!found.equals(expected)) {
      return stop(at, found, expected, false);
    }

    await writeFile(source, next);

    const written = await readFile(source);

    if (!written.equals(next)) {
      return stop(at, written, next, true);
    }

    expected = next;
    result.writes.push({ at, sha256: sha256(next) });

    return true;
  }

  function conflictError() {
    return new Error(
      `${sourcePath} changed while the bench owned it (found ${foundWhere}); see the report above and ${join(directory, "conflict")}`,
    );
  }

  let failure;

  try {
    result.warmup = await pnpmRun(run, "acceptance:sync", "warmup");
    progress(`  warmup: ${duration(result.warmup.ms)}`);

    const syncMs = [];

    for (let sample = 1; sample <= samples.syncs; sample++) {
      checkInterrupted();

      let letter = "A";
      let otherLetter = "B";

      if (sample % 2 === 0) {
        letter = "B";
        otherLetter = "A";
      }

      const token = `bench edit ${runId}-${letter}`;
      const next = Buffer.concat([original, Buffer.from(`\n// ${token}\n`)]);
      const written = await writeOwned(next, `sample ${sample}`);

      if (!written) {
        throw conflictError();
      }

      const evidence = { sample, token };

      result.syncs.push(evidence);
      Object.assign(evidence, await pnpmRun(run, "acceptance:sync", `sync-${sample}`));
      Object.assign(evidence, await verifyInstalled(token, `bench edit ${runId}-${otherLetter}`));
      syncMs.push(evidence.ms);
      progress(`  sample ${sample}: ${duration(evidence.ms)}`);
    }

    record("edit.syncMs", syncMs);
  } catch (error) {
    failure = error;
  }

  const restored = await writeOwned(original, "restore");

  if (restored) {
    const bytes = await readFile(source);

    result.restoredSha256 = sha256(bytes);

    if (result.restoredSha256 !== result.originalSha256) {
      throw new Error(`${sourcePath} doesn't hold its original bytes after restoring`);
    }

    // dist and the installed consumer get original-source bytes again; an interrupted run leaves
    // that to the next run's warmup.
    try {
      if (!interrupted) {
        result.restoreSync = await pnpmRun(run, "acceptance:sync", "restore-sync");
        progress(`  restore sync: ${duration(result.restoreSync.ms)}`);
      }
    } catch (error) {
      failure ??= error;
    } finally {
      console.error(`bench:edit: ${sourcePath} restored`);
    }
  }

  if (failure) {
    throw failure;
  }

  if (!restored) {
    throw conflictError();
  }

  // A signal that arrived outside a sync, such as during the last token check, skipped the final
  // sync above; it still fails the scenario, so the run can't finish.
  checkInterrupted();
}

async function measure(scenario, run) {
  checkInterrupted();

  results = run.results;
  current = scenario;

  if (scenario === "consumer") {
    await run.phase("edit", () => {
      return serveEdits(run);
    });
  } else {
    await run.phase("sync", () => {
      return librarySyncs(run);
    });
  }

  // A signal while the phase saved its results.
  checkInterrupted();
}

await bench(
  {
    name: "origami-ui-edit",
    metrics,
    scenarios: { default: scenarios, validate, label: (key) => key, layout: "metric-rows" },
    samples: { edits: 5, syncs: 5 },
    budgets: join(here, "budgets/edit.json"),
    options: { runId },
    conditions: {
      consumer:
        "The build bench's scratch app with the all workload, in a development configuration (optimization off, source maps, no output hashing) served by ng serve with HMR off on a free loopback port, Angular's disk cache on in the app's new .angular/cache. A dist/ that's missing, partial or holds a library edit token is built first, untimed.",
      startup:
        "From spawning ng serve to the first GET /main.js (polled every 20 ms) that returns 200 and holds the initial data-bench-edit token; then a 1.5 s settle.",
      served:
        "Each edit writes a new data-bench-edit token into the Checkbox workload's template; from writeFile resolving to the first GET /main.js (polled every 20 ms) that holds it, then a 1.5 s settle. The workload is restored afterwards.",
      library:
        'One untimed acceptance:sync, then each sample appends "// bench edit <run id>-A" or "-B" to checkbox/src/checkbox.ts and times pnpm run acceptance:sync (ng-packagr build, finish-package, npm pack, stage, warm APF refresh, installed-byte and export verification) from spawn to a zero exit; the token is then verified in the installed package, outside the span. The source is restored and synced once more, untimed.',
    },
    packages: [packageDirectory],
    prerequisites,
    measure,
  },
  process.argv.slice(2),
);

if (interrupted) {
  process.exitCode = exitCodes[interrupted];
}
