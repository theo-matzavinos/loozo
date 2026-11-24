import { Component, computed, inject, input } from "@angular/core";
import { OrigamiAccordionPanel } from "@loozo/origami-ui/accordion";
import { cn } from "../cn";
import { disclosureClipClasses, disclosurePanelClasses } from "../disclosure";

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
}
