import { Directive, computed, input } from "@angular/core";
import { OrigamiFieldDescription } from "@loozo/origami-ui/field";
import { cn } from "../cn";

/** A hint under the control; Origami adds it to the control's `aria-describedby`. */
@Directive({
  selector: "[fold__FieldDescription]",
  hostDirectives: [{ directive: OrigamiFieldDescription, inputs: ["id"] }],
  host: { "data-slot": "field-description", "[class]": "classes()" },
})
export class FieldDescription {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("text-label font-normal text-muted-foreground", this.class()),
  );
}
