import { LOCALE_ID, Service, computed, inject } from "@angular/core";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { OrigamiProgressOptions } from "./progress-options";

/**
 * @internal The Progress root's private owner: the effective max, the rendered value clamped to
 * `[0, max]`, its percent, completion and the effective value text, all computed from the
 * effective Options and the root's `LOCALE_ID`. It reads no layout, DOM or registration.
 */
@Service({ autoProvided: false })
export class ProgressContext {
  readonly #options = injectDeferred(OrigamiProgressOptions);
  readonly #locale = inject(LOCALE_ID);
  #formatter: Intl.NumberFormat | null = null;

  /** Options `max` when it is finite and positive, else null: there's no range. */
  readonly max = computed(() => {
    const max = this.#options().max();

    if (!Number.isFinite(max) || max <= 0) {
      return null;
    }

    return max;
  });
  /** The value clamped to `[0, max]`; null while indeterminate. */
  readonly value = computed(() => {
    const max = this.max();
    const value = this.#options().value();

    if (max === null || value === null || !Number.isFinite(value)) {
      return null;
    }

    return Math.min(max, Math.max(0, value));
  });
  /** The value's position, 0 to 100; null while indeterminate. */
  readonly percent = computed(() => {
    const value = this.value();
    const max = this.max();

    if (value === null || max === null) {
      return null;
    }

    return (value / max) * 100;
  });
  /** Whether the rendered value equals max. */
  readonly complete = computed(() => {
    const value = this.value();

    return value !== null && value === this.max();
  });
  /** The consumer's value text, else the localized percent while determinate, else null. */
  readonly valueText = computed(() => {
    const text = this.#options().valueText();

    if (text !== null) {
      return text;
    }

    const value = this.value();
    const max = this.max();

    if (value === null || max === null) {
      return null;
    }

    this.#formatter ??= new Intl.NumberFormat(this.#locale, { style: "percent" });

    return this.#formatter.format(value / max);
  });
}
