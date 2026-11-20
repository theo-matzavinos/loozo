import { forwardRef } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";

/** Effective Progress configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiProgressOptions {
  /**
   * The amount done, from 0 to `max`; null by default on the directive, which means unknown
   * progress: the bar is indeterminate. A non-finite value is indeterminate too. A finite value
   * renders clamped to `[0, max]`; it is never written back.
   */
  abstract readonly value: Signal<number | null>;
  /**
   * The amount that completes the task; the minimum is always 0. Direct default 100. A `max`
   * that isn't finite or is 0 or less has no range to place a value in: the bar is
   * indeterminate and has no `aria-valuemax`, so a computed total of 0 needs the consumer's
   * own "nothing to do" state.
   */
  abstract readonly max: Signal<number>;
  /**
   * The `aria-valuetext`; null by default on the directive, which means the localized percent of
   * the rendered value under the root's `LOCALE_ID` while the bar is determinate, and none while
   * it's indeterminate. A string, the empty string included, is bound as given, also while
   * indeterminate ("Loading…"); the consumer owns its translation.
   */
  abstract readonly valueText: Signal<string | null>;

  /**
   * Replaces Progress Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiProgressOptions> | AbstractType<OrigamiProgressOptions>,
  ): Provider {
    return { provide: OrigamiProgressOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Progress Options with a structurally compatible result, without merging unused
   * directive defaults.
   * @param factory - Executes in Angular injection context; supply `value`, `max` and
   *   `valueText`. Its signals are first read in the root's first host-binding pass, so they must
   *   hold their values by then.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiProgressOptions): Provider {
    return { provide: OrigamiProgressOptions, useFactory: factory };
  }
}
