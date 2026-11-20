import { Directive, computed, inject } from "@angular/core";
import { AvatarContext } from "./avatar-context";

/**
 * What an Avatar shows while it has no loaded image: initials, an icon or a name, as the
 * consumer's own content. It stays in the DOM: Origami gives it `hidden` once the root's status is
 * `"loaded"` and removes it otherwise, so its server node is kept through hydration. It shows
 * under a loading image, which paints over it once it has pixels, and in server HTML. A display
 * rule of the consumer's outranks `[hidden]`'s; scope it with `:not([hidden])`. It has no inputs
 * and no `state`: read the root's. Requires a nearest Avatar root.
 *
 * Naming: it is exposed while the image isn't loaded, so give it the person's name when the image's
 * `alt` names them, or `aria-hidden="true"` when the avatar is decorative or the root is named.
 *
 * @example
 * ```html
 * <span ogAvatar class="avatar">
 *   <span ogAvatarFallback aria-hidden="true">{{ initials(user.name) }}</span>
 *   <img ogAvatarImage [src]="user.photoUrl" alt="" />
 * </span>
 * ```
 */
@Directive({
  selector: "[ogAvatarFallback]",
  host: { "[attr.hidden]": "hiddenAttribute()" },
})
export class OrigamiAvatarFallback {
  readonly #context = inject(AvatarContext);

  /** @internal `hidden` once the image has loaded. */
  protected readonly hiddenAttribute = computed(() => {
    if (this.#context.status() === "loaded") {
      return "";
    }

    return null;
  });
}
