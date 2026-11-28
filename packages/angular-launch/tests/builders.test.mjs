// Runs both builders through Architect on a scratch app whose @angular/build is a recording stub, so
// these tests see exactly what Launch hands Angular's builders without running a real Angular build.
// examples/angular-launch builds and serves through the real ones.
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, get } from "node:http";
import { test } from "node:test";
import { mkdir, readFile, readdir, rename, stat, symlink, writeFile } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";

const packageDirectory = resolve(import.meta.dirname, "..");
const scratch = resolve(packageDirectory, "../../examples/angular-launch/.scratch");
const fixture = resolve(scratch, `builders-${process.pid}`);
const require = createRequire(resolve(packageDirectory, "package.json"));
const { Architect } = require("@angular-devkit/architect");
const { WorkspaceNodeModulesArchitectHost } = require("@angular-devkit/architect/node");
const nativeRequire = createRequire(require.resolve("@angular-devkit/architect"));
const core = nativeRequire("@angular-devkit/core");
const { NodeJsSyncHost } = nativeRequire("@angular-devkit/core/node");

// What the stub builders received, in call order.
const calls = [];

globalThis.launchBuilderTestCalls = calls;

const rpc = `import { defineRoute } from "@loozo/angular-launch";
import parent from "../route";

export default defineRoute("todos", { parent }).remote(({ query }) => ({
  todos: {
  list: query({ handler: ({ context }) => [context.user] }),
  },
}));
`;
const context = `import { defineRoute } from "@loozo/angular-launch";

export default defineRoute("", {}).context(({ request }) => ({ request, user: "alice" }));
`;
const launch = {
  tsconfig: "tsconfig.json",
  scanDirectories: ["src/routes"],
  outDirectory: "generated",
};

async function put(path, text) {
  const file = resolve(fixture, path);

  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
}

async function read(path) {
  return readFile(resolve(fixture, path), "utf8");
}

async function snapshot() {
  const files = {};

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.name.includes(".generated.")) {
        const [bytes, info] = await Promise.all([
          readFile(path, "utf8"),
          stat(path, { bigint: true }),
        ]);

        // Keyed with / on every platform, as the tests look files up.
        files[relative(fixture, path).split(sep).join("/")] = {
          bytes,
          mtime: String(info.mtimeNs),
        };
      }
    }
  }

  await Promise.all([visit(resolve(fixture, "src")), visit(resolve(fixture, "generated"))]);

  return files;
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    const matched = await predicate();

    if (matched) {
      return;
    }

    await new Promise((done) => setTimeout(done, 100));
  }

  throw new Error(message);
}

