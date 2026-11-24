import { Component, computed, inject, input } from "@angular/core";
import { OrigamiCollapsiblePanel } from "@loozo/origami-ui/collapsible";
import { cn } from "../cn";
import { disclosureClipClasses, disclosurePanelClasses } from "../disclosure";

/**
 * The content the Collapsible shows while expanded. Your `class` (static, or a whole string bound with
 * `[class]`) styles the content box inside the clip, so padding never jumps the animated height.
 */
@Component({
  selector: "[fold__CollapsiblePanel]",
  exportAs: "fold__CollapsiblePanel",
  hostDirectives: [{ directive: OrigamiCollapsiblePanel, inputs: ["id"] }],
  host: {
    "data-slot": "collapsible-panel",
    // Fixed: the consumer's `class` styles the content box; a static class attribute would otherwise also land here.
    "[attr.class]": "panelClasses",
  },
  template: `
    <div data-slot="collapsible-panel-clip" class="${disclosureClipClasses}">
      <div data-slot="collapsible-panel-content" [class]="contentClasses()"><ng-content /></div>
    </div>
  `,
})
export class CollapsiblePanel {
  readonly class = input("");
  /** `open()`: true from the start of the entrance until the exit finishes; gate deferred content on it. */
  readonly state = inject(OrigamiCollapsiblePanel).state;

  protected readonly panelClasses = disclosurePanelClasses;
  protected readonly contentClasses = computed(() => cn(this.class()));
}
