import { Service, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import type { ValidationError } from "@angular/forms/signals";
import { NumberFieldContext } from "./number-field-context";

/**
 * Locally provided readonly facade for the nearest number field root; nested roots have
 * independent owners.
 */
@Service({ autoProvided: false })
export class OrigamiNumberFieldState {
  readonly #context = inject(NumberFieldContext);

  /** The effective committed value, including null and a value that isn't finite. */
  readonly value: Signal<number | null> = this.#context.value;
  /**
   * The text's parse errors, for use without Signal Forms: `{ kind: "numberIncomplete" }` for
   * only a minus sign and/or decimal separator (`-`, `,`), `{ kind: "numberInvalid" }` for group
   * separators off the locale's group positions (`1.5` in `el`, a trailing `1.`); else none.
   * `[formField]` on the root reports the same errors to the form. Origami ships no messages.
   */
  readonly parseErrors: Signal<readonly ValidationError.WithoutFieldTree[]> =
    this.#context.parseErrors;
  /** The root's effective disabled policy. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
  /** The root's effective readonly policy. */
  readonly readonly: Signal<boolean> = this.#context.readonly;
}
