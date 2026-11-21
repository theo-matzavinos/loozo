import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiMenu } from "@loozo/origami-ui/menu";
import { cn } from "../cn";

/**
 * An action menu over Origami's Menu: a MenuTrigger and the MenuContent it opens 4px below itself,
 * holding items, links, checkbox and radio items, groups, separators and submenus. Real focus is
 * the row highlight, disabled rows included. The root is layout-transparent (`display: contents`).
 *
 * @example
 * ```html
 * <div fold__Menu>
 *   <button fold__MenuTrigger variant="ghost" size="icon" aria-label="Actions">
 *     <svg lucideEllipsis aria-hidden="true"></svg>
 *   </button>
 *   <div fold__MenuContent align="end">
 *     <button fold__MenuItem (select)="rename()">Rename</button>
 *     <div fold__MenuSeparator></div>
 *     <button fold__MenuItem variant="destructive" (select)="remove()">Delete</button>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[fold__Menu]",
  exportAs: "fold__Menu",
  hostDirectives: [
    { directive: OrigamiMenu, inputs: ["open", "disabled"], outputs: ["openChange"] },
  ],
  host: { "data-slot": "menu", "[class]": "classes()" },
})
export class Menu {
  readonly class = input("");

  /** Origami's readonly observation of this menu, such as `open` and `disabled`. */
  readonly state = inject(OrigamiMenu).state;

  protected readonly classes = computed(() => cn("contents", this.class()));
}
