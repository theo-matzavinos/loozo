# @loozo/origami-ui

Headless, accessible Angular primitives: Collection, Presence, Collapsible, single and multiple Accordion, Popover and Toggle. They own behavior, state, generated IDs, ARIA associations and Popover's native top-layer presentation, and they're safe to render on the server and hydrate. You own the markup, roles and accessible names, styling, dimensions and animation.

Every primitive is a directive you put on your own elements, or compose into your own directives through `hostDirectives`. Each configurable part reads typed **Options** that you can replace. The roots, Presence, Popover Content and Toggle also expose a readonly **State** that you can inject.

Use it when you're building your own design system or application components in Angular 22 and want tested behavior for disclosure, selection, enter/exit animation, anchored popovers and toggle buttons, without adopting someone else's markup or styles. It renders on the server and hydrates, both eagerly and incrementally, without client-only fallbacks.

**Status:** experimental and published on npm. Version `0.0.1`, MIT license.

## Install

```sh
npm install @loozo/origami-ui
```

Peer dependencies:

| Package           | Range     |
| ----------------- | --------- |
| `@angular/core`   | `~22.2.2` |
| `@angular/common` | `~22.2.2` |

The package is tested against Angular 22.2.2. It supports Angular 22.2.x from 22.2.2, not earlier patches: it's built with the 22.2.2 compiler, and an application's Angular compiler must be at least as new as the one a library was built with. Popover positioning uses `@floating-ui/dom` `1.8.0`, a regular dependency. Its types and middleware aren't part of the API.

The root entry point `@loozo/origami-ui` is intentionally empty. Import from the secondary entry points:

| Entry point                     | Exports                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@loozo/origami-ui/utils`       | `injectDeferred`, `injectUniqueId`                                                                                                                                                                                                                                                                                             |
| `@loozo/origami-ui/collection`  | `OrigamiCollection`, `OrigamiCollectionState`, `OrigamiCollectionItem`, `OrigamiCollectionItemOptions`, type `OrigamiCollectionRecord`                                                                                                                                                                                         |
| `@loozo/origami-ui/presence`    | `OrigamiPresence`, `OrigamiPresenceOptions`, `OrigamiPresenceState`, type `OrigamiPresencePhase`                                                                                                                                                                                                                               |
| `@loozo/origami-ui/collapsible` | `OrigamiCollapsible`, `OrigamiCollapsibleOptions`, `OrigamiCollapsibleState`, `OrigamiCollapsibleTrigger`, `OrigamiCollapsibleTriggerOptions`, `OrigamiCollapsiblePanel`, `OrigamiCollapsiblePanelOptions`, type `OrigamiCollapsibleHiding`                                                                                    |
| `@loozo/origami-ui/accordion`   | `OrigamiAccordionSingle`, `OrigamiAccordionSingleOptions`, `OrigamiAccordionMultiple`, `OrigamiAccordionMultipleOptions`, `OrigamiAccordionOptions`, `OrigamiAccordionState`, `OrigamiAccordionItem`, `OrigamiAccordionTrigger`, `OrigamiAccordionTriggerOptions`, `OrigamiAccordionPanel`, `OrigamiAccordionPanelOptions`     |
| `@loozo/origami-ui/popover`     | `OrigamiPopover`, `OrigamiPopoverOptions`, `OrigamiPopoverState`, `OrigamiPopoverTrigger`, `OrigamiPopoverTriggerOptions`, `OrigamiPopoverAnchor`, `OrigamiPopoverAnchorOptions`, `OrigamiPopoverContent`, `OrigamiPopoverContentOptions`, `OrigamiPopoverContentState`, type `OrigamiPopoverSide`, type `OrigamiPopoverAlign` |
| `@loozo/origami-ui/toggle`      | `OrigamiToggle`, `OrigamiToggleOptions`, `OrigamiToggleState`                                                                                                                                                                                                                                                                  |

The Accordion entry point also exports `ɵOrigamiAccordionRoot`, which compiled composition needs. It isn't an application API. Every export carries TSDoc with its defaults, ownership, errors and hydration behavior; your editor shows it from the published declarations.

## How the primitives fit together

```text
Your directive or component
    │ hostDirectives, and optionally a replacement for the part's Options
    ▼
