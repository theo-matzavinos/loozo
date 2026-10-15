# @loozo/origami-ui — product contract

**Status: 0.0.1 published to npm on 2026-10-15, qualified on Angular 22.2.2 in Chromium, Firefox and WebKit. Formal Baseline audit skipped; no Baseline certification claim.**

This is the normative contract for the public API, behavior, composition architecture and acceptance requirements of `@loozo/origami-ui`; Popover's presentation design is specified in [SPEC-POPOVER.md](SPEC-POPOVER.md). A change to any of them updates this contract in the same change. How the package was rebuilt and moved into loozo is recorded in [PROVENANCE.md](PROVENANCE.md). No formal Baseline qualification claim is made; full browser/runtime proof is mandatory.

## 1. Product scope

An Angular headless primitive library containing Collection, Presence, Collapsible, single/multiple Accordion and Popover, with public utilities for deferred injection and generated identity. It is proved through handwritten consumers using public package imports, including consumer-owned directives composed through `hostDirectives`.

Decisions:

- The catalogue grows one consumer-backed primitive at a time, as section 14 describes.
- TSDoc across the whole public API surface is a hard, release-blocking requirement, including public members and provider helpers.
- Public API names, selectors, entrypoints, inputs, outputs and composition contracts are the ones this contract specifies; changing one updates this contract.
- Chromium, Firefox and WebKit runtime qualification is mandatory. The formal Baseline audit was explicitly skipped on 2026-10-11 and is not a release gate; no Baseline widely-available certification claim is made.
- `hiding="until-found"` is an explicitly approved progressive enhancement: native find-to-reveal where supported, ordinary hidden behavior elsewhere, without a polyfill.
- Require real development and production serving, eager hydration and incremental/deferred hydration.
- Preserve the `injectUniqueId(key)` signature, but generated identity is opaque. Exact spelling and construction-order counter sequencing are deliberately no longer public guarantees.
- Popover uses the proven Options/Context/State and consumer-composition architecture. The approved design is authored-in-place Content + native manual top-layer presentation + private Floating UI positioning, excluding CSS anchors and `{ source }`. There is no alternate presentation fallback. Section 11 records the skipped formal Baseline audit without claiming qualification.

## 2. Consumer and ownership model [P]

Origami supplies behavior, reactive configuration, relevant host semantics and lifecycle. Consumers supply markup, roles where domain-dependent, accessible names, styling, content, dimensions, scrolling and animations.

A representative existing consumer:

```ts
import { Component, signal } from "@angular/core";
import {
  OrigamiAccordionSingle,
  OrigamiAccordionItem,
  OrigamiAccordionTrigger,
  OrigamiAccordionPanel,
} from "@loozo/origami-ui/accordion";

@Component({
  selector: "account-sections",
  imports: [
    OrigamiAccordionSingle,
    OrigamiAccordionItem,
    OrigamiAccordionTrigger,
    OrigamiAccordionPanel,
  ],
  template: `
    <section ogAccordionSingle [(value)]="selected" [collapsible]="true">
      <article ogAccordionItem value="billing">
        <h2><button ogAccordionTrigger>Billing</button></h2>
        <div ogAccordionPanel role="region">Consumer-owned billing content</div>
      </article>
    </section>
  `,
})
export class AccountSections {
  readonly selected = signal<string | null>(null);
}
```

The library does not generate application components or impose a visual theme. Proof consumers default to dark mode; this is consumer presentation, not a library theme API.

## 3. Preserved architecture [O]

```text
Consumer directive / component
    │ hostDirectives + typed Options replacement
    ▼
Primitive directive
    │ owns inputs, model defaults, outputs and host bindings
    ▼
Options token ─────► private Context
                       │ behavior, registration and lifecycle
                       ▼
                  readonly State
                       │ injectable by consumers and descendants
                       ▼
                    consumer
```

### Configuration

Each configurable primitive or part has its own Options token, signal properties, inputs and defaults. Options are substitutable using typed `provideExisting(() => Token)` and `provideFactory(() => options)` helpers.

`provideExisting` accepts forward references to compatible concrete or abstract provider classes where applicable. Factories execute in Angular injection context. Their result must structurally satisfy the selected Options contract; wrong signal value types or missing required properties fail TypeScript checking.

Replacing Options replaces the effective configuration as a whole. Behavior and host bindings must use resolved Options, not silently fall back to the directive's own defaults. A factory may supply ordinary Angular writable signals instead of model signals. Such writes do not fabricate outputs from an unused directive model.

Upper primitives adapt lower Options to upper **Options tokens**, not to upper directive instances. Replacing only Accordion Trigger Options must drive the composed Collapsible Trigger ID and association without requiring consumers to provide lower Options. The same rule applies to other composed boundaries.

### Context and State

Context is private and owns behavior. State is a concrete, locally provided, readonly facade. State is not auto-provided at application scope, and must not expose writable mutation aliases.

