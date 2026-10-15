import assert from "node:assert/strict";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(packageDirectory, "../..");
const evidence = resolve(process.argv[2]);

await mkdir(evidence);

const fixture = join(evidence, "consumer");

await cp(join(repository, "examples/angular-router"), fixture, {
  recursive: true,
  filter: (path) => !/(?:^|\/)(?:node_modules|dist|\.angular|generated|routes)(?:\/|$)/.test(path),
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
// The example's build target omits autoDefineRoutes, so filesystem mode is on by default.
const workspace = JSON.parse(await readFile(join(fixture, "angular.json"), "utf8"));

assert.equal(
  Object.hasOwn(workspace.projects.proof.architect.build.options, "autoDefineRoutes"),
  false,
);

const reports = [];
const observations = [];

async function architect() {
  const host = core.workspaces.createWorkspaceHost(new NodeJsSyncHost());
  const { workspace: definition } = await core.workspaces.readWorkspace(fixture, host);
  const registry = new core.json.schema.CoreSchemaRegistry();

  registry.addPostTransform(core.json.schema.transforms.addUndefinedDefaults);

  return new Architect(new WorkspaceNodeModulesArchitectHost(definition, fixture), registry);
}

async function build(overrides = {}, target = "build") {
  const instance = await architect();
  const logger = new core.logging.Logger("filesystem");
  const report = { target, overrides, logs: [] };

  reports.push(report);
  logger.subscribe((entry) => report.logs.push(entry));

  let run;

  try {
    run = await instance.scheduleTarget({ project: "proof", target }, overrides, { logger });
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

async function expectBuild(overrides = {}) {
  assert.equal(await build(overrides), true, JSON.stringify(reports.at(-1)));
}

// Serve reads its router options from the build target, so invalid ones go there.
async function rejectsServe(base, buildOptions, message) {
  const configuration = structuredClone(base);

  Object.assign(configuration.projects.proof.architect.build.options, buildOptions);
  await writeFile(join(fixture, "angular.json"), JSON.stringify(configuration));

  const before = await snapshot();

  assert.equal(await build({}, "serve"), false);
  assert.match(reports.at(-1).error, message);
  assert.deepEqual(await snapshot(), before);
}

async function write(path, bytes) {
  const file = join(fixture, path);

  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

async function read(path) {
  return readFile(join(fixture, path), "utf8");
}

async function exists(path) {
  try {
    await lstat(join(fixture, path));

    return true;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    return false;
  }
}

async function snapshot() {
  const files = {};

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });

    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));

    for (const entry of entries) {
      if (["node_modules", "dist", ".angular"].includes(entry.name)) {
        continue;
      }

      const file = join(directory, entry.name);
      const info = await lstat(file, { bigint: true });
      const key = file.slice(fixture.length + 1);

      if (entry.isDirectory()) {
        files[key] = { mode: String(info.mode), mtimeNs: String(info.mtimeNs) };
        await visit(file);
      } else if (entry.isFile()) {
        files[key] = {
          bytes: await readFile(file, "utf8"),
          mode: String(info.mode),
          mtimeNs: String(info.mtimeNs),
        };
      }
    }
  }

  await visit(fixture);

  return files;
}

async function preflight(name, diagnostic, overrides = {}) {
  const before = await snapshot();

  const attempts = [];

  for (const check of [true, false]) {
    assert.equal(await build({ ...overrides, check }), false, name);
    assert.match(JSON.stringify(reports.at(-1)), diagnostic, name);

    const after = await snapshot();

    assert.deepEqual(after, before, `${name}: complete source/product preflight nonwrites`);
    attempts.push({ check, after });
  }

  observations.push({ name, before, attempts });
  await writeFile(join(evidence, "observations.json"), JSON.stringify(observations, null, 2));
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }

    await new Promise((done) => setTimeout(done, 100));
  }

  throw new Error(message);
}

function page(label) {
  return `import { Component } from "@angular/core";
@Component({ template: '<p data-proof="filesystem">${label}</p>' })
export default class Page {}\n`;
}

// Only directories with a page or a declaration become records; the authored root declaration
// gives top-level records a parent to synchronize.
await write(
  "src/routes/route.ts",
  'import { defineRoute } from "@loozo/angular-router";\n\nexport default defineRoute("", {});\n',
);
await write("src/routes/home/page.ts", page("home"));
await write(
  "src/routes/+layout/page.ts",
  `import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
@Component({ imports: [RouterOutlet], template: "<router-outlet />" })
export default class Layout {}\n`,
);
await write("src/routes/+layout/plain/page.ts", page("plain"));
await write("src/routes/-tools/flat/page.ts", page("flat"));
await write(
  "src/routes/-tools/ignored.ts",
  'import { defineRoute } from "@loozo/angular-router";\nexport default defineRoute("discarded-structural-path", {});\n',
);
await write(
  "src/routes/unused/helper.ts",
  'export const helper = 1;\nthrow new Error("Source analysis must never evaluate application modules");\n',
);
await mkdir(join(fixture, "src/routes/empty"));
await write("src/routes/teams/$team/$id/page.ts", page("item"));
await write("src/routes/files/$parts[]/page.ts", page("files"));

const team = `// Keep this header and the exact codec/data expressions.
import { defineRoute, numberParam } from "@loozo/angular-router";
export const marker = { untouched: "bytes" };
export default defineRoute('$team', {
  params: { team: numberParam /* custom numeric codec */ },
  data: marker,
});\n`;

await write("src/routes/teams/$team/named-definition.ts", team);

// New parent imports must not detach statement-bound directives or leading refs.
await write("src/legacy.js", 'export const legacy = "legacy";\n');
await write("src/routes/trivia/page.ts", page("trivia"));

const trivia = `#!/usr/bin/env node
/// <reference lib="es2022" />
// @ts-expect-error This legacy JavaScript module intentionally has no declarations.
import { legacy } from "../../legacy.js"; // keep this trailing comment
import { defineRoute } from "@loozo/angular-router";
// @ts-expect-error Keep this directive attached to the following statement too.
const suppressed: number = "retained";
export const unrelated = legacy;
export default defineRoute("trivia", { data: { suppressed } });
`;

