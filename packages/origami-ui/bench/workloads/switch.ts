import { Component, signal } from "@angular/core";
import { OrigamiSwitch } from "@loozo/origami-ui/switch";

@Component({
  selector: "bench-root, bench-switch",
  imports: [OrigamiSwitch],
  template: `
    <button ogSwitch [(checked)]="enabled" aria-label="Order notifications">
      <span></span>
    </button>
  `,
})
export class Workload {
  readonly enabled = signal(true);
}
