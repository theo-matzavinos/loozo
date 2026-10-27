import { Component, computed, signal } from "@angular/core";
import { FormField, disabled, form, readonly } from "@angular/forms/signals";
import {
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiCalendarMultiple,
  OrigamiCalendarRange,
} from "@loozo/origami-ui/calendar";
import type { OrigamiDateRange } from "@loozo/origami-ui/calendar";
import { OrigamiField, OrigamiFieldDescription, OrigamiFieldLabel } from "@loozo/origami-ui/field";
import { CalendarDayRows, rangeText } from "./calendar-selection.js";

// Calendar case CA29: Signal Forms and Field for several days and a range. Controls the tests use
// as script actions are buttons.

function flip(value: boolean): boolean {
  return !value;
}

@Component({
  selector: "calendar-selection-field-cases",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiCalendarMultiple,
    OrigamiCalendarRange,
    OrigamiCalendarGrid,
    OrigamiCalendarHeading,
    CalendarDayRows,
  ],
  template: `
    <section>
      <h2>Signal Forms with several days and a range</h2>
      <div ogField data-testid="trip-field">
        <span ogFieldLabel id="trip-label">Trip days</span>
        <div
          ogCalendarMultiple
          #trip="ogCalendarMultiple"
          data-testid="trip-root"
          today="2026-10-27"
          locale="en-US"
          [formField]="booking.days"
        >
          <h3 ogCalendarHeading id="trip-heading">{{ trip.state.heading() }}</h3>
          <table
            ogCalendarGrid
            calendarDayRows
            data-testid="trip-grid"
            [weekdays]="trip.state.weekdays()"
            [weeks]="trip.state.weeks()"
          ></table>
        </div>
        <p ogFieldDescription id="trip-description">Any days in October.</p>
      </div>
      <button type="button" data-testid="trip-after">After the trip days</button>

      <div ogField data-testid="stay-field">
        <span ogFieldLabel id="stay-label">Stay</span>
        <div
          ogCalendarRange
          #stay="ogCalendarRange"
          data-testid="stay-root"
          today="2026-10-27"
          locale="en-US"
          [formField]="booking.stay"
        >
          <h3 ogCalendarHeading id="stay-heading">{{ stay.state.heading() }}</h3>
          <table
            ogCalendarGrid
            calendarDayRows
            data-testid="stay-grid"
            [weekdays]="stay.state.weekdays()"
            [weeks]="stay.state.weeks()"
          ></table>
        </div>
      </div>
      <button type="button" data-testid="stay-after">After the stay</button>

      <output data-testid="trip-value">{{ model().days.join(" ") }}</output>
      <output data-testid="trip-touched">{{ booking.days().touched() }}</output>
      <output data-testid="stay-value">{{ stayText() }}</output>
      <output data-testid="stay-anchor">{{ stay.state.anchor() ?? "null" }}</output>
      <output data-testid="stay-touched">{{ booking.stay().touched() }}</output>
      <button type="button" data-testid="write-booking" (click)="writeBooking()">
        Write 2 and 9 October, and 5–8 October
      </button>
      <button type="button" data-testid="focus-trip" (click)="booking.days().focusBoundControl()">
        Focus the trip days
      </button>
      <button type="button" data-testid="focus-stay" (click)="booking.stay().focusBoundControl()">
        Focus the stay
      </button>
      <button type="button" data-testid="freeze-booking" (click)="frozen.update(flip)">
        Freeze the booking
      </button>
      <button type="button" data-testid="lock-booking" (click)="locked.update(flip)">
        Lock the booking
      </button>
    </section>
  `,
})
export class CalendarSelectionFieldCases {
  readonly flip = flip;
  readonly frozen = signal(false);
  readonly locked = signal(false);
  readonly model = signal<{ days: readonly string[]; stay: OrigamiDateRange | null }>({
    days: [],
    stay: null,
  });
  readonly booking = form(this.model, (path) => {
    readonly(path.days, () => this.frozen());
    readonly(path.stay, () => this.frozen());
    disabled(path.days, () => this.locked());
    disabled(path.stay, () => this.locked());
  });
  readonly stayText = computed(() => rangeText(this.model().stay));

  writeBooking(): void {
    this.model.set({
      days: ["2026-10-02", "2026-10-09"],
      stay: { start: "2026-10-05", end: "2026-10-08" },
    });
  }
}
