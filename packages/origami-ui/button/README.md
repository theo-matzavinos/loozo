# Button

Button gives a native `<button>` Origami's disabled semantics, including a disabled state that stays focusable. Every Origami button part, such as Toggle or a Tabs Trigger, is built on it.

> **Use `ogButton` only on a plain button.** Don't add it to an element that already has an Origami button part, and don't put two button parts on one element. Angular silently shares one Button between them, and only one part's disabled state reaches it; nothing reports the conflict. See [One button primitive per element](#one-button-primitive-per-element).

[src/button/save-button.ts](../snippets/src/button/save-button.ts "playground")

It has a `disabled` input and a `focusableWhenDisabled` input (both default `false`). Button sets `type="button"`; it has no State and adds no click or keyboard handling.

## Focusable when disabled

A natively disabled button leaves the Tab order, so keyboard and screen reader users can't find it or learn why it's unavailable. With `focusableWhenDisabled`, a disabled Button gets `aria-disabled="true"` and `data-disabled` instead of native `disabled`, and keeps its place in the Tab order.

**Its clicks still happen.** The browser dispatches clicks, Enter and Space to a button that isn't natively disabled, so your own `(click)` listeners run while it's disabled: check the disabled state in them, as the snippet does. Origami's own parts ignore the activation themselves; a focusable disabled Toggle doesn't press and a Tabs Trigger doesn't select.

Every button part has a `focusableWhenDisabled` input and Option of its own, and takes its disabled state from its own configuration: its root's or its own `disabled`, or for an Accordion Trigger its root, its Item and the lock (see each part's readme). In Tabs, ToggleGroup, Toolbar and RadioGroup a focusable disabled item stays in the arrow-key sequence and keeps focus when it becomes disabled; arrows focus it without selecting or checking it, and it's the tab stop only while focused or when no item is enabled.

## Replacing Options

`OrigamiButtonOptions` has `disabled` and `focusableWhenDisabled`. Replace them in a directive that composes `ogButton`, as for any other part:

[src/button/editor-command.ts](../snippets/src/button/editor-command.ts)

A Toolbar item uses Button's Options too.

## Attributes

| Element | Attributes                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Button  | `type="button"`; when disabled, `aria-disabled="true"`, `data-disabled` and, unless `focusableWhenDisabled`, native `disabled` |

## One button primitive per element

Toggle, ToggleGroup items, the Collapsible, Accordion, Popover and Tabs Triggers, RadioGroup items, Checkbox, Switch and the Toolbar's controls all compose Button, so don't apply two of them, or `ogButton` and one of them, to the same element: Angular silently shares one Button between them and only one part's disabled state reaches it. For a Toolbar control that is also a Toggle or a Popover Trigger, use [`ogToolbarToggle` or `ogToolbarPopoverTrigger`](../toolbar/README.md).

## Server rendering and hydration

`type` and the disabled attributes are in the server HTML, and hydration doesn't change them.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).
