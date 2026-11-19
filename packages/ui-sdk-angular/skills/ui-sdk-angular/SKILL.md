---
name: ui-sdk-angular
description: Builds Angular interfaces with ui-sdk's headless components through @loozo/ui-sdk-angular, the Angular directives over @ui-sdk/core (Toggle, single-value Select, Checkbox, Switch and RadioGroup so far), with server rendering, hydration and native forms. Covers imports, one directive per part, controlled and uncontrolled inputs, cancelling a change, styling by core's attributes, hidden form inputs, hostDirectives composition and the SSR rules. Use whenever an Angular project has @loozo/ui-sdk-angular installed or the user wants ui-sdk components in Angular.
---

# Build with ui-sdk in Angular

`@loozo/ui-sdk-angular` puts ui-sdk's components on elements you write. `@ui-sdk/core` keeps every behavior (keyboard, focus, ARIA, popups, selection); each Angular directive is one part of a component, and core's attributes render on the server and in the browser.

## Read first

- `node_modules/@loozo/ui-sdk-angular/docs/llms.txt` is the index for the installed version. Read it, then only the component pages your task needs, like `docs/select.md`.
- For what an option or controller does, read core's docs: `node_modules/@ui-sdk/core/docs/llms.txt`, and core's skill (`node_modules/@ui-sdk/core/skills/ui-sdk/SKILL.md`) for building components core doesn't ship. Core's skill is written for React, Vue, Svelte, Solid and web components: in Angular, its framework examples and its "import from `@ui-sdk/<framework>/<component>`" rule are replaced by the rules below.
- Only Toggle, single-value Select, Checkbox, Switch and RadioGroup have directives so far. For any other component, say so; don't hand-roll an adapter over `@ui-sdk/core/renderer`, which isn't public API.

## Rules

- **Import from entries**: `@loozo/ui-sdk-angular/toggle`, `/select`, `/checkbox`, `/switch`, `/radio`. The primary entry has only `UiSdkEvent`, `UiSdkError` and the input transforms; never use its `ɵ` exports.
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

- **Inputs are core's options and props, under core's names**, except core's `readOnly`, written `[readonly]` (or a static `readonly`) on Checkbox, Switch, RadioGroup and Select. An unset input is "not passed". A controlled key (`pressed`, `checked`, `value`, `open`, `query`) controls the component while set; `null` is a value (a Select with `null` selects nothing and stays controlled). Never switch a key between set and `undefined`.
- **Two-way binding**: `[(pressed)]`, `[(checked)]`, `[(value)]`, `[(open)]` bind the input and `<key>Change`.
- **Refuse a change** in `(<key>ChangeRequest)`, which emits `{ value, details }` before `<key>Change`: call `details.cancel()`. Not writing a controlled value back isn't a cancellation.
- **Read state** from `state()` on the part directive (`exportAs` is the selector name), from another element or a descendant. Never from a binding on the part's own element: that throws `UiSdkError`.
- **Style by core's attributes** on each part: `[aria-pressed="true"]`, `[data-highlighted]`, `[aria-selected="true"]`, `[data-disabled]`, `[data-open]`. Core renders no styles.
- **Your attributes win.** A static `id`, `aria-label` or `aria-labelledby` on a part is the one rendered. Name every Select trigger with a static `aria-label` or `aria-labelledby`.
- **Item values** can be any type; give object values `[itemToValue]` on the root, and `[itemToLabel]` (or `[items]`) for labels that are right on the server.
- **Bind `[disabled]`**, not a static `disabled` attribute.
- **Native forms need the hidden input you write.** Give the control a `name`, then add its input: beside a checkbox or switch button, naming it by template reference (`<button uiCheckbox #terms="uiCheckbox" name="terms">` then `<input [uiCheckboxInput]="terms" />`; `[uiSwitchInput]`; `<input [uiRadioInput]="radio" />` beside each `<button uiRadio #radio="uiRadio">`), and `<input uiSelectFormInput />` inside a Select. Never put the input inside the button. Without it nothing submits, and development builds warn.
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
- Put a part with a static `id` before the parts that reference it, like a Select trigger with an `id` before its content; written after, the server references the generated id until the part binds.
- A Select rendered open (`[defaultOpen]="true"`) is unpositioned on the server; core positions it and moves its name from `aria-labelledby` to `aria-label` when the trigger binds. Start it closed when the server render must be final.
- Give separate Angular applications on one page distinct `APP_ID`s.
- Server-rendered hidden inputs submit the server's values before hydration. A control inside `<fieldset disabled>` gets `aria-disabled` and `data-disabled` only when it binds; style it by `:disabled` too.
- Select `multiple` isn't supported.

## Signal forms

- **`[formField]` goes on the control's root**: `<button uiCheckbox [formField]="f.terms">`, `uiSwitch`, `<div uiRadioGroup [formField]="f.size">`, `<div uiSelect [formField]="f.country">`. Never on its hidden input, and never beside `[(checked)]`, `[(value)]`, `name`, `disabled`, `readonly` or `required`: the field writes those.
- **Start every field defined**: booleans for Checkbox and Switch, a value or `null` for RadioGroup and Select. Never `undefined`, and no optional fields.
- **Add the hidden input only for native submission**, and give `form()` a `name` then. Checkbox and Switch submit `"on"` under `[formField]`.
- **Render validity yourself** on the focusable element (`[attr.aria-invalid]="f.x().invalid()"` on the button, the group's element or the Select trigger); the roots don't take `invalid` or `errors`.
- **Reset with `f().reset(value)`**, not a native reset button, to restore the value and clear touched and dirty.
- **Focus an invalid field** with `field().focusBoundControl()` from an event, like `submit()`'s `onInvalid`; a `hostDirectives` composer of RadioGroup or Select forwards `focus()` and exposes `touch`.
- `ControlValueAccessor`, template-driven and reactive forms aren't supported.

## Test it

Test in the browser as a person would: press keys and click, then check the ARIA attributes and focus core sets. For server rendering, assert on the server HTML (`aria-*`, `role`, `data-ui-sdk-id`) before the page hydrates. Core's skill has `references/testing.md` for what to check.
