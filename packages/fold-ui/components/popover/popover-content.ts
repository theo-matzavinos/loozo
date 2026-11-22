import { Component, computed, inject, input, numberAttribute } from "@angular/core";
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
import { ScrollArea } from "../scroll-area";

/**
 * The Popover's panel, in the top layer: a 288px floating surface, 4px below the Trigger by
 * default, scrolling in a ScrollArea when it's taller than the room left. Its 12px padding is
 * inside the scroller, and `class` sizes the panel. It's a `role="dialog"`: name it with
 * `aria-labelledby` or `aria-label`. A `tabindex` you write goes to the scroller, not the panel, so
 * text-only content can take `tabindex="0"` to be reached and scrolled from the keyboard.
 */
@Component({
  selector: "[fold__PopoverContent]",
  exportAs: "fold__PopoverContent",
  imports: [ScrollArea],
  hostDirectives: [OrigamiPopoverContent],
  // fold's own Content Options, replacing Origami's as a whole, so the panel sits 4px from the Trigger.
  providers: [OrigamiPopoverContentOptions.provideExisting(() => PopoverContent)],
  host: {
    "data-slot": "popover-content",
    role: "dialog",
    // The authored tabindex belongs to the scroller; a static attribute would otherwise also stay here.
    "[attr.tabindex]": "null",
    "[class]": "classes()",
  },
  template: `
    <div
      fold__ScrollArea
      [viewportTabIndex]="tabindex()"
      class="min-h-0 max-h-[calc(var(--og-available-height)_-_10px)] [&>[data-slot=scroll-area-viewport]]:scroll-py-4"
    >
      <div class="p-3"><ng-content /></div>
    </div>
  `,
})
export class PopoverContent implements OrigamiPopoverContentOptions {
  readonly id = input(injectUniqueId("popover-content"));
  readonly side = input<OrigamiPopoverSide>("block-end");
  readonly align = input<OrigamiPopoverAlign>("start");
  readonly gap = input(4);
  /** The scroller's tabindex; without one, the browser decides. */
  readonly tabindex = input<number | null, string | number | null>(null, {
    transform: (value) => {
      if (value === null) {
        return null;
      }

      return numberAttribute(value);
    },
  });
  readonly class = input("");

  /** Presence's `open`: true while the children should stay rendered, through the exit. */
  readonly state = inject(OrigamiPopoverContentState);

  // overflow-hidden keeps the panel a scroll container, so its overscroll-contain still holds a wheel
  // over the scroller or its rail at an end.
  protected readonly classes = computed(() =>
    cn(
      popupClasses,
      "w-72 max-w-[calc(100vw_-_1rem)] max-h-[calc(var(--og-available-height)_-_8px)] open:flex flex-col overflow-hidden overscroll-contain p-0",
      this.class(),
    ),
  );
}
