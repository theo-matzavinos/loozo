import { Directive, computed, input } from "@angular/core";
import { OrigamiToolbarToggle } from "@loozo/origami-ui/toolbar";
import type { ButtonSize } from "../button";
import { toggleClasses } from "../toggle";

@Directive({
  selector: "button[fold__ToolbarToggle]",
  hostDirectives: [
    {
      directive: OrigamiToolbarToggle,
      inputs: ["checked", "disabled", "focusableWhenDisabled", "id"],
      outputs: ["checkedChange"],
    },
  ],
  host: { "data-slot": "toolbar-toggle", "[class]": "classes()" },
})
export class ToolbarToggle {
  readonly size = input<ButtonSize>("md");
  readonly class = input("");
  protected readonly classes = computed(() => toggleClasses(this.size(), this.class()));
}
