import { Directive, computed, input } from "@angular/core";
import { OrigamiDialogDescription } from "@loozo/origami-ui/dialog";
import { cn } from "../cn";

/** Describes the consequence; Origami points the content's `aria-describedby` at it. */
@Directive({
  selector: "[fold__AlertDialogDescription]",
  hostDirectives: [{ directive: OrigamiDialogDescription, inputs: ["id"] }],
  host: { "data-slot": "alert-dialog-description", "[class]": "classes()" },
})
export class AlertDialogDescription {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("max-w-[68ch] text-body text-muted-foreground", this.class()),
  );
}
