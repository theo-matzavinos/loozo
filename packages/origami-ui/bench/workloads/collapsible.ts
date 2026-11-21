import { Component, signal } from "@angular/core";
import {
  OrigamiCollapsible,
  OrigamiCollapsiblePanel,
  OrigamiCollapsibleTrigger,
} from "@loozo/origami-ui/collapsible";

@Component({
  selector: "bench-root, bench-collapsible",
  imports: [OrigamiCollapsible, OrigamiCollapsibleTrigger, OrigamiCollapsiblePanel],
  template: `
    <section ogCollapsible [(expanded)]="expanded">
      <h2><button ogCollapsibleTrigger>Shipping details</button></h2>
      <div ogCollapsiblePanel role="region">
        <p>Ships in two working days.</p>
      </div>
    </section>
  `,
})
export class Workload {
  readonly expanded = signal(false);
}
