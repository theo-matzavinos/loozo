# Toggle

Toggle is a two-state button, such as a mute, bold or dark-theme button: a native button that flips a `pressed` model.

[src/toggle/mute.ts](../snippets/src/toggle/mute.ts)

It has a `pressed` model (default `false`) and a `disabled` input (default `false`). Each Toggle is its own owner; for a set of toggles with one tab stop and arrow keys, use [ToggleGroup](../toggle-group/README.md).

## Replacing Options

Drive the pressed state from application state instead of the directive's own model:

[src/toggle/bold-format.ts](../snippets/src/toggle/bold-format.ts)

## State and attributes

`OrigamiToggleState` has `pressed()` and `disabled()`, the effective values from the Options. The directive exposes it as `state`, and descendants of the button can inject it.

| Element | Attributes                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toggle  | `type="button"`, `aria-pressed` (`"true"` or `"false"`), `data-pressed` while pressed; when disabled, native `disabled`, `aria-disabled="true"` and `data-disabled` |

## Accessibility

- The Toggle is a native button. Enter and Space work natively; there's no custom keyboard handling.
- An enabled click flips `pressed`. While disabled, user clicks can't change it, but your own writes to the model or Options still apply.
- `aria-pressed` is always `"true"` or `"false"`; there's no mixed state. You supply the accessible name. Keep it the same in both states, because `aria-pressed` already announces the state.
- Toggle isn't a form control: it has no form value or Signal Forms integration. A standalone Toggle has no group or arrow-key navigation; ToggleGroup's items compose Toggle for that, and a Toggle that also has `ogToolbarItem` is one control in a [Toolbar](../toolbar/README.md).

## Server rendering and hydration

A Toggle's `aria-pressed`, `data-pressed` and disabled attributes are in the server HTML. If the server can't know the pressed state, for example a theme stored in the browser, render the Toggle disabled until the browser has it.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).
