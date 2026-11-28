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
  "OrigamiPaginationFirst",
  "OrigamiPaginationItem",
  "OrigamiPaginationLast",
  "OrigamiPaginationNext",
  "OrigamiPaginationPrevious",
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
    "Don't bind {{attribute}}. For OrigamiNumberFieldDecrement alone, add this condition both to its click handler and to the OrigamiButtonOptions it provides. To stop stepping from both buttons and the Input's ArrowUp and ArrowDown while typing stays on, make OrigamiNumberFieldOptions.step non-positive under it: NumberFieldContext.canStep and .step both read it. To stop typing too, use OrigamiNumberFieldOptions.disabled or .readonly.",
  ],
  [
    "OrigamiNumberFieldIncrement",
    "Don't bind {{attribute}}. For OrigamiNumberFieldIncrement alone, add this condition both to its click handler and to the OrigamiButtonOptions it provides. To stop stepping from both buttons and the Input's ArrowUp and ArrowDown while typing stays on, make OrigamiNumberFieldOptions.step non-positive under it: NumberFieldContext.canStep and .step both read it. To stop typing too, use OrigamiNumberFieldOptions.disabled or .readonly.",
  ],
  [
    "OrigamiPaginationFirst",
    "Add this condition both to the OrigamiButtonOptions OrigamiPaginationFirst provides, which follow the write rule (pagination-math.ts writes), and to its click, which writes through PaginationContext.write under the same rule, instead of binding {{attribute}}.",
  ],
  [
    "OrigamiPaginationItem",
    "Add this condition both to the OrigamiButtonOptions OrigamiPaginationItem provides, which disable an item whose page isn't one of the pages, and to its click, which writes through PaginationContext.write under the write rule (pagination-math.ts writes), instead of binding {{attribute}}.",
  ],
  [
    "OrigamiPaginationLast",
    "Add this condition both to the OrigamiButtonOptions OrigamiPaginationLast provides, which follow the write rule (pagination-math.ts writes), and to its click, which writes through PaginationContext.write under the same rule, instead of binding {{attribute}}.",
  ],
  [
    "OrigamiPaginationNext",
    "Add this condition both to the OrigamiButtonOptions OrigamiPaginationNext provides, which follow the write rule (pagination-math.ts writes), and to its click, which writes through PaginationContext.write under the same rule, instead of binding {{attribute}}.",
  ],
  [
    "OrigamiPaginationPrevious",
    "Add this condition both to the OrigamiButtonOptions OrigamiPaginationPrevious provides, which follow the write rule (pagination-math.ts writes), and to its click, which writes through PaginationContext.write under the same rule, instead of binding {{attribute}}.",
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

// `{ directive: ClassName, inputs: [...] }`, with no spread that could hide or replace `directive`.
function readableDirectiveEntry(entry) {
  if (entry.type !== "ObjectExpression") {
    return false;
  }

  let directive;
  for (const property of entry.properties) {
    if (property.type !== "Property") {
      return false;
    }

    if (propertyName(property) === "directive") {
      directive = property;
    }
  }

  return directive !== undefined && !directive.shorthand && directive.value.type === "Identifier";
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
      metadataNotLiteral:
        "Write the decorator's metadata as an object literal without spreads, so host-attribute-owner can read its host and hostDirectives.",
      hostNotLiteral:
        "Write host as an object literal with literal keys and no spreads, so host-attribute-owner can check every binding.",
      hostDirectivesNotLiteral:
        "Write hostDirectives as an array literal without spreads, so host-attribute-owner's Button-part check can read the composition.",
      hostDirectiveEntryNotLiteral:
        "Write each hostDirectives entry as a class name or { directive: ClassName, … } without spreads, so host-attribute-owner's Button-part check can read it.",
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

        // Only literal metadata can be checked, so any other form is reported instead of skipped.
        function checkHost(host) {
          if (host.type !== "ObjectExpression") {
            context.report({ node: host, messageId: "hostNotLiteral" });
            return;
          }

          for (const binding of host.properties) {
            if (binding.type !== "Property") {
              context.report({ node: binding, messageId: "hostNotLiteral" });
              continue;
            }

            const key = propertyName(binding);
            if (key === undefined) {
              context.report({ node: binding.key, messageId: "hostNotLiteral" });
              continue;
            }

            check(hostKeyAttribute(key), binding.key);
          }
        }

        function checkHostDirectives(hostDirectives) {
          if (hostDirectives.type !== "ArrayExpression") {
            context.report({ node: hostDirectives, messageId: "hostDirectivesNotLiteral" });
            return;
          }

          for (const element of hostDirectives.elements) {
            if (element === null || element.type === "Identifier") {
              continue;
            }

            if (element.type === "SpreadElement") {
              context.report({ node: element, messageId: "hostDirectivesNotLiteral" });
              continue;
            }

            if (!readableDirectiveEntry(element)) {
              context.report({ node: element, messageId: "hostDirectiveEntryNotLiteral" });
            }
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
          // `@Directive()` without metadata declares no host bindings.
          if (metadata === undefined) {
            continue;
          }

          if (metadata.type !== "ObjectExpression") {
            context.report({ node: metadata, messageId: "metadataNotLiteral" });
            continue;
          }

          for (const property of metadata.properties) {
            if (property.type !== "Property") {
              context.report({ node: property, messageId: "metadataNotLiteral" });
              continue;
            }

            // A shorthand `{ host }` or `{ hostDirectives }` has an identifier value, so it's reported.
            const name = propertyName(property);
            if (name === "host") {
              checkHost(property.value);
            }

            if (name === "hostDirectives") {
              checkHostDirectives(property.value);
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

            // Without an argument, Angular binds the member's own name, e.g. `ariaDisabled`.
            const [target] = decorator.expression.arguments;
            if (target === undefined) {
              const memberName = propertyName(member);
              if (memberName !== undefined) {
                check(boundAttribute(memberName), member.key);
              }

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
