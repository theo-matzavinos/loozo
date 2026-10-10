import assert from "node:assert/strict";
import { cp, mkdir, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(packageDirectory, "../..");
const evidence = resolve(process.argv[2]);

await mkdir(evidence);

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
const reports = [];

async function write(path, bytes) {
  await mkdir(dirname(join(fixture, path)), { recursive: true });
  await writeFile(join(fixture, path), bytes);
}

async function architect() {
  const host = core.workspaces.createWorkspaceHost(new NodeJsSyncHost());
  const { workspace } = await core.workspaces.readWorkspace(fixture, host);
  const registry = new core.json.schema.CoreSchemaRegistry();

  registry.addPostTransform(core.json.schema.transforms.addUndefinedDefaults);

  return new Architect(new WorkspaceNodeModulesArchitectHost(workspace, fixture), registry);
}

async function build(options = {}) {
  const instance = await architect();
  const logger = new core.logging.Logger("typed-navigation");
  const report = { options, logs: [] };

  logger.subscribe((entry) => report.logs.push(entry));
  reports.push(report);

  let run;

  try {
    run = await instance.scheduleTarget({ project: "proof", target: "build" }, options, { logger });
    report.output = await run.result;
    assert.equal(report.output.success, true, JSON.stringify(report.logs));
  } catch (error) {
    report.error = String(error);

    throw error;
  } finally {
    await run?.stop();
    await writeFile(join(evidence, "build-reports.json"), JSON.stringify(reports, null, 2));
  }
}

async function snapshot() {
  const files = {};

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".angular") {
        continue;
      }

      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        const info = await stat(path, { bigint: true });

        files[path.slice(fixture.length + 1)] = {
          bytes: await readFile(path, "utf8"),
          mode: String(info.mode),
          mtimeNs: String(info.mtimeNs),
        };
      }
    }
  }

  await visit(fixture);

  return files;
}

const page = `import { Component } from '@angular/core';
@Component({ template: '<p>destination</p>' }) export default class DestinationPage {}\n`;
const definitions = {
  scope: "defineRoute('scope/$scopeId', { params: { scopeId: stringParam }, fragments: ['own'] })",
  middle: "defineRoute('', { parent: scope })",
  terminal:
    "defineRoute('', { parent: middle, search: { leaf: stringParam }, fragments: ['leaf'] })",
  multi:
    "defineRoute('projects/$projectId/detail', { parent: middle, params: { projectId: stringParam } })",
  enum: "defineRoute('enum/$kind', { params: { kind: enumParam(['a', 'b']) } })",
  optional:
    "defineRoute('optional/$id', { params: { id: numberParam }, search: { toString: optionalSearchParam(numberParam), constructor: optionalSearchParam(numberParam), valueOf: optionalSearchParam(stringParam), nullable: nullableSearchParam(stringParam) }, fragments: ['summary'] })",
  docs: "defineRoute('docs/$parts[]', { params: { parts: stringParam } })",
  weird: "defineRoute('literal?/#', {})",
  unresolved: "defineRoute('unresolved', {})",
  nonleaf: "defineRoute('', { parent: unresolved })",
  twin: "defineRoute('', { parent: nonleaf })",
  deep: "defineRoute('deep', { parent: twin })",
  old: "defineRoute('old', {})",
  alias:
    "defineRoute('alias/$id', { parent: old, params: { id: numberParam }, redirect: { to: optional, search: { mode: 'replace', values: { nullable: null } }, fragment: { mode: 'drop' } } })",
};
const parents = {
  middle: "scope",
  terminal: "middle",
  multi: "middle",
  nonleaf: "unresolved",
  twin: "nonleaf",
  deep: "twin",
  alias: "old",
};

