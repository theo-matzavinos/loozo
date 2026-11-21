import { Component, computed, input } from "@angular/core";
import { OrigamiMenuRadioItem } from "@loozo/origami-ui/menu";
import { cn } from "../cn";
import { menuItemClasses } from "../popup";

/**
 * A MenuRadioGroup's choice, with a dot at its end while it's the group's `value`. A click or
 * Space keeps the menu open; Enter chooses and closes it.
 */
@Component({
  selector: "button[fold__MenuRadioItem]",
  hostDirectives: [
    {
      directive: OrigamiMenuRadioItem,
      inputs: ["value", "disabled", "label"],
      outputs: ["select"],
    },
  ],
  host: { "data-slot": "menu-radio-item", "[class]": "classes()" },
  template: `
    <ng-content />
    <span
      data-slot="menu-radio-item-indicator"
      aria-hidden="true"
      class="invisible ms-auto flex size-4 items-center justify-center"
    >
      <span class="size-2 rounded-full bg-current"></span>
    </span>
  `,
})
export class MenuRadioItem {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      menuItemClasses,
      "data-checked:[&>[data-slot=menu-radio-item-indicator]]:visible",
      this.class(),
    ),
  );
}
