# ToggleGroup

ToggleGroup is a set of pressed buttons with one tab stop and arrow-key navigation, such as text alignment or bold, italic and underline. Single presses at most one item; Multiple presses any number. Both roots are [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) controls, and they join a [Field](../field/README.md) on their own.

[src/toggle-group/text-alignment.ts](../snippets/src/toggle-group/text-alignment.ts "playground")

[src/toggle-group/text-format.ts](../snippets/src/toggle-group/text-format.ts "both")

| Directive               | Configuration                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ogToggleGroupSingle`   | `value: string \| null` model (default `null`), `disabled` (default `false`), `orientation` (`"horizontal"` or `"vertical"`, default `"horizontal"`), `deselectable` (default `false`) |
| `ogToggleGroupMultiple` | `value: readonly string[]` model (default `[]`), `disabled` (default `false`), `orientation` (`"horizontal"` or `"vertical"`, default `"horizontal"`)                                  |
| `ogToggleGroupItem`     | `value` (default generated), `disabled`, [`focusableWhenDisabled`](../button/README.md#focusable-when-disabled) (both default `false`), `id` (default generated); must be a `<button>` |

Give each item an explicit `value`; values should be distinct within one group. Don't also put `ogToggle` on an item: the item already composes Toggle.

- Clicking an enabled item, or pressing Enter or Space on it, requests a press once. In Single, an unpressed item writes its value; the pressed item writes `null` with `deselectable` and otherwise does nothing, staying an ordinary enabled pressed button. In Multiple, an item adds its value at the end of a new array or removes it.
- The value is yours. ToggleGroup never writes it without user action: `null` or a value no item has presses nothing and is kept, Multiple keeps values no item has in order, and removing an item doesn't remove its value. Your array is never mutated.
- Root and item `disabled` combine. While disabled, user clicks and keys can't change the value; your own writes still apply.

## Forms and Fields

- **Signal Forms:** put `[formField]` on the Single or Multiple root; Multiple takes a `string[]` field. It binds the `value` model, writes `disabled` from the field's `disabled()` rules, and marks the field touched when focus leaves the group, not while it moves between items. On engines where a click doesn't focus a button (macOS Safari; macOS Firefox by default), clicking from one item to another also marks it touched. While the field is `readonly()`, clicks and keys don't change the value, but focus still moves. `focusBoundControl()` calls the root's `focus()`, which focuses the item holding the tab stop.
- **Field:** inside an `ogField`, give the group a Label on any element, such as `<span ogFieldLabel>`, before or after it. A label can't name a group with `for`, so the group's `aria-labelledby` names every Label of its Field instead, replacing a static one. Don't add `ogFieldControl`. Its `aria-describedby` names the Field's Descriptions and Errors. It binds no `aria-invalid`, `aria-required` or `aria-readonly`, which ARIA doesn't support on `group`; style and announce those from the Field's `data-invalid`, `data-required` and `data-disabled` and its State. See [Field](../field/README.md).
- **Standalone:** without a Field, use `[(value)]` and name the group yourself. It keeps your static `aria-labelledby` and `aria-describedby`.

To wrap a root in your own component through `hostDirectives`, expose `value`, `valueChange`, `disabled` and `touch`, so `[formField]` on your component finds them. Signal Forms then calls `focus()` on your component, not on the root, so give your component a `focus(options?: FocusOptions)` method that calls the injected root's `focus(options)`; without it, `focusBoundControl()` focuses nothing.

Items and the [Toolbar groups](../toolbar/README.md#toolbar-groups) aren't form controls: they never join a Field.

## Keyboard

| Key                    | Horizontal                                           | Vertical               |
| ---------------------- | ---------------------------------------------------- | ---------------------- |
| ArrowRight / ArrowLeft | next / previous item, reversed in right-to-left text | nothing                |
| ArrowDown / ArrowUp    | nothing                                              | next / previous item   |
| Home / End             | first / last item                                    | first / last item      |
| Enter / Space          | press the focused item                               | press the focused item |

Moves skip disabled items, except focusable ones, wrap at both ends and never press. Keys with Alt, Ctrl, Meta or Shift, keys already `defaultPrevented` and keys during IME composition are ignored. Direction comes from the item's computed `direction` when the key is pressed.

Only one item is in the Tab order (`tabindex="0"`): the focused one while focus is in the group, otherwise the first pressed enabled item, otherwise the first enabled item, otherwise the first focusable disabled item. "First" reads DOM order whenever items mount or unmount or focus, disabled state or the value change; a keyed reorder alone doesn't move the tab stop, while arrow keys always follow the current order. A click focuses the item after requesting its press, in every browser, so the next arrow key moves from there. If the focused item is removed or natively disabled and focus hasn't moved elsewhere, focus moves to the new tab stop without pressing it; one that becomes disabled but stays focusable keeps focus.

## Replacing Options

Single, Multiple and the item each have their own Options. Here the alignment lives in an application service, and each item's value and disabled state come from a domain record:

[src/toggle-group/editor-alignment.ts](../snippets/src/toggle-group/editor-alignment.ts)

Item Options also drive the composed Toggle, so replacing them alone sets the item's checked (pressed), disabled and focusable state and its `id`; a replacement supplies `id` too, here an input defaulting to a generated ID. Other items read an item's Options only after Angular has set its inputs, so replacement Options can use required inputs, as the snippet does, also in items repeated with `@for`.

A root replacement owns the value, so `[formField]` doesn't bind it: a component that replaces the Single or Multiple Options and takes `[formField]` declares its own `value` model. See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

## State and attributes

`OrigamiToggleGroupState` has `disabled()` and `orientation()`, the effective values from the root Options; both modes expose it as `state`. It has no value, because the value's type differs by mode and you already own it. Each item exposes its composed `OrigamiToggleState` as `state` (`#item="ogToggleGroupItem"`), with `checked()` and `disabled()`, the item's effective disabled state from the root's or its own; descendants of an item can inject it.

