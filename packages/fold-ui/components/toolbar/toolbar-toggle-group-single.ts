import { Directive, booleanAttribute, computed, input } from "@angular/core";
import { OrigamiToolbarToggleGroupSingle } from "@loozo/origami-ui/toolbar";
import { cn } from "../cn";
import { toggleGroupClasses } from "../toggle-group";

@Directive({
  selector: "[fold__ToolbarToggleGroupSingle]",
  hostDirectives: [
    {
      directive: OrigamiToolbarToggleGroupSingle,
      inputs: ["value", "disabled", "deselectable"],
      outputs: ["valueChange"],
    },
  ],
  host: {
    "data-slot": "toolbar-toggle-group",
    "[attr.data-indicator]": "indicator() ? '' : null",
    "[class]": "classes()",
  },
})
export class ToolbarToggleGroupSingle {
  readonly indicator = input(false, { transform: booleanAttribute });
  readonly class = input("");
  protected readonly classes = computed(() => cn(toggleGroupClasses, this.class()));
}
