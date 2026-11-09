import { Service, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import { SliderContext } from "./slider-context";

/** Locally provided readonly facade for the nearest Slider root; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiSliderState {
  readonly #context = inject(SliderContext);

  /**
   * Effective value, as it is: an off-grid, out-of-range or non-finite value is never normalized.
   * No writable alias is exposed.
   */
  readonly value: Signal<number> = this.#context.value;
  /**
   * The value's position in the range, 0 to 100: the value clamped to `[min, max]`, a non-finite
   * one at `min`, and 0 under an invalid configuration. The root also binds it as the
   * `--og-slider-percent` custom property; it needs no layout, so server HTML carries it.
   */
  readonly percent: Signal<number> = this.#context.percent;
  /** Effective disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
  /**
   * Whether a pointer drag is live: from a primary press on the Track until its pointer is
   * released, canceled or loses capture, or a part is destroyed, and false while the slider is
   * disabled or readonly; the drag itself ends at the next event of its pointer or change
   * detection after that. Always false on the server and for a press replayed before hydration.
   */
  readonly dragging: Signal<boolean> = this.#context.dragging;
}
