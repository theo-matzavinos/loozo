# @loozo/origami-ui — product contract

**Status: 0.0.1 published to npm on 2026-10-15, qualified on Angular 22.2.2 in Chromium, Firefox and WebKit. Toggle (section 12), Tabs (section 13), ToggleGroup (section 14), Toolbar (section 15), RadioGroup (section 16), Button (section 17) and Tooltip (section 18) were added after 0.0.1 and are unreleased. Formal Baseline audit skipped; no Baseline certification claim.**

This is the normative contract for the public API, behavior, composition architecture and acceptance requirements of `@loozo/origami-ui`; Popover's presentation design is specified in [SPEC-POPOVER.md](SPEC-POPOVER.md). A change to any of them updates this contract in the same change. How the package was rebuilt and moved into loozo is recorded in [PROVENANCE.md](PROVENANCE.md). No formal Baseline qualification claim is made; full browser/runtime proof is mandatory.

## 1. Product scope

An Angular headless primitive library containing Collection, Presence, Collapsible, single/multiple Accordion, Popover, Toggle, Tabs, single/multiple ToggleGroup, Toolbar, RadioGroup, Button and Tooltip, with public utilities for deferred injection and generated identity. It is proved through handwritten consumers using public package imports, including consumer-owned directives composed through `hostDirectives`.

Decisions:

- The catalogue grows one consumer-backed primitive at a time, as section 21 describes.
- TSDoc across the whole public API surface is a hard, release-blocking requirement, including public members and provider helpers.
- Public API names, selectors, entrypoints, inputs, outputs and composition contracts are the ones this contract specifies; changing one updates this contract.
- Chromium, Firefox and WebKit runtime qualification is mandatory. The formal Baseline audit was explicitly skipped on 2026-10-11 and is not a release gate; no Baseline widely-available certification claim is made.
- `hiding="until-found"` is an explicitly approved progressive enhancement: native find-to-reveal where supported, ordinary hidden behavior elsewhere, without a polyfill.
- Require real development and production serving, eager hydration and incremental/deferred hydration.
- Generated element IDs (`injectUniqueId`) and generated value defaults (`injectUniqueValue`) are separate public utilities with the shapes and hydration semantics section 5 specifies.
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
    │ owns inputs, model defaults and host bindings; re-exposes State events as outputs
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

Every directive applications apply, directly or through `hostDirectives`, that has an input or model is configured through an Options token, with signal properties, inputs and defaults. A variant with the same inputs as another directive, such as a Toolbar group or a Toolbar control, uses that directive's token. Options are substitutable using typed `provideExisting(() => Token)` and `provideFactory(() => options)` helpers. Each helper returns one provider for the Options token. Consumers apply a primitive directly in a template or through `hostDirectives`; a replacement goes in the providers of the directive or component that composes the primitive, which Angular resolves after its host directives', so it wins over the primitive's own default. A consumer directive whose selector co-matches the primitive's on the same element is not supported.

`provideExisting` accepts forward references to compatible concrete or abstract provider classes where applicable. Factories execute in Angular injection context. Their result must structurally satisfy the selected Options contract; wrong signal value types or missing required properties fail TypeScript checking.

Replacing Options replaces the effective configuration as a whole. Behavior and host bindings must use resolved Options, not silently fall back to the directive's own defaults. A factory may supply ordinary Angular writable signals instead of model signals. Such writes do not fabricate outputs from an unused directive model.

Upper primitives adapt lower Options to upper **Options tokens**, not to upper directive instances. Replacing only Accordion Trigger Options must drive the composed Collapsible Trigger ID and association without requiring consumers to provide lower Options. The same rule applies to other composed boundaries.

### Context and State

Context is private and owns behavior. State is a concrete, locally provided, readonly facade. State is not auto-provided at application scope, and must not expose writable mutation aliases.

A directive applications apply that provides a State, or composes host directives that do (directly or through their own host directives), has an `exportAs` and exposes that State as a readonly `state` member. Internal `ɵ` composition directives, such as `ɵOrigamiAccordionRoot`, are exempt from both rules; the public directives that compose them carry the Options and expose the State.

Direct selectors and `hostDirectives` composition expose equivalent behavior. Descendants observe the nearest logical Angular DI owner. Nested roots have independent Context and State instances; consumers under one root share that root's State instance.

Locally provided injectable classes use Angular `@Service({ autoProvided: false })`; application services use appropriate `@Service` configuration. This preserves the established Angular architecture. Actual supported APIs must be checked against the selected dependency version.

### Events

Context exposes each event it exposes as an `Observable`, emitting synchronously where the event happens, so subscribers run under the same guards. State re-exposes it as a readonly `Observable`. The directive re-exposes it as an output with `outputFromObservable`.

This applies to exposed events only. Internal coordination between package-private parts may use plain calls, or RxJS where it helps.

Two-way state isn't an event. A directive `model()` maps to a `WritableSignal` on its Options, and the model's change output is exempt from this rule.

### Registration and teardown

1. **Render reads self, ancestors and registrations only.** A part's host bindings and `computed`s read the part's own Options, its ancestors' Options and State, and registrations other parts have made. They never read a sibling's Options directly. A reader therefore sees a counterpart that isn't registered yet as absent (no association attribute, not a tab stop), never as its default or unset inputs.
2. **Parts register in `ngOnInit`.** Construction registers nothing; it only captures what needs the part's injection context as fields (`ElementRef`, `DestroyRef`, Options deferred with `injectDeferred`). `ngOnInit` registers the part with its owner in one call, after Angular has set the part's inputs; it is used only for this. The owner attaches the part's removal to the part's `DestroyRef` as it registers it, so cleanup stays caller-scoped. A part whose view is destroyed before its `ngOnInit`, such as by a consumer hook earlier in the same view, never registers: the owner checks `DestroyRef.destroyed` first. A role limited to one mounted part fails when a second part registers.

Aliased Options resolve only after construction, when inputs/providers can be read safely. Registration must not eagerly resolve the directive under construction. `injectDeferred` preserves the originating injector for later reads.

Unregistering a part removes only its own registration. A stale animation, pointer gesture, focus callback or native/application event must not write into a destroyed or replacement owner.

### Composition

```text
Accordion root ──► Collection
Accordion item ──► Collection Item + Collapsible
Accordion trigger / panel ──► Collapsible trigger / panel
Collapsible trigger, Popover trigger, Tabs trigger, RadioGroup item, Toggle ──► Button
Tabs root ──► package-private roving focus
ToggleGroup Single / Multiple ──► ToggleGroup root (+ package-private roving focus)
ToggleGroup item ──► Toggle
Toolbar root ──► package-private roving focus
Toolbar item ──► Button + package-private Toolbar control
Toolbar Toggle ──► Toggle + package-private Toolbar control
Toolbar Popover Trigger ──► Popover trigger + package-private Toolbar control
Toolbar ToggleGroup Single / Multiple ──► ToggleGroup root
Toolbar RadioGroup ──► RadioGroup root
RadioGroup ──► RadioGroup root (+ package-private roving focus)
Collapsible panel ──► Presence
Popover root ──► package-private floating presentation + dismissal layer
Popover content ──► Presence
Tooltip root ──► package-private floating presentation + dismissal layer (shared with Popover)
Tooltip content ──► Presence
```

Single/multiple selection are concrete behavior variants, not an extensible public strategy framework. Accordion, ToggleGroup and RadioGroup share package-private single/multiple write rules; each widget states its own policy around them, such as Accordion's lock on a non-collapsible selection or RadioGroup's missing deselection. The roving widgets don't compose Collection: the package-private roving focus keeps its own items. A Toolbar group (section 15) provides no roving focus of its own, so its items register with the Toolbar's. There is no public generic overlay stack, state engine or registration framework; Popover and Tooltip share package-private floating and layer pieces (section 4).

## 4. Public package and type surface [E]

The root import remains valid and empty. Behavior is imported from secondary entrypoints; no source-path imports are consumer API.

