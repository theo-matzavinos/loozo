// Runs both builders through Architect on a scratch app whose @angular/build is a recording stub, so
// these tests see exactly what Launch hands Angular's builders without running a real Angular build.
// examples/angular-launch builds and serves through the real ones.
import assert from "node:assert/strict";
import { test } from "node:test";
import chokidar from "chokidar";
import { mkdir, readFile, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { dirname, relative, resolve } from "node:path";

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

const rpc = `import { defineRpc, query } from "@loozo/angular-launch/server";

export default defineRpc("todos", {
  list: query({ handler: ({ context }) => [context.user] }),
});
`;
const context = `import { defineContext } from "@loozo/angular-launch/server";

export default defineContext((request: Request) => ({ request, user: "alice" }));
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

        files[relative(fixture, path)] = { bytes, mtime: String(info.mtimeNs) };
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

function appId(server) {
  return /appBinding = \{ id: "([0-9a-f]+)"/.exec(server)[1];
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
          types: [],
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
                configurations: { check: { check: true }, watch: { watch: true } },
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
                },
              },
            },
          },
        },
      }),
    ),
    put("src/context.ts", context),
    put(
      "src/routes/route.ts",
      'import { defineRoute } from "@loozo/angular-router";\n\nexport default defineRoute("", {});\n',
    ),
    put(
      "src/routes/todos/route.ts",
      'import { defineRoute } from "@loozo/angular-router";\nimport parent from "../route";\n\nexport default defineRoute("todos", { parent });\n',
    ),
    put(
      "src/routes/todos/page.ts",
      'import { Component } from "@angular/core";\n\n@Component({ selector: "todos-page", template: "todos" })\nexport default class Todos {}\n',
    ),
    put("src/routes/todos/rpc.ts", rpc),
    put(
      `${stub}/package.json`,
      JSON.stringify({ name: "@angular/build", type: "module", builders: "builders.json" }),
    ),
    put(
      `${stub}/builders.json`,
      JSON.stringify({
        builders: {
          application: { implementation: "./application.js", schema: "./schema.json" },
          "dev-server": { implementation: "./dev-server.js", schema: "./schema.json" },
        },
      }),
    ),
    put(`${stub}/schema.json`, schema),
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
      `${stub}/dev-server.js`,
      `import { Observable } from "rxjs";
import { createBuilder } from "@angular-devkit/architect";

export default createBuilder(
  (options) =>
    new Observable((subscriber) => {
      globalThis.launchBuilderTestCalls.push({ builder: "dev-server", options });
      subscriber.next({ success: true, baseUrl: "http://127.0.0.1:1/" });
    }),
);
`,
    ),
  ]);

  // The stub's own imports resolve through the package's copies.
  for (const name of ["@angular-devkit/architect", "rxjs"]) {
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
  });

  return {
    logs,
    outputs,
    get error() {
      return error;
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

  for (const key of ["tsconfig", "scanDirectories", "outDirectory", "tanstackQuery", "check"]) {
    assert.equal(Object.hasOwn(call.options, key), false, key);
  }

  const files = await snapshot();

  assert.match(files["src/routes/todos/rpc.generated.ts"].bytes, /\blist\b/);
  assert.ok(files["generated/server.generated.ts"]);
});

await test("check: true passes on fresh output and fails on stale output, writing nothing", async () => {
  const fresh = await snapshot();
  const passed = await run("build", "check");

  assert.equal(passed.output.success, true, passed.errors);
  assert.deepEqual(await snapshot(), fresh);
  assert.equal(callsOf("application").length, 2);

  await put(
    "src/routes/todos/rpc.ts",
    rpc.replace("list:", "ping: query({ handler: () => 1 }),\n  list:"),
  );

  const failed = await run("build", "check");

  assert.equal(failed.output.success, false);
  assert.notEqual(failed.errors, "");
  assert.deepEqual(await snapshot(), fresh);
  assert.equal(callsOf("application").length, 2, "Angular's builder doesn't run");
  await put("src/routes/todos/rpc.ts", rpc);
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
  await rm(resolve(fixture, "src/context.ts"));

  const { output, errors } = await run("serve");

  assert.equal(output.success, false);
  assert.match(errors, /exactly one default defineContext/);
  assert.equal(callsOf("dev-server").length, 0);
  await put("src/context.ts", context);
});

await test("serve regenerates for a context edit made after the initial generation read it", async () => {
  const contextFile = resolve(fixture, "src/context.ts");
  const before = appId(await read("generated/server.generated.ts"));
  const fs = require("node:fs");
  const readFileSync = fs.readFileSync;
  let edited = false;

  // TypeScript reads sources through fs.readFileSync in this process. The first read returns the
  // original text to the pass and saves an edit straight after, before the pass can watch the file.
  fs.readFileSync = function (path, ...rest) {
    const bytes = readFileSync.call(this, path, ...rest);

    if (!edited && typeof path === "string" && resolve(path) === contextFile) {
      edited = true;
      fs.writeFileSync(contextFile, context.replace('"alice"', '"bob"'));
    }

    return bytes;
  };

  try {
    const served = await start("serve");

    try {
      await waitFor(
        () => served.outputs.some((output) => output.success),
        "dev server never started",
      );
      assert.ok(edited, "the initial generation read the context file");
      await waitFor(
        async () => appId(await read("generated/server.generated.ts")) !== before,
        "the edit during the initial generation didn't regenerate",
      );
    } finally {
      fs.readFileSync = readFileSync;
      await served.stop();
    }

    // The output matches the edited context: nothing is left stale.
    const checked = await run("build", "check");

    assert.equal(checked.output.success, true, checked.errors);
  } finally {
    fs.readFileSync = readFileSync;
    await put("src/context.ts", context);
  }
});

await test("serve reads a newly followed context only once its watch is live", async () => {
  const fsPromises = require("node:fs/promises");
  const readManifest = fsPromises.readFile;
  const manifest = resolve(packageDirectory, "dist/package.json");
  const contextFile = resolve(fixture, "src/context.ts");
  // Always called with an explicit receiver below.
  // oxlint-disable-next-line unbound-method
  const add = chokidar.FSWatcher.prototype.add;
  let release;
  const installed = new Promise((done) => {
    release = done;
  });
  let passes = 0;
  let passesWhenHeld;

  // Generation reads the built package's manifest before its first await, so this counts each
  // pass synchronously when the builder starts it, not when the pass gets around to reading
  // sources.
  fsPromises.readFile = function (path, ...rest) {
    if (typeof path === "string" && resolve(path) === manifest) {
      passes += 1;
    }

    return readManifest.call(this, path, ...rest);
  };
  syncBuiltinESMExports();

  // Holds the context file's watch installation until released, as a slow filesystem would. The
  // builder's own chokidar resolves to this same module.
  chokidar.FSWatcher.prototype.add = function (paths, ...rest) {
    const watchesContext = [paths].flat().some((path) => resolve(path) === contextFile);

    if (!watchesContext) {
      return add.call(this, paths, ...rest);
    }

    passesWhenHeld ??= passes;
    void installed.then(() => {
      if (!this.closed) {
        add.call(this, paths, ...rest);
      }
    });

    return this;
  };

  try {
    const served = await start("serve");

    try {
      await waitFor(
        () => served.outputs.some((output) => output.success),
        "dev server never started",
      );
      assert.equal(passesWhenHeld, 1, "the initial generation asked to watch the context file");

      // Any pass started before the dev server, while the watch was pending, has been counted by
      // now; with nothing edited since, nothing else can start one before the release below.
      assert.equal(passes, passesWhenHeld, "no pass started while the context watch was pending");

      // Saved while the watch is pending, so only the pass its readiness runs can see it.
      const held = appId(await read("generated/server.generated.ts"));

      await put("src/context.ts", context.replace('"alice"', '"bob"'));
      release();
      await waitFor(
        async () => appId(await read("generated/server.generated.ts")) !== held,
        "the context edit saved before its watch was live didn't regenerate",
      );
      assert.equal(passes, passesWhenHeld + 1, "exactly one pass ran once the watch was live");
    } finally {
      fsPromises.readFile = readManifest;
      syncBuiltinESMExports();
      chokidar.FSWatcher.prototype.add = add;
      await served.stop();
    }

    // The output matches the edited context: nothing is left stale.
    const checked = await run("build", "check");

    assert.equal(checked.output.success, true, checked.errors);
  } finally {
    fsPromises.readFile = readManifest;
    syncBuiltinESMExports();
    chokidar.FSWatcher.prototype.add = add;
    release();
    await put("src/context.ts", context);
  }
});

await test("serve regenerates after rpc.ts and context edits, follows a moved context and survives failures", async () => {
  await put("src/routes/todos/rpc.ts", rpc);

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
      "src/routes/todos/rpc.ts",
      rpc.replace("list:", "ping: query({ handler: () => 1 }),\n  list:"),
    );
    await waitFor(
      async () => /\bping\b/.test(await read("src/routes/todos/rpc.generated.ts")),
      "rpc.ts edit didn't regenerate",
    );

    const original = appId(await read("generated/server.generated.ts"));

    await put("src/context.ts", context.replace('"alice"', '"bob"'));
    await waitFor(
      async () => appId(await read("generated/server.generated.ts")) !== original,
      "context edit didn't regenerate",
    );

    // Moving the context to another directory outside the scan directory changes the identity
    // again; then edits at its new path regenerate.
    const edited = appId(await read("generated/server.generated.ts"));

    await mkdir(resolve(fixture, "src/app"));
    await rename(resolve(fixture, "src/context.ts"), resolve(fixture, "src/app/context.ts"));
    await waitFor(
      async () => appId(await read("generated/server.generated.ts")) !== edited,
      "moving the context file didn't regenerate",
    );

    const moved = appId(await read("generated/server.generated.ts"));

    await put("src/app/context.ts", context);
    await waitFor(
      async () => appId(await read("generated/server.generated.ts")) !== moved,
      "editing the moved context file didn't regenerate",
    );

    // A failed pass is logged and the dev server keeps running; the next edit retries.
    const errors = served.logs.length;

    await put("src/routes/todos/rpc.ts", 'export default "not an rpc group";\n');
    await waitFor(
      () => served.logs.slice(errors).some((entry) => entry.level === "error"),
      "failed regeneration wasn't logged",
    );
    await put(
      "src/routes/todos/rpc.ts",
      rpc.replace("list:", "pong: query({ handler: () => 1 }),\n  list:"),
    );
    await waitFor(
      async () => /\bpong\b/.test(await read("src/routes/todos/rpc.generated.ts")),
      "the edit after a failure didn't regenerate",
    );
    assert.equal(served.error, undefined);
    assert.equal(callsOf("dev-server").length, starts);
  } finally {
    await served.stop();
  }
});
