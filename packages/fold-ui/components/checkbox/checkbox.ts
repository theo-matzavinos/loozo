import { Component, computed, input } from "@angular/core";
import { LucideCheck } from "@lucide/angular";
import { OrigamiCheckbox } from "@loozo/origami-ui/checkbox";
import { cn } from "../cn";

/**
 * A 16px checkbox over Origami's Checkbox. It's the box only and projects no content, so name it
 * with a Field `<label>` or with `aria-label`.
 *
 * @example
 * ```html
 * <div fold__Field orientation="horizontal">
 *   <button fold__Checkbox [formField]="form.includeVat"></button>
 *   <label fold__FieldLabel>Include VAT</label>
 * </div>
 *
 * <button fold__Checkbox aria-label="Select LC-2041" [(checked)]="selected"></button>
 * ```
 */
@Component({
  selector: "button[fold__Checkbox]",
  imports: [LucideCheck],
  hostDirectives: [
    {
      directive: OrigamiCheckbox,
      inputs: ["checked", "disabled", "focusableWhenDisabled", "id"],
      outputs: ["checkedChange", "touch"],
    },
  ],
  host: { "data-slot": "checkbox", "[class]": "classes()" },
  template: `<svg lucideCheck aria-hidden="true" data-slot="checkbox-indicator"></svg>`,
})
export class Checkbox {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "group/checkbox inline-grid size-4 shrink-0 cursor-pointer place-items-center rounded-checkbox border border-input bg-surface text-background",
      "[&>svg]:size-3 [&>svg]:opacity-0 data-checked:[&>svg]:opacity-100",
      "transition-[background-color,border-color] duration-120 ease-out [&>svg]:transition-opacity [&>svg]:duration-120 [&>svg]:ease-out",
      "motion-reduce:transition-none motion-reduce:duration-0 motion-reduce:[&>svg]:transition-none motion-reduce:[&>svg]:duration-0",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      // Aria variants sort before data ones, so the checked border yields to the invalid one here.
      "data-checked:bg-foreground not-aria-invalid:data-checked:border-foreground",
      "aria-invalid:border-destructive-text",
      "aria-readonly:cursor-default aria-readonly:border-dashed aria-readonly:bg-transparent",
      "data-disabled:cursor-not-allowed data-disabled:opacity-50",
      this.class(),
    ),
  );
}
