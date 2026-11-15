import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readlink,
  readdir,
  rename,
  stat,
  symlink,
  writeFile,
  rm,
} from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(packageDirectory, "../..");
const evidence = resolve(process.argv[2]);

await mkdir(evidence); // Require a fresh receipt/fixture directory.

const fixture = join(evidence, "consumer");
const metadata = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));

// A copy of the example without generated output, linked to this package and its toolchain.
async function createConsumer(directory) {
  await cp(join(repository, "examples/angular-router"), directory, {
    recursive: true,
    filter: (path) =>
      !/(?:^|\/)(?:node_modules|dist|\.angular|generated)(?:\/|$)/.test(path) &&
      !path.endsWith("route.generated.ts") &&
      !path.endsWith("destination.generated.ts"),
  });

  // These fixtures author paths and parents by hand, so they opt out of filesystem mode.
  const configuration = JSON.parse(await readFile(join(directory, "angular.json"), "utf8"));

  configuration.projects.proof.architect.build.options.autoDefineRoutes = false;
  await writeFile(join(directory, "angular.json"), JSON.stringify(configuration));

  for (const name of new Set([
    ...Object.keys(metadata.dependencies),
    ...Object.keys(metadata.devDependencies),
    "@loozo/angular-router",
  ])) {
    const link = join(directory, "node_modules", name);

    await mkdir(dirname(link), { recursive: true });

    let target = join(packageDirectory, "node_modules", name);

    if (name === "@loozo/angular-router") {
      target = packageDirectory;
    }

    await symlink(target, link, "dir");
  }
}

await createConsumer(fixture);

const require = createRequire(join(packageDirectory, "package.json"));
const { Architect } = require("@angular-devkit/architect");
const { WorkspaceNodeModulesArchitectHost } = require("@angular-devkit/architect/node");
const nativeRequire = createRequire(require.resolve("@angular-devkit/architect"));
const core = nativeRequire("@angular-devkit/core");
const { NodeJsSyncHost } = nativeRequire("@angular-devkit/core/node");
const { chromium } = require("playwright");
let sequence = 0;
const reports = [];

async function architect(root = fixture) {
  const host = core.workspaces.createWorkspaceHost(new NodeJsSyncHost());
  const { workspace } = await core.workspaces.readWorkspace(root, host);
  const registry = new core.json.schema.CoreSchemaRegistry();

  registry.addPostTransform(core.json.schema.transforms.addUndefinedDefaults);

  return new Architect(new WorkspaceNodeModulesArchitectHost(workspace, root), registry);
}

async function build(overrides = {}, root = fixture) {
  const instance = await architect(root);
  const logger = new core.logging.Logger("development");
  const logs = [];

  logger.subscribe((entry) => logs.push(entry));

  const report = { sequence: ++sequence, overrides, logs };

  reports.push(report);

  let run;

  try {
    run = await instance.scheduleTarget({ project: "proof", target: "build" }, overrides, {
      logger,
    });
    report.output = await run.result;

    return report.output.success;
  } catch (error) {
    report.error = String(error);

    return false;
  } finally {
    await run?.stop();
    await writeFile(join(evidence, "build-reports.json"), JSON.stringify(reports, null, 2));
  }
}

async function snapshot(generatedOnly = true, fullFixture = false) {
  const files = {};

  async function visit(path) {
    if (fullFixture) {
      const info = await lstat(path, { bigint: true });

      files[path.slice(fixture.length + 1) || "."] = {
        kind: "directory",
        mode: String(info.mode),
        mtimeNs: String(info.mtimeNs),
      };
    }

    const entries = await readdir(path, { withFileTypes: true });

    for (const entry of entries) {
      if (
        !fullFixture &&
        (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".angular")
      ) {
        continue;
      }

      const file = join(path, entry.name);

      if (entry.isDirectory()) {
        await visit(file);
      } else if (fullFixture && entry.isSymbolicLink()) {
        const info = await lstat(file, { bigint: true });

        files[file.slice(fixture.length + 1)] = {
          kind: "link",
          target: await readlink(file),
          mode: String(info.mode),
          mtimeNs: String(info.mtimeNs),
        };
      } else if (
        entry.isFile() &&
        (!generatedOnly || /(?:routes|destinations|route|destination)\.generated\.ts$/.test(file))
      ) {
        const info = await stat(file, { bigint: true });

        if (fullFixture) {
          files[file.slice(fixture.length + 1)] = {
            kind: "file",
            sha256: createHash("sha256")
              .update(await readFile(file))
              .digest("hex"),
            size: String(info.size),
            mtimeNs: String(info.mtimeNs),
            mode: String(info.mode),
          };
        } else {
          files[file.slice(fixture.length + 1)] = {
            bytes: await readFile(file, "utf8"),
            mtimeNs: String(info.mtimeNs),
            mode: String(info.mode),
          };
        }
      }
    }
  }

  await visit(fixture);

  return files;
}

async function expectBuild(success, options = {}) {
  const result = await build(options);

  assert.equal(result, success);
}

// Generation failures are failed builds whose diagnostics go to the builder logger, not thrown.
function generationError() {
  const report = reports.at(-1);
  const messages = [];

  assert.equal(report.error, undefined, "Generation failures are reported, not thrown");
  assert.equal(report.output.success, false);

  for (const entry of report.logs) {
    if (entry.level === "error") {
      messages.push(entry.message);
    }
  }

  return messages.join("\n");
}

