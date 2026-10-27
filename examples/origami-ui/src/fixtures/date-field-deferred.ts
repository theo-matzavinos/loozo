import { Component } from "@angular/core";
import { DateFieldFixture } from "./date-field.js";

@Component({
  selector: "acceptance-date-field-deferred",
  imports: [DateFieldFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-date-field-fixture />
    } @placeholder {
      <p>Date field fixture</p>
    }
  `,
})
export class DateFieldDeferred {}
