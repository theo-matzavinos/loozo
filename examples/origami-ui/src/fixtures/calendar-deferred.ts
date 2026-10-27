import { Component } from "@angular/core";
import { CalendarFixture } from "./calendar.js";

@Component({
  selector: "acceptance-calendar-deferred",
  imports: [CalendarFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-calendar-fixture />
    } @placeholder {
      <p>Calendar fixture</p>
    }
  `,
})
export class CalendarDeferred {}
