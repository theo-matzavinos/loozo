// Drives the serve builder through a real Architect with a fake watcher, generation session and dev
// server, and mocked timers for the settle delay, so the lifecycle's interleavings (edits during a
// pass, stops during startup and teardown) are deterministic. builders.test.mjs covers the real
// collaborators.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { lstatSync, readFileSync } from "node:fs";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, mock, test } from "node:test";
import { pathToFileURL } from "node:url";

const packageDirectory = resolve(import.meta.dirname, "..");
const require = createRequire(resolve(packageDirectory, "package.json"));
const { Architect, createBuilder } = require("@angular-devkit/architect");
const { TestingArchitectHost } = require("@angular-devkit/architect/testing");
const nativeRequire = createRequire(require.resolve("@angular-devkit/architect"));
const core = nativeRequire("@angular-devkit/core");
const scanRoot = resolve(packageDirectory, "src/routes");
const settleDelay = 150;

// The fakes read the current scenario, which each test replaces.
let scenario;

// Settled at once unless the scenario holds teardown, so the test settles it.
function teardownPromise(held) {
  const deferred = Promise.withResolvers();

  if (!held) {
    deferred.resolve();
  }

  return deferred;
}

class FakeWatcher extends EventEmitter {
  closed = false;
  closes = 0;

  constructor(paths, options, held) {
    super();
    this.paths = paths;
    this.options = options;
    this.closure = teardownPromise(held);
  }

  close() {
    this.closed = true;
    this.closes++;

    return this.closure.promise;
  }
}

mock.module("chokidar", {
  exports: {
    default: {
      watch(paths, options) {
        const watcher = new FakeWatcher(paths, options, scenario.holdTeardown);

        scenario.watchers.push(watcher);

        return watcher;
      },
    },
  },
});

mock.module(new URL("../dist/generation/run.js", import.meta.url).href, {
  exports: {
    createBuilderSession(workspace, options) {
      const current = scenario;
      const session = {
        workspace,
        options,
        disposals: 0,
        disposal: teardownPromise(current.holdTeardown),
        generate(generateOptions, isStopped) {
          const { promise, resolve, reject } = Promise.withResolvers();
          const pass = {
            options: generateOptions,
            isStopped,
            resolve,
            reject,
            settled: false,
          };

          // The real session rejects a call while another is running; afterEach checks this.
          for (const earlier of current.passes) {
            if (!earlier.settled) {
              current.overlaps++;
            }
          }

          current.events.push("generate");
          void promise.then(
            () => (pass.settled = true),
            () => (pass.settled = true),
          );
          current.passes.push(pass);

          return promise;
        },
        dispose() {
          session.disposals++;

          return session.disposal.promise;
        },
      };

      current.sessions.push(session);

      return session;
    },
  },
});

// realpath(workspaceRoot) is one of startup's awaits. Serve reads a generated file's marker and
// inspects an asset event's path before it starts the settle delay. Read synchronously, both
// finish within settle()'s turns, so the mocked delay is never ticked before it starts. A scenario
// can hold the inspection open.
const fsPromises = await import("node:fs/promises");

mock.module("node:fs/promises", {
  exports: {
    ...fsPromises,
    default: fsPromises.default,
    async realpath(path, ...rest) {
      scenario.resolvingWorkspace = true;
      await scenario.workspaceGate;

      return fsPromises.realpath(path, ...rest);
    },
    async readFile(path, options) {
      return readFileSync(path, options);
    },
    async lstat(path) {
      scenario.inspections++;
      await scenario.inspectionGate;

      // An error other than ENOENT, which no path gives on every platform: Windows reports ENOENT
      // where Linux and macOS report ENOTDIR.
      const code = scenario.inspectionErrors.get(path);

      if (code !== undefined) {
        throw Object.assign(new Error(`${code}: ${path}`), { code });
      }

      return lstatSync(path);
    },
  },
});

// Stands in for Angular's dev server, which the builder imports from the @angular/build the
// workspace resolves. It adds its closing teardown to the context it runs in, and yields what the
// test pushes until that teardown closes it.
const angularBuild = require.resolve("@angular/build", { paths: [packageDirectory] });

mock.module(pathToFileURL(angularBuild).href, {
  exports: {
    // Recorded when called; the body below runs only once serve iterates it.
    executeDevServerBuilder(options, context, extensions) {
      scenario.executions++;

      return devServer(options, context, extensions);
    },
  },
});

async function* devServer(options, context, extensions) {
  const steps = [];
  let wake;
  const server = {
    options,
    extensions,
    stopped: false,
    teardowns: 0,
    teardown: teardownPromise(scenario.holdTeardown),
    push(step) {
      steps.push(step);
      wake?.();
    },
  };

  scenario.events.push("serve");
  scenario.servers.push(server);
  context.addTeardown(() => {
    server.teardowns++;
    server.push({ kind: "closed" });

    return server.teardown.promise;
  });

  try {
    while (true) {
      if (steps.length === 0) {
        await new Promise((resolve) => {
          wake = resolve;
        });
      }

      const step = steps.shift();

      if (step.kind === "output") {
        yield step.output;
      } else if (step.kind === "fail") {
        throw step.error;
      } else {
        return;
      }
    }
  } finally {
    server.stopped = true;
  }
}

const { default: serveBuilder } = await import("../dist/builders/serve.js");

// The settle delay runs on these; until() and settle() wait on setImmediate instead.
mock.timers.enable({ apis: ["setTimeout", "setInterval"] });

afterEach(() => {
  assert.equal(scenario.overlaps, 0, "One pass at a time");
});

function createScenario() {
  return {
    watchers: [],
    sessions: [],
    passes: [],
    servers: [],
    events: [],
    logs: [],
    outputs: [],
    errors: [],
    done: false,
    overlaps: 0,
    executions: 0,
    inspections: 0,
    inspectionErrors: new Map(),
  };
}

// The scheduler passes messages through promises and setImmediate, so states are awaited.
async function until(predicate, description) {
  const deadline = Date.now() + 2000;

  while (!predicate()) {
    assert.ok(Date.now() < deadline, `Timed out waiting for ${description}`);
    await new Promise(setImmediate);
  }
}

// Lets every queued callback run, to show that nothing further happens.
async function settle() {
  for (let turn = 0; turn < 20; turn++) {
    await new Promise(setImmediate);
  }
}

