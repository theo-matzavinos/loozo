import { Directive, type OnInit, type Signal, inject, input } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalBoolean,
  ɵinjectPresence,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { TabsPanelProps, TabsPanelState } from "@ui-sdk/core/tabs";
import { UiTabs } from "./tabs";

/** Core's `panel` slot handles no events. */
const events = [] as const;

/** UiTabsPanel takes every core prop as an input. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/** Its own input is core's `value`: `*uiTabsPanel="'billing'"` binds only that one unprefixed. */
const renamed = { uiTabsPanel: "value" } as const;

/**
 * The content of the tab with the same value. It's structural: write it with `*` and its value,
 * on the panel's element, which is in the page while core has it there (selected, leaving, kept or
 * findable). Its template renders exactly one element; put every `@if` and `@for` inside it. For a
 * per-panel `keepMounted` or `hiddenUntilFound`, write the `<ng-template>` form.
 *
 * @example
 * ```html
 * <div *uiTabsPanel="'profile'">…</div>
 * <ng-template uiTabsPanel="billing" keepMounted><div>…</div></ng-template>
 * ```
 */
@Directive({ selector: "[uiTabsPanel]", exportAs: "uiTabsPanel" })
export class UiTabsPanel implements OnInit {
  /** The value of the tab that shows it, core's `value`. */
  readonly uiTabsPanel = input.required<string>();
  /** Keeps it in the page while unselected, hidden, so its content keeps its state. */
  readonly keepMounted = input(undefined, { transform: optionalBoolean });
  /** Keeps it in the page while unselected as `hidden="until-found"`; `false` overrides the tabs'. */
  readonly hiddenUntilFound = input(undefined, { transform: optionalBoolean });

  protected readonly slot = ɵinjectSlot<TabsPanelState>(
    inject(UiTabs).ɵroot,
    "panel",
    () => ({
      value: this.uiTabsPanel(),
      keepMounted: this.keepMounted(),
      hiddenUntilFound: this.hiddenUntilFound(),
    }),
    { events, mounts: true },
  );
  readonly #presence = ɵinjectPresence(this.slot, "uiTabsPanel");

  /** Whether its tab is selected. */
  readonly state: Signal<TabsPanelState> = this.slot.state;

  ngOnInit(): void {
    this.#presence.sync();
  }
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiTabsPanel, typeof renamed>,
    Exclude<keyof TabsPanelProps, (typeof classes)[keyof typeof classes][number]>
  >
>;
