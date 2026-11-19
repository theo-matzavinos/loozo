# Checkbox

`@loozo/ui-sdk-angular/checkbox`: a checkbox, core's `checkbox`, from three directives on elements you write: the checkbox on a `<button>`, its indicator, and the hidden native input that takes part in a form. Checkboxes that share one value, core's `checkboxGroup`, go inside a `uiCheckboxGroup`.

```ts
import {
  UiCheckbox,
  UiCheckboxGroup,
  UiCheckboxGroupInput,
  UiCheckboxIndicator,
  UiCheckboxInput,
} from "@loozo/ui-sdk-angular/checkbox";
```

```html
<label>
  <button uiCheckbox #terms="uiCheckbox" name="terms" [(checked)]="accepted">
    <span uiCheckboxIndicator>✓</span>
  </button>
  <input [uiCheckboxInput]="terms" />
  Accept the terms
</label>

<!-- "indeterminate" shows a partly checked state; a press checks it -->
<button uiCheckbox checked="indeterminate" aria-label="Select all"></button>

<!-- refuse a change: the request comes first and can cancel -->
<button uiCheckbox (checkedChangeRequest)="$event.details.cancel()" aria-label="Locked"></button>

<!-- bound to a signal form field, in place of [(checked)] -->
<button uiCheckbox [formField]="f.terms" aria-label="Terms"></button>

<!-- a group with a parent that checks them all -->
<div
  uiCheckboxGroup
  name="toppings"
  [allValues]="toppings"
  [(value)]="chosen"
  aria-label="Toppings"
>
  <button uiCheckbox parent aria-label="All toppings"></button>
  @for (topping of toppings; track topping) {
  <label>
    <button uiCheckbox #box="uiCheckbox" [value]="topping"></button>
    <input [uiCheckboxInput]="box" />
    {{ topping }}
  </label>
  }
</div>
```

## `uiCheckbox`

`exportAs: "uiCheckbox"`. Put it on a `<button>`.

| Input            | Type                                      | Core option                                                          |
| ---------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| `checked`        | `boolean \| "indeterminate" \| undefined` | Controls it while set. Leave it unset for core to own it.            |
| `defaultChecked` | `boolean \| "indeterminate" \| undefined` | Checked at first, when uncontrolled; what a form reset restores.     |
| `disabled`       | `boolean \| undefined`                    | Not focusable, not changed, not submitted.                           |
| `readonly`       | `boolean \| undefined`                    | Core's `readOnly`: focusable and submitted, presses don't change it. |
| `required`       | `boolean \| undefined`                    | Blocks form submission until it's checked.                           |
| `name`           | `string \| undefined`                     | The name it submits under, through its input.                        |
| `value`          | `string \| undefined`                     | What it submits while checked; `"on"` when unset.                    |
| `form`           | `string \| undefined`                     | The id of the form it belongs to, when it isn't inside it.           |
| `parent`         | `boolean \| undefined`                    | Inside a group: stands for the others; see below.                    |
| `controller`     | `CheckboxController \| undefined`         | From core's `createCheckboxController()`.                            |
| `debug`          | `boolean \| undefined`                    | Logs state changes, in development builds.                           |

| Output                 | Emits                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `checkedChangeRequest` | `{ value, details }` first; `details.cancel()` refuses the press or reset.           |
| `checkedChange`        | The new `checked` (`CheckedState`), unless a request listener canceled it.           |
| `touch`                | Nothing (`void`), when focus leaves the button; signal forms mark the field touched. |

`state: Signal<CheckboxState>` is `{ checked, indeterminate, disabled, readOnly, required }`; `checked` is `false` while indeterminate.

## `uiCheckboxGroup`

`exportAs: "uiCheckboxGroup"`. Put it on an element around its checkboxes, and name it with `aria-label` or `aria-labelledby`. Each `uiCheckbox` inside joins it and names its `value`; the group's value decides `checked`, and its `disabled`, `readonly`, `name` and `form` apply to each one.

| Input          | Type                                      | Core option                                                       |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| `value`        | `T[] \| undefined`                        | The checked checkboxes' values. Controls it while set.            |
| `defaultValue` | `T[] \| undefined`                        | Checked at first, when uncontrolled; what a form reset restores.  |
| `allValues`    | `T[] \| undefined`                        | Every value a parent checks; set it to render the parent right.   |
| `disabled`     | `boolean \| undefined`                    | Every checkbox: not focusable, not changed, not submitted.        |
| `readonly`     | `boolean \| undefined`                    | Core's `readOnly`: focusable and submitted, presses don't change. |
| `required`     | `boolean \| undefined`                    | Blocks submission until one is checked, through its group input.  |
| `name`         | `string \| undefined`                     | The name each checkbox submits under, through its own input.      |
| `form`         | `string \| undefined`                     | The id of the form it belongs to, when it isn't inside it.        |
| `controller`   | `CheckboxGroupController<T> \| undefined` | From core's `createCheckboxGroupController()`.                    |
| `debug`        | `boolean \| undefined`                    | Logs state changes, in development builds.                        |