// Each gate holds one startup await open until the test resolves it. holdTeardown makes the
// watchers' close, the dev server's teardown and the session's disposal wait for the test too.
async function serve({
  workspace = packageDirectory,
  optionsGate,
  workspaceGate,
  devServerGate,
  holdTeardown = false,
  build = {},
  metadata = {},
  serveOptions = {},
} = {}) {
  scenario = createScenario();
  scenario.workspaceGate = workspaceGate;
  scenario.holdTeardown = holdTeardown;

  const host = new TestingArchitectHost(workspace, workspace);
  const resolveBuilder = host.resolveBuilder.bind(host);
  const getOptionsForTarget = host.getOptionsForTarget.bind(host);

  host.addBuilder("@loozo/angular-launch:serve", serveBuilder);
  host.addBuilder(
    "@loozo/angular-launch:application",
    createBuilder(() => ({ success: true })),
  );
  // Only its schema is read: serve validates the dev server's options against it.
  host.addBuilder(
    "@angular/build:dev-server",
    createBuilder(() => ({ success: true })),
    undefined,
    { type: "object", properties: { stubDefault: { type: "string", default: "applied" } } },
  );
  host.addTarget({ project: "app", target: "build" }, "@loozo/angular-launch:application", {
    tsconfig: "tsconfig.json",
    scanDirectories: ["src/routes"],
    outDirectory: "generated",
    browser: "src/main.ts",
    ...build,
  });
  host.getProjectMetadata = async () => metadata;
  host.addTarget({ project: "app", target: "serve" }, "@loozo/angular-launch:serve", {
    buildTarget: "app:build",
    port: 0,
    ...serveOptions,
  });

  host.getOptionsForTarget = async (target) => {
    if (target.target === "build") {
      scenario.resolvingOptions = true;
      await optionsGate;
    }

    return getOptionsForTarget(target);
  };
  host.resolveBuilder = async (name) => {
    if (name === "@angular/build:dev-server") {
      scenario.events.push("validate");
      scenario.validating = true;
      await devServerGate;
    }

    return resolveBuilder(name);
  };

  const registry = new core.json.schema.CoreSchemaRegistry();

  registry.addPostTransform(core.json.schema.transforms.addUndefinedDefaults);

  const architect = new Architect(host, registry);
  const logger = new core.logging.Logger("serve-test");

  logger.subscribe((entry) => scenario.logs.push(entry));

  const run = await architect.scheduleTarget({ project: "app", target: "serve" }, {}, { logger });
  const current = scenario;

  run.output.subscribe({
    // Architect adds the run's target and builder info to every output.
    next: ({ target: _target, info: _info, ...output }) => current.outputs.push(output),
    error: (error) => {
      current.errors.push(error);
      current.done = true;
    },
    complete: () => {
      current.done = true;
    },
  });

  return { run, scenario: current };
}

function watcherOf(state) {
  return state.watchers[0];
}

// A watcher event, without the settle delay running out. Serve inspects an event that arrives
// between passes before it starts the settle delay, so the event's callbacks run first.
async function touch(state, path = "src/routes/page.ts", event = "change") {
  watcherOf(state).emit("all", event, resolve(packageDirectory, path));
  await settle();
}

// A watcher event, then the settle delay running out.
async function change(state, path, event) {
  await touch(state, path, event);
  mock.timers.tick(settleDelay);
}

function logged(state, level) {
  const messages = [];

  for (const entry of state.logs) {
    if (entry.level === level) {
      messages.push(entry.message);
    }
  }

  return messages;
}

function errors(state) {
  return logged(state, "error");
}

function warnings(state) {
  return logged(state, "warn");
}

// Reaches the served state: watcher ready, initial generation succeeded, dev server started.
async function reachServing(state) {
  await until(() => state.watchers.length === 1, "the watcher");
  watcherOf(state).emit("ready");
  await until(() => state.passes.length === 1, "the initial generation");
  state.passes[0].resolve();
  await until(() => state.servers.length === 1, "the dev server");
}

async function started(options) {
  const session = await serve(options);

  await reachServing(session.scenario);

  return session;
}

function released(state) {
  assert.equal(watcherOf(state).closed, true, "The watcher is closed");
  assert.equal(state.sessions[0].disposals, 1, "The session is disposed once");

  for (const server of state.servers) {
    assert.equal(server.teardowns, 1, "The dev server's teardown ran once");
    assert.equal(server.stopped, true, "The dev server's iteration ended");
  }
}

test("serve watches the scan directory and runs the dev server after the initial generation", async () => {
  const { run, scenario: state } = await started();
  const watcher = watcherOf(state);
  const [session] = state.sessions;
  const [server] = state.servers;

  assert.deepEqual(watcher.paths, [scanRoot]);
  assert.deepEqual(watcher.options, { ignoreInitial: true, followSymlinks: false });
  assert.equal(session.workspace, packageDirectory);
  assert.deepEqual(session.options, {
    tsconfig: "tsconfig.json",
    scanDirectories: ["src/routes"],
    outDirectory: "generated",
  });
  assert.equal(state.passes.length, 1);
  assert.equal(server.options.buildTarget, "app:build");
  assert.equal(server.options.poll, 1000);
  assert.equal(server.options.port, 0);
  assert.equal(server.options.stubDefault, "applied", "Defaulted by the dev server's schema");
  assert.equal(server.extensions.middleware.length, 1);
  assert.deepEqual(state.events, ["generate", "validate", "serve"]);

  server.push({ kind: "output", output: { success: true, baseUrl: "http://localhost:4200/" } });
  await until(() => state.outputs.length === 1, "the forwarded output");
  assert.deepEqual(state.outputs, [{ success: true, baseUrl: "http://localhost:4200/" }]);

  await run.stop();
  released(state);
  assert.deepEqual(state.errors, []);
});

