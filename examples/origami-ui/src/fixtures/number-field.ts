import {
  Component,
  Directive,
  ElementRef,
  LOCALE_ID,
  PLATFORM_ID,
  TemplateRef,
  ViewContainerRef,
  booleanAttribute,
  computed,
  inject,
  input,
  linkedSignal,
  model,
  numberAttribute,
  signal,
  viewChild,
} from "@angular/core";
import type { AfterViewInit, WritableSignal } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { FormField, disabled, form, max, min, readonly, required } from "@angular/forms/signals";
import type { FieldState, FormValueControl } from "@angular/forms/signals";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";
import {
  OrigamiNumberField,
  OrigamiNumberFieldDecrement,
  OrigamiNumberFieldIncrement,
  OrigamiNumberFieldInput,
  OrigamiNumberFieldOptions,
  OrigamiNumberFieldState,
} from "@loozo/origami-ui/number-field";

// Number field cases (NF). Controls the tests use as script actions are buttons.

function bound(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return numberAttribute(value);
}

/**
 * A consumer composer that is itself the `FormValueControl` with its own `value` model and `min`
 * and `max` inputs, which Signal Forms writes, and supplies the number field's Options from them
 * (F3 guard b). It exposes the root's `touch` and forwards `focus()`, which Signal Forms calls on
 * the control it binds.
 */
@Directive({
  selector: "[modelComposer]",
  exportAs: "modelComposer",
  hostDirectives: [{ directive: OrigamiNumberField, outputs: ["touch"] }],
  providers: [OrigamiNumberFieldOptions.provideExisting(() => ModelComposer)],
})
export class ModelComposer implements OrigamiNumberFieldOptions, FormValueControl<number | null> {
  /** The composed root, whose own `value` model Signal Forms must not bind. */
  readonly field = inject(OrigamiNumberField);
  readonly value = model<number | null>(null);
  readonly min = input<number | undefined, unknown>(undefined, { transform: bound });
  readonly max = input<number | undefined, unknown>(undefined, { transform: bound });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly locale = computed(() => "en-US");
  readonly step = computed(() => 0.5);
  readonly minimumFractionDigits = computed(() => 2);
  readonly maximumFractionDigits = computed(() => 2);
  readonly useGrouping = computed(() => true);
  readonly state = inject(OrigamiNumberFieldState);

  focus(options?: FocusOptions): void {
    this.field.focus(options);
  }
}

/**
 * The same composer supplying a derived `linkedSignal` over its model, whose writes forward to
 * the model, instead of the model itself (F3 guard c), through factory Options.
 */
@Directive({
  selector: "[linkedComposer]",
  exportAs: "linkedComposer",
  hostDirectives: [OrigamiNumberField],
  providers: [
    OrigamiNumberFieldOptions.provideFactory(() => {
      const composer = inject(LinkedComposer);

      return {
        value: linkedSignal(() => composer.value(), {
          set: (value) => composer.value.set(value),
        }),
        locale: computed(() => "el-GR"),
        min: composer.min,
        max: composer.max,
        step: computed(() => 1),
        minimumFractionDigits: computed(() => null),
        maximumFractionDigits: computed(() => null),
        useGrouping: computed(() => true),
        disabled: composer.disabled,
        readonly: composer.readonly,
      };
    }),
  ],
})
export class LinkedComposer implements FormValueControl<number | null> {
  readonly value = model<number | null>(null);
  readonly min = input<number | undefined, unknown>(undefined, { transform: bound });
  readonly max = input<number | undefined, unknown>(undefined, { transform: bound });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly state = inject(OrigamiNumberFieldState);
}

/** Replaced Options holding a plain `signal()`, no Signal Forms (F3 guard d). */
@Directive({
  selector: "[signalComposer]",
  exportAs: "signalComposer",
  hostDirectives: [OrigamiNumberField],
  providers: [
    OrigamiNumberFieldOptions.provideFactory(() => ({
      value: signal<number | null>(5),
      locale: computed(() => "el-GR"),
      min: computed(() => undefined),
      max: computed(() => undefined),
      step: computed(() => 1),
      minimumFractionDigits: computed(() => null),
      maximumFractionDigits: computed(() => null),
      useGrouping: computed(() => true),
      disabled: computed(() => false),
      readonly: computed(() => false),
    })),
  ],
})
export class SignalComposer {
  readonly state = inject(OrigamiNumberFieldState);
}

