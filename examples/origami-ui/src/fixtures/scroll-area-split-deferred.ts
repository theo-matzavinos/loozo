import { Component } from "@angular/core";
import { ScrollAreaSplitFixture } from "./scroll-area-split.js";

@Component({
  selector: "acceptance-scroll-area-split-deferred",
  imports: [ScrollAreaSplitFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-scroll-area-split-fixture />
    } @placeholder {
      <p>Split scroll area fixture</p>
    }
  `,
})
export class ScrollAreaSplitDeferred {}
