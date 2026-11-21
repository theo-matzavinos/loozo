# Scroll area

A scroll area is a native scroller whose scrollbars are your own elements: a track and a thumb per axis, overlaid on the content's edge and styled however your design needs (thin, rounded, shown only on hover). Scrolling stays the browser's: wheel, touch, keyboard, selection, focus scrolling and `scrollTo` move the viewport natively. Origami hides the native scrollbars, owns the viewport's overflow and the content's sizing, measures the overflow, sizes and places the thumbs, maps thumb drags, track presses and wheels over the tracks to the viewport, and decides when the bars show. You own the markup, every style, the viewport's size and its name.

[src/scroll-area/address-table.ts](../snippets/src/scroll-area/address-table.ts "playground")

| Directive               | Configuration                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `ogScrollArea`          | `hideDelay: number` (default `600` ms); exposes `state` (`exportAs: "ogScrollArea"`) |
| `ogScrollAreaViewport`  | none; the native scroller                                                            |
| `ogScrollAreaContent`   | none; an optional size wrapper inside the viewport                                   |
| `ogScrollAreaScrollbar` | `orientation: "vertical" \| "horizontal"` (default `"vertical"`); one per axis       |
| `ogScrollAreaThumb`     | none; inside a scrollbar                                                             |

```html
<div ogScrollArea class="scroll-area">
  <div ogScrollAreaViewport class="viewport" role="region" aria-label="Addresses">
    <div ogScrollAreaContent>
      <table>
        …
      </table>
    </div>
  </div>
  <div ogScrollAreaScrollbar orientation="vertical" class="scrollbar">
    <div ogScrollAreaThumb class="thumb"></div>
  </div>
  <div ogScrollAreaScrollbar orientation="horizontal" class="scrollbar">
    <div ogScrollAreaThumb class="thumb"></div>
  </div>
</div>
```

The axes follow the scrollbars you mount: a vertical-only panel just leaves out the horizontal scrollbar. One viewport, one content, one scrollbar per orientation and one thumb per scrollbar; a second fails when it registers. Don't change a mounted scrollbar's `orientation`; remount it instead.

## You may not need ScrollArea

If native scrollbars are fine, a plain scroller needs no primitive:

```css
.scroll-region {
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
  scrollbar-gutter: stable;
}

.scroll-region:focus-visible {
  outline: 2px solid var(--focus-ring);
}
```

```html
<div class="scroll-region" tabindex="0" role="region" aria-label="Addresses">…</div>
```

- `scrollbar-width` and `scrollbar-color` set the thickness and the thumb and track colors. The platform still decides the scrollbar's shape and whether it overlays the content: CSS can't force overlay scrollbars, show them only on hover, round the thumb or set an exact width, and in Chromium a value other than `auto` for either property turns off `::-webkit-scrollbar` styling. Those are what ScrollArea is for.
- `scrollbar-gutter: stable` reserves the space of a scrollbar that takes up layout before the content overflows, so the content doesn't shift when it starts to.
- Not every engine makes a scrollable element focusable on its own. Give a region that holds no focusable content `tabindex="0"` and a visible focus style, and a role and name when it's a meaningful region of the page.
- In forced colors mode, Chromium and Firefox reset `scrollbar-color` to `auto`, so native scrollbars keep their system colors.
- It all works in the server HTML, before hydration.

## Style it

The recipe below gives overlay tracks, rounded thumbs with a minimum length, bars shown on hover and while scrolling and hidden 600 ms later, on both axes:

```css
.scroll-area {
  position: relative;
  block-size: 100%;
}

.viewport {
  block-size: 100%;
}

.viewport:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}

.scrollbar {
  position: absolute;
  box-sizing: border-box;
  padding: 1px;
  overflow: clip;
  touch-action: none;
  visibility: hidden;
  opacity: 0;
  transition:
    opacity 150ms,
    visibility 0s 150ms;
}

.scrollbar[data-visible] {
  visibility: visible;
  opacity: 1;
  transition: opacity 150ms;
}

.scrollbar[data-orientation="vertical"] {
  inset-block: 0;
  inset-inline-end: 0;
  inline-size: 10px;
}

.scrollbar[data-orientation="horizontal"] {
  inset-inline: 0;
  inset-block-end: 0;
  block-size: 10px;
}

.scroll-area[data-overflow-y] > .scrollbar[data-orientation="horizontal"] {
  inset-inline-end: 10px;
}

.scroll-area[data-overflow-x] > .scrollbar[data-orientation="vertical"] {
  inset-block-end: 10px;
}

.thumb {
  box-sizing: border-box;
  border-radius: 9999px;
  background: var(--border);
}

.scrollbar[data-orientation="vertical"] .thumb {
  min-block-size: 18px;
}

.scrollbar[data-orientation="horizontal"] .thumb {
  block-size: 100%;
  min-inline-size: 18px;
}

@media (forced-colors: active) {
  .scrollbar {
    forced-color-adjust: none;
    background: Canvas;
  }

  .thumb {
    forced-color-adjust: none;
    background: CanvasText;
    border: 1px solid Canvas;
  }
}

@media (prefers-reduced-motion: reduce) {
  .scrollbar,
  .scrollbar[data-visible] {
    transition: none;
  }
}
```

- **Size.** Give the viewport a bounded size: `block-size: 100%` of a sized root, as here, or a `max-block-size`. Without one it grows instead of scrolling.
- **Overflow and content sizing are Origami's.** The viewport gets `overflow-x: auto` while a horizontal scrollbar is mounted and `hidden` otherwise, and `overflow-y` likewise for a vertical one; the content gets `min-inline-size: 100%`, `inline-size: max-content` and `box-sizing: border-box` while a horizontal scrollbar is mounted, so a wide table scrolls sideways and narrow content still fills the viewport, its padding and border included, and nothing otherwise, so vertical-only text wraps. A block size you give the content while it is sized includes its padding and border. Origami also hides the native bars with `scrollbar-width: none`. All of these are host bindings, never a static style, so hydration leaves the server's values in place until the bindings write the same ones. To override an axis, bind `[style.overflow-x]` in your template, which outranks Origami's host binding, or use `!important`.
- **Tracks.** Each track is absolutely positioned over the viewport's edge, border-box, so its 10 px is the outer thickness the corner offsets use. `data-overflow-x`/`-y` on the root stop one track at the other; draw a corner, if you want one, as a plain element. In right-to-left text `inset-inline-end` puts the vertical track on the left, and the horizontal thumb starts at the right. With `dir="rtl"` on the viewport alone, the tracks stay left to right and the thumb still matches the content physically, as the viewport's native scrollbar would: it starts at the right, and dragging it left reveals the content's left part.
- **Hiding.** Hide a track with `visibility` while it has no `data-visible`, not only `opacity`: an invisible track still takes clicks over the content's edge. A track or thumb under `display: none` has no geometry, so presses on that track do nothing until it shows again and is measured in the next frame.
- **Thumbs.** Origami writes the thumb's main-axis size and a `transform` inline. Put the minimum on the scrolling axis (`min-block-size` vertically, `min-inline-size` horizontally), in any unit; it may change at any time (a media query, a theme, `rem`) and the thumb is re-measured. Don't give the thumb a main-axis size of your own or make it a stretched flex item (`flex: 1`): Origami's length would be overridden, though the mapping stays right. A vertical thumb is a block, so its cross size is the track's content box; a horizontal one needs `block-size: 100%`.
- **Short rails.** When the rail is shorter than the thumb's minimum, the thumb sits at the rail's start and can't be dragged; `overflow: clip` on the track keeps it inside. Every other input still scrolls.
- **Forced colors.** The browser's forced colors remove a background-only thumb. The `forced-color-adjust: none` rules with system colors keep it visible against its track (Chromium and Firefox; WebKit's emulation doesn't remap colors).
- **Reduced motion.** Turn the fade off under `prefers-reduced-motion`.
- **Touch and pen.** `touch-action: none` on the tracks lets a finger drag a thumb instead of panning the page.

## Focus and naming

