import { Component, afterRenderEffect, computed, input, signal, viewChild } from "@angular/core";
import {
  OrigamiCalendar,
  OrigamiCalendarCell,
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiCalendarNext,
  OrigamiCalendarPrevious,
} from "@loozo/origami-ui/calendar";
import type { OrigamiCalendarDayRecord } from "@loozo/origami-ui/calendar";
import { CalendarViewRows } from "./calendar-views.js";

// The Screen reader workflow's Calendar markup probes (markup-probe.spec.ts): alternatives next to
// Origami's own markup for three VoiceOver findings of run 42389115342. Nothing here is a
// proposed design; each probe only shows what a reader says for one markup. Today is 27 October
// 2026 everywhere, and every focusable cell carries its date as `data-date`.
//
// S, "selected" is never spoken (V1): S0 Origami; S1 a static gridcell holding a focusable
// role="button" (React Aria's structure); S2 S1 with aria-pressed; S3 S1 with "selected" in the
// button's name; S4 a focusable gridcell described by a hidden "selected"; S5 Origami with a
// polite region naming the chosen day.
// K, a key into another month speaks only the Heading (V2): K0 Origami; K1 a Heading that isn't
// live; K2 a Heading live only while focus is outside the grid; K3 Origami with cells kept across
// the month change.
// L, Previous and the view switch don't speak the Heading (V3): L0 Origami; L1 the Heading with
// aria-atomic; L2 a Heading that isn't live and a polite region written at once; L3 the same
// written 500 ms later; L4 a clone of React Aria's announcer, an assertive log with a node per
// change.

type CalendarView = "days" | "months" | "years";

type SelectionProbe = "s1" | "s2" | "s3" | "s4";

type StepProbe = "l0" | "l1" | "l2" | "l3" | "l4";

const probeDays = [
  { date: "2026-10-26", name: "Monday, October 26, 2026", number: "26" },
  { date: "2026-10-27", name: "Tuesday, October 27, 2026", number: "27" },
  { date: "2026-10-28", name: "Wednesday, October 28, 2026", number: "28" },
];

const stepLabels = {
  days: { previous: "Previous month", next: "Next month" },
  months: { previous: "Previous year", next: "Next year" },
  years: { previous: "Previous 12 years", next: "Next 12 years" },
};

const fullDate = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function hearingDay(date: string): boolean {
  return date === "2026-10-28";
}

/**
 * A static one-week grid for the S probes S1–S4: three days of October 2026, 27 October today and
 * chosen first; Enter or Space chooses the focused day.
 */
@Component({
  selector: "probe-selection-grid",
  template: `
    <table role="grid" [attr.aria-label]="label()" [attr.data-testid]="probe() + '-root'">
      <tbody>
        <tr>
          @for (day of days; track day.date) {
            @if (probe() === "s4") {
              <td
                role="gridcell"
                [attr.data-date]="day.date"
                [attr.tabindex]="tabIndex(day.date)"
                [attr.aria-label]="day.name"
                [attr.aria-selected]="ariaSelected(day.date)"
                [attr.aria-current]="ariaCurrent(day.date)"
                [attr.aria-describedby]="describedBy(day.date)"
                (keydown)="keydown($event, day.date)"
              >
                {{ day.number }}
              </td>
            } @else {
              <td role="gridcell" [attr.aria-selected]="ariaSelected(day.date)">
                <span
                  role="button"
                  [attr.data-date]="day.date"
                  [attr.tabindex]="tabIndex(day.date)"
                  [attr.aria-label]="buttonName(day.date, day.name)"
                  [attr.aria-pressed]="ariaPressed(day.date)"
                  [attr.aria-current]="ariaCurrent(day.date)"
                  (keydown)="keydown($event, day.date)"
                >
                  {{ day.number }}
                </span>
              </td>
            }
          }
        </tr>
      </tbody>
    </table>
    <span hidden [id]="probe() + '-selected'">selected</span>
  `,
})
export class ProbeSelectionGrid {
  readonly probe = input.required<SelectionProbe>();
  readonly label = input.required<string>();
  readonly days = probeDays;
  readonly selected = signal("2026-10-27");

  tabIndex(date: string): string {
    if (date === this.selected()) {
      return "0";
    }

    return "-1";
  }