for (const [name, expression] of Object.entries(definitions)) {
  let imports =
    "import { defineRoute, stringParam, numberParam, enumParam, optionalSearchParam, nullableSearchParam } from '@loozo/angular-router';\n";

  if (parents[name]) {
    imports += `import ${parents[name]} from '../${parents[name]}/definition.js';\n`;
  }

  if (name === "alias") {
    imports += "import optional from '../optional/definition.js';\n";
  }

  await write(`src/routes/${name}/definition.ts`, `${imports}export default ${expression};\n`);

  if (!["middle", "twin", "old", "alias"].includes(name)) {
    await write(`src/routes/${name}/page.ts`, page);
  }
}

const outletPage = `import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { injectRoute } from './route.generated.js';
@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
export default class Scope { readonly route = injectRoute(); }\n`;

await write("src/routes/scope/page.ts", outletPage);
await write("src/routes/unresolved/page.ts", outletPage);
await write(
  "src/routes/nonleaf/page.ts",
  outletPage.replace("readonly route = injectRoute();", ""),
);
await build();

// A byte-identical generated module copy is a distinct set, not a hash/ID singleton.
await cp(join(fixture, "src"), join(fixture, "foreign/src"), { recursive: true });
await cp(join(fixture, "generated"), join(fixture, "foreign/generated"), { recursive: true });
assert.deepEqual(
  await readFile(join(fixture, "generated/destinations.generated.ts")),
  await readFile(join(fixture, "foreign/generated/destinations.generated.ts")),
);

