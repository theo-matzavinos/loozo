import { Directive, computed, input } from "@angular/core";
import { OrigamiDialogDescription } from "@loozo/origami-ui/dialog";
import { cn } from "../cn";

/** Describes the dialog in a sentence; Origami points the content's `aria-describedby` at it. */
@Directive({
  selector: "[fold__DialogDescription]",
  hostDirectives: [{ directive: OrigamiDialogDescription, inputs: ["id"] }],
  host: { "data-slot": "dialog-description", "[class]": "classes()" },
})
export class DialogDescription {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("max-w-[68ch] text-body text-muted-foreground", this.class()),
  );
}
