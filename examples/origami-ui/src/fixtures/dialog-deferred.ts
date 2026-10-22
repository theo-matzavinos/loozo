import { Component } from "@angular/core";
import { DialogFixture } from "./dialog.js";

@Component({
  selector: "acceptance-dialog-deferred",
  imports: [DialogFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-dialog-fixture />
    } @placeholder {
      <p>Dialog fixture</p>
    }
  `,
})
export class DialogDeferred {}
