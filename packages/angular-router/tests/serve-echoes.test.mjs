// Drives the serve builder with the real watcher and real generation on a copy of the router
// example, with a fake dev server in Angular's place: the watcher events for the filesystem
// definitions a pass wrote run no further pass, while an edit right after such a write still does
// (SPEC §13 item 5). serve.test.mjs proves the same rules deterministically with fakes; this file
// proves them against chokidar's real timing, including its 50 ms change throttle.
import assert from "node:assert/strict";
import { readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { cp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const packageDirectory = resolve(import.meta.dirname, "..");
const repository = resolve(packageDirectory, "../..");
const scratch = resolve(repository, ".scratch/router-serve-echoes", String(process.pid));
const fixture = join(scratch, "consumer");
const routes = join(fixture, "src/routes");
// No pass for this long after the last one finished means serve went quiet: a pass's own events
// arrive within milliseconds of it and settle 150 ms later.
const quietMs = 2000;
const deadlineMs = 120_000;

// The timing cases assume chokidar's native watcher, the backend serve configures; chokidar reads
// these when serve creates its watcher, and either would switch it to polling for this process.
delete process.env.CHOKIDAR_USEPOLLING;
delete process.env.CHOKIDAR_INTERVAL;

// Every pass serve starts, in order: its result's written filesystem definitions, whether it
// finished, and the watcher events delivered before it started and before it finished. The
// generation module is rebound, in its own module, to one that records each call; serve shares
// that module, so it's loaded only after the hook is in place.
const generationModule = pathToFileURL(
  resolve(packageDirectory, "node/src/generation/generate.js"),
).href;
const passes = [];
// Every watcher event, as the serve builder's own watcher emits it, before its listener runs.
const events = [];
// Called with each event as it's recorded.
const taps = [];
let lastFinishedAt = Date.now();

globalThis.recordServePass = (generation) => {
  const pass = { authored: [], finished: false, startEvent: events.length };

  passes.push(pass);
  generation
    .then(
      (result) => {
        // Before this change generate() returned the words alone.
        for (const file of result?.authored?.keys() ?? []) {
          pass.authored.push(resolve(file));
        }
      },
      () => {
        pass.failed = true;
      },
    )
    .finally(() => {
      pass.finished = true;
      pass.finishEvent = events.length;
      lastFinishedAt = Date.now();
    });

  return generation;
};
registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);

    if (url !== generationModule) {
      return loaded;
    }

    let source = loaded.source;

    if (typeof source !== "string") {
      source = new TextDecoder().decode(source);
    }

    return {
      ...loaded,
      source: `${source}
const recordedGenerate = generate;
generate = (...args) => globalThis.recordServePass(recordedGenerate(...args));
`,
    };
  },
});
await import(generationModule);

// The watcher serve creates is chokidar's FSWatcher from this same module instance.
const { FSWatcher } = await import(
  pathToFileURL(resolve(packageDirectory, "node_modules/chokidar/index.js")).href
);
const emit = FSWatcher.prototype.emit;

FSWatcher.prototype.emit = function (name, ...args) {
  if (name === "all") {
    const [event, path] = args;

    events.push({ event, path });

    for (const tap of taps) {
      tap(event, path, events.length - 1);
    }
  }

  return emit.call(this, name, ...args);
};

const require = createRequire(resolve(packageDirectory, "package.json"));
const { Architect, createBuilder } = require("@angular-devkit/architect");
const { TestingArchitectHost } = require("@angular-devkit/architect/testing");
const core = createRequire(require.resolve("@angular-devkit/architect"))("@angular-devkit/core");
const { Observable } = require("rxjs");
const { default: serveBuilder } = await import("../node/src/builders/serve.js");

const logs = [];
let run;
let serverStarted = false;

function timeline() {
  const lines = [];

  for (const [index, pass] of passes.entries()) {
    lines.push(
      `pass ${index}: events ${pass.startEvent}..${pass.finishEvent ?? "running"}, wrote ${pass.authored.length}${pass.failed ? ", failed" : ""}`,
    );
  }

  for (const [index, { event, path }] of events.entries()) {
    lines.push(`event ${index}: ${event} ${path}`);
  }

  return lines.join("\n");
}