| Output               | Emits                                                                      |
| -------------------- | -------------------------------------------------------------------------- |
| `valueChangeRequest` | `{ value, details }` first; `details.cancel()` refuses the press or reset. |
| `valueChange`        | The new `value` (`T[]`), unless a request listener canceled it.            |

`state: Signal<CheckboxGroupState>` is `{ value, disabled, readOnly, required }`. `T` is a string type, `string` by default.

- **A parent checkbox** (`<button uiCheckbox parent>`) is checked when every value is, unchecked when none is and indeterminate in between, and pressing it checks or unchecks them all; disabled checkboxes keep their state. It submits nothing and points at the others with `aria-controls`.
- **Give the group `allValues`** when it has a parent. Without it, the parent counts the checkboxes that have bound, so the server renders it unchecked and it changes, to indeterminate say, when they bind.

## Parts

| Directive              | `exportAs`             | Inputs                                       | `state()`            |
| ---------------------- | ---------------------- | -------------------------------------------- | -------------------- |
| `uiCheckboxIndicator`  | `uiCheckboxIndicator`  | none                                         | the checkbox's state |
| `uiCheckboxInput`      | `uiCheckboxInput`      | `[uiCheckboxInput]` (its checkbox, required) | none                 |
| `uiCheckboxGroupInput` | `uiCheckboxGroupInput` | none                                         | none                 |

- **The indicator stays in the DOM** while unchecked, with `data-unchecked`, `data-checked` or `data-indeterminate`. Hide it by those attributes, or render it under `@if (terms.state().checked)`, which loses the exit animation.
- **The group input goes inside its `uiCheckboxGroup`**, on an `<input>`: a visually hidden checkbox that makes `required` block submission. It submits nothing itself.
- **The input goes beside the button**, not inside it: an `<input>` inside a `<button>` isn't valid HTML. Name the checkbox with a template reference, `#terms="uiCheckbox"`, before or after it in the same template. Put it on an `<input>`: core makes it a visually hidden `type="checkbox"` that submits, resets and validates the checkbox; see [native forms](../README.md#native-forms).

## Rules

- **Style by core's attributes** on the button: `[aria-checked="true"]`, `[aria-checked="mixed"]`, `[data-checked]`, `[data-disabled]`. Read `state()` from another element, a descendant or a consumer's host binding, not from a binding on the button itself.
- **Refuse a change with `checkedChangeRequest`.** Not writing a controlled `checked` back isn't a cancellation, and core warns in development after a second.
- **Bind `[disabled]`, `[required]` and `[name]`** rather than static attributes: a static attribute also stays on the `<button>` as plain HTML. That's harmless, since a `type="button"` never submits, but it isn't core's.
- **Name it** with a `<label>` around the button, a `<label for>` with the button's `id`, or `aria-label`.
- **Under `[formField]`**, bind a `boolean | "indeterminate"` field if anything can make it indeterminate: a `boolean` field compiles, and a press never produces `"indeterminate"`, but your own controller's `setChecked("indeterminate")` puts the string in the field. `"mixed"` is ARIA's word, not a value; it becomes `true`. See [signal forms](../README.md#signal-forms).
- **In a group, core gives each checkbox an `id`** (`<group id>-<value>`) when it binds, unless it has one: the server HTML has none. A parent gets its `aria-controls` when it binds too. Give the checkboxes a static `id` if the server HTML must have them.
- **A checkbox group isn't bound with signal forms**: `[formField]` on `uiCheckboxGroup` isn't supported.

## Composing it

Through `hostDirectives`; a template reference to the host directive's `exportAs` still names it for the input. To bind it with `[formField]`, expose what the field writes, `disabled`, `readonly` and `required` too, and `touch`; Angular focuses the host `<button>` itself:

```ts
@Directive({
  selector: "button[appCheckbox]",
  hostDirectives: [
    {
      directive: UiCheckbox,
      inputs: ["checked", "name", "disabled", "readonly", "required"],
      outputs: ["checkedChange", "touch"],
    },
  ],
  host: { "[class.app-checkbox-on]": "checkbox.state().checked" },
})
export class AppCheckbox {
  protected readonly checkbox = inject(UiCheckbox);
}
```

```html
<button appCheckbox #news="uiCheckbox" name="news" aria-label="News"></button>
<input [uiCheckboxInput]="news" />
```
