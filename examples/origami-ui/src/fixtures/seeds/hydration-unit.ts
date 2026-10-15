import {
  Component,
  Directive,
  afterNextRender,
  inject,
  input,
  linkedSignal,
  signal,
} from "@angular/core";
import { OrigamiPresence } from "@loozo/origami-ui/presence";
import {
  OrigamiCollapsible,
  OrigamiCollapsibleTrigger,
  OrigamiCollapsiblePanel,
} from "@loozo/origami-ui/collapsible";
import {
  OrigamiAccordionSingle,
  OrigamiAccordionItem,
  OrigamiAccordionTrigger,
  OrigamiAccordionPanel,
  OrigamiAccordionState,
} from "@loozo/origami-ui/accordion";
import {
  OrigamiPopover,
  OrigamiPopoverTrigger,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
} from "@loozo/origami-ui/popover";
import { OrigamiToggle } from "@loozo/origami-ui/toggle";
import { injectUniqueId } from "@loozo/origami-ui/utils";

@Directive({
  selector: "[accordionObservation]",
  host: { "[attr.data-item-values]": "state.itemValues().join(',')" },
})
export class AccordionObservation {
  readonly state = inject(OrigamiAccordionState);
}

/** Imported only through deferred templates in the incremental-hydration fixture. */
@Component({
  selector: "acceptance-hydration-unit",
  imports: [
    OrigamiPresence,
    OrigamiCollapsible,
    OrigamiCollapsibleTrigger,
    OrigamiCollapsiblePanel,
    OrigamiAccordionSingle,
    OrigamiAccordionItem,
    OrigamiAccordionTrigger,
    OrigamiAccordionPanel,
    AccordionObservation,
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
    OrigamiToggle,
  ],
  host: {
    "[attr.data-unit]": "label()",
    "[attr.data-generated-id]": "generatedId",
    "[attr.data-client-render-seen]": "clientRenderSeen()",
  },
  template: `
    <h2>{{ label() }}</h2>
    <button type="button" data-testid="hydrate-unit" (click)="interactionCount.update(increment)">
      Hydrate this block
    </button>
    <output data-testid="interaction-count">{{ interactionCount() }}</output>

    <div ogPresence #presence="ogPresence" [(present)]="present" data-testid="hydration-presence">
      @if (presence.state.open()) {
        <p data-testid="hydration-presence-child">{{ label() }} retained server child</p>
      }
    </div>

    <div ogCollapsible [(expanded)]="expanded" (expandedChange)="expandedOutputs.update(increment)">
      <button ogCollapsibleTrigger data-testid="hydration-collapsible-trigger">
        Toggle server details
      </button>
      <div ogCollapsiblePanel data-testid="hydration-collapsible-panel">{{ label() }} details</div>
    </div>
    <output data-testid="expanded-output-count">{{ expandedOutputs() }}</output>

    <button
      ogToggle
      [(pressed)]="pressed"
      (pressedChange)="pressedOutputs.update(increment)"
      data-testid="hydration-toggle"
    >
      Toggle server pressed
    </button>
    <output data-testid="pressed-output-count">{{ pressedOutputs() }}</output>

    <div
      ogAccordionSingle
      accordionObservation
      [(value)]="selected"
      data-testid="hydration-accordion"
    >
      <article ogAccordionItem>
        <h3>
          <button ogAccordionTrigger data-testid="generated-item-one">Generated item one</button>
        </h3>
        <div ogAccordionPanel>First item</div>
      </article>
      <article ogAccordionItem>
        <h3>
          <button ogAccordionTrigger data-testid="generated-item-two">Generated item two</button>
        </h3>
        <div ogAccordionPanel>Second item</div>
      </article>
    </div>
    <output data-testid="generated-selection">{{ selected() }}</output>

    <div
      ogPopover
      [(open)]="popoverOpen"
      [dismissible]="dismissible()"
      (openChange)="popoverOutputs.update(increment)"
    >
      <button ogPopoverTrigger ogPopoverAnchor data-testid="hydration-popover-trigger">
        Toggle server Popover
      </button>
      <section
        ogPopoverContent
        #content="ogPopoverContent"
        class="surface"
        role="group"
        [attr.aria-label]="label()"
        data-testid="hydration-popover-content"
      >
        @if (content.state.open()) {
          <button type="button" data-testid="hydration-popover-child">
            {{ label() }} retained Popover child: {{ liveText() }}
          </button>
          <button
            type="button"
            data-testid="hydration-live-update"
            (click)="liveText.set('updated-after-attachment')"
          >
            Update retained binding
          </button>
        }
      </section>
    </div>
    <output data-testid="popover-intent">{{ popoverOpen() }}</output>
    <output data-testid="popover-output-count">{{ popoverOutputs() }}</output>
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
      }
      .surface[data-entering] {
        animation: hydrated-enter 800ms linear;
      }
      .surface[data-leaving] {
        animation: hydrated-leave 800ms linear;
      }
      @keyframes hydrated-enter {
        from {
          opacity: 0.1;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes hydrated-leave {
        from {
          opacity: 1;
        }
        to {
          opacity: 0.1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .surface {
          animation: none !important;
        }
      }
      .surface {
        inline-size: 16rem;
        max-inline-size: calc(100vw - 24px);
        box-sizing: border-box;
        padding: 1rem;
        border: 1px solid #777777;
        background: #242424;
        color: #eeeeee;
      }
    `,
  ],
})
export class HydrationUnit {
  readonly label = input.required<string>();
  readonly initiallyPresent = input(true);
  /** Hydration-only fixture policy; protected unless a replay case makes one unit dismissible. */
  readonly dismissible = input(false);
  readonly generatedId = injectUniqueId("acceptance-repeated");
  readonly clientRenderSeen = signal(false);
  readonly present = linkedSignal(() => this.initiallyPresent());
  readonly expanded = linkedSignal(() => this.initiallyPresent());
  readonly popoverOpen = linkedSignal(() => this.initiallyPresent());
  readonly selected = signal<string | null>(null);
  readonly liveText = signal("initial");
  readonly interactionCount = signal(0);
  readonly expandedOutputs = signal(0);
  readonly pressed = linkedSignal(() => this.initiallyPresent());
  readonly pressedOutputs = signal(0);
  readonly popoverOutputs = signal(0);
  readonly increment = (value: number): number => value + 1;

  constructor() {
    // This diagnostic means this owner ran a client render callback, not that hydration is complete.
    afterNextRender({
      write: () => {
        this.clientRenderSeen.set(true);
      },
    });
  }
}
