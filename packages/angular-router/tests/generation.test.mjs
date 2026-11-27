import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdir,
  writeFile,
  readFile,
  readdir,
  rename,
  rm,
  realpath,
  stat,
  symlink,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ts from "typescript";
import {
  AnchorState,
  CompilerState,
  createValidationProgram,
  emitLaunchRoutes,
  validateRoutes,
} from "../node/src/generation/index.js";
import { generate } from "../node/src/generation/generate.js";
import { discover } from "../node/src/generation/sources.js";
import { selections } from "../node/src/generation/validate.js";
import { emit } from "../node/src/generation/emit.js";
import { emitPackage, extensionSource, installExtension } from "./extension/emit.mjs";

const run = promisify(execFile);
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
  // docs gains its first child, so its record loads the child's record from its children table.
  assert.match(await readFile(routes, "utf8"), /path: "docs"[^\n]*\n[^]*loadChildren: /);
  assert.match(
    await readFile(resolve(root, "src/routes/docs/children.generated.ts"), "utf8"),
    /path: "guide"/,
  );
  assert.match(await readFile(resolve(root, "src/routes/docs/guide/route.ts"), "utf8"), /guide/);
  await readFile(resolve(root, "src/routes/docs/guide/route.generated.ts"), "utf8");
  await readFile(resolve(root, "src/routes/docs/guide/destination.generated.ts"), "utf8");

  // An unchanged warm pass writes nothing.
  const { mtimeNs } = await stat(routes, { bigint: true });

  await pass();
  assert.equal((await stat(routes, { bigint: true })).mtimeNs, mtimeNs);

  const seeded = await readFile(definition, "utf8");

  await writeFile(definition, `${seeded}const broken: number = "text";\n`);
  await assert.rejects(pass(), /TS2322/);

  // The repair also adds a title, which the next pass must adapt from the route copy, which
  // routes.generated.ts then imports.
  await writeFile(definition, seeded.replace("{})", '{}).title("Manual")'));
  await pass();
  assert.match(await readFile(routes, "utf8"), /\.\.\.callbacks\(route_docs_route\)/);
  assert.match(
    await readFile(routes, "utf8"),
    /import \{ route as route_docs_route \} from "\.\.\/src\/routes\/docs\/route\.generated\.js";/,
  );

  // A native option is read from the route copy too.
  await writeFile(definition, seeded.replace("{})", "{}).providers([])"));
  await pass();
  assert.match(await readFile(routes, "utf8"), /nativeOptions\(route_docs_route\)/);
  assert.match(await readFile(routes, "utf8"), /import \{ route as route_docs_route \} from/);
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

// A layout whose guard and resolver come from helper modules, two static leaves, and a $id child
// whose own child reads the inherited param in its title: the routes serve's reuse matrix edits.
async function reuseProject() {
  const project = await filesystemProject();
  const { header } = project;

  await Promise.all([
    project.write(
      "src/routes/team/guard-helper.ts",
      "export function allowed(): boolean {\n  return true;\n}\n",
    ),
    project.write(
      "src/routes/team/resolver-helper.ts",
      'export function value(): string {\n  return "resolved";\n}\n',
    ),
    project.write(
      "src/routes/team/route.ts",
      `${header}import { allowed } from "./guard-helper.js";\nimport { value } from "./resolver-helper.js";\n\nexport default defineRoute("team", {})\n  .canMatch([() => allowed()])\n  .resolve({ value: () => value() })\n  .title(() => "team");\n`,
    ),
    project.write("src/routes/team/static/l0/route.ts", reuseLeaf("l0")),
    project.write("src/routes/team/static/l1/route.ts", reuseLeaf("l1")),
    project.write(
      "src/routes/team/$id/route.ts",
      'import { defineRoute, numberParam } from "@loozo/angular-router";\nimport parent from "../route.js";\n\nexport default defineRoute("$id", { parent, params: { id: numberParam } });\n',
    ),
    project.write(
      "src/routes/team/$id/detail/route.ts",
      `${header}import parent from "../route.js";\n\nexport default defineRoute("detail", { parent }).title(({ params }) => {\n  const id: number = params.id;\n\n  return String(id);\n});\n`,
    ),
    project.page("team"),
    project.page("team/static/l0"),
    project.page("team/static/l1"),
    project.page("team/$id"),
    project.page("team/$id/detail"),
  ]);

  return project;
}

function reuseLeaf(name, steps = "") {
  return `import { defineRoute } from "@loozo/angular-router";\nimport parent from "../../route.js";\n\nexport default defineRoute("static/${name}", { parent })${steps};\n`;
}

const flagGuard = (from) =>
  `import type { Flag } from "${from}";\n\nexport function allowed(): Flag {\n  return true as Flag;\n}\n`;
const globalGuard = "export function allowed() {\n  return globalThis.reuseFlag;\n}\n";
const flag = (type) => `export type Flag = ${type};\n`;
const packageJson = (types, version = "1.0.0") =>
  JSON.stringify({ name: "reuse-extra", version, types });

async function editTsconfig(project, file, edit) {
  const config = JSON.parse(await project.read(file));

  edit(config);
  await project.write(file, JSON.stringify(config));
}

// Each change runs after two warm passes on one session; `setup` runs before them and `between`
// between them, and any may leave the project invalid. `fails` is the error the changed project
// gives, if any; guard helpers typed with a string Flag fail the route's canMatch.
const reuseChanges = {
  "a leaf's own edit": {
    change: (p) =>
      p.write("src/routes/team/static/l0/route.ts", reuseLeaf("l0", '.title(() => "edited")')),
  },
  "new route files": {
    change: async (p) => {
      await p.write("src/routes/team/static/l2/route.ts", reuseLeaf("l2"));
      await p.page("team/static/l2");
    },
  },
  "a deleted route directory": {
    change: (p) => rm(resolve(p.root, "src/routes/team/static/l1"), { recursive: true }),
  },
  "a deleted imported helper": {
    fails: /TS2307/,
    change: (p) => rm(resolve(p.root, "src/routes/team/resolver-helper.ts")),
  },
  "a previously missing package appears behind a global augmentation": {
    fails: /TS2322/,
    setup: async (p) => {
      await p.write(
        "src/augment.ts",
        '// @ts-ignore\nimport type { Flag } from "reuse-extra";\n\ndeclare global {\n  var reuseFlag: Flag;\n}\n\nexport {};\n',
      );
      await p.write("src/routes/team/guard-helper.ts", globalGuard);
    },
    change: async (p) => {
      await p.write("node_modules/reuse-extra/package.json", packageJson("./a.d.ts"));
      await p.write("node_modules/reuse-extra/a.d.ts", flag("string"));
    },
  },
  "a package's types retargeted": {
    fails: /TS2322/,
    setup: async (p) => {
      await p.write("src/routes/team/guard-helper.ts", flagGuard("reuse-extra"));
      await p.write("node_modules/reuse-extra/package.json", packageJson("./a.d.ts"));
      await p.write("node_modules/reuse-extra/a.d.ts", flag("boolean"));
      await p.write("node_modules/reuse-extra/b.d.ts", flag("string"));
    },
    change: (p) => p.write("node_modules/reuse-extra/package.json", packageJson("./b.d.ts")),
  },
  "a package symlink retargeted to a new version": {
    fails: /TS2322/,
    setup: async (p) => {
      await p.write("src/routes/team/guard-helper.ts", flagGuard("reuse-extra"));

      for (const [version, type] of [
        ["1.0.0", "boolean"],
        ["2.0.0", "string"],
      ]) {
        await p.write(
          `store/reuse-extra@${version}/package.json`,
          packageJson("./index.d.ts", version),
        );
        await p.write(`store/reuse-extra@${version}/index.d.ts`, flag(type));
      }

      await symlink(
        resolve(p.root, "store/reuse-extra@1.0.0"),
        resolve(p.root, "node_modules/reuse-extra"),
        "dir",
      );
    },
    change: async (p) => {
      await rm(resolve(p.root, "node_modules/reuse-extra"));
      await symlink(
        resolve(p.root, "store/reuse-extra@2.0.0"),
        resolve(p.root, "node_modules/reuse-extra"),
        "dir",
      );
    },
  },
  "a package symlink retargeted behind an identical package.json": {
    fails: /TS2322/,
    setup: async (p) => {
      await p.write("src/routes/team/guard-helper.ts", flagGuard("reuse-extra"));

      for (const [name, type] of [
        ["a", "boolean"],
        ["b", "string"],
      ]) {
        await p.write(`store/${name}/package.json`, packageJson("./index.d.ts"));
        await p.write(`store/${name}/index.d.ts`, flag(type));
      }

      await symlink(resolve(p.root, "store/a"), resolve(p.root, "node_modules/reuse-extra"), "dir");
    },
    change: async (p) => {
      await rm(resolve(p.root, "node_modules/reuse-extra"));
      await symlink(resolve(p.root, "store/b"), resolve(p.root, "node_modules/reuse-extra"), "dir");
    },
  },
  "package exports swapped between two files an importer already references": {
    fails: /TS2322/,
    setup: async (p) => {
      await p.write(
        "src/routes/team/guard-helper.ts",
        'import type { Flag } from "reuse-extra/first";\nimport type { Flag as Other } from "reuse-extra/second";\n\nexport type Unused = Other;\n\nexport function allowed(): Flag {\n  return true as Flag;\n}\n',
      );
      await p.write(
        "node_modules/reuse-extra/package.json",
        JSON.stringify({
          name: "reuse-extra",
          version: "1.0.0",
          exports: { "./first": "./a.d.ts", "./second": "./b.d.ts" },
        }),
      );
      await p.write("node_modules/reuse-extra/a.d.ts", flag("boolean"));
      await p.write("node_modules/reuse-extra/b.d.ts", flag("string"));
    },
    change: (p) =>
      p.write(
        "node_modules/reuse-extra/package.json",
        JSON.stringify({
          name: "reuse-extra",
          version: "1.0.0",
          exports: { "./first": "./b.d.ts", "./second": "./a.d.ts" },
        }),
      ),
  },
  "package exports swapped after the importer's declaration was emitted": {
    fails: /TS2322/,
    setup: async (p) => {
      await p.write(
        "src/routes/team/guard-helper.ts",
        'import type { Flag } from "reuse-extra/first";\nimport type { Flag as Other } from "reuse-extra/second";\n\nexport type Unused = Other;\n\nexport function allowed(): Flag {\n  return true as Flag;\n}\n',
      );
      await p.write(
        "node_modules/reuse-extra/package.json",
        JSON.stringify({
          name: "reuse-extra",
          version: "1.0.0",
          exports: { "./first": "./a.d.ts", "./second": "./b.d.ts" },
        }),
      );
      await p.write("node_modules/reuse-extra/a.d.ts", flag("boolean"));
      await p.write("node_modules/reuse-extra/b.d.ts", flag("string"));
    },
    // A declaration-preserving edit, so the next pass records the helper's emitted signature.
    between: async (p) =>
      p.write(
        "src/routes/team/guard-helper.ts",
        `${await p.read("src/routes/team/guard-helper.ts")}\nconst ignored = 1;\n\nvoid ignored;\n`,
      ),
    change: (p) =>
      p.write(
        "node_modules/reuse-extra/package.json",
        JSON.stringify({
          name: "reuse-extra",
          version: "1.0.0",
          exports: { "./first": "./b.d.ts", "./second": "./a.d.ts" },
        }),
      ),
  },
  "a transitive type change with assumeChangesOnlyAffectDirectDependencies": {
    fails: /TS2322/,
    setup: async (p) => {
      await editTsconfig(p, "tsconfig.json", (config) => {
        config.compilerOptions.assumeChangesOnlyAffectDirectDependencies = true;
      });
      await p.write("src/routes/team/flag.ts", flag("boolean"));
      await p.write("src/routes/team/guard-helper.ts", flagGuard("./flag.js"));
    },
    between: async (p) =>
      p.write(
        "src/routes/team/guard-helper.ts",
        `${flagGuard("./flag.js")}\nconst ignored = 1;\n\nvoid ignored;\n`,
      ),
    change: (p) => p.write("src/routes/team/flag.ts", flag("string")),
  },
  "a re-exporting package switches module format": {
    fails: /TS2322/,
    setup: async (p) => {
      await p.write(
        "node_modules/reuse-flag/package.json",
        JSON.stringify({
          name: "reuse-flag",
          version: "1.0.0",
          exports: { ".": { import: "./esm.d.ts", require: "./cjs.d.ts" } },
        }),
      );
      await p.write("node_modules/reuse-flag/esm.d.ts", flag("boolean"));
      await p.write("node_modules/reuse-flag/cjs.d.ts", flag("string"));
      await p.write(
        "node_modules/reuse-reexport/package.json",
        JSON.stringify({
          name: "reuse-reexport",
          version: "1.0.0",
          type: "module",
          types: "./index.d.ts",
        }),
      );
      await p.write(
        "node_modules/reuse-reexport/index.d.ts",
        'export type { Flag } from "reuse-flag";\n',
      );
      // Both targets stay in the program whichever format the re-exporting package has.
      await p.write(
        "src/routes/team/guard-helper.ts",
        'import type { Flag } from "reuse-reexport";\nimport type { Flag as Esm } from "reuse-flag" with { "resolution-mode": "import" };\nimport type { Flag as Cjs } from "reuse-flag" with { "resolution-mode": "require" };\n\nexport type Both = [Esm, Cjs];\n\nexport function allowed(): Flag {\n  return true as Flag;\n}\n',
      );
    },
    change: async (p) =>
      p.write(
        "node_modules/reuse-reexport/package.json",
        JSON.stringify({
          name: "reuse-reexport",
          version: "1.0.0",
          type: "commonjs",
          types: "./index.d.ts",
        }),
      ),
  },
  "a module augmentation's type without an import edge": {
    fails: /TS2322/,
    setup: async (p) => {
      await p.write(
        "src/routes/team/flag.ts",
        "export interface Registry {}\n\nexport type Flag = Registry extends { flag: infer F } ? F : boolean;\n",
      );
      await p.write(
        "src/augment.ts",
        'export {};\n\ndeclare module "./routes/team/flag.js" {\n  interface Registry {\n    flag: boolean;\n  }\n}\n',
      );
      await p.write("src/routes/team/guard-helper.ts", flagGuard("./flag.js"));
    },
    between: async (p) =>
      p.write(
        "src/routes/team/guard-helper.ts",
        `${flagGuard("./flag.js")}\nconst ignored = 1;\n\nvoid ignored;\n`,
      ),
    change: (p) =>
      p.write(
        "src/augment.ts",
        'export {};\n\ndeclare module "./routes/team/flag.js" {\n  interface Registry {\n    flag: string;\n  }\n}\n',
      ),
  },
  "a nearer node_modules shadows a resolved package": {
    fails: /TS2322/,
    setup: async (p) => {
      await p.write("src/routes/team/guard-helper.ts", flagGuard("reuse-extra"));
      await p.write("node_modules/reuse-extra/package.json", packageJson("./a.d.ts"));
      await p.write("node_modules/reuse-extra/a.d.ts", flag("boolean"));
    },
    change: async (p) => {
      await p.write("src/node_modules/reuse-extra/package.json", packageJson("./a.d.ts"));
      await p.write("src/node_modules/reuse-extra/a.d.ts", flag("string"));
    },
  },
  "a new file shadows a relative resolution": {
    fails: /TS2322/,
    setup: async (p) => {
      await p.write("src/routes/team/guard-helper.ts", flagGuard("./flag"));
      await p.write("src/routes/team/flag/index.ts", flag("boolean"));
    },
    change: (p) => p.write("src/routes/team/flag.ts", flag("string")),
  },
  "an excluded file shadows a paths fallback": {
    fails: /TS2322/,
    setup: async (p) => {
      await editTsconfig(p, "tsconfig.json", (config) => {
        config.compilerOptions.paths = { "reuse-flag": ["./lib/flag", "./lib/fallback/flag"] };
      });
      await p.write("src/routes/team/guard-helper.ts", flagGuard("reuse-flag"));
      await p.write("lib/fallback/flag.ts", flag("boolean"));
    },
    change: (p) => p.write("lib/flag.ts", flag("string")),
  },
  "a dependency's declaration edit": {
    fails: /TS2322/,
    setup: async (p) => {
      await p.write("src/routes/team/guard-helper.ts", flagGuard("reuse-extra"));
      await p.write("node_modules/reuse-extra/package.json", packageJson("./a.d.ts"));
      await p.write("node_modules/reuse-extra/a.d.ts", flag("boolean"));
    },
    change: (p) => p.write("node_modules/reuse-extra/a.d.ts", flag("string")),
  },
  "tsconfig paths added": {
    fails: /TS2322/,
    setup: async (p) => {
      await p.write(
        "src/augment.ts",
        '// @ts-ignore\nimport type { Flag } from "reuse-alias";\n\ndeclare global {\n  var reuseFlag: Flag;\n}\n\nexport {};\n',
      );
      await p.write("src/routes/team/guard-helper.ts", globalGuard);
    },
    change: async (p) => {
      await editTsconfig(p, "tsconfig.json", (config) => {
        config.compilerOptions.paths = { "reuse-alias": ["./lib/alias.ts"] };
      });
      await p.write("lib/alias.ts", flag("string"));
    },
  },
  "an extended tsconfig edit": {
    fails: /TS6133/,
    setup: async (p) => {
      const config = JSON.parse(await p.read("tsconfig.json"));

      await p.write(
        "tsconfig.base.json",
        JSON.stringify({ compilerOptions: config.compilerOptions }),
      );
      await p.write(
        "tsconfig.json",
        JSON.stringify({ extends: "./tsconfig.base.json", include: config.include }),
      );
      await p.write(
        "src/routes/team/static/l0/route.ts",
        reuseLeaf("l0").replace("\nexport", "\nconst unused = 1;\n\nexport"),
      );
    },
    change: (p) =>
      editTsconfig(p, "tsconfig.base.json", (config) => {
        config.compilerOptions.noUnusedLocals = true;
      }),
  },
  "a helper's return type reaching an unchanged route": {
    fails: /TS2322/,
    change: (p) =>
      p.write(
        "src/routes/team/guard-helper.ts",
        'export function allowed(): string {\n  return "no";\n}\n',
      ),
  },
  "a helper fixed after a failed pass": {
    setup: (p) =>
      p.write(
        "src/routes/team/guard-helper.ts",
        'export function allowed(): string {\n  return "no";\n}\n',
      ),
    change: (p) =>
      p.write(
        "src/routes/team/guard-helper.ts",
        "export function allowed(): boolean {\n  return true;\n}\n",
      ),
  },
  "a global augmentation's type without an import edge": {
    fails: /TS2322/,
    setup: async (p) => {
      await p.write(
        "src/augment.ts",
        "declare global {\n  var reuseFlag: boolean;\n}\n\nexport {};\n",
      );
      await p.write("src/routes/team/guard-helper.ts", globalGuard);
    },
    change: (p) =>
      p.write("src/augment.ts", "declare global {\n  var reuseFlag: string;\n}\n\nexport {};\n"),
  },
  "a parent's params reaching an unchanged child": {
    fails: /detail\/route\.ts.*TS2322/,
    change: (p) =>
      p.write(
        "src/routes/team/$id/route.ts",
        'import { defineRoute, stringParam } from "@loozo/angular-router";\nimport parent from "../route.js";\n\nexport default defineRoute("$id", { parent, params: { id: stringParam } });\n',
      ),
  },
  "a parent's resolver data type": {
    change: (p) =>
      p.write(
        "src/routes/team/resolver-helper.ts",
        "export function value(): number {\n  return 1;\n}\n",
      ),
  },
};

// Every generated file and authored definition, by path.
async function reuseOutputs(root) {
  const files = new Map();

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);

      if (entry.name === "node_modules" || entry.name === "store") {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.name.endsWith(".generated.ts") || entry.name === "route.ts") {
        files.set(relative(root, path), await readFile(path, "utf8"));
      }
    }
  }

  await walk(root);

  return files;
}

async function reuseOutcome(root, run) {
  try {
    await run();

    return { error: undefined, files: await reuseOutputs(root) };
  } catch (error) {
    return { error: error.message, files: await reuseOutputs(root) };
  }
}

// Serve's passes carry semantic diagnostics across a session; after each kind of change, a warm
// pass must publish the same bytes, or fail with the same error, as a cold one.
test("a warm session pass matches a cold pass after each kind of change", async (t) => {
  for (const [name, { setup, between, change, fails }] of Object.entries(reuseChanges)) {
    await t.test(name, async () => {
      const project = await reuseProject();
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

      // The serve builder's contract: any failed pass clears every slot.
      async function pass() {
        try {
          await generate(project.root, options, () => false, state);
        } catch (error) {
          state.discovery.clear();
          state.overlay.clear();
          state.anchor.clear();

          throw error;
        }
      }

      await setup?.(project);
      await reuseOutcome(project.root, pass);
      await between?.(project);
      await reuseOutcome(project.root, pass);
      await change(project);

      const warm = await reuseOutcome(project.root, pass);
      const cold = await reuseOutcome(project.root, () =>
        generate(project.root, options, () => false),
      );

      if (fails) {
        assert.match(cold.error ?? "", fails);
      } else {
        assert.equal(cold.error, undefined);
      }

      assert.deepEqual(warm, cold);
    });
  }
});

