import {
  Component,
  Directive,
  LOCALE_ID,
  PLATFORM_ID,
  booleanAttribute,
  computed,
  inject,
  input,
  linkedSignal,
  model,
  signal,
} from "@angular/core";
import { isPlatformServer } from "@angular/common";
import { FormField, disabled, form, readonly, required, submit } from "@angular/forms/signals";
import type { FieldState, FormValueControl } from "@angular/forms/signals";
import {
  OrigamiDateField,
  OrigamiDateFieldInput,
  OrigamiDateFieldOptions,
  OrigamiDateFieldSegment,
  OrigamiDateFieldState,
} from "@loozo/origami-ui/date-field";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";

// Date field cases (DF). Controls the tests use as script actions are buttons.

/** The segments of the nearest date field root, in its layout's order, in an Input group. */
@Component({
  selector: "date-segments",
  imports: [OrigamiDateFieldInput, OrigamiDateFieldSegment],
  template: `
    <div ogDateFieldInput [attr.data-testid]="group()">
      @for (part of state.segments(); track part.key) {
        @if (part.type === "literal") {
          <span aria-hidden="true" data-literal>{{ part.text }}</span>
        } @else {
          <span [ogDateFieldSegment]="part.type" [attr.data-segment]="part.type"></span>
        }
      }
    </div>
  `,
})
export class DateSegments {
  readonly state = inject(OrigamiDateFieldState);
  /** The Input group's test ID. */
  readonly group = input<string | null>(null);
}

/**
 * A consumer composer that is itself the `FormValueControl` with its own `value` model and
 * supplies the date field's Options from it (F3 guard b). It reads the field's State and the
 * composed root in field initializers, exposes the root's `touch` and forwards `focus()`, which
 * Signal Forms calls on the control it binds.
 */
@Directive({
  selector: "[modelComposer]",
  exportAs: "modelComposer",
  hostDirectives: [{ directive: OrigamiDateField, outputs: ["touch"] }],
  providers: [OrigamiDateFieldOptions.provideExisting(() => ModelComposer)],
})
export class ModelComposer implements OrigamiDateFieldOptions, FormValueControl<string | null> {
  /** The composed root, whose own `value` model Signal Forms must not bind. */
  readonly field = inject(OrigamiDateField);
  readonly value = model<string | null>(null);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly locale = computed(() => "en-US");
  readonly state = inject(OrigamiDateFieldState);

  focus(options?: FocusOptions): void {
    this.field.focus(options);
  }
}

/**
 * The same composer supplying a derived `linkedSignal` over its model, whose writes forward to
 * the model, instead of the model itself (F3 guard c).
 */
@Directive({
  selector: "[linkedComposer]",
  exportAs: "linkedComposer",
  hostDirectives: [OrigamiDateField],
  providers: [
    OrigamiDateFieldOptions.provideFactory(() => {
      const composer = inject(LinkedComposer);

      return {
        value: linkedSignal(() => composer.value(), {
          set: (value) => composer.value.set(value),
        }),
        locale: computed(() => "en-US"),
        disabled: composer.disabled,
        readonly: composer.readonly,
      };
    }),
  ],
})
export class LinkedComposer implements FormValueControl<string | null> {
  readonly value = model<string | null>(null);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly state = inject(OrigamiDateFieldState);
}

