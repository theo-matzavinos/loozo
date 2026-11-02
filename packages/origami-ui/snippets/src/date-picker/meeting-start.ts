import { Component, input, signal } from "@angular/core";
import { FormField, disabled, form, readonly } from "@angular/forms/signals";
import {
  OrigamiCalendar,
  OrigamiCalendarCell,
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiCalendarNext,
  OrigamiCalendarPrevious,
} from "@loozo/origami-ui/calendar";
import { OrigamiDateFieldInput, OrigamiDateFieldSegment } from "@loozo/origami-ui/date-field";
import {
  OrigamiDatePickerContent,
  OrigamiDatePickerTrigger,
  OrigamiDateTimePicker,
} from "@loozo/origami-ui/date-picker";
import { OrigamiField, OrigamiFieldError, OrigamiFieldLabel } from "@loozo/origami-ui/field";

// A date and time: type it into the segments, or choose the day from the Calendar and type the
// time. A choice keeps the time typed so far; with the time incomplete, focus moves to the first
// empty segment. Signal Forms owns the value and its disabled and readonly rules; the parse errors
// reach the same field.
@Component({
  selector: "app-meeting-start",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldError,
    OrigamiDateTimePicker,
    OrigamiDatePickerTrigger,
    OrigamiDatePickerContent,
    OrigamiDateFieldInput,
    OrigamiDateFieldSegment,
    OrigamiCalendar,
    OrigamiCalendarGrid,
    OrigamiCalendarCell,
    OrigamiCalendarHeading,
    OrigamiCalendarPrevious,
    OrigamiCalendarNext,
  ],
  template: `
    <div ogField #field="ogField" class="stack">
      <span ogFieldLabel>Meeting starts</span>
      <div
        ogDateTimePicker
        [formField]="meeting.startsAt"
        [locale]="locale()"
        [precision]="precision()"
        #picker="ogDateTimePicker"
      >
        <div ogDateFieldInput class="input">
          @for (part of picker.state.segments(); track part.key) {
            @if (part.type === "literal") {
              <span aria-hidden="true" class="literal">{{ part.text }}</span>
            } @else {
              <span [ogDateFieldSegment]="part.type"></span>
            }
          }
          <button ogDatePickerTrigger class="trigger" aria-label="Choose date">📅</button>
        </div>
        <div ogDatePickerContent class="popup" align="end" [gap]="4">
          <div ogCalendar [locale]="locale()" #cal="ogCalendar">
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
      @if (field.state.errorsShown()) {
        @switch (field.state.errors()[0]?.kind) {
          @case ("dateTimeIncomplete") {
            <p ogFieldError>Enter a complete date and time</p>
          }
          @case ("dateInvalid") {
            <p ogFieldError>This date doesn't exist</p>
          }
        }
      }
    </div>
    <p>Starts at: {{ model().startsAt ?? "none" }}</p>
  `,
  styles: `
    .stack {
      display: grid;
      gap: 0.25rem;
    }

    .input {
      display: flex;
      align-items: center;
      box-sizing: border-box;
      inline-size: min(100%, 22rem);
      padding: 0.25rem 0.25rem 0.25rem 0.6rem;
      border: 1px solid var(--border, currentColor);
      border-radius: 4px;
      font-variant-numeric: tabular-nums;
    }

    .input:focus-within {
      border-color: var(--focus, Highlight);
    }

    /* A flex item drops its edge spaces: keep the ", " between the date and the time. */
    .literal {
      white-space: pre;
    }

    [ogDateFieldSegment] {
      padding-inline: 0.1rem;
      border-radius: 2px;
    }

    [ogDateFieldSegment][data-placeholder] {
      color: var(--muted, inherit);
    }

    [ogDateFieldSegment]:focus {
      outline: none;
      background: var(--accent, Highlight);
      color: inherit;
    }

    .trigger {
      margin-inline-start: auto;
    }

    button {
      padding: 0.25rem 0.6rem;
      border: 1px solid var(--border, currentColor);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
    }

    button:disabled,
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

    td[data-disabled] {
      opacity: 0.35;
    }
  `,
})
export class MeetingStart {
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly locale = input<"en-US" | "en-GB" | "el">("en-US");
  readonly precision = input<"minute" | "second">("minute");

  readonly model = signal<{ startsAt: string | null }>({ startsAt: null });
  readonly meeting = form(this.model, (path) => {
    disabled(path.startsAt, () => this.disabled());
    readonly(path.startsAt, () => this.readonly());
  });
}
