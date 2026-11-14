import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, writeFile, readFile, rename, rm, realpath, stat, symlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import {
  AnchorState,
  CompilerState,
  createValidationProgram,
  validateRoutes,
} from "../node/src/generation/index.js";
import { generate } from "../node/src/generation/generate.js";
import { discover } from "../node/src/generation/sources.js";
import { selections } from "../node/src/generation/validate.js";
import { emit } from "../node/src/generation/emit.js";
import { emitPackage, extensionSource, installExtension } from "./extension/emit.mjs";

const scratch = resolve(import.meta.dirname, "../../../.scratch/router-generation");
let sequence = 0;

async function fixture() {
  const root = resolve(scratch, `${process.pid}-${++sequence}`);

  await mkdir(root, { recursive: true });

  return root;
}

function diagnostics(state, files, options, jsDocParsingMode) {
  const host = ts.createCompilerHost(options, true);

  host.jsDocParsingMode = jsDocParsingMode;

  const program = state.createProgram(files, options, host);

  return ts.getPreEmitDiagnostics(program);
}

test("closed compiler coupling honors effective parsing options and JSDoc input without source edits", async () => {
  const root = await fixture();
  const first = resolve(root, "first.ts");
  const second = resolve(root, "second.ts");
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    types: [],
    noEmit: true,
  };
  const state = new CompilerState();

  await Promise.all([
    writeFile(first, "const duplicate = 1;"),
    writeFile(second, "const duplicate = 2;"),
  ]);
  assert.ok(diagnostics(state, [first, second], options).some((error) => error.code === 2451));
  assert.deepEqual(
    diagnostics(state, [first, second], {
      ...options,
      moduleDetection: ts.ModuleDetectionKind.Force,
    }),
    [],
  );
  assert.ok(diagnostics(state, [first, second], options).some((error) => error.code === 2451));

  const javascript = resolve(root, "input.js");
  const jsOptions = { ...options, allowJs: true, checkJs: true, noImplicitAny: false };

  await writeFile(
    javascript,
    "/** @param {number} value */\nfunction use(value){return value;}\nuse('invalid');",
  );
  assert.ok(
    diagnostics(state, [javascript], jsOptions, ts.JSDocParsingMode.ParseAll).some(
      (error) => error.code === 2345,
    ),
  );
  assert.deepEqual(diagnostics(state, [javascript], jsOptions, ts.JSDocParsingMode.ParseNone), []);
  assert.ok(
    diagnostics(state, [javascript], jsOptions, ts.JSDocParsingMode.ParseAll).some(
      (error) => error.code === 2345,
    ),
  );
  state.clear();
});

test("package export swaps reject unchanged imports with both declaration targets already referenced", async () => {
  const root = await fixture();
  const consumer = resolve(root, "consumer.ts");
  const dependency = resolve(root, "node_modules/dependency");
  const manifest = resolve(dependency, "package.json");
  const original = JSON.stringify({
    name: "dependency",
    version: "1.0.0",
    exports: { "./first": "./number.d.ts", "./second": "./string.d.ts" },
  });
  const swapped = JSON.stringify({
    name: "dependency",
    version: "1.0.0",
    exports: { "./first": "./string.d.ts", "./second": "./number.d.ts" },
  });
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    types: [],
    skipLibCheck: false,
    noEmit: true,
  };
  const state = new CompilerState();

  await mkdir(dependency, { recursive: true });
  await Promise.all([
    writeFile(manifest, original),
    writeFile(resolve(dependency, "number.d.ts"), "export declare const value:number;"),
    writeFile(resolve(dependency, "string.d.ts"), "export declare const value:string;"),
    writeFile(
      consumer,
      "import {value as first} from 'dependency/first';import {value as second} from 'dependency/second';const a:number=first;const b:string=second;void a;void b;",
    ),
  ]);
  assert.deepEqual(diagnostics(state, [consumer], options), []);
  assert.deepEqual(diagnostics(state, [consumer], options), []);
  await writeFile(manifest, swapped);

  const warm = diagnostics(state, [consumer], options);
  const cold = ts.getPreEmitDiagnostics(ts.createProgram([consumer], options));

  assert.deepEqual(
    warm.map((error) => error.code),
    [2322, 2322],
  );
  assert.deepEqual(
    warm.map((error) => error.code),
    cold.map((error) => error.code),
  );
  await writeFile(manifest, original);
  assert.deepEqual(diagnostics(state, [consumer], options), []);
  state.clear();
});

test("fresh NodeNext metadata resolution changes implied format with identical source bytes", async () => {
  const root = await fixture();
  const source = resolve(root, "input.ts");
  const manifest = resolve(root, "package.json");
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    types: [],
    noEmit: true,
  };
  const state = new CompilerState();

  await Promise.all([
    writeFile(manifest, '{"type":"module"}'),
    writeFile(source, "export const value = await Promise.resolve(1);"),
  ]);
  assert.deepEqual(diagnostics(state, [source], options), []);
  await writeFile(manifest, '{"type":"commonjs"}');
  assert.ok(diagnostics(state, [source], options).some((error) => error.code === 1309));
  await writeFile(manifest, '{"type":"module"}');
  assert.deepEqual(diagnostics(state, [source], options), []);
  state.clear();
});

test("full diagnostics reject transitive declaration changes and fresh module candidates/removals", async () => {
  const root = await fixture();
  const consumer = resolve(root, "consumer.ts");
  const bridge = resolve(root, "bridge.ts");
  const declaration = resolve(root, "dependency.d.ts");
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    types: [],
    skipLibCheck: false,
    noEmit: true,
    moduleSuffixes: [".preferred", ""],
  };
  const state = new CompilerState();

  await Promise.all([
    writeFile(consumer, "import {value} from './bridge';const checked:number=value;void checked;"),
    writeFile(bridge, "export {value} from './dependency';"),
    writeFile(declaration, "export declare const value:number;"),
  ]);
  assert.deepEqual(diagnostics(state, [consumer], options), []);
  assert.deepEqual(diagnostics(state, [consumer], options), []);
  await writeFile(declaration, "export declare const value:string;");
  assert.ok(diagnostics(state, [consumer], options).some((error) => error.code === 2322));
  await writeFile(declaration, "export declare const value:number;");
  assert.deepEqual(diagnostics(state, [consumer], options), []);

  const preferred = resolve(root, "dependency.preferred.d.ts");

  await writeFile(preferred, "export declare const value:string;");
  assert.ok(diagnostics(state, [consumer], options).some((error) => error.code === 2322));
  await rm(preferred);
  assert.deepEqual(diagnostics(state, [consumer], options), []);
  await rm(declaration);
  assert.ok(diagnostics(state, [consumer], options).some((error) => error.code === 2307));
  await writeFile(declaration, "export declare const value:number;");
  assert.deepEqual(diagnostics(state, [consumer], options), []);
  state.clear();
});

test("session anchors reuse factory descriptors until options, the entry or any file it read changes", async () => {
  const root = await fixture();
  const entry = resolve(root, "node_modules/factory/index.d.ts");
  const inner = resolve(root, "node_modules/inner");
  const manifest = resolve(inner, "package.json");
  const first = resolve(inner, "first.d.ts");
  const second = resolve(inner, "second.d.ts");
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    types: [],
    noEmit: true,
  };
  const names = ["defineRoute", "missing"];
  const state = new AnchorState();

  await Promise.all([
    mkdir(dirname(entry), { recursive: true }),
    mkdir(inner, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(entry, "export {defineRoute} from 'inner';"),
    writeFile(manifest, JSON.stringify({ name: "inner", exports: { ".": "./first.d.ts" } })),
    writeFile(first, "export declare function defineRoute(): void;"),
    writeFile(second, "// second\nexport declare function defineRoute(): void;"),
  ]);

  const initial = await state.anchor(entry, names, options);
  const [firstFile, secondFile] = await Promise.all([realpath(first), realpath(second)]);

  assert.deepEqual(initial.get("defineRoute"), [
    { file: firstFile, kind: ts.SyntaxKind.FunctionDeclaration, pos: 0, end: 44 },
  ]);
  assert.equal(initial.get("missing"), undefined);
  assert.equal(await state.anchor(entry, names, options), initial);

  // A transitive declaration read by the anchor program moves the declaration.
  await writeFile(first, "// moved\nexport declare function defineRoute(): void;");

  const moved = await state.anchor(entry, names, options);

  assert.notEqual(moved, initial);
  assert.deepEqual(moved.get("defineRoute"), [
    { file: firstFile, kind: ts.SyntaxKind.FunctionDeclaration, pos: 0, end: 53 },
  ]);

  // Package metadata consulted during resolution retargets the export.
  await writeFile(manifest, JSON.stringify({ name: "inner", exports: { ".": "./second.d.ts" } }));
  assert.equal((await state.anchor(entry, names, options)).get("defineRoute")[0].file, secondFile);

  // Editing the entry itself.
  await writeFile(entry, "export {};");

  const removed = await state.anchor(entry, names, options);

  assert.equal(removed.get("defineRoute"), undefined);
  assert.equal(await state.anchor(entry, names, options), removed);

  const changedOptions = await state.anchor(entry, names, { ...options, noImplicitAny: false });

  assert.notEqual(changedOptions, removed);
  assert.equal(
    await state.anchor(entry, names, { ...options, noImplicitAny: false }),
    changedOptions,
  );
  state.clear();
  assert.notEqual(
    await state.anchor(entry, names, { ...options, noImplicitAny: false }),
    changedOptions,
  );
});

