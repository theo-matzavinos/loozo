import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

async function source(path) {
  const file = new URL(path, import.meta.url);
  const text = await readFile(file, "utf8");

  return ts.createSourceFile(file.pathname, text, ts.ScriptTarget.Latest, true);
}

function documented(node) {
  assert.ok(
    node.jsDoc?.some((doc) => typeof doc.comment === "string" && doc.comment.trim()),
    `Missing documentation for ${node.name?.getText() ?? ts.SyntaxKind[node.kind]}`,
  );
}

function declaration(file, name) {
  const found = file.statements.find((statement) => statement.name?.getText(file) === name);

  assert.ok(found, `Missing declaration: ${name}`);
  documented(found);

  return found;
}

await test("published root declarations retain documentation for every supported export", async () => {
  const consumer = new URL("consumer.ts", import.meta.url).pathname;
  const program = ts.createProgram([consumer], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const file = program.getSourceFile(consumer);
  const rootImport = file.statements.find(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier.text === "@loozo/angular-router",
  );
  const root = checker.getSymbolAtLocation(rootImport.moduleSpecifier);

  assert.ok(root, "Public package entry must resolve");

  const exports = checker.getExportsOfModule(root);

  assert.equal(exports.length, 10);

  for (const exported of exports) {
    const symbol = checker.getAliasedSymbol(exported);

    assert.ok(
      ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim(),
      `Published export has no documentation: ${exported.name}`,
    );

    for (const node of symbol.declarations ?? []) {
      if (ts.isInterfaceDeclaration(node)) {
        for (const member of node.members) {
          if (ts.isIdentifier(member.name)) {
            documented(member);
          }
        }
      }
    }
  }
});

await test("published handle resources and every navigation overload retain documentation", async () => {
  const file = await source("../dist/types/loozo-angular-router-_generated.d.ts");
  const handle = declaration(file, "Handle");

  declaration(file, "Destination");
  assert.equal(handle.members.length, 11);

  for (const member of handle.members) {
    documented(member);
  }
});

await test("checked-in generated application exports carry documentation", async () => {
  for (const example of [
    "../../../examples/angular-router/",
    "../../../examples/angular-router/ssr-proof/",
  ]) {
    const routes = await source(`${example}generated/routes.generated.ts`);
    const facade = await source(`${example}src/routes/home/route.generated.ts`);

    // Variable documentation belongs to the statement, not its declaration node.
    for (const { file, name } of [
      { file: routes, name: "routes" },
      { file: facade, name: "destination" },
    ]) {
      const statement = file.statements.find(
        (node) =>
          ts.isVariableStatement(node) &&
          node.declarationList.declarations.some((value) => value.name.getText(file) === name),
      );

      assert.ok(statement, `Missing generated export: ${name}`);
      documented(statement);
    }

    declaration(facade, "injectRoute");
  }
});