test("output checked out with CRLF line endings stays owned and current", async () => {
  const project = await filesystemProject();
  const files = [
    "generated/routes.generated.ts",
    "src/routes/teams/$teamId/route.ts",
    "src/routes/teams/$teamId/route.generated.ts",
    "src/routes/teams/$teamId/destination.generated.ts",
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

test("route type bindings follow paths, so adding or removing a route changes only its own lines", async () => {
  const project = await filesystemProject();
  // The per-route imports and RouteTypes entries; the routes array nests records, and the
  // helper import lists what the remaining records need.
  const typing = async () => {
    const lines = [];

    for (const line of (await project.read("generated/routes.generated.ts")).split("\n")) {
      const perRoute = line.startsWith("import ") && line.includes("/src/routes/");

      if (perRoute || /^"[^"]+": \{ schema: /.test(line)) {
        lines.push(line);
      }
    }

    return lines.join("\n");
  };

  for (const directory of ["teams/$teamId", "old-items", "old_items", "zeta"]) {
    await project.page(directory);
  }

  await project.generate();

  const before = await typing();

  assert.ok(
    before.includes(
      'import { route as route_teams_$teamId_route } from "../src/routes/teams/$teamId/route.generated.js";',
    ),
  );
  assert.ok(
    before.includes(
      'import { destination as destination_teams_$teamId_route } from "../src/routes/teams/$teamId/destination.generated.js";',
    ),
  );
  // Paths that sanitize alike keep distinct bindings.
  assert.ok(before.includes("import type { route as route_old_items_route } from"));
  assert.ok(before.includes("import type { route as route_old_items_route_2 } from"));

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

  const added = await typing();

  onlyAdded(before, added);

  await rm(resolve(project.root, "src/routes/teams"), { recursive: true });
  await project.generate();
  onlyAdded(await typing(), added);
});

test("routes.generated.ts exports RouteTypes and a typed injectActiveRoute without a route table", async () => {
  const project = await filesystemProject();

  await project.page("teams/$teamId");
  await project.page("teams/$teamId/items/$id");
  await project.page("about");
  await project.generate();

  const path = resolve(project.root, "generated/routes.generated.ts");
  const source = await project.read("generated/routes.generated.ts");
  const file = ts.createSourceFile(path, source, { languageVersion: ts.ScriptTarget.ES2022 });
  const imports = [];
  const declarations = new Map();

  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      imports.push(statement.getText(file));
    } else if (ts.isTypeAliasDeclaration(statement) || ts.isFunctionDeclaration(statement)) {
      declarations.set(statement.name.text, statement);
    }
  }

  assert.ok(imports.includes("import type { Signal } from '@angular/core';"));
  assert.ok(
    imports.includes(
      "import { record, callbacks, injectGeneratedActiveRoute, type RouteSchema, type ActiveRoute as GeneratedActiveRoute, type ActiveHandle as GeneratedActiveHandle } from '@loozo/angular-router/_generated';",
    ),
  );
  // Copies a record reads load at runtime; the rest only type RouteTypes.
  assert.ok(
    imports.includes(
      'import { route as route_teams_$teamId_route } from "../src/routes/teams/$teamId/route.generated.js";',
    ),
  );
  assert.ok(
    imports.includes(
      'import type { route as route_about_route } from "../src/routes/about/route.generated.js";',
    ),
  );
  assert.doesNotMatch(source, /import \{ route as route_about_route \}/);

  const exported = (node) =>
    !!node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  const types = declarations.get("RouteTypes");
  const active = declarations.get("ActiveRoute");
  const narrowed = declarations.get("ActiveHandle");
  const inject = declarations.get("injectActiveRoute");

  assert.equal(exported(types), true);
  assert.equal(
    types.type.getText(file),
    `{
"src/routes/about/route.ts": { schema: RouteSchema<typeof route_about_route> };
"src/routes/teams/$teamId/items/$id/route.ts": { schema: RouteSchema<typeof route_teams_$teamId_items_$id_route>; up: typeof destination_teams_$teamId_route };
"src/routes/teams/$teamId/route.ts": { schema: RouteSchema<typeof route_teams_$teamId_route> };
}`,
  );
  assert.equal(exported(active), true);
  assert.equal(active.type.getText(file), "GeneratedActiveRoute<RouteTypes>");
  assert.equal(exported(narrowed), true);
  assert.equal(narrowed.type.getText(file), "GeneratedActiveHandle<RouteTypes, Id>");
  assert.equal(exported(inject), true);
  assert.equal(inject.parameters.length, 0);
  assert.equal(inject.type.getText(file), "Signal<ActiveRoute | undefined>");
  // No table: the reader finds records by the facts each one carries.
  assert.equal(
    inject.body.getText(file),
    `{
  return injectGeneratedActiveRoute<RouteTypes>();
}`,
  );
  // The hydration and search storage providers and the restore hook sit next to the routes.
  assert.deepEqual(
    file.statements
      .filter((statement) => ts.isExportDeclaration(statement))
      .map((statement) => statement.getText(file)),
    [
      "export { provideActiveRouteHydration } from '@loozo/angular-router/_generated';",
      "export { currentSearchRestore, provideSearchStorage } from '@loozo/angular-router/_generated';",
    ],
  );
  // The child's record lives in its parent's children table; RouteTypes above stays global.
  assert.match(
    await project.read("src/routes/teams/$teamId/children.generated.ts"),
    /path: "items\/:id",\n\.\.\.record\(destination_teams_\$teamId_items_\$id_route, destination_teams_\$teamId_route\),/,
  );
  assert.doesNotMatch(source, /path: "items\/:id"/);

  // A strict consumer narrows an ancestor through chain and the deepest route through is().
  await project.write(
    "src/shell.ts",
    `import { injectActiveRoute } from "../generated/routes.generated.js";
import { destination as team } from "./routes/teams/$teamId/destination.generated.js";
import { destination as item } from "./routes/teams/$teamId/items/$id/destination.generated.js";

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
  // The loader's return annotation keeps the array's subtype reduction off page classes.
  assert.match(
    generated,
    /loadComponent: \(\): ReturnType<NonNullable<Routes\[number\]\["loadComponent"\]>> => import\("/,
  );
  // shell keeps its record here and loads its children's records from its children table.
  assert.match(
    generated,
    /path: "shell",\n\.\.\.record\([^\n]+\nloadChildren: [^\n]+import\("\.\.\/src\/routes\/shell\/children\.generated\.js"\)\.then\(\(m\) => m\.routes\) \}/,
  );
  assert.match(
    await read("src/routes/shell/children.generated.ts"),
    /^export const routes: Routes = \[\{ path: "docs\/:slug",$/m,
  );
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
    shared: "const same = libRoute;\n",
    busy: 'const parent = "occupied";\n',
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
  assert.match(await read("src/routes/lib/children.generated.ts"), /path: "section\/topic"/);
  await project.write(
    "src/routes/lib/section/route.ts",
    `${header}import parent from "../route.js";\n\nexport default defineRoute("section", { parent });\n`,
  );

  // A binding used elsewhere keeps its import and the new parent gets its own, but that kept
  // import is now a grandparent's, which only the parent default import may be: nothing is
  // published.
  const shared = "src/routes/lib/section/shared/route.ts";
  const authored = await read(shared);

  await assert.rejects(
    project.generate(),
    /shared[\\/]route\.ts:2:22: Import of a route declaration: \.\.\/\.\.\/route\.js\. Import its destination from \.\.\/\.\.\/destination\.generated\.js instead\.$/,
  );
  assert.equal(await read(shared), authored);
  await rm(resolve(project.root, "src/routes/lib/section/shared"), { recursive: true });
  await project.generate();

  // A binding that named the previous parent and is used nowhere else becomes `parent`.
  assert.equal(
    await read("src/routes/lib/section/topic/route.ts"),
    `${header}import parent from "../route.js";\n\nexport default defineRoute("topic", { parent });\n`,
  );
  // With `parent` taken, the binding keeps its name.
  assert.equal(
    await read("src/routes/lib/section/busy/route.ts"),
    `${header}import libRoute from "../route.js";\n\n${declarations.busy}export default defineRoute("busy", { parent: libRoute });\n`,
  );
  // section is lib's child and a parent itself: its record sits in lib's children table.
  assert.match(
    await read("src/routes/lib/children.generated.ts"),
    /path: "section",\n\.\.\.record\([^\n]+\nloadChildren: [^\n]+import\("\.\/section\/children\.generated\.js"\)/,
  );
  assert.match(
    await read("src/routes/lib/section/children.generated.ts"),
    /^export const routes: Routes = \[\{ path: "busy",$/m,
  );
});

test("filesystem mode: moving a declaration under and out of a page-less prefix rewrites its path, parent and imports", async () => {
  const project = await filesystemProject();
  const { header, read } = project;
  const solo = `// Keep this header.\n${header.trimEnd()} // keep with this import\n\nconst marker = 1;\nexport default defineRoute("solo", {}).data({ marker });\n`;
  const taken = `${header}\nconst parent = "occupied";\nexport default defineRoute("taken", {});\n`;

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
  assert.match(await read("src/routes/shell/children.generated.ts"), /path: "extra\/solo"/);

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
  const aliased = `import { defineRoute, numberParam, stringParam as text } from "@loozo/angular-router";\nimport parent from "../../route.js";\n\nconst label = text;\nexport default defineRoute("codes/$code", { parent, params: { code: numberParam } });\n`;
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
  assert.match(await project.routes(), /path: "shell",\n\.\.\.record\([^\n]+\nloadChildren: /);
  assert.match(
    await read("src/routes/shell/children.generated.ts"),
    /^export const routes: Routes = \[[^\n]*path: ":team\/:id"/m,
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

  // A params-only route gets its matching guard from its route copy.
  await generate(root, options, () => false);

  const generated = await readFile(routes, "utf8");

  assert.match(generated, /\.\.\.callbacks\(route_items_definition\)/);

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
      `${imports}import { destination as items } from "../items/destination.generated.js";\nexport default ${chain};\n`,
    );
    await assert.rejects(
      generate(root, options, () => false),
      message,
    );
    assert.equal(await readFile(routes, "utf8"), generated);
  }
});

test("filesystem mode: misplaced onInvalidParams fails whether or not synchronization edits the declaration", async () => {
  for (const path of ["items", "wrong"]) {
    const project = await filesystemProject();

    await project.page("items");
    await project.write(
      "src/routes/items/route.ts",
      `${project.header}\nexport default defineRoute("${path}", {}).onInvalidParams(() => false);\n`,
    );
    await assert.rejects(project.generate(), /onInvalidParams requires local path placeholders/);
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
      `${imports}import { destination as list } from "../list/destination.generated.js";\n${values}\nexport default defineRoute("old", {}).redirect({ to: list, search: { mode: "replace", values }, fragment: { mode: "drop" } });\n`,
    );
    await generate(root, options, () => false);
  }

  // Search alone gets the guard, inherited search too; a redirect and a searchless route don't.
  // detail's record is in list's children table.
  const generated = await readFile(routes, "utf8");
  const children = await readFile(resolve(root, "src/routes/list/children.generated.ts"), "utf8");

  assert.match(generated, /\.\.\.callbacks\(route_list_definition\)/);
  assert.match(children, /\.\.\.callbacks\(route_detail_definition\)/);
  for (const name of ["plain", "old"]) {
    assert.doesNotMatch(generated, new RegExp(`callbacks\\(route_${name}_definition\\)`));
  }

  await writeFile(
    resolve(root, "src/routes/old/definition.ts"),
    `${imports}import { destination as list } from "../list/destination.generated.js";\ndeclare const page: string | undefined;\nexport default defineRoute("old", {}).redirect({ to: list, search: { mode: "replace", values: { page } }, fragment: { mode: "drop" } });\n`,
  );
  await assert.rejects(
    generate(root, options, () => false),
    /Unknown\/incompatible redirect replacement key: page/,
  );
  assert.equal(await readFile(routes, "utf8"), generated);

  // One value where the array key takes a list fails the same way.
  await writeFile(
    resolve(root, "src/routes/old/definition.ts"),
    `${imports}import { destination as list } from "../list/destination.generated.js";\ndeclare const tag: number;\nexport default defineRoute("old", {}).redirect({ to: list, search: { mode: "replace", values: { tag } }, fragment: { mode: "drop" } });\n`,
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
    "reserved-outlet": descriptor.replace(
      tuple,
      tuple.replace('name: "context"', 'name: "__outlet"'),
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
      `export * from ${JSON.stringify(core)};\nexport { RouteFactory } from "@fixture/lookalike";\n`,
    ),
    writeFile(
      resolve(root, "fake-core.d.ts"),
      `export * from ${JSON.stringify(core)};\nexport { RouteFactory, defineRoute } from "@fixture/lookalike";\n`,
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
    async analyze(routes, paths, compilerOptions = {}) {
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
            ...compilerOptions,
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
    { name: "remote", serverOnly: true, arity: { min: 1, max: 1 } },
  ];
  const chain = `defineRoute("x", {}).context(x).use(a, b).remote(y).title("t")`;
  const fullSteps = [
    { name: "context", args: 1, contributed: true, serverOnly: true },
    { name: "use", args: 2, contributed: true, serverOnly: true },
    { name: "remote", args: 1, contributed: true, serverOnly: true },
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
      expr: `defineRoute("x", {}).context(() => ({ user: { id: "u" } })).use(({ context }) => { const id: string = context.user.id; }, ({ context }) => { context.user.id; }).remote(({ query }) => ({ account: { me: query(() => "u") } })).title(({ remote }) => remote.account.me())`,
      steps: fullSteps,
    },
    // The route copy strips every contributed step, so it is typed from its declaration:
    // a kept callback still reads what the stripped steps added.
    {
      name: "kept step typed from stripped steps",
      expr: `defineRoute("x", {}).context(() => ({ user: { id: "u" } })).remote(({ query }) => ({ account: { me: query(({ context }) => context.user.id) } })).title(({ remote }) => remote.account.me())`,
      steps: [
        { name: "context", args: 1, contributed: true, serverOnly: true },
        { name: "remote", args: 1, contributed: true, serverOnly: true },
        { name: "title", args: 1, contributed: false, serverOnly: false },
      ],
    },
    // A kept callback reading a member no stripped step added still fails in its copy, at
    // the declaration's line.
    {
      name: "kept step reads a member no step added",
      expr: `defineRoute("x", {}).context(() => ({ user: { id: "u" } })).title(({ remote }) => remote.account.me())`,
      reason:
        /route\.ts:8:\d+: TS2339: Property 'account' does not exist on type '[^']*'\. \(in its generated route copy\)$/,
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
      name: "outlet witness name rejected",
      pkg: "reserved-outlet",
      expr: `defineRoute("x", {})`,
      reason: /Reserved contributed step name: __outlet$/,
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
  assert.equal(cases.length, 46);

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

test("extension routes: ancestry, copies, emitted projection and a linked router alias", async () => {
  const project = await extensionProject();
  const header = 'import { defineRoute } from "@fixture/route-extension";\n';

  // A router-made route between extension routes is neutral.
  const { desired } = await project.analyze({
    parent: `${header}export default defineRoute("parent", {}).context(() => ({ user: "u" }));\n`,
    "parent/middle": `import { defineRoute } from "@loozo/angular-router";\nimport parent from "../route.js";\nexport default defineRoute("middle", { parent }).title("middle");\n`,
    "parent/middle/child": `${header}import parent from "../route.js";\nexport default defineRoute("child", { parent }).use().resolve({ me: ({ remote }) => remote }).title("child");\n`,
  });
  const shared = desired.get(resolve(project.root, "generated/routes.generated.ts"));

  assert.match(
    shared,
    /"src\/routes\/parent\/route\.ts": \{ schema: RouteSchema<typeof route_parent_route> \};/,
  );
  assert.match(shared, /injectGeneratedActiveRoute, type RouteSchema,/);

  // Two extensions in one ancestry are rejected.
  await assert.rejects(
    project.analyze({
      parent: `${header}export default defineRoute("parent", {});\n`,
      "parent/child": `import { defineRoute } from "@fixture/route-extension-annotated";\nimport parent from "../route.js";\nexport default defineRoute("child", { parent });\n`,
    }),
    /child[\\/]route\.ts:\d+:\d+: Route ancestry mixes route extensions: @fixture\/route-extension, @fixture\/route-extension-annotated$/,
  );

  // One validation pass anchors the router, the extension entry and /_core once each,
  // however many extension routes there are.
  const many = {};

  for (let index = 0; index < 20; index += 1) {
    many[`r${index}`] =
      `${header}export default defineRoute("r${index}", {}).title("r${index}");\n`;
  }

  const anchor = AnchorState.prototype.anchor;
  let anchored = 0;

  AnchorState.prototype.anchor = function (...args) {
    anchored += 1;

    return anchor.apply(this, args);
  };

  try {
    await project.analyze(many);
  } finally {
    AnchorState.prototype.anchor = anchor;
  }

  assert.equal(anchored, 3);

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
      `import { destination as target } from "../target/destination.generated.js";\nexport default defineRoute("x", {}).canActivate([]).redirect({ to: target, search: { mode: "drop" }, fragment: { mode: "drop" } });`,
      /Redirect cannot follow canActivate$/,
    ],
    [
      `import { destination as target } from "../target/destination.generated.js";\nexport default defineRoute("x", {}).canDeactivate([]).redirect({ to: target, search: { mode: "drop" }, fragment: { mode: "drop" } });`,
      /Redirect cannot follow canDeactivate$/,
    ],
    [
      `import { destination as target } from "../target/destination.generated.js";\nexport default defineRoute("x", {}).redirect({ to: target, search: { mode: "drop" }, fragment: { mode: "drop" } }).title("t");`,
      /No step may follow redirect: title$/,
    ],
    [
      `import { destination as target } from "../target/destination.generated.js";\nclass E {}\nexport default defineRoute("x", {}).errorComponent(E).redirect({ to: target, search: { mode: "drop" }, fragment: { mode: "drop" } });`,
      /Redirect cannot follow errorComponent$/,
    ],
    [
      `import { destination as target } from "../target/destination.generated.js";\nclass E {}\nexport default defineRoute("x", {}).redirect({ to: target, search: { mode: "drop" }, fragment: { mode: "drop" } }).errorComponent(E);`,
      /No step may follow redirect: errorComponent$/,
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
    x: `${header}const decide = () => false as const;\nconst TITLE = "t";\nclass E {}\nexport default defineRoute("x/$id", { params: { id: numberParam } }).onInvalidParams(decide).title(TITLE).providers([]).errorComponent(E);\n`,
  });

  assert.deepEqual(
    [
      ...accepted.sources.declarations
        .find((declaration) => declaration.path === "x/$id")
        .config.keys(),
    ],
    ["params", "onInvalidParams", "title", "providers", "errorComponent"],
  );
});

// ---------------------------------------------------------------------------------------------
// Per-route copies: destination.generated.ts and route.generated.ts, line-aligned with route.ts.

const markerOf = {
  destination: "// @loozo/angular-router routegen: owned destination.generated.ts",
  route: "// @loozo/angular-router routegen: owned route.generated.ts",
};
const componentPage = (name) =>
  `import { Component } from "@angular/core";\n\n@Component({ template: "${name}" })\nexport default class Page {}\n`;
// A named export, so discovery doesn't take it for the directory's page.
const errorComponentModule = (name) =>
  `import { Component } from "@angular/core";\n\n@Component({ template: "${name}" })\nexport class ${name} {}\n`;

// A router project in explicit mode: each route is a directory under src/routes holding
// route.ts and, unless it's listed as componentless, a page. Analysis discovers, emits and
// validates without publishing.
async function copyProject() {
  const root = await fixture();
  const packageDirectory = resolve(import.meta.dirname, "..");

  await mkdir(resolve(root, "node_modules/@loozo"), { recursive: true });
  await Promise.all([
    symlink(packageDirectory, resolve(root, "node_modules/@loozo/angular-router"), "dir"),
    symlink(
      resolve(packageDirectory, "node_modules/@angular"),
      resolve(root, "node_modules/@angular"),
      "dir",
    ),
  ]);

  async function write(path, text) {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), text);
  }

  async function author(routes, { files = {}, componentless = [], compilerOptions = {} } = {}) {
    await rm(resolve(root, "src"), { recursive: true, force: true });

    for (const [directory, text] of Object.entries(routes)) {
      await write(`src/routes/${directory}/route.ts`, text);

      if (!componentless.includes(directory)) {
        await write(`src/routes/${directory}/page.ts`, componentPage(directory));
      }
    }

    for (const [path, text] of Object.entries(files)) {
      await write(path, text);
    }

    await write(
      "tsconfig.json",
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
          ...compilerOptions,
        },
        include: ["src/**/*.ts"],
      }),
    );
  }

  const options = {
    tsconfig: "tsconfig.json",
    scanDirectories: ["src/routes"],
    outDirectory: "generated",
    autoDefineRoutes: false,
  };

  return {
    root,
    write,
    author,
    read: (path) => readFile(resolve(root, path), "utf8"),
    async analyze(routes, settings) {
      await author(routes, settings);

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
      assertNoDeclarationReferences(sources, desired);

      return {
        sources,
        desired,
        copy: (directory, kind) =>
          desired.get(resolve(root, `src/routes/${directory}/${kind}.generated.ts`)),
      };
    },
    generate: (extra = {}) => generate(root, { ...options, ...extra }, () => false),
  };
}

// Acceptance 1: no generated file references a declaration module, in any form.
function assertNoDeclarationReferences(sources, desired) {
  const declarations = new Set(sources.declarations.map((declaration) => declaration.file));

  for (const [file, text] of desired) {
    for (const { fileName } of ts.preProcessFile(text, true, true).importedFiles) {
      if (!fileName.startsWith(".")) {
        continue;
      }

      const target = resolve(dirname(file), fileName);

      for (const candidate of [target, target.replace(/\.js$/, ".ts"), `${target}.ts`]) {
        assert.equal(declarations.has(candidate), false, `${file} references ${fileName}`);
      }
    }
  }
}

function parseRoute(text) {
  const source = ts.createSourceFile("route.ts", text, ts.ScriptTarget.Latest, true);
  const exported = source.statements.find((statement) => ts.isExportAssignment(statement));
  const steps = [];
  let current = exported.expression;

  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    steps.unshift(current);
    current = current.expression.expression;
  }

  const units = [];

  for (const statement of source.statements) {
    if (statement === exported) {
      continue;
    }

    const clause = ts.isImportDeclaration(statement) && statement.importClause;

    if (!clause) {
      let label = statement.getText(source).split("\n")[0];

      if (ts.isVariableStatement(statement)) {
        label = statement.declarationList.declarations.map((d) => d.name.getText(source)).join(",");
      } else if (statement.name) {
        label = statement.name.text;
      }

      units.push({ label, node: statement, statement });

      continue;
    }

    if (clause.name) {
      units.push({ label: clause.name.text, node: clause.name, statement });
    }

    const named = clause.namedBindings;

    if (named && ts.isNamespaceImport(named)) {
      units.push({ label: named.name.text, node: named, statement });
    } else if (named) {
      for (const element of named.elements) {
        units.push({ label: element.name.text, node: element, statement });
      }
    }
  }

  return { source, exported, root: current, steps, units };
}

/**
 * The alignment oracle (plan-3 step 7 group C): checks one copy against its declaration's AST
 * and returns the labels of the top-level units the copy dropped.
 */
function oracle(authored, copy, kind, { server = [] } = {}) {
  const { source, root, steps, units } = parseRoute(authored);
  const authoredLines = authored.split(/\r?\n/);

  if (/\r?\n$/.test(authored)) {
    authoredLines.pop();
  }

  const n = authoredLines.length;
  const lines = copy.split("\n");

  // 1. N aligned lines, then the tail; the marker is the last line, followed by "\n".
  assert.equal(lines.pop(), "");
  assert.equal(lines.at(-1), markerOf[kind]);
  assert.ok(lines.length > n + 1);
  assert.match(lines[n], /^import /);

  const lineOf = (position) => source.getLineAndCharacterOfPosition(position).line;
  const within = (first, last) => lines.slice(first, last + 1).join("\n");
  const removedSpans = [];
  const removed = [];
  const facts = root.arguments[1];
  const parentProperty = facts.properties.find((property) => property.name.text === "parent");
  const parentBinding = parentProperty && (parentProperty.initializer ?? parentProperty.name).text;
  const parentImport = units.find(
    (unit) => unit.node === unit.statement.importClause?.name && unit.label === parentBinding,
  )?.statement;

  // 2, 3. Each unit is kept on its own lines verbatim, or gone from them.
  for (const unit of units) {
    if (unit.statement === parentImport) {
      continue;
    }

    const text = unit.node.getText(source);
    const start = unit.node.getStart(source);

    if (within(lineOf(start), lineOf(unit.node.end)).includes(text)) {
      continue;
    }

    removed.push(unit.label);
    removedSpans.push([start, unit.node.end]);
  }

  for (const step of steps) {
    const dot = step.expression.getChildAt(1, source).getStart(source);
    const text = authored.slice(dot, step.end);
    const window = within(lineOf(dot), lineOf(step.end));

    if (kind === "destination" || server.includes(step.expression.name.text)) {
      removedSpans.push([step.expression.expression.end, step.end]);
      assert.ok(!window.includes(text), `stripped step kept: ${text}`);
    } else {
      assert.ok(window.includes(text), `kept step moved: ${text}`);
    }
  }

  // 5. The root call's first line holds the generated call; the parent import is rewritten.
  const rootLine = lineOf(root.getStart(source));

  if (kind === "route") {
    // An extension route with a server-only step is typed from its declaration.
    assert.match(
      lines[rootLine],
      /routegen\$(?:routeOf|authoredRouteOf<typeof routegen\$Authored>\(\))\(/,
    );
    removedSpans.push([source.getLineStarts()[rootLine + 1] ?? root.end, root.end]);
  } else {
    assert.ok(lines[rootLine].includes("routegen$defineDestination("));

    for (const argument of root.arguments) {
      const window = within(lineOf(argument.getStart(source)), lineOf(argument.end));

      assert.ok(window.includes(argument.getText(source)), "URL facts moved");
    }
  }

  if (parentImport) {
    assert.match(
      lines[lineOf(parentImport.getStart(source))],
      new RegExp(
        `^import \\{ ${kind} as ${parentBinding} \\} from ".*/${kind}\\.generated\\.js";$`,
      ),
    );
  }

  // 4. A line whose every non-whitespace character was removed is empty.
  const starts = source.getLineStarts();

  for (let line = 0; line < n; line += 1) {
    const text = authoredLines[line];
    let any = false;
    let all = true;

    for (let index = 0; index < text.length; index += 1) {
      if (/\s/.test(text[index])) {
        continue;
      }

      const position = starts[line] + index;

      any = true;

      if (!removedSpans.some(([start, end]) => position >= start && position < end)) {
        all = false;
      }
    }

    if (any && all) {
      assert.equal(lines[line], "", `line ${line + 1} of the ${kind} copy`);
    }
  }

  return removed.sort();
}

const destinationDoc =
  "/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */";
const routeDoc =
  "/** This route's browser copy: its declaration without server-only steps, read by the generated route configuration. */";
const injectDoc = `/**
 * Injects a typed handle bound to this exact generated activated route record.
 *
 * @remarks
 * Call in an Angular injection context. The handle exposes readonly native
 * params/search/data/title Signals and destination-typed link/navigate methods.
 * Data holds the resolver results of this route and its ancestors, a nearer
 * key hiding an ancestor's; native static data and the title stay out. Title
 * is the nearest declared title in the chain, or undefined when none declares one.
 * Navigation values are explicit, except omitted retained search keys; links and
 * navigations compose with the current URL, keeping the named-outlet branches a
 * navigation doesn't touch.
 *
 * @returns A noncallable handle for this declaration.
 * @throws A synchronous wiring error outside an injection context or when the
 * activated record does not carry this declaration's own generated identity.
 */`;
const destinationTail = `import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
${markerOf.destination}
`;

const snippetTeam = `import { defineRoute, numberParam } from "@loozo/angular-router";

export default defineRoute("teams/$teamId", {
  params: { teamId: numberParam },
  search: { score: numberParam },
}).resolve({
  team: ({ params }) => ({ id: params.teamId, name: \`Team \${params.teamId}\` }),
});
`;
const snippetItem = `import { inject } from "@angular/core";
import { defineRoute, numberParam } from "@loozo/angular-router";
import team from "../../route.js";
import { ItemCatalog } from "../../../../../catalog.js";

export default defineRoute("items/$id", { parent: team, params: { id: numberParam } })
  .runGuardsAndResolvers("paramsOrQueryParamsChange")
  .title(({ params }) => \`Item \${params.id}\`)
  .resolve({
    item: ({ params, search }) => {
      const catalog = inject(ItemCatalog);

      return catalog({ teamId: params.teamId, id: params.id, score: search.score });
    },
  });
`;
const snippetOldItems = `import { defineRoute, numberParam } from "@loozo/angular-router";
import team from "../../route.js";
import { destination as item } from "../../items/$id/destination.generated.js";

export default defineRoute("old-items/$id", {
  parent: team,
  params: { id: numberParam },
}).redirect({
  to: item,
  search: { mode: "drop" }, // or "preserve", or { mode: "replace", values }
  fragment: { mode: "drop" }, // or "preserve", or { mode: "replace", value }
});
`;
const snippetCatalog = `import { InjectionToken } from "@angular/core";

export const ItemCatalog = new InjectionToken<
  (query: { teamId: number; id: number; score: number | undefined }) => Promise<string>
>("ItemCatalog");
`;

function snippetRoutes(item = snippetItem) {
  return {
    routes: {
      "teams/$teamId": snippetTeam,
      "teams/$teamId/items/$id": item,
      "teams/$teamId/old-items/$id": snippetOldItems,
    },
    settings: {
      files: { "src/catalog.ts": snippetCatalog },
      componentless: ["teams/$teamId", "teams/$teamId/old-items/$id"],
    },
  };
}

test("route copies: the step-3 samples, byte for byte, and line endings don't change them", async () => {
  const project = await copyProject();
  const { routes, settings } = snippetRoutes();
  const result = await project.analyze(routes, settings);
  const item = "teams/$teamId/items/$id";
  const old = "teams/$teamId/old-items/$id";
  const itemId = JSON.stringify("src/routes/teams/$teamId/items/$id/route.ts");
  const oldId = JSON.stringify("src/routes/teams/$teamId/old-items/$id/route.ts");

  assert.equal(
    result.copy(item, "destination"),
    `
import { numberParam } from "@loozo/angular-router";
import { destination as team } from "../../destination.generated.js";


${destinationDoc} const routegen$destination = routegen$defineDestination("items/$id", { parent: team, params: { id: numberParam } }, ${itemId})








;
${destinationTail}`,
  );
  assert.equal(
    result.copy(item, "route"),
    `import { inject } from "@angular/core";
import { defineRoute } from "@loozo/angular-router";
import { route as team } from "../../route.generated.js";
import { ItemCatalog } from "../../../../../catalog.js";

${routeDoc} const routegen$route = routegen$routeOf(defineRoute, routegen$destination, team)
${snippetItem.split("\n").slice(6).join("\n")}import { routeOf as routegen$routeOf, injectGeneratedRoute as routegen$injectGeneratedRoute, type Handle as routegen$Handle } from "@loozo/angular-router/_generated";
import { destination as routegen$destination } from "./destination.generated.js";
import { destination as routegen$up } from "../../destination.generated.js";
export { routegen$route as route };
${injectDoc}
function routegen$injectRoute(): routegen$Handle<typeof routegen$route, typeof routegen$up> { return routegen$injectGeneratedRoute(routegen$route, routegen$up); }
export { routegen$injectRoute as injectRoute };
${markerOf.route}
`,
  );
  assert.equal(
    result.copy(old, "destination"),
    `import { numberParam } from "@loozo/angular-router";
import { destination as team } from "../../destination.generated.js";


${destinationDoc} const routegen$destination = routegen$defineDestination("old-items/$id", {
  parent: team,
  params: { id: numberParam },
}, ${oldId})



;
${destinationTail}`,
  );
  // A redirect record never activates: no ".." and no injectRoute.
  assert.equal(
    result.copy(old, "route"),
    `import { defineRoute } from "@loozo/angular-router";
import { route as team } from "../../route.generated.js";
import { destination as item } from "../../items/$id/destination.generated.js";

${routeDoc} const routegen$route = routegen$routeOf(defineRoute, routegen$destination, team)


.redirect({
${snippetOldItems.split("\n").slice(8).join("\n")}import { routeOf as routegen$routeOf } from "@loozo/angular-router/_generated";
import { destination as routegen$destination } from "./destination.generated.js";
export { routegen$route as route };
${markerOf.route}
`,
  );

  // The oracle holds for every pair, and drops exactly the units each copy doesn't use.
  const dropped = {};

  for (const [directory, text] of Object.entries(routes)) {
    dropped[directory] = {
      destination: oracle(text, result.copy(directory, "destination"), "destination"),
      route: oracle(text, result.copy(directory, "route"), "route"),
    };
  }

  assert.deepEqual(dropped, {
    "teams/$teamId": { destination: ["defineRoute"], route: ["numberParam"] },
    [item]: {
      destination: ["ItemCatalog", "defineRoute", "inject"],
      route: ["numberParam"],
    },
    [old]: { destination: ["defineRoute", "item"], route: ["numberParam"] },
  });

  // CRLF and a BOM produce the same bytes; without a final line break, lines 1..N still align.
  for (const variant of [
    snippetItem.replaceAll("\n", "\r\n"),
    `\uFEFF${snippetItem}`,
    snippetItem.trimEnd(),
  ]) {
    const { routes: changed, settings: same } = snippetRoutes(variant);
    const again = await project.analyze(changed, same);

    assert.equal(again.copy(item, "destination"), result.copy(item, "destination"));
    assert.equal(again.copy(item, "route"), result.copy(item, "route"));
  }
});

test("route copies: the oracle holds over the snippets and the SSR proof route trees", async () => {
  const router = resolve(import.meta.dirname, "..");
  const trees = [
    resolve(router, "snippets/src"),
    resolve(router, "../../examples/angular-router/ssr-proof/src"),
  ];

  for (const tree of trees) {
    const project = await copyProject();
    const routes = {};
    const componentless = [];

    async function collect(directory, prefix) {
      const { readdir } = await import("node:fs/promises");

      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);

        if (entry.isDirectory()) {
          await collect(path, `${prefix}${entry.name}/`);
        } else if (entry.name === "route.ts") {
          // A Windows checkout may write CRLF; the oracle compares against LF copies.
          routes[prefix.slice(0, -1)] = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
        }
      }

      if (!(await stat(resolve(directory, "page.ts")).catch(() => undefined)) && prefix) {
        componentless.push(prefix.slice(0, -1));
      }
    }

    await collect(resolve(tree, "routes"), "");
    await project.author(routes, {
      files: { "src/catalog.ts": await readFile(resolve(tree, "catalog.ts"), "utf8") },
      componentless,
    });

    const sources = await discover(
      project.root,
      "tsconfig.json",
      ["src/routes"],
      "generated",
      undefined,
      new Map(),
      false,
    );
    const desired = emit(sources, selections(sources));

    assert.ok(Object.keys(routes).length >= 5, tree);
    assertNoDeclarationReferences(sources, desired);

    for (const [directory, text] of Object.entries(routes)) {
      for (const kind of ["destination", "route"]) {
        oracle(
          text,
          desired.get(resolve(project.root, `src/routes/${directory}/${kind}.generated.ts`)),
          kind,
        );
      }
    }
  }
});

