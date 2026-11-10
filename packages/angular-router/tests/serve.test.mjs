// Drives the serve builder through a real Architect with a fake watcher, generation and dev server,
// so the lifecycle's interleavings (edits during a pass, stops during startup and teardown) are
// deterministic. The filesystem, navigation and lifecycle proofs cover the real collaborators.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mock, test } from "node:test";
import { Observable } from "rxjs";

const packageDirectory = resolve(import.meta.dirname, "..");
const require = createRequire(resolve(packageDirectory, "package.json"));
const { Architect, createBuilder } = require("@angular-devkit/architect");
const { TestingArchitectHost } = require("@angular-devkit/architect/testing");
const nativeRequire = createRequire(require.resolve("@angular-devkit/architect"));
const core = nativeRequire("@angular-devkit/core");

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

  constructor(roots, options, held) {
    super();
    this.roots = roots;
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
      watch(roots, options) {
        const watcher = new FakeWatcher(roots, options, scenario.holdTeardown);

        scenario.watchers.push(watcher);

        return watcher;
      },
    },
  },
});

// Counts each compiler-state clear; anchor clears last.
function spyOnClears(state) {
  const clear = state.anchor.clear.bind(state.anchor);

  scenario.state = state;
  state.anchor.clear = () => {
    clear();
    scenario.clears++;
  };
}

mock.module(new URL("../node/src/generation/generate.js", import.meta.url).href, {
  exports: {
    generate(workspaceRoot, router, isStopped, state) {
      const { promise, resolve, reject } = Promise.withResolvers();
      const pass = { router, isStopped, resolve, reject, settled: false };

      if (scenario.state !== state) {
        spyOnClears(state);
      }

      scenario.events.push("generate");

      void promise.then(
        () => (pass.settled = true),
        () => (pass.settled = true),
      );
      scenario.passes.push(pass);

      return promise;
    },
  },
});

const filesUrl = new URL("../node/src/generation/files.js", import.meta.url).href;
const files = await import(filesUrl);

mock.module(filesUrl, {
  exports: {
    ...files,
    async workspacePaths(workspace) {
      scenario.resolvingWorkspace = true;
      await scenario.workspaceGate;

      return files.workspacePaths(workspace);
    },
  },
});

const { default: serveBuilder } = await import("../node/src/builders/serve.js");

const devServerBuilder = createBuilder((options, context) => {
  return new Observable((subscriber) => {
    const server = {
      options,
      subscriber,
      stopped: false,
      teardowns: 0,
      teardown: teardownPromise(scenario.holdTeardown),
    };

    context.addTeardown(() => {
      server.teardowns++;

      return server.teardown.promise;
    });
    scenario.servers.push(server);

    return () => {
      server.stopped = true;
    };
  });
});

function createScenario() {
  return {
    watchers: [],
    passes: [],
    servers: [],
    events: [],
    clears: 0,
    logs: [],
    outputs: [],
    errors: [],
    done: false,
  };
}