async function expectUnchanged(expected, message) {
  const actual = await snapshot();

  assert.deepEqual(actual, expected, message);
}

async function write(path, bytes) {
  await mkdir(dirname(join(fixture, path)), { recursive: true });
  await writeFile(join(fixture, path), bytes);
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

await expectBuild(true);

const initial = await snapshot();

assert.equal(Object.keys(initial).length, 4);
assert.match(
  initial["generated/routes.generated.ts"].bytes,
  /import\("\.\.\/src\/routes\/\+home\/page"\)/,
);
assert.doesNotMatch(initial["generated/routes.generated.ts"].bytes, /\.then\(/);
assert.match(
  initial["generated/routes.generated.ts"].bytes,
  /\/\*\*[\s\S]*?provideRouter\(routes\)[\s\S]*?\*\/\nexport const routes/,
);
assert.match(
  initial["src/routes/+home/destination.generated.ts"].bytes,
  /\/\*\* This route's destination: an inert URL reference[^\n]*\*\/ const routegen\$destination = /,
);
assert.match(
  initial["src/routes/+home/destination.generated.ts"].bytes,
  /\nexport \{ routegen\$destination as destination \};\n\/\/ @loozo\/angular-router routegen: owned destination\.generated\.ts\n$/,
);
assert.match(
  initial["src/routes/+home/route.generated.ts"].bytes,
  /\/\*\* This route's browser copy[^\n]*\*\/ const routegen\$route = /,
);
assert.match(
  initial["src/routes/+home/route.generated.ts"].bytes,
  /\/\*\*[\s\S]*?@returns A noncallable handle[\s\S]*?\*\/\nfunction routegen\$injectRoute/,
);
await expectBuild(true);
await expectUnchanged(initial, "Identical generation must preserve nanosecond mtimes");
await expectBuild(true, { check: true });
await expectUnchanged(initial, "Check must not mutate generated outputs");

await write(
  "generated/routes.generated.ts",
  `${initial["generated/routes.generated.ts"].bytes}\n// hand edit\n`,
);
await rm(join(fixture, "generated/destinations.generated.ts"));
await write(
  "src/routes/stale/route.generated.ts",
  "// stale\n// @loozo/angular-router routegen: owned route.generated.ts\n",
);

const drift = await snapshot();

await expectBuild(false, { check: true });
await expectUnchanged(drift);
assert.match(generationError(), /artifacts changed/);
await write("generated/routes.generated.ts", initial["generated/routes.generated.ts"].bytes);
await expectBuild(false, { check: true });
assert.match(generationError(), /artifacts missing/);
await write(
  "generated/destinations.generated.ts",
  initial["generated/destinations.generated.ts"].bytes,
);
await expectBuild(false, { check: true });
assert.match(generationError(), /artifacts stale/);
await expectBuild(true);

const repaired = await snapshot();

assert.equal(Object.keys(repaired).length, 4);

const definition = await readFile(join(fixture, "src/routes/+home/route.ts"), "utf8");

await write("src/routes/+home/route.ts", `${definition}\nexport default 1;\n`);

const beforeInvalid = await snapshot();

await expectBuild(false);
await expectUnchanged(beforeInvalid);
await write("src/routes/+home/route.ts", definition);
await write("generated/routes.generated.ts", "// unmarked collision\n");

const collision = await snapshot();

await expectBuild(false);
await expectUnchanged(collision);
await write("generated/routes.generated.ts", initial["generated/routes.generated.ts"].bytes);

// Source preflight regressions use only public Architect and filesystem results.
// Capture all fixture sources/products, not private compiler graph/layout state.
const preflightReports = [];

async function expectPreflight(name, diagnostic) {
  const before = await snapshot(false, true);

  await expectBuild(false, { check: true });
  assert.match(generationError(), diagnostic);

  const afterCheck = await snapshot(false, true);

  assert.deepEqual(afterCheck, before, `${name}: check must preserve bytes/modes/ns-mtimes`);
  await expectBuild(false);
  assert.match(generationError(), diagnostic);

  const afterWrite = await snapshot(false, true);

  assert.deepEqual(afterWrite, before, `${name}: invalid source must precede publication`);
  preflightReports.push({ name, before, afterCheck, afterWrite });
  await writeFile(
    join(evidence, "source-preflight-reports.json"),
    JSON.stringify(preflightReports, null, 2),
  );
}

const tsconfig = await readFile(join(fixture, "tsconfig.routes.json"), "utf8");
const pageSource = await readFile(join(fixture, "src/routes/+home/page.ts"), "utf8");

// A declaration's factory comes from the package's public entry; its own generated copy
// exports no defineRoute, so an alias through it is rejected before anything is written.
await write(
  "src/routes/+home/route.ts",
  `import { defineRoute as homeRoute } from './route.generated.js';
export default homeRoute('', {});\n`,
);
await expectPreflight(
  "own route copy as factory source",
  /route\.ts:1:1: Factory import must name a concrete package public entry/,
);
await write("src/routes/+home/route.ts", definition);

// Default-imported parents in explicit files remain admitted.
await write(
  "src/routes/parent/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';
export default defineRoute('', {});\n`,
);
await write(
  "src/routes/+home/route.ts",
  `import { defineRoute } from '@loozo/angular-router';
import parent from '../parent/definition.js';
export default defineRoute('', { parent });\n`,
);
await expectBuild(true);

const explicitParent = await snapshot();

await expectBuild(true, { check: true });
await expectUnchanged(explicitParent);
await write(
  "src/fake-router.ts",
  "export function defineRoute(path: string, config: unknown) { return { path }; }\n",
);

for (const [name, target, diagnostic] of [
  [
    "fake public entry",
    "./src/fake-router.ts",
    /defineRoute import does not resolve to this package's concrete public entry/,
  ],
  [
    "public entry mapped to a generated route copy",
    "./src/routes/+home/route.generated.ts",
    /defineRoute import does not resolve to this package's concrete public entry/,
  ],
  [
    "redirected underlying factory binding",
    "./src/fake-router.ts",
    /Factory binding.*concrete defineRoute/,
  ],
]) {
  const config = JSON.parse(tsconfig);
  let specifier = "@loozo/angular-router";

  if (name === "redirected underlying factory binding") {
    specifier += "/_core";
  }

  config.compilerOptions = { ...config.compilerOptions, paths: { [specifier]: [target] } };
  await write("tsconfig.routes.json", JSON.stringify(config));
  await expectPreflight(name, diagnostic);
}

await write("tsconfig.routes.json", tsconfig);
await rm(join(fixture, "src/fake-router.ts"));
await rm(join(fixture, "src/routes/parent"), { recursive: true });
await write("src/routes/+home/route.ts", definition);
await expectBuild(true);

// Literal dynamic dependencies and type-import/equals module references are
// resolved natively. A retained generated target can be reached via a helper.
await write(
  "src/helper.ts",
  "export const retained = () => import('./routes/+home/route.generated.js');\n",
);
await write(
  "src/routes/+home/page.ts",
  "export const lazyHelper = () => import(`../../helper.js`);\n" +
    "export type Helper = typeof import('../../helper.js');\n" +
    pageSource,
);
await write(
  "src/helper-types.d.ts",
  "export type Retained = typeof import('./routes/+home/route.generated.js');\n",
);
await expectBuild(true);

const retainedDynamic = await snapshot(false);

await expectBuild(true, { check: true });
assert.deepEqual(await snapshot(false), retainedDynamic);
await write("src/helper.ts", "export const missing = () => import('./missing-helper.js');\n");
await expectPreflight(
  "missing dynamic helper",
  /helper\.ts:\d+:\d+: Unresolved import: .*missing-helper/,
);
await write("src/helper.ts", "export const helper = 1;\n");

for (const [name, reference] of [
  [
    "missing dynamic page dependency",
    "export const missing = () => import('../../missing-helper.js');",
  ],
  ["missing type import", "export type Missing = typeof import('../../missing-helper.js');"],
  ["missing external import equals", "import type Missing = require('../../missing-helper.js');"],
]) {
  await write("src/routes/+home/page.ts", reference + "\n" + pageSource);
  await expectPreflight(name, /page\.ts:\d+:\d+: Unresolved import: .*missing-helper/);
}

await write("src/routes/+home/page.ts", pageSource);
await write(
  "src/helper-types.d.ts",
  "export type Missing = typeof import('./missing-helper.js');\n",
);
await expectPreflight(
  "missing authored declaration type import",
  /helper-types\.d\.ts:\d+:\d+: Unresolved import: .*missing-helper/,
);
await rm(join(fixture, "src/helper-types.d.ts"));
await write(
  "src/routes/obsolete/route.generated.ts",
  "// removable obsolete body\n// @loozo/angular-router routegen: owned route.generated.ts\n",
);
await write(
  "src/helper.ts",
  "export const obsolete = () => import('./routes/obsolete/route.generated.js');\n",
);
// Even a native ambient pattern cannot authorize a physically resolved stale file.
await write("src/ambient.d.ts", "declare module '*route.generated.js';\n");
await expectPreflight(
  "unretained dynamic route copy",
  /helper\.ts:\d+:\d+: Generated import is not a retained owned target/,
);
await rm(join(fixture, "src/routes/obsolete"), { recursive: true });

// Redirect sources and their pruned ancestors get a destination and a route copy too, so a
// helper may reach them. Unadmitted locations never become owned targets, ambient or not.
const redirectSource = `import { defineRoute } from '@loozo/angular-router';
import { destination as target } from '../+home/destination.generated.js';
export default defineRoute('redirect-source', {}).redirect({ to: target, search: { mode: 'drop' }, fragment: { mode: 'drop' } });\n`;

await rm(join(fixture, "src/ambient.d.ts"));
await write("src/routes/redirect-source/definition.ts", redirectSource);
await write(
  "src/routes/pruned/definition.ts",
  "import { defineRoute } from '@loozo/angular-router';\nexport default defineRoute('pruned', {});\n",
);
await write(
  "src/routes/pruned/alias/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';
import parent from '../definition.js';
import { destination as target } from '../../+home/destination.generated.js';
export default defineRoute('alias', { parent }).redirect({ to: target, search: { mode: 'drop' }, fragment: { mode: 'drop' } });\n`,
);
await write(
  "src/helper.ts",
  "export const redirectCopy = () => import('./routes/redirect-source/route.generated.js');\n" +
    "export const prunedCopy = () => import('./routes/pruned/route.generated.js');\n" +
    "export const prunedDestination = () => import('./routes/pruned/destination.generated.js');\n",
);
await expectBuild(true);

const redirectPairs = await snapshot();

for (const directory of ["redirect-source", "pruned", "pruned/alias"]) {
  for (const name of ["destination", "route"]) {
    assert.match(
      redirectPairs[`src/routes/${directory}/${name}.generated.ts`]?.bytes ?? "",
      new RegExp(`// @loozo/angular-router routegen: owned ${name}\\.generated\\.ts\\n$`),
      `${directory} gets its ${name}.generated.ts`,
    );
  }
}

// A pruned declaration gets no record and no place in the active route union.
assert.doesNotMatch(
  redirectPairs["generated/destinations.generated.ts"].bytes,
  /"src\/routes\/pruned\/definition\.ts"/,
);
await expectBuild(true, { check: true });
await expectUnchanged(redirectPairs);

for (const [name, ambient, target] of [
  ["absent unadmitted route copy without ambient", undefined, "route"],
  ["absent unadmitted route copy with ambient", "*route.generated.js", "route"],
  ["absent unadmitted destination with ambient", "*destination.generated.js", "destination"],
]) {
  if (ambient === undefined) {
    await rm(join(fixture, "src/ambient.d.ts"), { force: true });
  } else {
    await write("src/ambient.d.ts", `declare module '${ambient}';\n`);
  }

  await write(
    "src/helper.ts",
    `export const absent = () => import('./routes/unadmitted-new/${target}.generated.js');\n`,
  );
  await expectPreflight(
    name,
    /helper\.ts:\d+:\d+: Generated import is not a retained owned target/,
  );
}

const unadmittedPaths = JSON.parse(tsconfig);

unadmittedPaths.compilerOptions = {
  ...unadmittedPaths.compilerOptions,
  paths: { "@unadmitted": ["./src/routes/unadmitted-new/route.generated.js"] },
};
await write("tsconfig.routes.json", JSON.stringify(unadmittedPaths));
await write(
  "src/ambient.d.ts",
  "declare module '*route.generated.js';\ndeclare module '@unadmitted';\n",
);
await write("src/helper.ts", "export const absent = () => import('@unadmitted');\n");
await expectPreflight(
  "native paths absent route copy with exact ambient",
  /helper\.ts:\d+:\d+: Generated import is not a retained owned target/,
);
await write("tsconfig.routes.json", tsconfig);
await rm(join(fixture, "src/routes/redirect-source"), { recursive: true });
await rm(join(fixture, "src/routes/pruned"), { recursive: true });
await write("src/ambient.d.ts", "declare module '*route.generated.js';\n");
await write(
  "src/helper.ts",
  "export const retained = () => import('./routes/+home/route.generated.js');\n",
);
await rm(join(fixture, "src/routes/+home/route.generated.ts"));
await rm(join(fixture, "src/routes/+home/destination.generated.ts"));
await expectBuild(true);

const coldRetained = await snapshot(false);

await expectBuild(true, { check: true });

const checkedRetained = await snapshot(false);

assert.deepEqual(checkedRetained, coldRetained);
preflightReports.push({
  name: "cold retained route copy with ambient",
  before: coldRetained,
  after: checkedRetained,
});
await rm(join(fixture, "src/helper.ts"));
await rm(join(fixture, "src/ambient.d.ts"));

// Native exact/pattern ambient module bindings are legitimate ordinary helpers.
await write(
  "src/routes/+home/page.ts",
  "import type { Opaque } from 'virtual/helper';\ntype Keep = Opaque;\n" + pageSource,
);

for (const declaration of ["virtual/helper", "virtual/*"]) {
  await write(
    "src/ambient.d.ts",
    `declare module '${declaration}' { export interface Opaque { readonly label: string; } }\n`,
  );
  await expectBuild(true);

  const before = await snapshot(false);

  await expectBuild(true, { check: true });

  const after = await snapshot(false);

  assert.deepEqual(after, before);
  preflightReports.push({ name: `native ambient ${declaration}`, before, after });
}

// The same basename outside generation locations remains an ordinary helper.
await write(
  "src/routes/+home/page.ts",
  "import type { Opaque } from 'virtual/route.generated.js';\ntype Keep = Opaque;\n" + pageSource,
);
await expectBuild(true);

const ordinaryAmbient = await snapshot(false);

await expectBuild(true, { check: true });

const checkedAmbient = await snapshot(false);

assert.deepEqual(checkedAmbient, ordinaryAmbient);
preflightReports.push({
  name: "ordinary ambient generated-looking name outside generation locations",
  before: ordinaryAmbient,
  after: checkedAmbient,
});
await write(
  "src/routes/+home/page.ts",
  "import type { Opaque } from 'missing/helper';\ntype Keep = Opaque;\n" + pageSource,
);
await expectPreflight(
  "unknown ambient helper",
  /page\.ts:\d+:\d+: Unresolved import: missing\/helper/,
);
await write("src/routes/+home/page.ts", pageSource);
await write(
  "src/ambient.d.ts",
  "declare module 'virtual/*' { export function defineRoute(path: string, config: unknown): unknown; }\n",
);
await write(
  "src/routes/+home/route.ts",
  "import { defineRoute } from 'virtual/factory';\nexport default defineRoute('', {});\n",
);
await expectPreflight(
  "ambient cannot supply factory provenance",
  /Factory import must name a concrete package public entry/,
);
await write("src/routes/+home/route.ts", definition);
await write(
  "src/ambient.d.ts",
  "declare module 'virtual/*' { export function Component(value: unknown): ClassDecorator; }\n",
);
await write("src/routes/+home/page.ts", pageSource.replace("@angular/core", "virtual/angular"));
await expectPreflight(
  "ambient cannot supply Angular provenance",
  /Component decorator is not from consumer-installed/,
);
await write("src/routes/+home/page.ts", pageSource);
await rm(join(fixture, "src/ambient.d.ts"));
await expectBuild(true);

// Redirect policy/type preflight must be atomic, before Angular's own checking.
await write(
  "src/routes/+home/route.ts",
  definition.replace('defineRoute("", {})', 'defineRoute("", { fragments: ["summary"] })'),
);

const alias = `import { defineRoute } from '@loozo/angular-router';
import { destination as target } from '../+home/destination.generated.js';
export default defineRoute('alias', {}).redirect({ to: target, search: { mode: 'drop' }, fragment: { mode: 'replace', value: 'summary' } });\n`;

await write("src/routes/alias/definition.ts", alias);
await expectBuild(true);

const validRedirect = await snapshot();

await write(
  "src/routes/alias/definition.ts",
  alias.replace("value: 'summary'", "value: 'unknown'"),
);
await expectBuild(false);
await expectUnchanged(validRedirect);
assert.match(generationError(), /replacement fragment is not declared/);
await write(
  "src/routes/alias/definition.ts",
  alias.replace("mode: 'drop'", "mode: 'drop', values: {}"),
);
await expectBuild(false);
await expectUnchanged(validRedirect);
assert.match(generationError(), /Unknown redirect search policy key/);
await rm(join(fixture, "src/routes/alias"), { recursive: true });
await write("src/routes/+home/route.ts", definition);
await expectBuild(true);

// A real Angular regression, not just a resolver analogue: extensionless page.js
// selects named-only page.ts. Emitted page.js.js must load the discovered page.js.ts.
await rename(
  join(fixture, "src/routes/+home/page.ts"),
  join(fixture, "src/routes/+home/page.js.ts"),
);
await write("src/routes/+home/page.ts", "export const helper = 1;\n");
await expectBuild(true);

const lazyCollision = await snapshot();

assert.match(
  lazyCollision["generated/routes.generated.ts"].bytes,
  /import\("\.\.\/src\/routes\/\+home\/page\.js\.js"\)/,
);

const serverArchitect = await architect();
const logger = new core.logging.Logger("development-serve");
const logs = [];

logger.subscribe((entry) => logs.push(entry));

const server = await serverArchitect.scheduleTarget(
  { project: "proof", target: "serve" },
  {},
  { logger },
);
const outputs = [];
const errors = [];
const subscription = server.output.subscribe({
  next: (output) => outputs.push(output),
  error: (error) => errors.push(String(error)),
});
let browser;

try {
  await waitFor(
    () => outputs.some((output) => output.success && output.baseUrl),
    `Server did not publish ready output: ${JSON.stringify(logs)}`,
  );

  const output = outputs.find((value) => value.success && value.baseUrl);
  const response = await fetch(output.baseUrl);

  assert.equal(response.status, 200);
  await writeFile(join(evidence, "http-home.html"), await response.text());
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });

  let page = await browser.newPage();
  const browserErrors = [];

  page.on("pageerror", (error) => browserErrors.push(String(error)));
  await page.goto(output.baseUrl);

  const home = await page.locator('[data-proof="home"]').textContent();

  assert.equal(home, "Manually authored home route");
  assert.deepEqual(browserErrors, []);
  await writeFile(join(evidence, "browser-home.html"), await page.content());
  await page.close();
  await write(
    "src/routes/+home/route.ts",
    definition.replace('defineRoute("",', 'defineRoute("changed",'),
  );
  await waitFor(async () => {
    const routes = await readFile(join(fixture, "generated/routes.generated.ts"), "utf8");

    return routes.includes('path: "changed"');
  }, "Watcher did not regenerate changed source");
  await waitFor(async () => {
    const response = await fetch(new URL("main.js", output.baseUrl));
    const javascript = await response.text();

    return javascript.includes('path: "changed"');
  }, "Official dev-server did not consume the changed generated route");
  page = await browser.newPage();
  await page.goto(new URL("changed", output.baseUrl).href);
  await page.locator('[data-proof="home"]').waitFor();

  const beforeFailure = await snapshot();

  await write("src/routes/+home/route.ts", `${definition}\nexport default 1;\n`);
  await waitFor(
    () => logs.some((entry) => entry.message.includes("Multiple competing default exports")),
    "Later generation failure was not logged",
  );
  await expectUnchanged(beforeFailure);
  await write("src/routes/+home/route.ts", definition);
  await waitFor(async () => {
    const routes = await readFile(join(fixture, "generated/routes.generated.ts"), "utf8");

    return routes.includes('path: ""');
  }, "Watcher did not repair output after failure");
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  subscription.unsubscribe();
  await server.stop();
  await writeFile(
    join(evidence, "serve-reports.json"),
    JSON.stringify({ logs, outputs, errors }, null, 2),
  );
}

