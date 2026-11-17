import { Directive, computed, input } from "@angular/core";
import { OrigamiComboboxContent, OrigamiComboboxContentOptions } from "@loozo/origami-ui/combobox";
import type { OrigamiPopoverAlign, OrigamiPopoverSide } from "@loozo/origami-ui/popover";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { cn } from "../cn";
import { popupClasses, popupListClasses } from "../popup";

/**
 * A Combobox's floating list, in the top layer: at least as wide as the input, 4px from it by
 * default, scrolling within the room the viewport leaves. It stays open with no options, so a
 * ComboboxEmpty row can say why.
 */
@Directive({
  selector: "[fold__ComboboxContent]",
  hostDirectives: [OrigamiComboboxContent],
  // fold's own Content Options, replacing Origami's as a whole, so the list sits 4px from the input.
  providers: [OrigamiComboboxContentOptions.provideExisting(() => ComboboxContent)],
  host: {
    "data-slot": "combobox-content",
    // Out of the native Tab order: a scrolling list is otherwise a keyboard-focusable scroller in
    // Chromium and Firefox, and Tab from the open list lands on it instead of the next control.
    tabindex: "-1",
    "[class]": "classes()",
  },
})
export class ComboboxContent implements OrigamiComboboxContentOptions {
  readonly id = input(injectUniqueId("combobox-content"));
  readonly side = input<OrigamiPopoverSide>("block-end");
  readonly align = input<OrigamiPopoverAlign>("start");
  readonly gap = input(4);
  readonly class = input("");

  protected readonly classes = computed(() => cn(popupClasses, popupListClasses, this.class()));
}
