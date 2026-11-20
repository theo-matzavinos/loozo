import { Service, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import { ProgressContext } from "./progress-context";

/**
 * Locally provided readonly facade for the nearest Progress root; nested roots have independent
 * owners. It reports the rendered facts, not the raw Options; the consumer already holds those.
 */
@Service({ autoProvided: false })
export class OrigamiProgressState {
  readonly #context = inject(ProgressContext);

  /**
   * The rendered value: Options `value` clamped to `[0, max]`; null while the bar is
   * indeterminate (no value, a non-finite one, or no valid `max`). No writable alias is exposed.
   */
  readonly value: Signal<number | null> = this.#context.value;
  /**
   * The rendered value's position, 0 to 100, unrounded; null while indeterminate. The root also
   * binds it as the `--og-progress-percent` custom property; it needs no layout, so server HTML
   * carries it.
   */
  readonly percent: Signal<number | null> = this.#context.percent;
  /** Whether the rendered value equals `max`; false while indeterminate. */
  readonly complete: Signal<boolean> = this.#context.complete;
  /**
   * The effective `aria-valuetext`: the consumer's `valueText`, else the localized default
   * percent; null while indeterminate without one. Render it visibly in an `aria-hidden`
   * element, so assistive technology doesn't read it twice.
   */
  readonly valueText: Signal<string | null> = this.#context.valueText;
}
