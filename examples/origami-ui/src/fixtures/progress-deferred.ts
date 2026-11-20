import { Component } from "@angular/core";
import { ProgressFixture } from "./progress.js";

@Component({
  selector: "acceptance-progress-deferred",
  imports: [ProgressFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-progress-fixture />
    } @placeholder {
      <p>Deferred progress</p>
    }
  `,
})
export class ProgressDeferred {}
