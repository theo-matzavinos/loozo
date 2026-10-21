import { Component, input, model } from "@angular/core";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";
import { OrigamiSwitch } from "@loozo/origami-ui/switch";

// An on/off setting that applies at once; a Field Label gives the Switch its name.
@Component({
  selector: "app-notifications",
  imports: [OrigamiSwitch, OrigamiField, OrigamiFieldLabel],
  template: `
    <div ogField class="row">
      <label ogFieldLabel>Order notifications</label>
      <button ogSwitch class="track" [(checked)]="enabled" [disabled]="disabled()">
        <span class="thumb"></span>
      </button>
    </div>
  `,
  styles: `
    .row {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    .track {
      display: inline-flex;
      inline-size: 2.5rem;
      block-size: 1.5rem;
      padding: 2px;
      border: 1px solid currentColor;
      border-radius: 999px;
      background: none;
      color: inherit;
    }

    .track[data-checked] {
      justify-content: flex-end;
      background: var(--accent);
    }

    .thumb {
      inline-size: 1.125rem;
      border-radius: 50%;
      background: currentColor;
    }
  `,
})
export class Notifications {
  readonly enabled = model(true);
  readonly disabled = input(false);
}
