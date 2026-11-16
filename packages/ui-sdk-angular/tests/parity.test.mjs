// Drift checks between each directive and the pinned @ui-sdk/core, read from the directive's
// source: its static host listeners against its `events` and core's handler types (D2), and
// every core option or slot prop classified exactly once with an input of the right kind (D5).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
import { handlers, schemaOf } from "@ui-sdk/core/renderer";

const files = [
  "toggle/src/toggle.ts",
  "select/src/select.ts",
  "select/src/select-trigger.ts",
  "select/src/select-value.ts",
  "select/src/select-content.ts",
  "select/src/select-item.ts",
];

const transformByKind = { boolean: "optionalBoolean", number: "optionalNumber" };
const passThroughKinds = new Set(["string", "list", "value"]);

function literalStrings(node) {
  const values = [];

  for (const element of node.elements) {
    assert.ok(ts.isStringLiteral(element), `expected a string literal, got ${element.getText()}`);
    values.push(element.text);
  }

  return values;
}

function unwrap(node) {
  let current = node;

  while (
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function propertyName(property) {
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text;
  }

  throw new Error(`unexpected property name ${property.name.getText()}`);
}

function objectProperties(node) {
  const properties = new Map();

  for (const property of unwrap(node).properties) {
    properties.set(propertyName(property), property);
  }

  return properties;
}

// The object literal an arrow like `() => ({ ... })` returns.
function returnedObject(arrow) {
  const body = unwrap(arrow.body);

  assert.ok(ts.isObjectLiteralExpression(body), `expected () => ({ ... }), got ${arrow.getText()}`);

  return body;
}

function calleeName(call) {
  const expression = call.expression;

  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    return `${expression.expression.text}.${expression.name.text}`;
  }

  return undefined;
}

async function readDirective(file) {
  const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const directive = {
    file,
    imports: new Map(),
    constants: new Map(),
    inputs: new Map(),
    outputs: new Set(),
  };

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings) {
      for (const element of statement.importClause.namedBindings.elements) {
        directive.imports.set(element.name.text, statement.moduleSpecifier.text);
      }
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        directive.constants.set(declaration.name.text, unwrap(declaration.initializer));
      }
    }

    if (ts.isClassDeclaration(statement) && ts.getDecorators(statement)?.length) {
      const decorator = ts.getDecorators(statement)[0].expression;
      const metadata = objectProperties(decorator.arguments[0]);

      directive.className = statement.name.text;
      directive.selector = metadata.get("selector").initializer.text;
      directive.host = new Map();

      if (metadata.has("host")) {
        for (const [name, property] of objectProperties(metadata.get("host").initializer)) {
          directive.host.set(name, property.initializer.text);
        }
      }

      for (const member of statement.members) {
        if (!ts.isPropertyDeclaration(member) || !member.initializer) {
          continue;
        }

        const name = member.name.getText();
        const initializer = unwrap(member.initializer);

        if (!ts.isCallExpression(initializer)) {
          continue;
        }

        const callee = calleeName(initializer);

        if (callee === "input" || callee === "input.required") {
          const options = initializer.arguments[callee === "input" ? 1 : 0];
          let transform;

          if (options) {
            transform = objectProperties(options).get("transform")?.initializer.getText();
          }

          directive.inputs.set(name, { required: callee === "input.required", transform });
        }

        if (callee === "output") {
          directive.outputs.add(name);
        }

        if (callee === "ɵinjectRoot") {
          const [primitive, options] = initializer.arguments;

          directive.root = {
            primitive: primitive.text,
            passed: objectProperties(returnedObject(options)),
          };
        }

        if (callee === "ɵinjectSlot") {
          const [, slot, props, options] = initializer.arguments;
          const slotOptions = objectProperties(options);

          directive.slot = {
            name: slot.text,
            passed: objectProperties(returnedObject(props)),
            keyProp: slotOptions.get("keyProp")?.initializer.text,
          };
        }
      }
    }
  }

  return directive;
}

async function loadPrimitive(directive) {
  const name =
    directive.root?.primitive ??
    [...directive.imports.keys()].find(
      (imported) => imported === "toggle" || imported === "select",
    );
  const specifier = directive.imports.get(name);

  if (directive.root) {
    return (await import(specifier))[name];
  }

  // A slot directive's primitive is its root's; Select's slots import `UiSelect` from ./select.
  return (await import("@ui-sdk/core/select")).select;
}

// A function reads a custom element's attribute for values no kind fits, like Select's
// `filter` and `modal`: Angular passes them through.
function kindOf(spec) {
  if (typeof spec === "function") {
    return "value";
  }

  if (typeof spec === "string") {
    return spec;
  }

  return spec.kind;
}

function lowerFirst(name) {
  return name[0].toLowerCase() + name.slice(1);
}

