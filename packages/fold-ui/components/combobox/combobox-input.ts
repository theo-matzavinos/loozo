import { Directive, computed, input } from "@angular/core";
import { OrigamiComboboxInput } from "@loozo/origami-ui/combobox";
import { cn } from "../cn";
import { inputClasses } from "../input";

/**
 * A Combobox's text box, with Input's look: the Field's control and the list's anchor. It makes
 * room at its end for a ComboboxTrigger written directly after it.
 */
@Directive({
  selector: "input[fold__ComboboxInput]",
  hostDirectives: [{ directive: OrigamiComboboxInput, inputs: ["id"] }],
  host: { "data-slot": "combobox-input", "[class]": "classes()" },
})
export class ComboboxInput {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      inputClasses,
      "h-8",
      "[[data-slot=combobox]:has(>[data-slot=combobox-trigger])>&]:pe-8",
      // The hover border while the pointer is anywhere over the Combobox, the chevron included;
      // :where() keeps it below the focus, invalid and disabled borders.
      "[:where([data-slot=combobox]:hover)>&]:border-[color-mix(in_oklab,var(--input),var(--foreground)_35%)]",
      this.class(),
    ),
  );
}