async function setUp() {
  const stub = "node_modules/@angular/build";
  const schema = JSON.stringify({ type: "object" });

  await Promise.all([
    put("package.json", JSON.stringify({ name: "builders-consumer", private: true })),
    put(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ES2022",
          strict: true,
          skipLibCheck: true,
          experimentalDecorators: true,
          // Declares $localize for the translated configuration's copies.
          types: ["@angular/localize"],
        },
        include: ["src/**/*.ts", "generated/**/*.ts"],
      }),
    ),
    put(
      "angular.json",
      JSON.stringify({
        version: 1,
        projects: {
          app: {
            projectType: "application",
            root: "",
            sourceRoot: "src",
            i18n: { sourceLocale: "en", locales: { de: "src/locale/messages.de.xlf" } },
            architect: {
              build: {
                builder: "@loozo/angular-launch:application",
                options: {
                  ...launch,
                  browser: "src/main.ts",
                  server: "src/main.server.ts",
                  ssr: { entry: "src/server.ts", platform: "neutral" },
                  outputMode: "server",
                  tsConfig: "tsconfig.json",
                },
                configurations: {
                  check: { check: true },
                  watch: { watch: true },
                  translated: { translateSegments: true, polyfills: ["@angular/localize/init"] },
                  localized: {
                    translateSegments: true,
                    polyfills: ["@angular/localize/init"],
                    localize: true,
                    define: { appVersion: '"1"' },
                  },
                  untranslated: { localize: ["de"] },
                  reserved: { localize: true, define: { loozoRouterLocales: "{}" } },
                },
              },
              official: {
                builder: "@angular/build:application",
                options: { browser: "src/main.ts", tsConfig: "tsconfig.json" },
              },
              serve: {
                builder: "@loozo/angular-launch:serve",
                options: { buildTarget: "app:build" },
                configurations: {
                  check: { buildTarget: "app:build:check" },
                  official: { buildTarget: "app:official" },
                  translated: { buildTarget: "app:build:translated" },
                },
              },
            },
          },
        },
      }),
    ),
    put("src/routes/route.ts", context),
    put("src/helper.ts", "export const helper = 1;\n"),
    put(
      "src/routes/todos/page.ts",
      'import { Component } from "@angular/core";\n\n@Component({ selector: "todos-page", template: "todos" })\nexport default class Todos {}\n',
    ),
    put("src/routes/todos/route.ts", rpc),
    put(
      `${stub}/package.json`,
      JSON.stringify({ name: "@angular/build", type: "module", builders: "builders.json" }),
    ),
    put(
      `${stub}/builders.json`,
      JSON.stringify({
        builders: {
          application: { implementation: "./application.js", schema: "./schema.json" },
          // Only its schema is read: the serve builder runs the dev server from index.js.
          "dev-server": { implementation: "./index.js", schema: "./dev-server.schema.json" },
        },
      }),
    ),
    put(`${stub}/schema.json`, schema),
    put(
      `${stub}/dev-server.schema.json`,
      JSON.stringify({
        type: "object",
        properties: { stubDefault: { type: "string", default: "applied" } },
      }),
    ),
    put(
      `${stub}/application.js`,
      `import { existsSync } from "node:fs";
import { join } from "node:path";
import { createBuilder } from "@angular-devkit/architect";

export default createBuilder((options, context) => {
  const generated = existsSync(join(context.workspaceRoot, "generated/server.generated.ts"));

  globalThis.launchBuilderTestCalls.push({ builder: "application", options, generated });

  return { success: true };
});
`,
    ),
    put(
      `${stub}/index.js`,
      `// globalThis.launchBuilderTestDevServer picks how it ends: "serve" (the default) runs until its
// teardown closes it, "fail" throws and "end" returns after its first output.
export async function* executeDevServerBuilder(options, context, extensions) {
  const call = { builder: "dev-server", options, extensions, stopped: false, teardowns: 0 };
  const ending = globalThis.launchBuilderTestDevServer ?? "serve";
  let close;
  const closed = new Promise((done) => {
    close = done;
  });

  globalThis.launchBuilderTestCalls.push(call);
  // Angular's dev server closes in a teardown it adds to the context it runs in.
  context.addTeardown(() => {
    call.teardowns += 1;
    close();
  });

  try {
    yield { success: true, baseUrl: "http://127.0.0.1:1/" };

    if (ending === "fail") {
      throw new Error("dev server failed");
    }

    if (ending === "end") {
      return;
    }

    await closed;
  } finally {
    call.stopped = true;
  }
}
`,
    ),
  ]);

  // The stub's own imports resolve through the package's copies.
  for (const name of ["@angular-devkit/architect"]) {
    const link = resolve(fixture, "node_modules", name);

    await mkdir(dirname(link), { recursive: true });
    await symlink(resolve(packageDirectory, "node_modules", name), link, "dir");
  }
}

async function architect() {
  const host = core.workspaces.createWorkspaceHost(new NodeJsSyncHost());
  const { workspace } = await core.workspaces.readWorkspace(fixture, host);
  const registry = new core.json.schema.CoreSchemaRegistry();

  registry.addPostTransform(core.json.schema.transforms.addUndefinedDefaults);

  return new Architect(new WorkspaceNodeModulesArchitectHost(workspace, fixture), registry);
}

// Starts a target and collects its outputs and logs until stopped.
async function start(target, configuration) {
  const instance = await architect();
  const logger = new core.logging.Logger("builders");
  const logs = [];
  const outputs = [];
  let error;
  let completed = false;

  logger.subscribe((entry) => logs.push(entry));

  const run = await instance.scheduleTarget(
    { project: "app", target, configuration },
    {},
    { logger },
  );
  const subscription = run.output.subscribe({
    next: (output) => outputs.push(output),
    error: (failure) => {
      error = failure;
    },
    complete: () => {
      completed = true;
    },
  });

  return {
    logs,
    outputs,
    get error() {
      return error;
    },
    get completed() {
      return completed;
    },
    async stop() {
      subscription.unsubscribe();
      await run.stop();
    },
  };
}