async function until(predicate, description) {
  const deadline = Date.now() + deadlineMs;

  while (!(await predicate())) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${description}\n${timeline()}`);
    }

    await delay(20);
  }
}

// Every started pass finished, and for quietMs none finished and nothing happened `since` (a
// wall-clock time the test acted at, whose events serve may still be settling).
async function quiet({ since = 0 } = {}) {
  await until(() => {
    for (const pass of passes) {
      if (!pass.finished) {
        return false;
      }
    }

    return Date.now() - Math.max(lastFinishedAt, since) >= quietMs;
  }, "serve to go quiet");
}

async function exists(path) {
  try {
    await readFile(path);

    return true;
  } catch {
    return false;
  }
}

// A rename that retries while Windows reports the directory busy (the watcher still has it open).
async function renameSettled(from, to) {
  const deadline = Date.now() + 10_000;

  for (;;) {
    try {
      await rename(from, to);

      return;
    } catch (error) {
      if (!["EPERM", "EBUSY", "EACCES"].includes(error?.code) || Date.now() >= deadline) {
        throw error;
      }

      await delay(200);
    }
  }
}

const page = (name) =>
  `import { Component } from "@angular/core";\n\n@Component({ template: "<p>${name}</p>" })\nexport default class Page {}\n`;

// Runs `act`, waits for `done` and for serve to go quiet, and returns the passes it started.
async function passesFor(act, done, description) {
  const first = passes.length;

  await act();
  await until(done, description);
  await quiet();

  return passes.slice(first);
}

function errors() {
  const messages = [];

  for (const line of logs) {
    if (line.startsWith("error: ")) {
      messages.push(line);
    }
  }

  return messages;
}

// The events from a pass's start until the next pass starts (or now) that serve doesn't filter
// and that aren't `echo`, the event index the test acts on: each is a signal that could explain a
// next pass. Serve filters an owned file's add or change (its marker), never an unlink. With
// `allowPath`, `path`'s own later events count as echoes too.
function otherSignals(pass, next, path, echo, { allowPath = false } = {}) {
  const others = [];
  const end = next?.startEvent ?? events.length;

  for (let index = pass.startEvent; index < end; index++) {
    const { event, path: eventPath } = events[index];
    const owned = basename(eventPath).endsWith(".generated.ts") && event !== "unlink";

    if (index === echo || owned || (allowPath && eventPath === path && index > echo)) {
      continue;
    }

    others.push(`${index}: ${event} ${eventPath}`);
  }

  return others;
}

// Acts once on the first change event for `path` after pass `writing` finished: `act` runs
// `delay` ms later (synchronously when 0). The returned tap is waited on with a deadline, and
// removed, its timer cancelled, by `remove()`.
function tapRewrite(path, writing, act, delayMs) {
  const tap = { done: false };
  let timer;

  function run() {
    try {
      act();
      tap.actedAt = performance.now();
      tap.actedWall = Date.now();
      tap.done = true;
    } catch (error) {
      tap.error = error;
    }
  }

  const listener = (event, eventPath, index) => {
    if (eventPath !== path || event !== "change" || tap.index !== undefined) {
      return;
    }

    if (!passes[writing]?.finished) {
      return;
    }

    tap.index = index;
    tap.changeAt = performance.now();

    if (delayMs === 0) {
      run();
    } else {
      timer = setTimeout(run, delayMs);
    }
  };

  taps.push(listener);
  tap.wait = () =>
    until(() => {
      if (tap.error) {
        throw tap.error;
      }

      return tap.done;
    }, `the first change event for ${path} after the pass that rewrote it`);
  tap.remove = () => {
    clearTimeout(timer);
    taps.splice(taps.indexOf(listener), 1);
  };

  return tap;
}

before(async () => {
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  await cp(join(repository, "examples/angular-router"), fixture, {
    recursive: true,
    filter: (path) => !/(?:^|[\\/])(?:node_modules|dist|\.angular)(?:[\\/]|$)/.test(path),
  });

  const metadata = JSON.parse(await readFile(join(fixture, "package.json"), "utf8"));

  for (const name of new Set([
    ...Object.keys(metadata.dependencies ?? {}),
    ...Object.keys(metadata.devDependencies ?? {}),
    "@loozo/angular-router",
  ])) {
    const link = join(fixture, "node_modules", name);
    let target = join(packageDirectory, "node_modules", name);

    if (name === "@loozo/angular-router") {
      target = packageDirectory;
    }

    await mkdir(dirname(link), { recursive: true });
    await symlink(target, link, "dir");
  }

  // Pages without a route.ts: the initial pass seeds one for each.
  for (const directory of ["watch-probe", "a", "a/only", "b", "e", "h", "h/p", "h/q"]) {
    await mkdir(join(routes, directory), { recursive: true });
    await writeFile(join(routes, directory, "page.ts"), page(directory.replace("/", "-")));
  }

  const angular = JSON.parse(await readFile(join(fixture, "angular.json"), "utf8"));
  const { tsconfig, scanDirectories, outDirectory } =
    angular.projects.proof.architect.build.options;
  const host = new TestingArchitectHost(fixture, fixture);

  host.addBuilder("@loozo/angular-router:serve", serveBuilder);
  host.addBuilder(
    "@loozo/angular-router:application",
    createBuilder(() => ({ success: true })),
  );
  host.addBuilder(
    "@angular/build:dev-server",
    createBuilder(
      () =>
        new Observable(() => {
          serverStarted = true;
        }),
    ),
  );
  host.addTarget({ project: "proof", target: "build" }, "@loozo/angular-router:application", {
    tsconfig,
    scanDirectories,
    outDirectory,
  });
  host.addTarget({ project: "proof", target: "serve" }, "@loozo/angular-router:serve", {
    buildTarget: "proof:build",
    port: 0,
  });

  const architect = new Architect(host, new core.json.schema.CoreSchemaRegistry());
  const logger = new core.logging.Logger("serve-echoes");

  logger.subscribe((entry) => logs.push(`${entry.level}: ${entry.message}`));
  run = await architect.scheduleTarget({ project: "proof", target: "serve" }, {}, { logger });
  run.output.subscribe({ error: (error) => logs.push(`error: ${error}`) });
});

after(async () => {
  FSWatcher.prototype.emit = emit;
  taps.length = 0;
  await run?.stop();
  await rm(scratch, { recursive: true, force: true });
});

test("startup that seeds filesystem definitions runs one pass", async () => {
  await until(() => serverStarted, "the dev server");
  await quiet();
  assert.equal(
    passes.length,
    1,
    `Expected 1 pass, saw ${passes.length}: the seeds' events ran no pass\n${timeline()}`,
  );
  assert.ok(passes[0].authored.length >= 8, "The initial pass seeded every page's route.ts");
  assert.equal(await exists(join(routes, "watch-probe/route.ts")), true);
  assert.deepEqual(errors(), []);
});

