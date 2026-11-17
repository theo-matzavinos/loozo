import { Directive, computed, input } from "@angular/core";
import type { OrigamiPopoverAlign, OrigamiPopoverSide } from "@loozo/origami-ui/popover";
import { OrigamiSelectContent, OrigamiSelectContentOptions } from "@loozo/origami-ui/select";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { cn } from "../cn";
import { popupClasses, popupListClasses } from "../popup";

/**
 * A Select's floating list, in the top layer: at least as wide as the Trigger, 4px from it by
 * default, scrolling within the room the viewport leaves.
 */
@Directive({
  selector: "[fold__SelectContent]",
  hostDirectives: [OrigamiSelectContent],
  // fold's own Content Options, replacing Origami's as a whole, so the list sits 4px from the Trigger.
  providers: [OrigamiSelectContentOptions.provideExisting(() => SelectContent)],
  host: {
    "data-slot": "select-content",
    // Out of the native Tab order: a scrolling list is otherwise a keyboard-focusable scroller in
    // Chromium and Firefox, and Tab from the open list lands on it instead of the next control.
    tabindex: "-1",
    "[class]": "classes()",
  },
})
export class SelectContent implements OrigamiSelectContentOptions {
  readonly id = input(injectUniqueId("select-content"));
  readonly side = input<OrigamiPopoverSide>("block-end");
  readonly align = input<OrigamiPopoverAlign>("start");
  readonly gap = input(4);
  readonly class = input("");

  protected readonly classes = computed(() => cn(popupClasses, popupListClasses, this.class()));
}
