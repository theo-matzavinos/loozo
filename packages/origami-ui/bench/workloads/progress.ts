import { Component, signal } from "@angular/core";
import { OrigamiProgress } from "@loozo/origami-ui/progress";

@Component({
  selector: "bench-root, bench-progress",
  imports: [OrigamiProgress],
  template: `
    <h3 id="schedule-title">Change schedule</h3>
    <div ogProgress #bar="ogProgress" [value]="step()" [max]="3" aria-labelledby="schedule-title">
      <span></span>
    </div>
    <p aria-hidden="true">{{ bar.state.valueText() }}</p>
    <button type="button" (click)="step.set(step() + 1)" [disabled]="step() >= 3">Next</button>
  `,
})
export class Workload {
  readonly step = signal(1);
}
