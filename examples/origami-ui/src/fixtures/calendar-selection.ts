import { Component, computed, input, signal } from "@angular/core";
import {
  OrigamiCalendarCell,
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiCalendarMultiple,
  OrigamiCalendarNext,
  OrigamiCalendarPrevious,
  OrigamiCalendarRange,
} from "@loozo/origami-ui/calendar";
import type { OrigamiCalendarDayRecord, OrigamiDateRange } from "@loozo/origami-ui/calendar";
import { OrigamiDialog, OrigamiDialogContent, OrigamiDialogTitle } from "@loozo/origami-ui/dialog";

// Calendar cases CA23–CA28 and CA30–CA33: several days and a range; CA29 is in
// calendar-selection-field.ts.
// Controls the tests use as script actions are buttons; every cell carries its day as
// `data-date`, so a test can find it.

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

/** A range as text: "start end", or "null". */
export function rangeText(range: OrigamiDateRange | null): string {
  if (range === null) {
    return "null";
  }

  return `${range.start} ${range.end}`;
}

/**
 * The weekday header and the days of any Calendar root, from its State, rendered in a child
 * component's view: the cells reach their root through the host element's injector. Every cell
 * carries its day as `data-date`.
 */
@Component({
  selector: "table[calendarDayRows]",
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
          @for (day of week; track day.date) {
            <td ogCalendarCell [date]="day.date" [attr.data-date]="day.date">{{ day.label }}</td>
          }
        </tr>
      }
    </tbody>
  `,
})
export class CalendarDayRows {
  readonly weekdays =
    input.required<readonly { readonly short: string; readonly long: string }[]>();
  readonly weeks = input.required<readonly (readonly OrigamiCalendarDayRecord[])[]>();
}

@Component({
  selector: "calendar-selection-cases",
  imports: [
    OrigamiCalendarMultiple,
    OrigamiCalendarRange,
    OrigamiCalendarGrid,
    OrigamiCalendarHeading,
    OrigamiCalendarPrevious,
    OrigamiCalendarNext,
    OrigamiDialog,
    OrigamiDialogContent,
    OrigamiDialogTitle,
    CalendarDayRows,
  ],
  template: `
    <section>
      <h2>Several days</h2>
      <div
        ogCalendarMultiple
        #m="ogCalendarMultiple"
        data-testid="m-root"
        today="2026-10-27"
        locale="en-US"
        [(value)]="mValue"
        [(month)]="mMonth"
        (valueChange)="mOutputs.update(increment)"
      >
        <h3 ogCalendarHeading data-testid="m-heading">{{ m.state.heading() }}</h3>
        <table
          ogCalendarGrid
          calendarDayRows
          data-testid="m-grid"
          [weekdays]="m.state.weekdays()"
          [weeks]="m.state.weeks()"
        ></table>
      </div>
      <output data-testid="m-value">{{ mValue().join(" ") }}</output>
      <output data-testid="m-state">{{ m.state.value().join(" ") }} {{ m.state.month() }}</output>
      <output data-testid="m-outputs">{{ mOutputs() }}</output>
      <output data-testid="m-month">{{ mMonth() ?? "null" }}</output>
      <button type="button" data-testid="m-write" (click)="writeDays()">
        Write 27/10/2026, 20 October and 25 December
      </button>
      <button type="button" data-testid="m-write-unsorted" (click)="writeUnsortedDays()">
        Write 20 then 6 October
      </button>
      <button type="button" data-testid="m-write-mixed" (click)="writeMixedDays()">
        Write 20 October, 27/10/2026, 25 December and 6 October twice
      </button>
      <button type="button" data-testid="m-write-spread" (click)="writeSpreadDays()">
        Write 20 October and 25 December
      </button>
      <button type="button" data-testid="m-follow" (click)="mMonth.set(null)">
        Follow the value
      </button>
    </section>

    <section>
      <h2>A range</h2>
      <button type="button" data-testid="r-before">Before the range</button>
      <div
        ogCalendarRange
        #r="ogCalendarRange"
        data-testid="r-root"
        today="2026-10-27"
        locale="en-US"
        [(value)]="rValue"
        [dateDisabled]="rDateDisabled()"
        [minDate]="rMinDate()"
        [maxDate]="rMaxDate()"
        [readonly]="rReadonly()"
        [disabled]="rDisabled()"
        (valueChange)="rOutputs.update(increment)"
      >
        <button ogCalendarPrevious aria-label="Previous month" data-testid="r-previous">‹</button>
        <h3 ogCalendarHeading data-testid="r-heading">{{ r.state.heading() }}</h3>
        <button ogCalendarNext aria-label="Next month" data-testid="r-next">›</button>
        <table
          ogCalendarGrid
          calendarDayRows
          data-testid="r-grid"
          [weekdays]="r.state.weekdays()"
          [weeks]="r.state.weeks()"
        ></table>
      </div>
      <button type="button" data-testid="r-after">After the range</button>
      <output data-testid="r-value">{{ rText() }}</output>
      <output data-testid="r-state">{{ rStateText(r.state.value()) }} {{ r.state.month() }}</output>
      <output data-testid="r-anchor">{{ r.state.anchor() ?? "null" }}</output>
      <output data-testid="r-outputs">{{ rOutputs() }}</output>
      <button type="button" data-testid="r-write" (click)="writeRange()">
        Write 2–6 November
      </button>
      <button type="button" data-testid="r-write-reversed" (click)="writeReversedRange()">
        Write 20 back to 10 October
      </button>
      <button type="button" data-testid="r-weekends" (click)="rDateDisabled.set(weekend)">
        Disable weekends
      </button>
      <button type="button" data-testid="r-min" (click)="rMinDate.set('2026-10-21')">
        Start the range on 21 October or later
      </button>
      <button type="button" data-testid="r-max" (click)="rMaxDate.set('2026-10-27')">
        End the range on 27 October or earlier
      </button>
      <button type="button" data-testid="r-readonly" (click)="rReadonly.update(flip)">
        Make the range readonly
      </button>
      <button type="button" data-testid="r-disable" (click)="rDisabled.update(flip)">
        Disable the range
      </button>
    </section>

    <section>
      <h2>A range in a dialog</h2>
      <button type="button" data-testid="d-open" (click)="dOpen.set(true)">Open the dialog</button>
      <output data-testid="d-open-state">{{ dOpen() }}</output>
      <output data-testid="d-anchor">{{ d.state.anchor() ?? "null" }}</output>
      <div ogDialog [(open)]="dOpen">
        <dialog ogDialogContent data-testid="d-content">
          <h3 ogDialogTitle>Dates</h3>
          <div
            ogCalendarRange
            #d="ogCalendarRange"
            data-testid="d-root"
            today="2026-10-27"
            locale="en-US"
          >
            <button ogCalendarPrevious aria-label="Previous month" data-testid="d-previous">
              ‹
            </button>
            <h4 ogCalendarHeading>{{ d.state.heading() }}</h4>
            <button ogCalendarNext aria-label="Next month" data-testid="d-next">›</button>
            <table
              ogCalendarGrid
              calendarDayRows
              [weekdays]="d.state.weekdays()"
              [weeks]="d.state.weeks()"
            ></table>
          </div>
        </dialog>
      </div>
    </section>
  `,
})
export class CalendarSelectionCases {
  readonly mValue = signal<readonly string[]>(["2026-10-06", "2026-10-20"]);
  readonly mMonth = signal<string | null>(null);
  readonly mOutputs = signal(0);
  readonly rValue = signal<OrigamiDateRange | null>({ start: "2026-10-12", end: "2026-10-16" });
  readonly rText = computed(() => rangeText(this.rValue()));
  readonly rDateDisabled = signal<(date: string) => boolean>(noneDisabled);
  readonly rMinDate = signal<string | null>(null);
  readonly rMaxDate = signal<string | null>(null);
  readonly rReadonly = signal(false);
  readonly rDisabled = signal(false);
  readonly rOutputs = signal(0);
  readonly dOpen = signal(false);

  readonly increment = increment;
  readonly flip = flip;
  readonly weekend = weekend;
  readonly rStateText = rangeText;

  writeDays(): void {
    this.mValue.set(["27/10/2026", "2026-10-20", "2026-12-25"]);
  }

  writeUnsortedDays(): void {
    this.mValue.set(["2026-10-20", "2026-10-06"]);
  }

  writeMixedDays(): void {
    this.mValue.set(["2026-10-20", "27/10/2026", "2026-12-25", "2026-10-06", "2026-10-06"]);
  }

  writeSpreadDays(): void {
    this.mValue.set(["2026-10-20", "2026-12-25"]);
  }

  writeRange(): void {
    this.rValue.set({ start: "2026-11-02", end: "2026-11-06" });
  }

  writeReversedRange(): void {
    this.rValue.set({ start: "2026-10-20", end: "2026-10-10" });
  }
}
