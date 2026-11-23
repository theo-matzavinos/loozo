import { Directive, type Signal, input } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalBoolean,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { AccordionTriggerProps, AccordionTriggerState } from "@ui-sdk/core/accordion";
import { ɵinjectAccordionItem } from "./accordion-item";

/** The event types core's `trigger` slot handles, declared below as static host listeners. */
const events = ["keydown", "click"] as const;

/** How UiAccordionTrigger passes core's props that aren't inputs. `value` is internal: its item's. */
const classes = { internal: ["value"], fixed: [], excluded: [] } as const;

/**
 * The button that opens and closes its item. Use a `<button>`: another element gets its role and
 * tab stop only once it binds.
 */
@Directive({
  selector: "[uiAccordionTrigger]",
  exportAs: "uiAccordionTrigger",
  host: {
    "(keydown)": 'slot.dispatch("keydown", $event)',
    "(click)": 'slot.dispatch("click", $event)',
  },
})
export class UiAccordionTrigger {
  /** Stops its presses, besides its item's and the accordion's `disabled`. */
  readonly disabled = input(undefined, { transform: optionalBoolean });

  readonly #item = ɵinjectAccordionItem("uiAccordionTrigger");

  protected readonly slot = ɵinjectSlot<AccordionTriggerState>(
    this.#item.ɵaccordion.ɵroot,
    "trigger",
    () => ({ value: this.#item.ɵvalue(), disabled: this.disabled() }),
    { events },
  );

  /** Its item's state: whether it's open and disabled, and its position. */
  readonly state: Signal<AccordionTriggerState> = this.slot.state;
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiAccordionTrigger>,
    Exclude<keyof AccordionTriggerProps | "value", (typeof classes)[keyof typeof classes][number]>
  >
>;
