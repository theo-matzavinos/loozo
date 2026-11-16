import { Component, input, signal } from "@angular/core";
import { FormField, disabled, form, pattern, readonly, required } from "@angular/forms/signals";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";
import { OrigamiOtpField, OrigamiOtpFieldInput } from "@loozo/origami-ui/otp-field";

// A six-digit code typed into one input drawn as cells. Signal Forms owns the value and its exact
// rule: `required` for the empty code, `pattern` for six digits. Masked, it is a PIN: the input
// becomes a password field and the cells draw dots.
@Component({
  selector: "app-verification-code",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    OrigamiOtpField,
    OrigamiOtpFieldInput,
  ],
  template: `
    <div ogField #field="ogField" class="stack">
      <label ogFieldLabel>Verification code</label>
      <p ogFieldDescription>The 6-digit code we sent you</p>
      <div
        ogOtpField
        #otp="ogOtpField"
        class="otp"
        [class.focused]="otp.state.focused()"
        [formField]="verify.code"
        [mask]="mask()"
      >
        <input ogOtpFieldInput />
        <div class="cells" aria-hidden="true">
          @for (cell of otp.state.cells(); track cell.index) {
            <span class="cell" [class.caret]="cell.caret" [class.selected]="cell.selected">
              @if (otp.state.mask()) {
                @if (cell.filled) {
                  •
                }
              } @else {
                {{ cell.char }}
              }
            </span>
          }
        </div>
      </div>
      @if (field.state.errorsShown()) {
        <p ogFieldError>Enter all 6 digits</p>
      }
    </div>
    <!-- A PIN's digits never show outside its masked cells. -->
    @if (!mask()) {
      <p>Code: {{ model().code || "none" }}</p>
    }
  `,
  styles: `
    .stack {
      display: grid;
      gap: 0.25rem;
    }

    .otp {
      position: relative;
      inline-size: max-content;
    }

    /* The input covers the cells, invisible: its hidden glyphs stay in the first cell, and a
       click maps to the cell under it. */
    .otp input {
      position: absolute;
      inset: 0;
      inline-size: 100%;
      block-size: 100%;
      margin: 0;
      padding: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: transparent;
      caret-color: transparent;
      font-size: 1px;
    }

    .otp input::selection {
      background: transparent;
      color: transparent;
    }

    .cells {
      display: flex;
      gap: 0.5rem;
    }

    .cell {
      display: grid;
      place-items: center;
      inline-size: 2.5rem;
      block-size: 3rem;
      border: 1px solid var(--border, currentColor);
      border-radius: 4px;
      font: inherit;
      font-size: 1.5rem;
      font-variant-numeric: tabular-nums;
    }

    .cell.caret {
      border-color: var(--focus, Highlight);
    }

    .cell.selected {
      border-color: var(--focus, Highlight);
      background: color-mix(in srgb, var(--focus, Highlight) 25%, transparent);
    }

    /* A full code with the caret at its end has no caret cell: the row draws the focus. */
    .otp.focused .cells {
      outline: 2px solid var(--focus, Highlight);
      outline-offset: 4px;
      border-radius: 4px;
    }
  `,
})
export class VerificationCode {
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly mask = input(false);

  readonly model = signal({ code: "" });
  readonly verify = form(this.model, (path) => {
    required(path.code);
    pattern(path.code, /^[0-9]{6}$/);
    disabled(path.code, () => this.disabled());
    readonly(path.code, () => this.readonly());
  });
}
