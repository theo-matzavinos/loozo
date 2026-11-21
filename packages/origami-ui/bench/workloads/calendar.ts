import { Component, signal } from "@angular/core";
import {
  OrigamiCalendar,
  OrigamiCalendarCell,
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiCalendarNext,
  OrigamiCalendarPrevious,
} from "@loozo/origami-ui/calendar";

@Component({
  selector: "bench-root, bench-calendar",
  imports: [
    OrigamiCalendar,
    OrigamiCalendarCell,
    OrigamiCalendarGrid,
    OrigamiCalendarHeading,
    OrigamiCalendarNext,
    OrigamiCalendarPrevious,
  ],
  template: `
    <div ogCalendar [(value)]="date" #cal="ogCalendar">
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
    <p>Date: {{ date() ?? "none" }}</p>
  `,
})
export class Workload {
  readonly date = signal<string | null>(null);
}