test("route copies: liveness keeps what the copy still reaches and strips the rest", async () => {
  const project = await extensionProject();
  const header = 'import { defineRoute } from "@fixture/route-extension";\n';
  const secrets = 'import { secret } from "../../secrets.server.js";\n';
  const server = ["context", "use"];

  await project.write(
    "src/secrets.server.ts",
    "export const secret = (value?: unknown): string => String(value);\n",
  );
  await project.write("src/effects.ts", "export {};\n");

  async function copiesOf(text) {
    const { desired } = await project.analyze({ x: text });
    const read = (kind) => desired.get(resolve(project.root, `src/routes/x/${kind}.generated.ts`));

    return {
      destination: read("destination"),
      route: read("route"),
      dropped: {
        destination: oracle(text, read("destination"), "destination", { server }),
        route: oracle(text, read("route"), "route", { server }),
      },
    };
  }

  // Mutual helpers reached only from a stripped step go with their server import.
  const mutual = `${header}${secrets}const a = (): object => b();\nconst b = (): object => ({ value: secret(a) });\n`;
  const helpers = await copiesOf(
    `${mutual}export default defineRoute("x", {}).context(a).title("ok");\n`,
  );

  assert.deepEqual(helpers.dropped.route, ["a", "b", "secret"]);
  assert.equal(
    helpers.route.split("\n").slice(0, 5).join("\n"),
    `${header}\n\n\n${routeDoc} const routegen$route = routegen$authoredRouteOf<typeof routegen$Authored>()(defineRoute, routegen$destination).title("ok");`,
  );

  // So does a single helper.
  const single = await copiesOf(
    `${header}${secrets}const load = (): object => ({ value: secret() });\nexport default defineRoute("x", {}).context(load).title("ok");\n`,
  );

  assert.deepEqual(single.dropped.route, ["load", "secret"]);

  // An untouched top-level effect keeps the helpers it reaches, so the server import stays
  // and generation fails naming it.
  await assert.rejects(
    copiesOf(
      `${mutual}console.log(a);\nexport default defineRoute("x", {}).context(a).title("ok");\n`,
    ),
    /src[\\/]routes[\\/]x[\\/]route\.ts:2:24: Browser route copy imports a server module: \.\.\/\.\.\/secrets\.server\.js\. Use `import type` for types\.$/,
  );

  // A helper a kept step still uses stays; a dead authored cycle is untouched.
  const shared = await copiesOf(
    `${header}const label = (): string => "x";\nexport default defineRoute("x", {}).context(label).title(label);\n`,
  );

  assert.deepEqual(shared.dropped.route, []);

  const cycle = await copiesOf(
    `${header}const x = (): unknown => y();\nconst y = (): unknown => x();\nexport default defineRoute("x", {}).title("ok");\n`,
  );

  assert.deepEqual(cycle.dropped.route, []);
  // The destination copy keeps only what the path and facts reach: no effects, no imports.
  assert.deepEqual(cycle.dropped.destination, ["defineRoute", "x", "y"]);

  const effects = await copiesOf(
    `import "../../effects.js";\n${header}console.log("effect");\nexport default defineRoute("x", {}).title("ok");\n`,
  );

  assert.deepEqual(effects.dropped.route, []);
  assert.deepEqual(effects.dropped.destination, [
    'console.log("effect");',
    "defineRoute",
    'import "../../effects.js";',
  ]);

  // A kept step's type arguments are roots (A1): a type a stripped step also uses stays, and
  // the copy type-checks.
  const typed = await copiesOf(
    `${header}type ResolverMap = { me: () => string };\nexport default defineRoute("x", {}).context((): ResolverMap => ({ me: () => "u" })).resolve<ResolverMap>({ me: () => "u" });\n`,
  );

  assert.deepEqual(typed.dropped.route, []);
  assert.match(typed.route, /\.resolve<ResolverMap>\(/);

  // A type only a stripped step's type arguments name goes with it.
  const strippedType = await copiesOf(
    `${header}type Only = { a: 1 };\nexport default defineRoute("x", {}).context<Only>(() => ({ a: 1 })).title("ok");\n`,
  );

  assert.deepEqual(strippedType.dropped.route, ["Only"]);
});

test("route copies: a pruned import specifier takes its own comma, not one in a comment", async () => {
  const project = await extensionProject();
  const header = 'import { defineRoute } from "@fixture/route-extension";\n';

  await project.write(
    "src/helpers.ts",
    'export const server = () => ({});\nexport const label = "x";\n',
  );

  async function routeCopy(imports) {
    const { desired } = await project.analyze({
      x: `${header}${imports}\nexport default defineRoute("x", {}).context(server).title(label);\n`,
    });

    return desired.get(resolve(project.root, "src/routes/x/route.generated.ts")).split("\n")[1];
  }

  assert.equal(
    await routeCopy(
      'import { server /* stripped, with a comma */, label } from "../../helpers.js";',
    ),
    'import { label } from "../../helpers.js";',
  );
  assert.equal(
    await routeCopy('import { label, server /* a, b */, } from "../../helpers.js";'),
    'import { label, } from "../../helpers.js";',
  );
});

test("route copies: a stripped default import keeps its untouched sibling bindings and their module", async () => {
  const project = await extensionProject();
  const header = 'import { defineRoute } from "@fixture/route-extension";\n';
  const key = `effects${process.pid}`;
  const effect = (name) =>
    `(globalThis as any).${key} = [...((globalThis as any).${key} ?? []), "${name}"];\n`;

  await project.write(
    "src/helpers.ts",
    `${effect("helpers")}export default function server() { return {}; }\nexport const unused = 1;\n`,
  );
  await project.write(
    "src/more.ts",
    `${effect("more")}export default function server() { return {}; }\nexport const unused = 1;\n`,
  );

  const routes = {
    named: `${header}import server, { unused } from "../../helpers.js";\nexport default defineRoute("named", {}).context(server).title("ok");\n`,
    namespace: `${header}import server, * as more from "../../more.js";\nexport default defineRoute("namespace", {}).context(server).title("ok");\n`,
  };
  const compilerOptions = { verbatimModuleSyntax: true };
  const { desired } = await project.analyze(routes, undefined, compilerOptions);
  const read = (directory, kind) =>
    desired.get(resolve(project.root, `src/routes/${directory}/${kind}.generated.ts`));

  // The default binding goes with the stripped step; the untouched binding stays a root.
  assert.equal(read("named", "route").split("\n")[1], 'import { unused } from "../../helpers.js";');
  assert.equal(read("namespace", "route").split("\n")[1], 'import * as more from "../../more.js";');

  // Under verbatimModuleSyntax the kept import still runs its module.
  const files = {
    "src/helpers.ts": await readFile(resolve(project.root, "src/helpers.ts"), "utf8"),
    "src/more.ts": await readFile(resolve(project.root, "src/more.ts"), "utf8"),
  };

  for (const directory of Object.keys(routes)) {
    for (const kind of ["destination", "route"]) {
      files[`src/routes/${directory}/${kind}.generated.ts`] = read(directory, kind);
    }
  }

  for (const [path, text] of Object.entries(files)) {
    const { outputText } = ts.transpileModule(text, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        ...compilerOptions,
      },
      fileName: path,
    });

    await project.write(path.replace(/\.ts$/, ".js"), outputText);
  }

  // Each copy runs in a fresh process, as an application would load it.
  const effects = {};

  for (const directory of Object.keys(routes)) {
    const copyUrl = pathToFileURL(
      resolve(project.root, `src/routes/${directory}/route.generated.js`),
    ).href;
    const { stdout } = await run(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `await import("@angular/compiler");\nawait import(${JSON.stringify(copyUrl)});\nconsole.log(JSON.stringify(globalThis.${key} ?? []));`,
      ],
      { cwd: project.root },
    );

    effects[directory] = JSON.parse(stdout);
  }

  assert.deepEqual(effects, { named: ["helpers"], namespace: ["more"] });
});

test("route copies: destination ids type as literals in generated consumers", async () => {
  const project = await copyProject();
  const header = 'import { defineRoute, numberParam, stringParam } from "@loozo/angular-router";\n';
  const routes = {
    about: `${header}export default defineRoute("about", {});\n`,
    "teams/$teamId": `${header}export default defineRoute("teams/$teamId", { params: { teamId: numberParam } });\n`,
    "teams/$teamId/items/$id": `${header}import team from "../../route.js";\nexport default defineRoute("items/$id", { parent: team, params: { id: stringParam }, fragments: ["notes"] });\n`,
  };
  const shell = `import { createUrl } from "@loozo/angular-router";
import { injectActiveRoute } from "../generated/routes.generated.js";
import { destination as about } from "./routes/about/destination.generated.js";
import { destination as team } from "./routes/teams/$teamId/destination.generated.js";
import { destination as item } from "./routes/teams/$teamId/items/$id/destination.generated.js";
import { injectRoute as injectItem } from "./routes/teams/$teamId/items/$id/route.generated.js";

const active = injectActiveRoute();
export const onAbout: boolean = active()?.is(about) ?? false;
export const inTeam: boolean = active()?.contains(team) ?? false;
export const teamUrl: string = createUrl(team, { params: { teamId: 7 } });
export const itemUrl: string = createUrl(item, { params: { teamId: 7, id: "x" }, fragment: "notes" });
const route = active();

if (route?.is(item)) {
  const id: string = route.params().id;
  const teamId: number = route.params().teamId;

  route.link({ params: { teamId, id }, fragment: "notes" });
}

export const link = () => injectItem().link({ params: { teamId: 7, id: "x" } });
`;
  const { sources, desired, copy } = await project.analyze(routes, {
    files: { "src/shell.ts": shell },
  });
  const call = (directory) =>
    copy(directory, "destination")
      .split("\n")
      .find((line) => line.includes("routegen$defineDestination("))
      .replace(/^.* = /, "");

  // No type arguments, so inference types the generated id as its literal.
  assert.equal(
    call("teams/$teamId/items/$id"),
    'routegen$defineDestination("items/$id", { parent: team, params: { id: stringParam }, fragments: ["notes"] }, "src/routes/teams/$teamId/items/$id/route.ts");',
  );

  // The application type-checks over the generated overlay.
  const { program } = createValidationProgram(sources, desired, []);
  const shellFile = program.getSourceFile(resolve(project.root, "src/shell.ts"));

  assert.deepEqual(
    program
      .getSemanticDiagnostics(shellFile)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
    [],
  );
});

test("route copies: a destination copy keeps a retained mark and its import", async () => {
  const project = await copyProject();
  const header =
    'import { defineRoute, numberParam, retained, stringParam } from "@loozo/angular-router";\n';
  const routes = {
    ws: `${header}export default defineRoute("ws", { search: { workspace: retained(stringParam) } });\n`,
    "ws/orders/$id": `${header}import ws from "../../route.js";\nexport default defineRoute("orders/$id", { parent: ws, params: { id: numberParam } });\n`,
  };
  const shell = `import { destination as order } from "./routes/ws/orders/$id/destination.generated.js";
import { injectRoute } from "./routes/ws/route.generated.js";

export const link = () => injectRoute().link({ to: order, params: { id: 7 } });
export const drop = () => injectRoute().link({ search: { workspace: undefined } });
`;
  const { sources, desired, copy } = await project.analyze(routes, {
    files: { "src/shell.ts": shell },
  });
  const destination = copy("ws", "destination");

  assert.match(destination, /^import \{ retained, stringParam \} from "@loozo\/angular-router";$/m);
  assert.match(
    destination,
    /routegen\$defineDestination\("ws", \{ search: \{ workspace: retained\(stringParam\) \} \}, "src\/routes\/ws\/route\.ts"\);/,
  );

  const { program } = createValidationProgram(sources, desired, []);
  const shellFile = program.getSourceFile(resolve(project.root, "src/shell.ts"));

  assert.deepEqual(
    program
      .getSemanticDiagnostics(shellFile)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
    [],
  );
});

test("route declarations: the root call takes no type arguments, for every factory form", async () => {
  const project = await extensionProject();
  const reason =
    "Route declaration root call takes no type arguments: remove them; defineRoute infers its types from the URL facts";
  const types =
    'import { numberParam, type ParamCodec, type ParamsOf } from "@loozo/angular-router";\n';
  const factories = [
    "@loozo/angular-router",
    "@fixture/route-extension",
    "@fixture/route-extension-annotated",
  ];

  for (const factory of factories) {
    const header = `import { defineRoute } from "${factory}";\n${types}`;
    // Each child type-checks as authored; its type arguments name the parent route, which its
    // destination copy would rebind to the parent's destination.
    const witnesses = [
      {
        name: "ParamsOf<typeof parent>",
        parent: `${header}export default defineRoute("teams/$teamId", { params: { teamId: numberParam } });\n`,
        child: `${header}import parent from "../route.js";\ntype TeamId = ParamsOf<typeof parent>["teamId"];\nexport default defineRoute<\n  "child",\n  typeof parent,\n  {},\n  { selectedTeam: ParamCodec<TeamId> }\n>("child", { parent, search: { selectedTeam: numberParam } });\n`,
        at: "6:3",
      },
      {
        name: "typeof parent.path",
        parent: `${header}export default defineRoute("section", {});\n`,
        child: `${header}import parent from "../route.js";\nexport default defineRoute<typeof parent.path, typeof parent>("section", { parent });\n`,
        at: "4:28",
      },
    ];

    for (const { name, parent, child, at } of witnesses) {
      await assert.rejects(project.analyze({ parent, "parent/child": child }), (error) => {
        assert.ok(
          error.message.endsWith(`child${sep}route.ts:${at}: ${reason}`),
          `${factory}, ${name}: ${error.message}`,
        );

        return true;
      });
    }
  }
});

test("route declarations: URL facts use the parent import only as `parent:`, for every factory form", async () => {
  const project = await extensionProject();
  const reason =
    "URL facts may use the parent import only as `parent:`; for its URL types use ParamsOf<TargetOf<typeof d>> with d imported from the parent's destination.generated.js";
  const types =
    'import { numberParam, type ParamCodec, type ParamsOf, type TargetOf } from "@loozo/angular-router";\n';
  const factories = [
    "@loozo/angular-router",
    "@fixture/route-extension",
    "@fixture/route-extension-annotated",
  ];

  for (const factory of factories) {
    const header = `import { defineRoute } from "${factory}";\n${types}`;
    const team = `${header}export default defineRoute("teams/$teamId", { params: { teamId: numberParam } });\n`;
    const imported = `${header}import parent from "../route.js";\n`;
    // Each child type-checks as authored, with no root type arguments; its destination copy
    // would rebind `parent` to the parent's destination, which has no route types or `path`.
    const rejected = [
      {
        name: "codec type from ParamsOf<typeof parent>",
        parent: team,
        child: `${imported}type TeamId = ParamsOf<typeof parent>["teamId"];\nconst selectedTeam: ParamCodec<TeamId> = numberParam;\nexport default defineRoute("child", {\n  parent,\n  search: { selectedTeam },\n});\n`,
        at: "4:31",
      },
      {
        name: "fragments: [parent.path]",
        parent: `${header}export default defineRoute("section", {});\n`,
        child: `${imported}export default defineRoute("child", { parent, fragments: [parent.path] });\n`,
        at: "4:59",
      },
    ];

    for (const { name, parent, child, at } of rejected) {
      await assert.rejects(project.analyze({ parent, "parent/child": child }), (error) => {
        assert.ok(
          error.message.endsWith(`child${sep}route.ts:${at}: ${reason}`),
          `${factory}, ${name}: ${error.message}`,
        );

        return true;
      });
    }

    // Accepted: either `parent` spelling; steps and what only they reach use `parent` freely
    // (the route copy binds it to the parent's route copy); a helper both reach that doesn't
    // name `parent`; and the parent's destination for its URL types.
    const accepted = [
      {
        name: "{ parent }",
        child: `${imported}export default defineRoute("child", { parent });\n`,
      },
      {
        name: "parent: parent",
        child: `${imported}export default defineRoute("child", { parent: parent });\n`,
      },
      {
        name: "steps",
        child: `${imported}type Team = ParamsOf<typeof parent>;\nconst describe = (team: Team): string => \`Team \${team.teamId}\`;\nexport default defineRoute("child", { parent })\n  .resolve({ section: (): string => parent.path })\n  .title(({ params }) => describe(params));\n`,
      },
      {
        name: "a helper the facts and a step share",
        child: `${imported}const selectedTeam: ParamCodec<number> = numberParam;\nexport default defineRoute("child", { parent, search: { selectedTeam } }).resolve({ codec: () => selectedTeam });\n`,
      },
      {
        name: "ParamsOf<TargetOf<typeof d>>",
        child: `${imported}import { destination as team } from "../destination.generated.js";\ntype TeamId = ParamsOf<TargetOf<typeof team>>["teamId"];\nconst selectedTeam: ParamCodec<TeamId> = numberParam;\nexport default defineRoute("child", { parent, search: { selectedTeam } });\n`,
        destination: 'type TeamId = ParamsOf<TargetOf<typeof team>>["teamId"];',
      },
    ];

    for (const { name, child, destination } of accepted) {
      // analyze validates the generated copies, so each must type-check.
      const { desired } = await project
        .analyze({ parent: team, "parent/child": child })
        .catch((error) => assert.fail(`${factory}, ${name}: ${error.message}`));

      if (destination) {
        const copy = desired.get(
          resolve(project.root, "src/routes/parent/child/destination.generated.ts"),
        );

        assert.ok(copy.includes(destination), `${factory}, ${name}: ${copy}`);
      }
    }
  }
});

test("route declarations: a binding the URL facts read can't be reassigned", async () => {
  const project = await copyProject();
  const header =
    'import { defineRoute, numberParam, stringParam, type ParamCodec } from "@loozo/angular-router";\n';
  const reason = "a binding the URL facts read is reassigned; declare it const";
  const codec = "let id: ParamCodec<string | number> = stringParam;\n";
  const facts = 'export default defineRoute("a/$id", { params: { id } })';
  // The destination copy would keep `let id = stringParam` and drop every write.
  const rejected = [
    {
      name: "assignment",
      text: `${header}${codec}id = numberParam;\n${facts};\n`,
      at: "3:1",
    },
    {
      name: "assignment inside a function a step calls",
      text: `${header}${codec}const reset = (): void => {\n  id = numberParam;\n};\n${facts}.title(() => {\n  reset();\n  return "a";\n});\n`,
      at: "4:3",
    },
    {
      name: "array destructuring",
      text: `${header}${codec}[id] = [numberParam];\n${facts};\n`,
      at: "3:2",
    },
    {
      name: "object destructuring shorthand",
      text: `${header}${codec}({ id } = { id: numberParam });\n${facts};\n`,
      at: "3:4",
    },
    {
      name: "for … of target",
      text: `${header}${codec}for (id of [numberParam]) {\n  void id;\n}\n${facts};\n`,
      at: "3:6",
    },
    {
      name: "++ on a binding a facts helper reads",
      text: `${header}let uses = 0;\nuses++;\nconst id = uses > 0 ? numberParam : numberParam;\n${facts};\n`,
      at: "3:1",
    },
  ];

  for (const { name, text, at } of rejected) {
    await assert.rejects(project.analyze({ a: text }), (error) => {
      assert.ok(
        error.message.endsWith(`a${sep}route.ts:${at}: ${reason}`),
        `${name}: ${error.message}`,
      );

      return true;
    });
  }

  // A binding only a step reads is the route copy's, which keeps every statement that writes
  // it; const codecs are unaffected.
  const { copy } = await project.analyze({
    a: `${header}let title = "a";\ntitle = "b";\nconst id = numberParam;\n${facts}.title(() => title);\n`,
  });

  assert.ok(copy("a", "route").includes('title = "b";'), copy("a", "route"));
  assert.ok(!copy("a", "destination").includes("title"), copy("a", "destination"));
});

test("route copies: one line holding the root, a stripped step and a kept step", async () => {
  const project = await extensionProject();
  const authored = `import { defineRoute } from "@fixture/route-extension";
import { server } from "../../helpers.js";
export default defineRoute("", {}).context(server).title("Home");
`;

  await project.write("src/helpers.ts", "export const server = () => ({});\n");

  const first = await project.analyze({ home: authored });
  const read = (result, kind) =>
    result.desired.get(resolve(project.root, `src/routes/home/${kind}.generated.ts`));
  const id = JSON.stringify("src/routes/home/route.ts");

  assert.equal(
    read(first, "destination"),
    `\n\n${destinationDoc} const routegen$destination = routegen$defineDestination("", {}, ${id});\n${destinationTail}`,
  );
  assert.equal(
    read(first, "route").split("\n").slice(0, 3).join("\n"),
    `import { defineRoute } from "@fixture/route-extension";\n\n${routeDoc} const routegen$route = routegen$authoredRouteOf<typeof routegen$Authored>()(defineRoute, routegen$destination).title("Home");`,
  );

  // Editing a stripped server step on its own line leaves both copies byte-identical.
  const edited = authored.replace(".context(server)", ".context(() => ({ a: 2, b: [3] }))");
  const second = await project.analyze({ home: edited });

  assert.equal(read(second, "destination"), read(first, "destination"));

  const multiline = `import { defineRoute } from "@fixture/route-extension";
export default defineRoute("", {})
  .context(() => ({ a: 1 }))
  .title("Home");
`;
  const before = await project.analyze({ home: multiline });
  const after = await project.analyze({
    home: multiline.replace("({ a: 1 })", '({ a: "changed", b: [2, 3] })'),
  });

  assert.equal(read(after, "destination"), read(before, "destination"));
  assert.equal(read(after, "route"), read(before, "route"));
});

test("route copies: a directive goes with its target line's code and stays while the line keeps some", async () => {
  const project = await extensionProject();

  await project.write("src/helpers.ts", "export const present = 1;\n");

  // Every directive here suppresses an error in route.ts. Validation type-checks both copies,
  // so a directive left above a line without its error fails with TS2578.
  const authored = `import { defineRoute } from "@fixture/route-extension";
// @ts-expect-error A missing export only a stripped step uses.
import { missing } from "../../helpers.js";
// @ts-expect-error A missing export an untouched statement uses.
import { absent } from "../../helpers.js";
/* A mismatch only a stripped step reaches; blank lines between don't unbind it.
 * @ts-expect-error */

const helper: number = "helper";
// @ts-expect-error A mismatch a kept step reaches.
const kept: number = "kept";
void absent;
// @ts-ignore Its target line keeps the root call and loses a stripped step.
export default defineRoute("x", {}).context(() => ({ missing, helper }))
  // @ts-expect-error A mismatch on a stripped step's own line.
  .use(() => { const wrong: number = "stripped"; })
  // @ts-expect-error A mismatch on a kept step's own line.
  .title(() => { const wrong: number = "kept"; return "t"; })
  .resolve({ kept: () => kept });
`;
  const { desired } = await project.analyze({ x: authored });
  const read = (kind) => desired.get(resolve(project.root, `src/routes/x/${kind}.generated.ts`));
  const lines = (kind) => read(kind).split("\n");
  const server = ["context", "use"];

  assert.deepEqual(oracle(authored, read("route"), "route", { server }), ["helper", "missing"]);
  assert.deepEqual(oracle(authored, read("destination"), "destination", { server }), [
    "absent",
    "defineRoute",
    "helper",
    "kept",
    "missing",
    "void absent;",
  ]);

  // The route copy keeps the directives above the import, the constant and the kept step it
  // keeps, and the one above the root line; the pruned import's and helper's go.
  assert.deepEqual(lines("route").slice(0, 18), [
    'import { defineRoute } from "@fixture/route-extension";',
    "",
    "",
    "// @ts-expect-error A missing export an untouched statement uses.",
    'import { absent } from "../../helpers.js";',
    "",
    "",
    "",
    "",
    "// @ts-expect-error A mismatch a kept step reaches.",
    'const kept: number = "kept";',
    "void absent;",
    "// @ts-ignore Its target line keeps the root call and loses a stripped step.",
    `${routeDoc} const routegen$route = routegen$authoredRouteOf<typeof routegen$Authored>()(defineRoute, routegen$destination)`,
    "",
    "",
    "  // @ts-expect-error A mismatch on a kept step's own line.",
    '  .title(() => { const wrong: number = "kept"; return "t"; })',
  ]);

  // The destination copy keeps only the root line's directive.
  const destination = lines("destination").slice(0, 18);

  assert.deepEqual(destination.slice(0, 12), Array(12).fill(""));
  assert.equal(
    destination[12],
    "// @ts-ignore Its target line keeps the root call and loses a stripped step.",
  );
  assert.match(destination[13], /^\/\*\* .* const routegen\$destination = /);
  assert.deepEqual(destination.slice(14), ["", "", "", ""]);
});

test("route copies: generated names are hygienic and routegen$ is reserved", async () => {
  const project = await copyProject();
  const home = `import { defineRoute } from "@loozo/angular-router";\n\nexport default defineRoute("", {});\n`;
  const hygiene = `import { defineRoute as routeOf } from "@loozo/angular-router";
type Handle = { label: string };
const route = (handle: Handle) => handle.label;
const destination = "kept";
function injectRoute(): Handle { return { label: destination }; }
const defineDestination = () => route(injectRoute());
const up = "!";
export default routeOf("hyg", {}).title(() => defineDestination() + up);
`;
  const result = await project.analyze({ "+home": home, hyg: hygiene });
  const route = result.copy("hyg", "route");
  const exportsOf = (text) => {
    const source = ts.createSourceFile("copy.ts", text, ts.ScriptTarget.Latest, true);
    const names = [];

    for (const statement of source.statements) {
      if (ts.isExportDeclaration(statement)) {
        names.push(...statement.exportClause.elements.map((element) => element.name.text));
      } else if (ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        names.push("<declaration>");
      }
    }

    return names;
  };

  // The authored local name of the factory is what the copy calls; its own helpers stay.
  assert.ok(
    route
      .split("\n")[7]
      .startsWith(
        `${routeDoc} const routegen$route = routegen$routeOf(routeOf, routegen$destination)`,
      ),
  );
  assert.deepEqual(oracle(hygiene, route, "route"), []);
  assert.match(
    route,
    /import \{ destination as routegen\$up \} from "\.\.\/\+home\/destination\.generated\.js";/,
  );
  assert.deepEqual(exportsOf(route), ["route", "injectRoute"]);
  assert.deepEqual(exportsOf(result.copy("hyg", "destination")), ["destination"]);

  await assert.rejects(
    project.analyze({ hyg: `${home.replace('""', '"hyg"')}const routegen$x = 1;\n` }),
    /hyg[\\/]route\.ts:4:7: Reserved generated binding prefix: routegen\$x$/,
  );
  await assert.rejects(
    project.analyze({
      hyg: `import { defineRoute as routegen$factory } from "@loozo/angular-router";\n\nexport default routegen$factory("hyg", {});\n`,
    }),
    /hyg[\\/]route\.ts:1:25: Reserved generated binding prefix: routegen\$factory$/,
  );
});

test("route declarations: the import rule, computed specifiers and default-export-only", async () => {
  const project = await copyProject();
  const header = 'import { defineRoute } from "@loozo/angular-router";\n';
  const routes = {
    a: `${header}\nexport default defineRoute("a", {});\n`,
    "a/b": `${header}import a from "../route.js";\n\nexport default defineRoute("b", { parent: a });\n`,
    "a/b/c": `${header}import b from "../route.js";\n\nexport default defineRoute("c", { parent: b });\n`,
  };

  // The child's parent default import is the one allowed edge.
  await project.analyze(routes);

  const destination = "Import its destination from ./routes/a/destination.generated.js instead.";
  const forms = [
    ['import a from "./routes/a/route.js";\nvoid a;\n', 1],
    ['export { default } from "./routes/a/route.js";\n', 1],
    ['export const load = () => import("./routes/a/route.js");\n', 1],
    ['export type A = typeof import("./routes/a/route.js");\n', 1],
    ['import type A from "./routes/a/route.js";\nexport type B = A;\n', 1],
    ['import a = require("./routes/a/route.js");\nvoid a;\n', 1],
    ['declare const require: (id: string) => unknown;\nrequire("./routes/a/route.js");\n', 2],
  ];

  for (const [text, line] of forms) {
    await assert.rejects(
      project.analyze(routes, { files: { "src/app.ts": text } }),
      new RegExp(
        `src[\\\\/]app\\.ts:${line}:\\d+: Import of a route declaration: \\./routes/a/route\\.js\\. ${destination.replaceAll(".", "\\.")}$`,
      ),
      text,
    );
  }

  await assert.rejects(
    project.analyze(routes, {
      files: { "src/app.ts": '/// <reference path="./routes/a/route.ts" />\nexport {};\n' },
    }),
    /src[\\/]app\.ts:1:\d+: Import of a route declaration: \.\/routes\/a\/route\.ts\. /,
  );

  // A grandparent import from a declaration is not its parent edge.
  await assert.rejects(
    project.analyze({
      ...routes,
      "a/b/c": `${header}import b from "../route.js";\nimport a from "../../route.js";\nvoid a;\n\nexport default defineRoute("c", { parent: b });\n`,
    }),
    /c[\\/]route\.ts:3:15: Import of a route declaration: \.\.\/\.\.\/route\.js\. Import its destination from \.\.\/\.\.\/destination\.generated\.js instead\.$/,
  );

  // Declarations are identified by identity, not by file name.
  await assert.rejects(
    project.analyze(
      {},
      {
        files: {
          "src/routes/d/definition.ts": `${header}\nexport default defineRoute("d", {});\n`,
          "src/routes/d/page.ts": componentPage("d"),
          "src/app.ts": 'import d from "./routes/d/definition.js";\nvoid d;\n',
        },
      },
    ),
    /app\.ts:1:\d+: Import of a route declaration: \.\/routes\/d\/definition\.js\. Import its destination from \.\/routes\/d\/destination\.generated\.js instead\.$/,
  );

  for (const [text, computed] of [
    ['const name = "./x.js";\nexport const load = () => import(name);\n', "name"],
    [
      'declare const require: (id: string) => unknown;\nconst name = "./x.js";\nrequire(name);\n',
      "name",
    ],
  ]) {
    await assert.rejects(
      project.analyze(routes, { files: { "src/app.ts": text } }),
      new RegExp(`app\\.ts:\\d+:\\d+: Computed module specifier: ${computed}$`),
    );
  }

  for (const extra of [
    "export const extra = 1;\n",
    "export type Extra = 1;\n",
    'export * from "@angular/core";\n',
    "const local = 1;\nexport { local };\n",
  ]) {
    await assert.rejects(
      project.analyze({ ...routes, a: `${routes.a}${extra}` }),
      /a[\\/]route\.ts:\d+:1: Route declaration module may only default-export its route$/,
      extra,
    );
  }
});

// A componentless layout whose route.ts imports `../../helper.*`, and its leaf child.
function layoutRoutes(helper = "../../helper.js") {
  const header = 'import { defineRoute } from "@loozo/angular-router";\n';

  return {
    layout: `${header}import { guard } from ${JSON.stringify(helper)};\n\nexport default defineRoute("layout", {}).canActivate([guard]);\n`,
    "layout/leaf": `${header}import layout from "../route.js";\n\nexport default defineRoute("leaf", { parent: layout });\n`,
  };
}

const leafCopy = "./routes/layout/leaf/route.generated.js";

function reaches(chain) {
  return new RegExp(
    `layout[\\\\/]route\\.ts:2:\\d+: Route copy import reaches a generated route module: ${chain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\. Import a destination\\.generated\\.js for URLs, or make (\\S+) \`import type\` if it only needs types\\.$`,
  );
}

