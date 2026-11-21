import { forwardRef } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";

/**
 * Effective ScrollArea root configuration, replaced as a whole rather than merged with unused
 * defaults.
 */
export abstract class OrigamiScrollAreaOptions {
  /**
   * How long the scrollbars stay visible, in ms, after the last of the pointer leaving the root,
   * a drag ending and a scroll; direct default 600. It should be finite and nonnegative; it is
   * passed to the timer as given and read each time a hide is scheduled, so a change applies to
   * the next one.
   */
  abstract readonly hideDelay: Signal<number>;

  /**
   * Replaces ScrollArea Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiScrollAreaOptions> | AbstractType<OrigamiScrollAreaOptions>,
  ): Provider {
    return { provide: OrigamiScrollAreaOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all ScrollArea Options with a structurally compatible result, without merging unused
   * directive defaults.
   * @param factory - Executes in Angular injection context; supply `hideDelay`. It is first read
   *   in the browser, when a hide is scheduled.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiScrollAreaOptions): Provider {
    return { provide: OrigamiScrollAreaOptions, useFactory: factory };
  }
}
