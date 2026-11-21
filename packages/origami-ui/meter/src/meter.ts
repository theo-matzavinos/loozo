import { Directive, computed, inject, input, numberAttribute } from "@angular/core";
import { MeterContext } from "./meter-context";
import { OrigamiMeterOptions } from "./meter-options";
import { OrigamiMeterState } from "./meter-state";

/**
 * Meter root: a `role="meter"` that reports a measurement within a known range, such as a share of
 * arrivals, a disk's usage or seats taken of a capacity. It isn't task progress, which is
 * Progress. A meter has no unknown state: `value` is required, and while there's no data the
 * consumer renders its own "no data" UI instead of a meter. The value renders clamped to the
 * effective `[min, max]`; a value that isn't finite renders as `min`, a bound that isn't finite as
 * its default, and a `max` below `min` is raised to it, as native `<meter>` does. Nothing is
 * validated, thrown or logged.
 *
 * Binds static `role="meter"` and `aria-valuemin`, `aria-valuemax` (the effective bounds),
 * `aria-valuenow` (the clamped value) and `aria-valuetext` (the consumer's `valueText`, else the
 * value's position formatted as a percent by `Intl.NumberFormat` under the root's `LOCALE_ID`),
 * all always present. For the consumer's CSS it binds the `--og-meter-percent` custom property,
 * the value's position from 0% to 100%. Every one of them is in server HTML, and hydration keeps
 * them; a browser whose `Intl` formats the default percent differently from the server's rewrites
 * `aria-valuetext` at its first change detection, without a hydration error. Use the `valueText`
 * input rather than a static `aria-valuetext`, which the binding replaces.
 *
 * ARIA requires a name, and the root binds none: give it `aria-labelledby` naming a visible
 * title or an `aria-label`, statically, by binding or from a composer's `host`. The consumer owns
 * all markup, styling and drawing. ARIA makes a meter's children presentational, but browsers
 * still expose a chart or an image inside it, so mark the drawing and any visible value text
 * `aria-hidden`.
 *
 * @example
 * ```html
 * <h2 id="arrivals-title">Arrivals</h2>
 * @if (arrival(); as arrival) {
 *   <div ogMeter #m="ogMeter" [value]="arrival.percentage" aria-labelledby="arrivals-title" class="ring">
 *     <span aria-hidden="true">{{ m.state.valueText() }}</span>
 *   </div>
 * } @else {
 *   <p>No data</p>
 * }
 * <div ogMeter [value]="occupied()" [max]="capacity()" aria-label="Seats taken"></div>
 * ```
 */
@Directive({
  selector: "[ogMeter]",
  exportAs: "ogMeter",
  providers: [
    OrigamiMeterOptions.provideExisting(() => OrigamiMeter),
    MeterContext,
    OrigamiMeterState,
  ],
  host: {
    role: "meter",
    "[attr.aria-valuemin]": "minAttribute()",
    "[attr.aria-valuemax]": "maxAttribute()",
    "[attr.aria-valuenow]": "nowAttribute()",
    "[attr.aria-valuetext]": "valueTextAttribute()",
    "[style.--og-meter-percent]": "percentProperty()",
  },
})
export class OrigamiMeter implements OrigamiMeterOptions {
  /**
   * Own value, required: a template without it doesn't compile, and its write type admits a
   * number or a string attribute (`value="75"`), not `null` or `undefined`, so render your own
   * "no data" UI in an `@if` instead of a meter while there's no data. Coerced with
   * `numberAttribute`: a string that isn't a number (`""`, `"abc"`) becomes `NaN`, and a value that
   * isn't finite renders as the effective `min`. A finite value renders clamped to `[min, max]`.
   * Replaced Options supply the effective value instead; a composer still exposes and binds this
   * input, because Angular rejects an unexposed required host-directive input.
   */
  readonly value = input.required<number, number | string>({ transform: numberAttribute });
  /**
   * Own lower bound, default 0, with number-attribute coercion (`min="10"`). A `min` that isn't
   * finite renders as 0. Replaced Options supply the effective lower bound instead.
   */
  readonly min = input(0, { transform: numberAttribute });
  /**
   * Own upper bound, default 100, with number-attribute coercion (`max="20"`). A `max` that isn't
   * finite renders as 100, and one below the effective `min` is raised to it: an empty range that
   * renders every value as `min` at 0%. Replaced Options supply the effective upper bound instead.
   */
  readonly max = input(100, { transform: numberAttribute });
  /**
   * Own value text, default null, which means the localized percent of the value's position under
   * the root's `LOCALE_ID`. A string, the empty string included, is bound as given; the consumer
   * owns its translation. Replaced Options supply the effective text instead.
   */
  readonly valueText = input<string | null>(null);
  /**
   * This root's readonly rendered observation, shared with its descendants. Evaluate its signals
   * in a template or host binding inside or after the root, a composer's template, a lazy
   * `computed`, `ngOnInit` or later, never in a constructor, a field initializer or a template
   * binding before the root: they read the required `value`, which throws NG0950 until Angular
   * has set it.
   */
  readonly state = inject(OrigamiMeterState);

  readonly #context = inject(MeterContext);

  /** @internal The effective min. */
  protected readonly minAttribute = this.#context.min;
  /** @internal The effective max. */
  protected readonly maxAttribute = this.#context.max;
  /** @internal The clamped value. */
  protected readonly nowAttribute = this.#context.value;
  /** @internal The effective value text. */
  protected readonly valueTextAttribute = this.#context.valueText;
  /** @internal The value's position, a percentage the consumer's CSS reads. */
  protected readonly percentProperty = computed(() => `${this.#context.percent()}%`);
}
