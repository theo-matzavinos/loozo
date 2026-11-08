import { Component, signal } from "@angular/core";
import { FormField, disabled, form, readonly } from "@angular/forms/signals";
import {
  OrigamiCalendar,
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiCalendarMultiple,
  OrigamiCalendarRange,
  OrigamiMonthCalendar,
} from "@loozo/origami-ui/calendar";
import type { OrigamiDateRange } from "@loozo/origami-ui/calendar";
import {
  OrigamiDatePickerContent,
  OrigamiDatePickerMultiple,
  OrigamiDatePickerRange,
  OrigamiDatePickerTrigger,
  OrigamiMonthPicker,
} from "@loozo/origami-ui/date-picker";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";
import { CalendarViewRows } from "./calendar-views.js";

// Date picker cases DP18–DP25 (section 27): the range, multiple and month roots. Each authors its
// Content before its Trigger, inside a Field, bound by Signal Forms. Controls the tests use as
// script actions are buttons; every cell carries its date as `data-date`. Every Calendar shows
// 27 October 2026 as today.

type CalendarView = "days" | "months" | "years";
type Policy = "none" | "readonly" | "disabled";

function increment(value: number): number {
  return value + 1;
}

@Component({
  selector: "date-picker-modes",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiDatePickerRange,
    OrigamiDatePickerMultiple,
    OrigamiMonthPicker,
    OrigamiDatePickerTrigger,
    OrigamiDatePickerContent,
    OrigamiCalendar,
    OrigamiCalendarRange,
    OrigamiCalendarMultiple,
    OrigamiMonthCalendar,
    OrigamiCalendarGrid,
    OrigamiCalendarHeading,
    CalendarViewRows,
  ],
  template: `
    <section>
      <h2>Range</h2>
      <div ogField>
        <span ogFieldLabel id="ra-label">Stay</span>
        <div
          ogDatePickerRange
          #ra="ogDatePickerRange"
          data-testid="ra-root"
          [formField]="modes.stay"
          [(open)]="raOpen"
          (valueChange)="raValueChanges.update(increment)"
          (touch)="raTouches.update(increment)"
        >
          <div ogDatePickerContent class="panel" data-testid="ra-content">
            <div
              ogCalendarRange
              #raCal="ogCalendarRange"
              today="2026-10-27"
              locale="en-US"
              [(view)]="raView"
            >
              <span ogCalendarHeading>{{ raCal.state.heading() }}</span>
              <button type="button" data-testid="ra-years" (click)="raView.set('years')">Choose a year</button>
              <table
                ogCalendarGrid
                calendarViewRows
                data-testid="ra-grid"
                [view]="raCal.state.view()"
                [weeks]="raCal.state.weeks()"
                [months]="raCal.state.months()"
                [years]="raCal.state.years()"
              ></table>
              <output data-testid="ra-anchor">{{ raCal.state.anchor() ?? "null" }}</output>
            </div>
          </div>
          <button ogDatePickerTrigger data-testid="ra-trigger">{{ rangeText(ra.state.value()) }}</button>
        </div>
      </div>
      <button type="button" data-testid="ra-after">After</button>
      <output data-testid="ra-value">{{ rangeText(model().stay) }}</output>
      <output data-testid="ra-open">{{ raOpen() }}</output>
      <output data-testid="ra-view">{{ raView() }}</output>
      <output data-testid="ra-value-changes">{{ raValueChanges() }}</output>
      <output data-testid="ra-touches">{{ raTouches() }}</output>
      <output data-testid="ra-touched">{{ modes.stay().touched() }}</output>
      <output data-testid="ra-policy">{{ ra.state.disabled() }} {{ ra.state.readonly() }} {{ ra.state.open() }}</output>
      <button type="button" data-testid="ra-focus" (click)="modes.stay().focusBoundControl()">
        Focus the bound control
      </button>
    </section>

    <section>
      <h2>Multiple</h2>
      <div ogField>
        <span ogFieldLabel id="mu-label">Holidays</span>
        <div
          ogDatePickerMultiple
          #mu="ogDatePickerMultiple"
          data-testid="mu-root"
          [formField]="modes.holidays"
          [(open)]="muOpen"
          (valueChange)="muValueChanges.update(increment)"
          (touch)="muTouches.update(increment)"
        >
          <div ogDatePickerContent class="panel" data-testid="mu-content">
            <div ogCalendarMultiple #muCal="ogCalendarMultiple" today="2026-10-27" locale="en-US">
              <span ogCalendarHeading>{{ muCal.state.heading() }}</span>
              <table
                ogCalendarGrid
                calendarViewRows
                data-testid="mu-grid"
                [view]="muCal.state.view()"
                [weeks]="muCal.state.weeks()"
                [months]="muCal.state.months()"
                [years]="muCal.state.years()"
              ></table>
            </div>
            <button type="button" data-testid="mu-done" (click)="muOpen.set(false)">Done</button>
          </div>
          <button ogDatePickerTrigger data-testid="mu-trigger">{{ mu.state.value().length }} days</button>
        </div>
      </div>
      <button type="button" data-testid="mu-after">After</button>
      <output data-testid="mu-value">{{ model().holidays.join(" ") }}</output>
      <output data-testid="mu-open">{{ muOpen() }}</output>
      <output data-testid="mu-value-changes">{{ muValueChanges() }}</output>
      <output data-testid="mu-touches">{{ muTouches() }}</output>
      <output data-testid="mu-policy">{{ mu.state.disabled() }} {{ mu.state.readonly() }} {{ mu.state.open() }}</output>
      <button type="button" data-testid="mu-focus" (click)="modes.holidays().focusBoundControl()">
        Focus the bound control
      </button>
    </section>

    <section>
      <h2>Month</h2>
      <div ogField>
        <span ogFieldLabel id="mo-label">Expiry</span>
        <div
          ogMonthPicker
          #mo="ogMonthPicker"
          data-testid="mo-root"
          [formField]="modes.expiry"
          [(open)]="moOpen"
          (valueChange)="moValueChanges.update(increment)"
          (touch)="moTouches.update(increment)"
        >
          <div ogDatePickerContent class="panel" data-testid="mo-content">
            <div
              ogMonthCalendar
              #moCal="ogMonthCalendar"
              today="2026-10-27"
              locale="en-US"
              [(view)]="moView"
            >
              <span ogCalendarHeading data-testid="mo-heading">{{ moCal.state.heading() }}</span>
              <button type="button" data-testid="mo-years" (click)="moView.set('years')">Choose a year</button>
              <table
                ogCalendarGrid
                calendarViewRows
                data-testid="mo-grid"
                [view]="moCal.state.view()"
                [months]="moCal.state.months()"
                [years]="moCal.state.years()"
              ></table>
            </div>
          </div>
          <button ogDatePickerTrigger data-testid="mo-trigger">{{ mo.state.value() ?? "Choose a month" }}</button>
        </div>
      </div>
      <button type="button" data-testid="mo-after">After</button>
      <output data-testid="mo-value">{{ model().expiry ?? "null" }}</output>
      <output data-testid="mo-open">{{ moOpen() }}</output>
      <output data-testid="mo-view">{{ moView() }}</output>
      <output data-testid="mo-value-changes">{{ moValueChanges() }}</output>
      <output data-testid="mo-touches">{{ moTouches() }}</output>
      <output data-testid="mo-policy">{{ mo.state.disabled() }} {{ mo.state.readonly() }} {{ mo.state.open() }}</output>
      <button type="button" data-testid="mo-focus" (click)="modes.expiry().focusBoundControl()">
        Focus the bound control
      </button>
    </section>

    <section>
      <h2>Readonly and disabled by the form</h2>
      <button type="button" data-testid="policy-none" (click)="policy.set('none')">Editable</button>
      <button type="button" data-testid="policy-readonly" (click)="policy.set('readonly')">
        Readonly
      </button>
      <button type="button" data-testid="policy-disabled" (click)="policy.set('disabled')">
        Disabled
      </button>
    </section>

    <section>
      <h2>A Calendar of another mode</h2>
      <button type="button" data-testid="mx-mount" (click)="mismatch.set(true)">
        Mount a single-day Calendar in a month picker
      </button>
      @if (mismatch()) {
        <div ogMonthPicker data-testid="mx-root" [(value)]="mxValue" [(open)]="mxOpen">
          <button ogDatePickerTrigger data-testid="mx-trigger">{{ mxValue() ?? "Choose" }}</button>
          <div ogDatePickerContent class="panel" data-testid="mx-content">
            <div ogCalendar #mxCal="ogCalendar" today="2026-10-27" locale="en-US" [(value)]="mxDay">
              <table
                ogCalendarGrid
                calendarViewRows
                data-testid="mx-grid"
                [view]="mxCal.state.view()"
                [weeks]="mxCal.state.weeks()"
                [months]="mxCal.state.months()"
                [years]="mxCal.state.years()"
              ></table>
            </div>
          </div>
        </div>
        <output data-testid="mx-value">{{ mxValue() ?? "null" }}</output>
        <output data-testid="mx-day">{{ mxDay() ?? "null" }}</output>
        <output data-testid="mx-open">{{ mxOpen() }}</output>
      }
    </section>
  `,
  styles: `
    .panel {
      color: inherit;
      background: #333333;
      border: 1px solid #777777;
      padding: 16px;
    }
    td[data-selected] {
      font-weight: 600;
    }
    section {
      /* Room for an open Calendar below its Trigger, so it never covers the next section. */
      margin-block-end: 24rem;
    }
  `,
})
export class DatePickerModes {
  readonly increment = increment;
  readonly model = signal<{
    stay: OrigamiDateRange | null;
    holidays: readonly string[];
    expiry: string | null;
  }>({ stay: { start: "2026-10-05", end: "2026-10-09" }, holidays: [], expiry: "2026-10" });
  readonly policy = signal<Policy>("none");
  readonly modes = form(this.model, (path) => {
    readonly(path.stay, () => this.policy() === "readonly");
    readonly(path.holidays, () => this.policy() === "readonly");
    readonly(path.expiry, () => this.policy() === "readonly");
    disabled(path.stay, () => this.policy() === "disabled");
    disabled(path.holidays, () => this.policy() === "disabled");
    disabled(path.expiry, () => this.policy() === "disabled");
  });
  readonly raOpen = signal(false);
  readonly raView = signal<CalendarView>("days");
  readonly raValueChanges = signal(0);
  readonly raTouches = signal(0);
  readonly muOpen = signal(false);
  readonly muValueChanges = signal(0);
  readonly muTouches = signal(0);
  readonly moOpen = signal(false);
  readonly moView = signal<"months" | "years">("months");
  readonly moValueChanges = signal(0);
  readonly moTouches = signal(0);
  readonly mismatch = signal(false);
  readonly mxValue = signal<string | null>(null);
  readonly mxDay = signal<string | null>(null);
  readonly mxOpen = signal(false);

  rangeText(range: OrigamiDateRange | null): string {
    if (range === null) {
      return "null";
    }

    return `${range.start} ${range.end}`;
  }
}
