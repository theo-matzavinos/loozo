import { Directive, computed, input } from "@angular/core";
import { OrigamiMenuGroup } from "@loozo/origami-ui/menu";
import { cn } from "../cn";

/** A group of menu rows, named by its MenuGroupLabels. */
@Directive({
  selector: "[fold__MenuGroup]",
  hostDirectives: [OrigamiMenuGroup],
  host: { "data-slot": "menu-group", "[class]": "classes()" },
})
export class MenuGroup {
  readonly class = input("");

  protected readonly classes = computed(() => cn(this.class()));
}
