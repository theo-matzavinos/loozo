import { Component, afterNextRender, signal } from "@angular/core";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipTrigger,
} from "@loozo/origami-ui/tooltip";

/** N14: a Tooltip whose block hydrates on hover. Imported only through that deferred template. */
@Component({
  selector: "acceptance-hover-tooltip",
  imports: [OrigamiTooltip, OrigamiTooltipTrigger, OrigamiTooltipContent],
  host: { "[attr.data-client-render-seen]": "clientRenderSeen()" },
  template: `
    <span ogTooltip [(open)]="open" [openDelay]="150">
      <button
        type="button"
        ogTooltipTrigger
        aria-label="Settings"
        data-testid="hover-hydration-trigger"
      >
        S
      </button>
      <span ogTooltipContent side="inline-end" [gap]="8" data-testid="hover-hydration-content">
        Open the settings
      </span>
    </span>
    <output data-testid="hover-hydration-intent">{{ open() }}</output>
  `,
})
export class HoverTooltip {
  readonly open = signal(false);
  readonly clientRenderSeen = signal(false);

  constructor() {
    afterNextRender({ write: () => this.clientRenderSeen.set(true) });
  }
}
