import { Component, booleanAttribute, computed, inject, input } from "@angular/core";
import { LucideX } from "@lucide/angular";
import { OrigamiDialogContent, OrigamiDialogState } from "@loozo/origami-ui/dialog";
import { cn } from "../cn";
import { DialogClose } from "./dialog-close";

/**
 * The modal `<dialog>` and its backdrop scrim, centered. Ends with a corner close button
 * (`closeButton`, labelled `closeLabel`), disabled but focusable while the root isn't `dismissible`.
 */
@Component({
  selector: "dialog[fold__DialogContent]",
  imports: [DialogClose, LucideX],
  hostDirectives: [{ directive: OrigamiDialogContent, inputs: ["id", "returnFocus"] }],
  // A binding, so the slot wins over the root's when both are on the <dialog>.
  host: { "[attr.data-slot]": "'dialog-content'", "[class]": "classes()" },
  template: `
    <ng-content />
    @if (closeButton()) {
      <button
        fold__DialogClose
        variant="ghost"
        size="icon"
        class="absolute end-3.5 top-3.5"
        [attr.aria-label]="closeLabel()"
        [disabled]="!dialog.dismissible()"
        focusableWhenDisabled
      >
        <svg lucideX aria-hidden="true"></svg>
      </button>
    }
  `,
})
export class DialogContent {
  readonly closeButton = input(true, { transform: booleanAttribute });
  readonly closeLabel = input("Close");
  readonly class = input("");

  protected readonly dialog = inject(OrigamiDialogState);

  protected readonly classes = computed(() =>
    cn(
      "m-auto max-h-[calc(100dvh-32px)] w-[min(512px,calc(100%-32px))] max-w-none flex-col gap-5 rounded-dialog border border-border bg-surface p-5 text-body text-foreground shadow-dialog outline-none open:flex backdrop:bg-scrim",
      // Enters from @starting-style when shown, leaves while Origami keeps it modal, and reverses
      // smoothly when reopened mid-exit. The backdrop's fade matches the dialog's, which Origami
      // waits for.
      "transition-[opacity,scale] duration-150 ease-out backdrop:transition-opacity backdrop:duration-150 backdrop:ease-out",
      "starting:scale-96 starting:opacity-0 starting:backdrop:opacity-0 data-leaving:scale-96 data-leaving:opacity-0 data-leaving:backdrop:opacity-0",
      "motion-reduce:transition-none motion-reduce:backdrop:transition-none",
      this.class(),
    ),
  );
}
