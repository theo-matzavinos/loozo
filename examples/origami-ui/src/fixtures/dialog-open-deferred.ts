import { Component } from "@angular/core";
import { DialogOpenFixture } from "./dialog-open.js";

@Component({
  selector: "acceptance-dialog-open-deferred",
  imports: [DialogOpenFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-dialog-open-fixture />
    } @placeholder {
      <p>Open dialog fixture</p>
    }
  `,
})
export class DialogOpenDeferred {}
