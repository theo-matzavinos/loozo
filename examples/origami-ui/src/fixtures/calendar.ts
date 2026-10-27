import { Component, Directive, inject, input, signal } from "@angular/core";
import {
  OrigamiCalendar,
  OrigamiCalendarCell,
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiCalendarNext,
  OrigamiCalendarOptions,
  OrigamiCalendarPrevious,
  OrigamiCalendarState,
} from "@loozo/origami-ui/calendar";
import { CalendarFieldCases } from "./calendar-field.js";

// Calendar cases CA1–CA19, CA21 and CA22. Controls the tests use as script actions are buttons; every cell
// carries its day as `data-date`, so a test can find it.

function increment(value: number): number {
  return value + 1;
}

function flip(value: boolean): boolean {
  return !value;
}

function weekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();

  return day === 0 || day === 6;
}

function noneDisabled(): boolean {
  return false;
}

/**
 * The days of the nearest Calendar root, rendered in a child component's view: the cells reach
 * their root through the host element's injector. Every cell carries its day as `data-date`.
 */
@Component({
  selector: "table[calendarDays]",
  imports: [OrigamiCalendarCell],
  template: `
    <thead>
      <tr>
        @for (weekday of state.weekdays(); track $index) {
          <th scope="col" [attr.abbr]="weekday.long">{{ weekday.short }}</th>
        }
      </tr>
    </thead>
    <tbody>
      @for (week of state.weeks(); track $index) {
        <tr>
          @for (day of week; track day.date) {
            <td ogCalendarCell [date]="day.date" [attr.data-date]="day.date">{{ day.label }}</td>
          }
        </tr>
      }
    </tbody>
  `,
})
export class CalendarDays {
  readonly state = inject(OrigamiCalendarState);
}

/**
 * Two Calendars whose Heading the buttons rename and remove, one with no `aria-labelledby` on its
 * Grid and one whose Grid names `naming-caption` statically. Server-rendered and hydrated, or
 * created by the browser, they name their grids alike.
 */
@Component({
  selector: "calendar-naming-cases",
  imports: [OrigamiCalendar, OrigamiCalendarGrid, OrigamiCalendarHeading, CalendarDays],
  template: `
    <div ogCalendar #plain="ogCalendar" today="2026-10-27" locale="en-US">
      @if (headingShown()) {
        <h3 ogCalendarHeading [id]="name() + '-plain-' + headingId()">
          {{ plain.state.heading() }}
        </h3>
      }
      <table ogCalendarGrid calendarDays [attr.data-testid]="name() + '-plain-grid'"></table>
    </div>
    <div ogCalendar #captioned="ogCalendar" today="2026-10-27" locale="en-US">
      @if (headingShown()) {
        <h3 ogCalendarHeading [id]="name() + '-captioned-' + headingId()">
          {{ captioned.state.heading() }}
        </h3>
      }
      <table
        ogCalendarGrid
        calendarDays
        aria-labelledby="naming-caption"
        [attr.data-testid]="name() + '-captioned-grid'"
      ></table>
    </div>
    <button
      type="button"
      [attr.data-testid]="name() + '-rename-heading'"
      (click)="headingId.set('renamed')"
    >
      Rename the headings
    </button>
    <button
      type="button"
      [attr.data-testid]="name() + '-remove-heading'"
      (click)="headingShown.set(false)"
    >
      Remove the headings
    </button>
  `,
})
export class CalendarNamingCases {
  readonly name = input.required<string>();
  readonly headingShown = signal(true);
  readonly headingId = signal("period");
}

/** A consumer Grid through `hostDirectives` whose own `host` names `split-caption` statically. */
@Directive({
  selector: "[captionedCalendarGrid]",
  hostDirectives: [OrigamiCalendarGrid],
  host: { "aria-labelledby": "split-caption" },
})
export class CaptionedCalendarGrid {}

