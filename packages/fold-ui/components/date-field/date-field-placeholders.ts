import { InjectionToken, type Provider } from "@angular/core";
import type { OrigamiDateFieldSegmentType } from "@loozo/origami-ui/date-field";

/**
 * The token each empty segment shows and is announced as, per unit. The tokens also size their
 * segments, so a filled segment is as wide as an empty one. Two width rules keep the field steady:
 *
 * - `dayPeriod` at least as wide as each of the locale's AM and PM names, or the field shifts
 *   when the period is filled or cleared;
 * - `year` no wider than the widest two-letter token followed by two digits, or the filled
 *   year's gaps are uneven.
 */
export type DateFieldPlaceholders = Readonly<Record<OrigamiDateFieldSegmentType, string>>;

export const DATE_FIELD_PLACEHOLDERS = new InjectionToken<DateFieldPlaceholders>(
  "DateFieldPlaceholders",
  {
    providedIn: "root",
    factory: () => ({
      year: "yyyy",
      month: "mm",
      day: "dd",
      hour: "hh",
      minute: "mm",
      second: "ss",
      dayPeriod: "AM/PM",
    }),
  },
);

/**
 * Replaces the date, time and date-time fields' English placeholder tokens, app-wide in
 * `app.config.ts` or for one subtree in a component's `providers`. Give every unit; nothing is
 * merged with the defaults. See `DateFieldPlaceholders` for the two width rules.
 */
export function provideDateFieldPlaceholders(placeholders: DateFieldPlaceholders): Provider {
  return { provide: DATE_FIELD_PLACEHOLDERS, useValue: placeholders };
}
