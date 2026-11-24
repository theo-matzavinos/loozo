import {
  Component,
  Directive,
  PLATFORM_ID,
  booleanAttribute,
  computed,
  inject,
  input,
  model,
  signal,
} from "@angular/core";
import type { WritableSignal } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import {
  FormField,
  disabled,
  form,
  minLength,
  pattern,
  readonly,
  required,
  submit,
} from "@angular/forms/signals";
import type { FieldState, FormValueControl } from "@angular/forms/signals";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";
import {
  OrigamiOtpField,
  OrigamiOtpFieldInput,
  OrigamiOtpFieldOptions,
  OrigamiOtpFieldState,
} from "@loozo/origami-ui/otp-field";

// OTP field cases (OT). Controls the tests use as script actions are buttons.

/**
 * A consumer composer that is itself the `FormValueControl` with its own `value` model and
 * `disabled` and `readonly` inputs, which Signal Forms writes, and supplies the OTP field's Options
 * from them, four digits. It exposes the root's `touch` and forwards `focus()`, which Signal Forms
 * calls on the control it binds.
 */
@Directive({
  selector: "[codeComposer]",
  exportAs: "codeComposer",
  hostDirectives: [{ directive: OrigamiOtpField, outputs: ["touch"] }],
  providers: [OrigamiOtpFieldOptions.provideExisting(() => CodeComposer)],
})
export class CodeComposer implements OrigamiOtpFieldOptions, FormValueControl<string> {
  /** The composed root, whose own `value` model Signal Forms must not bind. */
  readonly field = inject(OrigamiOtpField);
  readonly value = model("");
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly length = computed(() => 4);
  readonly mask = computed(() => false);
  readonly state = inject(OrigamiOtpFieldState);

  focus(options?: FocusOptions): void {
    this.field.focus(options);
  }
}

/** Counts the `set` calls of `value`, the write boundary an edit calls, in `sets`. */
function countSets(value: WritableSignal<string>, sets: WritableSignal<number>): void {
  const set = value.set.bind(value);

  value.set = (next) => {
    sets.set(sets() + 1);
    set(next);
  };
}

/** Replaced Options holding a plain `signal()` at `12` that counts its `set` calls, five digits. */
@Directive({
  selector: "[signalComposer]",
  exportAs: "signalComposer",
  hostDirectives: [OrigamiOtpField],
  providers: [
    OrigamiOtpFieldOptions.provideFactory(() => ({
      value: inject(SignalComposer).value,
      length: computed(() => 5),
      mask: computed(() => false),
      disabled: computed(() => false),
      readonly: computed(() => false),
    })),
  ],
})
export class SignalComposer {
  readonly sets = signal(0);
  readonly value: WritableSignal<string> = signal("12");
  readonly state = inject(OrigamiOtpFieldState);

  constructor() {
    countSets(this.value, this.sets);
  }
}

function errorKinds(state: FieldState<string>): string {
  const kinds: string[] = [];

  for (const error of state.errors()) {
    kinds.push(error.kind);
  }

  return kinds.join(",");
}

/** The cells as text, one character per cell, `_` for an empty one: `12____`. */
function cellText(state: OrigamiOtpFieldState): string {
  let text = "";

  for (const cell of state.cells()) {
    text += cell.char ?? (cell.filled ? "•" : "_");
  }

  return text;
}

/** The cells' caret and selection flags: `c` caret, `s` selected, `.` neither. */
function cellMarks(state: OrigamiOtpFieldState): string {
  let marks = "";

  for (const cell of state.cells()) {
    if (cell.caret) {
      marks += "c";
    } else if (cell.selected) {
      marks += "s";
    } else {
      marks += ".";
    }
  }

  return marks;
}

/**
 * The cells are six 48 px boxes with an 8 px gap under a transparent Input stretched over them,
 * as the README lays it out; the masked field draws a dot for a filled cell. The host's
 * `data-client-rendered` is absent in server HTML and set once the browser renders the fixture:
 * OT12 reads it to know its action reached a block that was still dehydrated.
 */
