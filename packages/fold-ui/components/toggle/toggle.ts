import { Directive, computed, input } from "@angular/core";
import { OrigamiToggle } from "@loozo/origami-ui/toggle";
import type { ButtonSize } from "../button";
import { toggleClasses } from "./toggle-style";

/**
 * A two-state button over Origami's Toggle: a ghost Button while off, the pressed segment's body
 * while on. Give an icon-only Toggle an `aria-label` and keep it stable: `aria-pressed` announces
 * the state.
 */
@Directive({
  selector: "button[fold__Toggle]",
  hostDirectives: [
    {
      directive: OrigamiToggle,
      inputs: ["checked", "disabled", "focusableWhenDisabled", "id"],
      outputs: ["checkedChange", "touch"],
    },
  ],
  host: { "data-slot": "toggle", "[class]": "classes()" },
})
export class Toggle {
  readonly size = input<ButtonSize>("md");
  readonly class = input("");
  protected readonly classes = computed(() => toggleClasses(this.size(), this.class()));
}
