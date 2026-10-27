import type { OrigamiDateFieldSegmentType } from "./date-field-segment-type";
import { digitValue } from "./date-field-unit";

/** One part of a resolved layout: a unit, or literal text between units. */
export interface LayoutPart {
  readonly type: OrigamiDateFieldSegmentType | "literal";
  /** The literal's text; empty for a unit. */
  readonly text: string;
}

/**
 * The locale's layout of a root's units (F6): what makes a root's markup and names, resolved once
 * from `Intl` and carried by the server to a hydrating root as its `data-layout` seed. Pure data,
 * complete with no segment mounted. Framework-free and package-private.
 */
export interface DateFieldLayout {
  /** The locale this layout was resolved for; month names and day periods use it. */
  readonly locale: string;
  /** The units and the literals between them, in the locale's order. */
  readonly parts: readonly LayoutPart[];
  /** Each laid-out unit's localized name (`Intl.DisplayNames`, `dateTimeField`). */
  readonly labels: Readonly<Partial<Record<OrigamiDateFieldSegmentType, string>>>;
  /** The resolved hour cycle with an hour unit, else null. */
  readonly hourCycle: 12 | 24 | null;
  /** The localized AM and PM names with a 12-hour hour, else null. */
  readonly periods: readonly [string, string] | null;
  /** The locale's numbering system's digits 0–9, as ten characters. */
  readonly digits: string;
}

/** What a root lays out: its units, without the day period, and its hour cycle override. */
export interface LayoutRequest {
  readonly units: readonly OrigamiDateFieldSegmentType[];
  /** 12 or 24 forces the hour cycle; null follows the locale. Read only with an hour unit. */
  readonly hourCycle: 12 | 24 | null;
}

/** A fixed reference instant: formatting input only, never a value or today. */
const reference = Date.UTC(2001, 10, 22, 13, 45, 56);

const unitTypes: readonly OrigamiDateFieldSegmentType[] = [
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
  "dayPeriod",
];

function isUnit(type: unknown): type is OrigamiDateFieldSegmentType {
  return typeof type === "string" && unitTypes.includes(type as OrigamiDateFieldSegmentType);
}

function formatOptions({ units, hourCycle }: LayoutRequest): Intl.DateTimeFormatOptions {
  const options: Intl.DateTimeFormatOptions = { calendar: "gregory", timeZone: "UTC" };

  for (const unit of units) {
    switch (unit) {
      case "year":
      case "month":
      case "day":
      case "hour":
        options[unit] = "numeric";
        break;
      case "minute":
      case "second":
        options[unit] = "2-digit";
        break;
    }
  }

  if (units.includes("hour") && hourCycle === 12) {
    options.hourCycle = "h12";
  } else if (units.includes("hour") && hourCycle === 24) {
    options.hourCycle = "h23";
  }

  return options;
}

function cycleOf(resolved: string | undefined): 12 | 24 {
  if (resolved === "h11" || resolved === "h12") {
    return 12;
  }

  return 24;
}

function periodAt(locale: string, hour: number): string {
  const format = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    hour: "numeric",
    hourCycle: "h12",
  });

  for (const part of format.formatToParts(Date.UTC(2001, 10, 22, hour))) {
    if (part.type === "dayPeriod") {
      return part.value;
    }
  }

  return "";
}

function digitsOf(locale: string, numberingSystem: string): string {
  const format = new Intl.NumberFormat(locale, { numberingSystem, useGrouping: false });
  let digits = "";

  for (let digit = 0; digit <= 9; digit += 1) {
    digits += format.format(digit);
  }

  return digits;
}

/**
 * The layout of `request`'s units in `locale` from this runtime's `Intl`: the order and literals
 * of `formatToParts`, Gregorian, in UTC, on a fixed reference instant, never today.
 */
export function resolveLayout(locale: string, request: LayoutRequest): DateFieldLayout {
  const format = new Intl.DateTimeFormat(locale, formatOptions(request));
  const resolved = format.resolvedOptions();
  const hasHour = request.units.includes("hour");
  let hourCycle: 12 | 24 | null = null;

  if (hasHour) {
    hourCycle = cycleOf(resolved.hourCycle);
  }

  const parts: LayoutPart[] = [];

  for (const part of format.formatToParts(reference)) {
    if (part.type === "literal") {
      parts.push({ type: "literal", text: part.value });
    } else if (isUnit(part.type)) {
      parts.push({ type: part.type, text: "" });
    }
  }

  const names = new Intl.DisplayNames(locale, { type: "dateTimeField" });
  const labels: Partial<Record<OrigamiDateFieldSegmentType, string>> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      labels[part.type] = names.of(part.type) ?? part.type;
    }
  }

  let periods: readonly [string, string] | null = null;

  if (hourCycle === 12) {
    periods = [periodAt(resolved.locale, 1), periodAt(resolved.locale, 13)];
  }

  return {
    locale: resolved.locale,
    parts,
    labels,
    hourCycle,
    periods,
    digits: digitsOf(resolved.locale, resolved.numberingSystem),
  };
}

