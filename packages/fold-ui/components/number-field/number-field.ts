import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiNumberField } from "@loozo/origami-ui/number-field";
import { cn } from "../cn";

/**
 * A number box over Origami's Number field: the Input, optional − and + buttons and an optional
 * adornment, such as `€`, sit inside it, and its focus ring and invalid border go round all of
 * them. It reads the Input's state, so it needs no state of its own.
 *
 * @example
 * ```html
 * <div fold__Field>
 *   <label fold__FieldLabel>Amount (€)</label>
 *   <div fold__NumberField [formField]="form.amount" minimumFractionDigits="2" maximumFractionDigits="2">
 *     <button fold__NumberFieldDecrement aria-label="Decrease amount"></button>
 *     <span fold__NumberFieldAdornment>€</span>
 *     <input fold__NumberFieldInput placeholder="0,00" />
 *     <button fold__NumberFieldIncrement aria-label="Increase amount"></button>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[fold__NumberField]",
  hostDirectives: [
    {
      directive: OrigamiNumberField,
      inputs: [
        "value",
        "locale",
        "min",
        "max",
        "step",
        "minimumFractionDigits",
        "maximumFractionDigits",
        "useGrouping",
        "disabled",
        "readonly",
      ],
      outputs: ["valueChange", "touch"],
    },
  ],
  host: { "data-slot": "number-field", "[class]": "classes()" },
})
export class NumberField {
  readonly class = input("");

  readonly #field = inject(OrigamiNumberField);

  /** Signal Forms' `focusBoundControl()` calls this; it focuses the Input. */
  focus(options?: FocusOptions): void {
    this.#field.focus(options);
  }

  protected readonly classes = computed(() =>
    cn(
      "flex h-8 w-full min-w-0 items-stretch gap-0 rounded-control border border-input bg-surface p-px text-body text-foreground",
      "transition-[border-color] duration-120 ease-out motion-reduce:transition-none motion-reduce:duration-0",
      "hover:border-[color-mix(in_oklab,var(--input),var(--foreground)_35%)]",
      // No base outline-none, so the ring's outline-style stays solid.
      "has-[input:focus-visible]:border-ring has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring",
      "has-[input[aria-invalid=true]]:border-destructive-text",
      "has-[input[readonly]]:border-dashed has-[input[readonly]]:bg-transparent",
      "has-[input:disabled]:border-input has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50",
      this.class(),
    ),
  );
}
