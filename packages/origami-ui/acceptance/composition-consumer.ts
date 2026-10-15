import {
  Component,
  Directive,
  InjectionToken,
  Service,
  booleanAttribute,
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
  ],
  providers: [
    FactorySettings,
    ToggleSettings,
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
  readonly increment = (value: number): number => value + 1;
}