/**
 * Two Calendars whose Grids hydrate with the fixture while each Heading waits in its own hydrate
 * boundary until the button: a plain Grid, and one whose composing directive names
 * `split-caption`. The Grids are found by `id`: their naming changes as the fixture attaches,
 * which node retention would report for a `data-testid`.
 */
@Component({
  selector: "calendar-split-cases",
  imports: [
    OrigamiCalendar,
    OrigamiCalendarGrid,
    OrigamiCalendarHeading,
    CaptionedCalendarGrid,
    CalendarDays,
  ],
  template: `
    <p id="split-caption">Visit</p>
    <div ogCalendar #plain="ogCalendar" today="2026-10-27" locale="en-US">
      @defer (hydrate when headingsHydrated()) {
        <h3 ogCalendarHeading id="split-plain-period">{{ plain.state.heading() }}</h3>
      } @placeholder {
        <p>Heading</p>
      }
      <table ogCalendarGrid calendarDays id="split-plain-grid"></table>
    </div>
    <div ogCalendar #captioned="ogCalendar" today="2026-10-27" locale="en-US">
      @defer (hydrate when headingsHydrated()) {
        <h3 ogCalendarHeading id="split-captioned-period">{{ captioned.state.heading() }}</h3>
      } @placeholder {
        <p>Heading</p>
      }
      <table captionedCalendarGrid calendarDays id="split-captioned-grid"></table>
    </div>
    <button type="button" data-testid="split-hydrate-headings" (click)="headingsHydrated.set(true)">
      Hydrate the headings
    </button>
  `,
})
export class CalendarSplitCases {
  readonly headingsHydrated = signal(false);
}

/** Replacement Options the composed Calendar reads; changed by the fixture's buttons. */
@Directive({ selector: "[calendarSettings]", exportAs: "calendarSettings" })
export class CalendarSettings {
  readonly value = signal<string | null>(null);
  readonly month = signal<string | null>("2026-02");
}

/** A consumer Calendar through `hostDirectives` whose factory Options replace the whole configuration. */
@Directive({
  selector: "[februaryCalendar]",
  exportAs: "februaryCalendar",
  hostDirectives: [OrigamiCalendar],
  providers: [
    OrigamiCalendarOptions.provideFactory(() => {
      const settings = inject(CalendarSettings);

      return {
        value: settings.value,
        month: settings.month,
        minDate: signal(null),
        maxDate: signal(null),
        dateDisabled: signal(noneDisabled),
        weekStart: signal(1),
        locale: signal("en-GB"),
        today: signal("2026-02-14"),
        fixedWeeks: signal(true),
        disabled: signal(false),
        readonly: signal(false),
      };
    }),
  ],
})
export class FebruaryCalendar {
  readonly state = inject(OrigamiCalendarState);
}

