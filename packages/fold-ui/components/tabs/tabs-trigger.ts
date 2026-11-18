import { Component, computed, input } from "@angular/core";
import { OrigamiTabsTrigger } from "@loozo/origami-ui/tabs";
import { cn } from "../cn";

/**
 * The status-light dot before the label. Horizontally it shows only on the selected tab; vertical
 * rows keep its space, so every label lines up and selecting one moves nothing. It keys on its own
 * Trigger with a child combinator, so nested Tabs don't reach it.
 */
const INDICATOR =
  "hidden size-1.5 shrink-0 rounded-full bg-ring outline-3 outline-ring/25 me-0.5 " +
  "[[aria-selected=true]>&]:block " +
  "[[data-orientation=vertical]>&]:invisible [[data-orientation=vertical]>&]:block [[data-orientation=vertical][aria-selected=true]>&]:visible " +
  // Opted out of forced colors so the dot paints; its only color is then a system color.
  "forced-color-adjust-none forced-colors:bg-[CanvasText] forced-colors:outline-0";

/**
 * A tab: muted 500 text, `foreground` 600 with a 2px underline and the status-light dot while
 * selected, all from Origami's `aria-selected`. Its content can be any markup, such as a count or
 * a 16px icon before the label.
 */
@Component({
  selector: "button[fold__TabsTrigger]",
  hostDirectives: [
    { directive: OrigamiTabsTrigger, inputs: ["value", "id", "disabled", "focusableWhenDisabled"] },
  ],
  host: {
    "data-slot": "tabs-trigger",
    "[class]": "classes()",
  },
  template: `
    <span aria-hidden="true" data-slot="tabs-indicator" class="${INDICATOR}"></span>
    <ng-content />
  `,
})
export class TabsTrigger {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-control-sm px-0.5",
      "text-body font-medium text-muted-foreground",
      "transition-[color] duration-120 ease-out motion-reduce:transition-none motion-reduce:duration-0",
      "not-data-disabled:hover:text-foreground",
      "aria-selected:font-semibold aria-selected:text-foreground",
      // No base outline-none, so the ring's outline-style stays solid.
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      // A focusable disabled tab isn't natively disabled, so forced colors would leave it CanvasText.
      "data-disabled:cursor-not-allowed data-disabled:opacity-50 forced-colors:data-disabled:text-[GrayText]",
      "[&_svg]:size-4 [&_svg]:shrink-0",
      // The underline is a border, which forced colors keep, on a box only the selected tab has.
      "aria-selected:after:absolute aria-selected:after:inset-x-0 aria-selected:after:bottom-0 aria-selected:after:border-b-2 aria-selected:after:border-foreground",
      // Vertical rows fill the List, and the bar moves to their inline end, over the List's baseline.
      "data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start data-[orientation=vertical]:pe-4",
      "data-[orientation=vertical]:aria-selected:after:inset-x-auto data-[orientation=vertical]:aria-selected:after:inset-y-0 data-[orientation=vertical]:aria-selected:after:end-0",
      "data-[orientation=vertical]:aria-selected:after:border-b-0 data-[orientation=vertical]:aria-selected:after:border-e-2",
      this.class(),
    ),
  );
}
