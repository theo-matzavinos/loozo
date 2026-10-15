import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, writeFile, readFile, rm, realpath, stat, symlink } from "node:fs/promises";
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
    autoDefineRoutes: {},
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
  await writeFile(definition, seeded.replace("{ parent }", '{ parent, title: "Manual" }'));
  await pass();
  assert.match(
    await readFile(routes, "utf8"),
    /\.\.\.callbacks\(getRouteSet\(\), "src\/routes\/docs\/route\.ts"\)/,
  );
  assert.doesNotMatch(await readFile(routes, "utf8"), /import definition/);

  // A native option is read from the definition itself, which is then imported.
  await writeFile(definition, seeded.replace("{ parent }", "{ parent, providers: [] }"));
  await pass();
  assert.match(await readFile(routes, "utf8"), /nativeOptions\(definition1\)/);
  assert.match(await readFile(routes, "utf8"), /import definition1 from/);
  assert.doesNotMatch(await readFile(routes, "utf8"), /callbacks/);

  // Session passes leave exactly what stateless generation would publish.
  await generate(root, { ...options, check: true }, () => false);
});

test("local path params get the generated matching guard; misplaced onInvalidParams fails preflight", async () => {
  const root = await fixture();
  const packageDirectory = resolve(import.meta.dirname, "..");
  const routes = resolve(root, "generated/routes.generated.ts");
  const options = {
    tsconfig: "tsconfig.json",
    scanDirectories: ["src/routes"],
    outDirectory: "generated",
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
