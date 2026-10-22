# RadioGroup

RadioGroup is a set of radio buttons with one tab stop, where arrow keys move and check, such as a shipping speed or a size. At most one item is checked, and the user can't uncheck it. It's an [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) control, and it joins a [Field](../field/README.md) on its own.

[src/radio-group/shipping-speed.ts](../snippets/src/radio-group/shipping-speed.ts "playground")

| Directive          | Configuration                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ogRadioGroup`     | `value: string \| null` model (default `null`), `disabled` (default `false`)                                                                                 |
| `ogRadioGroupItem` | `value` (default generated), `disabled`, [`focusableWhenDisabled`](../button/README.md#focusable-when-disabled) (both default `false`); must be a `<button>` |

Give each item an explicit `value`; values should be distinct within one group.

- Clicking an enabled unchecked item, or pressing Enter or Space on it, checks it once. On the checked item they do nothing: there's no unchecking. Items are `type="button"`, so nothing submits a form.
- The value is yours. RadioGroup never writes it without user action: `null` or a value no item has checks nothing and is kept, nothing is checked for you, and removing the checked item doesn't change the value.
- Root and item `disabled` combine. While disabled, user clicks and keys can't change the value; your own writes still apply.
- There's no orientation: lay the items out in a column or a row with your own CSS. The keys are the same either way.

## Forms and Fields

- **Signal Forms:** put `[formField]` on the root. It binds the `value` model, writes `disabled` from the field's `disabled()` rules, and marks the field touched when focus leaves the group, not while it moves between items. On engines where a click doesn't focus a button (macOS Safari; macOS Firefox by default), clicking from one item to another also marks it touched. While the field is `readonly()`, clicks, keys and arrow-key moves don't change the value, but focus still moves. `focusBoundControl()` calls the root's `focus()`, which focuses the item holding the tab stop.
- **Field:** inside an `ogField`, give the group a Label on any element, such as `<span ogFieldLabel>`, before or after it. A label can't name a group with `for`, so the group's `aria-labelledby` names every Label of its Field instead, replacing a static one. Don't add `ogFieldControl`. Its `aria-describedby` names the Field's Descriptions and Errors, and `aria-invalid`, `aria-required` and `aria-readonly` follow the Field. See [Field](../field/README.md).
- **Standalone:** without a Field, use `[(value)]` and name the group yourself. It keeps your static `aria-labelledby`, `aria-describedby`, `aria-required` and the like.

To wrap the group in your own component through `hostDirectives`, expose `value`, `valueChange`, `disabled` and `touch`, so `[formField]` on your component finds them. Signal Forms then calls `focus()` on your component, not on the group, so give your component a `focus(options?: FocusOptions)` method that calls the injected `OrigamiRadioGroup`'s `focus(options)`; without it, `focusBoundControl()` focuses nothing.

`ogToolbarRadioGroup` isn't a form control: it never joins a Field.

## Keyboard

| Key                    | Action                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| ArrowDown / ArrowRight | move to the next item and check it; ArrowRight moves to the previous one in right-to-left text |
| ArrowUp / ArrowLeft    | move to the previous item and check it; ArrowLeft moves to the next one in right-to-left text  |
| Home / End             | move to the first / last item and check it                                                     |
| Enter / Space          | check the focused item                                                                         |

Moves skip disabled items, except focusable ones, and wrap at both ends. A move checks the item it lands on, even the one already focused (Home on the first item, or any arrow with one enabled item), but only if, once its focus handlers have run, it's still there, enabled and focused. Keys with Alt, Ctrl, Meta or Shift, keys already `defaultPrevented` and keys during IME composition are ignored. Direction comes from the item's computed `direction` when the key is pressed.

Only one item is in the Tab order (`tabindex="0"`): the focused one while focus is in the group, otherwise the checked enabled item, otherwise the first enabled item, otherwise the first focusable disabled item. "First" reads DOM order whenever items mount or unmount or focus, disabled state or the value change; a keyed reorder alone doesn't move the tab stop, while arrow keys always follow the current order. Tabbing in never checks anything. A click focuses the item and then checks it, in every browser, so the next arrow key moves from there. If the focused item is removed or natively disabled and focus hasn't moved elsewhere, focus moves to the new tab stop without checking it; one that becomes disabled but stays focusable keeps focus.

## Inside a Toolbar

`ogRadioGroup` keeps its own tab stop inside a [Toolbar](../toolbar/README.md), and its arrow keys still check. To share the Toolbar's tab stop, use its [Toolbar group](../toolbar/README.md#toolbar-groups) `ogToolbarRadioGroup`, with the same items; there arrow keys only move focus.

## Replacing Options

The root and the item each have their own Options. Here the value and a lock live in an application store, each item's value and availability come from a domain record, and an estimate under the group reads its State:

[src/radio-group/checkout-speed.ts](../snippets/src/radio-group/checkout-speed.ts)

Other items read an item's Options only after Angular has set its inputs, so replacement Options can use required inputs, as the snippet does, also in items repeated with `@for`.

A root replacement owns the value, so `[formField]` doesn't bind it: a component that replaces the root Options and takes `[formField]` declares its own `value` model. See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

## State and attributes

`OrigamiRadioGroupState` has `value()` and `disabled()`, the effective values from the root Options, including `null` and values no item has. The root exposes it as `state`, and descendants can inject it. Items have no State; style a checked item with `data-checked`.

| Element | Attributes                                                                                                                                                                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root    | `role="radiogroup"`, `data-disabled`; in a Field, `aria-labelledby`, `aria-describedby`, `aria-invalid`, `aria-required` and `aria-readonly` as listed above                                                                     |
| Item    | `type="button"`, `role="radio"`, `aria-checked` (`"true"` or `"false"`), `tabindex`, `data-checked` while checked; when disabled, `aria-disabled="true"`, `data-disabled` and, unless `focusableWhenDisabled`, native `disabled` |

## Accessibility

- You supply the group's accessible name with a Field Label, `aria-label` or `aria-labelledby`, and each item's label. A static `role` you write on the root replaces `radiogroup`. You can also write `aria-orientation` statically on the root, which RadioGroup doesn't set, and outside a Field `aria-required`.
- Items are `<button role="radio">`, not native `<input type="radio">`: RadioGroup owns the tab stop and the keys, which is what lets a group share a Toolbar's tab stop. A disabled checked item stays `aria-checked="true"` and isn't focusable unless it's `focusableWhenDisabled`. A move or click focuses a focusable disabled item without checking it, and your own `(click)` listeners on it still run.
- There's no typeahead or `aria-activedescendant`. A group inside a non-item descendant of another group is independent of it.

## Server rendering and hydration

RadioGroup's `role="radiogroup"`, `role="radio"`, `aria-checked`, disabled attributes and single `tabindex="0"`, chosen in DOM order, and in a Field its `aria-labelledby`, `aria-describedby` and form ARIA, are in the server HTML, and hydration doesn't change them. A click replayed after incremental hydration checks once.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

No `name`, hidden `<input>`, native form submission or reset.