  ariaSelected(date: string): string | null {
    if (date === this.selected()) {
      return "true";
    }

    return null;
  }

  ariaCurrent(date: string): string | null {
    if (date === "2026-10-27") {
      return "date";
    }

    return null;
  }

  ariaPressed(date: string): string | null {
    if (this.probe() !== "s2") {
      return null;
    }

    return String(date === this.selected());
  }

  buttonName(date: string, name: string): string {
    // React Aria's en-US "dateSelected" string, here the consumer's own.
    if (this.probe() === "s3" && date === this.selected()) {
      return `${name} selected`;
    }

    return name;
  }

  describedBy(date: string): string | null {
    if (date === this.selected()) {
      return `${this.probe()}-selected`;
    }

    return null;
  }

  keydown(event: KeyboardEvent, date: string): void {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    this.selected.set(date);
  }
}

/**
 * The days of an `ogCalendar`'s month tracked by position, so a month change keeps the cell
 * elements and only changes their dates (K3); `calendarViewRows` tracks days by date.
 */
@Component({
  selector: "table[probeKeptDayRows]",
  imports: [OrigamiCalendarCell],
  template: `
    <thead>
      <tr>
        @for (weekday of weekdays(); track $index) {
          <th scope="col" [attr.abbr]="weekday.long">{{ weekday.short }}</th>
        }
      </tr>
    </thead>
    <tbody>
      @for (week of weeks(); track $index) {
        <tr>
          @for (day of week; track $index) {
            <td ogCalendarCell [date]="day.date" [attr.data-date]="day.date">{{ day.label }}</td>
          }
        </tr>
      }
    </tbody>
  `,
})
export class ProbeKeptDayRows {
  readonly weekdays =
    input.required<readonly { readonly short: string; readonly long: string }[]>();
  readonly weeks = input.required<readonly (readonly OrigamiCalendarDayRecord[])[]>();
}

/**
 * An `ogCalendar` with Previous, Next and a view switch holding its Heading, as Departure on
 * /calendar-speech, for the L probes: how the displayed period is told differs by `probe`.
 */