test("session-backed generation follows edits across passes and recovers after a failed pass", async () => {
  const root = await fixture();
  const packageDirectory = resolve(import.meta.dirname, "..");
  const routes = resolve(root, "generated/routes.generated.ts");
  const definition = resolve(root, "src/routes/docs/route.ts");
  const options = {
    tsconfig: "tsconfig.json",
    scanDirectories: ["src/routes"],
    outDirectory: "generated",
  };
  const state = {
    discovery: new CompilerState(),
    overlay: new CompilerState(),
    anchor: new AnchorState(),
  };

  function page(template) {
    return `import { Component } from "@angular/core";\n\n@Component({ template: "${template}" })\nexport default class Page {}\n`;
  }

  // The serve builder's contract: any failed pass clears every slot.
  async function pass() {
    try {
      await generate(root, options, () => false, state);
    } catch (error) {
      state.discovery.clear();
      state.overlay.clear();
      state.anchor.clear();

      throw error;
    }
  }

  await Promise.all([
    mkdir(resolve(root, "src/routes/docs"), { recursive: true }),
    mkdir(resolve(root, "node_modules/@loozo"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      resolve(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          skipLibCheck: true,
          experimentalDecorators: true,
          lib: ["ES2022", "DOM"],
          types: [],
        },
        include: ["src/**/*.ts"],
      }),
    ),
    writeFile(resolve(root, "src/routes/docs/page.ts"), page("docs")),
    symlink(packageDirectory, resolve(root, "node_modules/@loozo/angular-router"), "dir"),
    symlink(
      resolve(packageDirectory, "node_modules/@angular"),
      resolve(root, "node_modules/@angular"),
      "dir",
    ),
  ]);

  await pass();
  assert.match(await readFile(routes, "utf8"), /path: "docs"/);
  assert.doesNotMatch(await readFile(routes, "utf8"), /path: "guide"/);

  // A new page is seeded and routed by the warm second pass.
  await mkdir(resolve(root, "src/routes/docs/guide"));
  await writeFile(resolve(root, "src/routes/docs/guide/page.ts"), page("guide"));

  await pass();
  assert.match(await readFile(routes, "utf8"), /path: "guide"/);
  assert.match(await readFile(resolve(root, "src/routes/docs/guide/route.ts"), "utf8"), /guide/);
  await readFile(resolve(root, "src/routes/docs/guide/route.generated.ts"), "utf8");

  // An unchanged warm pass writes nothing.
  const { mtimeNs } = await stat(routes, { bigint: true });

  await pass();
  assert.equal((await stat(routes, { bigint: true })).mtimeNs, mtimeNs);

  const seeded = await readFile(definition, "utf8");

  await writeFile(definition, `${seeded}const broken: number = "text";\n`);
  await assert.rejects(pass(), /TS2322/);

  // The repair also adds a title, which the next pass must adapt through the route set. Callback
  // options reach the definition through the route set, so routes.generated.ts doesn't import it.
  await writeFile(definition, seeded.replace("{})", '{}).title("Manual")'));
  await pass();
  assert.match(
    await readFile(routes, "utf8"),
    /\.\.\.callbacks\(getRouteSet\(\), "src\/routes\/docs\/route\.ts"\)/,
  );
  assert.doesNotMatch(await readFile(routes, "utf8"), /import definition/);

  // A native option is read from the definition itself, which is then imported.
  await writeFile(definition, seeded.replace("{})", "{}).providers([])"));
  await pass();
  assert.match(await readFile(routes, "utf8"), /nativeOptions\(definition_docs_route\)/);
  assert.match(await readFile(routes, "utf8"), /import definition_docs_route from/);
  assert.doesNotMatch(await readFile(routes, "utf8"), /callbacks/);

  // Session passes leave exactly what stateless generation would publish.
  await generate(root, { ...options, check: true }, () => false);
});

// A project with helpers for authoring pages and declarations, in filesystem mode unless the
// overrides say otherwise.
async function filesystemProject(overrides = {}) {
  const root = await fixture();
  const packageDirectory = resolve(import.meta.dirname, "..");
  const options = {
    tsconfig: "tsconfig.json",
    scanDirectories: ["src/routes"],
    outDirectory: "generated",
    ...overrides,
  };

  async function write(path, bytes) {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), bytes);
  }

  async function exists(path) {
    try {
      await stat(resolve(root, path));

      return true;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }

      return false;
    }
  }

  await mkdir(resolve(root, "node_modules/@loozo"), { recursive: true });
  await Promise.all([
    writeFile(
      resolve(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          skipLibCheck: true,
          experimentalDecorators: true,
          lib: ["ES2022", "DOM"],
          types: [],
        },
        include: ["src/**/*.ts"],
      }),
    ),
    symlink(packageDirectory, resolve(root, "node_modules/@loozo/angular-router"), "dir"),
    symlink(
      resolve(packageDirectory, "node_modules/@angular"),
      resolve(root, "node_modules/@angular"),
      "dir",
    ),
  ]);

  return {
    root,
    header: 'import { defineRoute } from "@loozo/angular-router";\n',
    write,
    exists,
    read: (path) => readFile(resolve(root, path), "utf8"),
    routes: () => readFile(resolve(root, "generated/routes.generated.ts"), "utf8"),
    move: async (from, to) => {
      await mkdir(dirname(resolve(root, to)), { recursive: true });
      await rename(resolve(root, from), resolve(root, to));
    },
    page: (directory) =>
      write(
        `src/routes/${directory}/page.ts`,
        `import { Component } from "@angular/core";\n\n@Component({ template: "${directory}" })\nexport default class Page {}\n`,
      ),
    generate: (extra = {}) => generate(root, { ...options, ...extra }, () => false),
  };
}

test("output checked out with CRLF line endings stays owned and current", async () => {
  const project = await filesystemProject();
  const files = [
    "generated/routes.generated.ts",
    "generated/destinations.generated.ts",
    "src/routes/teams/$teamId/route.ts",
    "src/routes/teams/$teamId/route.generated.ts",
  ];

  await project.page("teams/$teamId");
  await project.generate();

  // What Git's core.autocrlf does to committed text files on a Windows checkout.
  const checkedOut = new Map();

  for (const file of files) {
    const bytes = (await project.read(file)).replaceAll("\n", "\r\n");

    await project.write(file, bytes);

    const info = await stat(resolve(project.root, file), { bigint: true });

    checkedOut.set(file, { bytes, mtimeNs: info.mtimeNs });
  }

  await project.generate({ check: true });
  await project.generate();

  for (const [file, before] of checkedOut) {
    const info = await stat(resolve(project.root, file), { bigint: true });

    assert.equal(await project.read(file), before.bytes, file);
    assert.equal(info.mtimeNs, before.mtimeNs, file);
  }

  // Real drift is still drift, and the generator writes LF.
  await project.page("about");
  await assert.rejects(
    project.generate({ check: true }),
    /(changed|missing):\n[^]*\nRun ng build to update them and commit the result; this is expected after upgrading\.$/,
  );
  await project.generate();
  assert.match(await project.routes(), /path: "about"/);
  assert.doesNotMatch(await project.routes(), /\r/);
});

