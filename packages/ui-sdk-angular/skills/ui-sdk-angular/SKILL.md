---
name: ui-sdk-angular
description: Builds Angular interfaces with ui-sdk's headless components through @loozo/ui-sdk-angular, the Angular directives over @ui-sdk/core (Toggle and single-value Select so far), with server rendering and hydration. Covers imports, one directive per part, controlled and uncontrolled inputs, cancelling a change, styling by core's attributes, hostDirectives composition and the SSR rules. Use whenever an Angular project has @loozo/ui-sdk-angular installed or the user wants ui-sdk components in Angular.
---

# Build with ui-sdk in Angular

`@loozo/ui-sdk-angular` puts ui-sdk's components on elements you write. `@ui-sdk/core` keeps every behavior (keyboard, focus, ARIA, popups, selection); each Angular directive is one part of a component, and core's attributes render on the server and in the browser.

## Read first

- `node_modules/@loozo/ui-sdk-angular/docs/llms.txt` is the index for the installed version. Read it, then only the component pages your task needs, like `docs/select.md`.
- For what an option or controller does, read core's docs: `node_modules/@ui-sdk/core/docs/llms.txt`, and core's skill (`node_modules/@ui-sdk/core/skills/ui-sdk/SKILL.md`) for building components core doesn't ship. Core's skill is written for React, Vue, Svelte, Solid and web components: in Angular, its framework examples and its "import from `@ui-sdk/<framework>/<component>`" rule are replaced by the rules below.
- Only Toggle and single-value Select have directives so far. For any other component, say so; don't hand-roll an adapter over `@ui-sdk/core/renderer`, which isn't public API.

## Rules

- **Import from entries**: `@loozo/ui-sdk-angular/toggle`, `@loozo/ui-sdk-angular/select`. The primary entry has only `UiSdkEvent`, `UiSdkError` and the input transforms; never use its `ɵ` exports.
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

- **Inputs are core's options and props, under core's names.** An unset input is "not passed". A controlled key (`pressed`, `value`, `open`, `query`) controls the component while set; `null` is a value (a Select with `null` selects nothing and stays controlled). Never switch a key between set and `undefined`.
- **Two-way binding**: `[(pressed)]`, `[(value)]`, `[(open)]` bind the input and `<key>Change`.
- **Refuse a change** in `(<key>ChangeRequest)`, which emits `{ value, details }` before `<key>Change`: call `details.cancel()`. Not writing a controlled value back isn't a cancellation.
- **Read state** from `state()` on the part directive (`exportAs` is the selector name), from another element or a descendant. Never from a binding on the part's own element: that throws `UiSdkError`.
- **Style by core's attributes** on each part: `[aria-pressed="true"]`, `[data-highlighted]`, `[aria-selected="true"]`, `[data-disabled]`, `[data-open]`. Core renders no styles.
- **Your attributes win.** A static `id`, `aria-label` or `aria-labelledby` on a part is the one rendered. Name every Select trigger with a static `aria-label` or `aria-labelledby`.
- **Item values** can be any type; give object values `[itemToValue]` on the root, and `[itemToLabel]` (or `[items]`) for labels that are right on the server.
- **Bind `[disabled]`**, not a static `disabled` attribute.

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
- In a `@defer (hydrate on interaction)` block whose code is already loaded, a fast first press can open a Select and close it again in Chromium; Angular replays the `pointerdown` after the `click` (Select readme, "Known limitation"). Don't work around it by reordering or dropping events.
- Put a part with a static `id` before the parts that reference it, like a Select trigger with an `id` before its content; written after, the server references the generated id until the part binds.
- Give separate Angular applications on one page distinct `APP_ID`s.
- Native forms and Angular Forms aren't supported yet: bind `[(value)]` to a signal and submit it yourself. `multiple` isn't supported.

## Test it

Test in the browser as a person would: press keys and click, then check the ARIA attributes and focus core sets. For server rendering, assert on the server HTML (`aria-*`, `role`, `data-ui-sdk-id`) before the page hydrates. Core's skill has `references/testing.md` for what to check.
