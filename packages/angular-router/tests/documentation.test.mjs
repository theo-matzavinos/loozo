import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

async function source(path) {
  const file = new URL(path, import.meta.url);
  const text = await readFile(file, "utf8");

  return ts.createSourceFile(fileURLToPath(file), text, ts.ScriptTarget.Latest, true);
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

// Type literals inside exported types and signatures are API too. A conditional type's check
// is a pattern, not API.
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

// An ECMAScript-private member is an emitted nominal marker, not API.
function checkMembers(node, owner, missing) {
  for (const member of node.members) {
    if (member.name && ts.isPrivateIdentifier(member.name)) {
      continue;
    }

    const path = `${owner}.${memberName(member)}`;

    if (!documented(member)) {
      missing.push(path);
    }

    checkTypeLiterals(member, path, missing);
  }
}

function declaration(file, name) {
  const found = file.statements.find((statement) => statement.name?.getText(file) === name);

  assert.ok(found, `Missing declaration: ${name}`);
  assert.ok(documented(found), `Missing documentation for ${name}`);

  return found;
}

// Per-route copies declare reserved locals and export them under their public names.
function exportedLocal(file, name) {
  for (const statement of file.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause) {
      continue;
    }

    for (const element of statement.exportClause.elements) {
      if (element.name.text === name) {
        return (element.propertyName ?? element.name).text;
      }
    }
  }

  return name;
}

await test("published root declarations retain documentation for every supported export", async () => {
  const consumer = fileURLToPath(new URL("consumer.ts", import.meta.url));
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

  assert.equal(exports.length, 14);

  const missing = [];

  for (const exported of exports) {
    const symbol = checker.getAliasedSymbol(exported);

    assert.ok(
      ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim(),
      `Published export has no documentation: ${exported.name}`,
    );

    for (const node of symbol.declarations ?? []) {
      if (ts.isFunctionDeclaration(node)) {
        checkTypeLiterals(node, exported.name, missing);
      }

      if (ts.isTypeAliasDeclaration(node)) {
        checkTypeLiterals(node.type, exported.name, missing);
      }

      if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) {
        checkMembers(node, exported.name, missing);
      }
    }
  }

  assert.deepEqual(missing, [], "Published exports and members need documentation");
});

await test("published handle signals and every navigation overload retain documentation", async () => {
  const generated = await source("../dist/types/loozo-angular-router-_generated.d.ts");
  const core = await source("../dist/types/loozo-angular-router-_core.d.ts");
  const handle = declaration(generated, "Handle");
  const destination = declaration(core, "Destination");
  const missing = [];

  // params, search, data, title, then link and navigate for this route, ".." and a destination.
  assert.equal(handle.members.length, 10);
  checkMembers(handle, "Handle", missing);
  checkMembers(destination, "Destination", missing);
  assert.deepEqual(missing, [], "Published handle and destination members need documentation");
});

await test("checked-in generated application exports carry documentation", async () => {
  for (const example of [
    "../../../examples/angular-router/",
    "../../../examples/angular-router/ssr-proof/",
  ]) {
    const routes = await source(`${example}generated/routes.generated.ts`);
    const destination = await source(`${example}src/routes/+home/destination.generated.ts`);
    const copy = await source(`${example}src/routes/+home/route.generated.ts`);

    // Variable documentation belongs to the statement, not its declaration node.
    for (const { file, name } of [
      { file: routes, name: "routes" },
      { file: destination, name: "destination" },
      { file: copy, name: "route" },
    ]) {
      const local = exportedLocal(file, name);
      const statement = file.statements.find(
        (node) =>
          ts.isVariableStatement(node) &&
          node.declarationList.declarations.some((value) => value.name.getText(file) === local),
      );

      assert.ok(statement, `Missing generated export: ${name}`);
      assert.ok(documented(statement), `Missing documentation for ${name}`);
    }

    declaration(copy, exportedLocal(copy, "injectRoute"));

    // The active route's wrapper and the types callers name.
    for (const name of ["RouteTypes", "ActiveRoute", "ActiveHandle", "injectActiveRoute"]) {
      const node = routes.statements.find(
        (statement) =>
          (ts.isTypeAliasDeclaration(statement) || ts.isFunctionDeclaration(statement)) &&
          statement.name?.text === name,
      );

      assert.ok(node && documented(node), `Missing documentation for ${name}`);
    }
  }
});
