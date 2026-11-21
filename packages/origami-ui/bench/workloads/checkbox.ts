import { Component, signal } from "@angular/core";
import { OrigamiCheckbox } from "@loozo/origami-ui/checkbox";

@Component({
  selector: "bench-root, bench-checkbox",
  imports: [OrigamiCheckbox],
  template: `
    <button ogCheckbox [(checked)]="accepted" aria-label="I accept the terms"></button>
    <p>Accepted: {{ accepted() }}</p>
  `,
})
export class Workload {
  readonly accepted = signal(false);
}
