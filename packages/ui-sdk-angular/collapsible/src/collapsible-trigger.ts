import { Directive, type Signal, inject } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { CollapsibleTriggerProps, CollapsibleTriggerState } from "@ui-sdk/core/collapsible";
import { UiCollapsible } from "./collapsible";

/** The event types core's `trigger` slot handles, declared below as static host listeners. */
const events = ["keydown", "click"] as const;

/** Core's `trigger` slot takes no props. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * The button that opens and closes the collapsible. Use a `<button>`: another element gets its
 * role and tab stop only once it binds.
 */
@Directive({
  selector: "[uiCollapsibleTrigger]",
  exportAs: "uiCollapsibleTrigger",
  host: {
    "(keydown)": 'slot.dispatch("keydown", $event)',
    "(click)": 'slot.dispatch("click", $event)',
  },
})
export class UiCollapsibleTrigger {
  protected readonly slot = ɵinjectSlot<CollapsibleTriggerState>(
    inject(UiCollapsible).ɵroot,
    "trigger",
    () => ({}),
    { events },
  );

  /** Whether the collapsible is open, and whether it's disabled. */
  readonly state: Signal<CollapsibleTriggerState> = this.slot.state;
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiCollapsibleTrigger>,
    Exclude<keyof CollapsibleTriggerProps, (typeof classes)[keyof typeof classes][number]>
  >
>;
