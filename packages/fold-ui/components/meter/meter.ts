import { Component, computed, inject, input } from "@angular/core";
import { OrigamiMeter } from "@loozo/origami-ui/meter";
import { cn } from "../cn";
import { METER_FILL, MeterThresholds } from "./meter-thresholds";

// One string, built with +: Angular evaluates a template's interpolated constant statically.
const FILL =
  "block h-full w-(--og-meter-percent) rounded-full bg-(--meter-fill) forced-colors:bg-[CanvasText]";

/**
 * A measurement within a known range, over Origami's Meter, drawn as a bar: a 6px fill inside a
 * 1px `input` outline with a 2px gap. The fill is `foreground`, or `warning` and `destructive` in
 * the suboptimum and worst regions that `low`, `high` and `optimum` place as native `<meter>`
 * does. Name it with `aria-label` or `aria-labelledby`; a height class sets its thickness.
 *
 * @example
 * ```html
 * <div fold__Meter [value]="quotaUsed()" aria-label="Storage quota"></div>
 * <div fold__Meter [value]="disk.usedPercent" low="60" high="85" optimum="0" aria-labelledby="disk-title"></div>
 * ```
 */
@Component({
  selector: "[fold__Meter]",
  exportAs: "fold__Meter",
  hostDirectives: [
    { directive: OrigamiMeter, inputs: ["value", "min", "max", "valueText"] },
    { directive: MeterThresholds, inputs: ["low", "high", "optimum"] },
  ],
  host: { "data-slot": "meter", "[class]": "classes()" },
  template: `<span data-slot="meter-fill" aria-hidden="true" class="${FILL}"></span>`,
})
export class Meter {
  readonly class = input("");

  /** Origami's readonly observation: `value`, `percent` and `valueText`. */
  readonly state = inject(OrigamiMeter).state;

  protected readonly classes = computed(() =>
    cn(
      // 1 + 2 + 6 + 2 + 1 = 12px: the fill sits against whatever is behind the meter, so warning
      // and destructive keep 3:1 on fold's grounds, and the outline shows the full length.
      "block h-3 w-full rounded-full border border-input p-0.5",
      METER_FILL,
      // Opted out of forced colors so the fill paints; an explicit Canvas ground under it.
      "forced-color-adjust-none forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]",
      this.class(),
    ),
  );
}