const types = `import { type Resource } from '@angular/core';
import { type UrlTree } from '@angular/router';
import { injectRoute as multiRoute } from './routes/multi/route.generated.js';
import { injectRoute as scopeRoute, destination as scope } from './routes/scope/route.generated.js';
import { destination as terminal } from './routes/terminal/route.generated.js';
import { destination as middle } from './routes/middle/route.generated.js';
import { destination as nonleaf } from './routes/nonleaf/route.generated.js';
import { destination as twin } from './routes/twin/route.generated.js';
import { injectRoute as docsRoute } from './routes/docs/route.generated.js';
import { injectRoute as optionalRoute, destination as optional } from './routes/optional/route.generated.js';
import { destination as foreign } from '../foreign/src/routes/scope/route.generated.js';
import definition from './routes/scope/definition.js';
const h = multiRoute();
const link: UrlTree = h.link('/enum/$kind', { params: { kind: 'a' } });
const nativePromise: Promise<boolean> = h.navigate('../../../../../', {});
h.link('../../..', { params: { scopeId: 'x' }, search: { leaf: 'a' }, fragment: 'leaf' });
h.link('../../../', { params: { scopeId: 'x' }, search: { leaf: 'a' } });
h.link('../../../projects/$projectId/detail', { params: { scopeId: 'x', projectId: 'p' } });
h.link('/docs/$parts[]', { params: { parts: [] } });
h.link('/old/alias/$id', { params: { id: 1 } });
h.link('/literal?/#', {});
h.link(scope, { params: { scopeId: 'x' }, fragment: 'own' });
h.link(terminal, { params: { scopeId: 'x' }, search: { leaf: 'a' } });
const middleVariable = middle;
const nonleafVariable = nonleaf;
const twinVariable = twin;
h.link(middleVariable, { params: { scopeId: 'x' } });
h.navigate(middleVariable, { params: { scopeId: 'x' } });
h.link(nonleafVariable, {});
h.navigate(nonleafVariable, {});
h.link(twinVariable, {});
h.navigate(twinVariable, {});
const middleClone = { ...middle };
const nonleafClone = { ...nonleaf };
// @ts-expect-error copied reference is not a genuine middle target
h.link(middleClone, { params: { scopeId: 'x' } });
// @ts-expect-error copied reference cannot navigate as middle
h.navigate(middleClone, { params: { scopeId: 'x' } });
// @ts-expect-error identical-schema empty-input reference copy is not authentic
h.link(nonleafClone, {});
// @ts-expect-error identical-schema empty-input reference copy cannot navigate
h.navigate(nonleafClone, {});
// @ts-expect-error inline spread is not an object target
h.link({ ...middle }, { params: { scopeId: 'x' } });
// @ts-expect-error inline spread cannot navigate as its original
h.navigate({ ...middle }, { params: { scopeId: 'x' } });
// @ts-expect-error inline empty-input spread is not an object target
h.link({ ...nonleaf }, {});
// @ts-expect-error inline empty-input spread cannot navigate
h.navigate({ ...nonleaf }, {});
// @ts-expect-error exact middle retains inherited scopeId
h.link(middleVariable, {});
// @ts-expect-error exact middle navigate retains inherited scopeId
h.navigate(middleVariable, {});
// @ts-expect-error exact middle codec cannot widen from values
h.link(middleVariable, { params: { scopeId: 1 } });
// @ts-expect-error exact middle navigate codec cannot widen from values
h.navigate(middleVariable, { params: { scopeId: 1 } });
declare const assignableReference: typeof middle | typeof nonleaf;
// @ts-expect-error declared reference union must not erase inherited params
h.link(assignableReference, {});
// @ts-expect-error declared reference union cannot navigate without inherited params
h.navigate(assignableReference, {});
const conditionalReference = Math.random() > 0.5 ? middle : nonleaf;
// @ts-expect-error actual conditional keeps distinct source identities
h.link(conditionalReference, {});
// @ts-expect-error actual conditional navigate cannot collapse to a common schema
h.navigate(conditionalReference, {});
// @ts-expect-error complete values still cannot admit a selector union
h.link(conditionalReference, { params: { scopeId: 'x' } });
// @ts-expect-error complete values still cannot admit a navigate selector union
h.navigate(conditionalReference, { params: { scopeId: 'x' } });
declare const identicalSchemaReference: typeof nonleaf | typeof twin;
// @ts-expect-error identical schemas do not equate distinct declarations
h.link(identicalSchemaReference, {});
// @ts-expect-error identical schema reference union cannot navigate
h.navigate(identicalSchemaReference, {});
const conditionalIdenticalReference = Math.random() > 0.5 ? nonleaf : twin;
// @ts-expect-error actual identical-schema conditional remains distinct
h.link(conditionalIdenticalReference, {});
// @ts-expect-error actual identical-schema conditional cannot navigate
h.navigate(conditionalIdenticalReference, {});
const own = scopeRoute();
own.link({ params: { scopeId: 'x' }, fragment: 'own' });
own.link('.', { params: { scopeId: 'x' } });
own.link('./', { params: { scopeId: 'x' }, search: { leaf: 'a' } });
const opt = optionalRoute();
opt.link({ params: { id: 1 }, search: { nullable: null } });
opt.link('.', { params: { id: 1 }, search: { nullable: '', constructor: 2, toString: 3, valueOf: '' }, fragment: 'summary' });
h.link(optional, { params: { id: 1 }, search: { nullable: null, constructor: 2 } });
h.link('/optional/$id', { params: { id: 1 }, search: { nullable: null } });
const data: Resource<Readonly<{}> | undefined> = h.data;
// @ts-expect-error no caller generics
multiRoute<number>();
// @ts-expect-error parameterless
multiRoute({});
// @ts-expect-error noncallable
h();
// @ts-expect-error readonly resource property
h.data = data;
// @ts-expect-error readonly native resource
h.params.set({ scopeId: 'x', projectId: 'p' });
// @ts-expect-error supplied prototype key retains numeric type
opt.link({ params: { id: 1 }, search: { nullable: null, constructor: 'bad' } });
// @ts-expect-error supplied prototype key retains numeric type through selected string
h.link('/optional/$id', { params: { id: 1 }, search: { nullable: null, toString: 'bad' } });
// @ts-expect-error supplied prototype key retains numeric type through ref
h.link(optional, { params: { id: 1 }, search: { nullable: null, constructor: 'bad' } });
// @ts-expect-error required nullable search never optional
h.link(optional, { params: { id: 1 } });
// @ts-expect-error required target path values explicit
h.link('/enum/$kind', {});
// @ts-expect-error values cannot widen selected enum
h.link('/enum/$kind', { params: { kind: 'c' } });
// @ts-expect-error unknown params
h.link('/enum/$kind', { params: { kind: 'a', extra: 1 } });
// @ts-expect-error unknown option
h.link('/enum/$kind', { params: { kind: 'a' }, extra: 1 });
// @ts-expect-error wrong fragment target
h.link(terminal, { params: { scopeId: 'x' }, search: { leaf: 'a' }, fragment: 'own' });
// @ts-expect-error canonical terminal, not exact scope
own.link('./', { params: { scopeId: 'x' } });
// @ts-expect-error unknown intermediate prefix
h.link('..', { params: { scopeId: 'x', projectId: 'p' } });
// @ts-expect-error segment traversal not authored-parent traversal
h.link('../..', { params: { scopeId: 'x' } });
// @ts-expect-error above root
h.link('../../../../../../', {});
// @ts-expect-error unresolved shared path
h.link('/unresolved', {});
// @ts-expect-error pruned owner not destination
h.link('/old', {});
// @ts-expect-error concrete substitution
h.link('/enum/a', { params: { kind: 'a' } });
// @ts-expect-error unknown literal
h.link('/unknown', {});
declare const wide: string;
// @ts-expect-error widened selector
h.link(wide, {});
declare const union: '/' | '/enum/$kind';
// @ts-expect-error selector union forbidden
h.link(union, { params: { kind: 'a' } });
declare const unionReference: typeof scope | typeof terminal;
// @ts-expect-error reference selector union forbidden
h.link(unionReference, { params: { scopeId: 'x' }, search: { leaf: 'a' } });
// @ts-expect-error raw declaration not generated reference
h.link(definition, { params: { scopeId: 'x' } });
// @ts-expect-error injected handle not reference
h.link(own, { params: { scopeId: 'x' } });
// @ts-expect-error fake ref
h.link({}, {});
// @ts-expect-error foreign static set identity, despite identical bytes/schema
h.link(foreign, { params: { scopeId: 'x' } });
// @ts-expect-error no extras third argument
h.navigate('/', {}, { replaceUrl: true });
// @ts-expect-error no implicit reuse
h.navigate({ params: { projectId: 'p' } });
// @ts-expect-error invalid relative suffix even with complete values
h.link('../../../projects//$projectId/detail', { params: { scopeId: 'x', projectId: 'p' } });
// @ts-expect-error static ?/# only absolute
h.link('../../../../../literal?/#', {});
// @ts-expect-error mixed traversal
h.link('./../', {});
const docs = docsRoute();
docs.link('.', { params: { parts: ['a/b'] } });
docs.link('/', {});
// @ts-expect-error unknown catchall depth
 docs.link('..', { params: { parts: [] } });
// @ts-expect-error no extension from catchall origin
 docs.link('./index', {});
// @ts-expect-error scalar not catchall array
 docs.link({ params: { parts: 'a' } });
`;

