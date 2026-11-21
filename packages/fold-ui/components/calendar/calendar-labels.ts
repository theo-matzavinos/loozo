import { InjectionToken, type Provider } from "@angular/core";

/** A Calendar view: the days of a month, the months of a year or a page of twelve years. */
export type CalendarLevel = "days" | "months" | "years";

/** The strings a Calendar renders itself, besides Origami's localized dates and headings. */
export interface CalendarLabels {
  /** Previous's name in each view: it steps a month, a year or twelve years. */
  readonly previous: Readonly<Record<CalendarLevel, string>>;
  /** Next's name in each view. */
  readonly next: Readonly<Record<CalendarLevel, string>>;
  /**
   * Follows the heading and ", " in the view switch's name, keyed by the view it switches to:
   * "October 2026, show the months".
   */
  readonly show: Readonly<Record<CalendarLevel, string>>;
  /** CalendarRange's polite prompt while no first day is pending. */
  readonly chooseFirstDay: string;
  /** CalendarRange's polite prompt while the first day is pending. */
  readonly chooseLastDay: string;
}

export const CALENDAR_LABELS = new InjectionToken<CalendarLabels>("CalendarLabels", {
  providedIn: "root",
  factory: () => ({
    previous: { days: "Previous month", months: "Previous year", years: "Previous 12 years" },
    next: { days: "Next month", months: "Next year", years: "Next 12 years" },
    show: { days: "show the days", months: "show the months", years: "show the years" },
    chooseFirstDay: "Choose the first day",
    chooseLastDay: "Choose the last day",
  }),
});

/**
 * Replaces the Calendars' English strings, app-wide in `app.config.ts` or for one subtree in a
 * component's `providers`. Give the whole object; nothing is merged with the defaults.
 */
export function provideCalendarLabels(labels: CalendarLabels): Provider {
  return { provide: CALENDAR_LABELS, useValue: labels };
}
