import { Component, signal } from "@angular/core";
import { OrigamiButton } from "@loozo/origami-ui/button";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipTrigger,
} from "@loozo/origami-ui/tooltip";

// A natively disabled button gets no hover or focus, so its Tooltip never opens. Kept focusable,
// the disabled button can explain why it's unavailable.
@Component({
  selector: "app-unavailable-action",
  imports: [OrigamiButton, OrigamiTooltip, OrigamiTooltipTrigger, OrigamiTooltipContent],
  template: `
    <span ogTooltip>
      <button
        ogButton
        ogTooltipTrigger
        [disabled]="!dirty()"
        focusableWhenDisabled
        (click)="publish()"
      >
        Publish
      </button>
      <span ogTooltipContent>
        @if (dirty()) {
          Publishes your changes
        } @else {
          Nothing to publish yet
        }
      </span>
    </span>
    <button type="button" (click)="dirty.set(true)">Edit</button>
  `,
})
export class UnavailableAction {
  readonly dirty = signal(false);

  publish(): void {
    if (!this.dirty()) {
      return;
    }

    this.dirty.set(false);
  }
}
