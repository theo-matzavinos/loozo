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
  "toggle/src/toggle-group.ts",
  "toolbar/src/toolbar.ts",
  "toolbar/src/toolbar-button.ts",
  "toolbar/src/toolbar-link.ts",
  "toolbar/src/toolbar-input.ts",
  "toolbar/src/toolbar-group.ts",
  "toolbar/src/toolbar-separator.ts",
  "select/src/select.ts",
  "select/src/select-label.ts",
  "select/src/select-group.ts",
  "select/src/select-group-label.ts",
  "select/src/select-trigger.ts",
  "select/src/select-value.ts",
  "select/src/select-content.ts",
  "select/src/select-item.ts",
  "select/src/select-form-input.ts",
  "checkbox/src/checkbox.ts",
  "checkbox/src/checkbox-indicator.ts",
  "checkbox/src/checkbox-input.ts",
  "checkbox/src/checkbox-group.ts",
  "checkbox/src/checkbox-group-input.ts",
  "switch/src/switch.ts",
  "switch/src/switch-thumb.ts",
  "switch/src/switch-input.ts",
  "radio/src/radio-group.ts",
  "radio/src/radio.ts",
  "radio/src/radio-indicator.ts",
  "radio/src/radio-input.ts",
  "tabs/src/tabs.ts",
  "tabs/src/tabs-list.ts",
  "tabs/src/tabs-tab.ts",
  "tabs/src/tabs-tab-icon.ts",
  "tabs/src/tabs-indicator.ts",
  "tabs/src/tabs-panel.ts",
  "accordion/src/accordion.ts",
  "accordion/src/accordion-item.ts",
  "accordion/src/accordion-header.ts",
  "accordion/src/accordion-trigger.ts",
  "accordion/src/accordion-panel.ts",
  "collapsible/src/collapsible.ts",
  "collapsible/src/collapsible-trigger.ts",
  "collapsible/src/collapsible-panel.ts",
];

/** Each entry point's core primitive, which its root and part directives render. */
const primitives = {
  toggle: ["@ui-sdk/core/toggle", "toggle"],
  select: ["@ui-sdk/core/select", "select"],
  checkbox: ["@ui-sdk/core/checkbox", "checkbox"],
  switch: ["@ui-sdk/core/switch", "switchPrimitive"],
  radio: ["@ui-sdk/core/radio", "radioGroup"],
  toolbar: ["@ui-sdk/core/toolbar", "toolbar"],
  tabs: ["@ui-sdk/core/tabs", "tabs"],
  accordion: ["@ui-sdk/core/accordion", "accordion"],
  collapsible: ["@ui-sdk/core/collapsible", "collapsible"],
};

/** Directives that render another primitive than their entry point's, like a group's. */
const groupPrimitives = {
  "toggle/src/toggle-group.ts": ["@ui-sdk/core/toggle", "toggleGroup"],
  "checkbox/src/checkbox-group.ts": ["@ui-sdk/core/checkbox", "checkboxGroup"],
  "checkbox/src/checkbox-group-input.ts": ["@ui-sdk/core/checkbox", "checkboxGroup"],
};

const transformByKind = {
  boolean: "optionalBoolean",
  number: "optionalNumber",
  checked: "optionalChecked",
};
// An `id` kind is usually internal, made by the directive; a public one, like an Accordion item's
// optional `value`, passes through.
const passThroughKinds = new Set(["string", "list", "value", "id"]);

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
          const [root, slot, props, options] = initializer.arguments;
          const slotOptions = objectProperties(options);

          directive.slot = {
            name: slot.text,
            rootByReference: ts.isArrowFunction(unwrap(root)),
            passed: objectProperties(returnedObject(props)),
            keyProp: slotOptions.get("keyProp")?.initializer.text,
            mounts: slotOptions.get("mounts")?.initializer.kind === ts.SyntaxKind.TrueKeyword,
          };
        }
      }
    }
  }

  return directive;
}

async function loadPrimitive(directive) {
  const [specifier, name] =
    groupPrimitives[directive.file] ?? primitives[directive.file.split("/")[0]];

  return (await import(specifier))[name];
}

