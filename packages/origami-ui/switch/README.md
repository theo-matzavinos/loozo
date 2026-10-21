# Switch

Switch is an on/off setting that takes effect at once, such as notifications or dark mode: a native button with `role="switch"` that flips a `checked` model, `true` for on. It's an [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) control, and it joins a [Field](../field/README.md) on its own.

[src/switch/notifications.ts](../snippets/src/switch/notifications.ts "playground")

It has a `checked` model (default `false`), a `disabled` input, a [`focusableWhenDisabled`](../button/README.md#focusable-when-disabled) input (both default `false`) and an `id` input (default generated). The track and thumb inside the button are yours; style them from `data-checked`. For a choice the user confirms later, such as accepting terms, use a [Checkbox](../checkbox/README.md).

## Forms and Fields

- **Signal Forms:** put `[formField]` on the Switch. It binds the `checked` model, writes `disabled` from the field's `disabled()` rules, and marks the field touched when the Switch loses focus. `required()` fails while it's off. While the field is `readonly()`, clicks, Space and Enter don't change it. `focusBoundControl()` focuses the button.
- **Field:** inside an `ogField`, a `<label ogFieldLabel>` names the Switch through `for`, before or after it, and clicking the label toggles it. Don't add `ogFieldControl`. The Switch's `aria-describedby` names the Field's Descriptions and Errors, merged with a co-applied Tooltip Trigger's Content; it binds `aria-invalid="true"` while the Field shows errors, and `aria-required` and `aria-readonly` from the bound field. See [Field](../field/README.md).
- **Standalone:** without a Field, use `[(checked)]` and give the button its name with `aria-label` or your own `aria-labelledby`. It binds its `id` and keeps your static ARIA attributes.

To wrap the Switch in your own component through `hostDirectives`, expose `checked`, `checkedChange`, `disabled` and `touch`, so `[formField]` on your component finds them.

## Replacing Options

`OrigamiSwitchOptions` has `checked`, `disabled`, `focusableWhenDisabled` and `id`. A replacement owns the value, so `[formField]` doesn't bind it: a component that replaces the Options and takes `[formField]` declares its own `checked` model. See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

## State and attributes

`OrigamiSwitchState` has `checked()` and `disabled()`, the effective values from the Options. The directive exposes it as `state`, and descendants of the button can inject it.

| Element | Attributes                                                                                                                                                                                                                                                           |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Switch  | `type="button"`, `role="switch"`, `id`, `aria-checked` (`"true"` or `"false"`), `data-checked` while on; when disabled, `aria-disabled="true"`, `data-disabled` and, unless `focusableWhenDisabled`, native `disabled`; in a Field, the ARIA attributes listed above |

## Accessibility

- A click, Space or Enter toggles it, as the [ARIA switch pattern](https://www.w3.org/WAI/ARIA/apg/patterns/switch/) allows. There's no custom keyboard handling.
- While disabled, user clicks can't change it, but your own writes to the model, Options or form still apply. A focusable disabled Switch stays in the Tab order, and your own `(click)` listeners on it still run.
- `aria-checked` is always `"true"` (on) or `"false"` (off). Keep the name the same in both states, because the role announces the state. Content inside the button is presentational, so a decorative thumb is fine.
- It's a button, not an `<input>`: it isn't submitted with a native `<form>`, and `:checked` and `:invalid` don't apply. Style from `data-checked` and the Field's `data-invalid`. Don't add another button primitive to its button.

## Server rendering and hydration

The `id`, `role`, `aria-checked`, `data-checked`, the disabled attributes, the Label's `for` and the Field's ARIA are in the server HTML, and hydration keeps them. What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

No mixed state, hidden `<input>` or native form submission.
