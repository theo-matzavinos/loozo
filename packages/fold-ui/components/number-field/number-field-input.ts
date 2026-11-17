import { Directive, computed, input } from "@angular/core";
import { OrigamiNumberFieldInput } from "@loozo/origami-ui/number-field";
import { cn } from "../cn";

/**
 * The borderless text inside a NumberField; the box draws the border and the ring. Origami reads
 * its `id` as a static attribute, so write `id="…"` or let a Field generate one, not `[id]`.
 */
@Directive({
  selector: "input[fold__NumberFieldInput]",
  hostDirectives: [OrigamiNumberFieldInput],
  host: { "data-slot": "number-field-input", "[class]": "classes()" },
})
export class NumberFieldInput {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "min-w-0 flex-1 bg-transparent px-2.25 tabular-nums text-foreground outline-none placeholder:text-muted-foreground",
      "disabled:cursor-not-allowed [[data-slot=number-field-adornment]~&]:ps-2",
      this.class(),
    ),
  );
}
