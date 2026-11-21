import { Component, ElementRef, afterNextRender, viewChild } from "@angular/core";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipTrigger,
} from "@loozo/origami-ui/tooltip";
import { installOpenProbe } from "./bench-probe";

// The tooltip scenario: no open delay, opened by focusing the Trigger and closed by focusing
// #blur, so it measures positioning and reveal, not the configured delay.
@Component({
  selector: "bench-tooltip",
  imports: [OrigamiTooltip, OrigamiTooltipTrigger, OrigamiTooltipContent],
  template: `
    <div ogTooltip [openDelay]="0">
      <button #trigger id="trigger" type="button" ogTooltipTrigger>Focus tooltip</button>
      <div #content id="content" ogTooltipContent side="block-end" align="start" [gap]="8">
        Tooltip content
      </div>
    </div>
    <button id="blur" type="button">Blur</button>
  `,
})
export class TooltipOpen {
  readonly trigger = viewChild.required("trigger", { read: ElementRef });
  readonly content = viewChild.required("content", { read: ElementRef });

  constructor() {
    afterNextRender(() => {
      installOpenProbe({
        trigger: this.trigger().nativeElement,
        content: this.content().nativeElement,
        input: "focusin",
      });
    });
  }
}