await write("src/routes/trivia/definition.ts", trivia);
await write("src/routes/bom/$bom/page.ts", page("bom"));

const bom =
  '\uFEFF// Preserve raw UTF-8 BOM and CRLF bytes.\r\nimport { defineRoute } from "@loozo/angular-router"; // retained\r\nexport default defineRoute("before", {});\r\n';

await write("src/routes/bom/$bom/definition.ts", Buffer.from(bom, "utf8"));

// A block comment's internal line break precedes the next statement's directive.
const blockLint = `import { defineRoute } from "@loozo/angular-router"; /* retained
 */ // eslint-disable-next-line no-console
console.log('existing');
export default defineRoute("block-lint", {});
`;
const blockTypeScript = `import { defineRoute } from "@loozo/angular-router"; /* retained
 */ // @ts-expect-error Keep this attached to the invalid assignment, not a new import.
const suppressed: number = "retained";
export default defineRoute("block-ts", { data: { suppressed } });
`;

await write("src/routes/block-lint/page.ts", page("block-lint"));
await write("src/routes/block-lint/definition.ts", blockLint);
await write("src/routes/block-ts/page.ts", page("block-ts"));
await write("src/routes/block-ts/definition.ts", blockTypeScript);

const trailingLine = `import { defineRoute } from "@loozo/angular-router"; // eslint-disable-next-line no-console
console.log('retained');
export default defineRoute("trailing-line", {});
`;
const trailingBlock = `import { defineRoute } from "@loozo/angular-router"; /* eslint-disable-next-line no-console
 */
console.log('retained');
export default defineRoute("trailing-block", {});
`;
const trailingTypeScript = `import { defineRoute } from "@loozo/angular-router"; /* retained
 @ts-expect-error Keep suppression on the following assignment. */
const suppressed: number = "retained";
export default defineRoute("trailing-ts-block", { data: { suppressed } });
`;

for (const [directory, source] of [
  ["trailing-line", trailingLine],
  ["trailing-block", trailingBlock],
  ["trailing-ts-block", trailingTypeScript],
]) {
  await write(`src/routes/${directory}/page.ts`, page(directory));
  await write(`src/routes/${directory}/definition.ts`, source);
}

await write("src/routes/bom-shebang/$value/page.ts", page("bom-shebang"));

const bomShebang =
  '\uFEFF#!/usr/bin/env node\r\n// Keep BOM, shebang and CRLF together.\r\nimport { defineRoute } from "@loozo/angular-router";\r\nexport default defineRoute("before", {});\r\n';

await write("src/routes/bom-shebang/$value/definition.ts", Buffer.from(bomShebang, "utf8"));

const cold = await snapshot();

assert.equal(await build({ check: true }), false);
assert.match(JSON.stringify(reports.at(-1)), /definitions missing\/changed/);
assert.deepEqual(await snapshot(), cold);
await expectBuild();

const routerImport = 'import { defineRoute } from "@loozo/angular-router";';
const parentImport = 'import parent from "../route.js";';