// The builder's own inputs, in a scratch workspace: its generation tsconfig, the configs it
// extends and its package.json.
test("each config input's change runs one pass, also mixed with a source edit or during a pass, and stop ends the check", async () => {
  const pollInterval = 500;
  const workspace = resolve(packageDirectory, ".scratch/serve-workspace", String(process.pid));
  const path = (name) => resolve(workspace, name);
  const json = (value) => `${JSON.stringify(value)}\n`;

  await rm(workspace, { recursive: true, force: true });
  await mkdir(path("src/routes"), { recursive: true });
  await writeFile(path("package.json"), json({ name: "app" }));
  await writeFile(path("tsconfig.json"), json({ extends: "./tsconfig.base.json" }));
  await writeFile(path("tsconfig.base.json"), json({ extends: "./tsconfig.root.json" }));
  await writeFile(path("tsconfig.root.json"), json({ compilerOptions: { strict: true } }));
  await writeFile(path("extra.json"), json({ compilerOptions: {} }));

  const { run, scenario: state } = await serve({
    workspace,
    build: { tsconfig: "tsconfig.json", scanDirectories: ["src/routes"] },
  });
  // The check starts before the watcher, and no mocked time has passed since.
  let elapsed = 0;

  function advance(milliseconds) {
    mock.timers.tick(milliseconds);
    elapsed += milliseconds;
  }

  // Runs the next check, then the settle delay it may have started.
  async function check() {
    advance(pollInterval - (elapsed % pollInterval));
    await settle();
    advance(settleDelay);
    await settle();
  }

  async function passed(count, description) {
    await until(() => state.passes.length === count, description);
    state.passes[count - 1].resolve();
    await settle();
  }

  await until(() => state.watchers.length === 1, "the watcher");
  assert.deepEqual(watcherOf(state).paths, [path("src/routes")]);
  // An edit before the initial pass is read by it, so no check reports it afterwards.
  await writeFile(
    path("tsconfig.json"),
    json({ extends: "./tsconfig.base.json", include: ["src"] }),
  );
  watcherOf(state).emit("ready");
  await passed(1, "the initial generation");
  await until(() => state.servers.length === 1, "the dev server");
  await check();
  assert.equal(state.passes.length, 1, "The initial pass covered the earlier edit");

  let passes = 1;

  for (const { name, value } of [
    { name: "tsconfig.json", value: { extends: "./tsconfig.base.json" } },
    { name: "tsconfig.base.json", value: { extends: "./tsconfig.root.json", compilerOptions: {} } },
    { name: "tsconfig.root.json", value: { compilerOptions: { strict: false } } },
    { name: "package.json", value: { name: "renamed" } },
  ]) {
    await writeFile(path(name), json(value));
    await check();
    passes++;
    await passed(passes, `the pass for ${name}`);
  }

  // A base named before it exists runs a pass once it's created.
  await writeFile(
    path("tsconfig.json"),
    json({ extends: ["./tsconfig.base.json", "./later.json"] }),
  );
  await check();
  passes++;
  await passed(passes, "the pass naming a missing base");
  await writeFile(path("later.json"), json({ compilerOptions: {} }));
  await check();
  passes++;
  await passed(passes, "the created base's pass");

  // A source edit and a config edit just after a check: the source edit's pass reads both, so the
  // next check finds nothing new.
  await writeFile(path("later.json"), json({ compilerOptions: { noUnusedLocals: true } }));
  await touch(state, path("src/routes/page.ts"));
  advance(settleDelay);
  passes++;
  await passed(passes, "the source edit's pass");
  await check();
  assert.equal(state.passes.length, passes, "The config edit the pass read runs no second pass");

  // A change while a pass runs queues exactly one more.
  await writeFile(path("tsconfig.root.json"), json({ compilerOptions: { strict: true } }));
  await check();
  passes++;
  await until(() => state.passes.length === passes, "the root's pass");
  await writeFile(
    path("tsconfig.root.json"),
    json({ compilerOptions: { strict: true, noImplicitAny: true } }),
  );
  await check();
  assert.equal(state.passes.length, passes, "A running pass is never doubled");
  state.passes[passes - 1].resolve();
  passes++;
  await passed(passes, "the rerun");
  await check();
  assert.equal(state.passes.length, passes, "The rerun read the change");

  // A base added to the chain is checked from the pass that reads it; one removed isn't.
  await writeFile(
    path("tsconfig.json"),
    json({ extends: ["./tsconfig.base.json", "./extra.json"] }),
  );
  await check();
  passes++;
  await passed(passes, "the pass adding a base");
  await writeFile(path("extra.json"), json({ compilerOptions: { noUnusedParameters: true } }));
  await check();
  passes++;
  await passed(passes, "the added base's pass");
  await writeFile(path("tsconfig.json"), json({ extends: "./tsconfig.base.json" }));
  await check();
  passes++;
  await passed(passes, "the pass removing it");
  await writeFile(path("extra.json"), json({ compilerOptions: {} }));
  await check();
  assert.equal(state.passes.length, passes, "A removed base runs no pass");

  // Stopping releases the check's timer.
  const clears = mock.method(globalThis, "clearInterval");

  try {
    await run.stop();
    assert.ok(clears.mock.callCount() >= 1, "The check's interval is cleared");
  } finally {
    clears.mock.restore();
  }

  await writeFile(path("tsconfig.json"), json({ compilerOptions: { strict: true } }));
  await check();
  assert.equal(state.passes.length, passes, "Stopping ends the check");
});

// Serve checks the tsconfig, its extends chain, the manifest and catalogs outside the scan
// directory every 500 ms (serve-config.test.mjs covers what it detects); a change runs one pass,
// and the pass takes the state it reads as the new baseline.
test("a catalog outside the scan directory is checked by polling, and a pass's baseline is what it read", async () => {
  const pollInterval = 500;
  const directory = await scratchDirectory("polled-catalogs");
  const catalog = resolve(directory, "messages.de.xlf");

  await writeFile(catalog, "<xliff/>\n");

  const { run, scenario: state } = await started({
    build: { translateSegments: true, polyfills: ["@angular/localize/init"] },
    metadata: {
      i18n: {
        sourceLocale: "en",
        locales: {
          de: `../../.scratch/launch-serve/${process.pid}/polled-catalogs/messages.de.xlf`,
        },
      },
    },
  });
  // The check started with the watcher, and no mocked time has passed since.
  let elapsed = 0;

  function advance(milliseconds) {
    mock.timers.tick(milliseconds);
    elapsed += milliseconds;
  }

  // Runs the next check, then the settle delay it may have started.
  async function check() {
    advance(pollInterval - (elapsed % pollInterval));
    await settle();
    advance(settleDelay);
    await settle();
  }

  await writeFile(catalog, "<xliff version='2.0'/>\n");
  await check();
  await until(() => state.passes.length === 2, "the edited catalog's pass");
  state.passes[1].resolve();
  await settle();

  await rm(catalog);
  await check();
  await until(() => state.passes.length === 3, "the deleted catalog's pass");
  state.passes[2].resolve();
  await settle();

  await writeFile(catalog, "<xliff version='2.1'/>\n");
  await check();
  await until(() => state.passes.length === 4, "the recreated catalog's pass");
  state.passes[3].resolve();
  await settle();

  // A source edit and a catalog edit just after a check: the source edit's pass reads both, so the
  // next check finds nothing new.
  await writeFile(catalog, "<xliff version='2.2'/>\n");
  await touch(state);
  advance(settleDelay);
  await until(() => state.passes.length === 5, "the source edit's pass");
  state.passes[4].resolve();
  await settle();
  await check();
  assert.equal(state.passes.length, 5, "The catalog edit the pass read runs no second pass");

  await run.stop();

  await writeFile(catalog, "<xliff version='2.3'/>\n");
  await check();
  assert.equal(state.passes.length, 5, "Stopping ends the check");
});

