import { Directive, computed, input } from "@angular/core";
import { OrigamiDialogTitle } from "@loozo/origami-ui/dialog";
import { cn } from "../cn";

/** Names the sheet; Origami points the content's `aria-labelledby` at it. */
@Directive({
  selector: "[fold__SheetTitle]",
  hostDirectives: [{ directive: OrigamiDialogTitle, inputs: ["id"] }],
  host: { "data-slot": "sheet-title", "[class]": "classes()" },
})
export class SheetTitle {
  readonly class = input("");

  protected readonly classes = computed(() => cn("text-title text-foreground", this.class()));
}