/** Core's names this directive takes as inputs or outputs, mapped to core's names. */
function boundNames(directive, schema) {
  const bound = new Map();
  const selectorInput = directive.selector.replace(/^\[|\]$/g, "");

  for (const [name, input] of directive.inputs) {
    if (name === selectorInput) {
      bound.set(directive.slot.keyProp, { input: name, ...input });
      continue;
    }

    bound.set(name, { input: name, ...input });
  }

  for (const name of Object.keys(schema)) {
    if (kindOf(schema[name]) !== "callback") {
      continue;
    }

    const key = lowerFirst(name.replace(/^on/, "").replace(/Change$/, ""));
    const controlled =
      name.endsWith("Change") &&
      key in schema &&
      `default${key[0].toUpperCase()}${key.slice(1)}` in schema;
    const outputs = controlled
      ? [`${key}ChangeRequest`, `${key}Change`]
      : [lowerFirst(name.replace(/^on/, ""))];

    if (outputs.every((output) => directive.outputs.has(output))) {
      bound.set(name, { outputs });
    }
  }

  return bound;
}

const directives = await Promise.all(files.map(readDirective));

for (const directive of directives) {
  test(`${directive.className}: host listeners match its events and cover core's handlers`, async () => {
    const primitive = await loadPrimitive(directive);
    const events = literalStrings(directive.constants.get("events"));
    const listeners = [];

    for (const [name, expression] of directive.host) {
      const match = /^\((\w+)\)$/.exec(name);

      if (!match) {
        continue;
      }

      listeners.push(match[1]);
      assert.equal(
        expression,
        `slot.dispatch("${match[1]}", $event)`,
        `${name} must hand its own type to the slot`,
      );
    }

    assert.deepEqual(
      [...listeners].sort((a, b) => a.localeCompare(b)),
      [...events].sort((a, b) => a.localeCompare(b)),
      "static host listeners must equal `events`",
    );

    const instance = primitive({ id: "ui-sdk-parity" });
    const props = {};

    if (directive.slot.keyProp) {
      props[directive.slot.keyProp] = "parity";
      props.id = "parity";
    }

    const handled = Object.keys(handlers(instance.part(directive.slot.name, props)));
    const missing = handled.filter((type) => !events.includes(type));

    instance.destroy();
    assert.deepEqual(
      missing,
      [],
      `core handles these on "${directive.slot.name}" without a static listener`,
    );
  });

  test(`${directive.className}: every core name is classified once, with an input of its kind`, async () => {
    const primitive = await loadPrimitive(directive);
    const schemas = schemaOf(primitive);
    // A root directive binds core's options; its own root slot takes no props.
    let schema = schemas.slots[directive.slot.name];
    let passed = directive.slot.passed;

    if (directive.root) {
      schema = schemas.options;
      passed = directive.root.passed;
    }
    const classes = objectProperties(directive.constants.get("classes"));
    const declared = {};

    for (const name of ["internal", "fixed", "excluded"]) {
      declared[name] = literalStrings(unwrap(classes.get(name).initializer));
    }

    const bound = boundNames(directive, schema);
    const problems = [];

    for (const [name, spec] of Object.entries(schema)) {
      const homes = [];

      if (bound.has(name)) {
        homes.push("public");
      }

      for (const kind of ["internal", "fixed", "excluded"]) {
        if (declared[kind].includes(name)) {
          homes.push(kind);
        }
      }

      if (homes.length !== 1) {
        problems.push(
          `${name} (${kindOf(spec)}) is classified ${homes.length === 0 ? "nowhere" : homes.join(" and ")}`,
        );
        continue;
      }

      const home = homes[0];

      if (home === "excluded") {
        if (passed.has(name)) {
          problems.push(`${name} is excluded but passed to core`);
        }

        continue;
      }

      if (home !== "public" && !passed.has(name)) {
        problems.push(`${name} is ${home} but not passed to core`);
      }

      if (home !== "public") {
        continue;
      }

      const binding = bound.get(name);
      const kind = kindOf(spec);

      if (kind === "callback") {
        if (!passed.has(name)) {
          problems.push(`${name} has outputs but isn't passed to core`);
        }

        continue;
      }

      if (!binding.input) {
        problems.push(`${name} (${kind}) needs an input`);
        continue;
      }

      if (!passed.has(name)) {
        problems.push(`${name} is an input but isn't passed to core`);
      }

      if (kind === "key") {
        if (!binding.required || binding.input !== directive.selector.replace(/^\[|\]$/g, "")) {
          problems.push(`${name} (key) must be the selector-named required input`);
        }

        if (directive.slot.keyProp !== name) {
          problems.push(`${name} (key) must be the slot's keyProp, so core keys it through keyOf`);
        }

        continue;
      }

      if (kind in transformByKind) {
        if (binding.transform !== transformByKind[kind]) {
          problems.push(
            `${name} (${kind}) needs transform ${transformByKind[kind]}, has ${binding.transform ?? "none"}`,
          );
        }

        continue;
      }

      if (passThroughKinds.has(kind)) {
        if (binding.transform !== undefined) {
          problems.push(`${name} (${kind}) passes through, but has transform ${binding.transform}`);
        }

        continue;
      }

      problems.push(`${name} has kind ${kind}, which no rule maps yet`);
    }

    for (const kind of ["internal", "fixed", "excluded"]) {
      for (const name of declared[kind]) {
        if (!(name in schema)) {
          problems.push(`${name} is classified ${kind} but core has no such name`);
        }
      }
    }

    assert.deepEqual(problems, []);
  });
}
