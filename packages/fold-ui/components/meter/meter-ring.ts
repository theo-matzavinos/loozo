import { Component, computed, inject, input } from "@angular/core";
import { OrigamiMeter } from "@loozo/origami-ui/meter";
import { cn } from "../cn";
import { METER_FILL, MeterThresholds } from "./meter-thresholds";

// One string each, built with +: Angular evaluates a template's interpolated constant statically.
// An 8px arc from twelve o'clock, clockwise in both directions. The mask cuts the hole; Angular's
// build adds -webkit-mask-image for Chrome and Edge 119.
const ARC =
  "absolute inset-0.5 rounded-full " +
  "bg-[conic-gradient(var(--meter-fill)_var(--og-meter-percent),transparent_0)] " +
  "[mask-image:radial-gradient(farthest-side,transparent_calc(100%-8px),#000_calc(100%-7.5px))] " +
  "forced-colors:[--meter-fill:CanvasText]";
// At most 64% of the ring's width, so two short lines stay inside the hole at the default size.
const VALUE =
  "relative max-w-[64%] text-center text-body font-semibold leading-tight tabular-nums " +
  "text-foreground [overflow-wrap:anywhere] forced-color-adjust-auto";

/**
 * A measurement within a known range, over Origami's Meter, drawn as a 96px ring gauge with
 * Origami's value text centred and hidden from assistive technology, which reads
 * `aria-valuetext`. The arc colours by region as Meter's fill does. Name it with `aria-label` or
 * `aria-labelledby`; a `size-*` class sets its diameter.
 *
 * @example
 * ```html
 * <div fold__MeterRing [value]="result.percentage" low="40" high="70" optimum="100" aria-labelledby="arrivals-title"></div>
 * <div fold__MeterRing [value]="taken()" [max]="seats()" [valueText]="taken() + ' of ' + seats() + ' seats'" aria-label="Seats taken" class="size-32"></div>
 * ```
 */
@Component({
  selector: "[fold__MeterRing]",
  exportAs: "fold__MeterRing",
  hostDirectives: [
    { directive: OrigamiMeter, inputs: ["value", "min", "max", "valueText"] },
    { directive: MeterThresholds, inputs: ["low", "high", "optimum"] },
  ],
  host: { "data-slot": "meter", "[class]": "classes()" },
  template: `
    <span data-slot="meter-arc" aria-hidden="true" class="${ARC}"></span>
    <span data-slot="meter-value" aria-hidden="true" class="${VALUE}">{{ state.valueText() }}</span>
  `,
})
export class MeterRing {
  readonly class = input("");

  /** Origami's readonly observation: `value`, `percent` and `valueText`. */
  readonly state = inject(OrigamiMeter).state;

  protected readonly classes = computed(() =>
    cn(
      // The track is the 1px `input` outline and a 2px gap, as on Meter; the unfilled arc is clear.
      "relative grid size-24 shrink-0 place-items-center rounded-full border border-input",
      METER_FILL,
      // Opted out of forced colors so the arc's gradient paints; an explicit Canvas ground under it.
      "forced-color-adjust-none forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]",
      this.class(),
    ),
  );
}
