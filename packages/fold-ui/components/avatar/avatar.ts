import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiAvatar } from "@loozo/origami-ui/avatar";
import { cn, tv } from "../cn";

const avatarVariants = tv({
  base: [
    "grid shrink-0 overflow-hidden select-none bg-muted font-semibold text-muted-foreground",
    // A 1px inset ring as the border, drawn by an ::after in the same grid cell: it comes after the
    // image, so it paints over a loaded photo's edge too, and takes no pointer events.
    "after:pointer-events-none after:col-start-1 after:row-start-1 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_var(--color-border)]",
    // Opted out of forced colors so the ring and fill don't vanish; every color is then a system color.
    "forced-color-adjust-none forced-colors:border forced-colors:border-[CanvasText] forced-colors:bg-[Canvas] forced-colors:text-[CanvasText]",
  ],
  variants: {
    shape: { circle: "rounded-full", square: "" },
    size: { sm: "size-6 text-label", md: "size-8 text-label", lg: "size-10 text-body" },
  },
  // A square's radius steps down with its size, so a small tile doesn't read as round.
  compoundVariants: [
    { shape: "square", size: "sm", class: "rounded-option" },
    { shape: "square", size: "md", class: "rounded-control-sm" },
    { shape: "square", size: "lg", class: "rounded-control" },
  ],
  defaultVariants: { shape: "circle", size: "md" },
});

/**
 * An image of a person or an entity over Origami's Avatar, with initials or an icon that shows
 * until the image has loaded: a 24, 32 or 40px circle, or a rounded square for entities. Write the
 * AvatarFallback first and the AvatarImage after it, so the image paints over the fallback. Name it
 * yourself: `alt` and fallback text, `role="img"` and `aria-label` on the root, or a named control
 * around it.
 *
 * @example
 * ```html
 * <span fold__Avatar role="img" [attr.aria-label]="user().name">
 *   <span fold__AvatarFallback aria-hidden="true">{{ initials(user().name) }}</span>
 *   <img fold__AvatarImage [src]="user().photoUrl" alt="" />
 * </span>
 * ```
 */
@Directive({
  selector: "[fold__Avatar]",
  exportAs: "fold__Avatar",
  hostDirectives: [OrigamiAvatar],
  host: { "data-slot": "avatar", "[class]": "classes()" },
})
export class Avatar {
  readonly shape = input<"circle" | "square">("circle");
  readonly size = input<"sm" | "md" | "lg">("md");
  readonly class = input("");

  /** Origami's readonly observation: `status`. */
  readonly state = inject(OrigamiAvatar).state;

  protected readonly classes = computed(() =>
    cn(avatarVariants({ shape: this.shape(), size: this.size() }), this.class()),
  );
}
