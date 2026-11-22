import { Component, computed, input } from "@angular/core";
import { OrigamiComboboxContent, OrigamiComboboxContentOptions } from "@loozo/origami-ui/combobox";
import type { OrigamiPopoverAlign, OrigamiPopoverSide } from "@loozo/origami-ui/popover";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { cn } from "../cn";
import { popupClasses, popupListClasses } from "../popup";
import { ScrollArea } from "../scroll-area";

/**
 * A Combobox's floating list, in the top layer: at least as wide as the input, 4px from it by
 * default, scrolling in a ScrollArea within the room the viewport leaves, as Select's does. It
 * stays open with no options, so a ComboboxEmpty row can say why.
 */
@Component({
  selector: "[fold__ComboboxContent]",
  imports: [ScrollArea],
  hostDirectives: [OrigamiComboboxContent],
  // fold's own Content Options, replacing Origami's as a whole, so the list sits 4px from the input.
  providers: [OrigamiComboboxContentOptions.provideExisting(() => ComboboxContent)],
  host: {
    "data-slot": "combobox-content",
    // Not a Tab stop, like its viewport: Tab from the open list goes to the next control.
    tabindex: "-1",
    "[class]": "classes()",
  },
  template: `
    <div
      fold__ScrollArea
      [viewportTabIndex]="-1"
      class="-m-1 min-h-0 [&>[data-slot=scroll-area-viewport]]:overscroll-contain"
    >
      <div class="p-1"><ng-content /></div>
    </div>
  `,
})
export class ComboboxContent implements OrigamiComboboxContentOptions {
  readonly id = input(injectUniqueId("combobox-content"));
  readonly side = input<OrigamiPopoverSide>("block-end");
  readonly align = input<OrigamiPopoverAlign>("start");
  readonly gap = input(4);
  readonly class = input("");

  protected readonly classes = computed(() => cn(popupClasses, popupListClasses, this.class()));
}