// Runs a target to its result. Errors and logs come back instead of throwing.
async function run(target, configuration) {
  const started = await start(target, configuration);

  try {
    await waitFor(
      () => started.outputs.length > 0 || started.error !== undefined,
      `${target}:${configuration} never finished`,
    );
  } finally {
    await started.stop();
  }

  const errors = [];

  for (const entry of started.logs) {
    if (entry.level === "error") {
      errors.push(entry.message);
    }
  }

  return { output: started.outputs[0], error: started.error, errors: errors.join("\n") };
}

function callsOf(builder) {
  const result = [];

  for (const call of calls) {
    if (call.builder === builder) {
      result.push(call);
    }
  }

  return result;
}

await setUp();

await test("application generates, then runs Angular's builder with every other option unchanged", async () => {
  const { output, errors } = await run("build");

  assert.equal(output.success, true, errors);

  const [call] = callsOf("application");

  assert.equal(callsOf("application").length, 1);
  assert.equal(call.generated, true, "generated before Angular's builder ran");
  assert.deepEqual(call.options.ssr, { entry: "src/server.ts", platform: "neutral" });
  assert.equal(call.options.browser, "src/main.ts");
  assert.equal(call.options.outputMode, "server");
  // An omitted conditions reaches Angular as its default list, never as an explicit [].
  assert.deepEqual(call.options.conditions, ["module", "production"]);

  for (const key of [
    "tsconfig",
    "scanDirectories",
    "outDirectory",
    "tanstackQuery",
    "translateSegments",
    "check",
  ]) {
    assert.equal(Object.hasOwn(call.options, key), false, key);
  }

  const files = await snapshot();

  assert.match(files["src/routes/todos/route.generated.ts"].bytes, /\blist\b/);
  assert.ok(files["generated/server.generated.ts"]);
});

await test("check: true passes on fresh output and fails on stale output, writing nothing", async () => {
  const fresh = await snapshot();
  const passed = await run("build", "check");

  assert.equal(passed.output.success, true, passed.errors);
  assert.deepEqual(await snapshot(), fresh);
  assert.equal(callsOf("application").length, 2);

  await put(
    "src/routes/todos/route.ts",
    rpc.replace("list:", "ping: query({ handler: () => 1 }),\n  list:"),
  );

  const failed = await run("build", "check");

  assert.equal(failed.output.success, false);
  assert.notEqual(failed.errors, "");
  assert.deepEqual(await snapshot(), fresh);
  assert.equal(callsOf("application").length, 2, "Angular's builder doesn't run");
  await put("src/routes/todos/route.ts", rpc);
});

await test("application fails at once, writing nothing, while another run holds the output's lock", async () => {
  const { lockOutput } = await import("../dist/generation/output-lock.js");
  const { realpath } = await import("node:fs/promises");
  const before = await snapshot();
  const calledBefore = callsOf("application").length;
  const release = await lockOutput(
    resolve(await realpath(fixture), "generated"),
    "lock test holder",
  );

  try {
    const refused = await run("build");

    assert.equal(refused.output.success, false);
    assert.match(
      refused.errors,
      /already running for .*generated in this process: lock test holder, pid/,
    );
    assert.deepEqual(await snapshot(), before);
    assert.equal(callsOf("application").length, calledBefore, "Angular's builder doesn't run");
  } finally {
    await release();
  }
});

await test("application rejects watch: true before generating", async () => {
  const before = await snapshot();
  const { output, error } = await run("build", "watch");

  assert.equal(output, undefined);
  assert.match(String(error), /does not support watch: true/);
  assert.deepEqual(await snapshot(), before);
  assert.equal(callsOf("application").length, 2);
});

await test("serve rejects a build target that isn't Launch's or that resolves check: true", async () => {
  const before = await snapshot();
  const official = await run("serve", "official");

  assert.match(String(official.error), /must use @loozo\/angular-launch:application/);

  const check = await run("serve", "check");

  assert.match(String(check.error), /must not resolve check: true/);
  assert.deepEqual(await snapshot(), before);
  assert.equal(callsOf("dev-server").length, 0);
});

