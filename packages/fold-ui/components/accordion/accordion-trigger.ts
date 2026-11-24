import { Component, booleanAttribute, computed, input } from "@angular/core";
import { OrigamiAccordionTrigger } from "@loozo/origami-ui/accordion";
import { LucideChevronDown } from "@lucide/angular";
import { cn } from "../cn";
import { AccordionIndicator } from "./accordion-indicator";

/**
 * The full-width row button that opens and closes its item. A trailing chevron turns while it's open;
 * project a `fold__AccordionIndicator` to replace it, or set `indicator="false"` to drop it.
 */
@Component({
  selector: "button[fold__AccordionTrigger]",
  hostDirectives: [{ directive: OrigamiAccordionTrigger, inputs: ["id", "focusableWhenDisabled"] }],
  imports: [LucideChevronDown, AccordionIndicator],
  host: { "data-slot": "accordion-trigger", "[class]": "classes()" },
  template: `
    <span data-slot="accordion-label" class="flex min-w-0 flex-1 items-center gap-1.5"
      ><ng-content
    /></span>
    <ng-content select="[fold__AccordionIndicator]">
      @if (indicator()) {
        <svg
          lucideChevronDown
          fold__AccordionIndicator
          class="transition-transform duration-180 ease-out motion-reduce:transition-none [[aria-expanded=true]>&]:rotate-180"
        ></svg>
      }
    </ng-content>
  `,
})
export class AccordionTrigger {
  readonly indicator = input(true, { transform: booleanAttribute });
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "flex min-h-9.5 w-full items-center gap-3 rounded-control-sm px-2 py-2 text-start",
      "text-body font-semibold text-foreground",
      "transition-[background-color] duration-120 ease-out motion-reduce:transition-none",
      "not-data-disabled:hover:bg-foreground/4",
      // No base outline-none, so the ring's outline-style stays solid.
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      // Locked (Single's open item that can't close: data-disabled, its Item enabled) → default cursor, full contrast.
      // Really disabled (its Item has data-disabled) → the Item's properties: not-allowed, 50%, GrayText.
      "cursor-pointer data-disabled:cursor-(--accordion-trigger-cursor,default)",
      "opacity-(--accordion-trigger-opacity,1)",
      "forced-colors:text-(--accordion-trigger-forced-text,ButtonText)",
      "[&_[data-slot=accordion-label]_svg]:size-4 [&_[data-slot=accordion-label]_svg]:shrink-0",
      this.class(),
    ),
  );
}
