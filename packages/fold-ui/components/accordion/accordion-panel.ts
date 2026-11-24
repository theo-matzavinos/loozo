import { Component, DestroyRef, ElementRef, computed, inject, input } from "@angular/core";
import {
  OrigamiAccordionItem,
  OrigamiAccordionPanel,
  OrigamiAccordionState,
} from "@loozo/origami-ui/accordion";
import { OrigamiCollapsibleState } from "@loozo/origami-ui/collapsible";
import { cn } from "../cn";
import { disclosureClipClasses, disclosurePanelClasses, snapDisclosureReveal } from "../disclosure";
import { AccordionSinglePanels } from "./accordion-single-panels";

/**
 * An item's content, shown while it's expanded. Your `class` (static, or a whole string bound with
 * `[class]`) styles the content box inside the clip, so padding never jumps the animated height.
 */
@Component({
  selector: "[fold__AccordionPanel]",
  exportAs: "fold__AccordionPanel",
  hostDirectives: [{ directive: OrigamiAccordionPanel, inputs: ["id"] }],
  host: {
    "data-slot": "accordion-panel",
    // Fixed: the consumer's `class` styles the content box; a static class attribute would otherwise also land here.
    "[attr.class]": "panelClasses",
    "(beforematch)": "snapReveal($event)",
  },
  template: `
    <div data-slot="accordion-panel-clip" class="${disclosureClipClasses}">
      <div data-slot="accordion-panel-content" [class]="contentClasses()"><ng-content /></div>
    </div>
  `,
})
export class AccordionPanel {
  readonly class = input("");
  /** `open()`: true from the start of the entrance until the exit finishes; gate deferred content on it. */
  readonly state = inject(OrigamiAccordionPanel).state;

  protected readonly panelClasses = disclosurePanelClasses;
  protected readonly contentClasses = computed(() => cn("px-2 pb-3", this.class()));

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #singlePanels = inject(AccordionSinglePanels, { optional: true });

  constructor() {
    this.#singlePanels?.register(
      this.#host,
      {
        root: inject(OrigamiAccordionState),
        item: inject(OrigamiAccordionItem).state,
        followed: inject(OrigamiCollapsibleState),
      },
      inject(DestroyRef),
    );
  }

  /**
   * A browser reveal opens this Panel at once and, in a Single, closes the one its request closed at
   * once. Origami's own `beforematch` listener, from the composed Panel, runs first and has already
   * requested this item.
   */
  protected snapReveal(event: Event): void {
    const revealed = snapDisclosureReveal(event);

    if (revealed) {
      this.#singlePanels?.concealOthers(this.#host);
    }
  }
}
