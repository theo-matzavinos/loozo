import { Component, Directive, computed, inject, signal } from "@angular/core";
import {
  OrigamiCollection,
  OrigamiCollectionItem,
  OrigamiCollectionState,
} from "@loozo/origami-ui/collection";
import { OrigamiPresence } from "@loozo/origami-ui/presence";
import {
  OrigamiCollapsible,
  OrigamiCollapsibleTrigger,
  OrigamiCollapsiblePanel,
} from "@loozo/origami-ui/collapsible";
import {
  OrigamiAccordionSingle,
  OrigamiAccordionMultiple,
  OrigamiAccordionItem,
  OrigamiAccordionTrigger,
  OrigamiAccordionPanel,
} from "@loozo/origami-ui/accordion";
import { OrigamiToggle } from "@loozo/origami-ui/toggle";

/** Observes public Collection State without accessing registration internals. */
@Directive({
  selector: "[collectionObservation]",
  exportAs: "collectionObservation",
})
export class CollectionObservation {
  readonly state = inject(OrigamiCollectionState);
  readonly values = computed(() => {
    const values: string[] = [];

    for (const item of this.state.items()) {
      values.push(item.value());
    }

    return values.join(",");
  });
}

/** Public-import consumer seed; not a compiled or executed acceptance result. */
@Component({
  selector: "acceptance-core",
  imports: [
    OrigamiCollection,
    OrigamiCollectionItem,
    CollectionObservation,
    OrigamiPresence,
    OrigamiCollapsible,
    OrigamiCollapsibleTrigger,
    OrigamiCollapsiblePanel,
    OrigamiAccordionSingle,
    OrigamiAccordionMultiple,
    OrigamiAccordionItem,
    OrigamiAccordionTrigger,
    OrigamiAccordionPanel,
    OrigamiToggle,
  ],
  template: `
    <h1>Origami public contracts</h1>

    <section ogCollection collectionObservation #collection="collectionObservation">
      <h2>Collection</h2>
      <button type="button" data-testid="reverse-items" (click)="reverseItems()">
        Reverse items
      </button>
      <button type="button" data-testid="rename-item" (click)="firstValue.set('renamed')">
        Rename first value
      </button>
      @for (key of itemKeys(); track key) {
        <span ogCollectionItem [value]="key" [attr.data-item-key]="key">{{ key }}</span>
      }
      <span ogCollectionItem [value]="firstValue()" data-testid="reactive-item">Reactive item</span>
      <div ogCollection>
        <span ogCollectionItem value="nested">Nested item</span>
      </div>
      <output data-testid="collection-values">{{ collection.values() }}</output>
    </section>

    <section>
      <h2>Presence</h2>
      <button type="button" data-testid="toggle-presence" (click)="present.set(!present())">
        Toggle presence
      </button>
      <div
        ogPresence
        #presence="ogPresence"
        [(present)]="present"
        class="motion"
        data-testid="presence-host"
        [attr.data-phase]="presence.state.phase()"
      >
        @if (presence.state.open()) {
          <p data-testid="presence-child">Retained content</p>
        }
      </div>
      <output data-testid="presence-retained">{{ presence.state.open() }}</output>
    </section>

    <section>
      <h2>Collapsible</h2>
      <button type="button" data-testid="disable-collapsible" (click)="disabled.set(!disabled())">
        Toggle disabled
      </button>
      <button type="button" data-testid="script-expand" (click)="expanded.set(true)">
        Expand from consumer
      </button>
      <button
        type="button"
        data-testid="change-trigger-id"
        (click)="triggerId.set('changed-trigger')"
      >
        Change trigger ID
      </button>
      <div
        ogCollapsible
        [(expanded)]="expanded"
        [disabled]="disabled()"
        (expandedChange)="expandedOutputs.update(increment)"
      >
        <button ogCollapsibleTrigger [id]="triggerId()" data-testid="collapsible-trigger">
          Details
        </button>
        <div
          ogCollapsiblePanel
          id="acceptance-panel"
          class="motion"
          data-testid="collapsible-panel"
        >
          <p data-testid="collapsible-child">Consumer-owned panel</p>
        </div>
      </div>
      <output data-testid="expanded-outputs">{{ expandedOutputs() }}</output>
    </section>

    <section ogAccordionSingle [(value)]="single" [collapsible]="singleCollapsible()">
      <h2>Single Accordion</h2>
      <button
        type="button"
        data-testid="toggle-single-collapsible"
        (click)="singleCollapsible.set(!singleCollapsible())"
      >
        Allow clearing selection
      </button>
      <button type="button" data-testid="set-unknown-single" (click)="single.set('unmounted')">
        Select unmounted value
      </button>
      <article ogAccordionItem value="billing">
        <h3><button ogAccordionTrigger data-testid="single-billing">Billing</button></h3>
        <div ogAccordionPanel class="motion">Billing details</div>
      </article>
      <article ogAccordionItem value="security">
        <h3><button ogAccordionTrigger data-testid="single-security">Security</button></h3>
        <div ogAccordionPanel class="motion">Security details</div>
      </article>
      <output data-testid="single-value">{{ single() }}</output>
    </section>

    <section
      ogAccordionMultiple
      [(value)]="multiple"
      (valueChange)="multipleOutputs.update(increment)"
    >
      <h2>Multiple Accordion</h2>
      <article ogAccordionItem value="billing">
        <h3><button ogAccordionTrigger data-testid="multiple-billing">Billing</button></h3>
        <div ogAccordionPanel class="motion">Billing details</div>
      </article>
      <article ogAccordionItem value="security">
        <h3><button ogAccordionTrigger data-testid="multiple-security">Security</button></h3>
        <div ogAccordionPanel class="motion">Security details</div>
      </article>
      <output data-testid="multiple-value">{{ multiple() }}</output>
      <output data-testid="multiple-original">{{ originalMultiple }}</output>
      <output data-testid="multiple-outputs">{{ multipleOutputs() }}</output>
    </section>

    <section>
      <h2>Toggle</h2>
      <button
        type="button"
        data-testid="disable-toggle"
        (click)="toggleDisabled.set(!toggleDisabled())"
      >
        Toggle disabled
      </button>
      <button type="button" data-testid="script-pressed" (click)="pressed.set(!pressed())">
        Write pressed from consumer
      </button>
      <form (submit)="$event.preventDefault(); toggleSubmits.update(increment)">
        <button
          ogToggle
          #toggle="ogToggle"
          [(pressed)]="pressed"
          [disabled]="toggleDisabled()"
          (pressedChange)="pressedOutputs.update(increment)"
          data-testid="toggle"
        >
          Bold
        </button>
      </form>
      <output data-testid="toggle-state">{{ toggle.state.pressed() }}</output>
      <output data-testid="pressed-outputs">{{ pressedOutputs() }}</output>
      <output data-testid="toggle-submits">{{ toggleSubmits() }}</output>
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
      section {
        margin-block: 1rem 2rem;
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
export class CoreConsumer {
  readonly itemKeys = signal(["one", "two"]);
  readonly firstValue = signal("original");
  readonly present = signal(true);
  readonly expanded = signal(true);
  readonly disabled = signal(false);
  readonly triggerId = signal("acceptance-trigger");
  readonly expandedOutputs = signal(0);
  readonly single = signal<string | null>(null);
  readonly singleCollapsible = signal(false);
  readonly originalMultiple: readonly string[] = Object.freeze(["unmounted"]);
  readonly multiple = signal<readonly string[]>(this.originalMultiple);
  readonly multipleOutputs = signal(0);
  readonly pressed = signal(false);
  readonly toggleDisabled = signal(false);
  readonly pressedOutputs = signal(0);
  readonly toggleSubmits = signal(0);
  readonly increment = (value: number): number => value + 1;

  reverseItems(): void {
    const keys = [...this.itemKeys()];

    keys.reverse();
    this.itemKeys.set(keys);
  }
}
