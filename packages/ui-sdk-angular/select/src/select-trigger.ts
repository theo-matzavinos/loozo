import {
  Directive,
  type InputSignal,
  HostAttributeToken,
  type Signal,
  inject,
  input,
} from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalBoolean,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { SelectTriggerProps, SelectTriggerState } from "@ui-sdk/core/select";
import { UiSelect } from "./select";

/** The event types core's `trigger` slot handles, declared below as static host listeners. */
const events = ["keydown", "pointerdown", "pointerenter", "focusin", "click"] as const;

/**
 * How UiSelectTrigger passes core's props that aren't inputs. `named` is internal: whether the
 * element's own static `aria-labelledby` or `aria-label` names it.
 */
const classes = { internal: ["named"], fixed: [], excluded: [] } as const;

/**
 * The button that opens its select's popup. Name it with a static `aria-label` or
 * `aria-labelledby`.
 */
@Directive({
  selector: "[uiSelectTrigger]",
  exportAs: "uiSelectTrigger",
  host: {
    "(keydown)": 'slot.dispatch("keydown", $event)',
    "(pointerdown)": 'slot.dispatch("pointerdown", $event)',
    "(pointerenter)": 'slot.dispatch("pointerenter", $event)',
    "(focusin)": 'slot.dispatch("focusin", $event)',
    "(click)": 'slot.dispatch("click", $event)',
  },
})
export class UiSelectTrigger {
  /** Stops the trigger opening the popup. */
  readonly disabled = input(undefined, { transform: optionalBoolean });
  /** Opens and closes this trigger's select from anywhere. */
  readonly controller: InputSignal<SelectTriggerProps["controller"]> =
    input<SelectTriggerProps["controller"]>(undefined);

  readonly #named =
    inject(new HostAttributeToken("aria-labelledby"), { optional: true }) !== null ||
    inject(new HostAttributeToken("aria-label"), { optional: true }) !== null;

  protected readonly slot = ɵinjectSlot<SelectTriggerState>(
    inject(UiSelect).ɵroot,
    "trigger",
    () => ({ disabled: this.disabled(), controller: this.controller(), named: this.#named }),
    { events },
  );

  /** What core renders the trigger from. */
  readonly state: Signal<SelectTriggerState> = this.slot.state;
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiSelectTrigger>,
    Exclude<keyof SelectTriggerProps, (typeof classes)[keyof typeof classes][number]>
  >
>;
