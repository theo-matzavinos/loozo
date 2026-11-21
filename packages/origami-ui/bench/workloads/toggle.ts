import { Component, signal } from "@angular/core";
import { OrigamiToggle } from "@loozo/origami-ui/toggle";

@Component({
  selector: "bench-root, bench-toggle",
  imports: [OrigamiToggle],
  template: `<button ogToggle [(checked)]="muted">Mute</button>`,
})
export class Workload {
  readonly muted = signal(false);
}
