import { Directive, type Signal, inject } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { TabsIndicatorState } from "@ui-sdk/core/tabs";
import { UiTabs } from "./tabs";

/** Core's `indicator` slot handles no events. */
const events = [] as const;

/** Core's `indicator` slot takes no props. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * A mark that follows the selected tab, inside the list. Core sets its `--active-tab-left`,
 * `--active-tab-top`, `--active-tab-width` and `--active-tab-height` once it binds; style it with
 * them.
 */
@Directive({ selector: "[uiTabsIndicator]", exportAs: "uiTabsIndicator" })
export class UiTabsIndicator {
  protected readonly slot = ɵinjectSlot<TabsIndicatorState>(
    inject(UiTabs).ɵroot,
    "indicator",
    () => ({}),
    { events },
  );

  /** The orientation, and which way the last selection moved. */
  readonly state: Signal<TabsIndicatorState> = this.slot.state;
}

type _Parity = ɵExpect<
  ɵSameNames<ɵBoundNames<UiTabsIndicator>, (typeof classes)[keyof typeof classes][number]>
>;
