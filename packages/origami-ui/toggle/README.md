# Toggle

Toggle is a two-state button, such as a mute, bold or dark-theme button: a native button that flips a `checked` model and announces it with `aria-pressed`. It's an [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) control, and it joins a [Field](../field/README.md) on its own.

[src/toggle/mute.ts](../snippets/src/toggle/mute.ts "playground")

It has a `checked` model (default `false`), a `disabled` input, a [`focusableWhenDisabled`](../button/README.md#focusable-when-disabled) input (both default `false`) and an `id` input (default generated). Each Toggle is its own owner; for a set of toggles with one tab stop and arrow keys, use [ToggleGroup](../toggle-group/README.md).

## Forms and Fields

- **Signal Forms:** put `[formField]` on the Toggle. It binds the `checked` model, writes `disabled` from the field's `disabled()` rules, and marks the field touched when the Toggle loses focus. While the field is `readonly()`, clicks, Enter and Space don't change it. `focusBoundControl()` focuses the button.
- **Field:** inside an `ogField`, a `<label ogFieldLabel>` names the Toggle through `for`, before or after it, and clicking the label toggles it. Don't add `ogFieldControl`. The Toggle's `aria-describedby` names the Field's Descriptions and Errors, merged with a co-applied Tooltip Trigger's Content. It binds no `aria-invalid`, `aria-required` or `aria-readonly`, which ARIA doesn't support on a button; style and announce those from the Field's `data-invalid`, `data-required` and `data-disabled` and its State. See [Field](../field/README.md).
- **Standalone:** without a Field, use `[(checked)]` and give the button its name. It binds its `id` and keeps your static `aria-describedby`.

To wrap the Toggle in your own component through `hostDirectives`, expose `checked`, `checkedChange`, `disabled` and `touch`, so `[formField]` on your component finds them.

ToggleGroup items and `ogToolbarToggle` compose Toggle, but they aren't form controls: they never join a Field.

## Replacing Options

Drive the checked state from application state instead of the directive's own model:

[src/toggle/bold-format.ts](../snippets/src/toggle/bold-format.ts)

`OrigamiToggleOptions` has `checked`, `disabled`, `focusableWhenDisabled` and `id`. A replacement owns the value, so `[formField]` doesn't bind it: a component that replaces the Options and takes `[formField]` declares its own `checked` model. See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

## State and attributes

`OrigamiToggleState` has `checked()` and `disabled()`, the effective values from the Options. The directive exposes it as `state`, and descendants of the button can inject it.

| Element | Attributes                                                                                                                                                                                                                                                 |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toggle  | `type="button"`, `id`, `aria-pressed` (`"true"` or `"false"`), `data-pressed` while checked; when disabled, `aria-disabled="true"`, `data-disabled` and, unless `focusableWhenDisabled`, native `disabled`; in a Field, `aria-describedby` as listed above |

## Accessibility

- The Toggle is a native button. Enter and Space work natively; there's no custom keyboard handling.
- An enabled click flips `checked`. While disabled, user clicks can't change it, but your own writes to the model, Options or form still apply. A focusable disabled Toggle stays in the Tab order, and your own `(click)` listeners on it still run.
- `aria-pressed` is always `"true"` or `"false"`; there's no mixed state. You supply the accessible name, with a Field Label, `aria-label` or `aria-labelledby`. Keep it the same in both states, because `aria-pressed` already announces the state.
- A standalone Toggle has no group or arrow-key navigation; ToggleGroup's items compose Toggle for that, and `ogToolbarToggle` is a Toggle that is one control in a [Toolbar](../toolbar/README.md). Don't add another button primitive, such as `ogToolbarItem`, to a Toggle's button.

## Server rendering and hydration

A Toggle's `id`, `aria-pressed`, `data-pressed`, disabled attributes, the Label's `for` and its `aria-describedby` are in the server HTML, and hydration keeps them. If the server can't know the checked state, for example a theme stored in the browser, render the Toggle disabled until the browser has it.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

No mixed state, hidden `<input>` or native form submission.