// Generation reads a catalog through its symlink, so an edit of the file it resolves to is a
// catalog edit, and while the symlink dangles any such file could be the catalog.
test("an event for the file a catalog symlink resolves to runs a pass", async () => {
  const directory = await scratchDirectory("linked-catalogs");
  const target = resolve(directory, "catalog.html");
  const catalog = resolve(directory, "messages.de.xlf");

  await writeFile(target, "<p>Katalog</p>\n");
  await symlink(target, catalog);

  const { run, scenario: state } = await started({
    build: { translateSegments: true, polyfills: ["@angular/localize/init"] },
    metadata: {
      i18n: {
        sourceLocale: "en",
        locales: {
          de: `../../.scratch/launch-serve/${process.pid}/linked-catalogs/messages.de.xlf`,
        },
      },
    },
  });

  await change(state, target);
  await until(() => state.passes.length === 2, "the pass for the catalog's target");
  state.passes[1].resolve();
  await settle();

  await rm(target);
  await change(state, target, "unlink");
  await until(() => state.passes.length === 3, "the pass for the dangling catalog");
  state.passes[2].resolve();
  await settle();

  await run.stop();
});

test("a burst of watcher events within the settle delay runs one pass", async () => {
  const { run, scenario: state } = await started();

  await touch(state);
  mock.timers.tick(settleDelay - 1);
  await touch(state, "src/routes/other/page.ts");
  mock.timers.tick(settleDelay - 1);
  await settle();
  assert.equal(state.passes.length, 1, "Each event restarts the settle delay");

  mock.timers.tick(1);
  await until(() => state.passes.length === 2, "the pass");
  state.passes[1].resolve();
  await settle();
  assert.equal(state.passes.length, 2);

  await run.stop();
});

test("an edit during a pass causes exactly one more pass, however many edits arrive", async () => {
  const { run, scenario: state } = await started();

  await change(state);
  await until(() => state.passes.length === 2, "the second pass");

  await change(state);
  await change(state, "src/routes/other/page.ts");
  await settle();
  assert.equal(state.passes.length, 2, "A running pass is never doubled");

  state.passes[1].resolve();
  await until(() => state.passes.length === 3, "the rerun");
  state.passes[2].resolve();
  await settle();
  assert.equal(state.passes.length, 3, "One rerun covers every edit during the pass");

  await run.stop();
});

// The settled edit lands at each microtask boundary from the pass settling until well after the
// pass's bookkeeping finishes, covering the window between the last rerun check and finalization.
test("an edit at any point after a pass settles is never lost", async () => {
  const { run, scenario: state } = await started();

  await change(state);
  await until(() => state.passes.length === 2, "the first edit's pass");

  for (let delay = 0; delay < 40; delay++) {
    const before = state.passes.length;

    state.passes.at(-1).resolve();

    for (let tick = 0; tick < delay; tick++) {
      await Promise.resolve();
    }

    await change(state);
    await until(
      () => state.passes.length === before + 1,
      `the pass for an edit ${delay} ticks late`,
    );
  }

  state.passes.at(-1).resolve();
  await settle();
  assert.equal(state.passes.length, 42, "Every edit caused exactly one pass");

  await run.stop();
});

test("edits settled before the watcher is ready are covered by the initial generation", async () => {
  const { run, scenario: state } = await serve();

  await until(() => state.watchers.length === 1, "the watcher");
  await change(state);
  watcherOf(state).emit("ready");
  await until(() => state.passes.length === 1, "the initial generation");
  state.passes[0].resolve();
  await until(() => state.servers.length === 1, "the dev server");
  await settle();
  assert.equal(state.passes.length, 1);

  await run.stop();
});

test("an edit during the initial generation causes one pass after it, before the dev server", async () => {
  const { run, scenario: state } = await serve();

  await until(() => state.watchers.length === 1, "the watcher");
  watcherOf(state).emit("ready");
  await until(() => state.passes.length === 1, "the initial generation");
  await change(state);
  await settle();
  assert.equal(state.passes.length, 1, "Edits wait for the initial generation");

  state.passes[0].resolve();
  await until(() => state.passes.length === 2, "the folded-in pass");
  state.passes[1].resolve();
  await until(() => state.servers.length === 1, "the dev server");
  await settle();
  assert.equal(state.passes.length, 2);
  assert.deepEqual(
    state.events,
    ["generate", "generate", "validate", "serve"],
    "The folded-in pass starts before the dev server's options are validated",
  );

  await run.stop();
});

test("a failed initial generation reports a build failure and never starts the dev server", async () => {
  const { run, scenario: state } = await serve();

  await until(() => state.watchers.length === 1, "the watcher");
  watcherOf(state).emit("ready");
  await until(() => state.passes.length === 1, "the initial generation");
  state.passes[0].reject(new Error("Route diagnostics"));
  await until(() => state.done, "completion");

  assert.deepEqual(state.outputs, [{ success: false }]);
  assert.deepEqual(state.errors, []);
  assert.deepEqual(errors(state), ["Route diagnostics"]);
  released(state);
  assert.equal(state.servers.length, 0);
  assert.equal(state.validating, undefined);

  await change(state);
  await settle();
  assert.equal(state.passes.length, 1);

  await run.stop();
});