@Component({
  selector: "acceptance-otp-field-fixture",
  host: { "[attr.data-client-rendered]": "clientRendered" },
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    OrigamiOtpField,
    OrigamiOtpFieldInput,
    CodeComposer,
    SignalComposer,
  ],
  styles: `
    .otp {
      position: relative;
      inline-size: max-content;
      margin-block: 8px;
    }
    .otp input {
      position: absolute;
      inset: 0;
      inline-size: 100%;
      block-size: 100%;
      margin: 0;
      padding: 0;
      color: transparent;
      caret-color: transparent;
      background: transparent;
      border: 0;
      outline: none;
      font-size: 1px;
    }
    .otp input::selection {
      background: transparent;
      color: transparent;
    }
    .cells {
      display: flex;
      gap: 8px;
    }
    .cell {
      display: grid;
      place-items: center;
      box-sizing: border-box;
      inline-size: 48px;
      block-size: 56px;
      border: 1px solid rgb(136, 136, 136);
      background: rgb(255, 255, 255);
      font: 24px sans-serif;
      color: rgb(0, 0, 0);
    }
    .cell.caret {
      border-color: rgb(51, 102, 204);
    }
    .cell.selected {
      background: rgb(204, 221, 238);
      border-color: rgb(51, 102, 204);
    }
    .otp.focused .cells {
      outline: 2px solid rgb(51, 102, 204);
      outline-offset: 4px;
    }
  `,
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach OTP field behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <button type="button" data-testid="before-fields">Before the fields</button>

    <section>
      <h2>Direct, in a Field</h2>
      <!-- The controls come first: the Error appearing on blur must not move them mid-click. -->
      <output data-testid="direct-value">{{ model().direct }}</output>
      <output data-testid="direct-errors">{{ kinds(codes.direct()) }}</output>
      <output data-testid="direct-touched">{{ codes.direct().touched() }}</output>
      <output data-testid="direct-touches"
        >{{ directTouches().length }}:{{ directTouches().join(",") }}</output
      >
      <output data-testid="direct-changes">{{ directChanges().join(",") }}</output>
      <output data-testid="direct-complete">{{ direct.state.complete() }}</output>
      <output data-testid="direct-cells">{{ cells(direct.state) }}</output>
      <output data-testid="direct-marks">{{ marks(direct.state) }}</output>
      <output data-testid="direct-focused">{{ direct.state.focused() }}</output>
      <output data-testid="direct-submits">{{ directSubmits().join(",") }}</output>
      @for (written of writes; track written) {
        <button type="button" [attr.data-testid]="'direct-write-' + written" (click)="write(written)">
          Write "{{ written }}"
        </button>
      }
      <button type="button" data-testid="direct-reset" (click)="codes.direct().reset('')">
        Reset to empty
      </button>
      <button type="button" data-testid="direct-focus" (click)="codes.direct().focusBoundControl()">
        Focus the bound control
      </button>
      <button type="button" data-testid="direct-freeze" (click)="frozen.set(!frozen())">
        Toggle readonly
      </button>
      <button type="button" data-testid="direct-lock" (click)="locked.set(!locked())">
        Toggle disabled
      </button>

      <form (submit)="submitDirect($event)" novalidate data-testid="direct-form">
        <div ogField #codeField="ogField">
          <label ogFieldLabel id="direct-label">Κωδικός</label>
          <p ogFieldDescription id="direct-description">Ο 6-ψήφιος κωδικός</p>
          <div
            ogOtpField
            #direct="ogOtpField"
            class="otp"
            [class.focused]="direct.state.focused()"
            [formField]="codes.direct"
            (valueChange)="changed($event, direct.state.complete())"
            (touch)="touched()"
            data-testid="direct-root"
          >
            <input ogOtpFieldInput data-testid="direct-input" />
            <div class="cells" aria-hidden="true" data-testid="direct-cell-row">
              @for (cell of direct.state.cells(); track cell.index) {
                <span
                  class="cell"
                  [class.filled]="cell.filled"
                  [class.caret]="cell.caret"
                  [class.selected]="cell.selected"
                  [attr.data-testid]="'direct-cell-' + cell.index"
                  >{{ cell.char }}</span
                >
              }
            </div>
          </div>
          @if (codeField.state.errorsShown()) {
            <p ogFieldError id="direct-error" data-testid="direct-error">
              {{ codeField.state.errors()[0]?.kind }}
            </p>
          }
        </div>
        <button type="submit" data-testid="direct-submit">Είσοδος</button>
      </form>

      <h2>minLength only</h2>
      <output data-testid="loose-errors">{{ kinds(codes.loose()) }}</output>
      <output data-testid="loose-submits">{{ looseSubmits().join(",") }}</output>
      <button type="button" data-testid="loose-write-1234567" (click)="writeLoose('1234567')">
        Write "1234567"
      </button>
      <form (submit)="submitLoose($event)" novalidate>
        <div ogOtpField [formField]="codes.loose" data-testid="loose-root">
          <input ogOtpFieldInput aria-label="Loose code" data-testid="loose-input" />
        </div>
        <button type="submit" data-testid="loose-submit">Submit loose</button>
      </form>

      <h2>Masked PIN</h2>
      <output data-testid="pin-value">{{ pin() }}</output>
      <output data-testid="pin-cells">{{ cells(pinField.state) }}</output>
      <output data-testid="pin-marks">{{ marks(pinField.state) }}</output>
      <output data-testid="pin-chars">{{ chars(pinField.state) }}</output>
      <button type="button" data-testid="pin-unmask" (click)="pinMasked.set(!pinMasked())">
        Toggle the mask
      </button>
      <button type="button" data-testid="pin-write-246810" (click)="pin.set('246810')">
        Write "246810"
      </button>
      <label for="pin-input" id="pin-label">PIN</label>
      <div
        ogOtpField
        #pinField="ogOtpField"
        class="otp"
        [class.focused]="pinField.state.focused()"
        [mask]="pinMasked()"
        [(value)]="pin"
        data-testid="pin-root"
      >
        <input ogOtpFieldInput id="pin-input" autocomplete="new-password" data-testid="pin-input" />
        <div class="cells" aria-hidden="true" data-testid="pin-cell-row">
          @for (cell of pinField.state.cells(); track cell.index) {
            <span
              class="cell"
              [class.filled]="cell.filled"
              [class.caret]="cell.caret"
              [class.selected]="cell.selected"
              [attr.data-testid]="'pin-cell-' + cell.index"
              >@if (pinField.state.mask()) {
                @if (cell.filled) {
                  •
                }
              } @else {
                {{ cell.char }}
              }</span
            >
          }
        </div>
      </div>

      <h2>Complete from the server</h2>
      <output data-testid="preset-value">{{ preset() }}</output>
      <output data-testid="preset-changes">{{ presetChanges() }}</output>
      <div ogOtpField [(value)]="preset" (valueChange)="presetChanges.set(presetChanges() + 1)">
        <input ogOtpFieldInput aria-label="Preset" data-testid="preset-input" />
      </div>

      <h2>Bound autocomplete</h2>
      <button
        type="button"
        data-testid="bound-autocomplete"
        (click)="autocomplete.set(autocomplete() === 'current-password' ? 'off' : 'current-password')"
      >
        Toggle the bound autocomplete
      </button>
      <div ogOtpField [(value)]="bound" data-testid="bound-root">
        <input
          ogOtpFieldInput
          aria-label="Bound"
          [attr.autocomplete]="autocomplete()"
          data-testid="bound-input"
        />
      </div>

      <h2>Composer model</h2>
      <div
        codeComposer
        #composer="codeComposer"
        [formField]="codes.composed"
        (valueChange)="composedChanges.set(composedChanges() + 1)"
        data-testid="composed-root"
      >
        <input ogOtpFieldInput aria-label="Composed" data-testid="composed-input" />
      </div>
      <output data-testid="composed-value">{{ model().composed }}</output>
      <output data-testid="composed-own-value">{{ composer.field.value() }}</output>
      <output data-testid="composed-cells">{{ cells(composer.state) }}</output>
      <output data-testid="composed-touched">{{ codes.composed().touched() }}</output>
      <output data-testid="composed-changes">{{ composedChanges() }}</output>
      <button type="button" data-testid="composed-reset" (click)="codes.composed().reset('')">
        Reset the composed code
      </button>
      <button
        type="button"
        data-testid="composed-focus"
        (click)="codes.composed().focusBoundControl()"
      >
        Focus the composed control
      </button>
      <button type="button" data-testid="composed-lock" (click)="composedLocked.set(!composedLocked())">
        Toggle the composed field disabled
      </button>

      <h2>No Signal Forms</h2>
      <div signalComposer #signalled="signalComposer" data-testid="signal-root">
        <input ogOtpFieldInput aria-label="Signalled" data-testid="signal-input" />
      </div>
      <output data-testid="signal-value">{{ signalled.state.value() }}</output>
      <output data-testid="signal-cells">{{ cells(signalled.state) }}</output>
      <output data-testid="signal-sets">{{ signalled.sets() }}</output>
      <button type="button" data-testid="after-fields">After the fields</button>
    </section>
  `,
})
export class OtpFieldFixture {
  readonly clientRendered = isPlatformBrowser(inject(PLATFORM_ID)) || null;
  readonly attached = signal(false);
  readonly preset = signal("123456");
  readonly presetChanges = signal(0);
  readonly writes = ["987654", "123456", "98", "", "012345", "12ab", "1234567"];
  readonly frozen = signal(false);
  readonly locked = signal(false);
  readonly composedLocked = signal(false);
  readonly model = signal({ direct: "", loose: "", composed: "12" });
  readonly codes = form(this.model, (path) => {
    required(path.direct);
    pattern(path.direct, /^[0-9]{6}$/);
    readonly(path.direct, () => this.frozen());
    disabled(path.direct, () => this.locked());
    required(path.loose);
    minLength(path.loose, 6);
    disabled(path.composed, () => this.composedLocked());
  });
  /** Each `valueChange` of the direct field: the code and `state.complete()` read in the handler. */
  readonly directChanges = signal<string[]>([]);
  /** Each `touch` of the direct field: the form's code when it arrived. Shown as `count:codes`. */
  readonly directTouches = signal<string[]>([]);
  readonly directSubmits = signal<string[]>([]);
  readonly looseSubmits = signal<string[]>([]);
  readonly pin = signal("");
  readonly pinMasked = signal(true);
  readonly bound = signal("");
  readonly autocomplete = signal("current-password");
  readonly composedChanges = signal(0);
  readonly kinds = errorKinds;
  readonly cells = cellText;
  readonly marks = cellMarks;

  changed(code: string, complete: boolean): void {
    this.directChanges.set([...this.directChanges(), `${code}/${complete}`]);
  }

  touched(): void {
    this.directTouches.set([...this.directTouches(), this.model().direct]);
  }

  /** The masked field's records: `null` for each cell whose record carries no `char`. */
  chars(state: OrigamiOtpFieldState): string {
    const chars: string[] = [];

    for (const cell of state.cells()) {
      chars.push(cell.char ?? "null");
    }

    return chars.join(",");
  }

  write(value: string): void {
    this.model.set({ ...this.model(), direct: value });
  }

  writeLoose(value: string): void {
    this.model.set({ ...this.model(), loose: value });
  }

  submitDirect(event: Event): void {
    event.preventDefault();
    void submit(this.codes.direct, async (field) => {
      this.directSubmits.set([...this.directSubmits(), field().value()]);
    });
  }

  submitLoose(event: Event): void {
    event.preventDefault();
    void submit(this.codes.loose, async (field) => {
      this.looseSubmits.set([...this.looseSubmits(), field().value()]);
    });
  }
}
