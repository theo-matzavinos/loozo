# Origami Popover — native manual + Floating UI design

**Status: design/API/lifecycle and complete contract approved/frozen on 2026-10-11; Baseline audit explicitly skipped; no product implementation authority.**

## Approved design

Keep the persistent Content element in its authored Angular DOM position. Use `popover="manual"` and zero-argument `showPopover()`/`hidePopover()` for native top-layer presentation, with a private `@floating-ui/dom` adapter for coordinates and automatic position updates. Do not portal, clone or recreate Content; do not use CSS anchors, `{ source }`, CDK Overlay or a custom rendering framework.

```text
Native manual Popover → top layer and clipping escape; authored DOM stays put
Floating UI           → coordinates, fallback placement and updates
Origami               → Options/State, dismissal, focus restoration and Presence
```

Preserve Options → private Context → readonly State, upper/lower Options substitution, Presence retention and logical DI nesting. Manual native Popover does not supply light dismissal, Escape handling or mutual exclusion, so Origami remains their owner.

**The remaining boundaries:** native source-associated Tab ordering is not retained; normal authored order applies. Content placement configuration and initial-presentation/Presence coordination are approved but still require browser proof. Inspected metadata does not establish formal widely-available status on 2026-10-11: the basic native subset's inspected 30-month cutoff is **2026-10-16**. loozo explicitly skipped the Baseline audit as a freeze/completion gate; no formal qualification claim is made.

## Concrete consumer

The normal case remains an ordinary persistent element:

```html
<div ogPopover [(open)]="open">
  <button ogPopoverTrigger ogPopoverAnchor>Choose task</button>
  <div
    ogPopoverContent
    #content="ogPopoverContent"
    side="block-end"
    align="start"
    [gap]="8"
    class="task-chooser"
    role="group"
    aria-label="Tasks"
  >
    @if (content.state.open()) {
    <button>Consumer-owned task</button>
    }
  </div>
</div>
```

Content may remain **inside** a transformed/clipped scroller with its Anchor:

```html
<div ogPopover [(open)]="open">
  <div class="transformed-scroll-region">
    <button ogPopoverTrigger ogPopoverAnchor>Choose task</button>
    <div
      ogPopoverContent
      #content="ogPopoverContent"
      [gap]="8"
      class="task-chooser"
      role="group"
      aria-label="Tasks"
    >
      @if (content.state.open()) {
      <button>Consumer-owned task</button>
      }
    </div>
  </div>
</div>
```

The directive owns the manual Popover attribute. Native top-layer presentation escapes ancestor clipping and stacking contexts without changing Content's parent, Angular bindings or logical owner. Consumers no longer need to move Content outside the scroller.

Consumer sizing remains explicit, for example:

```css
.task-chooser {
  inline-size: 16rem;
  max-inline-size: calc(100vw - 24px);
  max-block-size: 10rem;
  box-sizing: border-box;
  overflow: auto;
  z-index: 20;
}
```

The dimensions and stacking value are consumer choices, not Origami defaults or a universal viewport-containment guarantee. `z-index` does not reorder separately promoted native top-layer elements.

## Public API delta

Keep existing Popover symbols, selectors, export names, root inputs/models and part ID contracts. Content remains `[ogPopoverContent]` on a persistent element and exposes readonly `state.open()`.

Add three approved Content inputs, replacing direct native placement CSS as the supported configuration:

```ts
export type OrigamiPopoverSide = "block-start" | "block-end" | "inline-start" | "inline-end";

export type OrigamiPopoverAlign = "start" | "center" | "end";

// Configuration shape; existing provider helpers remain part of this class.
export abstract class OrigamiPopoverContentOptions {
  abstract readonly id: Signal<string>;
  abstract readonly side: Signal<OrigamiPopoverSide>; // default: 'block-end'
  abstract readonly align: Signal<OrigamiPopoverAlign>; // default: 'start'
  abstract readonly gap: Signal<number>; // default: 0 CSS px, finite and nonnegative
}
```

Export the two Origami types from `/popover`; do not expose Floating UI types or middleware as consumer API. Align is along the placement's cross axis. Logical side/alignment resolve from the Anchor's computed writing mode and direction; Content inherits consumer styling normally but does not silently redefine the positioning axes.

Content Options replacements must provide all four properties. Existing ID-only Content factories need migration; this is an explicit approved breaking change. Trigger/Anchor Options and root Options do not gain these fields.

