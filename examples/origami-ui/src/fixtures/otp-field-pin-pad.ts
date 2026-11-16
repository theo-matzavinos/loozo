import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  contentChild,
  input,
  model,
  output,
  signal,
} from "@angular/core";
import { OrigamiField, OrigamiFieldDescription, OrigamiFieldError } from "@loozo/origami-ui/field";
import { OrigamiOtpField, OrigamiOtpFieldInput } from "@loozo/origami-ui/otp-field";
import { injectUniqueId } from "@loozo/origami-ui/utils";

// OTP field consumer flow (OT7, OT10): a PIN composite shaped like a point-of-sale sign-in's, an
// OTP field over an on-screen keypad, inside a page that switches between its steps.

const CODE = /^[0-9]{6}$/;

/** The step's heading, which names the composite's Input. */
@Component({
  selector: "acceptance-pin-title",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "[id]": "id()" },
  template: `<ng-content />`,
})
export class PinTitle {
  readonly id = input(injectUniqueId("pin-title"));
}

/** A projected Description: it joins the composite's host Field, with its own `id` input. */
@Component({
  selector: "acceptance-pin-description",
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: OrigamiFieldDescription, inputs: ["id"] }],
  template: `<ng-content />`,
})
export class PinDescription {}

/** A projected Error: it joins the composite's host Field, with its own `id` input. */
@Component({
  selector: "acceptance-pin-error",
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: OrigamiFieldError, inputs: ["id"] }],
  template: `<span aria-hidden="true">!</span> <ng-content />`,
})
export class PinError {}

/**
 * An on-screen keypad with a consumer's contract: a `value` model it appends digits to and
 * clears the last digit of, uncapped, and a document keyboard listener that ignores editable
 * targets, so typing into the OTP field's Input isn't entered twice.
 */
@Component({
  selector: "acceptance-keypad",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(document:keydown)": "keyed($event)" },
  template: `
    @for (digit of digits; track digit) {
      <button type="button" [attr.data-testid]="'key-' + digit" (click)="append(digit)">
        {{ digit }}
      </button>
    }
    <button type="button" data-testid="key-clear" (click)="clear()">Clear</button>
  `,
})
export class Keypad {
  readonly value = model<string | null>(null);
  readonly digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  append(digit: string): void {
    this.value.update((value) => `${value ?? ""}${digit}`);
  }

  clear(): void {
    this.value.update((value) => (value ?? "").slice(0, -1));
  }

  keyed(event: KeyboardEvent): void {
    const target = event.target;

    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return;
    }

    if (/^[0-9]$/.test(event.key)) {
      this.append(event.key);
    } else if (event.key === "Backspace") {
      this.clear();
    }
  }
}

/**
 * The PIN composite: a host Field, so the projected Description and Error name its Input, an OTP
 * field drawn as masked cells, and the keypad, both writing the composite's `string | null`
 * value. A native edit completes from the field's `valueChange`; the keypad, its own writer,
 * re-caps its model at six digits and completes itself.
 */
