# @loozo/origami-ui — product contract

**Status: 0.0.1 published to npm on 2026-10-15, qualified on Angular 22.2.2 in Chromium, Firefox and WebKit. Toggle (section 12), Tabs (section 13), ToggleGroup (section 14), Toolbar (section 15), RadioGroup (section 16), Button (section 17), Tooltip (section 18), Field (section 19), Checkbox (section 20), Switch (section 21), Dialog with AlertDialog and its opener (section 22) and Select (section 23) were added after 0.0.1 and are unreleased. Formal Baseline audit skipped; no Baseline certification claim.**

This is the normative contract for the public API, behavior, composition architecture and acceptance requirements of `@loozo/origami-ui`; Popover's presentation design is specified in [SPEC-POPOVER.md](SPEC-POPOVER.md). A change to any of them updates this contract in the same change. How the package was rebuilt and moved into loozo is recorded in [PROVENANCE.md](PROVENANCE.md). No formal Baseline qualification claim is made; full browser/runtime proof is mandatory.

## 1. Product scope

An Angular headless primitive library containing Collection, Presence, Collapsible, single/multiple Accordion, Popover, Toggle, Tabs, single/multiple ToggleGroup, Toolbar, RadioGroup, Button, Tooltip, Field, Checkbox, Switch, modal Dialog with its AlertDialog variant and its programmatic opener, single-choice Select, with public utilities for deferred injection and generated identity. It is proved through handwritten consumers using public package imports, including consumer-owned directives composed through `hostDirectives`.

Decisions:

- The catalogue grows one consumer-backed primitive at a time, as section 26 describes.
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

Every directive applications apply, directly or through `hostDirectives`, that has an input or model is configured through an Options token, with signal properties, inputs and defaults. A variant with the same inputs as another directive, such as a Toolbar group or a Toolbar control, uses that directive's token. AlertDialog, a root of its own kind that composes the Dialog root, has its own token with the Dialog root's members and supplies the composed root's Options from it (section 22). Options are substitutable using typed `provideExisting(() => Token)` and `provideFactory(() => options)` helpers. Each helper returns one provider for the Options token. Consumers apply a primitive directly in a template or through `hostDirectives`; a replacement goes in the providers of the directive or component that composes the primitive, which Angular resolves after its host directives', so it wins over the primitive's own default. A consumer directive whose selector co-matches the primitive's on the same element is not supported.

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

