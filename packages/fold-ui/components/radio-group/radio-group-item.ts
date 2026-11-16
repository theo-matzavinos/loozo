import { Component, computed, input } from "@angular/core";
import { OrigamiRadioGroupItem } from "@loozo/origami-ui/radio-group";
import { cn } from "../cn";

/**
 * A whole-row radio: a 16px dot plus its projected text, which names it. It follows its nearest
 * RadioGroup's invalid and readonly looks.
 */
@Component({
  selector: "button[fold__RadioGroupItem]",
  hostDirectives: [
    { directive: OrigamiRadioGroupItem, inputs: ["value", "disabled", "focusableWhenDisabled"] },
  ],
  host: { "data-slot": "radio-group-item", "[class]": "classes()" },
  template: `
    <span
      data-slot="radio-group-indicator"
      aria-hidden="true"
      class="inline-grid size-4 shrink-0 place-items-center rounded-full border border-(--radio-invalid,var(--input)) [border-style:var(--radio-readonly-border,solid)] bg-(--radio-readonly-ground,var(--surface)) group-data-checked/radio-group-item:border-(--radio-invalid,var(--foreground)) group-focus-visible/radio-group-item:outline-2 group-focus-visible/radio-group-item:outline-offset-2 group-focus-visible/radio-group-item:outline-ring transition-[border-color] duration-120 ease-out motion-reduce:transition-none motion-reduce:duration-0"
    >
      <span
        class="size-2 rounded-full bg-foreground opacity-0 group-data-checked/radio-group-item:opacity-100 transition-opacity duration-120 ease-out motion-reduce:transition-none motion-reduce:duration-0"
      ></span>
    </span>
    <span><ng-content /></span>
  `,
})
export class RadioGroupItem {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "group/radio-group-item inline-flex min-h-6 items-center gap-2 text-body text-foreground text-start cursor-(--radio-readonly-cursor,pointer) outline-none",
      "data-disabled:cursor-not-allowed data-disabled:opacity-50",
      this.class(),
    ),
  );
}
