// Drives the serve builder through a real Architect with a fake watcher, generation and dev server,
// and mocked timers for the settle delay, so the lifecycle's interleavings (edits during a pass,
// stops during startup and teardown) are deterministic. The filesystem, navigation and lifecycle proofs cover the real collaborators.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { lstatSync, readFileSync } from "node:fs";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mock, test } from "node:test";
import { concat, from, ignoreElements, Observable } from "rxjs";

const packageDirectory = resolve(import.meta.dirname, "..");
const require = createRequire(resolve(packageDirectory, "package.json"));
const { Architect, createBuilder, jobs } = require("@angular-devkit/architect");
const { TestingArchitectHost } = require("@angular-devkit/architect/testing");
const nativeRequire = createRequire(require.resolve("@angular-devkit/architect"));
const core = nativeRequire("@angular-devkit/core");
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

// Serve reads a generated file's marker and inspects an asset event's path before it starts the
// settle delay. Read synchronously, both finish within settle()'s turns, so the mocked delay is
// never ticked before it starts. A scenario can hold the inspection open.
const fsPromises = await import("node:fs/promises");

mock.module("node:fs/promises", {
  exports: {
    ...fsPromises,
    default: fsPromises.default,
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

const { default: serveBuilder } = await import("../node/src/builders/serve.js");

// The settle delay runs on these; until() and settle() wait on setImmediate instead.
mock.timers.enable({ apis: ["setTimeout"] });

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

// Counts the stop messages Architect sends the dev server's job, one for each run.stop(), and holds
// the job's end, which each run.stop() waits for, until the scenario's gate opens.
const devServerJob = {
  ...devServerBuilder,
  handler(argument, context) {
    const current = scenario;

    context.inboundBus.subscribe((message) => {
      if (message.kind === jobs.JobInboundMessageKind.Stop) {
        current.devServerStops++;
      }
    });

    return concat(
      devServerBuilder.handler(argument, context),
      from(Promise.resolve(current.devServerEndGate)).pipe(ignoreElements()),
    );
  },
};

function createScenario() {
  return {
    watchers: [],
    passes: [],
    servers: [],
    events: [],
    clears: 0,
    inspections: 0,
    inspectionErrors: new Map(),
    devServerStops: 0,
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
    await new Promise(setImmediate);
  }
}

// Lets every queued callback run, to show that nothing further happens.
async function settle() {
  for (let turn = 0; turn < 20; turn++) {
    await new Promise(setImmediate);
  }
}

// Each gate holds one startup await open until the test resolves it, and devServerEndGate holds the
// dev server job's end. holdTeardown makes the watcher's close and the dev server's teardown wait
// for the test too.
async function serve({
  optionsGate,
  workspaceGate,
  devServerGate,
  devServerEndGate,
  holdTeardown = false,
  build = {},
  metadata = {},
  serveOptions = {},
} = {}) {
  scenario = createScenario();
  scenario.workspaceGate = workspaceGate;
  scenario.devServerEndGate = devServerEndGate;
  scenario.holdTeardown = holdTeardown;

  const host = new TestingArchitectHost(packageDirectory, packageDirectory);
  const resolveBuilder = host.resolveBuilder.bind(host);
  const getOptionsForTarget = host.getOptionsForTarget.bind(host);

  host.addBuilder("@loozo/angular-router:serve", serveBuilder);
  host.addBuilder(
    "@loozo/angular-router:application",
    createBuilder(() => ({ success: true })),
  );
  host.addBuilder("@angular/build:dev-server", devServerJob);
  host.addTarget({ project: "proof", target: "build" }, "@loozo/angular-router:application", {
    tsconfig: "tsconfig.json",
    scanDirectories: ["src/routes"],
    outDirectory: "src/generated",
    ...build,
  });
  host.getProjectMetadata = async () => metadata;
  host.addTarget({ project: "proof", target: "serve" }, "@loozo/angular-router:serve", {
    buildTarget: "proof:build",
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

// The edit lands at each microtask boundary from the pass settling until well after the pass's
// bookkeeping finishes, covering the window between the last dirty check and finalization.
// Generation's own writes of the per-route copies need no further pass; their marker is the last
// line, also when Git checks them out with CRLF. A lookalike without it is an edit.
test("marked writes of route.generated.ts, destination.generated.ts and children.generated.ts are not edits", async () => {
  const { run, scenario: state } = await started();
  const directory = resolve(packageDirectory, "../../.scratch/router-serve", String(process.pid));
  const marker = (name) => `// @loozo/angular-router routegen: owned ${name}`;

  await mkdir(directory, { recursive: true });

  async function written(name, bytes) {
    const path = resolve(directory, name);

    await writeFile(path, bytes);
    watcherOf(state).emit("all", "change", path);
    await settle();
    mock.timers.tick(settleDelay);
  }

  await written("route.generated.ts", `const route = 1;\n${marker("route.generated.ts")}\n`);
  await written(
    "destination.generated.ts",
    `const destination = 1;\r\n${marker("destination.generated.ts")}\r\n`,
  );
  // A children table carries its marker on its first line.
  await written(
    "children.generated.ts",
    `${marker("children.generated.ts")}\nexport const routes = [];\n`,
  );
  assert.equal(state.passes.length, 1, "Owned copies and children tables are not edits");

  // The old facade carried the marker on its first line; it isn't owned output anymore.
  await written("route.generated.ts", `${marker("route.generated.ts")}\nconst route = 1;\n`);
  await until(() => state.passes.length === 2, "the pass for an unowned route.generated.ts");
  state.passes[1].resolve();
  await settle();
  await written("destination.generated.ts", "export const destination = {};\n");
  await until(() => state.passes.length === 3, "the pass for an unmarked destination.generated.ts");
  state.passes[2].resolve();
  await settle();
  await written("children.generated.ts", "export const routes = [];\n");
  await until(() => state.passes.length === 4, "the pass for an unmarked children.generated.ts");
  state.passes[3].resolve();

  await run.stop();
});

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

test("edits before the watcher is ready are covered by the initial generation", async () => {
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

test("an edit during the initial generation causes one pass after it", async () => {
  const { run, scenario: state } = await serve();

  await until(() => state.watchers.length === 1, "the watcher");
  watcherOf(state).emit("ready");
  await until(() => state.passes.length === 1, "the initial generation");
  await change(state);
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

  await change(state);
  await settle();
  assert.equal(state.passes.length, 1);

  await run.stop();
});

test("a failed later pass is logged and serving continues", async () => {
  const { run, scenario: state } = await started();

  await change(state);
  await until(() => state.passes.length === 2, "the second pass");
  state.passes[1].reject(new Error("Route diagnostics"));
  await until(() => errors(state).length === 1, "the logged failure");
  assert.deepEqual(errors(state), ["Route diagnostics"]);

  await change(state);
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

  await change(state);
  await until(() => state.passes.length === 2, "the second pass");
  await change(state);
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
  assert.equal(watcherOf(state).closed, true);
  await settle();
  assert.equal(stopped, false, "Stopping waits for the cancelled generation");

  await change(state);
  pass.resolve();
  await until(() => stopped, "the stop");
  await settle();
  assert.equal(state.passes.length, 1);
  assert.equal(state.servers.length, 0);
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
  assert.equal(watcherOf(state).closed, true);
});

test("stopping while the dev server is being acquired waits for it, then stops it once", async () => {
  const gate = Promise.withResolvers();
  const end = Promise.withResolvers();
  const { run, scenario: state } = await serve({
    devServerGate: gate.promise,
    devServerEndGate: end.promise,
  });

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
  await until(() => state.devServerStops > 0, "the dev server stop");
  await settle();
  assert.equal(state.devServerStops, 1);
  assert.equal(stopped, false, "Stopping waits for the dev server's stop");
  assert.equal(state.clears, 0, "Nothing clears while the dev server stops");

  end.resolve();
  await until(() => stopped, "the stop");
  await settle();
  assert.equal(state.devServerStops, 1);
  assert.equal(state.clears, 1, "Stopping clears once the dev server stopped");
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

    await change(state);
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

test("with translated segments, serve watches the catalogs and checks them on every edit", async () => {
  const { run, scenario: state } = await started({
    build: { translateSegments: true, polyfills: ["@angular/localize/init"] },
    metadata: {
      i18n: {
        sourceLocale: { code: "en" },
        locales: {
          de: "src/locale/messages.de.xlf",
          fr: { translation: ["src/locale/a.fr.json", "src/locale/b.fr.json"] },
        },
      },
    },
  });
  const watcher = watcherOf(state);

  assert.deepEqual(watcher.roots, [
    resolve(packageDirectory, "src/routes"),
    resolve(packageDirectory, "src/locale/messages.de.xlf"),
    resolve(packageDirectory, "src/locale/a.fr.json"),
    resolve(packageDirectory, "src/locale/b.fr.json"),
  ]);
  assert.equal(state.passes[0].router.translateSegments, true);
  assert.deepEqual(state.passes[0].router.localization, {
    sourceLocale: "en",
    locales: [
      { code: "de", files: [resolve(packageDirectory, "src/locale/messages.de.xlf")] },
      {
        code: "fr",
        files: [
          resolve(packageDirectory, "src/locale/a.fr.json"),
          resolve(packageDirectory, "src/locale/b.fr.json"),
        ],
      },
    ],
    polyfills: ["@angular/localize/init"],
  });

  // A catalog edit is one more pass; a bad one is logged and serving continues.
  await change(state, "src/locale/messages.de.xlf");
  await until(() => state.passes.length === 2, "the catalog pass");
  state.passes[1].reject(new Error('Locale de: route.segment.teams translates to "a/b"'));
  await until(() => errors(state).length === 1, "the logged failure");
  await settle();
  assert.equal(state.passes.length, 2);
  assert.equal(state.servers[0].stopped, false);

  // The repair clears it on the next pass.
  await change(state, "src/locale/messages.de.xlf");
  await until(() => state.passes.length === 3, "the repair pass");
  state.passes[2].resolve();
  await settle();
  assert.equal(errors(state).length, 1);

  await run.stop();
});

test("without translated segments, serve watches no catalog and passes no localization", async () => {
  const { run, scenario: state } = await started({
    metadata: { i18n: { locales: { de: "src/locale/messages.de.xlf" } } },
  });

  assert.deepEqual(watcherOf(state).roots, [resolve(packageDirectory, "src/routes")]);
  assert.equal(state.passes[0].router.localization, undefined);

  await run.stop();
});

function warnings(state) {
  const messages = [];

  for (const entry of state.logs) {
    if (entry.level === "warn") {
      messages.push(entry.message);
    }
  }

  return messages;
}

// Starts serve like started(), resolving the initial pass with `words`.
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

test("a single-locale serve defines the locale table, with the served locale at its flat base", async () => {
  const { run, scenario: state } = await startedWith(
    localized,
    germanWords([
      ["products", "produkte"],
      ["teams", "teams"],
      ["members", "mitglieder"],
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
          ["members", "mitglieder"],
          ["products", "produkte"],
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
      germanWords([["products", "produkte"]]),
    );

    assert.equal(state.servers[0].options.define, undefined, String(localize));
    await run.stop();
  }
});

test("a later pass that changes the table warns once per distinct table; the dev server keeps its own", async () => {
  const { run, scenario: state } = await startedWith(
    localized,
    germanWords([
      ["products", "produkte"],
      ["members", "mitglieder"],
    ]),
  );
  const define = state.servers[0].options.define.loozoRouterLocales;

  // Unchanged words: no warning.
  await change(state);
  await until(() => state.passes.length === 2, "the unchanged pass");
  state.passes[1].resolve(
    germanWords([
      ["products", "produkte"],
      ["members", "mitglieder"],
    ]),
  );
  await settle();
  assert.deepEqual(warnings(state), []);

  // A changed word warns, naming it.
  await change(state, "src/locale/messages.de.xlf");
  await until(() => state.passes.length === 3, "the changed pass");
  state.passes[2].resolve(
    germanWords([
      ["products", "produkte"],
      ["members", "mitwirkende"],
    ]),
  );
  await until(() => warnings(state).length === 1, "the warning");
  assert.equal(
    warnings(state)[0],
    "Locale words changed (route.segment.members in de). Links from localeUrls keep the words ng serve started with until you restart it.",
  );

  // The same changed table again: no second warning. A failed pass warns nothing.
  await change(state);
  await until(() => state.passes.length === 4, "the repeated pass");
  state.passes[3].resolve(
    germanWords([
      ["products", "produkte"],
      ["members", "mitwirkende"],
    ]),
  );
  await change(state);
  await until(() => state.passes.length === 5, "the failed pass");
  state.passes[4].reject(new Error("broken"));
  await until(() => errors(state).length === 1, "the logged failure");
  await settle();
  assert.equal(warnings(state).length, 1);

  // Another distinct table warns again, naming up to three words.
  await change(state);
  await until(() => state.passes.length === 6, "the next pass");
  state.passes[5].resolve(
    germanWords([
      ["products", "waren"],
      ["members", "mitwirkende"],
      ["offers", "angebote"],
      ["teams", "mannschaften"],
      ["docs", "dokumente"],
    ]),
  );
  await until(() => warnings(state).length === 2, "the second warning");
  assert.equal(
    warnings(state)[1],
    "Locale words changed (route.segment.docs in de, route.segment.members in de, route.segment.offers in de and 2 more). Links from localeUrls keep the words ng serve started with until you restart it.",
  );

  // Back to the started table: nothing new.
  await change(state);
  await until(() => state.passes.length === 7, "the restoring pass");
  state.passes[6].resolve(
    germanWords([
      ["products", "produkte"],
      ["members", "mitglieder"],
    ]),
  );
  await settle();
  assert.equal(warnings(state).length, 2);
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
const scratch = resolve(packageDirectory, "../../.scratch/router-serve", String(process.pid));

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
        locales: { de: `../../.scratch/router-serve/${process.pid}/catalogs/messages.de.html` },
      },
    },
  });

  assert.deepEqual(watcherOf(state).roots, [resolve(packageDirectory, "src/routes"), catalog]);

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
          de: `../../.scratch/router-serve/${process.pid}/linked-catalogs/messages.de.xlf`,
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
  await touch(state, await asset());
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

test("stopping cancels an edit that's still settling", async () => {
  const { run, scenario: state } = await started();

  await touch(state);
  await run.stop();
  mock.timers.tick(settleDelay);
  await settle();
  assert.equal(state.passes.length, 1);
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
  state.passes[1].reject(new Error("Route diagnostics"));
  await settle();

  await change(state, path);
  await until(() => state.passes.length === 3, "the asset's pass after the failure");
  state.passes[2].reject(new Error("Route diagnostics"));
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
