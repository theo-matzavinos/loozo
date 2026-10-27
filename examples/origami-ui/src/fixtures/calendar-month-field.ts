import { Component, signal } from "@angular/core";
import { FormField, disabled, form, readonly, required } from "@angular/forms/signals";
import {
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiMonthCalendar,
} from "@loozo/origami-ui/calendar";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";
import { CalendarViewRows } from "./calendar-views.js";

// Calendar case CA41: Signal Forms and Field for a month. Controls the tests use as script actions
// are buttons.

function flip(value: boolean): boolean {
  return !value;
}

@Component({
  selector: "calendar-month-field-cases",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    OrigamiMonthCalendar,
    OrigamiCalendarGrid,
    OrigamiCalendarHeading,
    CalendarViewRows,
  ],
  template: `
    <section>
      <h2>Signal Forms with a month</h2>
      <button type="button" data-testid="start-before">Before the start month</button>
      <div ogField #startField="ogField" data-testid="start-field">
        <span ogFieldLabel id="start-label">Start month</span>
        <div
          ogMonthCalendar
          #start="ogMonthCalendar"
          data-testid="start-root"
          today="2026-10-27"
          locale="en-US"
          minMonth="2026-03"
          [formField]="plan.start"
        >
          <h3 ogCalendarHeading id="start-heading">{{ start.state.heading() }}</h3>
          <table
            ogCalendarGrid
            calendarViewRows
            data-testid="start-grid"
            [view]="start.state.view()"
            [months]="start.state.months()"
            [years]="start.state.years()"
          ></table>
        </div>
        <p ogFieldDescription id="start-description">From March 2026.</p>
        @if (startField.state.errorsShown()) {
          <p ogFieldError id="start-error">{{ startField.state.errors()[0]?.message }}</p>
        }
      </div>
      <button type="button" data-testid="start-after">After the start month</button>
      <output data-testid="start-value">{{ model().start ?? "null" }}</output>
      <output data-testid="start-touched">{{ plan.start().touched() }}</output>
      <button type="button" data-testid="write-start" (click)="writeStart()">Write May 2026</button>
      <button type="button" data-testid="focus-start" (click)="plan.start().focusBoundControl()">
        Focus the start month
      </button>
      <button type="button" data-testid="freeze-start" (click)="frozen.update(flip)">
        Freeze the start month
      </button>
      <button type="button" data-testid="lock-start" (click)="locked.update(flip)">
        Lock the start month
      </button>
    </section>
  `,
})
export class CalendarMonthFieldCases {
  readonly flip = flip;
  readonly frozen = signal(false);
  readonly locked = signal(false);
  readonly model = signal<{ start: string | null }>({ start: null });
  readonly plan = form(this.model, (path) => {
    required(path.start, { message: "Choose the start month." });
    readonly(path.start, () => this.frozen());
    disabled(path.start, () => this.locked());
  });

  writeStart(): void {
    this.model.set({ start: "2026-05" });
  }
}
