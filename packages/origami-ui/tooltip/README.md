# Tooltip

Tooltip shows a short description of a control while the pointer rests on it or keyboard focus is on it. Content stays where you author it and is shown in the browser's top layer next to its Trigger, the same way [Popover](../popover/README.md) shows its Content.

[src/tooltip/copy-link.ts](../snippets/src/tooltip/copy-link.ts "playground")

| Part               | Configuration                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `ogTooltip`        | `open` model (default `false`), `disabled` (default `false`), `openDelay` (default `600`, in ms) |
| `ogTooltipTrigger` | none; any focusable element                                                                      |
| `ogTooltipContent` | `id` (default generated), `side` (`"block-start"`), `align` (`"center"`), `gap` (`0`, in CSS px) |

One Trigger and one Content are supported per Tooltip. Content can be rendered by its own component.

## A description, not a name

The Trigger's `aria-describedby` names Content whether it's open or closed, so a screen reader announces the text when the Trigger gets focus, without waiting for it to appear. It replaces a static `aria-describedby` on the Trigger; it doesn't merge with it.

- Give the Trigger its own accessible name, with `aria-label` or visually hidden text. For an icon button, make the Tooltip supplementary ("Copies the address of this page") rather than repeating the name ("Copy link"), which screen readers would announce twice.
- Make the Trigger focusable. A `<button>` is.
- Keep Content non-interactive and outside the Trigger: no links, buttons or `autofocus` inside it. For interactive content, use a Popover.
- Don't gate Content's text on `state.open()`. Closed Content must still contain the text the Trigger's description reads.

## Opening and closing

- **Hover** with a mouse or pen opens it after `openDelay`; leaving first cancels it. Touch never opens a Tooltip.
- **Keyboard focus** opens it at once and holds it open. A Trigger focused by a click or tap doesn't open it, and neither does a `disabled` root or a Trigger that is natively disabled.
- **Activation** closes it at once: `pointerdown` or `click` on the Trigger, including Enter and Space on a button. It opens again only after the pointer leaves and re-enters, or focus leaves and comes back.
- **Escape** closes it without moving focus, and **a click outside** its Trigger and Content closes it, as for Popover.
- **Leaving toward Content.** The pointer can cross from the Trigger to Content, and back, without closing it, as long as it stays inside the area between the exit point and Content's box. Moving outside that area closes it; so does leaving the Trigger in another direction. Content itself keeps the Tooltip open while hovered.
- **Blur** closes it unless the pointer is over the Trigger or Content.
- Leave and blur close only a Tooltip that hover or focus opened. One you open yourself, by setting `open`, stays open until you close it, the Trigger is activated, Escape is pressed or the user clicks outside.

There's no auto-hide timeout.

Clicking the `<label>` of an `<input>` Trigger focuses the input without pressing it, and browsers differ in the order. In Chrome and Firefox the focus comes before the label's click, so the Tooltip opens and closes in the same moment and never appears. In Safari the click comes first, so the Tooltip opens as it does for keyboard focus and stays open until the input loses focus.

## Disabled controls

A natively disabled button gets no hover or focus, so its Tooltip never opens. To explain why an action is unavailable, keep the button focusable with [`ogButton`'s `focusableWhenDisabled`](../button/README.md#focusable-when-disabled):

[src/tooltip/unavailable-action.ts](../snippets/src/tooltip/unavailable-action.ts)

`ogTooltipTrigger` has no inputs and binds no `type`, `role`, `disabled` or `tabindex`, so you can put it on the same element as any button primitive, such as `ogToggle`, `ogPopoverTrigger` or a Toolbar control. Each keeps its own disabled state. Arrow keys in a [Toolbar](../toolbar/README.md) are keyboard focus, so they open each control's Tooltip in turn.

## Inside a Popover

A Tooltip inside Popover Content is shown only once the Popover has been positioned and revealed, and is hidden at once, without its exit animation, when the Popover closes; its `open` keeps its value. A Tooltip anywhere else, including on a Popover's Trigger, is independent of the Popover. Escape closes whichever of them the browser showed last, then the other; a Tooltip never stops a click outside from closing a Popover.

## Replacing Options

The root and Content each have their own Options; the Trigger has none. A Content replacement must supply all four properties:

[src/tooltip/hint.ts](../snippets/src/tooltip/hint.ts)

## Positioning

Content is positioned like [Popover Content](../popover/README.md#positioning), with the **Trigger** as its reference: `side` and `align` are logical and resolved from the Trigger's writing mode and direction, the default places it above the Trigger and centered, and it flips when it doesn't fit. Origami sets the same `popover="manual"`, `position: fixed` and coordinates, so scope a custom `display` to `:popover-open` and use `gap`, not margins. A [positioning failure](../popover/README.md#positioning-failure) hides it and is reported the same way.

## State and attributes

`OrigamiTooltipState` has `open()` and `disabled()`, the effective root Options; `open()` reports what was requested, not whether Content is visible. `OrigamiTooltipContentState.open()` is Presence's `open()`.

| Element | Attributes                                                                                                                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger | `aria-describedby` (only while Content is mounted)                                                                                                                                                   |
| Content | `role="tooltip"` (your static `role` wins), `id`, `popover="manual"`, `inert` whenever it isn't shown (closed, exiting or suppressed), Presence's `data-entering`, `data-present` and `data-leaving` |

## Server rendering and hydration

The server HTML has the Trigger's `aria-describedby` and Content with its role, ID, `inert` and text, so the description is there before the page hydrates. An initially-open Tooltip appears only once it hydrates, without replaying its entrance. A hover before hydration isn't replayed: the pointer has to leave and enter again. A keyboard focus before hydration opens the Tooltip once it hydrates, if the Trigger still has focus, except in Safari when it came while a mouse button was held on the Trigger.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Limitations

No interactive content (HoverCard), long press, close delay or close on scroll. Only one Tooltip's text describes a Trigger. Positioning has Popover's limits.
