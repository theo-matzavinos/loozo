import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiAccordionSingle } from "@loozo/origami-ui/accordion";
import { cn } from "../cn";

/** An accordion with at most one item open: `[(value)]` is a `string | null`; `collapsible` lets the open one close. */
@Directive({
  selector: "[fold__AccordionSingle]",
  exportAs: "fold__AccordionSingle",
  hostDirectives: [
    {
      directive: OrigamiAccordionSingle,
      inputs: ["value", "disabled", "collapsible"],
      outputs: ["valueChange"],
    },
  ],
  host: { "data-slot": "accordion", "[class]": "classes()" },
})
export class AccordionSingle {
  readonly class = input("");
  /**
   * `itemValues()` and `disabled()`, read only. `itemValues()` is in DOM order as of the latest item
   * insertion or removal: a keyed move of the same items doesn't update it.
   */
  readonly state = inject(OrigamiAccordionSingle).state;

  protected readonly classes = computed(() => cn("flex min-w-0 flex-col", this.class()));
}
