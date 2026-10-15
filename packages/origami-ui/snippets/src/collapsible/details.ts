import { Component, signal } from "@angular/core";
import {
  OrigamiCollapsible,
  OrigamiCollapsiblePanel,
  OrigamiCollapsibleTrigger,
} from "@loozo/origami-ui/collapsible";

@Component({
  selector: "app-details",
  imports: [OrigamiCollapsible, OrigamiCollapsibleTrigger, OrigamiCollapsiblePanel],
  template: `
    <section ogCollapsible [(expanded)]="expanded">
      <h2><button ogCollapsibleTrigger>Shipping details</button></h2>
      <div ogCollapsiblePanel role="region" class="panel">
        <p>Ships in two working days.</p>
      </div>
    </section>
  `,
  styles: `
    .panel[data-entering] {
      animation: reveal 200ms ease-out;
    }

    .panel[data-leaving] {
      animation: reveal 200ms ease-in reverse;
    }

    @keyframes reveal {
      from {
        opacity: 0;
        translate: 0 -0.5rem;
      }
    }
  `,
})
export class Details {
  readonly expanded = signal(false);
}