test("definition bindings follow paths, so adding or removing a route changes only its own lines", async () => {
  const project = await filesystemProject();
  const destinations = () => project.read("generated/destinations.generated.ts");

  for (const directory of ["teams/$teamId", "old-items", "old_items", "zeta"]) {
    await project.page(directory);
  }

  await project.generate();

  const before = await destinations();

  assert.ok(
    before.includes(
      'import definition_teams_$teamId_route from "../src/routes/teams/$teamId/route.js";',
    ),
  );
  // Paths that sanitize alike keep distinct bindings.
  assert.ok(before.includes("import definition_old_items_route from"));
  assert.ok(before.includes("import definition_old_items_route_2 from"));

  // Every line that remains is unchanged: an addition only adds lines, a removal only removes them.
  function onlyAdded(from, to) {
    const lines = new Set(to.split("\n"));

    for (const line of from.split("\n")) {
      assert.ok(lines.has(line), `changed: ${line}`);
    }
  }

  // "about" sorts before every existing route.
  await project.page("about");
  await project.generate();

  const added = await destinations();

  onlyAdded(before, added);

  await rm(resolve(project.root, "src/routes/teams"), { recursive: true });
  await project.generate();
  onlyAdded(await destinations(), added);
});

test("the shared module exports injectActiveRoute and its active route types", async () => {
  const project = await filesystemProject();

  await project.page("teams/$teamId");
  await project.page("teams/$teamId/items/$id");
  await project.generate();

  const path = resolve(project.root, "generated/destinations.generated.ts");
  const file = ts.createSourceFile(
    path,
    await project.read("generated/destinations.generated.ts"),
    {
      languageVersion: ts.ScriptTarget.ES2022,
    },
  );
  const imports = [];
  const declarations = new Map();

  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      imports.push(statement.getText(file));
    } else if (ts.isInterfaceDeclaration(statement) || ts.isFunctionDeclaration(statement)) {
      declarations.set(statement.name.text, statement);
    }
  }

  assert.ok(imports.includes("import type { Signal } from '@angular/core';"));
  assert.ok(
    imports.includes(
      "import { injectGeneratedActiveRoute, type RouteSchema, type RouteSet, type Handle as GeneratedHandle, type Destination as GeneratedDestination } from '@loozo/angular-router/_generated';",
    ),
  );

  const exported = (node) =>
    !!node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  const base = declarations.get("ActiveBase");
  const active = declarations.get("ActiveRoute");
  const narrowed = declarations.get("ActiveHandle");
  const inject = declarations.get("injectActiveRoute");

  assert.equal(exported(base), false);
  assert.deepEqual(
    base.members.map((member) => member.name.getText(file)),
    ["is", "contains", "chain"],
  );
  assert.equal(base.members[0].type.getText(file), "this is ActiveHandle<Other>");
  assert.equal(exported(active), true);
  assert.equal(
    active.heritageClauses[0].getText(file),
    'extends Pick<Handle<Retained>, "params" | "search" | "data" | "title">, ActiveBase',
  );
  assert.equal(exported(narrowed), true);
  assert.equal(narrowed.heritageClauses[0].getText(file), "extends Handle<Id>, ActiveBase");
  assert.equal(exported(inject), true);
  assert.equal(inject.parameters.length, 0);
  assert.equal(inject.type.getText(file), "Signal<ActiveRoute | undefined>");
  assert.equal(
    inject.body.getText(file),
    "{\n  return injectGeneratedActiveRoute(getRouteSet());\n}",
  );

  // A strict consumer narrows an ancestor through chain and the deepest route through is().
  await project.write(
    "src/shell.ts",
    `import { injectActiveRoute } from "../generated/destinations.generated.js";
import { destination as team } from "./routes/teams/$teamId/route.generated.js";
import { destination as item } from "./routes/teams/$teamId/items/$id/route.generated.js";

const active = injectActiveRoute();
export const teamId: string | undefined = active()?.chain.find((route) => route.is(team))?.params().teamId;
export const inTeam: boolean = active()?.contains(team) ?? false;
const route = active();

if (route?.is(item)) {
  route.link({ params: { teamId: "7", id: route.params().id } });
}
`,
  );

  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    experimentalDecorators: true,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    types: [],
    noEmit: true,
  };
  const program = ts.createProgram([resolve(project.root, "src/shell.ts")], options);

  assert.deepEqual(
    ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
    [],
  );
});

test("omitted autoDefineRoutes enables filesystem mode; false keeps explicit authoring", async () => {
  const project = await filesystemProject();

  await project.page("products/$productId");
  await project.generate();
  assert.equal(
    await project.read("src/routes/products/$productId/route.ts"),
    'import { defineRoute, stringParam } from "@loozo/angular-router";\n\nexport default defineRoute("products/$productId", { params: { "productId": stringParam } });\n',
  );
  assert.match(await project.routes(), /path: "products\/:productId"/);

  const explicit = await filesystemProject({ autoDefineRoutes: false });
  const declaration = `import { defineRoute, stringParam } from "@loozo/angular-router";\n\nexport default defineRoute("catalog/$productId", { params: { productId: stringParam } });\n`;

  // Paths come from the declaration, not the directories, and nothing is synchronized.
  await explicit.page("product");
  await explicit.write("src/routes/product/definition.ts", declaration);
  await explicit.generate();
  assert.equal(await explicit.read("src/routes/product/definition.ts"), declaration);
  assert.equal(await explicit.exists("src/routes/product/route.ts"), false);
  assert.match(await explicit.routes(), /path: "catalog\/:productId"/);

  // A page without a declaration is an error, not a seed.
  const routes = await explicit.routes();

  await explicit.page("orphan");
  await assert.rejects(explicit.generate(), /Component without a colocated admitted declaration/);
  assert.equal(await explicit.exists("src/routes/orphan/route.ts"), false);
  assert.equal(await explicit.routes(), routes);
});

