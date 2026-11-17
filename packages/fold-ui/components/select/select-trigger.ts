import { Component, computed, input } from "@angular/core";
import { OrigamiSelectTrigger } from "@loozo/origami-ui/select";
import { LucideChevronDown } from "@lucide/angular";
import { cn } from "../cn";

/**
 * The button that shows a Select's choice: Input's box with a soft edge and a trailing chevron.
 * It's the Field's control, labelled by the Field's label; standalone, give it an `aria-label`.
 * Its projected text truncates; the placeholder look follows Origami's `data-placeholder`.
 */
@Component({
  selector: "button[fold__SelectTrigger]",
  imports: [LucideChevronDown],
  hostDirectives: [
    { directive: OrigamiSelectTrigger, inputs: ["id", "disabled", "focusableWhenDisabled"] },
  ],
  host: { "data-slot": "select-trigger", "[class]": "classes()" },
  template: `
    <span data-slot="select-value" class="min-w-0 flex-1 truncate"><ng-content /></span>
    <svg lucideChevronDown aria-hidden="true" data-slot="select-icon"></svg>
  `,
})
export class SelectTrigger {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "flex h-8 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-control border border-input bg-surface px-2.5 text-start text-body text-foreground shadow-edge",
      "transition-[border-color] duration-120 ease-out motion-reduce:transition-none motion-reduce:duration-0",
      "hover:border-[color-mix(in_oklab,var(--input),var(--foreground)_35%)]",
      // No base outline-none, so the ring's outline-style stays solid.
      "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      "aria-invalid:border-destructive-text",
      "data-placeholder:text-muted-foreground",
      "aria-readonly:cursor-default aria-readonly:border-dashed aria-readonly:bg-transparent aria-readonly:shadow-none",
      "data-disabled:cursor-not-allowed data-disabled:border-input data-disabled:opacity-50 data-disabled:shadow-none",
      "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground",
      this.class(),
    ),
  );
}
