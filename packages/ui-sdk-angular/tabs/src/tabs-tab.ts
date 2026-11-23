import { Directive, type OnInit, type Signal, inject, input } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalBoolean,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { TabsTabProps, TabsTabState } from "@ui-sdk/core/tabs";
import { UiTabs } from "./tabs";

/** The event types core's `tab` slot handles, declared below as static host listeners. */
const events = ["click"] as const;

/** UiTabsTab takes every core prop as an input. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * One tab, inside the list. Its `value` pairs it with the panel of the same value. A disabled tab
 * stays reachable with the arrow keys but can't be selected. Use a `<button>`: another element
 * gets its role only once it binds.
 *
 * @example
 * ```html
 * <button uiTabsTab value="billing" [disabled]="!paid">Billing</button>
 * ```
 */
@Directive({
  selector: "[uiTabsTab]",
  exportAs: "uiTabsTab",
  host: { "(click)": 'slot.dispatch("click", $event)' },
})
export class UiTabsTab implements OnInit {
  /** Pairs it with its panel, and names it in the tabs' `value`. */
  readonly value = input.required<string>();
  /** Stops it being selected; it stays focusable with `aria-disabled`. */
  readonly disabled = input(undefined, { transform: optionalBoolean });

  protected readonly slot = ɵinjectSlot<TabsTabState>(
    inject(UiTabs).ɵroot,
    "tab",
    () => ({ value: this.value(), disabled: this.disabled() }),
    { events },
  );

  /** Whether it's selected and disabled. */
  readonly state: Signal<TabsTabState> = this.slot.state;

  ngOnInit(): void {
    // Takes its turn in core's first-enabled-tab claim in Angular's creation order, before the
    // panels after it ask whether they show: without a value, the server selects the first enabled
    // tab created, which is the first in DOM order only when every tab sits at one view level.
    this.slot.state();
  }
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiTabsTab>,
    Exclude<keyof TabsTabProps, (typeof classes)[keyof typeof classes][number]>
  >
>;
