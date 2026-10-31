import { Component, Directive, InjectionToken, Service, inject, signal } from "@angular/core";
import { OrigamiCalendar, OrigamiCalendarGrid } from "@loozo/origami-ui/calendar";
import {
  OrigamiDatePicker,
  OrigamiDatePickerContent,
  OrigamiDatePickerContentOptions,
  OrigamiDatePickerOptions,
  OrigamiDatePickerState,
  OrigamiDatePickerTrigger,
  OrigamiDatePickerTriggerOptions,
} from "@loozo/origami-ui/date-picker";
import { OrigamiDateFieldState } from "@loozo/origami-ui/date-field";
import type { OrigamiDateFieldPart } from "@loozo/origami-ui/date-field";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";
import type { OrigamiPopoverAlign, OrigamiPopoverSide } from "@loozo/origami-ui/popover";
import { CalendarViewRows } from "./calendar-views.js";

// DP13 (O1, O3): consumers compose every Date picker part through `hostDirectives`, exposing its
// own inputs with contradicting values, and replace its Options with ordinary signals: by
// factories in one case and by existing providers in the other. Trigger and Content replace only
// the picker's Options, never the Popover's they compose.

const DatePickerCaseLabel = new InjectionToken<string>("date picker precedence case label");

/** Ordinary non-model replacement signals shared only by one consumer root. */
@Service({ autoProvided: false })
export class DatePickerPrecedenceSettings {
  readonly label = inject(DatePickerCaseLabel);
  readonly value = signal<string | null>("2026-10-15");
  readonly open = signal(false);
  readonly disabled = signal(true);
  readonly readonly = signal(false);
  readonly locale = signal("en-US");
  // Element IDs that match between server and client: derived from the case, not allocated.
  readonly triggerId = signal(`${this.label}-trigger`);
  readonly triggerDisabled = signal(false);
  readonly contentId = signal(`${this.label}-content`);
  readonly side = signal<OrigamiPopoverSide>("inline-end");
  readonly align = signal<OrigamiPopoverAlign>("center");
  readonly gap = signal(11);
  readonly unusedOutputs = signal(0);
  readonly increment = (value: number): number => value + 1;

  changeIds(): void {
    this.triggerId.set(`${this.triggerId()}-changed`);
    this.contentId.set(`${this.contentId()}-changed`);
  }
}

const rootComposition = {
  directive: OrigamiDatePicker,
  inputs: ["value", "open", "disabled", "readonly", "locale"],
  outputs: ["valueChange", "openChange"],
};
const triggerComposition = {
  directive: OrigamiDatePickerTrigger,
  inputs: ["id", "disabled"],
};
const contentComposition = {
  directive: OrigamiDatePickerContent,
  inputs: ["id", "side", "align", "gap"],
};

// ---- Factory providers ----

@Directive({
  selector: "[precedenceFactoryDatePicker]",
  exportAs: "precedenceDatePicker",
  hostDirectives: [rootComposition],
  providers: [
    DatePickerPrecedenceSettings,
    OrigamiDatePickerOptions.provideFactory(() => inject(DatePickerPrecedenceSettings)),
  ],
})
export class PrecedenceFactoryDatePicker {
  readonly settings = inject(DatePickerPrecedenceSettings);
  readonly state = inject(OrigamiDatePickerState);
  /** The composed date field's own State, a lower observation of the policies. */
  readonly dateField = inject(OrigamiDateFieldState);
}

@Directive({
  selector: "button[precedenceFactoryDatePickerTrigger]",
  hostDirectives: [triggerComposition],
  providers: [
    OrigamiDatePickerTriggerOptions.provideFactory(() => {
      const settings = inject(DatePickerPrecedenceSettings);

      return { id: settings.triggerId, disabled: settings.triggerDisabled };
    }),
  ],
})
export class PrecedenceFactoryDatePickerTrigger {}

@Directive({
  selector: "[precedenceFactoryDatePickerContent]",
  hostDirectives: [contentComposition],
  providers: [
    OrigamiDatePickerContentOptions.provideFactory(() => {
      const settings = inject(DatePickerPrecedenceSettings);

      return {
        id: settings.contentId,
        side: settings.side,
        align: settings.align,
        gap: settings.gap,
      };
    }),
  ],
})
export class PrecedenceFactoryDatePickerContent {}

// ---- Existing providers ----

@Directive({
  selector: "[precedenceExistingDatePicker]",
  exportAs: "precedenceDatePicker",
  hostDirectives: [rootComposition],
  providers: [
    DatePickerPrecedenceSettings,
    OrigamiDatePickerOptions.provideExisting(() => PrecedenceExistingDatePicker),
  ],
})
export class PrecedenceExistingDatePicker implements OrigamiDatePickerOptions {
  readonly settings = inject(DatePickerPrecedenceSettings);
  readonly value = this.settings.value;
  readonly open = this.settings.open;
  readonly disabled = this.settings.disabled;
  readonly readonly = this.settings.readonly;
  readonly locale = this.settings.locale;
  readonly state = inject(OrigamiDatePickerState);
  /** The composed date field's own State, a lower observation of the policies. */
  readonly dateField = inject(OrigamiDateFieldState);
}

