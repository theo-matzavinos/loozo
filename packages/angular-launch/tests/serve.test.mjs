// Drives the serve builder through a real Architect with a fake watcher, generation session and dev
// server, and mocked timers for the settle delay, so the lifecycle's interleavings (edits during a
// pass, stops during startup and teardown) are deterministic. builders.test.mjs covers the real
// collaborators.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
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

mock.module(new URL("../dist/generation/index.js", import.meta.url).href, {
  exports: {
    createGenerationSession(workspace, options) {
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

// realpath(workspaceRoot) is one of startup's awaits.
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
mock.timers.enable({ apis: ["setTimeout"] });

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
async function serve({ optionsGate, workspaceGate, devServerGate, holdTeardown = false } = {}) {
  scenario = createScenario();
  scenario.workspaceGate = workspaceGate;
  scenario.holdTeardown = holdTeardown;

  const host = new TestingArchitectHost(packageDirectory, packageDirectory);
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
  });
  host.addTarget({ project: "app", target: "serve" }, "@loozo/angular-launch:serve", {
    buildTarget: "app:build",
    port: 0,
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

// A watcher event, without the settle delay running out.
function touch(state, path = "src/routes/page.ts", watcher = watcherOf(state)) {
  watcher.emit("all", "change", resolve(packageDirectory, path));
}

// A watcher event, then the settle delay running out.
function change(state, path) {
  touch(state, path);
  mock.timers.tick(settleDelay);
}

function errors(state) {
  const messages = [];

  for (const entry of state.logs) {
    if (entry.level === "error") {
      messages.push(entry.message);
    }
  }

  return messages;
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

test("a burst of watcher events within the settle delay runs one pass", async () => {
  const { run, scenario: state } = await started();

  touch(state);
  mock.timers.tick(settleDelay - 1);
  touch(state, "src/routes/other/page.ts");
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

  change(state);
  await until(() => state.passes.length === 2, "the second pass");

  change(state);
  change(state, "src/routes/other/page.ts");
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

  change(state);
  await until(() => state.passes.length === 2, "the first edit's pass");

  for (let delay = 0; delay < 40; delay++) {
    const before = state.passes.length;

    state.passes.at(-1).resolve();

    for (let tick = 0; tick < delay; tick++) {
      await Promise.resolve();
    }

    change(state);
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
  change(state);
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
  // Still settling when the watcher is ready, so it settles during the initial generation.
  touch(state);
  watcherOf(state).emit("ready");
  await until(() => state.passes.length === 1, "the initial generation");
  mock.timers.tick(settleDelay);
  change(state);
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

  change(state);
  await settle();
  assert.equal(state.passes.length, 1);

  await run.stop();
});

test("a failed later pass is logged and serving continues", async () => {
  const { run, scenario: state } = await started();

  change(state);
  await until(() => state.passes.length === 2, "the second pass");
  state.passes[1].reject(new Error("Rpc diagnostics"));
  await until(() => errors(state).length === 1, "the logged failure");
  assert.deepEqual(errors(state), ["Rpc diagnostics"]);

  change(state);
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

  change(state);
  await until(() => state.passes.length === 2, "the second pass");
  change(state);
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

  change(state);
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
  change(state);
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

  change(state);
  pass.resolve();
  await until(() => stopped, "the stop");
  await settle();
  assert.equal(state.passes.length, 1);
  assert.equal(state.servers.length, 0);
  assert.equal(state.validating, undefined);
});

test("stopping during a later pass cancels it and stops the dev server", async () => {
  const { run, scenario: state } = await started();

  change(state);
  await until(() => state.passes.length === 2, "the second pass");

  const pass = state.passes[1];

  void run.stop();
  await until(() => pass.isStopped(), "the cancellation signal");
  change(state);
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

  touch(state);
  await run.stop();
  mock.timers.tick(settleDelay);
  await settle();
  assert.equal(state.passes.length, 1);
});

test("serve watches only the scan directory: there's no other watch to follow", async () => {
  const { run, scenario: state } = await started();

  assert.equal(state.watchers.length, 1);
  assert.equal(watcherOf(state).paths[0], scanRoot);
  change(state);
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

    change(state);
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
