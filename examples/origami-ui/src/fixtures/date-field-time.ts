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
  OrigamiTimeField,
  OrigamiTimeFieldOptions,
} from "@loozo/origami-ui/date-field";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";
import { DateSegments } from "./date-field.js";

// Time field cases (DF, from DF23). Controls the tests use as script actions are buttons.

/**
 * A consumer composer that is itself the `FormValueControl` with its own `value` model and
 * supplies the time field's Options from it (the F3 guard for the time root). It exposes the
 * root's `touch` and forwards `focus()`, which Signal Forms calls on the control it binds.
 */
@Directive({
  selector: "[timeComposer]",
  exportAs: "timeComposer",
  hostDirectives: [{ directive: OrigamiTimeField, outputs: ["touch"] }],
  providers: [OrigamiTimeFieldOptions.provideExisting(() => TimeComposer)],
})
export class TimeComposer implements OrigamiTimeFieldOptions, FormValueControl<string | null> {
  /** The composed root, whose own `value` model Signal Forms must not bind. */
  readonly field = inject(OrigamiTimeField);
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
 * Time fields under a locale that is `el` on the server and `en-US` in the browser: the hydrated
 * root keeps the server's Greek 12-hour layout from its seed; the browser-created one is `en-US`.
 */
@Component({
  selector: "time-field-seed-cases",
  imports: [OrigamiTimeField, DateSegments],
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
    <div ogTimeField data-testid="seed-root" [(value)]="value">
      <date-segments group="seed-group" />
    </div>
    <output data-testid="seed-value">{{ value() }}</output>
    <button type="button" data-testid="show-late" (click)="late.set(true)">Show late</button>
    @if (late()) {
      <div ogTimeField data-testid="late-root" value="13:45">
        <date-segments group="late-group" />
      </div>
    }
  `,
})
export class TimeFieldSeedCases {
  readonly value = signal<string | null>("13:45");
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
  selector: "acceptance-time-field-fixture",
  imports: [
    FormField,
    OrigamiTimeField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    DateSegments,
    TimeComposer,
    TimeFieldSeedCases,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach time field behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <button type="button" data-testid="before-fields">Before the fields</button>

    <section>
      <h2>Direct, in a Field (en-US, 12-hour)</h2>
      <!-- The controls come first: the Error appearing on blur must not move them mid-click. -->
      <output data-testid="direct-value">{{ model().direct }}</output>
      <output data-testid="direct-errors">{{ kinds(times.direct()) }}</output>
      <output data-testid="direct-parse">{{ parse(direct.state) }}</output>
      <output data-testid="direct-touched">{{ times.direct().touched() }}</output>
      <output data-testid="direct-writes">{{ directWrites() }}</output>
      <button type="button" data-testid="direct-clear" (click)="direct.clear()">Clear</button>
      <button type="button" data-testid="direct-reset-same" (click)="times.direct().reset()">
        Reset
      </button>
      <button
        type="button"
        data-testid="direct-reset-other"
        (click)="times.direct().reset('21:15')"
      >
        Reset to 21:15
      </button>
      <button type="button" data-testid="direct-focus" (click)="times.direct().focusBoundControl()">
        Focus the bound control
      </button>
      <button type="button" data-testid="direct-submit" (click)="send()">Submit</button>

      <div ogField #opensField="ogField">
        <span ogFieldLabel id="direct-label">Opens at</span>
        <div
          ogTimeField
          #direct="ogTimeField"
          [formField]="times.direct"
          (valueChange)="directWrites.set(directWrites() + 1)"
          data-testid="direct-root"
        >
          <date-segments group="direct-group" />
        </div>
        <p ogFieldDescription id="direct-description">Hour and minute</p>
        @if (opensField.state.errorsShown()) {
          <p ogFieldError id="direct-error" data-testid="direct-error">
            {{ opensField.state.errors()[0]?.kind }}
          </p>
        }
      </div>
      @if (twinShown()) {
        <div ogTimeField value="09:30" data-testid="late-twin-root">
          <date-segments group="late-twin-group" />
        </div>
      }
      <button type="button" data-testid="show-twin" (click)="twinShown.set(true)">
        Show a browser-created twin
      </button>

      <h2>Composer model (en-GB)</h2>
      <div
        timeComposer
        #composer="timeComposer"
        [formField]="times.composed"
        data-testid="composed-root"
      >
        <date-segments />
      </div>
      <output data-testid="composed-value">{{ model().composed }}</output>
      <output data-testid="composed-errors">{{ kinds(times.composed()) }}</output>
      <output data-testid="composed-parse">{{ parse(composer.state) }}</output>
      <output data-testid="composed-own-value">{{ composer.field.value() ?? "null" }}</output>
      <output data-testid="composed-touched">{{ times.composed().touched() }}</output>
      <button type="button" data-testid="composed-clear" (click)="composer.field.clear()">
        Clear the composed root
      </button>
      <button type="button" data-testid="composed-reset-same" (click)="times.composed().reset()">
        Reset
      </button>
      <button
        type="button"
        data-testid="composed-reset-other"
        (click)="times.composed().reset('21:15')"
      >
        Reset to 21:15
      </button>
      <button
        type="button"
        data-testid="composed-focus"
        (click)="times.composed().focusBoundControl()"
      >
        Focus the composed control
      </button>

      <h2>Layout changes over a form-bound draft (en-GB)</h2>
      <div
        ogTimeField
        #layout="ogTimeField"
        [formField]="times.layout"
        (valueChange)="layoutWrites.set(layoutWrites() + 1)"
        locale="en-GB"
        [precision]="layoutPrecision()"
        [hourCycle]="layoutCycle()"
        data-testid="layout-root"
      >
        <date-segments group="layout-group" />
      </div>
      <output data-testid="layout-value">{{ model().layout }}</output>
      <output data-testid="layout-errors">{{ kinds(times.layout()) }}</output>
      <output data-testid="layout-parse">{{ parse(layout.state) }}</output>
      <output data-testid="layout-valid">{{ times.layout().valid() }}</output>
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

      <h2>Typing, en-GB</h2>
      <div
        ogTimeField
        #gb="ogTimeField"
        [(value)]="gbValue"
        (valueChange)="gbWrites.set(gbWrites() + 1)"
        locale="en-GB"
        [precision]="gbPrecision()"
        [hourCycle]="gbCycle()"
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
      <button type="button" data-testid="gb-cycle" (click)="gbCycle.set(next(gbCycle()))">
        Next hour cycle
      </button>
      <button type="button" data-testid="gb-write-seconds" (click)="gbValue.set('09:30:15')">
        Write 09:30:15
      </button>
      <button type="button" data-testid="gb-write-minutes" (click)="gbValue.set('13:45')">
        Write 13:45
      </button>
      <button type="button" data-testid="gb-write-text" (click)="gbValue.set('9:30')">
        Write 9:30
      </button>

      <h2>Typing, en-US</h2>
      <div
        ogTimeField
        #us="ogTimeField"
        [(value)]="usValue"
        (valueChange)="usWrites.set(usWrites() + 1)"
        locale="en-US"
        [hourCycle]="usCycle()"
        data-testid="us-root"
      >
        <date-segments group="us-group" />
      </div>
      <output data-testid="us-value">{{ usValue() ?? "null" }}</output>
      <output data-testid="us-writes">{{ usWrites() }}</output>
      <output data-testid="us-parse">{{ parse(us.state) }}</output>
      <button type="button" data-testid="us-write-midnight" (click)="usValue.set('00:00')">
        Write 00:00
      </button>
      <button type="button" data-testid="us-write-noon" (click)="usValue.set('12:00')">
        Write 12:00
      </button>
      <button type="button" data-testid="us-write-late" (click)="usValue.set('23:59')">
        Write 23:59
      </button>
      <button type="button" data-testid="us-cycle" (click)="usCycle.set(next(usCycle()))">
        Next hour cycle
      </button>
      <button type="button" data-testid="us-clear" (click)="us.clear()">Clear</button>

      <h2>Typing, el</h2>
      <div ogTimeField [(value)]="elValue" locale="el" #el="ogTimeField" data-testid="el-root">
        <date-segments group="el-group" />
      </div>
      <output data-testid="el-value">{{ elValue() ?? "null" }}</output>
      <output data-testid="el-parse">{{ parse(el.state) }}</output>

      <h2>Seconds, a forced 12-hour cycle in en-GB</h2>
      <div
        ogTimeField
        [(value)]="secondsValue"
        locale="en-GB"
        precision="second"
        hourCycle="12"
        #seconds="ogTimeField"
        data-testid="seconds-root"
      >
        <date-segments group="seconds-group" />
      </div>
      <output data-testid="seconds-value">{{ secondsValue() ?? "null" }}</output>
      <output data-testid="seconds-parse">{{ parse(seconds.state) }}</output>
      <button type="button" data-testid="seconds-write" (click)="secondsValue.set('09:30')">
        Write 09:30
      </button>
      <button type="button" data-testid="after-fields">After the fields</button>

      <h2>Layout seed</h2>
      <time-field-seed-cases />
    </section>
  `,
})
export class TimeFieldFixture {
  readonly attached = signal(false);
  readonly model = signal({
    direct: "09:30" as string | null,
    composed: "13:45" as string | null,
    layout: "09:30" as string | null,
  });
  readonly times = form(this.model, (path) => {
    required(path.direct);
  });
  readonly directWrites = signal(0);
  readonly twinShown = signal(false);
  readonly layoutWrites = signal(0);
  readonly layoutPrecision = signal<"minute" | "second">("minute");
  readonly layoutCycle = signal<12 | 24 | null>(null);
  readonly gbValue = signal<string | null>(null);
  readonly gbWrites = signal(0);
  readonly gbPrecision = signal<"minute" | "second">("minute");
  readonly gbCycle = signal<12 | 24 | null>(null);
  readonly usValue = signal<string | null>(null);
  readonly usWrites = signal(0);
  readonly usCycle = signal<12 | 24 | null>(null);
  readonly elValue = signal<string | null>(null);
  readonly secondsValue = signal<string | null>(null);
  readonly kinds = errorKinds;
  readonly parse = parseKinds;
  readonly next = nextCycle;

  async send(): Promise<void> {
    await submit(this.times, async () => undefined);
  }
}
