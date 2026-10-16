# Popover

Popover is a non-modal floating surface anchored to an element: Content stays where you author it and is shown in the browser's top layer, positioned next to its Anchor.

[src/popover/task-chooser.ts](../snippets/src/popover/task-chooser.ts "both")

| Part               | Configuration                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `ogPopover`        | `open` model (default `false`), `disabled` (default `false`), `dismissible` (default `true`)      |
| `ogPopoverTrigger` | `id` (default generated); must be a `<button>`                                                    |
| `ogPopoverAnchor`  | `id` (default generated); may share the Trigger's element, which then uses the Trigger's ID       |
| `ogPopoverContent` | `id` (default generated), `side` (`"block-end"`), `align` (`"start"`), `gap` (`0`, in CSS pixels) |

Trigger, Anchor and Content are all required for the Popover to show. When one is missing, or a parent Popover closes, the Content is hidden but `open` keeps its value, so mounting the part again shows it. One of each part is supported per Popover.

## Replacing Options

Root, Trigger, Anchor and Content each have their own Options. A Content replacement must supply all four properties:

[src/popover/callout.ts](../snippets/src/popover/callout.ts)

## Native top layer

Content gets `popover="manual"` and is shown with `showPopover()`, so it paints above the page and escapes ancestors that clip or create stacking contexts, while staying in its authored place in the DOM with its Angular bindings intact. Nothing is portaled or moved, so Content can sit inside a scrolling, transformed or clipped container next to its Anchor.

Origami owns the `popover` attribute and the native show/hide calls; don't drive them yourself. It also sets `position: fixed`, `top`/`left` coordinates, resets `right`, `bottom` and `margin`, and suppresses paint and pointer events briefly while it measures. Everything else about the Content's box is yours:

- Give Content stable, measurable dimensions. Origami doesn't size it or keep oversized content inside the viewport.
- Scope any custom `display` to `:popover-open`, so the browser's closed Popover stays hidden.
- Use `gap` for distance from the Anchor, not margins.
- `transform` is free for your animations; positioning doesn't use it. `z-index` doesn't reorder top-layer elements.

## Positioning

`side` and `align` are logical, resolved from the **Anchor's** writing mode and direction, not the Content's. The default places Content below the Anchor with their start edges aligned in horizontal writing. `align` is along the side's cross axis, and `"center"` centers it.

| Anchor writing mode | `block-start` / `block-end` | `inline-start` / `inline-end`, LTR | `inline-start` / `inline-end`, RTL |
| ------------------- | --------------------------- | ---------------------------------- | ---------------------------------- |
| `horizontal-tb`     | top / bottom                | left / right                       | right / left                       |
| `vertical-rl`       | right / left                | top / bottom                       | bottom / top                       |
| `vertical-lr`       | left / right                | top / bottom                       | bottom / top                       |

When the requested placement overflows, Floating UI tries the opposite side, then the opposite alignment, then both (`"center"` has no opposite alignment). If none fits, it prefers a candidate that fits along the main axis with the least cross-axis overflow, and otherwise the one with the least overflow. That isn't a guarantee that Content fits on every edge, or that it moves back to the requested placement. `gap` must be finite and nonnegative; reading any other effective value throws a `RangeError` rather than clamping it. That's a configuration error, separate from the positioning failure below. All three settings are reactive.

While Content is shown, including during its exit animation while the Anchor is still available, its position follows document and nested scrolling, viewport resizes, Anchor and Content resizes and observed Anchor movement. Tracking stops once Content is fully closed, suppressed or destroyed. It doesn't follow an ancestor that resizes without any of those, or an Anchor moved by a transform animation. A nested Popover is positioned only after its parent has been positioned and revealed.

## Dismissal and focus

