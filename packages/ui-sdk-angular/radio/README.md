# Radio group

`@loozo/ui-sdk-angular/radio`: a set of radios, core's `radioGroup`, from four directives on elements you write: the group, each radio on a `<button>`, its indicator, and the hidden native input beside each radio that takes part in a form.

```ts
import { UiRadio, UiRadioGroup, UiRadioIndicator, UiRadioInput } from "@loozo/ui-sdk-angular/radio";
```

```html
<div uiRadioGroup name="size" [(value)]="size" aria-label="Size">
  @for (option of sizes; track option) {
  <button uiRadio #radio="uiRadio" [value]="option">
    <span uiRadioIndicator></span>{{ option }}
  </button>
  <input [uiRadioInput]="radio" />
  }
</div>
```

```ts
readonly size = signal<"s" | "m" | "l" | null>("m"); // null checks none and stays controlled
```

With signal forms, `[formField]="f.size"` takes the place of `[(value)]`; see [signal forms](../README.md#signal-forms).

## `uiRadioGroup`

`exportAs: "uiRadioGroup"`, generic over the value type `T extends string` (`string` by default).

| Input          | Type                                   | Core option                                                                     |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| `value`        | `T \| null \| undefined`               | The checked radio's value; `null` checks none. Controls it while set.           |
| `defaultValue` | `T \| null \| undefined`               | Checked at first, when uncontrolled; what a form reset restores.                |
| `disabled`     | `boolean \| undefined`                 | Every radio: out of the tab order, not changed, not submitted.                  |
| `readonly`     | `boolean \| undefined`                 | Core's `readOnly`: focusable and submitted, presses and arrows don't change it. |
| `required`     | `boolean \| undefined`                 | Blocks form submission until a radio is checked.                                |
| `name`         | `string \| undefined`                  | The name the checked radio submits under, through its input.                    |
| `form`         | `string \| undefined`                  | The id of the form it belongs to, when it isn't inside it.                      |
| `loop`         | `boolean \| undefined`                 | Whether arrow keys wrap; core's default is `true`.                              |
| `controller`   | `RadioGroupController<T> \| undefined` | From core's `createRadioGroupController()`.                                     |
| `debug`        | `boolean \| undefined`                 | Logs state changes, in development builds.                                      |

| Output               | Emits                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `valueChangeRequest` | `{ value, details }` first; `details.cancel()` refuses the press, arrow key or reset.                                          |
| `valueChange`        | The new `value` (`T \| null`), unless a request listener canceled it.                                                          |
| `touch`              | Nothing (`void`), when focus leaves the group; an arrow key between radios doesn't count. Signal forms mark the field touched. |

`state: Signal<RadioGroupState>` is `{ value, disabled, readOnly, required }`.

`focus(options?)` focuses the checked radio, or the first enabled one when none is checked; signal forms' `focusBoundControl()` calls it. It takes effect once the radios have rendered (call it after `afterNextRender` or from an event); earlier it does nothing. Core's focus takes no options, so `options` is ignored.

## Parts

| Directive          | `exportAs`         | Inputs                                 | `state()`                                   |
| ------------------ | ------------------ | -------------------------------------- | ------------------------------------------- |
| `uiRadio`          | `uiRadio`          | `value` (required), `disabled`         | `{ checked, disabled, readOnly, required }` |
| `uiRadioIndicator` | `uiRadioIndicator` | none; its radio's value                | its radio's state                           |
| `uiRadioInput`     | `uiRadioInput`     | `[uiRadioInput]` (its radio, required) | none                                        |

- **Each radio's `value` is unique in its group**: core keys the radio, and its input, by it.
- **Arrow keys move and check**: focus moves to the next enabled radio and checks it, skipping disabled ones; one radio holds the tab stop, the checked one or else the first enabled one.
- **The indicator stays in the DOM** while unchecked, with `data-unchecked`; hide it by that attribute, or render it under `@if (radio.state().checked)`.
- **The input goes beside its radio's button** and names the radio by a template reference, `#radio="uiRadio"`, which gives it the radio's value and disabled state. Core makes it a visually hidden `type="radio"`; see [native forms](../README.md#native-forms).

## Rules

- **Name the group** with `aria-label` or `aria-labelledby` on its element.
- **Style by core's attributes**: `[aria-checked="true"]` or `[data-checked]` on a radio and its indicator, `[data-disabled]`. Read `state()` from descendants or other elements, not from a binding on a part's own element.
- **Refuse a change with `valueChangeRequest`.** Not writing a controlled `value` back isn't a cancellation.
- **Bind `[disabled]`** on a radio rather than a static attribute.
- Keep the group and all its radios inside one `@defer (hydrate …)` block.
- **Under `[formField]`, bind a `string | null` field** (or a union of string literals). The compiler also accepts object fields there, which aren't supported.
- **Composing it** through `hostDirectives` for `[formField]`: expose `value`, `disabled`, `readonly`, `required`, `name`, `valueChange` and `touch`, and forward `focus()`, since Angular calls your directive's, as [Select's](../select/README.md#composing-it) example shows.
