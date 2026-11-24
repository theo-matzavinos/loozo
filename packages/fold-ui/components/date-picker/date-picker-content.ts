import { Directive, computed, inject, input } from "@angular/core";
import {
  OrigamiDatePickerContent,
  OrigamiDatePickerContentOptions,
} from "@loozo/origami-ui/date-picker";
import {
  OrigamiPopoverContentState,
  type OrigamiPopoverAlign,
  type OrigamiPopoverSide,
} from "@loozo/origami-ui/popover";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { cn } from "../cn";
import { popupClasses } from "../popup";

/**
 * A DatePicker's popup, in the top layer: the floating layers' surface with 12px padding, 4px
 * from the Trigger by default, holding a Calendar whose own box is dropped. Gate the Calendar on
 * this Content's `state.open()`, which stays true through the exit, so focus returns to the
 * Trigger after a choice. In the field shape, write `align="end"` so it lines up with the box's
 * end. While open, it stacks what you write in it 12px apart: the Calendar, then a
 * DatePickerFooter for your own buttons, as wide as the Calendar. When the popup is too short for
 * them, it scrolls the focused cell into view and snaps a manual scroll to the header's top, a
 * row's bottom or the end of anything it stacks, such as the range's prompt or the footer.
 */
@Directive({
  selector: "[fold__DatePickerContent]",
  exportAs: "fold__DatePickerContent",
  hostDirectives: [OrigamiDatePickerContent],
  // fold's own Content Options, replacing Origami's as a whole, so the popup sits 4px from the Trigger.
  providers: [OrigamiDatePickerContentOptions.provideExisting(() => DatePickerContent)],
  host: { "data-slot": "date-picker-content", "[class]": "classes()" },
})
export class DatePickerContent implements OrigamiDatePickerContentOptions {
  readonly id = input(injectUniqueId("date-picker-content"));
  readonly side = input<OrigamiPopoverSide>("block-end");
  readonly align = input<OrigamiPopoverAlign>("start");
  readonly gap = input(4);
  readonly class = input("");

  /** Presence's `open`: true while the children should stay rendered, through the exit. */
  readonly state = inject(OrigamiPopoverContentState);

  protected readonly classes = computed(() =>
    cn(
      popupClasses,
      // Only while open: a closed popover stays hidden by the browser's own `display: none`.
      "open:flex open:flex-col open:gap-3",
      "w-fit max-w-[calc(100vw_-_1rem)] max-h-[calc(var(--og-available-height)_-_8px)] overflow-y-auto overscroll-contain p-3",
      // Origami focuses the Calendar's day before the popup's height settles, so a short popup
      // can leave it out of view. Snapping to the focused cell scrolls it back in, 12px clear of
      // the edges. The header's top and every row's bottom are snap points too, so a manual
      // scroll rests where it stops instead of being pulled back to the focused cell. The end of
      // every child is one too, so a manual scroll reaches the range's prompt and the footer.
      // Each cell's 2px scroll margin keeps its focus outline inside when focus moves after a
      // manual scroll.
      "snap-y snap-proximity scroll-py-3 **:data-[slot=calendar-cell]:focus:snap-center **:data-[slot=calendar-cell]:scroll-my-0.5",
      "**:data-[slot=calendar-header]:snap-start [&_tr]:snap-end *:snap-end",
      // The Calendar sits on the popup's surface: no border, fill, radius or padding of its own.
      "**:data-[slot=calendar]:rounded-none **:data-[slot=calendar]:border-0 **:data-[slot=calendar]:bg-transparent **:data-[slot=calendar]:p-0",
      this.class(),
    ),
  );
}
