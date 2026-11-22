import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiDateTimeField } from "@loozo/origami-ui/date-field";
import { cn } from "../cn";

/**
 * A typed civil date and time over Origami's Date-time field: a `YYYY-MM-DDTHH:mm` (or `:ss`)
 * string or null, with no time zone. Put one DateFieldInput inside it.
 *
 * @example
 * ```html
 * <div fold__Field>
 *   <span fold__FieldLabel>Starts at</span>
 *   <div fold__DateTimeField [formField]="form.startsAt">
 *     <div fold__DateFieldInput></div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[fold__DateTimeField]",
  exportAs: "fold__DateTimeField",
  hostDirectives: [
    {
      directive: OrigamiDateTimeField,
      inputs: ["value", "locale", "precision", "hourCycle", "disabled", "readonly"],
      outputs: ["valueChange", "touch"],
    },
  ],
  host: { "data-slot": "date-field", "[class]": "classes()" },
})
export class DateTimeField {
  readonly class = input("");

  readonly #field = inject(OrigamiDateTimeField);

  /** Origami's readonly observation: `value`, `segments`, `parseErrors`, `disabled`, `readonly`. */
  readonly state = this.#field.state;

  /** Signal Forms' `focusBoundControl()` calls this; it focuses the first segment. */
  focus(options?: FocusOptions): void {
    this.#field.focus(options);
  }

  /** Discards a half-typed draft and its parse error, and writes null. */
  clear(): void {
    this.#field.clear();
  }

  protected readonly classes = computed(() => cn("block min-w-0", this.class()));
}
