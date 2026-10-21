import { Component } from "@angular/core";
import { SwitchFixture } from "./switch.js";

@Component({
  selector: "acceptance-switch-deferred",
  imports: [SwitchFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-switch-fixture />
    } @placeholder {
      <p>Switch fixture</p>
    }
  `,
})
export class SwitchDeferred {}
