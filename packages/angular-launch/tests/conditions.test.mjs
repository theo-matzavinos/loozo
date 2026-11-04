// Runs the real Angular CLI on a scratch app next to examples/angular-launch, whose installed CLI and
// @angular/build it uses, and compares which conditional export of a dependency the Launch builders
// bundle with what Angular's own builders bundle for the same options.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

const example = resolve(import.meta.dirname, "../../../examples/angular-launch");
const fixture = resolve(example, `.scratch/conditions-${process.pid}`);
const ng = resolve(example, "node_modules/@angular/cli/bin/ng.js");
const branches = ["development", "production", "default"];

async function put(path, text) {
  const file = resolve(fixture, path);

  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
}

async function setUp() {
  const application = {
    browser: "src/main.ts",
    tsConfig: "tsconfig.app.json",
    index: false,
    optimization: false,
    sourceMap: false,
    outputHashing: "none",
  };
  const configurations = { production: { optimization: true }, empty: { conditions: [] } };
  const devServer = { prebundle: false, host: "127.0.0.1" };
  const files = {
    "package.json": JSON.stringify({ name: "conditions-consumer", private: true }),
    "tsconfig.json": JSON.stringify({
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
    "tsconfig.app.json": JSON.stringify({ extends: "./tsconfig.json", files: ["src/main.ts"] }),
    "angular.json": JSON.stringify({
      version: 1,
      cli: { analytics: false, cache: { enabled: false } },
      projects: {
        app: {
          projectType: "application",
          root: "",
          sourceRoot: "src",
          architect: {
            official: {
              builder: "@angular/build:application",
              options: { ...application, outputPath: "dist/official" },
              configurations,
            },
            launch: {
              builder: "@loozo/angular-launch:application",
              options: {
                tsconfig: "tsconfig.json",
                scanDirectories: ["src/routes"],
                outDirectory: "generated",
                ...application,
                outputPath: "dist/launch",
              },
              configurations,
            },
            "serve-official": {
              builder: "@angular/build:dev-server",
              options: { ...devServer, buildTarget: "app:official" },
            },
            "serve-launch": {
              builder: "@loozo/angular-launch:serve",
              options: { ...devServer, buildTarget: "app:launch" },
            },
          },
        },
      },
    }),
    "src/main.ts": 'import { branch } from "conditional-dependency";\n\nconsole.log(branch);\n',
    "src/context.ts": `import { defineContext } from "@loozo/angular-launch/server";

export default defineContext((request: Request) => ({ request }));
`,
    "src/routes/route.ts":
      'import { defineRoute } from "@loozo/angular-router";\n\nexport default defineRoute("", {});\n',
    "src/routes/page.ts":
      'import { Component } from "@angular/core";\n\n@Component({ selector: "home-page", template: "home" })\nexport default class Home {}\n',
    "node_modules/conditional-dependency/package.json": JSON.stringify({
      name: "conditional-dependency",
      type: "module",
      exports: {
        ".": {
          types: "./index.d.ts",
          development: "./development.js",
          production: "./production.js",
          default: "./default.js",
        },
      },
    }),
    "node_modules/conditional-dependency/index.d.ts": "export declare const branch: string;\n",
  };

  for (const branch of branches) {
    files[`node_modules/conditional-dependency/${branch}.js`] =
      `export const branch = "resolved-${branch}-branch";\n`;
  }

  await rm(fixture, { recursive: true, force: true });

  const writes = [];

  for (const [path, text] of Object.entries(files)) {
    writes.push(put(path, text));
  }

  await Promise.all(writes);
}

// Which of the dependency's branches the bundled code contains.
function bundled(code) {
  const found = [];

  for (const branch of branches) {
    if (code.includes(`resolved-${branch}-branch`)) {
      found.push(branch);
    }
  }

  assert.equal(found.length, 1, `exactly one branch is bundled, found ${found.join(", ")}`);

  return found[0];
}

function spawnNg(args) {
  return spawn(process.execPath, [ng, ...args], {
    cwd: fixture,
    // Its own process group, so stopping a dev server also stops what it started.
    detached: true,
    env: { ...process.env, NG_CLI_ANALYTICS: "false", NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function collect(child) {
  const output = { text: "" };

  child.stdout.on("data", (chunk) => {
    output.text += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output.text += chunk;
  });

  return output;
}

function exited(child) {
  return new Promise((done, fail) => {
    child.once("error", fail);
    child.once("exit", (code, signal) => done({ code, signal }));
  });
}

async function build(target, configuration) {
  let specifier = `app:${target}`;

  if (configuration !== undefined) {
    specifier = `${specifier}:${configuration}`;
  }

  const child = spawnNg(["run", specifier]);
  const output = collect(child);
  const { code } = await exited(child);

  assert.equal(code, 0, `ng run ${specifier} failed:\n${output.text}`);

  return bundled(await readFile(resolve(fixture, `dist/${target}/browser/main.js`), "utf8"));
}

async function freePort() {
  const server = createServer();

  await new Promise((done) => server.listen(0, "127.0.0.1", done));

  const { port } = server.address();

  await new Promise((done) => server.close(done));

  return port;
}

async function serve(target) {
  const port = await freePort();
  const child = spawnNg(["run", `app:${target}`, "--port", String(port)]);
  const output = collect(child);
  const exit = exited(child);
  let status;

  void exit.then((result) => {
    status = result;
  });

  try {
    const deadline = Date.now() + 120_000;

    while (Date.now() < deadline && status === undefined) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/main.js`);

        if (response.ok) {
          return bundled(await response.text());
        }
      } catch {
        // Not listening yet.
      }

      await new Promise((done) => setTimeout(done, 250));
    }

    assert.fail(`ng run app:${target} never served main.js:\n${output.text}`);
  } finally {
    if (status === undefined) {
      process.kill(-child.pid, "SIGTERM");
      await exit;
    }
  }
}

await setUp();

try {
  for (const { name, configuration, expected } of [
    { name: "without optimization", configuration: undefined, expected: "development" },
    { name: "with optimization", configuration: "production", expected: "production" },
    { name: "with an explicit empty conditions", configuration: "empty", expected: "default" },
  ]) {
    await test(`application resolves the conditions Angular's builder resolves, ${name}`, async () => {
      const official = await build("official", configuration);

      // The fixture tells the branches apart only if Angular picks this one.
      assert.equal(official, expected);
      assert.equal(await build("launch", configuration), official);
    });
  }

  await test("serve resolves the conditions Angular's dev server resolves", async () => {
    const official = await serve("serve-official");

    assert.equal(official, "development");
    assert.equal(await serve("serve-launch"), official);
  });
} finally {
  await rm(fixture, { recursive: true, force: true });
}
