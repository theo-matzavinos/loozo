import { Service, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import { OtpFieldContext } from "./otp-field-context";

/** One cell of an OTP field, by position: what the consumer draws for it. */
export interface OrigamiOtpFieldCell {
  /** Its position, 0 to `length` − 1. */
  readonly index: number;
  /** The value's character at `index`; null when the cell is empty, and in every cell while masked. */
  readonly char: string | null;
  /** Whether the value reaches the cell: `index` < the value's length. */
  readonly filled: boolean;
  /** Whether the focused Input's collapsed caret is at `index`, where the next digit goes. */
  readonly caret: boolean;
  /** Whether the focused Input's selection covers the cell: typing replaces it. */
  readonly selected: boolean;
}

/**
 * Locally provided readonly facade for the nearest OTP field root; nested roots have independent
 * owners.
 */
@Service({ autoProvided: false })
export class OrigamiOtpFieldState {
  readonly #context = inject(OtpFieldContext);

  /** The effective value, including one the application wrote that isn't a code. */
  readonly value: Signal<string> = this.#context.value;
  /** Whether the value is a whole code: exactly `length` ASCII digits. */
  readonly complete: Signal<boolean> = this.#context.complete;
  /**
   * One record per cell, `length` of them, in order. Empty cells and, while masked, every cell
   * have a null `char`; `caret` and `selected` are false while the Input isn't focused, and on the
   * server. In a full code with the caret at its end no cell has `caret`: draw the focus from
   * `focused`.
   */
  readonly cells: Signal<readonly OrigamiOtpFieldCell[]> = this.#context.cells;
  /** Whether the Input has focus; false on the server. */
  readonly focused: Signal<boolean> = this.#context.focused;
  /** The root's effective mask policy. */
  readonly mask: Signal<boolean> = this.#context.mask;
  /** The root's effective disabled policy. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
  /** The root's effective readonly policy. */
  readonly readonly: Signal<boolean> = this.#context.readonly;
}
