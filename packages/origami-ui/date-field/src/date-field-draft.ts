import { Service, inject } from "@angular/core";
import type { ModelSignal, Signal, WritableSignal } from "@angular/core";
import { transformedValue } from "@angular/forms/signals";
import type { ValidationError } from "@angular/forms/signals";
import { DateFieldRoot } from "./date-field-root";
import type { Draft } from "./date-field-unit";

/**
 * @internal A root's draft and parser (F3, F4): Signal Forms' `transformedValue` over the
 * effective `value`, with the root's shape as `parse` and `format`. Writing a draft parses it: a
 * complete real value commits at once, all units empty commits null, anything else keeps the
 * value and sets the parse error. A value write, an external one included, replaces the draft;
 * so does Signal Forms' `reset()`, also to the value already committed.
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

  constructor() {
    const root = inject(DateFieldRoot);
    // F3: Angular 22.2.2 uses only a model's `value()` and `value.set`, which every
    // WritableSignal has. Guarded by the DF parse-error cases with a directive model, a
    // composer's model, a linkedSignal and a plain signal().
    const draft = transformedValue(root.value as unknown as ModelSignal<string | null>, {
      parse: (raw: Draft) => root.shape.parse(raw),
      format: (value: string | null) => root.shape.format(value),
    });

    this.value = draft;
    this.parseErrors = draft.parseErrors;
  }
}
