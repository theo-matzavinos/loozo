// Fails when the Origami version fold's ng-add installs isn't on npm, or doesn't declare every
// @loozo/origami-ui/<subpath> fold's components import. Publish runs it before a fold release.
// Usage: node scripts/check-origami-pin.mjs [fold root, default: this package]
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const foldRoot = process.argv[2] ?? fileURLToPath(new URL("..", import.meta.url));
const schematic = readFileSync(join(foldRoot, "schematics/ng-add/index.ts"), "utf8");
// The shape scripts/bump-version.mjs writes on an Origami release.
const pinMatch = /"@loozo\/origami-ui": "(\d+\.\d+\.\d+)"/.exec(schematic);

if (pinMatch === null) {
  console.error("fold-ui: can't find the @loozo/origami-ui pin in schematics/ng-add/index.ts");
  process.exit(1);
}

const pin = pinMatch[1];
// Each imported subpath, mapped to its first import site.
const needed = new Map();

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      walk(path);
      continue;
    }

    if (entry.name.endsWith(".ts")) {
      collectSubpaths(path);
    }
  }
}

// Module specifiers come from the syntax tree: import and export declarations (`export * as`
// and barrel re-exports included), `import x = require()`, import() and import.defer() calls and
// import types. Comments, strings and regex literals aren't those nodes, so they never count.
function collectSubpaths(path) {
  const file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);

  function record(literal) {
    const match = /^@loozo\/origami-ui\/(.+)$/.exec(literal.text);

    if (match === null) {
      return;
    }

    const subpath = `./${match[1]}`;

    if (!needed.has(subpath)) {
      const line = file.getLineAndCharacterOfPosition(literal.getStart()).line + 1;

      needed.set(subpath, `${relative(foldRoot, path)}:${line}`);
    }
  }

  function visit(node) {
    const isDeclaration = ts.isImportDeclaration(node) || ts.isExportDeclaration(node);

    if (
      isDeclaration &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      record(node.moduleSpecifier);
    }

    const isExternalImportEquals =
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression);

    if (isExternalImportEquals) {
      record(node.moduleReference.expression);
    }

    // import() and import.defer().
    if (
      ts.isImportCall(node) &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      record(node.arguments[0]);
    }

    // A type such as `import("…").Options` or `typeof import("…")` needs the subpath too.
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      record(node.argument.literal);
    }

    ts.forEachChild(node, visit);
  }

  visit(file);
}

walk(join(foldRoot, "components"));

let response;

try {
  response = await fetch(`https://registry.npmjs.org/@loozo%2forigami-ui/${pin}`);
} catch (error) {
  console.error(
    `fold-ui: couldn't reach the npm registry for @loozo/origami-ui@${pin} (${error.message}). Retry the run.`,
  );
  process.exit(1);
}

if (response.status === 404) {
  console.error(
    `fold-ui cannot publish: @loozo/origami-ui@${pin} isn't on npm. If its Origami release run pushed the tag but failed to publish, rerun that run's publish job; then start a new Fold Publish run.`,
  );
  process.exit(1);
}

if (!response.ok) {
  console.error(
    `fold-ui: couldn't reach the npm registry for @loozo/origami-ui@${pin} (HTTP ${response.status}). Retry the run.`,
  );
  process.exit(1);
}

let manifest;

try {
  manifest = await response.json();
} catch (error) {
  console.error(
    `fold-ui: couldn't read the npm registry's manifest for @loozo/origami-ui@${pin} (${error.message}). Retry the run.`,
  );
  process.exit(1);
}

// A 200 whose JSON isn't this version's manifest is a registry failure, not a missing export.
const isPinManifest = typeof manifest === "object" && manifest !== null && manifest.version === pin;

if (!isPinManifest) {
  console.error(
    `fold-ui: couldn't read the npm registry's manifest for @loozo/origami-ui@${pin} (the answer isn't that version's manifest). Retry the run.`,
  );
  process.exit(1);
}

const exported = new Set(Object.keys(manifest.exports ?? {}));
const missing = [];

for (const subpath of needed.keys()) {
  if (!exported.has(subpath)) {
    missing.push(subpath);
  }
}

missing.sort((a, b) => a.localeCompare(b));

if (missing.length > 0) {
  console.error(
    `fold-ui cannot publish: @loozo/origami-ui@${pin} doesn't export ${missing.length} of the ${needed.size} subpaths fold imports:`,
  );

  for (const subpath of missing) {
    console.error(`  ${subpath}  (first import: ${needed.get(subpath)})`);
  }

  console.error(
    "Release Origami with these entry points first. Its bump rewrites this pin; then start a new Fold Publish run from the updated main.",
  );
  process.exit(1);
}

console.log(`@loozo/origami-ui@${pin} exports all ${needed.size} subpaths fold imports.`);
