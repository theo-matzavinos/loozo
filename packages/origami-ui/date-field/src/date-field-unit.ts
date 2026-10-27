import {
  ɵdaysInMonth as daysInMonth,
  ɵfirstYear as firstYear,
  ɵlastYear as lastYear,
} from "@loozo/origami-ui/utils";
import type { OrigamiDateFieldSegmentType } from "./date-field-segment-type";

/**
 * The private segment engine: what each unit accepts and how typing, stepping and erasing change
 * it. Framework-free and package-private; every root shares it.
 *
 * A unit's draft entry is its digits, or `""` while empty: four for a year, two for the others,
 * except a lone `"0"` waiting for the digit after it where 0 isn't a value (month, day, a 12-hour
 * hour) and a year still being typed. The day period's entry is `"am"`, `"pm"` or `""`.
 */
export type DraftEntry = string;

/** The draft: each unit's entry by unit; a missing unit is empty. */
export type Draft = Readonly<Partial<Record<OrigamiDateFieldSegmentType, DraftEntry>>>;

/** The facts a unit's rules depend on besides its own entry. */
export interface UnitContext {
  /** The resolved hour cycle; only the hour reads it. */
  readonly hourCycle: 12 | 24;
}

/** The result of typing into a unit. */
export interface Typed {
  /** The unit's new entry. */
  readonly entry: DraftEntry;
  /** The digits typed so far, which the next digit extends. */
  readonly typed: string;
  /** No further digit could fit: focus moves to the next segment. */
  readonly advance: boolean;
}

/** A unit's width in digits; the day period has none and takes two placeholder characters. */
export function unitWidth(unit: OrigamiDateFieldSegmentType): number {
  if (unit === "year") {
    return 4;
  }

  return 2;
}

/** The values a unit accepts while typing: a day takes up to 31 whatever the month. */
function typingBounds(
  unit: OrigamiDateFieldSegmentType,
  { hourCycle }: UnitContext,
): { readonly min: number; readonly max: number } {
  switch (unit) {
    case "year":
      return { min: firstYear, max: lastYear };
    case "month":
      return { min: 1, max: 12 };
    case "day":
      return { min: 1, max: 31 };
    case "hour":
      if (hourCycle === 12) {
        return { min: 1, max: 12 };
      }

      return { min: 0, max: 23 };
    case "minute":
    case "second":
      return { min: 0, max: 59 };
    case "dayPeriod":
      return { min: 0, max: 1 };
  }
}

/**
 * The values a unit takes by stepping and Home/End, and announces as `aria-valuemin` and
 * `aria-valuemax`: a day ends at the draft month's length (February 29 while the year is
 * empty), else at 31. The day period is 0 (AM) or 1 (PM).
 */
export function unitBounds(
  unit: OrigamiDateFieldSegmentType,
  draft: Draft,
  context: UnitContext,
): { readonly min: number; readonly max: number } {
  if (unit !== "day") {
    return typingBounds(unit, context);
  }

  const month = unitValue("month", draft.month ?? "");

  if (month === null) {
    return { min: 1, max: 31 };
  }

  // 2000 is a leap year: February keeps its 29th until the year says otherwise.
  const year = unitValue("year", draft.year ?? "") ?? 2000;

  return { min: 1, max: daysInMonth(year, month) };
}

/**
 * A unit's number, or null while it holds none: empty, a lone `"0"` waiting for its next digit
 * where 0 isn't a value, or a year with fewer than four digits. The day period is 0 (AM) or 1
 * (PM).
 */
export function unitValue(unit: OrigamiDateFieldSegmentType, entry: DraftEntry): number | null {
  if (unit === "dayPeriod") {
    if (entry === "am") {
      return 0;
    }

    if (entry === "pm") {
      return 1;
    }

    return null;
  }

  if (entry.length !== unitWidth(unit)) {
    return null;
  }

  return Number(entry);
}

/** The entry that holds `value`, padded to the unit's width. */
function entryOf(unit: OrigamiDateFieldSegmentType, value: number): DraftEntry {
  if (unit === "dayPeriod") {
    if (value === 0) {
      return "am";
    }

    return "pm";
  }

  return String(value).padStart(unitWidth(unit), "0");
}

/**
 * The entry for the digits typed so far: a year keeps them as typed until it has four; another
 * unit is padded once they are a value, and a lone `"0"` where 0 isn't one waits as typed.
 */
function entryOfTyped(unit: OrigamiDateFieldSegmentType, typed: string, min: number): DraftEntry {
  if (unit === "year" || Number(typed) < min) {
    return typed;
  }

  return entryOf(unit, Number(typed));
}

