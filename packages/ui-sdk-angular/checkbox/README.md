# Checkbox

`@loozo/ui-sdk-angular/checkbox`: a checkbox, core's `checkbox`, from three directives on elements you write: the checkbox on a `<button>`, its indicator, and the hidden native input that takes part in a form.

```ts
import { UiCheckbox, UiCheckboxIndicator, UiCheckboxInput } from "@loozo/ui-sdk-angular/checkbox";
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
```

## `uiCheckbox`

`exportAs: "uiCheckbox"`. Put it on a `<button>`.

| Input            | Type                                      | Core option                                                      |
| ---------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| `checked`        | `boolean \| "indeterminate" \| undefined` | Controls it while set. Leave it unset for core to own it.        |
| `defaultChecked` | `boolean \| "indeterminate" \| undefined` | Checked at first, when uncontrolled; what a form reset restores. |
| `disabled`       | `boolean \| undefined`                    | Not focusable, not changed, not submitted.                       |
| `readOnly`       | `boolean \| undefined`                    | Focusable and submitted, but presses don't change it.            |
| `required`       | `boolean \| undefined`                    | Blocks form submission until it's checked.                       |
| `name`           | `string \| undefined`                     | The name it submits under, through its input.                    |
| `value`          | `string \| undefined`                     | What it submits while checked; `"on"` when unset.                |
| `form`           | `string \| undefined`                     | The id of the form it belongs to, when it isn't inside it.       |
| `controller`     | `CheckboxController \| undefined`         | From core's `createCheckboxController()`.                        |
| `debug`          | `boolean \| undefined`                    | Logs state changes, in development builds.                       |

| Output                 | Emits                                                                      |
| ---------------------- | -------------------------------------------------------------------------- |
| `checkedChangeRequest` | `{ value, details }` first; `details.cancel()` refuses the press or reset. |
| `checkedChange`        | The new `checked` (`CheckedState`), unless a request listener canceled it. |

`state: Signal<CheckboxState>` is `{ checked, indeterminate, disabled, readOnly, required }`; `checked` is `false` while indeterminate.

## Parts

| Directive             | `exportAs`            | Inputs                                       | `state()`            |
| --------------------- | --------------------- | -------------------------------------------- | -------------------- |
| `uiCheckboxIndicator` | `uiCheckboxIndicator` | none                                         | the checkbox's state |
| `uiCheckboxInput`     | `uiCheckboxInput`     | `[uiCheckboxInput]` (its checkbox, required) | none                 |

- **The indicator stays in the DOM** while unchecked, with `data-unchecked`, `data-checked` or `data-indeterminate`. Hide it by those attributes, or render it under `@if (terms.state().checked)`, which loses the exit animation.
- **The input goes beside the button**, not inside it: an `<input>` inside a `<button>` isn't valid HTML. Name the checkbox with a template reference, `#terms="uiCheckbox"`, before or after it in the same template. Put it on an `<input>`: core makes it a visually hidden `type="checkbox"` that submits, resets and validates the checkbox; see [native forms](../README.md#native-forms).

## Rules

- **Style by core's attributes** on the button: `[aria-checked="true"]`, `[aria-checked="mixed"]`, `[data-checked]`, `[data-disabled]`. Read `state()` from another element, a descendant or a consumer's host binding, not from a binding on the button itself.
- **Refuse a change with `checkedChangeRequest`.** Not writing a controlled `checked` back isn't a cancellation, and core warns in development after a second.
- **Bind `[disabled]`, `[required]` and `[name]`** rather than static attributes: a static attribute also stays on the `<button>` as plain HTML. That's harmless, since a `type="button"` never submits, but it isn't core's.
- **Name it** with a `<label>` around the button, a `<label for>` with the button's `id`, or `aria-label`.
- Checkbox groups and parent checkboxes aren't part of this release; `group` is core's internal option for them, and `parent` isn't an input.

## Composing it

Through `hostDirectives`; a template reference to the host directive's `exportAs` still names it for the input:

```ts
@Directive({
  selector: "button[appCheckbox]",
  hostDirectives: [
    { directive: UiCheckbox, inputs: ["checked", "name"], outputs: ["checkedChange"] },
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
