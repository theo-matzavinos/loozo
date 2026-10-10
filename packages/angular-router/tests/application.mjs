import assert from "node:assert/strict";
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
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(packageDirectory, "../..");
const evidence = resolve(process.argv[2]);

await mkdir(evidence); // Require a fresh receipt/fixture directory.

const fixture = join(evidence, "consumer");

await cp(join(repository, "consumer"), fixture, {
  recursive: true,
  filter: (path) =>
    !/(?:^|\/)(?:node_modules|dist|\.angular|generated)(?:\/|$)/.test(path) &&
    !path.endsWith("route.generated.ts"),
});

const metadata = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));

for (const name of new Set([
  ...Object.keys(metadata.dependencies),
  ...Object.keys(metadata.devDependencies),
  "@loozo/angular-router",
])) {
  const link = join(fixture, "node_modules", name);

  await mkdir(dirname(link), { recursive: true });

  let target = join(packageDirectory, "node_modules", name);

  if (name === "@loozo/angular-router") {
    target = packageDirectory;
  }

  await symlink(target, link, "dir");
}

const require = createRequire(join(packageDirectory, "package.json"));
const { Architect } = require("@angular-devkit/architect");
const { WorkspaceNodeModulesArchitectHost } = require("@angular-devkit/architect/node");
const nativeRequire = createRequire(require.resolve("@angular-devkit/architect"));
const core = nativeRequire("@angular-devkit/core");
const { NodeJsSyncHost } = nativeRequire("@angular-devkit/core/node");
const { chromium } = require("playwright");
let sequence = 0;
const reports = [];

async function architect() {
  const host = core.workspaces.createWorkspaceHost(new NodeJsSyncHost());
  const { workspace } = await core.workspaces.readWorkspace(fixture, host);
  const registry = new core.json.schema.CoreSchemaRegistry();

  registry.addPostTransform(core.json.schema.transforms.addUndefinedDefaults);

  return new Architect(new WorkspaceNodeModulesArchitectHost(workspace, fixture), registry);
}

async function build(overrides = {}) {
  const instance = await architect();
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
        (!generatedOnly || /(?:routes|destinations|route)\.generated\.ts$/.test(file))
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

assert.equal(Object.keys(initial).length, 3);
assert.match(
  initial["generated/routes.generated.ts"].bytes,
  /import\("\.\.\/src\/routes\/home\/page"\)/,
);
assert.doesNotMatch(initial["generated/routes.generated.ts"].bytes, /\.then\(/);
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
  "// @loozo/angular-router routegen: owned route.generated.ts\n// stale\n",
);

const drift = await snapshot();

await expectBuild(false, { check: true });
await expectUnchanged(drift);
assert.match(reports.at(-1).error, /artifacts changed/);
await write("generated/routes.generated.ts", initial["generated/routes.generated.ts"].bytes);
await expectBuild(false, { check: true });
assert.match(reports.at(-1).error, /artifacts missing/);
await write(
  "generated/destinations.generated.ts",
  initial["generated/destinations.generated.ts"].bytes,
);
await expectBuild(false, { check: true });
assert.match(reports.at(-1).error, /artifacts stale/);
await expectBuild(true);

const repaired = await snapshot();

assert.equal(Object.keys(repaired).length, 3);

const definition = await readFile(join(fixture, "src/routes/home/definition.ts"), "utf8");

await write("src/routes/home/definition.ts", `${definition}\nexport default 1;\n`);

const beforeInvalid = await snapshot();

await expectBuild(false);
await expectUnchanged(beforeInvalid);
await write("src/routes/home/definition.ts", definition);
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
  assert.match(reports.at(-1).error, diagnostic);

  const afterCheck = await snapshot(false, true);

  assert.deepEqual(afterCheck, before, `${name}: check must preserve bytes/modes/ns-mtimes`);
  await expectBuild(false);
  assert.match(reports.at(-1).error, diagnostic);

  const afterWrite = await snapshot(false, true);

  assert.deepEqual(afterWrite, before, `${name}: invalid source must precede publication`);
  preflightReports.push({ name, before, afterCheck, afterWrite });
  await writeFile(
    join(evidence, "source-preflight-reports.json"),
    JSON.stringify(preflightReports, null, 2),
  );
}

const tsconfig = await readFile(join(fixture, "tsconfig.routes.json"), "utf8");
const pageSource = await readFile(join(fixture, "src/routes/home/page.ts"), "utf8");

// Genuine cold own-facade aliases and default-imported parents remain admitted.
await rm(join(fixture, "src/routes/home/route.generated.ts"));
await write(
  "src/routes/parent/definition.ts",
  `import { defineRoute as parentRoute } from './route.generated.js';
export default parentRoute('', {});\n`,
);
await write(
  "src/routes/home/definition.ts",
  `import { defineRoute as homeRoute } from './route.generated.js';
import parent from '../parent/definition.js';
export default homeRoute('', { parent });\n`,
);
await expectBuild(true);

const genuineFacade = await snapshot();

