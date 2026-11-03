import { Component } from "@angular/core";
import { ToastFixture } from "./toast.js";

@Component({
  selector: "acceptance-toast-deferred",
  imports: [ToastFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-toast-fixture />
    } @placeholder {
      <p>Toast fixture</p>
    }
  `,
})
export class ToastDeferred {}
