/**
 * A unit a segment edits. `ogDateField` lays out `"year"`, `"month"` and `"day"`; `ogTimeField`
 * lays out `"hour"` and `"minute"`, `"second"` at second precision and the AM/PM `"dayPeriod"` in
 * a 12-hour cycle.
 */
export type OrigamiDateFieldSegmentType =
  | "year"
  | "month"
  | "day"
  | "hour"
  | "minute"
  | "second"
  | "dayPeriod";
