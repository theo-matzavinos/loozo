import { Component, input, signal } from "@angular/core";
import {
  OrigamiCalendar,
  OrigamiCalendarCell,
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiCalendarNext,
  OrigamiCalendarPrevious,
} from "@loozo/origami-ui/calendar";

// A birth date in three choices: the heading button shows the years, a year its months and a
// month its days.
@Component({
  selector: "app-date-of-birth",
  imports: [
    OrigamiCalendar,
    OrigamiCalendarGrid,
    OrigamiCalendarCell,
    OrigamiCalendarHeading,
    OrigamiCalendarPrevious,
    OrigamiCalendarNext,
  ],
  template: `
    <div
      ogCalendar
      class="calendar"
      [(value)]="birthDate"
      [(view)]="view"
      [disabled]="disabled()"
      [readonly]="readonly()"
      [fixedWeeks]="fixedWeeks()"
      [weekStart]="weekStarts[weekStart()]"
      [locale]="locale()"
      #cal="ogCalendar"
    >
      <header>
        <button ogCalendarPrevious [attr.aria-label]="labels[cal.state.view()].previous">‹</button>
        <button
          type="button"
          class="view-switch"
          [disabled]="disabled()"
          (click)="view.set(cal.state.view() === 'days' ? 'years' : 'days')"
        >
          <span ogCalendarHeading>{{ cal.state.heading() }}</span>
        </button>
        <button ogCalendarNext [attr.aria-label]="labels[cal.state.view()].next">›</button>
      </header>
      <table ogCalendarGrid>
        @switch (cal.state.view()) {
          @case ("days") {
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
          }
          @case ("months") {
            <tbody>
              @for (row of cal.state.months(); track $index) {
                <tr>
                  @for (month of row; track month.date) {
                    <td ogCalendarCell [date]="month.date">{{ month.label }}</td>
                  }
                </tr>
              }
            </tbody>
          }
          @case ("years") {
            <tbody>
              @for (row of cal.state.years(); track $index) {
                <tr>
                  @for (year of row; track year.date) {
                    <td ogCalendarCell [date]="year.date">{{ year.label }}</td>
                  }
                </tr>
              }
            </tbody>
          }
        }
      </table>
    </div>
    <p>Date of birth: {{ birthDate() ?? "none" }}</p>
  `,
  styles: `
    .calendar {
      inline-size: min(100%, 18rem);
    }

    header {
      display: flex;
      gap: 0.25rem;
      align-items: center;
      margin-block-end: 0.5rem;
    }

    button {
      padding: 0.25rem 0.6rem;
      border: 1px solid var(--border, currentColor);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
    }

    .view-switch {
      flex: 1;
      font-weight: 600;
    }

    button[data-disabled],
    button:disabled {
      opacity: 0.4;
    }

    table {
      inline-size: 100%;
      table-layout: fixed;
      border-collapse: collapse;
    }

    th {
      padding-block: 0.25rem;
      color: var(--muted, inherit);
      font-size: 0.75rem;
      font-weight: 600;
    }

    td {
      block-size: 2.25rem;
      border-radius: 4px;
      text-align: center;
      cursor: default;
    }

    td:hover,
    td[data-current] {
      background: color-mix(in srgb, currentColor 12%, transparent);
    }

    td:focus-visible {
      outline: 2px solid var(--focus, Highlight);
      outline-offset: -2px;
    }

    td[data-today] {
      box-shadow: inset 0 0 0 1px currentColor;
    }

    td[data-selected] {
      background: var(--accent, Highlight);
      font-weight: 600;
    }

    td[data-outside] {
      opacity: 0.5;
    }

    td[data-disabled] {
      opacity: 0.35;
    }
  `,
})
export class DateOfBirth {
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly fixedWeeks = input(false);
  readonly weekStart = input<"locale" | "monday" | "sunday">("locale");
  readonly locale = input<"en-US" | "en-GB" | "el">("en-US");

  readonly birthDate = signal<string | null>(null);
  readonly view = signal<"days" | "months" | "years">("days");
  readonly weekStarts = { locale: null, monday: 1, sunday: 7 } as const;
  readonly labels = {
    days: { previous: "Previous month", next: "Next month" },
    months: { previous: "Previous year", next: "Next year" },
    years: { previous: "Previous 12 years", next: "Next 12 years" },
  };
}
