import {
  Component,
  Directive,
  InjectionToken,
  Service,
  booleanAttribute,
  computed,
  inject,
  input,
  model,
  signal,
} from "@angular/core";
import {
  OrigamiCollapsible,
  OrigamiCollapsibleOptions,
  OrigamiCollapsibleState,
  OrigamiCollapsibleTrigger,
  OrigamiCollapsibleTriggerOptions,
  OrigamiCollapsiblePanel,
  type OrigamiCollapsibleHiding,
} from "@loozo/origami-ui/collapsible";
import {
  OrigamiAccordionSingle,
  OrigamiAccordionItem,
  OrigamiAccordionTrigger,
  OrigamiAccordionTriggerOptions,
  OrigamiAccordionPanel,
} from "@loozo/origami-ui/accordion";
import { OrigamiPresenceState } from "@loozo/origami-ui/presence";
import { OrigamiToggle, OrigamiToggleOptions, OrigamiToggleState } from "@loozo/origami-ui/toggle";
import {
  OrigamiTabs,
  OrigamiTabsOptions,
  OrigamiTabsState,
  OrigamiTabsList,
  OrigamiTabsTrigger,
  OrigamiTabsTriggerOptions,
  OrigamiTabsPanel,
  OrigamiTabsPanelOptions,
  type OrigamiTabsOrientation,
  type OrigamiTabsActivation,
} from "@loozo/origami-ui/tabs";
import {
  OrigamiToggleGroupSingle,
  OrigamiToggleGroupSingleOptions,
  OrigamiToggleGroupState,
  OrigamiToggleGroupItem,
  OrigamiToggleGroupItemOptions,
  type OrigamiToggleGroupOrientation,
} from "@loozo/origami-ui/toggle-group";
import { OrigamiCollectionState } from "@loozo/origami-ui/collection";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";

@Service({ autoProvided: false })
export class FactorySettings {
  readonly expanded = signal(false);
  readonly disabled = signal(false);
  readonly hiding = signal<OrigamiCollapsibleHiding>("hidden");
  readonly deferredLookups = signal(0);
}

@Directive({
  selector: "[factoryCollapsible]",
  exportAs: "factoryCollapsible",
  hostDirectives: [
    { directive: OrigamiCollapsible, outputs: ["expandedChange: lowerExpandedChange"] },
  ],
  providers: [OrigamiCollapsibleOptions.provideFactory(() => inject(FactorySettings))],
})
export class FactoryCollapsible {
  readonly state = inject(OrigamiCollapsibleState);
}

@Directive({
  selector: "button[consumerCollapsibleTrigger]",
  hostDirectives: [OrigamiCollapsibleTrigger],
  providers: [OrigamiCollapsibleTriggerOptions.provideExisting(() => ConsumerCollapsibleTrigger)],
})
export class ConsumerCollapsibleTrigger implements OrigamiCollapsibleTriggerOptions {
  readonly id = input("consumer-trigger");
}

@Directive({
  selector: "[consumerCollapsiblePanel]",
  exportAs: "consumerCollapsiblePanel",
  hostDirectives: [OrigamiCollapsiblePanel],
})
export class ConsumerCollapsiblePanel {
  readonly state = inject(OrigamiPresenceState);
}

/** Replaces only the upper Accordion token, never the lower Collapsible token. */
@Directive({
  selector: "button[consumerAccordionTrigger]",
  hostDirectives: [OrigamiAccordionTrigger],
  providers: [OrigamiAccordionTriggerOptions.provideExisting(() => ConsumerAccordionTrigger)],
})
export class ConsumerAccordionTrigger implements OrigamiAccordionTriggerOptions {
  readonly id = input("consumer-accordion-trigger");
}

@Service({ autoProvided: false })
export class ToggleSettings {
  readonly pressed = signal(false);
  readonly disabled = signal(false);
}

/** Writable factory Options win over the unused lower model, whose output stays silent. */
@Directive({
  selector: "button[factoryToggle]",
  exportAs: "factoryToggle",
  hostDirectives: [
    {
      directive: OrigamiToggle,
      inputs: ["pressed: lowerPressed"],
      outputs: ["pressedChange: lowerPressedChange"],
    },
  ],
  providers: [OrigamiToggleOptions.provideFactory(() => inject(ToggleSettings))],
})
export class FactoryToggle {
  readonly state = inject(OrigamiToggleState);
}

