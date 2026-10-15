import { Component, signal } from "@angular/core";
import { OrigamiToggle } from "@loozo/origami-ui/toggle";

@Component({
  selector: "app-mute",
  imports: [OrigamiToggle],
  template: `<button ogToggle class="mute" [(pressed)]="muted">Mute</button>`,
  styles: `
    .mute[data-pressed] {
      background: var(--accent);
    }
  `,
})
export class Mute {
  readonly muted = signal(false);
}
