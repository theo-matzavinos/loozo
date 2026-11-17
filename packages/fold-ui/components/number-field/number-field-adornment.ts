import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/**
 * A muted sign, such as `€` or `%`, inside a NumberField, before or after the Input. It's hidden
 * from screen readers, so say the unit in the label too.
 */
@Directive({
  selector: "[fold__NumberFieldAdornment]",
  host: { "data-slot": "number-field-adornment", "aria-hidden": "true", "[class]": "classes()" },
})
export class NumberFieldAdornment {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "flex shrink-0 select-none items-center text-muted-foreground ps-2.25",
      "[[data-slot=number-field-input]~&]:ps-0 [[data-slot=number-field-input]~&]:pe-2.25",
      this.class(),
    ),
  );
}
