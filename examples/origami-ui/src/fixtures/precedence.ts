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
import { injectUniqueId } from "@loozo/origami-ui/utils";

// O1-O3 precedence: whole replacement Options win over conflicting direct inputs in both
// directive import orders and through transitive host-directive diamonds. Each case shares one
// template; only the import (registry) order or composition differs.

// ---- Collapsible and Presence ----

@Service({ autoProvided: false })
export class PrecedenceSettings {
  readonly expanded = signal(true);
  readonly disabled = signal(false);
  readonly hiding = signal<OrigamiCollapsibleHiding>("until-found");
  readonly present = signal(true);
  readonly triggerId = signal("");
  readonly panelId = signal("");
}

@Directive({
  selector: "[precedenceFactoryRoot]",
  exportAs: "precedenceFactoryRoot",
  hostDirectives: [{ directive: OrigamiCollapsible, outputs: ["expandedChange: unusedChange"] }],
  providers: [OrigamiCollapsibleOptions.provideFactory(() => inject(PrecedenceSettings))],
})
export class PrecedenceFactoryRoot {
  readonly state = inject(OrigamiCollapsibleState);
}

@Directive({
  selector: "button[precedenceFactoryTrigger]",
  hostDirectives: [OrigamiCollapsibleTrigger],
  providers: [
    OrigamiCollapsibleTriggerOptions.provideFactory(() => ({
      id: inject(PrecedenceSettings).triggerId,
    })),
  ],
})
export class PrecedenceFactoryTrigger {}

@Directive({
  selector: "[precedenceFactoryPanel]",
  hostDirectives: [OrigamiCollapsiblePanel],
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
  hostDirectives: [{ directive: OrigamiPresence, outputs: ["presentChange: unusedChange"] }],
  providers: [OrigamiPresenceOptions.provideFactory(() => inject(PrecedenceSettings))],
})
export class PrecedenceFactoryPresence {
  readonly state = inject(OrigamiPresenceState);
}

@Directive({
  selector: "[precedenceExistingRoot]",
  exportAs: "precedenceExistingRoot",
  hostDirectives: [OrigamiCollapsible],
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
  hostDirectives: [OrigamiCollapsibleTrigger],
  providers: [OrigamiCollapsibleTriggerOptions.provideExisting(() => PrecedenceExistingTrigger)],
})
export class PrecedenceExistingTrigger implements OrigamiCollapsibleTriggerOptions {
  readonly id = inject(PrecedenceSettings).triggerId;
}

@Directive({
  selector: "[precedenceExistingPanel]",
  hostDirectives: [OrigamiCollapsiblePanel],
  providers: [OrigamiCollapsiblePanelOptions.provideExisting(() => PrecedenceExistingPanel)],
})
export class PrecedenceExistingPanel implements OrigamiCollapsiblePanelOptions {
  readonly id = inject(PrecedenceSettings).panelId;
}

@Directive({
  selector: "[precedenceExistingPresence]",
  exportAs: "precedenceExistingPresence",
  hostDirectives: [OrigamiPresence],
  providers: [OrigamiPresenceOptions.provideExisting(() => PrecedenceExistingPresence)],
})
export class PrecedenceExistingPresence implements OrigamiPresenceOptions {
  readonly present = inject(PrecedenceSettings).present;
  readonly state = inject(OrigamiPresenceState);
}

@Directive({ selector: "[diamondRootA]", hostDirectives: [OrigamiCollapsible] })
export class DiamondRootA {}
@Directive({ selector: "[diamondRootB]", hostDirectives: [OrigamiCollapsible] })
export class DiamondRootB {}
@Directive({ selector: "button[diamondTriggerA]", hostDirectives: [OrigamiCollapsibleTrigger] })
export class DiamondTriggerA {}
@Directive({ selector: "button[diamondTriggerB]", hostDirectives: [OrigamiCollapsibleTrigger] })
export class DiamondTriggerB {}
@Directive({ selector: "[diamondPanelA]", hostDirectives: [OrigamiCollapsiblePanel] })
export class DiamondPanelA {}
@Directive({ selector: "[diamondPanelB]", hostDirectives: [OrigamiCollapsiblePanel] })
export class DiamondPanelB {}
@Directive({ selector: "[diamondPresenceA]", hostDirectives: [OrigamiPresence] })
export class DiamondPresenceA {}
@Directive({ selector: "[diamondPresenceB]", hostDirectives: [OrigamiPresence] })
export class DiamondPresenceB {}

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

