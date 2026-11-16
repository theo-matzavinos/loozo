# Toggle

`@loozo/ui-sdk-angular/toggle`: a two-state button, core's `toggle`, on the element you apply `uiToggle` to.

```ts
import { UiToggle } from "@loozo/ui-sdk-angular/toggle";
```

```html
<!-- controlled: [(pressed)] binds the input and pressedChange -->
<button uiToggle [(pressed)]="bold" aria-label="Bold">B</button>

<!-- uncontrolled: core owns it; the output still reports changes -->
<button uiToggle [defaultPressed]="true" (pressedChange)="log($event)">Italic</button>

<!-- refuse a press: the request comes first and can cancel -->
<button uiToggle (pressedChangeRequest)="$event.details.cancel()">Locked</button>
```

## `uiToggle`

`exportAs: "uiToggle"`. Put it on a `<button>`.

| Input                   | Type                            | Core option                                                      |
| ----------------------- | ------------------------------- | ---------------------------------------------------------------- |
| `pressed`               | `boolean \| undefined`          | Controls it while set. Leave it unset for core to own it.        |
| `defaultPressed`        | `boolean \| undefined`          | Pressed at first, when uncontrolled.                             |
| `value`                 | `string \| undefined`           | Identifies it inside a group.                                    |
| `disabled`              | `boolean \| undefined`          | Stops presses; natively disabled unless `focusableWhenDisabled`. |
| `focusableWhenDisabled` | `boolean \| undefined`          | Keeps a disabled toggle focusable, with `aria-disabled`.         |
| `controller`            | `ToggleController \| undefined` | From core's `createToggleController()`.                          |
| `debug`                 | `boolean \| undefined`          | Logs state changes, in development builds.                       |

| Output                 | Emits                                                             |
| ---------------------- | ----------------------------------------------------------------- |
| `pressedChangeRequest` | `{ value, details }` first; `details.cancel()` refuses the press. |
| `pressedChange`        | The new `pressed`, unless a request listener canceled it.         |

`state: Signal<ToggleState>` is `{ pressed, disabled }`.

## Rules

- **Style by core's attributes** on the toggle itself: `[aria-pressed="true"]`, `[data-disabled]`. Don't read `state()` from a binding on the toggle's own element, like `[class.on]="t.state().pressed"`: Angular runs that binding before it sets the inputs, and it throws `UiSdkError`. Reading `state()` from another element, a descendant or a consumer's host binding is fine.
- **Refuse a change with `pressedChangeRequest`.** Not writing a controlled `pressed` back isn't a cancellation: observers still see the change, and core warns in development after a second.
- **Bind `[disabled]`** rather than a static `disabled` attribute: a static one stays even when core wants `aria-disabled`.
- Toggle groups and toolbars aren't part of this release; `group` and `toolbar` are core's internal options for them.

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