const stopped = await snapshot();

await write(
  "src/routes/+home/route.ts",
  definition.replace('defineRoute("",', 'defineRoute("after-stop",'),
);
await new Promise((done) => setTimeout(done, 600));
await expectUnchanged(stopped, "Stopped server must not publish after subsequent edits");
await writeFile(join(evidence, "final-artifacts.json"), JSON.stringify(stopped, null, 2));

// Cycle safety by execution. A componentless layout whose guard imports its own descendant's
// destination, a pathless home (the "/" winner), "other" (whose ".." is home), a redirect source
// to other's destination, a codec module and three lazy pages run under the dev server, as an
// optimized AOT build in two lazy load orders and as native ESM in five entry orders. Eager reads
// patched into the compiled copies are the negative controls: the shapes generation rejects.
const cycle = join(evidence, "cycle");

await createConsumer(cycle);
await rm(join(cycle, "src/routes/+home"), { recursive: true });

const cycleSources = {
  "src/codecs.ts": `import { numberParam } from "@loozo/angular-router";

// URL facts only, so destination copies may import it.
export const itemId = numberParam;
`,
  "src/shell.ts": `import { Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";
import { createUrl } from "@loozo/angular-router";
import { destination as home } from "./routes/layout/home/destination.generated.js";
import { destination as other } from "./routes/layout/other/destination.generated.js";
import { destination as item } from "./routes/layout/items/$id/destination.generated.js";
import { destination as old } from "./routes/layout/old/destination.generated.js";

@Component({
  selector: "proof-app",
  imports: [RouterLink, RouterOutlet],
  template: \`
    <nav>
      <a data-proof="to-home" [routerLink]="homeUrl">Home</a>
      <a data-proof="to-other" [routerLink]="otherUrl">Other</a>
      <a data-proof="to-item" [routerLink]="itemUrl">Item</a>
      <a data-proof="to-away" [routerLink]="homeUrl" [queryParams]="{ away: 1 }">Away</a>
      <a data-proof="to-old" [routerLink]="oldUrl">Old</a>
    </nav>
    <router-outlet />
  \`,
})
export default class Shell {
  readonly homeUrl = createUrl(home, {});
  readonly otherUrl = createUrl(other, {});
  readonly itemUrl = createUrl(item, { params: { id: 5 } });
  readonly oldUrl = createUrl(old, {});
}
`,
  "src/routes/layout/route.ts": `import { inject } from "@angular/core";
import { Router } from "@angular/router";
import { createUrl, defineRoute } from "@loozo/angular-router";
import { destination as item } from "./items/$id/destination.generated.js";

// A componentless layout whose guard sends ?away=1 to its own descendant.
export default defineRoute("", {})
  .runGuardsAndResolvers("paramsOrQueryParamsChange")
  .canActivate([
    (_inputs, snapshot) => {
      if (snapshot.queryParamMap.get("away") !== "1") {
        return true;
      }

      return inject(Router).parseUrl(createUrl(item, { params: { id: 5 } }));
    },
  ]);
`,
  "src/routes/layout/home/route.ts": `import { defineRoute } from "@loozo/angular-router";
import layout from "../route.js";

export default defineRoute("", { parent: layout });
`,
  "src/routes/layout/home/page.ts": `import { Component } from "@angular/core";

@Component({ template: '<h1 data-proof="home">Home</h1>' })
export default class Home {}
`,
  "src/routes/layout/other/route.ts": `import { defineRoute } from "@loozo/angular-router";
import layout from "../route.js";

export default defineRoute("other", { parent: layout });
`,
  "src/routes/layout/other/page.ts": `import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterLink],
  template: '<h1 data-proof="other">Other</h1><a data-proof="up" [routerLink]="up">Up</a>',
})
export default class Other {
  readonly up = injectRoute().link({ to: ".." });
}
`,
  "src/routes/layout/items/$id/route.ts": `import { defineRoute } from "@loozo/angular-router";
import layout from "../../route.js";
import { itemId } from "../../../../codecs.js";

export default defineRoute("items/$id", { parent: layout, params: { id: itemId } });
`,
  "src/routes/layout/items/$id/page.ts": `import { Component } from "@angular/core";
import { injectRoute } from "./route.generated.js";

@Component({ template: '<p data-proof="item">Item {{ route.params().id }}</p>' })
export default class Item {
  readonly route = injectRoute();
}
`,
  "src/routes/layout/old/route.ts": `import { defineRoute } from "@loozo/angular-router";
import layout from "../route.js";
import { destination as other } from "../other/destination.generated.js";

export default defineRoute("old", { parent: layout }).redirect({
  to: other,
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});
`,
};

