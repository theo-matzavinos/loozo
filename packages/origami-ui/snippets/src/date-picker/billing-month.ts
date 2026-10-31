import { DatePipe } from "@angular/common";
import { Component, signal } from "@angular/core";
import {
  OrigamiCalendarCell,
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiCalendarNext,
  OrigamiCalendarPrevious,
  OrigamiMonthCalendar,
} from "@loozo/origami-ui/calendar";
import {
  OrigamiDatePickerContent,
  OrigamiDatePickerTrigger,
  OrigamiMonthPicker,
} from "@loozo/origami-ui/date-picker";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";

// A month: Previous and Next step a year, and choosing a month closes the popup.
@Component({
  selector: "app-billing-month",
  imports: [
    DatePipe,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiMonthPicker,
    OrigamiDatePickerTrigger,
    OrigamiDatePickerContent,
    OrigamiMonthCalendar,
    OrigamiCalendarGrid,
    OrigamiCalendarCell,
    OrigamiCalendarHeading,
    OrigamiCalendarPrevious,
    OrigamiCalendarNext,
  ],
  template: `
    <div ogField class="stack">
      <span ogFieldLabel>Billing month</span>
      <div ogMonthPicker [(value)]="month">
        <button ogDatePickerTrigger>
          @if (month(); as month) {
            {{ month | date: "MMMM y" }}
          } @else {
            Choose a month
          }
        </button>
        <div ogDatePickerContent class="popup" [gap]="4">
          <div ogMonthCalendar #cal="ogMonthCalendar">
            <header>
              <button ogCalendarPrevious aria-label="Previous year">‹</button>
              <h3 ogCalendarHeading>{{ cal.state.heading() }}</h3>
              <button ogCalendarNext aria-label="Next year">›</button>
            </header>
            <table ogCalendarGrid>
              <tbody>
                @for (row of cal.state.months(); track $index) {
                  <tr>
                    @for (month of row; track month.date) {
                      <td ogCalendarCell [date]="month.date">{{ month.label }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    <p>Billing month: {{ month() ?? "none" }}</p>
  `,
  styles: `
    .stack {
      display: grid;
      gap: 0.25rem;
      justify-items: start;
    }

    button {
      padding: 0.25rem 0.6rem;
      border: 1px solid var(--border, currentColor);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
    }

    button[data-disabled] {
      opacity: 0.4;
    }

    .popup {
      box-sizing: border-box;
      inline-size: min(16rem, calc(100vw - 2rem));
      max-block-size: var(--og-available-height);
      overflow-y: auto;
      padding: 0.75rem;
      border: 1px solid var(--border, currentColor);
      border-radius: 6px;
      color: inherit;
      background: var(--surface, Canvas);
    }

    header {
      display: flex;
      gap: 0.25rem;
      align-items: center;
      margin-block-end: 0.5rem;
    }

    h3 {
      flex: 1;
      margin: 0;
      font-size: 1rem;
      text-align: center;
    }

    table {
      inline-size: 100%;
      table-layout: fixed;
      border-collapse: collapse;
    }

    td {
      block-size: 2.5rem;
      border-radius: 4px;
      text-align: center;
      cursor: default;
    }

    td:hover {
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
  `,
})
export class BillingMonth {
  readonly month = signal<string | null>(null);
}
