/**
 * A valid Slider configuration and its allowed values: `min + k·step` for every whole `k` from 0
 * to `last`, the highest one that doesn't pass `max`. Private to the Slider entry point.
 */
export interface SliderGrid {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Decimal places a computed value is rounded to: the most of `step`'s and `min`'s. */
  readonly precision: number;
  /** The index of the last allowed value. */
  readonly last: number;
}

/** `toFixed` accepts at most 100 fraction digits. */
const maximumPrecision = 100;

/** The decimal places a number is written with, exponent notation included (`1e-7` has 7). */
function decimals(value: number): number {
  const [mantissa = "", exponent = "0"] = String(value).toLowerCase().split("e");
  const fraction = mantissa.split(".")[1] ?? "";
  const places = fraction.length - Number(exponent);

  return Math.min(Math.max(places, 0), maximumPrecision);
}

/** Drops floating error from a computed value, such as `0.1 + 0.2`. */
function round(grid: Pick<SliderGrid, "precision">, value: number): number {
  return Number(value.toFixed(grid.precision));
}

/**
 * The allowed values of a configuration, or null for an invalid one: a non-finite bound or step,
 * `min ≥ max` or `step ≤ 0`.
 */
export function sliderGrid(min: number, max: number, step: number): SliderGrid | null {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step)) {
    return null;
  }

  if (min >= max || step <= 0) {
    return null;
  }

  const precision = Math.max(decimals(step), decimals(min));
  const draft = { min, max, step, precision, last: 0 };
  // The quotient can land just under or just over a whole number: (0.3 - 0) / 0.1 is 2.999….
  let last = Math.floor((max - min) / step);

  if (gridValue(draft, last + 1) <= max) {
    last += 1;
  }

  if (gridValue(draft, last) > max) {
    last -= 1;
  }

  return { ...draft, last };
}

/** The allowed value at an index. */
export function gridValue(grid: Omit<SliderGrid, "last">, index: number): number {
  return round(grid, grid.min + index * grid.step);
}

/** The value as rendered: clamped to `[min, max]`; a non-finite value renders as `min`. */
export function renderedValue(grid: SliderGrid, value: number): number {
  if (!Number.isFinite(value)) {
    return grid.min;
  }

  return Math.min(Math.max(value, grid.min), grid.max);
}

/** The rendered value's position in the range, 0–1. */
export function fraction(grid: SliderGrid, value: number): number {
  return (renderedValue(grid, value) - grid.min) / (grid.max - grid.min);
}

/** The allowed value nearest to a value, clamped to the first and last allowed values. */
export function nearestValue(grid: SliderGrid, value: number): number {
  const index = Math.round((value - grid.min) / grid.step);

  return gridValue(grid, Math.min(Math.max(index, 0), grid.last));
}

/**
 * How many indexes a neighbour search tries: the quotient lands at most two indexes short of the
 * neighbour, whatever its floating error.
 */
const searchLength = 3;

/**
 * The first allowed value above a rendered value, or null at or past the last one, and when no
 * representable allowed value lies above it: past 2^53 an index plus one can round back to the
 * same index.
 */
export function valueAbove(grid: SliderGrid, value: number): number | null {
  const start = Math.max(Math.floor((value - grid.min) / grid.step), 0);

  for (let offset = 0; offset < searchLength; offset += 1) {
    const index = start + offset;

    if (index > grid.last) {
      return null;
    }

    const candidate = gridValue(grid, index);

    if (candidate > value) {
      return candidate;
    }
  }

  return null;
}

/**
 * The last allowed value below a rendered value, or null at `min`, and when no representable
 * allowed value lies below it.
 */
export function valueBelow(grid: SliderGrid, value: number): number | null {
  const start = Math.min(Math.ceil((value - grid.min) / grid.step), grid.last);

  for (let offset = 0; offset < searchLength; offset += 1) {
    const index = start - offset;

    if (index < 0) {
      return null;
    }

    const candidate = gridValue(grid, index);

    if (candidate < value) {
      return candidate;
    }
  }

  return null;
}

/** PageUp and PageDown's distance: a tenth of the range in whole steps, at least one step. */
export function pageDistance(grid: SliderGrid): number {
  return Math.max(1, Math.round((grid.max - grid.min) / 10 / grid.step)) * grid.step;
}

/** The last allowed value: `max` when it lies on the grid. */
export function lastValue(grid: SliderGrid): number {
  return gridValue(grid, grid.last);
}