- **Escape** asks the topmost open Popover to close: the one the browser most recently showed. Reopening a Popover during its exit animation, or repositioning it, doesn't change that order. Events already handled (`defaultPrevented`) or sent during IME composition are ignored. If the Popover's branch refuses to close (see below), Escape is still consumed; it doesn't fall through to a parent or another Popover. On close, focus returns to its Trigger once, if that Trigger is still connected, enabled and not inert, and a listener hasn't moved focus elsewhere.
- **Outside pointer:** a trusted primary-button press whose `pointerdown` and matching `pointerup` are both outside the Popover closes it. A drag that starts inside doesn't, and neither does a mismatched pointer or button, or a `pointercancel` or lost pointer capture before the `pointerup`. The gesture completes at `pointerup`: cancellation or capture loss after it doesn't undo it. The Popover closes after that `pointerup` has been dispatched, so your listeners can still cancel it with `preventDefault()` on either event, and only if the Popover's branch hasn't been replaced meanwhile. Focus stays where the user put it.
- A nested Popover counts as inside its parent. A user dismissal closes the affected branch, descendants before ancestors, only if every open member allows it: one with `dismissible` set to false vetoes the whole request, and nothing closes or emits `openChange`. A root's own Trigger can close it despite its own `dismissible`, but not past a protected descendant.
- Setting `open` to false yourself always closes, regardless of `dismissible`. Open descendants are hidden but keep their own `open`. Focus returns to the Trigger only if it was inside the closing Popover or its open descendants, and then only once, to the closing Popover's own Trigger, under the same conditions as Escape.
- `disabled` blocks the Trigger, not Escape or outside dismissal.
- Unrelated Popovers stay open independently; opening one doesn't close another.

The Popover is non-modal: there's no focus trap, no scroll lock, no automatic focus and no close when focus leaves. Native `autofocus` on an element inside Content still works when it opens. Tab order follows the DOM, so author Content right after its Trigger if keyboard users should reach it next. While Content runs its exit animation, it's `inert` and the Trigger's `aria-expanded` is already false. You supply Content's role and accessible name; Popover isn't a menu, listbox or dialog.

## State and attributes

`OrigamiPopoverState` has `open()`, `disabled()` and `dismissible()`, the effective values from the root Options. `dismissible()` is the permission described above, so false doesn't stop the root's own Trigger from closing it. `open()` reports what was requested, not whether Content is visible. `OrigamiPopoverContentState.open()` is Presence's `open()`: true while Content's children should stay rendered, including the exit.

| Element | Attributes                                                                                                                                                            |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger | `type="button"`, `id`, `aria-controls` (only while Content is mounted), `aria-expanded`; when disabled, native `disabled`, `aria-disabled="true"` and `data-disabled` |
| Content | `id`, `popover="manual"`, `inert` whenever it isn't shown (closed, exiting or suppressed), and Presence's `data-entering`, `data-present` and `data-leaving`          |

`aria-expanded` is true from the moment the browser shows Content, including the short measuring step, and false as soon as a close is accepted. For Popover, `opening` can start before `data-entering` appears: the entering attribute waits until Content has been positioned, so your entrance animation starts in the right place.

## Positioning failure

If positioning fails, for example because the Anchor uses an unsupported writing mode, Origami hides the Content immediately, without an exit animation, and reports the error once through Angular's `ErrorHandler`. That applies whether it fails while opening, on a later update, or during a visible exit. Nothing is revealed, no failed coordinates are applied, and the Trigger's `aria-expanded` is false. `open` keeps its value and Presence keeps its phase. The same attempt isn't retried; changing `open`, a part, the Content Options or the parent Popover's presentation tries again. A failure from a calculation that a newer one has already replaced is still reported once, but doesn't hide the newer presentation. Positioning needs `ResizeObserver` and `IntersectionObserver`.

## Server rendering and hydration

Popover Content is in the server HTML with `popover="manual"`, but the browser shows a closed Popover until the Content has hydrated and opened. An initially-open Popover's children are in the server HTML; it appears as a floating surface only once it hydrates.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Limitations

Popover supports the `horizontal-tb`, `vertical-rl` and `vertical-lr` writing modes; others fail positioning. It doesn't keep oversized content inside the viewport, doesn't track transform-animated anchors or unobserved ancestor resizes, and doesn't create a source association for Tab order.
