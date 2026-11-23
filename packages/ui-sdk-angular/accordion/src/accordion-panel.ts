import { Directive, type OnInit, type Signal, input } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalBoolean,
  ɵinjectPresence,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { AccordionPanelProps, AccordionPanelState } from "@ui-sdk/core/accordion";
import { ɵinjectAccordionItem } from "./accordion-item";

/** Core's `panel` slot handles no events. */
const events = [] as const;

/** How UiAccordionPanel passes core's props that aren't inputs. `value` is internal: its item's. */
const classes = { internal: ["value"], fixed: [], excluded: [] } as const;

/**
 * An item's content. It's structural: write it with `*` on the panel's element, which is in the
 * page while core has it there (open, closing, kept or findable). Its template renders exactly one
 * element; put every `@if` and `@for` inside it. For a per-panel `keepMounted` or
 * `hiddenUntilFound`, write the `<ng-template>` form; unset, the accordion's applies.
 *
 * @example
 * ```html
 * <div *uiAccordionPanel>…</div>
 * <ng-template uiAccordionPanel keepMounted><div>…</div></ng-template>
 * ```
 */
@Directive({ selector: "[uiAccordionPanel]", exportAs: "uiAccordionPanel" })
export class UiAccordionPanel implements OnInit {
  /** Keeps the closed panel in the page, hidden; `false` overrides the accordion's. */
  readonly keepMounted = input(undefined, { transform: optionalBoolean });
  /** Keeps the closed panel in the page as `hidden="until-found"`; `false` overrides the accordion's. */
  readonly hiddenUntilFound = input(undefined, { transform: optionalBoolean });

  readonly #item = ɵinjectAccordionItem("uiAccordionPanel");

  protected readonly slot = ɵinjectSlot<AccordionPanelState>(
    this.#item.ɵaccordion.ɵroot,
    "panel",
    () => ({
      value: this.#item.ɵvalue(),
      keepMounted: this.keepMounted(),
      hiddenUntilFound: this.hiddenUntilFound(),
    }),
    { events, mounts: true },
  );
  readonly #presence = ɵinjectPresence(this.slot, "uiAccordionPanel");

  /** Its item's state: whether it's open and disabled, and its position. */
  readonly state: Signal<AccordionPanelState> = this.slot.state;

  ngOnInit(): void {
    this.#presence.sync();
  }
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiAccordionPanel>,
    Exclude<keyof AccordionPanelProps | "value", (typeof classes)[keyof typeof classes][number]>
  >
>;