for (const [path, bytes] of Object.entries(cycleSources)) {
  await mkdir(dirname(join(cycle, path)), { recursive: true });
  await writeFile(join(cycle, path), bytes);
}

// Collects page errors and console errors, so a TDZ failure in a lazy chunk can't pass silently.
function watchErrors(page) {
  const errors = [];

  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  return errors;
}

async function expectAt(page, pathname, selector, text) {
  await page.waitForURL((url) => url.pathname === pathname);
  await page.locator(selector).waitFor();
  assert.equal(await page.locator(selector).textContent(), text);
}

// 1. The dev server.
const cycleLogs = [];
const cycleLogger = new core.logging.Logger("cycle-serve");

cycleLogger.subscribe((entry) => cycleLogs.push(entry));

const cycleServer = await (
  await architect(cycle)
).scheduleTarget({ project: "proof", target: "serve" }, {}, { logger: cycleLogger });
const cycleOutputs = [];
const cycleSubscription = cycleServer.output.subscribe({
  next: (output) => cycleOutputs.push(output),
});
let cycleBrowser;

try {
  await waitFor(
    () => cycleOutputs.some((output) => output.success && output.baseUrl),
    `Cycle server did not publish ready output: ${JSON.stringify(cycleLogs)}`,
  );

  const base = cycleOutputs.find((output) => output.success && output.baseUrl).baseUrl;

  cycleBrowser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  const page = await cycleBrowser.newPage();
  const errors = watchErrors(page);

  await page.goto(base);
  await expectAt(page, "/", '[data-proof="home"]', "Home");
  await page.goto(new URL("other", base).href);
  await expectAt(page, "/other", '[data-proof="other"]', "Other");
  await page.click('[data-proof="up"]');
  await expectAt(page, "/", '[data-proof="home"]', "Home");
  await page.goto(new URL("?away=1", base).href);
  await expectAt(page, "/items/5", '[data-proof="item"]', "Item 5");
  await page.goto(new URL("old", base).href);
  await expectAt(page, "/other", '[data-proof="other"]', "Other");
  assert.deepEqual(errors, [], "The dev server app runs without errors");
} finally {
  await cycleBrowser?.close();
  cycleSubscription.unsubscribe();
  await cycleServer.stop();
  await writeFile(join(evidence, "cycle-serve-logs.json"), JSON.stringify(cycleLogs, null, 2));
}

