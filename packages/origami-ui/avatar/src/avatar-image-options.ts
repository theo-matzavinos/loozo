import { forwardRef } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";

/**
 * Effective `ogAvatarImage` configuration, replaced as a whole rather than merged with unused
 * defaults.
 */
export abstract class OrigamiAvatarImageOptions {
  /**
   * Effective image URL or data URI; null or `""` means no image: status `"idle"`, no `src`
   * attribute and no request. The direct directive input defaults to null. Each change of its
   * value discards what was observed for the previous one, so the render that writes a new source
   * reads `"loading"`.
   */
  abstract readonly src: Signal<string | null>;

  /**
   * Replaces Avatar Image Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiAvatarImageOptions> | AbstractType<OrigamiAvatarImageOptions>,
  ): Provider {
    return { provide: OrigamiAvatarImageOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the entire Avatar Image Options configuration without merging unused directive
   * defaults.
   * @param factory - Injection-context factory supplying `src`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiAvatarImageOptions): Provider {
    return { provide: OrigamiAvatarImageOptions, useFactory: factory };
  }
}
