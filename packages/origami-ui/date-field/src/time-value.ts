import type { Signal } from "@angular/core";
import type { ParseResult } from "@angular/forms/signals";
import type { DateFieldShape } from "./date-field-root";
import type { OrigamiDateFieldSegmentType } from "./date-field-segment-type";
import { unitValue } from "./date-field-unit";
import type { Draft, UnitContext } from "./date-field-unit";

const minuteUnits: readonly OrigamiDateFieldSegmentType[] = ["hour", "minute"];
const secondUnits: readonly OrigamiDateFieldSegmentType[] = ["hour", "minute", "second"];

/** A wall-clock time at either precision: `HH:mm` or `HH:mm:ss`, 00:00 to 23:59:59. */
const canonicalTime = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

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
export function timeValue(precision: Signal<"minute" | "second">): DateFieldShape {
  function units(): readonly OrigamiDateFieldSegmentType[] {
    if (precision() === "second") {
      return secondUnits;
    }

    return minuteUnits;
  }

  return {
    units,
    format(value: string | null, { hourCycle }: UnitContext): Draft {
      const match = canonicalTime.exec(value ?? "");

      if (match === null) {
        return {};
      }

      const [, hour, minute, second = "00"] = match;
      let draft: Draft = { hour, minute };

      if (precision() === "second") {
        draft = { hour, minute, second };
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
    },
    parse(draft: Draft, { hourCycle }: UnitContext): ParseResult<string | null> {
      const laidOut = [...units()];

      if (hourCycle === 12) {
        laidOut.push("dayPeriod");
      }

      let empty = true;
      let complete = true;

      for (const unit of laidOut) {
        const entry = draft[unit] ?? "";

        if (entry !== "") {
          empty = false;
        }

        if (unitValue(unit, entry) === null) {
          complete = false;
        }
      }

      if (empty) {
        return { value: null };
      }

      if (!complete) {
        return { error: { kind: "timeIncomplete" } };
      }

      let hours = Number(draft.hour);

      if (hourCycle === 12) {
        hours %= 12;

        if (draft.dayPeriod === "pm") {
          hours += 12;
        }
      }

      const value = `${pad(hours)}:${draft.minute}`;

      if (precision() === "second") {
        return { value: `${value}:${draft.second}` };
      }

      return { value };
    },
    canonical(text: string): string | null {
      if (!canonicalTime.test(text)) {
        return null;
      }

      return text;
    },
  };
}