/** Counts the `set` calls of `value`, the write boundary the parser and stepping call, in `sets`. */
function countSets(value: WritableSignal<number | null>, sets: WritableSignal<number>): void {
  const set = value.set.bind(value);

  value.set = (next) => {
    sets.set(sets() + 1);
    set(next);
  };
}

/**
 * Replaced Options whose plain `signal()` counts its `set` calls: a programmatic 1.234 at two
 * fraction digits, `el-GR`.
 */
@Directive({
  selector: "[countingComposer]",
  exportAs: "countingComposer",
  hostDirectives: [OrigamiNumberField],
  providers: [
    OrigamiNumberFieldOptions.provideFactory(() => ({
      value: inject(CountingComposer).value,
      locale: computed(() => "el-GR"),
      min: computed(() => undefined),
      max: computed(() => undefined),
      step: computed(() => 1),
      minimumFractionDigits: computed(() => 2),
      maximumFractionDigits: computed(() => 2),
      useGrouping: computed(() => true),
      disabled: computed(() => false),
      readonly: computed(() => false),
    })),
  ],
})
export class CountingComposer {
  readonly sets = signal(0);
  readonly value: WritableSignal<number | null> = signal<number | null>(1.234);
  readonly state = inject(OrigamiNumberFieldState);

  constructor() {
    countSets(this.value, this.sets);
  }
}

/**
 * Replaced Options whose value is a plain `signal()` the fixture owns, which outlives the root,
 * `el-GR`; it exposes the root's `touch`.
 */
@Directive({
  selector: "[droppedComposer]",
  hostDirectives: [{ directive: OrigamiNumberField, outputs: ["touch"] }],
  providers: [
    OrigamiNumberFieldOptions.provideFactory(() => ({
      value: inject(NumberFieldFixture).droppedValue,
      locale: computed(() => "el-GR"),
      min: computed(() => undefined),
      max: computed(() => undefined),
      step: computed(() => 1),
      minimumFractionDigits: computed(() => null),
      maximumFractionDigits: computed(() => null),
      useGrouping: computed(() => true),
      disabled: computed(() => false),
      readonly: computed(() => false),
    })),
  ],
})
export class DroppedComposer {}

/**
 * Focuses its element and takes focus away again during the change detection that creates it,
 * before any render callback: a lifecycle hook, since a render callback would run after the
 * number field root's first render.
 */
@Directive({ selector: "[focusThenLeave]" })
export class FocusThenLeave implements AfterViewInit {
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  ngAfterViewInit(): void {
    this.#element.focus();
    this.#element.blur();
  }
}

/** Clicks its element during the change detection that creates it, as `focusThenLeave` leaves. */
@Directive({ selector: "[clickOnInit]" })
export class ClickOnInit implements AfterViewInit {
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  ngAfterViewInit(): void {
    this.#element.click();
  }
}

function errorKinds(state: FieldState<number | null>): string {
  const kinds: string[] = [];

  for (const error of state.errors()) {
    kinds.push(error.kind);
  }

  return kinds.join(",");
}

function parseKinds(state: OrigamiNumberFieldState): string {
  const kinds: string[] = [];

  for (const error of state.parseErrors()) {
    kinds.push(error.kind);
  }

  return kinds.join(",");
}

/**
 * `LOCALE_ID` is `el-GR` on the server and in the browser, as in the consumer applications. The
 * host's `data-client-rendered` is absent in server HTML and set once the browser renders the
 * fixture: NF12 reads it to know its action reached a block that was still dehydrated.
 */
