import { Component } from "@angular/core";
import { TimeFieldFixture } from "./date-field-time.js";

@Component({
  selector: "acceptance-time-field-deferred",
  imports: [TimeFieldFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-time-field-fixture />
    } @placeholder {
      <p>Time field fixture</p>
    }
  `,
})
export class TimeFieldDeferred {}
