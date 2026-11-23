/** Where a meter's value sits against its thresholds, named by native `<meter>`'s regions. */
export type MeterRegion = "optimum" | "suboptimum" | "worst";

/**
 * Native `<meter>`'s region (HTML §4.10.14) for the given thresholds, or null when none of them is
 * finite. `bounds` is called only when a threshold is finite: it returns Origami's raw Options
 * `min` and `max`, normalized here as Origami normalizes them (finite or 0, finite or 100, `max`
 * raised to `min`), and Origami's clamped State value. Boundaries are inclusive, as in Blink.
 */
export function meterRegion(
  low: number,
  high: number,
  optimum: number,
  bounds: () => readonly [min: number, max: number, value: number],
): MeterRegion | null {
  if (!Number.isFinite(low) && !Number.isFinite(high) && !Number.isFinite(optimum)) {
    return null;
  }

  const [rawMin, rawMax, value] = bounds();
  let min = 0;
  if (Number.isFinite(rawMin)) {
    min = rawMin;
  }

  let max = 100;
  if (Number.isFinite(rawMax)) {
    max = rawMax;
  }
  max = Math.max(min, max);

  let lowBound = min;
  if (Number.isFinite(low)) {
    lowBound = Math.min(max, Math.max(min, low));
  }

  let highBound = max;
  if (Number.isFinite(high)) {
    highBound = Math.min(max, Math.max(lowBound, high));
  }

  let optimumPoint = optimum;
  if (!Number.isFinite(optimumPoint)) {
    const span = max - min;
    if (Number.isFinite(span)) {
      optimumPoint = min + span / 2;
    } else {
      // The span of a huge range overflows; halving each bound first doesn't.
      optimumPoint = min / 2 + max / 2;
    }
  }
  optimumPoint = Math.min(max, Math.max(min, optimumPoint));

  // Lower is better.
  if (optimumPoint < lowBound) {
    if (value <= lowBound) {
      return "optimum";
    }
    if (value <= highBound) {
      return "suboptimum";
    }
    return "worst";
  }

  // Higher is better.
  if (optimumPoint > highBound) {
    if (value >= highBound) {
      return "optimum";
    }
    if (value >= lowBound) {
      return "suboptimum";
    }
    return "worst";
  }

  // The band between low and high is best.
  if (value >= lowBound && value <= highBound) {
    return "optimum";
  }
  return "suboptimum";
}