const lower = [
  OrigamiCollapsible,
  OrigamiCollapsibleTrigger,
  OrigamiCollapsiblePanel,
  OrigamiPresence,
];
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
const diamond = [
  DiamondRootA,
  DiamondRootB,
  DiamondTriggerA,
  DiamondTriggerB,
  DiamondPanelA,
  DiamondPanelB,
  DiamondPresenceA,
  DiamondPresenceB,
];

// Diamond attributes are inert in the non-diamond cases. Direct inputs deliberately contradict the
// replacements, including on the composed Panel -> Presence adapter. One return statement keeps the
// template statically evaluable by the Angular compiler.
function collapsibleTemplate(prefix: "precedenceFactory" | "precedenceExisting"): string {
  return `
  <section ${prefix}Root ogCollapsible diamondRootA diamondRootB #upper="${prefix}Root" rootProbe #lower="rootProbe"
    [expanded]="false" [disabled]="true" hiding="hidden" data-role="root"
    (expandedChange)="outputs.update(increment)">
    <button ${prefix}Trigger ogCollapsibleTrigger diamondTriggerA diamondTriggerB id="unused-trigger" data-role="trigger">Toggle</button>
    <div ${prefix}Panel ogCollapsiblePanel ogPresence diamondPanelA diamondPanelB [present]="false" phaseProbe data-role="panel"
      (presentChange)="outputs.update(increment)">Retained Panel</div>
    <output data-role="shared">{{ upper.state === lower.state }}</output>
    <output data-role="expanded">{{ upper.state.expanded() }}</output>
    <output data-role="disabled">{{ upper.state.disabled() }}</output>
    <section ogCollapsible #nested="ogCollapsible" data-role="nested">
      <button ogCollapsibleTrigger [id]="name + '-nested-trigger'" data-role="nested-trigger">Nested</button>
      <div ogCollapsiblePanel [id]="name + '-nested-panel'" phaseProbe data-role="nested-panel">Nested Panel</div>
      <output data-role="nested-expanded">{{ nested.state.expanded() }}</output>
      <output data-role="independent">{{ upper.state !== nested.state }}</output>
    </section>
  </section>
  <div ${prefix}Presence ogPresence diamondPresenceA diamondPresenceB #upperPresence="${prefix}Presence" #lowerPresence="phaseProbe"
    [present]="false" phaseProbe data-role="presence" (presentChange)="outputs.update(increment)">
    <output data-role="presence-shared">{{ upperPresence.state === lowerPresence.state }}</output>
  </div>
  <button type="button" data-role="presence-toggle" (click)="settings.present.set(!settings.present())">Presence intent</button>
  <button type="button" data-role="disable" (click)="settings.disabled.set(!settings.disabled())">Disable</button>
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
  selector: "precedence-factory-upper-first",
  imports: [...factory, ...lower, PhaseProbe, RootProbe],
  providers: [PrecedenceSettings],
  host: { "data-case": "factory-upper-first" },
  template: collapsibleTemplate("precedenceFactory"),
})
export class FactoryUpperFirst extends PrecedenceCase {
  constructor() {
    super("factory-upper-first");
  }
}

@Component({
  selector: "precedence-factory-lower-first",
  imports: [...lower, ...factory, PhaseProbe, RootProbe],
  providers: [PrecedenceSettings],
  host: { "data-case": "factory-lower-first" },
  template: collapsibleTemplate("precedenceFactory"),
})
export class FactoryLowerFirst extends PrecedenceCase {
  constructor() {
    super("factory-lower-first");
  }
}

@Component({
  selector: "precedence-existing-upper-first",
  imports: [...existing, ...lower, PhaseProbe, RootProbe],
  providers: [PrecedenceSettings],
  host: { "data-case": "existing-upper-first" },
  template: collapsibleTemplate("precedenceExisting"),
})
export class ExistingUpperFirst extends PrecedenceCase {
  constructor() {
    super("existing-upper-first");
  }
}

@Component({
  selector: "precedence-existing-lower-first",
  imports: [...lower, ...existing, PhaseProbe, RootProbe],
  providers: [PrecedenceSettings],
  host: { "data-case": "existing-lower-first" },
  template: collapsibleTemplate("precedenceExisting"),
})
export class ExistingLowerFirst extends PrecedenceCase {
  constructor() {
    super("existing-lower-first");
  }
}

@Component({
  selector: "precedence-factory-diamond",
  imports: [...diamond, ...factory, ...lower, PhaseProbe, RootProbe],
  providers: [PrecedenceSettings],
  host: { "data-case": "factory-diamond" },
  template: collapsibleTemplate("precedenceFactory"),
})
export class FactoryDiamond extends PrecedenceCase {
  constructor() {
    super("factory-diamond");
  }
}

@Component({
  selector: "precedence-existing-diamond",
  imports: [...diamond, ...existing, ...lower, PhaseProbe, RootProbe],
  providers: [PrecedenceSettings],
  host: { "data-case": "existing-diamond" },
  template: collapsibleTemplate("precedenceExisting"),
})
export class ExistingDiamond extends PrecedenceCase {
  constructor() {
    super("existing-diamond");
  }
}

/** Ancestor replacement providers must not leak into separate default primitives. */
@Component({
  selector: "precedence-default-isolation",
  imports: [...lower, PhaseProbe],
  providers: [
    OrigamiCollapsibleOptions.provideFactory(() => ({
      expanded: signal(true),
      disabled: signal(true),
      hiding: signal<OrigamiCollapsibleHiding>("until-found"),
    })),
    OrigamiCollapsibleTriggerOptions.provideFactory(() => ({ id: signal("ancestor-trigger") })),
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

const AccordionCaseLabel = new InjectionToken<string>("accordion co-match case label");

@Service({ autoProvided: false })
export class AccordionCoMatchSettings {
  readonly label = inject(AccordionCaseLabel);
  readonly single = signal<string | null>(null);
  readonly multiple = signal<readonly string[]>(Object.freeze(["external"]));
  readonly existingSingle = signal<string | null>("existing-seed");
  readonly factoryMultiple = signal<readonly string[]>(Object.freeze(["factory-external"]));
  readonly disabled = signal(false);
  readonly sharedDisabled = signal(true);
  readonly collapsible = signal(true);
  readonly factoryTriggerId = signal(`${this.label}-factory-trigger`);
  readonly existingTriggerId = signal(`${this.label}-existing-trigger`);
  readonly diamondTriggerId = signal(`${this.label}-diamond-trigger`);
  readonly factoryPanelId = signal(`${this.label}-factory-panel`);
  readonly existingPanelId = signal(`${this.label}-existing-panel`);
  readonly factoryValue = signal("factory-value");
  readonly existingValue = signal("existing-value");
  readonly unusedOutputs = signal(0);
}

@Directive({
  selector: "[coFactorySingle]",
  hostDirectives: [
    { directive: OrigamiAccordionSingle, outputs: ["valueChange: unusedSingleChange"] },
  ],
  providers: [
    OrigamiAccordionSingleOptions.provideFactory(() => {
      const settings = inject(AccordionCoMatchSettings);

      return {
        value: settings.single,
        disabled: settings.disabled,
        collapsible: settings.collapsible,
      };
    }),
    OrigamiAccordionOptions.provideFactory(() => ({
      disabled: inject(AccordionCoMatchSettings).sharedDisabled,
    })),
  ],
})
export class CoFactorySingle {}

@Directive({
  selector: "[coExistingSingle]",
  hostDirectives: [
    { directive: OrigamiAccordionSingle, outputs: ["valueChange: unusedExistingSingleChange"] },
  ],
  providers: [OrigamiAccordionSingleOptions.provideExisting(() => CoExistingSingle)],
})
export class CoExistingSingle implements OrigamiAccordionSingleOptions {
  readonly value = inject(AccordionCoMatchSettings).existingSingle;
  readonly disabled = inject(AccordionCoMatchSettings).disabled;
  readonly collapsible = inject(AccordionCoMatchSettings).collapsible;
}

@Directive({
  selector: "[coFactoryMultiple]",
  hostDirectives: [
    { directive: OrigamiAccordionMultiple, outputs: ["valueChange: unusedFactoryMultipleChange"] },
  ],
  providers: [
    OrigamiAccordionMultipleOptions.provideFactory(() => {
      const settings = inject(AccordionCoMatchSettings);

      return { value: settings.factoryMultiple, disabled: settings.disabled };
    }),
  ],
})
export class CoFactoryMultiple {}

@Service({ autoProvided: false })
export class CoSharedExisting implements OrigamiAccordionOptions {
  readonly disabled = inject(AccordionCoMatchSettings).disabled;
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
  readonly value = inject(AccordionCoMatchSettings).multiple;
  // The shared replacement must win over the default shared-to-mode adaptation.
  readonly disabled = signal(true);
}

@Directive({
  selector: "button[coFactoryTrigger]",
  hostDirectives: [OrigamiAccordionTrigger],
  providers: [
    OrigamiAccordionTriggerOptions.provideFactory(() => ({
      id: inject(AccordionCoMatchSettings).factoryTriggerId,
    })),
  ],
})
export class CoFactoryTrigger {}

@Directive({
  selector: "button[coExistingTrigger]",
  hostDirectives: [OrigamiAccordionTrigger],
  providers: [OrigamiAccordionTriggerOptions.provideExisting(() => CoExistingTrigger)],
})
export class CoExistingTrigger implements OrigamiAccordionTriggerOptions {
  readonly id = inject(AccordionCoMatchSettings).existingTriggerId;
}

@Directive({
  selector: "[coFactoryPanel]",
  hostDirectives: [OrigamiAccordionPanel],
  providers: [
    OrigamiAccordionPanelOptions.provideFactory(() => ({
      id: inject(AccordionCoMatchSettings).factoryPanelId,
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
  readonly id = inject(AccordionCoMatchSettings).existingPanelId;
}

@Directive({ selector: "button[coTriggerBranch]", hostDirectives: [OrigamiAccordionTrigger] })
export class CoTriggerBranch {}

@Directive({
  selector: "button[coDiamond]",
  hostDirectives: [CoTriggerBranch, OrigamiAccordionTrigger],
  providers: [
    OrigamiAccordionTriggerOptions.provideFactory(() => ({
      id: inject(AccordionCoMatchSettings).diamondTriggerId,
    })),
  ],
})
export class CoDiamond {}

@Directive({
  selector: "[coFactoryItem]",
  hostDirectives: [OrigamiCollectionItem],
  providers: [
    OrigamiCollectionItemOptions.provideFactory(() => ({
      value: inject(AccordionCoMatchSettings).factoryValue,
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
  readonly value = inject(AccordionCoMatchSettings).existingValue;
}

@Directive({
  selector: "[coParentReplacement]",
  providers: [
    OrigamiCollectionItemOptions.provideFactory(() => ({ value: signal("must-not-leak") })),
  ],
})
export class CoParentReplacement {}

const accordionPrimitives = [
  OrigamiCollection,
  OrigamiCollectionItem,
  OrigamiAccordionSingle,
  OrigamiAccordionMultiple,
  OrigamiAccordionItem,
  OrigamiAccordionTrigger,
  OrigamiAccordionPanel,
];
const accordionComposed = [
  CoFactorySingle,
  CoExistingSingle,
  CoFactoryMultiple,
  CoExistingMultiple,
  CoFactoryTrigger,
  CoExistingTrigger,
  CoFactoryPanel,
  CoExistingPanel,
  CoDiamond,
  CoFactoryItem,
  CoExistingItem,
  CoParentReplacement,
];

const accordionTemplate = `
  <div ogCollection #collection="ogCollection">
    <span ogCollectionItem coFactoryItem>Factory item</span>
    <span ogCollectionItem coExistingItem>Existing item</span>
    <div coParentReplacement><span ogCollectionItem value="child-default">Child default</span></div>
    <output data-co="collection">{{ collection.state.items()[0]?.value() }},{{ collection.state.items()[1]?.value() }},{{ collection.state.items()[2]?.value() }}</output>
  </div>
  <section ogAccordionSingle coFactorySingle #single="ogAccordionSingle"
    (unusedSingleChange)="settings.unusedOutputs.update(increment)">
    <article ogAccordionItem value="first">
      <button ogAccordionTrigger coFactoryTrigger data-co="factory-trigger">Factory</button>
      <div ogAccordionPanel coFactoryPanel data-co="factory-panel">Factory panel</div>
    </article>
    <article ogAccordionItem value="second">
      <button ogAccordionTrigger coExistingTrigger data-co="existing-trigger">Existing</button>
      <div ogAccordionPanel coExistingPanel data-co="existing-panel">Existing panel</div>
    </article>
    <article ogAccordionItem value="diamond">
      <button ogAccordionTrigger coDiamond data-co="diamond-trigger">Transitive diamond</button>
      <div ogAccordionPanel data-co="diamond-panel">Diamond panel</div>
    </article>
    <output data-co="single">{{ settings.single() }}</output>
    <output data-co="shared-disabled">{{ single.state.disabled() }}</output>
  </section>
  <button type="button" data-co="enable" (click)="settings.sharedDisabled.set(false)">Enable shared factory</button>
  <section ogAccordionMultiple coExistingMultiple
    (unusedMultipleChange)="settings.unusedOutputs.update(increment)">
    <article ogAccordionItem value="first">
      <button ogAccordionTrigger data-co="multiple-trigger">Multiple existing</button>
      <div ogAccordionPanel>Multiple panel</div>
    </article>
    <output data-co="multiple">{{ settings.multiple().join(',') }}</output>
  </section>
  <section ogAccordionSingle coExistingSingle (unusedExistingSingleChange)="settings.unusedOutputs.update(increment)">
    <article ogAccordionItem value="first">
      <button ogAccordionTrigger data-co="existing-single-trigger">Existing Single</button>
      <div ogAccordionPanel>Existing Single panel</div>
    </article>
    <output data-co="existing-single">{{ settings.existingSingle() }}</output>
  </section>
  <section ogAccordionMultiple coFactoryMultiple (unusedFactoryMultipleChange)="settings.unusedOutputs.update(increment)">
    <article ogAccordionItem value="first">
      <button ogAccordionTrigger data-co="factory-multiple-trigger">Factory Multiple</button>
      <div ogAccordionPanel>Factory Multiple panel</div>
    </article>
    <output data-co="factory-multiple">{{ settings.factoryMultiple().join(',') }}</output>
  </section>
  <output data-co="unused">{{ settings.unusedOutputs() }}</output>
`;

@Component({
  selector: "precedence-accordion-upper-first",
  imports: [...accordionComposed, ...accordionPrimitives],
  providers: [AccordionCoMatchSettings, { provide: AccordionCaseLabel, useValue: "upper-first" }],
  host: { "data-case": "accordion-upper-first" },
  template: accordionTemplate,
})
export class AccordionUpperFirst {
  readonly settings = inject(AccordionCoMatchSettings);
  readonly increment = (count: number): number => count + 1;
}

@Component({
  selector: "precedence-accordion-lower-first",
  imports: [...accordionPrimitives, ...accordionComposed],
  providers: [AccordionCoMatchSettings, { provide: AccordionCaseLabel, useValue: "lower-first" }],
  host: { "data-case": "accordion-lower-first" },
  template: accordionTemplate,
})
export class AccordionLowerFirst {
  readonly settings = inject(AccordionCoMatchSettings);
  readonly increment = (count: number): number => count + 1;
}

// ---- Popover ----

const PopoverCaseLabel = new InjectionToken<string>("popover co-match case label");

/** Ordinary non-model replacement signals shared only by one public consumer root. */
@Service({ autoProvided: false })
export class PopoverCoMatchSettings {
  readonly label = inject(PopoverCaseLabel);
  readonly identity = injectUniqueId("popover-co-match");
  readonly open = signal(false);
  readonly disabled = signal(true);
  readonly dismissible = signal(false);
  readonly triggerId = signal(`${this.identity}-trigger`);
  readonly anchorId = signal(`${this.identity}-anchor`);
  readonly contentId = signal(`${this.identity}-content`);
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
  hostDirectives: [{ directive: OrigamiPopover, outputs: ["openChange: unusedOpenChange"] }],
  providers: [
    PopoverCoMatchSettings,
    OrigamiPopoverOptions.provideFactory(() => inject(PopoverCoMatchSettings)),
  ],
})
export class CoFactoryPopover {
  readonly settings = inject(PopoverCoMatchSettings);
  readonly state = inject(OrigamiPopoverState);
}

@Directive({
  selector: "button[coFactoryPopoverTrigger]",
  hostDirectives: [OrigamiPopoverTrigger],
  providers: [
    OrigamiPopoverTriggerOptions.provideFactory(() => ({
      id: inject(PopoverCoMatchSettings).triggerId,
    })),
  ],
})
export class CoFactoryPopoverTrigger {}

@Directive({
  selector: "[coFactoryPopoverAnchor]",
  hostDirectives: [OrigamiPopoverAnchor],
  providers: [
    OrigamiPopoverAnchorOptions.provideFactory(() => ({
      id: inject(PopoverCoMatchSettings).anchorId,
    })),
  ],
})
export class CoFactoryPopoverAnchor {}

@Directive({
  selector: "[coFactoryPopoverContent]",
  exportAs: "coPopoverContent",
  hostDirectives: [OrigamiPopoverContent],
  providers: [
    OrigamiPopoverContentOptions.provideFactory(() => {
      const settings = inject(PopoverCoMatchSettings);

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
  hostDirectives: [{ directive: OrigamiPopover, outputs: ["openChange: unusedOpenChange"] }],
  providers: [
    PopoverCoMatchSettings,
    OrigamiPopoverOptions.provideExisting(() => CoExistingPopover),
  ],
})
export class CoExistingPopover implements OrigamiPopoverOptions {
  readonly settings = inject(PopoverCoMatchSettings);
  readonly open = this.settings.open;
  readonly disabled = this.settings.disabled;
  readonly dismissible = this.settings.dismissible;
  readonly state = inject(OrigamiPopoverState);
}

@Directive({
  selector: "button[coExistingPopoverTrigger]",
  hostDirectives: [OrigamiPopoverTrigger],
  providers: [OrigamiPopoverTriggerOptions.provideExisting(() => CoExistingPopoverTrigger)],
})
export class CoExistingPopoverTrigger implements OrigamiPopoverTriggerOptions {
  readonly id = inject(PopoverCoMatchSettings).triggerId;
}

@Directive({
  selector: "[coExistingPopoverAnchor]",
  hostDirectives: [OrigamiPopoverAnchor],
  providers: [OrigamiPopoverAnchorOptions.provideExisting(() => CoExistingPopoverAnchor)],
})
export class CoExistingPopoverAnchor implements OrigamiPopoverAnchorOptions {
  readonly id = inject(PopoverCoMatchSettings).anchorId;
}

@Directive({
  selector: "[coExistingPopoverContent]",
  exportAs: "coPopoverContent",
  hostDirectives: [OrigamiPopoverContent],
  providers: [OrigamiPopoverContentOptions.provideExisting(() => CoExistingPopoverContent)],
})
export class CoExistingPopoverContent implements OrigamiPopoverContentOptions {
  readonly settings = inject(PopoverCoMatchSettings);
  readonly id = this.settings.contentId;
  readonly side = this.settings.side;
  readonly align = this.settings.align;
  readonly gap = this.settings.gap;
  readonly state = inject(OrigamiPopoverContentState);
}

// Selectors co-match every host-composed role. Conflicting direct inputs must remain unused
// when a replacement is present, regardless of import order.
function popoverTemplate(prefix: "coFactoryPopover" | "coExistingPopover"): string {
  return `
  <div ${prefix} ogPopover #root="coPopover" [open]="true" [disabled]="false" [dismissible]="true"
    (openChange)="root.settings.unusedOutputs.update(root.settings.increment)"
    (unusedOpenChange)="root.settings.unusedOutputs.update(root.settings.increment)">
    <output data-co="open">{{ root.state.open() }}</output>
    <output data-co="disabled">{{ root.state.disabled() }}</output>
    <output data-co="dismissible">{{ root.state.dismissible() }}</output>
    <output data-co="unused-outputs">{{ root.settings.unusedOutputs() }}</output>
    <output data-co="trigger-id">{{ root.settings.triggerId() }}</output>
    <output data-co="anchor-id">{{ root.settings.anchorId() }}</output>
    <output data-co="content-id">{{ root.settings.contentId() }}</output>
    <button type="button" data-co="enable" (click)="root.settings.disabled.set(false)">Enable</button>
    <button type="button" data-co="write-open" (click)="root.settings.open.set(true)">Write Options</button>
    <button ${prefix}Trigger ogPopoverTrigger id="unused-direct-trigger" data-co="trigger">Toggle</button>
    <span ${prefix}Anchor ogPopoverAnchor id="unused-direct-anchor" class="anchor" data-co="anchor"
      [attr.data-testid]="root.settings.label + '-anchor'">Anchor</span>
    <section ${prefix}Content ogPopoverContent #content="coPopoverContent" id="unused-direct-content"
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
const popoverPrimitives = [
  OrigamiPopover,
  OrigamiPopoverTrigger,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
];
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
  selector: "precedence-popover-factory-first",
  imports: [...popoverFactory, ...popoverPrimitives],
  providers: [{ provide: PopoverCaseLabel, useValue: "popover-factory-first" }],
  host: { "data-case": "popover-factory-first" },
  template: popoverTemplate("coFactoryPopover"),
  styles: popoverStyles,
})
export class PopoverFactoryFirst {}