test("route copies: imports that reach a route copy, by edge kind", async () => {
  const project = await copyProject();
  const routes = layoutRoutes();
  const settings = (helper, compilerOptions) => ({
    componentless: ["layout"],
    files: { "src/helper.ts": helper },
    compilerOptions,
  });
  const leaf = "src/routes/layout/leaf/route.generated.ts";
  const value = `src/routes/layout/route.ts:2 (value import) → src/helper.ts:1 (value import) → ${leaf}`;

  // A value import, used as a value or only as a type, is an edge; the message names it.
  for (const helper of [
    `import { route } from "${leafCopy}";\nexport const guard = () => route !== undefined;\n`,
    `import { route } from "${leafCopy}";\nexport type Leaf = typeof route;\nexport const guard = () => true;\n`,
  ]) {
    const error = await project.analyze(routes, settings(helper)).then(
      () => assert.fail("accepted"),
      (reason) => reason,
    );

    assert.match(error.message, reaches(value));
    assert.equal(error.message.match(reaches(value))[1], "src/helper.ts:1");
  }

  // `import type` is erased; so is an inline type specifier without verbatimModuleSyntax.
  const typeOnly = `import type { route } from "${leafCopy}";\nexport type Leaf = typeof route;\nexport const guard = () => true;\n`;
  const inline = `import { type route } from "${leafCopy}";\nexport type Leaf = typeof route;\nexport const guard = () => true;\n`;

  await project.analyze(routes, settings(typeOnly));
  await project.analyze(routes, settings(inline));
  await assert.rejects(
    project.analyze(routes, settings(inline, { verbatimModuleSyntax: true })),
    reaches(
      `src/routes/layout/route.ts:2 (value import) → src/helper.ts:1 (type-specifier import under verbatimModuleSyntax) → ${leaf}`,
    ),
  );

  // The same through a barrel's `export { type … } from`.
  const barrel = {
    componentless: ["layout"],
    files: {
      "src/helper.ts":
        'import * as barrel from "./barrel.js";\nexport const guard = () => barrel !== undefined;\n',
      "src/barrel.ts": `export { type route } from "${leafCopy}";\n`,
    },
  };

  await project.analyze(routes, barrel);
  await assert.rejects(
    project.analyze(routes, { ...barrel, compilerOptions: { verbatimModuleSyntax: true } }),
    reaches(
      `src/routes/layout/route.ts:2 (value import) → src/helper.ts:1 (value import) → src/barrel.ts:1 (type-specifier import under verbatimModuleSyntax) → ${leaf}`,
    ),
  );

  // Synchronous CommonJS forms are edges; a dynamic import is deferred.
  await assert.rejects(
    project.analyze(
      routes,
      settings(
        `import leaf = require("${leafCopy}");\nexport const guard = () => leaf !== undefined;\n`,
        { module: "Preserve" },
      ),
    ),
    reaches(`src/routes/layout/route.ts:2 (value import) → src/helper.ts:1 (import =) → ${leaf}`),
  );
  await assert.rejects(
    project.analyze(
      routes,
      settings(
        `declare const require: (id: string) => { route: unknown };\nconst leaf = require("${leafCopy}").route;\nexport const guard = () => leaf !== undefined;\n`,
      ),
    ),
    reaches(`src/routes/layout/route.ts:2 (value import) → src/helper.ts:2 (require) → ${leaf}`),
  );
  await project.analyze(
    routes,
    settings(
      `export const guard = async () => (await import("${leafCopy}")).route !== undefined;\n`,
    ),
  );

  // A declaration importing its own route copy.
  await assert.rejects(
    project.analyze(
      {
        ...routes,
        layout: routes.layout.replace('"../../helper.js"', '"./route.generated.js"'),
      },
      { componentless: ["layout"] },
    ),
    reaches(`src/routes/layout/route.ts:2 (value import) → src/routes/layout/route.generated.ts`),
  );
});

test("route copies: helpers in every runtime format TypeScript resolves are walked", async () => {
  const project = await copyProject();
  const leaf = "src/routes/layout/leaf/route.generated.ts";
  const require = `require("${leafCopy}")`;
  const cases = [
    {
      name: "cjs + d.cts",
      helper: "../../helper.cjs",
      files: {
        "src/helper.cjs": `const leaf = ${require}.route;\nexports.guard = () => Boolean(leaf);\n`,
        "src/helper.d.cts": "export declare const guard: () => boolean;\n",
      },
      hop: "src/helper.cjs:1 (require)",
      allowJs: [false, true],
    },
    {
      name: "cjs without a sidecar",
      helper: "../../helper.cjs",
      files: {
        "src/helper.cjs": `const leaf = ${require}.route;\nexports.guard = () => Boolean(leaf);\n`,
      },
      hop: "src/helper.cjs:1 (require)",
    },
    {
      name: "mts",
      helper: "../../helper.mjs",
      files: {
        "src/helper.mts": `import { route } from "${leafCopy}";\nexport const guard = (): boolean => Boolean(route);\n`,
      },
      hop: "src/helper.mts:1 (value import)",
    },
    {
      name: "cts with import =",
      helper: "../../helper.cjs",
      files: {
        "src/helper.cts": `import leaf = require("${leafCopy}");\nexport const guard = (): boolean => Boolean(leaf.route);\n`,
      },
      hop: "src/helper.cts:1 (import =)",
    },
    {
      name: "cts with a literal require",
      helper: "../../helper.cjs",
      files: {
        "src/helper.cts": `declare const require: (id: string) => any;\nconst leaf = ${require}.route;\nexport const guard = (): boolean => Boolean(leaf);\n`,
      },
      hop: "src/helper.cts:2 (require)",
    },
    {
      name: "js + d.ts",
      helper: "../../helper.js",
      files: {
        "src/helper.js": `import { route } from "${leafCopy}";\nexport const guard = () => Boolean(route);\n`,
        "src/helper.d.ts": "export declare const guard: () => boolean;\n",
      },
      hop: "src/helper.js:1 (value import)",
    },
    {
      name: "mjs + d.mts",
      helper: "../../helper.mjs",
      files: {
        "src/helper.mjs": `import { route } from "${leafCopy}";\nexport const guard = () => Boolean(route);\n`,
        "src/helper.d.mts": "export declare const guard: () => boolean;\n",
      },
      hop: "src/helper.mjs:1 (value import)",
    },
  ];

  for (const testCase of cases) {
    for (const module of ["ESNext", "Preserve"]) {
      for (const allowJs of testCase.allowJs ?? [false]) {
        await assert.rejects(
          project.analyze(layoutRoutes(testCase.helper), {
            componentless: ["layout"],
            files: testCase.files,
            compilerOptions: { module, allowJs },
          }),
          reaches(`src/routes/layout/route.ts:2 (value import) → ${testCase.hop} → ${leaf}`),
          `${testCase.name}, ${module}, allowJs ${allowJs}`,
        );
      }
    }
  }
});

test("route copies: runtime files the program doesn't hold are bound by the import rule", async () => {
  const project = await extensionProject();
  const header = 'import { defineRoute } from "@fixture/route-extension";\n';
  // B's server-only context step and its server import are stripped from B's copies; a
  // helper importing authored B would still run them in the browser.
  const b = `${header}import { db } from "../../lib/db.server.js";\n\nexport default defineRoute("b", {}).context(() => ({ secret: db }));\n`;
  const a = (helper) =>
    `${header}import { label } from ${JSON.stringify(helper)};\n\nexport default defineRoute("a", {}).title(label);\n`;
  const rule = (importer, line, column, specifier, destination) =>
    `src${sep}lib${sep}${importer}:${line}:${column}: Import of a route declaration: ${specifier}. Import its destination from ${destination} instead.`;
  // allowJs stays off, so neither helper.js nor helper.cjs is a program file: their
  // declaration files are, and the runtime files run behind them.
  const cases = [
    {
      name: "helper.js behind helper.d.ts imports another route",
      helper: "../../lib/helper.js",
      files: {
        "src/lib/helper.js":
          'import route from "../routes/b/route.js";\nexport const label = route.path;\n',
        "src/lib/helper.d.ts": "export declare const label: string;\n",
      },
      expected: rule(
        "helper.js",
        1,
        19,
        "../routes/b/route.js",
        "../routes/b/destination.generated.js",
      ),
    },
    {
      name: "helper.js behind helper.d.ts imports its own importer",
      helper: "../../lib/helper.js",
      files: {
        "src/lib/helper.js":
          'import route from "../routes/a/route.js";\nexport const label = String(route);\n',
        "src/lib/helper.d.ts": "export declare const label: string;\n",
      },
      expected: rule(
        "helper.js",
        1,
        19,
        "../routes/a/route.js",
        "../routes/a/destination.generated.js",
      ),
    },
    {
      name: "helper.cjs behind helper.d.cts, through a second runtime file",
      helper: "../../lib/helper.cjs",
      files: {
        "src/lib/helper.cjs":
          'const inner = require("./inner.cjs");\nexports.label = inner.label;\n',
        "src/lib/inner.cjs":
          'const route = require("../routes/b/route.js");\nexports.label = route.default.path;\n',
        "src/lib/helper.d.cts": "export declare const label: string;\n",
      },
      expected: rule(
        "inner.cjs",
        1,
        23,
        "../routes/b/route.js",
        "../routes/b/destination.generated.js",
      ),
    },
  ];

  async function files(extra) {
    await rm(resolve(project.root, "src/lib"), { recursive: true, force: true });
    await project.write("src/lib/db.server.ts", 'export const db = { name: "db" };\n');

    for (const [path, text] of Object.entries(extra)) {
      await project.write(path, text);
    }
  }

  // The same layout without the route import generates.
  await files({
    "src/lib/helper.js": 'export const label = "a";\n',
    "src/lib/helper.d.ts": "export declare const label: string;\n",
  });
  await project.analyze({ a: a("../../lib/helper.js"), b });

  for (const testCase of cases) {
    await files(testCase.files);
    await assert.rejects(project.analyze({ a: a(testCase.helper), b }), (error) => {
      assert.ok(error.message.endsWith(testCase.expected), `${testCase.name}: ${error.message}`);

      return true;
    });
  }
});

test("route copies: an import of a deleted route's generated destination is refused", async () => {
  const project = await filesystemProject();

  await project.page("a");
  await project.page("b");
  await project.generate();
  await rm(resolve(project.root, "src/routes/a"), { recursive: true });
  await project.write(
    "src/app.ts",
    'export { destination } from "./routes/a/destination.generated.js";\n',
  );
  await assert.rejects(
    project.generate(),
    /Generated import is not a retained owned target: \.\/routes\/a\/destination\.generated\.js/,
  );
});

test("route copies: a resolved runtime file reached through a preserved symbolic link is refused", async () => {
  const project = await filesystemProject();
  const tsconfig = JSON.parse(await project.read("tsconfig.json"));

  tsconfig.compilerOptions.preserveSymlinks = true;
  await project.write("tsconfig.json", JSON.stringify(tsconfig));
  await project.write("real/helper.js", "export const helper = 1;\n");
  await mkdir(resolve(project.root, "lib"), { recursive: true });
  await symlink(resolve(project.root, "real/helper.js"), resolve(project.root, "lib/helper.js"));
  await project.write(
    "src/routes/items/page.ts",
    'import { Component } from "@angular/core";\nimport "../../../lib/helper.js";\n\n@Component({ template: "items" })\nexport default class Page {}\n',
  );
  await assert.rejects(
    project.generate(),
    /Unsafe source\/output symbolic link: .*lib[\\/]helper\.js$/,
  );
});

test("route copies: URL fact modules reach no generated file; copies import no server module", async () => {
  const project = await copyProject();
  const header = 'import { defineRoute } from "@loozo/angular-router";\n';
  const home = `${header}\nexport default defineRoute("", {});\n`;
  const item = `${header}import { id } from "../../../codecs.js";\n\nexport default defineRoute("item/$id", { params: { id } });\n`;
  const homeDestination = "./routes/+home/destination.generated.js";
  const codecs = (body) => ({
    files: {
      "src/codecs.ts": `import { numberParam } from "@loozo/angular-router";\n${body}export const id = numberParam;\n`,
      "src/helper.ts": `import { destination } from "${homeDestination}";\nexport const home = destination;\n`,
    },
  });
  const reachesFile = (chain) =>
    new RegExp(
      `item[\\\\/]\\$id[\\\\/]route\\.ts:2:\\d+: URL facts import reaches a generated file: ${chain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\. URL fact modules may import only packages and other non-generated modules; make \\S+ \`import type\` if it only needs types\\.$`,
    );
  const routes = { "+home": home, "item/$id": item };

  await project.analyze(routes, codecs(""));

  for (const [body, chain] of [
    [
      `import { destination } from "${homeDestination}";\nvoid destination;\n`,
      "src/codecs.ts:2 (value import) → src/routes/+home/destination.generated.ts",
    ],
    [
      'import { home } from "./helper.js";\nvoid home;\n',
      "src/codecs.ts:2 (value import) → src/helper.ts:1 (value import) → src/routes/+home/destination.generated.ts",
    ],
    [
      `declare const require: (id: string) => unknown;\nrequire("${homeDestination}");\n`,
      "src/codecs.ts:3 (require) → src/routes/+home/destination.generated.ts",
    ],
  ]) {
    await assert.rejects(
      project.analyze(routes, codecs(body)),
      reachesFile(`src/routes/item/$id/route.ts:2 (value import) → ${chain}`),
    );
  }

  const server = {
    files: {
      "src/db.server.ts":
        'export interface Db {\n  name: string;\n}\nexport const db: Db = { name: "db" };\n',
      "src/node.d.ts": 'declare module "node:path" {\n  export const sep: string;\n}\n',
    },
  };
  const rejected = (specifier) =>
    new RegExp(
      `x[\\\\/]route\\.ts:2:\\d+: Browser route copy imports a server module: ${specifier.replaceAll(".", "\\.")}\\. Use \`import type\` for types\\.$`,
    );

  for (const [imports, step] of [
    ['import "../../db.server.js";\n', ""],
    ['import { db } from "../../db.server.js";\n', ""],
    ['import { db } from "../../db.server.js";\n', ".title(() => db.name)"],
  ]) {
    await assert.rejects(
      project.analyze(
        { x: `${header}${imports}\nexport default defineRoute("x", {})${step};\n` },
        server,
      ),
      rejected("../../db.server.js"),
    );
  }

  await assert.rejects(
    project.analyze(
      {
        x: `${header}import { sep } from "node:path";\n\nexport default defineRoute("x", {}).title(sep);\n`,
      },
      server,
    ),
    rejected("node:path"),
  );

  // Types are erased.
  await project.analyze(
    {
      x: `${header}import type { Db } from "../../db.server.js";\n\nexport default defineRoute("x", {}).title((): Db["name"] => "x");\n`,
    },
    server,
  );
});

test("route copies: '..' destinations come from the winner's destination file", async () => {
  const project = await copyProject();
  const header = 'import { defineRoute, stringParam } from "@loozo/angular-router";\n';
  const result = await project.analyze(
    {
      "+home": `${header}\nexport default defineRoute("", {});\n`,
      "docs/$segments[]": `${header}\nexport default defineRoute("docs/$segments[]", { params: { segments: stringParam } });\n`,
      scope: `${header}\nexport default defineRoute("scope", {});\n`,
      "scope/+terminal": `${header}import scope from "../route.js";\nimport { destination as x } from "../x/destination.generated.js";\n\nexport default defineRoute("", { parent: scope }).redirect({ to: x, search: { mode: "drop" }, fragment: { mode: "drop" } });\n`,
      "scope/x": `${header}import scope from "../route.js";\n\nexport default defineRoute("x", { parent: scope });\n`,
    },
    { componentless: ["scope", "scope/+terminal"] },
  );
  const shared = result.desired.get(resolve(project.root, "generated/routes.generated.ts"));

  // A catchall origin's ".." is the root; a redirect source can be the winner.
  assert.match(
    result.copy("docs/$segments[]", "route"),
    /import \{ destination as routegen\$up \} from "\.\.\/\.\.\/\+home\/destination\.generated\.js";/,
  );
  assert.match(
    result.copy("scope/x", "route"),
    /import \{ destination as routegen\$up \} from "\.\.\/\+terminal\/destination\.generated\.js";/,
  );
  // The record carries its winner, and RouteTypes types it.
  assert.match(
    shared,
    /"src\/routes\/scope\/x\/route\.ts": \{ schema: RouteSchema<typeof route_scope_x_route>; up: typeof destination_scope__terminal_route \};/,
  );
  // The record sits in scope's children table, which value-imports the winner's destination.
  const children = result.desired.get(
    resolve(project.root, "src/routes/scope/children.generated.ts"),
  );

  assert.match(
    children,
    /path: "x",\n\.\.\.record\(destination_scope_x_route, destination_scope__terminal_route\),/,
  );
  assert.match(
    children,
    /^import \{ destination as destination_scope__terminal_route \} from "\.\/\+terminal\/destination\.generated\.js";$/m,
  );

  // Without a root, top-level origins have no winner: no "..", and RouteTypes has no up.
  const rootless = await project.analyze({
    a: `${header}\nexport default defineRoute("a", {});\n`,
  });
  const copy = rootless.copy("a", "route");

  assert.doesNotMatch(copy, /routegen\$up/);
  assert.match(
    copy,
    /function routegen\$injectRoute\(\): routegen\$Handle<typeof routegen\$route> \{ return routegen\$injectGeneratedRoute\(routegen\$route\); \}/,
  );
  assert.match(
    rootless.desired.get(resolve(project.root, "generated/routes.generated.ts")),
    /"src\/routes\/a\/route\.ts": \{ schema: RouteSchema<typeof route_a_route> \};/,
  );
  assert.match(
    rootless.desired.get(resolve(project.root, "generated/routes.generated.ts")),
    /\.\.\.record\(destination_a_route\),/,
  );
});

test("route copies: a new root winner rewrites only its pair, routes.generated.ts and the top-level copies", async () => {
  const project = await copyProject();
  const header = 'import { defineRoute } from "@loozo/angular-router";\n';
  const routes = {
    a: `${header}\nexport default defineRoute("a", {});\n`,
    "a/b": `${header}import a from "../route.js";\n\nexport default defineRoute("b", { parent: a });\n`,
    c: `${header}\nexport default defineRoute("c", {});\n`,
  };
  const { readdir } = await import("node:fs/promises");

  async function snapshot() {
    const files = new Map();

    for (const directory of ["src", "generated"]) {
      for (const entry of await readdir(resolve(project.root, directory), {
        recursive: true,
        withFileTypes: true,
      })) {
        if (entry.isFile() && entry.name.endsWith(".generated.ts")) {
          const path = resolve(entry.parentPath, entry.name);

          files.set(
            path
              .slice(project.root.length + 1)
              .split("\\")
              .join("/"),
            await readFile(path, "utf8"),
          );
        }
      }
    }

    return files;
  }

  await project.author(routes);
  await project.generate();

  const first = await snapshot();

  await project.write(
    "src/routes/+home/route.ts",
    `${header}\nexport default defineRoute("", {});\n`,
  );
  await project.write("src/routes/+home/page.ts", componentPage("home"));
  await project.generate();

  const second = await snapshot();
  const changed = [];

  for (const [path, bytes] of second) {
    if (first.get(path) !== bytes) {
      changed.push(path);
    }
  }

  assert.deepEqual(
    changed.sort((a, b) => Number(a > b) - Number(a < b)),
    [
      "generated/routes.generated.ts",
      "src/routes/+home/destination.generated.ts",
      "src/routes/+home/route.generated.ts",
      "src/routes/a/route.generated.ts",
      "src/routes/c/route.generated.ts",
    ],
  );

  await rm(resolve(project.root, "src/routes/+home"), { recursive: true });
  await project.generate();
  assert.deepEqual(await snapshot(), first);
});

test("route copies: ownership of the per-route pair", async () => {
  const project = await copyProject();
  const header = 'import { defineRoute } from "@loozo/angular-router";\n';
  const routes = {
    a: `${header}\nexport default defineRoute("a", {});\n`,
    b: `${header}\nexport default defineRoute("b", {});\n`,
  };
  const exists = (path) =>
    stat(resolve(project.root, path)).then(
      () => true,
      () => false,
    );

  await project.author(routes);
  await project.generate();
  assert.equal(await exists("src/routes/b/destination.generated.ts"), true);

  // A declaration that goes takes its pair with it.
  await rm(resolve(project.root, "src/routes/b/route.ts"));
  await rm(resolve(project.root, "src/routes/b/page.ts"));
  await project.generate();
  assert.equal(await exists("src/routes/b/destination.generated.ts"), false);
  assert.equal(await exists("src/routes/b/route.generated.ts"), false);

  // An unmarked file in the pair's place, or one marked on its first line (the old facade
  // shape), is not owned.
  for (const [name, bytes] of [
    ["destination.generated.ts", "export const destination = {};\n"],
    ["route.generated.ts", `${markerOf.route}\nexport const route = {};\n`],
  ]) {
    await project.author(routes, { files: { [`src/routes/b/${name}`]: bytes } });
    await assert.rejects(
      project.generate(),
      new RegExp(`Unmarked generated-output collision: .*b[\\\\/]${name.replaceAll(".", "\\.")}$`),
    );
  }

  // An ancestor pruned by redirect hoisting keeps its pair: the redirect source's copies
  // import it.
  const pruned = await project.analyze(
    {
      t: `${header}\nexport default defineRoute("t", {});\n`,
      p: `${header}\nexport default defineRoute("p", {});\n`,
      "p/old": `${header}import p from "../route.js";\nimport { destination as t } from "../../t/destination.generated.js";\n\nexport default defineRoute("old", { parent: p }).redirect({ to: t, search: { mode: "drop" }, fragment: { mode: "drop" } });\n`,
    },
    { componentless: ["p", "p/old"] },
  );

  assert.equal(pruned.sources.declarations.find((d) => d.path === "p").retained, false);
  assert.ok(pruned.copy("p", "destination"));
  assert.ok(pruned.copy("p", "route"));
  assert.doesNotMatch(
    pruned.desired.get(resolve(project.root, "generated/routes.generated.ts")),
    /src\/routes\/p\/route\.ts|destination_p_route\b/,
  );
});

// Route children tables: every route with a retained child loads their records lazily.

const childrenMarker = "// @loozo/angular-router routegen: owned children.generated.ts";

function importLines(text) {
  return text.split("\n").filter((line) => line.startsWith("import "));
}

function recordPaths(text) {
  const table = text.slice(text.indexOf("export const routes: Routes = ["));

  return [
    ...table.matchAll(
      /^(?:export const routes: Routes = \[|,\n)?\{ (?:\.\.\.nativeOptions\([^)]*\),\n)?path: ("[^"]*")/gm,
    ),
  ].map((match) => JSON.parse(match[1]));
}

test("route children: each route with retained children keeps its record and loads theirs from its children table", async () => {
  const project = await copyProject();
  const header = 'import { defineRoute, numberParam, stringParam } from "@loozo/angular-router";\n';
  const child = (from) => `${header}import parent from "${from}";\n`;
  const result = await project.analyze(
    {
      "+home": `${header}\nexport default defineRoute("", {});\n`,
      // A static root with native options and callbacks.
      shell: `${header}\nexport default defineRoute("shell", {}).canMatch([() => true]).canActivateChild([() => true]).providers([]).data({ a: 1 });\n`,
      // A terminal empty-path child is the canonical /shell: a ".." winner inside the group.
      "shell/+index": `${child("../route.js")}\nexport default defineRoute("", { parent });\n`,
      // An error component is the docs record's only native option.
      "shell/docs/$slug": `${child("../../route.js")}import { DocsError } from "./error.js";\n\nexport default defineRoute("docs/$slug", { parent, params: { slug: stringParam } }).errorComponent(DocsError);\n`,
      "shell/native": `${child("../route.js")}\nexport default defineRoute("native", { parent }).providers([]).data({ b: 2 });\n`,
      "shell/$rest[]": `${child("../route.js")}\nexport default defineRoute("$rest[]", { parent, params: { rest: stringParam } });\n`,
      // A param root; its child's ".." winner is the root, outside the children table.
      "teams/$teamId": `${header}\nexport default defineRoute("teams/$teamId", { params: { teamId: numberParam } });\n`,
      "teams/$teamId/items/$id": `${child("../../route.js")}\nexport default defineRoute("items/$id", { parent, params: { id: numberParam } });\n`,
      // Three nested levels, two of them pathless (the Launch example's shape).
      a: `${header}\nexport default defineRoute("a", {});\n`,
      "a/+b": `${child("../route.js")}\nexport default defineRoute("", { parent });\n`,
      "a/+b/+c": `${child("../route.js")}\nexport default defineRoute("", { parent });\n`,
      "a/+b/+c/leaf": `${child("../route.js")}\nexport default defineRoute("leaf", { parent });\n`,
      // A page whose only children are redirects stays a plain record. Its error component is
      // its only native option.
      plain: `${header}import { PlainError } from "./error.js";\n\nexport default defineRoute("plain", {}).errorComponent(PlainError);\n`,
      "plain/old": `${child("../route.js")}import { destination as to } from "../../+home/destination.generated.js";\n\nexport default defineRoute("old", { parent }).redirect({ to, search: { mode: "drop" }, fragment: { mode: "drop" } });\n`,
      // A page-less parent of redirects alone is pruned and emits nothing.
      legacy: `${header}\nexport default defineRoute("legacy", {});\n`,
      "legacy/x": `${child("../route.js")}import { destination as to } from "../../plain/destination.generated.js";\n\nexport default defineRoute("x", { parent }).redirect({ to, search: { mode: "drop" }, fragment: { mode: "drop" } });\n`,
      // A top-level redirect keeps reading its copy eagerly.
      old: `${header}import { destination as to } from "../plain/destination.generated.js";\n\nexport default defineRoute("old", {}).redirect({ to, search: { mode: "drop" }, fragment: { mode: "drop" } });\n`,
    },
    {
      componentless: ["a/+b", "a/+b/+c", "plain/old", "legacy", "legacy/x", "old"],
      files: {
        "src/routes/plain/error.ts": errorComponentModule("PlainError"),
        "src/routes/shell/docs/$slug/error.ts": errorComponentModule("DocsError"),
      },
    },
  );
  const read = (path) => result.desired.get(resolve(project.root, path));
  const routes = read("generated/routes.generated.ts");
  const children = [...result.desired.keys()]
    .filter((path) => path.endsWith(`${sep}children.generated.ts`))
    .map((path) =>
      path
        .slice(project.root.length + 1)
        .split(sep)
        .join("/"),
    )
    .sort();

  assert.deepEqual(children, [
    "src/routes/a/+b/+c/children.generated.ts",
    "src/routes/a/+b/children.generated.ts",
    "src/routes/a/children.generated.ts",
    "src/routes/shell/children.generated.ts",
    "src/routes/teams/$teamId/children.generated.ts",
  ]);

  // The global table: top-level records and every hoisted redirect, in today's order.
  assert.deepEqual(recordPaths(routes), [
    "legacy/x",
    "old",
    "plain/old",
    "",
    "a",
    "plain",
    "shell",
    "teams/:teamId",
  ]);
  assert.match(
    routes,
    /\{ \.\.\.nativeOptions\(route_shell_route\),\npath: "shell",\n\.\.\.record\(destination_shell_route, destination__home_route\),\n\.\.\.callbacks\(route_shell_route\),\nloadComponent: [^\n]+import\("\.\.\/src\/routes\/shell\/page"\),\nloadChildren: \(\): ReturnType<NonNullable<Routes\[number\]\["loadChildren"\]>> => import\("\.\.\/src\/routes\/shell\/children\.generated\.js"\)\.then\(\(m\) => m\.routes\) \}/,
  );
  assert.match(
    routes,
    /path: "teams\/:teamId",\n[^]*?loadChildren: [^\n]+import\("\.\.\/src\/routes\/teams\/\$teamId\/children\.generated\.js"\)/,
  );
  assert.match(
    routes,
    /\{ \.\.\.nativeOptions\(route_plain_route\),\npath: "plain",\n\.\.\.record\(destination_plain_route, destination__home_route\),\nloadComponent: [^\n]+ \}/,
  );

  // The route copies keep the error component's step and import.
  for (const [directory, name] of [
    ["plain", "PlainError"],
    ["shell/docs/$slug", "DocsError"],
  ]) {
    const copy = result.copy(directory, "route");

    assert.ok(copy.includes(`import { ${name} } from "./error.js";`), directory);
    assert.ok(copy.includes(`.errorComponent(${name})`), directory);
  }
  assert.doesNotMatch(routes, /path: "legacy",/);
  assert.match(
    routes,
    /path: "plain\/old",\npathMatch: 'full',\n\.\.\.record\(destination_plain_old_route\),\nredirectTo: lazyRedirect\(\(\) => import\("\.\.\/src\/routes\/plain\/old\/route\.generated\.js"\)\) \}/,
  );
  assert.match(
    routes,
    /path: "legacy\/x",\npathMatch: 'full',\n\.\.\.record\(destination_legacy_x_route\),\nredirectTo: lazyRedirect\(\(\) => import\("\.\.\/src\/routes\/legacy\/x\/route\.generated\.js"\)\) \}/,
  );
  assert.match(
    routes,
    /path: "old",\npathMatch: 'full',\n\.\.\.record\(destination_old_route\),\nredirectTo: redirect\(route_old_route\) \}/,
  );

  // Its value imports are exactly the top-level records' own copies and destinations, their
  // ".." winners' and the redirect sources'. Everything else only types RouteTypes.
  const values = importLines(routes).filter((line) => !line.startsWith("import type "));

  assert.deepEqual(values.slice(1).sort(), [
    'import { destination as destination__home_route } from "../src/routes/+home/destination.generated.js";',
    'import { destination as destination_a_route } from "../src/routes/a/destination.generated.js";',
    'import { destination as destination_legacy_x_route } from "../src/routes/legacy/x/destination.generated.js";',
    'import { destination as destination_old_route } from "../src/routes/old/destination.generated.js";',
    'import { destination as destination_plain_old_route } from "../src/routes/plain/old/destination.generated.js";',
    'import { destination as destination_plain_route } from "../src/routes/plain/destination.generated.js";',
    'import { destination as destination_shell_route } from "../src/routes/shell/destination.generated.js";',
    'import { destination as destination_teams_$teamId_route } from "../src/routes/teams/$teamId/destination.generated.js";',
    'import { route as route_old_route } from "../src/routes/old/route.generated.js";',
    'import { route as route_plain_route } from "../src/routes/plain/route.generated.js";',
    'import { route as route_shell_route } from "../src/routes/shell/route.generated.js";',
    'import { route as route_teams_$teamId_route } from "../src/routes/teams/$teamId/route.generated.js";',
  ]);
  assert.equal(
    values[0],
    "import { record, nativeOptions, callbacks, redirect, lazyRedirect, injectGeneratedActiveRoute, type RouteSchema, type ActiveRoute as GeneratedActiveRoute, type ActiveHandle as GeneratedActiveHandle } from '@loozo/angular-router/_generated';",
  );
  // A winner only RouteTypes names is a type import.
  assert.ok(
    importLines(routes).includes(
      'import type { destination as destination_shell__index_route } from "../src/routes/shell/+index/destination.generated.js";',
    ),
  );
  assert.match(
    routes,
    /^"src\/routes\/shell\/docs\/\$slug\/route\.ts": \{ schema: RouteSchema<typeof route_shell_docs_\$slug_route>; up: typeof destination_shell__index_route \};$/m,
  );

  // A children table: its route's children in today's sibling order, catchalls last, with the
  // helpers and value imports its own records read, the ".." winners' wherever they live.
  const shell = read("src/routes/shell/children.generated.ts");

  assert.equal(shell.split("\n", 1)[0], childrenMarker);
  assert.deepEqual(recordPaths(shell), ["", "docs/:slug", "native", "**"]);
  assert.deepEqual(importLines(shell), [
    "import type { Routes } from '@angular/router';",
    "import { record, nativeOptions, callbacks } from '@loozo/angular-router/_generated';",
    ...importLines(shell).slice(2, 5),
    // Destinations in id order, as in routes.generated.ts.
    'import { destination as destination__home_route } from "../+home/destination.generated.js";',
    'import { destination as destination_shell__index_route } from "./+index/destination.generated.js";',
    'import { destination as destination_shell_$rest___route } from "./$rest[]/destination.generated.js";',
    'import { destination as destination_shell_docs_$slug_route } from "./docs/$slug/destination.generated.js";',
    'import { destination as destination_shell_native_route } from "./native/destination.generated.js";',
  ]);
  assert.deepEqual(importLines(shell).slice(2, 5).sort(), [
    'import { route as route_shell_$rest___route } from "./$rest[]/route.generated.js";',
    'import { route as route_shell_docs_$slug_route } from "./docs/$slug/route.generated.js";',
    'import { route as route_shell_native_route } from "./native/route.generated.js";',
  ]);
  assert.match(
    shell,
    /The generated records of the children of src\/routes\/shell\/route\.ts, loaded lazily by its record\./,
  );
  assert.match(
    shell,
    /\{ \.\.\.nativeOptions\(route_shell_docs_\$slug_route\),\npath: "docs\/:slug",\n/,
  );
  assert.match(
    shell,
    /\{ \.\.\.nativeOptions\(route_shell_native_route\),\npath: "native",\n\.\.\.record\(destination_shell_native_route, destination_shell__index_route\),\nloadComponent: [^\n]+import\("\.\/native\/page"\) \}/,
  );
  assert.match(
    shell,
    /path: "\*\*",\n\.\.\.record\(destination_shell_\$rest___route, destination_shell__index_route\),\n\.\.\.callbacks\(route_shell_\$rest___route\),/,
  );

  // The param root's child reads the root's destination, which lives outside the table.
  const team = read("src/routes/teams/$teamId/children.generated.ts");

  assert.deepEqual(recordPaths(team), ["items/:id"]);
  assert.ok(
    importLines(team).includes(
      'import { destination as destination_teams_$teamId_route } from "./destination.generated.js";',
    ),
  );

  // Nested groups: each nested root's record sits in its parent's table with its own loader.
  assert.match(
    read("src/routes/a/children.generated.ts"),
    /^export const routes: Routes = \[\{ path: "",\n\.\.\.record\(destination_a__b_route[^\n]*\),\nloadChildren: [^\n]+import\("\.\/\+b\/children\.generated\.js"\)\.then\(\(m\) => m\.routes\) \}\];$/m,
  );
  assert.match(
    read("src/routes/a/+b/children.generated.ts"),
    /^export const routes: Routes = \[\{ path: "",\n\.\.\.record\(destination_a__b__c_route[^\n]*\),\nloadChildren: [^\n]+import\("\.\/\+c\/children\.generated\.js"\)\.then\(\(m\) => m\.routes\) \}\];$/m,
  );
  assert.deepEqual(recordPaths(read("src/routes/a/+b/+c/children.generated.ts")), ["leaf"]);

  // No table imports a route declaration; nothing eager value-imports a descendant's copy.
  for (const line of values) {
    assert.doesNotMatch(
      line,
      /shell\/(?:native|docs|\$rest|\+index)|items\/\$id|plain\/old\/route|legacy\/x\/route/,
    );
  }
});

