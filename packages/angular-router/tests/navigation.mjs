import assert from "node:assert/strict";
import { cp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { spawnSync } from "node:child_process";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(packageDirectory, "../..");
const evidence = resolve(process.argv[2]);

await mkdir(evidence);

const fixture = join(evidence, "consumer");

await cp(join(repository, "examples/angular-router"), fixture, {
  recursive: true,
  filter: (path) =>
    !/(?:^|\/)(?:node_modules|dist|\.angular|generated)(?:\/|$)/.test(path) &&
    !path.endsWith("route.generated.ts") &&
    !path.endsWith("destination.generated.ts"),
});

// These fixtures author paths and parents by hand, so they opt out of filesystem mode.
const configuration = JSON.parse(await readFile(join(fixture, "angular.json"), "utf8"));

configuration.projects.proof.architect.build.options.autoDefineRoutes = false;
await writeFile(join(fixture, "angular.json"), JSON.stringify(configuration));

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

async function architect(directory = fixture) {
  const host = core.workspaces.createWorkspaceHost(new NodeJsSyncHost());
  const { workspace } = await core.workspaces.readWorkspace(directory, host);
  const registry = new core.json.schema.CoreSchemaRegistry();

  registry.addPostTransform(core.json.schema.transforms.addUndefinedDefaults);

  return new Architect(new WorkspaceNodeModulesArchitectHost(workspace, directory), registry);
}

async function build(options = {}, directory = fixture) {
  const instance = await architect(directory);
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
    "defineRoute('optional/$id', { params: { id: numberParam }, search: { toString: numberParam, constructor: numberParam, valueOf: stringParam, label: stringParam }, fragments: ['summary'] })",
  docs: "defineRoute('docs/$parts[]', { params: { parts: stringParam } })",
  products: "defineRoute('products', { search: { q: stringParam, page: numberParam } })",
  plain: "defineRoute('plain', {})",
  item: "defineRoute('items/$id', { params: { id: numberParam }, fragments: ['top'] })",
  weird: "defineRoute('literal?/#', {})",
  unresolved: "defineRoute('unresolved', {})",
  nonleaf: "defineRoute('', { parent: unresolved })",
  twin: "defineRoute('', { parent: nonleaf })",
  deep: "defineRoute('deep', { parent: twin })",
  old: "defineRoute('old', {})",
  alias:
    "defineRoute('alias/$id', { parent: old, params: { id: numberParam } }).redirect({ to: optional, search: { mode: 'replace', values: { label: 'aliased' } }, fragment: { mode: 'drop' } })",
  // A redirect source is /legacy's only route, so it is legacyPage's ".." winner.
  legacy: "defineRoute('legacy', {})",
  legacyIndex:
    "defineRoute('', { parent: legacy }).redirect({ to: plain, search: { mode: 'drop' }, fragment: { mode: 'drop' } })",
  legacyPage: "defineRoute('page', { parent: legacy })",
};
const parents = {
  middle: "scope",
  terminal: "middle",
  multi: "middle",
  nonleaf: "unresolved",
  twin: "nonleaf",
  deep: "twin",
  alias: "old",
  legacyIndex: "legacy",
  legacyPage: "legacy",
};
const redirectTargets = { alias: "optional", legacyIndex: "plain" };
// A page that exposes its handle, for the ".." cases each origin has to show itself.
const probe = (name) => `import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { injectRoute } from './route.generated.js';
@Component({ template: '<p data-probe="${name}">${name}</p>' })
export default class Probe {
  readonly route = injectRoute();
  readonly router = inject(Router);
  constructor() {
    const h = this.route;
    const router = this.router;
    (window as any).probes = {
      ...(window as any).probes,
      ${name}: {
        link: (...args: any[]) => router.serializeUrl((h.link as any)(...args)),
        navigate: (...args: any[]) => (h.navigate as any)(...args),
      },
    };
  }
}\n`;

for (const [name, expression] of Object.entries(definitions)) {
  let imports =
    "import { defineRoute, stringParam, numberParam, enumParam } from '@loozo/angular-router';\n";

  if (parents[name]) {
    imports += `import ${parents[name]} from '../${parents[name]}/definition.js';\n`;
  }

  if (redirectTargets[name]) {
    const target = redirectTargets[name];

    imports += `import { destination as ${target} } from '../${target}/destination.generated.js';\n`;
  }

  await write(`src/routes/${name}/definition.ts`, `${imports}export default ${expression};\n`);

  if (["docs", "deep", "legacyPage"].includes(name)) {
    await write(`src/routes/${name}/page.ts`, probe(name));
  } else if (!["middle", "twin", "old", "alias", "legacy", "legacyIndex"].includes(name)) {
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
await write(
  "src/routes/plain/page.ts",
  outletPage.replace("'<router-outlet />'", "'<p>plain</p>'"),
);
await build();

// A second tree generated on its own from the same declaration source: per-route files are
// colocated, so it is its own source subtree with its own tsconfig and output. Its destinations
// are genuine and carry the same ids, but they are other objects.
await write(
  "foreign/src/routes/scope/definition.ts",
  await readFile(join(fixture, "src/routes/scope/definition.ts"), "utf8"),
);
await write("foreign/src/routes/scope/page.ts", page);
await write(
  "foreign/tsconfig.routes.json",
  JSON.stringify({ extends: "../tsconfig.app.json", files: [], include: ["src/**/*.ts"] }),
);

const { generate } = await import(
  pathToFileURL(join(packageDirectory, "node/src/generation/generate.js")).href
);

await generate(
  join(fixture, "foreign"),
  {
    tsconfig: "tsconfig.routes.json",
    scanDirectories: ["src/routes"],
    outDirectory: "generated",
    autoDefineRoutes: false,
    check: false,
  },
  () => false,
);
assert.deepEqual(
  await readFile(join(fixture, "src/routes/scope/destination.generated.ts")),
  await readFile(join(fixture, "foreign/src/routes/scope/destination.generated.ts")),
);

const types = `import { type Signal } from '@angular/core';
import { type UrlTree } from '@angular/router';
import { defineRoute, stringParam } from '@loozo/angular-router';
import { injectRoute as multiRoute } from './routes/multi/route.generated.js';
import { injectRoute as scopeRoute } from './routes/scope/route.generated.js';
import { destination as scope } from './routes/scope/destination.generated.js';
import { destination as terminal } from './routes/terminal/destination.generated.js';
import { destination as middle } from './routes/middle/destination.generated.js';
import { destination as nonleaf } from './routes/nonleaf/destination.generated.js';
import { destination as twin } from './routes/twin/destination.generated.js';
import { injectRoute as docsRoute } from './routes/docs/route.generated.js';
import { destination as docsDestination } from './routes/docs/destination.generated.js';
import { injectRoute as deepRoute } from './routes/deep/route.generated.js';
import { injectRoute as optionalRoute } from './routes/optional/route.generated.js';
import { destination as optional } from './routes/optional/destination.generated.js';
import { destination as enumKind } from './routes/enum/destination.generated.js';
import { destination as alias } from './routes/alias/destination.generated.js';
import { destination as weird } from './routes/weird/destination.generated.js';
import { destination as foreign } from '../foreign/src/routes/scope/destination.generated.js';
import { type NavigationBehaviorOptions } from '@angular/router';
import { injectRoute as productsRoute } from './routes/products/route.generated.js';
import { destination as products } from './routes/products/destination.generated.js';
import { injectRoute as plainRoute } from './routes/plain/route.generated.js';
import { destination as plain } from './routes/plain/destination.generated.js';
import { destination as item } from './routes/item/destination.generated.js';
// A declaration made in place: createUrl takes it, but it is not a destination.
const definition = defineRoute('scope/$scopeId', { params: { scopeId: stringParam } });
const h = multiRoute();
const link: UrlTree = h.link({ to: enumKind, params: { kind: 'a' } });
const nativePromise: Promise<boolean> = h.navigate({ to: plain });
// The parent route: the pathless parent shares /scope/$scopeId, so .. selects that path's canonical terminal.
h.link({ to: '..', params: { scopeId: 'x' }, search: { leaf: 'a' }, fragment: 'leaf' });
h.navigate({ to: '..', params: { scopeId: 'x' } });
h.link({ to: docsDestination, params: { parts: [] } });
h.link({ to: alias, params: { id: 1 } });
h.link({ to: weird });
h.link({ to: scope, params: { scopeId: 'x' }, fragment: 'own' });
h.link({ to: terminal, params: { scopeId: 'x' }, search: { leaf: 'a' } });
const middleVariable = middle;
const nonleafVariable = nonleaf;
const twinVariable = twin;
h.link({ to: middleVariable, params: { scopeId: 'x' } });
h.navigate({ to: middleVariable, params: { scopeId: 'x' } });
h.link({ to: nonleafVariable });
h.navigate({ to: nonleafVariable });
h.link({ to: twinVariable });
h.navigate({ to: twinVariable });
const middleClone = { ...middle };
const nonleafClone = { ...nonleaf };
// @ts-expect-error copied reference is not a genuine middle target
h.link({ to: middleClone, params: { scopeId: 'x' } });
// @ts-expect-error copied reference cannot navigate as middle
h.navigate({ to: middleClone, params: { scopeId: 'x' } });
// @ts-expect-error identical-schema empty-input reference copy is not authentic
h.link({ to: nonleafClone });
// @ts-expect-error identical-schema empty-input reference copy cannot navigate
h.navigate({ to: nonleafClone });
// @ts-expect-error inline spread is not an object target
h.link({ to: { ...middle }, params: { scopeId: 'x' } });
// @ts-expect-error inline spread cannot navigate as its original
h.navigate({ to: { ...middle }, params: { scopeId: 'x' } });
// @ts-expect-error inline empty-input spread is not an object target
h.link({ to: { ...nonleaf } });
// @ts-expect-error inline empty-input spread cannot navigate
h.navigate({ to: { ...nonleaf } });
// @ts-expect-error exact middle retains inherited scopeId
h.link({ to: middleVariable });
// @ts-expect-error exact middle navigate retains inherited scopeId
h.navigate({ to: middleVariable });
// @ts-expect-error exact middle codec cannot widen from values
h.link({ to: middleVariable, params: { scopeId: 1 } });
// @ts-expect-error exact middle navigate codec cannot widen from values
h.navigate({ to: middleVariable, params: { scopeId: 1 } });
declare const assignableReference: typeof middle | typeof nonleaf;
// @ts-expect-error declared reference union must not erase inherited params
h.link({ to: assignableReference });
// @ts-expect-error declared reference union cannot navigate without inherited params
h.navigate({ to: assignableReference });
const conditionalReference = Math.random() > 0.5 ? middle : nonleaf;
// @ts-expect-error actual conditional keeps distinct source identities
h.link({ to: conditionalReference });
// @ts-expect-error actual conditional navigate cannot collapse to a common schema
h.navigate({ to: conditionalReference });
// @ts-expect-error complete values still cannot admit a selector union
h.link({ to: conditionalReference, params: { scopeId: 'x' } });
// @ts-expect-error complete values still cannot admit a navigate selector union
h.navigate({ to: conditionalReference, params: { scopeId: 'x' } });
declare const identicalSchemaReference: typeof nonleaf | typeof twin;
// @ts-expect-error identical schemas do not equate distinct declarations
h.link({ to: identicalSchemaReference });
// @ts-expect-error identical schema reference union cannot navigate
h.navigate({ to: identicalSchemaReference });
const conditionalIdenticalReference = Math.random() > 0.5 ? nonleaf : twin;
// @ts-expect-error actual identical-schema conditional remains distinct
h.link({ to: conditionalIdenticalReference });
// @ts-expect-error actual identical-schema conditional cannot navigate
h.navigate({ to: conditionalIdenticalReference });
const own = scopeRoute();
own.link({ params: { scopeId: 'x' }, fragment: 'own' });
own.link({ params: { scopeId: 'x' } });
// @ts-expect-error no '.' selector: omit to
own.link({ to: '.', params: { scopeId: 'x' } });
// @ts-expect-error no '.' selector for navigate either
own.navigate({ to: '.', params: { scopeId: 'x' } });
// A top-level route's parent is the root.
own.link({ to: '..' });
const opt = optionalRoute();
opt.link({ params: { id: 1 }, search: { label: 'x' } });
opt.link({ params: { id: 1 }, search: { label: '', constructor: 2, toString: 3, valueOf: '' }, fragment: 'summary' });
h.link({ to: optional, params: { id: 1 }, search: { label: 'x', constructor: 2 } });
h.link({ to: optional, params: { id: 1 }, search: { label: undefined } });
// Every search key may be omitted.
h.link({ to: optional, params: { id: 1 } });
const optionalSearch: { readonly label?: string; readonly toString?: number } = opt.search();
const data: Signal<Readonly<{}>> = h.data;
// @ts-expect-error no caller generics
multiRoute<number>();
// @ts-expect-error parameterless
multiRoute({});
// @ts-expect-error noncallable
h();
// @ts-expect-error readonly signal property
h.data = data;
// @ts-expect-error readonly signal
h.params.set({ scopeId: 'x', projectId: 'p' });
// @ts-expect-error a signal, not a Resource
h.params.hasValue();
// @ts-expect-error supplied prototype key retains numeric type
opt.link({ params: { id: 1 }, search: { label: 'x', constructor: 'bad' } });
// @ts-expect-error supplied prototype key retains numeric type through ref
h.link({ to: optional, params: { id: 1 }, search: { label: 'x', constructor: 'bad' } });
// @ts-expect-error a supplied search value keeps its codec type
h.link({ to: optional, params: { id: 1 }, search: { label: null } });
// @ts-expect-error required target path values explicit
h.link({ to: enumKind });
// @ts-expect-error values cannot widen the target's enum
h.link({ to: enumKind, params: { kind: 'c' } });
// @ts-expect-error unknown params
h.link({ to: enumKind, params: { kind: 'a', extra: 1 } });
// @ts-expect-error unknown option
h.link({ to: enumKind, params: { kind: 'a' }, extra: 1 });
// @ts-expect-error wrong fragment target
h.link({ to: terminal, params: { scopeId: 'x' }, search: { leaf: 'a' }, fragment: 'own' });
// @ts-expect-error parent values are the parent's
h.link({ to: '..', params: { scopeId: 'x', projectId: 'p' } });
// @ts-expect-error .. is the only relative selector
h.link({ to: '../..', params: { scopeId: 'x' } });
// @ts-expect-error no trailing-slash form
h.link({ to: '../', params: { scopeId: 'x' } });
// @ts-expect-error no ./ form
own.link({ to: './', params: { scopeId: 'x' } });
// @ts-expect-error no relative extension
h.link({ to: '../projects/$projectId/detail', params: { scopeId: 'x', projectId: 'p' } });
// @ts-expect-error multi-level traversal
h.link({ to: '../../../../../../' });
// @ts-expect-error the parent path /unresolved has no destination
deepRoute().link({ to: '..' });
// @ts-expect-error a route's path is not a target: import its destination
h.link({ to: '/enum/$kind', params: { kind: 'a' } });
// @ts-expect-error unknown literal
h.link({ to: '/unknown' });
declare const wide: string;
// @ts-expect-error widened selector
h.link({ to: wide });
declare const union: '/' | '/enum/$kind';
// @ts-expect-error selector union forbidden
h.link({ to: union, params: { kind: 'a' } });
declare const unionReference: typeof scope | typeof terminal;
// @ts-expect-error reference selector union forbidden
h.link({ to: unionReference, params: { scopeId: 'x' }, search: { leaf: 'a' } });
// @ts-expect-error a declaration is not a destination
h.link({ to: definition, params: { scopeId: 'x' } });
// @ts-expect-error injected handle not reference
h.link({ to: own, params: { scopeId: 'x' } });
// @ts-expect-error fake ref
h.link({ to: {} });
// Another tree's destination is genuine: its URL comes from its own facts.
h.link({ to: foreign, params: { scopeId: 'x' } });
h.navigate({ to: plain, replaceUrl: true });
// @ts-expect-error a single record, no second argument
h.navigate({ to: plain }, { replaceUrl: true });
// @ts-expect-error no implicit reuse
h.navigate({ params: { projectId: 'p' } });
// @ts-expect-error invalid relative suffix even with complete values
h.link({ to: '../../../projects//$projectId/detail', params: { scopeId: 'x', projectId: 'p' } });
// @ts-expect-error no relative paths
h.link({ to: '../../../../../literal?/#' });
// @ts-expect-error mixed traversal
h.link({ to: './../' });
const docs = docsRoute();
docs.link({ params: { parts: ['a/b'] } });
docs.link({ to: plain });
// A catchall route's parent is its parent route's path, here the root.
docs.link({ to: '..' });
// @ts-expect-error parent values are the parent's
 docs.link({ to: '..', params: { parts: [] } });
// @ts-expect-error no extension from catchall origin
 docs.link({ to: './index' });
// @ts-expect-error scalar not catchall array
 docs.link({ params: { parts: 'a' } });

const f = productsRoute();
const p = plainRoute();
const q = 'shoes' as string;
f.navigate({ search: { q }, replaceUrl: true });
f.navigate({ search: { q, page: undefined }, replaceUrl: true, state: { from: 'filter' }, info: { source: 'input' } });
f.navigate({ replaceUrl: true });
f.navigate({});
f.navigate({ search: {}, skipLocationChange: true });
f.navigate({ to: products, search: { q }, replaceUrl: true });
f.navigate({ to: item, params: { id: 1 }, replaceUrl: true });
f.navigate({ to: item, params: { id: 1 }, fragment: 'top', onSameUrlNavigation: 'reload' });
f.navigate({ to: products, scroll: 'manual' });
f.navigate({ search: { q }, browserUrl: '/shown' });
p.navigate({ replaceUrl: true });
p.navigate({ to: '..', replaceUrl: true });
const opts: NavigationBehaviorOptions = { replaceUrl: true };
f.navigate({ search: { q }, ...opts });
const filterPromise: Promise<boolean> = f.navigate({ replaceUrl: true });
void filterPromise;
// @ts-expect-error unknown option
f.navigate({ search: { q }, replaceUrl: true, bogus: 1 });
// @ts-expect-error misspelt search
f.navigate({ serach: { q } });
// @ts-expect-error wrong option type
f.navigate({ replaceUrl: 'yes' });
// @ts-expect-error unknown search key
f.navigate({ search: { query: q } });
// @ts-expect-error search value keeps its codec
f.navigate({ search: { page: 'two' } });
// @ts-expect-error a single record
f.navigate({ search: { q } }, { replaceUrl: true });
// @ts-expect-error unknown literal on an all-optional handle
f.navigate({ to: '/unknown' });
// @ts-expect-error unknown literal on an empty handle
p.navigate({ to: '/unknown', replaceUrl: true });
declare const wideTo: string;
// @ts-expect-error widened selector on an empty handle
p.navigate({ to: wideTo });
declare const unionTo: '/products' | '/plain';
// @ts-expect-error selector union on an empty handle
p.navigate({ to: unionTo });
// @ts-expect-error spread reference on an empty handle
p.navigate({ to: { ...plain } });
// @ts-expect-error spread reference on an all-optional handle
f.navigate({ to: { ...products } });
declare const refUnion: typeof plain | typeof products;
// @ts-expect-error reference union on an empty handle
p.navigate({ to: refUnion });
// @ts-expect-error the root parent declares no search
f.navigate({ to: '..', search: { q } });
// @ts-expect-error link takes no navigation options
f.link({ search: { q }, replaceUrl: true });
// @ts-expect-error link takes no navigation options after a selector
f.link({ to: item, params: { id: 1 }, state: {} });
// @ts-expect-error link takes no navigation options after its own destination
f.link({ to: products, skipLocationChange: true });
// @ts-expect-error link takes no navigation options after ..
p.link({ to: '..', replaceUrl: true });
// @ts-expect-error link takes no second argument
f.link({ search: { q } }, { replaceUrl: true });
// @ts-expect-error a positional selector is not a target record
h.link('/enum/$kind', { params: { kind: 'a' } });
// @ts-expect-error a bare string is not a target record, even where String's search method could match
f.link('x');
// @ts-expect-error a positional literal selector is not a target record on a searchful paramless handle
f.link('/products');
// @ts-expect-error a bare string cannot navigate
f.navigate('x');
declare const notTarget: readonly unknown[];
const unrelatedTarget = { unrelated: true };
// @ts-expect-error an array is not a target record
f.link(notTarget);
// @ts-expect-error a function cannot navigate
f.navigate(() => undefined);
// @ts-expect-error an unrelated object variable shares no target key
f.navigate(unrelatedTarget);
// @ts-expect-error a bare string is not a target record on a handle with path params
opt.link('x');
`;

await write("src/type-proof.ts", types);

// The active route: a common read interface until is() narrows it to one route's handle.
await write(
  "src/active-type-proof.ts",
  `import { injectActiveRoute } from '../generated/routes.generated.js';
import { defineRoute, stringParam } from '@loozo/angular-router';
import { destination as scope } from './routes/scope/destination.generated.js';
import { destination as multi } from './routes/multi/destination.generated.js';
import { destination as item } from './routes/item/destination.generated.js';
import { destination as foreign } from '../foreign/src/routes/scope/destination.generated.js';

const definition = defineRoute('scope/$scopeId', { params: { scopeId: stringParam } });

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

const active = injectActiveRoute();
// Inferred without annotations: chain.find keeps is()'s predicate.
const scopeId = active()?.chain.find((route) => route.is(scope))?.params().scopeId;
const itemId = active()?.chain.find((route) => route.is(item))?.params().id;
const exactScope: Equal<typeof scopeId, string | undefined> = true;
const exactItem: Equal<typeof itemId, number | undefined> = true;
const contained: boolean = active()?.contains(scope) ?? false;
const route = active();

if (route?.is(multi)) {
  const params: { readonly scopeId: string; readonly projectId: string } = route.params();
  route.link({ params: { scopeId: 'x', projectId: 'p' } });
  route.link({ to: '..', params: { scopeId: 'x' } });
  void route.navigate({ to: item, params: { id: 1 }, fragment: 'top', replaceUrl: true });
  // @ts-expect-error a narrowed route's values are still its own
  route.link({ params: { scopeId: 'x' } });
}

active()?.chain.find((parent) => parent.is(scope))?.link({ params: { scopeId: 'x' } });
// Before narrowing, link and navigate take a destination.
active()?.link({ to: item, params: { id: 1 } });
void active()?.navigate({ to: item, params: { id: 1 } });
// @ts-expect-error the own form needs is() first
active()?.link({ params: { id: 1 } });
// @ts-expect-error the parent form needs is() first
active()?.link({ to: '..', params: { scopeId: 'x' } });
// Another tree's destination is a destination; at runtime it is never this tree's route.
const foreignIs: boolean = active()?.is(foreign) ?? false;
const foreignContained: boolean = active()?.contains(foreign) ?? false;
// @ts-expect-error a declaration is not a destination
active()?.is(definition);
// @ts-expect-error params before narrowing are the union of the tree's params
active()?.params().projectId;
if (route?.contains(multi)) {
  // @ts-expect-error contains does not narrow
  route.params().projectId;
}
// @ts-expect-error the chain is readonly
active()?.chain.push(active()!);
// @ts-expect-error the signal is readonly
active.set(undefined);
`,
);

// The driver is a lazy page that reads the active route from routes.generated.ts, which
// lazily imports it back.
const driver = `import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { defineRoute, stringParam } from '@loozo/angular-router';
import { injectActiveRoute } from '../../../generated/routes.generated.js';
import { injectRoute } from './route.generated.js';
import { destination as scope } from '../scope/destination.generated.js';
import { destination as terminal } from '../terminal/destination.generated.js';
import { destination as enumKind } from '../enum/destination.generated.js';
import { destination as optional } from '../optional/destination.generated.js';
import { destination as docs } from '../docs/destination.generated.js';
import { destination as alias } from '../alias/destination.generated.js';
import { destination as weird } from '../weird/destination.generated.js';
import { destination as plain } from '../plain/destination.generated.js';
import { destination as foreign } from '../../../foreign/src/routes/scope/destination.generated.js';
const definition = defineRoute('scope/$scopeId', { params: { scopeId: stringParam } });
@Component({ imports: [RouterLink], template: '<p data-navigation="ready">navigation</p><a id="typed" [routerLink]="route.link(target)">scope</a>' })
export default class Multi {
  readonly route = injectRoute();
  readonly active = injectActiveRoute();
  readonly target = { to: scope, params: { scopeId: 'clicked' } };
  readonly router = inject(Router);
  constructor() {
    const h = this.route;
    const router = this.router;
    const calls: { parse: string[]; navigate: unknown[]; promise?: Promise<boolean> } = { parse: [], navigate: [] };
    const parse = router.parseUrl.bind(router);
    const navigate = router.navigateByUrl.bind(router);
    router.parseUrl = (url) => { calls.parse.push(url); return parse(url); };
    router.navigateByUrl = (url, extras) => {
      calls.navigate.push([String(url), extras]);
      const promise = navigate(url, extras);
      calls.promise = promise;
      return promise;
    };
    (window as any).navigationProof = {
      calls,
      link: (...args: any[]) => router.serializeUrl((h.link as any)(...args)),
      navigate: (...args: any[]) => {
        const result = (h.navigate as any)(...args);
        return { same: result === calls.promise, result };
      },
      references: { scope, terminal, enumKind, optional, docs, alias, weird, plain, foreign, definition, handle: h },
      active: this.active,
      ready: () => h.params().projectId === 'p',
    };
  }
}\n`;

await write("src/routes/multi/page.ts", driver);
// The shell reads the active route.
await write(
  "src/shell.ts",
  `import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { defineRoute, stringParam } from '@loozo/angular-router';
import { injectActiveRoute } from '../generated/routes.generated.js';
import { destination as scope } from './routes/scope/destination.generated.js';
import { route as scopeCopy } from './routes/scope/route.generated.js';
import { destination as middle } from './routes/middle/destination.generated.js';
import { destination as multi } from './routes/multi/destination.generated.js';
import { destination as item } from './routes/item/destination.generated.js';
import { destination as foreign } from '../foreign/src/routes/scope/destination.generated.js';

const definition = defineRoute('scope/$scopeId', { params: { scopeId: stringParam } });

@Component({ selector: 'proof-app', imports: [RouterOutlet], template: '<router-outlet />' })
export default class Shell {
  readonly active = injectActiveRoute();
  readonly router = inject(Router);

  constructor() {
    (window as any).activeProof = {
      active: this.active,
      router: this.router,
      references: { scope, scopeCopy, middle, multi, item, foreign, definition },
    };
  }
}
`,
);
// A filter screen: a searchful route without path params that rewrites its own query.
await write(
  "src/routes/products/page.ts",
  `import { Component, inject } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { injectRoute } from './route.generated.js';
import { destination as products } from './destination.generated.js';
import { destination as item } from '../item/destination.generated.js';
@Component({ template: '<input id="q" [value]="route.search().q ?? \\'\\'" (input)="filter($any($event.target).value)"><p id="shown">{{ route.search().q ?? "none" }}</p>' })
export default class Products {
  readonly route = injectRoute();
  readonly router = inject(Router);
  filter(q: string) {
    void this.route.navigate({ search: { q: q || undefined }, replaceUrl: true });
  }
  constructor() {
    // Keep the first instance's spy when a navigation recreates the page.
    if ((window as any).filterProof) {
      return;
    }
    const h = this.route;
    const router = this.router;
    const calls: unknown[] = [];
    const starts: unknown[] = [];
    const parse = router.parseUrl.bind(router);
    const navigate = router.navigateByUrl.bind(router);
    let parses = 0;
    let last: Promise<boolean> | undefined;
    router.parseUrl = (url) => { parses += 1; return parse(url); };
    router.navigateByUrl = (url, extras) => {
      calls.push([String(url), extras]);
      last = navigate(url, extras);
      return last;
    };
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        starts.push({ url: event.url, extras: router.currentNavigation()?.extras });
      }
    });
    (window as any).filterProof = {
      calls,
      starts,
      parses: () => parses,
      search: () => h.search(),
      link: (...args: any[]) => router.serializeUrl((h.link as any)(...args)),
      navigate: (...args: any[]) => {
        const result = (h.navigate as any)(...args);
        return { same: result === last, result };
      },
      references: { item, products },
    };
  }
}\n`,
);
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
  await readFile(join(fixture, "src/routes/scope/destination.generated.ts")),
  await readFile(join(fixture, "foreign/src/routes/scope/destination.generated.ts")),
  "The foreign tree's scope destination has this tree's bytes",
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

    results.push(link({ to: "..", params: { scopeId: "a/b" }, search: { leaf: "winner" } }));
    results.push(link({ to: p.references.scope, params: { scopeId: "exact" } }));
    results.push(
      link({
        to: p.references.terminal,
        params: { scopeId: "leaf" },
        search: { leaf: "required" },
      }),
    );
    results.push(
      link({
        to: p.references.optional,
        params: { id: 1 },
        search: { label: "null", toString: 2, constructor: 3, valueOf: "" },
        fragment: "summary",
      }),
    );
    results.push(link({ to: p.references.docs, params: { parts: ["a/b", "(c)"] } }));
    results.push(link({ to: p.references.alias, params: { id: 7 } }));
    results.push(link({ to: p.references.weird }));
    results.push(link({ params: { scopeId: "own", projectId: "p" } }));
    // Another tree's genuine destination serializes from its own URL facts.
    results.push(link({ to: p.references.foreign, params: { scopeId: "f" }, fragment: "own" }));

    const parses = p.calls.parse.length;
    const navigations = p.calls.navigate.length;
    const invalid = [
      [{ to: "../..", params: { scopeId: "x" } }],
      [{ to: "../", params: { scopeId: "x" } }],
      [{ to: "./", params: { scopeId: "x", projectId: "p" } }],
      [{ to: ".", params: { scopeId: "x", projectId: "p" } }],
      [{ to: "../../../../../../" }],
      [{ to: "/unknown" }],
      [{ to: "/enum/$kind", params: { kind: "a" } }],
      [{ to: "./../" }],
      [{ to: "../../../../../literal?/#" }],
      [{ to: { ...p.references.scope }, params: { scopeId: "x" } }],
      [{ to: Object.create(p.references.scope), params: { scopeId: "x" } }],
      [{ to: p.references.definition, params: { scopeId: "x" } }],
      [{ to: p.references.handle }],
      [{ to: 5 }],
      [{ to: null }],
      [{ to: p.references.enumKind, params: { kind: "c" } }],
      [{ to: p.references.enumKind }],
      [
        {
          to: p.references.optional,
          params: { id: 1 },
          search: { label: "x" },
          fragment: "unknown",
        },
      ],
      [
        {
          to: p.references.optional,
          params: { id: 1 },
          search: { label: "x", constructor: "bad" },
        },
      ],
      [{ to: p.references.optional, params: { id: 1 }, search: { other: "x" } }],
      [{ params: { projectId: "p" } }],
      [{ to: p.references.plain }, { replaceUrl: true }],
      ["/", {}],
      ["/"],
      [undefined],
      [null],
      [[]],
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
        throw new Error("Invalid navigation was admitted: " + JSON.stringify(args));
      }
    }

    if (p.calls.parse.length !== parses || p.calls.navigate.length !== navigations) {
      throw new Error("Invalid input reached Angular");
    }

    // An own `__proto__` key is a key like any other: link rejects it, navigate forwards it as an
    // own option, and its nested values never become inherited behavior options.
    const prototypeKey = () =>
      Object.assign(JSON.parse('{"params":{"kind":"b"},"__proto__":{"replaceUrl":true}}'), {
        to: p.references.enumKind,
      });
    let prototypeLinkThrew = false;

    try {
      link(prototypeKey());
    } catch {
      prototypeLinkThrew = true;
    }

    if (!prototypeLinkThrew || p.calls.parse.length !== parses) {
      throw new Error("link admitted an own __proto__ key");
    }

    await p.navigate(prototypeKey()).result;

    const forwarded = p.calls.navigate.at(-1)[1];
    const prototypeOptions = {
      ownKeys: Object.keys(forwarded),
      replaceUrl: forwarded.replaceUrl,
      plainPrototype: Object.getPrototypeOf(forwarded) === Object.prototype,
    };

    const native = p.navigate({ to: p.references.enumKind, params: { kind: "a" } });
    const success = await native.result;

    return {
      results,
      invalidCount: invalid.length,
      samePromise: native.same,
      success,
      nativeCall: p.calls.navigate.at(-1),
      prototypeOptions,
    };
  });

  assert.deepEqual(observations.results, [
    "/scope/a%2Fb?leaf=winner",
    "/scope/exact",
    "/scope/leaf?leaf=required",
    "/optional/1?constructor=3&label=null&toString=2&valueOf=#summary",
    "/docs/a%2Fb/%28c%29",
    "/old/alias/7",
    "/literal%3F/%23",
    "/scope/own/projects/p/detail",
    "/scope/f#own",
  ]);
  assert.equal(observations.samePromise, true);
  assert.equal(observations.success, true);
  // A record without behavior options still hands Angular an options object, an empty one.
  assert.deepEqual(observations.nativeCall, ["/enum/a", {}]);
  assert.deepEqual(observations.prototypeOptions, {
    ownKeys: ["__proto__"],
    replaceUrl: undefined,
    plainPrototype: true,
  });
  await tab.goto(new URL("scope/x/projects/p/detail", output.baseUrl).href);
  await tab.waitForFunction(() => window.navigationProof?.ready());
  assert.equal(await tab.locator("#typed").getAttribute("href"), "/scope/clicked");
  await tab.locator("#typed").click();
  await tab.waitForURL(new URL("scope/clicked", output.baseUrl).href);

  const routerLinkUrl = tab.url();

  await writeFile(join(evidence, "browser.html"), await tab.content());

  // Behavior options reach Angular: a fresh app on a filter screen, entered after another page.
  await tab.goto(new URL("plain", output.baseUrl).href);
  await tab.goto(new URL("products", output.baseUrl).href);
  await tab.waitForFunction(() => window.filterProof);

  const historyStart = await tab.evaluate(() => history.length);

  await tab.locator("#q").pressSequentially("ab", { delay: 50 });
  await tab.waitForFunction(() => location.search === "?q=ab");

  const typed = await tab.evaluate(() => ({
    length: history.length,
    search: window.filterProof.search(),
    shown: document.querySelector("#shown").textContent,
    calls: window.filterProof.calls.slice(),
  }));

  assert.deepEqual(typed, {
    length: historyStart,
    search: { q: "ab" },
    shown: "ab",
    calls: [
      ["/products?q=a", { replaceUrl: true }],
      ["/products?q=ab", { replaceUrl: true }],
    ],
  });

  const stateful = await tab.evaluate(async () => {
    const proof = window.filterProof;
    const navigation = proof.navigate({
      search: { q: "s" },
      state: { from: "filter" },
      info: { source: "test" },
    });
    const success = await navigation.result;

    return {
      success,
      same: navigation.same,
      length: history.length,
      from: history.state?.from,
      start: proof.starts.at(-1),
    };
  });

  assert.deepEqual(stateful, {
    success: true,
    same: true,
    length: historyStart + 1,
    from: "filter",
    start: {
      url: "/products?q=s",
      extras: { state: { from: "filter" }, info: { source: "test" } },
    },
  });

  const skipped = await tab.evaluate(async () => {
    const proof = window.filterProof;
    const success = await proof.navigate({ search: { q: "hidden" }, skipLocationChange: true })
      .result;

    return { success, address: location.pathname + location.search, search: proof.search() };
  });

  assert.deepEqual(skipped, {
    success: true,
    address: "/products?q=s",
    search: { q: "hidden" },
  });

  // Every navigate form: own (above), another destination, its own destination and parent.
  const forms = await tab.evaluate(async () => {
    const proof = window.filterProof;
    const before = history.length;
    const destination = await proof.navigate({
      to: proof.references.item,
      params: { id: 3 },
      fragment: "top",
      replaceUrl: true,
      state: { form: "destination" },
    }).result;
    const destinationView = {
      success: destination,
      length: history.length,
      address: location.pathname + location.hash,
      form: history.state?.form,
    };
    const ownDestination = await proof.navigate({
      to: proof.references.products,
      search: { q: "own" },
      info: { form: "own destination" },
    }).result;
    const parent = await proof.navigate({ to: "..", replaceUrl: true }).result;

    return {
      before,
      destination: destinationView,
      ownDestination,
      parent,
      address: location.pathname + location.search,
      calls: proof.calls.slice(2),
    };
  });

  assert.deepEqual(forms, {
    before: historyStart + 1,
    destination: {
      success: true,
      length: historyStart + 1,
      address: "/items/3#top",
      form: "destination",
    },
    ownDestination: true,
    parent: true,
    address: "/",
    calls: [
      ["/products?q=s", { state: { from: "filter" }, info: { source: "test" } }],
      ["/products?q=hidden", { skipLocationChange: true }],
      ["/items/3#top", { replaceUrl: true, state: { form: "destination" } }],
      ["/products?q=own", { info: { form: "own destination" } }],
      ["/", { replaceUrl: true }],
    ],
  });

  const rejected = await tab.evaluate(() => {
    const proof = window.filterProof;
    const calls = proof.calls.length;
    const parses = proof.parses();
    const messages = [];
    const attempts = [
      () => proof.link({ search: { q: "x" }, replaceUrl: true }),
      () => proof.link({ to: proof.references.item, params: { id: 1 }, state: {} }),
      () => proof.navigate(),
      () => proof.navigate({ search: { q: "x" } }, { replaceUrl: true }),
      () => proof.navigate("/products"),
      () => proof.navigate(null),
      () => proof.navigate({ to: "." }),
      () => proof.navigate({ to: "/unknown", replaceUrl: true }),
      () => proof.navigate({ to: { ...proof.references.item }, params: { id: 1 } }),
    ];

    for (const attempt of attempts) {
      try {
        attempt();
        messages.push("admitted");
      } catch (error) {
        messages.push(`${error.name}: ${error.message}`);
      }
    }

    return {
      messages,
      reachedAngular: proof.calls.length - calls,
      parsed: proof.parses() - parses,
      link: proof.link({ to: proof.references.item, params: { id: 1 }, fragment: "top" }),
    };
  });

  assert.deepEqual(rejected, {
    messages: [
      "TypeError: link takes no navigation behavior options (replaceUrl); set them on RouterLink",
      "TypeError: link takes no navigation behavior options (state); set them on RouterLink",
      "TypeError: Expected one navigation target record",
      "TypeError: Expected one navigation target record",
      "TypeError: Expected one navigation target record",
      "TypeError: Expected one navigation target record",
      "TypeError: Unknown generated selector: .",
      "TypeError: Unknown generated selector: /unknown",
      "TypeError: Expected a genuine destination",
    ],
    reachedAngular: 0,
    parsed: 0,
    link: "/items/1#top",
  });

  // The shell's active route: is/contains/chain, narrowed link and navigate, fake destinations.
  await tab.goto(new URL("scope/x/projects/p/detail", output.baseUrl).href);
  await tab.waitForFunction(() =>
    window.activeProof?.active()?.is(window.activeProof.references.multi),
  );

  const active = await tab.evaluate(async () => {
    const { active, router, references } = window.activeProof;
    const { scope, scopeCopy, middle, multi, item, foreign, definition } = references;
    const route = active();
    const rejected = [];

    for (const fake of [
      { ...scope },
      Object.create(scope),
      scopeCopy,
      definition,
      route,
      {},
      null,
      "scope",
    ]) {
      for (const method of ["is", "contains"]) {
        try {
          route[method](fake);
          rejected.push("admitted");
        } catch (error) {
          rejected.push(`${error.name}: ${error.message}`);
        }
      }
    }

    const length = history.length;
    const page = window.navigationProof.active();
    const view = {
      // The lazy page's own reader, typed by RouteTypes, reads the same route.
      page: [page.is(multi), page.params(), page.chain.length],
      params: route.params(),
      chain: route.chain.map((entry) => [entry.is(scope), entry.is(middle), entry.is(multi)]),
      contains: [scope, middle, multi, item].map((destination) => route.contains(destination)),
      prefixes:
        route.chain.at(-1) === route &&
        route.chain[1].chain.length === 2 &&
        route.chain[1].chain[0] === route.chain[0] &&
        route.chain[0].chain.length === 1,
      frozen: Object.isFrozen(route.chain),
      links: [
        router.serializeUrl(route.link({ params: { scopeId: "y", projectId: "q" } })),
        router.serializeUrl(route.link({ to: "..", params: { scopeId: "x" } })),
        router.serializeUrl(route.chain[0].link({ params: { scopeId: "z" }, fragment: "own" })),
      ],
      rejected,
      // Same id, other object: identity, not the id, decides.
      foreign: [route.is(foreign), route.contains(foreign), route.chain[0].is(foreign)],
      navigated: await route.navigate({ to: item, params: { id: 3 }, replaceUrl: true }),
    };
    const next = active();

    return {
      ...view,
      url: router.url,
      replaced: history.length === length,
      next: { item: next.is(item), params: next.params(), chain: next.chain.length },
      // The departed handle keeps its last values.
      departed: { multi: route.is(multi), params: route.params() },
    };
  });

  assert.deepEqual(active, {
    page: [true, { scopeId: "x", projectId: "p" }, 3],
    params: { scopeId: "x", projectId: "p" },
    chain: [
      [true, false, false],
      [false, true, false],
      [false, false, true],
    ],
    contains: [true, true, true, false],
    prefixes: true,
    frozen: true,
    links: ["/scope/y/projects/q/detail", "/scope/x", "/scope/z#own"],
    rejected: Array(16).fill("TypeError: Expected a genuine destination"),
    foreign: [false, false, false],
    navigated: true,
    url: "/items/3",
    replaced: true,
    next: { item: true, params: { id: 3 }, chain: 1 },
    departed: { multi: true, params: { scopeId: "x", projectId: "p" } },
  });

  // ".." from the edges. multi -> terminal (above) is the falsifier for parent links: multi's
  // parent is middle, but ".." serializes terminal's search. A catchall's ".." is its parent's
  // path, here the root; an origin whose parent path has no route has no ".."; a redirect
  // source can be the winner, and navigating to it redirects.
  async function probeAt(path, name) {
    await tab.goto(new URL(path, output.baseUrl).href);
    await tab.waitForFunction((key) => window.probes?.[key], name);
  }

  await probeAt("docs/a/b", "docs");

  const catchall = await tab.evaluate(() => window.probes.docs.link({ to: ".." }));

  await probeAt("unresolved/deep", "deep");

  const noWinner = await tab.evaluate(() => {
    try {
      window.probes.deep.link({ to: ".." });

      return "admitted";
    } catch (error) {
      return `${error.name}: ${error.message}`;
    }
  });

  await probeAt("legacy/page", "legacyPage");

  const redirectWinner = await tab.evaluate(async () => {
    const link = window.probes.legacyPage.link({ to: ".." });
    const success = await window.probes.legacyPage.navigate({ to: ".." });

    return { link, success, address: location.pathname };
  });

  assert.equal(catchall, "/");
  assert.equal(noWinner, "TypeError: Unknown generated selector: ..");
  assert.deepEqual(redirectWinner, { link: "/legacy", success: true, address: "/plain" });
  assert.deepEqual(errors, []);
  await writeFile(
    join(evidence, "browser-observations.json"),
    JSON.stringify(
      {
        ...observations,
        routerLinkUrl,
        typed,
        stateful,
        skipped,
        forms,
        rejected,
        active,
        catchall,
        noWinner,
        redirectWinner,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  subscription.unsubscribe();
  await server.stop();
  await writeFile(join(evidence, "serve-reports.json"), JSON.stringify(serve, null, 2));
}

// Stability. The type proofs are done; they name the root winner's ".." overloads, so they go
// before the tree loses it.
await rm(join(fixture, "src/type-proof.ts"));
await rm(join(fixture, "src/active-type-proof.ts"));
await write(
  "src/routes/independent/definition.ts",
  "import { defineRoute } from '@loozo/angular-router';\nexport default defineRoute('independent', {});\n",
);
await write("src/routes/independent/page.ts", page);
await build();

const after = await snapshot();
// A top-level independent route changes no children table either.
const perRoute = /^src\/routes\/.*\/(?:route|destination|children)\.generated\.ts$/;

for (const [name, value] of Object.entries(before)) {
  if (perRoute.test(name)) {
    assert.deepEqual(
      after[name],
      value,
      `An independent route preserves ${name} bytes/modes/ns-mtimes`,
    );
  }
}

assert.ok(after["src/routes/independent/destination.generated.ts"]);
assert.ok(after["src/routes/independent/route.generated.ts"]);

// Removing the root winner changes exactly its own pair, the global table, the route copies whose
// ".." it was and the children tables holding records whose ".." it was: scope's (middle),
// middle's (terminal), unresolved's (nonleaf) and nonleaf's (twin). Every destination and every
// other copy and table keeps its bytes, modes and mtimes.
const homeRoute = await readFile(join(fixture, "src/routes/+home/route.ts"), "utf8");
const homePage = await readFile(join(fixture, "src/routes/+home/page.ts"), "utf8");

await rm(join(fixture, "src/routes/+home/route.ts"));
await rm(join(fixture, "src/routes/+home/page.ts"));
await build();

const withoutHome = await snapshot();
const upCopies = [];
const changed = [];

for (const [name, value] of Object.entries(after)) {
  if (!name.endsWith(".generated.ts")) {
    continue;
  }

  if (name.startsWith("src/routes/+home/")) {
    assert.equal(withoutHome[name], undefined, `${name} is removed with its declaration`);
    continue;
  }

  if (
    name.endsWith("/route.generated.ts") &&
    value.bytes.includes("+home/destination.generated.js")
  ) {
    upCopies.push(name);
    assert.doesNotMatch(withoutHome[name].bytes, /routegen\$up/);
  }

  if (!isDeepStrictEqual(withoutHome[name], value)) {
    changed.push(name);
  }
}

assert.ok(upCopies.length > 0, "Top-level origins' copies import the root winner's destination");
assert.deepEqual(
  changed.sort(),
  [
    "generated/routes.generated.ts",
    "src/routes/middle/children.generated.ts",
    "src/routes/nonleaf/children.generated.ts",
    "src/routes/scope/children.generated.ts",
    "src/routes/unresolved/children.generated.ts",
    ...upCopies,
  ].sort(),
);

// Restoring it restores every byte.
await write("src/routes/+home/route.ts", homeRoute);
await write("src/routes/+home/page.ts", homePage);
await build();

const restored = await snapshot();

for (const [name, value] of Object.entries(after)) {
  if (name.endsWith(".generated.ts")) {
    assert.equal(restored[name]?.bytes, value.bytes, `${name} is restored`);
  }
}

await writeFile(join(evidence, "stability-before.json"), JSON.stringify(before, null, 2));
await writeFile(join(evidence, "stability-after.json"), JSON.stringify(after, null, 2));
await writeFile(
  join(evidence, "stability-without-home.json"),
  JSON.stringify({ changed, upCopies }, null, 2),
);

// Route children through a built app. Every route with children loads them lazily: its own
// record stays where it is and its children's records load from its children table. Prefixes
// below are path text on top-level declarations: a prefix declaration would have children.
const groupProbes = `import { InjectionToken } from '@angular/core';

const store = ((globalThis as any).groupProof ??= { marks: [], calls: {} });

/** A module's evaluation, or a callback's run, in the order it happened. */
export function mark(name: string) {
  store.marks.push({ name, at: performance.now() });
}

export function call(name: string, value: unknown) {
  (store.calls[name] ??= []).push(value);
}

export const groupToken = new InjectionToken<string>('group token');
`;

await write("src/group-probes.ts", groupProbes);

// From src/routes/<directory>/ up to src/.
function up(directory) {
  return "../".repeat(directory.split("/").length + 1);
}

const routeImports =
  "import { defineRoute, numberParam, stringParam } from '@loozo/angular-router';\n";

// A route: its definition, the parent's default import and the page, which registers its handle,
// the active route and its own destination, and marks its evaluation.
async function groupRoute(directory, expression, { parent, imports = "", page = "leaf" } = {}) {
  let header = routeImports;

  if (parent) {
    header += `import parent from '${"../".repeat(directory.split("/").length - parent.split("/").length)}definition.js';\n`;
  }

  await write(
    `src/routes/${directory}/definition.ts`,
    `${header}${imports}export default ${expression};\n`,
  );

  if (!page) {
    return;
  }

  const template =
    page === "outlet"
      ? `<p data-group="${directory}">${directory}</p><router-outlet />`
      : `<p data-group="${directory}">${directory}</p>`;

  await write(
    `src/routes/${directory}/page.ts`,
    `import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { injectActiveRoute } from '${up(directory)}../generated/routes.generated.js';
import { injectRoute } from './route.generated.js';
import { destination } from './destination.generated.js';
import { mark } from '${up(directory)}group-probes.js';

mark('page:${directory}');

@Component({ imports: [RouterOutlet], template: ${JSON.stringify(template)} })
export default class Page {
  readonly handle = injectRoute();
  readonly active = injectActiveRoute();

  constructor() {
    const pages = ((window as any).groupPages ??= {});

    pages[${JSON.stringify(directory)}] = { handle: this.handle, active: this.active, own: destination };
  }
}
`,
  );
}

// A helper module that marks its own evaluation.
async function helper(path, body) {
  const directory = path.slice(0, path.lastIndexOf("/"));

  await write(
    `src/routes/${path}`,
    `import { call, mark } from '${up(directory)}group-probes.js';\n\nmark('eval:${path}');\n\n${body}`,
  );
}

const drop = "search: { mode: 'drop' }, fragment: { mode: 'drop' }";

await groupRoute("outside", "defineRoute('outside', {})");
// The outside page carries a typed link into the group.
await write(
  "src/routes/outside/page.ts",
  `import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { injectActiveRoute } from '../../../generated/routes.generated.js';
import { injectRoute } from './route.generated.js';
import { destination } from './destination.generated.js';
import { destination as detail } from '../group-root/$id/detail/destination.generated.js';
import { mark } from '../../group-probes.js';

mark('page:outside');

@Component({
  imports: [RouterLink],
  template: '<p data-group="outside">outside</p><a id="into-group" [routerLink]="handle.link({ to: detail, params: { id: 7 }, search: { score: 42 } })">detail</a>',
})
export default class Page {
  readonly handle = injectRoute();
  readonly active = injectActiveRoute();
  readonly detail = detail;

  constructor() {
    ((window as any).groupPages ??= {}).outside = { handle: this.handle, active: this.active, own: destination };
  }
}
`,
);
await groupRoute("deep-target", "defineRoute('deep-target/$id', { params: { id: numberParam } })");

// 1. A denied root never fetches its children.
await groupRoute(
  "group-denied/area",
  "defineRoute('group-denied/area', {}).canMatch([() => { call('canMatch group-denied/area', true); return false; }])",
  { imports: "import { call } from '../../../group-probes.js';\n", page: "outlet" },
);
await helper("group-denied/area/x/helper.ts", "export const xGuard = () => true;\n");
await groupRoute("group-denied/area/x", "defineRoute('x', { parent }).canActivate([xGuard])", {
  parent: "group-denied/area",
  imports: "import { xGuard } from './helper.js';\n",
});
await groupRoute(
  "group-denied/$rest[]",
  "defineRoute('group-denied/$rest[]', { params: { rest: stringParam } })",
);

// 2. A root with canMatch, providers and canActivateChild above a nested group.
await groupRoute(
  "group-root",
  "defineRoute('group-root', {}).canMatch([() => { mark('canMatch group-root'); return true; }]).canActivateChild([() => { call('canActivateChild group-root', true); return true; }]).providers([{ provide: groupToken, useValue: 'root token' }])",
  { imports: "import { call, groupToken, mark } from '../../group-probes.js';\n", page: "outlet" },
);
await helper(
  "group-root/$id/helper.ts",
  `export const idMatch = () => {
  mark('canMatch group-root/$id');
  return true;
};
export const idActivate = (inputs: { params: { id: number } }) => inputs.params.id !== 13;
export const idValue = (inputs: { params: { id: number } }) => 'value ' + inputs.params.id;
export const idTitle = (inputs: { params: { id: number } }) => 'Item ' + inputs.params.id;
`,
);
await groupRoute(
  "group-root/$id",
  "defineRoute('$id', { parent, params: { id: numberParam }, search: { score: numberParam } }).canMatch([idMatch]).canActivate([idActivate]).resolve({ value: idValue }).title(idTitle)",
  {
    parent: "group-root",
    imports: "import { idActivate, idMatch, idTitle, idValue } from './helper.js';\n",
    page: "outlet",
  },
);
await helper(
  "group-root/$id/detail/helper.ts",
  "export const detailTitle = (inputs: { params: { id: number } }) => 'Detail ' + inputs.params.id;\n",
);
await groupRoute("group-root/$id/detail", "defineRoute('detail', { parent }).title(detailTitle)", {
  parent: "group-root/$id",
  imports: "import { detailTitle } from './helper.js';\n",
});
// The detail page also reads the root's provider and links out.
await write(
  "src/routes/group-root/$id/detail/token.ts",
  `import { inject } from '@angular/core';
import { createUrl } from '@loozo/angular-router';
import { groupToken } from '../../../../group-probes.js';
import { destination as detail } from './destination.generated.js';
import { destination as id } from '../destination.generated.js';
import { destination as root } from '../../destination.generated.js';
import { destination as outside } from '../../../outside/destination.generated.js';

export function detailProof() {
  return {
    token: inject(groupToken),
    references: { detail, id, root, outside },
    createUrl: () => createUrl(detail, { params: { id: 9 }, search: { score: 1 } }),
  };
}
`,
);
await groupRoute("group-root/static/l1", "defineRoute('static/l1', { parent })", {
  parent: "group-root",
});
await groupRoute(
  "group-root/old/item/$id",
  `defineRoute('old/item/$id', { parent, params: { id: numberParam } }).redirect({ to: id, params: { id: 'id' }, ${drop} })`,
  {
    parent: "group-root",
    imports: "import { destination as id } from '../../../$id/destination.generated.js';\n",
    page: false,
  },
);

// 9. A deep redirect source three declarations below the root; users is a group itself.
await groupRoute("group-deep", "defineRoute('group-deep', {})", { page: "outlet" });
await helper(
  "group-deep/users/guard-helper.ts",
  "export const usersGuard = (inputs: { params: object }) => {\n  call('users guard', inputs.params);\n  return true;\n};\n",
);
await helper(
  "group-deep/users/resolver-helper.ts",
  "export const usersValue = () => 'users resolved';\n",
);
await helper(
  "group-deep/users/token.ts",
  "import { InjectionToken } from '@angular/core';\n\nexport const usersToken = new InjectionToken<string>('users token');\n",
);
await helper(
  "group-deep/users/provider.ts",
  "import { usersToken } from './token.js';\n\nexport const usersProviders = [{ provide: usersToken, useValue: 'users provided' }];\n",
);
await helper("group-deep/users/data.ts", "export const usersData = { kind: 'users static' };\n");
await groupRoute(
  "group-deep/users",
  "defineRoute('users', { parent }).canActivate([usersGuard]).resolve({ resolved: usersValue }).providers(usersProviders).data(usersData)",
  {
    parent: "group-deep",
    imports:
      "import { usersGuard } from './guard-helper.js';\nimport { usersValue } from './resolver-helper.js';\nimport { usersProviders } from './provider.js';\nimport { usersData } from './data.js';\n",
    page: "outlet",
  },
);
await helper(
  "group-deep/users/$id/callback-helper.ts",
  "export const idGuard = (inputs: { params: { id: number } }) => {\n  call('users/$id guard', inputs.params);\n  return true;\n};\n",
);
await groupRoute(
  "group-deep/users/$id",
  "defineRoute('$id', { parent, params: { id: numberParam } }).canActivate([idGuard])",
  { parent: "group-deep/users", imports: "import { idGuard } from './callback-helper.js';\n" },
);
// The $id page reads the users token and users' data through its parent snapshot.
await write(
  "src/routes/group-deep/users/$id/scope.ts",
  `import { inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { usersToken } from '../token.js';

export function usersScope() {
  return { token: inject(usersToken), parentData: inject(ActivatedRoute).parent!.snapshot.data };
}
`,
);
await helper("group-deep/users/$id/old/old-helper.ts", "export const oldTitle = () => 'old';\n");
await groupRoute(
  "group-deep/users/$id/old",
  `defineRoute('old', { parent }).title(oldTitle).redirect({ to: target, params: { id: 'id' }, ${drop} })`,
  {
    parent: "group-deep/users/$id",
    imports:
      "import { oldTitle } from './old-helper.js';\nimport { destination as target } from '../../../../deep-target/destination.generated.js';\n",
    page: false,
  },
);

// 7. Callbacks that read their route's child configuration (F7).
await groupRoute(
  "group-config/match",
  "defineRoute('group-config/match', {}).canMatch([(_inputs, native) => { call('config match', { children: native.children === undefined, loader: typeof native.loadChildren }); return Boolean(native.children?.length); }])",
  { imports: "import { call } from '../../../group-probes.js';\n", page: "outlet" },
);
await groupRoute(
  "group-config/activation",
  "defineRoute('group-config/activation', {}).canActivate([(_inputs, snapshot) => { call('config activation', { children: snapshot.routeConfig?.children === undefined, loader: typeof snapshot.routeConfig?.loadChildren }); return Boolean(snapshot.routeConfig?.children?.length); }])",
  { imports: "import { call } from '../../../group-probes.js';\n", page: "outlet" },
);
await groupRoute(
  "group-config/structure",
  "defineRoute('group-config/structure', {}).canMatch([(_inputs, native) => Boolean(native.children?.length || native.loadChildren)]).canActivate([(_inputs, snapshot) => Boolean(snapshot.routeConfig?.children?.length || snapshot.routeConfig?.loadChildren)])",
  { page: "outlet" },
);

for (const name of ["match", "activation", "structure"]) {
  await groupRoute(`group-config/${name}/child`, "defineRoute('child', { parent })", {
    parent: `group-config/${name}`,
  });
}

await groupRoute(
  "group-config/$rest[]",
  "defineRoute('group-config/$rest[]', { params: { rest: stringParam } })",
);

// 6. Prototype-2 Q1's scenarios; their no-group results are the expected values.
await groupRoute("group-q1a/area", "defineRoute('group-q1a/area', {}).canMatch([() => false])", {
  page: "outlet",
});
await groupRoute("group-q1a/area/inner", "defineRoute('inner', { parent })", {
  parent: "group-q1a/area",
});
await groupRoute(
  "group-q1a/$rest[]",
  "defineRoute('group-q1a/$rest[]', { params: { rest: stringParam } })",
);
await groupRoute("group-q1a2/area", "defineRoute('group-q1a2/area', {}).canMatch([() => false])", {
  page: "outlet",
});
await groupRoute("group-q1a2/area/inner", "defineRoute('inner', { parent })", {
  parent: "group-q1a2/area",
});
await groupRoute(
  "group-q1a2/$rest[]",
  `defineRoute('group-q1a2/$rest[]', { params: { rest: stringParam } }).redirect({ to: outside, ${drop} })`,
  {
    imports: "import { destination as outside } from '../../outside/destination.generated.js';\n",
    page: false,
  },
);

for (const [root, page] of [
  ["group-q1b", "outlet"],
  ["group-q1c", false],
]) {
  await groupRoute(root, `defineRoute('${root}', {})`, { page });
  await groupRoute(`${root}/$id`, "defineRoute('$id', { parent, params: { id: numberParam } })", {
    parent: root,
    page: "outlet",
  });
  await groupRoute(`${root}/$id/more`, "defineRoute('more', { parent })", {
    parent: `${root}/$id`,
  });
  await groupRoute(
    `${root}/$rest[]`,
    "defineRoute('$rest[]', { parent, params: { rest: stringParam } })",
    {
      parent: root,
    },
  );
}

await groupRoute("group-q1d", "defineRoute('group-q1d', {})", { page: "outlet" });
await groupRoute("group-q1d/+gate", "defineRoute('', { parent }).canMatch([() => false])", {
  parent: "group-q1d",
  page: false,
});
await groupRoute("group-q1d/+gate/inner", "defineRoute('inner', { parent })", {
  parent: "group-q1d/+gate",
});
// As in prototype-2: the generator forbids two ordinary siblings with one effective path, so the
// later sibling matching /group-q1d is a catchall page.
await groupRoute(
  "group-q1d/fallback",
  "defineRoute('$rest[]', { parent, params: { rest: stringParam } })",
  { parent: "group-q1d" },
);
await groupRoute(
  "group-q1e",
  "defineRoute('group-q1e', {}).canActivateChild([(_inputs, child) => { call('q1e canActivateChild', child.routeConfig?.path); return child.data['permission'] === 'yes'; }])",
  { imports: "import { call } from '../../group-probes.js';\n", page: "outlet" },
);
await groupRoute(
  "group-q1e/group",
  "defineRoute('group', { parent }).data({ permission: 'yes' })",
  {
    parent: "group-q1e",
    page: "outlet",
  },
);
await groupRoute(
  "group-q1e/group/child",
  "defineRoute('child', { parent }).data({ permission: 'yes' })",
  { parent: "group-q1e/group" },
);

// 10. Prototype-2 Q3's ordering competitions.
await groupRoute("group-order", "defineRoute('group-order', {})", { page: false });
await groupRoute(
  "group-order/old/$id",
  `defineRoute('old/$id', { parent, params: { id: numberParam } }).redirect({ to: target, params: { id: 'id' }, ${drop} })`,
  {
    parent: "group-order",
    imports:
      "import { destination as target } from '../../../deep-target/destination.generated.js';\n",
    page: false,
  },
);
await groupRoute(
  "group-order/$rest[]",
  "defineRoute('$rest[]', { parent, params: { rest: stringParam } })",
  {
    parent: "group-order",
  },
);
await groupRoute("group-order2", "defineRoute('group-order2', {})", { page: false });
await groupRoute(
  "group-order2/$rest[]",
  `defineRoute('$rest[]', { parent, params: { rest: stringParam } }).redirect({ to: outside, ${drop} })`,
  {
    parent: "group-order2",
    imports: "import { destination as outside } from '../../outside/destination.generated.js';\n",
    page: false,
  },
);
await groupRoute("group-order2/page", "defineRoute('page', { parent })", {
  parent: "group-order2",
});

// The detail and $id pages expose what only they can inject.
for (const [directory, module, name] of [
  ["group-root/$id/detail", "./token.js", "detailProof"],
  ["group-deep/users/$id", "./scope.js", "usersScope"],
]) {
  const path = `src/routes/${directory}/page.ts`;
  const text = await readFile(join(fixture, path), "utf8");

  await write(
    path,
    text
      .replace("import { mark }", `import { ${name} } from '${module}';\nimport { mark }`)
      .replace("own: destination };", `own: destination, proof: ${name}() };`),
  );
}

// The users page exposes its data and token too.
{
  const path = "src/routes/group-deep/users/page.ts";
  const text = await readFile(join(fixture, path), "utf8");

  await write(
    path,
    text
      .replace(
        "import { mark }",
        "import { inject } from '@angular/core';\nimport { usersToken } from './token.js';\nimport { mark }",
      )
      .replace("own: destination };", "own: destination, token: inject(usersToken) };"),
  );
}

await build({ statsJson: true });

const { measureBundle } = await import(
  pathToFileURL(join(repository, "tools/bench/bundle.mjs")).href
);
const { routeBundle } = await import(
  pathToFileURL(join(packageDirectory, "bench/bundle.mjs")).href
);

// The bench's bundle measurement of a fixture's browser build (no server, so index.html).
async function measureFixture(directory) {
  const { outputPath, browser } = configuration.projects.proof.architect.build.options;
  const measured = await measureBundle({
    output: join(directory, outputPath),
    entryPoint: browser,
    index: "index.html",
  });

  return routeBundle(measured);
}

const groupsBundle = await measureFixture(fixture);
const groupsOutput = join(fixture, "dist/proof");
const groupsStats = JSON.parse(await readFile(join(groupsOutput, "browser-stats.json"), "utf8"));

await writeFile(join(evidence, "groups-bundle.json"), JSON.stringify(groupsBundle, null, 2));

// The output chunks holding bytes of an input module.
function outputsOf(input) {
  return Object.entries(groupsStats.outputs)
    .filter(([, value]) => (value.inputs[input]?.bytesInOutput ?? 0) > 0)
    .map(([path]) => path);
}

function chunkOf(input) {
  const outputs = outputsOf(input);

  assert.equal(outputs.length, 1, `${input} is in exactly one output: ${outputs.join(", ")}`);

  return outputs[0];
}

const table = (directory) => `src/routes/${directory}/children.generated.ts`;
const copy = (directory) => `src/routes/${directory}/route.generated.ts`;
const pageModule = (directory) => `src/routes/${directory}/page.ts`;

// 11. The closure, from the initial input modules. Descendants come from generation's own
// Declaration tree: declarations with a group-root proper ancestor.
const { discover } = await import(
  pathToFileURL(join(packageDirectory, "node/src/generation/sources.js")).href
);
const groupSources = await discover(fixture, "tsconfig.routes.json", ["src/routes"], "generated");
const isGroupRoot = (declaration) =>
  declaration.retained && declaration.children.some((child) => child.retained);
const descendants = groupSources.declarations.filter((declaration) => {
  for (let ancestor = declaration.parent; ancestor; ancestor = ancestor.parent) {
    if (isGroupRoot(ancestor)) {
      return true;
    }
  }

  return false;
});
const local = (file) => file.slice(fixture.length + 1);
const byPath = (a, b) => a.localeCompare(b, "en");
const initialInputs = new Set(
  groupsBundle.initial.inputs.map((input) => input.replace(/^\.\//, "")),
);

assert.deepEqual(
  [...initialInputs].filter((input) => input.endsWith("children.generated.ts")),
  [],
  "No children table is initial",
);

for (const declaration of descendants) {
  const own = local(declaration.file).replace(/definition\.ts$/, "route.generated.ts");

  assert.equal(initialInputs.has(own), false, `A descendant's copy is not initial: ${own}`);
}

for (const path of [
  "group-denied/area/x/helper.ts",
  "group-root/$id/helper.ts",
  "group-root/$id/detail/helper.ts",
  "group-deep/users/guard-helper.ts",
  "group-deep/users/resolver-helper.ts",
  "group-deep/users/token.ts",
  "group-deep/users/provider.ts",
  "group-deep/users/data.ts",
  "group-deep/users/$id/callback-helper.ts",
  "group-deep/users/$id/old/old-helper.ts",
]) {
  assert.equal(initialInputs.has(`src/routes/${path}`), false, `${path} is not initial`);
}

// Exactly the top-level records that read their copy: roots with callbacks or native options,
// and the non-static ones (their generated matching guard), plus the shell's own copy import.
assert.deepEqual(
  [...initialInputs].filter((input) => input.endsWith("/route.generated.ts")).sort(byPath),
  [
    "deep-target",
    "docs",
    "enum",
    "group-config/$rest[]",
    "group-config/activation",
    "group-config/match",
    "group-config/structure",
    "group-denied/$rest[]",
    "group-denied/area",
    "group-q1a/$rest[]",
    "group-q1a/area",
    "group-q1a2/$rest[]",
    "group-q1a2/area",
    "group-q1e",
    "group-root",
    "item",
    "optional",
    "products",
    "scope",
  ]
    .map(copy)
    .sort(byPath),
);

// The descendants' destinations that are initial: each hoisted redirect source's destination
// chain, and what the eager shell imports (middle and multi, with their chains).
const descendantDestinations = new Set(
  descendants.map((declaration) =>
    local(declaration.file).replace(/definition\.ts$/, "destination.generated.ts"),
  ),
);

assert.deepEqual(
  [...initialInputs].filter((input) => descendantDestinations.has(input)).sort(byPath),
  [
    "group-deep/users",
    "group-deep/users/$id",
    "group-deep/users/$id/old",
    "group-order/old/$id",
    "group-order2/$rest[]",
    "group-root/old/item/$id",
    "legacyIndex",
    "middle",
    "multi",
  ]
    .map((directory) => `src/routes/${directory}/destination.generated.ts`)
    .sort(byPath),
);

// A static server for the built browser files, falling back to index.html.
const { createServer } = await import("node:http");
const browserFiles = join(groupsOutput, "browser");
const staticServer = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  let body;
  let type = "text/html";

  try {
    if (path.endsWith(".js")) {
      body = await readFile(join(browserFiles, path));
      type = "text/javascript";
    } else if (path.endsWith(".css")) {
      body = await readFile(join(browserFiles, path));
      type = "text/css";
    }
  } catch {
    response.writeHead(404).end();

    return;
  }

  body ??= await readFile(join(browserFiles, "index.html"));
  response.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(body);
});

await new Promise((done) => staticServer.listen(0, "127.0.0.1", done));

const base = `http://127.0.0.1:${staticServer.address().port}/`;
const groupBrowser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const groupObservations = {};

// A fresh browser context booted at /outside, recording its script requests.
async function context(name) {
  const instance = await groupBrowser.newContext();
  const tab = await instance.newPage();
  const requests = [];
  const errors = [];

  tab.on("request", (request) => {
    const path = new URL(request.url()).pathname.slice(1);

    if (path.endsWith(".js")) {
      requests.push(path);
    }
  });
  tab.on("pageerror", (error) => errors.push(String(error)));
  await tab.goto(new URL("outside", base).href);
  await tab.waitForFunction(() => window.groupPages?.outside);
  await tab.evaluate(() => {
    window.navigationErrors = 0;
    window.activeProof.router.events.subscribe((event) => {
      // EventType.NavigationError
      if (event.type === 3) {
        window.navigationErrors += 1;
      }
    });
  });

  return { name, instance, tab, requests, errors };
}

// Navigates from /outside and reports the result, URL, rendered pages and navigation errors.
async function visit(tab, url, leaf) {
  return tab.evaluate(
    async ([target, leaf]) => {
      const { router } = window.activeProof;

      await router.navigateByUrl("/outside");

      const errors = window.navigationErrors;
      let result;

      try {
        result = await router.navigateByUrl(target);
      } catch (error) {
        result = `rejected: ${error?.message ?? error}`;
      }

      await new Promise((done) => setTimeout(done, 50));

      const seen = {
        result,
        url: router.url,
        rendered: [...document.querySelectorAll("[data-group]")].map((node) =>
          node.getAttribute("data-group"),
        ),
        navigationErrors: window.navigationErrors - errors,
      };

      // The active route is the leaf's own declaration.
      if (leaf) {
        seen.active = window.groupPages[leaf].active().is(window.groupPages[leaf].own);
      }

      return seen;
    },
    [url, leaf],
  );
}

const marks = (tab) => tab.evaluate(() => window.groupProof.marks.map((entry) => entry.name));
const calls = (tab) => tab.evaluate(() => structuredClone(window.groupProof.calls));

try {
  // 1. A cold denial, first, in a fresh context.
  const denial = await context("denial");
  const denialBoot = denial.requests.length;
  const denied = await visit(denial.tab, "/group-denied/area/x");
  const forbidden = new Set(
    [
      table("group-denied/area"),
      copy("group-denied/area/x"),
      "src/routes/group-denied/area/x/helper.ts",
      pageModule("group-denied/area"),
      pageModule("group-denied/area/x"),
    ].flatMap(outputsOf),
  );

  assert.deepEqual(denied, {
    result: true,
    url: "/group-denied/area/x",
    rendered: ["group-denied/$rest[]"],
    navigationErrors: 0,
  });
  assert.deepEqual((await calls(denial.tab))["canMatch group-denied/area"], [true]);
  assert.equal((await marks(denial.tab)).includes("eval:group-denied/area/x/helper.ts"), false);
  assert.deepEqual(
    denial.requests.slice(denialBoot).filter((path) => forbidden.has(path)),
    [],
    "A denied root fetches nothing of its children",
  );
  assert.ok(forbidden.size >= 2, "The denied root's lazy closure is in lazy chunks");
  groupObservations.denial = { denied, requests: denial.requests };
  await denial.instance.close();

  // 2. A cold successful entry through a typed link, in a separate fresh context.
  const entry = await context("entry");
  const { tab } = entry;
  const entryBoot = entry.requests.length;

  assert.equal(
    await tab.locator("#into-group").getAttribute("href"),
    "/group-root/7/detail?score=42",
  );
  await tab.locator("#into-group").click();
  await tab.waitForFunction(() => window.groupPages?.["group-root/$id/detail"]);
  await tab.waitForFunction(() => document.title === "Detail 7");

  const timeline = await tab.evaluate(() => ({
    marks: window.groupProof.marks.map(({ name, at }) => ({ name, at })),
    resources: performance.getEntriesByType("resource").map(({ name, startTime, responseEnd }) => ({
      path: new URL(name).pathname.slice(1),
      startTime,
      responseEnd,
    })),
  }));
  const at = (name) => {
    const found = timeline.marks.find((entry) => entry.name === name);

    assert.ok(found, `mark ${name}`);

    return found.at;
  };
  const requested = (path) => {
    const found = timeline.resources.filter((entry) => entry.path === path);

    assert.equal(found.length, 1, `${path} is requested once`);

    return found[0];
  };
  const rootTable = requested(chunkOf(table("group-root")));
  const idTable = requested(chunkOf(table("group-root/$id")));

  // Two serial table fetches, then the pages.
  assert.ok(at("canMatch group-root") < rootTable.startTime, "root canMatch before its table");
  assert.ok(
    rootTable.responseEnd <= at("eval:group-root/$id/helper.ts"),
    "root table, then evaluated",
  );
  assert.ok(at("canMatch group-root/$id") < idTable.startTime, "$id canMatch before its table");
  assert.ok(
    idTable.responseEnd <= at("eval:group-root/$id/detail/helper.ts"),
    "$id table, then evaluated",
  );

  for (const directory of ["group-root", "group-root/$id", "group-root/$id/detail"]) {
    assert.ok(
      requested(chunkOf(pageModule(directory))).startTime >
        at("eval:group-root/$id/detail/helper.ts"),
      `${directory}'s page loads after both tables`,
    );
  }

  const entered = await tab.evaluate(() => {
    const page = window.groupPages["group-root/$id/detail"];
    const id = window.groupPages["group-root/$id"];
    const { references } = page.proof;
    const active = page.active();

    return {
      params: page.handle.params(),
      search: page.handle.search(),
      data: id.handle.data(),
      title: document.title,
      is: active.is(references.detail),
      contains: [active.contains(references.root), active.contains(references.id)],
      token: page.proof.token,
      canActivateChild: window.groupProof.calls["canActivateChild group-root"].length,
      createUrl: page.proof.createUrl(),
    };
  });

  assert.deepEqual(entered, {
    params: { id: 7 },
    search: { score: 42 },
    data: { value: "value 7" },
    title: "Detail 7",
    is: true,
    contains: [true, true],
    token: "root token",
    // One run per activated child below the root, as without groups.
    canActivateChild: 2,
    createUrl: "/group-root/9/detail?score=1",
  });

  // 3. Typed navigate.
  const navigated = await tab.evaluate(async () => {
    const page = window.groupPages["group-root/$id/detail"];
    const result = await page.handle.navigate({ params: { id: 8 }, search: { score: 43 } });

    await new Promise((done) => setTimeout(done, 50));

    return {
      result,
      params: page.handle.params(),
      search: page.handle.search(),
      data: window.groupPages["group-root/$id"].handle.data(),
    };
  });

  assert.deepEqual(navigated, {
    result: true,
    params: { id: 8 },
    search: { score: 43 },
    data: { value: "value 8" },
  });

  // 4. $id at its bare URL: its table is cached.
  const tablesBefore = entry.requests.filter((path) => path === idTable.path).length;
  const bare = await tab.evaluate(async () => {
    const result = await window.activeProof.router.navigateByUrl("/group-root/7");
    const page = window.groupPages["group-root/$id"];

    return { result, is: page.active().is(page.own) };
  });

  assert.deepEqual(bare, { result: true, is: true });
  assert.equal(entry.requests.filter((path) => path === idTable.path).length, tablesBefore);

  // 5. A typed link out, then a denied id.
  const out = await tab.evaluate(async () => {
    const detail = window.groupPages["group-root/$id"];
    const { router } = window.activeProof;
    const result = await router.navigateByUrl(
      detail.handle.link({ to: window.groupPages.outside.own }),
    );
    const outside = window.groupPages.outside;
    const active = outside.active();
    const denied = await router.navigateByUrl("/group-root/13/detail");

    return {
      result,
      is: active.is(outside.own),
      containsRoot: active.contains(window.groupPages["group-root"].own),
      denied,
      url: router.url,
    };
  });

  assert.deepEqual(out, {
    result: true,
    is: true,
    containsRoot: false,
    denied: false,
    url: "/outside",
  });

  // 6. Prototype-2 Q1's recorded no-group results.
  const q1 = {};

  for (const [url, leaf] of [
    ["/group-q1a/area", "group-q1a/$rest[]"],
    ["/group-q1a2/area", "outside"],
    ["/group-q1b", "group-q1b/$rest[]"],
    ["/group-q1c", "group-q1c/$rest[]"],
    ["/group-q1d", "group-q1d/fallback"],
  ]) {
    q1[url] = await visit(tab, url, leaf);
  }

  await tab.evaluate(() => delete window.groupProof.calls["q1e canActivateChild"]);
  q1["/group-q1e/group"] = await visit(tab, "/group-q1e/group", "group-q1e/group");
  q1["/group-q1e/group calls"] = (await calls(tab))["q1e canActivateChild"];
  await tab.evaluate(() => delete window.groupProof.calls["q1e canActivateChild"]);
  q1["/group-q1e/group/child"] = await visit(
    tab,
    "/group-q1e/group/child",
    "group-q1e/group/child",
  );
  q1["/group-q1e/group/child calls"] = (await calls(tab))["q1e canActivateChild"];

  assert.deepEqual(q1, {
    "/group-q1a/area": {
      result: true,
      url: "/group-q1a/area",
      rendered: ["group-q1a/$rest[]"],
      navigationErrors: 0,
      active: true,
    },
    "/group-q1a2/area": {
      result: true,
      url: "/outside",
      rendered: ["outside"],
      navigationErrors: 0,
      active: true,
    },
    "/group-q1b": {
      result: true,
      url: "/group-q1b",
      rendered: ["group-q1b", "group-q1b/$rest[]"],
      navigationErrors: 0,
      active: true,
    },
    "/group-q1c": {
      result: true,
      url: "/group-q1c",
      rendered: ["group-q1c/$rest[]"],
      navigationErrors: 0,
      active: true,
    },
    "/group-q1d": {
      result: true,
      url: "/group-q1d",
      rendered: ["group-q1d", "group-q1d/fallback"],
      navigationErrors: 0,
      active: true,
    },
    "/group-q1e/group": {
      result: true,
      url: "/group-q1e/group",
      rendered: ["group-q1e", "group-q1e/group"],
      navigationErrors: 0,
      active: true,
    },
    "/group-q1e/group calls": ["group"],
    "/group-q1e/group/child": {
      result: true,
      url: "/group-q1e/group/child",
      rendered: ["group-q1e", "group-q1e/group", "group-q1e/group/child"],
      navigationErrors: 0,
      active: true,
    },
    "/group-q1e/group/child calls": ["group", "child"],
  });

  // 7. F7: a route with children has loadChildren and no children in its native config.
  const config = {
    match: await visit(tab, "/group-config/match/child"),
    activation: await visit(tab, "/group-config/activation/child"),
    structure: await visit(tab, "/group-config/structure/child"),
    calls: await calls(tab),
  };

  assert.deepEqual(config.match, {
    result: true,
    url: "/group-config/match/child",
    rendered: ["group-config/$rest[]"],
    navigationErrors: 0,
  });
  assert.deepEqual(config.activation, {
    result: false,
    url: "/outside",
    rendered: ["outside"],
    navigationErrors: 0,
  });
  assert.deepEqual(config.structure, {
    result: true,
    url: "/group-config/structure/child",
    rendered: ["group-config/structure", "group-config/structure/child"],
    navigationErrors: 0,
  });
  assert.deepEqual(config.calls["config match"], [{ children: true, loader: "function" }]);
  assert.deepEqual(config.calls["config activation"], [{ children: true, loader: "function" }]);

  // 8. D6, shallow: the source copy loads on first use; a codec failure fails the navigation.
  const sourceChunk = chunkOf(copy("group-root/old/item/$id"));

  assert.equal(entry.requests.includes(sourceChunk), false, "The source copy hasn't loaded yet");

  const shallow = await visit(tab, "/group-root/old/item/7");

  assert.deepEqual(shallow, {
    result: true,
    url: "/group-root/7",
    rendered: ["group-root", "group-root/$id"],
    navigationErrors: 0,
  });
  assert.equal(entry.requests.filter((path) => path === sourceChunk).length, 1);

  const codec = await visit(tab, "/group-root/old/item/abc");

  assert.match(String(codec.result), /^rejected: /);
  assert.deepEqual(
    { ...codec, result: undefined },
    {
      result: undefined,
      url: "/outside",
      rendered: ["outside"],
      navigationErrors: 1,
    },
  );

  // 10. Ordering: an ordinary redirect beats an ordinary catchall page, which matches its
  // control URL; the ordinary tree beats a hoisted catchall redirect, which wins only unmatched.
  const ordering = {
    control: await visit(tab, "/group-order/zzz"),
    redirect: await visit(tab, "/group-order/old/5"),
    tree: await visit(tab, "/group-order2/page"),
    unmatched: await visit(tab, "/group-order2/zzz"),
  };

  assert.deepEqual(ordering, {
    control: {
      result: true,
      url: "/group-order/zzz",
      rendered: ["group-order/$rest[]"],
      navigationErrors: 0,
    },
    redirect: {
      result: true,
      url: "/deep-target/5",
      rendered: ["deep-target"],
      navigationErrors: 0,
    },
    tree: {
      result: true,
      url: "/group-order2/page",
      rendered: ["group-order2/page"],
      navigationErrors: 0,
    },
    unmatched: { result: true, url: "/outside", rendered: ["outside"], navigationErrors: 0 },
  });
  assert.deepEqual(entry.errors, []);
  groupObservations.entry = {
    timeline,
    entered,
    navigated,
    bare,
    out,
    q1,
    config,
    shallow,
    codec,
    ordering,
    requests: entry.requests.slice(entryBoot),
  };
  await entry.instance.close();

  // 8. D6, shallow: a rejected loader fails the navigation once, in a fresh context.
  const failing = await context("failing-loader");

  await failing.tab.route(`**/${sourceChunk}`, (route) => route.abort());

  const rejected = await visit(failing.tab, "/group-root/old/item/7");

  assert.match(String(rejected.result), /^rejected: /);
  assert.equal(rejected.url, "/outside");
  assert.equal(rejected.navigationErrors, 1);
  groupObservations.rejectedLoader = rejected;
  await failing.instance.close();

  // 9. D6, deep, in a fresh context: the redirect loads its copy chain and no table.
  const deep = await context("deep");
  const deepBoot = deep.requests.length;

  assert.deepEqual(
    (await marks(deep.tab)).filter((name) => name.startsWith("eval:group-deep")),
    [],
    "No group-deep copy is evaluated at startup",
  );

  const redirected = await visit(deep.tab, "/group-deep/users/7/old");
  const deepTarget = await deep.tab.evaluate(() =>
    window.groupPages["deep-target"].active().is(window.groupPages["deep-target"].own),
  );
  const deepMarks = (await marks(deep.tab)).filter((name) => name.startsWith("eval:group-deep"));
  const deepTables = [table("group-deep"), table("group-deep/users")].map(chunkOf);

  assert.deepEqual(redirected, {
    result: true,
    url: "/deep-target/7",
    rendered: ["deep-target"],
    navigationErrors: 0,
  });
  assert.equal(deepTarget, true);
  // Each copy's modules evaluate before the copy that imports it: users', then $id's, then old's.
  assert.deepEqual(deepMarks.slice(-2), [
    "eval:group-deep/users/$id/callback-helper.ts",
    "eval:group-deep/users/$id/old/old-helper.ts",
  ]);
  assert.deepEqual(deepMarks.slice(0, -2).sort(), [
    "eval:group-deep/users/data.ts",
    "eval:group-deep/users/guard-helper.ts",
    "eval:group-deep/users/provider.ts",
    "eval:group-deep/users/resolver-helper.ts",
    "eval:group-deep/users/token.ts",
  ]);
  assert.deepEqual(
    deep.requests.slice(deepBoot).filter((path) => deepTables.includes(path)),
    [],
    "The redirect fetches no children table",
  );
  assert.deepEqual(await calls(deep.tab), {}, "No ancestor guard runs during the redirect");

  const tablesAt = deep.requests.length;
  const users = await visit(deep.tab, "/group-deep/users/7");
  const scoped = await deep.tab.evaluate(() => {
    const usersPage = window.groupPages["group-deep/users"];
    const idPage = window.groupPages["group-deep/users/$id"];

    return {
      data: usersPage.handle.data(),
      token: usersPage.token,
      idToken: idPage.proof.token,
      parentData: idPage.proof.parentData,
      calls: structuredClone(window.groupProof.calls),
    };
  });

  assert.deepEqual(users, {
    result: true,
    url: "/group-deep/users/7",
    rendered: ["group-deep", "group-deep/users", "group-deep/users/$id"],
    navigationErrors: 0,
  });
  assert.deepEqual(
    deep.requests.slice(tablesAt).filter((path) => deepTables.includes(path)),
    deepTables,
    "group-deep's table, then users'",
  );
  assert.deepEqual(scoped, {
    // The handle reads resolver values; static data shows in the native snapshot below.
    data: { resolved: "users resolved" },
    token: "users provided",
    idToken: "users provided",
    parentData: { kind: "users static", resolved: "users resolved" },
    // users' guard reads its own inputs; only $id has the id.
    calls: { "users guard": [{}], "users/$id guard": [{ id: 7 }] },
  });
  assert.deepEqual(deep.errors, []);
  groupObservations.deep = {
    redirected,
    deepMarks,
    users,
    scoped,
    requests: deep.requests.slice(deepBoot),
  };
  await deep.instance.close();
} finally {
  await groupBrowser.close();
  staticServer.close();
  await writeFile(
    join(evidence, "groups-observations.json"),
    JSON.stringify(groupObservations, null, 2),
  );
}

// A4: an eager record's ".." winner inside a group. A separate small app: a top-level empty-path
// parent whose terminal empty-path child is the canonical "/", and a top-level item whose ".." is
// that grouped child. The shell imports none of that chain.
const catalog = join(evidence, "catalog");

await cp(join(repository, "examples/angular-router"), catalog, {
  recursive: true,
  filter: (path) =>
    !/(?:^|\/)(?:node_modules|dist|\.angular|generated|\+home)(?:\/|$)/.test(path) &&
    !path.endsWith("route.generated.ts") &&
    !path.endsWith("destination.generated.ts"),
});
await writeFile(join(catalog, "angular.json"), JSON.stringify(configuration));
await symlink(join(fixture, "node_modules"), join(catalog, "node_modules"), "dir");

for (const [directory, expression, parent] of [
  ["+layout", "defineRoute('', {})", undefined],
  ["+layout/default", "defineRoute('', { parent })", "../definition.js"],
  ["item", "defineRoute('item', {})", undefined],
]) {
  await mkdir(join(catalog, "src/routes", directory), { recursive: true });
  await writeFile(
    join(catalog, "src/routes", directory, "definition.ts"),
    `import { defineRoute } from '@loozo/angular-router';\n${parent ? `import parent from '${parent}';\n` : ""}export default ${expression};\n`,
  );
  await writeFile(join(catalog, "src/routes", directory, "page.ts"), page);
}

await build({ statsJson: true }, catalog);

const catalogBundle = await measureFixture(catalog);
const catalogInputs = catalogBundle.initial.inputs.map((input) => input.replace(/^\.\//, ""));

await writeFile(join(evidence, "catalog-bundle.json"), JSON.stringify(catalogBundle, null, 2));
assert.match(
  await readFile(join(catalog, "generated/routes.generated.ts"), "utf8"),
  /path: "item",\n\.\.\.record\(destination_item_definition, destination__layout_default_definition\),/,
);
assert.deepEqual(
  catalogInputs.filter((input) => input.startsWith("src/routes/")).sort(),
  [
    // The winner and its parent destination chain; item's own destination and the layout root's.
    "src/routes/+layout/default/destination.generated.ts",
    "src/routes/+layout/destination.generated.ts",
    "src/routes/item/destination.generated.ts",
  ].sort(),
);

// Retained search keys (SPEC §6) in a built browser app: +workspace owns retained `workspace`
// and `tags`; other, unrelated, owns a retained `workspace` of its own. Pages and the shell
// expose their handles, so every handle and target form is read in the browser.
const retainedApp = join(evidence, "retained");

await cp(join(repository, "examples/angular-router"), retainedApp, {
  recursive: true,
  filter: (path) =>
    !/(?:^|\/)(?:node_modules|dist|\.angular|generated|\+home)(?:\/|$)/.test(path) &&
    !path.endsWith("route.generated.ts") &&
    !path.endsWith("destination.generated.ts"),
});
await writeFile(join(retainedApp, "angular.json"), JSON.stringify(configuration));
await symlink(join(fixture, "node_modules"), join(retainedApp, "node_modules"), "dir");

const retainedPage = (name) => `import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { injectRoute } from "./route.generated.js";

@Component({ imports: [RouterOutlet], template: '<p id="${name}">${name}</p><router-outlet />' })
export default class Page {
  constructor() {
    const proof = ((window as any).retained ??= {});

    (proof.handles ??= {})["${name}"] = injectRoute();
  }
}
`;

for (const [directory, expression, parent] of [
  [
    "+workspace",
    "defineRoute('', { search: { workspace: retained(stringParam), tags: retained(arrayParam(stringParam)) } })",
    undefined,
  ],
  ["+workspace/orders", "defineRoute('orders', { parent })", "../definition.js"],
  [
    "+workspace/orders/$id",
    "defineRoute('$id', { parent, params: { id: numberParam } })",
    "../definition.js",
  ],
  ["login", "defineRoute('login', {})", undefined],
  ["other", "defineRoute('other', { search: { workspace: retained(stringParam) } })", undefined],
  ["other/child", "defineRoute('child', { parent })", "../definition.js"],
]) {
  await mkdir(join(retainedApp, "src/routes", directory), { recursive: true });
  await writeFile(
    join(retainedApp, "src/routes", directory, "definition.ts"),
    `import { arrayParam, defineRoute, numberParam, retained, stringParam } from '@loozo/angular-router';\n${parent ? `import parent from '${parent}';\n` : ""}export default ${expression};\n`,
  );
  await writeFile(
    join(retainedApp, "src/routes", directory, "page.ts"),
    retainedPage(directory.replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")),
  );
}

await writeFile(
  join(retainedApp, "src/shell.ts"),
  `import { Component, inject } from "@angular/core";
import { Router, RouterOutlet } from "@angular/router";
import { injectActiveRoute } from "../generated/routes.generated.js";
import { destination as order } from "./routes/+workspace/orders/$id/destination.generated.js";
import { destination as login } from "./routes/login/destination.generated.js";
import { destination as otherChild } from "./routes/other/child/destination.generated.js";

@Component({ selector: "proof-app", imports: [RouterOutlet], template: "<router-outlet />" })
export default class Shell {
  constructor() {
    const proof = ((window as any).retained ??= {});

    proof.router = inject(Router);
    proof.active = injectActiveRoute();
    proof.destinations = { order, login, otherChild };
  }
}
`,
);
await build({}, retainedApp);

const { staticServer: retainedServer } = await import("./sibling-groups.mjs");
const retainedHost = await retainedServer(retainedApp);
const retainedBrowser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const retainedObservations = {};

try {
  const tab = await (await retainedBrowser.newContext({ colorScheme: "dark" })).newPage();
  const retainedErrors = [];

  tab.on("pageerror", (error) => retainedErrors.push(String(error)));

  // Navigates by URL and waits for the commit and the page that exposes `handle`.
  async function open(url, handle) {
    await tab.evaluate((target) => window.retained.router.navigateByUrl(target), url);
    await tab.waitForFunction(
      ([target, name]) =>
        window.retained.router.url === target && window.retained.handles?.[name] !== undefined,
      [url, handle],
    );
  }

  // Every href a case reads, from the named handle, the layout's and the shell's active handle.
  function read(from) {
    return tab.evaluate((name) => {
      const { router, active, destinations, handles } = window.retained;
      const href = (tree) => router.serializeUrl(tree);
      const handle = handles[name];

      return {
        page: href(handle.link({ to: destinations.order, params: { id: 7 } })),
        layout: href(handles.workspace.link({ to: destinations.order, params: { id: 7 } })),
        active: href(active().link({ to: destinations.order, params: { id: 7 } })),
        login: href(handle.link({ to: destinations.login })),
        otherChild: href(handle.link({ to: destinations.otherChild })),
      };
    }, from);
  }

  await tab.goto(`${retainedHost.base}/login`);
  await tab.waitForFunction(() => window.retained?.handles?.login !== undefined);

  await open("/orders?workspace=acme&tags=a&tags=b", "workspace-orders");

  const inside = await read("workspace-orders");
  const own = await tab.evaluate(() => {
    const { router, handles } = window.retained;
    const orders = handles["workspace-orders"];

    return {
      own: router.serializeUrl(orders.link({})),
      replaced: router.serializeUrl(orders.link({ search: { workspace: "beta" } })),
      dropped: router.serializeUrl(orders.link({ search: { workspace: undefined, tags: [] } })),
    };
  });

  // navigate retains like link; the detail's ".." keeps both keys too.
  await tab.evaluate(() => {
    const { destinations, handles } = window.retained;

    return handles["workspace-orders"].navigate({ to: destinations.order, params: { id: 7 } });
  });
  await tab.waitForFunction(() => window.retained.handles["workspace-orders-id"] !== undefined);

  const detail = await tab.evaluate(() => {
    const { router, handles } = window.retained;

    return {
      url: router.url,
      up: router.serializeUrl(handles["workspace-orders-id"].link({ to: ".." })),
    };
  });

  // A repeated scalar copies nothing; a valid key alone is copied (`tags` holds strings, so
  // `x` is valid). The all-or-nothing array rule is covered in tests/root.test.mjs.
  await open("/orders?workspace=a&workspace=b&tags=x", "workspace-orders");

  const repeated = await read("workspace-orders");

  // Inside other, only other's own workspace follows, and only into its subtree.
  await open("/other?workspace=beta", "other");

  const unrelated = await tab.evaluate(() => {
    const { router, active, destinations, handles } = window.retained;
    const href = (tree) => router.serializeUrl(tree);

    return {
      page: href(handles.other.link({ to: destinations.order, params: { id: 7 } })),
      active: href(active().link({ to: destinations.order, params: { id: 7 } })),
      otherChild: href(handles.other.link({ to: destinations.otherChild })),
    };
  });

  Object.assign(retainedObservations, { inside, own, detail, repeated, unrelated, retainedErrors });
  await tab.screenshot({ path: join(evidence, "retained.png") });

  assert.deepEqual(inside, {
    page: "/orders/7?tags=a&tags=b&workspace=acme",
    layout: "/orders/7?tags=a&tags=b&workspace=acme",
    active: "/orders/7?tags=a&tags=b&workspace=acme",
    login: "/login",
    otherChild: "/other/child",
  });
  assert.deepEqual(own, {
    own: "/orders?tags=a&tags=b&workspace=acme",
    replaced: "/orders?tags=a&tags=b&workspace=beta",
    dropped: "/orders",
  });
  assert.deepEqual(detail, {
    url: "/orders/7?tags=a&tags=b&workspace=acme",
    up: "/orders?tags=a&tags=b&workspace=acme",
  });
  assert.deepEqual(repeated, {
    page: "/orders/7?tags=x",
    layout: "/orders/7?tags=x",
    active: "/orders/7?tags=x",
    login: "/login",
    otherChild: "/other/child",
  });
  assert.deepEqual(unrelated, {
    page: "/orders/7",
    active: "/orders/7",
    otherChild: "/other/child?workspace=beta",
  });
  assert.deepEqual(retainedErrors, []);
} finally {
  await writeFile(join(evidence, "retained.json"), JSON.stringify(retainedObservations, null, 2));
  await retainedBrowser.close();
  await retainedHost.close();
}

// Sibling pathless groups (SPEC §10): each URL reaches the group whose routes own it, and a group
// that doesn't own it calls no matching guard and loads no table. Each URL opens cold, so its
// guard calls, evaluated modules and table requests are its own.
const {
  buildFixture,
  chunkSources,
  errorCodes,
  siblingFixture,
  staticServer: siblingServer,
  visitCold,
} = await import("./sibling-groups.mjs");
const siblings = join(evidence, "sibling-groups");
const siblingObservations = {};
const siblingBrowser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const authenticatedTable = "src/routes/+authenticated/children.generated.ts";
const signedInTable = "src/routes/+signed-in/children.generated.ts";

await mkdir(siblings);

// Builds one tree and opens each URL cold; `after` runs extra steps in a URL's open tab.
async function siblingTree(name, options, urls, after = {}) {
  const directory = await siblingFixture(siblings, name, options);

  await buildFixture(directory);

  const chunks = await chunkSources(directory);
  const server = await siblingServer(directory);
  const result = {};

  try {
    for (const url of urls) {
      const slug = url.replace(/[^a-z0-9]+/gi, "_") || "root";
      const visit = await visitCold(siblingBrowser, server.base, chunks, url, {
        screenshot: join(siblings, `${name}-${slug}.png`),
      });

      try {
        result[url] = visit.seen;

        if (after[url]) {
          result[url].after = await after[url](visit.tab);
        }
      } finally {
        await visit.close();
      }
    }
  } finally {
    await server.close();
    siblingObservations[name] = result;
    await writeFile(
      join(evidence, "sibling-groups.json"),
      JSON.stringify(siblingObservations, null, 2),
    );
  }

  return result;
}

function authenticatedTouched(seen) {
  return (
    seen.calls.some((call) => call.startsWith("authenticated:")) ||
    seen.tables.includes(authenticatedTable)
  );
}

try {
  const main = await siblingTree(
    "main",
    { products: true, initializer: true },
    [
      "/",
      "/inbox",
      "/settings",
      "/profile",
      "/profile?auth=redirect",
      "/inbox?auth=redirect",
      "/products",
      "/products/inbox",
    ],
    {
      // `..` from a page in one group renders the shared path's winner in the other.
      "/inbox": (tab) =>
        tab.evaluate(async () => {
          const result = await window.proofInbox.up();

          await new Promise((done) => setTimeout(done, 50));

          return {
            result,
            url: window.proofRouter.url,
            rendered: [...document.querySelectorAll("[data-layout], [data-leaf]")].map(
              (node) => node.getAttribute("data-layout") ?? node.getAttribute("data-leaf"),
            ),
          };
        }),
    },
  );

  assert.deepEqual(main["/"].rendered, ["signed-in", "index"]);
  assert.deepEqual(main["/inbox"].rendered, ["authenticated", "inbox"]);
  assert.deepEqual(main["/settings"].rendered, ["authenticated", "settings"]);
  assert.deepEqual(main["/profile"].rendered, ["signed-in", "profile"]);
  assert.deepEqual(main["/inbox"].tables, [authenticatedTable]);

  for (const url of ["/", "/profile", "/profile?auth=redirect"]) {
    assert.equal(authenticatedTouched(main[url]), false, url);
    assert.deepEqual(main[url].tables, [signedInTable], url);
    assert.equal(main[url].evaluated.includes("authenticated:layout"), false, url);
  }

  // Authenticated's redirecting guard runs only for the URLs it owns.
  assert.equal(main["/profile?auth=redirect"].url, "/profile?auth=redirect");
  assert.deepEqual(main["/inbox?auth=redirect"].rendered, ["blocked"]);
  assert.equal(main["/inbox?auth=redirect"].url, "/blocked");
  assert.deepEqual(main["/inbox"].after, {
    result: true,
    url: "/",
    rendered: ["signed-in", "index"],
  });

  // F3, native Angular behavior: Angular builds a path-matched group's route injector, running
  // its environment initializers, before any canMatch, so the ownership guard can't stop them.
  // Its matching guard and table stay untouched.
  assert.ok(main["/profile"].evaluated.includes("authenticated:init"), "F3 initializer ran");

  // Neither group below products ends /products, so its page renders alone.
  assert.deepEqual(main["/products"].rendered, ["products"]);
  assert.deepEqual(main["/products"].tables, ["src/routes/products/children.generated.ts"]);
  assert.deepEqual(main["/products/inbox"].rendered, ["products", "products-a", "products-inbox"]);

  // A group holding a catchall is tried after every other record, so it frames not-found pages
  // without swallowing the other group's URLs, and it catches what that group's guard refuses.
  const fallback = await siblingTree("catchall", { catchall: true }, [
    "/",
    "/profile",
    "/nope",
    "/profile?signed=deny",
    "/blocked",
  ]);

  assert.deepEqual(fallback["/"].rendered, ["signed-in", "index"]);
  assert.deepEqual(fallback["/profile"].rendered, ["signed-in", "profile"]);
  assert.deepEqual(fallback["/nope"].rendered, ["authenticated", "not-found"]);
  assert.deepEqual(fallback["/profile?signed=deny"].rendered, ["authenticated", "not-found"]);
  assert.deepEqual(fallback["/blocked"].rendered, ["blocked"]);

  for (const url of ["/", "/profile", "/blocked"]) {
    assert.equal(authenticatedTouched(fallback[url]), false, url);
  }

  // Without an index nothing ends `/`: both groups refuse it, so it reaches a root catchall...
  const missing = await siblingTree("no-index-catchall", { index: false, rootCatchall: true }, [
    "/",
    "/inbox",
  ]);

  assert.deepEqual(missing["/"].rendered, ["missing"]);
  assert.deepEqual(missing["/"].tables, []);
  assert.deepEqual(missing["/"].calls, ["shell"]);
  assert.deepEqual(missing["/inbox"].rendered, ["authenticated", "inbox"]);

  // ...or, without one, commits with an empty root outlet: the app shell alone, no error.
  const empty = await siblingTree("no-index", { index: false }, ["/", "/profile"]);

  assert.equal(empty["/"].url, "/");
  assert.deepEqual(empty["/"].rendered, []);
  assert.deepEqual(empty["/"].tables, []);
  assert.deepEqual(empty["/"].calls, ["shell"]);
  assert.deepEqual(errorCodes(empty["/"]), []);
  assert.deepEqual(empty["/"].pageErrors, []);
  assert.deepEqual(empty["/profile"].rendered, ["signed-in", "profile"]);
} finally {
  await siblingBrowser.close();
}

console.log(
  "Public generated navigation typing, destination identity across trees, exact native Promise/UrlTree/RouterLink, behavior options, selector exclusions, '..' edges, per-route stability, route children and sibling pathless groups proof passed",
);
