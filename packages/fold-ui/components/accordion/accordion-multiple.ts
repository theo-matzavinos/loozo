import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiAccordionMultiple } from "@loozo/origami-ui/accordion";
import { cn } from "../cn";

/** An accordion whose items open independently: `[(value)]` is a `readonly string[]`. */
@Directive({
  selector: "[fold__AccordionMultiple]",
  exportAs: "fold__AccordionMultiple",
  hostDirectives: [
    {
      directive: OrigamiAccordionMultiple,
      inputs: ["value", "disabled"],
      outputs: ["valueChange"],
    },
  ],
  host: { "data-slot": "accordion", "[class]": "classes()" },
})
export class AccordionMultiple {
  readonly class = input("");
  /**
   * `itemValues()` and `disabled()`, read only. `itemValues()` is in DOM order as of the latest item
   * insertion or removal: a keyed move of the same items doesn't update it.
   */
  readonly state = inject(OrigamiAccordionMultiple).state;

  protected readonly classes = computed(() => cn("flex min-w-0 flex-col", this.class()));
}
