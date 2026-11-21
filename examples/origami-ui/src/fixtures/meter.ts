import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  LOCALE_ID,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from "@angular/core";
import type { WritableSignal } from "@angular/core";
import { OrigamiMeter, OrigamiMeterOptions, OrigamiMeterState } from "@loozo/origami-ui/meter";

/** A descendant reading its nearest Meter State through DI. */
@Directive({
  selector: "[meterStateProbe]",
  host: {
    "data-probe": "",
    "[attr.data-value-state]": "describe(state.value())",
    "[attr.data-percent-state]": "describe(state.percent())",
    "[attr.data-value-text-state]": "describe(state.valueText())",
  },
})
export class MeterStateProbe {
  readonly state = inject(OrigamiMeterState);

  protected describe(value: unknown): string {
    return String(value);
  }
}

/** A consumer gauge composing the root through `hostDirectives`, named by a title beside it. */
@Component({
  selector: "meter-gauge",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MeterStateProbe],
  hostDirectives: [{ directive: OrigamiMeter, inputs: ["value", "min", "max", "valueText"] }],
  host: { class: "ring", "[attr.aria-labelledby]": "titleId()" },
  template: `<span class="ring-value" aria-hidden="true" meterStateProbe>{{
    meter.state.valueText()
  }}</span>`,
})
export class MeterGauge {
  readonly titleId = input.required<string>();
  protected readonly meter = inject(OrigamiMeter);
}

/** A subtree in another locale, providing its own `LOCALE_ID`. */
@Component({
  selector: "meter-french",
  providers: [{ provide: LOCALE_ID, useValue: "fr-FR" }],
  imports: [OrigamiMeter],
  template: `<div
    ogMeter
    data-testid="french"
    value="15"
    min="10"
    max="20"
    aria-label="Français"
  ></div>`,
})
export class MeterFrench {}

/** Replacement Options state the factory root reads; nothing in a template reads its signals. */
@Directive({ selector: "[meterSettings]", exportAs: "meterSettings" })
export class MeterSettings {
  readonly value = signal(40);
  readonly min = signal(10);
  readonly max = signal(70);
  readonly valueText = signal<string | null>(null);

  /** Writes the value from a timer, outside any template binding. */
  writeLater(value: number): void {
    setTimeout(() => {
      this.value.set(value);
    });
  }
}

/** A consumer root with factory Options over a contradicting exposed own value. */
@Directive({
  selector: "[factoryMeter]",
  hostDirectives: [{ directive: OrigamiMeter, inputs: ["value: decoyValue"] }],
  providers: [
    OrigamiMeterOptions.provideFactory(() => {
      const settings = inject(MeterSettings);

      return {
        value: settings.value,
        min: settings.min,
        max: settings.max,
        valueText: settings.valueText,
      };
    }),
  ],
})
export class FactoryMeter {}

/**
 * A factory root alone in its own view, with no probe or template binding that reads its signals,
 * so a timer write can only refresh it through the root's own host bindings.
 */
@Component({
  selector: "acceptance-meter-factory-alone",
  imports: [MeterSettings, FactoryMeter],
  template: `<section meterSettings #settings="meterSettings">
    <div factoryMeter data-testid="factory-alone" decoyValue="90" aria-label="Factory alone"></div>
    <button type="button" data-testid="factory-alone-timer" (click)="settings.writeLater(55)">
      Write 55 from a timer
    </button>
  </section>`,
})
export class MeterFactoryAlone {}

/** An abstract Options source a consumer provides; Meter resolves it by `provideExisting`. */
export abstract class MeterSource implements OrigamiMeterOptions {
  abstract readonly value: OrigamiMeterOptions["value"];
  abstract readonly min: OrigamiMeterOptions["min"];
  abstract readonly max: OrigamiMeterOptions["max"];
  abstract readonly valueText: OrigamiMeterOptions["valueText"];
}

/** A consumer root whose Options are its own record, reached through an abstract class. */
@Directive({
  selector: "[existingMeter]",
  exportAs: "existingMeter",
  hostDirectives: [{ directive: OrigamiMeter, inputs: ["value: decoyValue"] }],
  providers: [
    { provide: MeterSource, useExisting: forwardRef(() => ExistingMeter) },
    OrigamiMeterOptions.provideExisting(() => MeterSource),
  ],
})
export class ExistingMeter implements MeterSource {
  readonly value = signal(3);
  readonly min = signal(0);
  readonly max = signal(4);
  readonly valueText = signal<string | null>(null);
}

interface Arrival {
  readonly percentage: number;
  readonly total: number;
  readonly validated: number;
  readonly pending: number;
}

interface ValueWrite {
  readonly label: string;
  readonly value: number | string;
}

interface RangeWrite {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
}