await test("serve reports a failed initial generation without starting the dev server", async () => {
  await put("src/routes/todos/route.ts", rpc.replace("({ query }) => ({", "build, ({"));

  const { output, errors } = await run("serve");

  assert.equal(output.success, false);
  assert.match(errors, /Route step remote takes 1…1 arguments/);
  assert.equal(callsOf("dev-server").length, 0);
  await put("src/routes/todos/route.ts", rpc);
});

await test("serve regenerates after route edits, not for an unrelated file outside the scan directory, and survives failures", async () => {
  const fsPromises = require("node:fs/promises");
  const readManifest = fsPromises.readFile;
  const manifest = resolve(packageDirectory, "dist/package.json");
  let passes = 0;

  // Counts each pass when the builder starts it: every pass reads Launch's manifest first.
  fsPromises.readFile = function (path, ...rest) {
    if (typeof path === "string" && resolve(path) === manifest) {
      passes += 1;
    }

    return readManifest.call(this, path, ...rest);
  };
  syncBuiltinESMExports();
  await put("src/routes/todos/route.ts", rpc);

  const served = await start("serve");

  try {
    await waitFor(
      () => served.outputs.some((output) => output.success),
      "dev server never started",
    );

    const starts = callsOf("dev-server").length;
    const call = callsOf("dev-server").at(-1);

    assert.equal(call.options.buildTarget, "app:build");
    assert.equal(call.options.poll, 1000);

    await put(
      "src/routes/todos/route.ts",
      rpc.replace("list:", "ping: query({ handler: () => 1 }),\n  list:"),
    );
    await waitFor(
      async () => /\bping\b/.test(await read("src/routes/todos/route.generated.ts")),
      "route edit didn't regenerate",
    );

    // A server helper outside the scan directory needs no pass: copies name its types
    // through their route's declaration, not as text.
    const before = passes;

    await put("src/helper.ts", "export const helper = 2;\n");
    await new Promise((done) => setTimeout(done, 1500));
    assert.equal(passes, before, "no pass for an edit outside the scan directory");

    // A failed pass is logged and the dev server keeps running; the next edit retries.
    const errors = served.logs.length;

    await put("src/routes/todos/route.ts", 'export default "not a route";\n');
    await waitFor(
      () => served.logs.slice(errors).some((entry) => entry.level === "error"),
      "failed regeneration wasn't logged",
    );
    await put(
      "src/routes/todos/route.ts",
      rpc.replace("list:", "pong: query({ handler: () => 1 }),\n  list:"),
    );
    await waitFor(
      async () => /\bpong\b/.test(await read("src/routes/todos/route.generated.ts")),
      "the edit after a failure didn't regenerate",
    );
    assert.equal(served.error, undefined);
    assert.equal(callsOf("dev-server").length, starts);
  } finally {
    fsPromises.readFile = readManifest;
    syncBuiltinESMExports();
    await served.stop();
    await put("src/helper.ts", "export const helper = 1;\n");
  }
});

await test("serve waits for another run's lock, then generates the edit it was refused for", async () => {
  const { lockOutput } = await import("../dist/generation/output-lock.js");
  const { realpath } = await import("node:fs/promises");
  const output = resolve(await realpath(fixture), "generated");

  await put("src/routes/todos/route.ts", rpc);

  const served = await start("serve");
  let release;

  try {
    await waitFor(
      () => served.outputs.some((output) => output.success),
      "dev server never started",
    );
    release = await lockOutput(output, "lock test holder");

    const warnings = served.logs.length;

    await put(
      "src/routes/todos/route.ts",
      rpc.replace("list:", "held: query({ handler: () => 1 }),\n  list:"),
    );
    await waitFor(
      () =>
        served.logs
          .slice(warnings)
          .some(
            (entry) =>
              entry.level === "warn" &&
              /lock test holder, pid \d+, .*Serve will generate once it's free\.$/.test(
                entry.message,
              ),
          ),
      "the refusal wasn't logged",
    );
    await new Promise((done) => setTimeout(done, 1200));
    assert.doesNotMatch(await read("src/routes/todos/route.generated.ts"), /\bheld\b/);

    await release();
    release = undefined;
    await waitFor(
      async () => /\bheld\b/.test(await read("src/routes/todos/route.generated.ts")),
      "the refused edit wasn't generated after the lock was released",
    );
    assert.equal(served.error, undefined);
  } finally {
    await release?.();
    await served.stop();
    await put("src/routes/todos/route.ts", rpc);
  }
});