/** Replaced Options holding a plain `signal()`, no Signal Forms (F3 guard d). */
@Directive({
  selector: "[signalComposer]",
  exportAs: "signalComposer",
  hostDirectives: [OrigamiDateField],
  providers: [
    OrigamiDateFieldOptions.provideFactory(() => ({
      value: signal<string | null>("2026-10-27"),
      locale: computed(() => "en-US"),
      disabled: computed(() => false),
      readonly: computed(() => false),
    })),
  ],
})
export class SignalComposer {
  readonly state = inject(OrigamiDateFieldState);
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

/**
 * Date fields under a locale that is `el` on the server and `en-US` in the browser: the hydrated
 * root keeps the server's layout from its seed; the browser-created one is `en-US`. The Han root's
 * `locale` is `zh-u-nu-hanidec` on the server, whose digits aren't consecutive code points, and
 * `en-US` in the browser.
 */
@Component({
  selector: "date-field-seed-cases",
  imports: [OrigamiDateField, DateSegments],
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
    <div ogDateField data-testid="seed-root" value="2026-10-27">
      <date-segments group="seed-group" />
    </div>
    <div ogDateField data-testid="hanidec-root" value="2026-10-27" [locale]="hanidec">
      <date-segments group="hanidec-group" />
    </div>
    <button type="button" data-testid="show-late" (click)="late.set(true)">Show late</button>
    @if (late()) {
      <div ogDateField data-testid="late-root" value="2026-10-27">
        <date-segments group="late-group" />
      </div>
    }
  `,
})
export class DateFieldSeedCases {
  readonly late = signal(false);
  readonly hanidec = isPlatformServer(inject(PLATFORM_ID)) ? "zh-u-nu-hanidec" : "en-US";
}

@Component({
  selector: "acceptance-date-field-fixture",
  imports: [
    FormField,
    OrigamiDateField,
    OrigamiDateFieldInput,
    OrigamiDateFieldSegment,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    DateSegments,
    ModelComposer,
    LinkedComposer,
    SignalComposer,
    DateFieldSeedCases,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach date field behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <button type="button" data-testid="before-fields">Before the fields</button>

    <section>
      <h2>Direct, in a Field</h2>
      <!-- The controls come first: the Error appearing on blur must not move them mid-click. -->
      <output data-testid="direct-value">{{ model().direct }}</output>
      <output data-testid="direct-errors">{{ kinds(dates.direct()) }}</output>
      <output data-testid="direct-parse">{{ parse(direct.state) }}</output>
      <output data-testid="direct-touched">{{ dates.direct().touched() }}</output>
      <button type="button" data-testid="direct-reset-same" (click)="dates.direct().reset()">
        Reset
      </button>
      <button
        type="button"
        data-testid="direct-reset-other"
        (click)="dates.direct().reset('2001-02-03')"
      >
        Reset to 2001-02-03
      </button>
      <button type="button" data-testid="direct-focus" (click)="dates.direct().focusBoundControl()">
        Focus the bound control
      </button>
      <button type="button" data-testid="direct-submit" (click)="send()">Submit</button>
      <button type="button" data-testid="direct-write" (click)="write('2026-12-25')">
        Write 2026-12-25
      </button>
      <button type="button" data-testid="direct-freeze" (click)="frozen.set(!frozen())">
        Toggle readonly
      </button>
      <button type="button" data-testid="direct-lock" (click)="locked.set(!locked())">
        Toggle disabled
      </button>

      <div ogField #birthField="ogField">
        <span ogFieldLabel id="direct-label">Date of birth</span>
        <div
          ogDateField
          #direct="ogDateField"
          [formField]="dates.direct"
          data-testid="direct-root"
        >
          <date-segments group="direct-group" />
        </div>
        <p ogFieldDescription id="direct-description">Day, month and year</p>
        @if (birthField.state.errorsShown()) {
          <p ogFieldError id="direct-error" data-testid="direct-error">
            {{ birthField.state.errors()[0]?.kind }}
          </p>
        }
      </div>
      <h2>Composer model</h2>
      <div
        modelComposer
        #composer="modelComposer"
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
      <button type="button" data-testid="composed-reset-same" (click)="dates.composed().reset()">
        Reset
      </button>
      <button
        type="button"
        data-testid="composed-reset-other"
        (click)="dates.composed().reset('2001-02-03')"
      >
        Reset to 2001-02-03
      </button>
      <button
        type="button"
        data-testid="composed-focus"
        (click)="dates.composed().focusBoundControl()"
      >
        Focus the composed control
      </button>

      <h2>Composer linkedSignal</h2>
      <div
        linkedComposer
        #linked="linkedComposer"
        [formField]="dates.linked"
        data-testid="linked-root"
      >
        <date-segments />
      </div>
      <output data-testid="linked-value">{{ model().linked }}</output>
      <output data-testid="linked-errors">{{ kinds(dates.linked()) }}</output>
      <output data-testid="linked-parse">{{ parse(linked.state) }}</output>
      <button type="button" data-testid="linked-reset-same" (click)="dates.linked().reset()">
        Reset
      </button>
      <button
        type="button"
        data-testid="linked-reset-other"
        (click)="dates.linked().reset('2001-02-03')"
      >
        Reset to 2001-02-03
      </button>

      <h2>No Signal Forms</h2>
      <div
        ogDateField
        #plain="ogDateField"
        [(value)]="plainValue"
        locale="en-US"
        data-testid="plain-root"
      >
        <date-segments />
      </div>
      <output data-testid="plain-value">{{ plainValue() }}</output>
      <output data-testid="plain-parse">{{ parse(plain.state) }}</output>
      <div signalComposer #signalled="signalComposer" data-testid="signal-root">
        <date-segments />
      </div>
      <output data-testid="signal-value">{{ signalled.state.value() }}</output>
      <output data-testid="signal-parse">{{ parse(signalled.state) }}</output>

      <h2>Typing</h2>
      <div
        ogDateField
        ogDateFieldInput
        #typing="ogDateField"
        [(value)]="typingValue"
        (valueChange)="typingWrites.set(typingWrites() + 1)"
        [locale]="typingLocale()"
        aria-label="Appointment"
        data-testid="typing-root"
      >
        @for (part of typing.state.segments(); track part.key) {
          @if (part.type === "literal") {
            <span aria-hidden="true" data-literal>{{ part.text }}</span>
          } @else {
            <span [ogDateFieldSegment]="part.type" [attr.data-segment]="part.type"></span>
          }
        }
      </div>
      <output data-testid="typing-value">{{ typingValue() ?? "null" }}</output>
      <output data-testid="typing-writes">{{ typingWrites() }}</output>
      <output data-testid="typing-parse">{{ parse(typing.state) }}</output>
      <output data-testid="typing-state-segments">{{ partTexts(typing.state) }}</output>
      <button type="button" data-testid="typing-write-day" (click)="typingValue.set('2026-12-25')">
        Write 2026-12-25
      </button>
      <button
        type="button"
        data-testid="typing-write-text"
        (click)="typingValue.set('27/10/2026')"
      >
        Write 27/10/2026
      </button>
      <button
        type="button"
        data-testid="typing-locale"
        (click)="typingLocale.set(typingLocale() === 'en-US' ? 'el' : 'en-US')"
      >
        Toggle the locale
      </button>
      <button type="button" data-testid="after-typing">After the typing field</button>

      <h2>Right to left</h2>
      <div dir="rtl">
        <div ogDateField locale="ar-EG" value="2026-10-27" data-testid="rtl-root">
          <date-segments />
        </div>
      </div>

      <h2>Segments on demand</h2>
      <div ogDateField #later="ogDateField" value="2026-10-27" data-testid="later-root">
        @if (laterShown()) {
          <date-segments />
        }
      </div>
      <button
        type="button"
        data-testid="later-focus"
        (click)="later.focus(); laterShown.set(true)"
      >
        Focus the field, then render its segments
      </button>

      <h2>Layout seed</h2>
      <date-field-seed-cases />
    </section>
  `,
})
export class DateFieldFixture {
  readonly attached = signal(false);
  readonly frozen = signal(false);
  readonly locked = signal(false);
  readonly model = signal({
    direct: "2026-10-27" as string | null,
    composed: "2026-10-27" as string | null,
    linked: "2026-10-27" as string | null,
  });
  readonly dates = form(this.model, (path) => {
    required(path.direct);
    readonly(path.direct, () => this.frozen());
    disabled(path.direct, () => this.locked());
  });
  readonly plainValue = signal<string | null>("2026-10-27");
  readonly typingValue = signal<string | null>(null);
  readonly typingWrites = signal(0);
  readonly typingLocale = signal("en-US");
  readonly laterShown = signal(false);
  readonly kinds = errorKinds;
  readonly parse = parseKinds;

  partTexts(state: OrigamiDateFieldState): string {
    const texts: string[] = [];

    for (const part of state.segments()) {
      texts.push(`${part.key}=${part.text}`);
    }

    return texts.join(" ");
  }

  write(value: string): void {
    this.model.set({ ...this.model(), direct: value });
  }

  async send(): Promise<void> {
    await submit(this.dates, async () => undefined);
  }
}
