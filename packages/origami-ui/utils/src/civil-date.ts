/**
 * The package-private civil-date module that Calendar and the date field share: canonical ISO
 * `YYYY-MM-DD` days, proleptic Gregorian, years 0001–9999. Values never pass through a local-time
 * `Date`, so no time zone or daylight-saving change can shift them; a UTC-built `Date` exists only
 * to feed `Intl` labels. Framework-free.
 *
 * Every function except the parsers expects canonical input; callers validate at the boundary.
 */

/** @internal A Gregorian day's fields: a year in 0001–9999, a month 1–12 and a day of that month. */
export interface ɵCalendarDay {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** @internal The first supported year, 0001. */
export const ɵfirstYear = 1;

/** @internal The last supported year, 9999. */
export const ɵlastYear = 9999;

const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/** @internal Whether `year` is a Gregorian leap year. */
export function ɵleapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** @internal The number of days in `month` (1–12) of `year`, Gregorian. */
export function ɵdaysInMonth(year: number, month: number): number {
  if (month === 2) {
    if (ɵleapYear(year)) {
      return 29;
    }

    return 28;
  }

  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }

  return 31;
}

function supportedYear(year: number): boolean {
  return year >= ɵfirstYear && year <= ɵlastYear;
}

/**
 * @internal A canonical `YYYY-MM-DD` Gregorian day in 0001–9999, or null for anything else
 * ("2026-02-31", "27/10/2026", a non-string).
 */
export function ɵparseDay(text: unknown): ɵCalendarDay | null {
  if (typeof text !== "string") {
    return null;
  }

  const match = dayPattern.exec(text);

  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!supportedYear(year) || month < 1 || month > 12 || day < 1) {
    return null;
  }

  if (day > ɵdaysInMonth(year, month)) {
    return null;
  }

  return { year, month, day };
}

/** @internal `text` if it is a canonical `YYYY-MM-DD` day in 0001–9999, else null. */
export function ɵcanonicalDay(text: unknown): string | null {
  if (typeof text !== "string" || ɵparseDay(text) === null) {
    return null;
  }

  return text;
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

/** @internal The canonical `YYYY-MM-DD` string of a day in 0001–9999. */
export function ɵformatDay({ year, month, day }: ɵCalendarDay): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/**
 * @internal A `Date` at midnight UTC of a canonical `YYYY-MM-DD` day, for `Intl` labels formatted
 * with `timeZone: "UTC"`. `setUTCFullYear` keeps years below 100 as they are.
 */
export function ɵutcDate(date: string): Date {
  const { year, month, day } = ɵparseDay(date)!;
  const instant = new Date(0);

  instant.setUTCFullYear(year, month - 1, day);

  return instant;
}
