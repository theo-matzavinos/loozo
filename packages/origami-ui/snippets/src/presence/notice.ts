import { Component, model } from "@angular/core";
import { OrigamiPresence } from "@loozo/origami-ui/presence";

@Component({
  selector: "app-notice",
  imports: [OrigamiPresence],
  template: `
    <button type="button" (click)="visible.set(!visible())">Toggle notice</button>

    <div ogPresence #presence="ogPresence" [(present)]="visible" class="notice">
      @if (presence.state.open()) {
        <p>Saved. This paragraph stays rendered until the exit animation finishes.</p>
      }
    </div>
  `,
  styles: `
    .notice[data-entering] {
      animation: fade-in 150ms ease-out;
    }

    .notice[data-leaving] {
      animation: fade-out 150ms ease-in;
    }

    @media (prefers-reduced-motion: reduce) {
      .notice[data-entering],
      .notice[data-leaving] {
        animation: none;
      }
    }

    @keyframes fade-in {
      from {
        opacity: 0;
      }
    }

    @keyframes fade-out {
      to {
        opacity: 0;
      }
    }
  `,
})
export class Notice {
  readonly visible = model(false);
}
