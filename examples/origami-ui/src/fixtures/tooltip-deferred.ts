import { Component } from "@angular/core";
import { TooltipFixture } from "./tooltip.js";

@Component({
  selector: "acceptance-tooltip-deferred",
  imports: [TooltipFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-tooltip-fixture />
    } @placeholder {
      <p>Tooltip fixture</p>
    }
  `,
})
export class TooltipDeferred {}