// 2. An executed optimized AOT build with lazy chunks, served statically, in two load orders.
assert.equal(
  await build(
    {
      optimization: { scripts: true, styles: true, fonts: false },
      outputPath: "dist/optimized",
      statsJson: true,
    },
    cycle,
  ),
  true,
  "Optimized cycle build",
);

const stats = JSON.parse(await readFile(join(cycle, "dist/optimized/browser-stats.json"), "utf8"));
const lazyPages = new Map();

for (const [output, info] of Object.entries(stats.outputs)) {
  if (info.entryPoint?.endsWith("/page.ts")) {
    lazyPages.set(basename(output), info.entryPoint);
  }
}

assert.equal(lazyPages.size, 3, "Each page is its own lazy chunk");

// 5. The production graph holds route copies and destinations, never a declaration module.
const browserInputs = Object.keys(stats.inputs);

assert.deepEqual(
  browserInputs.filter((path) => /(?:^|\/)route\.ts$/.test(path)),
  [],
  "No route.ts in the browser build",
);
assert.ok(browserInputs.some((path) => path.endsWith("layout/route.generated.ts")));
assert.ok(browserInputs.some((path) => path.endsWith("items/$id/destination.generated.ts")));

const browserRoot = join(cycle, "dist/optimized/browser");
const staticServer = createServer(async (request, response) => {
  let file = join(browserRoot, new URL(request.url, "http://localhost").pathname);
  const found = await stat(file).catch(() => undefined);

  if (!found?.isFile()) {
    file = join(browserRoot, "index.html");
  }

  let type = "text/html";

  if (file.endsWith(".js")) {
    type = "text/javascript";
  } else if (file.endsWith(".css")) {
    type = "text/css";
  }

  response.writeHead(200, { "content-type": type });
  response.end(await readFile(file));
});

