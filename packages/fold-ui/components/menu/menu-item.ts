import { Directive, computed, input } from "@angular/core";
import { OrigamiMenuItem } from "@loozo/origami-ui/menu";
import { cn } from "../cn";
import { menuItemClasses } from "../popup";

/**
 * A menu row that runs an action: `(select)` emits after the menu has closed and focused its
 * Trigger. Lead it with an `<svg>` icon. `variant="destructive"` colors the text and icon, never
 * the highlight.
 */
@Directive({
  selector: "button[fold__MenuItem]",
  hostDirectives: [
    { directive: OrigamiMenuItem, inputs: ["disabled", "label"], outputs: ["select"] },
  ],
  host: { "data-slot": "menu-item", "[attr.data-variant]": "variant()", "[class]": "classes()" },
})
export class MenuItem {
  readonly variant = input<"default" | "destructive">("default");
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      menuItemClasses,
      // Forced colors keep the system text color.
      "not-forced-colors:data-[variant=destructive]:text-destructive-text",
      this.class(),
    ),
  );
}
