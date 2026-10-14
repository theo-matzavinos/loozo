import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

// "_" entries couple generated code to this package; they're not public API.
const entries = [];

for (const [entry, target] of Object.entries(manifest.exports)) {
  if (entry === "./package.json" || entry.startsWith("./_")) {
    continue;
  }

  entries.push({ entry, file: new URL(`../${target.types}`, import.meta.url).pathname });
}

// A summary containing {@link} is a node array, not a string.
function documented(node) {
  return node.jsDoc?.some((doc) => ts.getTextOfJSDocComment(doc.comment)?.trim()) === true;
}

function memberName(member) {
  if (member.name) {
    return member.name.getText();
  }

  return ts.SyntaxKind[member.kind];
}

// Type literals inside exported types and function signatures are API too, including those in
// function parameters and results. A conditional type's check is a pattern, not API.
function checkTypeLiterals(node, owner, missing) {
  if (ts.isConditionalTypeNode(node)) {
    checkTypeLiterals(node.trueType, owner, missing);
    checkTypeLiterals(node.falseType, owner, missing);

    return;
  }

  if (ts.isTypeLiteralNode(node)) {
    for (const member of node.members) {
      const path = `${owner}.${memberName(member)}`;

      if (!documented(member)) {
        missing.push(path);
      }

      checkTypeLiterals(member, path, missing);
    }

    return;
  }

  ts.forEachChild(node, (child) => {
    checkTypeLiterals(child, owner, missing);
  });
}

await test("public entry points are the documented ones", () => {
  const names = [];

  for (const { entry } of entries) {
    names.push(entry);
  }

  assert.deepEqual(names, [".", "./server", "./generation"]);
});

await test("published declarations document every public export and member", () => {
  const files = [];

  for (const { file } of entries) {
    files.push(file);
  }

  const program = ts.createProgram(files, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const missing = [];

  for (const { entry, file } of entries) {
    const source = program.getSourceFile(file);

    assert.ok(source, `Published declarations must exist for ${entry}: ${file}`);

    const module = checker.getSymbolAtLocation(source);

    assert.ok(module, `Published declarations must be a module for ${entry}`);

    const exports = checker.getExportsOfModule(module);

    assert.ok(exports.length > 0, `Published entry has no exports: ${entry}`);

    for (const exported of exports) {
      let symbol = exported;

      if (exported.flags & ts.SymbolFlags.Alias) {
        symbol = checker.getAliasedSymbol(exported);
      }

      const owner = `${entry} ${exported.name}`;

      if (!ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim()) {
        missing.push(owner);
      }

      for (const node of symbol.declarations ?? []) {
        if (ts.isFunctionDeclaration(node)) {
          // The symbol's documentation can come from any one overload.
          if (!documented(node)) {
            const { line } = ts.getLineAndCharacterOfPosition(
              node.getSourceFile(),
              node.getStart(),
            );

            missing.push(`${owner} overload at line ${line + 1}`);
          }

          checkTypeLiterals(node, owner, missing);
        }

        if (ts.isTypeAliasDeclaration(node)) {
          checkTypeLiterals(node.type, owner, missing);
        }

        if (!ts.isInterfaceDeclaration(node) && !ts.isClassDeclaration(node)) {
          continue;
        }

        for (const member of node.members) {
          const path = `${owner}.${memberName(member)}`;

          if (!documented(member)) {
            missing.push(path);
          }

          checkTypeLiterals(member, path, missing);
        }
      }
    }
  }

  assert.deepEqual(missing, [], "Published exports and members need documentation");
});