Primitive directive          inputs, models and their defaults; host bindings
    │
    ▼
Options token ──► private Context ──► readonly State
                  behavior,           injectable by you and by descendants
                  registration,
                  lifecycle
```

- **Options** are the effective configuration of one part: an abstract class of signals. By default the directive itself provides them, from its own inputs and models. Every Options class has two helpers that replace them on one element, each returning a `Provider[]` for the directive's `providers`:
  - `provideExisting(() => Type)` uses another class on the same element, usually your own directive, which must implement the Options. Forward references work.
  - `provideFactory(() => options)` uses an object you build. The factory runs in an injection context, so it can call `inject()`.

  A replacement replaces the configuration as a whole: it must supply every property, and the directive's own inputs and defaults are ignored. Writable properties can be ordinary `signal()`s; writing them doesn't emit the unused directive's model output.

- **Context** is private and owns the behavior. Parts register with the nearest owner in Angular's DI, so nested roots are independent and descendants share their own root's State.
- **State** is a readonly facade over the nearest owner, provided on that owner's element: Collection, Presence, Collapsible, each Accordion mode, the Popover root, Popover Content and Toggle. Inject it in a descendant or a composing directive. Those directives also expose it as their `state` property, which you can read through a template reference; items, Triggers, Anchors and Panels have no `state` property of their own. It has no writable aliases.

Angular 22.2.2's template type-checker crashes ("Could not resolve [object Object]") on a template reference to a primitive's `exportAs` name, such as `#t="ogToggle"`, when that element matches the primitive both directly and through your directive's `hostDirectives`. Reference your own directive instead, and expose the primitive's State from it.

Upper primitives are built from lower ones: Accordion composes Collection and Collapsible, and Collapsible's Panel and Popover's Content compose Presence. Replacing an upper part's Options also drives the lower part, so you don't need to replace lower Options yourself.

A primitive that needs an owner, such as an item without a Collection, fails with Angular's missing-provider error. A second mounted Trigger, Panel, Anchor or Content in one Collapsible or Popover fails with an error naming the role.

## Collection

Collection tracks the items mounted under it, in rendered DOM order. It's the ordering layer under Accordion, and you can use it directly when your own component needs to know which items exist and in what order.

[src/collection/sections.ts](snippets/src/collection/sections.ts)

Each item has a `value` input. Without one it gets a generated value that's stable while the item is mounted and across hydration; pass explicit values when they mean something in your domain. Values are opaque strings and aren't normalized.

### Replacing item Options

[src/collection/tag.ts](snippets/src/collection/tag.ts)

### State

`OrigamiCollectionState.items()` is a readonly array of records, each with a readonly `value` signal. Order follows the DOM, not construction order: keyed moves, insertions and removals show up after the render that made them. Changing an item's value updates its record without replacing it. Server rendering produces the same order without browser APIs.

Nested Collections are independent: an inner Collection's items don't appear in the outer one.

### Accessibility

Collection adds no attributes, roles, selection or keyboard behavior. Give the container and items the semantics your use needs, such as a list.

## Presence

Presence tracks an enter/exit lifecycle for its host, so you can keep content rendered until its exit animation finishes. It doesn't hide, move or remove the host; you decide what to render from its State.

[src/presence/notice.ts](snippets/src/presence/notice.ts)

### Replacing Options

Drive Presence from application state instead of its own `present` model:

[src/presence/offline-banner.ts](snippets/src/presence/offline-banner.ts)

### State and attributes

```text
present becomes true  → opening → open
present becomes false → closing → closed
```

