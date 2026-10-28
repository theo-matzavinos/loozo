import type { ParseResult } from "@angular/forms/signals";
import {
  ɵcanonicalDay as canonicalDay,
  ɵformatDay as formatDay,
  ɵparseDay as parseDay,
} from "@loozo/origami-ui/utils";
import type { DateFieldShape } from "./date-field-root";
import type { OrigamiDateFieldSegmentType } from "./date-field-segment-type";
import { unitValue } from "./date-field-unit";
import type { Draft } from "./date-field-unit";

const dateUnits: readonly OrigamiDateFieldSegmentType[] = ["year", "month", "day"];

/**
 * `ogDateField`'s value shape: a civil date `YYYY-MM-DD` (years 0001–9999) as year, month and day
 * units. A draft with every unit empty is null; one with some empty, a lone leading zero or a year
 * of fewer than four digits is incomplete; a complete one that names no day (31 February) is
 * invalid. Framework-free and package-private.
 */
export const dateValue: DateFieldShape = {
  units(): readonly OrigamiDateFieldSegmentType[] {
    return dateUnits;
  },
  format(value: string | null): Draft {
    const day = parseDay(value);

    if (day === null) {
      return {};
    }

    const [year, month, date] = formatDay(day).split("-");

    return { year, month, day: date };
  },
  parse(draft: Draft): ParseResult<string | null> {
    const year = draft.year ?? "";
    const month = draft.month ?? "";
    const day = draft.day ?? "";

    if (year === "" && month === "" && day === "") {
      return { value: null };
    }

    if (
      unitValue("year", year) === null ||
      unitValue("month", month) === null ||
      unitValue("day", day) === null
    ) {
      return { error: { kind: "dateIncomplete" } };
    }

    const value = canonicalDay(`${year}-${month}-${day}`);

    if (value === null) {
      return { error: { kind: "dateInvalid" } };
    }

    return { value };
  },
  canonical(text: string): string | null {
    return canonicalDay(text);
  },
};
