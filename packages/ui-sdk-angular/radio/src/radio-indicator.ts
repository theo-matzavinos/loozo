import { Directive, type Signal, inject } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { RadioIndicatorProps, RadioIndicatorState } from "@ui-sdk/core/radio";
import { UiRadio } from "./radio";

/** Core's `indicator` slot handles no events. */
const events = [] as const;

/**
 * How UiRadioIndicator passes core's props that aren't inputs. `value` is internal: it's the
 * radio's around it. `keepMounted` is fixed: the indicator always stays in the DOM, with
 * `data-unchecked` while its radio is unchecked.
 */
const classes = { internal: ["value"], fixed: ["keepMounted"], excluded: [] } as const;

/**
 * The dot inside its radio. It stays in the DOM while unchecked: hide it by `[data-unchecked]`,
 * or render it under `@if (radio.state().checked)`.
 */
@Directive({ selector: "[uiRadioIndicator]", exportAs: "uiRadioIndicator" })
export class UiRadioIndicator {
  readonly #radio = inject(UiRadio);

  protected readonly slot = ɵinjectSlot<RadioIndicatorState>(
    this.#radio.ɵgroup.ɵroot,
    "indicator",
    () => ({ value: this.#radio.value(), keepMounted: true }),
    { events },
  );

  /** Whether its radio is checked, disabled, read-only and required. */
  readonly state: Signal<RadioIndicatorState> = this.slot.state;
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiRadioIndicator>,
    Exclude<keyof RadioIndicatorProps, (typeof classes)[keyof typeof classes][number]>
  >
>;
