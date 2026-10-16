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

Only one item is in the Tab order (`tabindex="0"`): the focused one while focus is in the group, otherwise the first pressed enabled item, otherwise the first enabled item. A click focuses the item after requesting its press, in every browser, so the next arrow key moves from there. If the focused item is removed or disabled and focus hasn't moved elsewhere, focus moves to the new tab stop without pressing it.

## Replacing Options

Single, Multiple and the item each have their own Options. Here the alignment lives in an application service, and each item's value and disabled state come from a domain record:

[src/toggle-group/editor-alignment.ts](../snippets/src/toggle-group/editor-alignment.ts)

Item Options also drive the composed Collection Item and Toggle, so replacing them alone sets the item's place in the arrow-key order and its pressed and disabled state. The group reads every item's Options while rendering, so replacement item Options must be readable as soon as the item is constructed: a required input in a repeated item, for example inside `@for`, can be read before Angular sets it and throws NG0950. Give such an input a default, as the snippet does.

## State and attributes

`OrigamiToggleGroupState` has `disabled()` and `orientation()`, the effective values from the root Options; both modes expose it as `state`. It has no value, because the value's type differs by mode and you already own it. Descendants of an item inject the composed `OrigamiToggleState` for its `pressed()` and `disabled()`.

| Element | Attributes                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root    | `role="group"`, `data-orientation`, `data-disabled`                                                                                                                             |
| Item    | `type="button"`, `aria-pressed` (`"true"` or `"false"`), `tabindex`, `data-pressed` while pressed; when disabled, native `disabled`, `aria-disabled="true"` and `data-disabled` |

## Accessibility

- You supply the group's accessible name with `aria-label` or `aria-labelledby`, and each item's. Keep an item's name the same in both states, because `aria-pressed` already announces the state.
- Both modes are a `group` of `aria-pressed` buttons, not a radio group: there's no `aria-orientation` (ARIA doesn't allow it on `group`) and focus never presses. For radio semantics, where arrow keys check, use [RadioGroup](../radio-group/README.md). A static `role` you write on the root replaces `group`.
- There's no typeahead, `aria-activedescendant`, mixed state or form value. A group inside a non-item descendant of another group is independent of it.

## Inside a Toolbar

A group inside a [Toolbar](../toolbar/README.md) joins it: its items share the Toolbar's single tab stop and arrow-key order with the Toolbar's own items, in DOM order, and the group has no tab stop of its own. Tabbing into the Toolbar lands on its first enabled control, even if that's not a pressed item. The group follows the Toolbar's orientation, which `data-orientation` and State report; its own `orientation` has no effect there. Its role, name, value and pressed state don't change. A group in Popover Content doesn't join a Toolbar around the Popover.

## Server rendering and hydration

ToggleGroup's `role="group"`, `aria-pressed`, disabled attributes and single `tabindex="0"` are in the server HTML, and hydration doesn't change them. A click replayed after incremental hydration presses once.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).
