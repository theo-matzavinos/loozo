import { Directive, booleanAttribute, computed, inject, input } from "@angular/core";
import { OrigamiToggleGroupSingle } from "@loozo/origami-ui/toggle-group";
import { cn } from "../cn";
import { toggleGroupClasses } from "./toggle-group-style";

/**
 * A segmented control over Origami's Single ToggleGroup: one value or null. `indicator` leads
 * the pressed item with the status-light dot, for a group that filters the current view.
 */
@Directive({
  selector: "[fold__ToggleGroupSingle]",
  hostDirectives: [
    {
      directive: OrigamiToggleGroupSingle,
      inputs: ["value", "disabled", "orientation", "deselectable"],
      outputs: ["valueChange", "touch"],
    },
  ],
  host: {
    "data-slot": "toggle-group",
    "[attr.data-indicator]": "indicator() ? '' : null",
    "[class]": "classes()",
  },
})
export class ToggleGroupSingle {
  readonly indicator = input(false, { transform: booleanAttribute });
  readonly class = input("");
  readonly #group = inject(OrigamiToggleGroupSingle);
  /** Signal Forms' `focusBoundControl()` calls this; it focuses the item holding the tab stop. */
  focus(options?: FocusOptions): void {
    this.#group.focus(options);
  }
  protected readonly classes = computed(() => cn(toggleGroupClasses, this.class()));
}
