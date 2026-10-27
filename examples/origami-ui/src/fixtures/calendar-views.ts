import { Component, computed, input, signal } from "@angular/core";
import {
  OrigamiCalendar,
  OrigamiCalendarCell,
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiCalendarMultiple,
  OrigamiCalendarNext,
  OrigamiCalendarPrevious,
  OrigamiCalendarRange,
  OrigamiMonthCalendar,
} from "@loozo/origami-ui/calendar";
import type {
  OrigamiCalendarDayRecord,
  OrigamiCalendarPeriodRecord,
  OrigamiDateRange,
} from "@loozo/origami-ui/calendar";
import { rangeText } from "./calendar-selection.js";

// Calendar cases CA34–CA40 and CA43–CA47: the months and years views of the day roots, and the
// month Calendar; CA41 is in calendar-month-field.ts. Controls the tests use as script actions are
// buttons; every cell carries its date as `data-date`, so a test can find it.

type CalendarView = "days" | "months" | "years";

function increment(value: number): number {
  return value + 1;
}

function flip(value: boolean): boolean {
  return !value;
}

function noneDisabled(): boolean {
  return false;
}

function everyDay(): boolean {
  return true;
}

function july(month: string): boolean {
  return month.endsWith("-07");
}

/**
 * The rows of any Calendar root's current view, from its State, rendered in a child component's
 * view: the weekday header and the weeks, the months, or the years. Every cell carries its date as
 * `data-date`.
 */
@Component({
  selector: "table[calendarViewRows]",
  imports: [OrigamiCalendarCell],
  template: `
    @switch (view()) {
      @case ("days") {
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
              @for (day of week; track day.date) {
                <td ogCalendarCell [date]="day.date" [attr.data-date]="day.date">
                  {{ day.label }}
                </td>
              }
            </tr>
          }
        </tbody>
      }
      @case ("months") {
        <tbody>
          @for (row of months(); track $index) {
            <tr>
              @for (month of row; track month.date) {
                <td ogCalendarCell [date]="month.date" [attr.data-date]="month.date">
                  {{ month.label }}
                </td>
              }
            </tr>
          }
        </tbody>
      }
      @case ("years") {
        <tbody>
          @for (row of years(); track $index) {
            <tr>
              @for (year of row; track year.date) {
                <td ogCalendarCell [date]="year.date" [attr.data-date]="year.date">
                  {{ year.label }}
                </td>
              }
            </tr>
          }
        </tbody>
      }
    }
  `,
})
export class CalendarViewRows {
  readonly view = input.required<CalendarView>();
  readonly weekdays = input<readonly { readonly short: string; readonly long: string }[]>([]);
  readonly weeks = input<readonly (readonly OrigamiCalendarDayRecord[])[]>([]);
  readonly months = input.required<readonly (readonly OrigamiCalendarPeriodRecord[])[]>();
  readonly years = input.required<readonly (readonly OrigamiCalendarPeriodRecord[])[]>();
}