/** Existing Options: the consumer directive's own model and input drive the composed Toggle. */
@Directive({
  selector: "button[consumerToggle]",
  exportAs: "consumerToggle",
  hostDirectives: [OrigamiToggle],
  providers: [OrigamiToggleOptions.provideExisting(() => ConsumerToggle)],
})
export class ConsumerToggle implements OrigamiToggleOptions {
  readonly pressed = model(true);
  readonly disabled = input(false, { transform: booleanAttribute });
}

/** A descendant observes its nearest Toggle's State. */
@Directive({
  selector: "[toggleObservation]",
  host: { "[attr.data-observed-pressed]": "state.pressed()" },
})
export class ToggleObservation {
  readonly state = inject(OrigamiToggleState);
}

@Service({ autoProvided: false })
export class TabsSettings {
  readonly value = signal<string | null>("profile");
  readonly disabled = signal(false);
  readonly orientation = signal<OrigamiTabsOrientation>("vertical");
  readonly activation = signal<OrigamiTabsActivation>("manual");
}

/** Writable factory Options win over the unused root model, whose output stays silent. */
@Directive({
  selector: "[factoryTabs]",
  exportAs: "factoryTabs",
  hostDirectives: [
    {
      directive: OrigamiTabs,
      inputs: ["value: lowerValue"],
      outputs: ["valueChange: lowerValueChange"],
    },
  ],
  providers: [OrigamiTabsOptions.provideFactory(() => inject(TabsSettings))],
})
export class FactoryTabs {
  readonly state = inject(OrigamiTabsState);
  readonly #items = inject(OrigamiCollectionState);
  /** The composed Collection's values, which only the upper Trigger Options supply. */
  readonly itemValues = computed(() => {
    const values: string[] = [];

    for (const item of this.#items.items()) {
      values.push(item.value());
    }

    return values.join(",");
  });
}

/** Existing Trigger Options: the consumer's own value input and a value-derived ID. */
@Directive({
  selector: "button[consumerTab]",
  hostDirectives: [OrigamiTabsTrigger],
  providers: [OrigamiTabsTriggerOptions.provideExisting(() => ConsumerTab)],
})
export class ConsumerTab implements OrigamiTabsTriggerOptions {
  readonly value = input.required<string>({ alias: "consumerTab" });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly id = computed(() => `consumer-tab-${this.value()}`);
}

/** Factory Panel Options derived from the consumer's own value input. */
@Directive({
  selector: "[consumerTabPanel]",
  hostDirectives: [OrigamiTabsPanel],
  providers: [
    OrigamiTabsPanelOptions.provideFactory(() => {
      const panel = inject(ConsumerTabPanel);

      return { value: panel.value, id: computed(() => `consumer-panel-${panel.value()}`) };
    }),
  ],
})
export class ConsumerTabPanel {
  readonly value = input.required<string>({ alias: "consumerTabPanel" });
}

/** A descendant observes its nearest Tabs State. */
@Directive({
  selector: "[tabsObservation]",
  host: { "[attr.data-observed-value]": "state.value()" },
})
export class TabsObservation {
  readonly state = inject(OrigamiTabsState);
}

@Service({ autoProvided: false })
export class AlignmentSettings {
  readonly value = signal<string | null>("start");
  readonly disabled = signal(false);
  readonly orientation = signal<OrigamiToggleGroupOrientation>("vertical");
  readonly deselectable = signal(true);
}

/** Writable factory Options win over the unused root model, whose output stays silent. */
@Directive({
  selector: "[factoryAlignment]",
  exportAs: "factoryAlignment",
  hostDirectives: [
    {
      directive: OrigamiToggleGroupSingle,
      inputs: ["value: lowerValue"],
      outputs: ["valueChange: lowerValueChange"],
    },
  ],
  providers: [OrigamiToggleGroupSingleOptions.provideFactory(() => inject(AlignmentSettings))],
})
export class FactoryAlignment {
  readonly state = inject(OrigamiToggleGroupState);
  readonly #items = inject(OrigamiCollectionState);
  /** The composed Collection's values, which only the upper item Options supply. */
  readonly itemValues = computed(() => {
    const values: string[] = [];

    for (const item of this.#items.items()) {
      values.push(item.value());
    }

    return values.join(",");
  });
}