Direct selectors and `hostDirectives` composition expose equivalent behavior. Descendants observe the nearest logical Angular DI owner. Nested roots have independent Context and State instances; consumers under one root share that root's State instance.

Locally provided injectable classes use Angular `@Service({ autoProvided: false })`; application services use appropriate `@Service` configuration. This preserves the established Angular architecture. Actual supported APIs must be checked against the selected dependency version.

### Registration and teardown

Element construction registers each mounted role with its nearest Context. Registration methods needing DI execute synchronously in the caller's injection context and own caller-scoped `DestroyRef` cleanup.

Aliased Options resolve only after construction, when inputs/providers can be read safely. Registration must not eagerly resolve the directive under construction. `injectDeferred` preserves the originating injector for later reads.

Unregistering a part removes only its own registration. A stale animation, pointer gesture, focus callback or native/application event must not write into a destroyed or replacement owner.

### Composition

```text
Accordion root ──► Collection
Accordion item ──► Collection Item + Collapsible
Accordion trigger / panel ──► Collapsible trigger / panel
Collapsible panel ──► Presence
Popover content ──► Presence
```

Single/multiple selection are concrete behavior variants, not an extensible public strategy framework. There is no public generic overlay stack, state engine or registration framework.

## 4. Public package and type surface [E]

The root import remains valid and empty. Behavior is imported from secondary entrypoints; no source-path imports are consumer API.

