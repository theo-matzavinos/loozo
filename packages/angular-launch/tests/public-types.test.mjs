import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { test } from "node:test";
import ts from "typescript";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const dist = new URL("../dist/", import.meta.url).pathname;

// "_" entries couple generated code to this package; they're not public API.
const entries = [];

for (const [entry, target] of Object.entries(manifest.exports)) {
  if (entry === "./package.json" || entry.startsWith("./_")) {
    continue;
  }

  entries.push(new URL(`../${target.types}`, import.meta.url).pathname);
}

const namedTypes =
  ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Class | ts.SymbolFlags.Enum;

function referencedName(node) {
  if (ts.isTypeReferenceNode(node)) {
    return node.typeName;
  }

  if (ts.isExpressionWithTypeArguments(node)) {
    return node.expression;
  }

  if (ts.isTypeQueryNode(node)) {
    return node.exprName;
  }

  if (ts.isImportTypeNode(node)) {
    return node.qualifier;
  }

  return undefined;
}

function location(root, node) {
  const source = node.getSourceFile();
  const { line } = ts.getLineAndCharacterOfPosition(source, node.getStart());
  let statement = node;

  while (!ts.isSourceFile(statement.parent)) {
    statement = statement.parent;
  }

  const owner = statement.name?.getText() ?? ts.SyntaxKind[statement.kind];

  return `${owner} at ${relative(root, source.fileName)}:${line + 1}`;
}

// An application's exported value whose inferred type mentions one of this package's types
// emits a reference to it. A type its module exports is then named by a deep path the exports
// map blocks (TS2883, or a non-portable import), so a public entry must export it. A module's
// unexported interface, class or enum can't be named at all (TS4058); only an unexported type
// alias is safe, because TypeScript writes out its definition instead. "Exports" means the
// module's export table, so `type X = …; export { X };` counts as exported.
//
// `problems` lists anything that would make that check pass without looking: compiler errors
// (such as a missing module), a public entry with no exports, and exports or references that
// don't resolve to a declaration.
function checkDeclarations(root, files) {
  const program = ts.createProgram(files, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const problems = [];

  for (const source of program.getSourceFiles()) {
    if (!source.fileName.startsWith(root)) {
      continue;
    }

    const diagnostics = [
      ...program.getSyntacticDiagnostics(source),
      ...program.getSemanticDiagnostics(source),
    ];

    for (const diagnostic of diagnostics) {
      const { line } = ts.getLineAndCharacterOfPosition(source, diagnostic.start);
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");

      problems.push(
        `TS${diagnostic.code} at ${relative(root, source.fileName)}:${line + 1}: ${message}`,
      );
    }
  }

  function resolved(symbol) {
    if (symbol.flags & ts.SymbolFlags.Alias) {
      return checker.getAliasedSymbol(symbol);
    }

    return symbol;
  }

  const moduleExports = new Map();

  function exportsOf(source) {
    let symbols = moduleExports.get(source);

    if (symbols) {
      return symbols;
    }

    symbols = new Set();

    const module = checker.getSymbolAtLocation(source);

    if (module) {
      for (const symbol of checker.getExportsOfModule(module)) {
        symbols.add(resolved(symbol));
      }
    }

    moduleExports.set(source, symbols);

    return symbols;
  }

  const exported = new Set();
  const pending = [];

  for (const file of files) {
    const source = program.getSourceFile(file);

    assert.ok(source, `Published declarations must exist: ${file}`);

    const module = checker.getSymbolAtLocation(source);

    assert.ok(module, `Published declarations must be a module: ${file}`);

    const symbols = checker.getExportsOfModule(module);

    if (symbols.length === 0) {
      problems.push(`${relative(root, file)} exports nothing`);
    }

    for (const symbol of symbols) {
      const target = resolved(symbol);

      if (!target.declarations?.length) {
        problems.push(`${symbol.name} exported by ${relative(root, file)} doesn't resolve`);
      }

      for (const declaration of target.declarations ?? []) {
        exported.add(declaration);
        pending.push(declaration);
      }
    }
  }

  const visited = new Set();
  const unexported = new Map();

  function visit(node) {
    const name = referencedName(node);

    if (name) {
      let identifier = name;

      if (ts.isQualifiedName(name)) {
        identifier = name.right;
      }

      let symbol = checker.getSymbolAtLocation(identifier);

      if (symbol) {
        symbol = resolved(symbol);
      }

      if (!symbol?.declarations?.length) {
        problems.push(`${name.getText()} referenced by ${location(root, node)} doesn't resolve`);
      }

      const declarations = [];

      for (const declaration of symbol?.declarations ?? []) {
        if (declaration.getSourceFile().fileName.startsWith(root)) {
          declarations.push(declaration);
        }
      }

      if (declarations.length > 0 && symbol.flags & namedTypes) {
        let isPublic = false;
        let isInlined = (symbol.flags & ts.SymbolFlags.TypeAlias) !== 0;

        for (const declaration of declarations) {
          if (exported.has(declaration)) {
            isPublic = true;
          }

          if (exportsOf(declaration.getSourceFile()).has(symbol)) {
            isInlined = false;
          }
        }

        if (!isInlined && !isPublic) {
          const key = `${symbol.name} (${relative(root, declarations[0].getSourceFile().fileName)})`;
          const sites = unexported.get(key) ?? new Set();

          sites.add(location(root, node));
          unexported.set(key, sites);
        }
      }

      for (const declaration of declarations) {
        pending.push(declaration);
      }
    }

    ts.forEachChild(node, visit);
  }

  while (pending.length > 0) {
    const declaration = pending.pop();

    if (visited.has(declaration)) {
      continue;
    }

    visited.add(declaration);
    visit(declaration);
  }

  const offenders = [];

  for (const [type, sites] of unexported) {
    offenders.push(`${type} referenced by ${[...sites].join(", ")}`);
  }

  offenders.sort();

  return { problems, offenders };
}

await test("published declarations only reference types exported from public entries", () => {
  const { problems, offenders } = checkDeclarations(dist, entries);

  assert.deepEqual(problems, [], "Published declarations must resolve completely");
  assert.deepEqual(offenders, [], "Referenced types must be exported from a public entry");
});

await test("a type alias exported through an export list counts as exported", () => {
  const fixture = new URL("fixtures/export-list/", import.meta.url).pathname;
  const { problems, offenders } = checkDeclarations(fixture, [`${fixture}index.d.ts`]);

  assert.deepEqual(problems, []);
  assert.deepEqual(offenders, [
    "Status (definitions.d.ts) referenced by Definition at definitions.d.ts:4",
  ]);
});
