import { Directive, computed, input } from "@angular/core";
import { OrigamiTabsPanel } from "@loozo/origami-ui/tabs";
import { cn } from "../cn";

/**
 * The content of the tab with the same `value`, hidden while another is selected. It's a Tab stop
 * with the focus ring; give it `tabindex="-1"` when it starts with a focusable element.
 */
@Directive({
  selector: "[fold__TabsPanel]",
  hostDirectives: [{ directive: OrigamiTabsPanel, inputs: ["value", "id"] }],
  host: { "data-slot": "tabs-panel", "[class]": "classes()" },
})
export class TabsPanel {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      // No display utility of its own: Origami's `hidden` hides it, over a display class of yours too.
      "min-w-0 grow rounded-control-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      this.class(),
    ),
  );
}
