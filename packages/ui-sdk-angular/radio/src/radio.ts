import { Directive, type Signal, inject, input } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalBoolean,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { RadioProps, RadioState } from "@ui-sdk/core/radio";
import { UiRadioGroup } from "./radio-group";

/** The event types core's `root` slot handles, declared below as static host listeners. */
const events = ["mousedown", "keydown", "keyup", "click"] as const;

/** UiRadio takes every core prop as an input. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * One radio of its group, on a `<button>`. Core keys it by its `value`, which is unique in the
 * group. Arrow keys move between the radios and check the one they reach.
 *
 * @example
 * ```html
 * <button uiRadio value="small"><span uiRadioIndicator></span>Small</button>
 * ```
 */
@Directive({
  selector: "[uiRadio]",
  exportAs: "uiRadio",
  host: {
    "(mousedown)": 'slot.dispatch("mousedown", $event)',
    "(keydown)": 'slot.dispatch("keydown", $event)',
    "(keyup)": 'slot.dispatch("keyup", $event)',
    "(click)": 'slot.dispatch("click", $event)',
  },
})
export class UiRadio {
  /** The value the group takes when it's checked. */
  readonly value = input.required<string>();
  /** Stops it being checked; arrow keys skip it. */
  readonly disabled = input(undefined, { transform: optionalBoolean });

  /** Its group; its indicator and input read it. Not public API. */
  readonly ɵgroup = inject(UiRadioGroup);

  protected readonly slot = ɵinjectSlot<RadioState>(
    this.ɵgroup.ɵroot,
    "root",
    () => ({ value: this.value(), disabled: this.disabled() }),
    { events },
  );

  /** Whether it's checked, disabled, read-only and required. */
  readonly state: Signal<RadioState> = this.slot.state;
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiRadio>,
    Exclude<keyof RadioProps, (typeof classes)[keyof typeof classes][number]>
  >
>;