test("filesystem mode: params the directories can't reconcile name the file, path, params and fix", async () => {
  const project = await filesystemProject();
  const file = "src/routes/alias/route.ts";
  const declaration = `import { defineRoute, numberParam } from "@loozo/angular-router";\n\nexport default defineRoute("old-items/$id", { params: { id: numberParam } });\n`;

  // A second pass after a repair has nothing left to write.
  async function unchangedOnRegeneration(path) {
    const before = await stat(resolve(project.root, path), { bigint: true });

    await project.generate();

    const after = await stat(resolve(project.root, path), { bigint: true });

    assert.equal(after.mtimeNs, before.mtimeNs, path);
  }

  await project.page("items");
  await project.write(file, declaration);
  await project.page("alias");

  const error = await project.generate().then(
    () => assert.fail("generation succeeded"),
    (reason) => reason,
  );

  assert.equal(
    error.message,
    `${resolve(project.root, file)}:3:28: Ambiguous filesystem params: the directories give path "alias" (removed params: id). Remove this file's params, or move or rename the directory`,
  );
  assert.doesNotMatch(error.message, /update path/i);
  assert.equal(await project.read(file), declaration);

  // A path without params can't keep even empty params.
  const emptied = declaration.replace("{ id: numberParam }", "{}");

  await project.write(file, emptied);
  await assert.rejects(project.generate(), /Remove this file's params/);
  assert.equal(await project.read(file), emptied);

  // Following the advice: once the params are gone, the builder rewrites only the path.
  const removed = declaration.replace("{ params: { id: numberParam } }", "{}");

  await project.write(file, removed);
  await project.generate();
  assert.equal(await project.read(file), removed.replace('"old-items/$id"', '"alias"'));
  assert.match(await project.routes(), /path: "alias"/);
  await unchangedOnRegeneration(file);

  // Both directions are named when a param is swapped for two others.
  await project.write(file, declaration);
  await project.move("src/routes/alias", "src/routes/$team/$slug/alias");

  const moved = "src/routes/$team/$slug/alias/route.ts";

  await assert.rejects(
    project.generate(),
    /the directories give path "\$team\/\$slug\/alias" \(removed params: id; added params: team, slug\)\. Edit this file's params to match, or move or rename the directory$/,
  );
  assert.equal(await project.read(moved), declaration);

  // Params whose keys match the directories' are kept byte for byte; only the path follows.
  const matched = declaration.replace(
    "{ id: numberParam }",
    "{ team: numberParam /* kept */, slug: numberParam }",
  );

  await project.write(moved, matched);
  await project.generate();
  assert.equal(
    await project.read(moved),
    matched.replace('"old-items/$id"', '"$team/$slug/alias"'),
  );
  assert.match(await project.routes(), /path: ":team\/:slug\/alias"/);
  await unchangedOnRegeneration(moved);

  // An added param with a key the old path didn't have can't be appended; matching keys can.
  const item = "src/routes/$group/items/$id/route.ts";
  const stray = `import { defineRoute, numberParam, stringParam } from "@loozo/angular-router";\n\nexport default defineRoute("items/$id", { params: { id: numberParam, extra: stringParam } });\n`;

  await rm(resolve(project.root, "src/routes/$team"), { recursive: true });
  await project.page("$group/items/$id");
  await project.write(item, stray);
  await assert.rejects(
    project.generate(),
    /the directories give path "\$group\/items\/\$id" \(added params: group\)\. Edit this file's params to match, or move or rename the directory$/,
  );
  assert.equal(await project.read(item), stray);

  const added = stray.replace("extra: stringParam", "group: stringParam");

  await project.write(item, added);
  await project.generate();
  assert.equal(await project.read(item), added.replace('"items/$id"', '"$group/items/$id"'));
  await unchangedOnRegeneration(item);
});

test("filesystem mode: only directories with a page or declaration become records; others prefix the records below", async () => {
  const project = await filesystemProject();
  const { header, read, exists } = project;

  await project.page("teams/$teamId/items/$id");
  await project.page("+group/plain");
  // An authored declaration makes a page-less directory a (componentless) record.
  await project.write(
    "src/routes/shell/route.ts",
    `${header}\nexport default defineRoute("shell", {});\n`,
  );
  await project.page("shell/docs/$slug");
  await project.generate();

  assert.equal(
    await read("src/routes/teams/$teamId/items/$id/route.ts"),
    'import { defineRoute, stringParam } from "@loozo/angular-router";\n\nexport default defineRoute("teams/$teamId/items/$id", { params: { "teamId": stringParam, "id": stringParam } });\n',
  );
  assert.equal(
    await read("src/routes/+group/plain/route.ts"),
    'import { defineRoute } from "@loozo/angular-router";\n\nexport default defineRoute("plain", {});\n',
  );
  assert.equal(
    await read("src/routes/shell/docs/$slug/route.ts"),
    'import { defineRoute, stringParam } from "@loozo/angular-router";\nimport parent from "../../route.js";\n\nexport default defineRoute("docs/$slug", { parent, params: { "slug": stringParam } });\n',
  );

  // Neither the scan root nor any page-less directory is seeded.
  for (const directory of [
    "",
    "teams",
    "teams/$teamId",
    "teams/$teamId/items",
    "+group",
    "shell/docs",
  ]) {
    assert.equal(await exists(`src/routes/${directory}/route.ts`), false, directory);
  }

  const generated = await project.routes();

  assert.match(generated, /^export const routes: Routes = \[\{ path: "plain",$/m);
  assert.match(generated, /path: "teams\/:teamId\/items\/:id"/);
  assert.match(generated, /path: "shell",\ndata: [^\n]+\nchildren: \[\{ path: "docs\/:slug"/);
  assert.doesNotMatch(generated, /path: ""|path: "teams",|path: "items"/);

  // Prefixed paths keep the path grammar's rejections, before any write.
  await project.page("files/$rest[]/more");
  await assert.rejects(
    project.generate(),
    /Invalid filesystem path "files\/\$rest\[\]\/more".*Catchall must be terminal/,
  );
  assert.equal(await exists("src/routes/files/$rest[]/more/route.ts"), false);
  assert.equal(await project.routes(), generated);
});

test("filesystem mode: a declaration added to a page-less directory re-parents and renames sole parent bindings", async () => {
  const project = await filesystemProject();
  const { header, read } = project;
  const declarations = {
    topic: "",
    shared: "export const same = libRoute;\n",
    busy: 'export const parent = "occupied";\n',
  };

  await project.page("lib");

  for (const [name, extra] of Object.entries(declarations)) {
    await project.page(`lib/section/${name}`);
    await project.write(
      `src/routes/lib/section/${name}/route.ts`,
      `${header}import libRoute from "../../route.js";\n\n${extra}export default defineRoute("section/${name}", { parent: libRoute });\n`,
    );
  }

  await project.generate();
  assert.match(await project.routes(), /path: "section\/topic"/);
  await project.write(
    "src/routes/lib/section/route.ts",
    `${header}import parent from "../route.js";\n\nexport default defineRoute("section", { parent });\n`,
  );
  await project.generate();

  // A binding that named the previous parent and is used nowhere else becomes `parent`.
  assert.equal(
    await read("src/routes/lib/section/topic/route.ts"),
    `${header}import parent from "../route.js";\n\nexport default defineRoute("topic", { parent });\n`,
  );
  // A binding used elsewhere keeps its import; the new parent gets its own.
  assert.equal(
    await read("src/routes/lib/section/shared/route.ts"),
    `${header}import libRoute from "../../route.js";\nimport parent from "../route.js";\n\n${declarations.shared}export default defineRoute("shared", { parent });\n`,
  );
  // With `parent` taken, the binding keeps its name.
  assert.equal(
    await read("src/routes/lib/section/busy/route.ts"),
    `${header}import libRoute from "../route.js";\n\n${declarations.busy}export default defineRoute("busy", { parent: libRoute });\n`,
  );
  assert.match(
    await project.routes(),
    /path: "section",\ndata: [^\n]+\nchildren: \[\{ path: "busy"/,
  );
});

test("filesystem mode: moving a declaration under and out of a page-less prefix rewrites its path, parent and imports", async () => {
  const project = await filesystemProject();
  const { header, read } = project;
  const solo = `// Keep this header.\n${header.trimEnd()} // keep with this import\n\nexport const marker = 1;\nexport default defineRoute("solo", {}).data({ marker });\n`;
  const taken = `${header}\nexport const parent = "occupied";\nexport default defineRoute("taken", {});\n`;

  await project.write(
    "src/routes/shell/route.ts",
    `${header}\nexport default defineRoute("shell", {});\n`,
  );
  await project.page("shell/docs");
  await project.page("solo");
  await project.write("src/routes/solo/route.ts", solo);
  await project.page("taken");
  await project.write("src/routes/taken/route.ts", taken);
  await project.generate();
  await project.move("src/routes/solo", "src/routes/shell/extra/solo");
  await project.move("src/routes/taken", "src/routes/shell/extra/taken");
  await project.generate();

  // The import follows the last import and its same-line comment, named `parent` when free.
  assert.equal(
    await read("src/routes/shell/extra/solo/route.ts"),
    solo
      .replace(
        "// keep with this import\n",
        '// keep with this import\nimport parent from "../../route.js";\n',
      )
      // Chained steps keep their bytes; only the path and URL facts are patched.
      .replace('"solo", {}', '"extra/solo", { parent }'),
  );
  assert.equal(
    await read("src/routes/shell/extra/taken/route.ts"),
    taken
      .replace(header, `${header}import filesystemParent from "../../route.js";\n`)
      .replace('"taken", {}', '"extra/taken", { parent: filesystemParent }'),
  );
  assert.match(await project.routes(), /path: "extra\/solo"/);

  // Moving back out drops the prefix and the parent.
  await project.move("src/routes/shell/extra/solo", "src/routes/solo");
  await project.generate();

  const restored = await read("src/routes/solo/route.ts");

  assert.match(restored, /defineRoute\("solo", \{ *\}\)\.data\(\{ marker \}\)/);
  assert.doesNotMatch(restored, /parent/);
  assert.match(await project.routes(), /path: "solo"/);
});

test("filesystem mode: a page-less param prefix adds a string codec and keeps authored ones", async () => {
  const project = await filesystemProject();
  const { header, read } = project;
  const imports = 'import { defineRoute, numberParam } from "@loozo/angular-router";\n';
  const parentImport = 'import parent from "../route.js";\n';
  const item = `${imports}${parentImport}\nexport default defineRoute("$id", { parent, params: { id: numberParam /* comment */ } });\n`;
  const aliased = `import { defineRoute, numberParam, stringParam as text } from "@loozo/angular-router";\nimport parent from "../../route.js";\n\nexport const label = text;\nexport default defineRoute("codes/$code", { parent, params: { code: numberParam } });\n`;
  const file = "src/routes/shell/$team/$id/route.ts";

  await project.write(
    "src/routes/shell/route.ts",
    `${header}\nexport default defineRoute("shell", {});\n`,
  );
  await project.page("shell/$id");
  await project.write("src/routes/shell/$id/route.ts", item);
  await project.page("shell/codes/$code");
  await project.write("src/routes/shell/codes/$code/route.ts", aliased);
  await project.generate();
  await project.move("src/routes/shell/$id", "src/routes/shell/$team/$id");
  await project.move("src/routes/shell/codes", "src/routes/shell/$team/codes");
  await project.generate();

  // The authored codec expression and its comment stay; the new param gets the seed's codec.
  assert.equal(
    await read(file),
    item
      .replace(
        parentImport,
        'import parent from "../../route.js";\nimport { stringParam } from "@loozo/angular-router";\n',
      )
      .replace('"$id"', '"$team/$id"')
      .replace("numberParam /* comment */ }", 'numberParam /* comment */ , "team": stringParam }'),
  );
  // An existing stringParam import is reused under its local name.
  assert.equal(
    await read("src/routes/shell/$team/codes/$code/route.ts"),
    aliased
      .replace('"../../route.js"', '"../../../route.js"')
      .replace('"codes/$code"', '"$team/codes/$code"')
      .replace("code: numberParam }", 'code: numberParam , "team": text }'),
  );
  assert.match(
    await project.routes(),
    /path: "shell",\ndata: [^\n]+\nchildren: \[[^\n]*path: ":team\/:id"/,
  );

  // A second pass has nothing left to write.
  const { mtimeNs } = await stat(resolve(project.root, file), {
    bigint: true,
  });

  await project.generate();
  assert.equal((await stat(resolve(project.root, file), { bigint: true })).mtimeNs, mtimeNs);

  // Removing a param would discard its codec.
  const synchronized = await read(file);

  await project.move("src/routes/shell/$team/$id", "src/routes/shell/$id");
  await assert.rejects(
    project.generate(),
    /Ambiguous filesystem params: the directories give path "\$id" \(removed params: team\)/,
  );
  assert.equal(await read("src/routes/shell/$id/route.ts"), synchronized);
  await project.move("src/routes/shell/$id", "src/routes/shell/$team/$id");

  // Additions apply only onto params whose keys are exactly the old placeholders.
  for (const [name, params, repair] of [
    [
      "opaque",
      "shared",
      "This file's params are not an inline object; write each one as a plain `name: codec` property to match",
    ],
    [
      "spread",
      "{ ...shared, slug: numberParam }",
      "This file's params use a spread or accessor; write each one as a plain `name: codec` property to match",
    ],
    ["extra", "{ slug: numberParam, other: numberParam }", "Edit this file's params to match"],
  ]) {
    const bytes = `${imports}${parentImport}\nconst shared = {};\nexport default defineRoute("$slug", { parent, params: ${params} });\n`;
    const message = `Ambiguous filesystem params: the directories give path "$team/${name}/$slug" (added params: team). ${repair}, or move or rename the directory`;

    await project.page(`shell/$team/${name}/$slug`);
    await project.write(`src/routes/shell/$team/${name}/$slug/route.ts`, bytes);
    await assert.rejects(project.generate(), (error) => error.message.endsWith(message), name);
    assert.equal(await read(`src/routes/shell/$team/${name}/$slug/route.ts`), bytes, name);
    await rm(resolve(project.root, `src/routes/shell/$team/${name}`), {
      recursive: true,
    });
  }

  // A shorthand codec can't be renamed in place; writing it as `name: codec` reconciles it.
  const shorthand = `${imports}import parent from "../../../route.js";\n\nconst slug = numberParam;\nexport default defineRoute("keys/x/$slug", { parent, params: { slug } });\n`;
  const renamed = shorthand.replace("{ slug }", "{ key: slug }");

  await project.page("shell/keys/x/$slug");
  await project.write("src/routes/shell/keys/x/$slug/route.ts", shorthand);
  await project.generate();
  await project.move("src/routes/shell/keys/x/$slug", "src/routes/shell/keys/x/$key");
  await assert.rejects(project.generate(), (error) =>
    error.message.endsWith(
      `Ambiguous filesystem params: the directories give path "keys/x/$key" (removed params: slug; added params: key). This file's params use a shorthand property; write each one as a plain \`name: codec\` property to match, or move or rename the directory`,
    ),
  );
  await project.write("src/routes/shell/keys/x/$key/route.ts", renamed);
  await project.generate();
  assert.equal(
    await read("src/routes/shell/keys/x/$key/route.ts"),
    renamed.replace('"keys/x/$slug"', '"keys/x/$key"'),
  );
});

test("local path params get the generated matching guard; misplaced onInvalidParams fails preflight", async () => {
  const root = await fixture();
  const packageDirectory = resolve(import.meta.dirname, "..");
  const routes = resolve(root, "generated/routes.generated.ts");
  const options = {
    tsconfig: "tsconfig.json",
    scanDirectories: ["src/routes"],
    outDirectory: "generated",
    autoDefineRoutes: false,
  };
  const imports = 'import { defineRoute, numberParam } from "@loozo/angular-router";\n';

  await Promise.all([
    mkdir(resolve(root, "src/routes/items"), { recursive: true }),
    mkdir(resolve(root, "src/routes/old"), { recursive: true }),
    mkdir(resolve(root, "node_modules/@loozo"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      resolve(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          skipLibCheck: true,
          experimentalDecorators: true,
          lib: ["ES2022", "DOM"],
          types: [],
        },
        include: ["src/**/*.ts"],
      }),
    ),
    writeFile(
      resolve(root, "src/routes/items/definition.ts"),
      `${imports}export default defineRoute("items/$id", { params: { id: numberParam } });\n`,
    ),
    writeFile(
      resolve(root, "src/routes/items/page.ts"),
      'import { Component } from "@angular/core";\n\n@Component({ template: "item" })\nexport default class Page {}\n',
    ),
    symlink(packageDirectory, resolve(root, "node_modules/@loozo/angular-router"), "dir"),
    symlink(
      resolve(packageDirectory, "node_modules/@angular"),
      resolve(root, "node_modules/@angular"),
      "dir",
    ),
  ]);

  // A params-only route reaches its definition through the route set, not an import.
  await generate(root, options, () => false);

  const generated = await readFile(routes, "utf8");

  assert.match(
    generated,
    /\.\.\.callbacks\(getRouteSet\(\), "src\/routes\/items\/definition\.ts"\)/,
  );
  assert.doesNotMatch(generated, /import definition/);

  for (const [chain, message] of [
    [
      'defineRoute("old", {}).onInvalidParams(() => false)',
      /onInvalidParams requires local path placeholders/,
    ],
    [
      'defineRoute("old/$id", { params: { id: numberParam } }).onInvalidParams(() => false).redirect({ to: items, search: { mode: "drop" }, fragment: { mode: "drop" } })',
      /Redirect cannot follow onInvalidParams/,
    ],
  ]) {
    await writeFile(
      resolve(root, "src/routes/old/definition.ts"),
      `${imports}import items from "../items/definition.js";\nvoid items;\nexport default ${chain};\n`,
    );
    await assert.rejects(
      generate(root, options, () => false),
      message,
    );
    assert.equal(await readFile(routes, "utf8"), generated);
  }
});

test("effective search gets the generated matching guard; redirect replacements use the write type", async () => {
  const root = await fixture();
  const packageDirectory = resolve(import.meta.dirname, "..");
  const routes = resolve(root, "generated/routes.generated.ts");
  const options = {
    tsconfig: "tsconfig.json",
    scanDirectories: ["src/routes"],
    outDirectory: "generated",
    autoDefineRoutes: false,
  };
  const imports =
    'import { arrayParam, defineRoute, numberParam, withFallback } from "@loozo/angular-router";\n';
  const page = (name) =>
    `import { Component } from "@angular/core";\n\n@Component({ template: "${name}" })\nexport default class Page {}\n`;

  await Promise.all(
    ["list", "detail", "plain", "old"].map((name) =>
      mkdir(resolve(root, `src/routes/${name}`), { recursive: true }),
    ),
  );
  await mkdir(resolve(root, "node_modules/@loozo"), { recursive: true });
  await Promise.all([
    writeFile(
      resolve(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          skipLibCheck: true,
          experimentalDecorators: true,
          lib: ["ES2022", "DOM"],
          types: [],
        },
        include: ["src/**/*.ts"],
      }),
    ),
    writeFile(
      resolve(root, "src/routes/list/definition.ts"),
      `${imports}export default defineRoute("list", { search: { page: withFallback(numberParam, 1), tag: arrayParam(numberParam) } });\n`,
    ),
    writeFile(resolve(root, "src/routes/list/page.ts"), page("list")),
    writeFile(
      resolve(root, "src/routes/detail/definition.ts"),
      `${imports}import list from "../list/definition.js";\nexport default defineRoute("detail", { parent: list });\n`,
    ),
    writeFile(resolve(root, "src/routes/detail/page.ts"), page("detail")),
    writeFile(
      resolve(root, "src/routes/plain/definition.ts"),
      `${imports}export default defineRoute("plain", {});\n`,
    ),
    writeFile(resolve(root, "src/routes/plain/page.ts"), page("plain")),
    symlink(packageDirectory, resolve(root, "node_modules/@loozo/angular-router"), "dir"),
    symlink(
      resolve(packageDirectory, "node_modules/@angular"),
      resolve(root, "node_modules/@angular"),
      "dir",
    ),
  ]);

  // A fallback key is written as `number | undefined`, whether the value or the property is optional.
  // An array key is written as `readonly number[] | undefined`.
  for (const values of [
    "declare const page: number | undefined;\nconst values = { page };",
    "declare const values: { page?: number };",
    "declare const tag: readonly number[] | undefined;\nconst values = { tag };",
    "const values = { tag: [] };",
  ]) {
    await writeFile(
      resolve(root, "src/routes/old/definition.ts"),
      `${imports}import list from "../list/definition.js";\n${values}\nexport default defineRoute("old", {}).redirect({ to: list, search: { mode: "replace", values }, fragment: { mode: "drop" } });\n`,
    );
    await generate(root, options, () => false);
  }

  // Search alone gets the guard, inherited search too; a redirect and a searchless route don't.
  const generated = await readFile(routes, "utf8");

  for (const name of ["list", "detail"]) {
    assert.match(
      generated,
      new RegExp(`\\.\\.\\.callbacks\\(getRouteSet\\(\\), "src/routes/${name}/definition\\.ts"\\)`),
    );
  }
  for (const name of ["plain", "old"]) {
    assert.doesNotMatch(
      generated,
      new RegExp(`callbacks\\(getRouteSet\\(\\), "src/routes/${name}/`),
    );
  }

  await writeFile(
    resolve(root, "src/routes/old/definition.ts"),
    `${imports}import list from "../list/definition.js";\ndeclare const page: string | undefined;\nexport default defineRoute("old", {}).redirect({ to: list, search: { mode: "replace", values: { page } }, fragment: { mode: "drop" } });\n`,
  );
  await assert.rejects(
    generate(root, options, () => false),
    /Unknown\/incompatible redirect replacement key: page/,
  );
  assert.equal(await readFile(routes, "utf8"), generated);

  // One value where the array key takes a list fails the same way.
  await writeFile(
    resolve(root, "src/routes/old/definition.ts"),
    `${imports}import list from "../list/definition.js";\ndeclare const tag: number;\nexport default defineRoute("old", {}).redirect({ to: list, search: { mode: "replace", values: { tag } }, fragment: { mode: "drop" } });\n`,
  );
  await assert.rejects(
    generate(root, options, () => false),
    /Unknown\/incompatible redirect replacement key: tag/,
  );
  assert.equal(await readFile(routes, "utf8"), generated);
});

// Route extensions arrive as published packages: generation reads only their emitted
// declarations. These cases run prototype-6's matrix through production discovery and
// validation.
async function extensionProject() {
  const root = await fixture();
  const index = await extensionSource("index.ts");
  const annotated = await extensionSource("annotated.ts");
  const tuple = `    { name: "context"; type: ContextStep; serverOnly: true; arity: { min: 1; max: 1 } },`;
  // Negatives keep a genuine RouteFactory annotation and change only the manifest; their
  // runtime half is never executed.
  const descriptor = index
    .replace(
      "export const fixtureRuntime: RuntimeExtension<FixtureSpec> =",
      "export const fixtureRuntime =",
    )
    .replace(
      "createRouteFactory<FixtureSpec>(fixtureRuntime)",
      "createRouteFactory<FixtureSpec>(fixtureRuntime as never)",
    );
  const tupleStart = descriptor.indexOf("  readonly steps: readonly [");
  const tupleEnd = descriptor.indexOf("  readonly input: Input;", tupleStart);
  const variants = {
    broad: descriptor.replace(tuple, tuple.replace("serverOnly: true", "serverOnly: boolean")),
    index:
      descriptor.slice(0, tupleStart) +
      `  readonly steps: readonly { name: "context"; type: ContextStep; serverOnly: true; arity: { min: 1; max: 1 } }[];\n` +
      descriptor.slice(tupleEnd),
    widened: descriptor.replace("min: 0; max: null", "min: 0; max: number | null"),
    reserved: descriptor.replace(tuple, tuple.replace('name: "context"', 'name: "then"')),
    "reserved-prototype": descriptor.replace(
      tuple,
      tuple.replace('name: "context"', 'name: "toString"'),
    ),
    duplicate: descriptor.replace('{ name: "use"; type', '{ name: "context"; type'),
    "false-flag": descriptor.replace(tuple, tuple.replace("serverOnly: true", "serverOnly: false")),
    "negative-min": descriptor.replace(tuple, tuple.replace("min: 1;", "min: -1;")),
    "fraction-min": descriptor.replace(tuple, tuple.replace("min: 1;", "min: 0.5;")),
    "zero-max": descriptor.replace("min: 0; max: null", "min: 0; max: 0"),
    "max-below-min": descriptor.replace(tuple, tuple.replace("min: 1;", "min: 2;")),
    "broad-name": descriptor.replace(tuple, tuple.replace('name: "context"', "name: string")),
    lookalike: `export interface RouteFactory<E> { (path: string, facts: object): any; }
interface Spec { steps: readonly [{ name: "context"; type: object; serverOnly: true; arity: { min: 1; max: 1 } }] }
export const defineRoute: RouteFactory<Spec> = () => ({ forged: true });\n`,
    forged:
      index.slice(0, index.indexOf("/** Counts `input()` calls")) +
      `import type { RouteFactory } from "@loozo/angular-router/_core";
export const defineRoute: RouteFactory<FixtureSpec> = (() => ({ forged: true })) as unknown as RouteFactory<FixtureSpec>;\n`,
  };

  await installExtension(root);

  for (const [name, text] of Object.entries(variants)) {
    await emitPackage(root, `@fixture/${name}`, { "index.ts": text });
  }

  // The extension's own compile rejects a public-entry RouteFactory import (TS2305); its
  // declarations still emit.
  const publicImport = annotated
    .replace("createRouteFactory, type RouteFactory }", "createRouteFactory }")
    .concat('import type { RouteFactory } from "@loozo/angular-router";\n');
  const emitted = await emitPackage(
    root,
    "@fixture/public-import",
    { "index.ts": index, "annotated.ts": publicImport },
    { entry: "annotated", noEmitOnError: false },
  );

  assert.deepEqual(
    emitted.map((diagnostic) => diagnostic.code),
    [2305],
  );

  // The same for the inline import-type annotation spelling.
  const publicImportType = annotated
    .replace("createRouteFactory, type RouteFactory }", "createRouteFactory }")
    .replace(
      "export const defineRoute: RouteFactory<FixtureSpec> =",
      'export const defineRoute: import("@loozo/angular-router").RouteFactory<FixtureSpec> =',
    );
  const emittedType = await emitPackage(
    root,
    "@fixture/public-import-type",
    { "index.ts": index, "annotated.ts": publicImportType },
    { entry: "annotated", noEmitOnError: false },
  );

  assert.deepEqual(
    emittedType.map((diagnostic) => diagnostic.code),
    [2694],
  );

  const core = resolve(
    root,
    "node_modules/@loozo/angular-router/dist/types/loozo-angular-router-_core.d.ts",
  );

  await Promise.all([
    writeFile(resolve(root, "package.json"), '{ "type": "module" }\n'),
    writeFile(
      resolve(root, "fake-core-type.d.ts"),
      `export * from "${core}";\nexport { RouteFactory } from "@fixture/lookalike";\n`,
    ),
    writeFile(
      resolve(root, "fake-core.d.ts"),
      `export * from "${core}";\nexport { RouteFactory, defineRoute } from "@fixture/lookalike";\n`,
    ),
    mkdir(resolve(root, "src/routes"), { recursive: true }),
  ]);

  async function write(path, text) {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), text);
  }

  return {
    root,
    write,
    // Writes the routes (directory → route.ts text, each with a page), then discovers and
    // validates them without publishing.
    async analyze(routes, paths) {
      await rm(resolve(root, "src/routes"), { recursive: true, force: true });

      for (const [directory, text] of Object.entries(routes)) {
        await write(`src/routes/${directory}/route.ts`, text);
        await write(
          `src/routes/${directory}/page.ts`,
          `import { Component } from "@angular/core";\n\n@Component({ template: "${directory}" })\nexport default class Page {}\n`,
        );
      }

      await write(
        "tsconfig.json",
        JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            skipLibCheck: true,
            experimentalDecorators: true,
            lib: ["ES2022", "DOM"],
            types: [],
            paths,
          },
          include: ["src/**/*.ts"],
        }),
      );

      const sources = await discover(
        root,
        "tsconfig.json",
        ["src/routes"],
        "generated",
        undefined,
        new Map(),
        false,
      );
      const desired = emit(sources, selections(sources));

      await validateRoutes(sources, desired, createValidationProgram(sources, desired, []));

      return { sources, desired };
    },
  };
}

