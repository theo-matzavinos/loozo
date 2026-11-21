import { Component, signal } from "@angular/core";
import { OrigamiPresence } from "@loozo/origami-ui/presence";

@Component({
  selector: "bench-root, bench-presence",
  imports: [OrigamiPresence],
  template: `
    <button type="button" (click)="visible.set(!visible())">Toggle notice</button>
    <div ogPresence #presence="ogPresence" [(present)]="visible">
      @if (presence.state.open()) {
        <p>Saved.</p>
      }
    </div>
  `,
})
export class Workload {
  readonly visible = signal(false);
}