| Entrypoint     | Public symbols                                                                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/utils`       | `injectDeferred`, `injectUniqueId`                                                                                                                                                                                                                                                                                             |
| `/collection`  | `OrigamiCollection`, `OrigamiCollectionState`, `OrigamiCollectionItem`, `OrigamiCollectionItemOptions`, type `OrigamiCollectionRecord`                                                                                                                                                                                         |
| `/presence`    | `OrigamiPresence`, `OrigamiPresenceOptions`, `OrigamiPresenceState`, type `OrigamiPresencePhase`                                                                                                                                                                                                                               |
| `/collapsible` | `OrigamiCollapsible`, `OrigamiCollapsibleOptions`, `OrigamiCollapsibleState`, `OrigamiCollapsibleTrigger`, `OrigamiCollapsibleTriggerOptions`, `OrigamiCollapsiblePanel`, `OrigamiCollapsiblePanelOptions`, type `OrigamiCollapsibleHiding`                                                                                    |
| `/accordion`   | `OrigamiAccordionSingle`, `OrigamiAccordionSingleOptions`, `OrigamiAccordionMultiple`, `OrigamiAccordionMultipleOptions`, `OrigamiAccordionOptions`, `OrigamiAccordionState`, `OrigamiAccordionItem`, `OrigamiAccordionTrigger`, `OrigamiAccordionTriggerOptions`, `OrigamiAccordionPanel`, `OrigamiAccordionPanelOptions`     |
| `/popover`     | `OrigamiPopover`, `OrigamiPopoverOptions`, `OrigamiPopoverState`, `OrigamiPopoverTrigger`, `OrigamiPopoverTriggerOptions`, `OrigamiPopoverAnchor`, `OrigamiPopoverAnchorOptions`, `OrigamiPopoverContent`, `OrigamiPopoverContentOptions`, `OrigamiPopoverContentState`, type `OrigamiPopoverSide`, type `OrigamiPopoverAlign` |

The inventories include the approved Popover placement exports and four-property Content Options. ID-only Content factories must migrate; Trigger/Anchor Options remain ID-only.

The Accordion entrypoint also exposes `ɵOrigamiAccordionRoot` for compiled composition. Preserve whatever export visibility Angular packaging requires; it is not a supported application authoring API. Removing its importability is a deliberate API change made through this contract, not a side effect of a refactor.

Built packaging must support genuine Angular AOT consumers, strict templates and TypeScript package resolution, with shared token identities across entrypoints. No fake Angular decorators or shimmed framework runtime.

### Public API TSDoc — mandatory [D]

Every public API declaration and consumer-facing member must have meaningful TSDoc: exported classes, functions, interfaces and type aliases; directive inputs/models and their output contracts; Options properties and provider helpers; State signals; public methods and record members. Inherited documentation may be shared where the contract is unchanged, but mode-specific or overridden behavior must be documented explicitly. Compiler-required exports must be documented as internal rather than presented as supported application APIs.

Documentation explains purpose and observable behavior, not merely the symbol's name or TypeScript type. As applicable, cover defaults, parameters and return values, readonly versus writable ownership, injection-context requirements, composition/Options substitution, errors, lifecycle and hydration semantics, and browser limitations. Include concise consumer examples where usage is not self-evident.

TSDoc must remain available in the published declarations for editor/package consumers and agree with this contract. A README or separate documentation site does not substitute for declaration-level documentation; a documentation site is not required.

Acceptance reviews the complete public export/member inventory against authored TSDoc and the built declarations. Missing, misleading or stripped public API documentation blocks completion just as a missing behavior contract does.

### Configuration and observation shapes

`Signal<T>` below is readonly observation; `WritableSignal<T>` is an intentional mutation/configuration capability.

| Options                                                                     | Required properties                                                                                                   |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Presence                                                                    | `present: Signal<boolean>`                                                                                            |
| Collection Item                                                             | `value: Signal<string>`                                                                                               |
| Collapsible                                                                 | `expanded: WritableSignal<boolean>`, `disabled: Signal<boolean>`, `hiding: Signal<'hidden' \| 'until-found'>`         |
| Accordion shared                                                            | `disabled: Signal<boolean>`                                                                                           |
| Accordion Single                                                            | shared + `value: WritableSignal<string \| null>`, `collapsible: Signal<boolean>`                                      |
| Accordion Multiple                                                          | shared + `value: WritableSignal<readonly string[]>`                                                                   |
| Popover root                                                                | `open: WritableSignal<boolean>`, `disabled: Signal<boolean>`, `dismissible: Signal<boolean>`                          |
| Each Collapsible/Accordion Trigger or Panel; each Popover Trigger or Anchor | its own Options token with `id: Signal<string>`                                                                       |
| Popover Content                                                             | `id: Signal<string>`, `side: Signal<OrigamiPopoverSide>`, `align: Signal<OrigamiPopoverAlign>`, `gap: Signal<number>` |

| State           | Readonly signals                                                                       |
| --------------- | -------------------------------------------------------------------------------------- |
| Collection      | `items: Signal<readonly OrigamiCollectionRecord[]>`                                    |
| Presence        | `phase: Signal<'opening' \| 'open' \| 'closing' \| 'closed'>`, `open: Signal<boolean>` |
| Collapsible     | `expanded: Signal<boolean>`, `disabled: Signal<boolean>`                               |
| Accordion       | `itemValues: Signal<readonly string[]>`, `disabled: Signal<boolean>`                   |
| Popover root    | `open: Signal<boolean>`, `disabled: Signal<boolean>`, `dismissible: Signal<boolean>`   |
| Popover Content | `open: Signal<boolean>`; no public Presence phase alias                                |

Popover Content inputs default to `side: 'block-end'`, `align: 'start'`, `gap: 0` CSS px. Side is `'block-start' | 'block-end' | 'inline-start' | 'inline-end'`; align is `'start' | 'center' | 'end'`. Gap must be finite and nonnegative. All four Content Options properties are required; defaults on an unused directive do not repair an incomplete replacement.

State signals reject `.set` and `.update` at compile time. Shared Accordion Options do not contain mode-specific `value` or `collapsible`; Multiple Options do not contain Single's `collapsible` property.

## 5. Utilities and identity [I]

```ts
injectDeferred<T>(token: ProviderToken<T>): () => T;
injectUniqueId(key: string): string;
```

Both functions require Angular injection context when called. Deferred resolution is callable outside injection context afterward, uses the captured nearest injector and does not resolve the token at capture time.

Generated identities are stable for a mounted instance, unique within an application's relevant identity namespace, and independent of consumer-bound DOM IDs. Their spelling and allocation sequence are opaque. Consumers requiring persistent domain identity supply explicit item values and IDs.

**Implementation-time amendment, explicitly approved by loozo:** SSR identity matching is guaranteed for element-host calls only. Calls without an element host remain valid in any Angular injection context and produce application-local unique, mounted-stable identities, but consumers must not rely on them matching IDs bound into SSR DOM. No scope-provider API is added; `injectUniqueId(key)` is unchanged.

For element-host calls, server and client must agree on generated identities for SSR nodes reused during hydration. Hydrating sibling blocks in a different order must not change their IDs, generated item values or private positioning associations, or introduce duplicates alongside still-dehydrated siblings. Explicitly bound and static DOM IDs must remain authoritative and reactive.

Independent application injectors must not share mutable allocation state accidentally. Uniqueness across multiple independent Angular applications in the same document is not promised by this contract; consumers must coordinate explicit identity across such applications.

The identity implementation is not specified here. A plain per-key construction counter is insufficient evidence for the deferred-order contract. No requirement to use transfer state, an ID service protocol or Angular private hydration metadata is implied.

## 6. Collection [C]

Selectors and template export names:

- `[ogCollection]`, `exportAs: 'ogCollection'`.
- `[ogCollectionItem]`, `exportAs: 'ogCollectionItem'`.

An item has a readonly `value` input defaulting to a generated stable string. Its public record contains `value: Signal<string>`; consumers do not receive writable registration collections.

Collection State reports mounted items in rendered DOM order, not registration/construction order. Keyed moves, insertion and removal update order after the corresponding render. Value changes remain observable without destroying an item. SSR must produce valid collection observation without requiring browser globals or browser-only render callbacks.

Each item belongs to the nearest Collection DI context, including composition through host directives. Mounting an item without a Collection owner fails clearly. Nested collections do not contribute their items to their ancestor collection.

Collection does not supply keyboard navigation, roving tabindex, selection, a role or item semantics. Item values are opaque; Collection does not normalize them against another registry.

## 7. Presence [R]

Selector `[ogPresence]`, `exportAs: 'ogPresence'`. `present` is a boolean model defaulting to false, with Angular's corresponding model output. The directive exposes readonly `state`.

Presence observes desired presence; it does not itself hide, detach, portal or remove its host. Consumers and composed primitives use `state.open()` to retain gated children through exit.

```text
present becomes true  → opening → open
present becomes false → closing → closed
```

`state.open()` is true during opening, open and closing, and false when closed. Reversals invalidate earlier completion work.

Host attributes are independently observable, empty when active and absent otherwise:

- `data-entering` during opening.
- `data-present` during open.
- `data-leaving` during closing.

No generic `data-state` replacement is introduced. The attributes above describe immediate direct-Presence/Collapsible timing. The approved Popover-only presentation adapter permits a preparatory `opening` interval before `data-entering`; entering attributes and completion discovery wait for its matching coordinate/reveal commit. Visible exit discovery follows its own leaving WRITE without a new geometry prerequisite; nonvisual close settles without reveal/discovery. See section 11 and the approved design.

### Animation completion

On the browser, discover host animations after relevant host bindings, rendered children and presentation/visibility writes have taken effect. Render WRITE precedes discovery READ; registration order alone is not proof of hydration completion.

Wait for finite host animations discovered for that transition. Completion or cancellation settles those animation waits. Ignore infinite animations; finite peers still determine completion. No animations and zero-duration animations settle normally without a duration guessing timer.

A stale completion, cancellation or scheduled render read cannot settle a reversed transition or mutate a destroyed owner. Concurrent direct and composed hosts remain independent.

Consumer CSS owns reduced motion. When reduced-motion styles remove animations, the transition settles without one. No universal animation duration or global reduced-motion style is supplied.

### Server and hydration

SSR settles desired presence without invoking browser animation APIs. Initially-present gated content is in server HTML; initially-absent gated content is not. Unconditional consumer children remain present in both cases.

Eager and deferred hydration reuse applicable SSR nodes without temporary removal/recreation merely because the new client Context initially evaluates absent. Browser render callbacks are not a hydration barrier. An initially-present host does not replay an entrance animation solely because hydration attaches behavior.

## 8. Collapsible [L]

Selectors/export names:

- `[ogCollapsible]`, `exportAs: 'ogCollapsible'`.
- `button[ogCollapsibleTrigger]`.
- `[ogCollapsiblePanel]`, `exportAs: 'ogCollapsiblePanel'`.

Root configuration: `expanded` boolean model false, `disabled` boolean input false, `hiding: 'hidden' | 'until-found'` input default `'hidden'`. Root exposes readonly State. Root `data-expanded` and `data-disabled` reflect effective Options.

One mounted trigger and one mounted panel are supported per Collapsible. Missing counterparts are allowed and remove their association attributes. A second mounted role fails clearly. Unmount/remount cleanup preserves the surviving and replacement registrations.

Trigger:

- Native button semantics, `type="button"`, no custom keyboard reimplementation of Enter/Space.
- Effective ID from Trigger Options.
- `aria-expanded` reflects desired expanded state.
- `aria-controls` identifies only the currently mounted panel.
- Root disabled state sets native `disabled`, `aria-disabled="true"`, and empty `data-disabled`; inactive attributes are absent where appropriate.
- `data-expanded` reflects desired expanded state.
- An enabled click toggles expanded; a disabled user action cannot write it.

Panel:

- Effective ID from Panel Options and `aria-labelledby` pointing only to its mounted trigger.
- `data-expanded` follows desired expanded state, not Presence retention.
- Composes Presence; remains unhidden through finite exit, then becomes hidden when Presence closes.
- Default collapsed hiding is ordinary `hidden`.
- `until-found` uses native reveal only where supported; elsewhere it behaves as ordinary hidden content. In supported engines, enabled `beforematch` requests expansion. Disabled state blocks that request, and repeated reveal requests are idempotent.

The consumer supplies any `role="region"`, heading hierarchy and accessible content semantics. External root Options/model writes remain authoritative even when user interaction is disabled.

## 9. Accordion [A]

Selectors/export names:

- `[ogAccordionSingle]`, `exportAs: 'ogAccordionSingle'`.
- `[ogAccordionMultiple]`, `exportAs: 'ogAccordionMultiple'`.
- `[ogAccordionItem]`, `exportAs: 'ogAccordionItem'`.
- `button[ogAccordionTrigger]`.
- `[ogAccordionPanel]`.

Single root: `value: string | null` model null; `disabled` false; `collapsible` false. Multiple root: `value: readonly string[]` model empty; `disabled` false. Mode value/output typing remains distinct.

Item: `value` input default generated string, `disabled` false, `hiding` default `'hidden'`. It composes Collection Item and Collapsible. Consumers use distinct explicit values when items need independent selection.

Single behavior:

- Selecting an unselected enabled item replaces the selected value.
- An enabled selected item can clear to null only when `collapsible` is true.
- A selected non-collapsible trigger is `aria-disabled="true"` but remains a focusable, natively enabled button unless root/item disabled state also applies.
- External values need not name a currently mounted item. Do not coerce unknown values to null or auto-select a first item.

Multiple behavior:

- Toggle adds an absent value at the end of a new array, or removes the toggled value without mutating the caller's array.
- Preserve other values and their order, including values with no mounted item.
- External values remain authoritative; removal of an item does not prune its selection.

Root and item disabled state combine reactively. Trigger and native reveal paths obey that combined state. An item under no Accordion owner fails clearly.

The item's effective Collapsible expanded signal observes root selection; requests to write it route through the mode's actual behavior and disabled/collapsible policy. Idempotent writes must not cause duplicate model outputs. A synchronous root output listener may change selection; the item's next observation must reflect that actual selection, not an optimistic shadow value.

Trigger/Panel Options replacement flows into the corresponding Collapsible Options. IDs, associations, hiding and Presence behavior inherit Collapsible's contracts. Accordion State reports current mounted item values in Collection order.

The consumer supplies headings and optional panel roles. No roving tabindex, arrow-key navigation or focus manager is added; native buttons provide the mandatory activation semantics.

## 10. Popover retained behavior [V]

**This section preserves product behavior, not the superseded CSS-anchor/source-associated positioning mechanism. Basic native manual presentation and Content configuration/lifecycle follow the approved hybrid design in section 11.**

Root `[ogPopover]`, `exportAs: 'ogPopover'`: `open` boolean model false, `disabled` false, `dismissible` true. Root State `open()` observes requested state, not exit retention or actual presentation.

Trigger remains a native `button[ogPopoverTrigger]`. Explicit Anchor, Trigger and Content roles are required for presentation. Support one mounted instance of each role; Trigger and Anchor may share one element. Duplicate role registration fails clearly, while co-location is not a duplicate role.

Missing required parts suppress presentation without clearing desired open. Remounting parts can restore presentation from retained intent. Parent suppression also retains child intent. Parts and nested popovers belong to nearest logical DI owners. Native manual presentation changes their paint layer, not their authored DOM location.

Every part retains its own typed substitutable Options. Shared Trigger/Anchor uses Trigger Options as its effective DOM ID; a standalone Anchor uses its own Options ID. Private positioning identity is independent of these public IDs.

Trigger binds effective ID, `type="button"`, disabled semantics, mounted content `aria-controls`, and actual participation via `aria-expanded`. Enabled click toggles/request-closes; disabling prevents trigger activation but does not override authoritative model writes or automatically disable Escape/outside dismissal.

Content retains children through Presence's finite exit. Content State `open()` directly reflects Presence retention, not a separately writable alias. Once dismissal is accepted, exiting content stops participating in interaction and cannot remain a focus target merely because its animation retains it.

### Dismissal and nesting

- Escape targets the topmost participating Origami Popover. Already-consumed and composing key events are ignored. A veto consumes that request; it must not fall through to another root or ancestor.
- An outside-pointer dismissal requires a trusted primary-button gesture whose down and matching up are outside the affected branch. A drag starting inside and ending outside does not dismiss. Prevented down or up events and mismatched pointer/button invalidate the gesture. Cancellation or lost capture before the matching pointerup invalidates acquisition; cancellation or capture loss after that pointerup does not veto the completed gesture. Dismissal is deferred until the pointerup dispatch has finished so later listeners can prevent that up event, and the affected branch must still be current when dismissal runs.
- A nested descendant counts as inside its ancestor for outside detection.
- A user dismissal request closes an affected branch only if every requested-open member permits it. The root's own trigger may bypass its own dismissible flag, but cannot bypass a protected descendant.
- Veto performs no partial branch model writes or outputs.
- Accepted branch model writes proceed descendant before ancestor. Reentrant model/output listeners may reopen, replace or destroy a branch; remaining stale operations must not overwrite those newer decisions.
- A script/model close is authoritative, independent of dismissal permission. It suppresses descendants without erasing their open intent.
- Unrelated roots can coexist. Opening one does not automatically close another.
- A pointer acquired before a branch changes cannot later dismiss its replacement, including when another root's output listener changes that branch during the same event.

### Focus and accessibility

- Non-modal: no focus trap, page scroll blocking, blanket autofocus or automatic close on focus departure.
- Escape restores focus to the relevant live trigger once when eligible. Outside-pointer dismissal preserves the user's outside focus.
- Script close restores focus only if focus is inside that closing branch; it must not steal focus already moved elsewhere. Suppressing nested focused content restores the owning closing trigger once, not each descendant trigger in turn.
- Never restore focus to disconnected, destroyed, disabled or inert triggers, or use a stale snapshot after a listener moves focus.
- Preserve usable forward/backward keyboard navigation between trigger, content and surrounding page. The approved hybrid uses normal authored document order without a source association or Tab bridge; prove that explicitly rather than assuming ARIA creates native source ordering.
- Preserve consumer-declared native autofocus through basic manual activation; add no generic autofocus manager. The design keeps preparation focus-eligible and grants participation after successful native activation, before geometry reveal, so autofocus reentry and early Escape remain owned.
- Consumers own content role, name and any domain-specific menu/listbox behavior. Generic Popover does not pretend to be a menu, dialog or select control.

### Positioning and consumer styling

The approved product is an explicitly anchored, non-modal floating surface, defaulting to logical block-end with start edges aligned. Logical side/alignment/gap are reactive Content Options. The private adapter's explicit main-side/cross-alignment flip candidates and actual best-fit semantics, nested/document scroll, resize and observed-layout tracking follow the approved design; no universal fit or continuous transform-animation tracking is promised.

Consumers own dimensions, min/max sizes, box sizing, overflow, spacing, appearance and animation. There is no universal fit guarantee for arbitrary oversized content and no promise of staying visible once an anchor leaves view.

LTR/RTL and clipping escape remain proof cases. The old CSS anchor/position-area settings are replaced by the approved typed Content placement inputs. Content stays inside authored transformed/clipped ancestors and escapes clipping through the native top layer. Preserve the closed native display rule by scoping custom host `display` layouts to `:popover-open`.

## 11. Approved hybrid design and skipped Baseline audit [B]

**Design/API/lifecycle approved on 2026-10-11; shipped in 0.0.1.**

The approved design is [authored-in-place Content + native manual top layer + private Floating UI positioning](SPEC-POPOVER.md). The persistent Content element survives, stays under its authored parent and escapes clipping through native presentation without a portal. Native basic presentation is separate from newer CSS anchors and `{ source }`, both excluded. The earlier inline-only consumer clipping/stacking compromise is withdrawn, not retained as a fallback.

The approved details include:

- Content `side`, `align`, `gap` inputs and typed Options members, with explicit migration for ID-only replacement factories.
- Logical-axis mapping, exact `offset`/`flip` fallback policy and bounded automatic-update guarantees; consumer sizing/animation ownership stays intact.
- Native activation after owned children render, transparent focus-eligible measurement on the actual promoted host, and guarded coordinate/reveal commits before animation discovery. Initial SSR retained children and `data-present` survive while the native host starts closed.
- Consumer native autofocus without generic autofocus or source association; authored Tab order, not a replacement focus framework.
- Native top-layer retention through finite exit; immediate interaction relinquishment/inertness, current-only `hidePopover()` after completion, and reuse/order preservation if a retained exit reopens before native hiding starts. Reopening during native hiding preserves intent but requires fresh activation after the call returns, potentially with new autofocus/order.
- Stale/coalesced native events and synchronous focus/`beforetoggle` reentry cannot write desired state or overwrite a new owner.
- Real eager/deferred SSR-node retention, live Angular bindings and replay proof; native promotion itself does not move DOM nodes or prove hydration safety.

**Recorded support evidence, not a release gate:** inspected basic Popover attribute/show/hide/open-selector/event metadata has low date 2024-04-16, reaching the 30-month boundary on **2026-10-16**. On **2026-10-11**, that evidence did not establish widely-available eligibility, and loozo explicitly decided to skip the Baseline audit. No formal Baseline certification is claimed. The later-dated reflected `HTMLElement.popover` property remains excluded; use ordinary attribute APIs. The decision adds no presentation fallback or waiver of required runtime behavior.

No source inspection, skipped audit or design approval substitutes for the required browser proof in section 12.

## 12. Browser, SSR and hydration qualification [H]

### Browser support policy

The formal Baseline inventory/audit was skipped by explicit 2026-10-11 decision and is not a release gate. No formal widely-available certification or exact minimum-browser-version promise is made. Historical metadata remains evidence, not an executed support claim; feature detection alone is not a Baseline classification.

The approved `until-found` enhancement is optional and cannot be required for ordinary collapsed behavior. It retains ordinary-hidden degradation where unsupported. Skipping the audit is not a reason to add a general native-feature fallback or to weaken the three-engine/runtime requirements.

Pin and report actual qualification engine versions. Run required behavior in Chromium, Firefox and WebKit; do not equate Playwright WebKit with certification of every Safari/iOS release or simulated input with physical device testing. Exact minimum-version and physical-device promises require separate evidence.

### SSR and eager hydration

Use an actual Angular application, ordinary official build/serve paths, normal hydration providers and real development and production responses. No custom hydration bypass, `ngSkipHydration`, application-wide client rendering substitution or fabricated server DOM.

For initially-present/expanded/open and initially-absent/closed cases:

- Inspect raw SSR HTML and annotations before bootstrap.
- Save actual server node references before hydration, not only post-bootstrap selectors.
- Applicable hosts and children keep identity; track transient removal/duplication as well as final structure.
- Preserve IDs, associations and selection values.
- Observe successful hydration and absence of page/console hydration errors; application stability alone is insufficient proof.
- Prove close/reopen and consumer Options substitution afterward, in normal and reduced motion.

Popover's approved node-location assertion is unchanged host and applicable child identity under the same authored parent, through native promotion and hydration. It cannot waive node retention by silently rendering its SSR content client-only.

### Incremental/deferred hydration

Use real authored `@defer` hydration boundaries, not merely enable hydration providers. Cover at least:

- Initially-present content under a deferred owner: remains intact while dehydrated and when behavior attaches.
- Initially-absent content: does not materialize merely because its owner hydrates.
- Sibling blocks hydrated in reverse server-construction order, with repeated identity keys and still-dehydrated siblings remaining in DOM.
- Nested root/part boundaries: mounting and suppression do not erase retained intent or attach to the wrong Context.
- Interaction-triggered hydration and Angular event replay: the initiating button action reaches the effective model exactly once, without stale dismissal or duplicate output.
- Deferred block destruction/remount and pending Presence completion: no writes to dead or replacement owners.
- Production-runtime parity with eager cases, across all three required engines.

Use supported Angular APIs. No contract requiring application code to consume private Angular hydration metadata is introduced. The selected Angular version's actual replay/lifecycle behavior must be inspected before specifying exact event coverage.

## 13. Acceptance structure [T]

This is the public-contract coverage map. Case definitions and handwritten consumers live in [acceptance](acceptance/README.md); [tests/acceptance](tests/acceptance/README.md) executes them against the packed package. 0.0.1 passed the full gate at `6f898e7` (2,928/2,928 across Chromium/Firefox/WebKit × development/production × eager/incremental hydration).

| Group         | Observable proof                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-Package     | Built entrypoints; no accidental root exports; strict TS/AOT/template consumers; token identity; readonly State and mode/provider negative types                            |
| T-Docs        | Complete public declaration/member TSDoc; accurate defaults, ownership and constraints; applicable examples; documentation retained in built declarations                   |
| T-Composition | Direct and host-composed consumers; upper existing/factory Options substitutions; nearest/nested State sharing; no premature injection                                      |
| T-Identity    | Native static/bound IDs; reactive association updates; mounted-only links; application isolation; reordered deferred hydration identities                                   |
| T-Collection  | Addition/removal/keyed movement; reactive values; nearest-owner isolation; valid SSR ordering                                                                               |
| T-Presence    | Finite completion/cancellation; no/zero/infinite animation; reduced motion; reversal; concurrent hosts; destruction; real write-before-read observation                     |
| T-Collapsible | Enabled/disabled activation; Presence-retained hiding; native/progressive until-found behavior; role cardinality and remount                                                |
| T-Accordion   | Single/multiple contracts; unknown values; immutable array toggles; combined disabled; non-collapsible focusability; factory writable signals; exactly-once outputs/reentry |
| T-Popover     | Required parts; co-location; nesting/veto; trusted pointer lifetime; topmost Escape; reentry; focus eligibility; exit interaction; layout ownership and tracking            |
| T-Hydration   | Development/production serving; eager/deferred node retention; no transient duplication; generated identity; event replay; post-hydration interaction                       |
| T-Support     | Skipped formal Baseline audit recorded without certification; optional enhancement degradation; explicit Chromium/Firefox/WebKit runtime evidence and stated limits         |

Acceptance tests use public imports and genuine dependency behavior, not private Context methods or fake Angular APIs. Real animation/native platform claims need real browser observations; jsdom units alone cannot prove geometry, trusted input, focus or hydration.

A change to a requirement updates its cases and assertions in the same change. Test cases may not invent semantics this contract leaves unresolved. No full router-style evaluator framework is assumed necessary.

## 14. Scope, growth and exclusions [X]

The catalogue grows one consumer-backed primitive at a time. A concrete consumer need justifies a primitive; its frequency in other libraries does not. Each new primitive adds its own section to this contract, with acceptance cases and gate coverage, before or with its implementation (section 16).

- Shared interaction infrastructure stays package-private: ordered focus/roving navigation, typeahead, active-descendant, layer/dismiss participation, hover/focus intent and modal containment.
- Form-control primitives integrate with Angular Signal Forms. There is no `ControlValueAccessor` layer.
- A modal Dialog builds on native `<dialog>` and `showModal()`. Origami owns light dismiss itself where `dialog[closedby]` is unavailable.

Non-goals:

- Styled components, themes or a design-token system.
- A public generic overlay platform, focus-management framework or strategy extension system.
- Speculative interaction variants.
- Universal oversized-content containment, arbitrary native top-layer interoperability or exact Safari/iOS certification without evidence.
- Preserving accidental private source layout, historical evaluator machinery or existing test counts as a product contract.

Intentional agreed changes from the archive, recorded from the rebuild:

1. Generated IDs/item defaults become opaque and hydration-stable rather than exact per-key counters.
2. `until-found` becomes explicitly capability-dependent, with ordinary-hidden degradation elsewhere.
3. Popover replaces CSS-anchor/source-associated positioning with approved native-manual + Floating UI presentation, authored Tab order, typed side/align/gap Content configuration and coordinated native/Presence timing. ID-only Content Options factories migrate to four required properties. The formal Baseline audit is explicitly skipped without a certification claim.
4. Qualification expands from demonstrated Chromium/development eager hydration to three engines and development/production eager/deferred runtime proof.

Changing shipped behavior or public API is a deliberate change to this contract. Compatibility is the default, not permission to preserve a demonstrated bug or to weaken a guarantee silently.

## 15. Extraction source and dependency research

Extraction source: `loozo` branch `archive/pre-router-rebuild`, exact commit `363af0c3f1c3edefbf4e9f72269e0a0b4a8ad9f7`.

The archive's package AGENTS and public consumers establish the Options/Context/State, host-directive composition and deferred-registration decisions. Its source/tests establish the extracted behavior above; untested corners are not converted into compatibility claims.

The archived Presence consumer documentation says Gate A was accepted/integrated. Gate B says its retained Popover checks passed but independent/main review and user acceptance were pending. These are historical records, not this package's verification. The old geometry limits were not fixed merely by narrowing its consumer sizing contract.

Authoritative dependency/support research:

- Official Angular tag `v22.1.5`, commit `468b65b74566537456c192ac4281795c5a1e1a5e`, and installed official package declarations/source: hydration/replay defaults, deferred dependency constraints, host-directive construction/provider precedence, plus core `@Service`, linked-signal write interception, render phase ordering, browser-only render callbacks, hydration caveats and incremental-hydration defaults. This is the researched version, not a promise that every Angular 22 minor provides every used API.
- MDN browser-compat-data commit `483bb6cb636577da00fc0e3ed46372c88778d0cf` (2026-09-14): source-option support and anchor-positioning subfeatures. Metadata is not cross-engine runtime qualification.
- web-platform-dx/web-features commit `98723fd5c2e449453b549867f045f2b63ec5f50f` (2026-10-09): formal Baseline definition, required anchor subfeatures not widely available, and Safari's hidden-until-found gap. Whole-group status alone is not used to classify Origami's exact subset.
- Angular components source commit `7e73582615a66007462bd91496720d822b720b56` (2026-09-12): CDK Portal/Overlay documentation, including DomPortal binding warning, structural styles and configurable native promotion. An attempted `22.1.5` tag lookup did not resolve; no matching CDK release compatibility has been established.
- Floating UI source at `dc62df23d72ad96d456c007d48d4541786fcd7eb`: DOM positioning, flip/update behavior and native top-layer offset-parent/clipping handling. The approved hybrid depends on genuine `@floating-ui/dom@1.8.0`; its installed DOM/core/utils closure is 1.8.0/1.8.0/0.2.12. Installation does not qualify Origami behavior.
- WHATWG HTML source at `ba3400bb4f3d86477a5c8cfc07ff91fc0caaf21c`: manual mode, native focusing/show/hide checks, coalesced toggle tasks and closed-Popover default rendering. The basic attribute/API capability subset is distinct from the later reflected property and source option.

A filesystem-read-only inspector independently identified the Baseline conflict, until-found gap, construction-order identity risk and deferred Presence proof gap. Main disposition: support conflicts accepted as evidenced; hydration risks accepted as required proof/design questions, **not reproduced defects**. User decisions resolve the first three policy boundaries as recorded in section 1. Popover's hybrid design/API/lifecycle is approved as recorded in section 11; the formal Baseline audit was explicitly skipped. Runtime qualification follows section 12.

## 16. Adding a primitive

A new primitive ships with:

- Its own section in this contract, with its own section ID: selectors, export names, Options/State shapes, behavior, SSR/hydration semantics and exclusions, plus its rows in section 4's entrypoint and shape tables.
- Options → private Context → readonly State composition per section 3, including typed Options substitution and `hostDirectives` composition.
- Complete public TSDoc per section 4.
- SSR plus eager and incremental hydration per section 12.
- Chromium, Firefox and WebKit qualification in development and production.
- Acceptance cases in [acceptance/CASES.md](acceptance/CASES.md), a group in section 13's coverage map and assertions in the acceptance gate.
