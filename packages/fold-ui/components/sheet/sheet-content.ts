import { Component, booleanAttribute, computed, inject, input } from "@angular/core";
import { LucideX } from "@lucide/angular";
import { OrigamiDialogContent, OrigamiDialogState } from "@loozo/origami-ui/dialog";
import type { VariantProps } from "tailwind-variants";
import { tv } from "../cn";
import { SheetClose } from "./sheet-close";

const sheetContentVariants = tv({
  base: [
    "h-dvh max-h-none w-[min(20rem,100vw)] max-w-none flex-col gap-5 border-border bg-surface p-5 text-body text-foreground shadow-dialog outline-none open:flex backdrop:bg-scrim",
    // Enters from @starting-style when shown, leaves while Origami keeps it modal, and reverses
    // smoothly when reopened mid-exit. The backdrop's fade matches the sheet's, which Origami
    // waits for.
    "transition-[opacity,translate] duration-200 ease-out backdrop:transition-opacity backdrop:duration-200 backdrop:ease-out",
    "starting:opacity-0 starting:backdrop:opacity-0 data-leaving:opacity-0 data-leaving:backdrop:opacity-0",
    "motion-reduce:transition-none motion-reduce:backdrop:transition-none",
  ],
  variants: {
    side: {
      left: "mr-auto border-r starting:-translate-x-full data-leaving:-translate-x-full",
      right: "ml-auto border-l starting:translate-x-full data-leaving:translate-x-full",
    },
  },
  defaultVariants: { side: "right" },
});

export type SheetSide = NonNullable<VariantProps<typeof sheetContentVariants>["side"]>;

/**
 * The modal `<dialog>` and its backdrop scrim, as a full-height panel against the left or right
 * edge (`side`). Ends with a corner close button (`closeButton`, labelled `closeLabel`), disabled
 * but focusable while the root isn't `dismissible`.
 */
@Component({
  selector: "dialog[fold__SheetContent]",
  imports: [SheetClose, LucideX],
  hostDirectives: [{ directive: OrigamiDialogContent, inputs: ["id", "returnFocus"] }],
  // A binding, so the slot wins over the root's when both are on the <dialog>.
  host: { "[attr.data-slot]": "'sheet-content'", "[class]": "classes()" },
  template: `
    <ng-content />
    @if (closeButton()) {
      <button
        fold__SheetClose
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
export class SheetContent {
  readonly side = input<SheetSide>("right");
  readonly closeButton = input(true, { transform: booleanAttribute });
  readonly closeLabel = input("Close");
  readonly class = input("");

  protected readonly dialog = inject(OrigamiDialogState);

  protected readonly classes = computed(() =>
    sheetContentVariants({ side: this.side(), class: this.class() }),
  );
}
