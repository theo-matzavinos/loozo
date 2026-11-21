import { Component, computed, input } from "@angular/core";
import { OrigamiMenuSubTrigger } from "@loozo/origami-ui/menu";
import { LucideChevronRight } from "@lucide/angular";
import { cn } from "../cn";
import { menuItemClasses } from "../popup";

/**
 * The MenuSub's row, with a chevron at its end: it opens the submenu when the mouse rests on it,
 * on a click, ArrowRight, Enter or Space, and keeps the highlight while its submenu is open.
 */
@Component({
  selector: "button[fold__MenuSubTrigger]",
  imports: [LucideChevronRight],
  hostDirectives: [{ directive: OrigamiMenuSubTrigger, inputs: ["id", "disabled", "label"] }],
  host: { "data-slot": "menu-sub-trigger", "[class]": "classes()" },
  template: `
    <ng-content />
    <svg
      lucideChevronRight
      data-slot="menu-sub-trigger-icon"
      aria-hidden="true"
      class="ms-auto rtl:rotate-180"
    ></svg>
  `,
})
export class MenuSubTrigger {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      menuItemClasses,
      "aria-expanded:bg-foreground/8 forced-colors:aria-expanded:bg-[Highlight] forced-colors:aria-expanded:text-[HighlightText]",
      this.class(),
    ),
  );
}