@Component({
  selector: "acceptance-pin-input",
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [OrigamiField],
  imports: [OrigamiOtpField, OrigamiOtpFieldInput, Keypad],
  styles: `
    .otp {
      position: relative;
      inline-size: max-content;
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
      inline-size: 40px;
      block-size: 40px;
      border: 1px solid rgb(136, 136, 136);
      background: rgb(255, 255, 255);
    }
    .cell.caret {
      border-color: rgb(51, 102, 204);
    }
    .cell.selected {
      background: rgb(204, 221, 238);
      border-color: rgb(51, 102, 204);
    }
    /* A full code with the caret at its end has no caret cell: the row draws the focus. */
    .otp.focused .cells {
      outline: 2px solid rgb(51, 102, 204);
      outline-offset: 4px;
    }
  `,
  template: `
    <ng-content select="acceptance-pin-title" />
    <ng-content select="acceptance-pin-description" />
    <div
      ogOtpField
      #otp="ogOtpField"
      class="otp"
      [class.focused]="otp.state.focused()"
      [mask]="mask()"
      [value]="value() ?? ''"
      (valueChange)="edited($event, otp.state.complete())"
      data-testid="pin-pad-root"
    >
      <input
        ogOtpFieldInput
        [attr.aria-labelledby]="title().id()"
        [attr.autocomplete]="autocomplete()"
        data-testid="pin-pad-input"
      />
      <div class="cells" aria-hidden="true" data-testid="pin-pad-cell-row">
        @for (cell of otp.state.cells(); track cell.index) {
          <span
            class="cell"
            [class.filled]="cell.filled"
            [class.caret]="cell.caret"
            [class.selected]="cell.selected"
            [attr.data-testid]="'pin-pad-cell-' + cell.index"
          >
            @if (cell.filled) {
              •
            }
          </span>
        }
      </div>
    </div>
    <output data-testid="pin-pad-cells">{{ filled(otp) }}</output>
    <output data-testid="pin-pad-marks">{{ marks(otp) }}</output>
    <div aria-live="assertive" aria-atomic="true">
      <ng-content select="acceptance-pin-error" />
    </div>
    <acceptance-keypad #pad [value]="value()" (valueChange)="keyed($event, pad)" />
    <output data-testid="pin-pad-keypad">{{ pad.value() }}</output>
  `,
})
export class PinInput {
  readonly value = model<string | null>(null);
  readonly mask = input(false, { transform: booleanAttribute });
  readonly autocomplete = input("one-time-code");
  readonly complete = output<string>();
  protected readonly title = contentChild.required(PinTitle);

  /** The number of filled cells. */
  protected filled(otp: OrigamiOtpField): number {
    let count = 0;

    for (const cell of otp.state.cells()) {
      if (cell.filled) {
        count++;
      }
    }

    return count;
  }