test("route children: a tree without parents has no children table and no loader", async () => {
  const project = await copyProject();
  const header = 'import { defineRoute } from "@loozo/angular-router";\n';
  const result = await project.analyze(
    {
      "+home": `${header}\nexport default defineRoute("", {});\n`,
      a: `${header}\nexport default defineRoute("a", {}).title("A");\n`,
      old: `${header}import { destination as to } from "../a/destination.generated.js";\n\nexport default defineRoute("old", {}).redirect({ to, search: { mode: "drop" }, fragment: { mode: "drop" } });\n`,
    },
    { componentless: ["old"] },
  );
  const routes = result.desired.get(resolve(project.root, "generated/routes.generated.ts"));

  assert.equal(
    [...result.desired.keys()].some((path) => path.endsWith("children.generated.ts")),
    false,
  );
  assert.doesNotMatch(routes, /loadChildren|lazyRedirect/);
  assert.match(routes, /import \{ record, callbacks, redirect, injectGeneratedActiveRoute,/);
});

test("errorComponent requires a colocated page, on every page-less declaration", async () => {
  const project = await copyProject();
  const header = 'import { defineRoute, numberParam } from "@loozo/angular-router";\n';
  const child = `${header}import parent from "../route.js";\n`;
  const home = `${header}\nexport default defineRoute("", {});\n`;
  const fixtures = [
    // A componentless layout with a page-bearing child.
    {
      directory: "teams/$teamId",
      routes: (step) => ({
        "+home": home,
        "teams/$teamId": `${header}import { E } from "./error.js";\n\nexport default defineRoute("teams/$teamId", { params: { teamId: numberParam } })${step};\n`,
        "teams/$teamId/items/$id": `${header}import parent from "../../route.js";\n\nexport default defineRoute("items/$id", { parent, params: { id: numberParam } });\n`,
      }),
    },
    // A page-less parent of redirects alone, which generation later prunes.
    {
      directory: "legacy",
      routes: (step) => ({
        "+home": home,
        legacy: `${header}import { E } from "./error.js";\n\nexport default defineRoute("legacy", {})${step};\n`,
        "legacy/x": `${child}import { destination as to } from "../../+home/destination.generated.js";\n\nexport default defineRoute("x", { parent }).redirect({ to, search: { mode: "drop" }, fragment: { mode: "drop" } });\n`,
      }),
      componentless: ["legacy/x"],
    },
    // A page-less named-outlet branch root, although Angular gives it an outlet component.
    {
      directory: "chat",
      routes: (step) => ({
        "+home": home,
        chat: `${header}import { E } from "./error.js";\n\nexport default defineRoute("chat", { outlet: "chat" })${step};\n`,
        "chat/$id": `${child}\nexport default defineRoute("$id", { parent, params: { id: numberParam } });\n`,
      }),
    },
  ];

  for (const { directory, routes, componentless = [] } of fixtures) {
    const settings = {
      componentless: [directory, ...componentless],
      files: { [`src/routes/${directory}/error.ts`]: errorComponentModule("E") },
    };

    // Without the step the tree generates.
    await project.author(routes(""), settings);
    await project.generate();

    const published = await project.read("generated/routes.generated.ts");

    await project.author(routes(".errorComponent(E)"), settings);
    await assert.rejects(
      project.generate(),
      new RegExp(
        `${directory.replaceAll("$", "\\$").replaceAll("/", "[\\\\/]")}[\\\\/]route\\.ts:\\d+:\\d+: errorComponent requires a colocated page$`,
      ),
      directory,
    );
    // Preflight: nothing was published.
    assert.equal(await project.read("generated/routes.generated.ts"), published, directory);
  }
});

test("route children: a redirect with a parent can't use native options; a top-level one can", async () => {
  const project = await copyProject();
  const header = 'import { defineRoute } from "@loozo/angular-router";\n';
  const base = {
    "+home": `${header}\nexport default defineRoute("", {});\n`,
    p: `${header}\nexport default defineRoute("p", {});\n`,
    "p/q": `${header}import parent from "../route.js";\n\nexport default defineRoute("q", { parent });\n`,
  };
  const redirect = (parent, step) =>
    `${header}${parent}import { destination as to } from "${parent ? "../" : "./"}../+home/destination.generated.js";\n\nexport default defineRoute("old", ${parent ? "{ parent }" : "{}"})${step}.redirect({ to, search: { mode: "drop" }, fragment: { mode: "drop" } });\n`;

  await project.author(base);
  await project.generate();

  const routes = await project.read("generated/routes.generated.ts");

  for (const [directory, parent] of [
    ["p/old", 'import parent from "../route.js";\n'],
    ["p/q/old", 'import parent from "../route.js";\n'],
  ]) {
    for (const [step, name] of [
      [".providers([])", "providers"],
      [".data({ a: 1 })", "data"],
      ['.runGuardsAndResolvers("always")', "runGuardsAndResolvers"],
    ]) {
      const text = redirect(parent, step).replace(
        "../../+home",
        `${"../".repeat(directory.split("/").length)}+home`,
      );

      await project.author({ ...base, [directory]: text }, { componentless: [directory] });
      await assert.rejects(
        project.generate(),
        new RegExp(
          `old[\\\\/]route\\.ts:\\d+:\\d+: A redirect with a parent can't use \\.${name}: its record is hoisted into the eager table and would load its route copy$`,
        ),
      );
      // Preflight: nothing was published.
      assert.equal(await project.read("generated/routes.generated.ts"), routes);
    }
  }

  await project.author(
    { ...base, old: redirect("", ".providers([])").replace("./../+home", "../+home") },
    { componentless: ["old"] },
  );
  await project.generate();
  assert.match(
    await project.read("generated/routes.generated.ts"),
    /\{ \.\.\.nativeOptions\(route_old_route\),\npath: "old",\npathMatch: 'full',\n\.\.\.record\(destination_old_route\),\nredirectTo: redirect\(route_old_route\) \}/,
  );
});

test("route children: ownership of children tables", async () => {
  const project = await copyProject();
  const header = 'import { defineRoute } from "@loozo/angular-router";\n';
  const routes = {
    a: `${header}\nexport default defineRoute("a", {});\n`,
    "a/b": `${header}import parent from "../route.js";\n\nexport default defineRoute("b", { parent });\n`,
    c: `${header}\nexport default defineRoute("c", {});\n`,
    "c/d": `${header}import parent from "../route.js";\n\nexport default defineRoute("d", { parent });\n`,
  };
  const table = "src/routes/a/children.generated.ts";
  const exists = (path) =>
    stat(resolve(project.root, path)).then(
      () => true,
      () => false,
    );

  await project.author(routes);
  await project.generate();
  assert.equal((await project.read(table)).split("\n", 1)[0], childrenMarker);

  // A checkout with CRLF line endings is current.
  const bytes = await project.read(table);

  await writeFile(resolve(project.root, table), bytes.replaceAll("\n", "\r\n"));
  await project.generate({ check: true });
  await writeFile(resolve(project.root, table), bytes);

  // Check mode reports changed, then missing, then stale tables.
  await writeFile(resolve(project.root, table), `${bytes}// edit\n`);
  await rm(resolve(project.root, "src/routes/c/children.generated.ts"));
  await writeFile(
    resolve(project.root, "src/routes/c/d/children.generated.ts"),
    `${childrenMarker}\n`,
  );
  await assert.rejects(
    project.generate({ check: true }),
    /Generated artifacts changed:\n.*a[\\/]children\.generated\.ts\n/,
  );
  await writeFile(resolve(project.root, table), bytes);
  await assert.rejects(
    project.generate({ check: true }),
    /Generated artifacts missing:\n.*c[\\/]children\.generated\.ts\n/,
  );
  await project.generate();
  assert.equal(await exists("src/routes/c/children.generated.ts"), true);
  await writeFile(
    resolve(project.root, "src/routes/c/d/children.generated.ts"),
    `${childrenMarker}\n`,
  );
  await assert.rejects(
    project.generate({ check: true }),
    /Generated artifacts stale:\n.*d[\\/]children\.generated\.ts\n/,
  );
  await project.generate();
  assert.equal(await exists("src/routes/c/d/children.generated.ts"), false);

  // A route that loses its last child page loses its table.
  await rm(resolve(project.root, "src/routes/a/b"), { recursive: true });
  await project.generate();
  assert.equal(await exists(table), false);
  assert.doesNotMatch(await project.read("generated/routes.generated.ts"), /routes\/a\/children/);

  // So does one whose only child becomes a redirect.
  await project.author(
    {
      ...routes,
      "c/d": `${header}import parent from "../route.js";\nimport { destination as to } from "../../a/destination.generated.js";\n\nexport default defineRoute("d", { parent }).redirect({ to, search: { mode: "drop" }, fragment: { mode: "drop" } });\n`,
    },
    { componentless: ["c/d"] },
  );
  await project.generate();
  assert.equal(await exists("src/routes/c/children.generated.ts"), false);

  // An unmarked file at a table's path is not owned.
  await project.author(routes, { files: { [table]: "export const routes = [];\n" } });
  await assert.rejects(
    project.generate(),
    /Unmarked generated-output collision: .*a[\\/]children\.generated\.ts$/,
  );

  // An app import of a table generation doesn't produce fails.
  await project.author(routes, {
    files: { "src/app.ts": 'export { routes } from "./routes/b/children.generated.js";\n' },
  });
  await assert.rejects(
    project.generate(),
    /Generated import is not a retained owned target: \.\/routes\/b\/children\.generated\.js/,
  );

  // A route copy can't reach a children table: the table imports copies.
  await assert.rejects(
    project.analyze(
      {
        ...routes,
        c: `${header}import { guard } from "../../guard.js";\n\nexport default defineRoute("c", {}).canMatch([guard]);\n`,
      },
      {
        files: {
          "src/guard.ts":
            'import { routes } from "./routes/a/children.generated.js";\n\nexport const guard = () => routes.length > 0;\n',
        },
      },
    ),
    /c[\\/]route\.ts:\d+:\d+: Route copy import reaches a generated route module: src\/routes\/c\/route\.ts:\d+ \(value import\) → src\/guard\.ts:1 \(value import\) → src\/routes\/a\/children\.generated\.ts\./,
  );
});

test("route children: adding a child changes its pair, its table and RouteTypes; a first child switches its parent's record", async () => {
  const project = await copyProject();
  const header = 'import { defineRoute } from "@loozo/angular-router";\n';
  const child = (path) =>
    `${header}import parent from "../route.js";\n\nexport default defineRoute("${path}", { parent });\n`;
  const routes = {
    shell: `${header}\nexport default defineRoute("shell", {});\n`,
    "shell/a": child("a"),
    "shell/b": child("b"),
    plain: `${header}\nexport default defineRoute("plain", {});\n`,
  };
  const { readdir } = await import("node:fs/promises");

  async function snapshot() {
    const files = new Map();

    for (const directory of ["src", "generated"]) {
      for (const entry of await readdir(resolve(project.root, directory), {
        recursive: true,
        withFileTypes: true,
      })) {
        if (entry.isFile() && entry.name.endsWith(".generated.ts")) {
          const path = resolve(entry.parentPath, entry.name);

          files.set(
            path
              .slice(project.root.length + 1)
              .split(sep)
              .join("/"),
            await readFile(path, "utf8"),
          );
        }
      }
    }

    return files;
  }

  function changed(before, after) {
    return [...new Set([...before.keys(), ...after.keys()])]
      .filter((path) => before.get(path) !== after.get(path))
      .sort((a, b) => a.localeCompare(b, "en"));
  }

  const table = (text) =>
    text.slice(text.indexOf("export const routes"), text.indexOf("export type RouteTypes"));
  const valueImports = (text) =>
    importLines(text).filter((line) => !line.startsWith("import type "));

  await project.author(routes);
  await project.generate();

  const before = await snapshot();

  // An independent child: its pair, its table, and RouteTypes' type lines.
  await project.author({ ...routes, "shell/c": child("c") });
  await project.generate();

  const added = await snapshot();

  assert.deepEqual(changed(before, added), [
    "generated/routes.generated.ts",
    "src/routes/shell/c/destination.generated.ts",
    "src/routes/shell/c/route.generated.ts",
    "src/routes/shell/children.generated.ts",
  ]);
  assert.equal(
    table(added.get("generated/routes.generated.ts")),
    table(before.get("generated/routes.generated.ts")),
  );
  assert.deepEqual(
    valueImports(added.get("generated/routes.generated.ts")),
    valueImports(before.get("generated/routes.generated.ts")),
  );

  // A first child: the parent's record switches to a loader and its table appears.
  await project.author({ ...routes, "plain/x": child("x") });
  await project.generate();

  const first = await snapshot();

  assert.deepEqual(changed(before, first), [
    "generated/routes.generated.ts",
    "src/routes/plain/children.generated.ts",
    "src/routes/plain/x/destination.generated.ts",
    "src/routes/plain/x/route.generated.ts",
  ]);
  assert.match(
    first.get("generated/routes.generated.ts"),
    /path: "plain",\n[^\n]+\nloadComponent: [^\n]+,\nloadChildren: [^\n]+plain\/children\.generated\.js/,
  );

  // Removing it switches the record back and the table goes.
  await project.author(routes);
  await project.generate();
  assert.deepEqual(changed(before, await snapshot()), []);
});

test("route children: a children loader must resolve to its table even when no program file imports a table", async () => {
  const project = await copyProject();
  const header = 'import { defineRoute } from "@loozo/angular-router";\n';
  const child = (path) =>
    `${header}import parent from "../route.js";\n\nexport default defineRoute("${path}", { parent });\n`;
  // The tsconfig includes only src/: nothing it holds imports routes.generated.ts, and a clean
  // first pass has no children table on disk either.
  const routes = {
    p: `${header}\nexport default defineRoute("p", {});\n`,
    "p/q": child("q"),
    "p/q/r": child("r"),
  };
  const shadow = "export const routes = [];\n";
  const compilerOptions = { moduleSuffixes: [".browser", ""] };
  const exists = (path) =>
    stat(resolve(project.root, path)).then(
      () => true,
      () => false,
    );

  for (const [table, importer, name] of [
    [
      "src/routes/p/children.generated",
      "generated/routes.generated.ts",
      "../src/routes/p/children.generated.js",
    ],
    [
      "src/routes/p/q/children.generated",
      "src/routes/p/children.generated.ts",
      "./q/children.generated.js",
    ],
  ]) {
    await project.author(routes, {
      compilerOptions,
      files: { [`${table}.browser.ts`]: shadow },
    });
    await assert.rejects(
      project.generate(),
      (error) =>
        error.message.startsWith(`${resolve(project.root, importer)}:`) &&
        error.message.endsWith(`Lazy import does not resolve to its generated target: ${name}`),
    );
    // Preflight: nothing was published.
    assert.equal(await exists("generated/routes.generated.ts"), false);
    assert.equal(await exists("src/routes/p/children.generated.ts"), false);
    assert.equal(await exists("src/routes/p/q/children.generated.ts"), false);
  }

  // Without the shadow module the same options generate both tables.
  await project.author(routes, { compilerOptions });
  await project.generate();
  assert.equal(await exists("src/routes/p/children.generated.ts"), true);
  assert.equal(await exists("src/routes/p/q/children.generated.ts"), true);
});

// Launch's route extension shape: every contributed step is server-only, so a copy keeps
// only router steps and is typed from its declaration; Launch's descriptors add the rest.
async function launchProject() {
  const project = await extensionProject();
  const { root } = project;
  const header = 'import { defineRoute } from "@fixture/route-extension";\n';
  const asserts = `type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;
`;
  const page = (name) =>
    `import { Component } from "@angular/core";\n\n@Component({ template: "${name}" })\nexport default class Page {}\n`;
  const files = {
    "src/user.ts":
      "export interface User { id: string; name: string }\nexport interface Context { id: string }\n",
    "src/routes/app/route.ts": `${header}import { createUrl } from "@loozo/angular-router";
import type { User } from "../../user.js";
import { destination as todos } from "./area/todos/destination.generated.js";

export default defineRoute("app", {})
  .context(() => ({ user: null as User | null }))
  .remote(({ query }) => ({ session: { current: query(({ context }) => context.user) } }))
  // A parent guard importing a child's destination: the back edge.
  .canActivate([({ remote }) => createUrl(todos, {}).length > 0 && remote.session.current() !== undefined]);
`,
    "src/routes/app/page.ts": page("app"),
    // The canonical terminal of /app, so "/app" is a ".." target.
    "src/routes/app/area/index/route.ts": `${header}import parent from "../route.js";

export default defineRoute("", { parent });
`,
    "src/routes/app/area/index/page.ts": page("index"),
    // Pathless, so its children's ".." skips it to /app.
    "src/routes/app/area/route.ts": `${header}import parent from "../route.js";

export default defineRoute("", { parent }).context(({ context }) => {
  if (!context.user) {
    throw new Error("forbidden");
  }

  return { user: context.user };
});
`,
    // Keeps an authored \`Context\` that the copy's \`Context\` export must not collide with.
    "src/routes/app/area/todos/route.ts": `${header}import type { Context, User } from "../../../../user.js";
import parent from "../route.js";
${asserts}
export default defineRoute("todos", { parent })
  .remote(({ query }) => ({
    todos: {
      get: query(({ input, context }: { input: { id: string }; context: { user: User } }) => ({
        id: input.id,
        owner: context.user.id,
      })),
    },
  }))
  .resolve({
    item: ({ remote }) => {
      type OwnInput = Assert<Equal<Parameters<typeof remote.todos.get>[0], { id: string }>>;
      type OwnOutput = Assert<Equal<ReturnType<typeof remote.todos.get>, { id: string; owner: string }>>;
      type Inherited = Assert<Equal<ReturnType<typeof remote.session.current>, User | null>>;
      type NotAny = Assert<Equal<IsAny<typeof remote>, false>>;

      // @ts-expect-error the input is { id: string }
      remote.todos.get({ id: 1 });

      const authored: Context = { id: "one" };

      return remote.todos.get(authored);
    },
  })
  .canActivate([({ remote }) => remote.session.current() !== null])
  .title(({ remote }) => remote.todos.get({ id: "t" }).owner);
`,
    "src/routes/app/area/todos/page.ts": page("todos"),
    // A bare leaf: no step of its own, inherited members only.
    "src/routes/app/area/leaf/route.ts": `${header}import parent from "../route.js";

export default defineRoute("leaf", { parent });
`,
    "src/routes/app/area/leaf/page.ts": page("leaf"),
    "src/routes/old/route.ts": `${header}import { destination as leaf } from "../app/area/leaf/destination.generated.js";

export default defineRoute("old", {})
  .context(() => ({}))
  .redirect({ to: leaf, search: { mode: "drop" }, fragment: { mode: "drop" } });
`,
    "src/routes/plain/route.ts": `import { defineRoute } from "@loozo/angular-router";

export default defineRoute("plain", {}).title("Plain");
`,
    "src/routes/plain/page.ts": page("plain"),
    "src/proof.ts": `import type { Signal } from "@angular/core";
import type { User } from "./user.js";
import type { ActiveHandle } from "../generated/routes.generated.js";
import type { Context, Remote, injectRoute as todosRoute } from "./routes/app/area/todos/route.generated.js";
import type { injectRoute as leafRoute } from "./routes/app/area/leaf/route.generated.js";
import type { injectRoute as appRoute } from "./routes/app/route.generated.js";
import type { Context as OldContext } from "./routes/old/route.generated.js";
${asserts}
type Todos = ReturnType<typeof todosRoute>;
type Leaf = ReturnType<typeof leafRoute>;
type Session = { current: () => User | null };

type ExactRemote = Assert<
  Equal<Remote, { session: Session; todos: { get: (input: { id: string }) => { id: string; owner: string } } }>
>;
type NarrowedContext = Assert<Equal<Context, { user: User }>>;
type RedirectContext = Assert<Equal<OldContext, {}>>;
type TodosMember = Assert<Equal<Todos["remote"], Remote>>;
type TodosData = Assert<Equal<Todos["data"], Signal<Readonly<{ item: { id: string; owner: string } }>>>>;
type LeafMember = Assert<Equal<Leaf["remote"], { session: Session }>>;
type ActiveLeaf = Assert<Equal<ActiveHandle<"src/routes/app/area/leaf/route.ts">["remote"], Leaf["remote"]>>;
type ActiveTodos = Assert<Equal<ActiveHandle<"src/routes/app/area/todos/route.ts">["remote"], Remote>>;
type MemberNotAny = Assert<Equal<IsAny<Leaf["remote"]>, false>>;

declare const todos: Todos;
declare const leaf: Leaf;
declare const app: ReturnType<typeof appRoute>;
declare const active: ActiveHandle<"src/routes/app/area/leaf/route.ts">;

// ".." through the pathless area is app, on the local and the active handle.
todos.link({ to: ".." });
leaf.navigate({ to: "..", replaceUrl: true });
active.link({ to: ".." });
// @ts-expect-error app has no ".." winner
app.link({ to: ".." });
// @ts-expect-error a procedure no route declared
leaf.remote.todos;
`,
  };

  for (const [path, text] of Object.entries(files)) {
    await project.write(path, text);
  }

  await project.write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        // Angular's resolution: page imports are extensionless.
        module: "ESNext",
        moduleResolution: "Bundler",
        verbatimModuleSyntax: true,
        strict: true,
        skipLibCheck: false,
        experimentalDecorators: true,
        lib: ["ES2022", "DOM"],
        types: [],
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
  const declaration = (directory) =>
    sources.declarations.find(
      (entry) => entry.file === resolve(root, `src/routes/${directory}/route.ts`),
    );
  const remote = { name: "Remote", type: "RemoteOf", from: "@fixture/route-extension" };
  const context = { name: "Context", type: "ContextOf", from: "@fixture/route-extension" };
  const launch = {
    data: new Map([
      [declaration("app"), { remote: { session: ["current"] } }],
      [declaration("app/area/todos"), { remote: { todos: ["get"] } }],
    ]),
    types: [remote, context],
    members: [{ member: "remote", type: "Remote" }],
  };

  return { project, sources, declaration, launch, context };
}

function formatted(diagnostics, root) {
  return diagnostics.map(
    (diagnostic) =>
      `${diagnostic.file?.fileName.slice(root.length + 1)}: TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
  );
}

test("extension copies: typed from their declaration, with Launch's data, type exports, handle members and record stamps", async () => {
  const { project, sources, launch, context } = await launchProject();
  const { root } = project;
  const desired = emitLaunchRoutes(sources, launch);
  const validation = createValidationProgram(sources, desired, []);

  // Validation type-checks every copy: the kept callbacks' assertions hold there.
  await validateRoutes(sources, desired, validation);

  const proof = validation.program.getSourceFile(resolve(root, "src/proof.ts"));

  assert.deepEqual(formatted(ts.getPreEmitDiagnostics(validation.program, proof), root), []);

  const read = (path, map = desired) => map.get(resolve(root, path));
  const tail = (path, map) => {
    const lines = read(path, map).split("\n");

    return lines.slice(
      lines.findIndex(
        (line) =>
          line.startsWith("import type routegen$Authored") ||
          line.includes('from "@loozo/angular-router/_generated"'),
      ),
    );
  };
  const marker = "// @loozo/angular-router routegen: owned route.generated.ts";
  const injectLines = injectDoc.split("\n");

  // Seeded root on the declaration's own line, with its data.
  assert.match(
    read("src/routes/app/area/todos/route.generated.ts"),
    /\n\/\*\* This route's browser copy[^\n]* const routegen\$route = routegen\$authoredRouteOf<typeof routegen\$Authored>\(\)\(defineRoute, routegen\$destination, parent, routegen\$own\(\)\)\n/,
  );
  assert.match(
    read("src/routes/app/route.generated.ts"),
    /const routegen\$route = routegen\$authoredRouteOf<typeof routegen\$Authored>\(\)\(defineRoute, routegen\$destination, undefined, routegen\$own\(\)\)\n/,
  );
  // A `..` copy keeps its up import, type and argument, with the members as a third.
  assert.deepEqual(tail("src/routes/app/area/todos/route.generated.ts"), [
    'import type routegen$Authored from "./route.js";',
    'import { authoredRouteOf as routegen$authoredRouteOf, injectGeneratedRoute as routegen$injectGeneratedRoute, type Handle as routegen$Handle } from "@loozo/angular-router/_generated";',
    'import type { RemoteOf as routegen$t0, ContextOf as routegen$t1 } from "@fixture/route-extension";',
    'import { destination as routegen$destination } from "./destination.generated.js";',
    'import { destination as routegen$up } from "../index/destination.generated.js";',
    'function routegen$own() { return {"remote":{"todos":["get"]}}; }',
    "export { routegen$route as route };",
    "type routegen$type_Remote = routegen$t0<typeof routegen$route>;",
    "export type { routegen$type_Remote as Remote };",
    "type routegen$type_Context = routegen$t1<typeof routegen$route>;",
    "export type { routegen$type_Context as Context };",
    "type routegen$Members = { readonly remote: routegen$type_Remote };",
    ...injectLines,
    "function routegen$injectRoute(): routegen$Handle<typeof routegen$route, typeof routegen$up> & routegen$Members { return routegen$injectGeneratedRoute<typeof routegen$route, typeof routegen$up, routegen$Members>(routegen$route, routegen$up); }",
    "export { routegen$injectRoute as injectRoute };",
    marker,
    "",
  ]);
  // A bare leaf keeps routeOf, with no data, and still gets the types and members.
  assert.match(
    read("src/routes/app/area/leaf/route.generated.ts"),
    /const routegen\$route = routegen\$routeOf\(defineRoute, routegen\$destination, parent\);/,
  );
  assert.deepEqual(tail("src/routes/app/route.generated.ts").slice(-9 - injectLines.length), [
    "type routegen$type_Remote = routegen$t0<typeof routegen$route>;",
    "export type { routegen$type_Remote as Remote };",
    "type routegen$type_Context = routegen$t1<typeof routegen$route>;",
    "export type { routegen$type_Context as Context };",
    "type routegen$Members = { readonly remote: routegen$type_Remote };",
    ...injectLines,
    "function routegen$injectRoute(): routegen$Handle<typeof routegen$route> & routegen$Members { return routegen$injectGeneratedRoute<typeof routegen$route, never, routegen$Members>(routegen$route); }",
    "export { routegen$injectRoute as injectRoute };",
    marker,
    "",
  ]);
  // A redirect copy gets the type exports, but no members and no injectRoute.
  assert.deepEqual(tail("src/routes/old/route.generated.ts"), [
    'import type routegen$Authored from "./route.js";',
    'import { authoredRouteOf as routegen$authoredRouteOf } from "@loozo/angular-router/_generated";',
    'import type { RemoteOf as routegen$t0, ContextOf as routegen$t1 } from "@fixture/route-extension";',
    'import { destination as routegen$destination } from "./destination.generated.js";',
    "export { routegen$route as route };",
    "type routegen$type_Remote = routegen$t0<typeof routegen$route>;",
    "export type { routegen$type_Remote as Remote };",
    "type routegen$type_Context = routegen$t1<typeof routegen$route>;",
    "export type { routegen$type_Context as Context };",
    marker,
    "",
  ]);

  const routes = read("generated/routes.generated.ts");

  // Every non-redirect extension record is stamped and reads its copy at runtime; the
  // redirect record and the router's own route aren't.
  assert.match(
    routes,
    /import \{ record, nativeOptions\b|import \{ record, callbacks, redirect, extension, injectGeneratedActiveRoute,/,
  );
  assert.match(
    routes,
    /\nimport type \{ RemoteOf as routegen\$t0 \} from "@fixture\/route-extension";\n/,
  );

  // Each record is stamped in the table that holds it: nested records in their parent's
  // children table.
  for (const [name, table] of [
    ["app_route", "generated/routes.generated.ts"],
    ["app_area_route", "src/routes/app/children.generated.ts"],
    ["app_area_index_route", "src/routes/app/area/children.generated.ts"],
    ["app_area_todos_route", "src/routes/app/area/children.generated.ts"],
    ["app_area_leaf_route", "src/routes/app/area/children.generated.ts"],
  ]) {
    const text = read(table);

    assert.match(text, new RegExp(`\\nimport \\{ route as route_${name} \\} from`), name);
    assert.match(text, new RegExp(`\\.\\.\\.extension\\(route_${name}\\)`), name);
    assert.match(
      text,
      /\nimport \{ record, [^}]*\bextension\b[^}]*\} from '@loozo\/angular-router\/_generated';\n/,
      name,
    );
  }

  assert.match(routes, /\nimport \{ route as route_old_route \} from/);
  assert.doesNotMatch(routes, /extension\(route_old_route\)|extension\(route_plain_route\)/);
  assert.match(
    routes,
    /\n"src\/routes\/app\/area\/leaf\/route\.ts": \{ schema: RouteSchema<typeof route_app_area_leaf_route>; up: typeof destination_app_area_index_route; members: \{ readonly remote: routegen\$t0<typeof route_app_area_leaf_route> \} \};\n/,
  );
  assert.match(
    routes,
    /\n"src\/routes\/plain\/route\.ts": \{ schema: RouteSchema<typeof route_plain_route> \};\n/,
  );

  // Without descriptors, a router route's files are byte-identical; so is its record.
  const bare = emitLaunchRoutes(sources);
  const plainRecord = (text) => text.match(/\{ path: "plain",[^}]*\}/)[0];

  for (const path of [
    "src/routes/plain/route.generated.ts",
    "src/routes/plain/destination.generated.ts",
    "src/routes/app/area/todos/destination.generated.ts",
  ]) {
    assert.equal(read(path), read(path, bare), path);
  }

  assert.equal(plainRecord(routes), plainRecord(read("generated/routes.generated.ts", bare)));
  // Without descriptors an extension copy is still seeded, with no exports or members.
  assert.doesNotMatch(
    read("src/routes/app/area/todos/route.generated.ts", bare),
    /routegen\$own|export type|routegen\$Members/,
  );
  assert.match(
    read("src/routes/app/area/todos/route.generated.ts", bare),
    /routegen\$authoredRouteOf<typeof routegen\$Authored>\(\)\(defineRoute, routegen\$destination, parent\)/,
  );

  // Fewer descriptors (Launch without TanStack): only what they name.
  const fewer = emitLaunchRoutes(sources, { data: launch.data, types: [context], members: [] });

  assert.doesNotMatch(
    read("src/routes/app/area/todos/route.generated.ts", fewer),
    /Remote|routegen\$Members/,
  );
  assert.match(
    read("src/routes/app/area/todos/route.generated.ts", fewer),
    /\ntype routegen\$type_Context = routegen\$t0<typeof routegen\$route>;\nexport type \{ routegen\$type_Context as Context \};\n/,
  );
  assert.doesNotMatch(read("generated/routes.generated.ts", fewer), /members:|routegen\$t0/);

  // A member naming no type export is a descriptor bug.
  assert.throws(
    () =>
      emitLaunchRoutes(sources, { ...launch, members: [{ member: "remote", type: "Missing" }] }),
    /Route copy member type is not a type export: Missing/,
  );
});

test("extension copies: without the authored type the kept callbacks lose the stripped steps' types", async () => {
  const { project, sources, launch } = await launchProject();
  const desired = emitLaunchRoutes(sources, launch);
  const copy = resolve(project.root, "src/routes/app/area/todos/route.generated.ts");
  const unseeded = new Map(desired);

  // The control: routeOf, as before authored types.
  unseeded.set(
    copy,
    desired
      .get(copy)
      .replace("routegen$authoredRouteOf<typeof routegen$Authored>()(", "routegen$routeOf(")
      .replace(", routegen$own())", ")")
      .replace("authoredRouteOf as routegen$authoredRouteOf", "routeOf as routegen$routeOf"),
  );

  await assert.rejects(
    validateRoutes(sources, unseeded, createValidationProgram(sources, unseeded, [])),
    /todos[\\/]route\.ts:\d+:\d+: TS2339: Property 'todos' does not exist on type /,
  );
});

test("the import rule admits an extension copy's erased own import and Launch's server aggregate only", async () => {
  const { project, sources, launch } = await launchProject();
  const { root } = project;
  const desired = emitLaunchRoutes(sources, launch);
  const copy = resolve(root, "src/routes/app/area/todos/route.generated.ts");
  const own = 'import type routegen$Authored from "./route.js";';

  async function check(map, launchMode = sources.launch) {
    const variant = { ...sources, launch: launchMode };

    await validateRoutes(variant, map, createValidationProgram(variant, map, []));
  }

  function replaced(path, from, to) {
    const map = new Map(desired);
    const text = map.get(path);

    assert.ok(text.includes(from), from);
    map.set(path, text.replace(from, to));

    return map;
  }

  await check(desired);

  const rejected = [
    ["a value import", replaced(copy, own, 'import routegen$Authored from "./route.js";')],
    [
      "a named default import",
      replaced(copy, own, 'import type { default as routegen$Authored } from "./route.js";'),
    ],
    [
      "another route's declaration",
      replaced(copy, own, `${own}\nimport type routegen$Other from "../../route.js";`),
    ],
    [
      "a re-export",
      replaced(copy, own, `${own}\nexport type { default as Again } from "./route.js";`),
    ],
    [
      "the destination copy",
      replaced(
        resolve(root, "src/routes/app/area/todos/destination.generated.ts"),
        "export { routegen$destination as destination };",
        'import type routegen$Authored from "./route.js";\nexport { routegen$destination as destination };',
      ),
    ],
    [
      "the copy of a route without a server-only step",
      replaced(
        resolve(root, "src/routes/app/area/leaf/route.generated.ts"),
        "export { routegen$route as route };",
        'import type routegen$Authored from "./route.js";\nexport { routegen$route as route };',
      ),
    ],
  ];

  for (const [name, map] of rejected) {
    await assert.rejects(check(map), /Generated file imports a route declaration: /, name);
  }

  // Launch mode: the server aggregate value-imports routes with a server-only step.
  const aggregate = resolve(root, "generated/server.generated.ts");
  const launchMode = true;
  const server = (imports) => {
    const map = new Map(desired);

    map.set(aggregate, `// @loozo/angular-launch: owned server.generated.ts\n${imports}\n`);

    return map;
  };

  await check(
    server(
      'import route_0 from "../src/routes/app/route.js";\nimport route_1 from "../src/routes/app/area/todos/route.js";\nexport const routes = [route_0, route_1];',
    ),
    launchMode,
  );

  for (const [name, imports] of [
    [
      "a route without a server-only step",
      'import route_0 from "../src/routes/app/area/leaf/route.js";\nvoid route_0;',
    ],
    [
      "a type import",
      'import type route_0 from "../src/routes/app/route.js";\nexport type R = typeof route_0;',
    ],
    [
      "a named import",
      'import { default as route_0 } from "../src/routes/app/route.js";\nvoid route_0;',
    ],
  ]) {
    await assert.rejects(
      check(server(imports), launchMode),
      /server\.generated\.ts:\d+:\d+: Generated file imports a route declaration: /,
      name,
    );
  }
});