test("renaming a route directory runs one pass", async () => {
  const route = join(routes, "watch-renamed/route.ts");
  const ran = await passesFor(
    () => renameSettled(join(routes, "watch-probe"), join(routes, "watch-renamed")),
    async () =>
      (await exists(route)) && (await readFile(route, "utf8")).includes('"watch-renamed"'),
    "the synchronized declaration",
  );

  assert.equal(
    ran.length,
    1,
    `Expected 1 pass, saw ${ran.length}: the rewrite's event ran no pass\n${timeline()}`,
  );
  assert.deepEqual(ran[0].authored, [resolve(route)]);
  assert.deepEqual(errors(), []);
});

test("adding a page runs one pass", async () => {
  const route = join(routes, "seeded/route.ts");
  const ran = await passesFor(
    async () => {
      await mkdir(join(routes, "seeded"));
      await writeFile(join(routes, "seeded/page.ts"), page("seeded"));
    },
    () => exists(route),
    "the seeded declaration",
  );

  assert.equal(
    ran.length,
    1,
    `Expected 1 pass, saw ${ran.length}: the seed's event ran no pass\n${timeline()}`,
  );
  assert.deepEqual(errors(), []);
});

test("moving a route under another parent at another depth runs one pass", async () => {
  const route = join(routes, "e/x/p/route.ts");
  const ran = await passesFor(
    async () => {
      await mkdir(join(routes, "e/x"));
      await renameSettled(join(routes, "h/p"), join(routes, "e/x/p"));
    },
    async () => (await exists(route)) && (await readFile(route, "utf8")).includes('"x/p"'),
    "the moved declaration",
  );
  const moved = await readFile(route, "utf8");

  assert.equal(
    ran.length,
    1,
    `Expected 1 pass, saw ${ran.length}: the rewrite's event ran no pass\n${timeline()}`,
  );
  assert.match(moved, /import parent from "\.\.\/\.\.\/route\.js";/);
  assert.match(moved, /defineRoute\("x\/p", \{ parent \}\)/);
  assert.match(await readFile(join(routes, "h/children.generated.ts"), "utf8"), /path: "q"/);
  assert.doesNotMatch(await readFile(join(routes, "h/children.generated.ts"), "utf8"), /path: "p"/);
  assert.match(await readFile(join(routes, "e/children.generated.ts"), "utf8"), /path: "x\/p"/);
  assert.deepEqual(errors(), []);
});

