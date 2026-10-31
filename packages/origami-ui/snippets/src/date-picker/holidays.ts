import { Component, signal } from "@angular/core";
import { OrigamiButton } from "@loozo/origami-ui/button";
import {
  OrigamiCalendarCell,
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiCalendarMultiple,
  OrigamiCalendarNext,
  OrigamiCalendarPrevious,
} from "@loozo/origami-ui/calendar";
import {
  OrigamiDatePickerContent,
  OrigamiDatePickerMultiple,
  OrigamiDatePickerTrigger,
} from "@loozo/origami-ui/date-picker";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";

// Several days: a click toggles a day and the popup stays open, so Done closes it by writing `open`.
@Component({
  selector: "app-holidays",
  imports: [
    OrigamiButton,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiDatePickerMultiple,
    OrigamiDatePickerTrigger,
    OrigamiDatePickerContent,
    OrigamiCalendarMultiple,
    OrigamiCalendarGrid,
    OrigamiCalendarCell,
    OrigamiCalendarHeading,
    OrigamiCalendarPrevious,
    OrigamiCalendarNext,
  ],
  template: `
    <div ogField class="stack">
      <span ogFieldLabel>Holidays</span>
      <div ogDatePickerMultiple [(value)]="holidays" [(open)]="open">
        <button ogDatePickerTrigger>
          @switch (holidays().length) {
            @case (0) {
              Choose days
            }
            @case (1) {
              1 day
            }
            @default {
              {{ holidays().length }} days
            }
          }
        </button>
        <div ogDatePickerContent class="popup" [gap]="4">
          <div ogCalendarMultiple #cal="ogCalendarMultiple">
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
          </div>
          <button ogButton class="done" (click)="open.set(false)">Done</button>
        </div>
      </div>
    </div>
    <p>Holidays: {{ holidays().join(", ") || "none" }}</p>
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

    .popup:popover-open {
      display: grid;
      gap: 0.5rem;
    }

    .done {
      justify-self: end;
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

    td[data-outside]:not([data-selected]) {
      color: var(--muted, inherit);
    }
  `,
})
export class Holidays {
  readonly holidays = signal<readonly string[]>([]);
  readonly open = signal(false);
}
