import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiFileFieldState } from "@loozo/origami-ui/file-field";
import { buttonVariants, type ButtonSize, type ButtonVariant } from "../button";
import { cn } from "../cn";

/**
 * The button look of a FileField: a `<label>` around the FileFieldInput, styled as a fold Button
 * of its `variant` and `size`, so a click opens the picker natively. It rings while the Input has
 * keyboard focus, turns its border orange while the Field shows errors and dims while disabled.
 * It doesn't take drops; use a FileFieldDropZone for that.
 */
@Directive({
  selector: "label[fold__FileFieldButton]",
  host: {
    "data-slot": "file-field-button",
    "[attr.data-disabled]": "state.disabled() ? '' : null",
    "[class]": "classes()",
  },
})
export class FileFieldButton {
  readonly variant = input<ButtonVariant>("secondary");
  readonly size = input<ButtonSize>("md");
  readonly class = input("");

  protected readonly state = inject(OrigamiFileFieldState);

  protected readonly classes = computed(() =>
    buttonVariants({
      variant: this.variant(),
      size: this.size(),
      class: cn(
        // relative contains the sr-only Input.
        "relative has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring",
        "has-[input[aria-invalid=true]]:border-destructive-text",
        this.class(),
      ),
    }),
  );
}