`OrigamiPresenceState` has `phase()`, one of `opening`, `open`, `closing` and `closed`, and `open()`, which is true in every phase except `closed`. Gate children on `open()` to keep them through the exit.

| Host attribute  | Present during |
| --------------- | -------------- |
| `data-entering` | `opening`      |
| `data-present`  | `open`         |
| `data-leaving`  | `closing`      |

Each attribute is empty when present and absent otherwise. They're owned by Presence; don't author them yourself.

Presence adds no ARIA and doesn't hide, detach or remove its host. Presence itself does not hide retained content from assistive technology; you own its accessibility during exit.

`opening` and `closing` settle when the finite animations on the host itself finish or are cancelled. Presence looks for them after the transition's attribute, the host's bindings and the newly rendered children have taken effect, so an animation your CSS starts from `data-entering` or `data-leaving` is found. Infinite animations are ignored, even alongside finite ones, and no animation or a zero duration settles straight away, without a timer. Reversing mid-transition, or destroying the host, discards the earlier transition's pending completion. Reduced motion is up to your CSS: when your `prefers-reduced-motion` styles remove the animation, the transition settles without one.

## Collapsible

Collapsible is a disclosure: a native button that shows and hides one panel.

[src/collapsible/details.ts](snippets/src/collapsible/details.ts)

The root has an `expanded` model (default `false`), a `disabled` input (default `false`) and a `hiding` input (default `"hidden"`). A Collapsible supports one Trigger and one Panel; either may be missing, which removes its ARIA association.

### Replacing Options

Root, Trigger and Panel each have their own Options. This root replacement makes `until-found` its own default:

[src/collapsible/searchable-section.ts](snippets/src/collapsible/searchable-section.ts)

### State and attributes

`OrigamiCollapsibleState` has `expanded()` and `disabled()`, the effective values from the root Options.

| Element | Attributes                                                                                                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root    | `data-expanded`, `data-disabled`                                                                                                                                                       |
| Trigger | `type="button"`, `id`, `aria-expanded`, `aria-controls` (only while a Panel is mounted), `data-expanded`; when disabled, native `disabled`, `aria-disabled="true"` and `data-disabled` |
| Panel   | `id`, `aria-labelledby` (only while a Trigger is mounted), `data-expanded`, `hidden` once collapsed, and Presence's `data-entering`, `data-present` and `data-leaving`                 |

`data-expanded` follows the requested state, not the exit animation: it's removed as soon as the panel starts closing. The Panel stays visible through its finite exit animation and gets `hidden` once Presence closes.

### Accessibility

- The Trigger is a native button. Enter and Space work natively; there's no custom keyboard handling.
- An enabled click toggles `expanded`. While disabled, user clicks can't change it, but your own writes to the model or Options still apply.
- You supply the heading, any `role="region"` on the Panel, and the content's semantics. The Panel's `aria-labelledby` names the Trigger.
- `hiding="until-found"` lets the browser's find-in-page reveal collapsed content where `beforematch` is supported; the reveal expands the Collapsible. Elsewhere it behaves like `hidden`, with no polyfill. A disabled Collapsible uses plain `hidden`, so find-in-page can't expand it.

## Accordion

Accordion is a set of Collapsible items with single or multiple selection.

[src/accordion/faq.ts](snippets/src/accordion/faq.ts)

| Directive             | Configuration                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `ogAccordionSingle`   | `value: string \| null` model (default `null`), `disabled`, `collapsible` (both `false`) |
| `ogAccordionMultiple` | `value: readonly string[]` model (default `[]`), `disabled` (default `false`)            |
| `ogAccordionItem`     | `value` (default generated), `disabled` (default `false`), `hiding` (default `"hidden"`) |
| `ogAccordionTrigger`  | `id` (default generated); must be a `<button>`                                           |
| `ogAccordionPanel`    | `id` (default generated)                                                                 |

Give items distinct explicit values when they need independent selection.