/** Values for the root with unset bounds: the clamp and the non-finite rows of the policy. */
const valueWrites: readonly ValueWrite[] = [
  { label: "75", value: 75 },
  { label: "130", value: 130 },
  { label: "-5", value: -5 },
  { label: "NaN", value: Number.NaN },
  { label: "Infinity", value: Number.POSITIVE_INFINITY },
  { label: "-Infinity", value: Number.NEGATIVE_INFINITY },
  { label: "empty", value: "" },
  { label: "abc", value: "abc" },
];

/** Value, min and max written together: the bounds rows of the policy. */
const rangeWrites: readonly RangeWrite[] = [
  { label: "15-10-20", value: 15, min: 10, max: 20 },
  { label: "5-10-20", value: 5, min: 10, max: 20 },
  { label: "NaN-10-20", value: Number.NaN, min: 10, max: 20 },
  { label: "25-10-20", value: 25, min: 10, max: 20 },
  { label: "5-NaN-20", value: 5, min: Number.NaN, max: 20 },
  { label: "5-Infinity-20", value: 5, min: Number.POSITIVE_INFINITY, max: 20 },
  { label: "5--Infinity-20", value: 5, min: Number.NEGATIVE_INFINITY, max: 20 },
  { label: "5-0-NaN", value: 5, min: 0, max: Number.NaN },
  { label: "5-0-Infinity", value: 5, min: 0, max: Number.POSITIVE_INFINITY },
  { label: "5-0--Infinity", value: 5, min: 0, max: Number.NEGATIVE_INFINITY },
  { label: "15-20-10", value: 15, min: 20, max: 10 },
  { label: "10-10-10", value: 10, min: 10, max: 10 },
  { label: "50-150-NaN", value: 50, min: 150, max: Number.NaN },
  { label: "0-wide", value: 0, min: -1e308, max: 1e308 },
  { label: "max-wide", value: 1e308, min: -1e308, max: 1e308 },
];

const ringStyles = `
  .ring {
    display: grid;
    place-items: center;
    inline-size: 120px;
    aspect-ratio: 1;
    border-radius: 50%;
    background: conic-gradient(#024da1 var(--og-meter-percent, 0%), #e5e7eb 0);
  }
  .ring::before {
    content: "";
    grid-area: 1 / 1;
    inline-size: 75%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: #ffffff;
  }
  .ring-value {
    grid-area: 1 / 1;
    font-weight: 700;
  }
`;

