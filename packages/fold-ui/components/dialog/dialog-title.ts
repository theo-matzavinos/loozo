import { Directive, computed, input } from "@angular/core";
import { OrigamiDialogTitle } from "@loozo/origami-ui/dialog";
import { cn } from "../cn";

/** Names the dialog; Origami points the content's `aria-labelledby` at it. */
@Directive({
  selector: "[fold__DialogTitle]",
  hostDirectives: [{ directive: OrigamiDialogTitle, inputs: ["id"] }],
  host: { "data-slot": "dialog-title", "[class]": "classes()" },
})
export class DialogTitle {
  readonly class = input("");

  protected readonly classes = computed(() => cn("text-title text-foreground", this.class()));
}