/** Serializes a layout for the root host's `data-layout`. */
export function writeLayout(layout: DateFieldLayout): string {
  return JSON.stringify(layout);
}

/** Whether `Intl` accepts `locale`; the layout's consumers format with it. */
function knownLocale(locale: string): boolean {
  try {
    new Intl.DateTimeFormat(locale);
  } catch {
    return false;
  }

  return true;
}

/** Whether `characters` are ten consecutive code points from a Unicode decimal zero. */
function decimalRun(characters: readonly string[]): boolean {
  if (characters.length !== 10 || digitValue(characters[0]) !== 0) {
    return false;
  }

  const zero = characters[0].codePointAt(0)!;

  for (let index = 1; index < 10; index += 1) {
    if (characters[index].codePointAt(0) !== zero + index) {
      return false;
    }
  }

  return true;
}

/**
 * Whether `digits` are one numbering system's digits 0 to 9, in order. Unicode encodes each
 * decimal (`\p{Nd}`) system's ten as consecutive code points from its zero, which holds even for a
 * system this runtime's `Intl` lacks; any other one (Han `hanidec`, 〇一二三四五六七八九) must be
 * a system this runtime's `Intl` renders.
 */
function numberingDigits(digits: string): boolean {
  if (decimalRun(Array.from(digits))) {
    return true;
  }

  for (const numberingSystem of Intl.supportedValuesOf("numberingSystem")) {
    if (digitsOf("en", numberingSystem) === digits) {
      return true;
    }
  }

  return false;
}

/**
 * Reads a `data-layout` seed, a DOM attribute and so untrusted, for the root that `request`
 * describes: null when it is absent or isn't a layout this runtime's `Intl` could have resolved
 * for it. A layout names a locale `Intl` accepts; lays out the requested units, plus the day period
 * exactly when its hour cycle is 12, each once, with literals as the other parts; has the hour
 * cycle the request forces, any with an hour unit and none without; has AM and PM names exactly
 * with the day period; and has one numbering system's digits 0 to 9 in order.
 */
export function readLayout(text: string | null, request: LayoutRequest): DateFieldLayout | null {
  if (text === null) {
    return null;
  }

  let data: unknown;

  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof data !== "object" || data === null) {
    return null;
  }

  const locale: unknown = Reflect.get(data, "locale");
  const parts: unknown = Reflect.get(data, "parts");
  const labels: unknown = Reflect.get(data, "labels");
  const hourCycle: unknown = Reflect.get(data, "hourCycle");
  const periods: unknown = Reflect.get(data, "periods");
  const digits: unknown = Reflect.get(data, "digits");

  if (
    typeof locale !== "string" ||
    !knownLocale(locale) ||
    !Array.isArray(parts) ||
    typeof labels !== "object" ||
    labels === null ||
    (hourCycle !== 12 && hourCycle !== 24 && hourCycle !== null) ||
    typeof digits !== "string" ||
    !numberingDigits(digits)
  ) {
    return null;
  }

  const hasHour = request.units.includes("hour");

  if (hasHour !== (hourCycle !== null)) {
    return null;
  }

  if (hasHour && request.hourCycle !== null && hourCycle !== request.hourCycle) {
    return null;
  }

  const units = [...request.units];

  if (hourCycle === 12) {
    units.push("dayPeriod");
  }

  const readParts: LayoutPart[] = [];
  const readLabels: Partial<Record<OrigamiDateFieldSegmentType, string>> = {};

  for (const part of parts) {
    if (typeof part !== "object" || part === null) {
      return null;
    }

    const type: unknown = Reflect.get(part, "type");
    const partText: unknown = Reflect.get(part, "text");

    if (typeof partText !== "string") {
      return null;
    }

    if (type === "literal") {
      readParts.push({ type, text: partText });
      continue;
    }

    if (!isUnit(type) || !units.includes(type) || readLabels[type] !== undefined) {
      return null;
    }

    const label: unknown = Reflect.get(labels, type);

    if (typeof label !== "string") {
      return null;
    }

    readParts.push({ type, text: "" });
    readLabels[type] = label;
  }

  for (const unit of units) {
    if (readLabels[unit] === undefined) {
      return null;
    }
  }

  let readPeriods: readonly [string, string] | null = null;

  if (hourCycle === 12) {
    if (
      !Array.isArray(periods) ||
      periods.length !== 2 ||
      typeof periods[0] !== "string" ||
      typeof periods[1] !== "string"
    ) {
      return null;
    }

    readPeriods = [periods[0], periods[1]];
  } else if (periods !== null) {
    return null;
  }

  return {
    locale,
    parts: readParts,
    labels: readLabels,
    hourCycle,
    periods: readPeriods,
    digits,
  };
}
