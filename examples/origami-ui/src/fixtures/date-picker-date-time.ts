import { Component, signal } from "@angular/core";
import { FormField, form } from "@angular/forms/signals";
import {
  OrigamiCalendar,
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
import type { OrigamiDateTimePickerState } from "@loozo/origami-ui/date-picker";
import {
  OrigamiDialog,
  OrigamiDialogContent,
  OrigamiDialogTrigger,
} from "@loozo/origami-ui/dialog";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";
import { CalendarViewRows } from "./calendar-views.js";
import {
  DateTimePickerPrecedenceExisting,
  DateTimePickerPrecedenceFactory,
} from "./date-picker-date-time-precedence.js";

// Date-time picker cases DP28–DP36 (section 27); DP37's replacements are in
// date-picker-date-time-precedence.ts, mounted at the end. Controls the tests use as script
// actions are buttons; every cell carries its date as `data-date` and every segment its unit as
// `data-segment`. Every Calendar shows 27 October 2026 as today.

type CalendarView = "days" | "months" | "years";

function increment(value: number): number {
  return value + 1;
}

function kinds(errors: readonly { readonly kind: string }[]): string {
  const names: string[] = [];

  for (const error of errors) {
    names.push(error.kind);
  }

  return names.join(",");
}

@Component({
  selector: "date-picker-date-time-fixture",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiDateTimePicker,
    OrigamiDatePickerTrigger,
    OrigamiDatePickerContent,
    OrigamiDateFieldInput,
    OrigamiDateFieldSegment,
    OrigamiCalendar,
    OrigamiCalendarGrid,
    OrigamiCalendarHeading,
    OrigamiCalendarPrevious,
    OrigamiCalendarNext,
    OrigamiDialog,
    OrigamiDialogTrigger,
    OrigamiDialogContent,
    CalendarViewRows,
    DateTimePickerPrecedenceFactory,
    DateTimePickerPrecedenceExisting,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach date-time picker behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h2>en-US, 12-hour, minute precision, Signal Forms</h2>
      <button type="button" data-testid="t-before">Before</button>
      <div ogField data-testid="t-field">
        <span ogFieldLabel id="t-label">Starts at</span>
        <div
          ogDateTimePicker
          #t="ogDateTimePicker"
          data-testid="t-root"
          locale="en-US"
          [formField]="dates.t"
          [(open)]="tOpen"
          (valueChange)="tValueChanges.update(increment)"
          (touch)="tTouches.update(increment)"
        >
          <div ogDateFieldInput data-testid="t-input">
            @for (part of t.state.segments(); track part.key) {
              @if (part.type === "literal") {
                <span aria-hidden="true" data-literal>{{ part.text }}</span>
              } @else {
                <span [ogDateFieldSegment]="part.type" [attr.data-segment]="part.type"></span>
              }
            }
            <button ogDatePickerTrigger aria-label="Choose date" data-testid="t-trigger">▾</button>
          </div>
          <div ogDatePickerContent align="end" class="panel" data-testid="t-content">
            <div ogCalendar #tCal="ogCalendar" today="2026-10-27" locale="en-US">
              <button ogCalendarPrevious aria-label="Previous" data-testid="t-previous">‹</button>
              <span ogCalendarHeading data-testid="t-heading">{{ tCal.state.heading() }}</span>
              <button ogCalendarNext aria-label="Next" data-testid="t-next">›</button>
              <table
                ogCalendarGrid
                calendarViewRows
                data-testid="t-grid"
                [view]="tCal.state.view()"
                [weeks]="tCal.state.weeks()"
                [months]="tCal.state.months()"
                [years]="tCal.state.years()"
              ></table>
            </div>
          </div>
        </div>
      </div>
      <button type="button" data-testid="t-after">After</button>
      <button type="button" data-testid="t-focus" (click)="dates.t().focusBoundControl()">
        Focus the bound control
      </button>
      <button type="button" data-testid="t-set" (click)="write('2026-10-27T09:30')">
        Write 27 October 2026, 09:30
      </button>
      <button type="button" data-testid="t-set-31" (click)="write('2026-10-31T09:30')">
        Write 31 October 2026, 09:30
      </button>
      <button type="button" data-testid="t-set-seconds" (click)="write('2026-10-27T09:30:15')">
        Write 27 October 2026, 09:30:15
      </button>
      <button type="button" data-testid="t-clear" (click)="t.clear()">Clear</button>
      <output data-testid="t-value">{{ model().t ?? "null" }}</output>
      <output data-testid="t-state-value">{{ t.state.value() ?? "null" }}</output>
      <output data-testid="t-open">{{ tOpen() }}</output>
      <output data-testid="t-parse">{{ parse(t.state) }}</output>
      <output data-testid="t-errors">{{ errors() }}</output>
      <output data-testid="t-value-changes">{{ tValueChanges() }}</output>
      <output data-testid="t-touched">{{ dates.t().touched() }}</output>
      <output data-testid="t-touches">{{ tTouches() }}</output>
    </section>

    <section>
      <h2>en-GB, 24-hour, second precision</h2>
      <div ogField data-testid="s-field">
        <span ogFieldLabel id="s-label">Ends at</span>
        <div
          ogDateTimePicker
          #s="ogDateTimePicker"
          data-testid="s-root"
          locale="en-GB"
          precision="second"
          [(value)]="sValue"
          [(open)]="sOpen"
          (valueChange)="sValueChanges.update(increment)"
          (touch)="sTouches.update(increment)"
        >
          <div ogDateFieldInput data-testid="s-input">
            @for (part of s.state.segments(); track part.key) {
              @if (part.type === "literal") {
                <span aria-hidden="true" data-literal>{{ part.text }}</span>
              } @else {
                <span [ogDateFieldSegment]="part.type" [attr.data-segment]="part.type"></span>
              }
            }
            <button ogDatePickerTrigger aria-label="Choose date" data-testid="s-trigger">▾</button>
          </div>
          <div ogDatePickerContent align="end" class="panel" data-testid="s-content">
            <div ogCalendar #sCal="ogCalendar" today="2026-10-27" locale="en-GB">
              <span ogCalendarHeading data-testid="s-heading">{{ sCal.state.heading() }}</span>
              <table
                ogCalendarGrid
                calendarViewRows
                data-testid="s-grid"
                [view]="sCal.state.view()"
                [weeks]="sCal.state.weeks()"
                [months]="sCal.state.months()"
                [years]="sCal.state.years()"
              ></table>
            </div>
          </div>
        </div>
      </div>
      <button type="button" data-testid="s-after">After</button>
      <output data-testid="s-value">{{ sValue() ?? "null" }}</output>
      <output data-testid="s-open">{{ sOpen() }}</output>
      <output data-testid="s-parse">{{ parse(s.state) }}</output>
      <output data-testid="s-value-changes">{{ sValueChanges() }}</output>
      <output data-testid="s-touches">{{ sTouches() }}</output>
    </section>

    <section>
      <h2>In a Dialog</h2>
      <div ogDialog [(open)]="dialogOpen">
        <button ogDialogTrigger data-testid="dialog-trigger">Open dialog</button>
        <dialog ogDialogContent aria-label="Meeting" data-testid="dialog-content">
          <div ogDateTimePicker #g="ogDateTimePicker" data-testid="g-root" locale="en-US" [(value)]="gValue" [(open)]="gOpen">
            <div ogDateFieldInput aria-label="Meeting starts" data-testid="g-input">
              @for (part of g.state.segments(); track part.key) {
                @if (part.type === "literal") {
                  <span aria-hidden="true" data-literal>{{ part.text }}</span>
                } @else {
                  <span [ogDateFieldSegment]="part.type" [attr.data-segment]="part.type"></span>
                }
              }
              <button ogDatePickerTrigger aria-label="Choose date" data-testid="g-trigger">▾</button>
            </div>
            <div ogDatePickerContent class="panel" data-testid="g-content">
              <div
                ogCalendar
                #gCal="ogCalendar"
                today="2026-10-27"
                locale="en-US"
                [(view)]="gView"
              >
                <button type="button" data-testid="g-years" (click)="gView.set('years')">
                  <span ogCalendarHeading>{{ gCal.state.heading() }}</span>
                </button>
                <table
                  ogCalendarGrid
                  calendarViewRows
                  data-testid="g-grid"
                  [view]="gCal.state.view()"
                  [weeks]="gCal.state.weeks()"
                  [months]="gCal.state.months()"
                  [years]="gCal.state.years()"
                ></table>
              </div>
            </div>
          </div>
        </dialog>
      </div>
      <output data-testid="g-state">{{ dialogOpen() }} {{ gOpen() }} {{ gView() }}</output>
      <output data-testid="g-value">{{ gValue() ?? "null" }}</output>
    </section>

    <section>
      <h2>Replacement precedence</h2>
      <date-time-picker-precedence-factory />
      <date-time-picker-precedence-existing />
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
export class DatePickerDateTimeFixture {
  readonly increment = increment;
  readonly attached = signal(false);
  readonly model = signal<{ t: string | null }>({ t: null });
  readonly dates = form(this.model);
  readonly tOpen = signal(false);
  readonly tValueChanges = signal(0);
  readonly tTouches = signal(0);
  readonly sValue = signal<string | null>("2026-10-27T21:30:15");
  readonly sOpen = signal(false);
  readonly sValueChanges = signal(0);
  readonly sTouches = signal(0);
  readonly dialogOpen = signal(false);
  readonly gValue = signal<string | null>("2026-10-15T08:00");
  readonly gOpen = signal(false);
  readonly gView = signal<CalendarView>("days");

  /** The form field t's errors, the date-time field's parse errors among them. */
  errors(): string {
    return kinds(this.dates.t().errors());
  }

  parse(state: OrigamiDateTimePickerState): string {
    return kinds(state.parseErrors());
  }

  write(value: string): void {
    this.model.set({ t: value });
  }
}