- **Single:** clicking an unselected item selects it. Clicking the selected item clears the value to `null` only when `collapsible` is true.
- **Multiple:** clicking adds the item's value at the end of a new array, or removes it. Your array is never mutated, and the other values keep their order.
- In both modes, the value is yours: values with no mounted item are kept, nothing is selected automatically, and removing an item doesn't remove its value.
- Root and item `disabled` combine. While disabled, user clicks and find-in-page reveals can't change the selection; your own writes still apply.

### Replacing Options

Single, Multiple, shared, Trigger and Panel Options can each be replaced. Here the selection lives in an application service:

[src/accordion/settings-sections.ts](snippets/src/accordion/settings-sections.ts)

`OrigamiAccordionOptions` holds only the shared `disabled`; replace `OrigamiAccordionSingleOptions` or `OrigamiAccordionMultipleOptions` for the selection. Replacing Trigger or Panel Options also sets the composed Collapsible's IDs and associations.

### State and attributes

`OrigamiAccordionState` has `itemValues()`, the mounted items' values in DOM order, and `disabled()`, the effective root policy.

Each item is a Collapsible, so the item element carries the Collapsible root attributes, and the Trigger and Panel carry the Collapsible Trigger and Panel attributes above.

### Accessibility

- In Single mode without `collapsible`, the selected item's Trigger has `aria-disabled="true"`, because clicking it does nothing. It stays a focusable, natively enabled button unless the root or item is disabled.
- There's no arrow-key navigation, roving tabindex or focus management; Tab moves between the native buttons. You supply the headings and any Panel roles.

## Popover

Popover is a non-modal floating surface anchored to an element: Content stays where you author it and is shown in the browser's top layer, positioned next to its Anchor.

[src/popover/task-chooser.ts](snippets/src/popover/task-chooser.ts)

| Part               | Configuration                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `ogPopover`        | `open` model (default `false`), `disabled` (default `false`), `dismissible` (default `true`)      |
| `ogPopoverTrigger` | `id` (default generated); must be a `<button>`                                                    |
| `ogPopoverAnchor`  | `id` (default generated); may share the Trigger's element, which then uses the Trigger's ID       |
| `ogPopoverContent` | `id` (default generated), `side` (`"block-end"`), `align` (`"start"`), `gap` (`0`, in CSS pixels) |

Trigger, Anchor and Content are all required for the Popover to show. When one is missing, or a parent Popover closes, the Content is hidden but `open` keeps its value, so mounting the part again shows it. One of each part is supported per Popover.

### Replacing Options

Root, Trigger, Anchor and Content each have their own Options. A Content replacement must supply all four properties:

[src/popover/callout.ts](snippets/src/popover/callout.ts)

### Native top layer

Content gets `popover="manual"` and is shown with `showPopover()`, so it paints above the page and escapes ancestors that clip or create stacking contexts, while staying in its authored place in the DOM with its Angular bindings intact. Nothing is portaled or moved, so Content can sit inside a scrolling, transformed or clipped container next to its Anchor.

Origami owns the `popover` attribute and the native show/hide calls; don't drive them yourself. It also sets `position: fixed`, `top`/`left` coordinates, resets `right`, `bottom` and `margin`, and suppresses paint and pointer events briefly while it measures. Everything else about the Content's box is yours:

- Give Content stable, measurable dimensions. Origami doesn't size it or keep oversized content inside the viewport.
- Scope any custom `display` to `:popover-open`, so the browser's closed Popover stays hidden.
- Use `gap` for distance from the Anchor, not margins.
- `transform` is free for your animations; positioning doesn't use it. `z-index` doesn't reorder top-layer elements.

### Positioning

`side` and `align` are logical, resolved from the **Anchor's** writing mode and direction, not the Content's. The default places Content below the Anchor with their start edges aligned in horizontal writing. `align` is along the side's cross axis, and `"center"` centers it.

