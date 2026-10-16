# Toolbar

Toolbar groups controls, such as formatting buttons, into one tab stop with arrow-key navigation. A ToggleGroup or RadioGroup inside it joins that single tab stop.

[src/toolbar/formatting-toolbar.ts](../snippets/src/toolbar/formatting-toolbar.ts)

| Directive       | Configuration                                                          |
| --------------- | ---------------------------------------------------------------------- |
| `ogToolbar`     | `orientation` (`"horizontal"` or `"vertical"`, default `"horizontal"`) |
| `ogToolbarItem` | `disabled` (default `false`); must be a `<button>`                     |

- Toolbar never activates an item: a click, Enter or Space runs only your button's own listeners.
- Items are buttons only. Don't use text inputs, sliders or other controls that need the arrow keys as items. Other focusable content inside the Toolbar that isn't an item, such as a search field, keeps its own Tab stop and its own arrow keys.
- A disabled item is natively disabled: arrows skip it and it's never the tab stop. There's no Toolbar-wide `disabled`; disable items, or a group's own `disabled`.
- `ogToggle` and `ogToolbarItem` can share a button, which is then one Toolbar control; one `[disabled]` binding sets both. Don't put `ogToolbarItem` on a ToggleGroup or RadioGroup item, which joins on its own.

## Keyboard

| Key                    | Horizontal                                              | Vertical                |
| ---------------------- | ------------------------------------------------------- | ----------------------- |
| ArrowRight / ArrowLeft | next / previous control, reversed in right-to-left text | nothing                 |
| ArrowDown / ArrowUp    | nothing                                                 | next / previous control |
| Home / End             | first / last control                                    | first / last control    |

Controls are the Toolbar's items and the items of groups inside it. Moves skip disabled controls, wrap at both ends and never activate, press or check. Keys with Alt, Ctrl, Meta or Shift, keys already `defaultPrevented` and keys during IME composition are ignored.

Only one control is in the Tab order (`tabindex="0"`): the focused one while focus is in the Toolbar, otherwise the first enabled control. Tabbing back into the Toolbar lands on its first enabled control, not the last one you focused. A click focuses the item in every browser, so the next arrow key moves from there. If the focused control is removed or disabled and focus hasn't moved elsewhere, focus moves to the new tab stop without activating it.

A group joins the Toolbar it sits in through Angular DI. A group projected through `<ng-content>` into a component whose own template holds the `ogToolbar` doesn't join it and keeps its own tab stop; put the Toolbar on the projecting component's host with `hostDirectives` instead.

## Replacing Options

The root and the item each have their own Options. Here the application owns the orientation, each command's disabled state comes from the domain, and a separator follows the orientation through State:

[src/toolbar/editor-toolbar.ts](../snippets/src/toolbar/editor-toolbar.ts)

The Toolbar reads every item's Options while rendering, so replacement item Options must be readable as soon as the item is constructed: a required input in a repeated item, for example inside `@for`, can be read before Angular sets it and throws NG0950. Give such an input a default, as the snippet does.

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

Toolbar's `role="toolbar"`, `aria-orientation`, disabled attributes and single `tabindex="0"`, chosen in DOM order across joined groups, are in the server HTML, and hydration doesn't change them. A click replayed after incremental hydration runs your handler once.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).