Side, alignment and gap remain reactive through replaced Options. Defaults live on the Content directive, not in a fallback to its own fields after Options replacement. Invalid gap values fail clearly at the configuration boundary; no silent clamping.

The default is described as **below the anchor with logical start edges aligned** for horizontal writing. It is not a promise of pixel-identical native `position-area` behavior.

Origami owns the `popover="manual"` attribute through ordinary attribute APIs, native presentation calls, `position: fixed`, coordinate `top`/`left`, opposite inset resets, the existing zero-margin placement reset, preparatory paint/pointer suppression, and exit/suppression inertness. Do not read or write the later-dated `HTMLElement.popover` property. Consumers must not independently drive the host's native show/hide lifecycle or replace its Popover mode. Consumers use `gap` for anchor separation rather than margins on the positioned host. Origami does not use `transform` for positioning, leaving it available for consumer animations. Dimensions, overflow, appearance and `z-index` remain consumer-owned. Consumer CSS must provide stable measurable dimensions; Origami does not force a width or supply automatic sizing. Preserve the native closed-host display rule: scope custom `display` layouts to `:popover-open` rather than overriding closed Popover display.

## Private responsibility and lifecycle

```text
Root/parts and resolved Options
              │
              ▼
       Popover Context
       ├─ requested state, parts and logical parent
       ├─ branch dismissal and focus ownership
       ├─ Presence intent/retention
       ├─ guarded native manual activation/deactivation
       └─ private positioning adapter
            ├─ computePosition + offset + flip
            ├─ autoUpdate subscriptions
            └─ guarded coordinate commits

Angular continues owning Content and its child views throughout.
```

Use only the DOM package, not Floating UI's React interaction/portal components. Official npm registry metadata confirms `@floating-ui/dom@1.8.0` is published, depending on `@floating-ui/core: ^1.8.0` and `@floating-ui/utils: ^0.2.12`; those base versions also match the inspected source package metadata. Pin and verify the genuine installed dependency closure in the implementation-free seed lockfile. No formal Baseline compliance claim is made. This design was source-researched, not runtime-qualified; installation is now separately authorized for the isolated seed, not product implementation.

### Coordinates and fallback policy

Resolve sides and cross-axis alignment from Anchor's computed writing mode/direction, not Content's. The supported writing modes are `horizontal-tb`, `vertical-rl` and `vertical-lr`; sideways variants are not part of this first release.

| Anchor writing mode | block-start / block-end | inline-start / inline-end, LTR | inline-start / inline-end, RTL |
| ------------------- | ----------------------- | ------------------------------ | ------------------------------ |
| horizontal-tb       | top / bottom            | left / right                   | right / left                   |
| vertical-rl         | right / left            | top / bottom                   | bottom / top                   |
| vertical-lr         | left / right            | top / bottom                   | bottom / top                   |

For placement on a block side, cross-axis start/end comes from the table's inline edges; for placement on an inline side, it comes from block edges. Convert that physical edge to Floating UI's `start`/`end` with a private `platform.isRTL` override returning false, so the library does not apply Content's direction a second time. In that coordinate vocabulary, `start` means left on top/bottom placements and top on left/right placements. Center has no alignment suffix. This also handles an RTL Anchor with LTR Content and the reverse.

Use `offset(gap)` followed by `flip` with explicit `fallbackPlacements`: opposite main side, opposite cross alignment, then both flipped; omit duplicates for center. Set `mainAxis: true`, `crossAxis: true`, `flipAlignment: false`, `fallbackStrategy: 'bestFit'`, `boundary: 'clippingAncestors'` and `rootBoundary: 'viewport'`. This adopts the library's actual policy: try candidates in order against its facing-side/cross-axis overflow checks; after exhaustion prefer a main-axis-fitting candidate with less cross-axis overflow, otherwise use its least-overflow best-fit selection. It is **not** an all-four-edge/full-fit guarantee or an always-return-to-requested policy. Do not add `shift`, `size`, `hide`, arrows or a public middleware pipeline.

Measure after the host is actually `:popover-open`, so Floating UI sees its real top-layer coordinate system. Inspected DOM platform code treats a top-layer element's offset parent as the Window and excludes its ancestor clipping rectangles for `boundary: 'clippingAncestors'`; the viewport still constrains the fallback calculation. Native presentation, not a fixed-position heuristic or the fallback middleware, supplies clipping escape. Gap applies to the main side in each candidate. Content size and spacing remain consumer-owned.