// Translated static segments (5d9b5661): emission, setup, per-locale validation and the loader.

const localizeInit = "@angular/localize/init";

function xliff1(units, locale = "de") {
  const lines = [];

  for (const [id, target] of units) {
    lines.push(
      `      <trans-unit id="${id}" datatype="html"><source>x</source><target>${target}</target></trans-unit>`,
    );
  }

  return `<?xml version="1.0" encoding="UTF-8" ?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="${locale}" datatype="plaintext" original="ng2.template">
    <body>
${lines.join("\n")}
    </body>
  </file>
</xliff>
`;
}

// A filesystem project with translated segments: `@angular/localize` types, a de catalog and
// the build's localization.
async function localizedProject({ catalog = xliff1([]), extra = {} } = {}) {
  const project = await filesystemProject();

  await project.write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
        experimentalDecorators: true,
        lib: ["ES2022", "DOM"],
        types: ["@angular/localize"],
      },
      include: ["src/**/*.ts"],
    }),
  );
  await project.write("src/locale/messages.de.xlf", catalog);

  const localization = {
    sourceLocale: "en",
    locales: [{ code: "de", files: [resolve(project.root, "src/locale/messages.de.xlf")] }],
    polyfills: [localizeInit],
  };

  return {
    ...project,
    localization,
    catalog: (text) => project.write("src/locale/messages.de.xlf", text),
    // The pass's words.
    translate: async (options = {}) => {
      const generation = await project.generate({
        translateSegments: true,
        localization,
        ...extra,
        ...options,
      });

      return generation.words;
    },
  };
}

// What each `$localize` message in a destination copy's fourth argument parses to.
async function segmentMessages(copy) {
  const { ɵparseMessage } = await import("@angular/localize");
  const line = copy.split("\n").find((text) => text.includes("routegen$defineDestination("));
  const start = line.lastIndexOf(", [$localize");

  if (start === -1) {
    return undefined;
  }

  const array = line.slice(start + 2, line.lastIndexOf(")"));
  const messages = new Function("$localize", `return ${array};`)((strings) =>
    ɵparseMessage(strings, []),
  );
  const result = [];

  for (const message of messages) {
    result.push({
      id: message.customId,
      text: message.text,
      meaning: message.meaning,
      description: message.description,
    });
  }

  return result;
}

async function outputSnapshot(project) {
  const result = new Map();

  async function visit(directory) {
    const { readdir } = await import("node:fs/promises");

    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.name.endsWith(".generated.ts") || entry.name === "route.ts") {
        const info = await stat(path, { bigint: true });

        result.set(path, { bytes: await readFile(path, "utf8"), mtimeNs: info.mtimeNs });
      }
    }
  }

  await visit(resolve(project.root, "src"));
  await visit(resolve(project.root, "generated"));

  return result;
}

test("translated segments: one $localize message per static word, escaped, in the destination copy", async () => {
  const project = await copyProject();
  const header = 'import { defineRoute, numberParam, stringParam } from "@loozo/angular-router";\n';
  const words = [
    "a`b",
    "c\\d",
    "e${f}",
    "g:h",
    "i@@j",
    "k|l",
    "über",
    "cr\rx",
    "lf\nx",
    "crlf\r\nx",
    "ls\u2028x",
    "x",
  ];
  const routes = {
    tricky: `${header}export default defineRoute(${JSON.stringify(`${words.join("/")}/$id`)}, { params: { id: numberParam } });\n`,
    "tricky/child": `${header}import parent from "../route.js";\nexport default defineRoute("x/$rest[]", { parent, params: { rest: stringParam } });\n`,
    "only-param": `${header}export default defineRoute("$slug", { params: { slug: stringParam } });\n`,
    pathless: `${header}export default defineRoute("", {});\n`,
  };

  await project.author(routes);
  await project.write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
        experimentalDecorators: true,
        lib: ["ES2022", "DOM"],
        types: ["@angular/localize"],
      },
      include: ["src/**/*.ts"],
    }),
  );
  await project.generate({
    translateSegments: true,
    localization: { sourceLocale: "en", locales: [], polyfills: [localizeInit] },
  });

  const tricky = await project.read("src/routes/tricky/destination.generated.ts");
  const messages = await segmentMessages(tricky);
  const expected = [];

  for (const word of words) {
    expected.push({
      id: `route.segment.${encodeURIComponent(word)}`,
      text: word,
      meaning: "URL path segment",
      description:
        'One segment of page URLs, without "/". Changing it changes links and bookmarks.',
    });
  }

  assert.deepEqual(messages, expected);
  // The child's own static word only; the parent's come from its destination.
  assert.deepEqual(
    (
      await segmentMessages(await project.read("src/routes/tricky/child/destination.generated.ts"))
    ).map((message) => message.text),
    ["x"],
  );
  // Param-only and pathless declarations carry no messages.
  assert.equal(
    await segmentMessages(await project.read("src/routes/only-param/destination.generated.ts")),
    undefined,
  );
  assert.equal(
    await segmentMessages(await project.read("src/routes/pathless/destination.generated.ts")),
    undefined,
  );

  // The messages sit on the root's line, so the copy keeps the declaration's lines.
  assert.equal(
    tricky.split("\n").findIndex((line) => line.includes("routegen$defineDestination(")),
    1,
  );

  // Only records with static text read their path from the destination.
  const routesFile = await project.read("generated/routes.generated.ts");
  const table = await project.read("src/routes/tricky/children.generated.ts");

  assert.match(routesFile, /path: nativePath\(destination_tricky_route\)/);
  assert.match(routesFile, /path: ":slug"/);
  assert.match(routesFile, /path: ""/);
  assert.match(routesFile, /import \{ record, nativePath, /);
  assert.match(table, /path: nativePath\(destination_tricky_child_route\)/);
  assert.doesNotMatch(routesFile, /effectivePath/);
});

test("translated segments: a hoisted redirect reads its effective path; seeded errors keep their line", async () => {
  const project = await localizedProject();

  await project.page("products/$productId");
  await project.page("teams/$teamId");
  await project.write(
    "src/routes/teams/$teamId/old/$id/route.ts",
    `import { defineRoute, stringParam } from "@loozo/angular-router";
import parent from "../../route.js";
import { destination as product } from "../../../../products/$productId/destination.generated.js";

export default defineRoute("old/$id", { parent, params: { id: stringParam } }).redirect({
  to: product,
  params: { productId: "id" },
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});
`,
  );
  await project.generate();
  await project.translate();

  const routes = await project.routes();

  assert.match(routes, /path: effectivePath\(destination_teams_\$teamId_old_\$id_route\)/);
  assert.match(routes, /path: nativePath\(destination_products_\$productId_route\)/);
  assert.match(routes, /import \{ record, nativePath, effectivePath, /);

  // A type error in a declaration still names its own line, through its translated copy.
  await project.write(
    "src/routes/products/$productId/route.ts",
    `import { defineRoute, numberParam } from "@loozo/angular-router";

const wrong: number = "x";

export default defineRoute("products/$productId", { params: { productId: numberParam } });
`,
  );
  await assert.rejects(
    project.translate(),
    /src\/routes\/products\/\$productId\/route\.ts\(3,7\): error TS2322/,
  );
});

test("translated segments: explicit and filesystem mode emit the same messages; catalogs change no byte", async () => {
  const filesystem = await localizedProject();

  await filesystem.page("products/$productId");
  await filesystem.translate();

  const explicit = await localizedProject({ extra: { autoDefineRoutes: false } });

  await explicit.page("products/$productId");
  await explicit.write(
    "src/routes/products/$productId/route.ts",
    await filesystem.read("src/routes/products/$productId/route.ts"),
  );
  await explicit.translate();

  const destination = "src/routes/products/$productId/destination.generated.ts";

  assert.deepEqual(
    await segmentMessages(await filesystem.read(destination)),
    await segmentMessages(await explicit.read(destination)),
  );

  const before = await outputSnapshot(filesystem);

  // The returned words are the localeUrls table's input: a catalog edit changes them alone.
  assert.deepEqual(
    await filesystem.translate({ check: true }),
    new Map([["de", new Map([["products", "products"]])]]),
  );

  await filesystem.catalog(xliff1([["route.segment.products", "produkte"]]));
  assert.deepEqual(
    await filesystem.translate(),
    new Map([["de", new Map([["products", "produkte"]])]]),
  );
  assert.deepEqual(
    await filesystem.translate({ check: true }),
    new Map([["de", new Map([["products", "produkte"]])]]),
  );
  assert.deepEqual(await outputSnapshot(filesystem), before);

  // Without translateSegments, generation reads no catalog and returns no words.
  const generation = await explicit.generate({ autoDefineRoutes: false });

  assert.equal(generation.words, undefined);
});

test("translated segments: the copy diagnostic for a missing $localize type names the fix", async () => {
  const project = await localizedProject();

  await project.page("products");
  await project.write(
    "tsconfig.json",
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
  );
  await assert.rejects(
    project.translate(),
    /TS2304: Cannot find name '\$localize'\.; add @angular\/localize to compilerOptions\.types \(in its generated destination copy\)/,
  );
});

test("translated segments: setup needs the init polyfill; the option off never loads @angular/localize", async () => {
  const project = await localizedProject();

  await project.page("products");
  await assert.rejects(
    project.translate({ localization: { ...project.localization, polyfills: ["zone.js"] } }),
    /translateSegments needs the @angular\/localize\/init polyfill/,
  );
  await project.translate();

  // A child process where @angular/localize can't be resolved.
  const hooks = resolve(project.root, "hide-localize.mjs");
  const runner = resolve(project.root, "run.mjs");

  await writeFile(
    hooks,
    `export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@angular/localize")) {
    throw new Error("hidden: " + specifier);
  }

  return next(specifier, context);
}
`,
  );
  await writeFile(
    runner,
    `import { register } from "node:module";
register(${JSON.stringify(pathToFileURL(hooks).href)});
const { generate } = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../node/src/generation/generate.js")).href)});
const options = { tsconfig: "tsconfig.json", scanDirectories: ["src/routes"], outDirectory: "generated" };
const translate = process.argv[2] === "on";

try {
  await generate(${JSON.stringify(project.root)}, { ...options, translateSegments: translate, localization: ${JSON.stringify(project.localization)} }, () => false);
  console.log("ok");
} catch (error) {
  console.log(error.message);
}
`,
  );

  const off = await run(process.execPath, [runner, "off"]);

  assert.equal(off.stdout.trim(), "ok");

  const on = await run(process.execPath, [runner, "on"]);

  assert.equal(
    on.stdout.trim(),
    "translateSegments needs @angular/localize: run ng add @angular/localize",
  );
});

test("translated segments: each locale's tree is checked before any write, with source text for missing words", async () => {
  const project = await localizedProject();

  for (const directory of [
    "products/$productId",
    "news",
    "new",
    "docs/$rest[]",
    "help/$rest[]",
    "offers",
    "deals",
    "about",
    "guides",
    "guides/$rest[]",
    "manuals/start",
  ]) {
    await project.page(directory);
  }

  await project.write(
    "src/routes/legacy/route.ts",
    `import { defineRoute } from "@loozo/angular-router";
import { destination as about } from "../about/destination.generated.js";

export default defineRoute("legacy", {}).redirect({
  to: about,
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});
`,
  );
  await project.generate();
  await project.translate();

  const catalogFile = resolve(project.root, "src/locale/messages.de.xlf");

  // A word Angular can't stand as one static segment, or a placeholder.
  for (const [target, reason] of [
    ["produkte/alle", 'a route segment can\'t contain "/"'],
    ["", "a route segment can't be empty"],
    ["$x", 'a route segment can\'t start with "$" or ":"'],
    [":x", 'a route segment can\'t start with "$" or ":"'],
    ["..", 'a route segment can\'t be ".", "..", "*" or "**"'],
    ["**", 'a route segment can\'t be ".", "..", "*" or "**"'],
    ['pro<x id="PH" equiv-text="x"/>dukte', "a route segment can't hold placeholders"],
  ]) {
    const before = await outputSnapshot(project);

    await project.catalog(xliff1([["route.segment.products", target]]));
    await assert.rejects(project.translate(), (error) => {
      assert.ok(
        error.message.startsWith("Locale de: route.segment.products translates to "),
        error.message,
      );
      assert.ok(error.message.endsWith(`(${catalogFile}): ${reason}`), error.message);

      return true;
    });
    await assert.rejects(project.translate({ check: true }), /^Error: Locale de: /);
    assert.deepEqual(await outputSnapshot(project), before);
  }

  // Translation can only merge paths, and a merge is a collision in that locale alone.
  for (const [units, pattern] of [
    [
      [
        ["route.segment.news", "neu"],
        ["route.segment.new", "neu"],
      ],
      /^Error: Locale de: .*Ordinary route collision\/overlap: .*\(\/neu\); .*\(\/neu\)$/,
    ],
    [
      [
        ["route.segment.docs", "hilfe"],
        ["route.segment.help", "hilfe"],
      ],
      /^Error: Locale de: .*Competing sibling catchalls: /,
    ],
    [
      [
        ["route.segment.legacy", "ueber"],
        ["route.segment.about", "ueber"],
      ],
      /^Error: Locale de: .*Ordinary route collision\/overlap: .*\(\/ueber\)/,
    ],
    // An untranslated word stands as its source text, which can collide too.
    [
      [["route.segment.deals", "offers"]],
      /^Error: Locale de: .*Ordinary route collision\/overlap: .*\(\/offers\)/,
    ],
    // A merge that puts a route under a catchall tried before it, which the source tree doesn't.
    [
      [
        ["route.segment.guides", "dokumente"],
        ["route.segment.manuals", "dokumente"],
      ],
      /^Error: Locale de: .*guides[\\/]\$rest\[\][\\/]route\.ts:1:1: Catchall shadows a route: src\/routes\/guides\/\$rest\[\]\/route\.ts \(\/dokumente\/\$rest\[\]\) is tried before src\/routes\/manuals\/start\/route\.ts \(\/dokumente\/start\)$/,
    ],
    // Collisions come first: guides/$rest[] would shadow news here too.
    [
      [
        ["route.segment.guides", "neu"],
        ["route.segment.news", "neu"],
      ],
      /^Error: Locale de: .*Ordinary route collision\/overlap: .*\(\/neu\); .*\(\/neu\)$/,
    ],
  ]) {
    const before = await outputSnapshot(project);

    await project.catalog(xliff1(units));
    await assert.rejects(project.translate(), pattern);
    assert.deepEqual(await outputSnapshot(project), before);
    // The canonical tree is unaffected: the same sources generate without translation.
    await project.generate();
  }

  // Missing words aren't the generator's to report.
  await project.catalog(xliff1([["route.segment.products", "produkte"]]));
  await project.translate();
});

async function loaderParity(project, files) {
  const { createTranslationLoader, loadTranslations } = await import("@angular/build/private");
  const { loadCatalogs } = await import("../node/src/generation/localization.js");
  const paths = [];

  for (const [name, text] of files) {
    await project.write(`src/locale/${name}`, text);
    paths.push(resolve(project.root, "src/locale", name));
  }

  let ours;
  let angular;

  try {
    const catalogs = await loadCatalogs({
      sourceLocale: "en",
      locales: [{ code: "de", files: paths }],
      polyfills: [localizeInit],
    });
    const { format, entries } = catalogs.get("de");
    const translations = {};

    for (const [id, entry] of entries) {
      translations[id] = entry.translation.text;
    }

    ours = { ok: true, format, translations };
  } catch {
    ours = { ok: false };
  }

  try {
    const loader = await createTranslationLoader();
    // Angular joins each path to the workspace root, so give it workspace-relative paths: an
    // absolute Windows path joined to "/" isn't a file.
    const desc = { files: paths.map((path) => ({ path: relative(project.root, path) })) };
    const quiet = { warn() {}, error() {} };

    loadTranslations("de", desc, project.root, loader, quiet, undefined, "ignore");

    const translations = {};

    for (const [id, translation] of Object.entries(desc.translation)) {
      translations[id] = translation.text;
    }

    angular = { ok: true, format: desc.files.map((file) => file.format), translations };
  } catch {
    angular = { ok: false };
  }

  assert.deepEqual(ours, angular);

  return ours;
}

test("translated segments: catalogs load as Angular's loader loads them", async () => {
  const project = await localizedProject();
  const products = "route.segment.products";

  const formats = [
    ["messages.de.xlf", xliff1([[products, "produkte"]])],
    [
      "messages.de.xlf2",
      `<?xml version="1.0" encoding="UTF-8" ?>
<xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0" srcLang="en" trgLang="de">
  <file id="ngi18n" original="ng.template">
    <unit id="${products}"><segment><source>products</source><target>produkte</target></segment></unit>
  </file>
</xliff>
`,
    ],
    [
      "messages.de.json",
      JSON.stringify({ locale: "de", translations: { [products]: "produkte" } }),
    ],
    ["messages.de.arb", JSON.stringify({ "@@locale": "de", [products]: "produkte" })],
    [
      "messages.de.xtb",
      `<?xml version="1.0" encoding="UTF-8"?>
<translationbundle lang="de">
  <translation id="${products}">produkte</translation>
</translationbundle>
`,
    ],
  ];

  for (const file of formats) {
    const loaded = await loaderParity(project, [file]);

    assert.equal(loaded.ok, true, file[0]);
    assert.equal(loaded.translations[products], "produkte", file[0]);
  }

  // ARB comes first, so a JSON file mentioning XLIFF 2 is still ARB.
  const ambiguous = await loaderParity(project, [
    [
      "ambiguous.json",
      JSON.stringify({
        "@@locale": "de",
        [products]: "produkte",
        example: "<xliff version='2.0'/>",
      }),
    ],
  ]);

  assert.deepEqual(ambiguous.format, ["arb"]);
  assert.equal(ambiguous.translations[products], "produkte");

  // A later file wins on a duplicate id.
  const merged = await loaderParity(project, [
    [
      "first.xlf",
      xliff1([
        [products, "erste"],
        ["route.segment.about", "ueber"],
      ]),
    ],
    ["second.xlf", xliff1([[products, "zweite"]])],
  ]);

  assert.equal(merged.translations[products], "zweite");
  assert.equal(merged.translations["route.segment.about"], "ueber");

  // A duplicate unit inside one file is the parser's diagnostic, which Angular's loader ignores.
  const duplicate = xliff1([
    ["page.title", "Titel"],
    ["page.title", "Titel 2"],
    [products, "produkte"],
  ]);
  const within = await loaderParity(project, [["duplicate.xlf", duplicate]]);

  assert.equal(within.ok, true);
  assert.equal(within.translations[products], "produkte");

  // A file no parser accepts fails both.
  const unsupported = await loaderParity(project, [["messages.de.txt", "products=produkte"]]);

  assert.equal(unsupported.ok, false);

  // And generation resolves the route word through such a catalog.
  await project.page("products");
  await project.catalog(duplicate);
  await project.translate();
});

const outletHeader =
  'import { defineRoute, enumParam, numberParam, stringParam } from "@loozo/angular-router";\n';
const outletChild = (from) => `${outletHeader}import parent from "${from}";\n`;

// The record of one declaration, as emitted into a table.
function recordOf(table, path) {
  const start = table.indexOf(`path: ${JSON.stringify(path)},`);

  assert.ok(start >= 0, `Missing record: ${path}`);

  const end = table.slice(start).search(/ \}(?:,\n|\];)/);

  return table.slice(table.lastIndexOf("{ ", start), start + end + 2);
}

