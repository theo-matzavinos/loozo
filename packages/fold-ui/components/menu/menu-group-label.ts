import { Directive, computed, input } from "@angular/core";
import { OrigamiMenuGroupLabel } from "@loozo/origami-ui/menu";
import { cn } from "../cn";

/** A group's muted caption, which names it; never focused or searched. */
@Directive({
  selector: "[fold__MenuGroupLabel]",
  hostDirectives: [{ directive: OrigamiMenuGroupLabel, inputs: ["id"] }],
  host: { "data-slot": "menu-group-label", "[class]": "classes()" },
})
export class MenuGroupLabel {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("block px-2 py-1.5 text-start text-label text-muted-foreground", this.class()),
  );
}
