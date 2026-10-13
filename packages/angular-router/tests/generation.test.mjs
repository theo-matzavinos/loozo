import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import { CompilerState } from "../node/src/generation/index.js";

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
