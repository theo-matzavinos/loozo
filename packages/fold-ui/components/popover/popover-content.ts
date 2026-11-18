import { Directive, computed, inject, input } from "@angular/core";
import {
  OrigamiPopoverContent,
  OrigamiPopoverContentOptions,
  OrigamiPopoverContentState,
  type OrigamiPopoverAlign,
  type OrigamiPopoverSide,
} from "@loozo/origami-ui/popover";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { cn } from "../cn";
import { popupClasses } from "../popup";

/**
 * The Popover's panel, in the top layer: a 288px floating surface with 12px padding, 4px below the
 * Trigger by default, scrolling inside itself when it's taller than the room left. It's a
 * `role="dialog"`: name it with `aria-labelledby` or `aria-label`.
 */
@Directive({
  selector: "[fold__PopoverContent]",
  exportAs: "fold__PopoverContent",
  hostDirectives: [OrigamiPopoverContent],
  // fold's own Content Options, replacing Origami's as a whole, so the panel sits 4px from the Trigger.
  providers: [OrigamiPopoverContentOptions.provideExisting(() => PopoverContent)],
  host: { "data-slot": "popover-content", role: "dialog", "[class]": "classes()" },
})
export class PopoverContent implements OrigamiPopoverContentOptions {
  readonly id = input(injectUniqueId("popover-content"));
  readonly side = input<OrigamiPopoverSide>("block-end");
  readonly align = input<OrigamiPopoverAlign>("start");
  readonly gap = input(4);
  readonly class = input("");

  /** Presence's `open`: true while the children should stay rendered, through the exit. */
  readonly state = inject(OrigamiPopoverContentState);

  protected readonly classes = computed(() =>
    cn(
      popupClasses,
      "w-72 max-w-[calc(100vw_-_1rem)] max-h-[calc(var(--og-available-height)_-_8px)] overflow-y-auto overscroll-contain p-3",
      // No tabindex of fold's: a scrolling panel is a Tab stop in some engines, so it gets the ring.
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      this.class(),
    ),
  );
}
