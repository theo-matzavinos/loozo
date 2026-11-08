import { Component, signal } from "@angular/core";
import {
  OrigamiCalendar,
  OrigamiCalendarCell,
  OrigamiCalendarGrid,
  OrigamiCalendarMultiple,
  OrigamiCalendarRange,
  OrigamiMonthCalendar,
} from "@loozo/origami-ui/calendar";
import { CalendarDayRows } from "./calendar-selection.js";
import { CalendarViewRows } from "./calendar-views.js";

// Calendar case CA50: the selected description of each root. Controls the tests use as script
// actions are buttons; every cell carries its date as `data-date`, so a test can find it.

/**
 * `ogCalendar` SD, whose cells carry a static `aria-describedby`, and `ogCalendarMultiple` SM,
 * `ogCalendarRange` SR and `ogMonthCalendar` SMC, each with `selectedDescription="selected"`.
 */
@Component({
  selector: "calendar-described-cases",
  imports: [
    OrigamiCalendar,
    OrigamiCalendarMultiple,
    OrigamiCalendarRange,
    OrigamiMonthCalendar,
    OrigamiCalendarGrid,
    OrigamiCalendarCell,
    CalendarDayRows,
    CalendarViewRows,
  ],
  template: `
    <section>
      <h2>Selected description</h2>
      <p id="sd-note">Bookable</p>
      <div
        ogCalendar
        #sd="ogCalendar"
        data-testid="sd-root"
        today="2026-10-27"
        locale="en-US"
        [(value)]="sdValue"
        [selectedDescription]="sdText()"
      >
        <table ogCalendarGrid data-testid="sd-grid">
          <tbody>
            @for (week of sd.state.weeks(); track $index) {
              <tr>
                @for (day of week; track day.date) {
                  <td
                    ogCalendarCell
                    aria-describedby="sd-note"
                    [date]="day.date"
                    [attr.data-date]="day.date"
                  >
                    {{ day.label }}
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
      <button type="button" data-testid="sd-clear-text" (click)="sdText.set('')">
        Clear the selected description
      </button>

      <div
        ogCalendarMultiple
        #sm="ogCalendarMultiple"
        data-testid="sm-root"
        today="2026-10-27"
        locale="en-US"
        selectedDescription="selected"
        [value]="smValue"
      >
        <table
          ogCalendarGrid
          calendarDayRows
          data-testid="sm-grid"
          [weekdays]="sm.state.weekdays()"
          [weeks]="sm.state.weeks()"
        ></table>
      </div>

      <div
        ogCalendarRange
        #sr="ogCalendarRange"
        data-testid="sr-root"
        today="2026-10-27"
        locale="en-US"
        selectedDescription="selected"
        [value]="srValue"
      >
        <table
          ogCalendarGrid
          calendarDayRows
          data-testid="sr-grid"
          [weekdays]="sr.state.weekdays()"
          [weeks]="sr.state.weeks()"
        ></table>
      </div>

      <div
        ogMonthCalendar
        #smc="ogMonthCalendar"
        data-testid="smc-root"
        today="2026-10-27"
        locale="en-US"
        value="2026-05"
        selectedDescription="selected"
      >
        <table
          ogCalendarGrid
          calendarViewRows
          data-testid="smc-grid"
          [view]="smc.state.view()"
          [months]="smc.state.months()"
          [years]="smc.state.years()"
        ></table>
      </div>
    </section>
  `,
})
export class CalendarDescribedCases {
  readonly sdValue = signal<string | null>("2026-10-15");
  readonly sdText = signal("selected");
  readonly smValue: readonly string[] = ["2026-10-06", "2026-10-20"];
  readonly srValue = { start: "2026-10-12", end: "2026-10-16" };
}
