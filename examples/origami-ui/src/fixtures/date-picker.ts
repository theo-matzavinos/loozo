import { Component, input, signal } from "@angular/core";
import { FormField, disabled, form, readonly, required, submit } from "@angular/forms/signals";
import {
  OrigamiCalendar,
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiCalendarNext,
  OrigamiCalendarPrevious,
  OrigamiCalendarRange,
} from "@loozo/origami-ui/calendar";
import type { OrigamiDateRange } from "@loozo/origami-ui/calendar";
import { OrigamiDateFieldInput, OrigamiDateFieldSegment } from "@loozo/origami-ui/date-field";
import {
  OrigamiDatePicker,
  OrigamiDatePickerContent,
  OrigamiDatePickerTrigger,
} from "@loozo/origami-ui/date-picker";
import type { OrigamiDatePickerState } from "@loozo/origami-ui/date-picker";
import {
  OrigamiDialog,
  OrigamiDialogContent,
  OrigamiDialogTrigger,
} from "@loozo/origami-ui/dialog";
import { OrigamiField, OrigamiFieldError, OrigamiFieldLabel } from "@loozo/origami-ui/field";
import { CalendarViewRows } from "./calendar-views.js";
import { DatePickerModes } from "./date-picker-modes.js";
import {
  DatePickerPrecedenceExisting,
  DatePickerPrecedenceFactory,
} from "./date-picker-precedence.js";
import { DatePickerModesPrecedence } from "./date-picker-modes-precedence.js";

// Date picker cases DP1–DP17 and DP27 (section 27); DP18–DP26 are in date-picker-modes.ts and
// date-picker-modes-precedence.ts, mounted at the end. Controls the tests use as script actions
// are buttons; every cell carries its date as `data-date`. Every Calendar shows 27 October 2026
// as today.

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

/** A Trigger's text rendered in a child component's view. */
@Component({
  selector: "date-picker-label",
  template: `
    @if (value(); as day) {
      <span>{{ day }}</span>
    } @else {
      <span>Choose a date</span>
    }
  `,
})
export class DatePickerLabel {
  readonly value = input<string | null>(null);
}

