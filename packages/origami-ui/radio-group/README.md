# RadioGroup

RadioGroup is a set of radio buttons with one tab stop, where arrow keys move and check, such as a shipping speed or a size. At most one item is checked, and the user can't uncheck it.

[src/radio-group/shipping-speed.ts](../snippets/src/radio-group/shipping-speed.ts "playground")

| Directive          | Configuration                                                                   |
| ------------------ | ------------------------------------------------------------------------------- |
| `ogRadioGroup`     | `value: string \| null` model (default `null`), `disabled` (default `false`)    |
| `ogRadioGroupItem` | `value` (default generated), `disabled` (default `false`); must be a `<button>` |

Give each item an explicit `value`; values should be distinct within one group.

- Clicking an enabled unchecked item, or pressing Enter or Space on it, checks it once. On the checked item they do nothing: there's no unchecking. Items are `type="button"`, so nothing submits a form.
- The value is yours. RadioGroup never writes it without user action: `null` or a value no item has checks nothing and is kept, nothing is checked for you, and removing the checked item doesn't change the value.
- Root and item `disabled` combine. While disabled, user clicks and keys can't change the value; your own writes still apply.
- There's no orientation: lay the items out in a column or a row with your own CSS. The keys are the same either way.

## Keyboard

| Key                    | Action                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| ArrowDown / ArrowRight | move to the next item and check it; ArrowRight moves to the previous one in right-to-left text |
| ArrowUp / ArrowLeft    | move to the previous item and check it; ArrowLeft moves to the next one in right-to-left text  |
| Home / End             | move to the first / last item and check it                                                     |
| Enter / Space          | check the focused item                                                                         |

Moves skip disabled items and wrap at both ends. A move checks the item it lands on, even the one already focused (Home on the first item, or any arrow with one enabled item), but only if, once its focus handlers have run, it's still there, enabled and focused. Keys with Alt, Ctrl, Meta or Shift, keys already `defaultPrevented` and keys during IME composition are ignored. Direction comes from the item's computed `direction` when the key is pressed.

Only one item is in the Tab order (`tabindex="0"`): the focused one while focus is in the group, otherwise the checked enabled item, otherwise the first enabled item. "First" reads DOM order whenever items mount or unmount or focus, disabled state or the value change; a keyed reorder alone doesn't move the tab stop, while arrow keys always follow the current order. Tabbing in never checks anything. A click focuses the item and then checks it, in every browser, so the next arrow key moves from there. If the focused item is removed or disabled and focus hasn't moved elsewhere, focus moves to the new tab stop without checking it.

## Inside a Toolbar

`ogRadioGroup` keeps its own tab stop inside a [Toolbar](../toolbar/README.md), and its arrow keys still check. To share the Toolbar's tab stop, use its [Toolbar group](../toolbar/README.md#toolbar-groups) `ogToolbarRadioGroup`, with the same items; there arrow keys only move focus.

## Replacing Options

The root and the item each have their own Options. Here the value and a lock live in an application store, each item's value and availability come from a domain record, and an estimate under the group reads its State:

[src/radio-group/checkout-speed.ts](../snippets/src/radio-group/checkout-speed.ts)

Other items read an item's Options only after Angular has set its inputs, so replacement Options can use required inputs, as the snippet does, also in items repeated with `@for`.

## State and attributes

`OrigamiRadioGroupState` has `value()` and `disabled()`, the effective values from the root Options, including `null` and values no item has. The root exposes it as `state`, and descendants can inject it. Items have no State; style a checked item with `data-checked`.

| Element | Attributes                                                                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root    | `role="radiogroup"`, `data-disabled`                                                                                                                                                            |
| Item    | `type="button"`, `role="radio"`, `aria-checked` (`"true"` or `"false"`), `tabindex`, `data-checked` while checked; when disabled, native `disabled`, `aria-disabled="true"` and `data-disabled` |

## Accessibility

- You supply the group's accessible name with `aria-label` or `aria-labelledby`, and each item's label. A static `role` you write on the root replaces `radiogroup`. You can also write `aria-orientation` or `aria-required` statically on the root; RadioGroup doesn't set them.
- Items are `<button role="radio">`, not native `<input type="radio">`: RadioGroup owns the tab stop and the keys, which is what lets a group share a Toolbar's tab stop. A disabled checked item stays `aria-checked="true"` and isn't focusable.
- RadioGroup isn't a form control yet: it has no `name`, form value, `required`, validity or Signal Forms integration. There's no typeahead or `aria-activedescendant`. A group inside a non-item descendant of another group is independent of it.

## Server rendering and hydration

RadioGroup's `role="radiogroup"`, `role="radio"`, `aria-checked`, disabled attributes and single `tabindex="0"`, chosen in DOM order, are in the server HTML, and hydration doesn't change them. A click replayed after incremental hydration checks once.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).
