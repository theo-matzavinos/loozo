import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, writeFile, readFile, rename, rm, realpath, stat, symlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { AnchorState, CompilerState } from "../node/src/generation/index.js";
import { generate } from "../node/src/generation/generate.js";

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
  await writeFile(definition, seeded.replace("{}", '{ title: "Manual" }'));
  await pass();
  assert.match(
    await readFile(routes, "utf8"),
    /\.\.\.callbacks\(getRouteSet\(\), "src\/routes\/docs\/route\.ts"\)/,
  );
  assert.doesNotMatch(await readFile(routes, "utf8"), /import definition/);

  // A native option is read from the definition itself, which is then imported.
  await writeFile(definition, seeded.replace("{}", "{ providers: [] }"));
  await pass();
  assert.match(await readFile(routes, "utf8"), /nativeOptions\(definition1\)/);
  assert.match(await readFile(routes, "utf8"), /import definition1 from/);
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
    generate: () => generate(root, options, () => false),
  };
}

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
  const solo = `// Keep this header.\n${header.trimEnd()} // keep with this import\n\nexport const marker = 1;\nexport default defineRoute("solo", { data: { marker } });\n`;
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
      .replace('"solo", { data: { marker } }', '"extra/solo", { data: { marker } , parent }'),
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

  assert.match(restored, /defineRoute\("solo", \{ data: \{ marker \} *\}\)/);
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

  for (const [path, config, message] of [
    ["old", "{ onInvalidParams: () => false }", /onInvalidParams requires local path placeholders/],
    [
      "old/$id",
      '{ params: { id: numberParam }, onInvalidParams: () => false, redirect: { to: items, search: { mode: "drop" }, fragment: { mode: "drop" } } }',
      /Redirect cannot have .*onInvalidParams/,
    ],
  ]) {
    await writeFile(
      resolve(root, "src/routes/old/definition.ts"),
      `${imports}import items from "../items/definition.js";\nvoid items;\nexport default defineRoute(${JSON.stringify(path)}, ${config});\n`,
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
    'import { defineRoute, numberParam, withFallback } from "@loozo/angular-router";\n';
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
      `${imports}export default defineRoute("list", { search: { page: withFallback(numberParam, 1) } });\n`,
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
  for (const values of [
    "declare const page: number | undefined;\nconst values = { page };",
    "declare const values: { page?: number };",
  ]) {
    await writeFile(
      resolve(root, "src/routes/old/definition.ts"),
      `${imports}import list from "../list/definition.js";\n${values}\nexport default defineRoute("old", { redirect: { to: list, search: { mode: "replace", values }, fragment: { mode: "drop" } } });\n`,
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
    `${imports}import list from "../list/definition.js";\ndeclare const page: string | undefined;\nexport default defineRoute("old", { redirect: { to: list, search: { mode: "replace", values: { page } }, fragment: { mode: "drop" } } });\n`,
  );
  await assert.rejects(
    generate(root, options, () => false),
    /Unknown\/incompatible redirect replacement key: page/,
  );
  assert.equal(await readFile(routes, "utf8"), generated);
});
