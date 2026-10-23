import { Component } from "@angular/core";
import { DialogOpenerFixture } from "./dialog-opener.js";

@Component({
  selector: "acceptance-dialog-opener-deferred",
  imports: [DialogOpenerFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-dialog-opener-fixture />
    } @placeholder {
      <p>Dialog opener fixture</p>
    }
  `,
})
export class DialogOpenerDeferred {}
