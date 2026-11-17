import { Component, computed, input } from "@angular/core";
import { OrigamiSelectOption } from "@loozo/origami-ui/select";
import { LucideCheck } from "@lucide/angular";
import { cn } from "../cn";
import { optionClasses } from "../popup";

/**
 * A Select option row, with a check at its end while it's selected. Its `label` is what the
 * Trigger and typeahead read; without one, Origami falls back to the row's text.
 */
@Component({
  selector: "[fold__SelectOption]",
  imports: [LucideCheck],
  hostDirectives: [
    { directive: OrigamiSelectOption, inputs: ["value", "label", "disabled", "id"] },
  ],
  host: { "data-slot": "select-option", "[class]": "classes()" },
  template: `
    <span data-slot="select-option-text" class="min-w-0 flex-1 truncate"><ng-content /></span>
    <svg lucideCheck aria-hidden="true" data-slot="select-option-indicator"></svg>
  `,
})
export class SelectOption {
  readonly class = input("");

  protected readonly classes = computed(() => cn(optionClasses, this.class()));
}