test("emitted extension packages: manifests, step metadata and authentication through production generation", async () => {
  const project = await extensionProject();
  const { root } = project;
  const expectedManifest = [
    { name: "context", serverOnly: true, arity: { min: 1, max: 1 } },
    { name: "use", serverOnly: true, arity: { min: 0, max: null } },
    { name: "procedures", serverOnly: true, arity: { min: 1, max: 1 } },
  ];
  const chain = `defineRoute("x", {}).context(x).use(a, b).procedures(y).title("t")`;
  const fullSteps = [
    { name: "context", args: 1, contributed: true, serverOnly: true },
    { name: "use", args: 2, contributed: true, serverOnly: true },
    { name: "procedures", args: 1, contributed: true, serverOnly: true },
    { name: "title", args: 1, contributed: false, serverOnly: false },
  ];
  const setup = `const x = () => ({ user: { id: "u", name: "User" } });
const a = ({ context }: { context: { user: { id: string } } }) => { context.user.id; };
const b = ({ context }: { context: { user: { id: string } } }) => { context.user.id; };
const xs = [a, b];
const y = () => ({ account: { me: () => "u" } });`;
  const lookalike = resolve(root, "node_modules/@fixture/lookalike/dist/index.d.ts");
  const cases = [
    { name: "unannotated Launch chain", expr: chain, steps: fullSteps },
    {
      name: "annotated Launch chain",
      pkg: "route-extension-annotated",
      expr: chain,
      steps: fullSteps,
    },
    {
      name: "use zero arguments",
      expr: `defineRoute("x", {}).use()`,
      steps: [{ name: "use", args: 0, contributed: true, serverOnly: true }],
    },
    { name: "zero-step extension chain", expr: `defineRoute("x", {})`, steps: [] },
    {
      name: "inline inferred Launch chain",
      expr: `defineRoute("x", {}).context(() => ({ user: { id: "u" } })).use(({ context }) => { const id: string = context.user.id; }, ({ context }) => { context.user.id; }).procedures(({ query }) => ({ account: { me: query(({ context }) => context.user.id) } })).title(({ rpc }) => rpc.account.me())`,
      steps: fullSteps,
    },
    {
      name: "router same rule",
      pkg: "@loozo/angular-router",
      expr: `defineRoute("x", {}).title("t")`,
      router: true,
      steps: [{ name: "title", args: 1, contributed: false, serverOnly: false }],
    },
    {
      name: "renamed named import",
      importName: "defineRoute as routeFactory",
      expr: chain.replace("defineRoute(", "routeFactory("),
      steps: fullSteps,
    },
    {
      name: "context no arguments (13b)",
      expr: `defineRoute("x", {}).context()`,
      reason: /Route step context takes 1…1 arguments$/,
    },
    {
      name: "context two arguments (13b)",
      expr: `defineRoute("x", {}).context(a, b)`,
      reason: /Route step context takes 1…1 arguments$/,
    },
    {
      name: "use spread (13c)",
      expr: `defineRoute("x", {}).context(x).use(...xs)`,
      reason: /Route step arguments cannot be spread: use$/,
    },
    {
      name: "title two arguments (13a)",
      expr: `defineRoute("x", {}).title(a, b)`,
      reason: /Route step title takes exactly one argument$/,
    },
    {
      name: "title no arguments (13a)",
      expr: `defineRoute("x", {}).title()`,
      reason: /Route step title takes exactly one argument$/,
    },
    {
      name: "router spread (13c)",
      expr: `defineRoute("x", {}).title(...(["t"] as [string]))`,
      reason: /Route step arguments cannot be spread: title$/,
    },
    {
      name: "broad boolean rejected",
      pkg: "broad",
      expr: `defineRoute("x", {})`,
      reason: /serverOnly must be a boolean literal: context$/,
    },
    {
      name: "non-tuple manifest rejected",
      pkg: "index",
      expr: `defineRoute("x", {})`,
      reason: /Extension steps must be a fixed-length tuple$/,
    },
    {
      name: "widened max rejected",
      pkg: "widened",
      expr: `defineRoute("x", {})`,
      reason: /arity\.max must be null or an integer literal >= max\(min, 1\): use$/,
    },
    {
      name: "reserved name rejected",
      pkg: "reserved",
      expr: `defineRoute("x", {})`,
      reason: /Reserved contributed step name: then$/,
    },
    {
      name: "Object.prototype name rejected",
      pkg: "reserved-prototype",
      expr: `defineRoute("x", {})`,
      reason: /Reserved contributed step name: toString$/,
    },
    {
      name: "duplicate name rejected",
      pkg: "duplicate",
      expr: `defineRoute("x", {})`,
      reason: /Duplicate contributed step name: context$/,
    },
    {
      name: "negative min rejected",
      pkg: "negative-min",
      expr: `defineRoute("x", {})`,
      reason: /arity\.min must be a non-negative integer literal: context$/,
    },
    {
      name: "fraction min rejected",
      pkg: "fraction-min",
      expr: `defineRoute("x", {})`,
      reason: /arity\.min must be a non-negative integer literal: context$/,
    },
    {
      name: "zero max rejected",
      pkg: "zero-max",
      expr: `defineRoute("x", {})`,
      reason: /arity\.max must be null or an integer literal >= max\(min, 1\): use$/,
    },
    {
      name: "max below min rejected",
      pkg: "max-below-min",
      expr: `defineRoute("x", {})`,
      reason: /arity\.max must be null or an integer literal >= max\(min, 1\): context$/,
    },
    {
      name: "broad name rejected",
      pkg: "broad-name",
      expr: `defineRoute("x", {})`,
      reason: /Manifest step name must be a string literal$/,
    },
    {
      name: "false literal preserved",
      pkg: "false-flag",
      expr: chain,
      falseFlag: true,
      steps: fullSteps.map((step, index) => (index === 0 ? { ...step, serverOnly: false } : step)),
    },
    {
      name: "local wrapper",
      extra: `const wrapper = (...args: Parameters<typeof defineRoute>) => defineRoute(...args);`,
      expr: `wrapper("x", {})`,
      reason:
        /Factory must be a genuine named value import of defineRoute, not a local wrapper\/alias$/,
    },
    {
      name: "local alias",
      extra: `const alias = defineRoute;`,
      expr: `alias("x", {})`,
      reason:
        /Factory must be a genuine named value import of defineRoute, not a local wrapper\/alias$/,
    },
    {
      name: "local asserted fake",
      extra: `const fake = (() => ({})) as unknown as typeof defineRoute;`,
      expr: `fake("x", {})`,
      reason:
        /Factory must be a genuine named value import of defineRoute, not a local wrapper\/alias$/,
    },
    {
      name: "namespace import",
      namespace: true,
      expr: `routes.defineRoute("x", {})`,
      reason:
        /Factory must be a genuine named value import of defineRoute, not a local wrapper\/alias$/,
    },
    {
      name: "relative wrapper module",
      pkg: "../../wrapper.js",
      expr: `defineRoute("x", {})`,
      reason: /Factory import must name a concrete package public entry$/,
    },
    {
      name: "lookalike package",
      pkg: "lookalike",
      expr: `defineRoute("x", {})`,
      reason:
        /Factory annotation must reference RouteFactory from the anchored physical router \/_core types entry$/,
    },
    {
      name: "router paths spoof",
      pkg: "@loozo/angular-router",
      expr: `defineRoute("x", {})`,
      paths: { "@loozo/angular-router": [lookalike] },
      reason: /defineRoute import does not resolve to this package's concrete public entry$/,
    },
    {
      name: "extension with router paths spoof",
      expr: chain,
      paths: { "@loozo/angular-router": [lookalike] },
      reason: /Application router specifier does not resolve to the anchored router public entry$/,
    },
    {
      name: "extension paths spoof",
      expr: chain,
      paths: {
        "@fixture/route-extension": [resolve(root, "node_modules/@fixture/forged/dist/index.d.ts")],
      },
      reason: /Factory import does not resolve to the canonical package public entry$/,
    },
    {
      name: "router internal reexport spoof",
      expr: chain,
      paths: { "@loozo/angular-router/_core": [resolve(root, "fake-core.d.ts")] },
      reason: /Router public export was redirected away from its anchored declaration$/,
    },
    {
      name: "core paths spoof",
      expr: chain,
      paths: { "@loozo/angular-router/_core": [resolve(root, "fake-core-type.d.ts")] },
      reason:
        /Application router \/_core specifier does not resolve to the anchored physical \/_core types entry$/,
    },
    {
      name: "public RouteFactory import",
      pkg: "public-import",
      expr: `defineRoute("x", {})`,
      reason:
        /RouteFactory is not exported by @loozo\/angular-router; import it from @loozo\/angular-router\/_core$/,
    },
    {
      name: "public RouteFactory import type",
      pkg: "public-import-type",
      expr: `defineRoute("x", {})`,
      reason:
        /RouteFactory is not exported by @loozo\/angular-router; import it from @loozo\/angular-router\/_core$/,
    },
    {
      name: "unknown step",
      expr: `defineRoute("x", {}).invented({})`,
      reason: /Unknown step: invented$/,
    },
    {
      name: "repeat contribution",
      expr: `defineRoute("x", {}).context(x).context(x)`,
      reason: /Repeated step: context$/,
    },
    {
      name: "contribution after router",
      expr: `defineRoute("x", {}).title("t").context(x)`,
      reason: /Contributed step must precede router steps: context$/,
    },
    {
      name: "manifest order",
      expr: `defineRoute("x", {}).use().context(x)`,
      reason: /Contributed steps must follow manifest order: context$/,
    },
    // Trust control: a package asserting the genuine type over a forged runtime is
    // admitted; installed dependencies are trusted provenance.
    {
      name: "genuine type package assertion trust control",
      pkg: "forged",
      expr: chain,
      steps: fullSteps,
    },
  ];

  await project.write("wrapper.ts", `export { defineRoute } from "@fixture/route-extension";\n`);
  assert.equal(cases.length, 43);

  for (const testCase of cases) {
    let pkg = testCase.pkg ?? "route-extension";

    if (!pkg.startsWith("@loozo") && !pkg.startsWith(".")) {
      pkg = `@fixture/${pkg}`;
    }

    let importLine = `import { ${testCase.importName ?? "defineRoute"} } from "${pkg}";`;

    if (testCase.namespace) {
      importLine = `import * as routes from "${pkg}";`;
    }

    const text = `${importLine}\n${setup}\n${testCase.extra ?? ""}\nexport default ${testCase.expr};\n`;
    let result;

    try {
      result = await project.analyze({ x: text }, testCase.paths);
    } catch (error) {
      assert.ok(testCase.reason, `${testCase.name}: unexpected rejection: ${error.message}`);
      assert.match(error.message, /route\.ts:\d+:\d+: /, testCase.name);
      assert.match(error.message, testCase.reason, testCase.name);

      continue;
    }

    assert.equal(testCase.reason, undefined, `${testCase.name}: unexpectedly admitted`);

    const [declaration] = result.sources.declarations;
    const steps = declaration.steps.map((step) => ({
      name: step.name,
      args: step.args.length,
      contributed: step.contributed,
      serverOnly: step.serverOnly,
    }));

    assert.deepEqual(steps, testCase.steps, testCase.name);

    if (testCase.router) {
      assert.equal(declaration.extension, undefined, testCase.name);

      continue;
    }

    const manifest = structuredClone(expectedManifest);

    if (testCase.falseFlag) {
      manifest[0].serverOnly = false;
    }

    assert.deepEqual(declaration.extension.steps, manifest, testCase.name);
    // Only router steps feed the flattened config.
    assert.equal(declaration.config.has("context"), false, testCase.name);
  }
});

