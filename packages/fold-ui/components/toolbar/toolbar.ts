import { Directive, computed, input } from "@angular/core";
import { OrigamiToolbar } from "@loozo/origami-ui/toolbar";
import { cn } from "../cn";

/**
 * A row of controls over Origami's Toolbar: one Tab stop, arrow keys along its orientation. It
 * wraps between controls, 8px apart, and a group moves to the next row whole; arrows still run in
 * DOM order across rows. A group wider than the Toolbar overflows it.
 */
@Directive({
  selector: "[fold__Toolbar]",
  hostDirectives: [{ directive: OrigamiToolbar, inputs: ["orientation"] }],
  host: { "data-slot": "toolbar", "[class]": "classes()" },
})
export class Toolbar {
  readonly class = input("");
  protected readonly classes = computed(() =>
    cn("flex flex-wrap items-center gap-2 data-[orientation=vertical]:flex-col", this.class()),
  );
}
