import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiToggleGroupMultiple } from "@loozo/origami-ui/toggle-group";
import { cn } from "../cn";
import { toggleGroupClasses } from "./toggle-group-style";

/** A segmented control over Origami's Multiple ToggleGroup: any number of values. */
@Directive({
  selector: "[fold__ToggleGroupMultiple]",
  hostDirectives: [
    {
      directive: OrigamiToggleGroupMultiple,
      inputs: ["value", "disabled", "orientation"],
      outputs: ["valueChange", "touch"],
    },
  ],
  host: { "data-slot": "toggle-group", "[class]": "classes()" },
})
export class ToggleGroupMultiple {
  readonly class = input("");
  readonly #group = inject(OrigamiToggleGroupMultiple);
  focus(options?: FocusOptions): void {
    this.#group.focus(options);
  }
  protected readonly classes = computed(() => cn(toggleGroupClasses, this.class()));
}
