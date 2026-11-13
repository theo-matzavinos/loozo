import { Component } from "@angular/core";
import { DialogSplitFixture } from "./dialog-split.js";

@Component({
  selector: "acceptance-dialog-split-deferred",
  imports: [DialogSplitFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-dialog-split-fixture />
    } @placeholder {
      <p>Split dialog fixture</p>
    }
  `,
})
export class DialogSplitDeferred {}
