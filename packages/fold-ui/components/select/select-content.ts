import { Component, computed, input } from "@angular/core";
import type { OrigamiPopoverAlign, OrigamiPopoverSide } from "@loozo/origami-ui/popover";
import { OrigamiSelectContent, OrigamiSelectContentOptions } from "@loozo/origami-ui/select";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { cn } from "../cn";
import { popupClasses, popupListClasses } from "../popup";
import { ScrollArea } from "../scroll-area";

/**
 * A Select's floating list, in the top layer: at least as wide as the Trigger, 4px from it by
 * default, scrolling in a ScrollArea within the room the viewport leaves. Its viewport fills the
 * list's padding box and isn't a Tab stop; the options keep their 4px inset inside it.
 */
@Component({
  selector: "[fold__SelectContent]",
  imports: [ScrollArea],
  hostDirectives: [OrigamiSelectContent],
  // fold's own Content Options, replacing Origami's as a whole, so the list sits 4px from the Trigger.
  providers: [OrigamiSelectContentOptions.provideExisting(() => SelectContent)],
  host: {
    "data-slot": "select-content",
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
export class SelectContent implements OrigamiSelectContentOptions {
  readonly id = input(injectUniqueId("select-content"));
  readonly side = input<OrigamiPopoverSide>("block-end");
  readonly align = input<OrigamiPopoverAlign>("start");
  readonly gap = input(4);
  readonly class = input("");

  protected readonly classes = computed(() => cn(popupClasses, popupListClasses, this.class()));
}
