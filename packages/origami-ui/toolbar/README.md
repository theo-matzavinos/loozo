# Toolbar

Toolbar groups controls, such as formatting buttons, into one tab stop with arrow-key navigation. Its Toolbar groups bring a ToggleGroup's or RadioGroup's items into that single tab stop.

[src/toolbar/formatting-toolbar.ts](../snippets/src/toolbar/formatting-toolbar.ts "both")

| Directive                      | Configuration                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ogToolbar`                    | `orientation` (`"horizontal"` or `"vertical"`, default `"horizontal"`)                                                                     |
| `ogToolbarItem`                | as [`ogButton`](../button/README.md): `disabled`, `focusableWhenDisabled` (both default `false`); must be a `<button>`                     |
| `ogToolbarToggle`              | as [`ogToggle`](../toggle/README.md): `checked` model, `disabled`, `focusableWhenDisabled`, `id`; must be a `<button>`; not a form control |
| `ogToolbarPopoverTrigger`      | as [`ogPopoverTrigger`](../popover/README.md): `id`, `disabled`, `focusableWhenDisabled`; must be a `<button>` in a Popover                |
| `ogToolbarToggleGroupSingle`   | as [`ogToggleGroupSingle`](../toggle-group/README.md); `orientation` has no effect                                                         |
| `ogToolbarToggleGroupMultiple` | as [`ogToggleGroupMultiple`](../toggle-group/README.md); `orientation` has no effect                                                       |
| `ogToolbarRadioGroup`          | as [`ogRadioGroup`](../radio-group/README.md)                                                                                              |

- Toolbar never activates a control: a click, Enter or Space runs only your button's own listeners, and a Toolbar Toggle's or Toolbar Popover Trigger's own behavior.
- Controls are buttons only. Don't use text inputs, sliders or other controls that need the arrow keys as controls. Other focusable content inside the Toolbar that isn't a control, such as a search field, keeps its own Tab stop and its own arrow keys.
- A disabled control is natively disabled: arrows skip it and it's never the tab stop. With `focusableWhenDisabled` it stays in the arrow sequence instead and keeps focus, and your own `(click)` listeners on it still run (see [Button](../button/README.md#focusable-when-disabled)). There's no Toolbar-wide `disabled`; disable controls, or a group's own `disabled`.
- A Toolbar Toggle isn't a form control: it never joins a [Field](../field/README.md), and `[formField]` on it is unsupported. Signal Forms would bind its `checked` model, but the Toolbar Toggle emits no `touch`, so the field would never be marked touched. Bind `[(checked)]` instead.
- Each control is one directive. Don't combine `ogToolbarItem` with `ogToggle`, `ogPopoverTrigger` or another button primitive on one button: use `ogToolbarToggle` or `ogToolbarPopoverTrigger`. Don't put `ogToolbarItem` on a ToggleGroup or RadioGroup item, which registers on its own.

## Keyboard

| Key                    | Horizontal                                              | Vertical                |
| ---------------------- | ------------------------------------------------------- | ----------------------- |
| ArrowRight / ArrowLeft | next / previous control, reversed in right-to-left text | nothing                 |
| ArrowDown / ArrowUp    | nothing                                                 | next / previous control |
| Home / End             | first / last control                                    | first / last control    |

Controls are the Toolbar's items, Toolbar Toggles and Toolbar Popover Triggers and the items of its Toolbar groups. Moves skip disabled controls that aren't focusable, wrap at both ends and never activate, press or check. Keys with Alt, Ctrl, Meta or Shift, keys already `defaultPrevented` and keys during IME composition are ignored.

Only one control is in the Tab order (`tabindex="0"`): the focused one while focus is in the Toolbar, otherwise the first enabled control, otherwise the first focusable disabled one. Tabbing back into the Toolbar lands on its first enabled control, not the last one you focused. "First" reads DOM order whenever controls mount or unmount or focus or disabled state change; a keyed reorder alone doesn't move the tab stop, while arrow keys always follow the current order. A click focuses the control in every browser, so the next arrow key moves from there. If the focused control is removed or natively disabled and focus hasn't moved elsewhere, focus moves to the new tab stop without activating it; one that becomes disabled but stays focusable keeps focus.

## Toolbar Toggle and Toolbar Popover Trigger

`ogToolbarToggle` is a Toggle and `ogToolbarPopoverTrigger` a Popover Trigger that are also Toolbar controls: each has the inputs, Options and behavior of the primitive it's built on, and takes one stop in the Toolbar's arrow sequence. `ogToolbarToggle` exposes Toggle's State as `state` (`#spelling="ogToolbarToggle"`). A Toolbar Popover Trigger is disabled in the Toolbar while it's disabled as a Trigger, by its own `disabled` or its Popover's.