test("named outlets: outlet records in root and children tables, anchored empty leaves and primary RouteTypes", async () => {
  const project = await copyProject();
  const result = await project.analyze({
    "+home": `${outletHeader}\nexport default defineRoute("", {}).canMatch([() => true]);\n`,
    "chat/$id": `${outletHeader}\nexport default defineRoute("chat/$id", { outlet: "chat", params: { id: numberParam } });\n`,
    "chat/$id/settings": `${outletChild("../route.js")}\nexport default defineRoute("settings", { parent });\n`,
    "chat/$rest[]": `${outletHeader}\nexport default defineRoute("$rest[]", { outlet: "chat", params: { rest: stringParam } });\n`,
    products: `${outletHeader}\nexport default defineRoute("products", { search: { sort: enumParam(["name", "price"]) } });\n`,
    "products/+overview": `${outletChild("../route.js")}\nexport default defineRoute("", { parent }).canMatch([() => true]);\n`,
    "products/list": `${outletChild("../route.js")}\nexport default defineRoute("list", { parent });\n`,
    "products/item/$id": `${outletChild("../../route.js")}\nexport default defineRoute("item/$id", { parent, outlet: "detail", params: { id: numberParam } });\n`,
    "products/item/$id/specs": `${outletChild("../route.js")}\nexport default defineRoute("specs", { parent });\n`,
    "teams/$teamId": `${outletHeader}\nexport default defineRoute("teams/$teamId", { params: { teamId: numberParam } });\n`,
    "teams/$teamId/+index": `${outletChild("../route.js")}\nexport default defineRoute("", { parent });\n`,
    "teams/$teamId/item/$id": `${outletChild("../../route.js")}\nexport default defineRoute("item/$id", { parent, outlet: "detail", params: { id: numberParam } });\n`,
    plain: `${outletHeader}\nexport default defineRoute("plain", {});\n`,
    "plain/+index": `${outletChild("../route.js")}\nexport default defineRoute("", { parent }).canMatch([() => true]);\n`,
  });
  const read = (path) => result.desired.get(resolve(project.root, path));
  const routes = read("generated/routes.generated.ts");
  const products = read("src/routes/products/children.generated.ts");
  const chat = read("src/routes/chat/$id/children.generated.ts");
  const item = read("src/routes/products/item/$id/children.generated.ts");
  const teams = read("src/routes/teams/$teamId/children.generated.ts");
  const plain = read("src/routes/plain/children.generated.ts");

  // A branch root names its outlet, in whichever table holds it; its descendants don't.
  assert.match(recordOf(routes, "chat/:id"), /^\{ path: "chat\/:id",\noutlet: "chat",\n/);
  assert.match(recordOf(routes, "**"), /^\{ path: "\*\*",\noutlet: "chat",\n/);
  assert.match(recordOf(products, "item/:id"), /^\{ path: "item\/:id",\noutlet: "detail",\n/);
  assert.match(recordOf(teams, "item/:id"), /^\{ path: "item\/:id",\noutlet: "detail",\n/);
  assert.doesNotMatch(chat, /outlet:/);
  assert.doesNotMatch(item, /outlet:/);
  assert.doesNotMatch(recordOf(products, "list"), /outlet:/);

  // Empty leaves at a branch's anchor match by prefix and gate their canMatch adapters; a leaf
  // without callbacks just matches by prefix; any other empty leaf keeps full.
  assert.equal(
    recordOf(routes, ""),
    `{ path: "",\n...record(destination__home_route),\n...callbacks(route__home_route, { onlyAtEnd: true }),\nloadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/+home/page") }`,
  );
  assert.match(
    recordOf(products, ""),
    /\.\.\.callbacks\(route_products__overview_route, \{ onlyAtEnd: true \}\)/,
  );
  assert.doesNotMatch(recordOf(products, ""), /pathMatch/);
  assert.doesNotMatch(recordOf(teams, ""), /pathMatch|callbacks/);
  assert.match(
    recordOf(plain, ""),
    /pathMatch: 'full',\n[^]*\.\.\.callbacks\(route_plain__index_route\),/,
  );

  // The active route reads the primary chain: RouteTypes names no branch member.
  const types = routes.slice(routes.indexOf("export type RouteTypes"));

  for (const id of [
    "chat/$id",
    "chat/$id/settings",
    "chat/$rest[]",
    "products/item/$id",
    "products/item/$id/specs",
    "teams/$teamId/item/$id",
  ]) {
    assert.ok(!types.includes(JSON.stringify(`src/routes/${id}/route.ts`)), id);
  }

  for (const id of ["+home", "products", "products/list", "plain"]) {
    assert.ok(types.includes(JSON.stringify(`src/routes/${id}/route.ts`)), id);
  }

  // `..` stays inside a branch and a branch root has none.
  assert.match(
    recordOf(chat, "settings"),
    /\.\.\.record\(destination_chat_\$id_settings_route, destination_chat_\$id_route\)/,
  );
  assert.match(
    recordOf(item, "specs"),
    /\.\.\.record\(destination_products_item_\$id_specs_route, destination_products_item_\$id_route\)/,
  );
  assert.match(
    recordOf(products, "item/:id"),
    /\.\.\.record\(destination_products_item_\$id_route\),/,
  );
  assert.match(recordOf(routes, "chat/:id"), /\.\.\.record\(destination_chat_\$id_route\),/);
  assert.doesNotMatch(result.copy("chat/$id", "route"), /routegen\$up/);
  assert.match(result.copy("chat/$id/settings", "route"), /routegen\$up/);

  // The destination copy keeps the fact as written.
  assert.match(result.copy("chat/$id", "destination"), /outlet: "chat"/);
});

test("named outlets: positions compare per outlet and anchor under a structural key", async () => {
  const project = await copyProject();
  const base = {
    products: `${outletHeader}\nexport default defineRoute("products", {});\n`,
    "products/list": `${outletChild("../route.js")}\nexport default defineRoute("list", { parent });\n`,
    // The same path in different outlets, and the primary, passes.
    "products/item": `${outletChild("../route.js")}\nexport default defineRoute("item", { parent, outlet: "detail" });\n`,
    "products/aside-item": `${outletChild("../route.js")}\nexport default defineRoute("item", { parent, outlet: "aside" });\n`,
    "products/plain-item": `${outletChild("../route.js")}\nexport default defineRoute("item", { parent });\n`,
    // A literal primary path spelled like the branch doesn't collide with it (F4).
    literal: `${outletHeader}\nexport default defineRoute("products/(detail:item)", {});\n`,
    "literal/child": `${outletChild("../route.js")}\nexport default defineRoute("child", { parent });\n`,
    "products/item/child": `${outletChild("../route.js")}\nexport default defineRoute("child", { parent });\n`,
    plain: `${outletHeader}\nexport default defineRoute("plain", {});\n`,
    "+home": `${outletHeader}\nexport default defineRoute("", {});\n`,
    "to-literal": `${outletHeader}import { destination as to } from "../literal/destination.generated.js";\n\nexport default defineRoute("to-literal", {}).redirect({ to, search: { mode: "drop" }, fragment: { mode: "drop" } });\n`,
    "to-branch": `${outletHeader}import { destination as to } from "../products/item/destination.generated.js";\n\nexport default defineRoute("to-branch", {}).redirect({ to, search: { mode: "drop" }, fragment: { mode: "drop" } });\n`,
  };
  const result = await project.analyze(base, {
    componentless: ["to-literal", "to-branch"],
  });
  const selected = selections(result.sources);
  const keys = [...selected.keys()];

  assert.ok(keys.includes(JSON.stringify(["primary", [], ["products", "(detail:item)"]])));
  assert.ok(keys.includes(JSON.stringify(["detail", ["products"], ["item"]])));
  assert.ok(keys.includes(JSON.stringify(["aside", ["products"], ["item"]])));
  assert.ok(keys.includes(JSON.stringify(["primary", [], ["products", "item"]])));

  // Each child's `..` is its own parent: the literal for the literal's child, the branch member
  // for the branch child; a top-level route's is the root winner through the root key.
  assert.match(
    result.copy("literal/child", "route"),
    /import \{ destination as routegen\$up \} from "\.\.\/destination\.generated\.js"/,
  );
  assert.match(
    result.copy("products/item/child", "route"),
    /import \{ destination as routegen\$up \} from "\.\.\/destination\.generated\.js"/,
  );
  assert.match(
    result.copy("plain", "route"),
    /import \{ destination as routegen\$up \} from "\.\.\/\+home\/destination\.generated\.js"/,
  );

  // Same outlet and path under a parent and its pathless child: one position, both named.
  await assert.rejects(
    project.analyze(
      {
        ...base,
        "products/+layout": `${outletChild("../route.js")}\nexport default defineRoute("", { parent });\n`,
        "products/+layout/item": `${outletChild("../route.js")}\nexport default defineRoute("item", { parent, outlet: "detail" });\n`,
      },
      { componentless: ["to-literal", "to-branch"] },
    ),
    /Ordinary route collision\/overlap: src\/routes\/products\/[+a-z/]*item\/route\.ts \(\/products\/\(detail:item\)\); src\/routes\/products\/[+a-z/]*item\/route\.ts \(\/products\/\(detail:item\)\)$/,
  );

  // Catchalls compete per outlet: two in chat collide, one in chat and one primary don't.
  const catchalls = {
    "+home": `${outletHeader}\nexport default defineRoute("", {});\n`,
    "chat/$rest[]": `${outletHeader}\nexport default defineRoute("$rest[]", { outlet: "chat", params: { rest: stringParam } });\n`,
    "$rest[]": `${outletHeader}\nexport default defineRoute("$rest[]", { params: { rest: stringParam } });\n`,
  };

  await project.analyze(catchalls);
  await assert.rejects(
    project.analyze({
      ...catchalls,
      "talk/$other[]": `${outletHeader}\nexport default defineRoute("$other[]", { outlet: "chat", params: { other: stringParam } });\n`,
    }),
    /Competing sibling catchalls: /,
  );
});

test("named outlets: an empty-path primary parent adds no anchor segment", async () => {
  const project = await copyProject();
  const routes = {
    account: `${outletHeader}\nexport default defineRoute("account", {});\n`,
    "account/+layout": `${outletChild("../route.js")}\nexport default defineRoute("", { parent });\n`,
    "account/+layout/profile": `${outletChild("../route.js")}\nexport default defineRoute("profile", { parent });\n`,
    "account/+layout/help": `${outletChild("../route.js")}\nexport default defineRoute("help", { parent, outlet: "aside" });\n`,
  };
  const result = await project.analyze(routes);
  const layout = result.desired.get(
    resolve(project.root, "src/routes/account/+layout/children.generated.ts"),
  );
  const account = result.desired.get(
    resolve(project.root, "src/routes/account/children.generated.ts"),
  );
  const help = result.sources.declarations.find((declaration) => declaration.path === "help");

  assert.match(recordOf(layout, "help"), /^\{ path: "help",\noutlet: "aside",\n/);
  assert.doesNotMatch(recordOf(layout, "profile"), /outlet:/);
  assert.deepEqual(help.branch, { outlet: "aside", anchor: [{ kind: "static", text: "account" }] });
  assert.equal(
    recordOf(account, ""),
    `{ path: "",\n...record(destination_account__layout_route),\nloadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./+layout/page"),\nloadChildren: (): ReturnType<NonNullable<Routes[number]["loadChildren"]>> => import("./+layout/children.generated.js").then((m) => m.routes) }`,
  );

  // An aside branch declared directly under account takes the same position.
  await assert.rejects(
    project.analyze({
      ...routes,
      "account/help": `${outletChild("../route.js")}\nexport default defineRoute("help", { parent, outlet: "aside" });\n`,
    }),
    /Ordinary route collision\/overlap: src\/routes\/account\/[+a-z/]*help\/route\.ts \(\/account\/\(aside:help\)\); src\/routes\/account\/[+a-z/]*help\/route\.ts \(\/account\/\(aside:help\)\)$/,
  );
});

test("named outlets: redirects into a branch keep their policies; sources can't be in one", async () => {
  const project = await copyProject();
  const routes = {
    products: `${outletHeader}\nexport default defineRoute("products", { search: { sort: enumParam(["name", "price"]) } });\n`,
    "products/item/$id": `${outletChild("../../route.js")}\nexport default defineRoute("item/$id", { parent, outlet: "detail", params: { id: numberParam } });\n`,
    "chat/$id": `${outletHeader}\nexport default defineRoute("chat/$id", { outlet: "chat", params: { id: numberParam } });\n`,
    "old-item/$id": `${outletHeader}import { destination as to } from "../../products/item/$id/destination.generated.js";\n\nexport default defineRoute("old-item/$id", { params: { id: numberParam } }).redirect({ to, search: { mode: "replace", values: { sort: "price" } }, fragment: { mode: "drop" } });\n`,
    "old-chat/$id": `${outletHeader}import { destination as to } from "../../chat/$id/destination.generated.js";\n\nexport default defineRoute("old-chat/$id", { params: { id: numberParam } }).redirect({ to, search: { mode: "preserve" }, fragment: { mode: "drop" } });\n`,
  };
  const settings = { componentless: ["old-item/$id", "old-chat/$id"] };

  await project.analyze(routes, settings);

  // An inherited key is a known replacement; an unknown one and an undeclared fragment aren't.
  await assert.rejects(
    project.analyze(
      {
        ...routes,
        "old-item/$id": routes["old-item/$id"].replace('{ sort: "price" }', "{ page: 2 }"),
      },
      settings,
    ),
    /Unknown\/incompatible redirect replacement key: page$/,
  );
  await assert.rejects(
    project.analyze(
      {
        ...routes,
        "old-item/$id": routes["old-item/$id"].replace(
          'fragment: { mode: "drop" }',
          'fragment: { mode: "replace", value: "top" }',
        ),
      },
      settings,
    ),
    /Fragment replacement requires a destination-declared name$/,
  );
  await assert.rejects(
    project.analyze(
      {
        ...routes,
        "chat/$id/old": `${outletChild("../route.js")}import { destination as to } from "../destination.generated.js";\n\nexport default defineRoute("old", { parent }).redirect({ to, search: { mode: "drop" }, fragment: { mode: "drop" } });\n`,
      },
      { componentless: [...settings.componentless, "chat/$id/old"] },
    ),
    /Redirect sources can't be in a named outlet: src\/routes\/chat\/\$id\/old\/route\.ts$/,
  );
});

test("named outlets: declarations mirror the runtime's outlet rules", async () => {
  const project = await copyProject();
  const parent = `${outletHeader}\nexport default defineRoute("chat", { outlet: "chat" });\n`;

  for (const [routes, pattern] of [
    [
      {
        x: `${outletHeader}const name = "chat";\nexport default defineRoute("x", { outlet: name });\n`,
      },
      /outlet must be a string literal$/,
    ],
    [
      { x: `${outletHeader}\nexport default defineRoute("x", { outlet: "1chat" });\n` },
      /Outlet name must be a letter followed by letters, digits, '-' or '_', and not "primary": 1chat$/,
    ],
    [
      { x: `${outletHeader}\nexport default defineRoute("x", { outlet: "primary" });\n` },
      /not "primary": primary$/,
    ],
    [
      { x: `${outletHeader}\nexport default defineRoute("", { outlet: "chat" });\n` },
      /A named-outlet route needs a path: an empty one activates with its anchor and can't be closed$/,
    ],
    [
      {
        chat: parent,
        "chat/x": `${outletChild("../route.js")}\nexport default defineRoute("x", { parent, outlet: "aside" });\n`,
      },
      /Named outlets don't nest: the parent is in outlet chat$/,
    ],
    [
      {
        x: `${outletHeader}\nexport default defineRoute("x", { outlet: "chat", search: { q: stringParam } });\n`,
      },
      /Routes in a named outlet can't declare search or fragments: the query and fragment belong to the primary route$/,
    ],
    [
      {
        chat: parent,
        "chat/x": `${outletChild("../route.js")}\nexport default defineRoute("x", { parent, fragments: ["top"] });\n`,
      },
      /Routes in a named outlet can't declare search or fragments/,
    ],
  ]) {
    await assert.rejects(project.analyze(routes), pattern);
  }
});

test("named outlets: filesystem mode keeps an authored outlet through a move", async () => {
  const project = await filesystemProject();

  await project.page("+home");
  await project.page("chat/$id");
  await project.write(
    "src/routes/chat/$id/route.ts",
    `${outletHeader}\nexport default defineRoute("chat/$id", { outlet: "chat", params: { id: stringParam } });\n`,
  );
  await project.generate();
  assert.match(await project.routes(), /path: "chat\/:id",\noutlet: "chat",/);

  await project.move("src/routes/chat", "src/routes/talk");
  await project.generate();

  const moved = await project.read("src/routes/talk/$id/route.ts");

  assert.match(
    moved,
    /defineRoute\("talk\/\$id", \{ outlet: "chat", params: \{ id: stringParam \} \}\)/,
  );
  assert.match(await project.routes(), /path: "talk\/:id",\noutlet: "chat",/);
});

test("named outlets: Launch-mode discovery admits outlet", async () => {
  const project = await copyProject();

  await project.author({
    "+home": `${outletHeader}\nexport default defineRoute("", {});\n`,
    "chat/$id": `${outletHeader}\nexport default defineRoute("chat/$id", { outlet: "chat", params: { id: numberParam } });\n`,
  });

  const sources = await discover(
    project.root,
    "tsconfig.json",
    ["src/routes"],
    "generated",
    undefined,
    new Map(),
    false,
    true,
  );
  const desired = emitLaunchRoutes(sources);

  assert.match(
    desired.get(resolve(project.root, "generated/routes.generated.ts")),
    /path: "chat\/:id",\noutlet: "chat",/,
  );
});

test("named outlets: each locale checks translated anchors and in-branch paths", async () => {
  const project = await localizedProject();

  await project.page("products");
  await project.page("detail");
  await project.page("products/item/$id");
  await project.page("products/entry/$id");

  for (const directory of ["item", "entry"]) {
    await project.write(
      `src/routes/products/${directory}/$id/route.ts`,
      `${outletChild("../../route.js")}\nexport default defineRoute("${directory}/$id", { parent, outlet: "detail", params: { id: stringParam } });\n`,
    );
  }

  await project.generate();
  await project.translate();

  // The anchor's word translates once (produits, not what a catalog says produits becomes),
  // the outlet name never does, even when a route word spells it, and a translation that
  // merges two branch positions fails in that locale.
  await project.catalog(
    xliff1([
      ["route.segment.products", "produits"],
      ["route.segment.produits", "X"],
      ["route.segment.detail", "einzel"],
      ["route.segment.item", "artikel"],
      ["route.segment.entry", "artikel"],
    ]),
  );
  await assert.rejects(
    project.translate(),
    /^Error: Locale de: .*: Ordinary route collision\/overlap: src\/routes\/products\/[a-z]+\/\$id\/route\.ts \(\/produits\/\(detail:artikel\/\$id\)\); src\/routes\/products\/[a-z]+\/\$id\/route\.ts \(\/produits\/\(detail:artikel\/\$id\)\)$/,
  );

  await project.catalog(
    xliff1([
      ["route.segment.products", "produkte"],
      ["route.segment.item", "artikel"],
    ]),
  );
  await project.translate();
});

// One explicit-mode tree per row: each declaration `{ id, path, parent?, outlet?, params?,
// target?, page? }` becomes src/routes/<id>/route.ts and, unless `page` is false, a page.
async function writeDeclarations(project, declarations) {
  for (const declaration of declarations) {
    const facts = [];
    let imports = outletHeader;
    let redirect = "";

    if (declaration.parent) {
      imports += `import parent from "${relativeRoute(declaration.id, declaration.parent, "route.js")}";\n`;
      facts.push("parent");
    }

    if (declaration.params) {
      facts.push(
        `params: { ${declaration.params.map((name) => `${name}: stringParam`).join(", ")} }`,
      );
    }

    if (declaration.outlet) {
      facts.push(`outlet: ${JSON.stringify(declaration.outlet)}`);
    }

    if (declaration.target) {
      imports += `import { destination as to } from "${relativeRoute(declaration.id, declaration.target, "destination.generated.js")}";\n`;
      redirect = '.redirect({ to, search: { mode: "drop" }, fragment: { mode: "drop" } })';
    }

    await project.write(
      `src/routes/${declaration.id}/route.ts`,
      `${imports}\nexport default defineRoute(${JSON.stringify(declaration.path)}, { ${facts.join(", ")} })${redirect};\n`,
    );

    if (declaration.page !== false) {
      await project.page(declaration.id);
    }
  }
}

// The specifier from one route directory to a file in another.
function relativeRoute(from, to, file) {
  const path = relative(resolve("/", from), resolve("/", to, file))
    .split(sep)
    .join("/");

  if (path.startsWith(".")) {
    return path;
  }

  return `./${path}`;
}

test("translated segments: a catchall may not shadow a route in one locale alone", async () => {
  const docs = { id: "docs", path: "docs", page: false };
  const rest = { id: "docs/$rest[]", path: "$rest[]", parent: "docs", params: ["rest"] };
  const done = { id: "done", path: "done" };
  const merge = { docs: "dokumente", manuals: "dokumente", start: "anfang" };
  const deep = { id: "docs", path: "docs/deep/nested", page: false };
  const account = { id: "account", path: "account", page: false };
  const accountDocs = (id, parent) => [
    { id, path: "docs", parent, outlet: "detail", page: false },
    { id: `${id}/$rest[]`, path: "$rest[]", parent: id, params: ["rest"] },
  ];
  const wrapper = (id, parent) => ({ id, path: "", parent, page: false });
  const start = (id, parent) => ({ id, path: "manuals/start", parent, outlet: "detail" });
  const shadows = (catchall, path, other, otherPath) =>
    `Catchall shadows a route: src/routes/${catchall}/route.ts (${path}) is tried before src/routes/${other}/route.ts (${otherPath})`;
  const f2 = shadows(
    "docs/$rest[]",
    "/dokumente/deep/nested/$rest[]",
    "manuals/$x[]",
    "/dokumente/$x[]",
  );

  // Each row: a tree, or "same" to reuse the previous row's project with a new catalog; the
  // canonical table and two paths whose emitted order the row depends on; and the reject tail.
  const rows = [
    {
      name: "a: a root route under the catchall's translated prefix",
      tree: [docs, rest, { id: "manuals/start", path: "manuals/start" }],
      words: merge,
      reject: shadows("docs/$rest[]", "/dokumente/$rest[]", "manuals/start", "/dokumente/anfang"),
    },
    { name: "b: distinct words", tree: "same", words: { ...merge, manuals: "handbuecher" } },
    {
      name: "c: the route sorts before the catchall's branch",
      tree: [docs, rest, { id: "aaa/start", path: "aaa/start" }],
      words: { ...merge, aaa: "dokumente" },
    },
    {
      name: "d: canonical shadowing stays accepted",
      tree: [docs, rest, { id: "docs/special", path: "docs/special" }],
      words: { docs: "dokumente", start: "anfang" },
    },
    {
      name: "e: an ordinary route shorter than the catchall's prefix",
      tree: [
        { id: "docs", path: "docs/deep", page: false },
        rest,
        { id: "manuals", path: "manuals" },
      ],
      words: merge,
    },
    {
      name: "f: a catchall route",
      tree: [docs, rest, { id: "manuals/$x[]", path: "manuals/$x[]", params: ["x"] }],
      words: merge,
      reject: shadows("docs/$rest[]", "/dokumente/$rest[]", "manuals/$x[]", "/dokumente/$x[]"),
    },
    {
      name: "g: a catchall redirect, in the last root group",
      tree: [
        docs,
        rest,
        done,
        { id: "manuals/$x[]", path: "manuals/$x[]", params: ["x"], target: "done", page: false },
      ],
      words: merge,
      reject: shadows("docs/$rest[]", "/dokumente/$rest[]", "manuals/$x[]", "/dokumente/$x[]"),
    },
    {
      name: "g: an ordinary redirect, in the first root group",
      tree: [
        docs,
        rest,
        done,
        { id: "manuals/start", path: "manuals/start", target: "done", page: false },
      ],
      words: merge,
    },
    {
      name: "h: a sibling of the catchall",
      tree: [docs, rest, { id: "docs/intro", path: "intro", parent: "docs" }],
      words: { docs: "dokumente", intro: "anfang", start: "anfang" },
    },
    {
      name: "i: named branches below one anchor",
      tree: [
        account,
        ...accountDocs("account/docs", "account"),
        start("account/manuals/start", "account"),
      ],
      order: ["src/routes/account/children.generated.ts", "docs", "manuals/start"],
      words: merge,
      reject: shadows(
        "account/docs/$rest[]",
        "/account/(detail:dokumente/$rest[])",
        "account/manuals/start",
        "/account/(detail:dokumente/anfang)",
      ),
    },
    {
      name: "F3: the named route sorts first",
      tree: [
        account,
        { id: "account/topics", path: "topics", parent: "account", outlet: "detail", page: false },
        {
          id: "account/topics/$rest[]",
          path: "$rest[]",
          parent: "account/topics",
          params: ["rest"],
        },
        { id: "account/guides/start", path: "guides/start", parent: "account", outlet: "detail" },
      ],
      order: ["src/routes/account/children.generated.ts", "guides/start", "topics"],
      words: { topics: "dokumente", guides: "dokumente", start: "anfang" },
    },
    {
      name: "F1: a direct detail route sorts ahead of the wrapper holding the catchall",
      tree: [
        account,
        wrapper("account/+layout", "account"),
        ...accountDocs("account/+layout/docs", "account/+layout"),
        start("account/manuals/start", "account"),
      ],
      order: ["src/routes/account/children.generated.ts", "", "manuals/start"],
      words: merge,
    },
    {
      name: "F1: the direct detail catchall sorts ahead of the wrapper holding the route",
      tree: [
        account,
        wrapper("account/+layout", "account"),
        ...accountDocs("account/docs", "account"),
        start("account/+layout/manuals/start", "account/+layout"),
      ],
      order: ["src/routes/account/children.generated.ts", "", "docs"],
      words: merge,
      reject: shadows(
        "account/docs/$rest[]",
        "/account/(detail:dokumente/$rest[])",
        "account/+layout/manuals/start",
        "/account/(detail:dokumente/anfang)",
      ),
    },
    {
      name: "W: below a wrapper, emitted order decides (route's wrapper first)",
      tree: [
        account,
        wrapper("account/+outer", "account"),
        wrapper("account/+outer/+layout", "account/+outer"),
        ...accountDocs("account/+outer/docs", "account/+outer"),
        start("account/+outer/+layout/manuals/start", "account/+outer/+layout"),
      ],
      order: ["src/routes/account/+outer/children.generated.ts", "", "docs"],
      words: merge,
    },
    {
      name: "W: below a wrapper, emitted order decides (catchall's wrapper first)",
      tree: [
        account,
        wrapper("account/+outer", "account"),
        wrapper("account/+outer/+layout", "account/+outer"),
        ...accountDocs("account/+outer/+layout/docs", "account/+outer/+layout"),
        start("account/+outer/manuals/start", "account/+outer"),
      ],
      order: ["src/routes/account/+outer/children.generated.ts", "", "manuals/start"],
      words: merge,
      reject: shadows(
        "account/+outer/+layout/docs/$rest[]",
        "/account/(detail:dokumente/$rest[])",
        "account/+outer/manuals/start",
        "/account/(detail:dokumente/anfang)",
      ),
    },
    {
      name: "F2: a catchall route shorter than the catchall's prefix",
      tree: [deep, rest, { id: "manuals/$x[]", path: "manuals/$x[]", params: ["x"] }],
      words: merge,
      reject: f2,
    },
    {
      name: "F2: distinct words",
      tree: "same",
      words: { ...merge, manuals: "handbuecher" },
    },
    {
      name: "F2: a hoisted catchall redirect shorter than the catchall's prefix",
      tree: [
        deep,
        rest,
        done,
        { id: "manuals", path: "manuals", page: false },
        {
          id: "manuals/$x[]",
          path: "$x[]",
          parent: "manuals",
          params: ["x"],
          target: "done",
          page: false,
        },
      ],
      words: merge,
      reject: f2,
    },
    {
      name: "empty anchor: a direct detail route sorts ahead of the root wrapper",
      tree: [wrapper("+layout"), ...accountDocs("+layout/docs", "+layout"), start("manuals/start")],
      order: ["generated/routes.generated.ts", "", "manuals/start"],
      words: { ...merge, area: "area", account: "account" },
    },
    {
      name: "empty anchor: the direct detail catchall sorts ahead of the root wrapper",
      tree: [wrapper("+layout"), ...accountDocs("docs"), start("+layout/manuals/start", "+layout")],
      order: ["generated/routes.generated.ts", "", "docs"],
      words: { ...merge, area: "area", account: "account" },
      reject: shadows(
        "docs/$rest[]",
        "/(detail:dokumente/$rest[])",
        "+layout/manuals/start",
        "/(detail:dokumente/anfang)",
      ),
    },
    {
      name: "split anchor: the table of the record that ends the anchor is sorted (keep)",
      tree: [
        { id: "area", path: "area", page: false },
        { id: "area/account", path: "account", parent: "area", page: false },
        wrapper("area/account/+layout", "area/account"),
        ...accountDocs("area/account/+layout/docs", "area/account/+layout"),
        start("area/account/manuals/start", "area/account"),
      ],
      order: ["src/routes/area/account/children.generated.ts", "", "manuals/start"],
      words: { ...merge, area: "area", account: "account" },
    },
    {
      name: "split anchor: the table of the record that ends the anchor is sorted (reject)",
      tree: [
        { id: "area", path: "area", page: false },
        { id: "area/account", path: "account", parent: "area", page: false },
        wrapper("area/account/+layout", "area/account"),
        ...accountDocs("area/account/docs", "area/account"),
        start("area/account/+layout/manuals/start", "area/account/+layout"),
      ],
      order: ["src/routes/area/account/children.generated.ts", "", "docs"],
      words: { ...merge, area: "area", account: "account" },
      reject: shadows(
        "area/account/docs/$rest[]",
        "/area/account/(detail:dokumente/$rest[])",
        "area/account/+layout/manuals/start",
        "/area/account/(detail:dokumente/anfang)",
      ),
    },
  ];

  let project;

  for (const row of rows) {
    if (row.tree !== "same") {
      project = await localizedProject({ extra: { autoDefineRoutes: false } });
      await writeDeclarations(project, row.tree);
    }

    await project.generate({ autoDefineRoutes: false });

    if (row.order) {
      const [file, first, second] = row.order;
      const table = await project.read(file);
      const left = table.indexOf(`path: ${JSON.stringify(first)},`);
      const right = table.indexOf(`path: ${JSON.stringify(second)},`);

      assert.ok(left >= 0 && right >= 0 && left < right, `${row.name}: ${file}`);
    }

    const units = [];

    for (const [word, text] of Object.entries(row.words)) {
      units.push([`route.segment.${word}`, text]);
    }

    await project.catalog(xliff1(units));

    if (!row.reject) {
      await project.translate();

      continue;
    }

    const before = await outputSnapshot(project);
    const tail = row.reject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    await assert.rejects(
      project.translate(),
      new RegExp(`^Error: Locale de: .*: ${tail}$`),
      row.name,
    );
    assert.deepEqual(await outputSnapshot(project), before, row.name);
  }
});

// Sibling pathless groups: the L1 tree, two `+group` folders under the root.
const group = (name, steps = "") =>
  `${outletHeader}\nexport default defineRoute("", {})${steps};\n`;
const child = (path, from = "../route.js", facts = "") =>
  `${outletChild(from)}\nexport default defineRoute(${JSON.stringify(path)}, { parent${facts} });\n`;
const groupRoutes = {
  "+authenticated": group("authenticated", ".canMatch([() => true])"),
  "+authenticated/inbox": child("inbox"),
  "+authenticated/settings": child("settings"),
  "+signed-in": group("signed-in"),
  "+signed-in/+index": child(""),
  "+signed-in/profile": child("profile"),
};
// A root redirect to a declaration whose destination sits at `to`, relative to src/routes.
const redirectTo = (to) =>
  `${outletHeader}import { destination as to } from "../${to}/destination.generated.js";\n\nexport default defineRoute("old", {}).redirect({ to, search: { mode: "drop" }, fragment: { mode: "drop" } });\n`;

// The `..` destination a declaration's RouteTypes entry names, or undefined without one.
function upOf(routes, id) {
  const line = routes.split("\n").find((text) => text.startsWith(`"src/routes/${id}/route.ts": `));

  assert.ok(line, `Missing RouteTypes entry: ${id}`);

  return /up: typeof (destination_\w+)/.exec(line)?.[1];
}

test("sibling pathless groups: each group record owns its descendants' claims; children tables and `..` follow the shared path's winner", async () => {
  const project = await copyProject();
  const result = await project.analyze(groupRoutes);
  const routes = result.desired.get(resolve(project.root, "generated/routes.generated.ts"));
  const authenticated = result.copy("+authenticated", "children");
  const signedIn = result.copy("+signed-in", "children");

  assert.match(routes, /^import \{ record, callbacks, owned, injectGeneratedActiveRoute, /m);
  assert.ok(
    routes.includes(
      `export const routes: Routes = [{ path: "",\n...record(destination__authenticated_route),\n...owned([["inbox"], ["settings"]], callbacks(route__authenticated_route)),\nloadComponent: `,
    ),
    routes,
  );
  assert.ok(
    routes.includes(
      `{ path: "",\n...record(destination__signed_in_route),\n...owned([["profile"], []]),\nloadComponent: `,
    ),
    routes,
  );
  // A guardless group still imports its route copy only as a type.
  assert.match(routes, /^import type \{ route as route__signed_in_route \}/m);

  // Children tables are ordinary: the index matches exactly, no table holds a group.
  assert.doesNotMatch(authenticated, /\.\.\.owned\(/);
  assert.doesNotMatch(signedIn, /\.\.\.owned\(/);
  assert.match(recordOf(signedIn, ""), /^\{ path: "",\npathMatch: 'full',\n/);

  // The one childless declaration at `/` wins it, so every page's `..` is signed-in's index.
  for (const id of ["+authenticated/inbox", "+authenticated/settings", "+signed-in/profile"]) {
    assert.equal(upOf(routes, id), "destination__signed_in__index_route", id);
  }

  assert.equal(upOf(routes, "+authenticated"), undefined);
  assert.equal(upOf(routes, "+signed-in/+index"), undefined);

  // A redirect lands on the winner; a group never ends a path, so it's no target.
  await project.analyze(
    { ...groupRoutes, old: redirectTo("+signed-in/+index") },
    { componentless: ["old"] },
  );

  for (const target of ["+signed-in", "+authenticated"]) {
    await assert.rejects(
      project.analyze({ ...groupRoutes, old: redirectTo(target) }, { componentless: ["old"] }),
      new RegExp(
        `Redirect target is pruned or not the canonical shared-path target: src/routes/\\${target}/route\\.ts$`,
      ),
    );
  }

  // Groups nested in a group, and groups below a parent with a path, are groups too.
  const nested = await project.analyze({
    ...groupRoutes,
    "+authenticated/+mail": child("", "../route.js"),
    "+authenticated/+mail/drafts": child("drafts", "../route.js"),
    "+authenticated/+chat": child("", "../route.js"),
    "+authenticated/+chat/rooms/$id": child(
      "rooms/$id",
      "../../route.js",
      ", params: { id: numberParam }",
    ),
    products: `${outletHeader}\nexport default defineRoute("products", {});\n`,
    "products/+a": child("", "../route.js"),
    "products/+a/list": child("list", "../route.js"),
    "products/+b": child("", "../route.js"),
    "products/+b/detail/$id": child(
      "detail/$id",
      "../../route.js",
      ", params: { id: numberParam }",
    ),
  });
  const nestedRoutes = nested.desired.get(resolve(project.root, "generated/routes.generated.ts"));

  assert.match(
    nestedRoutes,
    /\.\.\.owned\(\[\["drafts"\], \["inbox"\], \["rooms", ":"\], \["settings"\]\], callbacks\(route__authenticated_route\)\)/,
  );
  assert.match(nested.copy("+authenticated", "children"), /\.\.\.owned\(\[\["drafts"\]\]\)/);
  assert.match(nested.copy("+authenticated", "children"), /\.\.\.owned\(\[\["rooms", ":"\]\]\)/);
  assert.match(nested.copy("products", "children"), /\.\.\.owned\(\[\["list"\]\]\)/);
  assert.match(nested.copy("products", "children"), /\.\.\.owned\(\[\["detail", ":"\]\]\)/);
  assert.doesNotMatch(nestedRoutes, /path: "products",[^}]*owned/);
});

test("sibling pathless groups: a lone pathless wrapper is no group, so an existing tree keeps its bytes", async () => {
  const project = await copyProject();
  const lone = {
    "+authenticated": group("authenticated", ".canMatch([() => true])"),
    "+authenticated/inbox": child("inbox"),
    profile: `${outletHeader}\nexport default defineRoute("profile", {});\n`,
  };
  const result = await project.analyze(lone);
  const routes = result.desired.get(resolve(project.root, "generated/routes.generated.ts"));

  assert.doesNotMatch(routes, /\.\.\.owned\(|, owned/);
  assert.match(routes, /\.\.\.callbacks\(route__authenticated_route\),/);
  assert.equal(
    result.sources.declarations.some((declaration) => declaration.group || declaration.fallback),
    false,
  );

  // A pathless leaf beside it, which collided before, makes the wrapper a group; the leaf ends
  // `/` and is no group, having no children.
  const leaf = await project.analyze({
    ...lone,
    "+home": `${outletHeader}\nexport default defineRoute("", {});\n`,
  });
  const groups = [];

  for (const declaration of leaf.sources.declarations) {
    if (declaration.group) {
      groups.push(declaration.id);
    }
  }

  assert.deepEqual(groups, ["src/routes/+authenticated/route.ts"]);
  assert.match(
    leaf.desired.get(resolve(project.root, "generated/routes.generated.ts")),
    /\.\.\.owned\(\[\["inbox"\]\], callbacks\(route__authenticated_route\)\)/,
  );
});

test("sibling pathless groups: descendants' real collisions still fail, naming the groups", async () => {
  const project = await copyProject();
  const prefix = (a, b) =>
    `Ordinary route collision/overlap: src/routes/${a[0]}/route.ts \\(${a[1]}\\); src/routes/${b[0]}/route.ts \\(${b[1]}\\)`;
  const suffix =
    ", in sibling pathless groups src/routes/\\+authenticated/route.ts and src/routes/\\+signed-in/route.ts$";

  for (const [extra, pattern] of [
    [
      { "+authenticated/profile": child("profile") },
      prefix(["\\+authenticated/profile", "/profile"], ["\\+signed-in/profile", "/profile"]) +
        suffix,
    ],
    [
      {
        "+authenticated/items/$id": child(
          "items/$id",
          "../../route.js",
          ", params: { id: numberParam }",
        ),
        "+signed-in/items/$slug": child(
          "items/$slug",
          "../../route.js",
          ", params: { slug: stringParam }",
        ),
      },
      prefix(
        ["\\+authenticated/items/\\$id", "/items/\\$id"],
        ["\\+signed-in/items/\\$slug", "/items/\\$slug"],
      ) + suffix,
    ],
    [
      {
        "+authenticated/items/$id": child(
          "items/$id",
          "../../route.js",
          ", params: { id: numberParam }",
        ),
        "+signed-in/items/new": child("items/new", "../../route.js"),
      },
      prefix(
        ["\\+authenticated/items/\\$id", "/items/\\$id"],
        ["\\+signed-in/items/new", "/items/new"],
      ) + suffix,
    ],
    [
      { "+authenticated/+index": child("") },
      prefix(["\\+authenticated/\\+index", "/"], ["\\+signed-in/\\+index", "/"]) + suffix,
    ],
    // A lone pathless chain inside a group ends `/` itself.
    [
      {
        "+authenticated/+inner": child(""),
        "+authenticated/+inner/deep": child("deep"),
      },
      prefix(["\\+authenticated/\\+inner", "/"], ["\\+signed-in/\\+index", "/"]) + suffix,
    ],
    // A group's descendant against a root-level route: not across groups, so no suffix.
    [
      { inbox: `${outletHeader}\nexport default defineRoute("inbox", {});\n` },
      `${prefix(["\\+authenticated/inbox", "/inbox"], ["inbox", "/inbox"])}$`,
    ],
  ]) {
    await assert.rejects(project.analyze({ ...groupRoutes, ...extra }), new RegExp(pattern));
  }
});

test("sibling pathless groups: a group holding a catchall is tried last and may not shadow a route outside it", async () => {
  const project = await copyProject();
  const catchall = (path, from = "../route.js") =>
    child(path, from, ", params: { rest: stringParam }");
  const fallback = {
    ...groupRoutes,
    "+authenticated/$rest[]": catchall("$rest[]"),
    outside: `${outletHeader}\nexport default defineRoute("outside", {});\n`,
  };
  const result = await project.analyze(fallback);
  const routes = result.desired.get(resolve(project.root, "generated/routes.generated.ts"));
  const order = [...routes.matchAll(/\.\.\.record\((destination_\w+)/g)].map((match) => match[1]);

  assert.deepEqual(order, [
    "destination__signed_in_route",
    "destination_outside_route",
    "destination__authenticated_route",
  ]);
  assert.match(routes, /\.\.\.owned\(\[\["\*\*"\], \["inbox"\], \["settings"\]\], /);

  const shadow = (catchallId, catchallPath, otherId, otherPath) =>
    new RegExp(
      `Catchall in a pathless group shadows a route outside it: src/routes/${catchallId}/route\\.ts \\(${catchallPath}\\) is tried before src/routes/${otherId}/route\\.ts \\(${otherPath}\\)$`,
    );

  for (const [extra, pattern] of [
    // Both groups fall back, and the first one's catchall covers the second one's route.
    [
      {
        "+authenticated/$rest[]": undefined,
        "+authenticated/docs/$rest[]": catchall("docs/$rest[]", "../../route.js"),
        "+signed-in/docs/intro": child("docs/intro", "../../route.js"),
        "+signed-in/$rest[]": catchall("$rest[]"),
      },
      shadow(
        "\\+authenticated/docs/\\$rest\\[\\]",
        "/docs/\\$rest\\[\\]",
        "\\+signed-in/[^ ]+",
        "/[^ ]+",
      ),
    ],
    // A group's catchall before a root-level catchall.
    [
      {
        $rest: undefined,
        "$rest[]": `${outletHeader}\nexport default defineRoute("$rest[]", { params: { rest: stringParam } });\n`,
      },
      shadow("\\+authenticated/\\$rest\\[\\]", "/\\$rest\\[\\]", "\\$rest\\[\\]", "/\\$rest\\[\\]"),
    ],
    // Catchalls in both groups: their parents differ, so this isn't a sibling competition.
    [
      { "+signed-in/$rest[]": catchall("$rest[]") },
      shadow(
        "\\+authenticated/\\$rest\\[\\]",
        "/\\$rest\\[\\]",
        "\\+signed-in/\\$rest\\[\\]",
        "/\\$rest\\[\\]",
      ),
    ],
  ]) {
    const routesWith = { ...fallback };

    for (const [key, text] of Object.entries(extra)) {
      if (text === undefined) {
        delete routesWith[key];
      } else {
        routesWith[key] = text;
      }
    }

    await assert.rejects(project.analyze(routesWith), pattern);
  }

  // Inside one group a catchall backs its siblings, as in any table.
  await project.analyze({
    ...fallback,
    "+authenticated/docs/intro": child("docs/intro", "../../route.js"),
  });

  // Where the chains part at an ordinary record, its table order decides, as without groups:
  // `docs` is tried before the root's `docs/intro`, so a catchall below it shadows that route
  // whether or not the catchall sits in a group (§3's fallback overlap).
  const rest = ", params: { rest: stringParam }";

  for (const routesWith of [
    {
      docs: `${outletHeader}\nexport default defineRoute("docs", {});\n`,
      "docs/$rest[]": child("$rest[]", "../route.js", rest),
      intro: `${outletHeader}\nexport default defineRoute("docs/intro", {});\n`,
    },
    {
      docs: `${outletHeader}\nexport default defineRoute("docs", {});\n`,
      "docs/+a": child(""),
      "docs/+a/$rest[]": child("$rest[]", "../route.js", rest),
      "docs/+b": child(""),
      "docs/+b/other": child("other"),
      intro: `${outletHeader}\nexport default defineRoute("docs/intro", {});\n`,
    },
  ]) {
    const result = await project.analyze(routesWith);

    if (routesWith["docs/+a"]) {
      assert.match(result.copy("docs", "children"), /\.\.\.owned\(\[\["\*\*"\]\]\)/);
    }
  }
});

test("sibling pathless groups: a named branch can't hang at a group's own path", async () => {
  const project = await copyProject();
  const branch = (from) =>
    `${outletChild(from)}\nexport default defineRoute("chat/$id", { parent, outlet: "chat", params: { id: numberParam } });\n`;
  const message = (id) =>
    new RegExp(
      `A named-outlet route can't hang at a pathless group's own path while the group has pathless siblings: src/routes/${id}/route\\.ts; give it a parent with a path, or declare it beside the groups$`,
    );

  await assert.rejects(
    project.analyze({ ...groupRoutes, "+authenticated/chat/$id": branch("../../route.js") }),
    message("\\+authenticated/chat/\\$id"),
  );
  // Through a lone pathless wrapper inside the group too (which ends `/` itself, so no index).
  const noIndex = { ...groupRoutes };

  delete noIndex["+signed-in/+index"];
  await assert.rejects(
    project.analyze({
      ...noIndex,
      "+authenticated/+panel": child(""),
      "+authenticated/+panel/deep": child("deep"),
      "+authenticated/+panel/chat/$id": branch("../../route.js"),
    }),
    message("\\+authenticated/\\+panel/chat/\\$id"),
  );

  // Beside the groups, or below a primary route with a path inside one, a branch is fine.
  const admitted = await project.analyze({
    ...groupRoutes,
    "chat/$id": `${outletHeader}\nexport default defineRoute("chat/$id", { outlet: "chat", params: { id: numberParam } });\n`,
    "+authenticated/products": child("products"),
    "+authenticated/products/item/$id": `${outletChild("../../route.js")}\nexport default defineRoute("item/$id", { parent, outlet: "detail", params: { id: numberParam } });\n`,
  });
  const routes = admitted.desired.get(resolve(project.root, "generated/routes.generated.ts"));

  assert.match(routes, /\.\.\.owned\(\[\["inbox"\], \["products"\], \["settings"\]\], /);
  // The index sits at the chat branch's anchor, so it prefix-matches; the group still claims `/`.
  assert.match(
    recordOf(admitted.copy("+signed-in", "children"), ""),
    /^\{ path: "",\n\.\.\.record\(/,
  );
  assert.match(routes, /\.\.\.owned\(\[\["profile"\], \[\]\]\)/);
});

test("sibling pathless groups: shared paths without a childless declaration have no winner", async () => {
  const project = await copyProject();
  const noIndex = { ...groupRoutes };

  delete noIndex["+signed-in/+index"];

  // At the root: no `..` for top-level pages, and neither group is a redirect target.
  const root = await project.analyze(noIndex);
  const rootRoutes = root.desired.get(resolve(project.root, "generated/routes.generated.ts"));

  for (const id of ["+authenticated/inbox", "+authenticated/settings", "+signed-in/profile"]) {
    assert.equal(upOf(rootRoutes, id), undefined, id);
  }

  assert.match(rootRoutes, /\.\.\.owned\(\[\["profile"\]\]\)/);

  for (const target of ["+signed-in", "+authenticated"]) {
    await assert.rejects(
      project.analyze({ ...noIndex, old: redirectTo(target) }, { componentless: ["old"] }),
      /Redirect target is pruned or not the canonical shared-path target: /,
    );
  }

  // Below `products`: the parent and both groups share /products, and none of them ends it.
  const products = {
    products: `${outletHeader}\nexport default defineRoute("products", {});\n`,
    "products/+a": child("", "../route.js"),
    "products/+a/inbox": child("inbox", "../route.js"),
    "products/+b": child("", "../route.js"),
    "products/+b/profile": child("profile", "../route.js"),
  };
  const nested = await project.analyze(products);
  const nestedRoutes = nested.desired.get(resolve(project.root, "generated/routes.generated.ts"));

  assert.equal(upOf(nestedRoutes, "products/+a/inbox"), undefined);
  assert.equal(upOf(nestedRoutes, "products/+b/profile"), undefined);
  await assert.rejects(
    project.analyze({ ...products, old: redirectTo("products") }, { componentless: ["old"] }),
    /Redirect target is pruned or not the canonical shared-path target: src\/routes\/products\/route\.ts$/,
  );

  // An index in either group wins /products for every page below it.
  const indexed = { ...products, "products/+b/+index": child("", "../route.js") };
  const withIndex = await project.analyze(indexed);
  const indexedRoutes = withIndex.desired.get(
    resolve(project.root, "generated/routes.generated.ts"),
  );

  assert.equal(upOf(indexedRoutes, "products/+a/inbox"), "destination_products__b__index_route");
  assert.equal(upOf(indexedRoutes, "products/+b/profile"), "destination_products__b__index_route");
  await project.analyze(
    { ...indexed, old: redirectTo("products/+b/+index") },
    { componentless: ["old"] },
  );

  for (const target of ["products", "products/+a", "products/+b"]) {
    await assert.rejects(
      project.analyze({ ...indexed, old: redirectTo(target) }, { componentless: ["old"] }),
      /Redirect target is pruned or not the canonical shared-path target: /,
    );
  }

  // A path one declaration holds is still its own winner, children or not.
  const teams = {
    teams: `${outletHeader}\nexport default defineRoute("teams", {});\n`,
    "teams/$id": child("$id", "../route.js", ", params: { id: numberParam }"),
  };
  const singleton = await project.analyze(teams);

  assert.equal(
    upOf(
      singleton.desired.get(resolve(project.root, "generated/routes.generated.ts")),
      "teams/$id",
    ),
    "destination_teams_route",
  );
  await project.analyze({ ...teams, old: redirectTo("teams") }, { componentless: ["old"] });
});

test("sibling pathless groups: a declaration below a group changes only its own files and the tables that hold it", async () => {
  const project = await copyProject();
  const before = await project.analyze(groupRoutes);
  const after = await project.analyze({
    ...groupRoutes,
    "+authenticated/archive": child("archive"),
  });
  const changed = [];

  for (const [file, text] of after.desired) {
    if (before.desired.get(file) !== text) {
      changed.push(relative(project.root, file).split(sep).join("/"));
    }
  }

  assert.deepEqual(changed.sort(), [
    "generated/routes.generated.ts",
    "src/routes/+authenticated/archive/destination.generated.ts",
    "src/routes/+authenticated/archive/route.generated.ts",
    "src/routes/+authenticated/children.generated.ts",
  ]);
  assert.match(
    after.desired.get(resolve(project.root, "generated/routes.generated.ts")),
    /\.\.\.owned\(\[\["archive"\], \["inbox"\], \["settings"\]\], /,
  );
});

test("translated segments: a group's claims carry its descendants' messages, and a merge across groups collides", async () => {
  const project = await localizedProject();

  for (const directory of [
    "+authenticated",
    "+authenticated/inbox",
    "+authenticated/settings",
    "+signed-in",
    "+signed-in/+index",
    "+signed-in/profile",
  ]) {
    await project.page(directory);
  }

  await project.translate();

  const routes = await project.routes();
  const message = (word) =>
    `$localize\`:URL path segment|One segment of page URLs, without "/". Changing it changes links and bookmarks.@@route.segment.${word}:${word}\``;

  assert.ok(
    routes.includes(`...owned([[${message("inbox")}], [${message("settings")}]]),`),
    routes,
  );
  assert.ok(routes.includes(`...owned([[${message("profile")}], []]),`), routes);

  // A word that reads the same in two groups in one locale is a collision there alone.
  await project.catalog(
    xliff1([
      ["route.segment.inbox", "konto"],
      ["route.segment.profile", "konto"],
    ]),
  );
  await assert.rejects(
    project.translate(),
    /^Error: Locale de: .*Ordinary route collision\/overlap: src\/routes\/\+authenticated\/inbox\/route\.ts \(\/konto\); src\/routes\/\+signed-in\/profile\/route\.ts \(\/konto\), in sibling pathless groups src\/routes\/\+authenticated\/route\.ts and src\/routes\/\+signed-in\/route\.ts$/,
  );
});

// Serve skips events for templates, styles, images, fonts and Markdown between passes
// (src/builders/serve-events.ts), so a pass must give the same files and words whatever those
// files hold, are, or whether they're there at all.

// Every generated file in the project, by path: the per-route copies and children tables beside
// their routes, and the output directory.
async function generatedFiles(root) {
  const files = {};

  for (const directory of ["src", "generated"]) {
    for (const name of await readdir(resolve(root, directory), { recursive: true })) {
      const path = `${directory}/${name.split(sep).join("/")}`;

      if (path.includes(".generated.")) {
        files[path] = await readFile(resolve(root, path), "utf8");
      }
    }
  }

  return files;
}

// A localized project whose docs page has an external template and style, imports an icon
// through its declaration companion and a stylesheet through a `declare module` wildcard, and sits
// next to a font and a Markdown file. Its passes share one session, as serve's do.
async function assetProject({ declareStyles = true } = {}) {
  const project = await localizedProject({
    catalog: xliff1([["route.segment.docs", "dokumente"]]),
  });
  const state = {
    discovery: new CompilerState(),
    overlay: new CompilerState(),
    anchor: new AnchorState(),
  };

  await project.write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
        experimentalDecorators: true,
        allowArbitraryExtensions: true,
        lib: ["ES2022", "DOM"],
        types: ["@angular/localize"],
      },
      include: ["src/**/*.ts"],
    }),
  );

  if (declareStyles) {
    await project.write("src/styles.d.ts", 'declare module "*.css";\n');
  }

  await Promise.all([
    project.write(
      "src/routes/docs/page.ts",
      `import { Component } from "@angular/core";
import { icon } from "./icon.svg";
import "./theme.css";

@Component({ templateUrl: "./page.html", styleUrl: "./page.css" })
export default class Page {
  readonly icon = icon;
}
`,
    ),
    project.write("src/routes/docs/icon.d.svg.ts", "export declare const icon: string;\n"),
    project.write("src/routes/docs/icon.svg", "<svg/>\n"),
    project.write("src/routes/docs/theme.css", "body { margin: 0; }\n"),
    project.write("src/routes/docs/page.html", "<h1>Docs</h1>\n"),
    project.write("src/routes/docs/page.css", "h1 { color: red; }\n"),
    project.write("src/routes/docs/fonts/body.woff2", "font\n"),
    project.write("src/routes/docs/README.md", "# Docs\n"),
  ]);

  // The serve builder's contract: any failed pass clears every slot. Returns the pass's words.
  async function pass() {
    try {
      const generation = await generate(
        project.root,
        {
          tsconfig: "tsconfig.json",
          scanDirectories: ["src/routes"],
          outDirectory: "generated",
          translateSegments: true,
          localization: project.localization,
        },
        () => false,
        state,
      );

      return generation.words;
    } catch (error) {
      state.discovery.clear();
      state.overlay.clear();
      state.anchor.clear();

      throw error;
    }
  }

  return { ...project, pass };
}

test("adding, editing and removing templates, styles, images, fonts and Markdown leaves a pass's files and words unchanged", async () => {
  const project = await assetProject();
  const words = await project.pass();
  const files = await generatedFiles(project.root);
  const remove = (path) => rm(resolve(project.root, path));

  assert.deepEqual(words, new Map([["de", new Map([["docs", "dokumente"]])]]));
  assert.ok(files["src/routes/docs/route.generated.ts"]);

  const steps = {
    added: () =>
      Promise.all([
        project.write("src/routes/docs/extra.html", "<p>Extra</p>\n"),
        project.write("src/routes/docs/extra.scss", "p { margin: 0; }\n"),
        project.write("src/routes/docs/extra.svg", "<svg/>\n"),
        project.write("src/routes/docs/fonts/extra.woff2", "font\n"),
        project.write("src/routes/extra.md", "# Extra\n"),
      ]),
    edited: () =>
      Promise.all([
        project.write("src/routes/docs/page.html", "<h1>{{ icon }}</h1>\n"),
        project.write("src/routes/docs/page.css", "h1 { color: blue; }\n"),
        project.write("src/routes/docs/icon.svg", "<svg><path/></svg>\n"),
        project.write("src/routes/docs/theme.css", "not a stylesheet {\n"),
        project.write("src/routes/docs/fonts/body.woff2", "another font\n"),
        project.write("src/routes/docs/README.md", "# Edited\n"),
      ]),
    removed: () =>
      Promise.all([
        remove("src/routes/docs/extra.html"),
        remove("src/routes/docs/extra.scss"),
        remove("src/routes/docs/extra.svg"),
        remove("src/routes/docs/fonts/extra.woff2"),
        remove("src/routes/extra.md"),
        // Imported, through the companion and through the wildcard.
        remove("src/routes/docs/icon.svg"),
        remove("src/routes/docs/theme.css"),
        remove("src/routes/docs/page.html"),
        remove("src/routes/docs/page.css"),
      ]),
  };

  for (const [name, step] of Object.entries(steps)) {
    await step();
    assert.deepEqual(await project.pass(), words, `Words after the assets were ${name}`);
    assert.deepEqual(
      await generatedFiles(project.root),
      files,
      `Files after the assets were ${name}`,
    );
  }

  // The session's passes published what stateless generation would.
  await generate(
    project.root,
    {
      tsconfig: "tsconfig.json",
      scanDirectories: ["src/routes"],
      outDirectory: "generated",
      translateSegments: true,
      localization: project.localization,
      check: true,
    },
    () => false,
  );
});

// Such a project never has a successful pass, so serve never skips an event for that stylesheet.
test("a side-effect import of a stylesheet without a declaration fails generation, whether or not the file is there", async () => {
  const project = await assetProject({ declareStyles: false });

  await assert.rejects(project.pass(), /Unresolved import: \.\/theme\.css/);
  await rm(resolve(project.root, "src/routes/docs/theme.css"));
  await assert.rejects(project.pass(), /Unresolved import: \.\/theme\.css/);
});

test("a symlinked image in the scan directory fails generation", async () => {
  const project = await assetProject();

  await project.pass();
  await symlink(
    resolve(project.root, "src/routes/docs/icon.svg"),
    resolve(project.root, "src/routes/docs/linked.svg"),
  );
  await assert.rejects(project.pass(), /Unsafe source\/output symbolic link: .*linked\.svg/);
});