/**
 * Types one ASCII digit into a numeric unit after `typed`, the digits typed into it since it was
 * entered (empty on entering, so the first digit replaces a filled unit). A digit that would
 * exceed the unit's maximum starts over with that digit; a full-width zero where 0 isn't a value
 * (month `00`, year `0000`) is ignored, returning null. The unit advances once no further digit
 * could fit: month 2–9, day 4–9, a 12-hour hour 2–9, a 24-hour hour 3–9, minute and second 6–9,
 * and after the unit's width.
 */
export function typeDigit(
  unit: OrigamiDateFieldSegmentType,
  typed: string,
  digit: string,
  context: UnitContext,
): Typed | null {
  if (unit === "dayPeriod") {
    return null;
  }

  const { min, max } = typingBounds(unit, context);
  const width = unitWidth(unit);
  let next = typed + digit;

  if (typed.length >= width || Number(next) > max) {
    next = digit;
  }

  const value = Number(next);

  if (next.length === width && value < min) {
    return null;
  }

  return {
    entry: entryOfTyped(unit, next, min),
    typed: next,
    advance: next.length >= width || value * 10 > max,
  };
}

/**
 * Removes a unit's last digit: `"12"` becomes `"01"`, still typed as `"1"`, and `"05"` empty; a
 * year drops its last digit. The day period empties.
 */
export function eraseDigit(
  unit: OrigamiDateFieldSegmentType,
  entry: DraftEntry,
  context: UnitContext,
): Typed {
  if (unit === "dayPeriod" || entry === "") {
    return { entry: "", typed: "", advance: false };
  }

  if (unit === "year") {
    const typed = entry.slice(0, -1);

    return { entry: typed, typed, advance: false };
  }

  const remaining = Math.floor(Number(entry) / 10);

  if (entry.length < unitWidth(unit) || remaining === 0) {
    return { entry: "", typed: "", advance: false };
  }

  const typed = String(remaining);
  const { min } = typingBounds(unit, context);

  return { entry: entryOfTyped(unit, typed, min), typed, advance: false };
}

/**
 * Steps a unit by `delta` (Up +1, Down −1), wrapping within its bounds without carrying into
 * another unit. An empty unit starts at its minimum going up and its maximum going down; an empty
 * year starts at `currentYear`, which the caller reads from the clock at the keypress. A day past
 * the draft month's end steps down to that end. A year being typed steps from what is typed.
 */
export function stepUnit(
  unit: OrigamiDateFieldSegmentType,
  draft: Draft,
  delta: 1 | -1,
  context: UnitContext,
  currentYear: number,
): DraftEntry {
  const entry = draft[unit] ?? "";
  const { min, max } = unitBounds(unit, draft, context);
  let value = unitValue(unit, entry);

  if (unit === "year" && value === null && entry !== "" && Number(entry) >= min) {
    value = Number(entry);
  }

  if (value === null) {
    if (unit === "year") {
      return entryOf(unit, currentYear);
    }

    if (delta === 1) {
      return entryOf(unit, min);
    }

    return entryOf(unit, max);
  }

  if (delta === -1 && value > max) {
    return entryOf(unit, max);
  }

  const next = value + delta;

  if (next > max) {
    return entryOf(unit, min);
  }

  if (next < min) {
    return entryOf(unit, max);
  }

  return entryOf(unit, next);
}

/** A unit's minimum (Home) or maximum (End): a day's maximum is the draft month's length. */
export function edgeUnit(
  unit: OrigamiDateFieldSegmentType,
  draft: Draft,
  edge: "min" | "max",
  context: UnitContext,
): DraftEntry {
  const { min, max } = unitBounds(unit, draft, context);

  if (edge === "min") {
    return entryOf(unit, min);
  }

  return entryOf(unit, max);
}

/**
 * The day period a typed character chooses: the period whose localized name starts with it,
 * compared case-insensitively in `locale`; null when neither does. `periods` are the localized
 * AM and PM names.
 */
export function typePeriod(
  character: string,
  periods: readonly [string, string],
  locale: string,
): "am" | "pm" | null {
  const typed = character.toLocaleLowerCase(locale);

  if (periods[0].toLocaleLowerCase(locale).startsWith(typed)) {
    return "am";
  }

  if (periods[1].toLocaleLowerCase(locale).startsWith(typed)) {
    return "pm";
  }

  return null;
}

/**
 * The value of one Unicode decimal digit (`\p{Nd}`): ASCII, the locale's own digits (Arabic-Indic
 * ٠–٩) or full-width digits from an IME (０–９); null for any other character. Unicode encodes
 * every decimal digit in runs of ten from zero, so a digit's value is its distance from the start
 * of its run, modulo ten.
 */
export function digitValue(character: string): number | null {
  const decimal = /^\p{Nd}$/u;

  if (!decimal.test(character)) {
    return null;
  }

  const code = character.codePointAt(0)!;
  let start = code;

  while (decimal.test(String.fromCodePoint(start - 1))) {
    start -= 1;
  }

  return (code - start) % 10;
}
