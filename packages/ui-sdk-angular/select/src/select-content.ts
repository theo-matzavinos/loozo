import { Directive, type InputSignal, type Signal, inject, input } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalBoolean,
  optionalNumber,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { SelectContentProps, SelectContentState } from "@ui-sdk/core/select";
import { UiSelect } from "./select";

/** The event types core's `content` slot handles, declared below as static host listeners. */
const events = ["keydown"] as const;

/**
 * How UiSelectContent passes core's props that aren't inputs. `keepMounted` is fixed: the
 * content always stays in the DOM, hidden while closed.
 */
const classes = { internal: [], fixed: ["keepMounted"], excluded: [] } as const;

/** The popup that holds the items. It stays in the DOM, hidden while closed. */
@Directive({
  selector: "[uiSelectContent]",
  exportAs: "uiSelectContent",
  host: { "(keydown)": 'slot.dispatch("keydown", $event)' },
})
export class UiSelectContent {
  /** The side of the trigger it opens on. */
  readonly side: InputSignal<SelectContentProps["side"]> =
    input<SelectContentProps["side"]>(undefined);
  /** How it aligns with the trigger along that side. */
  readonly align: InputSignal<SelectContentProps["align"]> =
    input<SelectContentProps["align"]>(undefined);
  /** The gap from the trigger, in pixels. */
  readonly sideOffset = input(undefined, { transform: optionalNumber });
  /** The shift along the side, in pixels. */
  readonly alignOffset = input(undefined, { transform: optionalNumber });
  /** The space kept from the viewport's edges, in pixels. */
  readonly collisionPadding = input(undefined, { transform: optionalNumber });
  /** The space kept between an arrow and the popup's corners, in pixels. */
  readonly arrowPadding = input(undefined, { transform: optionalNumber });
  /** Positions it against this element or id instead of the trigger. */
  readonly anchor: InputSignal<SelectContentProps["anchor"]> =
    input<SelectContentProps["anchor"]>(undefined);
  /** Renders it into this element instead of in place. */
  readonly container: InputSignal<SelectContentProps["container"]> =
    input<SelectContentProps["container"]>(undefined);
  /** Lines the selected item up with the trigger, as native selects do. */
  readonly alignItemWithTrigger = input(undefined, { transform: optionalBoolean });

  protected readonly slot = ɵinjectSlot<SelectContentState>(
    inject(UiSelect).ɵroot,
    "content",
    () => ({
      side: this.side(),
      align: this.align(),
      sideOffset: this.sideOffset(),
      alignOffset: this.alignOffset(),
      collisionPadding: this.collisionPadding(),
      arrowPadding: this.arrowPadding(),
      anchor: this.anchor(),
      container: this.container(),
      alignItemWithTrigger: this.alignItemWithTrigger(),
      keepMounted: true,
    }),
    { events },
  );

  /** What core renders the content from. */
  readonly state: Signal<SelectContentState> = this.slot.state;
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiSelectContent>,
    Exclude<keyof SelectContentProps, (typeof classes)[keyof typeof classes][number]>
  >
>;
