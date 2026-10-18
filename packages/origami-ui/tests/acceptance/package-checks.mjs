import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { inventory, typeOnly } from "./inventory.mjs";
import { verifyConsumerDependencies } from "./consumer-install.mjs";

const require = createRequire(path.resolve(".scratch/consumer/package.json"));
const dependencyIdentity = await verifyConsumerDependencies();

// JIT support, if needed by a public APF runtime import, must initialize the application's core.
// The parent compiler CLI's own framework instance is only a build-tool dependency.
await import(pathToFileURL(require.resolve("@angular/compiler")).href);

const manifestPath = require.resolve("@loozo/origami-ui/package.json");
const installedDirectory = path.dirname(manifestPath);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const expectedKeys = new Set([".", "./package.json"]);
const result = [];

for (const [entrypoint, expected] of Object.entries(inventory)) {
  let key = ".";
  let name = "@loozo/origami-ui";

  if (entrypoint) {
    key = `./${entrypoint}`;
    name += `/${entrypoint}`;
  }

  expectedKeys.add(key);

  const exports = manifest.exports[key];

  assert.ok(exports?.types, `${name} has no declaration export`);

  const declaration = path.resolve(installedDirectory, exports.types);
  const program = ts.createProgram([declaration], {
    strict: true,
    skipLibCheck: false,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.Preserve,
    target: ts.ScriptTarget.ES2022,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(declaration);

  assert.ok(source);

  const moduleSymbol = checker.getSymbolAtLocation(source);

  assert.ok(moduleSymbol);

  const actual = checker
    .getExportsOfModule(moduleSymbol)
    .map((symbol) => symbol.name)
    .sort();

  if (!entrypoint) {
    assert.deepEqual(actual, [], "Root must be wholly empty, including type-only/internal exports");
  }

  const supported = actual.filter((symbol) => !symbol.startsWith("ɵ"));

  assert.deepEqual(
    supported,
    [...expected].sort(),
    `${name} declaration inventory including type-only exports`,
  );

  for (const [owner, root] of [
    ["accordion", "ɵOrigamiAccordionRoot"],
    ["toggle-group", "ɵOrigamiToggleGroupRoot"],
    ["radio-group", "ɵOrigamiRadioGroupRoot"],
    ["toolbar", "ɵOrigamiToolbarControl"],
  ]) {
    if (entrypoint === owner) {
      assert.ok(actual.includes(root), `Compiler-required ${root} importability must be preserved`);
    }
  }

  const module = await import(pathToFileURL(require.resolve(name)).href);
  const valueNames = [];

  for (const symbolName of expected) {
    if (!typeOnly.has(symbolName)) {
      valueNames.push(symbolName);
    }
  }

  if (!entrypoint) {
    assert.deepEqual(Object.keys(module), [], "Root runtime must be empty");
  }

  const runtimeNames = Object.keys(module)
    .filter((symbol) => !symbol.startsWith("ɵ"))
    .sort();

  assert.deepEqual(runtimeNames, valueNames.sort(), `${name} runtime exports`);

  for (const target of new Set([exports.types, exports.default, exports.import])) {
    if (typeof target !== "string") {
      continue;
    }

    const installed = await readFile(path.resolve(installedDirectory, target));
    const built = await readFile(path.resolve("dist", target));

    assert.ok(installed.equals(built), `Stale installed package file: ${target}`);
  }

  result.push({
    entrypoint: name,
    declaration,
    exports: actual,
    declarationSha256: createHash("sha256")
      .update(await readFile(declaration))
      .digest("hex"),
  });
}

assert.deepEqual(
  Object.keys(manifest.exports).sort(),
  [...expectedKeys].sort(),
  "APF entrypoint map",
);
await mkdir(".acceptance-evidence", { recursive: true });
await writeFile(".acceptance-evidence/package-inventory.json", JSON.stringify(result, null, 2));
await writeFile(
  ".acceptance-evidence/consumer-dependency-identity.json",
  JSON.stringify(dependencyIdentity, null, 2),
);
console.log(
  "P1: genuine installed APF inventories and bytes agree, including empty root and type-only exports.",
);
