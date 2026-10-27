import { ɵutcDate as utcDate } from "@loozo/origami-ui/utils";
import type { Weekday } from "./calendar-date";

/**
 * The Calendar's locale facts from `Intl`: labels and the week's first day. Labels format a
 * UTC-built `Date` with `timeZone: "UTC"` and `calendar: "gregory"`, so the day they name is the
 * day of the ISO string whatever the platform's time zone or the locale's default calendar.
 * Framework-free and package-private.
 */

/** A weekday column's labels: `short` for the header ("Tue"), `long` for its `abbr` ("Tuesday"). */
export interface WeekdayLabel {
  readonly short: string;
  readonly long: string;
}

/** What engines expose of `Intl.Locale` week data, which TypeScript's ES2022 library lacks. */
interface WeekInfoLocale {
  readonly baseName: string;
  readonly getWeekInfo?: () => { readonly firstDay?: unknown };
  readonly weekInfo?: { readonly firstDay?: unknown };
}

function isWeekday(value: unknown): value is Weekday {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7;
}

/**
 * The locale's first day of the week: `Intl.Locale#getWeekInfo()` (Chrome 130+, Safari 17+,
 * Firefox 153+, Node 24+), else the older `weekInfo` accessor, else Monday.
 */
export function localeWeekStart(locale: string): Weekday {
  const tag: WeekInfoLocale = new Intl.Locale(locale);
  let firstDay: unknown;

  if (typeof tag.getWeekInfo === "function") {
    firstDay = tag.getWeekInfo().firstDay;
  } else if (tag.weekInfo !== undefined) {
    firstDay = tag.weekInfo.firstDay;
  }

  if (isWeekday(firstDay)) {
    return firstDay;
  }

  return 1;
}

/** A reference week, Monday to Sunday: 2024-01-01 was a Monday. */
const referenceWeek: readonly string[] = [
  "2024-01-01",
  "2024-01-02",
  "2024-01-03",
  "2024-01-04",
  "2024-01-05",
  "2024-01-06",
  "2024-01-07",
];

/** One locale's formatters, created once per locale. */
export class CalendarLabels {
  readonly #day: Intl.DateTimeFormat;
  readonly #date: Intl.DateTimeFormat;
  readonly #month: Intl.DateTimeFormat;
  readonly #monthShort: Intl.DateTimeFormat;
  readonly #year: Intl.DateTimeFormat;
  readonly #weekdayShort: Intl.DateTimeFormat;
  readonly #weekdayLong: Intl.DateTimeFormat;

  constructor(locale: string) {
    const base = { timeZone: "UTC", calendar: "gregory" } as const;

    this.#day = new Intl.DateTimeFormat(locale, { ...base, day: "numeric" });
    this.#date = new Intl.DateTimeFormat(locale, {
      ...base,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    this.#month = new Intl.DateTimeFormat(locale, { ...base, year: "numeric", month: "long" });
    this.#monthShort = new Intl.DateTimeFormat(locale, { ...base, month: "short" });
    this.#year = new Intl.DateTimeFormat(locale, { ...base, year: "numeric" });
    this.#weekdayShort = new Intl.DateTimeFormat(locale, { ...base, weekday: "short" });
    this.#weekdayLong = new Intl.DateTimeFormat(locale, { ...base, weekday: "long" });
  }

  /** The day number of a canonical day ("7"). */
  day(date: string): string {
    return this.#day.format(utcDate(date));
  }

  /** The full date of a canonical day, a cell's accessible name ("Tuesday, October 27, 2026"). */
  date(date: string): string {
    return this.#date.format(utcDate(date));
  }

  /** A canonical month and its year ("October 2026"): the days heading and a month cell's name. */
  month(month: string): string {
    return this.#month.format(utcDate(`${month}-01`));
  }

  /** A canonical month's short name alone ("Oct"), a month cell's text. */
  monthShort(month: string): string {
    return this.#monthShort.format(utcDate(`${month}-01`));
  }

  /** A canonical year ("2026"): the months heading, and a year cell's text and name. */
  year(year: string): string {
    return this.#year.format(utcDate(`${year}-01-01`));
  }

  /** A page of years from `first` to `last`, canonical years, as a range ("2016 – 2027"). */
  years(first: string, last: string): string {
    return this.#year.formatRange(utcDate(`${first}-01-01`), utcDate(`${last}-01-01`));
  }

  /** The seven weekday labels, starting at `weekStart`. */
  weekdays(weekStart: Weekday): readonly WeekdayLabel[] {
    const labels: WeekdayLabel[] = [];

    for (let offset = 0; offset < 7; offset += 1) {
      const instant = utcDate(referenceWeek[(weekStart - 1 + offset) % 7]!);

      labels.push({
        short: this.#weekdayShort.format(instant),
        long: this.#weekdayLong.format(instant),
      });
    }

    return labels;
  }
}
