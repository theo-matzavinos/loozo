import { Component, Directive, InjectionToken, Service, inject, signal } from "@angular/core";
import {
  OrigamiCalendarGrid,
  OrigamiCalendarMultiple,
  OrigamiCalendarRange,
  OrigamiMonthCalendar,
} from "@loozo/origami-ui/calendar";
import type { OrigamiDateRange } from "@loozo/origami-ui/calendar";
import {
  OrigamiDatePickerContent,
  OrigamiDatePickerMultiple,
  OrigamiDatePickerMultipleOptions,
  OrigamiDatePickerMultipleState,
  OrigamiDatePickerRange,
  OrigamiDatePickerRangeOptions,
  OrigamiDatePickerRangeState,
  OrigamiDatePickerTrigger,
  OrigamiMonthPicker,
  OrigamiMonthPickerOptions,
  OrigamiMonthPickerState,
} from "@loozo/origami-ui/date-picker";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";
import { CalendarViewRows } from "./calendar-views.js";

// DP26 (O1, O3) for the range, multiple and month roots: a consumer composes each root through
// `hostDirectives`, exposing its own inputs with contradicting values, and replaces its Options
// with ordinary signals, by a factory in one case and an existing provider in the other. The
// Trigger and Content are the shared parts DP13 already covers.

const PickerCaseLabel = new InjectionToken<string>("date picker mode precedence case label");

/** The replacement policy signals every root shares, and the unused-output counter. */
abstract class PickerSettings {
  readonly label = inject(PickerCaseLabel);
  readonly open = signal(false);
  readonly disabled = signal(true);
  readonly readonly = signal(false);
  readonly unusedOutputs = signal(0);
  readonly increment = (value: number): number => value + 1;
}

@Service({ autoProvided: false })
export class RangePickerSettings extends PickerSettings {
  readonly value = signal<OrigamiDateRange | null>({ start: "2026-10-12", end: "2026-10-14" });
}

@Service({ autoProvided: false })
export class MultiplePickerSettings extends PickerSettings {
  readonly value = signal<readonly string[]>(["2026-10-15"]);
}

@Service({ autoProvided: false })
export class MonthPickerSettings extends PickerSettings {
  readonly value = signal<string | null>("2026-10");
}

const outputs = ["valueChange", "openChange"];
const inputs = ["value", "open", "disabled", "readonly"];

// ---- Range ----

@Directive({
  selector: "[precedenceFactoryRangePicker]",
  exportAs: "precedencePicker",
  hostDirectives: [{ directive: OrigamiDatePickerRange, inputs, outputs }],
  providers: [
    RangePickerSettings,
    OrigamiDatePickerRangeOptions.provideFactory(() => inject(RangePickerSettings)),
  ],
})
export class PrecedenceFactoryRangePicker {
  readonly settings = inject(RangePickerSettings);
  readonly state = inject(OrigamiDatePickerRangeState);
}

@Directive({
  selector: "[precedenceExistingRangePicker]",
  exportAs: "precedencePicker",
  hostDirectives: [{ directive: OrigamiDatePickerRange, inputs, outputs }],
  providers: [
    RangePickerSettings,
    OrigamiDatePickerRangeOptions.provideExisting(() => PrecedenceExistingRangePicker),
  ],
})
export class PrecedenceExistingRangePicker implements OrigamiDatePickerRangeOptions {
  readonly settings = inject(RangePickerSettings);
  readonly value = this.settings.value;
  readonly open = this.settings.open;
  readonly disabled = this.settings.disabled;
  readonly readonly = this.settings.readonly;
  readonly state = inject(OrigamiDatePickerRangeState);
}

// ---- Multiple ----

@Directive({
  selector: "[precedenceFactoryMultiplePicker]",
  exportAs: "precedencePicker",
  hostDirectives: [{ directive: OrigamiDatePickerMultiple, inputs, outputs }],
  providers: [
    MultiplePickerSettings,
    OrigamiDatePickerMultipleOptions.provideFactory(() => inject(MultiplePickerSettings)),
  ],
})
export class PrecedenceFactoryMultiplePicker {
  readonly settings = inject(MultiplePickerSettings);
  readonly state = inject(OrigamiDatePickerMultipleState);
}

