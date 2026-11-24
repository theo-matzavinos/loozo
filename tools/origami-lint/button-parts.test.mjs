// Derives every Button part from Origami source, the classes whose literal hostDirectives reach
// OrigamiButton, and fails when host-attribute-owner's lists drift from it.
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { directButtonParts, indirectButtonParts } from "./plugin.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

// `hostDirectives`, "hostDirectives" and 'hostDirectives' are the same key to Angular.
function propertyName(property) {
  const name = property.name;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }

  return undefined;
}

function literalProperty(object, name) {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && propertyName(property) === name) {
      return property.initializer;
    }
  }

  return undefined;
}

// Each directive class → the exported names of the directives its hostDirectives list.
function readCompositions() {
  const compositions = new Map();
  const paths = globSync("packages/origami-ui/*/src/**/*.ts", {
    cwd: root,
    exclude: ["packages/origami-ui/snippets/**", "**/*.spec.ts", "**/*.test.ts"],
  });

  for (const path of paths) {
    const source = readFileSync(join(root, path), "utf8");
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);

    // Local name → exported name, so `import { OrigamiMenuTrigger as Trigger }` still resolves.
    const imported = new Map();
    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement)) {
        continue;
      }

      const bindings = statement.importClause?.namedBindings;
      if (bindings === undefined || !ts.isNamedImports(bindings)) {
        continue;
      }

      for (const element of bindings.elements) {
        imported.set(element.name.text, (element.propertyName ?? element.name).text);
      }
    }

    for (const statement of file.statements) {
      if (!ts.isClassDeclaration(statement) || statement.name === undefined) {
        continue;
      }

      for (const decorator of ts.getDecorators(statement) ?? []) {
        const call = decorator.expression;
        if (!ts.isCallExpression(call)) {
          continue;
        }

        const [metadata] = call.arguments;
        if (metadata === undefined || !ts.isObjectLiteralExpression(metadata)) {
          continue;
        }

        const hostDirectives = literalProperty(metadata, "hostDirectives");
        if (hostDirectives === undefined || !ts.isArrayLiteralExpression(hostDirectives)) {
          continue;
        }

        const composed = [];
        for (const element of hostDirectives.elements) {
          // Either `OrigamiX` or `{ directive: OrigamiX, inputs: [...] }`.
          let directive = element;
          if (ts.isObjectLiteralExpression(element)) {
            directive = literalProperty(element, "directive");
          }

          if (directive !== undefined && ts.isIdentifier(directive)) {
            composed.push(imported.get(directive.text) ?? directive.text);
          }
        }

        compositions.set(statement.name.text, composed);
      }
    }
  }

  return compositions;
}

function reachesButton(compositions, name, seen = new Set()) {
  if (name === "OrigamiButton") {
    return true;
  }

  if (seen.has(name)) {
    return false;
  }

  seen.add(name);
  for (const composed of compositions.get(name) ?? []) {
    if (reachesButton(compositions, composed, seen)) {
      return true;
    }
  }

  return false;
}

await test("host-attribute-owner lists every Button part, direct and indirect", () => {
  const compositions = readCompositions();
  const derivedDirect = new Set();
  const derivedIndirect = new Map();

  for (const [name, composed] of compositions) {
    if (composed.includes("OrigamiButton")) {
      derivedDirect.add(name);
      continue;
    }

    const through = [];
    for (const part of composed) {
      if (reachesButton(compositions, part)) {
        through.push(part);
      }
    }

    if (through.length > 0) {
      derivedIndirect.set(name, through);
    }
  }

  const problems = [];

  for (const name of derivedDirect) {
    if (!directButtonParts.has(name)) {
      problems.push(
        `${name} reaches OrigamiButton directly but isn't in host-attribute-owner's direct Button parts; add it with its message.`,
      );
    }
  }

  for (const [name, through] of derivedIndirect) {
    const listedThrough = indirectButtonParts.get(name)?.through;
    if (listedThrough === undefined) {
      problems.push(
        `${name} reaches OrigamiButton through ${through.join(" and ")} but isn't in host-attribute-owner's indirect Button parts; add it with its message.`,
      );
      continue;
    }

    if (!through.includes(listedThrough)) {
      problems.push(
        `${name} reaches OrigamiButton through ${through.join(" and ")}, not ${listedThrough}; update its entry in host-attribute-owner.`,
      );
    }
  }

  for (const name of directButtonParts) {
    if (!derivedDirect.has(name)) {
      problems.push(
        `${name} is a direct Button part in host-attribute-owner but doesn't list OrigamiButton in its hostDirectives; move or remove it.`,
      );
    }
  }

  for (const name of indirectButtonParts.keys()) {
    if (!derivedIndirect.has(name)) {
      problems.push(
        `${name} is an indirect Button part in host-attribute-owner but doesn't reach OrigamiButton through another part; move or remove it.`,
      );
    }
  }

  assert.deepEqual(problems, []);
});
