import { fileURLToPath } from "node:url";
import { definePlugin, defineRule } from "vite-plus/lint/plugins";

// Only ɵOrigamiDescribedBy, in this file, renders aria-describedby; other directives register IDs with it.
const describedByFile = fileURLToPath(
  new URL("../../packages/origami-ui/utils/src/described-by.ts", import.meta.url),
);

// Only OrigamiButton renders these on a Button part; the part passes its policy through Options.
const disabledAttributes = new Set(["disabled", "aria-disabled", "data-disabled"]);

// Reflected ARIA properties that a host property binding can write instead of the attribute.
const reflectedAttributes = new Map([
  ["ariaDisabled", "aria-disabled"],
  ["ariaDescribedByElements", "aria-describedby"],
]);

// Directives whose hostDirectives list OrigamiButton. button-parts.test.mjs derives them from source.
export const directButtonParts = new Set([
  "OrigamiCalendarNext",
  "OrigamiCalendarPrevious",
  "OrigamiCheckbox",
  "OrigamiCollapsibleTrigger",
  "OrigamiDialogClose",
  "OrigamiDialogTrigger",
  "OrigamiFileFieldClear",
  "OrigamiMenuCheckboxItem",
  "OrigamiMenuItem",
  "OrigamiMenuRadioItem",
  "OrigamiNumberFieldDecrement",
  "OrigamiNumberFieldIncrement",
  "OrigamiPopoverTrigger",
  "OrigamiRadioGroupItem",
  "OrigamiSwitch",
  "OrigamiTabsTrigger",
  "OrigamiToastClose",
  "OrigamiToggle",
  "OrigamiToolbarItem",
]);

// Directives that reach OrigamiButton through another Button part: the composed part on that path,
// and where a new disabled condition belongs so activation, focus and the Button agree.
export const indirectButtonParts = new Map([
  [
    "OrigamiAccordionTrigger",
    {
      through: "OrigamiCollapsibleTrigger",
      fix: "Pass Accordion's disabled policy through OrigamiCollapsibleTriggerOptions.",
    },
  ],
  [
    "OrigamiComboboxTrigger",
    {
      through: "OrigamiPopoverTrigger",
      fix: "To disable the whole Combobox, add this condition to OrigamiComboboxOptions.disabled. For the Trigger alone, it must reach both the Trigger's click guard and the disabled of the OrigamiPopoverTriggerOptions it provides.",
    },
  ],
  [
    "OrigamiDatePickerTrigger",
    {
      through: "OrigamiPopoverTrigger",
      fix: "Add this condition to OrigamiDatePickerTriggerOptions.disabled, which is also the OrigamiPopoverTriggerOptions it provides, so opening and the Button read it.",
    },
  ],
  [
    "OrigamiMenuSubTrigger",
    {
      through: "OrigamiPopoverTrigger",
      fix: "Add this condition to OrigamiMenuSubTriggerOptions.disabled, which feeds its activation, its submenu's opening guard and the Button policy it provides.",
    },
  ],
  [
    "OrigamiMenuTrigger",
    {
      through: "OrigamiPopoverTrigger",
      fix: "Add this condition to OrigamiMenuTriggerOptions.disabled, which feeds its opening guard and the OrigamiPopoverTriggerOptions it provides.",
    },
  ],
  [
    "OrigamiSelectTrigger",
    {
      through: "OrigamiPopoverTrigger",
      fix: "Add this condition to OrigamiSelectTriggerOptions.disabled, which feeds its opening guard and the OrigamiPopoverTriggerOptions it provides.",
    },
  ],
  [
    "OrigamiToggleGroupItem",
    {
      through: "OrigamiToggle",
      fix: "Add this condition to OrigamiToggleGroupItemOptions.disabled, which feeds, through ToggleGroupItemContext.disabled, its roving focus, its activation and the OrigamiToggleOptions it provides.",
    },
  ],
  [
    "OrigamiToolbarMenuTrigger",
    {
      through: "OrigamiMenuTrigger",
      fix: "Pass disabled policy through OrigamiMenuTrigger's Options.",
    },
  ],
  [
    "OrigamiToolbarPopoverTrigger",
    {
      through: "OrigamiPopoverTrigger",
      fix: "Pass disabled policy through OrigamiPopoverTrigger's Options.",
    },
  ],
  [
    "OrigamiToolbarToggle",
    { through: "OrigamiToggle", fix: "Pass disabled policy through OrigamiToggle's Options." },
  ],
]);

// Direct parts whose activation doesn't read a disabled policy of their own, so a new condition must
// reach both the Button Options they provide and whatever guards their activation.
const directPartFixes = new Map([
  [
    "OrigamiCalendarNext",
    "Add this condition both to the OrigamiButtonOptions OrigamiCalendarNext provides and to CalendarContext.step, which guards its click with the root's disabled and the period bounds, instead of binding {{attribute}}.",
  ],
  [
    "OrigamiCalendarPrevious",
    "Add this condition both to the OrigamiButtonOptions OrigamiCalendarPrevious provides and to CalendarContext.step, which guards its click with the root's disabled and the period bounds, instead of binding {{attribute}}.",
  ],
  [
    "OrigamiFileFieldClear",
    "Add this condition both to the OrigamiButtonOptions OrigamiFileFieldClear provides and to its click guard, which checks FileFieldContext.disabled, instead of binding {{attribute}}.",
  ],
  [
    "OrigamiNumberFieldDecrement",
    "Add this condition both to the OrigamiButtonOptions OrigamiNumberFieldDecrement provides and to NumberFieldContext.step, which guards its click with the root's editability and the value's bounds, instead of binding {{attribute}}.",
  ],
  [
    "OrigamiNumberFieldIncrement",
    "Add this condition both to the OrigamiButtonOptions OrigamiNumberFieldIncrement provides and to NumberFieldContext.step, which guards its click with the root's editability and the value's bounds, instead of binding {{attribute}}.",
  ],
  [
    "OrigamiToolbarItem",
    "Add this condition to the OrigamiButtonOptions OrigamiToolbarItem provides, which Button and the Toolbar's roving focus read, instead of binding {{attribute}}. Toolbar Item doesn't guard activation: while the item stays focusable, the consumer's own click handlers must check it too.",
  ],
]);

