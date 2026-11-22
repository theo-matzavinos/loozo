import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiTimeField } from "@loozo/origami-ui/date-field";
import { cn } from "../cn";

/**
 * A typed time of day over Origami's Time field: an `HH:mm` (or `HH:mm:ss`) string or null, with
 * the locale's hour cycle unless `hourCycle` sets `12` or `24`. Put one DateFieldInput inside it.
 *
 * @example
 * ```html
 * <div fold__TimeField [(value)]="opensAt" hourCycle="12" precision="second">
 *   <div fold__DateFieldInput aria-label="Opens at"></div>
 * </div>
 * ```
 */
@Directive({
  selector: "[fold__TimeField]",
  exportAs: "fold__TimeField",
  hostDirectives: [
    {
      directive: OrigamiTimeField,
      inputs: ["value", "locale", "precision", "hourCycle", "disabled", "readonly"],
      outputs: ["valueChange", "touch"],
    },
  ],
  host: { "data-slot": "date-field", "[class]": "classes()" },
})
export class TimeField {
  readonly class = input("");

  readonly #field = inject(OrigamiTimeField);

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
