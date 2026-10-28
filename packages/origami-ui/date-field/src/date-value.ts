import type { ParseResult } from "@angular/forms/signals";
import {
  ɵcanonicalDay as canonicalDay,
  ɵformatDay as formatDay,
  ɵparseDay as parseDay,
} from "@loozo/origami-ui/utils";
import type { DateFieldShape } from "./date-field-root";
import type { OrigamiDateFieldSegmentType } from "./date-field-segment-type";
import { draftFill } from "./date-field-unit";
import type { Draft } from "./date-field-unit";

/** A civil date's units, also the first half of a date-time's. */
export const dateUnits: readonly OrigamiDateFieldSegmentType[] = ["year", "month", "day"];

/** The draft that shows a canonical `YYYY-MM-DD` day; empty for anything else. */
export function formatDate(value: string | null): Draft {
  const day = parseDay(value);

  if (day === null) {
    return {};
  }

  const [year, month, date] = formatDay(day).split("-");

  return { year, month, day: date };
}

/**
 * The canonical day a draft whose date units all hold a value names, or null when there is no
 * such day (31 February).
 */
export function writeDate(draft: Draft): string | null {
  return canonicalDay(`${draft.year}-${draft.month}-${draft.day}`);
}

/**
 * `ogDateField`'s value shape: a civil date `YYYY-MM-DD` (years 0001–9999) as year, month and day
 * units. A draft with every unit empty is null; one with some empty, a lone leading zero or a year
 * of fewer than four digits is incomplete; a complete one that names no day (31 February) is
 * invalid. Framework-free and package-private.
 */
export const dateValue: DateFieldShape = {
  units: () => dateUnits,
  format: formatDate,
  parse(draft: Draft): ParseResult<string | null> {
    const fill = draftFill(draft, dateUnits);

    if (fill === "empty") {
      return { value: null };
    }

    if (fill === "incomplete") {
      return { error: { kind: "dateIncomplete" } };
    }

    const value = writeDate(draft);

    if (value === null) {
      return { error: { kind: "dateInvalid" } };
    }

    return { value };
  },
  canonical(text: string): string | null {
    return canonicalDay(text);
  },
};