await write("src/type-proof.ts", types);

const driver = `import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { injectRoute } from './route.generated.js';
import { destination as scope } from '../scope/route.generated.js';
import { destination as terminal } from '../terminal/route.generated.js';
import { destination as foreign } from '../../../foreign/src/routes/scope/route.generated.js';
import definition from '../scope/definition.js';
@Component({ imports: [RouterLink], template: '<p data-navigation="ready">navigation</p><a id="typed" [routerLink]="route.link(scope, values)">scope</a>' })
export default class Multi {
  readonly route = injectRoute();
  readonly scope = scope;
  readonly values = { params: { scopeId: 'clicked' } };
  readonly router = inject(Router);
  constructor() {
    const h = this.route;
    const router = this.router;
    const calls: { parse: string[]; navigate: string[]; promise?: Promise<boolean> } = { parse: [], navigate: [] };
    const parse = router.parseUrl.bind(router);
    const navigate = router.navigateByUrl.bind(router);
    router.parseUrl = (url) => { calls.parse.push(url); return parse(url); };
    router.navigateByUrl = (url, extras) => {
      calls.navigate.push(String(url));
      const promise = navigate(url, extras);
      calls.promise = promise;
      return promise;
    };
    (window as any).navigationProof = {
      calls,
      link: (...args: any[]) => router.serializeUrl((h.link as any)(...args)),
      navigate: (selector: any, values: any) => {
        const result = (h.navigate as any)(selector, values);
        return { same: result === calls.promise, result };
      },
      references: { scope, terminal, foreign, definition, handle: h },
      ready: () => h.params.hasValue(),
    };
  }
}\n`;

