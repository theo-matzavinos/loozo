import {
  APP_ID,
  Component,
  Directive,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  InjectionToken,
  Service,
  createComponent,
  createEnvironmentInjector,
  forwardRef,
  inject,
  input,
  runInInjectionContext,
  signal,
} from "@angular/core";
import {
  OrigamiCollection,
  OrigamiCollectionItem,
  OrigamiCollectionItemOptions,
  OrigamiCollectionState,
} from "@loozo/origami-ui/collection";
import {
  OrigamiPresence,
  OrigamiPresenceOptions,
  OrigamiPresenceState,
} from "@loozo/origami-ui/presence";
import {
  OrigamiCollapsible,
  OrigamiCollapsibleOptions,
  OrigamiCollapsibleState,
  OrigamiCollapsibleTrigger,
  OrigamiCollapsibleTriggerOptions,
  OrigamiCollapsiblePanel,
  OrigamiCollapsiblePanelOptions,
  type OrigamiCollapsibleHiding,
} from "@loozo/origami-ui/collapsible";
import {
  OrigamiAccordionSingle,
  OrigamiAccordionSingleOptions,
  OrigamiAccordionMultiple,
  OrigamiAccordionMultipleOptions,
  OrigamiAccordionOptions,
  OrigamiAccordionState,
  OrigamiAccordionItem,
  OrigamiAccordionTrigger,
  OrigamiAccordionTriggerOptions,
  OrigamiAccordionPanel,
  OrigamiAccordionPanelOptions,
} from "@loozo/origami-ui/accordion";
import {
  OrigamiPopover,
  OrigamiPopoverOptions,
  OrigamiPopoverState,
  OrigamiPopoverTrigger,
  OrigamiPopoverTriggerOptions,
  OrigamiPopoverAnchor,
  OrigamiPopoverAnchorOptions,
  OrigamiPopoverContent,
  OrigamiPopoverContentOptions,
  OrigamiPopoverContentState,
  type OrigamiPopoverSide,
  type OrigamiPopoverAlign,
} from "@loozo/origami-ui/popover";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { CompositionConsumer } from "./seeds/composition-consumer.js";
import { createApplication } from "@angular/platform-browser";
import type { ApplicationRef } from "@angular/core";
import { ReadonlyStates } from "./readonly-states.js";
import { Precedence } from "./precedence.js";
import { TogglePrecedence } from "./toggle-precedence.js";
import { TabsPrecedence } from "./tabs-precedence.js";
import { ToggleGroupPrecedence } from "./toggle-group-precedence.js";
import { ToolbarPrecedence } from "./toolbar-precedence.js";
import { RadioGroupPrecedence } from "./radio-group-precedence.js";

@Component({
  selector: "acceptance-identity-owner",
  host: {
    "[attr.data-generated-id]": "identity",
    "[attr.data-generated-allocations]": "allocations",
    "[id]": "domId()",
  },
  template: `{{ identity }}`,
})
export class IdentityOwner {
  readonly domId = input("");
  readonly identity = injectUniqueId("independent-repeated-key");
  // Repeated same-key calls and odd keys on one host; JSON keeps any value attribute-safe.
  readonly allocations = JSON.stringify([
    this.identity,
    injectUniqueId("independent-repeated-key"),
    injectUniqueId("\ud800"),
    injectUniqueId("\ufffd"),
  ]);
}

/** Root service: an allocation without an element host. */
@Service()
export class CompositionApplicationIdentity {
  readonly identity = injectUniqueId("composition-without-element");
}

/** Created in router-style child EnvironmentInjectors, also without an element host. */
@Service({ autoProvided: false })
export class CompositionEnvironmentIdentity {
  readonly identity = injectUniqueId("composition-environment-repeated");
  readonly second = injectUniqueId("composition-environment-repeated");
}

@Component({ selector: "acceptance-application-host-identity", template: "" })
export class ApplicationHostIdentity {
  readonly identity = injectUniqueId("application-host");
}
@Component({
  selector: "acceptance-independent-identities",
  imports: [IdentityOwner],
  template: `<acceptance-identity-owner /><acceptance-identity-owner />`,
})
export class IndependentIdentities {}

@Directive({
  selector: "[acceptanceExistingPresence]",
  exportAs: "acceptanceExistingPresence",
  hostDirectives: [{ directive: OrigamiPresence, outputs: ["presentChange: unusedPresentChange"] }],
  providers: [OrigamiPresenceOptions.provideExisting(() => ExistingPresence)],
})
export class ExistingPresence implements OrigamiPresenceOptions {
  readonly present = signal(true);
  readonly state = inject(OrigamiPresenceState);
}

