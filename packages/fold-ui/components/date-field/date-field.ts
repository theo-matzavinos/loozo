import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiDateField } from "@loozo/origami-ui/date-field";
import { cn } from "../cn";

/**
 * A typed date over Origami's Date field: a `YYYY-MM-DD` string or null, typed into day, month
 * and year segments in the locale's order. Put one DateFieldInput inside it, which draws the box.
 * Origami owns the typing, keys, drafts and parse errors, Field membership and Signal Forms.
 *
 * @example
 * ```html
 * <div fold__Field #dob="fold__Field">
 *   <span fold__FieldLabel>Date of birth</span>
 *   <div fold__DateField [formField]="form.dateOfBirth">
 *     <div fold__DateFieldInput></div>
 *   </div>
 *   @if (dob.state.errorsShown()) {
 *     <p fold__FieldError>{{ dob.state.errors()[0]?.message }}</p>
 *   }
 * </div>
 * ```
 */
@Directive({
  selector: "[fold__DateField]",
  exportAs: "fold__DateField",
  hostDirectives: [
    {
      directive: OrigamiDateField,
      inputs: ["value", "locale", "disabled", "readonly"],
      outputs: ["valueChange", "touch"],
    },
  ],
  host: { "data-slot": "date-field", "[class]": "classes()" },
})
export class DateField {
  readonly class = input("");

  readonly #field = inject(OrigamiDateField);

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