Track document and nested-ancestor scroll, viewport resize, Anchor/Content resize and observed Anchor layout shifts while the retained surface needs presentation. Use `autoUpdate` with its event/observer facilities; do not enable continuous animation-frame tracking by default. Its `ancestorResize` uses native resize events, not ResizeObserver on every ancestor. A clipping ancestor that resizes without a viewport event or observable Anchor/Content change is outside this first proposal's automatic-update guarantee, as are transform-animated anchors without an observed movement. No extra ancestor-observer subsystem is proposed.

Each async coordinate result must still belong to the current owner, registered Anchor/Content, Options/configuration and latest position request before applying. Close, reentry, remount, ancestor suppression and destruction invalidate old commits. This includes an older scroll calculation resolving after a newer one for unchanged elements. Observer/event callbacks request a positioning READ rather than perform Angular presentation writes directly. Stop subscriptions once fully closed/suppressed or destroyed; keep tracking a visible retained exit when its Anchor remains available.

A successful, still-current native activation grants interaction participation and the Trigger's expanded presentation state, even during brief transparent geometry preparation. This lets Origami handle Escape/focus reentry after native autofocus; native activation and paint readiness are deliberately distinct. A canceled or failed show grants neither. A nested Popover retains its intent/subtree while its parent prepares, but starts its own native activation/geometry only after the parent's coordinate/reveal commit; it must not expose coordinates measured before the parent moved into position. Parent suppression invalidates descendant presentation without rewriting descendant intent.

### SSR, hydration and visibility

Render the persistent host and appropriate Presence-gated children on the server. Server behavior uses no browser geometry, observer or animation APIs. No portal container is created in either environment.

SSR emits `popover="manual"`, but cannot serialize an open top-layer state: the browser initially applies the native closed-Popover display rule. An initially-present retained subtree still exists in SSR; initially-closed gated children remain absent. Content is not usable as an open floating surface before its own hydration and native activation. Do not force the closed native host to display as an inline substitute.

During hydration, reuse that exact host and applicable children in the same parent. Do not remove an initially-present subtree just because a new browser Context has not initialized its presentation work yet. Deferred siblings stay untouched until their own owners hydrate. No `ngSkipHydration`, client-only replacement or movement to body.

Use a small **package-internal Presence presentation/completion adapter**, with the immediate/default adapter for direct Presence and Collapsible and a positioning-aware adapter only for Popover. This is concrete coordination for asynchronous geometry, not a supported public extension hook or generic renderer framework. If cross-entrypoint compilation requires a `ɵ` support export, document it as internal and keep it out of supported application authoring API.

The approved source-level protocol is:

1. **Initial retention:** when browser Presence attaches to a reused host, its existing owned `data-present` SSR marker initializes phase as settled `open`; absence initializes `closed`. SSR emits only settled presence. Read the host's own marker, never private Angular hydration metadata or another owner's subtree. Resolve Options after construction and process later intent changes normally. This preserves initially-present gated children before the first client effect and avoids creating a synthetic entrance just for hydration. Reserved Presence attributes are not consumer-authored initialization controls.
2. **Prepare retention:** changing intent from closed makes the public Presence phase `opening` and `state.open()` true, so Angular materializes the retained children. The adapter defers the entering attribute and completion discovery until position readiness. Direct Presence/Collapsible keep immediate phase attributes. Thus Popover's preparatory `opening` can briefly precede `data-entering`; document this composed-presentation refinement. Reused SSR `open` retains its settled phase instead.
3. **Activate natively:** after the live owner's relevant child/host bindings render, WRITE applies a temporary paint override (`opacity: 0 !important`) and pointer suppression, clears Origami's inertness, and calls zero-argument `showPopover()` once for this activation. Opacity suppression preserves native focus eligibility, unlike `visibility: hidden` or `inert`; consumer-declared native autofocus may run synchronously before position readiness. Capture and recheck owner/part/intent lifetime around the call and its synchronous `beforetoggle`/focus callbacks. Only an actual, still-current `:popover-open` result grants participation. A canceled show preserves requested intent and existing retained phase: a new opening stays preparatory `opening` without an entering attribute, while resumed SSR `open` stays settled. Release temporary overrides and restore inactive inertness after cancellation. Do not grant participation or spin retries for unchanged intent; a later intent change or relevant part/configuration lifecycle change can request a fresh activation. Subsequent close must terminate this nonvisual retention without waiting for geometry. Do not simulate native autofocus or perform a measure-only show/hide/show cycle.
4. **Measure and reveal:** READ starts a guarded coordinate calculation on the actually promoted host. Its promise records the latest result, permits the matching entering attribute and requests a subsequent Angular render; it does not pretend an async calculation completed inside a synchronous WRITE callback. In that render, normal bindings apply the permitted phase attribute, then WRITE commits coordinates and releases the temporary opacity/pointer overrides only for the current native activation. Preserve consumer style bindings when releasing overrides. Initial SSR `open` keeps its existing present attribute. READ discovery remains blocked unless that WRITE committed the same transition/result. Position readiness stays private and never writes the root model. Preparation can span render passes: prevent unpositioned paint without blocking native autofocus, and prove cleanup if autofocus immediately closes/reopens/destroys the owner.
5. **Discover and settle:** entrance discovery requires the READ after its successful reveal WRITE. A later visible exit instead discovers after its own leaving-attribute/inertness WRITE, using the existing native activation; it has no new geometry/reveal prerequisite. Nonvisual close settles Presence closed without waiting for reveal or animation discovery. Guard discovery/completion by Presence transition identity, current part registration and native activation lifetime—not every position-update sequence. Coordinate-result guards use their separate latest-request sequence. Scrolling must not invalidate the sole animation completion and strand retention. Discovery uses normal finite/cancel/zero/infinite rules; scroll-only updates do not manufacture transitions or restart animations.
6. **Close and retain:** accepted close removes participation immediately, performs the specified focus restoration while its closing-branch snapshot is still valid, and makes Content inert. Keep the native host open in the top layer, with retained children and coordinates, while leaving attributes/finite exit animations run. Do not call `hidePopover()` at desired-close time. Once current Presence settles closed, WRITE calls `hidePopover()` and releases preparation/tracking resources. No animations settle promptly; infinite animations do not delay removal. Close before reveal invalidates pending geometry and terminates Presence closed/hides without pretending a visible exit occurred. Suppression/missing parts/destruction hide immediately and never erase retained root intent. Call native hide only for a still-connected, currently owned open host; native element-removal steps handle an already-detached host, while Origami still releases its own resources. Reopen **before native hide starts** invalidates pending exit/completion/hide and reuses the still-open host without another native autofocus/promotion. Reopen **during native hide**, including its closing `beforetoggle` callback, cannot cancel hiding: preserve new intent, let the call return, then reconcile through a fresh guarded activation. This case may legitimately produce a new promotion order and native autofocus; do not attempt synchronous show inside the native hiding call.
7. **Native event reconciliation:** Origami is the presentation owner; native events are observations, not model writers. Queued `toggle` events can be coalesced or stale: consult current `:popover-open` state and owner/activation identity rather than replaying `oldState`/`newState` as desired intent. A canceled show, validity failure or changed owner cannot yield a reveal commit. Recheck after synchronous closing `beforetoggle` callbacks before final retention/style cleanup; a listener reopening or replacing an owner must not be overwritten by the old close. Do not catch genuine invalid native ownership and silently substitute inline rendering.

This separates retained Angular children from visible presentation while keeping the public phase vocabulary and readonly State. These are source-level design steps, not a claim they have been implemented or verified. The first composition proof must demonstrate initial SSR marker preservation, live binding behavior, Angular phase scheduling and finite animation discovery in a real browser. A render callback alone is not proof that still-dehydrated descendant blocks are hydrated; only the live owner's corresponding view is measured, and other blocks are neither forced nor mutated.

The native host remains `:popover-open` during a visible retained exit even though desired root state and Trigger participation are false. Origami owns this intentional separation. No CSS discrete `display`/`overlay` transitions, `transition-behavior`, `@starting-style`, or newer native retention feature is required; ordinary host animations finish before native hiding. Destruction performs final cleanup without delayed position/focus/animation work.

### Focus and event ownership

Retain the specified topmost Escape, atomic branch veto, trusted outside-pointer lifetime, reentrant outputs and conditional focus-restoration contracts. **Topmost means the most recently successfully native-activated participating Origami Popover**, not requested-open order or a global ordering with unrelated native surfaces. This matches newly promoted Origami hosts' native order. Coordinate updates do not reorder either. Reopening a still-promoted exit before native hide starts preserves its existing order; once hiding has started, reconciliation may need a genuine fresh promotion with a new order. Continue using actual composed event paths plus logical child ownership; top-layer painting does not change DOM ancestry.

