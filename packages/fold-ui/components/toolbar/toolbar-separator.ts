import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiToolbarState } from "@loozo/origami-ui/toolbar";
import { cn } from "../cn";

/** A 20px rule between Toolbar controls, perpendicular to the Toolbar. Must sit inside a Toolbar. */
@Directive({
  selector: "[fold__ToolbarSeparator]",
  host: {
    role: "separator",
    "data-slot": "toolbar-separator",
    "[attr.aria-orientation]": "orientation()",
    "[class]": "classes()",
  },
})
export class ToolbarSeparator {
  readonly class = input("");
  readonly #toolbar = inject(OrigamiToolbarState);
  protected readonly orientation = computed(() =>
    this.#toolbar.orientation() === "horizontal" ? "vertical" : "horizontal",
  );
  protected readonly classes = computed(() =>
    cn(
      "shrink-0 bg-border aria-[orientation=vertical]:h-5 aria-[orientation=vertical]:w-px aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-5",
      // Opted out of forced colors: a plain background would be forced to Canvas and vanish (MenuSeparator).
      "forced-color-adjust-none forced-colors:bg-[GrayText]",
      this.class(),
    ),
  );
}
