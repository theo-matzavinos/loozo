import { Component, Directive, InjectionToken, Service, inject, signal } from "@angular/core";
import { OrigamiCalendar, OrigamiCalendarGrid } from "@loozo/origami-ui/calendar";
import { OrigamiDateFieldInput, OrigamiDateFieldSegment } from "@loozo/origami-ui/date-field";
import { OrigamiDateFieldState } from "@loozo/origami-ui/date-field";
import type { OrigamiDateFieldPart } from "@loozo/origami-ui/date-field";
import {
  OrigamiDatePickerContent,
  OrigamiDatePickerTrigger,
  OrigamiDateTimePicker,
  OrigamiDateTimePickerOptions,
  OrigamiDateTimePickerState,
} from "@loozo/origami-ui/date-picker";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";
import { CalendarViewRows } from "./calendar-views.js";

// DP37 (O1, O3) for the date-time root: a consumer composes `ogDateTimePicker` through
// `hostDirectives`, exposing its own inputs with contradicting values, and replaces its Options
// with ordinary signals, by a factory in one case and an existing provider in the other. The
// Trigger and Content are the shared parts DP13 already covers.

const DateTimePickerCaseLabel = new InjectionToken<string>(
  "date-time picker precedence case label",
);

/** Ordinary non-model replacement signals shared only by one consumer root. */
@Service({ autoProvided: false })
export class DateTimePickerPrecedenceSettings {
  readonly label = inject(DateTimePickerCaseLabel);
  readonly value = signal<string | null>("2026-10-15T09:30");
  readonly open = signal(false);
  readonly disabled = signal(true);
  readonly readonly = signal(false);
  readonly locale = signal("en-US");
  readonly precision = signal<"minute" | "second">("minute");
  readonly hourCycle = signal<12 | 24 | null>(12);
  readonly unusedOutputs = signal(0);
  readonly increment = (value: number): number => value + 1;
}

const rootComposition = {
  directive: OrigamiDateTimePicker,
  inputs: ["value", "open", "disabled", "readonly", "locale", "precision", "hourCycle"],
  outputs: ["valueChange", "openChange"],
};

@Directive({
  selector: "[precedenceFactoryDateTimePicker]",
  exportAs: "precedenceDateTimePicker",
  hostDirectives: [rootComposition],
  providers: [
    DateTimePickerPrecedenceSettings,
    OrigamiDateTimePickerOptions.provideFactory(() => inject(DateTimePickerPrecedenceSettings)),
  ],
})
export class PrecedenceFactoryDateTimePicker {
  readonly settings = inject(DateTimePickerPrecedenceSettings);
  readonly state = inject(OrigamiDateTimePickerState);
  /** The composed date-time field's own State, a lower observation of the policies. */
  readonly dateTimeField = inject(OrigamiDateFieldState);
}

@Directive({
  selector: "[precedenceExistingDateTimePicker]",
  exportAs: "precedenceDateTimePicker",
  hostDirectives: [rootComposition],
  providers: [
    DateTimePickerPrecedenceSettings,
    OrigamiDateTimePickerOptions.provideExisting(() => PrecedenceExistingDateTimePicker),
  ],
})
export class PrecedenceExistingDateTimePicker implements OrigamiDateTimePickerOptions {
  readonly settings = inject(DateTimePickerPrecedenceSettings);
  readonly value = this.settings.value;
  readonly open = this.settings.open;
  readonly disabled = this.settings.disabled;
  readonly readonly = this.settings.readonly;
  readonly locale = this.settings.locale;
  readonly precision = this.settings.precision;
  readonly hourCycle = this.settings.hourCycle;
  readonly state = inject(OrigamiDateTimePickerState);
  /** The composed date-time field's own State, a lower observation of the policies. */
  readonly dateTimeField = inject(OrigamiDateFieldState);
}

