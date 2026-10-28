import { Service, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import type { ValidationError } from "@angular/forms/signals";
import { DateFieldContext } from "./date-field-context";
import type { OrigamiDateFieldPart } from "./date-field-context";

/**
 * Locally provided readonly facade for the nearest date or time field root, the same shape for
 * every root; nested roots have independent owners.
 */
@Service({ autoProvided: false })
export class OrigamiDateFieldState {
  readonly #context = inject(DateFieldContext);

  /** The effective committed value, including null and a value that isn't canonical. */
  readonly value: Signal<string | null> = this.#context.value;
  /**
   * The locale's layout: each unit and each literal between them in order, with the unit's
   * current text (its digits or day period name, else its default placeholder) and the literal's
   * text. `en-US` is month `/` day `/` year, `el` day `/` month `/` year; a 12-hour time is hour
   * `:` minute, then the day period. Render a segment per unit and the literals as plain,
   * `aria-hidden` text. A root that hydrates keeps the server's layout (its `data-layout` seed)
   * until `locale`, a time root's `precision` or its `hourCycle` changes.
   */
  readonly segments: Signal<readonly OrigamiDateFieldPart[]> = this.#context.segments;
  /**
   * The draft's parse errors, for use without Signal Forms. A date: `{ kind: "dateIncomplete" }`
   * while some units are empty, `{ kind: "dateInvalid" }` for a complete draft that names no day
   * (31 February). A time: `{ kind: "timeIncomplete" }` while some units are empty. Else none.
   * `[formField]` on the root reports the same errors to the form. Origami ships no messages.
   */
  readonly parseErrors: Signal<readonly ValidationError.WithoutFieldTree[]> =
    this.#context.parseErrors;
  /** The root's effective disabled policy. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
  /** The root's effective readonly policy. */
  readonly readonly: Signal<boolean> = this.#context.readonly;
}