test("a failed later pass is logged and serving continues", async () => {
  const { run, scenario: state } = await started();

  await change(state);
  await until(() => state.passes.length === 2, "the second pass");
  state.passes[1].reject(new Error("Rpc diagnostics"));
  await until(() => errors(state).length === 1, "the logged failure");
  assert.deepEqual(errors(state), ["Rpc diagnostics"]);

  await change(state);
  await until(() => state.passes.length === 3, "the pass after the failure");
  state.passes[2].resolve();
  await settle();

  assert.equal(state.done, false);
  assert.equal(state.servers[0].stopped, false);
  assert.equal(watcherOf(state).closed, false);
  assert.equal(state.sessions[0].disposals, 0);

  await run.stop();
});

test("a failed later pass still runs the rerun queued during it", async () => {
  const { run, scenario: state } = await started();

  await change(state);
  await until(() => state.passes.length === 2, "the second pass");
  await change(state);
  state.passes[1].reject(new Error("Rpc diagnostics"));
  await until(() => state.passes.length === 3, "the queued rerun");
  assert.deepEqual(errors(state), ["Rpc diagnostics"]);
  state.passes[2].resolve();
  await settle();
  assert.equal(state.passes.length, 3);
  assert.equal(state.done, false);

  await run.stop();
});

test("a watcher error before ready fails serve; after startup it is logged", async () => {
  const failing = await serve();

  await until(() => failing.scenario.watchers.length === 1, "the watcher");
  watcherOf(failing.scenario).emit("error", new Error("EMFILE"));
  await until(() => failing.scenario.done, "the failure");

  assert.equal(failing.scenario.errors.length, 1);
  assert.match(String(failing.scenario.errors[0]), /EMFILE/);
  released(failing.scenario);
  assert.equal(failing.scenario.passes.length, 0);
  assert.equal(failing.scenario.servers.length, 0);
  await failing.run.stop();

  const { run, scenario: state } = await started();

  watcherOf(state).emit("error", new Error("EMFILE"));
  await until(() => errors(state).length === 1, "the logged error");
  assert.match(errors(state)[0], /EMFILE/);
  await settle();
  assert.equal(state.done, false);
  assert.equal(state.servers[0].stopped, false);

  await run.stop();
});

test("a watcher error during the initial generation is logged and serve still starts", async () => {
  const { run, scenario: state } = await serve();

  await until(() => state.watchers.length === 1, "the watcher");
  watcherOf(state).emit("ready");
  await until(() => state.passes.length === 1, "the initial generation");
  watcherOf(state).emit("error", new Error("ENOSPC"));
  await until(() => errors(state).length === 1, "the logged error");
  state.passes[0].resolve();
  await until(() => state.servers.length === 1, "the dev server");

  await change(state);
  await until(() => state.passes.length === 2, "the pass after startup");
  state.passes[1].resolve();
  await settle();
  assert.equal(errors(state).length, 1);
  assert.match(errors(state)[0], /ENOSPC/);
  assert.equal(state.done, false);
  assert.equal(state.servers[0].stopped, false);
  assert.equal(watcherOf(state).closed, false);

  await run.stop();
});

for (const [phase, gate, waiting] of [
  ["resolving the build target's options", "optionsGate", "resolvingOptions"],
  ["resolving the workspace root", "workspaceGate", "resolvingWorkspace"],
]) {
  test(`stopping while ${phase} never watches, generates or serves`, async () => {
    const open = Promise.withResolvers();
    const { run, scenario: state } = await serve({ [gate]: open.promise });

    await until(() => state[waiting], phase);
    await run.stop();
    open.resolve();
    await settle();
    assert.equal(state.watchers.length, 0);
    assert.equal(state.sessions.length, 0);
    assert.equal(state.passes.length, 0);
    assert.equal(state.servers.length, 0);
    assert.deepEqual(state.errors, []);
  });
}

test("stopping before the watcher is ready closes it and never generates", async () => {
  const { run, scenario: state } = await serve();

  await until(() => state.watchers.length === 1, "the watcher");
  await run.stop();
  released(state);

  watcherOf(state).emit("ready");
  await change(state);
  await settle();
  assert.equal(state.passes.length, 0);
  assert.equal(state.servers.length, 0);
});

test("stopping during the initial generation cancels it, waits for it and never serves", async () => {
  const { run, scenario: state } = await serve();

  await until(() => state.watchers.length === 1, "the watcher");
  watcherOf(state).emit("ready");
  await until(() => state.passes.length === 1, "the initial generation");

  const pass = state.passes[0];
  let stopped = false;

  void run.stop().then(() => (stopped = true));
  await until(() => pass.isStopped(), "the cancellation signal");
  released(state);
  await settle();
  assert.equal(stopped, false, "Stopping waits for the cancelled generation");

  await change(state);
  pass.resolve();
  await until(() => stopped, "the stop");
  await settle();
  assert.equal(state.passes.length, 1);
  assert.equal(state.servers.length, 0);
  assert.equal(state.validating, undefined);
});

test("stopping during a later pass cancels it and stops the dev server", async () => {
  const { run, scenario: state } = await started();

  await change(state);
  await until(() => state.passes.length === 2, "the second pass");

  const pass = state.passes[1];

  void run.stop();
  await until(() => pass.isStopped(), "the cancellation signal");
  await change(state);
  pass.resolve();
  await until(() => state.servers[0].stopped, "the dev server stop");
  await settle();
  assert.equal(state.passes.length, 2);
  released(state);
});

test("stopping while the dev server's options are validated never runs it", async () => {
  const gate = Promise.withResolvers();
  const { run, scenario: state } = await serve({ devServerGate: gate.promise });

  await until(() => state.watchers.length === 1, "the watcher");
  watcherOf(state).emit("ready");
  await until(() => state.passes.length === 1, "the initial generation");
  state.passes[0].resolve();
  await until(() => state.validating, "the dev server's validation");

  await run.stop();
  released(state);
  gate.resolve();
  await settle();
  assert.equal(state.executions, 0);
  assert.deepEqual(state.errors, []);
});

test("the dev server ending or failing ends serve and releases everything", async () => {
  const completing = await started();

  completing.scenario.servers[0].push({ kind: "end" });
  await until(() => completing.scenario.done, "completion");
  assert.deepEqual(completing.scenario.errors, []);
  released(completing.scenario);
  await completing.run.stop();

  const { run, scenario: state } = await started();

  state.servers[0].push({ kind: "fail", error: new Error("Port in use") });
  await until(() => state.done, "the failure");
  assert.equal(state.errors.length, 1);
  assert.match(String(state.errors[0]), /Port in use/);
  released(state);
  await run.stop();
});

