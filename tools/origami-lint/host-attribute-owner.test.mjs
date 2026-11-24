import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { RuleTester } from "vite-plus/lint/plugins-dev";
import plugin from "./plugin.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const describedByMessage =
  "Register description IDs with ɵOrigamiDescribedBy instead of binding aria-describedby.";

function directMessage(part, attribute) {
  return `Add this condition to ${part}'s disabled policy, the one its activation and its OrigamiButtonOptions both read, instead of binding ${attribute}.`;
}

// Where each indirect Button part's disabled condition belongs, so activation, focus and the Button agree.
const indirectMessages = [
  [
    "OrigamiComboboxTrigger",
    "To disable the whole Combobox, add this condition to OrigamiComboboxOptions.disabled. For the Trigger alone, it must reach both the Trigger's click guard and the disabled of the OrigamiPopoverTriggerOptions it provides.",
  ],
  [
    "OrigamiDatePickerTrigger",
    "Add this condition to OrigamiDatePickerTriggerOptions.disabled, which is also the OrigamiPopoverTriggerOptions it provides, so opening and the Button read it.",
  ],
  [
    "OrigamiMenuSubTrigger",
    "Add this condition to OrigamiMenuSubTriggerOptions.disabled, which feeds its activation, its submenu's opening guard and the Button policy it provides.",
  ],
  [
    "OrigamiMenuTrigger",
    "Add this condition to OrigamiMenuTriggerOptions.disabled, which feeds its opening guard and the OrigamiPopoverTriggerOptions it provides.",
  ],
  [
    "OrigamiSelectTrigger",
    "Add this condition to OrigamiSelectTriggerOptions.disabled, which feeds its opening guard and the OrigamiPopoverTriggerOptions it provides.",
  ],
  [
    "OrigamiToggleGroupItem",
    "Add this condition to OrigamiToggleGroupItemOptions.disabled, which feeds, through ToggleGroupItemContext.disabled, its roving focus, its activation and the OrigamiToggleOptions it provides.",
  ],
  ["OrigamiToolbarMenuTrigger", "Pass disabled policy through OrigamiMenuTrigger's Options."],
  ["OrigamiToolbarPopoverTrigger", "Pass disabled policy through OrigamiPopoverTrigger's Options."],
  ["OrigamiToolbarToggle", "Pass disabled policy through OrigamiToggle's Options."],
];

const indirectCases = [];
for (const [part, message] of indirectMessages) {
  indirectCases.push({
    name: `${part}'s diagnostic names where its disabled condition belongs`,
    code: `
      import { Directive } from "@angular/core";
      @Directive({ host: { "[attr.data-disabled]": "disabledData()" } })
      class ${part} {}
    `,
    errors: [message],
  });
}

// Direct parts whose activation doesn't read a disabled policy of their own.
const directFixes = [
  [
    "OrigamiCalendarNext",
    "Add this condition both to the OrigamiButtonOptions OrigamiCalendarNext provides and to CalendarContext.step, which guards its click with the root's disabled and the period bounds, instead of binding data-disabled.",
  ],
  [
    "OrigamiCalendarPrevious",
    "Add this condition both to the OrigamiButtonOptions OrigamiCalendarPrevious provides and to CalendarContext.step, which guards its click with the root's disabled and the period bounds, instead of binding data-disabled.",
  ],
  [
    "OrigamiFileFieldClear",
    "Add this condition both to the OrigamiButtonOptions OrigamiFileFieldClear provides and to its click guard, which checks FileFieldContext.disabled, instead of binding data-disabled.",
  ],
  [
    "OrigamiNumberFieldDecrement",
    "Add this condition both to the OrigamiButtonOptions OrigamiNumberFieldDecrement provides and to NumberFieldContext.step, which guards its click with the root's editability and the value's bounds, instead of binding data-disabled.",
  ],
  [
    "OrigamiNumberFieldIncrement",
    "Add this condition both to the OrigamiButtonOptions OrigamiNumberFieldIncrement provides and to NumberFieldContext.step, which guards its click with the root's editability and the value's bounds, instead of binding data-disabled.",
  ],
  [
    "OrigamiToolbarItem",
    "Add this condition to the OrigamiButtonOptions OrigamiToolbarItem provides, which Button and the Toolbar's roving focus read, instead of binding data-disabled. Toolbar Item doesn't guard activation: while the item stays focusable, the consumer's own click handlers must check it too.",
  ],
];

const directFixCases = [];
for (const [part, message] of directFixes) {
  directFixCases.push({
    name: `${part}'s diagnostic names where its disabled condition belongs`,
    code: `
      import { Directive } from "@angular/core";
      @Directive({ host: { "[attr.data-disabled]": "disabledData()" } })
      class ${part} {}
    `,
    errors: [message],
  });
}