  /** The cells' caret and selection flags: `c` caret, `s` selected, `.` neither. */
  protected marks(otp: OrigamiOtpField): string {
    let marks = "";

    for (const cell of otp.state.cells()) {
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

  /** A native edit: typing, paste, autofill, an input method. Always a code. */
  protected edited(code: string, complete: boolean): void {
    this.value.set(code);

    if (complete) {
      this.complete.emit(code);
    }
  }

  /** The on-screen keypad, or the physical keyboard while the Input isn't focused. */
  protected keyed(raw: string | null, pad: Keypad): void {
    const code = (raw ?? "").slice(0, 6);

    if (raw !== null && raw.length > 6) {
      // The keypad's own model is uncapped; re-cap it. Its nested valueChange carries `code`.
      pad.value.set(code);

      return;
    }

    if (code === (this.value() ?? "")) {
      return;
    }

    this.value.set(code);

    if (CODE.test(code)) {
      this.complete.emit(code);
    }
  }
}

type Step = "code" | "new" | "confirm" | "done";

/**
 * A sign-in page's steps: the emailed code (two-way bound, its error cleared on every edit, a
 * rejection clearing it and keeping the error), a new PIN (unbound: its digits die with the step)
 * and its confirmation (two-way bound, a mismatch clearing it and keeping the error), with Back.
 * `completions` lists every `complete` as `step:code`.
 */
@Component({
  selector: "acceptance-otp-field-pin-pad-fixture",
  imports: [PinInput, PinTitle, PinDescription, PinError],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach the PIN pad
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <output data-testid="pin-pad-step">{{ step() }}</output>
    <output data-testid="pin-pad-completions">{{ completions().join(",") }}</output>
    <output data-testid="pin-pad-code">{{ code() ?? "null" }}</output>
    <output data-testid="pin-pad-confirm">{{ confirmPin() ?? "null" }}</output>
    <button type="button" data-testid="pin-pad-back" (click)="back()">Back</button>
    <button type="button" data-testid="pin-pad-before">Outside the field</button>
    <button type="button" data-testid="pin-pad-reject" (click)="reject()">Reject the code</button>
    <button type="button" data-testid="pin-pad-accept" (click)="accept()">Accept the code</button>
    <button
      type="button"
      data-testid="pin-pad-description-id"
      (click)="descriptionId.set(descriptionId() === null ? 'bound-description' : null)"
    >
      Toggle a bound Description id
    </button>
    @switch (step()) {
      @case ("code") {
        <acceptance-pin-input
          [(value)]="code"
          (valueChange)="wrongCode.set(false)"
          (complete)="completed('code', $event)"
        >
          <acceptance-pin-title>Κωδικός email</acceptance-pin-title>
          @if (descriptionId() === null) {
            <acceptance-pin-description data-testid="pin-pad-description">
              Ο κωδικός που στείλαμε
            </acceptance-pin-description>
          } @else {
            <acceptance-pin-description [id]="descriptionId()!" data-testid="pin-pad-description">
              Ο κωδικός που στείλαμε
            </acceptance-pin-description>
          }
          @if (wrongCode()) {
            <acceptance-pin-error data-testid="pin-pad-error">Λάθος κωδικός</acceptance-pin-error>
          }
        </acceptance-pin-input>
      }
      @case ("new") {
        <acceptance-pin-input mask autocomplete="new-password" (complete)="newCompleted($event)">
          <acceptance-pin-title>Νέο PIN</acceptance-pin-title>
          <acceptance-pin-description data-testid="pin-pad-description"
            >6 αριθμοί</acceptance-pin-description
          >
        </acceptance-pin-input>
      }
      @case ("confirm") {
        <acceptance-pin-input
          mask
          autocomplete="new-password"
          [(value)]="confirmPin"
          (valueChange)="pinMismatch.set(false)"
          (complete)="confirmCompleted($event)"
        >
          <acceptance-pin-title>Επιβεβαίωση PIN</acceptance-pin-title>
          <acceptance-pin-description data-testid="pin-pad-description"
            >Ξανά</acceptance-pin-description
          >
          @if (pinMismatch()) {
            <acceptance-pin-error data-testid="pin-pad-error"
              >Τα PIN διαφέρουν</acceptance-pin-error
            >
          }
        </acceptance-pin-input>
      }
      @case ("done") {
        <p data-testid="pin-pad-done">PIN set</p>
      }
    }
  `,
})
export class OtpFieldPinPadFixture {
  readonly attached = signal(false);
  readonly step = signal<Step>("code");
  readonly code = signal<string | null>(null);
  readonly confirmPin = signal<string | null>(null);
  readonly wrongCode = signal(false);
  readonly pinMismatch = signal(false);
  readonly completions = signal<string[]>([]);
  readonly descriptionId = signal<string | null>(null);
  #newPin = "";

  completed(step: Step, code: string): void {
    this.completions.set([...this.completions(), `${step}:${code}`]);
  }

  /** The verification rejected the code: its error shows and the code clears. */
  reject(): void {
    this.wrongCode.set(true);
    this.code.set(null);
  }

  accept(): void {
    this.code.set(null);
    this.step.set("new");
  }

  newCompleted(code: string): void {
    this.completed("new", code);
    this.#newPin = code;
    this.step.set("confirm");
  }

  confirmCompleted(code: string): void {
    this.completed("confirm", code);

    if (code !== this.#newPin) {
      this.pinMismatch.set(true);
      this.confirmPin.set(null);

      return;
    }

    this.step.set("done");
  }

  back(): void {
    if (this.step() === "confirm") {
      this.#newPin = "";
      this.confirmPin.set(null);
      this.pinMismatch.set(false);
      this.step.set("new");

      return;
    }

    if (this.step() === "new") {
      this.step.set("code");
    }
  }
}
