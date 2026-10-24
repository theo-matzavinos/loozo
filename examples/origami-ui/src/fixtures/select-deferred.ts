import { Component } from "@angular/core";
import { SelectFixture } from "./select.js";

@Component({
  selector: "acceptance-select-deferred",
  imports: [SelectFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-select-fixture />
    } @placeholder {
      <p>Select fixture</p>
    }
  `,
})
export class SelectDeferred {}
