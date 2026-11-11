// Proves Angular's own `ng test` (@angular/build:unit-test) and `ng extract-i18n` builders work when
// their buildTarget is the router's application target, through the real Angular CLI. Neither
// builder runs route generation, so `ng build` runs first, as the README tells consumers. `ng test`
// runs the README's testing snippet in a copy of snippets/; `ng extract-i18n` runs in a copy of the
// example app.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(packageDirectory, "../..");
const evidence = resolve(process.argv[2]);

await mkdir(evidence); // Require a fresh receipt/fixture directory.

const metadata = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
const ng = join(packageDirectory, "node_modules/@angular/cli/bin/ng.js");

/**
 * Copies an app without its generated files to consumer/<name>, which CI keeps out of its evidence
 * because it links the workspace's node_modules, and gives it the consumer setup the README documents:
 * test and extract-i18n targets pointing at the router's build target, `@angular/localize/init` in
 * its polyfills, and specs kept out of the app tsconfig.
 */
async function consumer(source, name, project) {
  const fixture = join(evidence, "consumer", name);

  await cp(source, fixture, {
    recursive: true,
    filter: (path) =>
      !/(?:^|\/)(?:node_modules|dist|\.angular|generated)(?:\/|$)/.test(path) &&
      !path.endsWith("route.generated.ts"),
  });

  for (const dependency of new Set([
    ...Object.keys(metadata.dependencies),
    ...Object.keys(metadata.devDependencies),
    "@loozo/angular-router",
  ])) {
    const link = join(fixture, "node_modules", dependency);

    await mkdir(dirname(link), { recursive: true });

    let target = join(packageDirectory, "node_modules", dependency);

    if (dependency === "@loozo/angular-router") {
      target = packageDirectory;
    }

    await symlink(target, link, "dir");
  }

  const workspace = JSON.parse(await readFile(join(fixture, "angular.json"), "utf8"));
  const architect = workspace.projects[project].architect;

  architect.build.options.polyfills = ["@angular/localize/init"];
  architect.test = {
    builder: "@angular/build:unit-test",
    options: { buildTarget: `${project}:build` },
  };
  architect["extract-i18n"] = {
    builder: "@angular/build:extract-i18n",
    options: { buildTarget: `${project}:build` },
  };
  await writeFile(join(fixture, "angular.json"), JSON.stringify(workspace, null, 2));

  const application = JSON.parse(await readFile(join(fixture, "tsconfig.app.json"), "utf8"));

  application.exclude = ["src/**/*.spec.ts"];
  await writeFile(join(fixture, "tsconfig.app.json"), JSON.stringify(application, null, 2));
  await writeFile(
    join(fixture, "tsconfig.spec.json"),
    JSON.stringify(
      {
        extends: "./tsconfig.app.json",
        compilerOptions: { types: ["vitest/globals"] },
        files: [],
        include: ["src/**/*.ts", "generated/**/*.ts"],
        exclude: [],
      },
      null,
      2,
    ),
  );

  return fixture;
}

async function run(fixture, name, args) {
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

  await writeFile(join(evidence, `${name}.log`), output);
  assert.equal(code, 0, `ng ${args.join(" ")} exited with ${code}:\n${output}`);

  return output;
}

// The README's spec navigates through the generated routes, so its lazy page must come from
// generated configuration.
const snippets = await consumer(join(packageDirectory, "snippets"), "snippets", "app");
const spec = "src/routes/teams/$teamId/items/$id/page.spec.ts";

await run(snippets, "snippets-build", ["build"]);

const report = join(evidence, "vitest.json");
const testOutput = await run(snippets, "snippets-test", [
  "test",
  "--watch=false",
  "--reporters=json",
  `--output-file=${report}`,
]);

// The README calls this warning expected; if Angular drops it, update the README.
assert.match(
  testOutput,
  /The 'buildTarget' is configured to use '@loozo\/angular-router:application', which is not supported/,
);

const results = JSON.parse(await readFile(report, "utf8"));

assert.equal(results.success, true);
assert.equal(results.numTotalTests, 1);
assert.equal(results.numPassedTests, 1);
assert.deepEqual(
  results.testResults.map((file) => file.name.slice(snippets.length + 1)),
  [spec],
);

const example = await consumer(join(repository, "examples/angular-router"), "example", "proof");
const pagePath = join(example, "src/routes/+home/page.ts");
const page = await readFile(pagePath, "utf8");
const marked = page.replace(
  '<h1 data-proof="home">',
  '<h1 data-proof="home" i18n="@@home.heading">',
);

assert.notEqual(marked, page, "The example's home heading changed; update the i18n marker");
await writeFile(pagePath, marked);
await run(example, "example-build", ["build"]);

const translations = join(evidence, "i18n");
const extractOutput = await run(example, "example-extract-i18n", [
  "extract-i18n",
  `--output-path=${translations}`,
]);

assert.match(extractOutput, /Extraction Complete\. \(Messages: 1\)/);

const messages = await readFile(join(translations, "messages.xlf"), "utf8");

assert.match(
  messages,
  /<trans-unit id="home\.heading" datatype="html">\s*<source>Manually authored home route<\/source>/,
);
assert.match(
  messages,
  /<context context-type="sourcefile">src\/routes\/\+home\/page\.ts<\/context>/,
);
console.log(
  "ng test (the README's testing snippet) and ng extract-i18n against the router application target passed after ng build",
);
