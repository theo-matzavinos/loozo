/**
 * The Calendar's private date module: canonical ISO strings for a day (`YYYY-MM-DD`), a month
 * (`YYYY-MM`) and a year (`YYYY`), proleptic Gregorian, years 0001–9999. Values never pass
 * through a local-time `Date`, so no time zone or daylight-saving change can shift them; a
 * UTC-built `Date` exists only to feed `Intl` labels. Framework-free and package-private.
 *
 * Every function except the parsers expects canonical input; callers validate at the boundary.
 */

/** An ISO weekday: 1 is Monday, 7 is Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** A day's fields. */
export interface CalendarDay {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** A month's fields. */
export interface CalendarMonth {
  readonly year: number;
  readonly month: number;
}

/** The first and last supported years. */
export const firstYear = 1;
export const lastYear = 9999;

const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const monthPattern = /^(\d{4})-(\d{2})$/;
const yearPattern = /^\d{4}$/;

/** Days from 1970-01-01 to 0000-03-01, the start of the 400-year era arithmetic below. */
const epochShift = 719468;
const daysPerEra = 146097;

/** Whether `year` is a Gregorian leap year. */
export function leapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The number of days in `month` (1–12) of `year`. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    if (leapYear(year)) {
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
  return year >= firstYear && year <= lastYear;
}

/** A canonical `YYYY-MM-DD` day in 0001–9999, or null for anything else ("2026-02-31", "27/10/2026"). */
export function parseDay(text: unknown): CalendarDay | null {
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

  if (day > daysInMonth(year, month)) {
    return null;
  }

  return { year, month, day };
}

/** A canonical `YYYY-MM` month in 0001–9999, or null. */
export function parseMonth(text: unknown): CalendarMonth | null {
  if (typeof text !== "string") {
    return null;
  }

  const match = monthPattern.exec(text);

  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (!supportedYear(year) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

/** A canonical `YYYY` year in 0001–9999, or null. */
export function parseYear(text: unknown): number | null {
  if (typeof text !== "string" || !yearPattern.test(text)) {
    return null;
  }

  const year = Number(text);

  if (!supportedYear(year)) {
    return null;
  }

  return year;
}

/** `text` if it is a canonical day, else null. */
export function canonicalDay(text: unknown): string | null {
  if (typeof text !== "string" || parseDay(text) === null) {
    return null;
  }

  return text;
}

/** `text` if it is a canonical month, else null. */
export function canonicalMonth(text: unknown): string | null {
  if (typeof text !== "string" || parseMonth(text) === null) {
    return null;
  }

  return text;
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

export function formatYear(year: number): string {
  return pad(year, 4);
}

export function formatMonth(year: number, month: number): string {
  return `${pad(year, 4)}-${pad(month, 2)}`;
}

export function formatDay({ year, month, day }: CalendarDay): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** Days since 1970-01-01 (negative before it), for any proleptic Gregorian day. */
export function dayNumber({ year, month, day }: CalendarDay): number {
  let shiftedYear = year;

  if (month <= 2) {
    shiftedYear -= 1;
  }

  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const shiftedMonth = (month + 9) % 12;
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;

  return era * daysPerEra + dayOfEra - epochShift;
}

/** The day `number` days after 1970-01-01. */
export function dayFromNumber(number: number): CalendarDay {
  const shifted = number + epochShift;
  const era = Math.floor(shifted / daysPerEra);
  const dayOfEra = shifted - era * daysPerEra;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  let month = shiftedMonth + 3;
  let year = yearOfEra + era * 400;

  if (month > 12) {
    month -= 12;
  }

  if (month <= 2) {
    year += 1;
  }

  return { year, month, day };
}

const firstDayNumber = dayNumber({ year: firstYear, month: 1, day: 1 });
const lastDayNumber = dayNumber({ year: lastYear, month: 12, day: 31 });

/** The first and last supported days. */
export const firstDay = "0001-01-01";
export const lastDay = "9999-12-31";

/** The day number of a canonical day. */
function numberOf(date: string): number {
  return dayNumber(parseDay(date)!);
}

/** The canonical day for a day number, or null outside 0001–9999. */
export function dayAt(number: number): string | null {
  if (number < firstDayNumber || number > lastDayNumber) {
    return null;
  }

  return formatDay(dayFromNumber(number));
}

/** `date` moved by `amount` days, clamped to 0001-01-01 … 9999-12-31. */
export function addDays(date: string, amount: number): string {
  const target = Math.min(Math.max(numberOf(date) + amount, firstDayNumber), lastDayNumber);

  return formatDay(dayFromNumber(target));
}

/**
 * `date` moved by `amount` months, its day clamped to the destination month's end
 * (2026-01-31 + 1 → 2026-02-28), and the result clamped to the supported range.
 */
export function addMonths(date: string, amount: number): string {
  const { year, month, day } = parseDay(date)!;
  const index = year * 12 + (month - 1) + amount;

  if (index < firstYear * 12) {
    return firstDay;
  }

  if (index > lastYear * 12 + 11) {
    return lastDay;
  }

  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;

  return formatDay({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, daysInMonth(targetYear, targetMonth)),
  });
}

/** `date` moved by `amount` years: February 29 becomes 28 outside leap years. */
export function addYears(date: string, amount: number): string {
  return addMonths(date, amount * 12);
}

/** The canonical month `amount` months after `month`, or null outside 0001-01 … 9999-12. */
export function shiftMonth(month: string, amount: number): string | null {
  const parsed = parseMonth(month)!;
  const index = parsed.year * 12 + (parsed.month - 1) + amount;
  const year = Math.floor(index / 12);

  if (!supportedYear(year)) {
    return null;
  }

  return formatMonth(year, (index % 12) + 1);
}

/** The canonical year `amount` years after `year`, or null outside 0001 … 9999. */
export function shiftYear(year: string, amount: number): string | null {
  const target = parseYear(year)! + amount;

  if (!supportedYear(target)) {
    return null;
  }

  return formatYear(target);
}

/** Days between two canonical days: positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  return numberOf(to) - numberOf(from);
}

/** ISO weekdays by day number modulo 7: 1970-01-01, day 0, was a Thursday. */
const weekdaysFromEpoch: readonly Weekday[] = [4, 5, 6, 7, 1, 2, 3];

/** The ISO weekday of a canonical day. */
export function weekday(date: string): Weekday {
  const number = numberOf(date);

  return weekdaysFromEpoch[((number % 7) + 7) % 7]!;
}

/** The `YYYY-MM` month of a canonical day. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** The `YYYY` year of a canonical day or month. */
export function yearOf(date: string): string {
  return date.slice(0, 4);
}

/** The first day of a canonical month. */
export function firstDayOf(month: string): string {
  return `${month}-01`;
}

/** The last day of a canonical month. */
export function lastDayOf(month: string): string {
  const { year, month: number } = parseMonth(month)!;

  return formatDay({ year, month: number, day: daysInMonth(year, number) });
}

/**
 * A `Date` at midnight UTC of a canonical day, for `Intl` labels formatted with
 * `timeZone: "UTC"`. `setUTCFullYear` keeps years below 100 as they are.
 */
export function utcDate(date: string): Date {
  const { year, month, day } = parseDay(date)!;
  const instant = new Date(0);

  instant.setUTCFullYear(year, month - 1, day);

  return instant;
}

/**
 * Today on this platform's clock, in its own time zone: the server's on the server, the user's
 * in the browser.
 */
export function localToday(now: Date = new Date()): string {
  return formatDay({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}