@Component({
  selector: "date-picker-fixture",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldError,
    OrigamiDatePicker,
    OrigamiDatePickerTrigger,
    OrigamiDatePickerContent,
    OrigamiDateFieldInput,
    OrigamiDateFieldSegment,
    OrigamiCalendar,
    OrigamiCalendarRange,
    OrigamiCalendarGrid,
    OrigamiCalendarHeading,
    OrigamiCalendarPrevious,
    OrigamiCalendarNext,
    OrigamiDialog,
    OrigamiDialogTrigger,
    OrigamiDialogContent,
    CalendarViewRows,
    DatePickerLabel,
    DatePickerPrecedenceFactory,
    DatePickerPrecedenceExisting,
    DatePickerModes,
    DatePickerModesPrecedence,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach date picker behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h2>Trigger first, Signal Forms</h2>
      <button type="button" data-testid="a-before">Before</button>
      <div ogField data-testid="a-field">
        <span ogFieldLabel id="a-label">Valid from</span>
        <div
          ogDatePicker
          #a="ogDatePicker"
          data-testid="a-root"
          [formField]="dates.a"
          [(open)]="aOpen"
          (touch)="aTouches.update(increment)"
        >
          <button ogDatePickerTrigger data-testid="a-trigger">
            {{ a.state.value() ?? "Choose a date" }}
          </button>
          <div ogDatePickerContent class="panel" data-testid="a-content">
            <div
              ogCalendar
              #aCal="ogCalendar"
              today="2026-10-27"
              locale="en-US"
              [(month)]="aMonth"
              [(view)]="aView"
            >
              <button ogCalendarPrevious aria-label="Previous" data-testid="a-previous">‹</button>
              <span ogCalendarHeading data-testid="a-heading">{{ aCal.state.heading() }}</span>
              <button type="button" data-testid="a-years" (click)="aView.set('years')">Choose a year</button>
              <button ogCalendarNext aria-label="Next" data-testid="a-next">›</button>
              <table
                ogCalendarGrid
                calendarViewRows
                data-testid="a-grid"
                [view]="aCal.state.view()"
                [weeks]="aCal.state.weeks()"
                [months]="aCal.state.months()"
                [years]="aCal.state.years()"
              ></table>
            </div>
          </div>
        </div>
        <div class="error-slot">
          @if (dates.a().touched() && dates.a().invalid()) {
            <span ogFieldError data-testid="a-error">Choose a date</span>
          }
        </div>
      </div>
      <button type="button" data-testid="a-after">After</button>
      <button type="button" data-testid="a-focus" (click)="dates.a().focusBoundControl()">
        Focus the bound control
      </button>
      <button type="button" data-testid="a-submit" (click)="send()">Submit</button>
      <button type="button" data-testid="a-write" (click)="write('2026-12-24')">
        Write 24 December 2026
      </button>
      <button type="button" data-testid="a-clear" (click)="a.clear()">Clear</button>
      <button type="button" data-testid="a-open-write" (click)="aOpen.set(true)">Open</button>
      <output data-testid="a-value">{{ model().a ?? "null" }}</output>
      <output data-testid="a-open">{{ aOpen() }}</output>
      <output data-testid="a-month">{{ aMonth() ?? "null" }}</output>
      <output data-testid="a-view">{{ aView() }}</output>
      <output data-testid="a-touched">{{ dates.a().touched() }}</output>
      <output data-testid="a-touches">{{ aTouches() }}</output>
      <output data-testid="a-segments">{{ a.state.segments().length }}</output>
    </section>

    <section>
      <h2>Field shape: segments and the Trigger in the date field's Input, Signal Forms</h2>
      <button type="button" data-testid="f-before">Before</button>
      <div ogField data-testid="f-field">
        <span ogFieldLabel id="f-label">Date of birth</span>
        <div
          ogDatePicker
          #f="ogDatePicker"
          data-testid="f-root"
          locale="en-US"
          [formField]="dates.f"
          [(open)]="fOpen"
          (valueChange)="fValueChanges.update(increment)"
          (touch)="fTouches.update(increment)"
        >
          <div ogDateFieldInput data-testid="f-input">
            @for (part of f.state.segments(); track part.key) {
              @if (part.type === "literal") {
                <span aria-hidden="true" data-literal>{{ part.text }}</span>
              } @else {
                <span [ogDateFieldSegment]="part.type" [attr.data-segment]="part.type"></span>
              }
            }
            <button ogDatePickerTrigger aria-label="Choose date" data-testid="f-trigger">▾</button>
          </div>
          <div ogDatePickerContent align="end" class="panel" data-testid="f-content">
            <div ogCalendar #fCal="ogCalendar" today="2026-10-27" locale="en-US" [(month)]="fMonth">
              <button ogCalendarPrevious aria-label="Previous" data-testid="f-previous">‹</button>
              <span ogCalendarHeading data-testid="f-heading">{{ fCal.state.heading() }}</span>
              <button ogCalendarNext aria-label="Next" data-testid="f-next">›</button>
              <table
                ogCalendarGrid
                calendarViewRows
                data-testid="f-grid"
                [view]="fCal.state.view()"
                [weeks]="fCal.state.weeks()"
                [months]="fCal.state.months()"
                [years]="fCal.state.years()"
              ></table>
            </div>
          </div>
        </div>
      </div>
      <button type="button" data-testid="f-after">After</button>
      <button type="button" data-testid="f-focus" (click)="dates.f().focusBoundControl()">
        Focus the bound control
      </button>
      <output data-testid="f-value">{{ model().f ?? "null" }}</output>
      <output data-testid="f-open">{{ fOpen() }}</output>
      <output data-testid="f-month">{{ fMonth() ?? "null" }}</output>
      <output data-testid="f-parse">{{ parse(f.state) }}</output>
      <output data-testid="f-errors">{{ errors() }}</output>
      <output data-testid="f-value-changes">{{ fValueChanges() }}</output>
      <output data-testid="f-touched">{{ dates.f().touched() }}</output>
      <output data-testid="f-touches">{{ fTouches() }}</output>
    </section>

    <section>
      <h2>Content first, text in an embedded view</h2>
      <div ogField data-testid="b-field">
        <span ogFieldLabel id="b-label">Valid until</span>
        <div
          ogDatePicker
          #b="ogDatePicker"
          data-testid="b-root"
          [formField]="dates.b"
          [(open)]="bOpen"
          (valueChange)="bValueChanges.update(increment)"
          (touch)="bTouches.update(increment)"
        >
          <div ogDatePickerContent class="panel" data-testid="b-content">
            <div ogCalendar #bCal="ogCalendar" today="2026-10-27" locale="en-US">
              <button ogCalendarPrevious aria-label="Previous">‹</button>
              <span ogCalendarHeading>{{ bCal.state.heading() }}</span>
              <button ogCalendarNext aria-label="Next">›</button>
              <table
                ogCalendarGrid
                calendarViewRows
                data-testid="b-grid"
                [view]="bCal.state.view()"
                [weeks]="bCal.state.weeks()"
                [months]="bCal.state.months()"
                [years]="bCal.state.years()"
              ></table>
            </div>
          </div>
          <button ogDatePickerTrigger data-testid="b-trigger">
            @if (b.state.value(); as value) {
              <span>{{ value }}</span>
            } @else {
              <span>Choose a date</span>
            }
          </button>
        </div>
      </div>
      <button type="button" data-testid="b-after">After</button>
      <output data-testid="b-value">{{ model().b ?? "null" }}</output>
      <output data-testid="b-open">{{ bOpen() }}</output>
      <output data-testid="b-value-changes">{{ bValueChanges() }}</output>
      <output data-testid="b-touches">{{ bTouches() }}</output>
    </section>

    <section>
      <h2>Text in a child component, outside a Field, Calendar gated by Content's retention</h2>
      <div
        ogDatePicker
        #c="ogDatePicker"
        data-testid="c-root"
        [(value)]="cValue"
        [(open)]="cOpen"
        [disabled]="cDisabled()"
        (touch)="cTouches.update(increment)"
      >
        <button ogDatePickerTrigger data-testid="c-trigger">
          <date-picker-label [value]="c.state.value()" />
        </button>
        <div
          ogDatePickerContent
          #cContent="ogDatePickerContent"
          class="panel"
          data-testid="c-content"
        >
          @if (cContent.state.open()) {
            <div ogCalendar #cCal="ogCalendar" today="2026-10-27" locale="en-US">
              <span ogCalendarHeading>{{ cCal.state.heading() }}</span>
              <table
                ogCalendarGrid
                calendarViewRows
                data-testid="c-grid"
                [view]="cCal.state.view()"
                [weeks]="cCal.state.weeks()"
                [months]="cCal.state.months()"
                [years]="cCal.state.years()"
              ></table>
            </div>
          }
        </div>
      </div>
      <output data-testid="c-value">{{ cValue() ?? "null" }}</output>
      <output data-testid="c-open">{{ cOpen() }}</output>
      <output data-testid="c-touches">{{ cTouches() }}</output>
      <button type="button" data-testid="c-disable" (click)="cDisabled.set(true)">Disable</button>
      <button type="button" data-testid="c-enable" (click)="cDisabled.set(false)">Enable</button>
    </section>

    <section>
      <h2>Calendar gated by Content's retention, month and view bound, authored elsewhere</h2>
      <div ogDatePicker data-testid="e-root" [(value)]="eValue" [(open)]="eOpen">
        <button ogDatePickerTrigger data-testid="e-trigger">{{ eValue() ?? "Choose a date" }}</button>
        <div
          ogDatePickerContent
          #eContent="ogDatePickerContent"
          class="panel"
          data-testid="e-content"
        >
          @if (eContent.state.open()) {
            <div
              ogCalendar
              #eCal="ogCalendar"
              today="2026-10-27"
              locale="en-US"
              [(month)]="eMonth"
              [(view)]="eView"
            >
              <button ogCalendarNext aria-label="Next" data-testid="e-next">›</button>
              <span ogCalendarHeading data-testid="e-heading">{{ eCal.state.heading() }}</span>
              <button type="button" data-testid="e-years" (click)="eView.set('years')">Choose a year</button>
              <table
                ogCalendarGrid
                calendarViewRows
                data-testid="e-grid"
                [view]="eCal.state.view()"
                [weeks]="eCal.state.weeks()"
                [months]="eCal.state.months()"
                [years]="eCal.state.years()"
              ></table>
            </div>
          }
        </div>
      </div>
      <output data-testid="e-open">{{ eOpen() }}</output>
      <output data-testid="e-month">{{ eMonth() ?? "null" }}</output>
      <output data-testid="e-view">{{ eView() }}</output>
    </section>

    <section>
      <h2>Readonly and disabled by the form</h2>
      <div ogField>
        <span ogFieldLabel id="r-label">Readonly date</span>
        <div ogDatePicker #r="ogDatePicker" data-testid="r-root" [formField]="dates.r" [(open)]="rOpen">
          <button ogDatePickerTrigger data-testid="r-trigger">{{ r.state.value() }}</button>
          <div ogDatePickerContent class="panel" data-testid="r-content">
            <div ogCalendar #rCal="ogCalendar" today="2026-10-27" locale="en-US">
              <table
                ogCalendarGrid
                calendarViewRows
                data-testid="r-grid"
                [view]="rCal.state.view()"
                [weeks]="rCal.state.weeks()"
                [months]="rCal.state.months()"
                [years]="rCal.state.years()"
              ></table>
            </div>
          </div>
        </div>
      </div>
      <output data-testid="r-value">{{ model().r ?? "null" }}</output>
      <output data-testid="r-open">{{ rOpen() }}</output>
      <div ogField>
        <span ogFieldLabel>Disabled date</span>
        <div ogDatePicker #d="ogDatePicker" data-testid="d-root" [formField]="dates.d" [(open)]="dOpen">
          <button ogDatePickerTrigger data-testid="d-trigger">{{ d.state.value() }}</button>
          <div ogDatePickerContent class="panel" data-testid="d-content">
            <div ogCalendar #dCal="ogCalendar" today="2026-10-27" locale="en-US">
              <table
                ogCalendarGrid
                calendarViewRows
                data-testid="d-grid"
                [view]="dCal.state.view()"
                [weeks]="dCal.state.weeks()"
                [months]="dCal.state.months()"
                [years]="dCal.state.years()"
              ></table>
            </div>
          </div>
        </div>
      </div>
      <output data-testid="d-open">{{ dOpen() }}</output>
      <output data-testid="d-state">{{ d.state.disabled() }} {{ r.state.readonly() }}</output>
      <button type="button" data-testid="d-open-write" (click)="dOpen.set(true)">Open</button>
      <button type="button" data-testid="d-close-write" (click)="dOpen.set(false)">Close</button>
    </section>

    <section>
      <h2>Content names</h2>
      <div ogDatePicker data-testid="n1-root">
        <button ogDatePickerTrigger aria-label="Start date" data-testid="n1-trigger">Pick</button>
        <div ogDatePickerContent class="panel" data-testid="n1-content"></div>
      </div>
      <div ogDatePicker data-testid="n2-root">
        <button ogDatePickerTrigger aria-label="End date" data-testid="n2-trigger">Pick</button>
        <div ogDatePickerContent aria-label="Calendar" class="panel" data-testid="n2-content"></div>
      </div>
      <span id="n3-name">Return date</span>
      <div ogDatePicker data-testid="n3-root">
        <button ogDatePickerTrigger aria-labelledby="n3-name" data-testid="n3-trigger">
          Pick
        </button>
        <div ogDatePickerContent class="panel" data-testid="n3-content"></div>
      </div>
    </section>

    <section>
      <h2>In a Dialog</h2>
      <div ogDialog [(open)]="dialogOpen">
        <button ogDialogTrigger data-testid="dialog-trigger">Open dialog</button>
        <dialog ogDialogContent aria-label="Travel" data-testid="dialog-content">
          <div ogDatePicker #g="ogDatePicker" data-testid="g-root" [(value)]="gValue" [(open)]="gOpen">
            <button ogDatePickerTrigger aria-label="Departure" data-testid="g-trigger">
              {{ g.state.value() ?? "Choose" }}
            </button>
            <div ogDatePickerContent class="panel" data-testid="g-content">
              <div
                ogCalendar
                #gCal="ogCalendar"
                today="2026-10-27"
                locale="en-US"
                [(view)]="gView"
              >
                <span ogCalendarHeading>{{ gCal.state.heading() }}</span>
                <button type="button" data-testid="g-years" (click)="gView.set('years')">Choose a year</button>
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
    </section>

    <section>
      <h2>A Calendar of another mode</h2>
      <button type="button" data-testid="m-mount" (click)="mismatch.set(true)">
        Mount a range Calendar in a date picker
      </button>
      @if (mismatch()) {
        <div ogDatePicker data-testid="m-root" [(value)]="mValue" [(open)]="mOpen">
          <button ogDatePickerTrigger data-testid="m-trigger">{{ mValue() ?? "Choose" }}</button>
          <div ogDatePickerContent class="panel" data-testid="m-content">
            <div
              ogCalendarRange
              #mCal="ogCalendarRange"
              data-testid="m-calendar"
              today="2026-10-27"
              locale="en-US"
              [(value)]="mRange"
            >
              <table
                ogCalendarGrid
                calendarViewRows
                data-testid="m-grid"
                [view]="mCal.state.view()"
                [weeks]="mCal.state.weeks()"
                [months]="mCal.state.months()"
                [years]="mCal.state.years()"
              ></table>
            </div>
          </div>
        </div>
        <output data-testid="m-value">{{ mValue() ?? "null" }}</output>
        <output data-testid="m-range">{{ mRange()?.start ?? "null" }} {{ mRange()?.end ?? "null" }}</output>
        <output data-testid="m-open">{{ mOpen() }}</output>
      }
    </section>

    <section>
      <h2>A focusable disabled Trigger, in both shapes</h2>
      <button type="button" data-testid="x-before">Before</button>
      <div
        ogDatePicker
        data-testid="x-root"
        [(value)]="xValue"
        [(open)]="xOpen"
        [disabled]="xDisabled()"
        (touch)="xTouches.update(increment)"
      >
        <button
          ogDatePickerTrigger
          focusableWhenDisabled
          aria-label="Valid from"
          data-testid="x-trigger"
          (click)="xClicks.update(increment)"
        >
          {{ xValue() ?? "Choose a date" }}
        </button>
        <div ogDatePickerContent class="panel" data-testid="x-content">
          <div ogCalendar #xCal="ogCalendar" today="2026-10-27" locale="en-US">
            <table
              ogCalendarGrid
              calendarViewRows
              data-testid="x-grid"
              [view]="xCal.state.view()"
              [weeks]="xCal.state.weeks()"
              [months]="xCal.state.months()"
              [years]="xCal.state.years()"
            ></table>
          </div>
        </div>
      </div>
      <button type="button" data-testid="x-after">After</button>
      <output data-testid="x-open">{{ xOpen() }}</output>
      <output data-testid="x-clicks">{{ xClicks() }}</output>
      <output data-testid="x-touches">{{ xTouches() }}</output>
      <button type="button" data-testid="x-disable" (click)="xDisabled.set(true)">Disable</button>
      <button type="button" data-testid="x-enable" (click)="xDisabled.set(false)">Enable</button>

      <button type="button" data-testid="xf-before">Before</button>
      <div
        ogDatePicker
        #xf="ogDatePicker"
        data-testid="xf-root"
        locale="en-US"
        [(value)]="xfValue"
        [(open)]="xfOpen"
        [disabled]="xfDisabled()"
        (touch)="xfTouches.update(increment)"
      >
        <div ogDateFieldInput aria-label="Valid until" data-testid="xf-input">
          @for (part of xf.state.segments(); track part.key) {
            @if (part.type === "literal") {
              <span aria-hidden="true">{{ part.text }}</span>
            } @else {
              <span [ogDateFieldSegment]="part.type" [attr.data-segment]="part.type"></span>
            }
          }
          <button
            ogDatePickerTrigger
            focusableWhenDisabled
            aria-label="Choose date"
            data-testid="xf-trigger"
            (click)="xfClicks.update(increment)"
          >
            ▾
          </button>
        </div>
        <div ogDatePickerContent align="end" class="panel" data-testid="xf-content">
          <div ogCalendar #xfCal="ogCalendar" today="2026-10-27" locale="en-US">
            <table
              ogCalendarGrid
              calendarViewRows
              data-testid="xf-grid"
              [view]="xfCal.state.view()"
              [weeks]="xfCal.state.weeks()"
              [months]="xfCal.state.months()"
              [years]="xfCal.state.years()"
            ></table>
          </div>
        </div>
      </div>
      <button type="button" data-testid="xf-after">After</button>
      <output data-testid="xf-open">{{ xfOpen() }}</output>
      <output data-testid="xf-clicks">{{ xfClicks() }}</output>
      <output data-testid="xf-touches">{{ xfTouches() }}</output>
      <button type="button" data-testid="xf-disable" (click)="xfDisabled.set(true)">Disable</button>
      <button type="button" data-testid="xf-enable" (click)="xfDisabled.set(false)">Enable</button>
    </section>

    <date-picker-precedence-factory />
    <date-picker-precedence-existing />
    <date-picker-modes />
    <date-picker-modes-precedence />
    <div class="spacer"></div>
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
    .error-slot {
      /* The Error appears without moving what follows it. */
      min-block-size: 1.5em;
    }
    .spacer {
      block-size: 50vh;
    }
  `,
})
export class DatePickerFixture {
  readonly increment = increment;
  readonly attached = signal(false);
  readonly model = signal<{
    a: string | null;
    b: string | null;
    r: string | null;
    d: string | null;
    f: string | null;
  }>({ a: null, b: "2026-10-15", r: "2026-10-15", d: "2026-10-15", f: "2026-10-27" });
  readonly dates = form(this.model, (path) => {
    required(path.a);
    required(path.f);
    readonly(path.r);
    disabled(path.d);
  });
  readonly aOpen = signal(false);
  readonly aMonth = signal<string | null>(null);
  readonly aView = signal<CalendarView>("days");
  readonly aTouches = signal(0);
  readonly fOpen = signal(false);
  readonly fMonth = signal<string | null>(null);
  readonly fValueChanges = signal(0);
  readonly fTouches = signal(0);
  readonly bOpen = signal(false);
  readonly bValueChanges = signal(0);
  readonly bTouches = signal(0);
  readonly cValue = signal<string | null>(null);
  readonly cOpen = signal(false);
  readonly cDisabled = signal(false);
  readonly cTouches = signal(0);
  readonly eValue = signal<string | null>(null);
  readonly eOpen = signal(false);
  readonly eMonth = signal<string | null>("2020-01");
  readonly eView = signal<CalendarView>("years");
  readonly rOpen = signal(false);
  readonly dOpen = signal(false);
  readonly dialogOpen = signal(false);
  readonly gValue = signal<string | null>("2026-10-15");
  readonly gOpen = signal(false);
  readonly gView = signal<CalendarView>("days");
  readonly mismatch = signal(false);
  readonly mValue = signal<string | null>(null);
  readonly mOpen = signal(false);
  readonly mRange = signal<OrigamiDateRange | null>(null);
  readonly xValue = signal<string | null>(null);
  readonly xOpen = signal(false);
  readonly xDisabled = signal(true);
  readonly xClicks = signal(0);
  readonly xTouches = signal(0);
  readonly xfValue = signal<string | null>("2026-10-27");
  readonly xfOpen = signal(false);
  readonly xfDisabled = signal(true);
  readonly xfClicks = signal(0);
  readonly xfTouches = signal(0);

  /** The form field f's errors, the date field's parse errors among them. */
  errors(): string {
    return kinds(this.dates.f().errors());
  }

  parse(state: OrigamiDatePickerState): string {
    return kinds(state.parseErrors());
  }

  write(value: string): void {
    this.model.update((model) => ({ ...model, a: value }));
  }

  async send(): Promise<void> {
    await submit(this.dates, async () => undefined);
  }
}