Use authored document order for Tab/Shift+Tab. With adjacent Trigger/Content, the next eligible content control follows the Trigger naturally. With separated topology, consumers arrange intervening focusable elements according to intended navigation order. Zero-argument `showPopover()` creates no source association; ARIA links do not create one either. Do not add `popovertarget`, `{ source }`, a Tab bridge or roving tabindex to regain it indirectly.

Origami does not autofocus generically. Native activation still runs the browser's focusing steps for consumer-authored autofocus/native element semantics. A generic Content element without an autofocus target does not receive invented initial focus. Keep focus eligible during transparent preparation; suppression/exit becomes inert only after the correct restoration decision. Native manual presentation is not a replacement for Origami's Escape/outside/script-close restoration policy; do not infer that policy from the source-associated or auto-Popover algorithms.

Do not trap focus or close on focus departure. Exiting/suppressed Content is inert; restored focus is limited to the already specified live eligible Trigger. Consumer roles/names remain required for their chosen domain semantics.

## Browser capability boundary

The required mechanism uses the Popover attribute with value `manual`, zero-argument `showPopover()`/`hidePopover()`, `:popover-open` and native toggle events, plus CSS fixed positioning/numeric coordinates, DOM geometry/computed style, events, requestAnimationFrame, ResizeObserver, IntersectionObserver, inert and finite Web Animations completion. CSS anchors and source-associated focus ordering are not required.

Inspected per-capability metadata at `web-features` commit `98723fd5c2e449453b549867f045f2b63ec5f50f` separates:

| Capability                                                                  | Baseline low date | 30-month cutoff | Proposal use                 |
| --------------------------------------------------------------------------- | ----------------- | --------------- | ---------------------------- |
| Popover attribute, basic show/hide, open selector and Popover toggle events | 2024-04-16        | 2026-10-16      | Required                     |
| `HTMLElement.popover` reflected property                                    | 2025-01-27        | 2027-07-27      | Excluded; use attribute APIs |
| `showPopover({ source })` / source option                                   | 2025-10-14        | 2028-04-14      | Excluded                     |

On **2026-10-11**, the inspected required basic subset is five days short of its widely-available boundary; the wider feature group's later date must not be substituted for this exact subset. loozo explicitly instructed us to ignore the Baseline audit and approved the complete contract freeze. The audit is no longer a freeze/completion gate, and no formal Baseline certification is claimed. This decision adds no fallback entitlement and does not authorize product implementation, release or publication.

Inspected `web-features` metadata at `98723fd5c2e449453b549867f045f2b63ec5f50f` classifies ResizeObserver, IntersectionObserver, requestAnimationFrame, VisualViewport, inert, logical properties, writing-mode and Web Animations as Baseline high. These broad group classifications do not certify the shipped dependency closure or runtime behavior; no formal compliance claim is made.

Floating UI's inspected utilities recognize `:popover-open` for top-layer coordinates; this proposal requires that basic capability. Other optional selector probes remain distinct from required behavior. Detection success is not a Baseline certification; genuine dependency behavior and required runtime tests remain mandatory.

Mandatory qualification remains Chromium, Firefox and WebKit, with actual versions recorded; development/production eager and deferred hydration are included. Metadata/source inspection is not executed runtime proof.

## Required proof consumers

- Existing root/Trigger/Anchor/Content API, direct selectors and upper consumer host-directive composition; every Options token replaced by existing and factory providers.
- Dynamic logical side/alignment/gap, including LTR/RTL, differing Anchor/Content directions and the three supported writing modes; explicit library fallback ordering and partial/best-fit behavior.
- Consumer dimensions/scrolling/transform animations remain effective; geometry does not overwrite `transform` or `z-index`. A custom `display` layout scoped to `:popover-open` does not defeat native closed display; temporary style overrides release without losing consumer bindings.
- Document and two nested scroll ancestors, content/anchor resize, layout movement; stale async results after scroll/configuration/remount/destruction.
- Content and Anchor inside the same transformed/clipped ancestors: prove native top-layer clipping escape and accurate coordinates, with unchanged Content parent and live Angular bindings. No consumer relocation workaround counts as this proof.
- Initial true/false server nodes retained with unchanged parent through eager/deferred hydration, including reverse sibling hydration order and live bindings after close/reopen.
- Initial SSR marker/settled phase preservation despite native closed display; preparatory opening versus entering attribute; coordinate/reveal-write-before-animation-discovery; no unpositioned paint; autofocus during preparation and close/reopen reentry; finite exit with `:popover-open` retained until completion, including zero/no/infinite animation and destruction.
- Trusted pointer gesture and deferred interaction replay, exactly-once model output, nesting/veto, reentrant focus/model listeners and focus eligibility.
- Native `beforetoggle` cancellation with defined retained phase/retry conditions and later nonvisual close; queued/coalesced `toggle`; synchronous focus/listener owner replacement; actual native ordering through retained-exit reopen; and safe one-time native hide cleanup. No native event writes the desired model.
- Forward/backward Tab without source association, consumer autofocus once per fresh activation, no generic autofocus, and no repeated autofocus when reusing an exit before hide starts. Reopen from closing `beforetoggle` preserves intent but proves a fresh post-hide activation rather than falsely reusing the disappearing promotion.
- Complete public TSDoc, including placement types/fields, factory migration, authored keyboard order, native activation versus paint readiness and pre-hydration visibility; documentation survives declaration packaging.