@Component({
  selector: "probe-step-calendar",
  imports: [
    OrigamiCalendar,
    OrigamiCalendarGrid,
    OrigamiCalendarHeading,
    OrigamiCalendarPrevious,
    OrigamiCalendarNext,
    CalendarViewRows,
  ],
  template: `
    <div
      ogCalendar
      #calendar="ogCalendar"
      [attr.data-testid]="probe() + '-root'"
      today="2026-10-27"
      locale="en-US"
      [(view)]="view"
    >
      <button
        ogCalendarPrevious
        [attr.data-testid]="probe() + '-previous'"
        [attr.aria-label]="stepLabels[calendar.state.view()].previous"
      >
        ‹
      </button>
      <button type="button" [attr.data-testid]="probe() + '-switch'" (click)="switchView()">
        @switch (probe()) {
          @case ("l0") {
            <span ogCalendarHeading>{{ calendar.state.heading() }}</span>
          }
          @case ("l1") {
            <span ogCalendarHeading aria-atomic="true">{{ calendar.state.heading() }}</span>
          }
          @default {
            <span>{{ calendar.state.heading() }}</span>
          }
        }
      </button>
      <button
        ogCalendarNext
        [attr.data-testid]="probe() + '-next'"
        [attr.aria-label]="stepLabels[calendar.state.view()].next"
      >
        ›
      </button>
      <table
        ogCalendarGrid
        calendarViewRows
        [attr.aria-label]="label()"
        [view]="calendar.state.view()"
        [weekdays]="calendar.state.weekdays()"
        [weeks]="calendar.state.weeks()"
        [months]="calendar.state.months()"
        [years]="calendar.state.years()"
      ></table>
    </div>
    @if (probe() === "l2" || probe() === "l3") {
      <p class="visually-hidden" aria-live="polite">{{ politeText() }}</p>
    }
    @if (probe() === "l4") {
      <div class="visually-hidden" role="log" aria-live="assertive">
        @for (message of logMessages(); track $index) {
          <div>{{ message }}</div>
        }
      </div>
    }
  `,
  styles: `
    .visually-hidden {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class ProbeStepCalendar {
  readonly probe = input.required<StepProbe>();
  readonly label = input.required<string>();
  readonly stepLabels = stepLabels;
  readonly view = signal<CalendarView>("days");
  readonly politeText = signal("");
  readonly logMessages = signal<readonly string[]>([]);
  private readonly calendar = viewChild.required(OrigamiCalendar);

  constructor() {
    let shown: string | null = null;

    // After render, so the Calendar query has resolved; L2's write lands in the same task.
    afterRenderEffect(() => {
      const heading = this.calendar().state.heading();

      // The first period is the page's, not a change.
      if (shown === null) {
        shown = heading;
        return;
      }

      shown = heading;
      this.#tell(heading);
    });
  }

  switchView(): void {
    if (this.view() === "days") {
      this.view.set("years");
      return;
    }

    this.view.set("days");
  }

  #tell(heading: string): void {
    const probe = this.probe();

    if (probe === "l2") {
      this.politeText.set(heading);
      return;
    }

    if (probe === "l3") {
      setTimeout(() => this.politeText.set(heading), 500);
      return;
    }

    if (probe === "l4") {
      this.logMessages.update((messages) => [...messages, heading]);
    }
  }
}

@Component({
  selector: "acceptance-calendar-probe-speech-fixture",
  imports: [
    OrigamiCalendar,
    OrigamiCalendarGrid,
    OrigamiCalendarHeading,
    OrigamiCalendarPrevious,
    OrigamiCalendarNext,
    CalendarViewRows,
    ProbeSelectionGrid,
    ProbeKeptDayRows,
    ProbeStepCalendar,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach the page
    </button>
    <span data-testid="fixture-attached">{{ attached() }}</span>

    <section>
      <h2>Selection</h2>
      <span id="s0-label">Probe S0</span>
      <div
        ogCalendar
        #s0="ogCalendar"
        data-testid="s0-root"
        today="2026-10-27"
        locale="en-US"
        [(value)]="s0Value"
      >
        <button ogCalendarPrevious aria-label="Previous month">‹</button>
        <h3 ogCalendarHeading>{{ s0.state.heading() }}</h3>
        <button ogCalendarNext aria-label="Next month">›</button>
        <table
          ogCalendarGrid
          calendarViewRows
          aria-labelledby="s0-label"
          view="days"
          [weekdays]="s0.state.weekdays()"
          [weeks]="s0.state.weeks()"
          [months]="[]"
          [years]="[]"
        ></table>
      </div>

      <probe-selection-grid probe="s1" label="Probe S1" />
      <probe-selection-grid probe="s2" label="Probe S2" />
      <probe-selection-grid probe="s3" label="Probe S3" />
      <probe-selection-grid probe="s4" label="Probe S4" />

      <span id="s5-label">Probe S5</span>
      <div
        ogCalendar
        #s5="ogCalendar"
        data-testid="s5-root"
        today="2026-10-27"
        locale="en-US"
        [(value)]="s5Value"
      >
        <button ogCalendarPrevious aria-label="Previous month">‹</button>
        <h3 ogCalendarHeading>{{ s5.state.heading() }}</h3>
        <button ogCalendarNext aria-label="Next month">›</button>
        <table
          ogCalendarGrid
          calendarViewRows
          aria-labelledby="s5-label"
          view="days"
          [weekdays]="s5.state.weekdays()"
          [weeks]="s5.state.weeks()"
          [months]="[]"
          [years]="[]"
        ></table>
      </div>
      <p aria-live="polite">{{ s5Text() }}</p>
    </section>

    <section>
      <h2>Keys into another month</h2>
      <span id="k0-label">Probe K0</span>
      <div
        ogCalendar
        #k0="ogCalendar"
        data-testid="k0-root"
        today="2026-10-27"
        locale="en-US"
        [dateDisabled]="hearingDay"
      >
        <button ogCalendarPrevious aria-label="Previous month">‹</button>
        <h3 ogCalendarHeading>{{ k0.state.heading() }}</h3>
        <button ogCalendarNext aria-label="Next month">›</button>
        <table
          ogCalendarGrid
          calendarViewRows
          aria-labelledby="k0-label"
          view="days"
          [weekdays]="k0.state.weekdays()"
          [weeks]="k0.state.weeks()"
          [months]="[]"
          [years]="[]"
        ></table>
      </div>

      <span id="k1-label">Probe K1</span>
      <div
        ogCalendar
        #k1="ogCalendar"
        data-testid="k1-root"
        today="2026-10-27"
        locale="en-US"
        [dateDisabled]="hearingDay"
      >
        <button ogCalendarPrevious aria-label="Previous month">‹</button>
        <h3 id="k1-heading">{{ k1.state.heading() }}</h3>
        <button ogCalendarNext aria-label="Next month">›</button>
        <table
          ogCalendarGrid
          calendarViewRows
          aria-labelledby="k1-label k1-heading"
          view="days"
          [weekdays]="k1.state.weekdays()"
          [weeks]="k1.state.weeks()"
          [months]="[]"
          [years]="[]"
        ></table>
      </div>

      <span id="k2-label">Probe K2</span>
      <div
        ogCalendar
        #k2="ogCalendar"
        data-testid="k2-root"
        today="2026-10-27"
        locale="en-US"
        [dateDisabled]="hearingDay"
      >
        <button ogCalendarPrevious aria-label="Previous month">‹</button>
        <h3 id="k2-heading" [attr.aria-live]="k2HeadingLive()">{{ k2.state.heading() }}</h3>
        <button ogCalendarNext aria-label="Next month">›</button>
        <table
          ogCalendarGrid
          calendarViewRows
          aria-labelledby="k2-label k2-heading"
          view="days"
          [weekdays]="k2.state.weekdays()"
          [weeks]="k2.state.weeks()"
          [months]="[]"
          [years]="[]"
          (focusin)="k2FocusInGrid.set(true)"
          (focusout)="k2FocusOut($event)"
        ></table>
      </div>

      <span id="k3-label">Probe K3</span>
      <div
        ogCalendar
        #k3="ogCalendar"
        data-testid="k3-root"
        today="2026-10-27"
        locale="en-US"
        [dateDisabled]="hearingDay"
      >
        <button ogCalendarPrevious aria-label="Previous month">‹</button>
        <h3 ogCalendarHeading>{{ k3.state.heading() }}</h3>
        <button ogCalendarNext aria-label="Next month">›</button>
        <table
          ogCalendarGrid
          probeKeptDayRows
          aria-labelledby="k3-label"
          [weekdays]="k3.state.weekdays()"
          [weeks]="k3.state.weeks()"
        ></table>
      </div>
    </section>

    <section>
      <h2>Previous and the view switch</h2>
      <probe-step-calendar probe="l0" label="Probe L0" />
      <probe-step-calendar probe="l1" label="Probe L1" />
      <probe-step-calendar probe="l2" label="Probe L2" />
      <probe-step-calendar probe="l3" label="Probe L3" />
      <probe-step-calendar probe="l4" label="Probe L4" />
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

    td:focus,
    [role="button"]:focus {
      outline: 2px solid #8888ff;
    }

    td[data-selected],
    td[aria-selected="true"] {
      background: #444466;
    }

    td[data-outside],
    td[data-disabled] {
      opacity: 0.5;
    }
  `,
})
export class CalendarProbeSpeechFixture {
  readonly attached = signal(false);
  readonly hearingDay = hearingDay;
  readonly s0Value = signal<string | null>("2026-10-27");
  readonly s5Value = signal<string | null>("2026-10-27");
  readonly s5Text = computed(() => {
    const value = this.s5Value();

    if (value === null) {
      return "";
    }

    return `Selected ${fullDate.format(new Date(`${value}T00:00:00Z`))}`;
  });
  readonly k2FocusInGrid = signal(false);
  readonly k2HeadingLive = computed(() => {
    if (this.k2FocusInGrid()) {
      return "off";
    }

    return "polite";
  });

  /**
   * Focus leaving K2's grid for another element makes its Heading live again; focus falling to
   * nothing, as when the focused cell leaves with its month, keeps it silent.
   */
  k2FocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    const grid = event.currentTarget;

    if (next === null || !(next instanceof Node) || !(grid instanceof Node)) {
      return;
    }

    if (grid.contains(next)) {
      return;
    }

    this.k2FocusInGrid.set(false);
  }
}