// The root exposes the composed directive's own inputs with values that contradict the
// replacement (a de-DE, 24-hour, second-precision value). They must remain unused while a
// replacement is present.
function dateTimePickerTemplate(
  root: "precedenceFactoryDateTimePicker" | "precedenceExistingDateTimePicker",
): string {
  return `
  <div ogField>
    <span ogFieldLabel [id]="label + '-label'">Departure</span>
    <div ${root} #root="precedenceDateTimePicker" value="2026-01-05T20:00:10" [open]="true"
      [disabled]="false" [readonly]="true" locale="de-DE" precision="second" hourCycle="24"
      (valueChange)="root.settings.unusedOutputs.update(root.settings.increment)"
      (openChange)="root.settings.unusedOutputs.update(root.settings.increment)">
      <div ogDateFieldInput data-co="input">
        @for (part of root.state.segments(); track part.key) {
          @if (part.type === "literal") {
            <span aria-hidden="true">{{ part.text }}</span>
          } @else {
            <span [ogDateFieldSegment]="part.type" [attr.data-segment]="part.type"></span>
          }
        }
        <button ogDatePickerTrigger aria-label="Choose date" data-co="trigger">▾</button>
      </div>
      <div ogDatePickerContent class="surface" data-co="content">
        <div ogCalendar #cal="ogCalendar" today="2026-10-27" locale="en-US">
          <table ogCalendarGrid calendarViewRows data-co="grid" [view]="cal.state.view()"
            [weeks]="cal.state.weeks()" [months]="cal.state.months()" [years]="cal.state.years()"></table>
        </div>
      </div>
    </div>
  </div>
  <output data-co="value">{{ root.settings.value() ?? "null" }} {{ root.state.value() ?? "null" }}</output>
  <output data-co="open">{{ root.settings.open() }} {{ root.state.open() }}</output>
  <output data-co="policy">{{ root.state.disabled() }} {{ root.state.readonly() }}</output>
  <output data-co="lower-policy">{{ root.dateTimeField.disabled() }} {{ root.dateTimeField.readonly() }} {{ cal.state.disabled() }}</output>
  <output data-co="segments">{{ segments(root.state.segments()) }}</output>
  <output data-co="unused-outputs">{{ root.settings.unusedOutputs() }}</output>
  <button type="button" data-co="disable" (click)="root.settings.disabled.set(!root.settings.disabled())">
    Disable
  </button>
  <button type="button" data-co="readonly" (click)="root.settings.readonly.set(!root.settings.readonly())">
    Readonly
  </button>
`;
}

const dateTimePickerStyles = `
  :host { display: block; padding-block: 24px; margin-block-end: 24rem; }
  output { display: block; }
  .surface { box-sizing: border-box; margin: 0; padding: 8px;
    background: #333333; color: inherit; border: 1px solid #777777; }
`;

/** Shared readouts of both cases. */
abstract class DateTimePickerPrecedenceCase {
  readonly label = inject(DateTimePickerCaseLabel);

  /** The composed date-time field's segment and literal text, joined. */
  segments(parts: readonly OrigamiDateFieldPart[]): string {
    let text = "";

    for (const part of parts) {
      text += part.text;
    }

    return text;
  }
}

const shared = [
  OrigamiField,
  OrigamiFieldLabel,
  OrigamiDateFieldInput,
  OrigamiDateFieldSegment,
  OrigamiDatePickerTrigger,
  OrigamiDatePickerContent,
  OrigamiCalendar,
  OrigamiCalendarGrid,
  CalendarViewRows,
];

@Component({
  selector: "date-time-picker-precedence-factory",
  imports: [...shared, PrecedenceFactoryDateTimePicker],
  providers: [{ provide: DateTimePickerCaseLabel, useValue: "date-time-picker-factory" }],
  host: { "data-case": "date-time-picker-factory" },
  template: dateTimePickerTemplate("precedenceFactoryDateTimePicker"),
  styles: dateTimePickerStyles,
})
export class DateTimePickerPrecedenceFactory extends DateTimePickerPrecedenceCase {}

@Component({
  selector: "date-time-picker-precedence-existing",
  imports: [...shared, PrecedenceExistingDateTimePicker],
  providers: [{ provide: DateTimePickerCaseLabel, useValue: "date-time-picker-existing" }],
  host: { "data-case": "date-time-picker-existing" },
  template: dateTimePickerTemplate("precedenceExistingDateTimePicker"),
  styles: dateTimePickerStyles,
})
export class DateTimePickerPrecedenceExisting extends DateTimePickerPrecedenceCase {}
