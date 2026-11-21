import { Component } from "@angular/core";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipTrigger,
} from "@loozo/origami-ui/tooltip";

@Component({
  selector: "bench-root, bench-tooltip",
  imports: [OrigamiTooltip, OrigamiTooltipTrigger, OrigamiTooltipContent],
  template: `
    <span ogTooltip>
      <button type="button" ogTooltipTrigger aria-label="Copy link">⧉</button>
      <span ogTooltipContent>Copies the address of this page</span>
    </span>
  `,
})
export class Workload {}
