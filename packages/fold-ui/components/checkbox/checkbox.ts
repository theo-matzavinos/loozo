import { Component, computed, input } from "@angular/core";
import { LucideCheck, LucideMinus } from "@lucide/angular";
import { OrigamiCheckbox } from "@loozo/origami-ui/checkbox";
import { cn } from "../cn";

/**
 * A 16px checkbox over Origami's Checkbox. It's the box only and projects no content, so name it
 * with a Field `<label>` or with `aria-label`. Mixed, for a select-all parent whose children are
 * partly selected, it shows a minus instead of the check.
 *
 * @example
 * ```html
 * <div fold__Field orientation="horizontal">
 *   <button fold__Checkbox [formField]="form.includeVat"></button>
 *   <label fold__FieldLabel>Include VAT</label>
 * </div>
 *
 * <button fold__Checkbox aria-label="Select LC-2041" [(checked)]="selected"></button>
 *
 * <button
 *   fold__Checkbox
 *   aria-label="Select all invoices"
 *   [checked]="all()"
 *   [mixed]="some()"
 *   (checkedChange)="selectAll($event)"
 * ></button>
 * ```
 */
@Component({
  selector: "button[fold__Checkbox]",
  imports: [LucideCheck, LucideMinus],
  hostDirectives: [
    {
      directive: OrigamiCheckbox,
      inputs: ["checked", "mixed", "disabled", "focusableWhenDisabled", "id"],
      outputs: ["checkedChange", "mixedChange", "touch"],
    },
  ],
  host: { "data-slot": "checkbox", "[class]": "classes()" },
  template: `
    <svg lucideCheck aria-hidden="true" data-slot="checkbox-indicator"></svg>
    <svg lucideMinus aria-hidden="true" data-slot="checkbox-mixed-indicator"></svg>
  `,
})
export class Checkbox {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "group/checkbox inline-grid size-4 shrink-0 cursor-pointer place-items-center rounded-checkbox border border-input bg-surface text-background",
      "[&>svg]:col-start-1 [&>svg]:row-start-1 [&>svg]:size-3 [&>svg]:opacity-0",
      "data-checked:[&>[data-slot=checkbox-indicator]]:opacity-100 data-mixed:[&>[data-slot=checkbox-mixed-indicator]]:opacity-100",
      "transition-[background-color,border-color] duration-120 ease-out [&>svg]:transition-opacity [&>svg]:duration-120 [&>svg]:ease-out",
      "motion-reduce:transition-none motion-reduce:duration-0 motion-reduce:[&>svg]:transition-none motion-reduce:[&>svg]:duration-0",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      // Aria variants sort before data ones, so the checked and mixed borders yield to the invalid one.
      "data-checked:bg-foreground not-aria-invalid:data-checked:border-foreground",
      "data-mixed:bg-foreground not-aria-invalid:data-mixed:border-foreground",
      "aria-invalid:border-destructive-text",
      "aria-readonly:cursor-default aria-readonly:border-dashed aria-readonly:bg-transparent",
      "data-disabled:cursor-not-allowed data-disabled:opacity-50",
      this.class(),
    ),
  );
}
