import { DatePipe } from "@angular/common";
import { Component, signal } from "@angular/core";
import {
  OrigamiCalendarCell,
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiCalendarNext,
  OrigamiCalendarPrevious,
  OrigamiCalendarRange,
  type OrigamiDateRange,
} from "@loozo/origami-ui/calendar";
import {
  OrigamiDatePickerContent,
  OrigamiDatePickerRange,
  OrigamiDatePickerTrigger,
} from "@loozo/origami-ui/date-picker";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";

// A range: the first day stays open with a hint, the last day writes the range and closes.
@Component({
  selector: "app-stay",
  imports: [
    DatePipe,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiDatePickerRange,
    OrigamiDatePickerTrigger,
    OrigamiDatePickerContent,
    OrigamiCalendarRange,
    OrigamiCalendarGrid,
    OrigamiCalendarCell,
    OrigamiCalendarHeading,
    OrigamiCalendarPrevious,
    OrigamiCalendarNext,
  ],
  template: `
    <div ogField class="stack">
      <span ogFieldLabel>Stay</span>
      <div ogDatePickerRange [(value)]="stay">
        <button ogDatePickerTrigger>
          @if (stay(); as range) {
            {{ range.start | date }} – {{ range.end | date }}
          } @else {
            Choose dates
          }
        </button>
        <div ogDatePickerContent class="popup" [gap]="4">
          <div ogCalendarRange #cal="ogCalendarRange">
            <header>
              <button ogCalendarPrevious aria-label="Previous month">‹</button>
              <h3 ogCalendarHeading>{{ cal.state.heading() }}</h3>
              <button ogCalendarNext aria-label="Next month">›</button>
            </header>
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
            <p class="hint" aria-live="polite">
              {{ cal.state.anchor() ? "Choose the last day" : "Choose the first day" }}
            </p>
          </div>
        </div>
      </div>
    </div>
    <p>
      Stay:
      @if (stay(); as range) {
        {{ range.start }} to {{ range.end }}
      } @else {
        none
      }
    </p>
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
      inline-size: min(18rem, calc(100vw - 2rem));
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

    th {
      padding-block: 0.25rem;
      color: var(--muted, inherit);
      font-size: 0.75rem;
      font-weight: 600;
    }

    td {
      block-size: 2.25rem;
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

    td[data-in-range],
    td[data-preview] {
      background: color-mix(in srgb, var(--accent, Highlight) 50%, transparent);
    }

    td[data-range-start],
    td[data-range-end] {
      background: var(--accent, Highlight);
      font-weight: 600;
    }

    td[data-outside]:not([data-selected]) {
      color: var(--muted, inherit);
    }

    .hint {
      margin: 0.5rem 0 0;
      color: var(--muted, inherit);
      font-size: 0.875rem;
    }
  `,
})
export class Stay {
  readonly stay = signal<OrigamiDateRange | null>(null);
}
