import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/**
 * A row at the end of DatePickerContent for your own buttons, such as the multiple picker's
 * Done, a Today or a Clear: right-aligned, 8px apart, as wide as the Calendar above it. Layout
 * only; your buttons write the picker's `open` or `value`.
 */
@Directive({
  selector: "[fold__DatePickerFooter]",
  host: { "data-slot": "date-picker-footer", "[class]": "classes()" },
})
export class DatePickerFooter {
  readonly class = input("");

  protected readonly classes = computed(() => cn("flex justify-end gap-2", this.class()));
}