@Component({
  selector: "acceptance-meter-fixture",
  imports: [
    OrigamiMeter,
    MeterStateProbe,
    MeterGauge,
    MeterFrench,
    MeterSettings,
    FactoryMeter,
    MeterFactoryAlone,
    ExistingMeter,
  ],
  providers: [{ provide: LOCALE_ID, useValue: "el-GR" }],
  styles: ringStyles,
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach meter behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h2 id="arrivals-title" data-testid="arrivals-title">Αφίξεις</h2>
      @for (period of periods; track period.label) {
        <button
          type="button"
          [attr.data-testid]="'gauge-' + period.label"
          (click)="percentage.set(period.value)"
        >
          {{ period.label }}
        </button>
      }
      <button type="button" data-testid="gauge-no-data" (click)="hasData.set(false)">
        No data
      </button>
      <button type="button" data-testid="gauge-load-later" (click)="loadLater(hasData)">
        Load later
      </button>
      <div data-testid="gauge-region">
        @if (arrival(); as arrival) {
          <div
            ogMeter
            #gauge="ogMeter"
            data-testid="gauge"
            class="ring"
            [value]="arrival.percentage"
            aria-labelledby="arrivals-title"
          >
            <span class="ring-value" aria-hidden="true" meterStateProbe>
              {{ gauge.state.valueText() }}
            </span>
          </div>
        } @else {
          <p data-testid="gauge-empty">–</p>
        }
      </div>
      <p data-testid="gauge-counts">
        <span>Σύνολο {{ arrival()?.total ?? "-" }}</span>
        <span>Επικυρώθηκαν {{ arrival()?.validated ?? "-" }}</span>
        <span>Αναμένονται {{ arrival()?.pending ?? "-" }}</span>
      </p>
      <output data-testid="gauge-raw">{{ percentage() }}</output>
    </section>

    <section>
      <h3 id="late-title">Αφίξεις αργότερα</h3>
      <button type="button" data-testid="late-load-later" (click)="loadLater(lateHasData)">
        Load later
      </button>
      @if (lateArrival(); as arrival) {
        <div
          ogMeter
          data-testid="late"
          class="ring"
          [value]="arrival.percentage"
          aria-labelledby="late-title"
        ></div>
      } @else {
        <p data-testid="late-empty">–</p>
      }
    </section>

    <section>
      <h3>Direct</h3>
      <div
        ogMeter
        #direct="ogMeter"
        data-testid="direct"
        [value]="directValue()"
        aria-label="Direct"
      >
        <span meterStateProbe></span>
      </div>
      <output data-testid="direct-state">
        {{ direct.state.value() }} {{ direct.state.percent() }} {{ direct.state.valueText() }}
      </output>
      @for (write of valueWrites; track write.label) {
        <button
          type="button"
          [attr.data-testid]="'direct-value-' + write.label"
          (click)="directValue.set(write.value)"
        >
          value {{ write.label }}
        </button>
      }
      <div
        ogMeter
        data-testid="direct-range"
        [value]="rangeValue()"
        [min]="rangeMin()"
        [max]="rangeMax()"
        aria-label="Range"
      >
        <span meterStateProbe></span>
      </div>
      @for (write of rangeWrites; track write.label) {
        <button
          type="button"
          [attr.data-testid]="'direct-range-' + write.label"
          (click)="range(write)"
        >
          {{ write.label }}
        </button>
      }
      <div
        ogMeter
        data-testid="direct-attributes"
        value="15"
        min="10"
        max="20"
        aria-label="Attributes"
      ></div>
      <div ogMeter data-testid="direct-junk" value="abc" aria-label="Junk"></div>
    </section>

    <section>
      <h3>Value text</h3>
      <div ogMeter data-testid="text" value="75" [valueText]="textText()" aria-label="Text"></div>
      <button type="button" data-testid="text-default" (click)="textText.set(null)">default</button>
      <button type="button" data-testid="text-custom" (click)="textText.set('3 από 4')">
        custom
      </button>
      <button type="button" data-testid="text-empty" (click)="textText.set('')">empty</button>
      <meter-french />
    </section>

    <section>
      <h3 [id]="composerTitleId()" data-testid="composer-title">Θέσεις</h3>
      <meter-gauge data-testid="composer" value="60" [titleId]="composerTitleId()" />
      <button
        type="button"
        data-testid="composer-rename"
        (click)="composerTitleId.set('renamed-title')"
      >
        Rename the title
      </button>
    </section>

    <acceptance-meter-factory-alone />

    <section meterSettings>
      <h3>Replacements</h3>
      <div factoryMeter data-testid="factory" decoyValue="90" aria-label="Factory">
        <span meterStateProbe></span>
      </div>
      <div
        existingMeter
        #existing="existingMeter"
        data-testid="existing"
        decoyValue="9"
        aria-label="Existing"
      >
        <span meterStateProbe></span>
      </div>
      <button type="button" data-testid="existing-write" (click)="existing.value.set(1)">
        Write 1
      </button>
    </section>

    <section>
      <h3>Nested</h3>
      <div ogMeter data-testid="outer" value="20" aria-label="Outer">
        <span meterStateProbe data-testid="outer-probe"></span>
        <div ogMeter data-testid="inner" value="80" aria-label="Inner">
          <span meterStateProbe data-testid="inner-probe"></span>
        </div>
      </div>
    </section>
  `,
})
export class MeterFixture {
  readonly attached = signal(false);
  readonly percentage = signal(75);
  readonly hasData = signal(true);
  /** ODAP's arrivals record: the percentage and the counts it's computed from. */
  readonly arrival = computed<Arrival | null>(() => {
    if (!this.hasData()) {
      return null;
    }

    const percentage = this.percentage();

    return { percentage, total: 120, validated: 90, pending: 30 };
  });
  readonly lateHasData = signal(false);
  readonly lateArrival = computed<Arrival | null>(() => {
    if (!this.lateHasData()) {
      return null;
    }

    return { percentage: 75, total: 120, validated: 90, pending: 30 };
  });
  readonly directValue = signal<number | string>(75);
  readonly rangeValue = signal(15);
  readonly rangeMin = signal(10);
  readonly rangeMax = signal(20);
  readonly textText = signal<string | null>(null);
  readonly composerTitleId = signal("composer-title");
  protected readonly periods: readonly { label: string; value: number }[] = [
    { label: "75", value: 75 },
    { label: "25", value: 25 },
    { label: "130", value: 130 },
    { label: "-5", value: -5 },
    { label: "NaN", value: Number.NaN },
  ];
  protected readonly valueWrites = valueWrites;
  protected readonly rangeWrites = rangeWrites;

  /** Data that arrives 250 ms after the click, as a query resolving. */
  loadLater(hasData: WritableSignal<boolean>): void {
    setTimeout(() => {
      hasData.set(true);
    }, 250);
  }

  /** Writes the value, min and max together, in one render. */
  range(write: RangeWrite): void {
    this.rangeValue.set(write.value);
    this.rangeMin.set(write.min);
    this.rangeMax.set(write.max);
  }
}
