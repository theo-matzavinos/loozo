import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { RuleTester } from "vite-plus/lint/plugins-dev";
import plugin from "./plugin.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const describedByMessage =
  "Register description IDs with ɵOrigamiDescribedBy instead of binding aria-describedby.";

const metadataNotLiteralMessage =
  "Write the decorator's metadata as an object literal without spreads, so host-attribute-owner can read its host and hostDirectives.";
const hostDirectiveEntryNotLiteralMessage =
  "Write each hostDirectives entry as a class name or { directive: ClassName, … } without spreads, so host-attribute-owner's Button-part check can read it.";
const hostNotLiteralMessage =
  "Write host as an object literal with literal keys and no spreads, so host-attribute-owner can check every binding.";
const hostDirectivesNotLiteralMessage =
  "Write hostDirectives as an array literal without spreads, so host-attribute-owner's Button-part check can read the composition.";

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
    "Don't bind data-disabled. For OrigamiNumberFieldDecrement alone, add this condition both to its click handler and to the OrigamiButtonOptions it provides. To stop stepping from both buttons and the Input's ArrowUp and ArrowDown while typing stays on, make OrigamiNumberFieldOptions.step non-positive under it: NumberFieldContext.canStep and .step both read it. To stop typing too, use OrigamiNumberFieldOptions.disabled or .readonly.",
  ],
  [
    "OrigamiNumberFieldIncrement",
    "Don't bind data-disabled. For OrigamiNumberFieldIncrement alone, add this condition both to its click handler and to the OrigamiButtonOptions it provides. To stop stepping from both buttons and the Input's ArrowUp and ArrowDown while typing stays on, make OrigamiNumberFieldOptions.step non-positive under it: NumberFieldContext.canStep and .step both read it. To stop typing too, use OrigamiNumberFieldOptions.disabled or .readonly.",
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
        name: "decorator metadata naming a variable or holding a spread is reported",
        code: `
          import { Directive } from "@angular/core";
          const sharedMetadata = { host: { "[attr.aria-describedby]": "hint" } };
          @Directive(sharedMetadata)
          class NamedMetadataWriter {}
          @Directive({ ...sharedMetadata, selector: "[spreadWriter]" })
          class SpreadMetadataWriter {}
          @Directive()
          class AbstractBase {}
        `,
        errors: [metadataNotLiteralMessage, metadataNotLiteralMessage],
      },
      {
        name: "shorthand hostDirectives naming a variable is reported",
        code: `
          import { Directive } from "@angular/core";
          import { OrigamiButton } from "@loozo/origami-ui/button";
          const hostDirectives = [OrigamiButton];
          @Directive({ hostDirectives, host: { "[attr.aria-disabled]": "disabledAria()" } })
          class OrigamiNewPart {}
        `,
        errors: [hostDirectivesNotLiteralMessage],
      },
      {
        name: "a spread inside hostDirectives is reported",
        code: `
          import { Directive } from "@angular/core";
          import { OrigamiButton } from "@loozo/origami-ui/button";
          const shared = [OrigamiButton];
          @Directive({ hostDirectives: [...shared] })
          class OrigamiNewPart {}
        `,
        errors: [hostDirectivesNotLiteralMessage],
      },
      {
        name: "a hostDirectives entry without a readable directive is reported",
        code: `
          import { Directive } from "@angular/core";
          import { OrigamiButton } from "@loozo/origami-ui/button";
          const entry = { directive: OrigamiButton };
          const directive = OrigamiButton;
          @Directive({ hostDirectives: [{ ...entry }], host: { "[attr.aria-disabled]": "disabledAria()" } })
          class OrigamiSpreadEntryPart {}
          @Directive({ hostDirectives: [{ directive }, { inputs: ["disabled"] }] })
          class OrigamiUnreadableEntryPart {}
          @Directive({ hostDirectives: [OrigamiButton, { directive: OrigamiButton, inputs: ["disabled"] }] })
          class ReadableEntries {}
        `,
        errors: [
          hostDirectiveEntryNotLiteralMessage,
          hostDirectiveEntryNotLiteralMessage,
          hostDirectiveEntryNotLiteralMessage,
        ],
      },
      {
        name: "a spread inside host is reported",
        code: `
          import { Directive } from "@angular/core";
          const sharedHost = { "[attr.aria-describedby]": "hint" };
          @Directive({ host: { ...sharedHost, role: "button" } })
          class SpreadHostWriter {}
        `,
        errors: [hostNotLiteralMessage],
      },
      {
        name: "host naming a variable, directly or as shorthand, is reported",
        code: `
          import { Directive } from "@angular/core";
          const host = { "[attr.aria-describedby]": "hint" };
          @Directive({ host: host })
          class NamedHostWriter {}
          @Directive({ host })
          class ShorthandHostWriter {}
        `,
        errors: [hostNotLiteralMessage, hostNotLiteralMessage],
      },
      {
        name: "a computed host key that isn't a static string is reported",
        code: `
          import { Directive } from "@angular/core";
          const key = "[attr.aria-describedby]";
          @Directive({ host: { [key]: "hint" } })
          class ComputedKeyWriter {}
        `,
        errors: [hostNotLiteralMessage],
      },
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
        name: "a no-argument HostBinding binds its member's name, reflected names included",
        code: `
          import { Directive, HostBinding } from "@angular/core";
          @Directive({})
          class OrigamiSwitch {
            @HostBinding() ariaDisabled = "true";
            @HostBinding() ariaDescribedByElements = [];
            @HostBinding() disabled = true;
            @HostBinding() title = "unrelated";
          }
        `,
        // Reported at the member key, column 27, not at the decorator, column 12.
        errors: [
          { message: directMessage("OrigamiSwitch", "aria-disabled"), line: 5, column: 27 },
          { message: describedByMessage, line: 6, column: 27 },
          { message: directMessage("OrigamiSwitch", "disabled"), line: 7, column: 27 },
        ],
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