await new Promise((done) => staticServer.listen(0, "127.0.0.1", done));

const origin = `http://127.0.0.1:${staticServer.address().port}`;
const loadOrders = {};

cycleBrowser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

// Each order runs in a fresh context, so no chunk is cached from the other.
async function loadOrder(name, steps) {
  const context = await cycleBrowser.newContext();
  const page = await context.newPage();
  const errors = watchErrors(page);
  const chunks = [];

  page.on("request", (request) => {
    const file = basename(new URL(request.url()).pathname);

    if (lazyPages.has(file)) {
      chunks.push(lazyPages.get(file));
    }
  });

  try {
    await steps(page);
  } finally {
    await context.close();
  }

  assert.deepEqual(errors, [], `${name}: runs without errors`);
  assert.ok(chunks.length >= 2, `${name}: loads at least two lazy chunks`);
  loadOrders[name] = chunks;
}

try {
  await loadOrder("item first", async (page) => {
    await page.goto(`${origin}/items/5`);
    await expectAt(page, "/items/5", '[data-proof="item"]', "Item 5");
    await page.click('[data-proof="to-other"]');
    await expectAt(page, "/other", '[data-proof="other"]', "Other");
    await page.click('[data-proof="up"]');
    await expectAt(page, "/", '[data-proof="home"]', "Home");
  });
  await loadOrder("home first", async (page) => {
    await page.goto(`${origin}/`);
    await expectAt(page, "/", '[data-proof="home"]', "Home");
    await page.click('[data-proof="to-away"]');
    await expectAt(page, "/items/5", '[data-proof="item"]', "Item 5");
    await page.click('[data-proof="to-old"]');
    await expectAt(page, "/other", '[data-proof="other"]', "Other");
  });
} finally {
  await cycleBrowser.close();
  await new Promise((done) => staticServer.close(done));
  await writeFile(join(evidence, "cycle-load-orders.json"), JSON.stringify(loadOrders, null, 2));
}

