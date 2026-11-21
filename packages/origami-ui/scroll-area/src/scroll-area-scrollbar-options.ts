import { forwardRef } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import type { OrigamiScrollAreaOrientation } from "./scroll-area-orientation";

/**
 * Effective `ogScrollAreaScrollbar` configuration, replaced as a whole rather than merged with
 * unused defaults.
 */
export abstract class OrigamiScrollAreaScrollbarOptions {
  /**
   * The axis this Scrollbar draws; direct default `"vertical"`. It is read when the Scrollbar
   * registers, so it decides which of the root's two Scrollbar slots it takes, and in render for
   * `data-orientation`. Changing it on a mounted Scrollbar isn't supported: remount it instead.
   */
  abstract readonly orientation: Signal<OrigamiScrollAreaOrientation>;

  /**
   * Replaces ScrollArea Scrollbar Options with an existing compatible concrete or abstract
   * provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiScrollAreaScrollbarOptions>
      | AbstractType<OrigamiScrollAreaScrollbarOptions>,
  ): Provider {
    return { provide: OrigamiScrollAreaScrollbarOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all ScrollArea Scrollbar Options with a structurally compatible result, without
   * merging unused directive defaults.
   * @param factory - Executes in Angular injection context; supply `orientation`. It is first read
   *   when the Scrollbar registers, in `ngOnInit`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiScrollAreaScrollbarOptions): Provider {
    return { provide: OrigamiScrollAreaScrollbarOptions, useFactory: factory };
  }
}
