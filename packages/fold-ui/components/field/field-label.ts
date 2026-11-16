import { Directive, computed, input } from "@angular/core";
import { OrigamiFieldLabel } from "@loozo/origami-ui/field";
import { cn } from "../cn";

/**
 * Labels its Field. On a `<label>` it names the control, and Origami points `for` at it; use one for
 * a Checkbox, Switch, Input or Textarea. On another element, such as a `<span>`, it names a group,
 * such as a RadioGroup, through `aria-labelledby`. Dims while the Field is disabled, and is regular
 * weight in a horizontal Field.
 */
@Directive({
  selector: "[fold__FieldLabel]",
  hostDirectives: [{ directive: OrigamiFieldLabel, inputs: ["id"] }],
  host: { "data-slot": "field-label", "[class]": "classes()" },
})
export class FieldLabel {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "text-body font-semibold text-foreground group-data-disabled/field:opacity-50 group-data-[orientation=horizontal]/field:font-normal",
      this.class(),
    ),
  );
}
