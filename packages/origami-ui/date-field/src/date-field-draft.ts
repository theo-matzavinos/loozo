import { Service, inject } from "@angular/core";
import type { ModelSignal, Signal, WritableSignal } from "@angular/core";
import { transformedValue } from "@angular/forms/signals";
import type { ValidationError } from "@angular/forms/signals";
import { DateFieldContext } from "./date-field-context";
import { DateFieldRoot } from "./date-field-root";
import type { Draft } from "./date-field-unit";

/**
 * @internal A root's draft and parser (F3, F4): Signal Forms' `transformedValue` over the
 * effective `value`, with the root's shape as `parse` and `format`. Writing a draft parses it: a
 * complete real value commits at once, all units empty commits null, anything else keeps the
 * value and sets the parse error. A value write, an external one included, replaces the draft;
 * so does Signal Forms' `reset()`, also to the value already committed, and the root's `clear()`,
 * which writes the empty draft. The draft is in the layout's resolved hour cycle and the root's
 * precision: when either changes, `refresh()` shows the value again under the new layout.
 *
 * Provided by each root and created the first time something reads it, outside any reactive
 * context (A1): its constructor is an injection context of the root's node injector, so
 * `transformedValue` finds the `[formField]` on the root's element (`self: true`), also when the
 * root is a host directive of a composer, and the effective Options, which in the direct case are
 * the root under construction, already resolve. `transformedValue` writes Signal Forms'
 * parse-error source, which a render `computed` forbids (NG0600), hence outside reactive context.
 */
@Service({ autoProvided: false })
export class DateFieldDraft {
  /** The draft by unit; writing it parses it. */
  readonly value: WritableSignal<Draft>;
  /** The draft's parse errors; `[formField]` on the root reports the same ones. */
  readonly parseErrors: Signal<readonly ValidationError.WithoutFieldTree[]>;

  readonly #root = inject(DateFieldRoot);
  readonly #context = inject(DateFieldContext);
  /** True while `refresh()` writes the draft: the write parses to nothing. */
  #refreshing = false;

  constructor() {
    const root = this.#root;
    const context = this.#context;

    // F3: Angular 22.2.2 uses only a model's `value()` and `value.set`, which every
    // WritableSignal has. Guarded by the DF parse-error cases with a directive model, a
    // composer's model, a linkedSignal and a plain signal().
    const draft = transformedValue(root.value as unknown as ModelSignal<string | null>, {
      parse: (raw: Draft) => {
        // Writes no value and no error: `transformedValue` then clears the parse errors.
        if (this.#refreshing) {
          return {};
        }

        return root.shape.parse(raw, { hourCycle: context.hourCycle() });
      },
      // Reads the resolved hour cycle as the layout settles; `refresh()` handles a change of it.
      format: (value: string | null) =>
        root.shape.format(value, { hourCycle: context.hourCycle() }),
    });

    this.value = draft;
    this.parseErrors = draft.parseErrors;
  }

  /**
   * Shows the committed value again under the current layout, after a change of the root's
   * precision or resolved hour cycle: the draft becomes the value's, a half-typed one discarded,
   * and the parse errors clear, through the transformed signal's public `set`. Writes nothing to
   * the value, so a value of the other precision stays until an edit. Writes signals: call it
   * untracked, never from a render `computed`.
   */
  refresh(): void {
    this.#refreshing = true;

    try {
      const value = this.#root.value();

      this.value.set(this.#root.shape.format(value, { hourCycle: this.#context.hourCycle() }));
    } finally {
      this.#refreshing = false;
    }
  }
}
