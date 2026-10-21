import { Component } from "@angular/core";
import { ToggleFixture } from "./toggle.js";

@Component({
  selector: "acceptance-toggle-deferred",
  imports: [ToggleFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-toggle-fixture />
    } @placeholder {
      <p>Toggle fixture</p>
    }
  `,
})
export class ToggleDeferred {}
