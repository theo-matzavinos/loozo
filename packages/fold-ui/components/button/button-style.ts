import { Directive, computed, input } from "@angular/core";
import type { VariantProps } from "tailwind-variants";
import { tv } from "../cn";

export const buttonVariants = tv({
  base: [
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-control border border-transparent text-body font-semibold",
    "transition-[background-color,box-shadow,translate] duration-120 ease-out motion-reduce:transition-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "not-data-disabled:active:translate-y-px not-data-disabled:active:shadow-pressed",
    "data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:shadow-none",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  variants: {
    variant: {
      primary:
        "bg-primary text-primary-foreground shadow-edge not-data-disabled:hover:bg-primary-hover not-data-disabled:active:bg-primary-pressed",
      secondary:
        "border-input bg-muted text-foreground shadow-edge not-data-disabled:hover:bg-muted-hover not-data-disabled:active:bg-muted-pressed",
      destructive:
        "bg-destructive text-primary-foreground shadow-edge not-data-disabled:hover:bg-destructive-hover not-data-disabled:active:bg-destructive-pressed",
      ghost:
        "bg-transparent text-foreground not-data-disabled:hover:bg-foreground/8 not-data-disabled:active:bg-foreground/14",
      link: "bg-transparent text-foreground underline decoration-1 underline-offset-3 not-data-disabled:hover:decoration-2 not-data-disabled:active:translate-y-0 not-data-disabled:active:shadow-none",
    },
    size: {
      sm: "h-7 rounded-control-sm px-2.5 text-label",
      md: "h-8 px-3",
      lg: "h-9 px-4 text-title font-semibold",
      icon: "size-8 px-0",
    },
  },
  // Sizes come after variants, so the link's own height and padding have to win from here.
  compoundVariants: [{ variant: "link", class: "h-auto px-0.5" }],
  defaultVariants: { variant: "secondary", size: "md" },
});

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

/**
 * The button look: `variant`, `size` and your `class`, merged so your conflicting utilities win.
 * Selectorless; every fold button part composes it.
 */
@Directive({
  host: { "[class]": "classes()" },
})
export class ButtonStyle {
  readonly variant = input<ButtonVariant>("secondary");
  readonly size = input<ButtonSize>("md");
  readonly class = input("");

  protected readonly classes = computed(() =>
    buttonVariants({ variant: this.variant(), size: this.size(), class: this.class() }),
  );
}