export type Alignment = { readonly id: string; readonly available: boolean };

/** Readable before Angular sets the input: the group reads every repeated item's Options while rendering. */
const pendingAlignment: Alignment = { id: "", available: false };

/** Existing item Options: value and disabled state come from the consumer's domain record. */
@Directive({
  selector: "button[consumerAlignment]",
  hostDirectives: [OrigamiToggleGroupItem],
  providers: [OrigamiToggleGroupItemOptions.provideExisting(() => ConsumerAlignment)],
})
export class ConsumerAlignment implements OrigamiToggleGroupItemOptions {
  readonly alignment = input<Alignment>(pendingAlignment, { alias: "consumerAlignment" });
  readonly value = computed(() => this.alignment().id);
  readonly disabled = computed(() => !this.alignment().available);
}

/** A descendant observes its nearest ToggleGroup State. */
@Directive({
  selector: "[toggleGroupObservation]",
  exportAs: "toggleGroupObservation",
  host: {
    "[attr.data-observed-orientation]": "state.orientation()",
    "[attr.data-observed-disabled]": "state.disabled()",
  },
})
export class ToggleGroupObservation {
  readonly state = inject(OrigamiToggleGroupState);
}

const DeferredValue = new InjectionToken<string>("acceptance deferred value");

@Directive({
  selector: "[nestedDeferredScope]",
  providers: [{ provide: DeferredValue, useValue: "nearest-nested" }],
})
export class NestedDeferredScope {}

@Directive({
  selector: "[utilityObservation]",
  exportAs: "utilityObservation",
  host: { "[attr.data-generated-id]": "generatedId" },
})
export class UtilityObservation {
  readonly generatedId = injectUniqueId("acceptance-repeated");
  readonly resolve = injectDeferred(DeferredValue);
  readonly value = signal("unresolved");
}