// A function reads a custom element's attribute for values no kind fits, like Select's
// `filter` and `modal`: Angular passes them through. Checkbox's `checked` parser is the one
// with its own transform, which keeps `"indeterminate"`.
function kindOf(spec) {
  if (typeof spec === "function") {
    return spec.name === "checkedAttribute" ? "checked" : "value";
  }

  if (typeof spec === "string") {
    return spec;
  }

  return spec.kind;
}

function lowerFirst(name) {
  return name[0].toLowerCase() + name.slice(1);
}

/** The directive's `renamed` map: its own inputs that bind a core name of another spelling. */
function renamedInputs(directive) {
  const renamed = new Map();
  const declared = directive.constants.get("renamed");

  if (declared === undefined) {
    return renamed;
  }

  for (const [name, property] of objectProperties(declared)) {
    renamed.set(name, property.initializer.text);
  }

  return renamed;
}

/** Core's names this directive takes as inputs or outputs, mapped to core's names. */
function boundNames(directive, schema) {
  const bound = new Map();
  const selectorInput = directive.selector.replace(/^(\w+)?\[|\]$/g, "");
  const renamed = renamedInputs(directive);

  for (const [name, input] of directive.inputs) {
    if (renamed.has(name)) {
      bound.set(renamed.get(name), { input: name, ...input });
      continue;
    }

    if (name === selectorInput && directive.slot.keyProp === undefined) {
      // An input's reference to its control, like `[uiCheckboxInput]="terms"`: not a core name.
      continue;
    }

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
    let outputs = [lowerFirst(name.replace(/^on/, ""))];

    if (controlled) {
      outputs = [`${key}ChangeRequest`, `${key}Change`];
    }

    // A cancelable callback without a controlled key, like an Accordion item's `onOpenChange`:
    // the directive reports the request alone, since what commits is another part's value.
    const requestOnly =
      !controlled &&
      name.endsWith("Change") &&
      directive.outputs.has(`${key}ChangeRequest`) &&
      !directive.outputs.has(`${key}Change`);

    if (requestOnly) {
      outputs = [`${key}ChangeRequest`];
    }

    if (outputs.every((output) => directive.outputs.has(output))) {
      bound.set(name, { outputs });
    }
  }

  return bound;
}

const directives = await Promise.all(files.map(readDirective));

/** The host listeners a root may declare for its `touch` output, with their handler calls. */
const touchListeners = { "(blur)": "blurred()", "(focusout)": "focusOut($event)" };

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

      // A root's `touch` listener reads focus, not a core event, so it doesn't reach the slot.
      if (directive.outputs.has("touch") && touchListeners[name] === expression) {
        continue;
      }

      // A toolbar button's `press` reads the click itself, so a replayed one can be refused.
      if (directive.outputs.has("press") && name === "(click)" && expression === "pressed()") {
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

    if (directive.slot.mounts) {
      // A structural directive's host is its template's anchor: it can't listen for events.
      assert.deepEqual(listeners, [], "a structural part declares no host listeners");
    }

    const instance = primitive({ id: "ui-sdk-parity" });
    const props = {};

    if (directive.slot.keyProp) {
      props[directive.slot.keyProp] = "parity";
      props.id = "parity";
    }

    // Value-keyed parts, like a tab or an Accordion item's trigger, need a value to register.
    if (directive.slot.passed.has("value") && props.value === undefined) {
      props.value = "parity";
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

  test(`${directive.className}: a part outside its root's element names its control by a required reference`, () => {
    const selectorInput = directive.selector.replace(/^(\w+)?\[|\]$/g, "");
    const reference =
      directive.slot.keyProp === undefined &&
      !renamedInputs(directive).has(selectorInput) &&
      directive.inputs.get(selectorInput);

    assert.equal(
      Boolean(reference),
      directive.slot.rootByReference,
      "a slot reads its root through a reader exactly when its selector-named input is a reference",
    );

    if (reference) {
      assert.ok(reference.required, `${selectorInput} must be input.required`);
      assert.match(directive.selector, /^input\[/, "a reference names an <input>'s control");
    }
  });
}
