import { Component, computed, input } from "@angular/core";
import { OrigamiComboboxTrigger } from "@loozo/origami-ui/combobox";
import { LucideChevronDown } from "@lucide/angular";
import { cn } from "../cn";

/**
 * An optional chevron button laid over a ComboboxInput's end that opens the whole list. Origami
 * keeps it out of the Tab order; give it an `aria-label`.
 */
@Component({
  selector: "button[fold__ComboboxTrigger]",
  imports: [LucideChevronDown],
  hostDirectives: [{ directive: OrigamiComboboxTrigger, inputs: ["id"] }],
  host: { "data-slot": "combobox-trigger", "[class]": "classes()" },
  template: `<svg lucideChevronDown aria-hidden="true"></svg>`,
})
export class ComboboxTrigger {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      // Never focused (tabindex="-1"), so no outline; a click leaves focus in the input.
      "absolute inset-y-0 end-0 grid w-8 cursor-pointer place-items-center rounded-e-control text-muted-foreground outline-none",
      "transition-[color] duration-120 ease-out motion-reduce:transition-none motion-reduce:duration-0",
      "not-data-disabled:hover:text-foreground",
      "data-disabled:cursor-not-allowed data-disabled:opacity-50",
      "[&>svg]:size-4",
      this.class(),
    ),
  );
}
