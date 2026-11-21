import { Component, signal } from "@angular/core";
import {
  OrigamiPopover,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
  OrigamiPopoverTrigger,
} from "@loozo/origami-ui/popover";

@Component({
  selector: "bench-root, bench-popover",
  imports: [OrigamiPopover, OrigamiPopoverTrigger, OrigamiPopoverAnchor, OrigamiPopoverContent],
  template: `
    <div ogPopover [(open)]="open">
      <button ogPopoverTrigger ogPopoverAnchor>Choose task</button>
      <div ogPopoverContent #content="ogPopoverContent" role="group" aria-label="Tasks">
        @if (content.state.open()) {
          <button type="button">Review</button>
          <button type="button">Archive</button>
        }
      </div>
    </div>
  `,
})
export class Workload {
  readonly open = signal(false);
}
