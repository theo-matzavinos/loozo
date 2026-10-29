import { Directive, computed, input } from "@angular/core";
import { OrigamiFieldControl } from "@loozo/origami-ui/field";
import { cn } from "../cn";
import { inputClasses } from "../input";

/** A styled native textarea with Input's look; `rows` sets its height above the 64px minimum. */
@Directive({
  selector: "textarea[fold__Textarea]",
  hostDirectives: [{ directive: OrigamiFieldControl, inputs: ["id"] }],
  host: { "data-slot": "textarea", "[class]": "classes()" },
})
export class Textarea {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(inputClasses, "min-h-16 resize-y py-1.5", this.class()),
  );
}
