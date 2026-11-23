import { Directive, type Signal, inject } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { TabsListState } from "@ui-sdk/core/tabs";
import { UiTabs } from "./tabs";

/** The event types core's `list` slot handles, declared below as static host listeners. */
const events = ["keydown"] as const;

/** Core's `list` slot takes no props. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * The row of tabs: arrow keys, Home and End move between them, with one tab stop. Name it with
 * `aria-label` or `aria-labelledby`.
 */
@Directive({
  selector: "[uiTabsList]",
  exportAs: "uiTabsList",
  host: { "(keydown)": 'slot.dispatch("keydown", $event)' },
})
export class UiTabsList {
  protected readonly slot = ɵinjectSlot<TabsListState>(inject(UiTabs).ɵroot, "list", () => ({}), {
    events,
  });

  /** The orientation. */
  readonly state: Signal<TabsListState> = this.slot.state;
}

type _Parity = ɵExpect<
  ɵSameNames<ɵBoundNames<UiTabsList>, (typeof classes)[keyof typeof classes][number]>
>;
