import { Component, computed, input } from "@angular/core";
import { LucideMinus } from "@lucide/angular";
import { OrigamiNumberFieldDecrement } from "@loozo/origami-ui/number-field";
import { cn } from "../cn";
import { stepButtonClasses } from "./number-field-step-button";

/**
 * A square ghost − button inside a NumberField, as tall as the box. It's out of the Tab order; a
 * mouse press keeps focus in the Input, a touch or pen press focuses it natively. Give it a localized
 * `aria-label`.
 */
@Component({
  selector: "button[fold__NumberFieldDecrement]",
  imports: [LucideMinus],
  hostDirectives: [OrigamiNumberFieldDecrement],
  host: { "data-slot": "number-field-decrement", "[class]": "classes()" },
  template: `<svg lucideMinus aria-hidden="true"></svg>`,
})
export class NumberFieldDecrement {
  readonly class = input("");

  protected readonly classes = computed(() => cn(stepButtonClasses, this.class()));
}
