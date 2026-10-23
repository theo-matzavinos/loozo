import { Component } from "@angular/core";
import { AlertDialogFixture } from "./alert-dialog.js";

@Component({
  selector: "acceptance-alert-dialog-deferred",
  imports: [AlertDialogFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-alert-dialog-fixture />
    } @placeholder {
      <p>Alert dialog fixture</p>
    }
  `,
})
export class AlertDialogDeferred {}
