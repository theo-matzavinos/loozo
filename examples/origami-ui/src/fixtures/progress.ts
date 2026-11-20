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
import {
  OrigamiProgress,
  OrigamiProgressOptions,
  OrigamiProgressState,
} from "@loozo/origami-ui/progress";

/** A descendant reading its nearest Progress State through DI. */
@Directive({
  selector: "[progressStateProbe]",
  host: {
    "data-probe": "",
    "[attr.data-value-state]": "describe(state.value())",
    "[attr.data-percent-state]": "describe(state.percent())",
    "[attr.data-complete-state]": "describe(state.complete())",
    "[attr.data-value-text-state]": "describe(state.valueText())",
  },
})
export class ProgressStateProbe {
  readonly state = inject(OrigamiProgressState);

  protected describe(value: unknown): string {
    return String(value);
  }
}

/**
 * The ODAP step bar's shape: a consumer component composing the root through `hostDirectives`,
 * `label` keeping the value-text override's old name, and the name from a dialog title beside it.
 */
@Component({
  selector: "progress-step-bar",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProgressStateProbe],
  hostDirectives: [{ directive: OrigamiProgress, inputs: ["value", "max", "valueText: label"] }],
  host: { class: "step-bar", "[attr.aria-labelledby]": "titleId()" },
  styles: `
    .step-bar-fill {
      display: block;
      block-size: 100%;
      inline-size: var(--og-progress-percent, 0%);
      background: #2563eb;
    }
  `,
  template: `<span class="step-bar-fill" progressStateProbe></span>`,
})
export class ProgressStepBar {
  readonly titleId = input.required<string>();
}

/** A subtree in another locale, providing its own `LOCALE_ID`. */
@Component({
  selector: "progress-french",
  providers: [{ provide: LOCALE_ID, useValue: "fr-FR" }],
  imports: [OrigamiProgress],
  template: `<div ogProgress data-testid="french" value="2" max="3" aria-label="Français"></div>`,
})
export class ProgressFrench {}

/** Replacement Options state the factory root reads; nothing in a template reads its signals. */
@Directive({ selector: "[progressSettings]", exportAs: "progressSettings" })
export class ProgressSettings {
  readonly value = signal<number | null>(30);
  readonly max = signal(60);
  readonly valueText = signal<string | null>(null);

  /** Writes the value from a timer, outside any template binding. */
  writeLater(value: number): void {
    setTimeout(() => {
      this.value.set(value);
    });
  }
}

/** A consumer root with factory Options over contradicting exposed own inputs. */
@Directive({
  selector: "[factoryProgress]",
  hostDirectives: [{ directive: OrigamiProgress, inputs: ["value: decoyValue", "max: decoyMax"] }],
  providers: [
    OrigamiProgressOptions.provideFactory(() => {
      const settings = inject(ProgressSettings);

      return { value: settings.value, max: settings.max, valueText: settings.valueText };
    }),
  ],
})
export class FactoryProgress {}

/** An abstract Options source a consumer provides; Progress resolves it by `provideExisting`. */
export abstract class ProgressSource implements OrigamiProgressOptions {
  abstract readonly value: OrigamiProgressOptions["value"];
  abstract readonly max: OrigamiProgressOptions["max"];
  abstract readonly valueText: OrigamiProgressOptions["valueText"];
}

/** A consumer root whose Options are its own record, reached through an abstract class. */
@Directive({
  selector: "[existingProgress]",
  exportAs: "existingProgress",
  hostDirectives: [{ directive: OrigamiProgress, inputs: ["value: decoyValue", "max: decoyMax"] }],
  providers: [
    { provide: ProgressSource, useExisting: forwardRef(() => ExistingProgress) },
    OrigamiProgressOptions.provideExisting(() => ProgressSource),
  ],
})
export class ExistingProgress implements ProgressSource {
  readonly value = signal<number | null>(3);
  readonly max = signal(10);
  readonly valueText = signal<string | null>(null);
}

interface Write {
  readonly label: string;
  readonly value: unknown;
}

const valueWrites: readonly Write[] = [
  { label: "-1", value: -1 },
  { label: "0", value: 0 },
  { label: "2", value: 2 },
  { label: "4", value: 4 },
  { label: "5", value: 5 },
  { label: "NaN", value: Number.NaN },
  { label: "Infinity", value: Number.POSITIVE_INFINITY },
  { label: "-Infinity", value: Number.NEGATIVE_INFINITY },
  { label: "empty", value: "" },
  { label: "abc", value: "abc" },
  { label: "null", value: null },
  { label: "undefined", value: undefined },
];

const maxWrites: readonly Write[] = [
  { label: "4", value: 4 },
  { label: "0", value: 0 },
  { label: "-3", value: -3 },
  { label: "NaN", value: Number.NaN },
  { label: "Infinity", value: Number.POSITIVE_INFINITY },
];

