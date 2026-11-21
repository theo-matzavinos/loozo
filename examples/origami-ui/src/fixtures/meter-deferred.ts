import { Component } from "@angular/core";
import { MeterFixture } from "./meter.js";

@Component({
  selector: "acceptance-meter-deferred",
  imports: [MeterFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-meter-fixture />
    } @placeholder {
      <p>Deferred meter</p>
    }
  `,
})
export class MeterDeferred {}
