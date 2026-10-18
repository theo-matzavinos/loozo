# ToggleGroup

ToggleGroup is a set of pressed buttons with one tab stop and arrow-key navigation, such as text alignment or bold, italic and underline. Single presses at most one item; Multiple presses any number.

[src/toggle-group/text-alignment.ts](../snippets/src/toggle-group/text-alignment.ts "playground")

[src/toggle-group/text-format.ts](../snippets/src/toggle-group/text-format.ts "both")

| Directive               | Configuration                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ogToggleGroupSingle`   | `value: string \| null` model (default `null`), `disabled` (default `false`), `orientation` (`"horizontal"` or `"vertical"`, default `"horizontal"`), `deselectable` (default `false`) |
| `ogToggleGroupMultiple` | `value: readonly string[]` model (default `[]`), `disabled` (default `false`), `orientation` (`"horizontal"` or `"vertical"`, default `"horizontal"`)                                  |
| `ogToggleGroupItem`     | `value` (default generated), `disabled` (default `false`); must be a `<button>`                                                                                                        |

Give each item an explicit `value`; values should be distinct within one group. Don't also put `ogToggle` on an item: the item already composes Toggle.

- Clicking an enabled item, or pressing Enter or Space on it, requests a press once. In Single, an unpressed item writes its value; the pressed item writes `null` with `deselectable` and otherwise does nothing, staying an ordinary enabled pressed button. In Multiple, an item adds its value at the end of a new array or removes it.
- The value is yours. ToggleGroup never writes it without user action: `null` or a value no item has presses nothing and is kept, Multiple keeps values no item has in order, and removing an item doesn't remove its value. Your array is never mutated.
- Root and item `disabled` combine. While disabled, user clicks and keys can't change the value; your own writes still apply.

## Keyboard

| Key                    | Horizontal                                           | Vertical               |
| ---------------------- | ---------------------------------------------------- | ---------------------- |
| ArrowRight / ArrowLeft | next / previous item, reversed in right-to-left text | nothing                |
| ArrowDown / ArrowUp    | nothing                                              | next / previous item   |
| Home / End             | first / last item                                    | first / last item      |
| Enter / Space          | press the focused item                               | press the focused item |

Moves skip disabled items, wrap at both ends and never press. Keys with Alt, Ctrl, Meta or Shift, keys already `defaultPrevented` and keys during IME composition are ignored. Direction comes from the item's computed `direction` when the key is pressed.

Only one item is in the Tab order (`tabindex="0"`): the focused one while focus is in the group, otherwise the first pressed enabled item, otherwise the first enabled item. "First" reads DOM order whenever items mount or unmount or focus, disabled state or the value change; a keyed reorder alone doesn't move the tab stop, while arrow keys always follow the current order. A click focuses the item after requesting its press, in every browser, so the next arrow key moves from there. If the focused item is removed or disabled and focus hasn't moved elsewhere, focus moves to the new tab stop without pressing it.

## Replacing Options

Single, Multiple and the item each have their own Options. Here the alignment lives in an application service, and each item's value and disabled state come from a domain record:

[src/toggle-group/editor-alignment.ts](../snippets/src/toggle-group/editor-alignment.ts)

Item Options also drive the composed Toggle, so replacing them alone sets the item's pressed and disabled state. Other items read an item's Options only after Angular has set its inputs, so replacement Options can use required inputs, as the snippet does, also in items repeated with `@for`.

## State and attributes

`OrigamiToggleGroupState` has `disabled()` and `orientation()`, the effective values from the root Options; both modes expose it as `state`. It has no value, because the value's type differs by mode and you already own it. Each item exposes its composed `OrigamiToggleState` as `state` (`#item="ogToggleGroupItem"`), with `pressed()` and `disabled()`, the item's effective disabled state from the root's or its own; descendants of an item can inject it.

| Element | Attributes                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root    | `role="group"`, `data-orientation`, `data-disabled`                                                                                                                             |
| Item    | `type="button"`, `aria-pressed` (`"true"` or `"false"`), `tabindex`, `data-pressed` while pressed; when disabled, native `disabled`, `aria-disabled="true"` and `data-disabled` |

## Accessibility

- You supply the group's accessible name with `aria-label` or `aria-labelledby`, and each item's. Keep an item's name the same in both states, because `aria-pressed` already announces the state.
- Both modes are a `group` of `aria-pressed` buttons, not a radio group: there's no `aria-orientation` (ARIA doesn't allow it on `group`) and focus never presses. For radio semantics, where arrow keys check, use [RadioGroup](../radio-group/README.md). A static `role` you write on the root replaces `group`.
- There's no typeahead, `aria-activedescendant`, mixed state or form value. A group inside a non-item descendant of another group is independent of it.

## Inside a Toolbar

`ogToggleGroupSingle` and `ogToggleGroupMultiple` keep their own tab stop inside a [Toolbar](../toolbar/README.md). To share the Toolbar's tab stop, use its [Toolbar groups](../toolbar/README.md#toolbar-groups), `ogToolbarToggleGroupSingle` and `ogToolbarToggleGroupMultiple`, with the same items.

## Server rendering and hydration

ToggleGroup's `role="group"`, `aria-pressed`, disabled attributes and single `tabindex="0"` are in the server HTML, and hydration doesn't change them. A click replayed after incremental hydration presses once.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).