await test("serve runs one pass for a burst of watcher events", async () => {
  const fsPromises = require("node:fs/promises");
  const readManifest = fsPromises.readFile;
  const manifest = resolve(packageDirectory, "dist/package.json");
  const todos = resolve(fixture, "src/routes/todos");
  const tasks = resolve(fixture, "src/routes/tasks");
  const page = await read("src/routes/todos/page.ts");
  let passes = 0;

  // Counts each pass when the builder starts it, as in the route edit test above.
  fsPromises.readFile = function (path, ...rest) {
    if (typeof path === "string" && resolve(path) === manifest) {
      passes += 1;
    }

    return readManifest.call(this, path, ...rest);
  };
  syncBuiltinESMExports();

  // A pass queued behind another starts as soon as it finishes, so a second without a new pass
  // means none is left to run.
  async function quiet() {
    let seen;

    do {
      seen = passes;
      await new Promise((done) => setTimeout(done, 1000));
    } while (passes !== seen);
  }

  async function passesFor(change, landed, description) {
    const before = passes;

    await change();
    await waitFor(landed, `${description} didn't regenerate`);
    await quiet();

    return passes - before;
  }

  try {
    await put("src/routes/todos/route.ts", rpc);

    const served = await start("serve");

    try {
      await waitFor(
        () => served.outputs.some((output) => output.success),
        "dev server never started",
      );
      await quiet();

      // Two files saved together reach the watcher as two events on different paths.
      const saved = await passesFor(
        () =>
          Promise.all([
            put(
              "src/routes/todos/route.ts",
              rpc.replace("list:", "ping: query({ handler: () => 1 }),\n  list:"),
            ),
            put("src/routes/todos/page.ts", page.replace('template: "todos"', 'template: "all"')),
          ]),
        async () => /\bping\b/.test(await read("src/routes/todos/route.generated.ts")),
        "saving two files",
      );

      assert.equal(saved, 1, "one pass for two files saved together");

      // A rename reports its re-adds at once and its unlinks about 100 ms later.
      const renamed = await passesFor(
        () => rename(todos, tasks),
        async () => (await read("src/routes/tasks/destination.generated.ts")).includes("tasks"),
        "renaming a route directory",
      );

      assert.equal(renamed, 1, "one pass for a directory rename");
    } finally {
      await served.stop();
    }
  } finally {
    fsPromises.readFile = readManifest;
    syncBuiltinESMExports();

    const moved = await stat(tasks).then(
      () => true,
      () => false,
    );

    if (moved) {
      await rename(tasks, todos);
    }

    await put("src/routes/todos/route.ts", rpc);
    await put("src/routes/todos/page.ts", page);
  }
});

// A case-only directory rename is a plain rename on Linux; on case-insensitive macOS and Windows
// volumes the old and new names are the same entry, so the watcher may see no unlink at all.
await test("serve republishes a case-only route directory rename under the new casing", async () => {
  const routes = resolve(fixture, "src/routes");
  // The route's own path and namespace stay "todos"; only the directory's old spelling must go.
  const stale = /todos\/|_todos_/;

  function current(files) {
    const server = files["generated/server.generated.ts"]?.bytes ?? "";

    if (!server.includes('"../src/routes/Todos/route.js"')) {
      return false;
    }

    for (const [file, { bytes }] of Object.entries(files)) {
      if (stale.test(file) || stale.test(bytes)) {
        return false;
      }
    }

    return true;
  }

  try {
    const served = await start("serve");

    try {
      await waitFor(
        () => served.outputs.some((output) => output.success),
        "dev server never started",
      );
      await rename(resolve(routes, "todos"), resolve(routes, "Todos"));
      await waitFor(
        async () => current(await snapshot()),
        "serve didn't republish the case-only rename",
      );
      assert.equal(served.error, undefined);
    } finally {
      await served.stop();
    }

    const files = await snapshot();
    const checked = await run("build", "check");

    assert.equal(checked.output.success, true, checked.errors);
    assert.match(files["src/routes/Todos/route.generated.ts"].bytes, /\blist\b/);
    assert.match(files["generated/server.generated.ts"].bytes, /"src\/routes\/Todos\/route\.ts"\]/);
    assert.deepEqual(await snapshot(), files);
  } finally {
    // readdir, not stat: a case-insensitive volume finds either spelling.
    const renamed = (await readdir(routes)).includes("Todos");

    if (renamed) {
      await rename(resolve(routes, "Todos"), resolve(routes, "todos"));
    }
  }
});

