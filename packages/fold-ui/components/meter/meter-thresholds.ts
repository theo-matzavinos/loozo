import { Directive, computed, inject, input, numberAttribute } from "@angular/core";
import { OrigamiMeterOptions, OrigamiMeterState } from "@loozo/origami-ui/meter";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { meterRegion } from "./meter-region";

/**
 * The fill colour per region, as the `--meter-fill` custom property on a Meter or MeterRing root:
 * `foreground` with no region or in the optimum one, `warning` in the suboptimum one and
 * `destructive` in the worst one. Raw tokens rather than `--color-*`, since theme.css uses
 * `@theme inline`.
 */
export const METER_FILL =
  "[--meter-fill:var(--foreground)] " +
  "data-[region=suboptimum]:[--meter-fill:var(--warning)] " +
  "data-[region=worst]:[--meter-fill:var(--destructive)]";

/**
 * Native `<meter>`'s `low`, `high` and `optimum`, in value units, for a root that composes
 * Origami's Meter: binds `data-region` (`optimum`, `suboptimum` or `worst`) when any of them is
 * set, and nothing otherwise. Visual only; put the status in `valueText` when it matters.
 */
@Directive({ host: { "[attr.data-region]": "region()" } })
export class MeterThresholds {
  /** The low threshold; unset by default. A value that isn't a number counts as unset. */
  readonly low = input(NaN, { transform: numberAttribute });
  /** The high threshold; unset by default. A value that isn't a number counts as unset. */
  readonly high = input(NaN, { transform: numberAttribute });
  /** The optimum point; the range's midpoint when unset. A value that isn't a number counts as unset. */
  readonly optimum = input(NaN, { transform: numberAttribute });

  // Resolved only when a threshold is set, inside the host binding: no earlier than Origami's own
  // first read, so a replaced Options factory that reads a bound input still runs in time.
  readonly #options = injectDeferred(OrigamiMeterOptions);
  readonly #state = inject(OrigamiMeterState);

  protected readonly region = computed(() =>
    meterRegion(this.low(), this.high(), this.optimum(), () => {
      const options = this.#options();
      return [options.min(), options.max(), this.#state.value()];
    }),
  );
}
