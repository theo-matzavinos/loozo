import { Directive, type Signal, inject } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { SwitchThumbState } from "@ui-sdk/core/switch";
import { UiSwitch } from "./switch";

/** Core's `thumb` slot handles no events. */
const events = [] as const;

/** Core's `thumb` slot takes no props. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/** The part that slides, inside its switch. Style it by `[data-checked]`. */
@Directive({ selector: "[uiSwitchThumb]", exportAs: "uiSwitchThumb" })
export class UiSwitchThumb {
  protected readonly slot = ɵinjectSlot<SwitchThumbState>(
    inject(UiSwitch).ɵroot,
    "thumb",
    () => ({}),
    { events },
  );

  /** Whether its switch is on, disabled, read-only and required. */
  readonly state: Signal<SwitchThumbState> = this.slot.state;
}

type _Parity = ɵExpect<ɵSameNames<ɵBoundNames<UiSwitchThumb>, never>>;

/** Core's slot takes no props, so nothing is classified. */
type _Classes = ɵExpect<ɵSameNames<(typeof classes)[keyof typeof classes][number], never>>;