| Anchor writing mode | `block-start` / `block-end` | `inline-start` / `inline-end`, LTR | `inline-start` / `inline-end`, RTL |
| ------------------- | --------------------------- | ---------------------------------- | ---------------------------------- |
| `horizontal-tb`     | top / bottom                | left / right                       | right / left                       |
| `vertical-rl`       | right / left                | top / bottom                       | bottom / top                       |
| `vertical-lr`       | left / right                | top / bottom                       | bottom / top                       |

When the requested placement overflows, Floating UI tries the opposite side, then the opposite alignment, then both (`"center"` has no opposite alignment). If none fits, it prefers a candidate that fits along the main axis with the least cross-axis overflow, and otherwise the one with the least overflow. That isn't a guarantee that Content fits on every edge, or that it moves back to the requested placement. `gap` must be finite and nonnegative; reading any other effective value throws a `RangeError` rather than clamping it. That's a configuration error, separate from the positioning failure below. All three settings are reactive.

While Content is shown, including during its exit animation while the Anchor is still available, its position follows document and nested scrolling, viewport resizes, Anchor and Content resizes and observed Anchor movement. Tracking stops once Content is fully closed, suppressed or destroyed. It doesn't follow an ancestor that resizes without any of those, or an Anchor moved by a transform animation. A nested Popover is positioned only after its parent has been positioned and revealed.

### Dismissal and focus

- **Escape** asks the topmost open Popover to close: the one the browser most recently showed. Reopening a Popover during its exit animation, or repositioning it, doesn't change that order. Events already handled (`defaultPrevented`) or sent during IME composition are ignored. If the Popover's branch refuses to close (see below), Escape is still consumed; it doesn't fall through to a parent or another Popover. On close, focus returns to its Trigger once, if that Trigger is still connected, enabled and not inert, and a listener hasn't moved focus elsewhere.
- **Outside pointer:** a trusted primary-button press whose `pointerdown` and matching `pointerup` are both outside the Popover closes it. A drag that starts inside doesn't, and neither does a mismatched pointer or button, or a `pointercancel` or lost pointer capture before the `pointerup`. The gesture completes at `pointerup`: cancellation or capture loss after it doesn't undo it. The Popover closes after that `pointerup` has been dispatched, so your listeners can still cancel it with `preventDefault()` on either event, and only if the Popover's branch hasn't been replaced meanwhile. Focus stays where the user put it.
- A nested Popover counts as inside its parent. A user dismissal closes the affected branch, descendants before ancestors, only if every open member allows it: one with `dismissible` set to false vetoes the whole request, and nothing closes or emits `openChange`. A root's own Trigger can close it despite its own `dismissible`, but not past a protected descendant.
- Setting `open` to false yourself always closes, regardless of `dismissible`. Open descendants are hidden but keep their own `open`. Focus returns to the Trigger only if it was inside the closing Popover or its open descendants, and then only once, to the closing Popover's own Trigger, under the same conditions as Escape.
- `disabled` blocks the Trigger, not Escape or outside dismissal.
- Unrelated Popovers stay open independently; opening one doesn't close another.

The Popover is non-modal: there's no focus trap, no scroll lock, no automatic focus and no close when focus leaves. Native `autofocus` on an element inside Content still works when it opens. Tab order follows the DOM, so author Content right after its Trigger if keyboard users should reach it next. While Content runs its exit animation, it's `inert` and the Trigger's `aria-expanded` is already false. You supply Content's role and accessible name; Popover isn't a menu, listbox or dialog.

### State and attributes

`OrigamiPopoverState` has `open()`, `disabled()` and `dismissible()`, the effective values from the root Options. `dismissible()` is the permission described above, so false doesn't stop the root's own Trigger from closing it. `open()` reports what was requested, not whether Content is visible. `OrigamiPopoverContentState.open()` is Presence's `open()`: true while Content's children should stay rendered, including the exit.

