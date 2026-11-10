import { Service, inject } from "@angular/core";
import type { ModelSignal, Signal, WritableSignal } from "@angular/core";
import { transformedValue } from "@angular/forms/signals";
import type { ValidationError } from "@angular/forms/signals";
import { NumberFieldContext } from "./number-field-context";
import { formatNumber, parseNumberText } from "./number-format";
import { OrigamiNumberFieldOptions } from "./number-field-options";

/**
 * @internal A root's text and parser (F3): Signal Forms' `transformedValue` over the effective
 * `value`, with the root's grammar as `parse` and its formatter as `format`. Writing the text
 * parses it: a whole number commits at once, empty commits null, anything else keeps the value
 * and sets the parse error. A value write, an external one or a step included, replaces the
 * text; so does Signal Forms' `reset()`, also to the value already committed. `refresh()` shows
 * the value again: on blur and when the format changes.
 *
 * Provided by each root and created the first time something reads it, outside any reactive
 * context: its constructor is an injection context of the root's node injector, so
 * `transformedValue` finds the `[formField]` on the root's element (`self: true`), also when the
 * root is a host directive of a composer, and the effective Options, which in the direct case are
 * the root under construction, already resolve. `transformedValue` writes Signal Forms'
 * parse-error source, which a render `computed` forbids (NG0600), hence outside reactive context.
 */
@Service({ autoProvided: false })
export class NumberFieldDraft {
  /** The text; writing it parses it. */
  readonly value: WritableSignal<string>;
  /** The text's parse errors; `[formField]` on the root reports the same ones. */
  readonly parseErrors: Signal<readonly ValidationError.WithoutFieldTree[]>;

  readonly #options = inject(OrigamiNumberFieldOptions);
  readonly #context = inject(NumberFieldContext);
  /** True while `refresh()` writes the text: the write parses to nothing. */
  #refreshing = false;

  constructor() {
    const context = this.#context;

    // F3: Angular 22.2.2 uses only a model's `value()` and `value.set`, which every
    // WritableSignal has. Guarded by NF6 with a directive model, a composer's model, a
    // linkedSignal and a plain signal().
    const draft = transformedValue(this.#options.value as unknown as ModelSignal<number | null>, {
      parse: (raw: string) => {
        // Writes no value and no error: `transformedValue` then clears the parse errors.
        if (this.#refreshing) {
          return {};
        }

        return parseNumberText(context.syntax(), raw);
      },
      // Reads the format as it changes; the Context's `refresh()` clears the parse errors then.
      format: (value: number | null) => formatNumber(context.syntax(), value),
    });

    this.value = draft;
    this.parseErrors = draft.parseErrors;
  }

  /**
   * Shows the committed value again in the current format: the text becomes the value's, a
   * half-typed one discarded, and the parse errors clear, through the transformed signal's public
   * `set`. Writes nothing to the value. Writes signals: call it untracked, never from a render
   * `computed`.
   */
  refresh(): void {
    this.#refreshing = true;

    try {
      this.value.set(formatNumber(this.#context.syntax(), this.#options.value()));
    } finally {
      this.#refreshing = false;
    }
  }
}