// Serve ends itself on these, and reports it only once every release settled.
for (const { ending, end } of [
  {
    ending: "the dev server ends",
    end: async (state) => {
      await reachServing(state);
      state.servers[0].push({ kind: "end" });
    },
  },
  {
    ending: "the dev server fails",
    end: async (state) => {
      await reachServing(state);
      state.servers[0].push({ kind: "fail", error: new Error("Port in use") });
    },
  },
  {
    ending: "the initial generation fails",
    end: async (state) => {
      watcherOf(state).emit("ready");
      await until(() => state.passes.length === 1, "the initial generation");
      state.passes[0].reject(new Error("Route diagnostics"));
    },
  },
  {
    ending: "the watcher fails before ready",
    end: async (state) => {
      watcherOf(state).emit("error", new Error("EMFILE"));
    },
  },
]) {
  test(`serve settles once everything is released when ${ending}`, async () => {
    const { run, scenario: state } = await serve({ holdTeardown: true });

    await until(() => state.watchers.length === 1, "the watcher");
    await end(state);
    await until(() => state.sessions[0].disposals === 1, "the release");

    const settlers = [
      () => watcherOf(state).closure.resolve(),
      () => state.sessions[0].disposal.resolve(),
    ];

    for (const server of state.servers) {
      settlers.push(() => server.teardown.resolve());
    }

    for (const settler of settlers) {
      await settle();
      assert.equal(state.done, false, "Serve waits for every release");
      settler();
    }

    await until(() => state.done, "the end");
    released(state);
    await run.stop();
  });
}

test("stopping cancels an edit that's still settling", async () => {
  const { run, scenario: state } = await started();

  await touch(state);
  await run.stop();
  mock.timers.tick(settleDelay);
  await settle();
  assert.equal(state.passes.length, 1);
});

test("serve watches only the scan directory: there's no other watch to follow", async () => {
  const { run, scenario: state } = await started();

  assert.equal(state.watchers.length, 1);
  assert.equal(watcherOf(state).paths[0], scanRoot);
  await change(state);
  await until(() => state.passes.length === 2, "the route edit's pass");
  state.passes[1].resolve();
  await settle();
  assert.equal(state.watchers.length, 1);

  await run.stop();
  released(state);
});

// The pass, the watchers' close, the dev server's teardown and the session's disposal settle in
// turn, each one last once. Overlapping stops share one teardown, which releases each resource once.
for (const last of ["pass", "watcher", "dev server", "session"]) {
  test(`stopping waits for the ${last} when it settles last`, async () => {
    const { run, scenario: state } = await started({ holdTeardown: true });
    const watcher = watcherOf(state);
    const [server] = state.servers;
    const [session] = state.sessions;

    await change(state);
    await until(() => state.passes.length === 2, "the second pass");

    const pass = state.passes[1];
    const settlers = {
      pass: () => pass.resolve(),
      watcher: () => watcher.closure.resolve(),
      "dev server": () => server.teardown.resolve(),
      session: () => session.disposal.resolve(),
    };
    const order = [...Object.keys(settlers).filter((name) => name !== last), last];
    let stops = 0;

    void run.stop().then(() => stops++);
    void run.stop().then(() => stops++);
    await until(() => pass.isStopped(), "the cancellation signal");
    await until(() => server.teardowns > 0, "the dev server teardown");
    await settle();
    assert.equal(watcher.closes, 1);
    assert.equal(server.teardowns, 1);
    assert.equal(session.disposals, 1);

    for (const [index, name] of order.entries()) {
      settlers[name]();
      await settle();

      if (index < order.length - 1) {
        assert.equal(stops, 0, `Stopping waits for the ${order.slice(index + 1).join(" and ")}`);
        assert.equal(state.done, false);
      }
    }

    await until(() => stops === 2, "both stops");
    await until(() => state.done, "completion");
    assert.deepEqual(state.errors, []);
    assert.deepEqual(state.outputs, []);
    assert.equal(watcher.closes, 1);
    assert.equal(server.teardowns, 1);
    assert.equal(server.stopped, true);
    assert.equal(session.disposals, 1);
    assert.equal(state.passes.length, 2);
  });
}

// Serve with the build target's options and project metadata, past an initial generation that
// resolved to these words.
async function startedWith(options, words) {
  const session = await serve(options);
  const { scenario: state } = session;

  await until(() => state.watchers.length === 1, "the watcher");
  watcherOf(state).emit("ready");
  await until(() => state.passes.length === 1, "the initial generation");
  state.passes[0].resolve(words);
  await until(() => state.servers.length === 1, "the dev server");

  return session;
}

const localized = {
  build: {
    translateSegments: true,
    polyfills: ["@angular/localize/init"],
    localize: ["de"],
    define: { appVersion: '"1"' },
  },
  metadata: {
    i18n: { sourceLocale: "en", locales: { de: "src/locale/messages.de.xlf" } },
  },
};

function germanWords(entries) {
  return new Map([["de", new Map(entries)]]);
}

test("a single-locale serve defines the router's locale table, with the served locale at its flat base", async () => {
  const { run, scenario: state } = await startedWith(
    localized,
    germanWords([
      ["sign-in", "anmelden"],
      ["teams", "teams"],
      ["anmelden", "empfangen"],
    ]),
  );
  const { define } = state.servers[0].options;

  // The build target's own define reaches Angular through the build options; serve adds the table
  // to the dev server's, which Angular merges into them.
  assert.deepEqual(Object.keys(define), ["loozoRouterLocales"]);
  assert.deepEqual(JSON.parse(define.loozoRouterLocales), {
    locales: [
      { code: "en", baseHref: "/en/", words: [] },
      {
        code: "de",
        baseHref: "/",
        words: [
          ["anmelden", "empfangen"],
          ["sign-in", "anmelden"],
        ],
      },
    ],
  });
  assert.deepEqual(warnings(state), []);

  await run.stop();
});

