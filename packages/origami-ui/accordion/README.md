# Accordion

Accordion is a set of Collapsible items with single or multiple selection.

[src/accordion/faq.ts](../snippets/src/accordion/faq.ts "both")

| Directive             | Configuration                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `ogAccordionSingle`   | `value: string \| null` model (default `null`), `disabled`, `collapsible` (both `false`) |
| `ogAccordionMultiple` | `value: readonly string[]` model (default `[]`), `disabled` (default `false`)            |
| `ogAccordionItem`     | `value` (default generated), `disabled` (default `false`), `hiding` (default `"hidden"`) |
| `ogAccordionTrigger`  | `id` (default generated); must be a `<button>`                                           |
| `ogAccordionPanel`    | `id` (default generated)                                                                 |

Give items distinct explicit values when they need independent selection.

- **Single:** clicking an unselected item selects it. Clicking the selected item clears the value to `null` only when `collapsible` is true.
- **Multiple:** clicking adds the item's value at the end of a new array, or removes it. Your array is never mutated, and the other values keep their order.
- In both modes, the value is yours: values with no mounted item are kept, nothing is selected automatically, and removing an item doesn't remove its value.
- Root and item `disabled` combine. While disabled, user clicks and find-in-page reveals can't change the selection; your own writes still apply.

## Replacing Options

Single, Multiple, shared, Item, Trigger and Panel Options can each be replaced. Here the selection lives in an application service:

[src/accordion/settings-sections.ts](../snippets/src/accordion/settings-sections.ts)

`OrigamiAccordionOptions` holds only the shared `disabled`; replace `OrigamiAccordionSingleOptions` or `OrigamiAccordionMultipleOptions` for the selection. Replacing Item Options sets the item's value and the composed Collapsible's disabled state and hiding; replacing Trigger or Panel Options also sets the composed Collapsible's IDs and associations.

## State and attributes

`OrigamiAccordionState` has `itemValues()`, the mounted items' values in DOM order as of the latest insertion or removal (a keyed move that keeps the same items doesn't notify readers), and `disabled()`, the effective root policy.

Each item exposes its composed `OrigamiCollapsibleState` as `state` (`#item="ogAccordionItem"`): `expanded()` follows the selection and `disabled()` is the item's effective disabled state from the root's or its own. Each Panel exposes its composed `OrigamiPresenceState` as `state` (`#panel="ogAccordionPanel"`); gate content on `panel.state.open()` to keep it through the exit animation.

Each item is a Collapsible, so the item element carries the Collapsible root attributes, and the Trigger and Panel carry the Collapsible Trigger and Panel attributes above.

## Accessibility

- In Single mode without `collapsible`, the selected item's Trigger has `aria-disabled="true"` and `data-disabled`, because clicking it does nothing. It stays a focusable, natively enabled button unless the root or item is disabled. Like a Collapsible Trigger with `focusableWhenDisabled`, its clicks still reach your own `(click)` listeners on the button.
- There's no arrow-key navigation, roving tabindex or focus management; Tab moves between the native buttons. You supply the headings and any Panel roles.
