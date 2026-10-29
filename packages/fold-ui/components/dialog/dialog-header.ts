import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** Stacks the title and description, clear of the corner close button. */
@Directive({
  selector: "[fold__DialogHeader]",
  host: { "data-slot": "dialog-header", "[class]": "classes()" },
})
export class DialogHeader {
  readonly class = input("");

  protected readonly classes = computed(() => cn("grid shrink-0 gap-1.5 pe-8", this.class()));
}
