import { Component } from "@angular/core";
import { PopoverFixture } from "./popover.js";

@Component({
  selector: "acceptance-popover-deferred",
  imports: [PopoverFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-popover-fixture />
    } @placeholder {
      <p>Popover fixture</p>
    }
  `,
})
export class PopoverDeferred {}
