import { Directive, computed, input } from "@angular/core";
import { OrigamiToolbarToggleGroupMultiple } from "@loozo/origami-ui/toolbar";
import { cn } from "../cn";
import { toggleGroupClasses } from "../toggle-group";

@Directive({
  selector: "[fold__ToolbarToggleGroupMultiple]",
  hostDirectives: [
    {
      directive: OrigamiToolbarToggleGroupMultiple,
      inputs: ["value", "disabled"],
      outputs: ["valueChange"],
    },
  ],
  host: { "data-slot": "toolbar-toggle-group", "[class]": "classes()" },
})
export class ToolbarToggleGroupMultiple {
  readonly class = input("");
  protected readonly classes = computed(() => cn(toggleGroupClasses, this.class()));
}
