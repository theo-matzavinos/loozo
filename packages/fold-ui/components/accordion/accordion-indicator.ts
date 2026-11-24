import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/** The trigger's trailing icon slot: put it on an icon to replace the chevron. It doesn't rotate by itself. */
@Directive({
  selector: "[fold__AccordionIndicator]",
  host: { "data-slot": "accordion-indicator", "[class]": "classes()", "aria-hidden": "true" },
})
export class AccordionIndicator {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("size-4 shrink-0 text-muted-foreground", this.class()),
  );
}
