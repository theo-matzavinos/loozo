---
name: ui-sdk-angular
description: Builds Angular interfaces with ui-sdk's headless components through @loozo/ui-sdk-angular, the Angular directives over @ui-sdk/core (Toggle, ToggleGroup, Toolbar, single-value Select with its label and groups, Checkbox, CheckboxGroup, Switch, RadioGroup, Tabs, Accordion and Collapsible so far), with server rendering, hydration and native forms. Covers imports, one directive per part, groups found through DI, structural panels, controlled and uncontrolled inputs, cancelling a change, styling by core's attributes, hidden form inputs, hostDirectives composition and the SSR rules. Use whenever an Angular project has @loozo/ui-sdk-angular installed or the user wants ui-sdk components in Angular.
---

# Build with ui-sdk in Angular

`@loozo/ui-sdk-angular` puts ui-sdk's components on elements you write. `@ui-sdk/core` keeps every behavior (keyboard, focus, ARIA, popups, selection); each Angular directive is one part of a component, and core's attributes render on the server and in the browser.

## Read first

- `node_modules/@loozo/ui-sdk-angular/docs/llms.txt` is the index for the installed version. Read it, then only the component pages your task needs, like `docs/select.md`.
- For what an option or controller does, read core's docs: `node_modules/@ui-sdk/core/docs/llms.txt`, and core's skill (`node_modules/@ui-sdk/core/skills/ui-sdk/SKILL.md`) for building components core doesn't ship. Core's skill is written for React, Vue, Svelte, Solid and web components: in Angular, its framework examples and its "import from `@ui-sdk/<framework>/<component>`" rule are replaced by the rules below.
- Only Toggle, ToggleGroup, Toolbar, single-value Select (with SelectLabel, SelectGroup and SelectGroupLabel), Checkbox, CheckboxGroup, Switch, RadioGroup, Tabs, Accordion and Collapsible have directives so far. For any other component, say so; don't hand-roll an adapter over `@ui-sdk/core/renderer`, which isn't public API.

## Rules

- **Import from entries**: `@loozo/ui-sdk-angular/toggle`, `/toolbar`, `/select`, `/checkbox`, `/switch`, `/radio`, `/tabs`, `/accordion`, `/collapsible`. The primary entry has only `UiSdkEvent`, `UiSdkError` and the input transforms; never use its `ɵ` exports.
- **One directive per part**, on an element you write, nested as core's composition shows:

  ```html
  <div uiSelect [(value)]="fruit">
    <button uiSelectTrigger aria-label="Fruit">
      <span uiSelectValue #shown="uiSelectValue">{{ shown.state().label || "Pick one" }}</span>
    </button>
    <div uiSelectContent>
      @for (option of fruits; track option.value) {
      <div [uiSelectItem]="option.value" [label]="option.label">{{ option.label }}</div>
      }
    </div>
  </div>
  ```

- **Groups are found through DI**: put `uiTabsTabIcon` inside its `uiTabsTab`, `uiToggle` inside `uiToggleGroup` or `uiToolbar` (and `uiToggleGroup` inside `uiToolbar`), `uiCheckbox` inside `uiCheckboxGroup`, `uiSelectItem` inside `uiSelectGroup`, and toolbar items (`uiToolbarButton`, `uiToolbarLink`, `uiToolbarInput`, `uiToolbarGroup`, `uiToolbarSeparator`) inside `uiToolbar`. Inside a group, give each toggle or checkbox a `value` and leave `pressed`/`checked` unset: the group's `[(value)]` (a string array) decides. A `uiCheckbox parent` checks them all; give its group `[allValues]` so the server renders it right.
- **Panels are structural**: `*uiTabsPanel="'profile'"`, `*uiAccordionPanel`, `*uiCollapsiblePanel` on the panel's element. Core decides whether it's in the page: a closed panel in the default mode isn't, and its content is destroyed; `keepMounted` and `hiddenUntilFound` keep it hidden with its content. Per-panel `keepMounted` or `hiddenUntilFound` need the `<ng-template>` form (`<ng-template uiCollapsiblePanel hiddenUntilFound><div>…</div></ng-template>`), never `*uiCollapsiblePanel="…; keepMounted: true"`. **One unconditional root element**: the template renders exactly the panel's element; put every `@if` and `@for` inside it. The `UiSdkError` check runs when the panel's view is created, so it catches static siblings only: a top-level `@if` or `@for` beside the element renders outside the panel with no error. Never wrap a panel in your own `@if (open)`: core keeps it for its exit animation and `openChangeComplete`. Panels can't go in `hostDirectives`.

  ```html
  <div uiAccordion [(value)]="open">
    <div uiAccordionItem value="shipping">
      <h3 uiAccordionHeader><button uiAccordionTrigger>Shipping</button></h3>
      <div *uiAccordionPanel>…</div>
    </div>
  </div>
  ```

