# Toolbar

Toolbar groups controls, such as formatting buttons, into one tab stop with arrow-key navigation. Its Toolbar groups bring a ToggleGroup's or RadioGroup's items into that single tab stop.

[src/toolbar/formatting-toolbar.ts](../snippets/src/toolbar/formatting-toolbar.ts "both")

| Directive                      | Configuration                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `ogToolbar`                    | `orientation` (`"horizontal"` or `"vertical"`, default `"horizontal"`)               |
| `ogToolbarItem`                | `disabled` (default `false`); must be a `<button>`                                   |
| `ogToolbarToggleGroupSingle`   | as [`ogToggleGroupSingle`](../toggle-group/README.md); `orientation` has no effect   |
| `ogToolbarToggleGroupMultiple` | as [`ogToggleGroupMultiple`](../toggle-group/README.md); `orientation` has no effect |
| `ogToolbarRadioGroup`          | as [`ogRadioGroup`](../radio-group/README.md)                                        |

- Toolbar never activates an item: a click, Enter or Space runs only your button's own listeners.
- Items are buttons only. Don't use text inputs, sliders or other controls that need the arrow keys as items. Other focusable content inside the Toolbar that isn't an item, such as a search field, keeps its own Tab stop and its own arrow keys.
- A disabled item is natively disabled: arrows skip it and it's never the tab stop. There's no Toolbar-wide `disabled`; disable items, or a group's own `disabled`.
- `ogToggle` or `ogPopoverTrigger` can share a button with `ogToolbarItem`, which is then one Toolbar control; one `[disabled]` binding sets both. To disable a Popover root instead of its Trigger, also disable the item. Don't put `ogToolbarItem` on a ToggleGroup or RadioGroup item, which registers on its own.

## Keyboard

| Key                    | Horizontal                                              | Vertical                |
| ---------------------- | ------------------------------------------------------- | ----------------------- |
| ArrowRight / ArrowLeft | next / previous control, reversed in right-to-left text | nothing                 |
| ArrowDown / ArrowUp    | nothing                                                 | next / previous control |
| Home / End             | first / last control                                    | first / last control    |

Controls are the Toolbar's items and the items of its Toolbar groups. Moves skip disabled controls, wrap at both ends and never activate, press or check. Keys with Alt, Ctrl, Meta or Shift, keys already `defaultPrevented` and keys during IME composition are ignored.

Only one control is in the Tab order (`tabindex="0"`): the focused one while focus is in the Toolbar, otherwise the first enabled control. Tabbing back into the Toolbar lands on its first enabled control, not the last one you focused. "First" reads DOM order whenever controls mount or unmount or focus or disabled state change; a keyed reorder alone doesn't move the tab stop, while arrow keys always follow the current order. A click focuses the item in every browser, so the next arrow key moves from there. If the focused control is removed or disabled and focus hasn't moved elsewhere, focus moves to the new tab stop without activating it.

## Toolbar groups

`ogToolbarToggleGroupSingle`, `ogToolbarToggleGroupMultiple` and `ogToolbarRadioGroup` are ToggleGroup and RadioGroup roots for use inside a Toolbar, as in the [APG toolbar example](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/examples/toolbar/). Each has the inputs, Options, State, attributes and press or check rules of `ogToggleGroupSingle`, `ogToggleGroupMultiple` or `ogRadioGroup`, and takes `ogToggleGroupItem` or `ogRadioGroupItem` items, but has no tab stop of its own: its items share the Toolbar's tab stop and arrow-key order with the Toolbar's other controls, in DOM order.

[src/toolbar/alignment-toolbar.ts](../snippets/src/toolbar/alignment-toolbar.ts "both")

- Tabbing into the Toolbar lands on its first enabled control, even if that's not a pressed or checked item.
- **Arrow keys only move focus and never press or check**; they follow the Toolbar's orientation. Space, Enter or a click presses or checks the focused item.
- A Toolbar Toggle Group's own `orientation` has no effect; its `data-orientation` and State report the Toolbar's. The group keeps its role, name, value and pressed or checked state.
- A Toolbar group finds its Toolbar through Angular DI, so outside one it fails with a missing-provider error. That includes a group projected through `<ng-content>` into a component whose own template holds the `ogToolbar`; put the Toolbar on the projecting component's host with `hostDirectives` instead.
- A plain `ogToggleGroupSingle`, `ogToggleGroupMultiple` or `ogRadioGroup` inside a Toolbar, for example in a Popover's Content, keeps its own tab stop.

## Replacing Options

The root and the item each have their own Options. Here the application owns the orientation, each command's disabled state comes from the domain, and a separator follows the orientation through State:

[src/toolbar/editor-toolbar.ts](../snippets/src/toolbar/editor-toolbar.ts)

Other controls read an item's Options only after Angular has set its inputs, so replacement Options can use required inputs, as the snippet does, also in items repeated with `@for`.

## State and attributes

`OrigamiToolbarState` has `orientation()`, the effective value from the root Options. The root exposes it as `state`, and descendants can inject it.

| Element | Attributes                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------- |
| Root    | `role="toolbar"`, `aria-orientation`, `data-orientation`                                                  |
| Item    | `type="button"`, `tabindex`; when disabled, native `disabled`, `aria-disabled="true"` and `data-disabled` |

## Accessibility

- You supply the Toolbar's accessible name with `aria-label` or `aria-labelledby`, and each control's label. A static `role` you write on the root replaces `toolbar`. Use a Toolbar for three or more controls.
- Separators are yours: `role="separator"` with an `aria-orientation` perpendicular to the Toolbar's.
- There's no typeahead, `aria-activedescendant` or multi-row navigation. A Toolbar inside another Toolbar is independent of it.

## Server rendering and hydration

Toolbar's `role="toolbar"`, `aria-orientation`, disabled attributes and single `tabindex="0"`, chosen in DOM order across Toolbar groups, are in the server HTML, and hydration doesn't change them. A click replayed after incremental hydration runs your handler once.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).