assert.notDeepEqual(loadOrders["item first"], loadOrders["home first"]);

// 3. Native ESM: the generated and authored modules as plain Node modules, one fresh process
// per entry, each asserting URL bytes and that the copy carries its destination.
await writeFile(
  join(cycle, "tsconfig.native.json"),
  JSON.stringify({
    extends: "./tsconfig.app.json",
    compilerOptions: { noCheck: true, outDir: "native", rootDir: ".", sourceMap: false },
    files: [],
    include: ["src/**/*.ts", "generated/**/*.ts"],
  }),
);

const emitted = spawnSync(
  process.execPath,
  [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.native.json"],
  { cwd: cycle, encoding: "utf8" },
);

assert.equal(emitted.status, 0, `${emitted.stdout}${emitted.stderr}`);
await writeFile(
  join(cycle, "native/probe.mjs"),
  `import assert from "node:assert/strict";

await import(new URL(process.argv[2], import.meta.url).href);

const { createUrl } = await import("@loozo/angular-router");
const { routeMetadata } = await import("@loozo/angular-router/_core");
const layout = await import("./src/routes/layout/route.generated.js");
const item = await import("./src/routes/layout/items/$id/destination.generated.js");
const itemCopy = await import("./src/routes/layout/items/$id/route.generated.js");
const other = await import("./src/routes/layout/other/destination.generated.js");

assert.equal(createUrl(item.destination, { params: { id: 5 } }), "/items/5");
assert.equal(createUrl(other.destination, {}), "/other");
assert.equal(routeMetadata(itemCopy.route).destination, item.destination);
assert.equal(routeMetadata(itemCopy.route).parent, layout.route);
`,
);

const entries = [
  "generated/routes.generated.js",
  "generated/destinations.generated.js",
  "src/routes/layout/items/$id/route.generated.js",
  "src/routes/layout/items/$id/destination.generated.js",
  "src/routes/layout/route.js",
];

function runEntries(directory) {
  const results = {};

  for (const entry of entries) {
    const run = spawnSync(process.execPath, ["--import", "@angular/compiler", "probe.mjs", entry], {
      cwd: directory,
      encoding: "utf8",
    });

    results[entry] = { status: run.status, stderr: run.stderr };
  }

  return results;
}

const nativeResults = { positive: runEntries(join(cycle, "native")) };

for (const entry of entries) {
  assert.equal(
    nativeResults.positive[entry].status,
    0,
    `${entry} first: ${nativeResults.positive[entry].stderr}`,
  );
}

// 4. Negative controls on copies of the compiled tree: an eager read of the leaf's own copy, and
// the layout copy importing the leaf copy (a downward copy edge).
async function patched(name, file, prefix) {
  const directory = join(cycle, `native-${name}`);

  await cp(join(cycle, "native"), directory, { recursive: true });

  const source = await readFile(join(directory, file), "utf8");

  await writeFile(join(directory, file), prefix + source);

  return runEntries(directory);
}

nativeResults.ownEager = await patched(
  "own-eager",
  "src/routes/layout/items/$id/route.generated.js",
  'import { route as routegen$self } from "./route.generated.js";\nconst routegen$eager = routegen$self.path;\n',
);
nativeResults.childCopy = await patched(
  "child-copy",
  "src/routes/layout/route.generated.js",
  'import { route as routegen$child } from "./items/$id/route.generated.js";\nexport const routegen$later = () => routegen$child;\n',
);
await writeFile(join(evidence, "cycle-native.json"), JSON.stringify(nativeResults, null, 2));

for (const entry of entries) {
  assert.notEqual(nativeResults.ownEager[entry].status, 0, `own eager read, ${entry} first`);
  assert.match(nativeResults.ownEager[entry].stderr, /ReferenceError/);
}

// The leaf copy reads its parent copy while it evaluates. With a downward edge, every order that
// enters the layout copy before the leaf copy (destinations.generated.js imports home's copy
// first, whose parent is the layout) reads the layout's binding uninitialized; the orders that
// enter the leaf copy first happen to pass.
for (const entry of [
  "generated/destinations.generated.js",
  "src/routes/layout/items/$id/destination.generated.js",
  "src/routes/layout/route.js",
]) {
  assert.notEqual(nativeResults.childCopy[entry].status, 0, `child copy edge, ${entry} first`);
  assert.match(nativeResults.childCopy[entry].stderr, /ReferenceError: Cannot access 'layout'/);
}

for (const entry of [
  "generated/routes.generated.js",
  "src/routes/layout/items/$id/route.generated.js",
]) {
  assert.equal(nativeResults.childCopy[entry].status, 0, `child copy edge, ${entry} first`);
}

console.log(
  "Public Architect generation/check/ownership/watch/repair/stop, real Angular collision browser proof and cycle safety by execution passed",
);
