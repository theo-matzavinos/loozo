import { Directive, computed, input } from "@angular/core";
import { buttonVariants, type ButtonSize, type ButtonVariant } from "../button";

/**
 * Toolbar buttons register to the 28/32/36px line heights; Button's `link` has no height, so
 * toolbar controls don't offer it.
 */
export type ToolbarButtonVariant = Exclude<ButtonVariant, "link">;

/** The Toolbar's button look: Button's variants and sizes, ghost by default. Selectorless. */
@Directive({ host: { "[class]": "classes()" } })
export class ToolbarButtonStyle {
  readonly variant = input<ToolbarButtonVariant>("ghost");
  readonly size = input<ButtonSize>("md");
  readonly class = input("");
  protected readonly classes = computed(() =>
    buttonVariants({ variant: this.variant(), size: this.size(), class: this.class() }),
  );
}
