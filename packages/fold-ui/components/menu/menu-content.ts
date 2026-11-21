import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiMenuContent, OrigamiMenuContentOptions } from "@loozo/origami-ui/menu";
import { cn } from "../cn";
import { popupClasses, popupListClasses } from "../popup";

/**
 * The menu panel, in the top layer: at least 192px and as wide as the Trigger, 4px from it by
 * default, scrolling within the room the viewport leaves. Below the Trigger at the root, beside
 * the sub-trigger inside a MenuSub.
 */
@Directive({
  selector: "[fold__MenuContent]",
  exportAs: "fold__MenuContent",
  hostDirectives: [{ directive: OrigamiMenuContent, inputs: ["id", "side", "align"] }],
  providers: [
    // Origami's own id/side/align (so a submenu keeps its inline-end default) and fold's 4px gap.
    OrigamiMenuContentOptions.provideFactory(() => {
      const origami = inject(OrigamiMenuContent);
      const fold = inject(MenuContent);
      return { id: origami.id, side: origami.side, align: origami.align, gap: fold.gap };
    }),
  ],
  host: { "data-slot": "menu-content", "[class]": "classes()" },
})
export class MenuContent {
  readonly gap = input(4);
  readonly class = input("");

  /** Presence's `open`: true while the children should stay rendered, through the exit. */
  readonly state = inject(OrigamiMenuContent).state;

  protected readonly classes = computed(() =>
    cn(
      popupClasses,
      popupListClasses,
      // text-start cancels a static align="end", which the <div> also takes as an HTML attribute.
      "min-w-[max(12rem,var(--og-anchor-width))] text-start",
      // Content holds focus while a menu has no item yet, so it gets the ring.
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      this.class(),
    ),
  );
}
