import { Directive, type Signal, inject, input } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalBoolean,
  ɵinjectInstanceId,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { TabsTabIconProps, TabsTabIconState } from "@ui-sdk/core/tabs";
import { UiTabs } from "./tabs";
import { UiTabsTab } from "./tabs-tab";

/** Core's `tab-icon` slot handles no events. */
const events = [] as const;

/**
 * How UiTabsTabIcon passes core's props that aren't inputs. `id` and `item` are internal: a key
 * made for it, and the `value` of the tab it's inside.
 */
const classes = { internal: ["id", "item"], fixed: [], excluded: [] } as const;

/**
 * An icon inside a tab. Core marks the tab with `data-has-icon` and the list with `data-has-icons`
 * once it binds. Set `mirror` on icons that point a way, like arrows.
 *
 * @example
 * ```html
 * <button uiTabsTab value="next">Next <svg uiTabsTabIcon mirror>…</svg></button>
 * ```
 */
@Directive({ selector: "[uiTabsTabIcon]", exportAs: "uiTabsTabIcon" })
export class UiTabsTabIcon {
  /** Flips it horizontally in right-to-left text. */
  readonly mirror = input(undefined, { transform: optionalBoolean });

  readonly #key = ɵinjectInstanceId();
  readonly #tab = inject(UiTabsTab);

  protected readonly slot = ɵinjectSlot<TabsTabIconState>(
    inject(UiTabs).ɵroot,
    "tab-icon",
    () => ({ id: this.#key, item: this.#tab.value(), mirror: this.mirror() }),
    { events },
  );

  /** Whether it flips in right-to-left text. */
  readonly state: Signal<TabsTabIconState> = this.slot.state;
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiTabsTabIcon>,
    Exclude<keyof TabsTabIconProps | "id" | "item", (typeof classes)[keyof typeof classes][number]>
  >
>;
