import { Directive, type Signal } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { AccordionHeaderProps, AccordionHeaderState } from "@ui-sdk/core/accordion";
import { ɵinjectAccordionItem } from "./accordion-item";

/** Core's `header` slot handles no events. */
const events = [] as const;

/** How UiAccordionHeader passes core's props, none of them inputs. `value` is internal: its item's. */
const classes = { internal: ["value"], fixed: [], excluded: [] } as const;

/**
 * The heading around an item's trigger. Write the heading element for the page's outline, such as
 * `<h3 uiAccordionHeader>`.
 */
@Directive({ selector: "[uiAccordionHeader]", exportAs: "uiAccordionHeader" })
export class UiAccordionHeader {
  readonly #item = ɵinjectAccordionItem("uiAccordionHeader");

  protected readonly slot = ɵinjectSlot<AccordionHeaderState>(
    this.#item.ɵaccordion.ɵroot,
    "header",
    () => ({ value: this.#item.ɵvalue() }),
    { events },
  );

  /** Its item's state: whether it's open and disabled, and its position. */
  readonly state: Signal<AccordionHeaderState> = this.slot.state;
}

/** It takes no inputs: core's header props are all internal. */
type _Parity = ɵExpect<ɵSameNames<ɵBoundNames<UiAccordionHeader>, keyof AccordionHeaderProps>>;

/** Every core prop is internal. */
type _Classes = ɵExpect<ɵSameNames<(typeof classes)["internal"][number], "value">>;