@Component({
  selector: "precedence-popover-factory-last",
  imports: [...popoverPrimitives, ...popoverFactory],
  providers: [{ provide: PopoverCaseLabel, useValue: "popover-factory-last" }],
  host: { "data-case": "popover-factory-last" },
  template: popoverTemplate("coFactoryPopover"),
  styles: popoverStyles,
})
export class PopoverFactoryLast {}

@Component({
  selector: "precedence-popover-existing-first",
  imports: [...popoverExisting, ...popoverPrimitives],
  providers: [{ provide: PopoverCaseLabel, useValue: "popover-existing-first" }],
  host: { "data-case": "popover-existing-first" },
  template: popoverTemplate("coExistingPopover"),
  styles: popoverStyles,
})
export class PopoverExistingFirst {}

@Component({
  selector: "precedence-popover-existing-last",
  imports: [...popoverPrimitives, ...popoverExisting],
  providers: [{ provide: PopoverCaseLabel, useValue: "popover-existing-last" }],
  host: { "data-case": "popover-existing-last" },
  template: popoverTemplate("coExistingPopover"),
  styles: popoverStyles,
})
export class PopoverExistingLast {}

@Component({
  selector: "acceptance-precedence",
  imports: [
    FactoryUpperFirst,
    FactoryLowerFirst,
    ExistingUpperFirst,
    ExistingLowerFirst,
    FactoryDiamond,
    ExistingDiamond,
    DefaultIsolation,
    AccordionUpperFirst,
    AccordionLowerFirst,
    PopoverFactoryFirst,
    PopoverFactoryLast,
    PopoverExistingFirst,
    PopoverExistingLast,
  ],
  template: `
    <h2>Replacement precedence across import orders and diamonds</h2>
    <precedence-factory-upper-first /><precedence-factory-lower-first />
    <precedence-existing-upper-first /><precedence-existing-lower-first />
    <precedence-factory-diamond /><precedence-existing-diamond />
    <precedence-default-isolation />
    <precedence-accordion-upper-first /><precedence-accordion-lower-first />
    <precedence-popover-factory-first /><precedence-popover-factory-last />
    <precedence-popover-existing-first /><precedence-popover-existing-last />
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
