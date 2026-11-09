/** @internal A root's stepping bounds and step. Framework-free, so the Node checks (NF2) run it. */
export interface NumberStepRange {
  /** The lower bound; a bound that isn't a finite number is none. */
  readonly min: number | undefined;
  readonly max: number | undefined;
  /** Stepping does nothing unless it is a positive finite number. */
  readonly step: number;
}

function bound(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

/** The number of decimal places in a finite number's shortest round-trip text, `1e-7` included. */
function decimals(value: number): number {
  const text = String(Math.abs(value));
  const exponent = text.indexOf("e");
  let mantissa = text;
  let shift = 0;

  if (exponent !== -1) {
    mantissa = text.slice(0, exponent);
    shift = Number(text.slice(exponent + 1));
  }

  const point = mantissa.indexOf(".");
  let places = 0;

  if (point !== -1) {
    places = mantissa.length - point - 1;
  }

  return Math.max(0, places - shift);
}

/** A finite number's 15-significant-digit form: `0.1 + 0.2` (`0.30000000000000004`) is 0.3. */
function shortForm(value: number): number {
  return Number(value.toPrecision(15));
}

function clamp(value: number, min: number | undefined, max: number | undefined): number {
  let clamped = value;

  if (max !== undefined && clamped > max) {
    clamped = max;
  }

  if (min !== undefined && clamped < min) {
    clamped = min;
  }

  // Never -0.
  if (clamped === 0) {
    return 0;
  }

  return clamped;
}

/**
 * The value a step up (+1) or down (−1) from `value` writes, or null when it does nothing. From a
 * finite value it moves to the next value aligned to `min ?? 0` plus a multiple of `step` in its
 * direction, strictly past `value`, then clamps to the bounds; it never moves against its
 * direction, so up does nothing at or above `max` and down at or below `min`. From null, or a
 * value that isn't finite, up writes `min ?? 0` and down `max ?? 0`, clamped. An integer steps
 * exactly, so 1 steps from `10 ** 15 + 1` to `10 ** 15 + 2` or `10 ** 15`; any other value steps as
 * its 15-significant-digit form, so a computed value's float noise doesn't count: `0.1` steps from
 * `0.1 + 0.2` (`0.30000000000000004`) to 0.2 or 0.4, from `0.7 + 0.1` (`0.7999999999999999`, shown
 * as 0.8) to 0.9 or 0.7, and from sixty additions of 0.1 (`5.999999999999995`) to 6 or 5.9. The
 * arithmetic runs on integers scaled by ten to the operands' decimal places (the anchor's and the
 * step's counted at 15 significant digits), so `0.1` steps from 0.2 to 0.3; where those integers
 * would leave `Number`'s safe range, it runs in plain arithmetic on the value itself. A step whose
 * result isn't finite, or doesn't move past `value` in its
 * direction, does nothing, so a result is always a finite number strictly past `value`.
 */
export function stepNumber(
  value: number | null,
  direction: 1 | -1,
  range: NumberStepRange,
): number | null {
  const min = bound(range.min);
  const max = bound(range.max);
  const step = range.step;

  if (!Number.isFinite(step) || step <= 0) {
    return null;
  }

  if (value === null || !Number.isFinite(value)) {
    if (direction === 1) {
      return clamp(min ?? 0, min, max);
    }

    return clamp(max ?? 0, min, max);
  }

  if (direction === 1 && max !== undefined && value >= max) {
    return null;
  }

  if (direction === -1 && min !== undefined && value <= min) {
    return null;
  }

  const anchor = min ?? 0;
  const places = Math.max(decimals(shortForm(anchor)), decimals(shortForm(step)));
  // An integer steps exactly (`10 ** 15 + 1`); any other value as its 15-significant-digit form,
  // so float noise doesn't count: `0.7 + 0.1` (`0.7999999999999999`) steps as 0.8.
  let next = stepScaled(
    Number.isInteger(value) ? value : shortForm(value),
    anchor,
    step,
    places,
    direction,
  );

  if (next === null) {
    next = alignedStep(value, anchor, step, direction);

    // Plain arithmetic can land back on `value`: one step further.
    if (!movesPast(next, value, direction)) {
      next += direction * step;
    }
  }

  // A step past `Number`'s range (`1e308` up by `1e308`, `1` up by `1e-309`), or one too small to
  // change `value` (`1e20` up by 1), does nothing, also where a bound would clamp it.
  if (!Number.isFinite(next) || !movesPast(next, value, direction)) {
    return null;
  }

  return clamp(next, min, max);
}

function movesPast(next: number, value: number, direction: 1 | -1): boolean {
  if (direction === 1) {
    return next > value;
  }

  return next < value;
}

/**
 * The next value on the grid of `anchor` plus multiples of `step` past `value`, on integers scaled
 * by ten to the larger of `value`'s decimal places and `places`; null where one of the integers
 * isn't safe, or the scale is infinite (`1e-309`).
 */
function stepScaled(
  value: number,
  anchor: number,
  step: number,
  places: number,
  direction: 1 | -1,
): number | null {
  const scale = 10 ** Math.max(decimals(value), places);
  const scaledValue = Math.round(value * scale);
  const scaledAnchor = Math.round(anchor * scale);
  const scaledStep = Math.round(step * scale);

  if (
    !Number.isSafeInteger(scaledValue) ||
    !Number.isSafeInteger(scaledAnchor) ||
    !Number.isSafeInteger(scaledStep)
  ) {
    return null;
  }

  return alignedStep(scaledValue, scaledAnchor, scaledStep, direction) / scale;
}

/** The next value on the grid of `anchor` plus multiples of `step`, strictly past `value`. */
function alignedStep(value: number, anchor: number, step: number, direction: 1 | -1): number {
  const offset = value - anchor;

  if (direction === 1) {
    return anchor + (Math.floor(offset / step) + 1) * step;
  }

  return anchor + (Math.ceil(offset / step) - 1) * step;
}