@Directive({
  selector: "[acceptanceExistingCollectionItem]",
  exportAs: "acceptanceExistingCollectionItem",
  hostDirectives: [OrigamiCollectionItem],
  providers: [OrigamiCollectionItemOptions.provideExisting(() => ExistingCollectionItem)],
})
export class ExistingCollectionItem implements OrigamiCollectionItemOptions {
  readonly value = input("provided-item");
}

@Directive({
  selector: "[acceptanceExistingCollapsible]",
  exportAs: "acceptanceExistingCollapsible",
  hostDirectives: [
    { directive: OrigamiCollapsible, outputs: ["expandedChange: unusedExpandedChange"] },
  ],
  providers: [OrigamiCollapsibleOptions.provideExisting(() => ExistingCollapsible)],
})
export class ExistingCollapsible implements OrigamiCollapsibleOptions {
  readonly expanded = signal(true);
  readonly disabled = signal(false);
  readonly hiding = signal<OrigamiCollapsibleHiding>("hidden");
  readonly state = inject(OrigamiCollapsibleState);
}

@Directive({
  selector: "[acceptanceExistingCollapsibleTrigger]",
  exportAs: "acceptanceExistingCollapsibleTrigger",
  hostDirectives: [OrigamiCollapsibleTrigger],
  providers: [OrigamiCollapsibleTriggerOptions.provideExisting(() => ExistingCollapsibleTrigger)],
})
export class ExistingCollapsibleTrigger implements OrigamiCollapsibleTriggerOptions {
  readonly id = input("provided-trigger");
}

@Directive({
  selector: "[acceptanceExistingCollapsiblePanel]",
  exportAs: "acceptanceExistingCollapsiblePanel",
  hostDirectives: [OrigamiCollapsiblePanel],
  providers: [OrigamiCollapsiblePanelOptions.provideExisting(() => ExistingCollapsiblePanel)],
})
export class ExistingCollapsiblePanel implements OrigamiCollapsiblePanelOptions {
  readonly id = input("provided-panel");
  readonly state = inject(OrigamiPresenceState);
}

@Directive({
  selector: "[acceptanceExistingSingle]",
  exportAs: "acceptanceExistingSingle",
  hostDirectives: [
    { directive: OrigamiAccordionSingle, outputs: ["valueChange: unusedValueChange"] },
  ],
  providers: [OrigamiAccordionSingleOptions.provideExisting(() => ExistingSingle)],
})
export class ExistingSingle implements OrigamiAccordionSingleOptions {
  readonly value = signal<string | null>(null);
  readonly disabled = signal(false);
  readonly collapsible = signal(true);
  readonly state = inject(OrigamiAccordionState);
}

@Directive({
  selector: "[acceptanceExistingMultiple]",
  exportAs: "acceptanceExistingMultiple",
  hostDirectives: [
    { directive: OrigamiAccordionMultiple, outputs: ["valueChange: unusedValueChange"] },
  ],
  providers: [OrigamiAccordionMultipleOptions.provideExisting(() => ExistingMultiple)],
})
export class ExistingMultiple implements OrigamiAccordionMultipleOptions {
  readonly value = signal<readonly string[]>([]);
  readonly disabled = signal(false);
  readonly state = inject(OrigamiAccordionState);
}

@Directive({
  selector: "[acceptanceExistingAccordionTrigger]",
  exportAs: "acceptanceExistingAccordionTrigger",
  hostDirectives: [OrigamiAccordionTrigger],
  providers: [OrigamiAccordionTriggerOptions.provideExisting(() => ExistingAccordionTrigger)],
})
export class ExistingAccordionTrigger implements OrigamiAccordionTriggerOptions {
  readonly id = input("provided-accordion-trigger");
}

@Directive({
  selector: "[acceptanceExistingAccordionPanel]",
  exportAs: "acceptanceExistingAccordionPanel",
  hostDirectives: [OrigamiAccordionPanel],
  providers: [OrigamiAccordionPanelOptions.provideExisting(() => ExistingAccordionPanel)],
})
export class ExistingAccordionPanel implements OrigamiAccordionPanelOptions {
  readonly id = input("provided-accordion-panel");
  readonly state = inject(OrigamiPresenceState);
}

@Directive({
  selector: "[acceptanceExistingPopover]",
  exportAs: "acceptanceExistingPopover",
  hostDirectives: [{ directive: OrigamiPopover, outputs: ["openChange: unusedOpenChange"] }],
  providers: [OrigamiPopoverOptions.provideExisting(() => ExistingPopover)],
})
export class ExistingPopover implements OrigamiPopoverOptions {
  readonly open = signal(false);
  readonly disabled = signal(false);
  readonly dismissible = signal(true);
  readonly state = inject(OrigamiPopoverState);
}

