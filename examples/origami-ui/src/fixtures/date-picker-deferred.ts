import { Component } from "@angular/core";
import { DatePickerFixture } from "./date-picker.js";

@Component({
  selector: "acceptance-date-picker-deferred",
  imports: [DatePickerFixture],
  template: `
    @defer (hydrate on interaction) {
      <date-picker-fixture />
    } @placeholder {
      <p>Date picker fixture</p>
    }
  `,
})
export class DatePickerDeferred {}
