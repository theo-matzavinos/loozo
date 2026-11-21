import { Component, ElementRef, afterNextRender, viewChild } from "@angular/core";
import {
  OrigamiPopover,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
  OrigamiPopoverTrigger,
} from "@loozo/origami-ui/popover";
import { installOpenProbe } from "./bench-probe";

// The popover scenario: short content, opened by a click on a Trigger that's also the Anchor.
@Component({
  selector: "bench-popover",
  imports: [OrigamiPopover, OrigamiPopoverTrigger, OrigamiPopoverAnchor, OrigamiPopoverContent],
  template: `
    <div ogPopover>
      <button #trigger id="trigger" ogPopoverTrigger ogPopoverAnchor>Open popover</button>
      <div #content id="content" ogPopoverContent side="block-end" align="start" [gap]="8">
        Positioned content
      </div>
    </div>
  `,
})
export class PopoverOpen {
  readonly trigger = viewChild.required("trigger", { read: ElementRef });
  readonly content = viewChild.required("content", { read: ElementRef });

  constructor() {
    afterNextRender(() => {
      installOpenProbe({
        trigger: this.trigger().nativeElement,
        content: this.content().nativeElement,
        input: "click",
      });
    });
  }
}
