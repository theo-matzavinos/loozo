import { Component, computed, input } from "@angular/core";
import { OrigamiComboboxOption } from "@loozo/origami-ui/combobox";
import { LucideCheck } from "@lucide/angular";
import { cn } from "../cn";
import { optionClasses } from "../popup";

/**
 * A Combobox option row, with a check at its end while it's selected. Its `label` is the text
 * the input shows once it's chosen; without one, Origami falls back to the row's text.
 */
@Component({
  selector: "[fold__ComboboxOption]",
  imports: [LucideCheck],
  hostDirectives: [
    { directive: OrigamiComboboxOption, inputs: ["value", "label", "disabled", "id"] },
  ],
  host: { "data-slot": "combobox-option", "[class]": "classes()" },
  template: `
    <span data-slot="combobox-option-text" class="min-w-0 flex-1 truncate"><ng-content /></span>
    <svg lucideCheck aria-hidden="true" data-slot="combobox-option-indicator"></svg>
  `,
})
export class ComboboxOption {
  readonly class = input("");

  protected readonly classes = computed(() => cn(optionClasses, this.class()));
}