// The known limit: removing the old parent's children table is a change of its own.
test("moving its parent's last child under another parent runs two passes", async () => {
  const table = join(routes, "a/children.generated.ts");

  assert.equal(await exists(table), true);

  const ran = await passesFor(
    () => renameSettled(join(routes, "a/only"), join(routes, "b/only")),
    async () => !(await exists(table)) && (await exists(join(routes, "b/children.generated.ts"))),
    "the stale table's removal",
  );

  assert.equal(
    ran.length,
    2,
    `Expected 2 passes, saw ${ran.length}: the stale table's unlink ran one more pass\n${timeline()}`,
  );
  assert.deepEqual(errors(), []);
});

// Whether a timing case ran in the order it's for. A busy machine can run the tap late or deliver
// another signal; the case then checks only its outcome and says why in a diagnostic, since serve
// handles either order. serve.test.mjs proves the dropped-event order deterministically.
function exercised(t, unmet) {
  if (unmet.length === 0) {
    return true;
  }

  t.diagnostic(`Not exercised in its intended order: ${unmet.join("; ")}`);

  return false;
}

// chokidar emits no second change event for a file within 50 ms of its first, so the edit reaches
// serve only through the check at the end of the settle delay.
test("an edit right after a pass rewrote the file regenerates", async (t) => {
  const route = join(routes, "watch-edited/route.ts");
  const first = passes.length;
  const tap = tapRewrite(
    route,
    first,
    () => {
      const synchronized = readFileSync(route, "utf8");

      writeFileSync(route, synchronized.replace(/\);\s*$/, ').title("Edited");\n'));
    },
    15,
  );

  try {
    await renameSettled(join(routes, "watch-renamed"), join(routes, "watch-edited"));
    await tap.wait();
    await quiet({ since: tap.actedWall });
  } finally {
    tap.remove();
  }

  const ran = passes.slice(first);
  const unmet = [];
  const landed = tap.actedAt - tap.changeAt;
  const others = otherSignals(ran[0], ran[1], route, tap.index);

  assert.deepEqual(ran[0].authored, [resolve(route)], `The rename's pass wrote it\n${timeline()}`);

  if (landed >= 50) {
    unmet.push(`the edit landed ${Math.round(landed)} ms after the change event`);
  }

  if (others.length > 0) {
    unmet.push(`other signals could explain a pass: ${others.join(", ")}`);
  }

  if (exercised(t, unmet)) {
    assert.equal(
      ran.length,
      2,
      `Expected 2 passes, saw ${ran.length}: the rename's pass, then the edit's\n${timeline()}`,
    );
  }

  assert.match(
    await readFile(join(routes, "watch-edited/route.generated.ts"), "utf8"),
    /Edited/,
    "The edit regenerated",
  );
  assert.deepEqual(errors(), []);
});

test("a rewritten file swapped for a link to the same bytes runs a pass that reports it", async (t) => {
  const route = join(routes, "seeded/route.ts");
  const outside = join(scratch, "linked-route.ts");
  const first = passes.length;
  const tap = tapRewrite(
    route,
    first,
    () => {
      writeFileSync(outside, readFileSync(route));
      unlinkSync(route);
      symlinkSync(outside, route);
    },
    0,
  );

  try {
    // A path literal the pass synchronizes back to "seeded".
    const declaration = await readFile(route, "utf8");

    await writeFile(route, declaration.replace('"seeded"', '"wrong"'));
    await tap.wait();
    await quiet({ since: tap.actedWall });
  } finally {
    tap.remove();
  }

  const ran = passes.slice(first);
  const unmet = [];
  const landed = tap.actedAt - tap.changeAt;
  const others = otherSignals(ran[0], ran[1], route, tap.index, { allowPath: true });

  assert.deepEqual(
    ran[0].authored,
    [resolve(route)],
    `The synchronizing pass wrote it\n${timeline()}`,
  );

  if (landed >= 150) {
    unmet.push(`the swap landed ${Math.round(landed)} ms after the change event`);
  }

  if (others.length > 0) {
    unmet.push(`other signals could explain a pass: ${others.join(", ")}`);
  }

  if (exercised(t, unmet)) {
    assert.equal(
      ran.length,
      2,
      `Expected 2 passes, saw ${ran.length}: the synchronizing pass, then the link's\n${timeline()}`,
    );
    assert.equal(ran[1].failed, true);
  }

  assert.ok(
    errors().some((line) => line.includes("Unsafe source/output symbolic link")),
    "The link's pass reported it",
  );
});
