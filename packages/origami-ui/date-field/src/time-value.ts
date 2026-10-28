import type { Signal } from "@angular/core";
import type { ParseResult } from "@angular/forms/signals";
import type { DateFieldShape } from "./date-field-root";
import { draftFill } from "./date-field-unit";
import type { Draft, UnitContext } from "./date-field-unit";
import { formatTime, readTime, timeDraftUnits, timeUnits, writeTime } from "./wall-time";
import type { TimePrecision } from "./wall-time";

/**
 * `ogTimeField`'s value shape: a wall-clock time, `HH:mm` at minute precision and `HH:mm:ss` at
 * second precision, as hour, minute and, at second precision, second units, plus the day period
 * in a 12-hour cycle. A value of either precision shows: a missing second shows as 00, and minute
 * precision leaves a second out of the draft, so the next edit writes the value without it. A
 * draft with every laid-out unit empty is null; one with some empty or a lone leading zero is
 * incomplete; every complete one is a real time. The 12-hour cycle shows midnight as 12 AM and
 * noon as 12 PM. Framework-free and package-private.
 * @param precision - The root's effective precision, read by the layout, by `format` and by
 *   `parse`. A change of it after the layout settles refreshes the draft (the Context's job).
 */
export function timeValue(precision: Signal<TimePrecision>): DateFieldShape {
  return {
    units: () => timeUnits(precision()),
    format(value: string | null, { hourCycle }: UnitContext): Draft {
      const time = readTime(value ?? "");

      if (time === null) {
        return {};
      }

      return formatTime(time, precision(), hourCycle);
    },
    parse(draft: Draft, { hourCycle }: UnitContext): ParseResult<string | null> {
      const fill = draftFill(draft, timeDraftUnits(precision(), hourCycle));

      if (fill === "empty") {
        return { value: null };
      }

      if (fill === "incomplete") {
        return { error: { kind: "timeIncomplete" } };
      }

      return { value: writeTime(draft, precision(), hourCycle) };
    },
    canonical(text: string): string | null {
      if (readTime(text) === null) {
        return null;
      }

      return text;
    },
  };
}