@Directive({
  selector: "[precedenceExistingMultiplePicker]",
  exportAs: "precedencePicker",
  hostDirectives: [{ directive: OrigamiDatePickerMultiple, inputs, outputs }],
  providers: [
    MultiplePickerSettings,
    OrigamiDatePickerMultipleOptions.provideExisting(() => PrecedenceExistingMultiplePicker),
  ],
})
export class PrecedenceExistingMultiplePicker implements OrigamiDatePickerMultipleOptions {
  readonly settings = inject(MultiplePickerSettings);
  readonly value = this.settings.value;
  readonly open = this.settings.open;
  readonly disabled = this.settings.disabled;
  readonly readonly = this.settings.readonly;
  readonly state = inject(OrigamiDatePickerMultipleState);
}

// ---- Month ----

@Directive({
  selector: "[precedenceFactoryMonthPicker]",
  exportAs: "precedencePicker",
  hostDirectives: [{ directive: OrigamiMonthPicker, inputs, outputs }],
  providers: [
    MonthPickerSettings,
    OrigamiMonthPickerOptions.provideFactory(() => inject(MonthPickerSettings)),
  ],
})
export class PrecedenceFactoryMonthPicker {
  readonly settings = inject(MonthPickerSettings);
  readonly state = inject(OrigamiMonthPickerState);
}

@Directive({
  selector: "[precedenceExistingMonthPicker]",
  exportAs: "precedencePicker",
  hostDirectives: [{ directive: OrigamiMonthPicker, inputs, outputs }],
  providers: [
    MonthPickerSettings,
    OrigamiMonthPickerOptions.provideExisting(() => PrecedenceExistingMonthPicker),
  ],
})
export class PrecedenceExistingMonthPicker implements OrigamiMonthPickerOptions {
  readonly settings = inject(MonthPickerSettings);
  readonly value = this.settings.value;
  readonly open = this.settings.open;
  readonly disabled = this.settings.disabled;
  readonly readonly = this.settings.readonly;
  readonly state = inject(OrigamiMonthPickerState);
}

/**
 * One case: the root's own inputs contradict every replacement (`ownValue` too), and the bound
 * Calendar of the root's mode renders its rows.
 */
function pickerTemplate(root: string, ownValue: string, calendar: string, weeks: string): string {
  return `
  <div ogField>
    <span ogFieldLabel [id]="label + '-label'">Period</span>
    <div ${root} #root="precedencePicker" ${ownValue} [open]="true" [disabled]="false"
      [readonly]="true"
      (valueChange)="root.settings.unusedOutputs.update(root.settings.increment)"
      (openChange)="root.settings.unusedOutputs.update(root.settings.increment)">
      <button ogDatePickerTrigger data-co="trigger">{{ text(root.state.value()) }}</button>
      <div ogDatePickerContent class="surface" data-co="content">
        <div ${calendar} #cal="${calendar}" today="2026-10-27" locale="en-US">
          <table ogCalendarGrid calendarViewRows data-co="grid" [view]="cal.state.view()"
            ${weeks} [months]="cal.state.months()" [years]="cal.state.years()"></table>
        </div>
      </div>
    </div>
  </div>
  <output data-co="value">{{ text(root.settings.value()) }} {{ text(root.state.value()) }}</output>
  <output data-co="open">{{ root.settings.open() }} {{ root.state.open() }}</output>
  <output data-co="policy">{{ root.state.disabled() }} {{ root.state.readonly() }}</output>
  <output data-co="lower-policy">{{ cal.state.disabled() }}</output>
  <output data-co="unused-outputs">{{ root.settings.unusedOutputs() }}</output>
  <button type="button" data-co="disable" (click)="root.settings.disabled.set(!root.settings.disabled())">
    Disable
  </button>
  <button type="button" data-co="readonly" (click)="root.settings.readonly.set(!root.settings.readonly())">
    Readonly
  </button>
`;
}

const days = `[weeks]="cal.state.weeks()"`;

const pickerStyles = `
  :host { display: block; padding-block: 24px; margin-block-end: 24rem; }
  output { display: block; }
  .surface { box-sizing: border-box; margin: 0; padding: 8px;
    background: #333333; color: inherit; border: 1px solid #777777; }
`;

/** Shared readouts of every case. */
abstract class PickerCase {
  readonly label = inject(PickerCaseLabel);