## What loozo would operate or maintain

One positioning dependency, three typed Content settings, native manual presentation and the existing Origami behavior. Content stays where authored. No global overlay provider, portal root, structural stylesheet import, alternate presentation fallback, generator or new authoring template.

Native top-layer order replaces the inline proposal's consumer clipping/stacking compromise; ordinary z-index does not control it. This does not certify arbitrary modal-dialog/fullscreen interoperability. Top-layer painting does not escape inherited inertness or modal focus rules; author inside the appropriate native owner when needed and qualify that specific integration separately.

## Alternatives and evidence

**CDK non-native Overlay + TemplatePortal:** useful when automatic body-layer rendering is required, but it changes the Content rendering/API boundary and needs custom SSR ownership investigation. At inspected Angular components commit `7e73582615a66007462bd91496720d822b720b56`, `OverlayContainer._createContainer()` removes server-marked containers when the browser creates its container; `DomPortalOutlet.attachTemplatePortal()` creates a view and re-appends its root nodes into the outlet. The default path is not evidence of unchanged-parent SSR hydration. CDK's Portal documentation also warns that moving existing Angular content with DomPortal may prevent its bindings/directives from updating. These observations do not prove every possible custom CDK integration impossible.

**Handwritten positioning:** avoids a dependency but makes Origami own containing-block coordinates, RTL, observer lifetimes and browser edge behavior already addressed by a maintained primitive. Not recommended for the current concrete need.

**Inline-only Floating UI:** avoids the native timing gate but loses top-layer escape and native autofocus. Superseded by the selected hybrid direction, not retained as a fallback.

**Native CSS anchors/Popover source behavior:** basic manual presentation does not require either newer capability. Their separate Baseline gaps do not justify discarding the older top-layer API; both remain excluded.

Floating UI source inspected at `dc62df23d72ad96d456c007d48d4541786fcd7eb`: DOM entrypoint, autoUpdate, top-layer offset-parent/clipping utilities, and computePosition/flip documentation. WHATWG HTML source inspected at `ba3400bb4f3d86477a5c8cfc07ff91fc0caaf21c`: manual mode, native show/hide validity and reentry checks, autofocus steps, coalesced toggle tasks and default Popover rendering. Public source checkouts were read, not executed. The separately authorized seed now has genuine installed dependencies; source reasoning and setup smoke tests do not prove the proposed Origami Angular/native/geometry schedule.

## Agreement and remaining gates

On 2026-10-11, loozo explicitly chose **“Approve the design; continue acceptance preparation.”** That approves authored-in-place Content + native manual top layer + private Floating UI positioning, including Content Options migration, authored Tab order without source association, native autofocus before paint readiness, private Presence coordination/refined entering-attribute timing, retained native exit/reopen ordering, the limited update boundary and initially unavailable pre-hydration presentation.

The API and independent public acceptance preparation were reconciled and reviewed. loozo subsequently instructed us to ignore the Baseline audit and chose **“Freeze and prepare the seed”** on 2026-10-11. That freezes the complete API/behavior and acceptance requirements and authorizes isolated genuine dependency setup plus one implementation-free seed commit on branch `rebuild` in `/home/loozo/Projects/origami-ui-rebuild`. It makes no Baseline eligibility claim and grants no product implementation or publication authority.

Two filesystem-read-only inspections challenged the concrete focus/exit/ownership/hydration risks. Their hide-start and completion-gating findings were corrected, and fresh followup found no concrete contradiction. Browser/packaging qualification remains unexecuted. Contract freeze is complete; verified implementation-free seed/handoff setup still precedes any explicitly authorized fresh single-main-session delegated rebuild.
