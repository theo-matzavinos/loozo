import { Directive, computed, input } from "@angular/core";
import { OrigamiDialogContent } from "@loozo/origami-ui/dialog";
import { cn } from "../cn";

/** The modal `<dialog>` and its backdrop scrim. */
@Directive({
  selector: "dialog[fold__AlertDialogContent]",
  hostDirectives: [{ directive: OrigamiDialogContent, inputs: ["id", "returnFocus"] }],
  host: { "data-slot": "alert-dialog-content", "[class]": "classes()" },
})
export class AlertDialogContent {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "m-auto w-[min(440px,calc(100%-32px))] rounded-dialog border border-border bg-surface p-5 text-body text-foreground shadow-dialog backdrop:bg-scrim",
      this.class(),
    ),
  );
}
