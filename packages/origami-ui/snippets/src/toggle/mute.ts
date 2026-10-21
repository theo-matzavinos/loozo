import { Component, input, model } from "@angular/core";
import { OrigamiToggle } from "@loozo/origami-ui/toggle";

@Component({
  selector: "app-mute",
  imports: [OrigamiToggle],
  template: `<button ogToggle class="mute" [(checked)]="muted" [disabled]="disabled()">
    Mute
  </button>`,
  styles: `
    .mute[data-pressed] {
      background: var(--accent);
    }
  `,
})
export class Mute {
  readonly muted = model(false);
  readonly disabled = input(false);
}
