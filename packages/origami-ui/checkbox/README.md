# Checkbox

Checkbox is a two-state checkbox, such as "I accept the terms" or "Remember me": a native button with `role="checkbox"` that flips a `checked` model. It's an [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) control, and it joins a [Field](../field/README.md) on its own.

[src/checkbox/accept-terms.ts](../snippets/src/checkbox/accept-terms.ts "both")

It has a `checked` model (default `false`), a `disabled` input, a [`focusableWhenDisabled`](../button/README.md#focusable-when-disabled) input (both default `false`) and an `id` input (default generated). The indicator inside the button is yours; style it from `data-checked`.

## Forms and Fields

- **Signal Forms:** put `[formField]` on the Checkbox. It binds the `checked` model, writes `disabled` from the field's `disabled()` rules, and marks the field touched when the Checkbox loses focus. `required()` fails while it's unchecked. While the field is `readonly()`, clicks and Space don't change it. `focusBoundControl()` focuses the button.
- **Field:** inside an `ogField`, a `<label ogFieldLabel>` names the Checkbox through `for`, before or after it, and clicking the label toggles it. Don't add `ogFieldControl`. The Checkbox's `aria-describedby` names the Field's Descriptions and Errors, merged with a co-applied Tooltip Trigger's Content; it binds `aria-invalid="true"` while the Field shows errors, and `aria-required` and `aria-readonly` from the bound field. See [Field](../field/README.md).
- **Standalone:** without a Field, use `[(checked)]` and give the button its name with `aria-label` or your own `aria-labelledby`. It binds its `id` and keeps your static ARIA attributes.

To wrap the Checkbox in your own component through `hostDirectives`, expose `checked`, `checkedChange`, `disabled` and `touch`, so `[formField]` on your component finds them.

## Replacing Options

`OrigamiCheckboxOptions` has `checked`, `disabled`, `focusableWhenDisabled` and `id`. A replacement owns the value, so `[formField]` doesn't bind it: a component that replaces the Options and takes `[formField]` declares its own `checked` model. See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

## State and attributes

`OrigamiCheckboxState` has `checked()` and `disabled()`, the effective values from the Options. The directive exposes it as `state`, and descendants of the button can inject it.

| Element  | Attributes                                                                                                                                                                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkbox | `type="button"`, `role="checkbox"`, `id`, `aria-checked` (`"true"` or `"false"`), `data-checked` while checked; when disabled, `aria-disabled="true"`, `data-disabled` and, unless `focusableWhenDisabled`, native `disabled`; in a Field, the ARIA attributes listed above |

## Accessibility

- A click or Space toggles it; Enter doesn't, as the [ARIA checkbox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/) says. There's no custom keyboard handling beyond that.
- While disabled, user clicks can't change it, but your own writes to the model, Options or form still apply. A focusable disabled Checkbox stays in the Tab order, and your own `(click)` listeners on it still run.
- `aria-checked` is always `"true"` or `"false"`; there's no mixed state. Content inside the button is presentational, so a decorative indicator is fine.
- It's a button, not an `<input>`: it isn't submitted with a native `<form>`, and `:checked` and `:invalid` don't apply. Style from `data-checked` and the Field's `data-invalid`. Don't add another button primitive to its button.

## Server rendering and hydration

The `id`, `role`, `aria-checked`, `data-checked`, the disabled attributes, the Label's `for` and the Field's ARIA are in the server HTML, and hydration keeps them. What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

No mixed state, checkbox group, hidden `<input>` or native form submission.