@Component({
  selector: "calendar-views-cases",
  imports: [
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
    <section>
      <h2>Views of one day</h2>
      <div
        ogCalendar
        #v="ogCalendar"
        data-testid="v-root"
        today="2026-10-27"
        locale="en-US"
        [(value)]="vValue"
        [(month)]="vMonth"
        [(view)]="vView"
        [minDate]="vMin()"
        [maxDate]="vMax()"
        [dateDisabled]="vDateDisabled()"
        [columns]="vColumns()"
        [readonly]="vReadonly()"
        (valueChange)="vOutputs.update(increment)"
        (viewChange)="vViewOutputs.update(increment)"
      >
        <button ogCalendarPrevious aria-label="Previous" data-testid="v-previous">‹</button>
        <button type="button" data-testid="v-switch" (click)="switchView()">
          <span ogCalendarHeading data-testid="v-heading">{{ v.state.heading() }}</span>
        </button>
        <button ogCalendarNext aria-label="Next" data-testid="v-next">›</button>
        <table
          ogCalendarGrid
          calendarViewRows
          data-testid="v-grid"
          [view]="v.state.view()"
          [weekdays]="v.state.weekdays()"
          [weeks]="v.state.weeks()"
          [months]="v.state.months()"
          [years]="v.state.years()"
        ></table>
      </div>
      <button type="button" data-testid="v-after">After the views</button>
      <output data-testid="v-value">{{ vValue() ?? "null" }}</output>
      <output data-testid="v-month">{{ vMonth() ?? "null" }}</output>
      <output data-testid="v-view">{{ vView() }}</output>
      <output data-testid="v-state">{{ v.state.view() }} {{ v.state.month() }}</output>
      <output data-testid="v-outputs">{{ vOutputs() }}</output>
      <output data-testid="v-view-outputs">{{ vViewOutputs() }}</output>
      <button type="button" data-testid="v-days" (click)="vView.set('days')">Show days</button>
      <button type="button" data-testid="v-months" (click)="vView.set('months')">
        Show months
      </button>
      <button type="button" data-testid="v-years" (click)="vView.set('years')">Show years</button>
      <button type="button" data-testid="v-bound" (click)="bound()">
        Bound to 15 October 2026 – 10 February 2027
      </button>
      <button type="button" data-testid="v-every-day" (click)="vDateDisabled.set(everyDay)">
        Disable every day
      </button>
      <button type="button" data-testid="v-four-columns" (click)="vColumns.set(4)">
        Four columns
      </button>
      <button type="button" data-testid="v-readonly" (click)="vReadonly.update(flip)">
        Make the views readonly
      </button>
      <button type="button" data-testid="v-write" (click)="vValue.set('2026-10-15')">
        Write 15 October 2026
      </button>
      <button type="button" data-testid="v-march-2025" (click)="vMonth.set('2025-03')">
        Show March 2025
      </button>
      <button type="button" data-testid="v-first-month" (click)="vMonth.set('0001-01')">
        Show January 0001
      </button>
      <button type="button" data-testid="v-last-month" (click)="vMonth.set('9999-12')">
        Show December 9999
      </button>
    </section>

    <section>
      <h2>Views of several days and a range</h2>
      <div
        ogCalendarMultiple
        #vm="ogCalendarMultiple"
        data-testid="vm-root"
        today="2026-10-27"
        locale="en-US"
        [(value)]="vmValue"
        [(view)]="vmView"
      >
        <h3 ogCalendarHeading data-testid="vm-heading">{{ vm.state.heading() }}</h3>
        <table
          ogCalendarGrid
          calendarViewRows
          data-testid="vm-grid"
          [view]="vm.state.view()"
          [weekdays]="vm.state.weekdays()"
          [weeks]="vm.state.weeks()"
          [months]="vm.state.months()"
          [years]="vm.state.years()"
        ></table>
      </div>
      <output data-testid="vm-value">{{ vmValue().join(" ") }}</output>
      <button type="button" data-testid="vm-months" (click)="vmView.set('months')">
        Show the months of several days
      </button>
      <button type="button" data-testid="vm-years" (click)="vmView.set('years')">
        Show the years of several days
      </button>
      <button type="button" data-testid="vm-days" (click)="vmView.set('days')">
        Show the days of several days
      </button>
      <div
        ogCalendarRange
        #vr="ogCalendarRange"
        data-testid="vr-root"
        today="2026-10-27"
        locale="en-US"
        [(value)]="vrValue"
        [(view)]="vrView"
      >
        <button ogCalendarPrevious aria-label="Previous" data-testid="vr-previous">‹</button>
        <h3 ogCalendarHeading data-testid="vr-heading">{{ vr.state.heading() }}</h3>
        <table
          ogCalendarGrid
          calendarViewRows
          data-testid="vr-grid"
          [view]="vr.state.view()"
          [weekdays]="vr.state.weekdays()"
          [weeks]="vr.state.weeks()"
          [months]="vr.state.months()"
          [years]="vr.state.years()"
        ></table>
      </div>
      <output data-testid="vr-value">{{ vrText() }}</output>
      <output data-testid="vr-anchor">{{ vr.state.anchor() ?? "null" }}</output>
      <output data-testid="vr-view">{{ vrView() }}</output>
      <button type="button" data-testid="vr-months" (click)="vrView.set('months')">
        Show the months of the range
      </button>
      <button type="button" data-testid="vr-days" (click)="vrView.set('days')">
        Show the days of the range
      </button>
    </section>

    <section>
      <h2>Server-rendered years</h2>
      <div
        ogCalendar
        #vy="ogCalendar"
        data-testid="vy-root"
        today="2026-10-27"
        locale="en-US"
        value="2026-10-15"
        view="years"
      >
        <h3 ogCalendarHeading data-testid="vy-heading">{{ vy.state.heading() }}</h3>
        <table
          ogCalendarGrid
          calendarViewRows
          data-testid="vy-grid"
          [view]="vy.state.view()"
          [weekdays]="vy.state.weekdays()"
          [weeks]="vy.state.weeks()"
          [months]="vy.state.months()"
          [years]="vy.state.years()"
        ></table>
      </div>
      <output data-testid="vy-state">{{ vy.state.view() }} {{ vy.state.month() }}</output>
    </section>

    <section>
      <h2>A month</h2>
      <button type="button" data-testid="mc-before">Before the month calendar</button>
      <div
        ogMonthCalendar
        #mc="ogMonthCalendar"
        data-testid="mc-root"
        today="2026-10-27"
        locale="en-US"
        [(value)]="mcValue"
        [(month)]="mcMonth"
        [(view)]="mcView"
        [minMonth]="mcMin()"
        [maxMonth]="mcMax()"
        [monthDisabled]="mcMonthDisabled()"
        [readonly]="mcReadonly()"
        (valueChange)="mcOutputs.update(increment)"
      >
        <button ogCalendarPrevious aria-label="Previous" data-testid="mc-previous">‹</button>
        <button type="button" data-testid="mc-switch" (click)="switchMonthView()">
          <span ogCalendarHeading data-testid="mc-heading">{{ mc.state.heading() }}</span>
        </button>
        <button ogCalendarNext aria-label="Next" data-testid="mc-next">›</button>
        <table
          ogCalendarGrid
          calendarViewRows
          data-testid="mc-grid"
          [view]="mc.state.view()"
          [months]="mc.state.months()"
          [years]="mc.state.years()"
        ></table>
      </div>
      <output data-testid="mc-value">{{ mcValue() ?? "null" }}</output>
      <output data-testid="mc-month">{{ mcMonth() ?? "null" }}</output>
      <output data-testid="mc-view">{{ mcView() }}</output>
      <output data-testid="mc-state">
        {{ mc.state.value() ?? "null" }} {{ mc.state.month() }} {{ mc.state.view() }}
      </output>
      <output data-testid="mc-outputs">{{ mcOutputs() }}</output>
      <button type="button" data-testid="mc-bound" (click)="boundMonths()">
        Bound to March 2026 – August 2027
      </button>
      <button type="button" data-testid="mc-july" (click)="mcMonthDisabled.set(july)">
        Disable July
      </button>
      <button type="button" data-testid="mc-readonly" (click)="mcReadonly.update(flip)">
        Make the month calendar readonly
      </button>
      <button type="button" data-testid="mc-write-invalid" (click)="mcValue.set('2026-13')">
        Write month 13
      </button>

      <div
        ogMonthCalendar
        #ms="ogMonthCalendar"
        data-testid="ms-root"
        today="2026-10-27"
        locale="en-US"
        value="2026-05"
      >
        <h3 ogCalendarHeading data-testid="ms-heading">{{ ms.state.heading() }}</h3>
        <table
          ogCalendarGrid
          calendarViewRows
          data-testid="ms-grid"
          [view]="ms.state.view()"
          [months]="ms.state.months()"
          [years]="ms.state.years()"
        ></table>
      </div>
      <output data-testid="ms-value">{{ ms.state.value() ?? "null" }}</output>
    </section>

    <section
      (window:calendar-month-pending-show)="mpShown.set(true)"
      (window:calendar-month-pending-hide)="mpShown.set(false)"
      (window:calendar-month-pending-months)="mpView.set('months')"
      (window:calendar-month-pending-years)="mpView.set('years')"
      (window:calendar-month-pending-focus)="mp.focus()"
    >
      <h2>A month's focus request across views</h2>
      <div
        ogMonthCalendar
        #mp="ogMonthCalendar"
        data-testid="mp-root"
        today="2026-10-27"
        locale="en-US"
        [(view)]="mpView"
      >
        @if (mpShown()) {
          <table
            ogCalendarGrid
            calendarViewRows
            data-testid="mp-grid"
            [view]="mp.state.view()"
            [months]="mp.state.months()"
            [years]="mp.state.years()"
          ></table>
        }
      </div>
      <button type="button" data-testid="mp-hold">Hold focus</button>
    </section>
  `,
})
export class CalendarViewsCases {
  readonly vValue = signal<string | null>(null);
  readonly vMonth = signal<string | null>(null);
  readonly vView = signal<CalendarView>("days");
  readonly vMin = signal<string | null>(null);
  readonly vMax = signal<string | null>(null);
  readonly vDateDisabled = signal<(date: string) => boolean>(noneDisabled);
  readonly vColumns = signal(3);
  readonly vReadonly = signal(false);
  readonly vOutputs = signal(0);
  readonly vViewOutputs = signal(0);
  readonly vmValue = signal<readonly string[]>(["2026-11-05", "2026-10-06"]);
  readonly vmView = signal<CalendarView>("days");
  readonly vrValue = signal<OrigamiDateRange | null>({ start: "2026-09-28", end: "2026-10-03" });
  readonly vrView = signal<CalendarView>("days");
  readonly vrText = computed(() => rangeText(this.vrValue()));
  readonly mcValue = signal<string | null>(null);
  readonly mcMonth = signal<string | null>(null);
  readonly mcView = signal<"months" | "years">("months");
  readonly mcMin = signal<string | null>(null);
  readonly mcMax = signal<string | null>(null);
  readonly mcMonthDisabled = signal<(month: string) => boolean>(noneDisabled);
  readonly mcReadonly = signal(false);
  readonly mcOutputs = signal(0);
  readonly mpView = signal<"months" | "years">("years");
  readonly mpShown = signal(false);

  readonly increment = increment;
  readonly flip = flip;
  readonly everyDay = everyDay;
  readonly july = july;

  /** The heading button: the years view from the days view, else back to the days. */
  switchView(): void {
    if (this.vView() === "days") {
      this.vView.set("years");

      return;
    }

    this.vView.set("days");
  }

  /** The month calendar's heading button: the years view from the months view, else back. */
  switchMonthView(): void {
    if (this.mcView() === "months") {
      this.mcView.set("years");

      return;
    }

    this.mcView.set("months");
  }

  bound(): void {
    this.vMin.set("2026-10-15");
    this.vMax.set("2027-02-10");
  }

  boundMonths(): void {
    this.mcMin.set("2026-03");
    this.mcMax.set("2027-08");
  }
}
