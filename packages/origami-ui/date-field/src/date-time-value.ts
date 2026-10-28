import type { Signal } from "@angular/core";
import type { ParseResult } from "@angular/forms/signals";
import { ɵcanonicalDay as canonicalDay } from "@loozo/origami-ui/utils";
import type { DateFieldShape } from "./date-field-root";
import type { OrigamiDateFieldSegmentType } from "./date-field-segment-type";
import { draftFill } from "./date-field-unit";
import type { Draft, UnitContext } from "./date-field-unit";
import { dateUnits, formatDate, writeDate } from "./date-value";
import { formatTime, readTime, timeDraftUnits, timeUnits, writeTime } from "./wall-time";
import type { TimePrecision, WallTime } from "./wall-time";

const minuteUnits: readonly OrigamiDateFieldSegmentType[] = [...dateUnits, ...timeUnits("minute")];
const secondUnits: readonly OrigamiDateFieldSegmentType[] = [...dateUnits, ...timeUnits("second")];

/** A date-time's halves: the canonical day before the `T`, the time after it. */
function readDateTime(text: string): { readonly date: string; readonly time: WallTime } | null {
  const separator = text.indexOf("T");

  if (separator === -1) {
    return null;
  }

  const date = canonicalDay(text.slice(0, separator));
  const time = readTime(text.slice(separator + 1));

  if (date === null || time === null) {
    return null;
  }

  return { date, time };
}

/**
 * `ogDateTimeField`'s value shape: a local date and time with no time zone,
 * `YYYY-MM-DDTHH:mm` at minute precision and `YYYY-MM-DDTHH:mm:ss` at second precision, as the
 * date's year, month and day units and the time's, plus the day period in a 12-hour cycle. Each
 * half is the date's and the time's shape: a real Gregorian day in 0001–9999, a time 00:00 to
 * 23:59:59, a value of either precision showing as the time root's does. A zone, an offset or a
 * `Z` makes a value not canonical. A draft with every laid-out unit empty is null; one with some
 * empty is incomplete (`dateTimeIncomplete`); a complete one whose date names no day (31
 * February) is invalid (`dateInvalid`). Framework-free and package-private.
 * @param precision - The root's effective precision, read by the layout, by `format` and by
 *   `parse`. A change of it after the layout settles refreshes the draft (the Context's job).
 */
export function dateTimeValue(precision: Signal<TimePrecision>): DateFieldShape {
  return {
    units() {
      if (precision() === "second") {
        return secondUnits;
      }

      return minuteUnits;
    },
    format(value: string | null, { hourCycle }: UnitContext): Draft {
      const dateTime = readDateTime(value ?? "");

      if (dateTime === null) {
        return {};
      }

      return {
        ...formatDate(dateTime.date),
        ...formatTime(dateTime.time, precision(), hourCycle),
      };
    },
    parse(draft: Draft, { hourCycle }: UnitContext): ParseResult<string | null> {
      const units = [...dateUnits, ...timeDraftUnits(precision(), hourCycle)];
      const fill = draftFill(draft, units);

      if (fill === "empty") {
        return { value: null };
      }

      if (fill === "incomplete") {
        return { error: { kind: "dateTimeIncomplete" } };
      }

      const date = writeDate(draft);

      if (date === null) {
        return { error: { kind: "dateInvalid" } };
      }

      return { value: `${date}T${writeTime(draft, precision(), hourCycle)}` };
    },
    canonical(text: string): string | null {
      if (readDateTime(text) === null) {
        return null;
      }

      return text;
    },
  };
}