@Component({
  selector: "acceptance-composition",
  imports: [
    FactoryCollapsible,
    ConsumerCollapsibleTrigger,
    ConsumerCollapsiblePanel,
    OrigamiAccordionSingle,
    OrigamiAccordionItem,
    ConsumerAccordionTrigger,
    OrigamiAccordionPanel,
    UtilityObservation,
    NestedDeferredScope,
    FactoryToggle,
    ConsumerToggle,
    ToggleObservation,
    FactoryTabs,
    OrigamiTabsList,
    ConsumerTab,
    ConsumerTabPanel,
    TabsObservation,
    FactoryAlignment,
    ConsumerAlignment,
    ToggleGroupObservation,
  ],
  providers: [
    FactorySettings,
    ToggleSettings,
    TabsSettings,
    AlignmentSettings,
    {
      provide: DeferredValue,
      useFactory: () => {
        const settings = inject(FactorySettings);

        settings.deferredLookups.update((value) => value + 1);

        return "nearest-component";
      },
    },
  ],
  template: `
    <h1>Consumer composition and utilities</h1>
    <button type="button" data-testid="factory-expand" (click)="settings.expanded.set(true)">
      Write factory Options
    </button>
    <button
      type="button"
      data-testid="factory-disable"
      (click)="settings.disabled.set(!settings.disabled())"
    >
      Toggle factory disabled
    </button>
    <button
      type="button"
      data-testid="upper-id-change"
      (click)="triggerId.set('updated-upper-trigger')"
    >
      Change upper ID
    </button>
    <section
      factoryCollapsible
      #root="factoryCollapsible"
      (lowerExpandedChange)="unusedOutputs.update(increment)"
    >
      <button consumerCollapsibleTrigger [id]="triggerId()" data-testid="factory-trigger">
        Factory-backed details
      </button>
      <div
        consumerCollapsiblePanel
        #panel="consumerCollapsiblePanel"
        class="motion"
        data-testid="factory-panel"
      >
        @if (panel.state.open()) {
          <p data-testid="factory-child">Retained consumer child</p>
        }
      </div>
      <output data-testid="factory-expanded">{{ root.state.expanded() }}</output>
      <output data-testid="unused-lower-outputs">{{ unusedOutputs() }}</output>
    </section>

    <section ogAccordionSingle [(value)]="selected">
      <article ogAccordionItem value="consumer-item">
        <h2>
          <button
            consumerAccordionTrigger
            [id]="accordionTriggerId()"
            data-testid="upper-accordion-trigger"
          >
            Upper-only Options
          </button>
        </h2>
        <div ogAccordionPanel data-testid="upper-accordion-panel">
          Lower composition must inherit the upper ID
        </div>
      </article>
    </section>

    <div
      utilityObservation
      #first="utilityObservation"
      id="consumer-dom-id"
      data-testid="utility-first"
    >
      <button type="button" data-testid="resolve-first" (click)="first.value.set(first.resolve())">
        Resolve captured supplier
      </button>
      <output data-testid="first-resolution">{{ first.value() }}</output>
    </div>
    <div nestedDeferredScope>
      <div utilityObservation #second="utilityObservation" data-testid="utility-second">
        <button
          type="button"
          data-testid="resolve-second"
          (click)="second.value.set(second.resolve())"
        >
          Resolve nearest nested supplier
        </button>
        <output data-testid="second-resolution">{{ second.value() }}</output>
      </div>
    </div>
    <output data-testid="deferred-lookups">{{ settings.deferredLookups() }}</output>

    <section>
      <h2>Toggle composition</h2>
      <button type="button" data-testid="factory-press" (click)="toggleSettings.pressed.set(true)">
        Write factory pressed
      </button>
      <button
        type="button"
        data-testid="factory-toggle-disable"
        (click)="toggleSettings.disabled.set(!toggleSettings.disabled())"
      >
        Toggle factory Toggle disabled
      </button>
      <button
        factoryToggle
        #factoryToggle="factoryToggle"
        [lowerPressed]="true"
        (lowerPressedChange)="unusedToggleOutputs.update(increment)"
        data-testid="factory-toggle"
      >
        <span toggleObservation data-testid="factory-toggle-observer">Factory-backed</span>
      </button>
      <output data-testid="factory-toggle-state">{{ factoryToggle.state.pressed() }}</output>
      <output data-testid="unused-toggle-outputs">{{ unusedToggleOutputs() }}</output>
      <button
        consumerToggle
        [(pressed)]="consumerPressed"
        [disabled]="consumerDisabled()"
        (pressedChange)="consumerToggleOutputs.update(increment)"
        data-testid="consumer-toggle"
      >
        <span toggleObservation data-testid="consumer-toggle-observer">Existing Options</span>
      </button>
      <button
        type="button"
        data-testid="consumer-toggle-disable"
        (click)="consumerDisabled.set(!consumerDisabled())"
      >
        Toggle existing Toggle disabled
      </button>
      <output data-testid="consumer-pressed">{{ consumerPressed() }}</output>
      <output data-testid="consumer-toggle-outputs">{{ consumerToggleOutputs() }}</output>
    </section>

    <section>
      <h2>Tabs composition</h2>
      <button
        type="button"
        data-testid="factory-tabs-select"
        (click)="tabsSettings.value.set('security')"
      >
        Write factory selection
      </button>
      <button
        type="button"
        data-testid="factory-tabs-disable"
        (click)="tabsSettings.disabled.set(!tabsSettings.disabled())"
      >
        Toggle factory Tabs disabled
      </button>
      <button
        type="button"
        data-testid="factory-tabs-horizontal"
        (click)="tabsSettings.orientation.set('horizontal')"
      >
        Make factory Tabs horizontal
      </button>
      <div
        factoryTabs
        #factoryTabs="factoryTabs"
        lowerValue="billing"
        (lowerValueChange)="unusedTabOutputs.update(increment)"
        data-testid="factory-tabs"
      >
        <div ogTabsList aria-label="Composed sections" data-testid="factory-tabs-list">
          <button consumerTab="profile" data-testid="consumer-tab-profile">Profile</button>
          <button consumerTab="billing" disabled data-testid="consumer-tab-billing">Billing</button>
          <button consumerTab="security" data-testid="consumer-tab-security">Security</button>
        </div>
        <div consumerTabPanel="profile" data-testid="consumer-panel-profile">
          <span tabsObservation data-testid="tabs-observer">Profile content</span>
        </div>
        <div consumerTabPanel="security" data-testid="consumer-panel-security">
          Security content
        </div>
      </div>
      <output data-testid="factory-tabs-state">{{ factoryTabs.state.value() }}</output>
      <output data-testid="factory-tabs-items">{{ factoryTabs.itemValues() }}</output>
      <output data-testid="unused-tab-outputs">{{ unusedTabOutputs() }}</output>
    </section>

    <section>
      <h2>ToggleGroup composition</h2>
      <button
        type="button"
        data-testid="factory-alignment-select"
        (click)="alignmentSettings.value.set('end')"
      >
        Write factory alignment
      </button>
      <button
        type="button"
        data-testid="factory-alignment-disable"
        (click)="alignmentSettings.disabled.set(!alignmentSettings.disabled())"
      >
        Toggle factory alignment disabled
      </button>
      <button
        type="button"
        data-testid="factory-alignment-horizontal"
        (click)="alignmentSettings.orientation.set('horizontal')"
      >
        Make factory alignment horizontal
      </button>
      <button
        type="button"
        data-testid="factory-alignment-strict"
        (click)="alignmentSettings.deselectable.set(false)"
      >
        Make factory alignment non-deselectable
      </button>
      <button type="button" data-testid="center-available" (click)="makeCenterAvailable()">
        Make center available
      </button>
      <button type="button" data-testid="reverse-alignments" (click)="reverseAlignments()">
        Reverse alignments
      </button>
      <div
        factoryAlignment
        #factoryAlignment="factoryAlignment"
        lowerValue="end"
        (lowerValueChange)="unusedAlignmentOutputs.update(increment)"
        aria-label="Composed alignment"
        data-testid="factory-alignment"
      >
        @for (alignment of alignments(); track alignment.id) {
          <button
            [consumerAlignment]="alignment"
            [attr.data-testid]="'consumer-align-' + alignment.id"
          >
            {{ alignment.id }}
            <span
              toggleObservation
              [attr.data-testid]="'consumer-align-observer-' + alignment.id"
            ></span>
          </button>
        }
        <span
          toggleGroupObservation
          #groupObservation="toggleGroupObservation"
          data-testid="toggle-group-observer"
        ></span>
      </div>
      <output data-testid="factory-alignment-value">{{ alignmentSettings.value() }}</output>
      <output data-testid="factory-alignment-items">{{ factoryAlignment.itemValues() }}</output>
      <output data-testid="factory-alignment-shared">{{
        factoryAlignment.state === groupObservation.state
      }}</output>
      <output data-testid="unused-alignment-outputs">{{ unusedAlignmentOutputs() }}</output>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        color-scheme: dark;
        background: #141414;
        color: #eeeeee;
        padding: 1rem;
        font-family: system-ui, sans-serif;
      }
      button {
        margin: 0.25rem;
      }
      output {
        display: block;
        margin-block: 0.5rem;
      }
      .motion[data-entering] {
        animation: enter 120ms linear;
      }
      .motion[data-leaving] {
        animation: leave 120ms linear;
      }
      @keyframes enter {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes leave {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .motion {
          animation: none !important;
        }
      }
    `,
  ],
})
export class CompositionConsumer {
  readonly settings = inject(FactorySettings);
  readonly triggerId = signal("initial-upper-trigger");
  readonly accordionTriggerId = signal("initial-upper-accordion-trigger");
  readonly selected = signal<string | null>(null);
  readonly unusedOutputs = signal(0);
  readonly toggleSettings = inject(ToggleSettings);
  readonly unusedToggleOutputs = signal(0);
  readonly consumerPressed = signal(false);
  readonly consumerDisabled = signal(false);
  readonly consumerToggleOutputs = signal(0);
  readonly tabsSettings = inject(TabsSettings);
  readonly unusedTabOutputs = signal(0);
  readonly alignmentSettings = inject(AlignmentSettings);
  readonly alignments = signal<readonly Alignment[]>([
    { id: "start", available: true },
    { id: "center", available: false },
    { id: "end", available: true },
  ]);
  readonly unusedAlignmentOutputs = signal(0);
  readonly increment = (value: number): number => value + 1;

  makeCenterAvailable(): void {
    const alignments: Alignment[] = [];

    for (const alignment of this.alignments()) {
      if (alignment.id === "center") {
        alignments.push({ id: "center", available: true });
      } else {
        alignments.push(alignment);
      }
    }

    this.alignments.set(alignments);
  }

  reverseAlignments(): void {
    const alignments = [...this.alignments()];

    alignments.reverse();
    this.alignments.set(alignments);
  }
}
