import { DestroyRef, Service, computed, linkedSignal, signal, untracked } from "@angular/core";
import type { Signal, WritableSignal } from "@angular/core";
import type { OrigamiAvatarStatus } from "./avatar-status";

/** What the browser reported for an Image's current source, or null while nothing is observed. */
export type AvatarObservation = "loaded" | "error" | null;

/** The mounted Image, created by `AvatarContext.register` from its `ngOnInit`. */
export interface AvatarImageRegistration {
  /** The Image's effective source: a URL or data URI, or null for none. */
  readonly src: Signal<string | null>;
  /**
   * What the Image observed for `src`: a `linkedSignal` over it, so every change of `src` resets
   * it to null. Only the Image's browser reconcile writes it.
   */
  readonly observed: WritableSignal<AvatarObservation>;
}

/**
 * @internal An Avatar root's private behavior: its one mounted Image and the status derived from
 * it. Provided by each root.
 */
@Service({ autoProvided: false })
export class AvatarContext {
  readonly #image = signal<AvatarImageRegistration | null>(null);

  /**
   * The effective status. `"idle"` without an Image or a source, `"loading"` until the Image has
   * observed its current source, then what it observed. Read in render, on the server too, where
   * nothing is ever observed.
   */
  readonly status = computed<OrigamiAvatarStatus>(() => {
    const image = this.#image();

    if (image === null || image.src() === null) {
      return "idle";
    }

    const observed = image.observed();

    if (observed === null) {
      return "loading";
    }

    return observed;
  });

  /**
   * Registers the Image from its `ngOnInit` and returns its registration. An Image whose view is
   * already destroyed gets a registration that isn't mounted; a second mounted Image fails. The
   * registration is removed when the Image is destroyed, only if it's still the mounted one.
   */
  register(src: Signal<string | null>, destroyRef: DestroyRef): AvatarImageRegistration {
    const registration: AvatarImageRegistration = {
      src,
      observed: linkedSignal<string | null, AvatarObservation>({
        source: src,
        computation: () => null,
      }),
    };

    if (destroyRef.destroyed) {
      return registration;
    }

    if (untracked(this.#image) !== null) {
      throw new Error("Avatar supports only one mounted Image.");
    }

    this.#image.set(registration);
    destroyRef.onDestroy(() => {
      if (untracked(this.#image) === registration) {
        this.#image.set(null);
      }
    });

    return registration;
  }
}