[src/toolbar/insert-toolbar.ts](../snippets/src/toolbar/insert-toolbar.ts)

## Toolbar groups

`ogToolbarToggleGroupSingle`, `ogToolbarToggleGroupMultiple` and `ogToolbarRadioGroup` are ToggleGroup and RadioGroup roots for use inside a Toolbar, as in the [APG toolbar example](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/examples/toolbar/). Each has the inputs, Options, State, attributes and press or check rules of `ogToggleGroupSingle`, `ogToggleGroupMultiple` or `ogRadioGroup`, and takes `ogToggleGroupItem` or `ogRadioGroupItem` items, but has no tab stop of its own: its items share the Toolbar's tab stop and arrow-key order with the Toolbar's other controls, in DOM order.

[src/toolbar/alignment-toolbar.ts](../snippets/src/toolbar/alignment-toolbar.ts "both")

- Tabbing into the Toolbar lands on its first enabled control, even if that's not a pressed or checked item.
- **Arrow keys only move focus and never press or check**; they follow the Toolbar's orientation. Space, Enter or a click presses or checks the focused item.
- A Toolbar Toggle Group's own `orientation` has no effect; its `data-orientation` and State report the Toolbar's. The group keeps its role, name, value and pressed or checked state.
- A Toolbar group finds its Toolbar through Angular DI, so outside one it fails with a missing-provider error. That includes a group projected through `<ng-content>` into a component whose own template holds the `ogToolbar`; put the Toolbar on the projecting component's host with `hostDirectives` instead.
- A plain `ogToggleGroupSingle`, `ogToggleGroupMultiple` or `ogRadioGroup` inside a Toolbar, for example in a Popover's Content, keeps its own tab stop.

## Replacing Options

The root has its own Options; an item takes Button's (`OrigamiButtonOptions`), a Toolbar Toggle Toggle's and a Toolbar Popover Trigger the Popover Trigger's. Here the application owns the orientation, each command's disabled state comes from the domain, and a separator follows the orientation through State:

[src/toolbar/editor-toolbar.ts](../snippets/src/toolbar/editor-toolbar.ts)

Other controls read a control's Options only after Angular has set its inputs, so replacement Options can use required inputs, as the snippet does, also in items repeated with `@for`.

## State and attributes

`OrigamiToolbarState` has `orientation()`, the effective value from the root Options. The root exposes it as `state`, and descendants can inject it.

| Element | Attributes                                                                                                                                                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root    | `role="toolbar"`, `aria-orientation`, `data-orientation`                                                                                                                                                                                  |
| Control | `type="button"`, `tabindex`; when disabled, `aria-disabled="true"`, `data-disabled` and, unless `focusableWhenDisabled`, native `disabled`; a Toolbar Toggle adds Toggle's and a Toolbar Popover Trigger the Popover Trigger's attributes |

## Accessibility

- You supply the Toolbar's accessible name with `aria-label` or `aria-labelledby`, and each control's label. A static `role` you write on the root replaces `toolbar`. Use a Toolbar for three or more controls.
- Separators are yours: `role="separator"` with an `aria-orientation` perpendicular to the Toolbar's.
- There's no typeahead, `aria-activedescendant` or multi-row navigation. A Toolbar inside another Toolbar is independent of it.

## Server rendering and hydration

Toolbar's `role="toolbar"`, `aria-orientation`, disabled attributes, Toolbar Toggles' `aria-pressed` and single `tabindex="0"`, chosen in DOM order across Toolbar groups, are in the server HTML, and hydration doesn't change them. A click replayed after incremental hydration runs your handler, or presses a Toolbar Toggle, once.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).