assert.match(await read("src/routes/+layout/route.ts"), /defineRoute\("", \{ parent \}\)/);
assert.match(await read("src/routes/+layout/plain/route.ts"), /defineRoute\("plain",/);
assert.equal(
  await read("src/routes/-tools/flat/route.ts"),
  `${routerImport}\nimport parent from "../../route.js";\n\nexport default defineRoute("flat", { parent });\n`,
);
assert.equal(await exists("src/routes/-tools/route.ts"), false);
assert.equal(await exists("src/routes/-tools/route.generated.ts"), false);
assert.equal(await exists("src/routes/unused/route.ts"), false);
assert.equal(await exists("src/routes/empty/route.ts"), false);
// Page-less directories contribute their segment to the records below them.
assert.equal(await exists("src/routes/teams/route.ts"), false);
assert.equal(await exists("src/routes/teams/$team/route.ts"), false);
assert.match(await read("src/routes/teams/$team/named-definition.ts"), /"teams\/\$team"/);
assert.equal(await exists("src/routes/files/route.ts"), false);
assert.match(
  await read("src/routes/files/$parts[]/route.ts"),
  /defineRoute\("files\/\$parts\[\]", \{ parent, params: \{ "parts": stringParam \} \}\)/,
);
assert.match(await read("generated/routes.generated.ts"), /path: "teams\/:team"/);
assert.equal(
  await read("src/routes/trivia/definition.ts"),
  trivia
    .replace(routerImport, `${routerImport}\n${parentImport}`)
    .replace("{ data: { suppressed } }", "{ data: { suppressed } , parent }"),
  "A new import follows the last import, before a directive on the next line",
);
assert.deepEqual(
  await readFile(join(fixture, "src/routes/bom/$bom/definition.ts")),
  Buffer.from(
    bom
      .replace(
        "// retained\r\n",
        `// retained\r\nimport { stringParam } from "@loozo/angular-router";\r\nimport parent from "../../route.js";\r\n`,
      )
      .replace('"before"', '"bom/$bom"')
      .replace("{}", '{ params: { "bom": stringParam }, parent }'),
    "utf8",
  ),
  "Surgical source patches retain exact BOM/CRLF bytes and keep a same-line comment on its import",
);

// A directive or multiline comment after the last import can bind to the next line, so a new
// import goes before it.
for (const [directory, source, message] of [
  ["block-lint", blockLint, "lint directive after a multiline trailing comment"],
  ["block-ts", blockTypeScript, "TypeScript directive after a multiline trailing comment"],
  ["trailing-line", trailingLine, "trailing lint directive"],
  ["trailing-block", trailingBlock, "lint directive in a trailing multiline comment"],
  ["trailing-ts-block", trailingTypeScript, "TypeScript directive in a trailing multiline comment"],
]) {
  assert.equal(
    await read(`src/routes/${directory}/definition.ts`),
    source
      .replace(routerImport, `${routerImport}\n${parentImport}`)
      .replace("{}", "{ parent }")
      .replace("{ data: { suppressed } }", "{ data: { suppressed } , parent }"),
    `New import cannot detach a ${message}`,
  );
}

assert.deepEqual(
  await readFile(join(fixture, "src/routes/bom-shebang/$value/definition.ts")),
  Buffer.from(
    bomShebang
      .replace(
        `${routerImport}\r\n`,
        `${routerImport}\r\nimport { stringParam } from "@loozo/angular-router";\r\nimport parent from "../../route.js";\r\n`,
      )
      .replace('"before"', '"bom-shebang/$value"')
      .replace("{}", '{ params: { "value": stringParam }, parent }'),
    "utf8",
  ),
  "Compiler normalization must not alter raw BOM/shebang/CRLF publication bytes",
);

const initialized = await snapshot();
const initializedBom = await readFile(join(fixture, "src/routes/bom/$bom/definition.ts"));
const initializedBomShebang = await readFile(
  join(fixture, "src/routes/bom-shebang/$value/definition.ts"),
);

await expectBuild();
assert.deepEqual(
  await snapshot(),
  initialized,
  "No-op preserves all source/generated nanosecond mtimes",
);
await expectBuild({ check: true });
assert.deepEqual(await snapshot(), initialized);
assert.deepEqual(
  await readFile(join(fixture, "src/routes/bom/$bom/definition.ts")),
  initializedBom,
  "No-op and read-only check retain the exact authored Buffer",
);
assert.deepEqual(
  await readFile(join(fixture, "src/routes/bom-shebang/$value/definition.ts")),
  initializedBomShebang,
  "No-op and read-only check retain BOM/shebang/CRLF and the snapshot's ns mtimes",
);

// Unrelated semantic errors belong to the native application build, not preflight.
await write("src/unrelated-type-error.ts", 'export const unrelatedFailure: number = "native";\n');
await write("src/routes/native-owned/page.ts", page("native-owned"));
assert.equal(await build(), false);
assert.match(JSON.stringify(reports.at(-1)), /TS2322|not assignable to type 'number'/);
assert.equal(await exists("src/routes/native-owned/route.ts"), true);
assert.match(await read("generated/routes.generated.ts"), /path: "native-owned"/);
await rm(join(fixture, "src/unrelated-type-error.ts"));
await rm(join(fixture, "src/routes/native-owned"), { recursive: true });
await expectBuild();

// Root structural repair removes its solely-used parent import without printer rewrites.
const rootSource = `// Keep root trivia, including commas inside comments.
import { defineRoute } from "@loozo/angular-router";
import previous from "./home/route.js";
export const marker = { untouched: "root bytes" };
export default defineRoute("configured-root", { data: marker /* comma, retained */, parent: previous /* parent comment, retained */ });\n`;

await write("src/routes/route.ts", rootSource);
await expectBuild();
assert.equal(
  await read("src/routes/route.ts"),
  rootSource
    .replace('import previous from "./home/route.js";', "")
    .replace('"configured-root"', '""')
    .replace(", parent: previous", " "),
);

// Property keys/member names are not references to an imported parent binding.
const repairedRoot = await read("src/routes/route.ts");
const rootConfig = await read("tsconfig.routes.json");
const noUnused = JSON.parse(rootConfig);

noUnused.compilerOptions = { ...noUnused.compilerOptions, noUnusedLocals: true };
await write("tsconfig.routes.json", JSON.stringify(noUnused));

for (const binding of ["previous", "parent"]) {
  const rootExplicitParent = `import { defineRoute } from "@loozo/angular-router";
import ${binding} from "./home/route.js";
export const keyOnly = { ${binding}: "key" }.${binding};
export default defineRoute("configured-root", { parent: ${binding} });
`;

  await write("src/routes/route.ts", rootExplicitParent);
  await expectBuild();
  assert.equal(
    await read("src/routes/route.ts"),
    rootExplicitParent
      .replace(`import ${binding} from "./home/route.js";`, "")
      .replace('"configured-root"', '""')
      .replace(`parent: ${binding}`, ""),
    "Only actual binding references can prevent sole-parent import removal",
  );
}

const rootShorthand = `import { defineRoute } from "@loozo/angular-router";
import parent from "./home/route.js";
export const shared = { parent };
export default defineRoute("configured-root", { parent: parent });
`;

await write("src/routes/route.ts", rootShorthand);
await expectBuild();
assert.equal(
  await read("src/routes/route.ts"),
  rootShorthand.replace('"configured-root"', '""').replace("parent: parent", ""),
  "Shorthand value references must keep the unrelated imported binding",
);
await write("tsconfig.routes.json", rootConfig);
await write("src/routes/route.ts", repairedRoot);
await expectBuild();

// Removing directive-bound syntax must never transfer suppression onto a config.
await write("src/routes/directive-pending/page.ts", page("directive-pending"));

for (const config of ["parent: previous, search: { q: 7 }", "parent: previous"]) {
  await write(
    "src/routes/route.ts",
    `import { defineRoute } from "@loozo/angular-router";
// @ts-expect-error This missing stale parent import is intentionally suppressed.
import previous from "./missing-parent.js";
export default defineRoute("wrong", { ${config} });
`,
  );
  await preflight("directive-bound stale parent import", /Cannot remove directive-bound/);
  assert.equal(await exists("src/routes/directive-pending/route.ts"), false);
}

await write(
  "src/routes/route.ts",
  `import { defineRoute } from "@loozo/angular-router";
import previous from "./home/route.js";
export default defineRoute("wrong", {
  // @ts-ignore Attached to parent; it must not drift onto the invalid search map.
  parent: previous,
  search: { q: 7 },
});
`,
);
await preflight("directive-bound parent property", /Cannot remove directive-bound/);
assert.equal(await exists("src/routes/directive-pending/route.ts"), false);

for (const [name, source] of [
  [
    "directive inside removed import",
    `import { defineRoute } from "@loozo/angular-router";
import previous from
// @ts-ignore -- authored rationale must not be deleted.
"./missing.js";
export default defineRoute("wrong", { parent: previous });
`,
  ],
  [
    "directive inside removed parent property",
    `import { defineRoute } from "@loozo/angular-router";
import previous from "./home/route.js";
export default defineRoute("wrong", { parent:
// @ts-ignore -- authored rationale must not be deleted.
previous });
`,
  ],
]) {
  await write("src/routes/route.ts", source);
  await preflight(name, /Cannot remove directive-bound/);
  assert.equal(await exists("src/routes/directive-pending/route.ts"), false);
}

// Retaining dormant compiler pragmas after import removal could activate them.
// In particular, nocheck must not hide this invalid codec after synchronization.
for (const directive of [
  "// @ts-nocheck",
  "// @ts-check",
  "// @TS-NOCHECK",
  '/// <reference path="./missing-pragma.d.ts" />',
  '/// <amd-module name="authored" />',
  '/// <amd-dependency path="authored" />',
  "/* @jsx h */",
  "/* @jsxFrag Fragment */",
  "/* @jsxImportSource authored */",
  "/* @jsxRuntime automatic */",
]) {
  await write(
    "src/routes/route.ts",
    `import previous from
${directive}
"./home/route.js";
import { defineRoute } from "@loozo/angular-router";
export default defineRoute("wrong", { parent: previous, search: { q: 7 } });
`,
  );
  await preflight(
    `dormant compiler pragma with invalid codec: ${directive}`,
    /Cannot remove directive-bound/,
  );
  assert.equal(await exists("src/routes/directive-pending/route.ts"), false);
}

// Trailing and next-statement-leading trivia can also become module-leading.
for (const [name, trivia] of [
  ["trailing single-line nocheck", " // @ts-nocheck\n"],
  ["trailing multiline JSX pragma", " /* retained\n @jsxRuntime automatic\n */\n"],
  ["next-statement leading nocheck", "\n// ordinary retained comment\n// @ts-nocheck\n"],
  ["next-statement leading check", "\n// @ts-check\n"],
  ["next-statement leading triple-slash", '\n/// <reference path="./missing-pragma.d.ts" />\n'],
  ["EOF trailing pragma", " // @ts-nocheck"],
]) {
  let source = `import previous from "./home/route.js";${trivia}import { defineRoute } from "@loozo/angular-router";\nexport default defineRoute("wrong", { parent: previous, search: { q: 7 } });\n`;

  if (name === "EOF trailing pragma") {
    source = `import { defineRoute } from "@loozo/angular-router";\nexport default defineRoute("wrong", { parent: previous, search: { q: 7 } });\nimport previous from "./home/route.js";${trivia}`;
  }

  await write("src/routes/route.ts", source);
  await preflight(`adjacent retained directive: ${name}`, /Cannot remove directive-bound/);
  assert.equal(await exists("src/routes/directive-pending/route.ts"), false);
}

await rm(join(fixture, "src/routes/directive-pending"), { recursive: true });
await write("src/routes/route.ts", repairedRoot);
await expectBuild();

// Ordinary comments within removable syntax are retained, not rejected/deleted.
const commentedRoot = `import { defineRoute } from "@loozo/angular-router";
import previous /* import rationale */ from "./home/route.js"; // trailing import rationale
/* leading next-statement rationale */
export default defineRoute("configured-root", { parent: /* parent rationale */ previous });
`;

await write("src/routes/route.ts", commentedRoot);
await expectBuild();
assert.equal(
  await read("src/routes/route.ts"),
  commentedRoot
    .replace(
      'import previous /* import rationale */ from "./home/route.js";',
      "  /* import rationale */  ",
    )
    .replace('"configured-root"', '""')
    .replace("parent: /* parent rationale */ previous", " /* parent rationale */ "),
  "Normal authored comments remain byte-identical while obsolete syntax is removed",
);
await write("src/routes/route.ts", repairedRoot);
await expectBuild();

// Changing the seed filename never renames or restricts existing discovery.
await write("src/routes/custom/page.ts", page("custom"));
await expectBuild({ autoDefineRoutes: { filename: "definition.ts" } });
assert.equal(await exists("src/routes/custom/definition.ts"), true);
assert.equal(await exists("src/routes/custom/route.ts"), false);
await rename(
  join(fixture, "src/routes/home/route.ts"),
  join(fixture, "src/routes/home/handwritten.ts"),
);
await expectBuild();
assert.equal(await exists("src/routes/home/route.ts"), false);
assert.match(await read("src/routes/home/route.generated.ts"), /home\/handwritten.ts/);

// Native strict generated-consumer types: inherited numeric/custom and local defaults.
await write(
  "src/typed-consumer.ts",
  `import { injectRoute as item } from "./routes/teams/$team/$id/route.generated.js";
import { injectRoute as files } from "./routes/files/$parts[]/route.generated.js";
export function consumer() {
  item().link(".", { params: { team: 7, id: "text" } });
  // @ts-expect-error inherited codec remains numeric
  item().link(".", { params: { team: "7", id: "text" } });
  // @ts-expect-error seeded local scalar remains string
  item().link(".", { params: { team: 7, id: 8 } });
  files().link(".", { params: { parts: ["a", "b"] } });
  // @ts-expect-error catchall codec is applied per element
  files().link(".", { params: { parts: "a" } });
}\n`,
);
await expectBuild();
await rm(join(fixture, "src/typed-consumer.ts"));

// Rename local params without touching codec expressions or unrelated authored bytes.
await rename(join(fixture, "src/routes/teams/$team"), join(fixture, "src/routes/teams/$tenant"));
await rename(
  join(fixture, "src/routes/+layout/plain"),
  join(fixture, "src/routes/+layout/renamed"),
);

const moved = await snapshot();

assert.equal(await build({ check: true }), false);
assert.match(JSON.stringify(reports.at(-1)), /definitions missing\/changed/);
assert.deepEqual(await snapshot(), moved);
await expectBuild();

const tenant = await read("src/routes/teams/$tenant/named-definition.ts");
const beforeTenant = initialized["src/routes/teams/$team/named-definition.ts"].bytes;

assert.equal(
  tenant,
  beforeTenant
    .replace('"teams/$team"', '"teams/$tenant"')
    .replace("team: numberParam", '"tenant": numberParam'),
);
assert.match(await read("src/routes/+layout/renamed/route.ts"), /defineRoute\("renamed",/);

// Reparent while keeping an old import's unrelated uses intact.
const flat = await read("src/routes/-tools/flat/route.ts");

await write("src/routes/-tools/flat/route.ts", `${flat}\nexport const unrelated = parent;\n`);
await rename(join(fixture, "src/routes/-tools/flat"), join(fixture, "src/routes/+layout/moved"));
await expectBuild();

const reparented = await read("src/routes/+layout/moved/route.ts");

assert.match(reparented, /import parent from "\.\.\/\.\.\/route.js"/);
assert.match(reparented, /export const unrelated = parent;/);
assert.match(reparented, /parent: filesystemParent/);
assert.match(reparented, /import filesystemParent from "\.\.\/route.js"/);

const renamed = await read("src/routes/+layout/renamed/route.ts");
const sharedParent = `${renamed}\nexport const sameParent = parent;\n`;

await write("src/routes/+layout/renamed/route.ts", sharedParent);
await rm(join(fixture, "src/routes/+layout/route.ts"));
await expectBuild();
assert.equal(
  await read("src/routes/+layout/renamed/route.ts"),
  sharedParent,
  "Resolution sees a planned ancestor seed before judging shared parent imports stale",
);

// A custom per-element codec remains the exact same expression on a param rename.
const custom = `import { defineRoute } from "@loozo/angular-router";
const codec = { parse: (raw: string) => ({ value: raw }), stringify: (value: { value: string }) => value.value };
export default defineRoute("$old[]", { params: { old: codec /* do not replace */ } });\n`;

await write("src/routes/custom-files/$values[]/declaration.ts", custom);
await write("src/routes/custom-files/$values[]/page.ts", page("custom-files"));
await expectBuild();
assert.match(
  await read("src/routes/custom-files/$values[]/declaration.ts"),
  /"values": codec \/\* do not replace \*\//,
);
await write(
  "src/custom-types.ts",
  `import { injectRoute } from "./routes/custom-files/$values[]/route.generated.js";
export function consumer() {
  injectRoute().link(".", { params: { values: [{ value: "x" }] } });
  // @ts-expect-error the authored per-element codec is not stringParam
  injectRoute().link(".", { params: { values: ["x"] } });
}\n`,
);
await expectBuild();
await rm(join(fixture, "src/custom-types.ts"));

// `false` opts out into explicit authoring and does not synchronize structural fields.
const explicit = await read("src/routes/custom/definition.ts");
const transparentDefinition = await read("src/routes/-tools/ignored.ts");

await rm(join(fixture, "src/routes/-tools/ignored.ts"));
await write("src/routes/custom/definition.ts", explicit.replace('"custom"', '"explicit"'));

const disabledWorkspace = structuredClone(workspace);

disabledWorkspace.projects.proof.architect.build.options.autoDefineRoutes = false;
await writeFile(join(fixture, "angular.json"), JSON.stringify(disabledWorkspace));
await expectBuild();
assert.match(await read("generated/routes.generated.ts"), /path: "explicit"/);
assert.match(await read("src/routes/custom/definition.ts"), /defineRoute\("explicit",/);
await write("src/routes/opt-out/page.ts", page("opt-out"));
await preflight("opt-out never seeds", /Component without a colocated admitted declaration/);
assert.equal(await exists("src/routes/opt-out/route.ts"), false);
await rm(join(fixture, "src/routes/opt-out"), { recursive: true });
await writeFile(join(fixture, "angular.json"), JSON.stringify(workspace));
await write("src/routes/-tools/ignored.ts", transparentDefinition);
await expectBuild();

for (const autoDefineRoutes of [
  true,
  null,
  [],
  { extra: true },
  { filename: 7 },
  { filename: "../route.ts" },
  { filename: "route.generated.ts" },
  { filename: "routes.generated.ts" },
  { filename: "destinations.generated.ts" },
  { filename: "types.d.ts" },
]) {
  const before = await snapshot();

  assert.equal(await build({ autoDefineRoutes }), false);
  assert.deepEqual(await snapshot(), before);
  await rejectsServe(workspace, { autoDefineRoutes }, /autoDefineRoutes/);
}

for (const enabled of [true, false]) {
  let configuration = disabledWorkspace;

  if (enabled) {
    configuration = workspace;
  }

  await writeFile(join(fixture, "angular.json"), JSON.stringify(configuration));

  const before = await snapshot();
  const scanDirectories = ["src/routes", "src/other"];

  assert.equal(await build({ scanDirectories }), false);
  assert.deepEqual(await snapshot(), before);
  await rejectsServe(configuration, { scanDirectories }, /scanDirectories/);
}

// Angular's options are validated before generation, by serve as well as build; serve always writes.
await rejectsServe(workspace, { browsr: "src/main.ts" }, /browsr/);
await rejectsServe(workspace, { check: true }, /check: true/);
await writeFile(join(fixture, "angular.json"), JSON.stringify(workspace));

{
  const before = await snapshot();

  assert.equal(await build({ browsr: "src/main.ts" }), false);
  assert.match(reports.at(-1).error, /browsr/);
  assert.equal(await build({ poll: 0 }, "serve"), false);
  assert.match(reports.at(-1).error, /poll/);
  assert.deepEqual(await snapshot(), before);
}

// Plans may contain valid pending seeds, but every failure precedes ALL writes.
await write("src/routes/pending/page.ts", page("pending"));

{
  const before = await snapshot();

  assert.equal(await build({ port: "bad" }, "serve"), false);
  assert.match(reports.at(-1).error, /port/);
  assert.deepEqual(await snapshot(), before, "Invalid dev-server options must fail before writes");
}

await write(
  "src/routes/type-invalid/definition.ts",
  'import { defineRoute } from "@loozo/angular-router";\nexport default defineRoute("type-invalid", { search: { q: 7 } });\n',
);
await write("src/routes/type-invalid/page.ts", page("type-invalid"));
await preflight("declaration codec types still preflight", /not assignable|ParamCodec/);

// Expected generation failures are failed builds with logged diagnostics, not thrown errors.
for (const target of ["build", "serve"]) {
  assert.equal(await build({}, target), false);

  const report = reports.at(-1);
  const logged = report.logs.filter((entry) => entry.level === "error");

  assert.equal(report.error, undefined, target);
  assert.equal(report.output.success, false, target);
  assert.match(logged.map((entry) => entry.message).join("\n"), /type-invalid\/definition\.ts/);
}

await rm(join(fixture, "src/routes/type-invalid"), { recursive: true });
await write(
  "src/routes/$new/definition.ts",
  `import { defineRoute, numberParam } from "@loozo/angular-router";
const params = { old: numberParam };
export default defineRoute("$old", { params });\n`,
);
await write("src/routes/$new/page.ts", page("opaque"));
await preflight(
  "opaque codec rename",
  /\$new\/definition\.ts:3:\d+: Ambiguous filesystem params: the directories give path \\"\$new\\" \(removed params: old; added params: new\)\. This file's params are not an inline object; write each one as a plain `name: codec` property to match, or move or rename the directory/,
);
await rm(join(fixture, "src/routes/$new"), { recursive: true });

await write(
  "src/routes/static/definition.ts",
  `import { defineRoute, numberParam } from "@loozo/angular-router";
export default defineRoute("$old", { params: { old: numberParam } });\n`,
);
await write("src/routes/static/page.ts", page("static"));
await preflight(
  "never discard authored codecs",
  /static\/definition\.ts:2:\d+: Ambiguous filesystem params: the directories give path \\"static\\" \(removed params: old\)\. Remove this file's params, or move or rename the directory/,
);
await rm(join(fixture, "src/routes/static"), { recursive: true });

await write(
  "src/routes/stale/definition.ts",
  `import { defineRoute } from "@loozo/angular-router";
import previous from "../missing.js";
export const unrelated = previous;
export default defineRoute("stale", { parent: previous });\n`,
);
await write("src/routes/stale/page.ts", page("stale"));
await preflight("stale shared parent import", /Stale parent import has unrelated uses/);
await rm(join(fixture, "src/routes/stale"), { recursive: true });

await write("src/routes/pending/route.ts", "export const unrelated = 1;\n");
await preflight("unadmitted seed collision", /seed collision with an unadmitted file/);
await rm(join(fixture, "src/routes/pending/route.ts"));

const generated = await read("generated/routes.generated.ts");

await write("generated/routes.generated.ts", "// unmarked collision\n");
await preflight("generated ownership collision", /Unmarked generated-output collision/);
await write("generated/routes.generated.ts", generated);

await write("src/routes/pending/page.ts", `${page("pending")}\nimport "./missing.js";\n`);
await preflight("combined module preflight", /Cannot find module|Unresolved import/);
await write("src/routes/pending/page.ts", page("pending"));

await write("src/routes/+collision/page.ts", page("collision"));
await write("src/routes/-tools/+collision/page.ts", page("collision"));
await preflight("pathless matching collision", /Ordinary route collision\/overlap/);
await rm(join(fixture, "src/routes/+collision"), { recursive: true });
await rm(join(fixture, "src/routes/-tools/+collision"), { recursive: true });

await write("src/routes/files/$parts[]/illegal/page.ts", page("illegal-catchall-child"));
await preflight("catchall remains a leaf", /Catchall declarations cannot have children/);
await rm(join(fixture, "src/routes/files/$parts[]/illegal"), { recursive: true });
await write(
  "src/routes/empty-route/definition.ts",
  'import { defineRoute } from "@loozo/angular-router";\nexport default defineRoute("empty-route", {});\n',
);
await preflight(
  "authored componentless leaves are not silently discarded",
  /Ordinary componentless leaf/,
);
await rm(join(fixture, "src/routes/empty-route"), { recursive: true });

const ignored = await read("src/routes/-tools/ignored.ts");

await write("src/routes/-tools/ignored.ts", ignored.replace("{}", "{ data: { behavior: true } }"));
await preflight("transparent authored behavior", /incompatible authored behavior/);
await write("src/routes/-tools/ignored.ts", ignored);

const routeConfig = await read("tsconfig.routes.json");

// Native matcher proof: inherited include/exclude, with files overriding exclude.
const inheritedConfig = JSON.parse(routeConfig);

inheritedConfig.exclude = ["**/membership.ts"];
await write("tsconfig.filesystem-base.json", JSON.stringify(inheritedConfig));
await write("tsconfig.routes.json", JSON.stringify({ extends: "./tsconfig.filesystem-base.json" }));
await preflight("inherited native exclusions", /does not admit filesystem definition/, {
  autoDefineRoutes: { filename: "membership.ts" },
});
await write(
  "tsconfig.routes.json",
  JSON.stringify({
    extends: "./tsconfig.filesystem-base.json",
    files: ["src/routes/pending/membership.ts"],
  }),
);
await expectBuild({ autoDefineRoutes: { filename: "membership.ts" } });
assert.equal(await exists("src/routes/pending/membership.ts"), true);
await rm(join(fixture, "src/routes/pending/membership.ts"));
await write("tsconfig.routes.json", routeConfig);
await rm(join(fixture, "tsconfig.filesystem-base.json"));

const excluded = JSON.parse(routeConfig);

excluded.exclude = ["**/not-admitted.ts"];
await write("tsconfig.routes.json", JSON.stringify(excluded));
await preflight("native tsconfig exclusions", /does not admit filesystem definition/, {
  autoDefineRoutes: { filename: "not-admitted.ts" },
});
await write("tsconfig.routes.json", routeConfig);

const explicitFiles = JSON.parse(routeConfig);
const current = await snapshot();

explicitFiles.include = [];
explicitFiles.files = [];

for (const file of Object.keys(current)) {
  if (file.endsWith(".ts") && (file.startsWith("src/") || file.startsWith("generated/"))) {
    explicitFiles.files.push(file);
  }
}

explicitFiles.files.push("src/routes/pending/route.ts");
await write("tsconfig.routes.json", JSON.stringify(explicitFiles));
await expectBuild();
assert.equal(
  await exists("src/routes/pending/route.ts"),
  true,
  "Explicit native files entries can admit a prospective seed",
);
await write("tsconfig.routes.json", routeConfig);

// A workspace-access alias is allowed, including a not-yet-materialized files seed.
const accessAlias = join(evidence, "workspace-access");

await symlink(fixture, accessAlias, "dir");
await write("src/routes/access-prefix/page.ts", page("access-prefix"));

const accessFiles = structuredClone(explicitFiles);

accessFiles.files.push(join(accessAlias, "src/routes/access-prefix/page.ts"));
accessFiles.files.push(join(accessAlias, "src/routes/access-prefix/route.ts"));
await write("tsconfig.routes.json", JSON.stringify(accessFiles));

const beforeAccessSeed = await snapshot();

assert.equal(await build({ check: true }), false);
assert.match(JSON.stringify(reports.at(-1)), /definitions missing\/changed/);
assert.deepEqual(await snapshot(), beforeAccessSeed);
await expectBuild();
assert.equal(await exists("src/routes/access-prefix/route.ts"), true);
assert.match(await read("generated/routes.generated.ts"), /path: "access-prefix"/);

const admittedAccessSeed = await snapshot();

await expectBuild({ check: true });
assert.deepEqual(await snapshot(), admittedAccessSeed);

// The same allowed access alias works for wildcard-discovered prospective seeds.
await write("src/routes/wildcard-access/page.ts", page("wildcard-access"));

const wildcardAccess = JSON.parse(routeConfig);

wildcardAccess.include = [join(accessAlias, "src/**/*.ts")];
await write("tsconfig.routes.json", JSON.stringify(wildcardAccess));

const beforeWildcardSeed = await snapshot();

assert.equal(await build({ check: true }), false);
assert.match(JSON.stringify(reports.at(-1)), /definitions missing\/changed/);
assert.deepEqual(await snapshot(), beforeWildcardSeed);
await expectBuild();
assert.equal(await exists("src/routes/wildcard-access/route.ts"), true);
assert.match(await read("generated/routes.generated.ts"), /path: "wildcard-access"/);

const admittedWildcardSeed = await snapshot();

await expectBuild({ check: true });
assert.deepEqual(await snapshot(), admittedWildcardSeed);
await write("src/routes/wildcard-excluded/page.ts", page("wildcard-excluded"));

const wildcardExcluded = structuredClone(wildcardAccess);

wildcardExcluded.exclude = [join(accessAlias, "**/not-admitted.ts")];
await write("tsconfig.routes.json", JSON.stringify(wildcardExcluded));
await preflight(
  "wildcard alias still honors native exclusions",
  /does not admit filesystem definition/,
  {
    autoDefineRoutes: { filename: "not-admitted.ts" },
  },
);
assert.equal(await exists("src/routes/wildcard-excluded/not-admitted.ts"), false);
await rm(join(fixture, "src/routes/wildcard-excluded"), { recursive: true });
await write("tsconfig.routes.json", routeConfig);

// An alias located inside the workspace is a suffix link even if it targets
// the workspace root itself, rather than a proper source subdirectory.
const internalAccess = join(fixture, "src/access");

await symlink(fixture, internalAccess, "dir");
await write("src/routes/link-pending/page.ts", page("link-pending"));
await preflight(
  "workspace-target scan suffix link remains unsafe",
  /Unsafe source\/output symbolic link/,
  {
    scanDirectories: ["src/access/src/routes"],
  },
);
await preflight(
  "external prefix cannot hide a workspace-target suffix link",
  /Unsafe source\/output symbolic link/,
  {
    scanDirectories: [join(accessAlias, "src/access/src/routes")],
  },
);

const internalFiles = structuredClone(explicitFiles);

internalFiles.files.push(join(internalAccess, "src/routes/link-pending/page.ts"));
internalFiles.files.push(join(internalAccess, "src/routes/link-pending/route.ts"));
await write("tsconfig.routes.json", JSON.stringify(internalFiles));
await preflight(
  "workspace-target explicit prospective aliases remain unsafe",
  /Unsafe source\/output symbolic link/,
);
assert.equal(await exists("src/routes/link-pending/route.ts"), false);

const internalWildcard = JSON.parse(routeConfig);

internalWildcard.include = [join(internalAccess, "src/routes/**/*.ts")];
await write("tsconfig.routes.json", JSON.stringify(internalWildcard));
await preflight(
  "workspace-target wildcard scan aliases remain unsafe",
  /Unsafe source\/output symbolic link/,
  {
    scanDirectories: ["src/access/src/routes"],
  },
);
assert.equal(await exists("src/routes/link-pending/route.ts"), false);
await write("tsconfig.routes.json", routeConfig);
await rm(internalAccess);
await rm(join(fixture, "src/routes/link-pending"), { recursive: true });
await rm(accessAlias);

// Access-prefix canonicalization must never authorize a source/root suffix link.
await symlink(join(fixture, "src/routes/home"), join(fixture, "src/routes/unsafe-link"), "dir");
await preflight("source suffix link remains unsafe", /Unsafe source\/output symbolic link/);
await rm(join(fixture, "src/routes/unsafe-link"));
await symlink(join(fixture, "src/routes"), join(fixture, "src/routes-access"), "dir");
await preflight("scan root suffix link remains unsafe", /Unsafe source\/output symbolic link/, {
  scanDirectories: ["src/routes-access"],
});
await rm(join(fixture, "src/routes-access"));

await write(
  "src/routes/teams/$tenant/named-definition.ts",
  tenant.replace("data: marker,", "data: marker, resolve: { own: ({ params }) => params.team },"),
);
await preflight(
  "callback accesses are not application-wide renamed",
  /Property 'team' does not exist/,
);
await write("src/routes/teams/$tenant/named-definition.ts", tenant);
await expectBuild();

// Missing/changed generated drift is read-only, then repair converges without source rewrites.
await rm(join(fixture, "generated/destinations.generated.ts"));
await write(
  "src/routes/home/route.generated.ts",
  `${await read("src/routes/home/route.generated.ts")}\n// drift\n`,
);

const drift = await snapshot();

assert.equal(await build({ check: true }), false);
assert.match(JSON.stringify(reports.at(-1)), /artifacts changed/);
assert.deepEqual(await snapshot(), drift);
await expectBuild();

const repaired = await snapshot();

await expectBuild({ check: true });
assert.deepEqual(await snapshot(), repaired);

// Real official dev-server consumes add/change/remove/repair without restart.
const serverArchitect = await architect();
const logger = new core.logging.Logger("filesystem-serve");
const logs = [];
const outputs = [];
const errors = [];

logger.subscribe((entry) => logs.push(entry));

const server = await serverArchitect.scheduleTarget(
  { project: "proof", target: "serve" },
  {},
  { logger },
);
const subscription = server.output.subscribe({
  next: (output) => outputs.push(output),
  error: (error) => errors.push(String(error)),
});
let browser;

try {
  await waitFor(
    () => outputs.some((output) => output.success && output.baseUrl),
    "Native server did not become ready",
  );

  const output = outputs.find((value) => value.success && value.baseUrl);
  // The build target omits aot; Angular's schema default (true) must reach the dev server, which
  // then compiles component HMR into the served bundle.
  const main = await fetch(new URL("main.js", output.baseUrl));

  assert.match(await main.text(), /angular:component-update/);

  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });

  const browserErrors = [];

  async function rendered(path, text) {
    const view = await browser.newPage();

    view.on("pageerror", (error) => browserErrors.push(String(error)));
    await view.goto(new URL(path, output.baseUrl).href);
    await view.locator('[data-proof="filesystem"]').waitFor();
    assert.equal(await view.locator('[data-proof="filesystem"]').textContent(), text);
    await writeFile(join(evidence, `browser-${text}.html`), await view.content());
    await view.close();
  }

  await rendered("home", "home");
  await rendered("renamed", "plain");
  await rendered("teams/7/item", "item");
  await rendered("files/a/b", "files");
  await write("src/routes/watched/page.ts", page("watched"));
  await waitFor(() => exists("src/routes/watched/route.ts"), "Watcher did not seed a new page");
  await waitFor(
    async () => (await read("generated/routes.generated.ts")).includes('path: "watched"'),
    "Watcher did not publish the new route",
  );
  await waitFor(
    async () =>
      (await (await fetch(new URL("main.js", output.baseUrl))).text()).includes('path: "watched"'),
    "Native server did not consume new route",
  );
  await rendered("watched", "watched");

  await rename(join(fixture, "src/routes/watched"), join(fixture, "src/routes/changed"));
  await waitFor(
    async () => (await read("src/routes/changed/route.ts")).includes('defineRoute("changed"'),
    "Watcher did not synchronize a rename",
  );
  await waitFor(
    async () =>
      (await (await fetch(new URL("main.js", output.baseUrl))).text()).includes('path: "changed"'),
    "Native server did not consume renamed route",
  );
  await rendered("changed", "watched");

  const changedPage = await read("src/routes/changed/page.ts");

  await rm(join(fixture, "src/routes/changed/page.ts"));
  await waitFor(
    () => logs.some((entry) => entry.message.includes("Ordinary componentless leaf")),
    "Watcher did not report removed-page failure",
  );

  const duringFailure = await snapshot();

  await new Promise((done) => setTimeout(done, 400));
  assert.deepEqual(
    await snapshot(),
    duringFailure,
    "Failure did not delete editable declaration or publish partial output",
  );
  assert.equal(await exists("src/routes/changed/route.ts"), true);
  await write("src/routes/changed/page.ts", changedPage);
  await rendered("changed", "watched");

  await rm(join(fixture, "src/routes/changed"), { recursive: true });
  await waitFor(
    async () => !(await read("generated/routes.generated.ts")).includes('path: "changed"'),
    "Watcher did not remove an authored subtree from generated routes",
  );
  await waitFor(
    async () =>
      !(await (await fetch(new URL("main.js", output.baseUrl))).text()).includes('path: "changed"'),
    "Native server did not consume subtree removal",
  );

  const converged = await snapshot();

  await new Promise((done) => setTimeout(done, 800));
  assert.deepEqual(
    await snapshot(),
    converged,
    "Own source edits converge to byte-identical no-op generation",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(browserErrors, []);
} finally {
  await browser?.close();
  subscription.unsubscribe();
  await server.stop();
  await writeFile(
    join(evidence, "serve-reports.json"),
    JSON.stringify({ logs, outputs, errors }, null, 2),
  );
}

await write("src/routes/after-stop/page.ts", page("stopped"));

const stopped = await snapshot();

await new Promise((done) => setTimeout(done, 600));
assert.deepEqual(
  await snapshot(),
  stopped,
  "Stopped companion cannot seed or publish after later edits",
);
assert.equal(await exists("src/routes/after-stop/route.ts"), false);
await writeFile(join(evidence, "final-artifacts.json"), JSON.stringify(stopped, null, 2));
console.log(
  "Public Architect filesystem seeding/synchronization, conservative preflight nonwrites, strict native consumers and real dev-server watch/add/change/remove/repair/stop passed",
);
