import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** Stacks the title and description, clear of the corner close button. */
@Directive({
  selector: "[fold__SheetHeader]",
  host: { "data-slot": "sheet-header", "[class]": "classes()" },
})
export class SheetHeader {
  readonly class = input("");

  protected readonly classes = computed(() => cn("grid shrink-0 gap-1.5 pe-8", this.class()));
}
