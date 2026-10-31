import { DatePipe } from "@angular/common";
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
import {
  OrigamiDialog,
  OrigamiDialogClose,
  OrigamiDialogContent,
  OrigamiDialogTitle,
  OrigamiDialogTrigger,
} from "@loozo/origami-ui/dialog";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";

// The button shape inside a Dialog: the popup opens above the modal, and Escape closes the picker
// first, then the Dialog.
@Component({
  selector: "app-invoice-filters",
  imports: [
    DatePipe,
    OrigamiDialog,
    OrigamiDialogTrigger,
    OrigamiDialogContent,
    OrigamiDialogTitle,
    OrigamiDialogClose,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiDatePicker,
    OrigamiDatePickerTrigger,
    OrigamiDatePickerContent,
    OrigamiCalendar,
    OrigamiCalendarGrid,
    OrigamiCalendarCell,
    OrigamiCalendarHeading,
    OrigamiCalendarPrevious,
    OrigamiCalendarNext,
  ],
  template: `
    <div ogDialog>
      <button ogDialogTrigger>Filter invoices</button>
      <dialog ogDialogContent class="dialog">
        <h2 ogDialogTitle>Filter invoices</h2>
        <div ogField class="stack">
          <span ogFieldLabel>Issued from</span>
          <div ogDatePicker [(value)]="issuedFrom">
            <button ogDatePickerTrigger>
              @if (issuedFrom(); as day) {
                {{ day | date }}
              } @else {
                Choose a date
              }
            </button>
            <div ogDatePickerContent class="popup" [gap]="4">
              <div ogCalendar #cal="ogCalendar">
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
            </div>
          </div>
        </div>
        <button ogDialogClose class="close">Done</button>
      </dialog>
    </div>
    <p>Issued from: {{ issuedFrom() ?? "any day" }}</p>
  `,
  styles: `
    .dialog {
      box-sizing: border-box;
      inline-size: min(22rem, calc(100vw - 2rem));
      padding: 1rem;
      border: 1px solid var(--border, currentColor);
      border-radius: 8px;
      color: inherit;
      background: var(--background, Canvas);
    }

    .dialog::backdrop {
      background: rgb(0 0 0 / 0.4);
    }

    h2 {
      margin: 0 0 1rem;
      font-size: 1.25rem;
    }

    .stack {
      display: grid;
      gap: 0.25rem;
      justify-items: start;
    }

    .close {
      display: block;
      margin: 1rem 0 0 auto;
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
export class InvoiceFilters {
  readonly issuedFrom = signal<string | null>(null);
}