await test("serve runs no pass for its own outputs checked out with CRLF line endings", async () => {
  const fsPromises = require("node:fs/promises");
  const readManifest = fsPromises.readFile;
  const manifest = resolve(packageDirectory, "dist/package.json");
  const outputs = [
    "src/routes/todos/destination.generated.ts",
    "src/routes/todos/route.generated.ts",
  ];
  const originals = {};
  let passes = 0;

  // Counts each pass when the builder starts it, as in the route edit test above.
  fsPromises.readFile = function (path, ...rest) {
    if (typeof path === "string" && resolve(path) === manifest) {
      passes += 1;
    }

    return readManifest.call(this, path, ...rest);
  };
  syncBuiltinESMExports();

  // A pass queued behind another starts as soon as it finishes, so a second without a new pass
  // means none is left to run.
  async function quiet() {
    let seen;

    do {
      seen = passes;
      await new Promise((done) => setTimeout(done, 1000));
    } while (passes !== seen);
  }

  try {
    await put("src/routes/todos/route.ts", rpc);

    const served = await start("serve");

    try {
      await waitFor(
        () => served.outputs.some((output) => output.success),
        "dev server never started",
      );
      await quiet();

      const before = passes;

      // What a Git core.autocrlf checkout on Windows leaves of the committed outputs. Each is
      // renamed into place from outside the scan directory, so the watcher never reads it
      // truncated mid-write, which would rightly run a pass.
      for (const path of outputs) {
        const staged = resolve(fixture, "crlf-staged.ts");

        originals[path] = await read(path);
        await writeFile(staged, originals[path].replaceAll("\n", "\r\n"));
        await rename(staged, resolve(fixture, path));
      }

      await new Promise((done) => setTimeout(done, 1000));
      await quiet();
      assert.equal(passes, before, "no pass for marked outputs with CRLF line endings");
    } finally {
      await served.stop();
    }
  } finally {
    fsPromises.readFile = readManifest;
    syncBuiltinESMExports();

    for (const [path, bytes] of Object.entries(originals)) {
      await put(path, bytes);
    }
  }
});

await test("serve runs Angular's dev server with validated options and stops it on teardown", async () => {
  const served = await start("serve");
  let call;

  try {
    await waitFor(
      () => served.outputs.some((output) => output.success),
      "dev server never started",
    );
    call = callsOf("dev-server").at(-1);

    assert.equal(served.outputs[0].baseUrl, "http://127.0.0.1:1/", "the dev server's output");
    assert.equal(call.options.buildTarget, "app:build");
    assert.equal(call.options.poll, 1000);
    assert.equal(call.options.stubDefault, "applied", "defaulted by the dev server's schema");
    assert.equal(call.extensions.middleware.length, 1);
    assert.equal(call.stopped, false);
  } finally {
    await served.stop();
  }

  assert.equal(call.stopped, true, "stopping serve stopped the dev server");
  assert.equal(call.teardowns, 1, "the dev server's teardown ran once");
  assert.equal(served.error, undefined);
});

for (const [ending, outcome] of [
  ["fail", "fails"],
  ["end", "ends on its own"],
]) {
  await test(`serve runs the dev server's teardowns once when it ${outcome}`, async () => {
    globalThis.launchBuilderTestDevServer = ending;

    const served = await start("serve");

    try {
      await waitFor(
        () => served.error !== undefined || served.completed,
        `serve never settled after the dev server ${outcome}`,
      );

      const call = callsOf("dev-server").at(-1);

      assert.equal(call.stopped, true);
      assert.equal(call.teardowns, 1, "its teardown ran once, with no Stop from Architect");

      if (ending === "fail") {
        assert.match(String(served.error), /dev server failed/);
      } else {
        assert.equal(served.error, undefined);
        assert.equal(served.completed, true);
      }
    } finally {
      delete globalThis.launchBuilderTestDevServer;
      await served.stop();
    }

    assert.equal(callsOf("dev-server").at(-1).teardowns, 1, "stopping again ran it no more");
  });
}