function disabledReport(className, attribute) {
  if (directButtonParts.has(className)) {
    const fix = directPartFixes.get(className);
    if (fix !== undefined) {
      return { message: fix.replaceAll("{{attribute}}", attribute) };
    }

    return { messageId: "directDisabled", data: { part: className, attribute } };
  }

  const indirect = indirectButtonParts.get(className);
  if (indirect === undefined) {
    return undefined;
  }

  return { message: indirect.fix };
}

// A string Angular reads statically: a string literal, or a template literal without substitutions.
function staticString(node) {
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }

  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }

  return undefined;
}

function propertyName(property) {
  if (!property.computed && property.key.type === "Identifier") {
    return property.key.name;
  }

  return staticString(property.key);
}

// The DOM ASCII-lowercases attribute names on HTML elements, so ARIA-DESCRIBEDBY is aria-describedby.
function attributeName(name) {
  return name.replace(/[A-Z]+/gu, (letters) => letters.toLowerCase());
}

// A binding's target, as HostBinding takes it: "attr.aria-disabled", or a property such as "disabled".
// Property names stay case-sensitive.
function boundAttribute(target) {
  if (target.startsWith("attr.")) {
    return attributeName(target.slice("attr.".length));
  }

  return reflectedAttributes.get(target) ?? target;
}

// Host metadata brackets a binding ("[attr.aria-disabled]") and leaves a static attribute bare.
function hostKeyAttribute(key) {
  if (key.startsWith("[") && key.endsWith("]")) {
    return boundAttribute(key.slice(1, -1));
  }

  return attributeName(key);
}

const hostAttributeOwner = defineRule({
  meta: {
    messages: {
      describedBy:
        "Register description IDs with ɵOrigamiDescribedBy instead of binding aria-describedby.",
      directDisabled:
        "Add this condition to {{part}}'s disabled policy, the one its activation and its OrigamiButtonOptions both read, instead of binding {{attribute}}.",
    },
  },

  create(context) {
    // Local name → Angular export name, so `Component as AngularComponent` still counts.
    const angularImports = new Map();

    function angularDecorator(decorator) {
      const call = decorator.expression;
      if (call.type === "CallExpression" && call.callee.type === "Identifier") {
        return angularImports.get(call.callee.name);
      }

      return undefined;
    }

    return {
      Program(program) {
        for (const statement of program.body) {
          if (
            statement.type !== "ImportDeclaration" ||
            statement.source.value !== "@angular/core" ||
            statement.importKind === "type"
          ) {
            continue;
          }

          for (const specifier of statement.specifiers) {
            if (specifier.type === "ImportSpecifier" && specifier.importKind !== "type") {
              // `import { "Directive" as AngularDirective }` names the export with a string.
              let exportName = specifier.imported.name;
              if (specifier.imported.type === "Literal") {
                exportName = specifier.imported.value;
              }

              angularImports.set(specifier.local.name, exportName);
            }
          }
        }
      },

      ClassDeclaration(node) {
        const className = node.id?.name;
        const ownsDescription =
          className === "ɵOrigamiDescribedBy" && context.filename === describedByFile;

        function check(attribute, key) {
          if (attribute === "aria-describedby" && !ownsDescription) {
            context.report({ node: key, messageId: "describedBy" });
          }

          if (!disabledAttributes.has(attribute)) {
            return;
          }

          const report = disabledReport(className, attribute);
          if (report !== undefined) {
            context.report({ node: key, ...report });
          }
        }

        let isAngularClass = false;
        for (const decorator of node.decorators) {
          const kind = angularDecorator(decorator);
          if (kind !== "Directive" && kind !== "Component") {
            continue;
          }

          isAngularClass = true;
          const [metadata] = decorator.expression.arguments;
          if (metadata?.type !== "ObjectExpression") {
            continue;
          }

          for (const property of metadata.properties) {
            if (
              property.type !== "Property" ||
              propertyName(property) !== "host" ||
              property.value.type !== "ObjectExpression"
            ) {
              continue;
            }

            for (const binding of property.value.properties) {
              if (binding.type !== "Property") {
                continue;
              }

              const key = propertyName(binding);
              if (key !== undefined) {
                check(hostKeyAttribute(key), binding.key);
              }
            }
          }
        }

        if (!isAngularClass) {
          return;
        }

        for (const member of node.body.body) {
          for (const decorator of member.decorators ?? []) {
            if (angularDecorator(decorator) !== "HostBinding") {
              continue;
            }

            const [target] = decorator.expression.arguments;
            if (target === undefined) {
              continue;
            }

            const name = staticString(target);
            if (name !== undefined) {
              check(boundAttribute(name), target);
            }
          }
        }
      },
    };
  },
});

export default definePlugin({
  meta: { name: "origami" },
  rules: { "host-attribute-owner": hostAttributeOwner },
});
