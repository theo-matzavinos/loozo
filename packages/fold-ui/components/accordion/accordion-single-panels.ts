import { DestroyRef, Injectable, inject } from "@angular/core";
import { OrigamiAccordionState } from "@loozo/origami-ui/accordion";
import type { OrigamiCollapsibleState } from "@loozo/origami-ui/collapsible";
import { snapDisclosureConceal } from "../disclosure";

/** Who a Panel answers to: its nearest accordion, its item, and the Collapsible it actually follows. */
export interface AccordionPanelOwners {
  readonly root: OrigamiAccordionState;
  readonly item: OrigamiCollapsibleState;
  readonly followed: OrigamiCollapsibleState;
}

/**
 * An AccordionSingle's Panels, each with its item's state. When the browser reveals one, Origami's
 * listener has already requested its item, so the selection closes another in the same request: that
 * one snaps closed too, before the browser scrolls to the match.
 */
@Injectable()
export class AccordionSinglePanels {
  readonly #root = inject(OrigamiAccordionState);
  readonly #items = new Map<HTMLElement, OrigamiCollapsibleState>();

  /**
   * Adds a Panel of one of this Single's items. A Panel of an accordion nested in an item, or one
   * inside a Collapsible nested in an item, finds this Single too but follows another owner, so it's
   * left out.
   */
  register(host: HTMLElement, owners: AccordionPanelOwners, destroyRef: DestroyRef): void {
    if (owners.root !== this.#root || owners.followed !== owners.item) {
      return;
    }

    this.#items.set(host, owners.item);
    destroyRef.onDestroy(() => this.#items.delete(host));
  }

  /**
   * Snaps closed every other shown Panel whose item the reveal's request left collapsed: the one it
   * closed, or one still closing. A Panel that isn't this Single's conceals nothing, and an item the
   * selection kept (a rejected or superseded request) stays as it is.
   */
  concealOthers(revealed: HTMLElement): void {
    if (!this.#items.has(revealed)) {
      return;
    }

    for (const [host, item] of this.#items) {
      if (host !== revealed && !item.expanded() && !host.hasAttribute("hidden")) {
        snapDisclosureConceal(host);
      }
    }
  }
}