@Directive({
  selector: "[acceptanceExistingPopoverTrigger]",
  exportAs: "acceptanceExistingPopoverTrigger",
  hostDirectives: [OrigamiPopoverTrigger],
  providers: [OrigamiPopoverTriggerOptions.provideExisting(() => ExistingPopoverTrigger)],
})
export class ExistingPopoverTrigger implements OrigamiPopoverTriggerOptions {
  readonly id = input("provided-popover-trigger");
}

@Directive({
  selector: "[acceptanceExistingPopoverAnchor]",
  exportAs: "acceptanceExistingPopoverAnchor",
  hostDirectives: [OrigamiPopoverAnchor],
  providers: [OrigamiPopoverAnchorOptions.provideExisting(() => ExistingPopoverAnchor)],
})
export class ExistingPopoverAnchor implements OrigamiPopoverAnchorOptions {
  readonly id = input("provided-anchor");
}

@Directive({
  selector: "[acceptanceExistingPopoverContent]",
  exportAs: "acceptanceExistingPopoverContent",
  host: {
    "[attr.data-options-side]": "side()",
    "[attr.data-options-align]": "align()",
    "[attr.data-options-gap]": "gap()",
  },
  hostDirectives: [OrigamiPopoverContent],
  providers: [OrigamiPopoverContentOptions.provideExisting(() => ExistingPopoverContent)],
})
export class ExistingPopoverContent implements OrigamiPopoverContentOptions {
  readonly id = input("provided-content");
  readonly side = signal<OrigamiPopoverSide>("block-end");
  readonly align = signal<OrigamiPopoverAlign>("start");
  readonly gap = signal(8);
  readonly state = inject(OrigamiPopoverContentState);
}

@Directive({
  selector: "[acceptanceFactoryPresence]",
  exportAs: "acceptanceFactoryPresence",
  hostDirectives: [{ directive: OrigamiPresence, outputs: ["presentChange: unusedPresentChange"] }],
  providers: [OrigamiPresenceOptions.provideFactory(() => inject(FactoryPresence))],
})
export class FactoryPresence implements OrigamiPresenceOptions {
  readonly present = signal(true);
  readonly state = inject(OrigamiPresenceState);
}

@Directive({
  selector: "[acceptanceFactoryCollectionItem]",
  exportAs: "acceptanceFactoryCollectionItem",
  hostDirectives: [OrigamiCollectionItem],
  providers: [OrigamiCollectionItemOptions.provideFactory(() => inject(FactoryCollectionItem))],
})
export class FactoryCollectionItem implements OrigamiCollectionItemOptions {
  readonly value = input("provided-item");
}

@Directive({
  selector: "[acceptanceFactoryCollapsible]",
  exportAs: "acceptanceFactoryCollapsible",
  hostDirectives: [
    { directive: OrigamiCollapsible, outputs: ["expandedChange: unusedExpandedChange"] },
  ],
  providers: [OrigamiCollapsibleOptions.provideFactory(() => inject(FactoryCollapsible))],
})
export class FactoryCollapsible implements OrigamiCollapsibleOptions {
  readonly expanded = signal(true);
  readonly disabled = signal(false);
  readonly hiding = signal<OrigamiCollapsibleHiding>("hidden");
  readonly state = inject(OrigamiCollapsibleState);
}

@Directive({
  selector: "[acceptanceFactoryCollapsibleTrigger]",
  exportAs: "acceptanceFactoryCollapsibleTrigger",
  hostDirectives: [OrigamiCollapsibleTrigger],
  providers: [
    OrigamiCollapsibleTriggerOptions.provideFactory(() => inject(FactoryCollapsibleTrigger)),
  ],
})
export class FactoryCollapsibleTrigger implements OrigamiCollapsibleTriggerOptions {
  readonly id = input("provided-trigger");
}

@Directive({
  selector: "[acceptanceFactoryCollapsiblePanel]",
  exportAs: "acceptanceFactoryCollapsiblePanel",
  hostDirectives: [OrigamiCollapsiblePanel],
  providers: [OrigamiCollapsiblePanelOptions.provideFactory(() => inject(FactoryCollapsiblePanel))],
})
export class FactoryCollapsiblePanel implements OrigamiCollapsiblePanelOptions {
  readonly id = input("provided-panel");
  readonly state = inject(OrigamiPresenceState);
}

@Directive({
  selector: "[acceptanceFactorySingle]",
  exportAs: "acceptanceFactorySingle",
  hostDirectives: [
    { directive: OrigamiAccordionSingle, outputs: ["valueChange: unusedValueChange"] },
  ],
  providers: [OrigamiAccordionSingleOptions.provideFactory(() => inject(FactorySingle))],
})
export class FactorySingle implements OrigamiAccordionSingleOptions {
  readonly value = signal<string | null>(null);
  readonly disabled = signal(false);
  readonly collapsible = signal(true);
  readonly state = inject(OrigamiAccordionState);
}