await test("serve's dev-server middleware forwards /_rpc/ upgrades to the latest channel listener", async () => {
  const slot = Symbol.for("@loozo/angular-launch/upgrade-listener/v1");
  const saved = globalThis[slot];
  const served = await start("serve");
  const server = createServer();

  delete globalThis[slot];

  // A raw upgrade request; answers here are plain HTTP responses, never a 101.
  async function upgrade(path, headers = {}) {
    const { port } = server.address();
    const request = get({
      host: "127.0.0.1",
      port,
      path,
      headers: { connection: "Upgrade", upgrade: "websocket", ...headers },
    });
    const [response] = await once(request, "response");
    let body = "";

    response.setEncoding("utf8");

    for await (const chunk of response) {
      body += chunk;
    }

    return { status: response.statusCode, headers: response.headers, body };
  }

  async function fetchText(path) {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`);

    return response.text();
  }

  function answer(socket, body) {
    socket.end(
      `HTTP/1.1 200 OK\r\ncontent-length: ${body.length}\r\nconnection: close\r\n\r\n${body}`,
    );
  }

  function warnings(pattern) {
    let count = 0;

    for (const entry of served.logs) {
      if (entry.level === "warn" && pattern.test(entry.message)) {
        count += 1;
      }
    }

    return count;
  }

  try {
    await waitFor(
      () => served.outputs.some((output) => output.success),
      "dev server never started",
    );

    const [middleware] = callsOf("dev-server").at(-1).extensions.middleware;
    const hmr = [];

    server.on("request", (request, response) => {
      middleware(request, response, () => response.end("next"));
    });
    // Stands in for Vite's HMR listener, which answers only its own protocol.
    server.on("upgrade", (request, socket) => {
      if (request.headers["sec-websocket-protocol"] === "vite-hmr") {
        hmr.push(request.url);
        answer(socket, "hmr");
      }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    // Every request passes through; the first attaches the one forwarding listener.
    assert.equal(await fetchText("/"), "next");
    assert.equal(await fetchText("/todos"), "next");
    assert.equal(server.listenerCount("upgrade"), 2);

    // Without a listener, a channel upgrade is refused at once and warned about once.
    const refused = await upgrade("/_rpc/todos/watch");

    assert.equal(refused.status, 503);
    assert.equal(refused.headers.connection, "close");
    assert.equal(refused.headers["content-type"], "text/plain");
    assert.match(refused.body, /Channels aren't available/);
    await waitFor(() => warnings(/createUpgradeHandler/) === 1, "no warning was logged");
    assert.equal((await upgrade("/_rpc/todos/watch")).status, 503);
    assert.equal(warnings(/createUpgradeHandler/), 1, "warned once");

    // The latest listener created serves channel upgrades; every other upgrade is left alone.
    const reached = [];

    globalThis[slot] = (request, socket) => {
      reached.push(`first ${request.url}`);
      answer(socket, "first");
    };
    globalThis[slot] = (request, socket) => {
      reached.push(`latest ${request.url}`);
      answer(socket, "latest");
    };

    assert.equal((await upgrade("/_rpc/todos/watch?input=1")).body, "latest");
    assert.equal((await upgrade("/", { "sec-websocket-protocol": "vite-hmr" })).body, "hmr");
    assert.deepEqual(reached, ["latest /_rpc/todos/watch?input=1"]);
    assert.deepEqual(hmr, ["/"]);

    // A request that doesn't expose its server still passes through, with one warning.
    let passed = 0;

    middleware({ socket: {} }, {}, () => {
      passed += 1;
    });
    middleware({ socket: {} }, {}, () => {
      passed += 1;
    });
    assert.equal(passed, 2);
    await waitFor(
      () => warnings(/can't forward channel upgrades/) === 1,
      "no warning about the missing server",
    );
  } finally {
    server.close();
    globalThis[slot] = saved;
    await served.stop();
  }
});

const catalog = (target) => `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="de" datatype="plaintext" original="ng2.template">
    <body>
      <trans-unit id="route.segment.todos" datatype="html"><source>todos</source><target>${target}</target></trans-unit>
    </body>
  </file>
</xliff>
`;
const providerImport = `import { provideRedirectTranslation } from "../generated/redirects.generated";
export const providers = [provideRedirectTranslation()];
`;

await test("translateSegments reaches generation with the project's localization, and never Angular's builder", async () => {
  await put("src/locale/messages.de.xlf", catalog("aufgaben"));
  await put("src/config.ts", providerImport);

  try {
    const { output, errors } = await run("build", "translated");

    assert.equal(output.success, true, errors);

    const call = callsOf("application").at(-1);

    assert.equal(Object.hasOwn(call.options, "translateSegments"), false);
    assert.deepEqual(call.options.polyfills, ["@angular/localize/init"]);

    const files = await snapshot();

    assert.match(files["generated/redirects.generated.ts"].bytes, /words: \["todos"\]/);
    assert.match(files["generated/server.generated.ts"].bytes, /_source-text/);

    // The project's catalog is validated: a translation that isn't one segment fails the build
    // before Angular's builder runs.
    const builds = callsOf("application").length;

    await put("src/locale/messages.de.xlf", catalog("a/b"));

    const failed = await run("build", "translated");

    assert.equal(failed.output.success, false);
    assert.match(failed.errors, /Locale de: route\.segment\.todos translates to "a\/b"/);
    assert.equal(callsOf("application").length, builds);
  } finally {
    await put("src/locale/messages.de.xlf", catalog("aufgaben"));
  }
});

await test("a localized build gets the router's locale table in Angular's define, merged with its own", async () => {
  await put("src/locale/messages.de.xlf", catalog("aufgaben"));

  const { output, errors } = await run("build", "localized");

  assert.equal(output.success, true, errors);

  const { define } = callsOf("application").at(-1).options;

  assert.equal(define.appVersion, '"1"');
  assert.deepEqual(JSON.parse(define.loozoRouterLocales), {
    locales: [
      { code: "en", baseHref: "/en/", words: [] },
      { code: "de", baseHref: "/de/", words: [["todos", "aufgaben"]] },
    ],
  });

  // An unlocalized build gets none.
  const plain = await run("build", "translated");

  assert.equal(plain.output.success, true, plain.errors);
  assert.equal(
    Object.hasOwn(callsOf("application").at(-1).options.define ?? {}, "loozoRouterLocales"),
    false,
  );

  // Without translateSegments, a localized build still gets each locale's base, with no words.
  // Its generation removes redirects.generated.ts, so nothing may import it meanwhile.
  await put("src/config.ts", "export const providers = [];\n");

  try {
    const untranslated = await run("build", "untranslated");

    assert.equal(untranslated.output.success, true, untranslated.errors);
    assert.deepEqual(
      JSON.parse(callsOf("application").at(-1).options.define.loozoRouterLocales).locales,
      [
        { code: "en", baseHref: "/en/", words: [] },
        { code: "de", baseHref: "/de/", words: [] },
      ],
    );
  } finally {
    await put("src/config.ts", providerImport);
  }
});

await test("application rejects define.loozoRouterLocales before generating", async () => {
  const before = await snapshot();
  const builds = callsOf("application").length;
  const { output, error } = await run("build", "reserved");

  assert.equal(output, undefined);
  assert.match(
    String(error),
    /define\.loozoRouterLocales is reserved by @loozo\/angular-router: remove it from the build options/,
  );
  assert.deepEqual(await snapshot(), before);
  assert.equal(callsOf("application").length, builds);
});

await test("serve watches the catalogs with translateSegments: a bad edit is logged and serving goes on", async () => {
  const served = await start("serve", "translated");

  try {
    await waitFor(
      () => served.outputs.some((output) => output.success),
      "dev server never started",
    );

    const errors = served.logs.length;

    await put("src/locale/messages.de.xlf", catalog("a/b"));
    await waitFor(
      () =>
        served.logs
          .slice(errors)
          .some((entry) => entry.level === "error" && /Locale de: /.test(entry.message)),
      "a bad catalog edit wasn't validated",
    );
    assert.equal(served.error, undefined);
    assert.equal(served.completed, false);
  } finally {
    await served.stop();
    await put("src/locale/messages.de.xlf", catalog("aufgaben"));
  }

  // Back off: without the provider import, the table is removed as stale.
  await put("src/config.ts", "export const providers = [];\n");

  const { output, errors } = await run("build");

  assert.equal(output.success, true, errors);
  assert.equal((await snapshot())["generated/redirects.generated.ts"], undefined);
});