| Element | Attributes                                                                                                                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root    | `role="group"`, `data-orientation`, `data-disabled`; in a Field, `aria-labelledby` and `aria-describedby` as listed above                                                                                              |
| Item    | `type="button"`, `id`, `aria-pressed` (`"true"` or `"false"`), `tabindex`, `data-pressed` while pressed; when disabled, `aria-disabled="true"`, `data-disabled` and, unless `focusableWhenDisabled`, native `disabled` |

## Accessibility

- You supply the group's accessible name with a Field Label, `aria-label` or `aria-labelledby`, and each item's. Keep an item's name the same in both states, because `aria-pressed` already announces the state.
- Both modes are a `group` of `aria-pressed` buttons, not a radio group: there's no `aria-orientation` (ARIA doesn't allow it on `group`) and focus never presses. For radio semantics, where arrow keys check, use [RadioGroup](../radio-group/README.md). A static `role` you write on the root replaces `group`.
- There's no typeahead, `aria-activedescendant`, mixed state, `name` or native form value. An item isn't a form control: inside a [Field](../field/README.md) it doesn't join it, and it keeps your static `aria-describedby`. A group inside a non-item descendant of another group is independent of it.

## Inside a Toolbar

`ogToggleGroupSingle` and `ogToggleGroupMultiple` keep their own tab stop inside a [Toolbar](../toolbar/README.md). To share the Toolbar's tab stop, use its [Toolbar groups](../toolbar/README.md#toolbar-groups), `ogToolbarToggleGroupSingle` and `ogToolbarToggleGroupMultiple`, with the same items.

## Server rendering and hydration

ToggleGroup's `role="group"`, item `id`s, `aria-pressed`, disabled attributes and single `tabindex="0"`, and in a Field the root's `aria-labelledby` and `aria-describedby`, are in the server HTML, and hydration doesn't change them. A click replayed after incremental hydration presses once.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).
