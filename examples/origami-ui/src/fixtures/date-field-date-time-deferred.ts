import { Component } from "@angular/core";
import { DateTimeFieldFixture } from "./date-field-date-time.js";

@Component({
  selector: "acceptance-date-time-field-deferred",
  imports: [DateTimeFieldFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-date-time-field-fixture />
    } @placeholder {
      <p>Date-time field fixture</p>
    }
  `,
})
export class DateTimeFieldDeferred {}