| Element | Attributes                                                                                                                                                            |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger | `type="button"`, `id`, `aria-controls` (only while Content is mounted), `aria-expanded`; when disabled, native `disabled`, `aria-disabled="true"` and `data-disabled` |
| Content | `id`, `popover="manual"`, `inert` whenever it isn't shown (closed, exiting or suppressed), and Presence's `data-entering`, `data-present` and `data-leaving`          |

`aria-expanded` is true from the moment the browser shows Content, including the short measuring step, and false as soon as a close is accepted. For Popover, `opening` can start before `data-entering` appears: the entering attribute waits until Content has been positioned, so your entrance animation starts in the right place.

### Positioning failure

If positioning fails, for example because the Anchor uses an unsupported writing mode, Origami hides the Content immediately, without an exit animation, and reports the error once through Angular's `ErrorHandler`. That applies whether it fails while opening, on a later update, or during a visible exit. Nothing is revealed, no failed coordinates are applied, and the Trigger's `aria-expanded` is false. `open` keeps its value and Presence keeps its phase. The same attempt isn't retried; changing `open`, a part, the Content Options or the parent Popover's presentation tries again. A failure from a calculation that a newer one has already replaced is still reported once, but doesn't hide the newer presentation. Positioning needs `ResizeObserver` and `IntersectionObserver`.

## Toggle

Toggle is a two-state button, such as a mute, bold or dark-theme button: a native button that flips a `pressed` model.

[src/toggle/mute.ts](snippets/src/toggle/mute.ts)

It has a `pressed` model (default `false`) and a `disabled` input (default `false`). Each Toggle is its own owner; there's no group.

### Replacing Options

Drive the pressed state from application state instead of the directive's own model:

[src/toggle/bold-format.ts](snippets/src/toggle/bold-format.ts)

### State and attributes

`OrigamiToggleState` has `pressed()` and `disabled()`, the effective values from the Options. The directive exposes it as `state`, and descendants of the button can inject it.

| Element | Attributes                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toggle  | `type="button"`, `aria-pressed` (`"true"` or `"false"`), `data-pressed` while pressed; when disabled, native `disabled`, `aria-disabled="true"` and `data-disabled` |

### Accessibility

- The Toggle is a native button. Enter and Space work natively; there's no custom keyboard handling.
- An enabled click flips `pressed`. While disabled, user clicks can't change it, but your own writes to the model or Options still apply.
- `aria-pressed` is always `"true"` or `"false"`; there's no mixed state. You supply the accessible name. Keep it the same in both states, because `aria-pressed` already announces the state.
- Toggle isn't a form control: it has no form value or Signal Forms integration. For several related toggles, use separate Toggles; there's no group or arrow-key navigation.

## Utilities

`@loozo/origami-ui/utils` exports the two helpers the primitives use:

[src/utils/field-hint.ts](snippets/src/utils/field-hint.ts)

- `injectUniqueId(key)` returns an opaque ID that's stable for this allocation and unique within the application. Call it once per mounted identity, in an injection context, and keep the result. Its spelling and allocation order aren't part of the API.
- `injectDeferred(token)` captures the current injector in an injection context and returns a function that resolves `token` from it later, outside the injection context. Nothing is resolved at capture time.

Both throw when called outside an injection context.

## Server rendering and hydration

Every primitive renders on the server and hydrates with Angular's `provideClientHydration`, with or without incremental hydration. There's no extra provider, `ngSkipHydration` or client-only rendering.

- Hydration reuses the server's elements: hosts and their children keep their identity, and initially-present content isn't removed and recreated. An element that was present on the server doesn't replay its entrance animation when it hydrates.
- Initially-absent Presence-gated content isn't in the server HTML and doesn't appear when its owner hydrates.
- Generated IDs and item values match between server and client, including when `@defer` blocks hydrate in a different order from the server.
- An Angular event replayed after incremental hydration reaches the model once.
- A Toggle's `aria-pressed`, `data-pressed` and disabled attributes are in the server HTML. If the server can't know the pressed state, for example a theme stored in the browser, render the Toggle disabled until the browser has it.
- Popover Content is in the server HTML with `popover="manual"`, but the browser shows a closed Popover until the Content has hydrated and opened. An initially-open Popover's children are in the server HTML; it appears as a floating surface only once it hydrates.

