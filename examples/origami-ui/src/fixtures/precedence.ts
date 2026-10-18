import { Component, Directive, InjectionToken, Service, inject, signal } from "@angular/core";
import {
  OrigamiCollection,
  OrigamiCollectionItem,
  OrigamiCollectionItemOptions,
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
  OrigamiAccordionItemOptions,
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

// O1-O3 precedence: whole replacement Options win over the composed primitives' own inputs, bound
// through the consumers' exposed host-directive inputs. Each case shares one template; only the
// replacement provider differs.

// ---- Collapsible and Presence ----

@Service({ autoProvided: false })
export class PrecedenceSettings {
  readonly expanded = signal(true);
  readonly disabled = signal(false);
  readonly hiding = signal<OrigamiCollapsibleHiding>("until-found");
  readonly present = signal(true);
  readonly triggerId = signal("");
  readonly triggerDisabled = signal(false);
  readonly triggerFocusable = signal(false);
  readonly panelId = signal("");
}

@Directive({
  selector: "[precedenceFactoryRoot]",
  exportAs: "precedenceFactoryRoot",
  hostDirectives: [
    {
      directive: OrigamiCollapsible,
      inputs: ["expanded", "disabled", "hiding"],
      outputs: ["expandedChange"],
    },
  ],
  providers: [OrigamiCollapsibleOptions.provideFactory(() => inject(PrecedenceSettings))],
})
export class PrecedenceFactoryRoot {
  readonly state = inject(OrigamiCollapsibleState);
}

@Directive({
  selector: "button[precedenceFactoryTrigger]",
  hostDirectives: [
    { directive: OrigamiCollapsibleTrigger, inputs: ["id", "disabled", "focusableWhenDisabled"] },
  ],
  providers: [
    OrigamiCollapsibleTriggerOptions.provideFactory(() => {
      const settings = inject(PrecedenceSettings);

      return {
        id: settings.triggerId,
        disabled: settings.triggerDisabled,
        focusableWhenDisabled: settings.triggerFocusable,
      };
    }),
  ],
})
export class PrecedenceFactoryTrigger {}

@Directive({
  selector: "[precedenceFactoryPanel]",
  hostDirectives: [{ directive: OrigamiCollapsiblePanel, inputs: ["id"] }],
  providers: [
    OrigamiCollapsiblePanelOptions.provideFactory(() => ({
      id: inject(PrecedenceSettings).panelId,
    })),
  ],
})
export class PrecedenceFactoryPanel {}

@Directive({
  selector: "[precedenceFactoryPresence]",
  exportAs: "precedenceFactoryPresence",
  hostDirectives: [{ directive: OrigamiPresence, inputs: ["present"], outputs: ["presentChange"] }],
  providers: [OrigamiPresenceOptions.provideFactory(() => inject(PrecedenceSettings))],
})
export class PrecedenceFactoryPresence {
  readonly state = inject(OrigamiPresenceState);
}

@Directive({
  selector: "[precedenceExistingRoot]",
  exportAs: "precedenceExistingRoot",
  hostDirectives: [
    {
      directive: OrigamiCollapsible,
      inputs: ["expanded", "disabled", "hiding"],
      outputs: ["expandedChange"],
    },
  ],
  providers: [OrigamiCollapsibleOptions.provideExisting(() => PrecedenceExistingRoot)],
})
export class PrecedenceExistingRoot implements OrigamiCollapsibleOptions {
  readonly #settings = inject(PrecedenceSettings);
  readonly expanded = this.#settings.expanded;
  readonly disabled = this.#settings.disabled;
  readonly hiding = this.#settings.hiding;
  readonly state = inject(OrigamiCollapsibleState);
}

@Directive({
  selector: "button[precedenceExistingTrigger]",
  hostDirectives: [
    { directive: OrigamiCollapsibleTrigger, inputs: ["id", "disabled", "focusableWhenDisabled"] },
  ],
  providers: [OrigamiCollapsibleTriggerOptions.provideExisting(() => PrecedenceExistingTrigger)],
})
export class PrecedenceExistingTrigger implements OrigamiCollapsibleTriggerOptions {
  readonly #settings = inject(PrecedenceSettings);
  readonly id = this.#settings.triggerId;
  readonly disabled = this.#settings.triggerDisabled;
  readonly focusableWhenDisabled = this.#settings.triggerFocusable;
}

@Directive({
  selector: "[precedenceExistingPanel]",
  hostDirectives: [{ directive: OrigamiCollapsiblePanel, inputs: ["id"] }],
  providers: [OrigamiCollapsiblePanelOptions.provideExisting(() => PrecedenceExistingPanel)],
})
export class PrecedenceExistingPanel implements OrigamiCollapsiblePanelOptions {
  readonly id = inject(PrecedenceSettings).panelId;
}

@Directive({
  selector: "[precedenceExistingPresence]",
  exportAs: "precedenceExistingPresence",
  hostDirectives: [{ directive: OrigamiPresence, inputs: ["present"], outputs: ["presentChange"] }],
  providers: [OrigamiPresenceOptions.provideExisting(() => PrecedenceExistingPresence)],
})
export class PrecedenceExistingPresence implements OrigamiPresenceOptions {
  readonly present = inject(PrecedenceSettings).present;
  readonly state = inject(OrigamiPresenceState);
}

@Directive({
  selector: "[phaseProbe]",
  exportAs: "phaseProbe",
  host: { "[attr.data-phase]": "state.phase()" },
})
export class PhaseProbe {
  readonly state = inject(OrigamiPresenceState);
}

@Directive({ selector: "[rootProbe]", exportAs: "rootProbe" })
export class RootProbe {
  readonly state = inject(OrigamiCollapsibleState);
}

const factory = [
  PrecedenceFactoryRoot,
  PrecedenceFactoryTrigger,
  PrecedenceFactoryPanel,
  PrecedenceFactoryPresence,
];
const existing = [
  PrecedenceExistingRoot,
  PrecedenceExistingTrigger,
  PrecedenceExistingPanel,
  PrecedenceExistingPresence,
];
// The composed primitives' own inputs deliberately contradict the replacements. One return
// statement keeps the template statically evaluable by the Angular compiler.
function collapsibleTemplate(prefix: "precedenceFactory" | "precedenceExisting"): string {
  return `
  <section ${prefix}Root #consumer="${prefix}Root" rootProbe #probe="rootProbe"
    [expanded]="false" [disabled]="true" hiding="hidden" data-role="root"
    (expandedChange)="outputs.update(increment)">
    <button ${prefix}Trigger id="unused-trigger" [disabled]="true" [focusableWhenDisabled]="true"
      data-role="trigger">Toggle</button>
    <div ${prefix}Panel id="unused-panel" phaseProbe data-role="panel">Retained Panel</div>
    <output data-role="shared">{{ consumer.state === probe.state }}</output>
    <output data-role="expanded">{{ consumer.state.expanded() }}</output>
    <output data-role="disabled">{{ consumer.state.disabled() }}</output>
    <section ogCollapsible #nested="ogCollapsible" data-role="nested">
      <button ogCollapsibleTrigger [id]="name + '-nested-trigger'" data-role="nested-trigger">Nested</button>
      <div ogCollapsiblePanel [id]="name + '-nested-panel'" phaseProbe data-role="nested-panel">Nested Panel</div>
      <output data-role="nested-expanded">{{ nested.state.expanded() }}</output>
      <output data-role="independent">{{ consumer.state !== nested.state }}</output>
    </section>
  </section>
  <div ${prefix}Presence #consumerPresence="${prefix}Presence" phaseProbe #probePresence="phaseProbe"
    [present]="false" data-role="presence" (presentChange)="outputs.update(increment)">
    <output data-role="presence-shared">{{ consumerPresence.state === probePresence.state }}</output>
  </div>
  <button type="button" data-role="presence-toggle" (click)="settings.present.set(!settings.present())">Presence intent</button>
  <button type="button" data-role="disable" (click)="settings.disabled.set(!settings.disabled())">Disable</button>
  <button type="button" data-role="trigger-disable" (click)="settings.triggerDisabled.set(!settings.triggerDisabled())">Disable Trigger</button>
  <button type="button" data-role="trigger-focusable" (click)="settings.triggerFocusable.set(!settings.triggerFocusable())">Focusable when disabled</button>
  <button type="button" data-role="external" (click)="settings.expanded.set(!settings.expanded())">External intent</button>
  <button type="button" data-role="ids" (click)="settings.triggerId.set(name + '-changed-trigger'); settings.panelId.set(name + '-changed-panel')">IDs</button>
  <output data-role="outputs">{{ outputs() }}</output>
`;
}

abstract class PrecedenceCase {
  readonly settings = inject(PrecedenceSettings);
  readonly outputs = signal(0);
  readonly increment = (value: number): number => value + 1;

  constructor(readonly name: string) {
    this.settings.triggerId.set(`${name}-trigger`);
    this.settings.panelId.set(`${name}-panel`);
  }
}

@Component({
  selector: "precedence-collapsible-factory",
  imports: [
    ...factory,
    OrigamiCollapsible,
    OrigamiCollapsibleTrigger,
    OrigamiCollapsiblePanel,
    PhaseProbe,
    RootProbe,
  ],
  providers: [PrecedenceSettings],
  host: { "data-case": "collapsible-factory" },
  template: collapsibleTemplate("precedenceFactory"),
})
export class CollapsibleFactory extends PrecedenceCase {
  constructor() {
    super("collapsible-factory");
  }
}

@Component({
  selector: "precedence-collapsible-existing",
  imports: [
    ...existing,
    OrigamiCollapsible,
    OrigamiCollapsibleTrigger,
    OrigamiCollapsiblePanel,
    PhaseProbe,
    RootProbe,
  ],
  providers: [PrecedenceSettings],
  host: { "data-case": "collapsible-existing" },
  template: collapsibleTemplate("precedenceExisting"),
})
export class CollapsibleExisting extends PrecedenceCase {
  constructor() {
    super("collapsible-existing");
  }
}

/** Ancestor replacement providers must not leak into separate default primitives. */
@Component({
  selector: "precedence-default-isolation",
  imports: [
    OrigamiCollapsible,
    OrigamiCollapsibleTrigger,
    OrigamiCollapsiblePanel,
    OrigamiPresence,
    PhaseProbe,
  ],
  providers: [
    OrigamiCollapsibleOptions.provideFactory(() => ({
      expanded: signal(true),
      disabled: signal(true),
      hiding: signal<OrigamiCollapsibleHiding>("until-found"),
    })),
    OrigamiCollapsibleTriggerOptions.provideFactory(() => ({
      id: signal("ancestor-trigger"),
      disabled: signal(true),
      focusableWhenDisabled: signal(true),
    })),
    OrigamiCollapsiblePanelOptions.provideFactory(() => ({ id: signal("ancestor-panel") })),
    OrigamiPresenceOptions.provideFactory(() => ({ present: signal(true) })),
  ],
  template: `
    <section ogCollapsible #root="ogCollapsible" data-role="isolated-root">
      <button ogCollapsibleTrigger id="isolated-trigger" data-role="isolated-trigger">
        Default Trigger
      </button>
      <div ogCollapsiblePanel id="isolated-panel" phaseProbe data-role="isolated-panel">
        Default Panel
      </div>
      <output data-role="isolated-expanded">{{ root.state.expanded() }}</output>
      <output data-role="isolated-disabled">{{ root.state.disabled() }}</output>
    </section>
    <div ogPresence phaseProbe data-role="isolated-presence">Default Presence</div>
  `,
})
export class DefaultIsolation {}

// ---- Collection and Accordion ----

@Service({ autoProvided: false })
export class AccordionPrecedenceSettings {
  readonly single = signal<string | null>(null);
  readonly multiple = signal<readonly string[]>(Object.freeze(["external"]));
  readonly existingSingle = signal<string | null>("existing-seed");
  readonly factoryMultiple = signal<readonly string[]>(Object.freeze(["factory-external"]));
  readonly disabled = signal(false);
  readonly sharedDisabled = signal(true);
  readonly collapsible = signal(true);
  readonly factoryTriggerId = signal("accordion-factory-trigger");
  readonly existingTriggerId = signal("accordion-existing-trigger");
  readonly mixedTriggerId = signal("accordion-mixed-trigger");
  readonly factoryPanelId = signal("accordion-factory-panel");
  readonly existingPanelId = signal("accordion-existing-panel");
  readonly factoryValue = signal("factory-value");
  readonly existingValue = signal("existing-value");
  readonly unusedOutputs = signal(0);
}

@Directive({
  selector: "[coFactorySingle]",
  exportAs: "coFactorySingle",
  hostDirectives: [
    { directive: OrigamiAccordionSingle, outputs: ["valueChange: unusedSingleChange"] },
  ],
  providers: [
    OrigamiAccordionSingleOptions.provideFactory(() => {
      const settings = inject(AccordionPrecedenceSettings);

      return {
        value: settings.single,
        disabled: settings.disabled,
        collapsible: settings.collapsible,
      };
    }),
    OrigamiAccordionOptions.provideFactory(() => ({
      disabled: inject(AccordionPrecedenceSettings).sharedDisabled,
    })),
  ],
})
export class CoFactorySingle {
  readonly state = inject(OrigamiAccordionState);
}

@Directive({
  selector: "[coExistingSingle]",
  hostDirectives: [
    { directive: OrigamiAccordionSingle, outputs: ["valueChange: unusedExistingSingleChange"] },
  ],
  providers: [OrigamiAccordionSingleOptions.provideExisting(() => CoExistingSingle)],
})
export class CoExistingSingle implements OrigamiAccordionSingleOptions {
  readonly value = inject(AccordionPrecedenceSettings).existingSingle;
  readonly disabled = inject(AccordionPrecedenceSettings).disabled;
  readonly collapsible = inject(AccordionPrecedenceSettings).collapsible;
}

@Directive({
  selector: "[coFactoryMultiple]",
  hostDirectives: [
    { directive: OrigamiAccordionMultiple, outputs: ["valueChange: unusedFactoryMultipleChange"] },
  ],
  providers: [
    OrigamiAccordionMultipleOptions.provideFactory(() => {
      const settings = inject(AccordionPrecedenceSettings);

      return { value: settings.factoryMultiple, disabled: settings.disabled };
    }),
  ],
})
export class CoFactoryMultiple {}

@Service({ autoProvided: false })
export class CoSharedExisting implements OrigamiAccordionOptions {
  readonly disabled = inject(AccordionPrecedenceSettings).disabled;
}

@Directive({
  selector: "[coExistingMultiple]",
  hostDirectives: [
    { directive: OrigamiAccordionMultiple, outputs: ["valueChange: unusedMultipleChange"] },
  ],
  providers: [
    OrigamiAccordionMultipleOptions.provideExisting(() => CoExistingMultiple),
    CoSharedExisting,
    OrigamiAccordionOptions.provideExisting(() => CoSharedExisting),
  ],
})
export class CoExistingMultiple implements OrigamiAccordionMultipleOptions {
  readonly value = inject(AccordionPrecedenceSettings).multiple;
  // The shared replacement must win over the default shared-to-mode adaptation.
  readonly disabled = signal(true);
}

@Directive({
  selector: "button[coFactoryTrigger]",
  hostDirectives: [OrigamiAccordionTrigger],
  providers: [
    OrigamiAccordionTriggerOptions.provideFactory(() => ({
      id: inject(AccordionPrecedenceSettings).factoryTriggerId,
    })),
  ],
})
export class CoFactoryTrigger {}

/** A replaced Trigger whose sibling Panel keeps its default Options. */
@Directive({
  selector: "button[coMixedTrigger]",
  hostDirectives: [OrigamiAccordionTrigger],
  providers: [
    OrigamiAccordionTriggerOptions.provideFactory(() => ({
      id: inject(AccordionPrecedenceSettings).mixedTriggerId,
    })),
  ],
})
export class CoMixedTrigger {}

@Directive({
  selector: "button[coExistingTrigger]",
  hostDirectives: [OrigamiAccordionTrigger],
  providers: [OrigamiAccordionTriggerOptions.provideExisting(() => CoExistingTrigger)],
})
export class CoExistingTrigger implements OrigamiAccordionTriggerOptions {
  readonly id = inject(AccordionPrecedenceSettings).existingTriggerId;
}

@Directive({
  selector: "[coFactoryPanel]",
  hostDirectives: [OrigamiAccordionPanel],
  providers: [
    OrigamiAccordionPanelOptions.provideFactory(() => ({
      id: inject(AccordionPrecedenceSettings).factoryPanelId,
    })),
  ],
})
export class CoFactoryPanel {}

@Directive({
  selector: "[coExistingPanel]",
  hostDirectives: [OrigamiAccordionPanel],
  providers: [OrigamiAccordionPanelOptions.provideExisting(() => CoExistingPanel)],
})
export class CoExistingPanel implements OrigamiAccordionPanelOptions {
  readonly id = inject(AccordionPrecedenceSettings).existingPanelId;
}

@Directive({
  selector: "[coFactoryItem]",
  hostDirectives: [OrigamiCollectionItem],
  providers: [
    OrigamiCollectionItemOptions.provideFactory(() => ({
      value: inject(AccordionPrecedenceSettings).factoryValue,
    })),
  ],
})
export class CoFactoryItem {}

@Directive({
  selector: "[coExistingItem]",
  hostDirectives: [OrigamiCollectionItem],
  providers: [OrigamiCollectionItemOptions.provideExisting(() => CoExistingItem)],
})
export class CoExistingItem implements OrigamiCollectionItemOptions {
  readonly value = inject(AccordionPrecedenceSettings).existingValue;
}

@Directive({
  selector: "[coParentReplacement]",
  providers: [
    OrigamiCollectionItemOptions.provideFactory(() => ({ value: signal("must-not-leak") })),
  ],
})
export class CoParentReplacement {}

const accordionImports = [
  OrigamiCollection,
  OrigamiCollectionItem,
  OrigamiAccordionItem,
  OrigamiAccordionTrigger,
  OrigamiAccordionPanel,
  CoFactorySingle,
  CoExistingSingle,
  CoFactoryMultiple,
  CoExistingMultiple,
  CoFactoryTrigger,
  CoMixedTrigger,
  CoExistingTrigger,
  CoFactoryPanel,
  CoExistingPanel,
  CoFactoryItem,
  CoExistingItem,
  CoParentReplacement,
];

const accordionTemplate = `
  <div ogCollection #collection="ogCollection">
    <span coFactoryItem>Factory item</span>
    <span coExistingItem>Existing item</span>
    <div coParentReplacement><span ogCollectionItem value="child-default">Child default</span></div>
    <output data-co="collection">{{ collection.state.items()[0]?.value() }},{{ collection.state.items()[1]?.value() }},{{ collection.state.items()[2]?.value() }}</output>
  </div>
  <section coFactorySingle #single="coFactorySingle"
    (unusedSingleChange)="settings.unusedOutputs.update(increment)">
    <article ogAccordionItem value="first">
      <button coFactoryTrigger data-co="factory-trigger">Factory</button>
      <div coFactoryPanel data-co="factory-panel">Factory panel</div>
    </article>
    <article ogAccordionItem value="second">
      <button coExistingTrigger data-co="existing-trigger">Existing</button>
      <div coExistingPanel data-co="existing-panel">Existing panel</div>
    </article>
    <article ogAccordionItem value="mixed">
      <button coMixedTrigger data-co="mixed-trigger">Replaced Trigger</button>
      <div ogAccordionPanel data-co="mixed-panel">Default Panel</div>
    </article>
    <output data-co="single">{{ settings.single() }}</output>
    <output data-co="shared-disabled">{{ single.state.disabled() }}</output>
  </section>
  <button type="button" data-co="enable" (click)="settings.sharedDisabled.set(false)">Enable shared factory</button>
  <section coExistingMultiple
    (unusedMultipleChange)="settings.unusedOutputs.update(increment)">
    <article ogAccordionItem value="first">
      <button ogAccordionTrigger data-co="multiple-trigger">Multiple existing</button>
      <div ogAccordionPanel>Multiple panel</div>
    </article>
    <output data-co="multiple">{{ settings.multiple().join(',') }}</output>
  </section>
  <section coExistingSingle (unusedExistingSingleChange)="settings.unusedOutputs.update(increment)">
    <article ogAccordionItem value="first">
      <button ogAccordionTrigger data-co="existing-single-trigger">Existing Single</button>
      <div ogAccordionPanel>Existing Single panel</div>
    </article>
    <output data-co="existing-single">{{ settings.existingSingle() }}</output>
  </section>
  <section coFactoryMultiple (unusedFactoryMultipleChange)="settings.unusedOutputs.update(increment)">
    <article ogAccordionItem value="first">
      <button ogAccordionTrigger data-co="factory-multiple-trigger">Factory Multiple</button>
      <div ogAccordionPanel>Factory Multiple panel</div>
    </article>
    <output data-co="factory-multiple">{{ settings.factoryMultiple().join(',') }}</output>
  </section>
  <output data-co="unused">{{ settings.unusedOutputs() }}</output>
`;

@Component({
  selector: "precedence-accordion",
  imports: accordionImports,
  providers: [AccordionPrecedenceSettings],
  host: { "data-case": "accordion" },
  template: accordionTemplate,
})
export class AccordionPrecedence {
  readonly settings = inject(AccordionPrecedenceSettings);
  readonly increment = (count: number): number => count + 1;
}

// ---- Accordion Item ----

/** Ordinary non-input replacement signals for one Accordion Item case. */
@Service({ autoProvided: false })
export class ItemPrecedenceSettings {
  readonly value = signal("replaced-billing");
  readonly disabled = signal(false);
  readonly hiding = signal<OrigamiCollapsibleHiding>("until-found");
  readonly selection = signal<string | null>(null);
  readonly outputs = signal(0);
  readonly increment = (value: number): number => value + 1;
}

@Directive({
  selector: "[itemPrecedenceFactory]",
  exportAs: "itemPrecedence",
  hostDirectives: [{ directive: OrigamiAccordionItem, inputs: ["value", "disabled", "hiding"] }],
  providers: [
    OrigamiAccordionItemOptions.provideFactory(() => {
      const settings = inject(ItemPrecedenceSettings);

      return { value: settings.value, disabled: settings.disabled, hiding: settings.hiding };
    }),
  ],
})
export class ItemPrecedenceFactory {
  readonly state = inject(OrigamiCollapsibleState);
}

@Directive({
  selector: "[itemPrecedenceExisting]",
  exportAs: "itemPrecedence",
  hostDirectives: [{ directive: OrigamiAccordionItem, inputs: ["value", "disabled", "hiding"] }],
  providers: [OrigamiAccordionItemOptions.provideExisting(() => ItemPrecedenceExisting)],
})
export class ItemPrecedenceExisting implements OrigamiAccordionItemOptions {
  readonly #settings = inject(ItemPrecedenceSettings);
  readonly value = this.#settings.value;
  readonly disabled = this.#settings.disabled;
  readonly hiding = this.#settings.hiding;
  readonly state = inject(OrigamiCollapsibleState);
}

@Directive({ selector: "[itemValuesProbe]", exportAs: "itemValuesProbe" })
export class ItemValuesProbe {
  readonly state = inject(OrigamiAccordionState);
}

// The composed item's own inputs deliberately contradict the replacement. One return statement
// keeps the template statically evaluable by the Angular compiler.
function itemTemplate(prefix: "itemPrecedenceFactory" | "itemPrecedenceExisting"): string {
  return `
  <section ogAccordionSingle itemValuesProbe #root="itemValuesProbe" [value]="settings.selection()"
    [collapsible]="true" (valueChange)="settings.selection.set($event); settings.outputs.update(settings.increment)">
    <article ${prefix} #item="itemPrecedence" value="unused-billing" [disabled]="true" hiding="hidden">
      <button ogAccordionTrigger data-role="trigger">Billing</button>
      <div ogAccordionPanel data-role="panel">Invoices are sent monthly.</div>
      <output data-role="expanded">{{ item.state.expanded() }}</output>
      <output data-role="disabled">{{ item.state.disabled() }}</output>
    </article>
    <output data-role="values">{{ root.state.itemValues().join(',') }}</output>
  </section>
  <output data-role="selection">{{ settings.selection() }}</output>
  <output data-role="outputs">{{ settings.outputs() }}</output>
  <button type="button" data-role="rename" (click)="settings.value.set('renamed-billing')">Rename</button>
  <button type="button" data-role="disable" (click)="settings.disabled.set(!settings.disabled())">Disable</button>
  <button type="button" data-role="hiding" (click)="settings.hiding.set('hidden')">Ordinary hiding</button>
`;
}

// The two cases import the consumer directive before and after the primitives it composes.
@Component({
  selector: "precedence-item-factory",
  imports: [
    ItemPrecedenceFactory,
    OrigamiAccordionSingle,
    OrigamiAccordionTrigger,
    OrigamiAccordionPanel,
    ItemValuesProbe,
  ],
  providers: [ItemPrecedenceSettings],
  host: { "data-case": "item-factory" },
  template: itemTemplate("itemPrecedenceFactory"),
})
export class ItemFactory {
  readonly settings = inject(ItemPrecedenceSettings);
}

@Component({
  selector: "precedence-item-existing",
  imports: [
    OrigamiAccordionSingle,
    OrigamiAccordionTrigger,
    OrigamiAccordionPanel,
    ItemValuesProbe,
    ItemPrecedenceExisting,
  ],
  providers: [ItemPrecedenceSettings],
  host: { "data-case": "item-existing" },
  template: itemTemplate("itemPrecedenceExisting"),
})
export class ItemExisting {
  readonly settings = inject(ItemPrecedenceSettings);
}

// ---- Popover ----

const PopoverCaseLabel = new InjectionToken<string>("popover precedence case label");

/** Ordinary non-model replacement signals shared only by one public consumer root. */
@Service({ autoProvided: false })
export class PopoverPrecedenceSettings {
  readonly label = inject(PopoverCaseLabel);
  readonly open = signal(false);
  readonly disabled = signal(true);
  readonly dismissible = signal(false);
  // Element IDs that match between server and client: derived from the case, not allocated.
  readonly triggerId = signal(`${this.label}-co-trigger`);
  readonly triggerDisabled = signal(false);
  readonly anchorId = signal(`${this.label}-co-anchor`);
  readonly contentId = signal(`${this.label}-co-content`);
  readonly side = signal<OrigamiPopoverSide>("inline-end");
  readonly align = signal<OrigamiPopoverAlign>("center");
  readonly gap = signal(11);
  readonly unusedOutputs = signal(0);
  readonly increment = (value: number): number => value + 1;

  changeIds(): void {
    this.triggerId.set(`${this.triggerId()}-changed`);
    this.anchorId.set(`${this.anchorId()}-changed`);
    this.contentId.set(`${this.contentId()}-changed`);
  }
}

@Directive({
  selector: "[coFactoryPopover]",
  exportAs: "coPopover",
  hostDirectives: [
    {
      directive: OrigamiPopover,
      inputs: ["open", "disabled", "dismissible"],
      outputs: ["openChange"],
    },
  ],
  providers: [
    PopoverPrecedenceSettings,
    OrigamiPopoverOptions.provideFactory(() => inject(PopoverPrecedenceSettings)),
  ],
})
export class CoFactoryPopover {
  readonly settings = inject(PopoverPrecedenceSettings);
  readonly state = inject(OrigamiPopoverState);
}

@Directive({
  selector: "button[coFactoryPopoverTrigger]",
  hostDirectives: [{ directive: OrigamiPopoverTrigger, inputs: ["id", "disabled"] }],
  providers: [
    OrigamiPopoverTriggerOptions.provideFactory(() => {
      const settings = inject(PopoverPrecedenceSettings);

      return { id: settings.triggerId, disabled: settings.triggerDisabled };
    }),
  ],
})
export class CoFactoryPopoverTrigger {}

@Directive({
  selector: "[coFactoryPopoverAnchor]",
  hostDirectives: [{ directive: OrigamiPopoverAnchor, inputs: ["id"] }],
  providers: [
    OrigamiPopoverAnchorOptions.provideFactory(() => ({
      id: inject(PopoverPrecedenceSettings).anchorId,
    })),
  ],
})
export class CoFactoryPopoverAnchor {}

@Directive({
  selector: "[coFactoryPopoverContent]",
  exportAs: "coPopoverContent",
  hostDirectives: [{ directive: OrigamiPopoverContent, inputs: ["id", "side", "align", "gap"] }],
  providers: [
    OrigamiPopoverContentOptions.provideFactory(() => {
      const settings = inject(PopoverPrecedenceSettings);

      return {
        id: settings.contentId,
        side: settings.side,
        align: settings.align,
        gap: settings.gap,
      };
    }),
  ],
})
export class CoFactoryPopoverContent {
  readonly state = inject(OrigamiPopoverContentState);
}

@Directive({
  selector: "[coExistingPopover]",
  exportAs: "coPopover",
  hostDirectives: [
    {
      directive: OrigamiPopover,
      inputs: ["open", "disabled", "dismissible"],
      outputs: ["openChange"],
    },
  ],
  providers: [
    PopoverPrecedenceSettings,
    OrigamiPopoverOptions.provideExisting(() => CoExistingPopover),
  ],
})
export class CoExistingPopover implements OrigamiPopoverOptions {
  readonly settings = inject(PopoverPrecedenceSettings);
  readonly open = this.settings.open;
  readonly disabled = this.settings.disabled;
  readonly dismissible = this.settings.dismissible;
  readonly state = inject(OrigamiPopoverState);
}

@Directive({
  selector: "button[coExistingPopoverTrigger]",
  hostDirectives: [{ directive: OrigamiPopoverTrigger, inputs: ["id", "disabled"] }],
  providers: [OrigamiPopoverTriggerOptions.provideExisting(() => CoExistingPopoverTrigger)],
})
export class CoExistingPopoverTrigger implements OrigamiPopoverTriggerOptions {
  readonly #settings = inject(PopoverPrecedenceSettings);
  readonly id = this.#settings.triggerId;
  readonly disabled = this.#settings.triggerDisabled;
}

@Directive({
  selector: "[coExistingPopoverAnchor]",
  hostDirectives: [{ directive: OrigamiPopoverAnchor, inputs: ["id"] }],
  providers: [OrigamiPopoverAnchorOptions.provideExisting(() => CoExistingPopoverAnchor)],
})
export class CoExistingPopoverAnchor implements OrigamiPopoverAnchorOptions {
  readonly id = inject(PopoverPrecedenceSettings).anchorId;
}

@Directive({
  selector: "[coExistingPopoverContent]",
  exportAs: "coPopoverContent",
  hostDirectives: [{ directive: OrigamiPopoverContent, inputs: ["id", "side", "align", "gap"] }],
  providers: [OrigamiPopoverContentOptions.provideExisting(() => CoExistingPopoverContent)],
})
export class CoExistingPopoverContent implements OrigamiPopoverContentOptions {
  readonly settings = inject(PopoverPrecedenceSettings);
  readonly id = this.settings.contentId;
  readonly side = this.settings.side;
  readonly align = this.settings.align;
  readonly gap = this.settings.gap;
  readonly state = inject(OrigamiPopoverContentState);
}

// Every role exposes the composed primitive's own inputs. Those contradicting inputs must remain
// unused while a replacement is present.
function popoverTemplate(prefix: "coFactoryPopover" | "coExistingPopover"): string {
  return `
  <div ${prefix} #root="coPopover" [open]="true" [disabled]="false" [dismissible]="true"
    (openChange)="root.settings.unusedOutputs.update(root.settings.increment)">
    <output data-co="open">{{ root.state.open() }}</output>
    <output data-co="disabled">{{ root.state.disabled() }}</output>
    <output data-co="dismissible">{{ root.state.dismissible() }}</output>
    <output data-co="unused-outputs">{{ root.settings.unusedOutputs() }}</output>
    <output data-co="trigger-id">{{ root.settings.triggerId() }}</output>
    <output data-co="anchor-id">{{ root.settings.anchorId() }}</output>
    <output data-co="content-id">{{ root.settings.contentId() }}</output>
    <button type="button" data-co="enable" (click)="root.settings.disabled.set(false)">Enable</button>
    <button type="button" data-co="write-open" (click)="root.settings.open.set(true)">Write Options</button>
    <button type="button" data-co="trigger-disable" (click)="root.settings.triggerDisabled.set(!root.settings.triggerDisabled())">Disable Trigger</button>
    <button ${prefix}Trigger id="unused-direct-trigger" [disabled]="true" data-co="trigger">Toggle</button>
    <span ${prefix}Anchor id="unused-direct-anchor" class="anchor" data-co="anchor"
      [attr.data-testid]="root.settings.label + '-anchor'">Anchor</span>
    <section ${prefix}Content #content="coPopoverContent" id="unused-direct-content"
      side="block-start" align="end" [gap]="99" class="surface" role="group" [attr.aria-label]="root.settings.label"
      data-co="content" [attr.data-testid]="root.settings.label + '-content'">
      @if (content.state.open()) {
        <button type="button" data-co="placement" (click)="root.settings.side.set('block-end'); root.settings.align.set('start'); root.settings.gap.set(7)">Placement</button>
        <button type="button" data-co="ids" (click)="root.settings.changeIds()">IDs</button>
      }
    </section>
  </div>
`;
}

const popoverStyles = `
  :host { display: block; padding-block: 24px; }
  output { display: block; }
  .anchor { display: inline-block; width: 90px; height: 30px; margin-inline-start: 20px; }
  .surface { width: 220px; height: 70px; box-sizing: border-box; padding: 8px; background: #242424; color: #eee; border: 1px solid #888; }
  .surface:popover-open { display: flex; gap: 8px; }
`;
const popoverFactory = [
  CoFactoryPopover,
  CoFactoryPopoverTrigger,
  CoFactoryPopoverAnchor,
  CoFactoryPopoverContent,
];
const popoverExisting = [
  CoExistingPopover,
  CoExistingPopoverTrigger,
  CoExistingPopoverAnchor,
  CoExistingPopoverContent,
];

@Component({
  selector: "precedence-popover-factory",
  imports: popoverFactory,
  providers: [{ provide: PopoverCaseLabel, useValue: "popover-factory" }],
  host: { "data-case": "popover-factory" },
  template: popoverTemplate("coFactoryPopover"),
  styles: popoverStyles,
})
export class PopoverFactory {}

@Component({
  selector: "precedence-popover-existing",
  imports: popoverExisting,
  providers: [{ provide: PopoverCaseLabel, useValue: "popover-existing" }],
  host: { "data-case": "popover-existing" },
  template: popoverTemplate("coExistingPopover"),
  styles: popoverStyles,
})
export class PopoverExisting {}

@Component({
  selector: "acceptance-precedence",
  imports: [
    CollapsibleFactory,
    CollapsibleExisting,
    DefaultIsolation,
    AccordionPrecedence,
    ItemFactory,
    ItemExisting,
    PopoverFactory,
    PopoverExisting,
  ],
  template: `
    <h2>Replacement precedence over composed primitives' own inputs</h2>
    <precedence-collapsible-factory /><precedence-collapsible-existing />
    <precedence-default-isolation />
    <precedence-accordion />
    <precedence-item-factory /><precedence-item-existing />
    <precedence-popover-factory /><precedence-popover-existing />
    <div class="scroll-space" aria-hidden="true"></div>
  `,
  styles: `
    :host {
      display: block;
    }
    /* Lets the last Anchor scroll to the viewport center for preferred-fit geometry. */
    .scroll-space {
      block-size: 600px;
    }
    output {
      display: block;
    }
  `,
})
export class Precedence {}