test("extension routes: ancestry, facades, emitted projection and a linked router alias", async () => {
  const project = await extensionProject();
  const header = 'import { defineRoute } from "@fixture/route-extension";\n';

  // A router-made route between extension routes is neutral.
  const { desired } = await project.analyze({
    parent: `${header}export default defineRoute("parent", {}).context(() => ({ user: "u" }));\n`,
    "parent/middle": `import { defineRoute } from "@loozo/angular-router";\nimport parent from "../route.js";\nexport default defineRoute("middle", { parent }).title("middle");\n`,
    "parent/middle/child": `${header}import parent from "../route.js";\nexport default defineRoute("child", { parent }).use().resolve({ me: ({ rpc }) => rpc }).title("child");\n`,
  });
  const shared = desired.get(resolve(project.root, "generated/destinations.generated.ts"));

  assert.match(
    shared,
    /"src\/routes\/parent\/route\.ts": RouteSchema<typeof definition_parent_route>;/,
  );
  assert.match(shared, /import \{ injectGeneratedActiveRoute, type RouteSchema,/);

  // Two extensions in one ancestry are rejected.
  await assert.rejects(
    project.analyze({
      parent: `${header}export default defineRoute("parent", {});\n`,
      "parent/child": `import { defineRoute } from "@fixture/route-extension-annotated";\nimport parent from "../route.js";\nexport default defineRoute("child", { parent });\n`,
    }),
    /child\/route\.ts:\d+:\d+: Route ancestry mixes route extensions: @fixture\/route-extension, @fixture\/route-extension-annotated$/,
  );

  // A dependency link to the router's own package is the router, not an extension.
  await symlink(
    resolve(project.root, "node_modules/@loozo/angular-router"),
    resolve(project.root, "node_modules/router-alias"),
    "dir",
  );

  const aliased = await project.analyze({
    x: `import { defineRoute } from "router-alias";\nexport default defineRoute("x", {}).title("aliased");\n`,
  });

  assert.equal(aliased.sources.declarations[0].extension, undefined);
  assert.deepEqual(
    aliased.sources.declarations[0].steps.map((step) => step.name),
    ["title"],
  );
});

test("route chains: shape, URL facts and router step rules", async () => {
  const project = await extensionProject();
  const header = 'import { defineRoute, numberParam } from "@loozo/angular-router";\n';
  const target = `${header}export default defineRoute("target", {});\n`;
  const cases = [
    [
      `export default {};`,
      /Default export must be a defineRoute\(\.\.\.\) chain or Component class$/,
    ],
    [
      `export default defineRoute("x", {})["title"]("t");`,
      /Route chain must be plain calls: defineRoute\(path, facts\)\.step\(…\)…$/,
    ],
    [`export default defineRoute("x", {})?.title("t");`, /Route chain must be plain calls/],
    [`export default (defineRoute("x", {}) as any).title("t");`, /Route chain must be plain calls/],
    [`export default defineRoute("x", {}).title("t") as any;`, /Route chain must be plain calls/],
    [
      `const path = "x";\nexport default defineRoute(path, {});`,
      /defineRoute requires a literal path and inline URL facts$/,
    ],
    [
      `const facts = {};\nexport default defineRoute("x", facts);`,
      /URL facts must be an inline object$/,
    ],
    [
      `export default defineRoute("x", { title: "t" });`,
      /Behavior key in URL facts: title; chain \.title\(…\) instead$/,
    ],
    [
      `export default defineRoute("x", { component: null });`,
      /Unknown or generation-owned URL facts key: component$/,
    ],
    [`export default defineRoute("x", {}).context(() => ({}));`, /Unknown step: context$/],
    [`export default defineRoute("x", {}).title("a").title("b");`, /Repeated step: title$/],
    [
      `import target from "../target/route.js";\nexport default defineRoute("x", {}).canActivate([]).redirect({ to: target, search: { mode: "drop" }, fragment: { mode: "drop" } });`,
      /Redirect cannot follow canActivate$/,
    ],
    [
      `import target from "../target/route.js";\nexport default defineRoute("x", {}).canDeactivate([]).redirect({ to: target, search: { mode: "drop" }, fragment: { mode: "drop" } });`,
      /Redirect cannot follow canDeactivate$/,
    ],
    [
      `import target from "../target/route.js";\nexport default defineRoute("x", {}).redirect({ to: target, search: { mode: "drop" }, fragment: { mode: "drop" } }).title("t");`,
      /No step may follow redirect: title$/,
    ],
    [
      `export default defineRoute("x", {}).onInvalidParams(() => false);`,
      /onInvalidParams requires local path placeholders$/,
    ],
    [
      `export default defineRoute("x", {}).redirect(redirect);\nconst redirect = {} as never;`,
      /Redirect must be an inline object$/,
    ],
  ];

  for (const [body, reason] of cases) {
    await assert.rejects(project.analyze({ target, x: `${header}${body}\n` }), (error) => {
      assert.match(error.message, /route\.ts:\d+:\d+: /, body);
      assert.match(error.message, reason, body);

      return true;
    });
  }

  // Step arguments stay opaque: identifiers are fine.
  const accepted = await project.analyze({
    target,
    x: `${header}const decide = () => false as const;\nconst TITLE = "t";\nexport default defineRoute("x/$id", { params: { id: numberParam } }).onInvalidParams(decide).title(TITLE).providers([]);\n`,
  });

  assert.deepEqual(
    [
      ...accepted.sources.declarations
        .find((declaration) => declaration.path === "x/$id")
        .config.keys(),
    ],
    ["params", "onInvalidParams", "title", "providers"],
  );
});
