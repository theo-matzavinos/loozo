import { Directive, type Signal, inject, input } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalNumber,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { SelectValueProps, SelectValueState } from "@ui-sdk/core/select";
import { UiSelect } from "./select";

/** Core's `value` slot handles no events. */
const events = [] as const;

/** How UiSelectValue passes core's props that aren't inputs. `text` is internal, for web components. */
const classes = { internal: ["text"], fixed: [], excluded: [] } as const;

/**
 * Where the selected value shows. Its `state()` has the value, its label and whether the
 * placeholder shows; render them as its content.
 *
 * @example
 * ```html
 * <span uiSelectValue #shown="uiSelectValue">{{ shown.state().label }}</span>
 * ```
 */
@Directive({ selector: "[uiSelectValue]", exportAs: "uiSelectValue" })
export class UiSelectValue {
  /** Shown while nothing is selected; overrides the root's. */
  readonly placeholder = input<string | undefined>(undefined);
  /** How many labels show before the rest are counted. */
  readonly maxLabels = input(undefined, { transform: optionalNumber });
  /** The text for the labels past `maxLabels`. */
  readonly getMoreLabel = input<((count: number) => string) | undefined>(undefined);

  protected readonly slot = ɵinjectSlot<SelectValueState>(
    inject(UiSelect).ɵroot,
    "value",
    () => ({
      placeholder: this.placeholder(),
      maxLabels: this.maxLabels(),
      getMoreLabel: this.getMoreLabel(),
      text: undefined,
    }),
    { events },
  );

  /** The selected value, its label and labels, and whether the placeholder shows. */
  readonly state: Signal<SelectValueState> = this.slot.state;
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiSelectValue>,
    Exclude<keyof SelectValueProps, (typeof classes)[keyof typeof classes][number]>
  >
>;