test("serve merges the table into its own define, and rejects the reserved key in either", async () => {
  const merged = await startedWith(
    {
      ...localized,
      build: { ...localized.build, baseHref: "/app/" },
      serveOptions: { define: { apiUrl: '"/api"' } },
    },
    germanWords([]),
  );
  const { define } = merged.scenario.servers[0].options;

  assert.equal(define.apiUrl, '"/api"');
  // The served locale sits at the build's baseHref; the others keep their production base.
  assert.deepEqual(JSON.parse(define.loozoRouterLocales).locales, [
    { code: "en", baseHref: "/app/en/", words: [] },
    { code: "de", baseHref: "/app/", words: [] },
  ]);
  await merged.run.stop();

  for (const reserved of [
    { ...localized, build: { ...localized.build, define: { loozoRouterLocales: "{}" } } },
    { ...localized, serveOptions: { define: { loozoRouterLocales: "{}" } } },
  ]) {
    const { scenario: state } = await serve(reserved);

    await until(() => state.done, "the failed serve");
    assert.equal(state.watchers.length, 0);
    assert.equal(state.passes.length, 0);
    assert.equal(state.servers.length, 0);
    assert.match(
      String(state.errors[0]?.message ?? state.errors[0]),
      /define\.loozoRouterLocales is reserved by @loozo\/angular-router: remove it from the build options/,
    );
  }
});

test("serve defines no table unless it serves exactly one locale", async () => {
  for (const localize of [undefined, false, true, ["en", "de"]]) {
    const build = { ...localized.build, localize };

    if (localize === undefined) {
      delete build.localize;
    }

    const { run, scenario: state } = await startedWith(
      { ...localized, build },
      germanWords([["sign-in", "anmelden"]]),
    );

    assert.equal(state.servers[0].options.define, undefined, String(localize));
    await run.stop();
  }
});

test("a later pass that changes the table warns once per distinct table; the dev server keeps its own", async () => {
  const startedWords = [
    ["sign-in", "anmelden"],
    ["guarded", "geschuetzt"],
  ];
  const { run, scenario: state } = await startedWith(localized, germanWords(startedWords));
  const define = state.servers[0].options.define.loozoRouterLocales;

  // Unchanged words: no warning.
  await change(state);
  await until(() => state.passes.length === 2, "the unchanged pass");
  state.passes[1].resolve(germanWords(startedWords));
  await settle();
  assert.deepEqual(warnings(state), []);

  // A changed word warns, naming it.
  await change(state, "src/locale/messages.de.xlf");
  await until(() => state.passes.length === 3, "the changed pass");
  state.passes[2].resolve(
    germanWords([
      ["sign-in", "anmelden"],
      ["guarded", "behuetet"],
    ]),
  );
  await until(() => warnings(state).length === 1, "the warning");
  assert.equal(
    warnings(state)[0],
    "Locale words changed (route.segment.guarded in de). Links from localeUrls keep the words ng serve started with until you restart it.",
  );

  // The same changed table again: no second warning. A failed pass warns nothing.
  await change(state);
  await until(() => state.passes.length === 4, "the repeated pass");
  state.passes[3].resolve(
    germanWords([
      ["sign-in", "anmelden"],
      ["guarded", "behuetet"],
    ]),
  );
  await change(state);
  await until(() => state.passes.length === 5, "the failed pass");
  state.passes[4].reject(new Error("broken"));
  await until(() => errors(state).length === 1, "the logged failure");
  await settle();
  assert.equal(warnings(state).length, 1);

  // Back to the started table: nothing new, and the dev server still has its started table.
  await change(state);
  await until(() => state.passes.length === 6, "the restoring pass");
  state.passes[5].resolve(germanWords(startedWords));
  await settle();
  assert.equal(warnings(state).length, 1);
  assert.equal(state.servers.length, 1);
  assert.equal(state.servers[0].options.define.loozoRouterLocales, define);

  await run.stop();
});

// Events for files no generation pass reads. The watcher is fake, but serve inspects each path, so
// these are real files in a scratch directory.
const inertExtensions = [
  ".html",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".md",
];
const scratch = resolve(packageDirectory, "../../.scratch/launch-serve", String(process.pid));

async function scratchDirectory(name) {
  const directory = resolve(scratch, name);

  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });

  return directory;
}

// A regular file serve may skip an event for.
async function asset(name = "page.html") {
  const path = resolve(await scratchDirectory(`asset-${name}`), name);

  await writeFile(path, "<p>Page</p>\n");

  return path;
}

test("adding, changing or removing a template, style, image, font or Markdown file between passes runs no pass", async () => {
  const { run, scenario: state } = await started();
  const directory = await scratchDirectory("inert");

  // The extension is compared without case.
  for (const extension of [...inertExtensions, ".SVG"]) {
    const path = resolve(directory, `file${extension}`);

    await writeFile(path, "content\n");
    await change(state, path, "add");
    await change(state, path, "change");
    await rm(path);
    await change(state, path, "unlink");
  }

  await settle();
  assert.equal(state.passes.length, 1);

  await run.stop();
});

test("every event serve can't prove inert runs a pass", async () => {
  const { run, scenario: state } = await started();
  const directory = await scratchDirectory("regenerates");
  const target = resolve(directory, "target.svg");
  const regular = resolve(directory, "regular.css");

  await writeFile(target, "<svg/>\n");
  await writeFile(regular, "p {}\n");
  await symlink(target, resolve(directory, "linked.svg"));
  await symlink(resolve(directory, "missing.svg"), resolve(directory, "dangling.svg"));
  state.inspectionErrors.set(resolve(directory, "unreadable.css"), "EACCES");

  const cases = [
    ["a route", "change", "src/routes/teams/route.ts"],
    ["a helper", "change", "src/routes/teams/helper.ts"],
    ["a page with an inline template", "change", "src/routes/teams/page.ts"],
    ["a removed route", "unlink", "src/routes/teams/route.ts"],
    ["a JSON file", "change", "src/routes/tsconfig.json"],
    ["an added directory", "addDir", "src/routes/teams"],
    ["a removed directory", "unlinkDir", "src/routes/teams"],
    ["a removed directory whose path now holds an asset", "unlinkDir", regular],
    ["a symlinked asset", "add", resolve(directory, "linked.svg")],
    ["a removal with a dangling symlink at its path", "unlink", resolve(directory, "dangling.svg")],
    ["an asset path lstat fails on", "unlink", resolve(directory, "unreadable.css")],
    ["an asset that isn't there on a change", "change", resolve(directory, "gone.css")],
  ];

  for (const [name, event, path] of cases) {
    const before = state.passes.length;

    await change(state, path, event);
    await until(() => state.passes.length === before + 1, `the pass for ${name}`);
    state.passes.at(-1).resolve();
    await settle();
  }

  await run.stop();
});

