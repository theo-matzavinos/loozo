# Switch

`@loozo/ui-sdk-angular/switch`: an on/off switch, core's `switchPrimitive`, from three directives on elements you write: the switch on a `<button>`, its thumb, and the hidden native input that takes part in a form.

```ts
import { UiSwitch, UiSwitchInput, UiSwitchThumb } from "@loozo/ui-sdk-angular/switch";
```

```html
<button uiSwitch #wifi="uiSwitch" name="wifi" [(checked)]="wifiOn" aria-label="Wi-Fi">
  <span uiSwitchThumb></span>
</button>
<input [uiSwitchInput]="wifi" />

<!-- bound to a signal form field, in place of [(checked)] -->
<button uiSwitch [formField]="f.wifi" aria-label="Wi-Fi"><span uiSwitchThumb></span></button>
```

## `uiSwitch`

`exportAs: "uiSwitch"`. Put it on a `<button>`.

| Input            | Type                            | Core option                                                          |
| ---------------- | ------------------------------- | -------------------------------------------------------------------- |
| `checked`        | `boolean \| undefined`          | Controls it while set. Leave it unset for core to own it.            |
| `defaultChecked` | `boolean \| undefined`          | On at first, when uncontrolled; what a form reset restores.          |
| `disabled`       | `boolean \| undefined`          | Not focusable, not changed, not submitted.                           |
| `readonly`       | `boolean \| undefined`          | Core's `readOnly`: focusable and submitted, presses don't change it. |
| `required`       | `boolean \| undefined`          | Blocks form submission until it's on.                                |
| `name`           | `string \| undefined`           | The name it submits under, through its input.                        |
| `value`          | `string \| undefined`           | What it submits while on; `"on"` when unset.                         |
| `form`           | `string \| undefined`           | The id of the form it belongs to, when it isn't inside it.           |
| `controller`     | `SwitchController \| undefined` | From core's `createSwitchController()`.                              |
| `debug`          | `boolean \| undefined`          | Logs state changes, in development builds.                           |

| Output                 | Emits                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `checkedChangeRequest` | `{ value, details }` first; `details.cancel()` refuses the press or reset.           |
| `checkedChange`        | The new `checked`, unless a request listener canceled it.                            |
| `touch`                | Nothing (`void`), when focus leaves the button; signal forms mark the field touched. |

`state: Signal<SwitchState>` is `{ checked, disabled, readOnly, required }`.

## Parts

| Directive       | `exportAs`      | Inputs                                   | `state()`          |
| --------------- | --------------- | ---------------------------------------- | ------------------ |
| `uiSwitchThumb` | `uiSwitchThumb` | none                                     | the switch's state |
| `uiSwitchInput` | `uiSwitchInput` | `[uiSwitchInput]` (its switch, required) | none               |

The input goes beside the button and names the switch by a template reference, as Checkbox's does; see [native forms](../README.md#native-forms).

## Rules

- **Style by core's attributes**: `[aria-checked="true"]` or `[data-checked]` on the switch and the thumb, `[data-disabled]`. Read `state()` from another element, a descendant or a consumer's host binding, not from a binding on the button itself.
- **Refuse a change with `checkedChangeRequest`.** Not writing a controlled `checked` back isn't a cancellation.
- **Bind `[disabled]`, `[required]` and `[name]`** rather than static attributes, which also stay on the `<button>` as plain HTML.
- **Name it** with `aria-label`, a `<label>` around it, or a `<label for>` with its `id`.
- **Under `[formField]`, bind a `boolean` field.** The compiler also accepts `boolean | "indeterminate"`, an artifact of the input's transform; a switch is never indeterminate. See [signal forms](../README.md#signal-forms).
- **Composing it** through `hostDirectives` works as [Checkbox's](../checkbox/README.md#composing-it) does, with the same inputs and outputs for `[formField]`.