A Signal Forms `touch` output (sections 12, 14, 16, 20 and 21) follows this rule except that State doesn't re-expose it: it is Angular's form notification, not observable State.

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
Collapsible trigger, Popover trigger, Tabs trigger, RadioGroup item, Toggle, Checkbox, Switch, Dialog trigger, Dialog close ──► Button
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
Field Control, Checkbox, Switch, Toggle, RadioGroup, ToggleGroup Single / Multiple ──► package-private Field membership + shared description
Tooltip trigger ──► package-private shared description
Dialog content ──► Presence + package-private shared description + native modal session + dismissal layer (shared with Popover)
AlertDialog root ──► Dialog root (+ package-private alert dialog role)
Select root ──► Popover root
Select trigger ──► Popover trigger + Popover anchor
Select content ──► Popover content
```

Single/multiple selection are concrete behavior variants, not an extensible public strategy framework. Accordion, ToggleGroup, RadioGroup and Select share package-private single/multiple write rules, generic over the value type and comparing with `===`; each widget states its own policy around them, such as Accordion's lock on a non-collapsible selection or RadioGroup's missing deselection. Select keeps its active option, typeahead and option registrations in its own package-private Context; it shares no roving focus. The roving widgets don't compose Collection: the package-private roving focus keeps its own items. A Toolbar group (section 15) provides no roving focus of its own, so its items register with the Toolbar's. There is no public generic overlay stack, state engine or registration framework; Popover and Tooltip share package-private floating and layer pieces, and Dialog Content joins the same layer (section 4). A form control joins the nearest Field (section 19) through the package-private Field membership, which registers it and reads the Signal Forms state of its own element's `[formField]`. RadioGroup and the ToggleGroup Single and Multiple roots own their membership on the public root, not on the package-private root they share with the Toolbar groups, so a Toolbar group is not a form control. A Toggle that ToggleGroup Item or Toolbar Toggle composes is a part of that widget, not a form control: the composing directive provides the package-private `ɵOrigamiToggleNotFormControl` on its element, and the Toggle then registers with no Field and adds nothing to the element's description. Every directive that names IDs in its element's `aria-describedby`, a Field control and the Tooltip Trigger, composes the package-private shared description (section 4) instead of binding the attribute itself: Angular creates one instance of a host directive per element however many matched directives compose it, so co-applied describers share one binding, and each registers its IDs with it.

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
| `/field`       | `OrigamiField`, `OrigamiFieldState`, `OrigamiFieldLabel`, `OrigamiFieldLabelOptions`, `OrigamiFieldControl`, `OrigamiFieldControlOptions`, `OrigamiFieldDescription`, `OrigamiFieldDescriptionOptions`, `OrigamiFieldError`, `OrigamiFieldErrorOptions` |
| `/checkbox`    | `OrigamiCheckbox`, `OrigamiCheckboxOptions`, `OrigamiCheckboxState` |
| `/switch`      | `OrigamiSwitch`, `OrigamiSwitchOptions`, `OrigamiSwitchState` |
| `/dialog`      | `OrigamiDialog`, `OrigamiDialogOptions`, `OrigamiDialogState`, `OrigamiAlertDialog`, `OrigamiAlertDialogOptions`, `OrigamiDialogTrigger`, `OrigamiDialogTriggerOptions`, `OrigamiDialogContent`, `OrigamiDialogContentOptions`, `OrigamiDialogContentState`, `OrigamiDialogTitle`, `OrigamiDialogTitleOptions`, `OrigamiDialogDescription`, `OrigamiDialogDescriptionOptions`, `OrigamiDialogClose`, `OrigamiDialogCloseOptions`, `injectOrigamiDialogOpener`, `OrigamiDialogRef`, type `OrigamiDialogOpener`, type `OrigamiDialogBindings` |
| `/select`      | `OrigamiSelect`, `OrigamiSelectOptions`, `OrigamiSelectState`, type `OrigamiSelectOptionRecord`, `OrigamiSelectTrigger`, `OrigamiSelectTriggerOptions`, `OrigamiSelectContent`, `OrigamiSelectContentOptions`, `OrigamiSelectOption`, `OrigamiSelectOptionOptions`, `OrigamiSelectOptionState` |

The inventories include the approved Popover placement exports and four-property Content Options. Collapsible and Popover Trigger Options carry `id`, `disabled` and `focusableWhenDisabled`, and Accordion Trigger Options carry `id` and `focusableWhenDisabled`; Collapsible Panel, Accordion Panel and Popover Anchor Options carry only `id`. The Toolbar's item and controls have no Options token of their own: `OrigamiToolbarItem` uses `OrigamiButtonOptions`, `OrigamiToolbarToggle` `OrigamiToggleOptions` and `OrigamiToolbarPopoverTrigger` `OrigamiPopoverTriggerOptions`.

The Accordion entrypoint also exposes `ɵOrigamiAccordionRoot` for compiled composition. Preserve whatever export visibility Angular packaging requires; it is not a supported application authoring API. Removing its importability is a deliberate API change made through this contract, not a side effect of a refactor.

The Collection entrypoint also exposes `ɵOrigamiRovingFocusContext` and `ɵOrigamiRovingFocusOptions`, package-private ordered-focus infrastructure for Origami's composite widgets, and `ɵrequestSingleSelection` and `ɵrequestMultipleSelection`, the package-private single/multiple selection write rules Accordion, ToggleGroup, RadioGroup and Select share (section 26). The ToggleGroup and RadioGroup entrypoints expose `ɵOrigamiToggleGroupRoot` and `ɵOrigamiRadioGroupRoot`, the internal roots their standalone and Toolbar groups compose, and the Toolbar entrypoint exposes `ɵOrigamiToolbarControl`, the internal roving control its item, Toggle and Popover Trigger compose. None of them is an application API.

The Popover entrypoint also exposes `ɵOrigamiFloating`, the package-private native manual top-layer presentation that Popover and Tooltip Content use, and its host and part types `ɵOrigamiFloatingHost`, `ɵOrigamiFloatingParts` and `ɵOrigamiFloatingContent`. It lives behind the Popover entrypoint because secondary entrypoints share code only through entrypoints, and it is not an application API.

The Field entrypoint also exposes `ɵOrigamiFieldMembership`, the package-private registration of a form control with its nearest Field and the reader of its own element's Signal Forms state, which `ogFieldControl`, Checkbox, Switch, Toggle, RadioGroup and the ToggleGroup Single and Multiple roots use (sections 12, 14, 16 and 19 to 21). The Toggle entrypoint exposes `ɵOrigamiToggleNotFormControl`, the package-private token ToggleGroup Item and Toolbar Toggle provide on their element so that their composed Toggle joins no Field (section 3). Neither is an application API.

The Utilities entrypoint also exposes `ɵOrigamiDescribedBy`, the package-private shared description: a selector-less directive composed only through `hostDirectives`, its element's single `aria-describedby` binding. Each describer registers reactive IDs from its `ngOnInit`, removed when it is destroyed. The attribute names every registration's IDs in registration order, which is the order the describers initialize: Angular's directive order on the element, set by the consumer's `imports` order or `hostDirectives` order. While no registration names an ID it is the element's static `aria-describedby`, read when the element is created; otherwise it is absent. Under hydration the element is the server's and already carries this binding's output, so once the registrations' IDs, joined with a space, ever equal a value read at creation exactly, that value is the server's output, not a static value: from then on there is no static fallback. Until then it stays the fallback, so while no registration names an ID the attribute keeps that value, which is the server HTML. Describers register in different refresh passes, one in a child component's view after the element's host bindings, so the IDs may first name only part of the server's list. Two edges follow: a static value equal to exactly the IDs Origami names at any time is treated as absent, and describers that changed while the element was still dehydrated in a separate `@defer` boundary (section 24, associations across a hydrate boundary) leave the server's IDs as the static value. The Tooltip Trigger registers its mounted Content's ID, and a Field control the Field's Descriptions, then its mounted Errors, while it is the Field's control (sections 18 to 21). It is not an application API.

The Utilities entrypoint also exposes the package-private dismissal layer and presentation contract that Popover and Tooltip are built from: `ɵOrigamiLayer`, the Escape and outside-pointer participation of each Popover and Tooltip root, with its host type `ɵOrigamiLayerHost` and the requested intent `ɵOrigamiIntent`; `ɵOrigamiPresentation`, what a layer and a nested presentation read from a presentation, which `ɵOrigamiFloating` implements, and `ɵOrigamiPresentationChild`, what a presentation reads from a nested one; `ɵOrigamiPresentationScope`, which Popover Content provides so a Tooltip inside presents only while that Popover does (section 18); and `ɵflatTreeContains`, the flat-tree containment, through shadow roots and slot assignment and excluding undistributed light-DOM children and replaced slot fallback content. The layer also keeps every registered modal owner, Dialog Content's session, as a modal scope: a layer's scope is the innermost Dialog whose `<dialog>` contains all of its parts in the flat tree, computed from the DOM when synchronizing or handling an event, never during render. A Popover without a parent Popover and a Tooltip outside Popover Content present under their scope, a Popover joins its dismissal branch, and a Dialog is nested in its scope (sections 10, 18 and 22), however the parts got inside: declared in Content, projected through `<ng-content>`, in a shadow root or slotted. Dialog Content also uses `ɵflatTreeContains` to tell whether focus was left inside its closed dialog. They live in Utilities so that a primitive can join the layer without depending on Popover, as Dialog does. None of them is an application API.

`@angular/forms` `~22.2.2` is a required peer dependency, like `@angular/common` and `@angular/core`.

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
| Toggle, also for `OrigamiToolbarToggle`                                     | `checked: WritableSignal<boolean>`, `disabled: Signal<boolean>`, `focusableWhenDisabled: Signal<boolean>`, `id: Signal<string>` |
| Tabs root                                                                   | `value: WritableSignal<string \| null>`, `disabled: Signal<boolean>`, `orientation: Signal<OrigamiTabsOrientation>`, `activation: Signal<OrigamiTabsActivation>` |
| Tabs Trigger                                                                | `value: Signal<string>`, `id: Signal<string>`, `disabled: Signal<boolean>`, `focusableWhenDisabled: Signal<boolean>`  |
| Tabs Panel                                                                  | `value: Signal<string>`, `id: Signal<string>`                                                                         |
| ToggleGroup Single, also for `OrigamiToolbarToggleGroupSingle`             | `value: WritableSignal<string \| null>`, `disabled: Signal<boolean>`, `orientation: Signal<OrigamiToggleGroupOrientation>`, `deselectable: Signal<boolean>` |
| ToggleGroup Multiple, also for `OrigamiToolbarToggleGroupMultiple`         | `value: WritableSignal<readonly string[]>`, `disabled: Signal<boolean>`, `orientation: Signal<OrigamiToggleGroupOrientation>` |
| ToggleGroup Item                                                            | `value: Signal<string>`, `disabled: Signal<boolean>`, `focusableWhenDisabled: Signal<boolean>`, `id: Signal<string>` |
| Toolbar root                                                                | `orientation: Signal<OrigamiToolbarOrientation>`                                                                      |
| RadioGroup root, also for `OrigamiToolbarRadioGroup`                        | `value: WritableSignal<string \| null>`, `disabled: Signal<boolean>`                                                  |
| RadioGroup Item                                                             | `value: Signal<string>`, `disabled: Signal<boolean>`, `focusableWhenDisabled: Signal<boolean>`                        |
| Button, also for `OrigamiToolbarItem`                                       | `disabled: Signal<boolean>`, `focusableWhenDisabled: Signal<boolean>`                                                 |
| Tooltip root                                                                | `open: WritableSignal<boolean>`, `disabled: Signal<boolean>`, `openDelay: Signal<number>`                             |
| Tooltip Content                                                             | `id: Signal<string>`, `side: Signal<OrigamiTooltipSide>`, `align: Signal<OrigamiTooltipAlign>`, `gap: Signal<number>` |
| Each Field Label, Control, Description and Error                            | its own Options token with `id: Signal<string>`                                                                       |
| Checkbox; Switch, each its own token                                        | `checked: WritableSignal<boolean>`, `disabled: Signal<boolean>`, `focusableWhenDisabled: Signal<boolean>`, `id: Signal<string>` |
| Dialog root                                                                 | `open: WritableSignal<boolean>`, `dismissible: Signal<boolean>`                                                       |
| AlertDialog root, its own token                                             | `open: WritableSignal<boolean>`, `dismissible: Signal<boolean>`                                                       |
| Dialog Trigger                                                              | `id: Signal<string>`, `disabled: Signal<boolean>`, `focusableWhenDisabled: Signal<boolean>`                           |
| Dialog Content                                                              | `id: Signal<string>`, `returnFocus: Signal<HTMLElement \| null>`                                                      |
| Each Dialog Title and Description                                           | its own Options token with `id: Signal<string>`                                                                       |
| Dialog Close                                                                | `disabled: Signal<boolean>`, `focusableWhenDisabled: Signal<boolean>`                                                 |
| Select root, generic over `T extends string \| number \| boolean`           | `value: WritableSignal<T \| null>`, `open: WritableSignal<boolean>`, `disabled: Signal<boolean>`                      |
| Select Trigger                                                              | `id: Signal<string>`, `disabled: Signal<boolean>`, `focusableWhenDisabled: Signal<boolean>`                           |
| Select Content                                                              | Popover Content's: `id`, `side`, `align`, `gap`                                                                        |
| Select Option, generic over `T`                                             | `value: Signal<T>`, `disabled: Signal<boolean>`, `label: Signal<string \| null>`, `id: Signal<string>`               |

| State           | Readonly signals                                                                       |
| --------------- | -------------------------------------------------------------------------------------- |
| Collection      | `items: Signal<readonly OrigamiCollectionRecord[]>`                                    |
| Presence        | `phase: Signal<'opening' \| 'open' \| 'closing' \| 'closed'>`, `open: Signal<boolean>` |
| Collapsible     | `expanded: Signal<boolean>`, `disabled: Signal<boolean>`                               |
| Accordion       | `itemValues: Signal<readonly string[]>`, `disabled: Signal<boolean>`                   |
| Popover root    | `open: Signal<boolean>`, `disabled: Signal<boolean>`, `dismissible: Signal<boolean>`   |
| Popover Content | `open: Signal<boolean>`; no public Presence phase alias                                |
| Toggle          | `checked: Signal<boolean>`, `disabled: Signal<boolean>`; no form state and no `touch`  |
| Tabs            | `value: Signal<string \| null>`, `disabled: Signal<boolean>`, `orientation: Signal<OrigamiTabsOrientation>`, `activation: Signal<OrigamiTabsActivation>` |
| ToggleGroup     | `disabled: Signal<boolean>`, `orientation: Signal<OrigamiToggleGroupOrientation>`; no `value`, whose type differs by mode; no form state and no `touch` |
| Toolbar         | `orientation: Signal<OrigamiToolbarOrientation>`                                       |
| RadioGroup      | `value: Signal<string \| null>`, `disabled: Signal<boolean>`; no form state and no `touch` |
| Tooltip         | `open: Signal<boolean>`, `disabled: Signal<boolean>`                                   |
| Tooltip Content | `open: Signal<boolean>`; no public Presence phase alias                                |
| Field           | `invalid: Signal<boolean>`, `touched: Signal<boolean>`, `disabled: Signal<boolean>`, `required: Signal<boolean>`, `errors: Signal<readonly ValidationError[]>`, `errorsShown: Signal<boolean>` |
| Checkbox; Switch | `checked: Signal<boolean>`, `disabled: Signal<boolean>`; no form state and no `touch`  |
| Dialog, also for `OrigamiAlertDialog` | `open: Signal<boolean>`, `dismissible: Signal<boolean>`                  |
| Dialog Content  | `open: Signal<boolean>`; no public Presence phase alias                                |
| Select, generic over `T` | `value: Signal<T \| null>`, `open: Signal<boolean>` (participation), `disabled: Signal<boolean>`, `selectedOption: Signal<OrigamiSelectOptionRecord<T> \| null>`; no form state |
| Select Option   | `selected: Signal<boolean>`, `active: Signal<boolean>`, `disabled: Signal<boolean>`    |

Popover Content inputs default to `side: 'block-end'`, `align: 'start'`, `gap: 0` CSS px. Side is `'block-start' | 'block-end' | 'inline-start' | 'inline-end'`; align is `'start' | 'center' | 'end'`. Gap must be finite and nonnegative. All four Content Options properties are required; defaults on an unused directive do not repair an incomplete replacement.

Tooltip root inputs default to `open` false, `disabled` false and `openDelay` 600 ms; the delay must be finite and nonnegative. Tooltip Content inputs default to `side: 'block-start'`, `align: 'center'` and `gap: 0` CSS px, with Popover's unions and gap rule. All four Content Options properties are required. The Tooltip Trigger has no inputs and no Options token.

State signals reject `.set` and `.update` at compile time. Shared Accordion Options do not contain mode-specific `value` or `collapsible`; Multiple Options do not contain Single's `collapsible` property. ToggleGroup Multiple Options do not contain Single's `deselectable` property, and there are no shared ToggleGroup root Options. Toolbar has no root `disabled`. RadioGroup has a single mode and no orientation. The Field root has no inputs and no Options token, and its State has no `readonly` or value.

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

Every Origami `id` input default uses `injectUniqueId`, and every `value` input default uses `injectUniqueValue`, except the Select Option's `value`, which is required and has no default (section 23).

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

No generic `data-state` replacement is introduced. The attributes above describe immediate direct-Presence/Collapsible timing. The approved floating presentation adapter (Popover and Tooltip Content) permits a preparatory `opening` interval before `data-entering`; entering attributes and completion discovery wait for its matching coordinate/reveal commit. Dialog Content uses the same adapter for its modal session (section 22): its entering attribute isn't deferred, discovery waits for `showModal()`, and once the session ends a close settles without reveal/discovery. Visible exit discovery follows its own leaving WRITE without a new geometry prerequisite; nonvisual close settles without reveal/discovery. See section 11 and the approved design.

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

- Escape targets the topmost participating Origami layer (`ɵOrigamiLayer`, section 4), a Popover, a Tooltip (section 18) or a modal Dialog (section 22). While an Origami modal Dialog participates, only the newest one and the layers whose parts are inside its `<dialog>` in the flat tree, also in a component's shadow root inside it or assigned to a `<slot>` inside it, are eligible; a part in a light-DOM subtree that no slot takes, or in a slot's fallback content while nodes are assigned to that slot, isn't in the flat tree. Already-consumed and composing key events are ignored. A veto consumes that request; it must not fall through to another root or ancestor.
- An outside-pointer dismissal requires a trusted primary-button gesture whose down and matching up are outside the affected branch. A drag starting inside and ending outside does not dismiss. Prevented down or up events and mismatched pointer/button invalidate the gesture. Cancellation or lost capture before the matching pointerup invalidates acquisition; cancellation or capture loss after that pointerup does not veto the completed gesture. Dismissal is deferred until the pointerup dispatch has finished so later listeners can prevent that up event, and the affected branch must still be current when dismissal runs.
- A nested descendant counts as inside its ancestor for outside detection.
- A Popover without a parent Popover whose Trigger, Anchor and Content are inside a Dialog's `<dialog>` in the flat tree, as above, is a descendant of the branch of the innermost such Dialog, its modal scope (section 4), whether its root is declared inside Content, co-applied with it, projected into it through `<ng-content>` or slotted into it. While it participates, an outside gesture closes only it and leaves the Dialog open (section 22). Popovers nested in Popovers keep the branch rule above. The scope is read from the DOM when the Popover synchronizes and at each event: a move that isn't a signal change, such as a changed `slot` attribute, counts from the next one.
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

Content exposes two inline custom properties in CSS pixels, written by Floating UI's `size` middleware after `flip` during each position calculation in the browser, never on the server: `--og-anchor-width`, the Anchor's border-box width, and `--og-available-height`, the height Content can take without overflowing the viewport in the placement `flip` chose (from the gap to the viewport edge on a top/bottom side; from the aligned edge, or both ways from the center, on a left/right side), clamped to 0. Only the calculation for the latest position request writes them, so a Content resize they cause is measured again before its coordinates commit. They're absent before the first calculation and keep their last values while closed. They size nothing themselves and are physical in every writing mode. No other sizing, `shift` or public middleware is added.

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

No source inspection, skipped audit or design approval substitutes for the required browser proof in section 24.

## 12. Toggle [G]

Selector/export name:

- `button[ogToggle]`, `exportAs: 'ogToggle'`.

Configuration: `checked` boolean model false, `disabled` boolean input false, `focusableWhenDisabled` boolean input false and `id` input defaulting to a generated ID, through `OrigamiToggleOptions`. The directive exposes readonly State and a `touch` output. Toggle is a two-state button; it has no mixed or unknown value. `checked` is its pressed state: the model is named for Angular Signal Forms, and the DOM keeps button semantics.

Host semantics:

- Native button semantics, no custom keyboard reimplementation of Enter/Space.
- Effective `id`.
- `aria-pressed` is always present, `"true"` or `"false"`, reflecting effective checked state.
- `data-pressed` is empty while checked and absent otherwise.
- Toggle composes Button (section 17), which binds `type="button"` and, from Toggle's effective `disabled` and `focusableWhenDisabled`, sets `aria-disabled="true"`, empty `data-disabled` and native `disabled` unless `focusableWhenDisabled` while disabled; they are absent while enabled. A focusable disabled Toggle ignores activation, but its own `(click)` listeners still run.
- An enabled activation writes the negation of the effective checked state to the effective Options exactly once. A user activation, also through a label click, is dropped while effectively disabled, focusable or not, and while the `[formField]` on the same element is readonly. External Options, model and form writes remain authoritative.

Signal Forms: Toggle implements `FormCheckboxControl`. `[formField]` finds it by its `checked` model, binds that model, writes its `disabled` input from the field's `disabled()` rules and listens to its `touch` output, which it emits on every blur. It declares no other form-state input: it reads the bound field's `readonly()` through the `FORM_FIELD` on its own element (same element, optional) with the package-private Field membership (section 19). `focusBoundControl()` focuses the button through Forms' default host focus; it has no `focus` or `reset` method. A consumer directive or component that applies the Toggle through `hostDirectives` and exposes `checked` and `checkedChange` is the control `[formField]` finds; it also exposes `disabled` and `touch` for the form's disabled rules and touched state to reach the Toggle, which still reads `FORM_FIELD` on the element. A replacement Options owns the value instead of the model `[formField]` binds, so `[formField]` on an element whose Toggle has replacement Options and no consumer `checked` model is unsupported; this is documented, not guarded.

Field: the Toggle registers with its nearest Field in `ngOnInit` as its labelable control, without `ogFieldControl` (section 19). The Field's Labels name its `id` with `for`, before or after it, which gives the Toggle its accessible name, and a label click activates the button. Inside a Field its `aria-describedby` names the Field's Descriptions, then its mounted Errors, through the shared description (section 4), merged with the IDs of a co-applied Tooltip Trigger (section 18) in the order the two initialize; a static `aria-describedby` is kept only while neither names an ID. It binds no `aria-invalid`, `aria-required` or `aria-readonly`: ARIA 1.2 deprecates `aria-invalid` on `button` and supports neither of the others there, so the Field's data attributes and State carry them. Outside a Field, and as a second control the Field ignores, it binds only its `id` and keeps a static `aria-describedby`.

ToggleGroup Item (section 14) and Toolbar Toggle (section 15) compose Toggle as a part of their widget, not as a form control: they provide the package-private `ɵOrigamiToggleNotFormControl` (section 3), so their Toggle registers with no Field, inside an `ogField` or not, and the element keeps its static `aria-describedby`.

Each Toggle element owns its own Context and State; descendants of the button observe that State. State `checked` and `disabled` are the effective Options' values: the form's disabled rules reach `disabled` through the input, form readonly isn't State, and State doesn't re-expose `touch` (section 3, Events). There is no parent owner, part registration or cardinality other than the Field's.

Server HTML carries the effective `id`, `aria-pressed`, `data-pressed` and disabled attributes, the Label's `for` and the Toggle's `aria-describedby`. Eager and incremental hydration reuse the server button and keep its ID; an initiating activation replayed after hydration reaches the effective checked state exactly once.

The consumer supplies the accessible name (a Field Label, `aria-label` or `aria-labelledby`), which should stay the same when the checked state changes, and owns styling, label or icon changes and side effects such as persistence.

Exclusions: no mixed state, hidden `<input>`, `name`, native form submission or reset; no `invalid`, `required`, `readonly` or `errors` input, and no `aria-invalid`, `aria-required` or `aria-readonly`; no `pressed` model. A standalone Toggle has no group or roving focus; ToggleGroup (section 14) composes it, and `ogToolbarToggle` is a Toggle that is one Toolbar control (section 15).

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

Configuration: Single has a `value: string | null` model null, `disabled` boolean input false, `orientation: 'horizontal' | 'vertical'` input default `'horizontal'` and `deselectable` boolean input false. Multiple has a `value: readonly string[]` model defaulting to empty, `disabled` and `orientation`; it has no `deselectable`. Both roots expose the same readonly State, which descendants inject, a `touch` output and a `focus(options?: FocusOptions)` method. Item: `value` input defaulting to a generated string, `disabled` boolean input false, `focusableWhenDisabled` boolean input false and `id` input defaulting to a generated ID. Values within one group are expected to be distinct and are not validated.

Item Options feed the composed Toggle's Options, so replacing only the upper item Options drives the item's value and the Toggle's checked (pressed), disabled and focusable state and its `id`, which the Toggle binds as the button's `id`; consumers never provide Toggle Options. An item registers with the roving focus in `ngOnInit` (section 3); other items read its Options only once it has registered, so replacement item Options may use required inputs, and repeated items in `@for` are read only after Angular sets their inputs. The item exposes readonly `state`, its composed Toggle's State: `checked` follows the group value and `disabled` is the combined root and item disabled state; descendants of an item inject the same State. ToggleGroup adds no item State of its own. Items belong to the nearest root and fail through Angular DI without one. An item is not also matched by `ogToggle`. A root inside a non-item descendant of another root is fully independent.

Host semantics:

- Root: static `role="group"`, which a consumer's static `role` overrides; `data-orientation` reflects effective orientation; `data-disabled` is empty while root-disabled and absent otherwise. There is no `aria-orientation`, which ARIA does not allow on `group`. Inside a Field, `aria-labelledby` and `aria-describedby` (below). The consumer supplies the accessible name, with a Field Label inside a Field.
- Item: Toggle's host semantics (section 12) driven by the group: `type="button"`, `id`, `aria-pressed` always `"true"` or `"false"`, empty `data-pressed` while pressed, and while root- or own-disabled `aria-disabled="true"`, empty `data-disabled` and native `disabled` unless `focusableWhenDisabled`. ToggleGroup adds `tabindex` `"0"` on the single tab stop and `"-1"` on every other item.
- Both modes use `group` and `aria-pressed` buttons, not `radiogroup` and `radio`: `aria-pressed` is not valid on `radio`, and radio semantics, where selection follows focus, are RadioGroup's (section 16).
- A pressed Single item that cannot be deselected is not `aria-disabled`; it stays an ordinary enabled pressed button.

Selection, ToggleGroup's own policy:

- Single: an enabled native activation (click, Enter or Space) of an unpressed item writes its value once. Activating the pressed item writes null once when `deselectable`; otherwise it writes and emits nothing and the item stays `aria-pressed="true"`.
- Multiple: an enabled activation adds the value at the end of a new array or removes it into a new array. Every other value, including values no item has, keeps its order; the caller's array is never mutated.
- Null, or a value no mounted item has, presses nothing and is kept. ToggleGroup never writes the model without user action: removing an item does not prune and no value is normalized.
- Root and item disabled state combine and block only user activation. A user activation is also dropped while the `[formField]` on the root's element is readonly; focus still moves. External Options, model and form writes remain authoritative while disabled or readonly and emit no output from an unused model. A write to the composed Toggle's effective `checked` Options under an item is a group request under the same policy; it never moves focus.
- A rejected request writes nothing; pressed state never runs ahead of the group value.

Keyboard and focus follow section 13's rules, reading "pressed" for "selected": arrows along the effective orientation (horizontal arrows read the item's computed `direction` at key time), Home and End, wrapping, skipping disabled items that aren't focusable and the ignored keys; exactly one item is the tab stop (the focused item, otherwise the first enabled pressed item in DOM order, otherwise the first enabled item, otherwise the first focusable disabled item; none when no item is enabled or focusable), with section 13's DOM order reading; focus repair never takes focus the application moved elsewhere, and a focused item that becomes disabled but stays focusable keeps focus. Differences:

- Moves never press. Focus arriving by a move, Tab, pointer, activation, script or focus repair never presses.
- A click runs the composed Toggle's click listener first, which requests the press, and then the item's, which focuses the item if it is still mounted and enabled or focusable. A click therefore makes the item the tab stop and the origin of the next keyboard move even in engines whose click doesn't focus a button. This "toggle, then focus" order was observed in Chromium, Firefox and WebKit; as a result, a focus handler that disables or removes the item during a click doesn't undo the request already made, and focus repair then moves focus to the tab stop.
- External value writes never move focus.

Inside a Toolbar: `ogToggleGroupSingle` and `ogToggleGroupMultiple` provide their own roving focus wherever they are, so inside a Toolbar they keep their own tab stop. To share the Toolbar's tab stop, use the Toolbar's Toggle Groups (section 15).

Signal Forms: both roots implement `FormValueControl`, Single for `string | null` and Multiple for `readonly string[]`, so a `string[]` form model binds to Multiple. `[formField]` finds a root by its `value` model, binds that model, writes its `disabled` input from the field's `disabled()` rules and listens to its `touch` output. The root emits `touch` on `focusout` when focus moves to an element outside the root or to nothing, not while focus moves between its items. On engines where a click doesn't focus a button (macOS Safari; macOS Firefox by default), clicking from one item to another moves focus to nothing first, so it marks the field touched. `focusBoundControl()` calls the root's `focus(options?)`, which focuses the item holding the tab stop (above), passing the options to its native `focus()`, and does nothing while no item can take focus. A root declares no other form-state input: it reads the bound field's `readonly()` through the `FORM_FIELD` on its own element (same element, optional). A consumer directive or component that applies a root through `hostDirectives` and exposes `value` and `valueChange` is the control `[formField]` finds; it also exposes `disabled` and `touch`, and Forms calls `focus()` on it, not on the composed root, so it defines its own `focus()` that calls the root's to keep `focusBoundControl()` reaching the tab stop. A replacement Options owns the value instead of the model `[formField]` binds, so `[formField]` on a root with replacement Options and no consumer `value` model is unsupported; this is documented, not guarded.

Field: a root registers with its nearest Field in `ngOnInit` as its control, without `ogFieldControl`, and a `<label for>` can't name it (section 19). While it is the Field's control, its `aria-labelledby` names the Field's Labels' IDs in registration order, before or after it, replacing a static `aria-labelledby`, and is absent while no Label is registered; its `aria-describedby` names the Field's Descriptions, then its mounted Errors, through the shared description (section 4), and a static `aria-describedby` is kept only while nothing names an ID. It binds no `aria-invalid`, `aria-required` or `aria-readonly`: ARIA 1.2 deprecates `aria-invalid` on `group` and supports neither of the others there, so the Field's data attributes and State carry them. Outside a Field, and as a second control the Field ignores, it keeps its static `aria-labelledby` and `aria-describedby`, read at construction.

Server HTML carries `role="group"`, `data-orientation`, the items' `id`, `aria-pressed`, `data-pressed`, the disabled attributes and the single `tabindex="0"`, chosen in DOM order, and inside a Field the root's `aria-labelledby` and `aria-describedby`. Eager and incremental hydration reuse the server root and items without transient removal, and hydration does not change those attributes. An initiating click on an item replayed after hydration presses exactly once. Keyboard interaction before hydration is not promised.

The consumer supplies the group's and items' accessible names, which should stay the same when the pressed state changes, and owns icons, styling and side effects.

Exclusions: no typeahead, `aria-activedescendant`, Page Up/Down or two-dimensional navigation; no `name`, native form value, submission or reset; no `invalid`, `required`, `readonly` or `errors` input, and no `aria-invalid`, `aria-required` or `aria-readonly`; an item is not a form control: its Toggle never joins a Field (section 12); no radio semantics (section 16); no mixed state; no public roving-focus or selection API.

## 15. Toolbar [K]

Selectors/export names:

- `[ogToolbar]`, `exportAs: 'ogToolbar'`.
- `button[ogToolbarItem]`; composes Button (section 17).
- `button[ogToolbarToggle]`, `exportAs: 'ogToolbarToggle'`; composes Toggle (section 12).
- `button[ogToolbarPopoverTrigger]`; composes Popover Trigger (section 10).
- `[ogToolbarToggleGroupSingle]`, `exportAs: 'ogToolbarToggleGroupSingle'`; composes the package-private ToggleGroup root.
- `[ogToolbarToggleGroupMultiple]`, `exportAs: 'ogToolbarToggleGroupMultiple'`; composes the package-private ToggleGroup root.
- `[ogToolbarRadioGroup]`, `exportAs: 'ogToolbarRadioGroup'`; composes the package-private RadioGroup root.

Configuration: the root has an `orientation: 'horizontal' | 'vertical'` input default `'horizontal'` and exposes readonly State; descendants inject it. There is no root `disabled`. Item: Button's inputs and Options, `disabled` and `focusableWhenDisabled` boolean inputs false; there is no item value. Toolbar Toggle: Toggle's `checked` model, `disabled` and `focusableWhenDisabled` inputs and `id` input defaulting to a generated ID, Options and State, which it exposes as readonly `state`; it is not a form control, and its Toggle never joins a Field (section 12). `[formField]` on a Toolbar Toggle is unsupported and not guarded: Forms finds its `checked` model and binds it, but the Toolbar Toggle emits no `touch`, so the field is never marked touched, and it never joins a Field. Toolbar Popover Trigger: the Popover Trigger's `id`, `disabled` and `focusableWhenDisabled` inputs and Options; it requires a nearest Popover and may share its button with `ogPopoverAnchor`. Items, Toolbar Toggles, Toolbar Popover Triggers and Toolbar groups belong to the nearest Toolbar and fail through Angular DI without one. A Toolbar inside another Toolbar is fully independent.

Items, Toolbar Toggles and Toolbar Popover Triggers are the Toolbar's controls. Each composes the package-private Toolbar control, which reads the control's disabled state and disabled focusability from the Button Options on its own element: the item's own, Toggle's, or the Popover Trigger's, whose disabled state is the Popover root's or its own. A control registers with the roving focus in `ngOnInit` (section 3); other controls read its Options only once it has registered, so replacement Options may use required inputs, and repeated controls in `@for` are read only after Angular sets their inputs.

Host semantics:

- Root: static `role="toolbar"`, which a consumer's static `role` overrides; `aria-orientation` always present and `data-orientation`, both reflecting effective orientation. The consumer supplies the accessible name with `aria-label` or `aria-labelledby`.
- Controls: native button semantics, `tabindex` `"0"` on the single tab stop and `"-1"` on every other control. The composed Button binds `type="button"` and, while disabled, `aria-disabled="true"`, empty `data-disabled` and native `disabled` unless `focusableWhenDisabled`; they are absent while enabled. A Toolbar Toggle adds Toggle's `id`, `aria-pressed` and `data-pressed`, and a Toolbar Popover Trigger the Popover Trigger's ID, `aria-controls` and `aria-expanded`.

Controls are buttons only. `type="button"` and Enter/Space activation come with them. Links, text inputs, sliders, spin buttons and other controls that own the arrow keys are not Toolbar controls. Other focusable content inside a Toolbar that is not a Toolbar control, such as an `<input>`, keeps its own Tab stop and its own arrow keys: arrow handling lives on the controls, not on the root, so typing in it is never intercepted. This is documented, not enforced.

A disabled control is natively disabled and skipped by arrows unless it is focusable; a focusable disabled control stays in the arrow sequence, keeps focus and ignores activation, while the consumer's own `(click)` listeners on it still run. The Toolbar never activates a control: a click, Enter or Space runs only the button's own listeners and its composed primitive's, so a Toolbar Toggle presses and a Toolbar Popover Trigger opens or closes its Popover.

Toolbar groups: `OrigamiToolbarToggleGroupSingle`, `OrigamiToolbarToggleGroupMultiple` and `OrigamiToolbarRadioGroup` are selection groups whose items share the nearest Toolbar's tab stop. Each has the same inputs, Options, State, host semantics and selection policy as `OrigamiToggleGroupSingle`, `OrigamiToggleGroupMultiple` or `OrigamiRadioGroup` (sections 14 and 16) outside a Field, takes `ogToggleGroupItem` or `ogRadioGroupItem` items, and provides no roving focus of its own: its items register with the Toolbar's, so the Toolbar has one tab stop and one arrow sequence across its own controls and the groups' items in DOM order. A Toolbar group's items navigate along the Toolbar's orientation; a Toolbar Toggle Group's own `orientation` Option has no effect, and its `data-orientation` and State report the Toolbar's. A pressed or checked item is not preferred, and moves never press or check; Click, Enter and Space still do. A Toolbar group finds its Toolbar through logical DI, so outside a Toolbar it fails through Angular DI, and inside Popover Content within a Toolbar it still joins that Toolbar. A standalone `ogToggleGroupSingle`, `ogToggleGroupMultiple` or `ogRadioGroup` inside a Toolbar, including inside Popover Content, keeps its own tab stop. A ToggleGroup or RadioGroup item registers on its own; applying a Toolbar control to it is unsupported (section 17). A Toolbar group is not a form control: it has no `touch` output or `focus()` method, never joins a Field, inside an `ogField` or not, and keeps its static `aria-labelledby` and `aria-describedby`. `[formField]` on a Toolbar group is unsupported and not guarded: Forms finds its `value` model and binds it, but the field is never marked touched and `focusBoundControl()` focuses nothing.

Keyboard and focus follow section 13's rules: arrows along the effective orientation (horizontal arrows read the focused control's computed `direction` at key time), Home and End, wrapping, skipping disabled controls that aren't focusable and the ignored keys; focus repair never takes focus the application moved elsewhere, and a focused control that becomes disabled but stays focusable keeps focus. Differences:

- No control is preferred: exactly one control is the tab stop, the focused one while focus is on one a move can reach, otherwise the first enabled control in DOM order, including Toolbar group items, otherwise the first focusable disabled control, with section 13's DOM order reading. A pressed or checked Toolbar group item is not preferred. Tab back into a Toolbar lands on its first enabled control, not the last focused one.
- Moves never activate, press or check.
- A click focuses the control if it is still mounted and enabled or focusable after its listeners ran, so it becomes the tab stop and the origin of the next keyboard move even in engines whose click doesn't focus a button. A Toolbar Toggle requests the press first, keeping ToggleGroup's "toggle, then focus" order, and a Toolbar Popover Trigger requests opening or closing first. A Toolbar Toggle Group item keeps ToggleGroup's "toggle, then focus" order; a Toolbar Radio Group item keeps RadioGroup's "focus, then check" order.
- External orientation writes never move focus.

Server HTML carries `role="toolbar"`, `aria-orientation`, `data-orientation`, the disabled attributes, Toolbar Toggles' `id`, Toolbar Toggles' and Toolbar groups' `aria-pressed`, `aria-checked` and the single `tabindex="0"`, chosen in DOM order across Toolbar group items. Eager and incremental hydration reuse the server root and controls without transient removal, and hydration does not change those attributes. An initiating click replayed after hydration runs the consumer's handler, or presses a Toolbar Toggle or presses or checks a Toolbar group item, exactly once. Keyboard interaction before hydration is not promised.

The consumer supplies the accessible name, control labels, separators (`role="separator"` with an `aria-orientation` perpendicular to the Toolbar's) and styling. APG recommends `role="toolbar"` only for three or more controls.

Exclusions: no typeahead, `aria-activedescendant`, multi-row or two-dimensional navigation; no root `disabled`; no non-button controls and no arrow-owning controls as controls; no remembered last-focused control; no separator part; no public roving-focus API.

## 16. RadioGroup [Q]

Selectors/export names:

- `[ogRadioGroup]`, `exportAs: 'ogRadioGroup'`; composes the package-private RadioGroup root, which `OrigamiToolbarRadioGroup` (section 15) also composes.
- `button[ogRadioGroupItem]`.

Configuration: the root has a `value: string | null` model null and a `disabled` boolean input false, and exposes readonly State, which descendants inject, a `touch` output and a `focus(options?: FocusOptions)` method. There is one mode and no orientation. Item: `value` input defaulting to a generated string, `disabled` boolean input false, `focusableWhenDisabled` boolean input false. Values within one group are expected to be distinct and are not validated; every item whose value is the root value is checked.

An item registers with the roving focus in `ngOnInit` (section 3); other items read its Options only once it has registered, so replacement item Options may use required inputs, and repeated items in `@for` are read only after Angular sets their inputs. RadioGroup has no item State; descendants of an item read the root's State or style from `data-checked`. Items belong to the nearest root and fail through Angular DI without one. A root inside a non-item descendant of another root is fully independent.

Host semantics:

- Root: static `role="radiogroup"`, which a consumer's static `role` overrides; `data-disabled` is empty while root-disabled and absent otherwise. The root binds no `aria-orientation` or `aria-disabled`; a consumer may write them statically. Inside a Field it binds `aria-labelledby`, `aria-describedby`, `aria-invalid`, `aria-required` and `aria-readonly` (below). The consumer supplies the accessible name with a Field Label, `aria-label` or `aria-labelledby`.
- Item: static `role="radio"`; `aria-checked` always `"true"` or `"false"`; empty `data-checked` while checked; `tabindex` `"0"` on the single tab stop and `"-1"` on every other item. Its composed Button (section 17) binds `type="button"` and, while root- or own-disabled, `aria-disabled="true"`, empty `data-disabled` and native `disabled` unless `focusableWhenDisabled`, absent while enabled.
- Items are `<button>` elements with `role="radio"`, not native `<input type="radio">`: Origami owns the tab stop, the keys and the write, so selection never runs ahead of the value and a radio can share a Toolbar's tab stop (section 15). Native button activation turns Enter and Space into one click.

Selection, RadioGroup's own policy on the shared single write rule:

- An enabled native activation (click, Enter or Space) of an unchecked item writes its value once. Activating the checked item writes and emits nothing. There is no user unchecking.
- Null, or a value no mounted item has, checks nothing and is kept. RadioGroup never writes the model without user action: no item is checked automatically, removing the checked item keeps the value and no value is normalized.
- A disabled checked item stays `aria-checked="true"`.
- Root and item disabled state combine and block only user selection. A user selection, by activation or by a move, is also dropped while the `[formField]` on the root's element is readonly; focus still moves. External Options, model and form writes remain authoritative while disabled or readonly and emit no output from an unused model.

Keyboard and focus follow section 13's rules, reading "checked" for "selected": Home and End, wrapping, skipping disabled items that aren't focusable and the ignored keys; exactly one item is the tab stop (the focused item, otherwise the first enabled checked item in DOM order, otherwise the first enabled item, otherwise the first focusable disabled item; none when no item is enabled or focusable), with section 13's DOM order reading; focus repair never takes focus the application moved elsewhere and never checks, and a focused item that becomes disabled but stays focusable keeps focus. Differences:

- All four arrows move, whatever the layout: ArrowDown and ArrowRight to the next enabled item, ArrowUp and ArrowLeft to the previous one. ArrowLeft and ArrowRight read the focused item's computed `direction` at key time and swap in right-to-left text; ArrowUp and ArrowDown ignore it.
- Every move checks the item it lands on, as Tabs' automatic activation does, also when that is the item already focused (Home on the first enabled item, End on the last, a wrap with one enabled item): only if the item is still mounted, enabled and focused after any focus handlers ran, so a move onto a focusable disabled item focuses it and checks nothing. Home and End are moves too. Focus arriving by Tab, pointer, activation, script or focus repair never checks by itself.
- Activation focuses the item and then checks it, only if the item is still mounted and enabled after its focus handlers ran; a focusable disabled item is focused and not checked. A click therefore makes the item the tab stop and the origin of the next keyboard move even in engines whose click doesn't focus a button.
- External value writes never move focus.

Inside a Toolbar: `ogRadioGroup` provides its own roving focus wherever it is, so inside a Toolbar it keeps its own tab stop and its moves check. `OrigamiToolbarRadioGroup` shares the Toolbar's tab stop instead (section 15): its arrows follow the Toolbar's orientation, so the other pair does nothing, and they only move focus; Click, Enter and Space still check the item once.

Signal Forms: the root implements `FormValueControl<string | null>`. `[formField]` finds it by its `value` model, binds that model, writes its `disabled` input from the field's `disabled()` rules and listens to its `touch` output. The root emits `touch` on `focusout` when focus moves to an element outside the root or to nothing, not while focus moves between its items. On engines where a click doesn't focus a button (macOS Safari; macOS Firefox by default), clicking from one item to another moves focus to nothing first, so it marks the field touched. `focusBoundControl()` calls the root's `focus(options?)`, which focuses the item holding the tab stop (above), passing the options to its native `focus()`, and does nothing while no item can take focus. It declares no other form-state input: it reads the bound field's `readonly()` through the `FORM_FIELD` on its own element (same element, optional). A consumer directive or component that applies the root through `hostDirectives` and exposes `value` and `valueChange` is the control `[formField]` finds; it also exposes `disabled` and `touch`, and Forms calls `focus()` on it, not on the composed root, so it defines its own `focus()` that calls the root's to keep `focusBoundControl()` reaching the tab stop. A replacement Options owns the value instead of the model `[formField]` binds, so `[formField]` on a root with replacement Options and no consumer `value` model is unsupported; this is documented, not guarded.

Field: the root registers with its nearest Field in `ngOnInit` as its control, without `ogFieldControl`, and a `<label for>` can't name it (section 19). While it is the Field's control, its `aria-labelledby` names the Field's Labels' IDs in registration order, before or after it, replacing a static `aria-labelledby`, and is absent while no Label is registered; its `aria-describedby` names the Field's Descriptions, then its mounted Errors, through the shared description (section 4), and a static `aria-describedby` is kept only while nothing names an ID. ARIA 1.2 supports `aria-invalid`, `aria-required` and `aria-readonly` on `radiogroup`, so inside a Field the root owns them: `aria-invalid="true"` while the Field shows its errors, `aria-required="true"` while the bound field is required and `aria-readonly="true"` while it is readonly, each absent otherwise. Outside a Field, and as a second control the Field ignores, it keeps the static values of those five attributes, read at construction.

Server HTML carries `role="radiogroup"`, `role="radio"`, `aria-checked`, `data-checked`, the disabled attributes and the single `tabindex="0"`, chosen in DOM order: the first enabled checked item, otherwise the first enabled item, and in a Toolbar Radio Group the Toolbar's first enabled control. Inside a Field it also carries the root's `aria-labelledby`, `aria-describedby`, `aria-invalid`, `aria-required` and `aria-readonly`. Eager and incremental hydration reuse the server root and items without transient removal, and hydration does not change those attributes. An initiating click on an item replayed after hydration checks exactly once. Keyboard interaction before hydration is not promised.

The consumer supplies the group's accessible name, item labels, layout and styling, and may write `aria-orientation` statically on the root, and `aria-required` outside a Field.

Exclusions: no typeahead, `aria-activedescendant`, Page Up/Down or two-dimensional navigation, and in a Toolbar Radio Group no arrows across the Toolbar's axis; no user unchecking, no orientation Option and no item State; no `name`, native form value, submission or reset; no `invalid`, `required`, `readonly` or `errors` input; not native `<input type="radio">`; no public roving-focus or selection API.

## 17. Button [F]

Selector:

- `button[ogButton]`. It has no `exportAs` and no State.

Configuration: `disabled` boolean input false, `focusableWhenDisabled` boolean input false, through `OrigamiButtonOptions`.

Host semantics:

- Static `type="button"`. Button adds no activation, click handling or keyboard handling: Enter and Space are native.
- While disabled, `aria-disabled="true"`, empty `data-disabled` and native `disabled`. With `focusableWhenDisabled`, a disabled Button has `aria-disabled="true"` and `data-disabled` but no native `disabled`, so it keeps its place in the Tab order. The attributes are absent while enabled, whatever `focusableWhenDisabled` says.
- A natively disabled button receives no trusted clicks. A focusable disabled one does: the browser still dispatches its clicks, Enter and Space, so the consumer's own `(click)` listeners on it still run and check the disabled state themselves.

Every Origami button part composes Button through `hostDirectives` and is the sole owner of its type and disabled attributes: Toggle, ToggleGroup items (through Toggle), the Collapsible Trigger, the Accordion Trigger (through the Collapsible Trigger), the Popover Trigger, the Select Trigger (through the Popover Trigger), the Tabs Trigger, RadioGroup items, Checkbox, Switch, the Dialog Trigger and Close, and the Toolbar's controls. Each part supplies Button's Options from its own effective disabled state, its root's or its own, and its own `focusableWhenDisabled` Option and input; Button's own inputs are not exposed through the part. Each part keeps its own activation guard, so a focusable disabled part ignores activation: it doesn't press, expand, open, close, select, check or switch. Focus is never restored to a disabled Popover Trigger, focusable or not.

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
- Trigger: `aria-describedby` names the registered Content's effective ID, open or closed, through the shared description (section 4). It merges with the IDs of describers co-applied on the same element, a Field control's (sections 12 and 19 to 21), in the order they initialize. While nothing names an ID, such as without registered Content, the consumer's static `aria-describedby` is kept; otherwise it is replaced. The Trigger binds no `type`, `role`, `disabled` or `tabindex`, so it may be co-applied with any button primitive, which keeps its own disabled state.
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

Inside Popover Content or a Dialog: a Tooltip whose root is inside Popover Content presents only after that Popover's coordinate/reveal commit, and is hidden at once, without exit retention and keeping its intent, while the Popover is closed, suppressed or destroyed. Otherwise, with its Trigger and Content inside a Dialog's `<dialog>` in the flat tree (its modal scope, section 4: declared in Content, projected, in a shadow root or slotted), it presents only while the innermost such Dialog is modal and requested open; an open one is hidden the same way once the Dialog's close is requested, and one already closing finishes its own exit and is hidden no later than the Dialog's native `close()` (section 22). Outside them, including on a Popover's Trigger, it presents independently.

Presentation follows SPEC-POPOVER's protocol steps 3–7, with the Trigger as the positioning reference: transparent preparation, zero-argument `showPopover()`, a guarded coordinate commit and reveal, then Presence animation discovery; a visible exit keeps `:popover-open` and makes Content inert until Presence settles; reopening before native hide reuses the host and its order; native `toggle` and `beforetoggle` are observations only; a canceled show grants no participation and isn't retried for unchanged intent; a positioning failure hides the host without exit retention, reports once through `ErrorHandler`, keeps intent and doesn't retry an unchanged attempt. Placement axes, the supported writing modes, the flip candidates and Content's `--og-anchor-width` and `--og-available-height` are Popover's (section 10), read from and measured against the Trigger. Opening never moves focus.

SSR emits the root, the Trigger's `aria-describedby` and Content with `popover="manual"`, `role="tooltip"`, its ID, `inert` and its text, without timers, geometry, observers or group state. An initially-open Tooltip emits `data-present` but no top-layer state, and activates natively after its own hydration without replaying an entrance. Eager and incremental hydration reuse the Trigger, Content and children without transient removal and keep server IDs. Hover before hydration is not replayed, so it neither opens a Tooltip nor warms the group. A replayed `focus` opens the Tooltip only if its Trigger is still focused and matches `:focus-visible`; a replayed `blur` of a refocused Trigger is ignored; a replayed `pointerdown` or `click` closes an open Tooltip. Replay applies the focus rule above in one pass: after a replayed `mousedown`, the next replayed Trigger focus opens the Tooltip only if a replayed `click` or `blur` came between them. In Safari, which doesn't focus a button on click, a keyboard focus made before hydration while the button is held therefore doesn't open it.

The consumer makes the Trigger focusable and gives it its accessible name (`aria-label` or visually hidden text); the Tooltip is its description. The consumer keeps Content outside the Trigger and non-interactive (no focusable descendants or `autofocus`), doesn't gate Content's text, and owns appearance, motion and reduced motion. Scope a custom `display` to `:popover-open` and use `gap`, not margins. To explain an unavailable action, use a focusable disabled button (`ogButton` with `focusableWhenDisabled`, section 17); a natively disabled Trigger never opens.

Exclusions: no HoverCard or interactive content; no velocity-based pointer polygon or close delay; no `popover="hint"` or `interestfor`; no touch long press; no label relation; no Trigger `disabled` input; no merging with a static `aria-describedby` (kept only while no describer names an ID); no root host attributes; no close on scroll; no configurable or scoped delay group; no public layer, floating or group API.

## 19. Field [M]

Selectors/export names:

- `[ogField]`, `exportAs: 'ogField'`: the owner.
- `[ogFieldLabel]`.
- `[ogFieldControl]`: a native `<input>`, `<select>` or `<textarea>`. Checkbox, Switch, Toggle, RadioGroup and the ToggleGroup Single and Multiple roots are controls without it.
- `[ogFieldDescription]`.
- `[ogFieldError]`.

Configuration: the root has no inputs and no Options; it exposes readonly State, and descendants inject it. Label, Control, Description and Error each have an `id` input defaulting to a generated ID, through their own Options token. Field is the label, description and error wiring around one form control, and it reads that control's Angular Signal Forms state; it owns no value and no validation.

A form control registers with the nearest Field in `ngOnInit` (section 3), publishing its effective ID, whether a `<label for>` can name it, and a reader of the Signal Forms `FieldState` its own element's `[formField]` binds (`FORM_FIELD`, same element, optional). `ogFieldControl` is that control for a native element; Origami's own form controls, Checkbox (section 20), Switch (section 21), Toggle (section 12), RadioGroup (section 16) and the ToggleGroup Single and Multiple roots (section 14), register the same way without it, through the package-private `ɵOrigamiFieldMembership`, and their sections state their ARIA. A label can name the native controls, Checkbox, Switch and Toggle, but not the groups. A Toggle that ToggleGroup Item or Toolbar Toggle composes, and a Toolbar group, are not form controls and never register (sections 12 and 15). Labels, Descriptions and Errors register their IDs in `ngOnInit`, removed when they are destroyed, and an Error only while it is mounted. One control per Field: a second control's registration is reported through Angular's `ErrorHandler` and ignored. Parts and controls join the nearest Field, so a Field inside another is independent. Outside any Field, parts bind only their `id` and keep the consumer's static `for` and ARIA attributes, whether the template or a composing directive's `host` writes them.

State: `invalid`, `touched`, `disabled` and `required` are the bound field's `FieldState` signals, `errors` is its own `FieldState.errors()` as the base `ValidationError` type, and `errorsShown` is `invalid() && touched()`. While no control is registered, or the control has no `[formField]`, every signal is false and `errors` is empty. A blur touches a native control through Angular's own handling, a Checkbox, Switch or Toggle through its `touch` output, and a RadioGroup or ToggleGroup root through its `touch` output when focus leaves the group, and `submit()` touches every field, so either shows errors. Disabled and readonly fields aren't validated by Signal Forms, so they show none.

Host semantics:

- Root: no role. Empty `data-invalid` while `errorsShown`, `data-disabled` while disabled and `data-required` while required; absent otherwise.
- Label: effective `id`; `for` names the registered control's ID while the control can be named by a label, and is absent otherwise; a static `for` is replaced inside a Field. A group control, which a label can't name, names every registered Label's ID in its own `aria-labelledby` instead, in registration order, so its Label may be any element, such as a `<span>`. The Label may come before or after the control, and several Labels may name one control.
- `ogFieldControl`: effective `id`; `aria-describedby` names the registered Descriptions' IDs, then the mounted Errors' IDs, each in registration order, through the shared description (section 4); `aria-invalid="true"` while `errorsShown`, absent otherwise. It binds no `aria-required` or `aria-readonly`: `[formField]` sets the native `required` and `readonly`, which ARIA in HTML says not to repeat. Inside a Field it owns `aria-invalid`. Its `aria-describedby` merges with the IDs of a co-applied Tooltip Trigger (section 18), in the order the two initialize; a static `aria-describedby` is kept only while neither names an ID, and replaced otherwise. A second, ignored control keeps its static attributes.
- Description and Error: effective `id`.

`ogFieldControl` isn't a Signal Forms custom control: it declares no `value` or `checked` model, no `touch` output and no form-state input, so `[formField]` keeps Angular's native handling of the element: its value, touched on blur, and native `disabled`, `required` and `readonly`. Field adds no `ControlValueAccessor`.

Server HTML carries every part's ID, the Label's `for` or a group control's `aria-labelledby`, the control's `aria-describedby` and `aria-invalid`, and the root's data attributes, including an Error the form state shows from the start. Eager and incremental hydration reuse the server nodes and keep their IDs, and hydration changes none of those attributes; once hydrated, the Field follows the form.

The consumer supplies the label and message text, renders each Error under `@if (field.state.errorsShown())`, owns styling and validation rules, and uses its own `<fieldset>` and `<legend>` for a set of Fields.

Exclusions: no Fieldset or Legend part, required marker, message text or `hidden()` handling (the consumer's `@if`); no `aria-errormessage`; no merging with a static `aria-describedby` (kept only while no describer names an ID) or with a group control's static `aria-labelledby` (replaced inside a Field); no form value, validation or submission of its own; no `ControlValueAccessor` or reactive forms.

## 20. Checkbox [J]

Selector/export name:

- `button[ogCheckbox]`, `exportAs: 'ogCheckbox'`; composes Button (section 17).

Configuration: `checked` boolean model false, `disabled` boolean input false, `focusableWhenDisabled` boolean input false and `id` input defaulting to a generated ID, through `OrigamiCheckboxOptions`. The directive exposes readonly State and a `touch` output. Checkbox is a two-state checkbox; it has no mixed value.

Host semantics:

- Static `role="checkbox"`, effective `id`, `aria-checked` always present, `"true"` or `"false"`, reflecting effective checked state, and empty `data-checked` while checked, absent otherwise.
- The composed Button binds `type="button"` and, from the Checkbox's effective `disabled` and `focusableWhenDisabled`, `aria-disabled="true"`, empty `data-disabled` and native `disabled` unless `focusableWhenDisabled` while disabled; they are absent while enabled.
- A click or Space, through native button activation, writes the negation of the effective checked state to the effective Options exactly once. Enter's activation is prevented on `keydown`, as the ARIA checkbox pattern says, so Enter writes nothing. A user activation, also through a label click, is dropped while effectively disabled, focusable or not, and while the `[formField]` on the same element is readonly; external Options, model and form writes remain authoritative. A focusable disabled Checkbox's own `(click)` listeners still run.

Signal Forms: Checkbox implements `FormCheckboxControl`. `[formField]` finds it by its `checked` model, binds that model, writes its `disabled` input from the field's `disabled()` rules and listens to its `touch` output, which it emits on every blur. It declares no other form-state input: it reads the bound field's `readonly()`, `required()` and errors through the `FORM_FIELD` on its own element (same element, optional) with the package-private Field membership (section 19). `focusBoundControl()` focuses the button through Forms' default host focus; it has no `focus` or `reset` method. A consumer directive or component that applies the Checkbox through `hostDirectives` and exposes `checked` and `checkedChange` is the control `[formField]` finds; it also exposes `disabled` and `touch` for the form's disabled rules and touched state to reach the Checkbox, which still reads `FORM_FIELD` on the element. A replacement Options owns the value instead of the model `[formField]` binds, so `[formField]` on an element whose Checkbox has replacement Options and no consumer `checked` model is unsupported; this is documented, not guarded.

Field: the Checkbox registers with its nearest Field in `ngOnInit` as its labelable control, without `ogFieldControl` (section 19). The Field's Labels name its `id` with `for`, before or after it, which gives the Checkbox its accessible name, and a label click activates the button. Inside a Field its `aria-describedby` names the Field's Descriptions, then its mounted Errors, through the shared description (section 4), merged with the IDs of a co-applied Tooltip Trigger (section 18) in the order the two initialize; a static `aria-describedby` is kept only while neither names an ID. It owns `aria-invalid="true"` while the Field shows errors and `aria-required="true"` and `aria-readonly="true"` while the bound field is required or readonly; each is absent otherwise, and a static value is replaced. Outside a Field, and as a second control the Field ignores, it binds only its `id` and keeps those static attributes, whether the template or a composing directive's `host` writes them.

Each Checkbox element owns its own Context and State; descendants of the button observe that State. State `checked` and `disabled` are the effective Options' values: the form's disabled rules reach `disabled` through the input, form readonly isn't State, and State doesn't re-expose `touch` (section 3, Events).

Server HTML carries `role`, `id`, `aria-checked`, `data-checked`, the disabled attributes, the Label's `for` and the Checkbox's `aria-describedby`, `aria-invalid` and `aria-required`. Eager and incremental hydration reuse the server button and keep its ID, and hydration changes none of those attributes; an initiating click replayed after hydration writes the model exactly once.

The consumer supplies the accessible name (a Field Label, `aria-label` or `aria-labelledby`), the indicator inside the button, styling and side effects.

Exclusions: no mixed state, checkbox group, hidden `<input>`, `name`, native form submission or reset, and no `:checked` or `:invalid` (style from `data-checked` and the Field's `data-invalid`); no `invalid`, `required`, `readonly` or `errors` input; not an `<input type="checkbox">`.

## 21. Switch [W]

Selector/export name:

- `button[ogSwitch]`, `exportAs: 'ogSwitch'`; composes Button (section 17).

Configuration: Checkbox's (section 20) through its own `OrigamiSwitchOptions` and `OrigamiSwitchState`: `checked` boolean model false (on is `true`), `disabled` and `focusableWhenDisabled` boolean inputs false and `id` input defaulting to a generated ID, readonly State and a `touch` output.

Switch follows section 20 in every other respect (Button composition, guarded activation, Signal Forms, Field membership and ARIA, State, server HTML and hydration, consumer responsibilities), with these differences:

- Static `role="switch"`; `aria-checked` is `"true"` while on and `"false"` while off, and `data-checked` is empty while on.
- A click, Enter or Space, through native button activation, flips the effective checked state exactly once: the ARIA switch pattern allows Enter, so Switch doesn't prevent it.
- Use it for a setting that takes effect at once; a choice the user confirms later is a Checkbox.

Exclusions: section 20's, without the checkbox group; not an `<input type="checkbox" switch>`.

## 22. Dialog [Y]

Selectors/export names:

- `[ogDialog]`, `exportAs: 'ogDialog'`: the owner. It may share the `<dialog>` element with Content, and a component may be the root through `hostDirectives`.
- `[ogAlertDialog]`, `exportAs: 'ogAlertDialog'`: the alert dialog owner; composes the Dialog root through `hostDirectives` and is used wherever a Dialog root is, with Dialog's parts.
- `button[ogDialogTrigger]`, `exportAs: 'ogDialogTrigger'`; composes Button (section 17). Optional.
- `dialog[ogDialogContent]`, `exportAs: 'ogDialogContent'`; a native `<dialog>`; composes Presence (section 7) and the shared description (section 4).
- `[ogDialogTitle]` and `[ogDialogDescription]`.
- `button[ogDialogClose]`; composes Button.

Configuration: the root has an `open` boolean model false and a `dismissible` boolean input true, and exposes readonly State. The AlertDialog root declares the same model and input itself, configured through its own Options token, which the composed Dialog root's Options resolve to, so a component composing `ogAlertDialog` through `hostDirectives` can expose `open`, `openChange` and `dismissible`. Its `state` is the composed Dialog root's State. The Trigger has an `id` input defaulting to a generated ID and `disabled` and `focusableWhenDisabled` boolean inputs false. Content has an `id` input defaulting to a generated ID and a `returnFocus` input (`HTMLElement | null`, null), and exposes readonly State whose `open()` is its Presence retention. Title and Description each have an `id` input defaulting to a generated ID. Close has `disabled` and `focusableWhenDisabled` boolean inputs false. Root State `open()` is the effective requested state, not whether the dialog is modal.

Trigger, Content and Titles register with the root, and Descriptions with the nearest Content, in `ngOnInit` (section 3). One mounted Trigger and one mounted Content are supported per root; a second fails clearly when it registers. Any number of Titles, Descriptions and Close buttons may be mounted. Parts belong to the nearest root and fail through Angular DI without one; nested roots are independent. A Description outside its root's Content describes nothing.

Host semantics:

- Root: none.
- Trigger: effective `id`, `aria-expanded` from the root's requested state, `aria-controls` naming mounted Content; its composed Button binds `type="button"` and the disabled attributes from its own effective `disabled` and `focusableWhenDisabled`. Enabled activation writes `open` true; a disabled Trigger ignores activation.
- Content: effective `id`; `aria-labelledby` names the registered Titles' IDs in registration order, and is the element's static `aria-labelledby` while none is registered, with the shared description's hydration snapshot rule (section 4); `aria-describedby` names the IDs of the Descriptions registered with it through the shared description, merged with other describers on the element such as a co-applied Tooltip Trigger; Presence's attributes. No `role` under a Dialog root (the native dialog role) and `role="alertdialog"` under an AlertDialog root, also in server HTML; no `tabindex` and never the `open` attribute. The browser adds `open` itself during a modal session.
- Title and Description: effective `id`.
- Close: its composed Button binds `type="button"` and the disabled attributes. Enabled activation writes `open` false, whatever `dismissible` says; a disabled Close ignores activation.

Native session. Content owns one native modal session from `showModal()` to `close()`:

- Open: while the root requests open, Content is registered and connected and the platform is the browser, `showModal()` runs in the after-render WRITE phase, never on the server or during render. Content participates in the dismissal layer (section 10) from just before that call, so Escape dispatched by synchronous autofocus belongs to it. A `beforetoggle` listener that cancels the show writes `open` false. Initial focus is the platform's: an `autofocus` element, else the first focusable descendant, else the dialog.
- Exit: when the root's requested state turns false, Content's Presence runs its exit while the dialog stays modal: the page stays inert, focus stays inside and Content keeps participating in the layer, consuming Escape, close requests and outside gestures without acting on them: no model is written, so a Popover or Tooltip hidden at the close request keeps its intent. Once Presence settles closed, `close()` runs. Reopening before then reverses Presence, keeps the same session and its layer order, and never calls `close()`. Presence observes only Content's own animations, not its `::backdrop`'s.
- Focus return: after `close()` the platform restores focus, once. While a session that started after this one is still active, nothing else moves focus, since the page is inert under it. Otherwise `returnFocus` is focused, and kept if it took focus; whether it can is not predicted, so a disconnected, disabled or inert target leaves the platform's result. Otherwise, if focus is on the body or still inside the closed dialog, each candidate is focused in turn until one takes focus, again tried, not predicted: the element focused just before this session's `showModal()`, then, for each session it was stacked on (the newest active one at its `showModal()`) down the stack, ended or not, the `returnFocus` read when that one ended under a newer session and the element focused before its `showModal()`; last the registered Trigger unless its effective `disabled` is true. The chain is application-wide, for template Dialogs and dialogs opened from code alike, so focus returns down the stack whatever order stacked sessions end in; an ended session's record is dropped once no active session is stacked on it. Inside counts in the flat tree, read from the focused element itself rather than the shadow host the document reports: also inside a shadow root within the dialog, inside the dialog when it is in a component's shadow root, and on a light-DOM child slotted into it.
- Native closes: a native `close` that Origami didn't start, from `<form method="dialog">`, a direct `close()` or a forced close request, ends the session, writes `open` false without an exit animation and applies the same focus return. Content's Presence settles closed without waiting for host animations, also when an exit was already running. A stale `close` event of an earlier session is ignored.
- Removal: if Content is destroyed during a session, the session ends without an exit, the scroll lock and layer participation are released, the dialog is closed natively if still connected, and focus is returned as above. Requested intent is kept, so remounted Content opens again.
- Scroll lock: while at least one Origami modal session is active, the document element has an inline `overflow: hidden`; the inline `overflow-x` and `overflow-y` values and priorities it had before the first session are restored when the last ends. Nested sessions share the lock. No `scrollbar-gutter` or padding compensation is applied.

Dismissal, with section 10's rules for each request:

- Escape: Content is a layer ordered by its session's activation. Only the topmost Dialog and the layers whose parts are inside its `<dialog>` in the flat tree are eligible, also in a component's shadow root inside it or assigned to a `<slot>` inside it, but not in a light-DOM subtree no slot takes or in fallback content an assigned node replaced, as the rest of the page is inert: a Popover or Tooltip outside it never takes Escape or a close request, nor vetoes one, even when opened later, also during the exit. The topmost eligible layer, which is a Popover or Tooltip inside the Dialog when one opened later, takes the Escape and consumes the keydown, so the platform's close watcher never fires `cancel` for it.
- Close requests: a cancelable native `cancel` on Content (the back gesture, `requestClose()`) is prevented. On the topmost Origami modal session it is handled exactly as an Escape keydown: the topmost eligible layer takes it, so a Popover or Tooltip inside the Dialog that opened later closes first. On an older session, such as `requestClose()` on a Dialog under a newer one, it dismisses that Dialog's own branch, the Dialog and the Popovers in it, as Escape would with it topmost; a Dialog stacked above it, even one authored inside it, isn't in that branch and stays open, as after an `open` write (an error when it's authored inside, see Nesting). A non-cancelable one closes natively and is reconciled as above.
- Outside pointer: the outside of the dialog the page is blocked by is its backdrop, a hit on the `<dialog>` element outside its border box; every other target is inside it, including a newer modal stacked above. A Dialog older than the topmost session is never a candidate. While a Popover in the Dialog's branch participates (see Nesting), a backdrop gesture closes only the participating Popovers, unless one vetoes it, and leaves the Dialog open; a Tooltip doesn't defer it, even inside the `<dialog>`. `closedby` is not set.
- `dismissible` false vetoes Escape, close requests and outside gestures on the Dialog; Close and `open` writes still close it.

AlertDialog: everything above holds, except that an AlertDialog has no outside: a backdrop gesture is never a user dismissal of it, whatever `dismissible` says, so it never closes, and it never defers one either, so a participating Popover in its branch still closes on its own outside rule. Escape and close requests dismiss it as they dismiss a Dialog, and `dismissible` false vetoes them. Cancel is an `ogDialogClose`, which the consumer gives initial focus with `autofocus`; the Action is the consumer's own control and closes nothing, so the dialog stays open while a request is pending and after it fails.

Nesting: Content's session is a modal scope (section 4). What it nests is read from the DOM, not from Angular DI: the Popovers without a parent Popover, the Tooltips outside Popover Content and the Dialog Contents whose parts are inside its `<dialog>` in the flat tree, and inside no Dialog nested in it. So a Popover, Tooltip or Dialog declared inside Content, projected into it through a wrapper component's `<ng-content>`, in a shadow root inside it, or slotted into it nests alike. Such a Popover or Tooltip presents only while the Dialog is requested open and modal. A requested-open one is hidden at once, keeping its intent, when the Dialog's close is requested or its session ends, and during the exit it takes no Escape or close request; it presents again when the Dialog reopens. One already requested closed and still leaving finishes its own exit while the Dialog retains its exit, as under a parent Popover, and is hidden no later than the Dialog's native `close()`. Such a Popover is also in the Dialog's dismissal branch. Membership is read when a Popover or Tooltip synchronizes and at each event, so a DOM move that isn't a signal change counts from the next one. A Dialog nested in another stacks natively: the newer session blocks the older one. When the enclosing native session ends, a nested Dialog requested closed and still running its exit ends its session at once, before the enclosing `close()`, and its Presence settles without the rest of its exit; focus follows the enclosing Dialog's return. A nested Dialog still requested open at that point, which only application code can cause, since the enclosing one is inert under it, makes the enclosing session report an `Error` through Angular's `ErrorHandler` once for that native close, saying to close the inner Dialog before or together with the outer: the platform keeps the inner `:modal` but unrendered inside the closed dialog, blocking the page. The check runs at the native close, not at the close request, so closing the inner later in the same turn isn't an error, and opening it during the enclosing exit is. Neither Dialog's state or presentation changes to hide it: the outer closes as requested and the inner stays as it was. A Dialog inside Popover Content is unsupported.

SSR renders Content without `open`, so the platform hides it, and Presence settles on the server: an initially-open Dialog's Content carries `data-present` and its retained children. After eager hydration, and under incremental hydration only once its block hydrates, a requested-open Dialog opens modally without replaying an entrance. Hydration keeps the server nodes, IDs, `aria-labelledby` and `aria-describedby`.

The consumer supplies the trigger (any control writing `open`, or `ogDialogTrigger`), a Title or another accessible name, an accessible way to close, styling (including `::backdrop`, placement such as edge-anchored sheets, and `scrollbar-gutter`), animations and reduced motion, and initial focus through `autofocus`. Gate children on Content State `open()` to keep them through the exit; scope a custom `display` to `[open]` to preserve the platform's closed display.

Opener: `injectOrigamiDialogOpener(component)` runs in an injection context, whose caller is the opener's owner, and returns an `OrigamiDialogOpener<C>`. It captures the caller's `Injector`, `EnvironmentInjector`, `ApplicationRef`, `DestroyRef`, `DOCUMENT` and `Location`, and reads `reflectComponentType(component)` once; a class that isn't a component throws. The component is an application component whose template holds a Dialog or AlertDialog root with its Content, usually as its own root through `hostDirectives`.

- `open(bindings?)` mounts a new instance per call and returns its `OrigamiDialogRef`. On the server it throws a descriptive error before creating anything; template Dialogs are the server path. It throws for a key that isn't a signal input, model or output of the component. Otherwise it creates a mount bridge and a child `Injector`, whose parent is the caller's injector, providing it; runs Angular's `createComponent` with the captured `EnvironmentInjector`, that injector as `elementInjector` and the bindings; appends the component's host to the document body; attaches its view to `ApplicationRef` and marks it for check, so it renders and updates under zoneless change detection. It mounts outside the caller's reactive context, so an `effect` may call it, and a failure while mounting removes what it created before rethrowing.
- `OrigamiDialogBindings<C>` is a flat record over `C`'s properties: each signal input (`input`, `input.required`, a transformed input) takes a getter or signal of its write type, bound with `inputBinding`; each model takes a getter, bound one-way, or a `WritableSignal`, bound two-way with `twoWayBinding`; each output (`output`, `outputFromObservable`) takes a listener for its payload, bound with `outputBinding`. Keys are property names, mapped to template names (aliases) through `reflectComponentType`. Plain fields, plain signals and decorator `@Input()`/`@Output()` properties aren't keys, and wrong value or payload types fail TypeScript checking. Required-ness isn't visible in the type: a required input left out throws Angular's NG0950 when the component reads it. There is no close result: data leaves through outputs.
- The component's top-level root, a Dialog or AlertDialog root with no enclosing Dialog root in the component, claims the bridge from its `ngOnInit` and writes its `open` true; a second live top-level root fails like a duplicate part. Destroying the claiming root while the component stays mounted, such as a template root under `@if`, ends the dialog: the bridge tears the component down after that render and resolves `closed`, and a later `close()` does nothing. A root nested in another never claims it, and a component opened from inside an opened component claims its own bridge, not the outer one's.
- It closes like any Dialog: a write of the root's `open` false, Escape, close requests, a backdrop gesture, Close, a native close, or `ref.close()`, which writes the root's `open` false whatever `dismissible` says and does nothing once torn down. A `close()` before the root has claimed the bridge, that is before the component's first change detection, tears it down at once, so it's never shown. After every render, in the READ phase, once the root is requested closed and its Content has no native session left (the exit and `close()` are done, or it was never shown), the bridge destroys the component, which detaches its view from `ApplicationRef` and so removes the host from the document, then the child injector, then resolves `closed`.
- Navigation: a URL change through `Location` (`go()`, `replaceState()`, popstate, as the router navigates) closes every dialog the opener has open, with its exit. There is no router dependency and no per-dialog opt-out.
- When the owner's `DestroyRef` or the application is destroyed, every dialog the opener has mounted is torn down at once, without an exit, newest first, and its `closed` resolves. A dialog still modal, open or in its exit, ends its native session first, while its host is still in the document, so focus returns as after any close (the browser's restore, then `returnFocus` or the Trigger); removing the host first would restore nothing. `open()` after the owner is destroyed throws.
- `OrigamiDialogRef.closed` is a `Promise<void>` that resolves once, after teardown, and never rejects: a one-shot completion the caller awaits, not an event a Context exposes, so section 3's Observable rule for events doesn't apply. `close()` is idempotent. Once torn down, a reference holds only its settled `closed` and an inert `close()`, nothing of the component.

A Dialog opened from code nests by section 22's rules like any other; dialogs opened from different openers, including one opened from inside another opened component, stack natively as independent sessions. One exception orders their ends: an opener created inside an opened component, by the component or a component in its view, registers its dialogs with that component's bridge, through a package-private token its child injector provides beside the bridge. When the outer dialog's native session ends, after its exit or at once on teardown, these dialogs are torn down first, without an exit and innermost first, each ending its own session while its host is in the document and nothing above it is modal, then the outer session ends and the browser restores the focus it had before the outer opened. So no dialog opened from inside it outlives it, modal over a removed component.

Exclusions: no non-modal dialog, `position` or Sheet option, overlay or backdrop part, portal or container, initial-focus Option, `closedby`, close result, router integration, drawer or swipe, no AlertDialog Action part or light-dismiss option, and no opener data token, injectable opener reference, per-dialog navigation opt-out, container option or decorator-input bindings.

## 23. Select [Z]

Selectors/export names:

- `[ogSelect]`, `exportAs: 'ogSelect'`: the owner; composes the Popover root (section 10).
- `button[ogSelectTrigger]`, `exportAs: 'ogSelectTrigger'`; composes the Popover Trigger and Anchor, and through the Trigger Button (section 17).
- `[ogSelectContent]`, `exportAs: 'ogSelectContent'`; composes Popover Content, and through it Presence.
- `[ogSelectOption]`, `exportAs: 'ogSelectOption'`.

Configuration: the root has a `value: T | null` model null, an `open` boolean model false and a `disabled` boolean input false, and exposes readonly State, which descendants inject. `T extends string | number | boolean` is the value type, which Angular infers from the `value` binding. The root supplies the composed Popover root's whole Options: its `open` and `disabled`, and `dismissible` true. The Trigger has an `id` input defaulting to a generated ID and `disabled` and `focusableWhenDisabled` boolean inputs false; its Options supply the composed Popover Trigger's Options and the Anchor's ID, and its `state` is the root's State. Content has Popover Content's `id`, `side` (`'block-end'`), `align` (`'start'`) and `gap` (0 CSS px) inputs, with Popover's types and gap rule; its Options supply the composed Popover Content's, and its `state` is the composed Popover Content's State. An Option has a required `value: T` input, a `label: string | null` input null, a `disabled` boolean input false and an `id` input defaulting to a generated ID, and exposes readonly State, which its descendants inject.

Values compare with `===`, without normalization: an Option `value="1"` is the string `"1"` and never matches the number `1`. Angular infers each directive's `T` from its own bindings, so an Option's type isn't checked against its root's; such a mismatch is an option that is never selected, at runtime only. Values within one Select are expected to be distinct and are not validated; every Option whose value is the root value is selected. The Option `value` has no generated default, the exception to section 5's rule: a generated value can't match a form value or survive a reload, so every Option binds its own value.

Options register with the nearest root in `ngOnInit` (section 3), removed when they're destroyed, and Content registers its presentation's participation there. One mounted Trigger and one mounted Content are supported per root, by the composed Popover's cardinality; a second fails when it registers. Parts belong to the nearest root and fail through Angular DI without one. A root inside another root's Content is independent.

Host semantics:

- Root: none.
- Trigger: the Popover Trigger's `id`, `aria-expanded` (the list's participation) and `aria-controls` (mounted Content), and its Button's `type="button"` and disabled attributes; static `role="combobox"`; `aria-activedescendant` naming the active option's ID while the list participates and that option is registered, absent otherwise; empty `data-placeholder` while the value is null.
- Content: static `role="listbox"`, Popover Content's `id`, `popover="manual"`, positioning styles, `inert` while not participating, `--og-anchor-width` and `--og-available-height` (section 10), and Presence's attributes.
- Option: static `role="option"`, effective `id`, `aria-selected` always `"true"` or `"false"`, `aria-disabled="true"` while disabled and absent otherwise, and empty `data-selected`, `data-active` and `data-disabled` markers.

Focus stays on the Trigger: Options are never focused. The active option is a highlight, never the value. Only the Trigger's keys and click and an Option's pointer move set it. It is cleared when the requested state closes and when the list stops participating after it participated, as when an enclosing Dialog or Popover closes and keeps the Select's request (section 10), so a list presented again has none; keys set it in the opening frame, before the list first participates. A list opened by an `open` write has none until a key sets one. A removed active option is no longer active. Keys with Alt, Ctrl or Meta, keys already `defaultPrevented` and keys during IME composition are ignored, as are keys while the root or the Trigger is disabled. Handled keys prevent their default, which also keeps Enter and Space from clicking the button.

- Closed: Enter, Space, ArrowDown and ArrowUp open with the selected option active, else the first enabled option; Home and End open on the first and last enabled option; a printable character opens on the first enabled option it starts, else as Enter does. "Selected option" means the first enabled registered option, in DOM order, whose value is the root value.
- Open: ArrowDown and ArrowUp move to the next and previous enabled option without wrapping, from the selected option while none is active; Home and End to the first and last; PageDown and PageUp ten enabled options, clamped at the ends. DOM order is read at the event.
- Typeahead, open or closed: characters typed within 500 ms of each other form one search, matched case-insensitively against the start of each enabled option's `label`, else its text content with whitespace collapsed, read when the key is pressed. A search starts at the active option, wrapping; one character, or one character repeated, starts after it, so repeating a character cycles. No match moves nothing. While a search runs, Space joins it.
- Enter, and Space outside a search, choose the active option; with none active they close without writing.
- Escape closes without writing. A participating list is a Popover layer and takes Escape by section 10's rules, so inside a Dialog or Popover Content the first Escape closes only the list. Before it participates, as when Escape follows the opening key within one frame, the Trigger closes it and consumes the key, so no enclosing layer takes it.
- Tab and Shift+Tab close without writing and move focus natively.

Pointer: a Trigger click toggles the list (Popover Trigger), focuses the Trigger if the engine didn't (macOS Safari doesn't focus a clicked button), and a list it opens starts on the selected option, else the first enabled one. A pointer move over an enabled option of a participating list makes it active, without scrolling. Clicking an enabled option chooses it. A press inside Content prevents its default, so focus stays on the Trigger. A trusted outside gesture closes the list without writing (section 10). Disabled options ignore the pointer.

Choosing: a choice writes the option's value with the shared single-selection rule (section 3), which writes only a change, then writes `open` false; choosing the selected option only closes. It is dropped while the root is disabled or the option is. Nothing else writes the value: null and values no option has select nothing and are kept, removing the selected option doesn't change the value, and options arriving later select the value they have. External writes remain authoritative and emit no output from an unused model. Disabling the root natively disables the Trigger (Popover's disabled), blocks opening and choosing, and closes an open list by writing `open` false when it changes from enabled to disabled; an `open` write while disabled stays authoritative.

When the list is revealed, and whenever a key or opening moves the active option, Content scrolls the option's nearest scrolling box inside Content, or Content itself, so that the option is visible, by writing that box's `scrollTop` after render in the browser; it never scrolls the page, and a pointer move doesn't scroll it.

State: `value` is the effective value, including null and values no option has; `open` is the list's actual participation, not the requested `open`, false without Content, on the server and during an exit; `disabled` is the root's effective disabled policy; `selectedOption` is a plain `OrigamiSelectOptionRecord<T>` (`{ value, label, disabled }`) of the first registered Option whose value is the root value, with `label` its explicit `label` input (never its text) and `disabled` its own disabled state, or null while the value is null or no registered Option has it, including an Option not mounted yet or in a block that hasn't hydrated. An Option registering refreshes a view that read it earlier in the same change detection, also on the server. Option State: `selected`, `active` (the highlighted option, like `data-active` and the Trigger's `aria-activedescendant` only while the list participates) and the Option's own `disabled`.

Nesting: the list is a Popover branch. Inside a Dialog it nests under the Dialog's modal scope, and inside Popover Content under that Popover, by section 10's rules: an outside gesture inside the Dialog or the enclosing Popover closes only the list, and choosing keeps the enclosing Popover open. A Tooltip Trigger may share the button with the Select Trigger.

Server HTML carries the closed list: the Trigger's `role`, `id`, `aria-expanded="false"`, `aria-controls` and `data-placeholder`, the consumer's Trigger text including a label read from `selectedOption()`, no `aria-activedescendant`, Content with `role="listbox"`, `popover="manual"` and `inert`, and the Options' `role`, IDs, `aria-selected` and disabled attributes. Eager and incremental hydration reuse the server nodes and keep the IDs. An initiating Trigger click replayed after hydration opens the list once. Options in a block that hasn't hydrated aren't registered: they can't be reached and nothing is written meanwhile; they are reachable once they hydrate. Keyboard interaction before hydration is not promised.

The consumer supplies the Trigger's accessible name (`aria-label` or `aria-labelledby`) and text, Option text and an explicit `label` where the Trigger shows one, Content's dimensions and overflow (with the two custom properties), groups and separators as plain markup, and styling.

Exclusions: no multiple selection, object values or comparator, Signal Forms control or Field membership, clear button, Group, Separator, Value or Indicator parts, item-aligned positioning, scroll buttons or virtualization; no hidden native `<select>`, `name`, form submission or autofill; no wrapping navigation and no Tab commit; no public listbox, active-descendant or typeahead API.

## 24. Browser, SSR and hydration qualification [H]

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

Associations across a hydrate boundary: parts associate through registrations made when they initialize, so while one of a primitive's associated parts is still dehydrated, the attributes that name it from the other side (`for`, `aria-controls`, `aria-labelledby`) are absent, and they return when it hydrates. `aria-describedby` follows the shared description (section 4) instead: while a hydrated describer names an ID, the attribute names only the hydrated describers' IDs, so a dehydrated describer's ID is absent until it hydrates; while none names one, the element keeps the server's value, the dehydrated describer's ID included; and if the describers changed during the split, so that their IDs never equal the server's value, it stays as the static value. Ownership and retained intent survive the split (H4); the associations don't. Keeping associated parts inside one hydrate boundary keeps them from the server HTML on.

Use supported Angular APIs. No contract requiring application code to consume private Angular hydration metadata is introduced. The selected Angular version's actual replay/lifecycle behavior must be inspected before specifying exact event coverage.

## 25. Acceptance structure [T]

This is the public-contract coverage map. Case definitions and handwritten consumers live in [acceptance](acceptance/README.md); [tests/acceptance](tests/acceptance/README.md) executes them against the packed package. 0.0.1 passed the full gate at `6f898e7` (2,928/2,928 across Chromium/Firefox/WebKit × development/production × eager/incremental hydration). Releases qualify on the full `test:full` matrix: all 24 projects, three engines × development/production × eager/incremental hydration × both motion preferences. Commits run the commit tier, which runs each runtime, hydration and motion axis only where it reaches the library; it is not release evidence.

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
| T-Toggle      | Native activation exactly once; form type; always-present `aria-pressed`; disabled blocks only user activation; replacement precedence; a generated `id`; name from a Field Label before and after it in three engines, label click toggles; `[formField]` initial value, user and model writes, touch on blur, required errors shown by the Field after blur and `submit()`, `reset()`, `focusBoundControl()`, readonly blocks user writes, disabled rule, never `aria-invalid`, `aria-required` or `aria-readonly`; a consumer component through `hostDirectives` is the control `[formField]` finds; ToggleGroup items and Toolbar Toggles inside a Field don't join it; a co-applied Tooltip Trigger's ID merged in both directive orders; `id`, `for` and `aria-describedby` in server HTML and kept through hydration |
| T-Tabs        | Click/keyboard selection exactly once; automatic/manual; orientation and RTL mapping; Home/End/wrap/disabled skipping; single tab stop, click focus and focus repair; null/unknown/Panel-only/removed/disabled-selected policies; mounted-only associations; Panel tab stop override; SSR tab stop in DOM order; repeated required-input Triggers and later `@for` Panels complete in server HTML |
| T-ToggleGroup | Single/deselect and multiple activation exactly once; unknown values kept; immutable arrays; Toggle composition driven by upper item Options only; moves never press; orientation and RTL mapping; Home/End/wrap/disabled skipping; single tab stop, click focus and focus repair; `role="group"` without `aria-orientation`; SSR tab stop in DOM order, also with repeated required-input items; Single and Multiple (a `string[]` model) with `[formField]`: initial value, user and model writes, touch only when focus leaves the group, errors shown by the Field after blur and `submit()`, `reset()`, `focusBoundControl()` on the tab stop, readonly drops activation while focus moves, disabled rule, never `aria-invalid`, `aria-required` or `aria-readonly`; a consumer component through `hostDirectives` is the control `[formField]` finds; `aria-labelledby` from a Field Label after it and `aria-describedby`, named in three engines; static attributes kept standalone; `aria-labelledby` and `aria-describedby` in server HTML and kept through hydration |
| T-Toolbar     | `role="toolbar"` with `aria-orientation`; buttons only, native disabled skipped; orientation and RTL mapping; Home/End/wrap; single tab stop across Toolbar groups with no preferred pressed item, re-entry on the first enabled control; Toolbar group orientation overridden; arrow order in DOM order after keyed moves; click focus and focus repair; a Toolbar Toggle, and a Toolbar Popover Trigger disabled by its own input or its Popover; a standalone group in Popover Content keeps its own tab stop; a Toolbar group outside a Toolbar fails through DI; SSR tab stop in DOM order across a Toolbar group and with repeated required-input items, and with a Toolbar Toggle and Popover Trigger; a Toolbar Radio Group inside a Field doesn't join it |
| T-RadioGroup  | `radiogroup` with `radio` items and always-present `aria-checked`; click/Space/Enter check exactly once, no unchecking, no submit; all-four-arrow moves check exactly once with RTL mapping, Home/End, wrap and disabled skipping; Tab entry on the checked item, otherwise the first enabled; revalidation of a move or click target changed by its focus handlers; focus repair without checking; null/unknown/removed/disabled-checked policies; in a Toolbar Radio Group arrows never check and Space/Enter/click do; a standalone group in Popover Content keeps its own tab stop; replacement precedence; SSR tab stop in DOM order, also with repeated required-input items; `[formField]`: initial value, user and model writes, touch only when focus leaves the group, errors shown by the Field after blur and `submit()` with `aria-invalid`, `aria-required` and `aria-readonly`, `reset()`, `focusBoundControl()` on the tab stop, readonly drops clicks, keys and arrow selection while focus moves, disabled rule; a consumer component through `hostDirectives` is the control `[formField]` finds and reaches the tab stop through its own `focus()`; `aria-labelledby` from every Field Label before and after it, replacing a static value, and `aria-describedby`, named in three engines; static attributes kept standalone; `aria-labelledby`, `aria-describedby` and `aria-required` in server HTML and kept through hydration |
| T-Button      | `type="button"` and the disabled attributes with and without `focusableWhenDisabled`; a focusable disabled Button's own click listener runs; replacement precedence; every button part's `focusableWhenDisabled` with its activation guard exercised by a trusted click; arrows reach focusable disabled items without selecting or checking, the tab-stop order, focus kept when an item becomes disabled but focusable; SSR attributes kept through hydration |
| T-Tooltip     | `role="tooltip"` manual Content with a mounted-only description resolving while closed and inert; hover delay, grace area across the gap in every placement, Content hover; keyboard focus opens at once, pointer focus doesn't; touch never opens; activation, Escape and outside close; leave and blur close only intent-opened Tooltips; a natively disabled Trigger never opens; co-applied button primitives keep their own disabled; a co-applied Field control's description merged in both directive orders and through `hostDirectives`, the static value kept without Content and, with none authored, the attribute absent after hydration once Content unmounts, also for Content registering after the Trigger's first render, alone or after a co-applied Field control's Error; delay group warm window, single-open and transit deferral; Escape order with Popover in both orders; outside dismissal without vetoing a Popover; presentation inside Popover Content; placement and positioning failure; motion, retained exit, canceled show; replacement precedence; SSR description and text, initially-open resumption, focus replay, unreplayed hover |
| T-Field       | `for` before and after the control; `aria-describedby` from Descriptions then mounted Errors in registration order, an Error leaving and re-entering as it unmounts and mounts; a static `aria-describedby` replaced while the Field names an ID and kept outside; a co-applied Tooltip Trigger's ID merged in registration order in both directive orders, from server HTML on; static `for` and `aria-describedby` kept outside from the template or a composing directive's `host`; nearest-Field nesting; a second control reported through `ErrorHandler` and ignored; Labels register their IDs for a group control's `aria-labelledby`, in registration order, leaving and re-entering as they unmount and mount, while a native control keeps `for` and no `aria-labelledby`, and an ignored second group keeps its static `aria-labelledby`; Signal Forms errors shown after blur and `submit()`, `required`, `readonly` and `disabled` rules on native controls with Angular's native handling intact and no duplicated `aria-required` or `aria-readonly`; part Options replacement; SSR IDs and associations, including an error shown from the start, adopted by hydration, and without a static `aria-describedby` absent after hydration once the last Error unmounts, also when a co-applied Tooltip's Content in a child component registers after an Error in the control's own view |
| T-Checkbox    | `role="checkbox"` with always-present `aria-checked`; click and Space flip once, Enter doesn't; two-way `[(checked)]` standalone; disabled and focusable disabled; external writes authoritative while disabled; name from a Field Label before and after it in three engines, label click toggles; `[formField]` initial value, user and model writes, touch on blur, required errors after blur and `submit()`, `reset()`, `focusBoundControl()`, readonly blocks user writes, disabled rule; a consumer component composing it through `hostDirectives` found by `[formField]` with `FORM_FIELD` read; factory and existing Options replacement; a co-applied Tooltip Trigger's ID merged with the Field's in both directive orders, from server HTML on, and without a static `aria-describedby` absent after hydration once the last describer leaves, also with the Content in a child component; SSR attributes and IDs adopted by hydration, a replayed click writes once |
| T-Switch      | T-Checkbox's coverage with `role="switch"`, and Enter flips once |
| T-Dialog      | Trigger, model and Close open and close a modal `<dialog>`, `:modal` and the page blocked; Trigger ARIA, Title/Description naming also from a child component, a static `aria-labelledby` kept without a Title, a co-applied Tooltip Trigger's description merged; Escape and focus return; exit falsifier: modal, blocked and focused inside through a 300 ms exit in three engines, reopen keeps the session; Escape falsifier with a Popover inside, no native `cancel`; a background Popover opened later, also not dismissible or during the exit, doesn't take Escape; a Tooltip and a Popover in a shadow root inside, and assigned to a `<slot>` in a shadow-root `<dialog>`, take the first Escape and `requestClose()`, and a shown Tooltip whose Content lost its slot, or is slot fallback content that an assigned node replaced, doesn't; `requestClose()`, `dismissible`, `method="dialog"` and direct `close()`; backdrop, drag, Popover deferral, Tooltip non-deferral, nested and sibling dialogs; a Popover root co-applied with its own Content, and one co-applied with Dialog Content, nested under the Dialog; an outer Dialog natively closed over an inner one still requested open reported through `ErrorHandler`, also one opened during the outer exit, and a `requestClose()` with the inner closed in the same turn not reported; a longer inner exit ended with the outer's close; a Tooltip and a Popover projected through a wrapper's `<ng-content>`, or slotted, take the first Escape, `requestClose()` and backdrop gesture, are hidden at the Dialog's close request with intent kept, take no Escape or `requestClose()` during its exit and present again on reopen, and a projected inner Dialog still open at the wrapper's native close is reported; scroll lock; `returnFocus`, Trigger fallback, also with Content in a shadow root and focus on a slotted child, removal while modal; Options replacement and `hostDirectives` root; SSR without `open`, opening after eager and incremental hydration; AlertDialog: `role="alertdialog"` also in server HTML, backdrop never dismisses it while a Popover inside still closes, Escape and `requestClose()` governed by `dismissible`, Close always closes, `autofocus` on Close, a delete confirmation staying open while pending and after failure, own-token Options replacement and a `hostDirectives` root exposing `open`; opener: inputs (required, defaulted signal, transformed, aliased), models one- and two-way and outputs bound by a typed record and live under zoneless change detection, `closed` after the exit with the host removed and the component destroyed, every close path including `ref.close()` and `Location` navigation with an exit, `close()` before the first render never shown, the owner destroyed while open and mid-exit with focus returned to the surviving launch button, also with a second dialog of the same opener opened from a control inside the first, focus returned down the stack when stacked dialogs end out of order: two openers of one owner disposed in declaration order, a query-only navigation whose older dialog's shorter exit ends first, an outer dialog natively closed over its owned inner one, a nested opener with an AlertDialog-hosted component, the outer dialog's owner destroyed or its `close()` completing with the inner one open, both torn down and focus returned to the surviving launch button, and `open()` throwing on the server |
| T-Select      | Combobox Trigger with `aria-controls`, `aria-expanded` and an `aria-activedescendant` only while open and only naming a mounted option, listbox Content, options with always-present `aria-selected`; closed Enter/Space/ArrowDown/ArrowUp/Home/End/character opening on the stated option; open arrows without wrapping, Home/End, PageUp/PageDown, typeahead buffering, cycling, Space in a search, disabled skipping; Enter and Space choose and stay closed; Escape, Tab and an outside click close without writing, also an Escape in the opening frame; a reopen starting a new typeahead search; focus on the Trigger after every key and pointer step in three engines; pointer activation and choice, disabled options ignored; external, unknown, null and removed values, options arriving later, an `open` write without an active option; disabled blocks opening and closes an open list; scrolling a capped list of 111 without scrolling the page; nesting in a Dialog and in Popover Content, a Tooltip on the Trigger; number and boolean values, a string option never matching a number; `selectedOption()` records, null cases, later options and duplicates; replacement precedence of every part composed through `hostDirectives`, by factory and existing providers, with options' Options from a wrapper input; strict-template inference of `T` and its negatives; SSR closed with the consumer's label, replayed Trigger click opening once, deferred options reachable only once hydrated |
| T-Hydration   | Development/production serving; eager/deferred node retention; no transient duplication; generated identity; event replay; post-hydration interaction                       |
| T-Support     | Skipped formal Baseline audit recorded without certification; optional enhancement degradation; explicit Chromium/Firefox/WebKit runtime evidence and stated limits         |

Acceptance tests use public imports and genuine dependency behavior, not private Context methods or fake Angular APIs. Real animation/native platform claims need real browser observations; jsdom units alone cannot prove geometry, trusted input, focus or hydration.

A change to a requirement updates its cases and assertions in the same change. Test cases may not invent semantics this contract leaves unresolved. No full router-style evaluator framework is assumed necessary.

## 26. Scope, growth and exclusions [X]

The catalogue grows one consumer-backed primitive at a time. A concrete consumer need justifies a primitive; its frequency in other libraries does not. Each new primitive adds its own section to this contract, with acceptance cases and gate coverage, before or with its implementation (section 28).

- Shared interaction infrastructure stays package-private: ordered focus/roving navigation, typeahead, active-descendant, layer/dismiss participation, hover/focus intent and modal containment.
- Form-control primitives integrate with Angular Signal Forms. There is no `ControlValueAccessor` layer.
- A modal Dialog builds on native `<dialog>` and `showModal()` (section 22). Origami owns light dismiss itself in every engine and doesn't set `dialog[closedby]`.

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

## 27. Extraction source and dependency research

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

A filesystem-read-only inspector independently identified the Baseline conflict, until-found gap, construction-order identity risk and deferred Presence proof gap. Main disposition: support conflicts accepted as evidenced; hydration risks accepted as required proof/design questions, **not reproduced defects**. User decisions resolve the first three policy boundaries as recorded in section 1. Popover's hybrid design/API/lifecycle is approved as recorded in section 11; the formal Baseline audit was explicitly skipped. Runtime qualification follows section 24.

## 28. Adding a primitive

A new primitive ships with:

- Its own section in this contract, with its own section ID: selectors, export names, Options/State shapes, behavior, SSR/hydration semantics and exclusions, plus its rows in section 4's entrypoint and shape tables.
- Options → private Context → readonly State composition per section 3, including typed Options substitution and `hostDirectives` composition: an Options token for every application-applied directive with an input or model (section 3, Configuration), and an `exportAs` and readonly `state` on every application-applied directive that provides or composes a State (section 3, Context and State); internal `ɵ` composition directives are exempt.
- Complete public TSDoc per section 4.
- A `<primitive>/README.md` with its usage, linked from the package README's entry-point table.
- SSR plus eager and incremental hydration per section 24.
- Chromium, Firefox and WebKit qualification in development and production.
- Acceptance cases in [acceptance/CASES.md](acceptance/CASES.md), a group in section 25's coverage map and assertions in the acceptance gate.
- A design map in `<primitive>/DESIGN.md`, approved by loozo before implementation and checked against the code before sign-off. It records ownership and read timing only:
  - who owns each fact the primitive depends on, and who reads it;
  - for every read of state another part owns: the reader, the lifecycle phase (construction, render, after render, event), the platform, and what the reader gets if the owner's inputs aren't set yet;
  - every place where correctness depends on Angular refreshing a view again.

  Render-time reads follow section 3's registration rules: a part reads its own Options, its ancestors' Options and State, and registrations other parts have made. A direct render-time read of a sibling's Options isn't valid: repeated items, later sibling views and child components are layouts where the sibling's inputs aren't set yet.
