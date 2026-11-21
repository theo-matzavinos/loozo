import { forwardRef } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";

/** Effective Meter configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiMeterOptions {
  /**
   * The measurement, required on the directive: a meter has no unknown state, so render your own
   * "no data" UI instead of a meter while there's no value. It renders clamped to the effective
   * `[min, max]`; a value that isn't finite (`NaN`, ±∞, or `null` from untyped code) renders as
   * the effective `min`, like native `<meter>`. It is never written back.
   */
  abstract readonly value: Signal<number>;
  /**
   * The lower bound; direct default 0. A `min` that isn't finite renders as 0.
   */
  abstract readonly min: Signal<number>;
  /**
   * The upper bound; direct default 100. A `max` that isn't finite renders as 100, and a `max`
   * below the effective `min` is raised to it, as native `<meter>` does: the range is then empty,
   * every value renders as `min` at 0%, and a computed range of nothing needs the consumer's own
   * "nothing to measure" state.
   */
  abstract readonly max: Signal<number>;
  /**
   * The `aria-valuetext`; null by default on the directive, which means the localized percent of
   * the rendered value's position under the root's `LOCALE_ID`. A string, the empty string
   * included, is bound as given; the consumer owns its translation.
   */
  abstract readonly valueText: Signal<string | null>;

  /**
   * Replaces Meter Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiMeterOptions> | AbstractType<OrigamiMeterOptions>,
  ): Provider {
    return { provide: OrigamiMeterOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Meter Options with a structurally compatible result, without merging unused
   * directive defaults.
   * @param factory - Executes in Angular injection context; supply `value`, `min`, `max` and
   *   `valueText`. Its signals are first read by whichever comes first, a State read or the root's
   *   host bindings, which run in the first change detection at the latest, so they must hold their
   *   values by then.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiMeterOptions): Provider {
    return { provide: OrigamiMeterOptions, useFactory: factory };
  }
}
