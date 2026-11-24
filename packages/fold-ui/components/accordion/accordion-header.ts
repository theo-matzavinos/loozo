import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** Put it on your own heading (`h2`, `h3`…) or a `div` around the Trigger; fold renders no heading. */
@Directive({
  selector: "[fold__AccordionHeader]",
  host: { "data-slot": "accordion-header", "[class]": "classes()" },
})
export class AccordionHeader {
  readonly class = input("");

  protected readonly classes = computed(() => cn("flex", this.class()));
}
