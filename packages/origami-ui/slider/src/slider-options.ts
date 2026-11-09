import { forwardRef } from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";

/** Effective Slider configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiSliderOptions {
  /**
   * Writable value; the direct directive model defaults to 0. Only a user's key or pointer input
   * writes it, with an allowed value. An external value is never normalized or written back: an
   * off-grid one is kept as it is, and one outside `[min, max]` or not finite only renders
   * clamped (a non-finite one as `min`).
   */
  abstract readonly value: WritableSignal<number>;
  /** The lowest value; `undefined`, the direct directive's default, means 0. */
  abstract readonly min: Signal<number | undefined>;
  /**
   * The highest value; `undefined`, the direct directive's default, means 100. The last allowed
   * value is `max` only when it lies on the grid of `min + k·step`; otherwise it is the grid
   * value below it.
   */
  abstract readonly max: Signal<number | undefined>;
  /**
   * The distance between allowed values, counted from `min`; direct default 1. Values are
   * rounded to the decimal places of `step` and `min`. A non-finite or nonpositive step, a
   * non-finite bound or `min ≥ max` is an invalid configuration: it isn't validated, the slider
   * renders at 0% and every user write is dropped.
   */
  abstract readonly step: Signal<number>;
  /**
   * Blocks key and pointer input and removes the Thumb's tab stop; default false. External
   * writes remain authoritative.
   */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces Slider Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiSliderOptions> | AbstractType<OrigamiSliderOptions>,
  ): Provider {
    return { provide: OrigamiSliderOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Slider Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value, min, max, step and
   *   disabled.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiSliderOptions): Provider {
    return { provide: OrigamiSliderOptions, useFactory: factory };
  }
}
