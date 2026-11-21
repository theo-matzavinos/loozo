import { Component, signal } from "@angular/core";
import {
  OrigamiCalendar,
  OrigamiCalendarCell,
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiCalendarNext,
  OrigamiCalendarPrevious,
} from "@loozo/origami-ui/calendar";
import {
  OrigamiDatePicker,
  OrigamiDatePickerContent,
  OrigamiDatePickerTrigger,
} from "@loozo/origami-ui/date-picker";

// The README's button shape without the optional Field. Calendar is a declared companion
// (bench/build-workloads.mjs): a working picker renders one, with the full grid.
@Component({
  selector: "bench-root, bench-date-picker",
  imports: [
    OrigamiDatePicker,
    OrigamiDatePickerTrigger,
    OrigamiDatePickerContent,
    OrigamiCalendar,
    OrigamiCalendarCell,
    OrigamiCalendarGrid,
    OrigamiCalendarHeading,
    OrigamiCalendarNext,
    OrigamiCalendarPrevious,
  ],
  template: `
    <div ogDatePicker [(value)]="value" #picker="ogDatePicker">
      <button ogDatePickerTrigger>{{ picker.state.value() ?? "Choose a date" }}</button>
      <div ogDatePickerContent>
        <div ogCalendar #cal="ogCalendar">
          <button ogCalendarPrevious aria-label="Previous month">‹</button>
          <h2 ogCalendarHeading>{{ cal.state.heading() }}</h2>
          <button ogCalendarNext aria-label="Next month">›</button>
          <table ogCalendarGrid>
            <thead>
              <tr>
                @for (weekday of cal.state.weekdays(); track $index) {
                  <th scope="col" [attr.abbr]="weekday.long">{{ weekday.short }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (week of cal.state.weeks(); track $index) {
                <tr>
                  @for (day of week; track day.date) {
                    <td ogCalendarCell [date]="day.date">{{ day.label }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <p>Value: {{ value() }}</p>
  `,
})
export class Workload {
  readonly value = signal<string | null>("2026-10-27");
}