await write("src/routes/multi/page.ts", driver);
await build();

const typecheck = spawnSync(
  process.execPath,
  [require.resolve("typescript/lib/tsc.js"), "-p", join(fixture, "tsconfig.app.json"), "--noEmit"],
  { cwd: fixture, encoding: "utf8" },
);

await writeFile(join(evidence, "typecheck.stdout"), typecheck.stdout);
await writeFile(join(evidence, "typecheck.stderr"), typecheck.stderr);
await writeFile(join(evidence, "typecheck.exit"), `${typecheck.status}\n`);
assert.equal(typecheck.status, 0, typecheck.stdout + typecheck.stderr);

const before = await snapshot();

await build({ check: true });
assert.deepEqual(await snapshot(), before);
assert.deepEqual(
  await readFile(join(fixture, "generated/destinations.generated.ts")),
  await readFile(join(fixture, "foreign/generated/destinations.generated.ts")),
  "Runtime foreign-set proof starts with byte-identical shared graphs",
);

const instance = await architect();
const logger = new core.logging.Logger("typed-navigation-serve");
const serve = { logs: [], outputs: [], errors: [] };

logger.subscribe((entry) => serve.logs.push(entry));

const server = await instance.scheduleTarget({ project: "proof", target: "serve" }, {}, { logger });
const subscription = server.output.subscribe({
  next: (output) => serve.outputs.push(output),
  error: (error) => serve.errors.push(String(error)),
});
let browser;