| Entrypoint     | Public symbols                                                                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/utils`       | `injectDeferred`, `injectUniqueId`, `injectUniqueValue`                                                                                                                                                                                                                                                                        |
| `/collection`  | `OrigamiCollection`, `OrigamiCollectionState`, `OrigamiCollectionItem`, `OrigamiCollectionItemOptions`, type `OrigamiCollectionRecord`                                                                                                                                                                                         |
| `/presence`    | `OrigamiPresence`, `OrigamiPresenceOptions`, `OrigamiPresenceState`, type `OrigamiPresencePhase`                                                                                                                                                                                                                               |
| `/collapsible` | `OrigamiCollapsible`, `OrigamiCollapsibleOptions`, `OrigamiCollapsibleState`, `OrigamiCollapsibleTrigger`, `OrigamiCollapsibleTriggerOptions`, `OrigamiCollapsiblePanel`, `OrigamiCollapsiblePanelOptions`, type `OrigamiCollapsibleHiding`                                                                                    |
| `/accordion`   | `OrigamiAccordionSingle`, `OrigamiAccordionSingleOptions`, `OrigamiAccordionMultiple`, `OrigamiAccordionMultipleOptions`, `OrigamiAccordionOptions`, `OrigamiAccordionState`, `OrigamiAccordionItem`, `OrigamiAccordionItemOptions`, `OrigamiAccordionTrigger`, `OrigamiAccordionTriggerOptions`, `OrigamiAccordionPanel`, `OrigamiAccordionPanelOptions`     |
| `/popover`     | `OrigamiPopover`, `OrigamiPopoverOptions`, `OrigamiPopoverState`, `OrigamiPopoverTrigger`, `OrigamiPopoverTriggerOptions`, `OrigamiPopoverAnchor`, `OrigamiPopoverAnchorOptions`, `OrigamiPopoverContent`, `OrigamiPopoverContentOptions`, `OrigamiPopoverContentState`, type `OrigamiPopoverSide`, type `OrigamiPopoverAlign` |
| `/toggle`      | `OrigamiToggle`, `OrigamiToggleOptions`, `OrigamiToggleState`                                                                                                                                                                                                                                                                  |
| `/tabs`        | `OrigamiTabs`, `OrigamiTabsOptions`, `OrigamiTabsState`, `OrigamiTabsList`, `OrigamiTabsTrigger`, `OrigamiTabsTriggerOptions`, `OrigamiTabsPanel`, `OrigamiTabsPanelOptions`, type `OrigamiTabsOrientation`, type `OrigamiTabsActivation`                                                                                    |
| `/toggle-group` | `OrigamiToggleGroupSingle`, `OrigamiToggleGroupSingleOptions`, `OrigamiToggleGroupMultiple`, `OrigamiToggleGroupMultipleOptions`, `OrigamiToggleGroupState`, `OrigamiToggleGroupItem`, `OrigamiToggleGroupItemOptions`, type `OrigamiToggleGroupOrientation` |
| `/toolbar`     | `OrigamiToolbar`, `OrigamiToolbarOptions`, `OrigamiToolbarState`, `OrigamiToolbarItem`, `OrigamiToolbarToggle`, `OrigamiToolbarPopoverTrigger`, `OrigamiToolbarToggleGroupSingle`, `OrigamiToolbarToggleGroupMultiple`, `OrigamiToolbarRadioGroup`, type `OrigamiToolbarOrientation` |
| `/radio-group` | `OrigamiRadioGroup`, `OrigamiRadioGroupOptions`, `OrigamiRadioGroupState`, `OrigamiRadioGroupItem`, `OrigamiRadioGroupItemOptions` |
| `/button`      | `OrigamiButton`, `OrigamiButtonOptions` |
| `/tooltip`     | `OrigamiTooltip`, `OrigamiTooltipOptions`, `OrigamiTooltipState`, `OrigamiTooltipTrigger`, `OrigamiTooltipContent`, `OrigamiTooltipContentOptions`, `OrigamiTooltipContentState`, type `OrigamiTooltipSide`, type `OrigamiTooltipAlign` |

The inventories include the approved Popover placement exports and four-property Content Options. Collapsible and Popover Trigger Options carry `id`, `disabled` and `focusableWhenDisabled`, and Accordion Trigger Options carry `id` and `focusableWhenDisabled`; Collapsible Panel, Accordion Panel and Popover Anchor Options carry only `id`. The Toolbar's item and controls have no Options token of their own: `OrigamiToolbarItem` uses `OrigamiButtonOptions`, `OrigamiToolbarToggle` `OrigamiToggleOptions` and `OrigamiToolbarPopoverTrigger` `OrigamiPopoverTriggerOptions`.

The Accordion entrypoint also exposes `ɵOrigamiAccordionRoot` for compiled composition. Preserve whatever export visibility Angular packaging requires; it is not a supported application authoring API. Removing its importability is a deliberate API change made through this contract, not a side effect of a refactor.

The Collection entrypoint also exposes `ɵOrigamiRovingFocusContext` and `ɵOrigamiRovingFocusOptions`, package-private ordered-focus infrastructure for Origami's composite widgets, and `ɵrequestSingleSelection` and `ɵrequestMultipleSelection`, the package-private single/multiple selection write rules Accordion, ToggleGroup and RadioGroup share (section 21). The ToggleGroup and RadioGroup entrypoints expose `ɵOrigamiToggleGroupRoot` and `ɵOrigamiRadioGroupRoot`, the internal roots their standalone and Toolbar groups compose, and the Toolbar entrypoint exposes `ɵOrigamiToolbarControl`, the internal roving control its item, Toggle and Popover Trigger compose. None of them is an application API.

The Popover entrypoint also exposes `ɵOrigamiFloating`, the package-private native manual top-layer presentation that Popover and Tooltip Content use; `ɵOrigamiLayer`, the package-private Escape and outside-pointer participation of each Popover and Tooltip root; `ɵOrigamiFloatingScope`, which Popover Content provides so a Tooltip inside it presents only while that Popover does (section 18); and their host and part types `ɵOrigamiFloatingHost`, `ɵOrigamiFloatingParts`, `ɵOrigamiFloatingContent`, `ɵOrigamiIntent` and `ɵOrigamiLayerHost`. They are the pieces Popover and Tooltip are built from, and they live behind the Popover entrypoint because secondary entrypoints share code only through entrypoints. None of them is an application API.

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
| Accordion Item                                                              | `value: Signal<string>`, `disabled: Signal<boolean>`, `hiding: Signal<'hidden' \| 'until-found'>`                     |
| Popover root                                                                | `open: WritableSignal<boolean>`, `disabled: Signal<boolean>`, `dismissible: Signal<boolean>`                          |
| Collapsible Trigger                                                         | `id: Signal<string>`, `disabled: Signal<boolean>`, `focusableWhenDisabled: Signal<boolean>`                           |
| Accordion Trigger                                                           | `id: Signal<string>`, `focusableWhenDisabled: Signal<boolean>`                                                        |
| Popover Trigger, also for `OrigamiToolbarPopoverTrigger`                    | `id: Signal<string>`, `disabled: Signal<boolean>`, `focusableWhenDisabled: Signal<boolean>`                           |
| Each Collapsible Panel and Accordion Panel; each Popover Anchor             | its own Options token with `id: Signal<string>`                                                                       |
| Popover Content                                                             | `id: Signal<string>`, `side: Signal<OrigamiPopoverSide>`, `align: Signal<OrigamiPopoverAlign>`, `gap: Signal<number>` |
| Toggle, also for `OrigamiToolbarToggle`                                     | `pressed: WritableSignal<boolean>`, `disabled: Signal<boolean>`, `focusableWhenDisabled: Signal<boolean>`             |
| Tabs root                                                                   | `value: WritableSignal<string \| null>`, `disabled: Signal<boolean>`, `orientation: Signal<OrigamiTabsOrientation>`, `activation: Signal<OrigamiTabsActivation>` |
| Tabs Trigger                                                                | `value: Signal<string>`, `id: Signal<string>`, `disabled: Signal<boolean>`, `focusableWhenDisabled: Signal<boolean>`  |
| Tabs Panel                                                                  | `value: Signal<string>`, `id: Signal<string>`                                                                         |
| ToggleGroup Single, also for `OrigamiToolbarToggleGroupSingle`             | `value: WritableSignal<string \| null>`, `disabled: Signal<boolean>`, `orientation: Signal<OrigamiToggleGroupOrientation>`, `deselectable: Signal<boolean>` |
| ToggleGroup Multiple, also for `OrigamiToolbarToggleGroupMultiple`         | `value: WritableSignal<readonly string[]>`, `disabled: Signal<boolean>`, `orientation: Signal<OrigamiToggleGroupOrientation>` |
| ToggleGroup Item                                                            | `value: Signal<string>`, `disabled: Signal<boolean>`, `focusableWhenDisabled: Signal<boolean>`                        |
| Toolbar root                                                                | `orientation: Signal<OrigamiToolbarOrientation>`                                                                      |
| RadioGroup root, also for `OrigamiToolbarRadioGroup`                        | `value: WritableSignal<string \| null>`, `disabled: Signal<boolean>`                                                  |
| RadioGroup Item                                                             | `value: Signal<string>`, `disabled: Signal<boolean>`, `focusableWhenDisabled: Signal<boolean>`                        |
| Button, also for `OrigamiToolbarItem`                                       | `disabled: Signal<boolean>`, `focusableWhenDisabled: Signal<boolean>`                                                 |
| Tooltip root                                                                | `open: WritableSignal<boolean>`, `disabled: Signal<boolean>`, `openDelay: Signal<number>`                             |
| Tooltip Content                                                             | `id: Signal<string>`, `side: Signal<OrigamiTooltipSide>`, `align: Signal<OrigamiTooltipAlign>`, `gap: Signal<number>` |

| State           | Readonly signals                                                                       |
| --------------- | -------------------------------------------------------------------------------------- |
| Collection      | `items: Signal<readonly OrigamiCollectionRecord[]>`                                    |
| Presence        | `phase: Signal<'opening' \| 'open' \| 'closing' \| 'closed'>`, `open: Signal<boolean>` |
| Collapsible     | `expanded: Signal<boolean>`, `disabled: Signal<boolean>`                               |
| Accordion       | `itemValues: Signal<readonly string[]>`, `disabled: Signal<boolean>`                   |
| Popover root    | `open: Signal<boolean>`, `disabled: Signal<boolean>`, `dismissible: Signal<boolean>`   |
| Popover Content | `open: Signal<boolean>`; no public Presence phase alias                                |
| Toggle          | `pressed: Signal<boolean>`, `disabled: Signal<boolean>`                                |
| Tabs            | `value: Signal<string \| null>`, `disabled: Signal<boolean>`, `orientation: Signal<OrigamiTabsOrientation>`, `activation: Signal<OrigamiTabsActivation>` |
| ToggleGroup     | `disabled: Signal<boolean>`, `orientation: Signal<OrigamiToggleGroupOrientation>`; no `value`, whose type differs by mode |
| Toolbar         | `orientation: Signal<OrigamiToolbarOrientation>`                                       |
| RadioGroup      | `value: Signal<string \| null>`, `disabled: Signal<boolean>`                            |
| Tooltip         | `open: Signal<boolean>`, `disabled: Signal<boolean>`                                   |
| Tooltip Content | `open: Signal<boolean>`; no public Presence phase alias                                |

Popover Content inputs default to `side: 'block-end'`, `align: 'start'`, `gap: 0` CSS px. Side is `'block-start' | 'block-end' | 'inline-start' | 'inline-end'`; align is `'start' | 'center' | 'end'`. Gap must be finite and nonnegative. All four Content Options properties are required; defaults on an unused directive do not repair an incomplete replacement.

Tooltip root inputs default to `open` false, `disabled` false and `openDelay` 600 ms; the delay must be finite and nonnegative. Tooltip Content inputs default to `side: 'block-start'`, `align: 'center'` and `gap: 0` CSS px, with Popover's unions and gap rule. All four Content Options properties are required. The Tooltip Trigger has no inputs and no Options token.

State signals reject `.set` and `.update` at compile time. Shared Accordion Options do not contain mode-specific `value` or `collapsible`; Multiple Options do not contain Single's `collapsible` property. ToggleGroup Multiple Options do not contain Single's `deselectable` property, and there are no shared ToggleGroup root Options. Toolbar has no root `disabled`. RadioGroup has a single mode and no orientation.

## 5. Utilities and identity [I]

```ts
injectDeferred<T>(token: ProviderToken<T>): () => T;
injectUniqueId(key: string): string;
injectUniqueValue(key: string): string;
```

All three require Angular injection context when called. Deferred resolution is callable outside injection context afterward, uses the captured nearest injector and does not resolve the token at capture time.

Keys match `/^[a-z][a-z0-9-]*$/`; any other key, including a non-string, throws a `TypeError`. Each application has one counter per key, shared by both functions; independent application injectors share no allocation state, and uniqueness across several Angular applications in one document is not promised.

`injectUniqueId(key)` allocates an element ID, the default of an `id` input. In the browser it first returns the host element's rendered `id` attribute, so a hydrating host keeps the ID the server rendered. Otherwise it allocates `og-<key>-s<n>` on the server or `og-<key>-<n>` in the browser. The separate namespaces keep IDs the browser allocates, for parts it creates after a block hydrates, from colliding with the IDs of still-dehydrated server DOM, whatever order blocks hydrate in. Call it once per element and render the result as that element's `id`: only a rendered `id` is matched across hydration. Static and bound DOM IDs remain authoritative and reactive.

`injectUniqueValue(key)` allocates a value default: `og-<key>-<n>`. It is never rendered and is not matched between server and client. Consumers requiring persistent domain identity, or values that survive hydration, supply explicit values.

Every Origami `id` input default uses `injectUniqueId`, and every `value` input default uses `injectUniqueValue`.

## 6. Collection [C]

Selectors and template export names:

- `[ogCollection]`, `exportAs: 'ogCollection'`.
- `[ogCollectionItem]`, `exportAs: 'ogCollectionItem'`.

An item has a readonly `value` input defaulting to a generated string (`injectUniqueValue`). Its public record contains `value: Signal<string>`; consumers do not receive writable registration collections.

An item registers in its `ngOnInit`, once Angular has set its inputs (section 3), so readers never see its default value in place of a bound one. Collection State reports registered items in DOM order, not registration/construction order. Order is read when membership changes: an insertion or removal sorts the registered items by their current DOM position and notifies readers. A keyed move that keeps membership notifies no reader of `items` (or Accordion `itemValues`); they keep the order of the latest membership change until the next insertion or removal. Value changes remain observable without destroying an item. SSR produces valid collection observation without browser globals or browser-only render callbacks.

Each item belongs to the nearest Collection DI context, including composition through host directives. Mounting an item without a Collection owner fails clearly. Nested collections do not contribute their items to their ancestor collection.

Collection does not supply keyboard navigation, roving tabindex, selection, a role or item semantics. Item values are opaque; Collection does not normalize them against another registry. Accordion is the only primitive that composes it.

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

No generic `data-state` replacement is introduced. The attributes above describe immediate direct-Presence/Collapsible timing. The approved floating presentation adapter (Popover and Tooltip Content) permits a preparatory `opening` interval before `data-entering`; entering attributes and completion discovery wait for its matching coordinate/reveal commit. Visible exit discovery follows its own leaving WRITE without a new geometry prerequisite; nonvisual close settles without reveal/discovery. See section 11 and the approved design.

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

One mounted trigger and one mounted panel are supported per Collapsible. Each registers in `ngOnInit` (section 3), so its counterpart's association names it only once its inputs are set, also when the parts are rendered by separate components. Missing counterparts are allowed and remove their association attributes. A second mounted role fails clearly when it registers. Unmount/remount cleanup preserves the surviving and replacement registrations.

Trigger: `id` input default generated, `disabled` boolean input false, `focusableWhenDisabled` boolean input false.

- Native button semantics, no custom keyboard reimplementation of Enter/Space. The Trigger composes Button (section 17), which binds `type="button"` and the disabled attributes.
- Effective ID from Trigger Options.
- `aria-expanded` reflects desired expanded state.
- `aria-controls` identifies only the currently mounted panel.
- The Trigger is disabled while the root's or its own effective disabled is true. Disabled state sets native `disabled`, `aria-disabled="true"`, and empty `data-disabled` through the composed Button; inactive attributes are absent where appropriate.
- With effective `focusableWhenDisabled`, a disabled Trigger has `aria-disabled="true"` and `data-disabled` but no native `disabled`, so it stays focusable. Its activation is still ignored, but the browser still dispatches its clicks, so the consumer's own `(click)` listeners on the button still run.
- The Trigger's own disabled doesn't change the root's `data-disabled` or State `disabled`, which report the root's Options only.
- `data-expanded` reflects desired expanded state.
- An enabled click toggles expanded; a disabled user action cannot write it.

Panel:

- Effective ID from Panel Options and `aria-labelledby` pointing only to its mounted trigger.
- `data-expanded` follows desired expanded state, not Presence retention.
- Composes Presence; remains unhidden through finite exit, then becomes hidden when Presence closes. The Panel exposes readonly `state`, its composed Presence's State, so consumers retain gated content through exit with `state.open()`.
- Default collapsed hiding is ordinary `hidden`.
- `until-found` uses native reveal only where supported; elsewhere it behaves as ordinary hidden content. In supported engines, enabled `beforematch` requests expansion. Disabled state blocks that request, and repeated reveal requests are idempotent.

The consumer supplies any `role="region"`, heading hierarchy and accessible content semantics. External root Options/model writes remain authoritative even when user interaction is disabled.

## 9. Accordion [A]

Selectors/export names:

- `[ogAccordionSingle]`, `exportAs: 'ogAccordionSingle'`.
- `[ogAccordionMultiple]`, `exportAs: 'ogAccordionMultiple'`.
- `[ogAccordionItem]`, `exportAs: 'ogAccordionItem'`.
- `button[ogAccordionTrigger]`.
- `[ogAccordionPanel]`, `exportAs: 'ogAccordionPanel'`.

Single root: `value: string | null` model null; `disabled` false; `collapsible` false. Multiple root: `value: readonly string[]` model empty; `disabled` false. Mode value/output typing remains distinct.

Item: `value` input default generated string, `disabled` false, `hiding` default `'hidden'`. It composes Collection Item and Collapsible. Item Options feed the composed Collection Item's value and the composed Collapsible's disabled and hiding, so replacing only the upper item Options configures the item; consumers never provide lower Options. The item exposes readonly `state`, its composed Collapsible's State: `expanded` follows the root's actual selection of the item's value and `disabled` is the combined root and item disabled state. Consumers use distinct explicit values when items need independent selection.

Single behavior:

- Selecting an unselected enabled item replaces the selected value.
- An enabled selected item can clear to null only when `collapsible` is true.
- A selected non-collapsible trigger is locked: its composed Collapsible Trigger's own disabled, with `focusableWhenDisabled` unless root/item disabled state also applies and the Trigger's own `focusableWhenDisabled` is false. It has `aria-disabled="true"` and `data-disabled` and ignores activation, but remains a focusable, natively enabled button unless the root or item is disabled. Each disabled attribute has one owner, so re-enabling the root or item while it stays locked keeps `aria-disabled` and `data-disabled`, and unlocking it clears them.
- External values need not name a currently mounted item. Do not coerce unknown values to null or auto-select a first item.

Multiple behavior:

- Toggle adds an absent value at the end of a new array, or removes the toggled value without mutating the caller's array.
- Preserve other values and their order, including values with no mounted item.
- External values remain authoritative; removal of an item does not prune its selection.

Root and item disabled state combine reactively. Trigger and native reveal paths obey that combined state. An item under no Accordion owner fails clearly.

The item's effective Collapsible expanded signal observes root selection; requests to write it route through the mode's actual behavior and disabled/collapsible policy. Idempotent writes must not cause duplicate model outputs. A synchronous root output listener may change selection; the item's next observation must reflect that actual selection, not an optimistic shadow value.

Trigger: `id` input default generated, `focusableWhenDisabled` boolean input false. While the root or item disables the Trigger, `focusableWhenDisabled` keeps it focusable as Collapsible's does: `aria-disabled="true"` and `data-disabled` without native `disabled`, activation ignored, the button's own `(click)` listeners still run. Trigger/Panel Options replacement flows into the corresponding Collapsible Options; the Trigger's lock always comes from its item. The Panel exposes readonly `state`, the Presence State of its composed Collapsible Panel. IDs, associations, hiding and Presence behavior inherit Collapsible's contracts. Accordion State reports current mounted item values in Collection order.

The consumer supplies headings and optional panel roles. No roving tabindex, arrow-key navigation or focus manager is added; native buttons provide the mandatory activation semantics.

## 10. Popover retained behavior [V]

**This section preserves product behavior, not the superseded CSS-anchor/source-associated positioning mechanism. Basic native manual presentation and Content configuration/lifecycle follow the approved hybrid design in section 11.**

Root `[ogPopover]`, `exportAs: 'ogPopover'`: `open` boolean model false, `disabled` false, `dismissible` true. Root State `open()` observes requested state, not exit retention or actual presentation.

Trigger remains a native `button[ogPopoverTrigger]`. Explicit Anchor, Trigger and Content roles are required for presentation. Support one mounted instance of each role; Trigger and Anchor may share one element. Each role registers in `ngOnInit` (section 3), so the Trigger's `aria-controls` names Content only once Content's inputs are set, also when Content is rendered by a child component. Duplicate role registration fails clearly when the second role registers, while co-location is not a duplicate role.

Missing required parts suppress presentation without clearing desired open. Remounting parts can restore presentation from retained intent. Parent suppression also retains child intent. Parts and nested popovers belong to nearest logical DI owners. Native manual presentation changes their paint layer, not their authored DOM location.

Every part retains its own typed substitutable Options. Shared Trigger/Anchor uses Trigger Options as its effective DOM ID; a standalone Anchor uses its own Options ID. Private positioning identity is independent of these public IDs.

Trigger: `id` input default generated, `disabled` boolean input false, `focusableWhenDisabled` boolean input false. It binds effective ID, mounted content `aria-controls`, and actual participation via `aria-expanded`; its composed Button (section 17) binds `type="button"` and the disabled semantics. The Trigger is disabled while the root's or its own effective disabled is true: `aria-disabled="true"`, empty `data-disabled` and native `disabled` unless `focusableWhenDisabled`, absent while enabled. A focusable disabled Trigger ignores activation, but its own `(click)` listeners still run, and focus is never restored to it. Enabled click toggles/request-closes; disabling prevents trigger activation but does not override authoritative model writes or automatically disable Escape/outside dismissal. The Trigger's own disabled doesn't change root State `disabled`, which reports the root's Options only.

Content retains children through Presence's finite exit. Content State `open()` directly reflects Presence retention, not a separately writable alias. Once dismissal is accepted, exiting content stops participating in interaction and cannot remain a focus target merely because its animation retains it.

### Dismissal and nesting

- Escape targets the topmost participating Origami layer (`ɵOrigamiLayer`, section 4), a Popover or a Tooltip (section 18). Already-consumed and composing key events are ignored. A veto consumes that request; it must not fall through to another root or ancestor.
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

No source inspection, skipped audit or design approval substitutes for the required browser proof in section 19.

## 12. Toggle [G]

Selector/export name:

- `button[ogToggle]`, `exportAs: 'ogToggle'`.

Configuration: `pressed` boolean model false, `disabled` boolean input false, `focusableWhenDisabled` boolean input false. The directive exposes readonly State. Toggle is a two-state button; it has no mixed or unknown value.

Host semantics:

- Native button semantics, no custom keyboard reimplementation of Enter/Space.
- `aria-pressed` is always present, `"true"` or `"false"`, reflecting effective pressed state.
- `data-pressed` is empty while pressed and absent otherwise.
- Toggle composes Button (section 17), which binds `type="button"` and, from Toggle's effective `disabled` and `focusableWhenDisabled`, sets `aria-disabled="true"`, empty `data-disabled` and native `disabled` unless `focusableWhenDisabled` while disabled; they are absent while enabled. A focusable disabled Toggle ignores activation, but its own `(click)` listeners still run.
- An enabled activation writes the negation of the effective pressed state to the effective Options exactly once; a disabled user action cannot write it. External Options/model writes remain authoritative while disabled.

Each Toggle element owns its own Context and State; descendants of the button observe that State. There is no parent owner, part registration or cardinality.

Server HTML carries the effective `aria-pressed`, `data-pressed` and disabled attributes. Eager and incremental hydration reuse the server button; an initiating activation replayed after hydration reaches the effective pressed state exactly once.

The consumer supplies the accessible name, which should stay the same when the pressed state changes, and owns styling, label or icon changes and side effects such as persistence.

Exclusions: Toggle is a button, not a form control. It has no Signal Forms integration or form value and no mixed state. A standalone Toggle has no group or roving focus; ToggleGroup (section 14) composes it, and `ogToolbarToggle` is a Toggle that is one Toolbar control (section 15).

## 13. Tabs [S]

Selectors/export names:

- `[ogTabs]`, `exportAs: 'ogTabs'`.
- `[ogTabsList]`.
- `button[ogTabsTrigger]`.
- `[ogTabsPanel]`.

Root configuration: `value: string | null` model null, `disabled` boolean input false, `orientation: 'horizontal' | 'vertical'` input default `'horizontal'`, `activation: 'automatic' | 'manual'` input default `'automatic'`. The root exposes readonly State; descendants inject it. The List has no configuration. Trigger: `value` input defaulting to a generated string, `id` input defaulting to a generated ID, `disabled` boolean input false, `focusableWhenDisabled` boolean input false. Panel: `value` input defaulting to a generated string, `id` input defaulting to a generated ID. A Trigger and a Panel pair by equal value, so consumers give each pair the same explicit value; a generated value pairs with nothing. Values within one Tabs are expected to be distinct and are not validated; associations use the first mounted match.

Triggers and Panels register in `ngOnInit` (section 3); other parts read a Trigger's or Panel's Options only once it has registered, so replacement Options may use required inputs, and repeated Triggers and Panels in `@for` blocks are read only after Angular sets their inputs. Lists, Triggers and Panels belong to the nearest Tabs root and fail through Angular DI without one. A Tabs root inside a Panel is fully independent.

Host semantics:

- Root: `data-orientation` reflects effective orientation; `data-disabled` is empty while root-disabled and absent otherwise.
- List: static `role="tablist"`; `aria-orientation` always present, reflecting effective orientation. The consumer supplies its accessible name.
- Trigger: native button semantics, static `role="tab"`, effective ID, `aria-selected` always `"true"` or `"false"`, `aria-controls` naming only a registered Panel of the same value, `tabindex` `"0"` on the single tab stop and `"-1"` on every other Trigger, and empty `data-selected` while selected. Its composed Button (section 17) binds `type="button"` and, while root- or own-disabled, `aria-disabled="true"`, empty `data-disabled` and native `disabled` unless `focusableWhenDisabled`; they are absent while enabled.
- Panel: static `role="tabpanel"`, static `tabindex="0"`, effective ID, `aria-labelledby` naming only a registered Trigger of the same value, `hidden` unless its value is selected, and empty `data-selected` while selected. A consumer's static `tabindex` overrides the Panel default.

Selection:

- An enabled native activation (click, Enter or Space) focuses the Trigger and selects its value, provided it is still mounted and enabled after its focus handlers ran, so a click makes that Trigger the tab stop and the origin of the next keyboard move even in engines whose click doesn't focus a button. A write happens only when the value differs, so re-selecting the selected tab writes nothing and emits nothing. There is no deselection. Activating a focusable disabled Trigger focuses it and selects nothing; its own `(click)` listeners still run.
- A Panel is shown exactly when its value equals the root value, whether or not a Trigger with that value is mounted. Null or a value no mounted Trigger has selects no Trigger: every Trigger is `aria-selected="false"`. Null hides every Panel; a value only a Panel has shows that Panel. Tabs never auto-selects or writes the model without user action.
- Removing the selected Trigger keeps the value; its Panel stays shown while mounted. Removing a Panel only drops its association.
- A disabled selected Trigger stays `aria-selected="true"` and its Panel stays shown.
- Root and Trigger disabled state combine and block only user selection. External Options/model writes remain authoritative while disabled and emit no output from an unused model.

Keyboard and focus:

- Horizontal: ArrowRight moves to the next and ArrowLeft to the previous Trigger in DOM order; in right-to-left text, read from the Trigger's computed `direction` at key time, they are swapped. Vertical: ArrowDown moves next and ArrowUp previous, independent of direction; the other axis is not handled. Home and End move to the first and last Trigger a move can reach.
- A move can reach an enabled Trigger or a focusable disabled one: moves skip the other disabled Triggers and wrap at both ends. Handled keys prevent their default action. Keys with Alt, Ctrl, Meta or Shift, keys already `defaultPrevented` and keys during IME composition are ignored.
- Automatic activation selects the Trigger a keyboard move lands on, also when that is the Trigger already focused (Home on the first enabled Trigger, End on the last, a wrap with one enabled Trigger), provided it is still mounted, enabled and focused after any focus handlers ran; manual activation moves focus only. A move onto a focusable disabled Trigger focuses it and selects nothing. Focus arriving by Tab, pointer, activation, script or focus repair never selects by itself.
- Exactly one Trigger is the tab stop: the focused Trigger while focus is on one a move can reach, otherwise the first enabled Trigger in DOM order whose value is selected, otherwise the first enabled Trigger in DOM order, otherwise the first focusable disabled Trigger in DOM order. A selected Trigger that is disabled, focusable or not, is never preferred. With no enabled or focusable Trigger there is no tab stop. The tab stop reads DOM order when Trigger membership, focus, disabled state, values or selection change; a keyed move alone doesn't move it. Arrow keys always read current DOM order.
- Focus repair: when the focused Trigger is removed or becomes natively disabled (disabled and not focusable) while focus has not moved elsewhere (it remains on that Trigger, the body or nowhere), focus moves to the new tab stop without selecting. A focused Trigger that becomes disabled but stays focusable keeps focus. Focus the application moved elsewhere is never taken.
- External selection never moves focus.

Server HTML carries roles, IDs, the mounted associations, `aria-selected`, the single `tabindex="0"`, `hidden` on unselected Panels and the disabled attributes. The tab stop follows DOM order on the server even when Triggers register in a different order, and is the selected Trigger even when repeated Triggers render in `@for`. Associations with Panels rendered later, such as by a later `@for`, are complete in server HTML. Eager and incremental hydration reuse the server Triggers and Panels without transient removal, and hydration does not change those attributes. An initiating click on a Trigger replayed after hydration selects exactly once. Keyboard interaction before hydration is not promised.

The consumer supplies the List's accessible name, Trigger labels, Panel content and styling.

Exclusions: no typeahead, `aria-activedescendant`, Page Up/Down or two-dimensional navigation; no enter/exit Presence or `until-found` on Panels (consumers gate heavy content with State); no public roving-focus or focus-management API; no form value or Signal Forms integration.

## 14. ToggleGroup [U]

Selectors/export names:

- `[ogToggleGroupSingle]`, `exportAs: 'ogToggleGroupSingle'`.
- `[ogToggleGroupMultiple]`, `exportAs: 'ogToggleGroupMultiple'`.
- `button[ogToggleGroupItem]`, `exportAs: 'ogToggleGroupItem'`; composes Toggle.

Both roots compose the package-private ToggleGroup root, which the Toolbar's Toggle Groups (section 15) also compose.

Configuration: Single has a `value: string | null` model null, `disabled` boolean input false, `orientation: 'horizontal' | 'vertical'` input default `'horizontal'` and `deselectable` boolean input false. Multiple has a `value: readonly string[]` model defaulting to empty, `disabled` and `orientation`; it has no `deselectable`. Both roots expose the same readonly State; descendants inject it. Item: `value` input defaulting to a generated string, `disabled` boolean input false, `focusableWhenDisabled` boolean input false. Values within one group are expected to be distinct and are not validated.

Item Options feed the composed Toggle's Options, so replacing only the upper item Options drives the item's value and the Toggle's pressed, disabled and focusable state; consumers never provide Toggle Options. An item registers with the roving focus in `ngOnInit` (section 3); other items read its Options only once it has registered, so replacement item Options may use required inputs, and repeated items in `@for` are read only after Angular sets their inputs. The item exposes readonly `state`, its composed Toggle's State: `pressed` follows the group value and `disabled` is the combined root and item disabled state; descendants of an item inject the same State. ToggleGroup adds no item State of its own. Items belong to the nearest root and fail through Angular DI without one. An item is not also matched by `ogToggle`. A root inside a non-item descendant of another root is fully independent.

Host semantics:

- Root: static `role="group"`, which a consumer's static `role` overrides; `data-orientation` reflects effective orientation; `data-disabled` is empty while root-disabled and absent otherwise. There is no `aria-orientation`, which ARIA does not allow on `group`. The consumer supplies the accessible name.
- Item: Toggle's host semantics (section 12) driven by the group: `type="button"`, `aria-pressed` always `"true"` or `"false"`, empty `data-pressed` while pressed, and while root- or own-disabled `aria-disabled="true"`, empty `data-disabled` and native `disabled` unless `focusableWhenDisabled`. ToggleGroup adds `tabindex` `"0"` on the single tab stop and `"-1"` on every other item.
- Both modes use `group` and `aria-pressed` buttons, not `radiogroup` and `radio`: `aria-pressed` is not valid on `radio`, and radio semantics, where selection follows focus, are RadioGroup's (section 16).
- A pressed Single item that cannot be deselected is not `aria-disabled`; it stays an ordinary enabled pressed button.

Selection, ToggleGroup's own policy:

- Single: an enabled native activation (click, Enter or Space) of an unpressed item writes its value once. Activating the pressed item writes null once when `deselectable`; otherwise it writes and emits nothing and the item stays `aria-pressed="true"`.
- Multiple: an enabled activation adds the value at the end of a new array or removes it into a new array. Every other value, including values no item has, keeps its order; the caller's array is never mutated.
- Null, or a value no mounted item has, presses nothing and is kept. ToggleGroup never writes the model without user action: removing an item does not prune and no value is normalized.
- Root and item disabled state combine and block only user activation. External Options/model writes remain authoritative while disabled and emit no output from an unused model. A write to the composed Toggle's effective `pressed` Options under an item is a group request under the same policy; it never moves focus.
- A rejected request writes nothing; pressed state never runs ahead of the group value.

Keyboard and focus follow section 13's rules, reading "pressed" for "selected": arrows along the effective orientation (horizontal arrows read the item's computed `direction` at key time), Home and End, wrapping, skipping disabled items that aren't focusable and the ignored keys; exactly one item is the tab stop (the focused item, otherwise the first enabled pressed item in DOM order, otherwise the first enabled item, otherwise the first focusable disabled item; none when no item is enabled or focusable), with section 13's DOM order reading; focus repair never takes focus the application moved elsewhere, and a focused item that becomes disabled but stays focusable keeps focus. Differences:

- Moves never press. Focus arriving by a move, Tab, pointer, activation, script or focus repair never presses.
- A click runs the composed Toggle's click listener first, which requests the press, and then the item's, which focuses the item if it is still mounted and enabled or focusable. A click therefore makes the item the tab stop and the origin of the next keyboard move even in engines whose click doesn't focus a button. This "toggle, then focus" order was observed in Chromium, Firefox and WebKit; as a result, a focus handler that disables or removes the item during a click doesn't undo the request already made, and focus repair then moves focus to the tab stop.
- External value writes never move focus.

Inside a Toolbar: `ogToggleGroupSingle` and `ogToggleGroupMultiple` provide their own roving focus wherever they are, so inside a Toolbar they keep their own tab stop. To share the Toolbar's tab stop, use the Toolbar's Toggle Groups (section 15).

Server HTML carries `role="group"`, `data-orientation`, `aria-pressed`, `data-pressed`, the disabled attributes and the single `tabindex="0"`, chosen in DOM order. Eager and incremental hydration reuse the server root and items without transient removal, and hydration does not change those attributes. An initiating click on an item replayed after hydration presses exactly once. Keyboard interaction before hydration is not promised.

The consumer supplies the group's and items' accessible names, which should stay the same when the pressed state changes, and owns icons, styling and side effects.

Exclusions: no typeahead, `aria-activedescendant`, Page Up/Down or two-dimensional navigation; no form value or Signal Forms integration; no radio semantics (section 16); no mixed state; no public roving-focus or selection API.

## 15. Toolbar [K]

Selectors/export names:

- `[ogToolbar]`, `exportAs: 'ogToolbar'`.
- `button[ogToolbarItem]`; composes Button (section 17).
- `button[ogToolbarToggle]`, `exportAs: 'ogToolbarToggle'`; composes Toggle (section 12).
- `button[ogToolbarPopoverTrigger]`; composes Popover Trigger (section 10).
- `[ogToolbarToggleGroupSingle]`, `exportAs: 'ogToolbarToggleGroupSingle'`; composes the package-private ToggleGroup root.
- `[ogToolbarToggleGroupMultiple]`, `exportAs: 'ogToolbarToggleGroupMultiple'`; composes the package-private ToggleGroup root.
- `[ogToolbarRadioGroup]`, `exportAs: 'ogToolbarRadioGroup'`; composes the package-private RadioGroup root.

Configuration: the root has an `orientation: 'horizontal' | 'vertical'` input default `'horizontal'` and exposes readonly State; descendants inject it. There is no root `disabled`. Item: Button's inputs and Options, `disabled` and `focusableWhenDisabled` boolean inputs false; there is no item value. Toolbar Toggle: Toggle's `pressed` model, `disabled` and `focusableWhenDisabled` inputs, Options and State, which it exposes as readonly `state`. Toolbar Popover Trigger: the Popover Trigger's `id`, `disabled` and `focusableWhenDisabled` inputs and Options; it requires a nearest Popover and may share its button with `ogPopoverAnchor`. Items, Toolbar Toggles, Toolbar Popover Triggers and Toolbar groups belong to the nearest Toolbar and fail through Angular DI without one. A Toolbar inside another Toolbar is fully independent.

Items, Toolbar Toggles and Toolbar Popover Triggers are the Toolbar's controls. Each composes the package-private Toolbar control, which reads the control's disabled state and disabled focusability from the Button Options on its own element: the item's own, Toggle's, or the Popover Trigger's, whose disabled state is the Popover root's or its own. A control registers with the roving focus in `ngOnInit` (section 3); other controls read its Options only once it has registered, so replacement Options may use required inputs, and repeated controls in `@for` are read only after Angular sets their inputs.

Host semantics:

- Root: static `role="toolbar"`, which a consumer's static `role` overrides; `aria-orientation` always present and `data-orientation`, both reflecting effective orientation. The consumer supplies the accessible name with `aria-label` or `aria-labelledby`.
- Controls: native button semantics, `tabindex` `"0"` on the single tab stop and `"-1"` on every other control. The composed Button binds `type="button"` and, while disabled, `aria-disabled="true"`, empty `data-disabled` and native `disabled` unless `focusableWhenDisabled`; they are absent while enabled. A Toolbar Toggle adds Toggle's `aria-pressed` and `data-pressed`, and a Toolbar Popover Trigger the Popover Trigger's ID, `aria-controls` and `aria-expanded`.

Controls are buttons only. `type="button"` and Enter/Space activation come with them. Links, text inputs, sliders, spin buttons and other controls that own the arrow keys are not Toolbar controls. Other focusable content inside a Toolbar that is not a Toolbar control, such as an `<input>`, keeps its own Tab stop and its own arrow keys: arrow handling lives on the controls, not on the root, so typing in it is never intercepted. This is documented, not enforced.

A disabled control is natively disabled and skipped by arrows unless it is focusable; a focusable disabled control stays in the arrow sequence, keeps focus and ignores activation, while the consumer's own `(click)` listeners on it still run. The Toolbar never activates a control: a click, Enter or Space runs only the button's own listeners and its composed primitive's, so a Toolbar Toggle presses and a Toolbar Popover Trigger opens or closes its Popover.

Toolbar groups: `OrigamiToolbarToggleGroupSingle`, `OrigamiToolbarToggleGroupMultiple` and `OrigamiToolbarRadioGroup` are selection groups whose items share the nearest Toolbar's tab stop. Each has the same inputs, Options, State, host semantics and selection policy as `OrigamiToggleGroupSingle`, `OrigamiToggleGroupMultiple` or `OrigamiRadioGroup` (sections 14 and 16), takes `ogToggleGroupItem` or `ogRadioGroupItem` items, and provides no roving focus of its own: its items register with the Toolbar's, so the Toolbar has one tab stop and one arrow sequence across its own controls and the groups' items in DOM order. A Toolbar group's items navigate along the Toolbar's orientation; a Toolbar Toggle Group's own `orientation` Option has no effect, and its `data-orientation` and State report the Toolbar's. A pressed or checked item is not preferred, and moves never press or check; Click, Enter and Space still do. A Toolbar group finds its Toolbar through logical DI, so outside a Toolbar it fails through Angular DI, and inside Popover Content within a Toolbar it still joins that Toolbar. A standalone `ogToggleGroupSingle`, `ogToggleGroupMultiple` or `ogRadioGroup` inside a Toolbar, including inside Popover Content, keeps its own tab stop. A ToggleGroup or RadioGroup item registers on its own; applying a Toolbar control to it is unsupported (section 17).

Keyboard and focus follow section 13's rules: arrows along the effective orientation (horizontal arrows read the focused control's computed `direction` at key time), Home and End, wrapping, skipping disabled controls that aren't focusable and the ignored keys; focus repair never takes focus the application moved elsewhere, and a focused control that becomes disabled but stays focusable keeps focus. Differences:

- No control is preferred: exactly one control is the tab stop, the focused one while focus is on one a move can reach, otherwise the first enabled control in DOM order, including Toolbar group items, otherwise the first focusable disabled control, with section 13's DOM order reading. A pressed or checked Toolbar group item is not preferred. Tab back into a Toolbar lands on its first enabled control, not the last focused one.
- Moves never activate, press or check.
- A click focuses the control if it is still mounted and enabled or focusable after its listeners ran, so it becomes the tab stop and the origin of the next keyboard move even in engines whose click doesn't focus a button. A Toolbar Toggle requests the press first, keeping ToggleGroup's "toggle, then focus" order, and a Toolbar Popover Trigger requests opening or closing first. A Toolbar Toggle Group item keeps ToggleGroup's "toggle, then focus" order; a Toolbar Radio Group item keeps RadioGroup's "focus, then check" order.
- External orientation writes never move focus.

Server HTML carries `role="toolbar"`, `aria-orientation`, `data-orientation`, the disabled attributes, Toolbar Toggles' and Toolbar groups' `aria-pressed`, `aria-checked` and the single `tabindex="0"`, chosen in DOM order across Toolbar group items. Eager and incremental hydration reuse the server root and controls without transient removal, and hydration does not change those attributes. An initiating click replayed after hydration runs the consumer's handler, or presses a Toolbar Toggle or presses or checks a Toolbar group item, exactly once. Keyboard interaction before hydration is not promised.

The consumer supplies the accessible name, control labels, separators (`role="separator"` with an `aria-orientation` perpendicular to the Toolbar's) and styling. APG recommends `role="toolbar"` only for three or more controls.

Exclusions: no typeahead, `aria-activedescendant`, multi-row or two-dimensional navigation; no root `disabled`; no non-button controls and no arrow-owning controls as controls; no remembered last-focused control; no separator part; no public roving-focus API.

## 16. RadioGroup [Q]

Selectors/export names:

- `[ogRadioGroup]`, `exportAs: 'ogRadioGroup'`; composes the package-private RadioGroup root, which `OrigamiToolbarRadioGroup` (section 15) also composes.
- `button[ogRadioGroupItem]`.

Configuration: the root has a `value: string | null` model null and a `disabled` boolean input false, and exposes readonly State; descendants inject it. There is one mode and no orientation. Item: `value` input defaulting to a generated string, `disabled` boolean input false, `focusableWhenDisabled` boolean input false. Values within one group are expected to be distinct and are not validated; every item whose value is the root value is checked.

An item registers with the roving focus in `ngOnInit` (section 3); other items read its Options only once it has registered, so replacement item Options may use required inputs, and repeated items in `@for` are read only after Angular sets their inputs. RadioGroup has no item State; descendants of an item read the root's State or style from `data-checked`. Items belong to the nearest root and fail through Angular DI without one. A root inside a non-item descendant of another root is fully independent.

Host semantics:

- Root: static `role="radiogroup"`, which a consumer's static `role` overrides; `data-disabled` is empty while root-disabled and absent otherwise. The root binds no `aria-orientation`, `aria-required` or `aria-disabled`; a consumer may write any of them statically. The consumer supplies the accessible name with `aria-label` or `aria-labelledby`.
- Item: static `role="radio"`; `aria-checked` always `"true"` or `"false"`; empty `data-checked` while checked; `tabindex` `"0"` on the single tab stop and `"-1"` on every other item. Its composed Button (section 17) binds `type="button"` and, while root- or own-disabled, `aria-disabled="true"`, empty `data-disabled` and native `disabled` unless `focusableWhenDisabled`, absent while enabled.
- Items are `<button>` elements with `role="radio"`, not native `<input type="radio">`: Origami owns the tab stop, the keys and the write, so selection never runs ahead of the value and a radio can share a Toolbar's tab stop (section 15). Native button activation turns Enter and Space into one click.

Selection, RadioGroup's own policy on the shared single write rule:

- An enabled native activation (click, Enter or Space) of an unchecked item writes its value once. Activating the checked item writes and emits nothing. There is no user unchecking.
- Null, or a value no mounted item has, checks nothing and is kept. RadioGroup never writes the model without user action: no item is checked automatically, removing the checked item keeps the value and no value is normalized.
- A disabled checked item stays `aria-checked="true"`.
- Root and item disabled state combine and block only user selection. External Options/model writes remain authoritative while disabled and emit no output from an unused model.

Keyboard and focus follow section 13's rules, reading "checked" for "selected": Home and End, wrapping, skipping disabled items that aren't focusable and the ignored keys; exactly one item is the tab stop (the focused item, otherwise the first enabled checked item in DOM order, otherwise the first enabled item, otherwise the first focusable disabled item; none when no item is enabled or focusable), with section 13's DOM order reading; focus repair never takes focus the application moved elsewhere and never checks, and a focused item that becomes disabled but stays focusable keeps focus. Differences:

- All four arrows move, whatever the layout: ArrowDown and ArrowRight to the next enabled item, ArrowUp and ArrowLeft to the previous one. ArrowLeft and ArrowRight read the focused item's computed `direction` at key time and swap in right-to-left text; ArrowUp and ArrowDown ignore it.
- Every move checks the item it lands on, as Tabs' automatic activation does, also when that is the item already focused (Home on the first enabled item, End on the last, a wrap with one enabled item): only if the item is still mounted, enabled and focused after any focus handlers ran, so a move onto a focusable disabled item focuses it and checks nothing. Home and End are moves too. Focus arriving by Tab, pointer, activation, script or focus repair never checks by itself.
- Activation focuses the item and then checks it, only if the item is still mounted and enabled after its focus handlers ran; a focusable disabled item is focused and not checked. A click therefore makes the item the tab stop and the origin of the next keyboard move even in engines whose click doesn't focus a button.
- External value writes never move focus.

Inside a Toolbar: `ogRadioGroup` provides its own roving focus wherever it is, so inside a Toolbar it keeps its own tab stop and its moves check. `OrigamiToolbarRadioGroup` shares the Toolbar's tab stop instead (section 15): its arrows follow the Toolbar's orientation, so the other pair does nothing, and they only move focus; Click, Enter and Space still check the item once.

Server HTML carries `role="radiogroup"`, `role="radio"`, `aria-checked`, `data-checked`, the disabled attributes and the single `tabindex="0"`, chosen in DOM order: the first enabled checked item, otherwise the first enabled item, and in a Toolbar Radio Group the Toolbar's first enabled control. Eager and incremental hydration reuse the server root and items without transient removal, and hydration does not change those attributes. An initiating click on an item replayed after hydration checks exactly once. Keyboard interaction before hydration is not promised.

The consumer supplies the group's accessible name, item labels, layout and styling, and may write `aria-orientation` or `aria-required` statically on the root.

Exclusions: no typeahead, `aria-activedescendant`, Page Up/Down or two-dimensional navigation, and in a Toolbar Radio Group no arrows across the Toolbar's axis; no user unchecking, no orientation Option and no item State; no form value, `name`, `required`, validity or Signal Forms integration (a later slice: the root's `value` model and `disabled` input are named and typed so that slice can adopt them); not native `<input type="radio">`; no public roving-focus or selection API.

## 17. Button [F]

Selector:

- `button[ogButton]`. It has no `exportAs` and no State.

Configuration: `disabled` boolean input false, `focusableWhenDisabled` boolean input false, through `OrigamiButtonOptions`.

Host semantics:

- Static `type="button"`. Button adds no activation, click handling or keyboard handling: Enter and Space are native.
- While disabled, `aria-disabled="true"`, empty `data-disabled` and native `disabled`. With `focusableWhenDisabled`, a disabled Button has `aria-disabled="true"` and `data-disabled` but no native `disabled`, so it keeps its place in the Tab order. The attributes are absent while enabled, whatever `focusableWhenDisabled` says.
- A natively disabled button receives no trusted clicks. A focusable disabled one does: the browser still dispatches its clicks, Enter and Space, so the consumer's own `(click)` listeners on it still run and check the disabled state themselves.

Every Origami button part composes Button through `hostDirectives` and is the sole owner of its type and disabled attributes: Toggle, ToggleGroup items (through Toggle), the Collapsible Trigger, the Accordion Trigger (through the Collapsible Trigger), the Popover Trigger, the Tabs Trigger, RadioGroup items and the Toolbar's controls. Each part supplies Button's Options from its own effective disabled state, its root's or its own, and its own `focusableWhenDisabled` Option and input; Button's own inputs are not exposed through the part. Each part keeps its own activation guard, so a focusable disabled part ignores activation: it doesn't press, expand, open, select or check. Focus is never restored to a disabled Popover Trigger, focusable or not.

In the roving widgets (Tabs, ToggleGroup, Toolbar, RadioGroup), a focusable disabled item stays in the arrow sequence and is the tab stop while focused, or when no item is enabled; a disabled item is never preferred. A move onto it focuses it without selecting or checking it, a click focuses it in every engine and activates nothing, and a focused item that becomes disabled but stays focusable keeps focus (section 13).

Applying `ogButton` to an element that has a button primitive (a directive that composes Button), or two button primitives to one element, is unsupported, and nothing reports it: Angular silently shares one Button between them, each part provides Button's Options on that element, and only the provider Angular resolves last configures it, so the other part's disabled and `focusableWhenDisabled` state is ignored. A Toolbar control that is also a Toggle or a Popover Trigger is an `ogToolbarToggle` or `ogToolbarPopoverTrigger` (section 15).

Server HTML carries `type="button"` and the disabled attributes. Eager and incremental hydration reuse the server button without transient removal, and hydration does not change those attributes; once hydrated, a focusable disabled Button's click reaches its listeners.

The consumer supplies the accessible name, styling and any explanation of why a focusable disabled Button is unavailable.

Exclusions: no State, pressed or loading state; no `submit` or `reset` type; no link or non-`<button>` host; no activation guard of its own.

## 18. Tooltip [N]

Selectors/export names:

- `[ogTooltip]`, `exportAs: 'ogTooltip'`: the owner.
- `[ogTooltipTrigger]`: any element the consumer makes focusable.
- `[ogTooltipContent]`, `exportAs: 'ogTooltipContent'`; composes Presence.

Configuration: the root has an `open` boolean model false, a `disabled` boolean input false and an `openDelay` number input in milliseconds (600), and exposes readonly State; descendants inject it. Content has an `id` input defaulting to a generated ID, `side` (`'block-start'`), `align` (`'center'`) and `gap` (0 CSS px) inputs, and exposes readonly State whose `open()` is its Presence retention. The Trigger has no configuration. The delay is read when a hover open is scheduled and the gap when Content is positioned; a non-finite or negative effective value throws `RangeError` then. State `open()` is the effective requested intent, not native visibility.

Trigger and Content register in `ngOnInit` (section 3). One mounted Trigger and one mounted Content are supported per root; a second fails clearly when it registers. Parts belong to the nearest root and fail through Angular DI without one; a component may be the root through `hostDirectives`. Nested roots are independent.

Host semantics:

- Root: none.
- Trigger: `aria-describedby` names the registered Content's effective ID, open or closed, and is absent without registered Content. It replaces a consumer's static `aria-describedby`. The Trigger binds no `type`, `role`, `disabled` or `tabindex`, so it may be co-applied with any button primitive, which keeps its own disabled state.
- Content: static `role="tooltip"`, which a consumer's static `role` overrides; effective `id`; `popover="manual"`; `position: fixed`, `right` and `bottom` `auto`, `margin: 0`; `inert` while not participating; Presence's attributes. Origami never gates Content's children. Closed Content is natively hidden and `inert`, and the Trigger's accessible description still resolves from it.

Intent. Each root has at most one pending open; every write goes through the effective `open` Option. Opening by intent is blocked while the root is disabled, while the Trigger matches `:disabled` and without a registered Trigger.

- A mouse or pen `pointerenter` on the Trigger opens it after `openDelay`, or at once when the delay is 0 or the delay group is warm. Leaving first cancels it. A pending open that expires while blocked does nothing. Touch never opens a Tooltip.
- A Trigger `focus` opens it at once if the Trigger is still focused, matches `:focus-visible` and wasn't focused by a pointer press: the first Trigger focus after a `mousedown` on the Trigger, in the same task and before its `click`, which mouse and pen presses and touch taps send before the focus they cause, doesn't open it. That focus then holds it open. Pointer-initiated focus, including a touch tap's on an `<input>`, does not open it. Clicking a `<label>` of an `<input>` Trigger focuses it without a `mousedown` on it: in Chromium and Firefox the focus comes first, so `openChange` emits true, then false, and nothing is shown; in Safari the click comes first, so the focus opens the Tooltip as a keyboard focus does, until blur.
- `pointerdown` or `click` on the Trigger, including Enter and Space on a button, closes an open Tooltip at once and cancels a pending open.
- Leaving the Trigger toward shown Content keeps an intent-opened Tooltip open while the pointer stays inside the grace area: the convex hull of the exit point, padded 5 CSS px along the edge it crossed and 5 CSS px back into the Trigger, and the corners of Content's border box, captured at the leave. Leaving Content toward the Trigger works the same way. Entering the Trigger or Content ends the transit; moving outside the area closes the Tooltip unless focus holds it. Leaving while Content doesn't participate or isn't revealed yet closes at once.
- A Trigger `blur` closes an intent-opened Tooltip at once unless the Trigger or Content is hovered or a transit is active. A blur while the Trigger is still focused is ignored.
- Leave and blur close only a Tooltip that hover or focus opened. An application-opened Tooltip stays open until the application, an activation, Escape or an outside gesture closes it.
- Opening is edge-triggered: after any close, a Tooltip opens again only on a new Trigger enter or a new keyboard-modality focus.
- There is no auto-hide timeout. Removing the Trigger cancels a pending open and ends its hover, focus and transit state. Nothing is written after the root is destroyed.

Delay group. Tooltips in one Angular application form one group. While a Tooltip that hover or focus opened is open, and for 300 ms after it closes for any reason or is destroyed, the group is warm and hover opens without delay. When a Tooltip opens by hover or focus, any other Tooltip that hover or focus opened closes through its own `open` write. While one Tooltip's grace transit is active, another Trigger's `pointerenter` doesn't open it but leaves a pending open; if that Trigger is still hovered when the transit ends outside the area, it opens then; a transit that ends any other way drops it. Application writes neither join nor are affected by the group; a Tooltip whose hover or focus open the application has since replaced is no longer in it, and its close doesn't warm the group. There is no group configuration or API.

Layers: a Tooltip takes part in section 10's Escape ordering and outside-pointer dismissal as its own one-member branch, always dismissible. Topmost means the most recently successfully native-activated participating Origami Popover or Tooltip. Escape on a participating Tooltip closes it, consumes the event and never moves focus. A trusted outside primary gesture, under section 10's rules, closes it; its Trigger and Content count as inside. A Tooltip never joins, vetoes or invalidates a Popover's dismissal branch and never restores focus.

Inside Popover Content: a Tooltip whose root is inside Popover Content presents only after that Popover's coordinate/reveal commit, and is hidden at once, without exit retention and keeping its intent, while the Popover is closed, suppressed or destroyed. Outside Popover Content, including on a Popover's Trigger, it presents independently.

Presentation follows SPEC-POPOVER's protocol steps 3–7, with the Trigger as the positioning reference: transparent preparation, zero-argument `showPopover()`, a guarded coordinate commit and reveal, then Presence animation discovery; a visible exit keeps `:popover-open` and makes Content inert until Presence settles; reopening before native hide reuses the host and its order; native `toggle` and `beforetoggle` are observations only; a canceled show grants no participation and isn't retried for unchanged intent; a positioning failure hides the host without exit retention, reports once through `ErrorHandler`, keeps intent and doesn't retry an unchanged attempt. Placement axes, the supported writing modes and the flip candidates are Popover's (section 10), read from the Trigger's computed style. Opening never moves focus.

SSR emits the root, the Trigger's `aria-describedby` and Content with `popover="manual"`, `role="tooltip"`, its ID, `inert` and its text, without timers, geometry, observers or group state. An initially-open Tooltip emits `data-present` but no top-layer state, and activates natively after its own hydration without replaying an entrance. Eager and incremental hydration reuse the Trigger, Content and children without transient removal and keep server IDs. Hover before hydration is not replayed, so it neither opens a Tooltip nor warms the group. A replayed `focus` opens the Tooltip only if its Trigger is still focused and matches `:focus-visible`; a replayed `blur` of a refocused Trigger is ignored; a replayed `pointerdown` or `click` closes an open Tooltip. Replay applies the focus rule above in one pass: after a replayed `mousedown`, the next replayed Trigger focus opens the Tooltip only if a replayed `click` or `blur` came between them. In Safari, which doesn't focus a button on click, a keyboard focus made before hydration while the button is held therefore doesn't open it.

The consumer makes the Trigger focusable and gives it its accessible name (`aria-label` or visually hidden text); the Tooltip is its description. The consumer keeps Content outside the Trigger and non-interactive (no focusable descendants or `autofocus`), doesn't gate Content's text, and owns appearance, motion and reduced motion. Scope a custom `display` to `:popover-open` and use `gap`, not margins. To explain an unavailable action, use a focusable disabled button (`ogButton` with `focusableWhenDisabled`, section 17); a natively disabled Trigger never opens.

Exclusions: no HoverCard or interactive content; no velocity-based pointer polygon or close delay; no `popover="hint"` or `interestfor`; no touch long press; no label relation; no Trigger `disabled` input; no merging into the Trigger's `aria-describedby`; no root host attributes; no close on scroll; no configurable or scoped delay group; no public layer, floating or group API.

## 19. Browser, SSR and hydration qualification [H]

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

## 20. Acceptance structure [T]

This is the public-contract coverage map. Case definitions and handwritten consumers live in [acceptance](acceptance/README.md); [tests/acceptance](tests/acceptance/README.md) executes them against the packed package. 0.0.1 passed the full gate at `6f898e7` (2,928/2,928 across Chromium/Firefox/WebKit × development/production × eager/incremental hydration).

| Group         | Observable proof                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-Package     | Built entrypoints; no accidental root exports; strict TS/AOT/template consumers; token identity; readonly State and mode/provider negative types                            |
| T-Docs        | Complete public declaration/member TSDoc; accurate defaults, ownership and constraints; applicable examples; documentation retained in built declarations                   |
| T-Composition | Direct and host-composed consumers; upper existing/factory Options substitutions; nearest/nested State sharing; each composing directive's `state` through its template reference; no premature injection |
| T-Identity    | Native static/bound IDs; reactive association updates; mounted-only links; application isolation; rendered IDs kept through hydration; key validation; browser allocations never collide with dehydrated server IDs |
| T-Collection  | Addition/removal in DOM order; keyed moves notify no reader; reactive values; nearest-owner isolation; valid SSR ordering                                                   |
| T-Presence    | Finite completion/cancellation; no/zero/infinite animation; reduced motion; reversal; concurrent hosts; destruction; real write-before-read observation                     |
| T-Collapsible | Enabled/disabled activation, also by the Trigger's own disabled, and a focusable disabled Trigger; Presence-retained hiding; native/progressive until-found behavior; role cardinality and remount; parts split across components complete in server HTML |
| T-Accordion   | Single/multiple contracts; unknown values; immutable array toggles; combined disabled; non-collapsible focusability and its disabled attributes under every change order; factory writable signals; exactly-once outputs/reentry |
| T-Popover     | Required parts; co-location; the Trigger's own disabled in server HTML and through hydration; nesting/veto; trusted pointer lifetime; topmost Escape; reentry; focus eligibility; exit interaction; layout ownership and tracking; Content in a child component complete in server HTML |
| T-Toggle      | Native activation exactly once; form type; always-present `aria-pressed`; disabled blocks only user activation; replacement precedence                                      |
| T-Tabs        | Click/keyboard selection exactly once; automatic/manual; orientation and RTL mapping; Home/End/wrap/disabled skipping; single tab stop, click focus and focus repair; null/unknown/Panel-only/removed/disabled-selected policies; mounted-only associations; Panel tab stop override; SSR tab stop in DOM order; repeated required-input Triggers and later `@for` Panels complete in server HTML |
| T-ToggleGroup | Single/deselect and multiple activation exactly once; unknown values kept; immutable arrays; Toggle composition driven by upper item Options only; moves never press; orientation and RTL mapping; Home/End/wrap/disabled skipping; single tab stop, click focus and focus repair; `role="group"` without `aria-orientation`; SSR tab stop in DOM order, also with repeated required-input items |
| T-Toolbar     | `role="toolbar"` with `aria-orientation`; buttons only, native disabled skipped; orientation and RTL mapping; Home/End/wrap; single tab stop across Toolbar groups with no preferred pressed item, re-entry on the first enabled control; Toolbar group orientation overridden; arrow order in DOM order after keyed moves; click focus and focus repair; a Toolbar Toggle, and a Toolbar Popover Trigger disabled by its own input or its Popover; a standalone group in Popover Content keeps its own tab stop; a Toolbar group outside a Toolbar fails through DI; SSR tab stop in DOM order across a Toolbar group and with repeated required-input items, and with a Toolbar Toggle and Popover Trigger |
| T-RadioGroup  | `radiogroup` with `radio` items and always-present `aria-checked`; click/Space/Enter check exactly once, no unchecking, no submit; all-four-arrow moves check exactly once with RTL mapping, Home/End, wrap and disabled skipping; Tab entry on the checked item, otherwise the first enabled; revalidation of a move or click target changed by its focus handlers; focus repair without checking; null/unknown/removed/disabled-checked policies; in a Toolbar Radio Group arrows never check and Space/Enter/click do; a standalone group in Popover Content keeps its own tab stop; replacement precedence; SSR tab stop in DOM order, also with repeated required-input items |
| T-Button      | `type="button"` and the disabled attributes with and without `focusableWhenDisabled`; a focusable disabled Button's own click listener runs; replacement precedence; every button part's `focusableWhenDisabled` with its activation guard exercised by a trusted click; arrows reach focusable disabled items without selecting or checking, the tab-stop order, focus kept when an item becomes disabled but focusable; SSR attributes kept through hydration |
| T-Tooltip     | `role="tooltip"` manual Content with a mounted-only description resolving while closed and inert; hover delay, grace area across the gap in every placement, Content hover; keyboard focus opens at once, pointer focus doesn't; touch never opens; activation, Escape and outside close; leave and blur close only intent-opened Tooltips; a natively disabled Trigger never opens; co-applied button primitives keep their own disabled; delay group warm window, single-open and transit deferral; Escape order with Popover in both orders; outside dismissal without vetoing a Popover; presentation inside Popover Content; placement and positioning failure; motion, retained exit, canceled show; replacement precedence; SSR description and text, initially-open resumption, focus replay, unreplayed hover |
| T-Hydration   | Development/production serving; eager/deferred node retention; no transient duplication; generated identity; event replay; post-hydration interaction                       |
| T-Support     | Skipped formal Baseline audit recorded without certification; optional enhancement degradation; explicit Chromium/Firefox/WebKit runtime evidence and stated limits         |

Acceptance tests use public imports and genuine dependency behavior, not private Context methods or fake Angular APIs. Real animation/native platform claims need real browser observations; jsdom units alone cannot prove geometry, trusted input, focus or hydration.

A change to a requirement updates its cases and assertions in the same change. Test cases may not invent semantics this contract leaves unresolved. No full router-style evaluator framework is assumed necessary.

## 21. Scope, growth and exclusions [X]

The catalogue grows one consumer-backed primitive at a time. A concrete consumer need justifies a primitive; its frequency in other libraries does not. Each new primitive adds its own section to this contract, with acceptance cases and gate coverage, before or with its implementation (section 23).

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
3. Popover replaces CSS-anchor/source-associated positioning with approved native-manual + Floating UI presentation, authored Tab order, typed side/align/gap Content configuration and coordinated native/Presence timing. The formal Baseline audit is explicitly skipped without a certification claim.
4. Qualification expands from demonstrated Chromium/development eager hydration to three engines and development/production eager/deferred runtime proof.

Changing shipped behavior or public API is a deliberate change to this contract: the contract changes with it, and no guarantee is weakened silently.

## 22. Extraction source and dependency research

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

A filesystem-read-only inspector independently identified the Baseline conflict, until-found gap, construction-order identity risk and deferred Presence proof gap. Main disposition: support conflicts accepted as evidenced; hydration risks accepted as required proof/design questions, **not reproduced defects**. User decisions resolve the first three policy boundaries as recorded in section 1. Popover's hybrid design/API/lifecycle is approved as recorded in section 11; the formal Baseline audit was explicitly skipped. Runtime qualification follows section 19.

## 23. Adding a primitive

A new primitive ships with:

- Its own section in this contract, with its own section ID: selectors, export names, Options/State shapes, behavior, SSR/hydration semantics and exclusions, plus its rows in section 4's entrypoint and shape tables.
- Options → private Context → readonly State composition per section 3, including typed Options substitution and `hostDirectives` composition: an Options token for every application-applied directive with an input or model (section 3, Configuration), and an `exportAs` and readonly `state` on every application-applied directive that provides or composes a State (section 3, Context and State); internal `ɵ` composition directives are exempt.
- Complete public TSDoc per section 4.
- A `<primitive>/README.md` with its usage, linked from the package README's entry-point table.
- SSR plus eager and incremental hydration per section 19.
- Chromium, Firefox and WebKit qualification in development and production.
- Acceptance cases in [acceptance/CASES.md](acceptance/CASES.md), a group in section 20's coverage map and assertions in the acceptance gate.
- A design map in `<primitive>/DESIGN.md`, approved by loozo before implementation and checked against the code before sign-off. It records ownership and read timing only:
  - who owns each fact the primitive depends on, and who reads it;
  - for every read of state another part owns: the reader, the lifecycle phase (construction, render, after render, event), the platform, and what the reader gets if the owner's inputs aren't set yet;
  - every place where correctness depends on Angular refreshing a view again.

  Render-time reads follow section 3's registration rules: a part reads its own Options, its ancestors' Options and State, and registrations other parts have made. A direct render-time read of a sibling's Options isn't valid: repeated items, later sibling views and child components are layouts where the sibling's inputs aren't set yet.
