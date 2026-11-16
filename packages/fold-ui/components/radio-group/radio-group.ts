import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiRadioGroup } from "@loozo/origami-ui/radio-group";
import { cn } from "../cn";

/**
 * A column of radio items over Origami's RadioGroup. Its invalid and readonly looks reach only its
 * own items: it sets them as custom properties that every group resets, so a nested group keeps
 * its own.
 *
 * @example
 * ```html
 * <div fold__Field #cycle="fold__Field">
 *   <span fold__FieldLabel>Billing cycle</span>
 *   <div fold__RadioGroup [formField]="form.cycle">
 *     <button fold__RadioGroupItem value="monthly">Monthly</button>
 *     <button fold__RadioGroupItem value="yearly">Yearly</button>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[fold__RadioGroup]",
  hostDirectives: [
    {
      directive: OrigamiRadioGroup,
      inputs: ["value", "disabled"],
      outputs: ["valueChange", "touch"],
    },
  ],
  host: { "data-slot": "radio-group", "[class]": "classes()" },
})
export class RadioGroup {
  readonly class = input("");

  readonly #group = inject(OrigamiRadioGroup);

  /** Signal Forms' `focusBoundControl()` calls this; it focuses the item holding the tab stop. */
  focus(options?: FocusOptions): void {
    this.#group.focus(options);
  }

  protected readonly classes = computed(() =>
    cn(
      "flex flex-col items-start gap-2",
      "[--radio-invalid:initial] [--radio-readonly-border:initial] [--radio-readonly-ground:initial] [--radio-readonly-cursor:initial]",
      "aria-invalid:[--radio-invalid:var(--destructive-text)]",
      "aria-readonly:[--radio-readonly-border:dashed] aria-readonly:[--radio-readonly-ground:transparent] aria-readonly:[--radio-readonly-cursor:default]",
      this.class(),
    ),
  );
}
