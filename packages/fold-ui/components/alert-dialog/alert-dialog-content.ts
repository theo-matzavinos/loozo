import { Directive, computed, input } from "@angular/core";
import { OrigamiDialogContent } from "@loozo/origami-ui/dialog";
import { cn } from "../cn";

/** The modal `<dialog>` and its backdrop scrim. */
@Directive({
  selector: "dialog[fold__AlertDialogContent]",
  hostDirectives: [{ directive: OrigamiDialogContent, inputs: ["id", "returnFocus"] }],
  // A binding, so the slot wins over the root's when both are on the <dialog>.
  host: { "[attr.data-slot]": "'alert-dialog-content'", "[class]": "classes()" },
})
export class AlertDialogContent {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "m-auto w-[min(440px,calc(100%-32px))] rounded-dialog border border-border bg-surface p-5 text-body text-foreground shadow-dialog outline-none backdrop:bg-scrim",
      // Enters and leaves like a Dialog: the backdrop's fade matches, which Origami waits for.
      "transition-[opacity,scale] duration-150 ease-out backdrop:transition-opacity backdrop:duration-150 backdrop:ease-out",
      "starting:scale-96 starting:opacity-0 starting:backdrop:opacity-0 data-leaving:scale-96 data-leaving:opacity-0 data-leaving:backdrop:opacity-0",
      "motion-reduce:transition-none motion-reduce:backdrop:transition-none",
      this.class(),
    ),
  );
}
