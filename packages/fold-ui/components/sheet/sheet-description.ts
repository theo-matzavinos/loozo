import { Directive, computed, input } from "@angular/core";
import { OrigamiDialogDescription } from "@loozo/origami-ui/dialog";
import { cn } from "../cn";

/** Describes the sheet in a sentence; Origami points the content's `aria-describedby` at it. */
@Directive({
  selector: "[fold__SheetDescription]",
  hostDirectives: [{ directive: OrigamiDialogDescription, inputs: ["id"] }],
  host: { "data-slot": "sheet-description", "[class]": "classes()" },
})
export class SheetDescription {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("max-w-[68ch] text-body text-muted-foreground", this.class()),
  );
}