try {
  const deadline = Date.now() + 60_000;

  while (!serve.outputs.some((output) => output.success && output.baseUrl)) {
    assert.ok(Date.now() < deadline, JSON.stringify(serve));
    await new Promise((done) => setTimeout(done, 100));
  }

  const output = serve.outputs.find((value) => value.success && value.baseUrl);

  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });

  const tab = await browser.newPage();
  const errors = [];

  tab.on("pageerror", (error) => errors.push(String(error)));
  await tab.goto(new URL("scope/x/projects/p/detail", output.baseUrl).href);
  await tab.waitForFunction(() => window.navigationProof?.ready());

  const observations = await tab.evaluate(async () => {
    const p = window.navigationProof;
    const results = [];
    const link = (...args) => p.link(...args);

    results.push(link("../../..", { params: { scopeId: "a/b" }, search: { leaf: "winner" } }));
    results.push(link(p.references.scope, { params: { scopeId: "exact" } }));
    results.push(
      link(p.references.terminal, { params: { scopeId: "leaf" }, search: { leaf: "required" } }),
    );
    results.push(
      link("/optional/$id", {
        params: { id: 1 },
        search: { nullable: null, toString: 2, constructor: 3, valueOf: "" },
        fragment: "summary",
      }),
    );
    results.push(link("/docs/$parts[]", { params: { parts: ["a/b", "(c)"] } }));
    results.push(link("/old/alias/$id", { params: { id: 7 } }));
    results.push(link("/literal?/#", {}));

    const parses = p.calls.parse.length;
    const navigations = p.calls.navigate.length;
    const invalid = [
      ["..", { params: { scopeId: "x", projectId: "p" } }],
      ["../../../../../../", {}],
      ["/unresolved", {}],
      ["/old", {}],
      ["./../", {}],
      ["../../../../../literal?/#", {}],
      ["/enum/a", { params: { kind: "a" } }],
      [p.references.foreign, { params: { scopeId: "x" } }],
      [{ ...p.references.scope }, { params: { scopeId: "x" } }],
      [Object.create(p.references.scope), { params: { scopeId: "x" } }],
      [p.references.definition, { params: { scopeId: "x" } }],
      [p.references.handle, {}],
      ["/enum/$kind", { params: { kind: "c" } }],
      ["/enum/$kind", {}],
      ["/optional/$id", { params: { id: 1 }, search: { nullable: null }, fragment: "unknown" }],
      ["/optional/$id", { params: { id: 1 }, search: { nullable: null, constructor: "bad" } }],
      ["/", {}, { replaceUrl: true }],
      ["/", undefined],
      [],
    ];

    for (const args of invalid) {
      let threw = false;

      try {
        link(...args);
      } catch {
        threw = true;
      }

      if (!threw) {
        throw new Error("Invalid link was admitted: " + JSON.stringify(args));
      }

      threw = false;

      try {
        p.references.handle.navigate(...args);
      } catch {
        threw = true;
      }

      if (!threw) {
        throw new Error("Invalid navigation was admitted");
      }
    }

    if (p.calls.parse.length !== parses || p.calls.navigate.length !== navigations) {
      throw new Error("Invalid input reached Angular");
    }

    const native = p.navigate("/enum/$kind", { params: { kind: "a" } });
    const success = await native.result;

    return { results, invalidCount: invalid.length, samePromise: native.same, success };
  });

  assert.deepEqual(observations.results, [
    "/scope/a%2Fb?leaf=winner",
    "/scope/exact",
    "/scope/leaf?leaf=required",
    "/optional/1?constructor=3&nullable=null&toString=2&valueOf=#summary",
    "/docs/a%2Fb/%28c%29",
    "/old/alias/7",
    "/literal%3F/%23",
  ]);
  assert.equal(observations.samePromise, true);
  assert.equal(observations.success, true);
  await tab.goto(new URL("scope/x/projects/p/detail", output.baseUrl).href);
  await tab.waitForFunction(() => window.navigationProof?.ready());
  assert.equal(await tab.locator("#typed").getAttribute("href"), "/scope/clicked");
  await tab.locator("#typed").click();
  await tab.waitForURL(new URL("scope/clicked", output.baseUrl).href);
  assert.deepEqual(errors, []);
  await writeFile(join(evidence, "browser.html"), await tab.content());
  await writeFile(
    join(evidence, "browser-observations.json"),
    JSON.stringify({ ...observations, errors, routerLinkUrl: tab.url() }, null, 2),
  );
} finally {
  await browser?.close();
  subscription.unsubscribe();
  await server.stop();
  await writeFile(join(evidence, "serve-reports.json"), JSON.stringify(serve, null, 2));
}

await write(
  "src/routes/independent/definition.ts",
  "import { defineRoute } from '@loozo/angular-router';\nexport default defineRoute('independent', {});\n",
);
await write("src/routes/independent/page.ts", page);
await build();

const after = await snapshot();

for (const [name, value] of Object.entries(before)) {
  if (name.startsWith("src/routes/") && name.endsWith("route.generated.ts")) {
    assert.deepEqual(
      after[name],
      value,
      "Independent route preserves unrelated facade bytes/modes/ns-mtimes",
    );
  }
}

await writeFile(join(evidence, "facade-stability-before.json"), JSON.stringify(before, null, 2));
await writeFile(join(evidence, "facade-stability-after.json"), JSON.stringify(after, null, 2));

console.log(
  "Public generated navigation typing, same-set/foreign-set, exact native Promise/UrlTree/RouterLink, selector exclusions and stable facade proof passed",
);
