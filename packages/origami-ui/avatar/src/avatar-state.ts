import { Service, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import { AvatarContext } from "./avatar-context";
import type { OrigamiAvatarStatus } from "./avatar-status";

/**
 * Locally provided readonly facade for the nearest Avatar root; nested roots have independent
 * owners. Read it through the root's template reference (`#avatar="ogAvatar"`, then
 * `avatar.state.status()`) or inject it in a descendant or a composing directive.
 */
@Service({ autoProvided: false })
export class OrigamiAvatarState {
  readonly #context = inject(AvatarContext);

  /**
   * The effective image status: `"idle"` or `"loading"` on the server and in the first hydrating
   * render, then what the browser reports for the Image's current source once its Image has
   * rendered in the browser. Every change of the source reads `"loading"` (or `"idle"`) in the
   * render that writes it. There is no event: react to changes with an `effect()`. A source that
   * comes back while the browser still holds it reads `"loading"`, then `"loaded"` within the same
   * tick, so an `effect()` or a MutationObserver sees both.
   */
  readonly status: Signal<OrigamiAvatarStatus> = this.#context.status;
}
