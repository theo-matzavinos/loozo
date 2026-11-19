import { Directive, type Signal, inject } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { ToolbarSeparatorState } from "@ui-sdk/core/toolbar";
import { UiToolbar } from "./toolbar";

/** Core's `separator` slot handles no events. */
const events = [] as const;

/** UiToolbarSeparator takes no props. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/** A line between groups of items in a toolbar. */
@Directive({ selector: "[uiToolbarSeparator]", exportAs: "uiToolbarSeparator" })
export class UiToolbarSeparator {
  protected readonly slot = ɵinjectSlot<ToolbarSeparatorState>(
    inject(UiToolbar).ɵroot,
    "separator",
    () => ({}),
    { events },
  );

  /** Which way the line runs: across the toolbar. */
  readonly state: Signal<ToolbarSeparatorState> = this.slot.state;
}

/** It takes no inputs. */
type _Parity = ɵExpect<ɵSameNames<ɵBoundNames<UiToolbarSeparator>, never>>;

/** Core's slot takes no props, so nothing is classified. */
type _Classes = ɵExpect<ɵSameNames<(typeof classes)[keyof typeof classes][number], never>>;