**The element-host identity rule:** `injectUniqueId` matches server and client only when it's called with an element host, that is in a directive or component on an element, as every primitive does. A call from an application service or another injection context without an element host still returns an application-unique ID, but don't bind it into server-rendered DOM, because the client will generate a different one. Uniqueness across several Angular applications in one document isn't guaranteed; coordinate explicit IDs there.

Explicit and static `id` bindings always take precedence over generated ones.

## Limitations

- No styled components, themes or design tokens. No menu, listbox or select semantics, focus traps, roving tabindex or arrow-key navigation.
- Angular 22.2.x from 22.2.2 only; tested against 22.2.2.
- Browsers are tested in Playwright's Chromium, Firefox and WebKit builds, not Safari, iOS or physical devices. No formal Baseline or minimum-version claim is made.
- `until-found` is a progressive enhancement and falls back to `hidden` without find-in-page.
- Popover supports the `horizontal-tb`, `vertical-rl` and `vertical-lr` writing modes; others fail positioning. It doesn't keep oversized content inside the viewport, doesn't track transform-animated anchors or unobserved ancestor resizes, and doesn't create a source association for Tab order.
- Open evidence limits (native find-in-page, mismatched pointer gestures, out-of-order geometry) are listed in [tests/acceptance/README.md](https://github.com/theo-matzavinos/loozo/blob/main/packages/origami-ui/tests/acceptance/README.md#known-evidence-limits).

## Further reading

- [SPEC.md](https://github.com/theo-matzavinos/loozo/blob/main/packages/origami-ui/SPEC.md): the product contract.
- [SPEC-POPOVER.md](https://github.com/theo-matzavinos/loozo/blob/main/packages/origami-ui/SPEC-POPOVER.md): the Popover design.
- [acceptance/](https://github.com/theo-matzavinos/loozo/tree/main/packages/origami-ui/acceptance): case definitions (`CASES.md`), public type checks and handwritten consumers.
- [`examples/origami-ui`](https://github.com/theo-matzavinos/loozo/tree/main/examples/origami-ui): the consumer application the acceptance suite runs.
- [PROVENANCE.md](https://github.com/theo-matzavinos/loozo/blob/main/packages/origami-ui/PROVENANCE.md): where this package came from.

## Developing this package

Requires Node 24.21.0 and pnpm 12.9.1. From this directory:

```sh
pnpm run build       # ng-packagr into dist/, finished by scripts/finish-package.mjs
pnpm run check       # formatting and lint
pnpm run typecheck   # library and acceptance runner sources
pnpm test            # browser-free checks against the packed build; also run by the root pnpm test
pnpm run test:fast   # test, then every product case in one Chromium project (about three minutes)
pnpm run test:focus popover   # sync, then the same Chromium project filtered by file or -g title
pnpm run test:full   # the release gate: 24 projects across three engines (about 50 minutes)
```

Acceptance tests the packed build installed into a scratch copy of the example application. On a fresh checkout, the first `test` (or `test:fast`, `test:focus`) runs the clean strict installation itself; after changing the example's `package.json` or the library's dependencies, run `pnpm run acceptance:prepare`. Set `NG_BUILD_MAX_WORKERS=2` on small hosts. WebKit may need private libraries.

The README's code examples live in [`snippets/`](https://github.com/theo-matzavinos/loozo/tree/main/packages/origami-ui/snippets) and are typechecked by `pnpm run snippets:check`, which `test` and `test:full` run. See [tests/acceptance/README.md](https://github.com/theo-matzavinos/loozo/blob/main/packages/origami-ui/tests/acceptance/README.md) for the suite, its prerequisites and every script.
