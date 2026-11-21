import { Directive, computed, input } from "@angular/core";
import { OrigamiMenuRadioGroup } from "@loozo/origami-ui/menu";
import { cn } from "../cn";

/** A group of MenuRadioItems with one `value`, named by its MenuGroupLabels. */
@Directive({
  selector: "[fold__MenuRadioGroup]",
  hostDirectives: [
    { directive: OrigamiMenuRadioGroup, inputs: ["value"], outputs: ["valueChange"] },
  ],
  host: { "data-slot": "menu-radio-group", "[class]": "classes()" },
})
export class MenuRadioGroup {
  readonly class = input("");

  protected readonly classes = computed(() => cn(this.class()));
}