test("an event for a catalog runs a pass whatever its extension or case", async () => {
  const directory = await scratchDirectory("catalogs");
  const catalog = resolve(directory, "messages.de.html");

  await writeFile(catalog, "<p>Katalog</p>\n");

  const { run, scenario: state } = await started({
    build: { translateSegments: true, polyfills: ["@angular/localize/init"] },
    metadata: {
      i18n: {
        sourceLocale: "en",
        locales: { de: `../../.scratch/launch-serve/${process.pid}/catalogs/messages.de.html` },
      },
    },
  });

  assert.deepEqual(watcherOf(state).paths, [scanRoot]);

  await change(state, catalog);
  await until(() => state.passes.length === 2, "the catalog's pass");
  state.passes[1].resolve();
  await settle();

  // On a case-insensitive filesystem this is the catalog too.
  await change(state, catalog.toUpperCase(), "unlink");
  await until(() => state.passes.length === 3, "the pass for the catalog in another case");
  state.passes[2].resolve();
  await settle();

  await run.stop();
});

test("an asset event within a burst's settle delay still runs the burst's one pass", async () => {
  const { run, scenario: state } = await started();

  await touch(state);
  mock.timers.tick(settleDelay - 1);
  await touch(state, await asset());
  mock.timers.tick(1);
  await until(() => state.passes.length === 2, "the burst's pass");
  state.passes[1].resolve();
  await settle();
  assert.equal(state.passes.length, 2);

  await run.stop();
});

test("a burst still settling when the initial generation starts needs no pass after it", async () => {
  const { run, scenario: state } = await serve();

  await until(() => state.watchers.length === 1, "the watcher");
  await touch(state);
  watcherOf(state).emit("ready");
  await until(() => state.passes.length === 1, "the initial generation");
  mock.timers.tick(settleDelay);
  state.passes[0].resolve();
  await until(() => state.servers.length === 1, "the dev server");
  await settle();
  assert.equal(state.passes.length, 1);

  await run.stop();
});

// The file is gone by the time the inspection finishes, so the event isn't inert: only the stop
// check after the inspection keeps it from scheduling a pass.
test("stopping while serve inspects an asset event runs no pass", async () => {
  const { run, scenario: state } = await started();
  const gate = Promise.withResolvers();
  const path = await asset();

  state.inspectionGate = gate.promise;
  await touch(state, path);
  assert.equal(state.inspections, 1);
  await run.stop();
  await rm(path);
  gate.resolve();
  await settle();
  mock.timers.tick(settleDelay);
  await settle();
  assert.equal(state.passes.length, 1);
});

// The pass may have read the file before or after the event, so the event still regenerates even
// when its inspection only finishes after the pass succeeded.
test("an asset event during the initial generation runs one pass after it", async () => {
  const { run, scenario: state } = await serve();
  const gate = Promise.withResolvers();

  await until(() => state.watchers.length === 1, "the watcher");
  watcherOf(state).emit("ready");
  await until(() => state.passes.length === 1, "the initial generation");
  state.inspectionGate = gate.promise;
  await change(state, await asset());
  state.passes[0].resolve();
  await until(() => state.passes.length === 2, "the pass for the asset event");
  gate.resolve();
  state.passes[1].resolve();
  await until(() => state.servers.length === 1, "the dev server");
  await settle();
  mock.timers.tick(settleDelay);
  await settle();
  assert.equal(state.passes.length, 2);

  await run.stop();
});

test("an asset event during a later pass runs one pass after it", async () => {
  const { run, scenario: state } = await started();
  const gate = Promise.withResolvers();

  await change(state);
  await until(() => state.passes.length === 2, "the edit's pass");
  state.inspectionGate = gate.promise;
  await change(state, await asset());
  state.passes[1].resolve();
  await settle();
  gate.resolve();
  await settle();
  mock.timers.tick(settleDelay);
  await until(() => state.passes.length === 3, "the pass for the asset event");
  state.passes[2].resolve();
  await settle();
  assert.equal(state.passes.length, 3);

  await run.stop();
});

test("an asset event runs a pass when one starts while serve inspects it", async () => {
  const { run, scenario: state } = await started();
  const gate = Promise.withResolvers();

  state.inspectionGate = gate.promise;
  await touch(state, await asset());
  assert.equal(state.inspections, 1);
  state.inspectionGate = undefined;
  await change(state);
  await until(() => state.passes.length === 2, "the edit's pass");
  gate.resolve();
  await settle();
  mock.timers.tick(settleDelay);
  await settle();
  state.passes[1].resolve();
  await until(() => state.passes.length === 3, "the pass for the asset event");
  state.passes[2].resolve();
  await settle();
  assert.equal(state.passes.length, 3);

  await run.stop();
});

// A pass that failed while the event was inspected leaves no success to skip on, even though the
// last pass had succeeded when the event arrived.
test("an asset event runs a pass when one fails while serve inspects it", async () => {
  const { run, scenario: state } = await started();
  const gate = Promise.withResolvers();

  state.inspectionGate = gate.promise;
  await touch(state, await asset());
  assert.equal(state.inspections, 1);
  state.inspectionGate = undefined;
  await change(state);
  await until(() => state.passes.length === 2, "the edit's pass");
  state.passes[1].reject(new Error("Route diagnostics"));
  await settle();
  gate.resolve();
  await settle();
  mock.timers.tick(settleDelay);
  await until(() => state.passes.length === 3, "the asset's pass after the failure");
  state.passes[2].resolve();
  await settle();
  assert.equal(state.passes.length, 3);

  await run.stop();
});

test("after a failed pass, asset events run passes until one succeeds", async () => {
  const { run, scenario: state } = await started();
  const path = await asset("icon.svg");

  await change(state);
  await until(() => state.passes.length === 2, "the edit's pass");
  state.passes[1].reject(new Error("Rpc diagnostics"));
  await settle();

  await change(state, path);
  await until(() => state.passes.length === 3, "the asset's pass after the failure");
  state.passes[2].reject(new Error("Rpc diagnostics"));
  await settle();

  await rm(path);
  await change(state, path, "unlink");
  await until(() => state.passes.length === 4, "the removal's pass after the failure");
  state.passes[3].resolve();
  await settle();

  await writeFile(path, "<svg/>\n");
  await change(state, path, "add");
  await settle();
  assert.equal(state.passes.length, 4, "A success makes asset events inert again");

  await run.stop();
});
