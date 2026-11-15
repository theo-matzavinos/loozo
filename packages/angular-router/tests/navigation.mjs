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
  `import { injectActiveRoute } from '../generated/destinations.generated.js';
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
// @ts-expect-error link needs is() first, even with an explicit destination
active()?.link({ to: item, params: { id: 1 } });
// @ts-expect-error navigate needs is() first
void active()?.navigate({ to: item, params: { id: 1 } });
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

const driver = `import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { defineRoute, stringParam } from '@loozo/angular-router';
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
import { injectActiveRoute } from '../generated/destinations.generated.js';
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
    const view = {
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
const perRoute = /^src\/routes\/.*\/(?:route|destination)\.generated\.ts$/;

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

// Removing the root winner changes exactly its own pair, both shared files and the route copies
// whose ".." it was; every destination and every other copy keeps its bytes, modes and mtimes.
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
  ["generated/destinations.generated.ts", "generated/routes.generated.ts", ...upCopies].sort(),
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

console.log(
  "Public generated navigation typing, destination identity across trees, exact native Promise/UrlTree/RouterLink, behavior options, selector exclusions, '..' edges and per-route stability proof passed",
);
