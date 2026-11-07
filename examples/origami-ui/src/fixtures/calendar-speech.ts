import { Component, signal } from "@angular/core";
import {
  OrigamiCalendar,
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiCalendarMultiple,
  OrigamiCalendarNext,
  OrigamiCalendarPrevious,
  OrigamiCalendarRange,
  OrigamiMonthCalendar,
} from "@loozo/origami-ui/calendar";
import type { OrigamiDateRange } from "@loozo/origami-ui/calendar";
import { OrigamiField, OrigamiFieldDescription, OrigamiFieldLabel } from "@loozo/origami-ui/field";
import { CalendarViewRows } from "./calendar-views.js";

// The Screen reader workflow's speech-only Calendar page (calendar.spec.ts): nothing on it is
// live except each Calendar's own Heading and Trip's prompt, as the range README shows it, so a
// reader's capture holds only what focus and the Calendars' own changes caused. Today is 27 October 2026 everywhere, and every cell carries its
// date as `data-date`. Appeal date is a day in a Field with a lower bound and 28 October
// disabled; Departure switches between the days, months and years views; Delivery days, Trip and
// Card expiry are the multiple, range and month roots.

type CalendarView = "days" | "months" | "years";

function hearingDay(date: string): boolean {
  return date === "2026-10-28";
}

const stepLabels = {
  days: { previous: "Previous month", next: "Next month" },
  months: { previous: "Previous year", next: "Next year" },
  years: { previous: "Previous 12 years", next: "Next 12 years" },
};

