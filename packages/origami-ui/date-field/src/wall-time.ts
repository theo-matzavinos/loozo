import type { OrigamiDateFieldSegmentType } from "./date-field-segment-type";
import type { Draft } from "./date-field-unit";

/** A time root's or a date-time root's precision: the smallest unit it lays out and writes. */
export type TimePrecision = "minute" | "second";

/** A canonical time's units as written: two ASCII digits each, the second absent at minutes. */
export interface WallTime {
  readonly hour: string;
  readonly minute: string;
  readonly second: string | null;
}

const minuteUnits: readonly OrigamiDateFieldSegmentType[] = ["hour", "minute"];
const secondUnits: readonly OrigamiDateFieldSegmentType[] = ["hour", "minute", "second"];

/** A wall-clock time at either precision: `HH:mm` or `HH:mm:ss`, 00:00 to 23:59:59. */
const canonicalTime = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * The time units a root at `precision` lays out, without the day period, which the hour cycle
 * adds; the same array for the same precision, so a reader can compare them by identity.
 */
export function timeUnits(precision: TimePrecision): readonly OrigamiDateFieldSegmentType[] {
  if (precision === "second") {
    return secondUnits;
  }

  return minuteUnits;
}

/** The time units a draft holds: `timeUnits`, plus the day period in a 12-hour cycle. */
export function timeDraftUnits(
  precision: TimePrecision,
  hourCycle: 12 | 24,
): readonly OrigamiDateFieldSegmentType[] {
  if (hourCycle === 12) {
    return [...timeUnits(precision), "dayPeriod"];
  }

  return timeUnits(precision);
}

/** A canonical `HH:mm` or `HH:mm:ss` time's units, or null for anything else. */
export function readTime(text: string): WallTime | null {
  const match = canonicalTime.exec(text);

  if (match === null) {
    return null;
  }

  const [, hour, minute, second = null] = match;

  return { hour, minute, second };
}

/**
 * The draft that shows `time` at `precision` in `hourCycle`. Minute precision leaves a second
 * out; second precision shows a missing one as 00. The 12-hour cycle shows the hour 1 to 12 with
 * the day period, midnight as 12 AM and noon as 12 PM.
 */
export function formatTime(time: WallTime, precision: TimePrecision, hourCycle: 12 | 24): Draft {
  const { hour, minute, second } = time;
  let draft: Draft = { hour, minute };

  if (precision === "second") {
    draft = { hour, minute, second: second ?? "00" };
  }

  if (hourCycle === 24) {
    return draft;
  }

  const hours = Number(hour);
  let shown = hours % 12;
  let dayPeriod = "am";

  if (shown === 0) {
    shown = 12;
  }

  if (hours >= 12) {
    dayPeriod = "pm";
  }

  return { ...draft, hour: pad(shown), dayPeriod };
}

/**
 * The canonical time a draft whose `timeDraftUnits` all hold a value commits: `HH:mm`, or
 * `HH:mm:ss` at second precision. A 12-hour hour converts back: 12 AM is 00, 1 PM is 13.
 */
export function writeTime(draft: Draft, precision: TimePrecision, hourCycle: 12 | 24): string {
  let hours = Number(draft.hour);

  if (hourCycle === 12) {
    hours %= 12;

    if (draft.dayPeriod === "pm") {
      hours += 12;
    }
  }

  const time = `${pad(hours)}:${draft.minute}`;

  if (precision === "second") {
    return `${time}:${draft.second}`;
  }

  return time;
}
