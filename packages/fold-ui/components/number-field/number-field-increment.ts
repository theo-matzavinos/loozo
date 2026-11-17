import { Component, computed, input } from "@angular/core";
import { LucidePlus } from "@lucide/angular";
import { OrigamiNumberFieldIncrement } from "@loozo/origami-ui/number-field";
import { cn } from "../cn";
import { stepButtonClasses } from "./number-field-step-button";

/**
 * A square ghost + button inside a NumberField, as tall as the box. It's out of the Tab order; a
 * mouse press keeps focus in the Input, a touch or pen press focuses it natively. Give it a localized
 * `aria-label`.
 */
@Component({
  selector: "button[fold__NumberFieldIncrement]",
  imports: [LucidePlus],
  hostDirectives: [OrigamiNumberFieldIncrement],
  host: { "data-slot": "number-field-increment", "[class]": "classes()" },
  template: `<svg lucidePlus aria-hidden="true"></svg>`,
})
export class NumberFieldIncrement {
  readonly class = input("");

  protected readonly classes = computed(() => cn(stepButtonClasses, this.class()));
}