@Component({
  selector: "acceptance-number-field-fixture",
  host: { "[attr.data-client-rendered]": "clientRendered" },
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    OrigamiNumberField,
    OrigamiNumberFieldInput,
    OrigamiNumberFieldIncrement,
    OrigamiNumberFieldDecrement,
    ModelComposer,
    LinkedComposer,
    SignalComposer,
    CountingComposer,
    DroppedComposer,
    FocusThenLeave,
    ClickOnInit,
  ],
  providers: [{ provide: LOCALE_ID, useValue: "el-GR" }],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach number field behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <button type="button" data-testid="before-fields">Before the fields</button>

    <section>
      <h2>Direct, in a Field</h2>
      <!-- The controls come first: the Error appearing on blur must not move them mid-click. -->
      <output data-testid="direct-value">{{ model().direct ?? "null" }}</output>
      <output data-testid="direct-errors">{{ kinds(amounts.direct()) }}</output>
      <output data-testid="direct-parse">{{ parse(direct.state) }}</output>
      <output data-testid="direct-touched">{{ amounts.direct().touched() }}</output>
      <output data-testid="direct-writes">{{ directWrites() }}</output>
      <output data-testid="direct-bounds">{{ direct.min() }}..{{ direct.max() }}</output>
      <button type="button" data-testid="direct-reset-same" (click)="amounts.direct().reset()">
        Reset
      </button>
      <button type="button" data-testid="direct-reset-null" (click)="amounts.direct().reset(null)">
        Reset to null
      </button>
      <button type="button" data-testid="direct-focus" (click)="amounts.direct().focusBoundControl()">
        Focus the bound control
      </button>
      <button type="button" data-testid="direct-write" (click)="write(7.25)">Write 7.25</button>
      <button type="button" data-testid="direct-write-null" (click)="write(null)">
        Write null
      </button>
      <button type="button" data-testid="direct-freeze" (click)="frozen.set(!frozen())">
        Toggle readonly
      </button>
      <button type="button" data-testid="direct-lock" (click)="locked.set(!locked())">
        Toggle disabled
      </button>

      <div ogField #amountField="ogField">
        <label ogFieldLabel id="direct-label">Ποσό</label>
        <div
          ogNumberField
          #direct="ogNumberField"
          [formField]="amounts.direct"
          minimumFractionDigits="2"
          maximumFractionDigits="2"
          (valueChange)="directWrites.set(directWrites() + 1)"
          data-testid="direct-root"
        >
          <button ogNumberFieldDecrement aria-label="Μείωση" data-testid="direct-decrement">
            −
          </button>
          <span aria-hidden="true">€</span>
          <input ogNumberFieldInput placeholder="0,00" data-testid="direct-input" />
          <button ogNumberFieldIncrement aria-label="Αύξηση" data-testid="direct-increment">
            +
          </button>
        </div>
        <p ogFieldDescription id="direct-description">Σε ευρώ</p>
        @if (amountField.state.errorsShown()) {
          <p ogFieldError id="direct-error" data-testid="direct-error">
            {{ amountField.state.errors()[0]?.kind }}
          </p>
        }
      </div>

      <h2>Standalone count</h2>
      <output data-testid="plain-value">{{ count() ?? "null" }}</output>
      <output data-testid="plain-parse">{{ parse(plain.state) }}</output>
      <output data-testid="plain-writes">{{ plainWrites() }}</output>
      <button type="button" data-testid="plain-write" (click)="count.set(25)">Write 25</button>
      <button type="button" data-testid="plain-freeze" (click)="plainFrozen.set(!plainFrozen())">
        Toggle readonly
      </button>
      <button type="button" data-testid="plain-lock" (click)="plainLocked.set(!plainLocked())">
        Toggle disabled
      </button>
      <div
        ogNumberField
        #plain="ogNumberField"
        [(value)]="count"
        min="0"
        max="20"
        step="5"
        maximumFractionDigits="0"
        [readonly]="plainFrozen()"
        [disabled]="plainLocked()"
        (valueChange)="plainWrites.set(plainWrites() + 1)"
        data-testid="plain-root"
      >
        <button ogNumberFieldDecrement aria-label="Fewer" data-testid="plain-decrement">−</button>
        <input ogNumberFieldInput aria-label="Tickets" data-testid="plain-input" />
        <button ogNumberFieldIncrement aria-label="More" data-testid="plain-increment">+</button>
      </div>

      <h2>Format</h2>
      <output data-testid="format-value">{{ formatted() ?? "null" }}</output>
      <output data-testid="format-parse">{{ parse(format.state) }}</output>
      <output data-testid="format-writes">{{ formatWrites() }}</output>
      <button
        type="button"
        data-testid="format-locale"
        (click)="formatLocale.set(formatLocale() === 'el-GR' ? 'en-US' : 'el-GR')"
      >
        Toggle the locale
      </button>
      <button
        type="button"
        data-testid="format-digits"
        (click)="formatDigits.set(formatDigits() === null ? 0 : null)"
      >
        Toggle the fraction digits
      </button>
      <button
        type="button"
        data-testid="format-grouping"
        (click)="formatGrouping.set(!formatGrouping())"
      >
        Toggle the grouping
      </button>
      <div
        ogNumberField
        #format="ogNumberField"
        [(value)]="formatted"
        [locale]="formatLocale()"
        [maximumFractionDigits]="formatDigits()"
        [useGrouping]="formatGrouping()"
        (valueChange)="formatWrites.set(formatWrites() + 1)"
        data-testid="format-root"
      >
        <input ogNumberFieldInput aria-label="Formatted" data-testid="format-input" />
      </div>
      <button type="button" data-testid="after-fields">After the fields</button>

      <h2>Composer model</h2>
      <div
        modelComposer
        #composer="modelComposer"
        [formField]="amounts.composed"
        (valueChange)="composedWrites.set(composedWrites() + 1)"
        data-testid="composed-root"
      >
        <button ogNumberFieldDecrement aria-label="Decrease" data-testid="composed-decrement">
          −
        </button>
        <input ogNumberFieldInput aria-label="Composed" data-testid="composed-input" />
        <button ogNumberFieldIncrement aria-label="Increase" data-testid="composed-increment">
          +
        </button>
      </div>
      <output data-testid="composed-value">{{ model().composed ?? "null" }}</output>
      <output data-testid="composed-errors">{{ kinds(amounts.composed()) }}</output>
      <output data-testid="composed-parse">{{ parse(composer.state) }}</output>
      <output data-testid="composed-own-value">{{ composer.field.value() ?? "null" }}</output>
      <output data-testid="composed-touched">{{ amounts.composed().touched() }}</output>
      <output data-testid="composed-writes">{{ composedWrites() }}</output>
      <button type="button" data-testid="composed-reset-same" (click)="amounts.composed().reset()">
        Reset
      </button>
      <button
        type="button"
        data-testid="composed-focus"
        (click)="amounts.composed().focusBoundControl()"
      >
        Focus the composed control
      </button>

      <h2>Composer linkedSignal</h2>
      <div linkedComposer #linked="linkedComposer" [formField]="amounts.linked" data-testid="linked-root">
        <input ogNumberFieldInput aria-label="Linked" data-testid="linked-input" />
      </div>
      <output data-testid="linked-value">{{ model().linked ?? "null" }}</output>
      <output data-testid="linked-errors">{{ kinds(amounts.linked()) }}</output>
      <output data-testid="linked-parse">{{ parse(linked.state) }}</output>
      <button type="button" data-testid="linked-reset-same" (click)="amounts.linked().reset()">
        Reset
      </button>

      <h2>No Signal Forms</h2>
      <div signalComposer #signalled="signalComposer" data-testid="signal-root">
        <input ogNumberFieldInput aria-label="Signalled" data-testid="signal-input" />
      </div>
      <output data-testid="signal-value">{{ signalled.state.value() ?? "null" }}</output>
      <output data-testid="signal-parse">{{ parse(signalled.state) }}</output>

      <h2>Counted writes</h2>
      <div countingComposer #counted="countingComposer" data-testid="counted-root">
        <input ogNumberFieldInput aria-label="Counted" data-testid="counted-input" />
      </div>
      <output data-testid="counted-value">{{ counted.state.value() ?? "null" }}</output>
      <output data-testid="counted-sets">{{ counted.sets() }}</output>

      <h2>Left before the first render</h2>
      <output data-testid="early-touches">{{ earlyTouches() }}</output>
      <button type="button" data-testid="early-show" (click)="earlyShown.set(true)">
        Render a field whose Input loses focus at once
      </button>
      @if (earlyShown()) {
        <div ogNumberField [value]="3" (touch)="earlyTouches.set(earlyTouches() + 1)">
          <input ogNumberFieldInput aria-label="Early" data-testid="early-input" focusThenLeave />
        </div>
      }

      <h2>Removed by its touch before its first render</h2>
      <output data-testid="dropped-value">{{ droppedValue() ?? "null" }}</output>
      <output data-testid="dropped-sets">{{ droppedSets() }}</output>
      <output data-testid="dropped-touches">{{ droppedTouches() }}</output>
      <button type="button" data-testid="dropped-show" (click)="showDropped()">
        Render a field whose Input loses focus and whose Increment is clicked at once; its touch
        removes it
      </button>
      <ng-container #droppedHost />
      <ng-template #dropped>
        <div droppedComposer (touch)="dropDropped()">
          <input ogNumberFieldInput aria-label="Dropped" data-testid="dropped-input" focusThenLeave />
          <button type="button" ogNumberFieldIncrement clickOnInit>Αύξηση</button>
        </div>
      </ng-template>

      <h2>Input on demand</h2>
      <div ogNumberField #later="ogNumberField" [value]="3" data-testid="later-root">
        @if (laterShown()) {
          <input ogNumberFieldInput aria-label="Later" data-testid="later-input" />
        }
      </div>
      <button
        type="button"
        data-testid="later-focus"
        (click)="later.focus(); laterShown.set(true)"
      >
        Focus the field, then render its Input
      </button>
    </section>
  `,
})
export class NumberFieldFixture {
  readonly clientRendered = isPlatformBrowser(inject(PLATFORM_ID)) || null;
  readonly attached = signal(false);
  readonly frozen = signal(false);
  readonly locked = signal(false);
  readonly model = signal({
    direct: 12.5 as number | null,
    composed: 12.5 as number | null,
    linked: 12.5 as number | null,
  });
  readonly amounts = form(this.model, (path) => {
    required(path.direct);
    min(path.direct, 0);
    max(path.direct, 1000);
    readonly(path.direct, () => this.frozen());
    disabled(path.direct, () => this.locked());
    min(path.composed, 0);
    max(path.composed, 100);
    required(path.linked);
  });
  readonly directWrites = signal(0);
  readonly composedWrites = signal(0);
  readonly count = signal<number | null>(null);
  readonly plainWrites = signal(0);
  readonly plainFrozen = signal(false);
  readonly plainLocked = signal(false);
  readonly formatted = signal<number | null>(1234.5);
  readonly formatWrites = signal(0);
  readonly formatLocale = signal("el-GR");
  readonly formatDigits = signal<number | null>(null);
  readonly formatGrouping = signal(true);
  readonly laterShown = signal(false);
  readonly earlyShown = signal(false);
  readonly earlyTouches = signal(0);
  /** The dropped field's value, owned here so it outlives the root, and its `set` count. */
  readonly droppedValue = signal<number | null>(3);
  readonly droppedSets = signal(0);
  readonly droppedTouches = signal(0);
  readonly kinds = errorKinds;
  readonly parse = parseKinds;

  private readonly droppedHost = viewChild.required("droppedHost", { read: ViewContainerRef });
  private readonly dropped = viewChild.required<TemplateRef<unknown>>("dropped");

  constructor() {
    countSets(this.droppedValue, this.droppedSets);
  }

  showDropped(): void {
    this.droppedHost().createEmbeddedView(this.dropped());
  }

  /** The root's `touch`: destroys the root at once, while its first render's queue is running. */
  dropDropped(): void {
    this.droppedTouches.set(this.droppedTouches() + 1);
    this.droppedHost().clear();
  }

  write(value: number | null): void {
    this.model.set({ ...this.model(), direct: value });
  }
}
