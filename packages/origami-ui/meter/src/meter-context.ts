import { LOCALE_ID, Service, computed, inject } from "@angular/core";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { OrigamiMeterOptions } from "./meter-options";

/**
 * @internal The Meter root's private owner: the effective bounds, the rendered value clamped to
 * them, its percent and the effective value text, all computed from the effective Options and the
 * root's `LOCALE_ID`. It reads no layout, DOM or registration.
 */
@Service({ autoProvided: false })
export class MeterContext {
  readonly #options = injectDeferred(OrigamiMeterOptions);
  readonly #locale = inject(LOCALE_ID);
  #formatter: Intl.NumberFormat | null = null;

  /** Options `min` when it is finite, else 0. */
  readonly min = computed(() => {
    const min = this.#options().min();

    if (!Number.isFinite(min)) {
      return 0;
    }

    return min;
  });
  /** Options `max` when it is finite, else 100, raised to the effective min when below it. */
  readonly max = computed(() => {
    const min = this.min();
    let max = this.#options().max();

    if (!Number.isFinite(max)) {
      max = 100;
    }

    return Math.max(min, max);
  });
  /** The value clamped to `[min, max]`; min when it isn't finite. */
  readonly value = computed(() => {
    const min = this.min();
    const max = this.max();
    const value = this.#options().value();

    if (!Number.isFinite(value)) {
      return min;
    }

    return Math.min(max, Math.max(min, value));
  });
  /** The value's position in the range, 0 to 100, unrounded; 0 in an empty range. */
  readonly percent = computed(() => {
    const min = this.min();
    const max = this.max();

    if (max === min) {
      return 0;
    }

    return ((this.value() - min) / (max - min)) * 100;
  });
  /** The consumer's value text, else the localized percent. */
  readonly valueText = computed(() => {
    const text = this.#options().valueText();

    if (text !== null) {
      return text;
    }

    this.#formatter ??= new Intl.NumberFormat(this.#locale, { style: "percent" });

    return this.#formatter.format(this.percent() / 100);
  });
}
