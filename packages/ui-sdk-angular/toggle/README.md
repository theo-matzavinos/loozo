# Toggle

`@loozo/ui-sdk-angular/toggle`: a two-state button, core's `toggle`, on the element you apply `uiToggle` to, and toggles that share one value, core's `toggleGroup`, inside a `uiToggleGroup`.

```ts
import { UiToggle, UiToggleGroup } from "@loozo/ui-sdk-angular/toggle";
```

```html
<!-- controlled: [(pressed)] binds the input and pressedChange -->
<button uiToggle [(pressed)]="bold" aria-label="Bold">B</button>

<!-- uncontrolled: core owns it; the output still reports changes -->
<button uiToggle [defaultPressed]="true" (pressedChange)="log($event)">Italic</button>

<!-- refuse a press: the request comes first and can cancel -->
<button uiToggle (pressedChangeRequest)="$event.details.cancel()">Locked</button>

<!-- a group: one value, one tab stop, arrow keys between its toggles -->
<div uiToggleGroup [(value)]="align" aria-label="Alignment">
  <button uiToggle value="left">Left</button>
  <button uiToggle value="center">Center</button>
  <button uiToggle value="right">Right</button>
</div>
```

## `uiToggle`

`exportAs: "uiToggle"`. Put it on a `<button>`.

| Input                   | Type                            | Core option                                                      |
| ----------------------- | ------------------------------- | ---------------------------------------------------------------- |
| `pressed`               | `boolean \| undefined`          | Controls it while set. Leave it unset for core to own it.        |
| `defaultPressed`        | `boolean \| undefined`          | Pressed at first, when uncontrolled.                             |
| `value`                 | `string \| undefined`           | Identifies it inside a group, whose `value` lists it.            |
| `disabled`              | `boolean \| undefined`          | Stops presses; natively disabled unless `focusableWhenDisabled`. |
| `focusableWhenDisabled` | `boolean \| undefined`          | Keeps a disabled toggle focusable, with `aria-disabled`.         |
| `controller`            | `ToggleController \| undefined` | From core's `createToggleController()`.                          |
| `debug`                 | `boolean \| undefined`          | Logs state changes, in development builds.                       |

| Output                 | Emits                                                             |
| ---------------------- | ----------------------------------------------------------------- |
| `pressedChangeRequest` | `{ value, details }` first; `details.cancel()` refuses the press. |
| `pressedChange`        | The new `pressed`, unless a request listener canceled it.         |

`state: Signal<ToggleState>` is `{ pressed, disabled }`.

Inside a `uiToggleGroup`, the group's value decides `pressed`: leave `pressed` and `defaultPressed` unset, and give each toggle a `value`. Inside a [`uiToolbar`](../toolbar/README.md), a toggle, or a toggle group, joins the toolbar's arrow keys and tab stop. Both are found through Angular's DI: any `uiToggle` under the group's or toolbar's element in a template joins it.

## `uiToggleGroup`

`exportAs: "uiToggleGroup"`. Put it on an element around its toggles, and name it with `aria-label` or `aria-labelledby`.

| Input          | Type                                      | Core option                                                       |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| `value`        | `T[] \| undefined`                        | The pressed toggles' values. Controls it while set.               |
| `defaultValue` | `T[] \| undefined`                        | Pressed at first, when uncontrolled.                              |
| `multiple`     | `boolean \| undefined`                    | Lets several be pressed; otherwise pressing one unpresses others. |
| `deselectable` | `boolean \| undefined`                    | Whether the pressed one can be unpressed; core's default `true`.  |
| `disabled`     | `boolean \| undefined`                    | Stops every toggle; they stay focusable with `aria-disabled`.     |
| `orientation`  | `"horizontal" \| "vertical" \| undefined` | Which arrow keys move between toggles.                            |
| `loop`         | `boolean \| undefined`                    | Whether arrow keys wrap; core's default `true`.                   |
| `controller`   | `ToggleGroupController<T> \| undefined`   | From core's `createToggleGroupController()`.                      |
| `debug`        | `boolean \| undefined`                    | Logs state changes, in development builds.                        |

| Output               | Emits                                                             |
| -------------------- | ----------------------------------------------------------------- |
| `valueChangeRequest` | `{ value, details }` first; `details.cancel()` refuses the press. |
| `valueChange`        | The new `value` (`T[]`), unless a request listener canceled it.   |

`state: Signal<ToggleGroupState>` is `{ value, multiple, disabled, orientation }`. `T` is a string type, `string` by default.

## Rules

- **Style by core's attributes** on the toggle itself: `[aria-pressed="true"]`, `[data-disabled]`. Don't read `state()` from a binding on the toggle's own element, like `[class.on]="t.state().pressed"`: Angular runs that binding before it sets the inputs, and it throws `UiSdkError`. Reading `state()` from another element, a descendant or a consumer's host binding is fine.
- **Refuse a change with `pressedChangeRequest`.** Not writing a controlled `pressed` back isn't a cancellation: observers still see the change, and core warns in development after a second.
- **Bind `[disabled]`** rather than a static `disabled` attribute: a static one stays even when core wants `aria-disabled`.
- **A toggle group isn't a form control**: it has no `name` and submits nothing, and binding it with signal forms' `[formField]` isn't supported.
- `ToggleIcon` isn't part of this release.

## Composing it

Through `hostDirectives`, exposing the inputs and outputs you want; host bindings run after the inputs, so they can read `state()`:

```ts
@Directive({
  selector: "button[appToggle]",
  hostDirectives: [
    {
      directive: UiToggle,
      inputs: ["pressed", "defaultPressed", "disabled"],
      outputs: ["pressedChange", "pressedChangeRequest"],
    },
  ],
  host: { class: "app-toggle", "[class.app-toggle-on]": "toggle.state().pressed" },
})
export class AppToggle {
  protected readonly toggle = inject(UiToggle);
}
```
