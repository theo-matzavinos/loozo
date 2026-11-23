import { Component, computed, input } from "@angular/core";
import { OrigamiToggleGroupItem } from "@loozo/origami-ui/toggle-group";
import { buttonVariants } from "../button";
import { cn } from "../cn";
import { pressedClasses } from "../toggle";
import { toggleGroupItemClasses } from "./toggle-group-style";

const INDICATOR =
  "hidden size-1.5 shrink-0 rounded-full bg-ring outline-3 outline-ring/25 me-0.5 " +
  "[[aria-pressed=true]>&]:[display:var(--toggle-group-indicator,none)] " +
  // Opted out so the dot paints. It shows only on a pressed item and takes that item's text colour
  // (pressedClasses' **:text-inherit): HighlightText while enabled, Canvas while disabled.
  "forced-color-adjust-none forced-colors:bg-current forced-colors:outline-0";

@Component({
  selector: "button[fold__ToggleGroupItem]",
  hostDirectives: [
    {
      directive: OrigamiToggleGroupItem,
      inputs: ["value", "id", "disabled", "focusableWhenDisabled"],
    },
  ],
  host: { "data-slot": "toggle-group-item", "[class]": "classes()" },
  template: `<span aria-hidden="true" data-slot="toggle-group-indicator" class="${INDICATOR}"></span
    ><ng-content />`,
})
export class ToggleGroupItem {
  readonly class = input("");
  protected readonly classes = computed(() =>
    cn(
      buttonVariants({ variant: "ghost", size: "md" }),
      toggleGroupItemClasses,
      pressedClasses,
      this.class(),
    ),
  );
}