@Directive({
  selector: "[acceptanceFactoryMultiple]",
  exportAs: "acceptanceFactoryMultiple",
  hostDirectives: [
    { directive: OrigamiAccordionMultiple, outputs: ["valueChange: unusedValueChange"] },
  ],
  providers: [OrigamiAccordionMultipleOptions.provideFactory(() => inject(FactoryMultiple))],
})
export class FactoryMultiple implements OrigamiAccordionMultipleOptions {
  readonly value = signal<readonly string[]>([]);
  readonly disabled = signal(false);
  readonly state = inject(OrigamiAccordionState);
}

@Directive({
  selector: "[acceptanceFactoryAccordionTrigger]",
  exportAs: "acceptanceFactoryAccordionTrigger",
  hostDirectives: [OrigamiAccordionTrigger],
  providers: [OrigamiAccordionTriggerOptions.provideFactory(() => inject(FactoryAccordionTrigger))],
})
export class FactoryAccordionTrigger implements OrigamiAccordionTriggerOptions {
  readonly id = input("provided-accordion-trigger");
}

@Directive({
  selector: "[acceptanceFactoryAccordionPanel]",
  exportAs: "acceptanceFactoryAccordionPanel",
  hostDirectives: [OrigamiAccordionPanel],
  providers: [OrigamiAccordionPanelOptions.provideFactory(() => inject(FactoryAccordionPanel))],
})
export class FactoryAccordionPanel implements OrigamiAccordionPanelOptions {
  readonly id = input("provided-accordion-panel");
  readonly state = inject(OrigamiPresenceState);
}

@Directive({
  selector: "[acceptanceFactoryPopover]",
  exportAs: "acceptanceFactoryPopover",
  hostDirectives: [{ directive: OrigamiPopover, outputs: ["openChange: unusedOpenChange"] }],
  providers: [OrigamiPopoverOptions.provideFactory(() => inject(FactoryPopover))],
})
export class FactoryPopover implements OrigamiPopoverOptions {
  readonly open = signal(false);
  readonly disabled = signal(false);
  readonly dismissible = signal(true);
  readonly state = inject(OrigamiPopoverState);
}

@Directive({
  selector: "[acceptanceFactoryPopoverTrigger]",
  exportAs: "acceptanceFactoryPopoverTrigger",
  hostDirectives: [OrigamiPopoverTrigger],
  providers: [OrigamiPopoverTriggerOptions.provideFactory(() => inject(FactoryPopoverTrigger))],
})
export class FactoryPopoverTrigger implements OrigamiPopoverTriggerOptions {
  readonly id = input("provided-popover-trigger");
}

@Directive({
  selector: "[acceptanceFactoryPopoverAnchor]",
  exportAs: "acceptanceFactoryPopoverAnchor",
  hostDirectives: [OrigamiPopoverAnchor],
  providers: [OrigamiPopoverAnchorOptions.provideFactory(() => inject(FactoryPopoverAnchor))],
})
export class FactoryPopoverAnchor implements OrigamiPopoverAnchorOptions {
  readonly id = input("provided-anchor");
}

@Directive({
  selector: "[acceptanceFactoryPopoverContent]",
  exportAs: "acceptanceFactoryPopoverContent",
  host: {
    "[attr.data-options-side]": "side()",
    "[attr.data-options-align]": "align()",
    "[attr.data-options-gap]": "gap()",
  },
  hostDirectives: [OrigamiPopoverContent],
  providers: [OrigamiPopoverContentOptions.provideFactory(() => inject(FactoryPopoverContent))],
})
export class FactoryPopoverContent implements OrigamiPopoverContentOptions {
  readonly id = input("provided-content");
  readonly side = signal<OrigamiPopoverSide>("block-end");
  readonly align = signal<OrigamiPopoverAlign>("start");
  readonly gap = signal(8);
  readonly state = inject(OrigamiPopoverContentState);
}

/** Abstract forward-reference alias plus the shared and mode-specific tokens. */
export abstract class AbstractSharedSingle {
  abstract readonly disabled: ReturnType<typeof signal<boolean>>;
  abstract readonly value: ReturnType<typeof signal<string | null>>;
  abstract readonly collapsible: ReturnType<typeof signal<boolean>>;
}
@Directive({
  selector: "[sharedSingle]",
  exportAs: "sharedSingle",
  hostDirectives: [OrigamiAccordionSingle],
  providers: [
    { provide: AbstractSharedSingle, useExisting: forwardRef(() => SharedSingle) },
    OrigamiAccordionOptions.provideExisting(() => AbstractSharedSingle),
    OrigamiAccordionSingleOptions.provideExisting(() => AbstractSharedSingle),
  ],
})
export class SharedSingle extends AbstractSharedSingle {
  readonly disabled = signal(true);
  readonly value = signal<string | null>(null);
  readonly collapsible = signal(true);
}
@Directive({
  selector: "[sharedFactorySingle]",
  exportAs: "sharedFactorySingle",
  hostDirectives: [OrigamiAccordionSingle],
  providers: [
    OrigamiAccordionOptions.provideFactory(() => inject(SharedFactorySingle)),
    OrigamiAccordionSingleOptions.provideFactory(() => inject(SharedFactorySingle)),
  ],
})
export class SharedFactorySingle {
  readonly disabled = signal(true);
  readonly value = signal<string | null>(null);
  readonly collapsible = signal(true);
}

