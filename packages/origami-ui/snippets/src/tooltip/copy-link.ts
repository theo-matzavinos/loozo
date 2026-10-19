import { Component, input } from "@angular/core";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipTrigger,
  type OrigamiTooltipSide,
} from "@loozo/origami-ui/tooltip";

// The button's name comes from aria-label; the Tooltip adds a description instead of repeating it.
@Component({
  selector: "app-copy-link",
  imports: [OrigamiTooltip, OrigamiTooltipTrigger, OrigamiTooltipContent],
  template: `
    <span ogTooltip [openDelay]="openDelay()">
      <button type="button" ogTooltipTrigger aria-label="Copy link">
        <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16">
          <path
            d="M6 10 10 6M5 7 3.5 8.5a2.5 2.5 0 0 0 3.5 3.5L8.5 10.5M11 9l1.5-1.5a2.5 2.5 0 0 0-3.5-3.5L7.5 5.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          />
        </svg>
      </button>
      <span ogTooltipContent class="hint" [side]="side()" [gap]="6"
        >Copies the address of this page</span
      >
    </span>
  `,
  styles: `
    .hint {
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      background: #2b2b2b;
      color: #eeeeee;
      font-size: 0.8125rem;
      white-space: nowrap;
    }

    .hint[data-entering] {
      animation: fade 100ms ease-out;
    }

    @keyframes fade {
      from {
        opacity: 0;
      }
    }
  `,
})
export class CopyLink {
  readonly openDelay = input(600);
  readonly side = input<OrigamiTooltipSide>("block-start");
}
