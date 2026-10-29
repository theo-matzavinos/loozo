import { Component, computed, input } from "@angular/core";
import { LucideCircleAlert } from "@lucide/angular";
import { OrigamiFieldError } from "@loozo/origami-ui/field";
import { cn } from "../cn";

/**
 * An error message with an alert icon; Origami adds it to the control's `aria-describedby` while
 * it's mounted. It always shows, so gate it with `@if (field.state.errorsShown())`.
 */
@Component({
  selector: "[fold__FieldError]",
  imports: [LucideCircleAlert],
  hostDirectives: [{ directive: OrigamiFieldError, inputs: ["id"] }],
  host: { "data-slot": "field-error", "[class]": "classes()" },
  template: `<svg lucideCircleAlert aria-hidden="true"></svg><span><ng-content /></span>`,
})
export class FieldError {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "flex gap-1.5 text-label font-normal text-destructive-text [&>svg]:h-lh [&>svg]:w-3.5 [&>svg]:shrink-0",
      this.class(),
    ),
  );
}