@Component({
  selector: "acceptance-calendar-speech-fixture",
  imports: [
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiCalendar,
    OrigamiCalendarMultiple,
    OrigamiCalendarRange,
    OrigamiMonthCalendar,
    OrigamiCalendarGrid,
    OrigamiCalendarHeading,
    OrigamiCalendarPrevious,
    OrigamiCalendarNext,
    CalendarViewRows,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach the page
    </button>
    <span data-testid="fixture-attached">{{ attached() }}</span>

    <section>
      <h2>Appeal</h2>
      <div ogField>
        <span ogFieldLabel>Appeal date</span>
        <div
          ogCalendar
          #appeal="ogCalendar"
          data-testid="appeal-root"
          today="2026-10-27"
          locale="en-US"
          minDate="2026-10-05"
          [dateDisabled]="hearingDay"
          [(value)]="appealDate"
        >
          <button ogCalendarPrevious aria-label="Previous month">‹</button>
          <h3 ogCalendarHeading>{{ appeal.state.heading() }}</h3>
          <button ogCalendarNext aria-label="Next month" data-testid="appeal-next">›</button>
          <table
            ogCalendarGrid
            calendarViewRows
            view="days"
            [weekdays]="appeal.state.weekdays()"
            [weeks]="appeal.state.weeks()"
            [months]="[]"
            [years]="[]"
          ></table>
        </div>
        <p ogFieldDescription>On or after 5 October, except 28 October.</p>
      </div>
      <button type="button" data-testid="appeal-after">After the appeal date</button>
    </section>

    <section>
      <h2>Departure</h2>
      <!-- Standalone: the grid's own aria-labelledby names this, then the Heading. -->
      <span id="departure-label">Departure</span>
      <div
        ogCalendar
        #departure="ogCalendar"
        data-testid="departure-root"
        today="2026-10-27"
        locale="en-US"
        [(value)]="departureDate"
        [(view)]="departureView"
      >
        <button
          ogCalendarPrevious
          data-testid="departure-previous"
          [attr.aria-label]="stepLabels[departure.state.view()].previous"
        >
          ‹
        </button>
        <button type="button" data-testid="departure-switch" (click)="switchDepartureView()">
          <span ogCalendarHeading>{{ departure.state.heading() }}</span>
        </button>
        <button
          ogCalendarNext
          data-testid="departure-next"
          [attr.aria-label]="stepLabels[departure.state.view()].next"
        >
          ›
        </button>
        <table
          ogCalendarGrid
          calendarViewRows
          aria-labelledby="departure-label"
          [view]="departure.state.view()"
          [weekdays]="departure.state.weekdays()"
          [weeks]="departure.state.weeks()"
          [months]="departure.state.months()"
          [years]="departure.state.years()"
        ></table>
      </div>
    </section>

    <section>
      <h2>Delivery</h2>
      <div ogField>
        <span ogFieldLabel>Delivery days</span>
        <div
          ogCalendarMultiple
          #delivery="ogCalendarMultiple"
          data-testid="delivery-root"
          today="2026-10-27"
          locale="en-US"
          [(value)]="deliveryDays"
        >
          <button ogCalendarPrevious aria-label="Previous month">‹</button>
          <h3 ogCalendarHeading>{{ delivery.state.heading() }}</h3>
          <button ogCalendarNext aria-label="Next month" data-testid="delivery-next">›</button>
          <table
            ogCalendarGrid
            calendarViewRows
            view="days"
            [weekdays]="delivery.state.weekdays()"
            [weeks]="delivery.state.weeks()"
            [months]="[]"
            [years]="[]"
          ></table>
        </div>
      </div>
      <button type="button" data-testid="delivery-after">After the delivery days</button>
    </section>

    <section>
      <h2>Trip</h2>
      <div ogField>
        <span ogFieldLabel>Trip</span>
        <div
          ogCalendarRange
          #trip="ogCalendarRange"
          data-testid="trip-root"
          today="2026-10-27"
          locale="en-US"
          [(value)]="tripRange"
        >
          <button ogCalendarPrevious aria-label="Previous month">‹</button>
          <h3 ogCalendarHeading>{{ trip.state.heading() }}</h3>
          <button ogCalendarNext aria-label="Next month" data-testid="trip-next">›</button>
          <table
            ogCalendarGrid
            calendarViewRows
            view="days"
            [weekdays]="trip.state.weekdays()"
            [weeks]="trip.state.weeks()"
            [months]="[]"
            [years]="[]"
          ></table>
        </div>
      </div>
      <!-- The README's prompt: plain text, not live. -->
      <p aria-live="polite">
        {{ trip.state.anchor() ? "Choose the last day" : "Choose the first day" }}
      </p>
      <button type="button" data-testid="trip-after">After the trip</button>
    </section>

    <section>
      <h2>Card</h2>
      <div ogField>
        <span ogFieldLabel>Card expiry</span>
        <div
          ogMonthCalendar
          #expiry="ogMonthCalendar"
          data-testid="expiry-root"
          today="2026-10-27"
          locale="en-US"
          [(value)]="expiryMonth"
        >
          <button ogCalendarPrevious aria-label="Previous year">‹</button>
          <h3 ogCalendarHeading>{{ expiry.state.heading() }}</h3>
          <button ogCalendarNext aria-label="Next year" data-testid="expiry-next">›</button>
          <table
            ogCalendarGrid
            calendarViewRows
            view="months"
            [months]="expiry.state.months()"
            [years]="expiry.state.years()"
          ></table>
        </div>
      </div>
      <button type="button" data-testid="expiry-after">After the card expiry</button>
    </section>
  `,
  styles: `
    table {
      border-collapse: collapse;
    }

    td {
      min-inline-size: 2rem;
      padding: 4px;
      text-align: center;
    }

    td:focus {
      outline: 2px solid #8888ff;
    }

    td[data-selected],
    td[data-preview] {
      background: #444466;
    }

    td[data-today] {
      box-shadow: inset 0 0 0 1px currentColor;
    }

    td[data-outside],
    td[data-disabled] {
      opacity: 0.5;
    }
  `,
})
export class CalendarSpeechFixture {
  readonly attached = signal(false);
  readonly stepLabels = stepLabels;
  readonly hearingDay = hearingDay;
  readonly appealDate = signal<string | null>(null);
  readonly departureDate = signal<string | null>(null);
  readonly departureView = signal<CalendarView>("days");
  readonly deliveryDays = signal<readonly string[]>([]);
  readonly tripRange = signal<OrigamiDateRange | null>(null);
  readonly expiryMonth = signal<string | null>(null);

  switchDepartureView(): void {
    if (this.departureView() === "days") {
      this.departureView.set("years");
      return;
    }

    this.departureView.set("days");
  }
}
