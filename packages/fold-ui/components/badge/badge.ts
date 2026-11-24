import { Directive, computed, input } from "@angular/core";
import { tv } from "../cn";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const badgeVariants = tv({
  base: [
    "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-transparent px-2",
    "text-label whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
    // A 12% tint of the tone over whatever is underneath, and text that's 80% tone and 20%
    // foreground. Both read the theme variables on this element, so a `.light` subtree changes them.
    "bg-(--badge-tone)/12 text-[color-mix(in_oklab,var(--badge-tone)_80%,var(--foreground))]",
    // In forced colors the fill drops and the transparent border takes the system color, so the
    // pill keeps an outline.
  ],
  variants: {
    tone: {
      neutral: "[--badge-tone:var(--muted-foreground)]",
      // A theme copied before --info existed shows the neutral look, still readable.
      info: "[--badge-tone:var(--info,var(--muted-foreground))]",
      success: "[--badge-tone:var(--success)]",
      warning: "[--badge-tone:var(--warning)]",
      danger: "[--badge-tone:var(--destructive-text)]",
    },
  },
  defaultVariants: { tone: "neutral" },
});

/**
 * A status label: a 20px pill in a soft tint of its tone. Its text carries the meaning, so color is
 * never the only cue, and it isn't a live region. Put it on an HTML element, usually a `<span>`.
 *
 * @example
 * ```html
 * <span fold__Badge>Draft</span>
 * <span fold__Badge tone="success">Approved</span>
 * ```
 */
@Directive({
  selector: "[fold__Badge]",
  host: { "data-slot": "badge", "[attr.data-tone]": "tone()", "[class]": "classes()" },
})
export class Badge {
  readonly tone = input<BadgeTone>("neutral");
  readonly class = input("");

  protected readonly classes = computed(() =>
    badgeVariants({ tone: this.tone(), class: this.class() }),
  );
}
