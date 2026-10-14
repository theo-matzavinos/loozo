import { Component, afterNextRender, signal } from "@angular/core";
import { OrigamiCollapsibleTrigger, OrigamiCollapsiblePanel } from "@loozo/origami-ui/collapsible";
import {
  OrigamiPopoverTrigger,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
  OrigamiPopover,
} from "@loozo/origami-ui/popover";
import { PresenceObservation } from "./core.js";

@Component({
  selector: "acceptance-nested-parts",
  imports: [
    OrigamiCollapsibleTrigger,
    OrigamiCollapsiblePanel,
    PresenceObservation,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
    OrigamiPopover,
  ],
  host: { "[attr.data-parts-render]": "renderSeen()" },
  template: `
    <button type="button" data-testid="nested-parts-attach" (click)="actions.update(increment)">
      Attach nested parts
    </button>
    <button ogCollapsibleTrigger data-testid="nested-collapsible-trigger">Nested details</button>
    <div
      ogCollapsiblePanel
      presenceObservation
      #panel="presenceObservation"
      class="motion"
      data-testid="nested-panel"
    >
      @if (panel.state.open()) {
        <p data-testid="nested-panel-child">Retained nested SSR child</p>
      }
    </div>
    <button ogPopoverTrigger ogPopoverAnchor data-testid="nested-popover-trigger">
      Nested parent popover trigger
    </button>
    <section
      ogPopoverContent
      #content="ogPopoverContent"
      class="surface motion"
      data-testid="nested-content"
    >
      @if (content.state.open()) {
        <button type="button" data-testid="nested-content-child">Retained popover child</button>
      }
      <!-- This logical child remains mounted across parent Presence exit; its own children stay gated. -->
      <section ogPopover [(open)]="childOpen" data-testid="nested-child-owner">
        <button ogPopoverTrigger ogPopoverAnchor data-testid="nested-child-trigger">
          Logical child
        </button>
        <section
          ogPopoverContent
          #child="ogPopoverContent"
          class="surface"
          data-testid="nested-child-content"
        >
          @if (child.state.open()) {
            <button type="button" data-testid="nested-child-action">Child action</button>
          }
        </section>
        <output data-testid="nested-child-intent">{{ childOpen() }}</output>
      </section>
    </section>
    <output data-testid="nested-parts-actions">{{ actions() }}</output>
  `,
  styles: `
    :host {
      display: block;
      color-scheme: dark;
    }
    .surface {
      width: 180px;
      height: 160px;
      padding: 8px;
      background: #222;
      color: #eee;
    }
    .motion[data-leaving] {
      animation: leave 800ms linear;
    }
    @keyframes leave {
      from {
        opacity: 1;
      }
      to {
        opacity: 0.1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .motion {
        animation: none !important;
      }
    }
  `,
})
export class NestedParts {
  readonly renderSeen = signal(false);
  readonly actions = signal(0);
  readonly childOpen = signal(true);
  readonly increment = (value: number): number => value + 1;

  constructor() {
    afterNextRender(() => this.renderSeen.set(true));
  }
}
