import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiMenuSub } from "@loozo/origami-ui/menu";
import { cn } from "../cn";

/**
 * A submenu inside a MenuContent: a MenuSubTrigger and the MenuContent it opens 4px beside
 * itself. The root is layout-transparent (`display: contents`).
 */
@Directive({
  selector: "[fold__MenuSub]",
  exportAs: "fold__MenuSub",
  hostDirectives: [
    { directive: OrigamiMenuSub, inputs: ["open", "disabled"], outputs: ["openChange"] },
  ],
  host: { "data-slot": "menu-sub", "[class]": "classes()" },
})
export class MenuSub {
  readonly class = input("");

  /** Origami's readonly observation of this submenu, such as `open` and `disabled`. */
  readonly state = inject(OrigamiMenuSub).state;

  protected readonly classes = computed(() => cn("contents", this.class()));
}
