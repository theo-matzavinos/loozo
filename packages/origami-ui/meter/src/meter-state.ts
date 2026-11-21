import { Service, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import { MeterContext } from "./meter-context";

/**
 * Locally provided readonly facade for the nearest Meter root; nested roots have independent
 * owners. It reports the rendered facts, not the raw Options; the consumer already holds those.
 *
 * Inject it anywhere, but evaluate its signals late: in a template or host binding inside or after
 * the root, a composer's template, a lazy `computed`, `ngOnInit` or later. Every signal reads the
 * root's required `value`, which Angular sets on a bound root only when change detection reaches
 * it, so an evaluation in a constructor or field initializer, or in a template binding placed
 * before the root, throws NG0950.
 */
@Service({ autoProvided: false })
export class OrigamiMeterState {
  readonly #context = inject(MeterContext);

  /**
   * The rendered value: Options `value` clamped to the effective `[min, max]`; the effective `min`
   * when it isn't finite. No writable alias is exposed.
   */
  readonly value: Signal<number> = this.#context.value;
  /**
   * The rendered value's position in the effective range, 0 to 100, unrounded; 0 in an empty
   * range. The root also binds it as the `--og-meter-percent` custom property; it needs no
   * layout, so server HTML carries it.
   */
  readonly percent: Signal<number> = this.#context.percent;
  /**
   * The effective `aria-valuetext`: the consumer's `valueText`, else the localized percent. Render
   * it visibly in an `aria-hidden` element, so assistive technology doesn't read it twice, and
   * feed it to a chart's label so the drawing says what the meter says.
   */
  readonly valueText: Signal<string> = this.#context.valueText;
}
