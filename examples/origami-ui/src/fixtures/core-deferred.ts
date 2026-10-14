import { Component } from "@angular/core";
import { CoreFixture } from "./core.js";

@Component({
  selector: "acceptance-core-deferred",
  imports: [CoreFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-core-fixture />
    } @placeholder {
      <p>Core fixture</p>
    }
  `,
})
export class CoreDeferred {}