await expectBuild(true, { check: true });
await expectUnchanged(genuineFacade);
await write(
  "src/fake-router.ts",
  "export function defineRoute(path: string, config: unknown) { return { path }; }\n",
);

for (const [name, target, diagnostic] of [
  ["fake public facade reexport", "./src/fake-router.ts", /Factory facade.*concrete public entry/],
  [
    "circular facade reexport",
    "./src/routes/home/route.generated.ts",
    /Factory facade.*concrete public entry/,
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
await write("src/routes/home/definition.ts", definition);
await expectBuild(true);

// Literal dynamic dependencies and type-import/equals module references are
// resolved natively. A retained generated target can be reached via a helper.
await write(
  "src/helper.ts",
  "export const retained = () => import('./routes/home/route.generated.js');\n",
);
await write(
  "src/routes/home/page.ts",
  "export const lazyHelper = () => import(`../../helper.js`);\n" +
    "export type Helper = typeof import('../../helper.js');\n" +
    pageSource,
);
await write(
  "src/helper-types.d.ts",
  "export type Retained = typeof import('./routes/home/route.generated.js');\n",
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
  await write("src/routes/home/page.ts", reference + "\n" + pageSource);
  await expectPreflight(name, /page\.ts:\d+:\d+: Unresolved import: .*missing-helper/);
}

await write("src/routes/home/page.ts", pageSource);
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
  "// @loozo/angular-router routegen: owned route.generated.ts\n// removable obsolete body\n",
);
await write(
  "src/helper.ts",
  "export const obsolete = () => import('./routes/obsolete/route.generated.js');\n",
);
// Even a native ambient pattern cannot authorize a physically resolved stale file.
await write("src/ambient.d.ts", "declare module '*route.generated.js';\n");
await expectPreflight(
  "unretained dynamic facade",
  /helper\.ts:\d+:\d+: Generated import is not a retained owned target/,
);
await rm(join(fixture, "src/routes/obsolete"), { recursive: true });

// Known redirects/pruned owners and unadmitted locations never acquire facades
// through ambient declarations, even when the target and its directory are absent.
const facadeless = `import { defineRoute } from '@loozo/angular-router';
import target from '../home/definition.js';
export default defineRoute('facadeless', { redirect: { to: target, search: { mode: 'drop' }, fragment: { mode: 'drop' } } });\n`;

await write("src/routes/facadeless/definition.ts", facadeless);
await write(
  "src/helper.ts",
  "export const absent = () => import('./routes/facadeless/route.generated.js');\n",
);
await rm(join(fixture, "src/ambient.d.ts"));
await expectPreflight(
  "absent redirect facade without ambient",
  /helper\.ts:\d+:\d+: Generated import is not a retained owned target/,
);
await write("src/ambient.d.ts", "declare module '*route.generated.js';\n");
await expectPreflight(
  "absent redirect facade with ambient",
  /helper\.ts:\d+:\d+: Generated import is not a retained owned target/,
);
await write(
  "src/routes/facadeless/route.generated.ts",
  "// @loozo/angular-router routegen: owned route.generated.ts\n// obsolete redirect facade\n",
);
await expectPreflight(
  "present redirect facade with ambient",
  /helper\.ts:\d+:\d+: Generated import is not a retained owned target/,
);
await rm(join(fixture, "src/routes/facadeless/route.generated.ts"));
await write(
  "src/routes/pruned/definition.ts",
  "import { defineRoute } from '@loozo/angular-router';\nexport default defineRoute('pruned', {});\n",
);
await write(
  "src/routes/pruned/alias/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';
import parent from '../definition.js';
import target from '../../home/definition.js';
export default defineRoute('alias', { parent, redirect: { to: target, search: { mode: 'drop' }, fragment: { mode: 'drop' } } });\n`,
);
await write(
  "src/helper.ts",
  "export const absent = () => import('./routes/pruned/route.generated.js');\n",
);
await expectPreflight(
  "absent pruned facade with ambient",
  /helper\.ts:\d+:\d+: Generated import is not a retained owned target/,
);
await write(
  "src/helper.ts",
  "export const absent = () => import('./routes/unadmitted-new/route.generated.js');\n",
);
await expectPreflight(
  "absent unadmitted facade and directory with ambient",
  /helper\.ts:\d+:\d+: Generated import is not a retained owned target/,
);

const facadePaths = JSON.parse(tsconfig);

facadePaths.compilerOptions = {
  ...facadePaths.compilerOptions,
  paths: { "@facadeless": ["./src/routes/facadeless/route.generated.js"] },
};
await write("tsconfig.routes.json", JSON.stringify(facadePaths));
await write(
  "src/ambient.d.ts",
  "declare module '*route.generated.js';\ndeclare module '@facadeless';\n",
);
await write("src/helper.ts", "export const absent = () => import('@facadeless');\n");
await expectPreflight(
  "native paths absent facade with exact ambient",
  /helper\.ts:\d+:\d+: Generated import is not a retained owned target/,
);
await write("tsconfig.routes.json", tsconfig);
await rm(join(fixture, "src/routes/facadeless"), { recursive: true });
await rm(join(fixture, "src/routes/pruned"), { recursive: true });
await write("src/ambient.d.ts", "declare module '*route.generated.js';\n");
await write(
  "src/helper.ts",
  "export const retained = () => import('./routes/home/route.generated.js');\n",
);
await rm(join(fixture, "src/routes/home/route.generated.ts"));
await expectBuild(true);

const coldRetained = await snapshot(false);

await expectBuild(true, { check: true });

const checkedRetained = await snapshot(false);

assert.deepEqual(checkedRetained, coldRetained);
preflightReports.push({
  name: "cold retained facade with ambient",
  before: coldRetained,
  after: checkedRetained,
});
await rm(join(fixture, "src/helper.ts"));
await rm(join(fixture, "src/ambient.d.ts"));

// Native exact/pattern ambient module bindings are legitimate ordinary helpers.
await write(
  "src/routes/home/page.ts",
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
  "src/routes/home/page.ts",
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
  "src/routes/home/page.ts",
  "import type { Opaque } from 'missing/helper';\ntype Keep = Opaque;\n" + pageSource,
);
await expectPreflight(
  "unknown ambient helper",
  /page\.ts:\d+:\d+: Unresolved import: missing\/helper/,
);
await write("src/routes/home/page.ts", pageSource);
await write(
  "src/ambient.d.ts",
  "declare module 'virtual/*' { export function defineRoute(path: string, config: unknown): unknown; }\n",
);
await write(
  "src/routes/home/definition.ts",
  "import { defineRoute } from 'virtual/factory';\nexport default defineRoute('', {});\n",
);
await expectPreflight(
  "ambient cannot supply factory provenance",
  /defineRoute import.*concrete public entry/,
);
await write("src/routes/home/definition.ts", definition);
await write(
  "src/ambient.d.ts",
  "declare module 'virtual/*' { export function Component(value: unknown): ClassDecorator; }\n",
);
await write("src/routes/home/page.ts", pageSource.replace("@angular/core", "virtual/angular"));
await expectPreflight(
  "ambient cannot supply Angular provenance",
  /Component decorator is not from consumer-installed/,
);
await write("src/routes/home/page.ts", pageSource);
await rm(join(fixture, "src/ambient.d.ts"));
await expectBuild(true);

// Redirect policy/type preflight must be atomic, before Angular's own checking.
await write(
  "src/routes/home/definition.ts",
  definition.replace('defineRoute("", {})', 'defineRoute("", { fragments: ["summary"] })'),
);

const alias = `import { defineRoute } from '@loozo/angular-router';
import target from '../home/definition.js';
export default defineRoute('alias', { redirect: { to: target, search: { mode: 'drop' }, fragment: { mode: 'replace', value: 'summary' } } });\n`;

await write("src/routes/alias/definition.ts", alias);
await expectBuild(true);

const validRedirect = await snapshot();

await write(
  "src/routes/alias/definition.ts",
  alias.replace("value: 'summary'", "value: 'unknown'"),
);
await expectBuild(false);
await expectUnchanged(validRedirect);
assert.match(reports.at(-1).error, /replacement fragment is not declared/);
await write(
  "src/routes/alias/definition.ts",
  alias.replace("mode: 'drop'", "mode: 'drop', values: {}"),
);
await expectBuild(false);
await expectUnchanged(validRedirect);
assert.match(reports.at(-1).error, /Unknown redirect search policy key/);
await rm(join(fixture, "src/routes/alias"), { recursive: true });
await write("src/routes/home/definition.ts", definition);
await expectBuild(true);

// A real Angular regression, not just a resolver analogue: extensionless page.js
// selects named-only page.ts. Emitted page.js.js must load the discovered page.js.ts.
await rename(join(fixture, "src/routes/home/page.ts"), join(fixture, "src/routes/home/page.js.ts"));
await write("src/routes/home/page.ts", "export const helper = 1;\n");
await expectBuild(true);

const lazyCollision = await snapshot();

assert.match(
  lazyCollision["generated/routes.generated.ts"].bytes,
  /import\("\.\.\/src\/routes\/home\/page\.js\.js"\)/,
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
    executablePath: "/usr/bin/chromium",
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
    "src/routes/home/definition.ts",
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

  await write("src/routes/home/definition.ts", `${definition}\nexport default 1;\n`);
  await waitFor(
    () => logs.some((entry) => entry.message.includes("Multiple competing default exports")),
    "Later generation failure was not logged",
  );
  await expectUnchanged(beforeFailure);
  await write("src/routes/home/definition.ts", definition);
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
  "src/routes/home/definition.ts",
  definition.replace('defineRoute("",', 'defineRoute("after-stop",'),
);
await new Promise((done) => setTimeout(done, 600));
await expectUnchanged(stopped, "Stopped server must not publish after subsequent edits");
await writeFile(join(evidence, "final-artifacts.json"), JSON.stringify(stopped, null, 2));
console.log(
  "Public Architect generation/check/ownership/watch/repair/stop and real Angular collision browser proof passed",
);