// The scheduler passes messages through promises and setImmediate, so states are awaited.
async function until(predicate, description) {
  const deadline = Date.now() + 2000;

  while (!predicate()) {
    assert.ok(Date.now() < deadline, `Timed out waiting for ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

// Lets every queued callback run, to show that nothing further happens.
async function settle() {
  for (let turn = 0; turn < 20; turn++) {
    await new Promise(setImmediate);
  }
}

// Each gate holds one startup await open until the test resolves it. holdTeardown makes the
// watcher's close and the dev server's teardown wait for the test too.
async function serve({ optionsGate, workspaceGate, devServerGate, holdTeardown = false } = {}) {
  scenario = createScenario();
  scenario.workspaceGate = workspaceGate;
  scenario.holdTeardown = holdTeardown;

  const host = new TestingArchitectHost(packageDirectory, packageDirectory);
  const resolveBuilder = host.resolveBuilder.bind(host);
  const getOptionsForTarget = host.getOptionsForTarget.bind(host);

  host.addBuilder("@loozo/angular-router:serve", serveBuilder);
  host.addBuilder(
    "@loozo/angular-router:application",
    createBuilder(() => ({ success: true })),
  );
  host.addBuilder("@angular/build:dev-server", devServerBuilder);
  host.addTarget({ project: "proof", target: "build" }, "@loozo/angular-router:application", {
    tsconfig: "tsconfig.json",
    scanDirectories: ["src/routes"],
    outDirectory: "src/generated",
  });
  host.addTarget({ project: "proof", target: "serve" }, "@loozo/angular-router:serve", {
    buildTarget: "proof:build",
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
      scenario.events.push("acquire");
      scenario.acquiring = true;
      await devServerGate;
    }

    return resolveBuilder(name);
  };

  const registry = new core.json.schema.CoreSchemaRegistry();
  const architect = new Architect(host, registry);
  const logger = new core.logging.Logger("serve-test");

  logger.subscribe((entry) => scenario.logs.push(entry));

  const run = await architect.scheduleTarget({ project: "proof", target: "serve" }, {}, { logger });
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

function change(state, path = "src/routes/page.ts") {
  watcherOf(state).emit("all", "change", resolve(packageDirectory, path));
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
async function started(options) {
  const session = await serve(options);
  const { scenario: state } = session;

  await until(() => state.watchers.length === 1, "the watcher");
  watcherOf(state).emit("ready");
  await until(() => state.passes.length === 1, "the initial generation");
  state.passes[0].resolve();
  await until(() => state.servers.length === 1, "the dev server");

  return session;
}

test("serve watches the scan directory and starts the dev server after the initial generation", async () => {
  const { run, scenario: state } = await started();
  const watcher = watcherOf(state);

  assert.deepEqual(watcher.roots, [resolve(packageDirectory, "src/routes")]);
  assert.deepEqual(watcher.options, { ignoreInitial: true, followSymlinks: false });
  assert.equal(state.passes.length, 1);
  assert.equal(state.servers[0].options.poll, 1000);
  assert.equal(state.servers[0].options.port, 0);

  state.servers[0].subscriber.next({ success: true, baseUrl: "http://localhost:4200/" });
  await until(() => state.outputs.length === 1, "the forwarded output");
  assert.deepEqual(state.outputs, [{ success: true, baseUrl: "http://localhost:4200/" }]);

  await run.stop();
  assert.equal(watcher.closed, true);
  assert.equal(state.servers[0].stopped, true);
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

// The edit lands at each microtask boundary from the pass settling until well after the pass's
// bookkeeping finishes, covering the window between the last dirty check and finalization.
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

test("edits before the watcher is ready are covered by the initial generation", async () => {
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

test("an edit during the initial generation causes one pass after it", async () => {
  const { run, scenario: state } = await serve();

  await until(() => state.watchers.length === 1, "the watcher");
  watcherOf(state).emit("ready");
  await until(() => state.passes.length === 1, "the initial generation");
  change(state);
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
    ["generate", "generate", "acquire"],
    "The folded-in pass starts before the dev server is scheduled",
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
  assert.equal(watcherOf(state).closed, true);
  assert.equal(state.servers.length, 0);

  change(state);
  await settle();
  assert.equal(state.passes.length, 1);

  await run.stop();
});

test("a failed later pass is logged and serving continues", async () => {
  const { run, scenario: state } = await started();

  change(state);
  await until(() => state.passes.length === 2, "the second pass");
  state.passes[1].reject(new Error("Route diagnostics"));
  await until(() => errors(state).length === 1, "the logged failure");
  assert.deepEqual(errors(state), ["Route diagnostics"]);

  change(state);
  await until(() => state.passes.length === 3, "the pass after the failure");
  state.passes[2].resolve();
  await settle();

  assert.equal(state.done, false);
  assert.equal(state.servers[0].stopped, false);
  assert.equal(watcherOf(state).closed, false);

  await run.stop();
});

test("a failed later pass still runs the rerun queued during it", async () => {
  const { run, scenario: state } = await started();

  change(state);
  await until(() => state.passes.length === 2, "the second pass");
  change(state);
  state.passes[1].reject(new Error("Route diagnostics"));
  await until(() => state.passes.length === 3, "the queued rerun");
  assert.deepEqual(errors(state), ["Route diagnostics"]);
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
  assert.equal(watcherOf(failing.scenario).closed, true);
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

for (const [phase, gate, waiting] of [
  ["resolving the build target's options", "optionsGate", "resolvingOptions"],
  ["resolving the workspace paths", "workspaceGate", "resolvingWorkspace"],
]) {
  test(`stopping while ${phase} never watches, generates or serves`, async () => {
    const open = Promise.withResolvers();
    const { run, scenario: state } = await serve({ [gate]: open.promise });

    await until(() => state[waiting], phase);
    await run.stop();
    open.resolve();
    await settle();
    assert.equal(state.watchers.length, 0);
    assert.equal(state.passes.length, 0);
    assert.equal(state.servers.length, 0);
    assert.deepEqual(state.errors, []);
  });
}

test("stopping before the watcher is ready closes it and never generates", async () => {
  const { run, scenario: state } = await serve();

  await until(() => state.watchers.length === 1, "the watcher");
  await run.stop();
  assert.equal(watcherOf(state).closed, true);

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
  assert.equal(watcherOf(state).closed, true);
  await settle();
  assert.equal(stopped, false, "Stopping waits for the cancelled generation");

  change(state);
  pass.resolve();
  await until(() => stopped, "the stop");
  await settle();
  assert.equal(state.passes.length, 1);
  assert.equal(state.servers.length, 0);
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
  assert.equal(watcherOf(state).closed, true);
});

test("stopping while the dev server is being acquired waits for it and leaves none running", async () => {
  const gate = Promise.withResolvers();
  const { run, scenario: state } = await serve({ devServerGate: gate.promise });

  await until(() => state.watchers.length === 1, "the watcher");
  watcherOf(state).emit("ready");
  await until(() => state.passes.length === 1, "the initial generation");
  state.passes[0].resolve();
  await until(() => state.acquiring, "the dev server acquisition");

  let stopped = false;

  void run.stop().then(() => (stopped = true));
  await until(() => watcherOf(state).closed, "the watcher close");
  await settle();
  assert.equal(stopped, false, "Stopping waits for the acquisition");

  gate.resolve();
  await until(() => stopped, "the stop");
  await settle();

  for (const server of state.servers) {
    assert.equal(server.stopped, true);
  }

  assert.deepEqual(state.outputs, []);
});

test("the dev server finishing ends serve and releases the watcher", async () => {
  const completing = await started();

  completing.scenario.servers[0].subscriber.complete();
  await until(() => completing.scenario.done, "completion");
  assert.deepEqual(completing.scenario.errors, []);
  assert.equal(watcherOf(completing.scenario).closed, true);
  await completing.run.stop();

  const { run, scenario: state } = await started();

  state.servers[0].subscriber.error(new Error("Port in use"));
  await until(() => state.done, "the failure");
  assert.equal(state.errors.length, 1);
  assert.match(String(state.errors[0]), /Port in use/);
  assert.equal(watcherOf(state).closed, true);
  await run.stop();
});

// The pass, the watcher's close and the dev server's teardown settle in turn, each one last once.
// Overlapping stops share one teardown, which releases each resource once and clears the compiler
// state only after everything settled.
for (const last of ["pass", "watcher", "dev server"]) {
  test(`stopping waits for the ${last} when it settles last`, async () => {
    const { run, scenario: state } = await started({ holdTeardown: true });
    const watcher = watcherOf(state);
    const [server] = state.servers;

    change(state);
    await until(() => state.passes.length === 2, "the second pass");

    const pass = state.passes[1];
    const settlers = {
      pass: () => pass.resolve(),
      watcher: () => watcher.closure.resolve(),
      "dev server": () => server.teardown.resolve(),
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
    assert.equal(state.clears, 0, "Nothing clears while the pass runs");

    for (const [index, name] of order.entries()) {
      settlers[name]();
      await settle();

      if (index < order.length - 1) {
        assert.equal(stops, 0, `Stopping waits for the ${order.slice(index + 1).join(" and ")}`);
        assert.equal(state.done, false);
        // The stopped pass clears its own partial state as it settles.
        assert.equal(state.clears, pass.settled ? 1 : 0, `Clears after the ${name} settles`);
      }
    }

    await until(() => stops === 2, "both stops");
    await until(() => state.done, "completion");
    assert.equal(state.clears, 2, "Stopping clears once everything settled");
    assert.deepEqual(state.errors, []);
    assert.deepEqual(state.outputs, []);
    assert.equal(watcher.closes, 1);
    assert.equal(server.teardowns, 1);
    assert.equal(state.passes.length, 2);
  });
}
