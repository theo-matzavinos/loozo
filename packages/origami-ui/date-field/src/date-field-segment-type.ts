/**
 * A unit a segment edits. `ogDateField` lays out `"year"`, `"month"` and `"day"`; the time units
 * (`"hour"`, `"minute"`, `"second"` and the AM/PM `"dayPeriod"`) belong to time roots that aren't
 * part of this release.
 */
export type OrigamiDateFieldSegmentType =
  | "year"
  | "month"
  | "day"
  | "hour"
  | "minute"
  | "second"
  | "dayPeriod";
