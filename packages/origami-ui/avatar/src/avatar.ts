import { Directive, inject } from "@angular/core";
import { AvatarContext } from "./avatar-context";
import { OrigamiAvatarState } from "./avatar-state";

/**
 * Avatar root: an image of a person or entity with a fallback shown while there's no loaded
 * image. It is an HTML element, usually a `<span>`, holding an `img[ogAvatarImage]` and an
 * `[ogAvatarFallback]`, stacked by the consumer's CSS with the image painted over the fallback.
 * Origami owns the image status and hides whichever part shouldn't show; the consumer owns the
 * markup, stacking, size, shape, `alt`, the fallback's content (initials, an icon inside it) and
 * any fallback delay.
 *
 * Host semantics: `data-status` with the effective {@link OrigamiAvatarStatus}, also in server
 * HTML, where it is `"idle"` or `"loading"`. It has no inputs, no Options token and no role: a
 * named avatar gets `role="img"` and `aria-label` from the consumer, with decorative parts.
 *
 * Server rendering and hydration: the server renders the image with its `src`, so the browser
 * loads and paints it natively before hydration, and the Fallback underneath it. An image already
 * painted stays painted through hydration, eager or incremental; whether a cached or data-URI
 * image is painted at the first paint is the browser's decode timing. Keep an Avatar's parts in
 * one hydrate boundary.
 *
 * @example
 * ```html
 * <span ogAvatar #avatar="ogAvatar" class="avatar">
 *   <span ogAvatarFallback aria-hidden="true">TM</span>
 *   <img ogAvatarImage [src]="user.photoUrl" alt="" />
 * </span>
 * ```
 */
@Directive({
  selector: "[ogAvatar]",
  exportAs: "ogAvatar",
  providers: [AvatarContext, OrigamiAvatarState],
  host: { "[attr.data-status]": "status()" },
})
export class OrigamiAvatar {
  /** This root's readonly image status, shared with its descendants. */
  readonly state = inject(OrigamiAvatarState);

  /** @internal The root's `data-status`. */
  protected readonly status = this.state.status;
}
