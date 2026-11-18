import { Directive, type Signal, inject } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { CheckboxIndicatorProps, CheckboxIndicatorState } from "@ui-sdk/core/checkbox";
import { UiCheckbox } from "./checkbox";

/** Core's `indicator` slot handles no events. */
const events = [] as const;

/**
 * How UiCheckboxIndicator passes core's props that aren't inputs. `keepMounted` is fixed: the
 * indicator always stays in the DOM, with `data-unchecked` while unchecked.
 */
const classes = { internal: [], fixed: ["keepMounted"], excluded: [] } as const;

/**
 * The check inside its checkbox. It stays in the DOM while unchecked: hide it by
 * `[data-unchecked]`, or render it under `@if (checkbox.state().checked)`.
 */
@Directive({ selector: "[uiCheckboxIndicator]", exportAs: "uiCheckboxIndicator" })
export class UiCheckboxIndicator {
  protected readonly slot = ɵinjectSlot<CheckboxIndicatorState>(
    inject(UiCheckbox).ɵroot,
    "indicator",
    () => ({ keepMounted: true }),
    { events },
  );

  /** Whether its checkbox is checked or indeterminate, disabled, read-only and required. */
  readonly state: Signal<CheckboxIndicatorState> = this.slot.state;
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiCheckboxIndicator>,
    Exclude<keyof CheckboxIndicatorProps, (typeof classes)[keyof typeof classes][number]>
  >
>;
