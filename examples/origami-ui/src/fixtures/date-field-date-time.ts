import {
  Component,
  Directive,
  LOCALE_ID,
  PLATFORM_ID,
  booleanAttribute,
  computed,
  inject,
  input,
  model,
  signal,
} from "@angular/core";
import { isPlatformServer } from "@angular/common";
import { FormField, form, required, submit } from "@angular/forms/signals";
import type { FieldState, FormValueControl } from "@angular/forms/signals";
import {
  OrigamiDateFieldState,
  OrigamiDateTimeField,
  OrigamiDateTimeFieldOptions,
} from "@loozo/origami-ui/date-field";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";
import { DateSegments } from "./date-field.js";

// Date-time field cases (DF, from DF37). Controls the tests use as script actions are buttons.

/**
 * A consumer composer that is itself the `FormValueControl` with its own `value` model and
 * supplies the date-time field's Options from it (the F3 guard for the date-time root). It
 * exposes the root's `touch` and forwards `focus()`, which Signal Forms calls on the control it
 * binds.
 */
@Directive({
  selector: "[dateTimeComposer]",
  exportAs: "dateTimeComposer",
  hostDirectives: [{ directive: OrigamiDateTimeField, outputs: ["touch"] }],
  providers: [OrigamiDateTimeFieldOptions.provideExisting(() => DateTimeComposer)],
})
export class DateTimeComposer
  implements OrigamiDateTimeFieldOptions, FormValueControl<string | null>
{
  /** The composed root, whose own `value` model Signal Forms must not bind. */
  readonly field = inject(OrigamiDateTimeField);
  readonly value = model<string | null>(null);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly locale = computed(() => "en-GB");
  readonly precision = computed<"minute" | "second">(() => "minute");
  readonly hourCycle = computed<12 | 24 | null>(() => null);
  readonly state = inject(OrigamiDateFieldState);

  focus(options?: FocusOptions): void {
    this.field.focus(options);
  }
}

/**
 * Date-time fields under a locale that is `el` on the server and `en-US` in the browser: the
 * hydrated root keeps the server's Greek layout from its seed; the browser-created one is `en-US`.
 */
@Component({
  selector: "date-time-field-seed-cases",
  imports: [OrigamiDateTimeField, DateSegments],
  providers: [
    {
      provide: LOCALE_ID,
      useFactory: () => {
        if (isPlatformServer(inject(PLATFORM_ID))) {
          return "el";
        }

        return "en-US";
      },
    },
  ],
  template: `
    <div ogDateTimeField data-testid="seed-root" [(value)]="value">
      <date-segments group="seed-group" />
    </div>
    <output data-testid="seed-value">{{ value() }}</output>
    <button type="button" data-testid="show-late" (click)="late.set(true)">Show late</button>
    @if (late()) {
      <div ogDateTimeField data-testid="late-root" value="2026-10-27T13:45">
        <date-segments group="late-group" />
      </div>
    }
  `,
})
export class DateTimeFieldSeedCases {
  readonly value = signal<string | null>("2026-10-27T13:45");
  readonly late = signal(false);
}

function errorKinds(state: FieldState<string | null>): string {
  const kinds: string[] = [];

  for (const error of state.errors()) {
    kinds.push(error.kind);
  }

  return kinds.join(",");
}

function parseKinds(state: OrigamiDateFieldState): string {
  const kinds: string[] = [];

  for (const error of state.parseErrors()) {
    kinds.push(error.kind);
  }

  return kinds.join(",");
}

/** The next hour cycle input of a toggle: the locale's, then 12, then 24. */
function nextCycle(cycle: 12 | 24 | null): 12 | 24 | null {
  if (cycle === null) {
    return 12;
  }

  if (cycle === 12) {
    return 24;
  }

  return null;
}