@Component({
  selector: "acceptance-calendar-fixture",
  imports: [
    OrigamiCalendar,
    OrigamiCalendarGrid,
    OrigamiCalendarHeading,
    OrigamiCalendarPrevious,
    OrigamiCalendarNext,
    CalendarDays,
    CalendarSettings,
    FebruaryCalendar,
    CalendarFieldCases,
    CalendarNamingCases,
    CalendarSplitCases,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach calendar behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h2>Keys, bounds and choosing</h2>
      <button type="button" data-testid="a-before">Before the calendar</button>
      <div
        ogCalendar
        #a="ogCalendar"
        data-testid="a-root"
        today="2026-10-27"
        locale="en-US"
        [(value)]="aValue"
        [(month)]="aMonth"
        [minDate]="aMin()"
        [maxDate]="aMax()"
        [dateDisabled]="aDateDisabled()"
        [weekStart]="aWeekStart()"
        [disabled]="aDisabled()"
        [readonly]="aReadonly()"
        [attr.dir]="aDir()"
        (valueChange)="aOutputs.update(increment)"
        (monthChange)="aMonthOutputs.update(increment)"
      >
        <button ogCalendarPrevious aria-label="Previous month" data-testid="a-previous">‹</button>
        <h3 ogCalendarHeading data-testid="a-heading">{{ a.state.heading() }}</h3>
        <button ogCalendarNext aria-label="Next month" data-testid="a-next">›</button>
        <table ogCalendarGrid calendarDays data-testid="a-grid"></table>
      </div>
      <button type="button" data-testid="a-after">After the calendar</button>
      <output data-testid="a-value">{{ aValue() ?? "null" }}</output>
      <output data-testid="a-month">{{ aMonth() ?? "null" }}</output>
      <output data-testid="a-state">{{ a.state.value() ?? "null" }} {{ a.state.month() }}</output>
      <output data-testid="a-outputs">{{ aOutputs() }}</output>
      <output data-testid="a-month-outputs">{{ aMonthOutputs() }}</output>
      <button type="button" data-testid="a-january-2026" (click)="aMonth.set('2026-01')">
        Show January 2026
      </button>
      <button type="button" data-testid="a-january-2028" (click)="aMonth.set('2028-01')">
        Show January 2028
      </button>
      <button type="button" data-testid="a-dst" (click)="showDaylightSaving()">
        Show November 2018 with the 3rd chosen
      </button>
      <button type="button" data-testid="a-follow" (click)="aMonth.set(null)">
        Follow the value
      </button>
      <button type="button" data-testid="a-bound" (click)="bound()">Bound to 5–20 October</button>
      <button type="button" data-testid="a-weekends" (click)="disableWeekends()">
        Disable weekends
      </button>
      <button type="button" data-testid="a-monday" (click)="aWeekStart.set(1)">
        Start on Monday
      </button>
      <button type="button" data-testid="a-rtl" (click)="aDir.set('rtl')">Right to left</button>
      <button type="button" data-testid="a-disable" (click)="aDisabled.update(flip)">
        Disable the calendar
      </button>
      <button type="button" data-testid="a-readonly" (click)="aReadonly.update(flip)">
        Make the calendar readonly
      </button>
      <button type="button" data-testid="a-write-christmas" (click)="aValue.set('2026-12-25')">
        Write Christmas
      </button>
      <button type="button" data-testid="a-write-invalid" (click)="aValue.set('2026-02-31')">
        Write 31 February
      </button>
      <button type="button" data-testid="a-first-month" (click)="aMonth.set('0001-01')">
        Show January 0001
      </button>
      <button type="button" data-testid="a-last-month" (click)="aMonth.set('9999-12')">
        Show December 9999
      </button>
      <button type="button" data-testid="a-first-bound" (click)="boundFirstMonth()">
        Show January 0001 up to 30 January
      </button>
      <button type="button" data-testid="a-last-bound" (click)="boundLastMonth()">
        Show December 9999 from 2 December, weeks from Monday
      </button>
    </section>

    <section>
      <h2>Seed</h2>
      <div ogCalendar #seed="ogCalendar" data-testid="seed-root">
        <h3 ogCalendarHeading data-testid="seed-heading">{{ seed.state.heading() }}</h3>
        <table ogCalendarGrid calendarDays data-testid="seed-grid"></table>
      </div>
      <button type="button" data-testid="seed-focus" (click)="seed.focus()">
        Focus the seeded calendar
      </button>
      <button type="button" data-testid="show-late" (click)="lateShown.set(true)">
        Mount a calendar in the browser
      </button>
      @if (lateShown()) {
        <div ogCalendar #late="ogCalendar" data-testid="late-root">
          <h3 ogCalendarHeading data-testid="late-heading">{{ late.state.heading() }}</h3>
          <table ogCalendarGrid calendarDays data-testid="late-grid"></table>
        </div>
      }
    </section>

    <section>
      <h2>Focus before the cells exist</h2>
      <div ogCalendar #pending="ogCalendar" today="2026-10-27" value="2026-10-09">
        @if (pendingShown()) {
          <table ogCalendarGrid calendarDays data-testid="pending-grid"></table>
        }
      </div>
      <button type="button" data-testid="pending-show-and-focus" (click)="showAndFocus(pending)">
        Show the grid and focus it
      </button>
    </section>

    <section
      (window:calendar-stale-show)="staleShown.set(true)"
      (window:calendar-stale-hide)="staleShown.set(false)"
      (window:calendar-stale-focus)="stale.focus()"
    >
      <h2>A focus request that focus has left</h2>
      <div
        ogCalendar
        #stale="ogCalendar"
        data-testid="stale-root"
        today="2026-10-27"
        locale="en-US"
        value="2026-10-01"
        [weekStart]="7"
      >
        <button ogCalendarPrevious aria-label="Previous month" data-testid="stale-previous">
          ‹
        </button>
        @if (staleShown()) {
          <table ogCalendarGrid calendarDays data-testid="stale-grid"></table>
        }
      </div>
      <button type="button" data-testid="stale-focus" (click)="stale.focus()">
        Focus the calendar before its grid renders
      </button>
      <output data-testid="stale-month">{{ stale.state.month() }}</output>
    </section>

    <section>
      <h2>Heading lifecycle</h2>
      <p id="naming-caption">Appointment</p>
      <calendar-naming-cases name="hydrated" />
      <button type="button" data-testid="show-late-naming" (click)="lateNamingShown.set(true)">
        Mount the naming calendars in the browser
      </button>
      @if (lateNamingShown()) {
        <calendar-naming-cases name="late" />
      }
      <calendar-split-cases />
    </section>

    <section calendarSettings #settings="calendarSettings">
      <h2>Options replacement</h2>
      <div februaryCalendar #february="februaryCalendar" data-testid="february-root">
        <h3 ogCalendarHeading data-testid="february-heading">{{ february.state.heading() }}</h3>
        <table ogCalendarGrid calendarDays data-testid="february-grid"></table>
      </div>
      <output data-testid="february-value">{{ settings.value() ?? "null" }}</output>
    </section>

    <calendar-field-cases />
  `,
})
export class CalendarFixture {
  readonly attached = signal(false);
  readonly aValue = signal<string | null>(null);
  readonly aMonth = signal<string | null>(null);
  readonly aMin = signal<string | null>(null);
  readonly aMax = signal<string | null>(null);
  readonly aDateDisabled = signal<(date: string) => boolean>(noneDisabled);
  readonly aWeekStart = signal<1 | 2 | 3 | 4 | 5 | 6 | 7 | null>(null);
  readonly aDisabled = signal(false);
  readonly aReadonly = signal(false);
  readonly aDir = signal<"ltr" | "rtl">("ltr");
  readonly aOutputs = signal(0);
  readonly aMonthOutputs = signal(0);
  readonly lateShown = signal(false);
  readonly pendingShown = signal(false);
  readonly staleShown = signal(false);
  readonly lateNamingShown = signal(false);

  readonly increment = increment;
  readonly flip = flip;

  showDaylightSaving(): void {
    this.aMonth.set("2018-11");
    this.aValue.set("2018-11-03");
  }

  bound(): void {
    this.aMin.set("2026-10-05");
    this.aMax.set("2026-10-20");
  }

  /** A `maxDate` among the outside days of February 0001, the first month shown. */
  boundFirstMonth(): void {
    this.aMonth.set("0001-01");
    this.aMin.set(null);
    this.aMax.set("0001-01-30");
  }

  /** A `minDate` among the outside days of November 9999, the last month shown. */
  boundLastMonth(): void {
    this.aMonth.set("9999-12");
    this.aMin.set("9999-12-02");
    this.aMax.set(null);
    this.aWeekStart.set(1);
  }

  disableWeekends(): void {
    this.aDateDisabled.set(weekend);
  }

  /** `focus()` runs before the grid's cells render, so the request waits for them. */
  showAndFocus(calendar: OrigamiCalendar): void {
    this.pendingShown.set(true);
    calendar.focus();
  }
}