@Component({
  selector: "acceptance-progress-fixture",
  imports: [
    OrigamiProgress,
    ProgressStateProbe,
    ProgressStepBar,
    ProgressFrench,
    ProgressSettings,
    FactoryProgress,
    ExistingProgress,
  ],
  providers: [{ provide: LOCALE_ID, useValue: "el-GR" }],
  styles: `
    .step-bar,
    [ogProgress] {
      display: block;
      position: relative;
      overflow: hidden;
      block-size: 4px;
      inline-size: 240px;
      margin-block: 8px;
      background: #d4d4d8;
    }
  `,
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach progress behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h3 [id]="titleId()" data-testid="steps-title">Αλλαγή Προγραμματισμού</h3>
      <progress-step-bar
        data-testid="steps"
        [value]="stepsValue()"
        [max]="stepsMax()"
        [titleId]="titleId()"
      />
      <button type="button" data-testid="steps-1-3" (click)="steps(1, 3)">1/3</button>
      <button type="button" data-testid="steps-2-4" (click)="steps(2, 4)">2/4</button>
      <button type="button" data-testid="steps-3-4" (click)="steps(3, 4)">3/4</button>
      <button type="button" data-testid="steps-max-3" (click)="stepsMax.set(3)">max 3</button>
      <button type="button" data-testid="steps-4-4" (click)="steps(4, 4)">4/4</button>
      <button type="button" data-testid="steps-null" (click)="stepsValue.set(null)">null</button>
      <button type="button" data-testid="steps-rename" (click)="titleId.set('renamed-title')">
        Rename the title
      </button>

      <progress-step-bar data-testid="steps-complete" value="4" max="4" [titleId]="titleId()" />

      <progress-step-bar
        data-testid="warning"
        [value]="warningValue()"
        [max]="warningMax()"
        [titleId]="titleId()"
      />
      <button type="button" data-testid="warning-toggle" (click)="hasWarning.set(!hasWarning())">
        Toggle the warning step
      </button>
      <output data-testid="warning-state">{{ hasWarning() }}</output>
    </section>

    <section>
      <h3>Direct</h3>
      <div
        ogProgress
        #direct="ogProgress"
        data-testid="direct"
        [value]="directValue()"
        [max]="directMax()"
        aria-label="Direct"
      >
        <span progressStateProbe></span>
      </div>
      <output data-testid="direct-state">
        {{ direct.state.value() ?? "null" }} {{ direct.state.percent() ?? "null" }}
        {{ direct.state.complete() }} {{ direct.state.valueText() ?? "null" }}
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
      @for (write of maxWrites; track write.label) {
        <button
          type="button"
          [attr.data-testid]="'direct-max-' + write.label"
          (click)="directMax.set(write.value)"
        >
          max {{ write.label }}
        </button>
      }
      <div
        ogProgress
        data-testid="direct-attributes"
        value="2"
        max="4"
        aria-label="Attributes"
      ></div>
      <div ogProgress data-testid="direct-junk" value="abc" max="4" aria-label="Junk"></div>
    </section>

    <section>
      <h3>Loader</h3>
      <div ogProgress data-testid="loader" aria-label="Loading reservations" class="loader">
        <span class="loader-bar"></span>
      </div>
    </section>

    <section>
      <h3>Value text</h3>
      <div
        ogProgress
        data-testid="text"
        [value]="textValue()"
        max="3"
        [valueText]="textText()"
        aria-label="Text"
      ></div>
      <button type="button" data-testid="text-default" (click)="textText.set(null)">default</button>
      <button type="button" data-testid="text-steps" (click)="textText.set('Βήμα 2 από 4')">
        steps
      </button>
      <button type="button" data-testid="text-empty" (click)="textText.set('')">empty</button>
      <button type="button" data-testid="text-loading" (click)="textText.set('Φόρτωση…')">
        loading
      </button>
      <button type="button" data-testid="text-value-null" (click)="textValue.set(null)">
        value null
      </button>
      <button type="button" data-testid="text-value-2" (click)="textValue.set(2)">value 2</button>
      <progress-french />
    </section>

    <section progressSettings #settings="progressSettings">
      <h3>Replacements</h3>
      <div factoryProgress data-testid="factory" decoyValue="1" decoyMax="10" aria-label="Factory">
        <span progressStateProbe></span>
      </div>
      <button type="button" data-testid="factory-timer" (click)="settings.writeLater(45)">
        Write 45 from a timer
      </button>
      <button type="button" data-testid="factory-text" (click)="settings.valueText.set('Μισό')">
        Set the factory text
      </button>
      <div
        existingProgress
        #existing="existingProgress"
        data-testid="existing"
        decoyValue="9"
        decoyMax="9"
        aria-label="Existing"
      >
        <span progressStateProbe></span>
      </div>
      <button type="button" data-testid="existing-write" (click)="existing.value.set(7)">
        Write 7
      </button>
    </section>

    <section>
      <h3>Nested</h3>
      <div ogProgress data-testid="outer" value="1" max="4" aria-label="Outer">
        <span progressStateProbe data-testid="outer-probe"></span>
        <div ogProgress data-testid="inner" value="3" max="4" aria-label="Inner">
          <span progressStateProbe data-testid="inner-probe"></span>
        </div>
      </div>
    </section>
  `,
})
export class ProgressFixture {
  readonly attached = signal(false);
  readonly titleId = signal("steps-title");
  readonly stepsValue = signal<number | null>(2);
  readonly stepsMax = signal(4);
  readonly hasWarning = signal(false);
  /** ODAP's warning branch: one signal moves both the value and the step count. */
  readonly warningValue = computed(() => {
    if (this.hasWarning()) {
      return 3;
    }

    return 2;
  });
  readonly warningMax = computed(() => {
    if (this.hasWarning()) {
      return 4;
    }

    return 3;
  });
  readonly directValue = signal<unknown>(2);
  readonly directMax = signal<unknown>(4);
  readonly textValue = signal<number | null>(2);
  readonly textText = signal<string | null>(null);
  protected readonly valueWrites = valueWrites;
  protected readonly maxWrites = maxWrites;

  /** Sets the value and the max together, in one render. */
  steps(value: number, max: number): void {
    this.stepsValue.set(value);
    this.stepsMax.set(max);
  }
}