The viewport has a static `tabindex="0"`, so keyboard users can reach and scroll it in every engine (WebKit doesn't focus a scroller on its own). A static `tabindex` of yours replaces it, so `tabindex="-1"` takes it out of the tab order. Origami gives it no role and no name: give a meaningful region `role="region"` and an `aria-label` or `aria-labelledby`, and a visible `:focus-visible` style. The tracks are `aria-hidden` and never focused; the viewport is what keyboards and assistive technology use.

## Behavior

- **Visibility.** The root is active while the pointer is over it, during a drag and on each scroll, and stays so for `hideDelay` ms after the last of those; a track is `data-visible` while the root is active and its axis overflows. Keyboard and script scrolling show the bars too. A pointer already resting over the root when it hydrates counts as over it.
- **Drag.** A primary press on a thumb drags it from where it was grabbed. The pointer is captured, so the drag continues outside the root, and the press is prevented, so it selects no text and doesn't move focus, as a native scrollbar.
- **Track press.** A press elsewhere on a track jumps the thumb's center to the pointer and continues as a drag.
- **Wheel.** A wheel over a track scrolls its axis; a horizontal track also takes a vertical wheel, toward the inline end. At an edge a wheel moving outward isn't taken, so it scrolls the page or an outer scroller. The tracks sit outside the viewport's scroll chain, so `overscroll-behavior` on the viewport doesn't contain wheels over them. `Ctrl` + wheel is left to the browser. Line deltas count 16 px and page deltas the viewport's size.
- **Writes.** Every write is `scrollTo({ …, behavior: "instant" })`, also in a `scroll-behavior: smooth` viewport. A `scroll-snap` viewport snaps after each drag write.
- **State.** `#area="ogScrollArea"` gives `area.state.overflowX()`, `overflowY()` and `active()`, also injectable as `OrigamiScrollAreaState` in a descendant or a composing directive.

## Geometry

Lengths are layout px, so an ancestor's `transform: translate()` or `scale()` maps correctly; rotation, skew and a negative scale don't, and an ancestor's CSS `zoom` is untested. The content, viewport, tracks and thumbs are observed, and a size change applies in the next animation frame, so the thumb shows its previous geometry for one frame after a resize. Overflow that grows inside a content box whose own size doesn't change (a fixed-size wrapper) is noticed at the next pointer entry or scroll; let the content box grow with its content. Elastic overscroll stops the thumb at its end. Vertical writing modes aren't supported.

## Server rendering and hydration

Server HTML already hides the native bars and has the viewport's overflow and `tabindex`, so nothing shifts at hydration. The drawn bars appear once the browser has measured, after hydration: before it there's no bar to see or drag, while wheel, touch, keys and `scrollTo` work. A position scrolled to before hydration is kept and the thumb is placed from it.

Origami adds no Angular event bindings to any part, so it adds no `jsaction` and nothing is replayed. Your own hydrate triggers keep their Angular behavior: a root authored directly in `@defer (hydrate on hover)` hydrates on hover, and under `hydrate on interaction` a key pressed in the dormant viewport hydrates the block and scrolls the viewport, as it would a plain scroller. A block that must stay dormant while scrolled by keys uses `hydrate when`, `on viewport`, `on idle` or `never`.

If the area can scroll before hydration, style the viewport and the content with classes or `[style]` bindings, not a static `style` attribute. Angular's hydration replaces an element's static `style` with your declarations alone, and Origami's bindings restore theirs in a later pass, which can come after a layout: in that window the content has no sizing and the viewport no overflow or hidden bars. Under eager hydration WebKit then resets a horizontally scrolled area whose content has a static `style` to the start.

Keep a scroll area's parts in one hydrate boundary. A part still dehydrated in its own `@defer` block isn't registered: a dormant viewport leaves the root without overflow and its tracks inert, and a scrollbar in its own dormant block leaves its axis `overflow: hidden` from the first hydrating pass until it hydrates, although the server HTML had `auto`.

## Limitations

- No corner part, scroll-edge or shadow state, programmatic scroll API, virtual scrolling, track paging with hold-to-repeat, or arrow buttons. The viewport element is the scrolling API.
- `CdkScrollable` isn't registered: add `cdkScrollable` to the viewport when a CDK overlay must follow its scrolling.
- Touch is tested only in Chromium, through synthesized touch input. Firefox and WebKit touch, pens, physical devices, macOS overlay preferences and elastic overscroll are untested.
- Bars may lag the content by a frame while the main thread is busy, since the browser scrolls on its compositor.
