import { Directive, computed, input } from "@angular/core";
import { OrigamiFieldLabel } from "@loozo/origami-ui/field";
import { cn } from "../cn";

/** Names its Field's control; Origami points `for` at it. Dims while the Field is disabled. */
@Directive({
  selector: "label[fold__FieldLabel]",
  hostDirectives: [{ directive: OrigamiFieldLabel, inputs: ["id"] }],
  host: { "data-slot": "field-label", "[class]": "classes()" },
})
export class FieldLabel {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "text-body font-semibold text-foreground group-data-disabled/field:opacity-50",
      this.class(),
    ),
  );
}