@Directive({ selector: "[composedCollection]", hostDirectives: [OrigamiCollection] })
export class ComposedCollection {}
@Directive({ selector: "[composedAccordionItem]", hostDirectives: [OrigamiAccordionItem] })
export class ComposedAccordionItem {}
@Directive({ selector: "[stateObservation]", exportAs: "stateObservation" })
export class StateObservation {
  readonly collapsible = inject(OrigamiCollapsibleState, { optional: true });
  readonly accordion = inject(OrigamiAccordionState, { optional: true });
  readonly collection = inject(OrigamiCollectionState, { optional: true });
  readonly popover = inject(OrigamiPopoverState, { optional: true });
}

@Component({
  selector: "acceptance-composition-fixture",
  imports: [
    CompositionConsumer,
    ComposedCollection,
    ComposedAccordionItem,
    StateObservation,
    OrigamiCollection,
    OrigamiAccordionItem,
    OrigamiAccordionTrigger,
    OrigamiAccordionPanel,
    OrigamiCollapsibleTrigger,
    OrigamiCollapsiblePanel,
    IdentityOwner,
    ReadonlyStates,
    ExistingPresence,
    ExistingCollectionItem,
    ExistingCollapsible,
    ExistingCollapsibleTrigger,
    ExistingCollapsiblePanel,
    ExistingSingle,
    ExistingMultiple,
    ExistingAccordionTrigger,
    ExistingAccordionPanel,
    ExistingPopover,
    ExistingPopoverTrigger,
    ExistingPopoverAnchor,
    ExistingPopoverContent,
    FactoryPresence,
    FactoryCollectionItem,
    FactoryCollapsible,
    FactoryCollapsibleTrigger,
    FactoryCollapsiblePanel,
    FactorySingle,
    FactoryMultiple,
    FactoryAccordionTrigger,
    FactoryAccordionPanel,
    FactoryPopover,
    FactoryPopoverTrigger,
    FactoryPopoverAnchor,
    FactoryPopoverContent,
    SharedSingle,
    SharedFactorySingle,
    Precedence,
    TogglePrecedence,
    TabsPrecedence,
    ToggleGroupPrecedence,
    ToolbarPrecedence,
    RadioGroupPrecedence,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">Attach composition behavior</button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <acceptance-composition />

    <section data-testid="existing-providers">
      <h2>Existing Options</h2>
      <div composedCollection readonlyStates #collectionReadExisting="readonlyStates"><span acceptanceExistingCollectionItem [value]="itemValue()">Provided item</span>
        <output data-testid="existing-collection-readonly">{{ collectionReadExisting.valid() }}</output>
      </div>
      <div acceptanceExistingPresence #presenceExisting="acceptanceExistingPresence" data-testid="existing-presence">
        <span readonlyStates #presenceReadExisting="readonlyStates"><output data-testid="existing-presence-readonly">{{ presenceReadExisting.valid() }}</output></span>
        @if (presenceExisting.state.open()) { <p data-testid="existing-presence-child">Composed presence</p> }
      </div>
      <button type="button" data-testid="existing-present" (click)="presenceExisting.present.set(!presenceExisting.present())">Toggle provided presence</button>
      <section acceptanceExistingCollapsible #rootExisting="acceptanceExistingCollapsible" data-testid="existing-root" (unusedExpandedChange)="unusedOutputs.update(increment)">
        <button acceptanceExistingCollapsibleTrigger [id]="id() + '-existing'" data-testid="existing-options-trigger">Provided trigger</button>
        <div acceptanceExistingCollapsiblePanel [id]="id() + '-panel-existing'" data-testid="existing-options-panel">Provided panel</div>
        <button type="button" data-testid="existing-options-disable" (click)="rootExisting.disabled.set(!rootExisting.disabled())">Change effective disabled Options</button>
        <span readonlyStates #collapsibleReadExisting="readonlyStates"><output data-testid="existing-collapsible-readonly">{{ collapsibleReadExisting.valid() }}</output></span>
        <span stateObservation #firstExisting="stateObservation"></span><span stateObservation #secondExisting="stateObservation"></span>
        <output data-testid="existing-same-state">{{ rootExisting.state === firstExisting.collapsible && firstExisting.collapsible === secondExisting.collapsible }}</output>
        <section acceptanceExistingCollapsible #nestedExisting="acceptanceExistingCollapsible">
          <span stateObservation #nearestExisting="stateObservation"></span>
          <output data-testid="existing-nearest-state">{{ nestedExisting.state === nearestExisting.collapsible && rootExisting.state !== nearestExisting.collapsible }}</output>
        </section>
      </section>
      <section acceptanceExistingSingle #singleExisting="acceptanceExistingSingle" (unusedValueChange)="unusedOutputs.update(increment)">
        <article composedAccordionItem ogAccordionItem value="one">
          <button acceptanceExistingAccordionTrigger ogAccordionTrigger [id]="id() + '-accordion-existing'" data-testid="existing-accordion-trigger">Diamond-matched trigger</button>
          <div acceptanceExistingAccordionPanel ogAccordionPanel [id]="id() + '-accordion-panel-existing'" data-testid="existing-accordion-panel">Diamond-matched panel</div>
        </article>
        <span readonlyStates #accordionReadExisting="readonlyStates"><output data-testid="existing-accordion-readonly">{{ accordionReadExisting.valid() }}</output></span>
        <output data-testid="existing-single-value">{{ singleExisting.value() }}</output>
      </section>
      <section acceptanceExistingMultiple #multipleExisting="acceptanceExistingMultiple" (unusedValueChange)="unusedOutputs.update(increment)">
        <article ogAccordionItem value="one"><button ogAccordionTrigger data-testid="existing-multiple-trigger">Multiple selection</button><div ogAccordionPanel>Multiple panel</div></article>
        <output data-testid="existing-multiple-value">{{ multipleExisting.value().join(',') }}</output>
      </section>
      <section acceptanceExistingPopover #popoverExisting="acceptanceExistingPopover" (unusedOpenChange)="unusedOutputs.update(increment)">
        <button acceptanceExistingPopoverTrigger [id]="id() + '-popover-existing'" data-testid="existing-popover-trigger">Provided popover trigger</button>
        <span acceptanceExistingPopoverAnchor [id]="id() + '-anchor-existing'" data-testid="existing-popover-anchor">Provided anchor</span>
        <section acceptanceExistingPopoverContent #contentExisting="acceptanceExistingPopoverContent" [id]="id() + '-content-existing'" class="surface" data-testid="existing-popover-content">
          <span readonlyStates #popoverReadExisting="readonlyStates"><output data-testid="existing-popover-readonly">{{ popoverReadExisting.valid() }}</output></span>
          @if (contentExisting.state.open()) {
            <button type="button" data-testid="existing-popover-protect" (click)="popoverExisting.dismissible.set(false)">Protect replaced root Options</button>
            <button type="button" data-testid="existing-popover-reposition" (click)="contentExisting.side.set('inline-end'); contentExisting.align.set('end'); contentExisting.gap.set(12)">Change complete Content Options</button>
          }
        </section>
        <output data-testid="existing-popover-open">{{ popoverExisting.state.open() }}</output>
      </section>
    </section>

    <section data-testid="factory-providers">
      <h2>Factory Options</h2>
      <div composedCollection readonlyStates #collectionReadFactory="readonlyStates"><span acceptanceFactoryCollectionItem [value]="itemValue()">Provided item</span>
        <output data-testid="factory-collection-readonly">{{ collectionReadFactory.valid() }}</output>
      </div>
      <div acceptanceFactoryPresence #presenceFactory="acceptanceFactoryPresence" data-testid="factory-presence">
        <span readonlyStates #presenceReadFactory="readonlyStates"><output data-testid="factory-presence-readonly">{{ presenceReadFactory.valid() }}</output></span>
        @if (presenceFactory.state.open()) { <p data-testid="factory-presence-child">Composed presence</p> }
      </div>
      <button type="button" data-testid="factory-present" (click)="presenceFactory.present.set(!presenceFactory.present())">Toggle provided presence</button>
      <section acceptanceFactoryCollapsible #rootFactory="acceptanceFactoryCollapsible" data-testid="factory-root" (unusedExpandedChange)="unusedOutputs.update(increment)">
        <button acceptanceFactoryCollapsibleTrigger [id]="id() + '-factory'" data-testid="factory-options-trigger">Provided trigger</button>
        <div acceptanceFactoryCollapsiblePanel [id]="id() + '-panel-factory'" data-testid="factory-options-panel">Provided panel</div>
        <button type="button" data-testid="factory-options-disable" (click)="rootFactory.disabled.set(!rootFactory.disabled())">Change effective disabled Options</button>
        <span readonlyStates #collapsibleReadFactory="readonlyStates"><output data-testid="factory-collapsible-readonly">{{ collapsibleReadFactory.valid() }}</output></span>
        <span stateObservation #firstFactory="stateObservation"></span><span stateObservation #secondFactory="stateObservation"></span>
        <output data-testid="factory-same-state">{{ rootFactory.state === firstFactory.collapsible && firstFactory.collapsible === secondFactory.collapsible }}</output>
        <section acceptanceFactoryCollapsible #nestedFactory="acceptanceFactoryCollapsible">
          <span stateObservation #nearestFactory="stateObservation"></span>
          <output data-testid="factory-nearest-state">{{ nestedFactory.state === nearestFactory.collapsible && rootFactory.state !== nearestFactory.collapsible }}</output>
        </section>
      </section>
      <section acceptanceFactorySingle #singleFactory="acceptanceFactorySingle" (unusedValueChange)="unusedOutputs.update(increment)">
        <article composedAccordionItem ogAccordionItem value="one">
          <button acceptanceFactoryAccordionTrigger ogAccordionTrigger [id]="id() + '-accordion-factory'" data-testid="factory-accordion-trigger">Diamond-matched trigger</button>
          <div acceptanceFactoryAccordionPanel ogAccordionPanel [id]="id() + '-accordion-panel-factory'" data-testid="factory-accordion-panel">Diamond-matched panel</div>
        </article>
        <span readonlyStates #accordionReadFactory="readonlyStates"><output data-testid="factory-accordion-readonly">{{ accordionReadFactory.valid() }}</output></span>
        <output data-testid="factory-single-value">{{ singleFactory.value() }}</output>
      </section>
      <section acceptanceFactoryMultiple #multipleFactory="acceptanceFactoryMultiple" (unusedValueChange)="unusedOutputs.update(increment)">
        <article ogAccordionItem value="one"><button ogAccordionTrigger data-testid="factory-multiple-trigger">Multiple selection</button><div ogAccordionPanel>Multiple panel</div></article>
        <output data-testid="factory-multiple-value">{{ multipleFactory.value().join(',') }}</output>
      </section>
      <section acceptanceFactoryPopover #popoverFactory="acceptanceFactoryPopover" (unusedOpenChange)="unusedOutputs.update(increment)">
        <button acceptanceFactoryPopoverTrigger [id]="id() + '-popover-factory'" data-testid="factory-popover-trigger">Provided popover trigger</button>
        <span acceptanceFactoryPopoverAnchor [id]="id() + '-anchor-factory'" data-testid="factory-popover-anchor">Provided anchor</span>
        <section acceptanceFactoryPopoverContent #contentFactory="acceptanceFactoryPopoverContent" [id]="id() + '-content-factory'" class="surface" data-testid="factory-popover-content">
          <span readonlyStates #popoverReadFactory="readonlyStates"><output data-testid="factory-popover-readonly">{{ popoverReadFactory.valid() }}</output></span>
          @if (contentFactory.state.open()) {
            <button type="button" data-testid="factory-popover-protect" (click)="popoverFactory.dismissible.set(false)">Protect replaced root Options</button>
            <button type="button" data-testid="factory-popover-reposition" (click)="contentFactory.side.set('inline-end'); contentFactory.align.set('end'); contentFactory.gap.set(12)">Change complete Content Options</button>
          }
        </section>
        <output data-testid="factory-popover-open">{{ popoverFactory.state.open() }}</output>
      </section>
    </section>

    <button type="button" data-testid="all-provider-ids" (click)="id.set('changed-provider')">Change all provider IDs</button>
    <section sharedSingle><article ogAccordionItem value="one"><button ogAccordionTrigger data-testid="shared-existing-trigger">Abstract shared Options</button><div ogAccordionPanel>Panel</div></article></section>
    <section sharedFactorySingle><article ogAccordionItem value="one"><button ogAccordionTrigger data-testid="shared-factory-trigger">Factory shared Options</button><div ogAccordionPanel>Panel</div></article></section>
    <output data-testid="provider-unused-outputs">{{ unusedOutputs() }}</output>
    <button type="button" data-testid="utilities-outside" (click)="checkOutsideContext()">Check required injection context</button>
    <output data-testid="outside-injection-errors">{{ outsideErrors() }}</output>
    <button type="button" data-testid="identity-reorder" (click)="identityKeys.set(['second', 'first'])">Reorder identity owners</button>
    <button type="button" data-testid="identity-dom-id" (click)="identityDomId.set('changed-domain')">Change consumer DOM IDs</button>
    @for (key of identityKeys(); track key) {
      <acceptance-identity-owner [domId]="identityDomId() + '-' + key" [attr.data-key]="key" data-testid="identity-owner" />
    }
    <button type="button" data-testid="independent-applications" (click)="mountIndependentApplications()">Mount two independent Angular applications</button>
    <div data-testid="independent-host-a"></div><div data-testid="independent-host-b"></div>
    <button type="button" data-testid="application-isolation" (click)="verifyApplicationNamespaces()">Reuse a destroyed application's host</button>
    <output data-testid="application-isolation-result">{{ applicationIsolation() }}</output>
    @if (attached()) {
      <output data-testid="unhosted-identities">{{ unhostedIdentities }}</output>
    }
    <acceptance-precedence />
    <acceptance-toggle-precedence />
    <acceptance-tabs-precedence />
    <acceptance-toggle-group-precedence />
    <acceptance-toolbar-precedence />
    <acceptance-radio-group-precedence />
  `,
  styles: `
    :host {
      display: block;
      color-scheme: dark;
    }
    section {
      margin-block: 16px;
    }
    output {
      display: block;
    }
    .surface {
      inline-size: 160px;
      padding: 8px;
      background: #222;
      color: #eee;
    }
  `,
})
export class CompositionFixture {
  readonly attached = signal(false);
  readonly itemValue = signal("provided-item");
  readonly id = signal("initial-provider");
  readonly unusedOutputs = signal(0);
  readonly outsideErrors = signal(0);
  readonly increment = (value: number): number => value + 1;
  readonly identityKeys = signal(["first", "second"]);
  readonly identityDomId = signal("initial-domain");
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly applications: ApplicationRef[] = [];
  readonly applicationIsolation = signal("unverified");
  readonly unhostedIdentities: string;

  constructor() {
    const parent = inject(EnvironmentInjector);
    const left = createEnvironmentInjector([CompositionEnvironmentIdentity], parent, "left");
    const right = createEnvironmentInjector([CompositionEnvironmentIdentity], parent, "right");
    const leftIdentity = left.get(CompositionEnvironmentIdentity);
    const rightIdentity = right.get(CompositionEnvironmentIdentity);

    this.unhostedIdentities = JSON.stringify([
      inject(CompositionApplicationIdentity).identity,
      leftIdentity.identity,
      leftIdentity.second,
      rightIdentity.identity,
      rightIdentity.second,
    ]);
    inject(DestroyRef).onDestroy(() => {
      left.destroy();
      right.destroy();

      for (const application of this.applications) {
        application.destroy();
      }
    });
  }

  /** A host reused after its application is destroyed cannot import the old namespace. */
  async verifyApplicationNamespaces(): Promise<void> {
    const reusedHost = document.createElement("div");
    const freshHost = document.createElement("div");

    reusedHost.hidden = true;
    freshHost.hidden = true;
    document.body.append(reusedHost, freshHost);

    const first = await createApplication({
      providers: [{ provide: APP_ID, useValue: "identity-first" }],
    });
    const firstReference = createComponent(ApplicationHostIdentity, {
      environmentInjector: first.injector,
      hostElement: reusedHost,
    });

    first.attachView(firstReference.hostView);
    firstReference.destroy();
    first.destroy();

    const second = await createApplication({
      providers: [{ provide: APP_ID, useValue: "identity-second" }],
    });
    const bare = runInInjectionContext(second.injector, () => injectUniqueId("application-host"));
    const bareAgain = runInInjectionContext(second.injector, () =>
      injectUniqueId("application-host"),
    );
    const reused = createComponent(ApplicationHostIdentity, {
      environmentInjector: second.injector,
      hostElement: reusedHost,
    });
    const fresh = createComponent(ApplicationHostIdentity, {
      environmentInjector: second.injector,
      hostElement: freshHost,
    });

    try {
      second.attachView(reused.hostView);
      second.attachView(fresh.hostView);

      const identities = [bare, bareAgain, reused.instance.identity, fresh.instance.identity];
      let valid = true;

      for (const identity of identities) {
        if (typeof identity !== "string" || identity === "") {
          valid = false;
        }
      }

      this.applicationIsolation.set(String(valid && new Set(identities).size === 4));
    } finally {
      reused.destroy();
      fresh.destroy();
      second.destroy();
      reusedHost.remove();
      freshHost.remove();
    }
  }

  async mountIndependentApplications(): Promise<void> {
    for (const label of ["a", "b"]) {
      const host = this.element.querySelector(`[data-testid="independent-host-${label}"]`);

      if (!(host instanceof HTMLElement)) {
        throw new Error("Independent application host is missing");
      }

      const root = document.createElement("acceptance-independent-identities");

      host.append(root);

      const application = await createApplication();

      this.applications.push(application);
      application.bootstrap(IndependentIdentities, root);
    }
  }

  checkOutsideContext(): void {
    let errors = 0;

    try {
      injectUniqueId("outside");
    } catch {
      errors += 1;
    }

    try {
      injectDeferred(new InjectionToken<string>("outside"));
    } catch {
      errors += 1;
    }

    this.outsideErrors.set(errors);
  }
}