@Component({
  selector: "acceptance-date-time-field-fixture",
  imports: [
    FormField,
    OrigamiDateTimeField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    DateSegments,
    DateTimeComposer,
    DateTimeFieldSeedCases,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach date-time field behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <button type="button" data-testid="before-fields">Before the fields</button>

    <section>
      <h2>Direct, in a Field (en-US, 12-hour)</h2>
      <!-- The controls come first: the Error appearing on blur must not move them mid-click. -->
      <output data-testid="direct-value">{{ model().direct }}</output>
      <output data-testid="direct-errors">{{ kinds(dates.direct()) }}</output>
      <output data-testid="direct-parse">{{ parse(direct.state) }}</output>
      <output data-testid="direct-touched">{{ dates.direct().touched() }}</output>
      <output data-testid="direct-writes">{{ directWrites() }}</output>
      <button type="button" data-testid="direct-clear" (click)="direct.clear()">Clear</button>
      <button type="button" data-testid="direct-reset-same" (click)="dates.direct().reset()">
        Reset
      </button>
      <button
        type="button"
        data-testid="direct-reset-other"
        (click)="dates.direct().reset('2026-12-24T21:15')"
      >
        Reset to 2026-12-24T21:15
      </button>
      <button type="button" data-testid="direct-focus" (click)="dates.direct().focusBoundControl()">
        Focus the bound control
      </button>
      <button type="button" data-testid="direct-submit" (click)="send()">Submit</button>

      <div ogField #startsField="ogField">
        <span ogFieldLabel id="direct-label">Starts at</span>
        <div
          ogDateTimeField
          #direct="ogDateTimeField"
          [formField]="dates.direct"
          (valueChange)="directWrites.set(directWrites() + 1)"
          data-testid="direct-root"
        >
          <date-segments group="direct-group" />
        </div>
        <p ogFieldDescription id="direct-description">Date and time</p>
        @if (startsField.state.errorsShown()) {
          <p ogFieldError id="direct-error" data-testid="direct-error">
            {{ startsField.state.errors()[0]?.kind }}
          </p>
        }
      </div>
      @if (twinShown()) {
        <div ogDateTimeField value="2026-10-27T09:30" data-testid="late-twin-root">
          <date-segments group="late-twin-group" />
        </div>
      }
      <button type="button" data-testid="show-twin" (click)="twinShown.set(true)">
        Show a browser-created twin
      </button>

      <h2>Composer model (en-GB)</h2>
      <div
        dateTimeComposer
        #composer="dateTimeComposer"
        [formField]="dates.composed"
        data-testid="composed-root"
      >
        <date-segments />
      </div>
      <output data-testid="composed-value">{{ model().composed }}</output>
      <output data-testid="composed-errors">{{ kinds(dates.composed()) }}</output>
      <output data-testid="composed-parse">{{ parse(composer.state) }}</output>
      <output data-testid="composed-own-value">{{ composer.field.value() ?? "null" }}</output>
      <output data-testid="composed-touched">{{ dates.composed().touched() }}</output>
      <button type="button" data-testid="composed-clear" (click)="composer.field.clear()">
        Clear the composed root
      </button>
      <button type="button" data-testid="composed-reset-same" (click)="dates.composed().reset()">
        Reset
      </button>
      <button
        type="button"
        data-testid="composed-reset-other"
        (click)="dates.composed().reset('2026-12-24T21:15')"
      >
        Reset to 2026-12-24T21:15
      </button>
      <button
        type="button"
        data-testid="composed-focus"
        (click)="dates.composed().focusBoundControl()"
      >
        Focus the composed control
      </button>

      <h2>Layout changes over a form-bound draft (en-GB)</h2>
      <div
        ogDateTimeField
        #layout="ogDateTimeField"
        [formField]="dates.layout"
        (valueChange)="layoutWrites.set(layoutWrites() + 1)"
        locale="en-GB"
        [precision]="layoutPrecision()"
        [hourCycle]="layoutCycle()"
        data-testid="layout-root"
      >
        <date-segments group="layout-group" />
      </div>
      <output data-testid="layout-value">{{ model().layout }}</output>
      <output data-testid="layout-errors">{{ kinds(dates.layout()) }}</output>
      <output data-testid="layout-parse">{{ parse(layout.state) }}</output>
      <output data-testid="layout-valid">{{ dates.layout().valid() }}</output>
      <output data-testid="layout-writes">{{ layoutWrites() }}</output>
      <button
        type="button"
        data-testid="layout-precision"
        (click)="layoutPrecision.set(layoutPrecision() === 'minute' ? 'second' : 'minute')"
      >
        Toggle the precision
      </button>
      <button
        type="button"
        data-testid="layout-cycle"
        (click)="layoutCycle.set(next(layoutCycle()))"
      >
        Next hour cycle
      </button>

      <h2>Typing, en-US</h2>
      <div
        ogDateTimeField
        #us="ogDateTimeField"
        [(value)]="usValue"
        (valueChange)="usWrites.set(usWrites() + 1)"
        locale="en-US"
        data-testid="us-root"
      >
        <date-segments group="us-group" />
      </div>
      <output data-testid="us-value">{{ usValue() ?? "null" }}</output>
      <output data-testid="us-writes">{{ usWrites() }}</output>
      <output data-testid="us-parse">{{ parse(us.state) }}</output>
      <button type="button" data-testid="us-write" (click)="usValue.set('2026-10-27T09:30')">
        Write 2026-10-27T09:30
      </button>
      <button
        type="button"
        data-testid="us-write-zulu"
        (click)="usValue.set('2026-10-27T09:30Z')"
      >
        Write 2026-10-27T09:30Z
      </button>
      <button
        type="button"
        data-testid="us-write-offset"
        (click)="usValue.set('2026-10-27T09:30:00+03:00')"
      >
        Write 2026-10-27T09:30:00+03:00
      </button>
      <button type="button" data-testid="us-clear" (click)="us.clear()">Clear</button>

      <h2>Typing, en-GB</h2>
      <div
        ogDateTimeField
        #gb="ogDateTimeField"
        [(value)]="gbValue"
        (valueChange)="gbWrites.set(gbWrites() + 1)"
        locale="en-GB"
        [precision]="gbPrecision()"
        data-testid="gb-root"
      >
        <date-segments group="gb-group" />
      </div>
      <output data-testid="gb-value">{{ gbValue() ?? "null" }}</output>
      <output data-testid="gb-writes">{{ gbWrites() }}</output>
      <output data-testid="gb-parse">{{ parse(gb.state) }}</output>
      <button
        type="button"
        data-testid="gb-precision"
        (click)="gbPrecision.set(gbPrecision() === 'minute' ? 'second' : 'minute')"
      >
        Toggle the precision
      </button>
      <button
        type="button"
        data-testid="gb-write-seconds"
        (click)="gbValue.set('2026-10-27T09:30:15')"
      >
        Write 2026-10-27T09:30:15
      </button>
      <button type="button" data-testid="gb-write-minutes" (click)="gbValue.set('2026-10-27T09:30')">
        Write 2026-10-27T09:30
      </button>

      <h2>Typing, el</h2>
      <div ogDateTimeField [(value)]="elValue" locale="el" #el="ogDateTimeField" data-testid="el-root">
        <date-segments group="el-group" />
      </div>
      <output data-testid="el-value">{{ elValue() ?? "null" }}</output>
      <output data-testid="el-parse">{{ parse(el.state) }}</output>

      <h2>Seconds, a forced 24-hour cycle in en-US</h2>
      <div
        ogDateTimeField
        [(value)]="secondsValue"
        locale="en-US"
        precision="second"
        hourCycle="24"
        #seconds="ogDateTimeField"
        data-testid="seconds-root"
      >
        <date-segments group="seconds-group" />
      </div>
      <output data-testid="seconds-value">{{ secondsValue() ?? "null" }}</output>
      <output data-testid="seconds-parse">{{ parse(seconds.state) }}</output>
      <button
        type="button"
        data-testid="seconds-write"
        (click)="secondsValue.set('2026-10-27T09:30')"
      >
        Write 2026-10-27T09:30
      </button>
      <button type="button" data-testid="after-fields">After the fields</button>

      <h2>Layout seed</h2>
      <date-time-field-seed-cases />
    </section>
  `,
})
export class DateTimeFieldFixture {
  readonly attached = signal(false);
  readonly model = signal({
    direct: "2026-10-27T09:30" as string | null,
    composed: "2026-10-27T13:45" as string | null,
    layout: "2026-10-27T09:30" as string | null,
  });
  readonly dates = form(this.model, (path) => {
    required(path.direct);
  });
  readonly directWrites = signal(0);
  readonly twinShown = signal(false);
  readonly layoutWrites = signal(0);
  readonly layoutPrecision = signal<"minute" | "second">("minute");
  readonly layoutCycle = signal<12 | 24 | null>(null);
  readonly usValue = signal<string | null>(null);
  readonly usWrites = signal(0);
  readonly gbValue = signal<string | null>(null);
  readonly gbWrites = signal(0);
  readonly gbPrecision = signal<"minute" | "second">("minute");
  readonly elValue = signal<string | null>(null);
  readonly secondsValue = signal<string | null>(null);
  readonly kinds = errorKinds;
  readonly parse = parseKinds;
  readonly next = nextCycle;

  async send(): Promise<void> {
    await submit(this.dates, async () => undefined);
  }
}
