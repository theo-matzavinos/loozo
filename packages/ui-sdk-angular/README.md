# @loozo/ui-sdk-angular

Angular directives for [ui-sdk.dev](https://ui-sdk.dev)'s headless core, `@ui-sdk/core`. Core keeps every behavior: keyboard, focus, ARIA, popups and selection. This package puts each of a component's parts on an element you write, one attribute directive per part, and renders core's attributes on the server and in the browser, so the page is correct before it hydrates.

**Status:** experimental. MIT license. It has [Toggle and ToggleGroup](toggle/README.md), [Toolbar](toolbar/README.md), single-value [Select](select/README.md) with its label and groups, [Checkbox and CheckboxGroup](checkbox/README.md), [Switch](switch/README.md) and [RadioGroup](radio/README.md). Checkbox, Switch, RadioGroup and Select take part in native forms and bind to [signal forms](#signal-forms).

## Install

```sh
npm install @loozo/ui-sdk-angular @ui-sdk/core@0.1.0-beta.13
```

- Angular `~22.2.2` (`@angular/core` and `@angular/common`).
- `@ui-sdk/core` exactly `0.1.0-beta.13`, as a peer dependency. Its renderer entry isn't public API and changes often, so each release of this package pins the one core version it was tested with. Another core version is an install-time peer conflict on purpose.

No provider: import the directives where you use them.

```ts
import { UiToggle, UiToggleGroup } from "@loozo/ui-sdk-angular/toggle";
import {
  UiToolbar,
  UiToolbarButton,
  UiToolbarGroup,
  UiToolbarInput,
  UiToolbarLink,
  UiToolbarSeparator,
} from "@loozo/ui-sdk-angular/toolbar";
import {
  UiSelect,
  UiSelectContent,
  UiSelectFormInput,
  UiSelectGroup,
  UiSelectGroupLabel,
  UiSelectItem,
  UiSelectLabel,
  UiSelectTrigger,
  UiSelectValue,
} from "@loozo/ui-sdk-angular/select";
import {
  UiCheckbox,
  UiCheckboxGroup,
  UiCheckboxGroupInput,
  UiCheckboxIndicator,
  UiCheckboxInput,
} from "@loozo/ui-sdk-angular/checkbox";
import { UiSwitch, UiSwitchInput, UiSwitchThumb } from "@loozo/ui-sdk-angular/switch";
import { UiRadio, UiRadioGroup, UiRadioIndicator, UiRadioInput } from "@loozo/ui-sdk-angular/radio";
```

Each component has its own entry, like core's. The primary entry, `@loozo/ui-sdk-angular`, has the `UiSdkEvent` type, the `UiSdkError` class and the input transforms `optionalBoolean`, `optionalChecked` and `optionalNumber`; its `ɵ`-prefixed exports are internal.

## How the directives map to core

- A root directive (`uiToggle`, `uiToggleGroup`, `uiToolbar`, `uiSelect`, `uiCheckbox`, `uiCheckboxGroup`, `uiSwitch`, `uiRadioGroup`) owns one core instance. Its inputs are core's options, under core's names, with one exception: core's `readOnly` is written `readonly`, the name native inputs and signal forms use (`[readonly]`, `readonly`); the TypeScript member stays `readOnly`. An unset input (`undefined`) isn't passed to core.
- Each part directive (`uiSelectTrigger`, `uiSelectItem`, …) is one core slot on its host element. Its inputs are the slot's props.
- A control inside a group finds the group through Angular's DI, the way core's other adapters use context: a `uiToggle` inside a `uiToggleGroup` or a `uiToolbar`, a `uiToggleGroup` inside a `uiToolbar`, a `uiCheckbox` inside a `uiCheckboxGroup`, a `uiSelectItem` inside a `uiSelectGroup`. Any such directive under the group's element in a template joins it, including one in a `@defer` block of its own.
- A controlled key (`pressed`, `checked`, `value`, `open`, `query`) controls the component when its input is set, and leaves core in charge while it's `undefined`. `null` is a value: a Select with `[value]="null"` selects nothing and stays controlled. Don't switch a key between controlled and uncontrolled.
- Each `on<Key>Change` callback is two outputs: `<key>ChangeRequest` first, with `{ value, details }`, where `details.cancel()` refuses the change; then `<key>Change` with the value, unless canceled. `[(value)]` binds the input and the second output.
- Each part with a state in core has a `state` signal, and each directive's `exportAs` is its selector.
- Style a part by the attributes core writes on it, like `[aria-pressed="true"]` or `[data-highlighted]`.
- Your attributes win over core's: a static `id`, `aria-label` or `aria-labelledby` on a part's element is the one rendered.

Each component's readme has its directives, inputs, outputs and rules.

## Native forms

Checkbox, Switch, RadioGroup and Select submit, reset and validate with a `<form>` through a hidden native input that you write, one directive on an `<input>`:

```html
<form>
  <button uiCheckbox #terms="uiCheckbox" name="terms" aria-label="Terms"></button>
  <input [uiCheckboxInput]="terms" />

  <div uiSelect name="fruit">
    …
    <input uiSelectFormInput />
  </div>
</form>
```

- **Checkbox groups.** Each checkbox in a `uiCheckboxGroup` submits through its own `uiCheckboxInput`, under the group's `name`; the group's `<input uiCheckboxGroupInput />`, inside it, only makes `required` block submission. A named group whose checkboxes have no inputs submits nothing and doesn't warn.
- **Where it goes.** A checkbox's or switch's input goes beside its `<button>`, since an `<input>` inside a button isn't valid HTML, and names its control by a template reference: `[uiCheckboxInput]="terms"`, `[uiSwitchInput]="wifi"`, `[uiRadioInput]="radio"`, one input per radio. The reference is read once; pointing it at another control later has no effect. Select's `uiSelectFormInput` goes inside the Select's element.
- **What core writes.** The input becomes visually hidden, `aria-hidden` and out of the tab order, with the control's `type`, `name`, `value`, `form`, `required` and `disabled`. Screen readers and keyboards use the control, not the input.
- **Before hydration** the server-rendered input already submits the server's value, and `required` already blocks submission.
- **Reset and validation.** A form reset returns each control to its default (`defaultChecked`, `defaultValue`; through `<key>ChangeRequest`, so it can be refused). A controlled control with no default, like one bound with `[(checked)]` or `[formField]` alone, keeps its value, as a controlled input does in React. When an invalid submit focuses a hidden input, core moves focus to its control.
- **A `<fieldset disabled>`** disables the buttons inside it natively, from the server HTML on, and leaves their inputs out of the submission. The server can't see the fieldset, so core adds `aria-disabled` and `data-disabled` to the control when it binds: style a disabled control by `:disabled` too, or the style changes at hydration.
- **The `checked` attribute is the default.** As on a native checkbox, the input's `checked` attribute is what a reset returns to; the current state is its `checked` property.
- **`name` without its input.** The control submits nothing; in development, a control with a static `name="…"` attribute and no input warns once after its first render. A bound `[name]`, like the one signal forms write, doesn't warn.
- **Keep a control and its input in one `@defer (hydrate …)` block.** An input in another block isn't connected until that block hydrates; until then it submits the server's value.

## Signal forms

Checkbox, Switch, RadioGroup and Select bind to Angular's signal forms (`@angular/forms/signals`): put `[formField]` on the control's root element, where `[(checked)]` or `[(value)]` would go. The package doesn't depend on `@angular/forms`; your app does.

```ts
import { FormField, form, required } from "@angular/forms/signals";
```

```html
<form>
  <button uiCheckbox #terms="uiCheckbox" [formField]="f.terms" aria-label="Terms">
    <span uiCheckboxIndicator>✓</span>
  </button>
  <!-- The hidden input only matters if the form also submits natively. -->
  <input [uiCheckboxInput]="terms" />

  <div uiRadioGroup [formField]="f.size" aria-label="Size">
    @for (option of sizes; track option) {
    <button uiRadio [value]="option">{{ option }}</button>
    }
  </div>
</form>
```

```ts
readonly model = signal({ terms: false, size: null as string | null });
readonly f = form(this.model, (path) => required(path.terms), { name: "signup" });
```

- **Start every field defined**: `true` or `false` for Checkbox and Switch, a value or `null` for RadioGroup and Select. While a field is `undefined`, signal forms don't write it, so the control stays uncontrolled and shows core's default; a field that goes back to `undefined` makes core warn that it stopped being controlled and keep its last value. An optional field (`f.optional`) doesn't compile; don't force it with `!`.
- **What the field writes**: the value, and its `disabled()`, `readonly()`, `required()` and `name` rules, to the root's inputs of the same names. Neither `[(checked)]`/`[(value)]` nor `name`, `disabled`, `readonly` or `required` go beside `[formField]`; Angular rejects them at compile time. `(checkedChangeRequest)` and `(valueChangeRequest)` still work beside it, and a canceled request leaves the field as it was.
- **Validity isn't rendered for you.** The roots don't take `invalid`, `errors`, `touched` or the other field state; core owns their ARIA and has no invalid state. Write it on the focusable element yourself, the button, the radio group's element or the Select trigger:

  ```html
  <button uiSelectTrigger aria-label="Country" [attr.aria-invalid]="f.country().invalid()"></button>
  ```

- **Touched**: the field is touched when focus leaves the control: a Checkbox's or Switch's button, a RadioGroup's element (arrow keys between its radios don't count), a Select's trigger and popup (opening it, moving through items and closing it back to the trigger don't count). The roots emit this as their `touch` output. Touch follows focus, not presses: a press that doesn't move focus, such as a click on a button in a browser that doesn't focus buttons on click, touches nothing; `submit()` marks every field touched anyway. Focus that leaves before the control's block has set its inputs doesn't touch it.
- **Focusing an invalid field**: `field().focusBoundControl()` focuses a Checkbox's or Switch's button, the checked radio (or the first enabled one), or the Select trigger, once the control has rendered; earlier it does nothing. Angular doesn't call it on its own: call it from `submit()`'s `onInvalid`, for example.
- **Native submission** still needs the [hidden input](#native-forms) beside or inside each control. It submits under the field's generated name, `<form name>.<path>`: give `form()` a `name`, or Angular's per-process `ng.form<n>` can differ between the server's HTML and the browser until hydration. Under `[formField]`, a Checkbox or Switch submits `"on"`, since `value` can't go beside it; the field itself holds the boolean. An object Select submits its `itemToValue` key and keeps the object in the field.
- **Reset with `f().reset(value)`**, which restores the controls and clears touched and dirty. A native `type="reset"` button leaves `[formField]` controls as they are: the field writes their value, so they have no default to return to. The field, the controls and the submitted values stay as they were.
- **`[formField]` goes on the control, never on its hidden input.** On the input, Angular binds the input natively: an external write to the field changes the input and leaves the visible control as it was.
- **Composing through `hostDirectives`**: expose `checked` or `value`, `disabled`, `readonly`, `required`, `name`, the change output and `touch`. Angular then treats your directive as the control, so a RadioGroup or Select composer forwards `focus()`; see each component's readme.
- **Types**: the roots aren't `FormCheckboxControl` or `FormValueControl` (those require `model()`); Angular finds them by their input and output names. Checkbox accepts `boolean | "indeterminate"`; a `boolean` field can still receive `"indeterminate"` if your own controller sets it. `ControlValueAccessor`, template-driven and reactive forms aren't supported.

## Server rendering and hydration

Works with `provideClientHydration()`, eager (`withEventReplay()`, `withNoIncrementalHydration()`) or incremental (Angular 22's default), with or without zone.js.

- **Instance ids.** Every root renders `data-ui-sdk-id` (`ui-sdk-s<n>` from the server) and reads it back while hydrating, so the ids core derives part ids from match on both sides, also under `@defer`. A `uiSelectGroup` renders one too, since its labels' ids come from it. A root the browser creates gets `ui-sdk-<n>`.
- **One `APP_ID` per application.** Two Angular applications on one page need distinct `APP_ID`s, or their ids can collide; with a custom `APP_ID`, ids become `ui-sdk-<appId>-…`.
- **Keep a root and all its parts in one `@defer (hydrate …)` block.** A part in a different hydrate boundary from its root can be unbound while its siblings handle events.
- **`hydrate on interaction` and a fast first press.** In Chromium, and rarely in WebKit, a press shorter than the block's hydration can open a Select and close it again: Angular replays the press's `pointerdown` after its `click`. See [Select's known limitation](select/README.md#known-limitation).
- **Authored ids before their references.** A part with a static `id` that other parts point at, like a Select trigger the content's `aria-labelledby` names, must come earlier in the same template than those parts, or sit in an ancestor view. Written after them, the server renders references to the generated id, and core repairs them when the authored part binds.
- **Groups settle some attributes at bind.** Core writes a few attributes only once the parts bind: a grouped checkbox's made `id` and a parent checkbox's `aria-controls`, a parent's checked state without `allValues`, and a Select group's `hidden` and `aria-labelledby` and the content's name once a SelectLabel binds. See the [Checkbox](checkbox/README.md#rules) and [Select](select/README.md#rules) rules. A Toolbar and its toggles render final on the server, unless every item is disabled: then the server renders no tab stop, and the first item gets `tabindex="0"` at bind; see [Toolbar's rules](toolbar/README.md#rules).
- **A popup that starts open settles at bind.** A Select rendered open is positioned, and renamed with the same name as `aria-label`, when its trigger binds; see [Select's rules](select/README.md#rules).
- **Events before the first bind.** Angular replays the events a user makes before a block hydrates; they arrive after the parts bind. A live event that reaches a part before its first bind, as in a block created outside change detection, waits and reaches core once every part of that render pass has bound.

Shadow DOM, slotted content and elements from another realm, like an iframe, aren't supported.

## Upgrading core

Each core upgrade is its own release of this package: bump both pins, read core's changelog and the diff of its renderer entry and the kernel files behind it, then run the package's checks. `pnpm test` fails when a core option or slot prop isn't classified or has an input of the wrong kind, or when a part's event types and its directive's listeners drift; the browser suite, in Chromium, Firefox and WebKit with eager and incremental hydration, is the upgrade gate.

## Docs for agents

The package ships its docs as Markdown: `docs/llms.txt` is the index, `docs/<component>.md` each component, and `skills/ui-sdk-angular/SKILL.md` the agent skill. Core's own docs, for options, controllers and behavior, are in `@ui-sdk/core/docs`.

## Development

```sh
pnpm --filter @loozo/ui-sdk-angular run build
pnpm --filter @loozo/ui-sdk-angular test          # type parity, classification and event checks
pnpm --filter @loozo/ui-sdk-angular run test:browser
```

`test:browser` builds the package and the SSR fixture app in `tests/browser/` (eager and incremental), then runs the Playwright suite in all three engines; `UI_SDK_BROWSER=chromium` and `UI_SDK_MODE=eager` narrow it. Its builds and browser runs take the workspace's machine-wide lock (`packages/origami-ui/tests/acceptance/gate-lock.sh`), and WebKit uses Origami's private library setup when `ORIGAMI_WEBKIT_DEPS_ROOT` is set (see [Origami's acceptance readme](../origami-ui/tests/acceptance/README.md)).
