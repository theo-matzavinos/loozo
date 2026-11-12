// Runs the README's testing snippets the way a consumer does: copies snippets/ to a scratch app
// linked to this package and its installed dependencies, runs `ng build` (which generates), then
// `ng test` through Angular's unit-test builder, and checks every spec ran and passed.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";

const packageDirectory = resolve(import.meta.dirname, "..");
const snippets = join(packageDirectory, "snippets");
const ng = join(packageDirectory, "node_modules/@angular/cli/bin/ng.js");
const specs = [
  "src/auth.server.spec.ts",
  "src/routes/todos/responses.spec.ts",
  "src/routes/todos/route.spec.ts",
  "src/routes/todos/rpc.spec.ts",
  "src/routes/todos/todo-item.spec.ts",
];

async function run(fixture, args) {
  const child = spawn(process.execPath, [ng, ...args], {
    cwd: fixture,
    env: { ...process.env, NG_CLI_ANALYTICS: "false", NO_COLOR: "1", FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";

  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));

  const code = await new Promise((done, fail) => {
    child.on("error", fail);
    child.on("close", done);
  });

  assert.equal(code, 0, `ng ${args.join(" ")} exited with ${code}:\n${output}`);

  return output;
}

await test("the README's testing snippets pass under ng test", async (t) => {
  // Physical, since the CLI and Vitest report paths from the real working directory.
  const fixture = await realpath(await mkdtemp(join(tmpdir(), "launch-snippets-")));

  t.after(() => rm(fixture, { recursive: true, force: true }));

  await cp(snippets, fixture, {
    recursive: true,
    filter: (path) =>
      !/(?:^|\/)(?:node_modules|dist|\.angular|generated)(?:\/|$)/.test(path) &&
      !path.endsWith(".generated.ts"),
  });

  const metadata = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));

  for (const dependency of new Set([
    ...Object.keys(metadata.dependencies),
    ...Object.keys(metadata.devDependencies),
    "@loozo/angular-launch",
  ])) {
    const link = join(fixture, "node_modules", dependency);
    let target = join(packageDirectory, "node_modules", dependency);

    if (dependency === "@loozo/angular-launch") {
      target = packageDirectory;
    }

    await mkdir(dirname(link), { recursive: true });
    await symlink(target, link, "dir");
  }

  await run(fixture, ["build"]);

  const report = join(fixture, "vitest.json");
  const output = await run(fixture, [
    "test",
    "--watch=false",
    "--reporters=json",
    `--output-file=${report}`,
  ]);

  // The README calls this warning expected; if Angular drops it, update the README.
  assert.match(
    output,
    /The 'buildTarget' is configured to use '@loozo\/angular-launch:application', which is not supported/,
  );

  const results = JSON.parse(await readFile(report, "utf8"));
  const files = [];

  for (const file of results.testResults) {
    files.push(relative(fixture, file.name).split(sep).join("/"));
  }

  assert.deepEqual(
    files.sort((a, b) => a.localeCompare(b)),
    specs,
  );
  assert.equal(results.success, true);
  assert.equal(results.numFailedTests, 0);
  assert.equal(results.numPassedTests, results.numTotalTests);
  assert.equal(results.numTotalTests, 15);
});