new RuleTester({ filename: "fixture.ts" }).run(
  "origami/host-attribute-owner",
  plugin.rules["host-attribute-owner"],
  {
    valid: [
      {
        name: "the shared description owner may write aria-describedby",
        filename: fileURLToPath(
          new URL("../../packages/origami-ui/utils/src/described-by.ts", import.meta.url),
        ),
        code: `
          import { Directive } from "@angular/core";
          @Directive({ host: { "[attr.aria-describedby]": "describedBy()" } })
          class ɵOrigamiDescribedBy {}
        `,
      },
      {
        name: "Button may render all its disabled attributes",
        code: `
          import { Directive } from "@angular/core";
          @Directive({ host: {
            "[disabled]": "disabled()",
            "[attr.aria-disabled]": "disabledAria()",
            "[attr.data-disabled]": "disabledData()",
          } })
          class OrigamiButton {}
        `,
      },
      {
        name: "an independent native input may bind disabled",
        code: `
          import { Directive } from "@angular/core";
          @Directive({ selector: "input[ogFileFieldInput]", host: { "[disabled]": "disabled()" } })
          class OrigamiFileFieldInput {}
        `,
      },
      {
        name: "Popover Trigger and Anchor may both bind id on a shared host",
        code: `
          import { Directive } from "@angular/core";
          @Directive({ host: { "[id]": "effectiveId()" } })
          class OrigamiPopoverAnchor {}
          @Directive({ host: { "[id]": "effectiveId()" } })
          class OrigamiPopoverTrigger {}
          @Directive({ hostDirectives: [OrigamiPopoverAnchor, OrigamiPopoverTrigger] })
          class OrigamiSelectTrigger {}
        `,
      },
      {
        name: "an event key is outside the policy",
        code: `
          import { Directive } from "@angular/core";
          @Directive({ host: { "(aria-describedby)": "handle()" } })
          class EventWriter {}
        `,
      },
      {
        name: "a decorator not imported from Angular is outside the policy",
        code: `
          import { Component } from "./unrelated";
          @Component({ host: { "aria-describedby": "hint" } })
          class OtherComponent {}
        `,
      },
    ],
    invalid: [
      {
        name: "a direct Button part's message names its own policy and each attribute",
        code: `
          import { Directive } from "@angular/core";
          import { OrigamiButton } from "@loozo/origami-ui/button";
          @Directive({ hostDirectives: [OrigamiButton], host: {
            "[disabled]": "disabled()",
            "[attr.aria-disabled]": "disabledAria()",
            "data-disabled": "",
          } })
          class OrigamiCollapsibleTrigger {}
        `,
        errors: [
          directMessage("OrigamiCollapsibleTrigger", "disabled"),
          directMessage("OrigamiCollapsibleTrigger", "aria-disabled"),
          directMessage("OrigamiCollapsibleTrigger", "data-disabled"),
        ],
      },
      {
        name: "Accordion's diagnostic points at the key and names Collapsible Trigger Options",
        code: `import { Directive } from "@angular/core";
@Directive({
  host: { "[attr.aria-disabled]": "disabledAria()" },
})
class OrigamiAccordionTrigger {}`,
        errors: [
          {
            message: "Pass Accordion's disabled policy through OrigamiCollapsibleTriggerOptions.",
            line: 3,
            column: 10,
          },
        ],
      },
      ...directFixCases,
      ...indirectCases,
      {
        name: "a named Angular import quoted as a string still counts",
        code: `
          import { "Directive" as AngularDirective } from "@angular/core";
          @AngularDirective({ host: { "[attr.aria-describedby]": "hint" } })
          class QuotedImportWriter {}
        `,
        errors: [describedByMessage],
      },
      {
        name: "static aria-describedby on an aliased Angular Component is reserved too",
        code: `
          import { Component as AngularComponent } from "@angular/core";
          @AngularComponent({ host: { "aria-describedby": "hint" }, template: "" })
          class StaticWriter {}
        `,
        errors: [describedByMessage],
      },
      {
        name: "the owner exemption also requires the designated file",
        code: `
          import { Directive } from "@angular/core";
          @Directive({ host: { "[attr.aria-describedby]": "describedBy()" } })
          class ɵOrigamiDescribedBy {}
        `,
        errors: [describedByMessage],
      },
      {
        name: "reflected ARIA property bindings count as their attributes",
        code: `
          import { Directive } from "@angular/core";
          @Directive({ host: {
            "[ariaDisabled]": "disabledAria()",
            "[ariaDescribedByElements]": "descriptions()",
          } })
          class OrigamiSwitch {}
        `,
        errors: [directMessage("OrigamiSwitch", "aria-disabled"), describedByMessage],
      },
      {
        name: "attribute names match in any letter case, as the DOM lowercases them",
        code: `
          import { Directive, HostBinding } from "@angular/core";
          @Directive({ host: {
            "[attr.ARIA-DESCRIBEDBY]": "contentId()",
            "Aria-DescribedBy": "hint",
          } })
          class OrigamiCheckbox {
            @HostBinding("attr.ARIA-DISABLED") disabledAria = "true";
          }
        `,
        errors: [
          describedByMessage,
          describedByMessage,
          directMessage("OrigamiCheckbox", "aria-disabled"),
        ],
      },
      {
        name: "template literals without substitutions count as literals",
        code: `
          import { Directive, HostBinding } from "@angular/core";
          @Directive({ host: { [\`[attr.aria-disabled]\`]: "disabledAria()" } })
          class OrigamiTabsTrigger {
            @HostBinding(\`attr.aria-describedby\`) description = "hint";
          }
        `,
        errors: [directMessage("OrigamiTabsTrigger", "aria-disabled"), describedByMessage],
      },
      {
        name: "literal HostBinding names use both ownership policies",
        code: `
          import { Directive, HostBinding as BindHost } from "@angular/core";
          @Directive({})
          class OrigamiToggle {
            @BindHost("attr.aria-describedby") description = "hint";
            @BindHost("disabled") disabled = true;
            @BindHost("ariaDescribedByElements") descriptions = [];
            @BindHost("ariaDisabled") disabledAria = "true";
          }
        `,
        errors: [
          describedByMessage,
          directMessage("OrigamiToggle", "disabled"),
          describedByMessage,
          directMessage("OrigamiToggle", "aria-disabled"),
        ],
      },
    ],
  },
);