- **Accordion parts go inside a `uiAccordionItem` of the same `uiAccordion`**; a trigger straight inside a nested accordion without its own item throws `UiSdkError`. Write the heading yourself (`<h3 uiAccordionHeader>`). An item without `value` gets a made one, and it reaches `[(value)]` and `valueChange` typed as your `T`: leave `value` unset only with a `string[]` model; with a narrower one, like `('shipping' | 'billing')[]`, give every item a `value` from it. An item has `openChangeRequest` (a request; another item or the accordion can still refuse) and `openChangeComplete`, never `openChange`: read whether it's open from `state()` or the accordion's `value`.
- **A tab and its panel share a value**: `<button uiTabsTab value="billing">` and `*uiTabsPanel="'billing'"`. Give a server-rendered Tabs a concrete `value` or `defaultValue`. Without one the server selects the first enabled tab Angular creates, which is the first in DOM order only when all tabs are static or all in one `@for` (a tab in an `@if` beside static ones can make the selection change at hydration); its default-mode panel may appear only at hydration; and `state().value` is `null` on the server. `[value]="null"` selects no tab and renders no default-mode panel.
- **Inputs are core's options and props, under core's names**, except core's `readOnly`, written `[readonly]` (or a static `readonly`) on Checkbox, CheckboxGroup, Switch, RadioGroup and Select. An unset input is "not passed". A controlled key (`pressed`, `checked`, `value`, `open`, `query`) controls the component while set; `null` is a value (a Select with `null` selects nothing and stays controlled). Never switch a key between set and `undefined`.
- **Two-way binding**: `[(pressed)]`, `[(checked)]`, `[(value)]`, `[(open)]` bind the input and `<key>Change`. `<key>Change` is the proposal, emitted before core commits; read the committed state from `state()`.
- **Refuse a change** in `(<key>ChangeRequest)`, which emits `{ value, details }` before `<key>Change`: call `details.cancel()`. Not writing a controlled value back isn't a cancellation.
- **Read state** from `state()` on the part directive (`exportAs` is the selector name), from another element or a descendant. Never from a binding on the part's own element: that throws `UiSdkError`.
- **Style by core's attributes** on each part: `[aria-pressed="true"]`, `[data-highlighted]`, `[aria-selected="true"]`, `[data-disabled]`, `[data-open]`. Core renders no styles.
- **Handle a `uiToolbarButton`'s press with `(press)`, never `(click)`**: Angular replays a click made before hydration past core's disabled check, so a disabled button's `(click)` (or a `routerLink` on any toolbar item) runs once; `press` emits only while enabled. Don't give a toolbar link an `href` while it's disabled.
- **Your attributes win.** A static `id`, `aria-label` or `aria-labelledby` on a part is the one rendered. Name every Select trigger with a `<span uiSelectLabel>` inside the Select, or a static `aria-label` or `aria-labelledby`, not both a label and an attribute. Name toggle groups, checkbox groups and toolbars with `aria-label` or `aria-labelledby`.
- **Item values** can be any type; give object values `[itemToValue]` on the root, and `[itemToLabel]` (or `[items]`) for labels that are right on the server.
- **Bind `[disabled]`**, not a static `disabled` attribute.
- **Native forms need the hidden input you write.** Give the control a `name`, then add its input: beside a checkbox or switch button, naming it by template reference (`<button uiCheckbox #terms="uiCheckbox" name="terms">` then `<input [uiCheckboxInput]="terms" />`; `[uiSwitchInput]`; `<input [uiRadioInput]="radio" />` beside each `<button uiRadio #radio="uiRadio">`), and `<textarea uiSelectFormInput></textarea>` inside a Select. In a `uiCheckboxGroup`, each checkbox still needs its own `uiCheckboxInput` (it submits under the group's `name`), and `required` needs `<input uiCheckboxGroupInput />` inside the group. Never put the input inside the button. Without it nothing submits, and development builds warn.
- **Indicators stay in the DOM**: hide `uiCheckboxIndicator` and `uiRadioIndicator` by `[data-unchecked]`, or render them under `@if (ref.state().checked)`.

## Composing a part into your own directive

Use `hostDirectives`, exposing the inputs and outputs you want; a host binding can read `state()`:

```ts
@Directive({
  selector: "button[appToggle]",
  hostDirectives: [
    { directive: UiToggle, inputs: ["pressed", "disabled"], outputs: ["pressedChange"] },
  ],
  host: { "[class.app-toggle-on]": "toggle.state().pressed" },
})
export class AppToggle {
  protected readonly toggle = inject(UiToggle);
}
```

## Server rendering and hydration

- Works with `provideClientHydration()`, eager or incremental. No provider of its own.
- Keep a root and all its parts inside one `@defer (hydrate …)` block.
- In a `@defer (hydrate on interaction)` block whose code is already loaded, a fast first press can open a Select and close it again in Chromium, and rarely in WebKit; Angular replays the `pointerdown` after the `click` (Select readme, "Known limitation"). Don't work around it by reordering or dropping events.
- Put a part with a static `id` before the parts that reference it, like a Select trigger with an `id` before its content: earlier in the same view, in an ancestor view, or in an earlier `@if`/`@for` block of the same parent view. A part inside an `@if` or `@for` writes after the static parts around it, and a child component's view after all of its parent's blocks, so a Tabs tab with an `id` in a `@for` and its panel static after the list misses it. Otherwise the server can reference the generated id until the parts bind; generated ids always match.
- A Select rendered open (`[defaultOpen]="true"`) is unpositioned on the server; core positions it and moves its name from `aria-labelledby` to `aria-label` when the trigger binds. Start it closed when the server render must be final.
- Give separate Angular applications on one page distinct `APP_ID`s.
- Server-rendered hidden inputs submit the server's values before hydration. A control inside `<fieldset disabled>` gets `aria-disabled` and `data-disabled` only when it binds; style it by `:disabled` too.
- Panels follow core's presence: a closed default-mode panel is only Angular's anchor comment in the server HTML; a kept one renders with `hidden`, a findable one with `hidden="until-found"`. Don't set `display` on a kept or findable panel's class (core's hiding rule arrives at bind); scope it with `:not([hidden])`. A find before hydration reveals a findable panel's text without opening it; bind restores it.
- Accordion has no arrow keys between triggers in this core version.
- Select `multiple` isn't supported, nor a Select trigger (or any other component's part) on a `uiToolbarButton`'s element, nor Menubar.
- Core settles some group attributes when parts bind: a grouped checkbox's made `id`, a parent's `aria-controls` (and its checked state without `allValues`), a Select group's `aria-labelledby`. Don't "fix" them; give checkboxes static ids if the server HTML needs them.

## Signal forms

- **`[formField]` isn't supported on `uiToggleGroup` or `uiCheckboxGroup`.**
- **`[formField]` goes on the control's root**: `<button uiCheckbox [formField]="f.terms">`, `uiSwitch`, `<div uiRadioGroup [formField]="f.size">`, `<div uiSelect [formField]="f.country">`. Never on its hidden input, and never beside `[(checked)]`, `[(value)]`, `name`, `disabled`, `readonly` or `required`: the field writes those.
- **Start every field defined**: booleans for Checkbox and Switch, a value or `null` for RadioGroup and Select. Never `undefined`, and no optional fields.
- **Add the hidden input only for native submission**, and give `form()` a `name` then. Checkbox and Switch submit `"on"` under `[formField]`.
- **Render validity yourself** on the focusable element (`[attr.aria-invalid]="f.x().invalid()"` on the button, the group's element or the Select trigger); the roots don't take `invalid` or `errors`.
- **Reset with `f().reset(value)`** to restore the value and clear touched and dirty. A native reset button leaves `[formField]` controls as they are.
- **Focus an invalid field** with `field().focusBoundControl()` from an event, like `submit()`'s `onInvalid`; a `hostDirectives` composer of RadioGroup or Select forwards `focus()` and exposes `touch`.
- `ControlValueAccessor`, template-driven and reactive forms aren't supported.

## Test it

Test in the browser as a person would: press keys and click, then check the ARIA attributes and focus core sets. For server rendering, assert on the server HTML (`aria-*`, `role`, `data-ui-sdk-id`) before the page hydrates. Core's skill has `references/testing.md` for what to check.
