import { Component, signal } from "@angular/core";
import { OrigamiMeter } from "@loozo/origami-ui/meter";

@Component({
  selector: "bench-root, bench-meter",
  imports: [OrigamiMeter],
  template: `
    <h3 id="arrivals-title">Arrivals</h3>
    <div ogMeter #gauge="ogMeter" [value]="share()" aria-labelledby="arrivals-title">
      <span aria-hidden="true">{{ gauge.state.valueText() }}</span>
    </div>
    <button type="button" (click)="share.set(share() === 75 ? 25 : 75)">Next period</button>
  `,
})
export class Workload {
  readonly share = signal(75);
}
