import { Directive, computed, input } from "@angular/core";
import { OrigamiMenuSeparator } from "@loozo/origami-ui/menu";
import { cn } from "../cn";

/** A 1px rule between menu rows, edge to edge in the panel. */
@Directive({
  selector: "[fold__MenuSeparator]",
  hostDirectives: [OrigamiMenuSeparator],
  host: { "data-slot": "menu-separator", "[class]": "classes()" },
})
export class MenuSeparator {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      // Opted out of forced colors: a plain background would be forced to Canvas and vanish.
      "-mx-1 my-1 h-px bg-border forced-color-adjust-none forced-colors:bg-[GrayText]",
      this.class(),
    ),
  );
}
