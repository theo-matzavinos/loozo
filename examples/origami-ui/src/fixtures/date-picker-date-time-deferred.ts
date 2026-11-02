import { Component } from "@angular/core";
import { DatePickerDateTimeFixture } from "./date-picker-date-time.js";

@Component({
  selector: "acceptance-date-picker-date-time-deferred",
  imports: [DatePickerDateTimeFixture],
  template: `
    @defer (hydrate on interaction) {
      <date-picker-date-time-fixture />
    } @placeholder {
      <p>Date-time picker fixture</p>
    }
  `,
})
export class DatePickerDateTimeDeferred {}