  /** Any picker value as text: a range's ends, the days joined by commas, a month, or "null". */
  text(value: OrigamiDateRange | readonly string[] | string | null): string {
    if (value === null) {
      return "null";
    }

    if (typeof value === "string") {
      return value;
    }

    if ("start" in value) {
      return `${value.start}..${value.end}`;
    }

    return value.join(",");
  }
}

const shared = [
  OrigamiField,
  OrigamiFieldLabel,
  OrigamiDatePickerTrigger,
  OrigamiDatePickerContent,
  OrigamiCalendarGrid,
  CalendarViewRows,
];

@Component({
  selector: "date-picker-range-factory",
  imports: [...shared, OrigamiCalendarRange, PrecedenceFactoryRangePicker],
  providers: [{ provide: PickerCaseLabel, useValue: "range-factory" }],
  host: { "data-case": "range-factory" },
  template: pickerTemplate(
    "precedenceFactoryRangePicker",
    `[value]="{ start: '2026-01-05', end: '2026-01-06' }"`,
    "ogCalendarRange",
    days,
  ),
  styles: pickerStyles,
})
export class RangePickerFactoryCase extends PickerCase {}

@Component({
  selector: "date-picker-range-existing",
  imports: [...shared, OrigamiCalendarRange, PrecedenceExistingRangePicker],
  providers: [{ provide: PickerCaseLabel, useValue: "range-existing" }],
  host: { "data-case": "range-existing" },
  template: pickerTemplate(
    "precedenceExistingRangePicker",
    `[value]="{ start: '2026-01-05', end: '2026-01-06' }"`,
    "ogCalendarRange",
    days,
  ),
  styles: pickerStyles,
})
export class RangePickerExistingCase extends PickerCase {}

@Component({
  selector: "date-picker-multiple-factory",
  imports: [...shared, OrigamiCalendarMultiple, PrecedenceFactoryMultiplePicker],
  providers: [{ provide: PickerCaseLabel, useValue: "multiple-factory" }],
  host: { "data-case": "multiple-factory" },
  template: pickerTemplate(
    "precedenceFactoryMultiplePicker",
    `[value]="['2026-01-05']"`,
    "ogCalendarMultiple",
    days,
  ),
  styles: pickerStyles,
})
export class MultiplePickerFactoryCase extends PickerCase {}

@Component({
  selector: "date-picker-multiple-existing",
  imports: [...shared, OrigamiCalendarMultiple, PrecedenceExistingMultiplePicker],
  providers: [{ provide: PickerCaseLabel, useValue: "multiple-existing" }],
  host: { "data-case": "multiple-existing" },
  template: pickerTemplate(
    "precedenceExistingMultiplePicker",
    `[value]="['2026-01-05']"`,
    "ogCalendarMultiple",
    days,
  ),
  styles: pickerStyles,
})
export class MultiplePickerExistingCase extends PickerCase {}

@Component({
  selector: "date-picker-month-factory",
  imports: [...shared, OrigamiMonthCalendar, PrecedenceFactoryMonthPicker],
  providers: [{ provide: PickerCaseLabel, useValue: "month-factory" }],
  host: { "data-case": "month-factory" },
  template: pickerTemplate(
    "precedenceFactoryMonthPicker",
    `value="2026-01"`,
    "ogMonthCalendar",
    "",
  ),
  styles: pickerStyles,
})
export class MonthPickerFactoryCase extends PickerCase {}

@Component({
  selector: "date-picker-month-existing",
  imports: [...shared, OrigamiMonthCalendar, PrecedenceExistingMonthPicker],
  providers: [{ provide: PickerCaseLabel, useValue: "month-existing" }],
  host: { "data-case": "month-existing" },
  template: pickerTemplate(
    "precedenceExistingMonthPicker",
    `value="2026-01"`,
    "ogMonthCalendar",
    "",
  ),
  styles: pickerStyles,
})
export class MonthPickerExistingCase extends PickerCase {}

@Component({
  selector: "date-picker-modes-precedence",
  imports: [
    RangePickerFactoryCase,
    RangePickerExistingCase,
    MultiplePickerFactoryCase,
    MultiplePickerExistingCase,
    MonthPickerFactoryCase,
    MonthPickerExistingCase,
  ],
  template: `
    <date-picker-range-factory />
    <date-picker-range-existing />
    <date-picker-multiple-factory />
    <date-picker-multiple-existing />
    <date-picker-month-factory />
    <date-picker-month-existing />
  `,
})
export class DatePickerModesPrecedence {}