@Directive({
  selector: "button[precedenceExistingDatePickerTrigger]",
  hostDirectives: [triggerComposition],
  providers: [
    OrigamiDatePickerTriggerOptions.provideExisting(() => PrecedenceExistingDatePickerTrigger),
  ],
})
export class PrecedenceExistingDatePickerTrigger implements OrigamiDatePickerTriggerOptions {
  readonly #settings = inject(DatePickerPrecedenceSettings);
  readonly id = this.#settings.triggerId;
  readonly disabled = this.#settings.triggerDisabled;
}

@Directive({
  selector: "[precedenceExistingDatePickerContent]",
  hostDirectives: [contentComposition],
  providers: [
    OrigamiDatePickerContentOptions.provideExisting(() => PrecedenceExistingDatePickerContent),
  ],
})
export class PrecedenceExistingDatePickerContent implements OrigamiDatePickerContentOptions {
  readonly #settings = inject(DatePickerPrecedenceSettings);
  readonly id = this.#settings.contentId;
  readonly side = this.#settings.side;
  readonly align = this.#settings.align;
  readonly gap = this.#settings.gap;
}

// Every part exposes the composed directive's own inputs with values that contradict the
// replacement. Those inputs must remain unused while a replacement is present.
function datePickerTemplate(
  prefix: "precedenceFactoryDatePicker" | "precedenceExistingDatePicker",
): string {
  return `
  <div ogField>
    <span ogFieldLabel [id]="label + '-label'">Departure</span>
    <div ${prefix} #root="precedenceDatePicker" value="2026-01-05" [open]="true" [disabled]="false"
      [readonly]="true" locale="de-DE"
      (valueChange)="root.settings.unusedOutputs.update(root.settings.increment)"
      (openChange)="root.settings.unusedOutputs.update(root.settings.increment)">
      <button ${prefix}Trigger id="unused-direct-trigger" [disabled]="true" class="anchor"
        data-co="trigger" [attr.data-testid]="label + '-trigger'">{{ root.state.value() ?? "Choose" }}</button>
      <div ${prefix}Content id="unused-direct-content" side="block-start" align="end" [gap]="99"
        class="surface" data-co="content" [attr.data-testid]="label + '-content'">
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
  <output data-co="lower-policy">{{ root.dateField.disabled() }} {{ root.dateField.readonly() }} {{ cal.state.disabled() }}</output>
  <output data-co="segments">{{ segments(root.state.segments()) }}</output>
  <output data-co="unused-outputs">{{ root.settings.unusedOutputs() }}</output>
  <button type="button" data-co="disable" (click)="root.settings.disabled.set(!root.settings.disabled())">
    Disable
  </button>
  <button type="button" data-co="readonly" (click)="root.settings.readonly.set(!root.settings.readonly())">
    Readonly
  </button>
  <button type="button" data-co="trigger-disable"
    (click)="root.settings.triggerDisabled.set(!root.settings.triggerDisabled())">
    Disable the Trigger
  </button>
  <button type="button" data-co="ids" (click)="root.settings.changeIds()">IDs</button>
`;
}

const datePickerStyles = `
  :host { display: block; padding-block: 24px; margin-block-end: 24rem; }
  output { display: block; }
  .anchor { inline-size: 120px; block-size: 30px; margin-inline-start: 20px; }
  .surface { box-sizing: border-box; margin: 0; padding: 8px;
    background: #333333; color: inherit; border: 1px solid #777777; }
`;

/** Shared readouts of both cases. */
abstract class DatePickerPrecedenceCase {
  readonly label = inject(DatePickerCaseLabel);

  /** The composed date field's segment text, joined. */
  segments(parts: readonly OrigamiDateFieldPart[]): string {
    return parts.map((part) => part.text).join("");
  }
}

@Component({
  selector: "date-picker-precedence-factory",
  imports: [
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiCalendar,
    OrigamiCalendarGrid,
    CalendarViewRows,
    PrecedenceFactoryDatePicker,
    PrecedenceFactoryDatePickerTrigger,
    PrecedenceFactoryDatePickerContent,
  ],
  providers: [{ provide: DatePickerCaseLabel, useValue: "date-picker-factory" }],
  host: { "data-case": "date-picker-factory" },
  template: datePickerTemplate("precedenceFactoryDatePicker"),
  styles: datePickerStyles,
})
export class DatePickerPrecedenceFactory extends DatePickerPrecedenceCase {}

@Component({
  selector: "date-picker-precedence-existing",
  imports: [
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiCalendar,
    OrigamiCalendarGrid,
    CalendarViewRows,
    PrecedenceExistingDatePicker,
    PrecedenceExistingDatePickerTrigger,
    PrecedenceExistingDatePickerContent,
  ],
  providers: [{ provide: DatePickerCaseLabel, useValue: "date-picker-existing" }],
  host: { "data-case": "date-picker-existing" },
  template: datePickerTemplate("precedenceExistingDatePicker"),
  styles: datePickerStyles,
})
export class DatePickerPrecedenceExisting extends DatePickerPrecedenceCase {}
