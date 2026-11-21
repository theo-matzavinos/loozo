import { Component, computed, input } from "@angular/core";
import { OrigamiMenuCheckboxItem } from "@loozo/origami-ui/menu";
import { LucideCheck } from "@lucide/angular";
import { cn } from "../cn";
import { menuItemClasses } from "../popup";

/**
 * A menu row that toggles `checked`, with a check at its end while it's checked. A click or Space
 * keeps the menu open; Enter toggles and closes it.
 */
@Component({
  selector: "button[fold__MenuCheckboxItem]",
  imports: [LucideCheck],
  hostDirectives: [
    {
      directive: OrigamiMenuCheckboxItem,
      inputs: ["checked", "disabled", "label"],
      outputs: ["checkedChange", "select"],
    },
  ],
  host: { "data-slot": "menu-checkbox-item", "[class]": "classes()" },
  template: `
    <ng-content />
    <span
      data-slot="menu-checkbox-item-indicator"
      aria-hidden="true"
      class="invisible ms-auto flex size-4 items-center justify-center"
    >
      <svg lucideCheck></svg>
    </span>
  `,
})
export class MenuCheckboxItem {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      menuItemClasses,
      "data-checked:[&>[data-slot=menu-checkbox-item-indicator]]:visible",
      this.class(),
    ),
  );
}
