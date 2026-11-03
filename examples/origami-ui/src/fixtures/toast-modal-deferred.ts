import { Component } from "@angular/core";
import { ToastModalFixture } from "./toast-modal.js";

@Component({
  selector: "acceptance-toast-modal-deferred",
  imports: [ToastModalFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-toast-modal-fixture />
    } @placeholder {
      <p>Toast modal fixture</p>
    }
  `,
})
export class ToastModalDeferred {}
