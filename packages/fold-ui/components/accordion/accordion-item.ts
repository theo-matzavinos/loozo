import { Directive, booleanAttribute, computed, inject, input } from "@angular/core";
import { OrigamiAccordionItem, OrigamiAccordionItemOptions } from "@loozo/origami-ui/accordion";
import type { OrigamiCollapsibleHiding } from "@loozo/origami-ui/collapsible";
import { injectUniqueValue } from "@loozo/origami-ui/utils";
import { cn } from "../cn";

/**
 * One section: give it an explicit `value`. `disabled` locks it; `hiding="hidden"` opts its panel out of
 * find-in-page (`until-found`, the default).
 */
@Directive({
  selector: "[fold__AccordionItem]",
  exportAs: "fold__AccordionItem",
  hostDirectives: [OrigamiAccordionItem],
  providers: [OrigamiAccordionItemOptions.provideExisting(() => AccordionItem)],
  host: { "data-slot": "accordion-item", "[class]": "classes()" },
})
export class AccordionItem implements OrigamiAccordionItemOptions {
  readonly value = input(injectUniqueValue("accordion-item"));
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly hiding = input<OrigamiCollapsibleHiding>("until-found");
  readonly class = input("");
  /** `expanded` (follows the selection) and `disabled` (the root's or the item's). */
  readonly state = inject(OrigamiAccordionItem).state;

  protected readonly classes = computed(() =>
    cn(
      "border-b border-border last:border-b-0",
      // Its trigger's disabled look, from Origami's effective data-disabled (root or item). Every Item resets the
      // properties, so a nested accordion's triggers keep their own Item's look.
      "[--accordion-trigger-opacity:initial] [--accordion-trigger-cursor:initial] [--accordion-trigger-forced-text:initial]",
      "data-disabled:[--accordion-trigger-opacity:0.5] data-disabled:[--accordion-trigger-cursor:not-allowed]",
      "data-disabled:[--accordion-trigger-forced-text:GrayText]",
      this.class(),
    ),
  );
}
