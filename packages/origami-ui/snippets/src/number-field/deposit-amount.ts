import { Component, input, signal } from "@angular/core";
import { FormField, disabled, form, max, min, readonly, required } from "@angular/forms/signals";
import { OrigamiField, OrigamiFieldError, OrigamiFieldLabel } from "@loozo/origami-ui/field";
import {
  OrigamiNumberField,
  OrigamiNumberFieldDecrement,
  OrigamiNumberFieldIncrement,
  OrigamiNumberFieldInput,
} from "@loozo/origami-ui/number-field";

// An amount in euros with two decimals. Signal Forms owns the value, its bounds and its disabled
// and readonly rules; the text's parse errors reach the same field. The currency sign is
// decoration beside the text, not part of it.
@Component({
  selector: "app-deposit-amount",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldError,
    OrigamiNumberField,
    OrigamiNumberFieldInput,
    OrigamiNumberFieldIncrement,
    OrigamiNumberFieldDecrement,
  ],
  template: `
    <div ogField #field="ogField" class="stack">
      <label ogFieldLabel>Amount</label>
      <div
        ogNumberField
        class="number"
        [formField]="deposit.amount"
        [locale]="locale()"
        minimumFractionDigits="2"
        maximumFractionDigits="2"
      >
        <button ogNumberFieldDecrement aria-label="Decrease">−</button>
        <span aria-hidden="true">€</span>
        <input ogNumberFieldInput />
        <button ogNumberFieldIncrement aria-label="Increase">+</button>
      </div>
      @if (field.state.errorsShown()) {
        @switch (field.state.errors()[0]?.kind) {
          @case ("numberIncomplete") {
            <p ogFieldError>Enter an amount</p>
          }
          @case ("numberInvalid") {
            <p ogFieldError>That isn't an amount</p>
          }
          @case ("min") {
            <p ogFieldError>The amount can't be negative</p>
          }
          @case ("max") {
            <p ogFieldError>At most 1000</p>
          }
          @case ("required") {
            <p ogFieldError>Required</p>
          }
        }
      }
    </div>
    <p>Amount: {{ model().amount ?? "none" }}</p>
  `,
  styles: `
    .stack {
      display: grid;
      gap: 0.25rem;
    }

    .number {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      box-sizing: border-box;
      inline-size: min(100%, 16rem);
      padding: 0.25rem;
      border: 1px solid var(--border, currentColor);
      border-radius: 4px;
    }

    .number:focus-within {
      border-color: var(--focus, Highlight);
    }

    input {
      flex: 1;
      min-inline-size: 0;
      border: none;
      background: none;
      color: inherit;
      font: inherit;
      font-variant-numeric: tabular-nums;
      text-align: end;
    }

    input:focus {
      outline: none;
    }

    button {
      inline-size: 1.75rem;
      block-size: 1.75rem;
      border: 1px solid var(--border, currentColor);
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
    }

    button:disabled,
    button[data-disabled] {
      opacity: 0.4;
    }
  `,
})
export class DepositAmount {
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly locale = input<"el-GR" | "en-US" | "de-CH">("el-GR");

  readonly model = signal<{ amount: number | null }>({ amount: null });
  readonly deposit = form(this.model, (path) => {
    required(path.amount);
    min(path.amount, 0);
    max(path.amount, 1000);
    disabled(path.amount, () => this.disabled());
    readonly(path.amount, () => this.readonly());
  });
}
