import type { ParseResult } from "@angular/forms/signals";

/** The format options a number field root resolves its text from. */
export interface NumberFormatRequest {
  readonly locale: string;
  /** Null: `Intl.NumberFormat`'s default, 0. */
  readonly minimumFractionDigits: number | null;
  /** Null: `Intl.NumberFormat`'s default, the larger of the minimum and 3. */
  readonly maximumFractionDigits: number | null;
  /** True: the locale's grouping (`Intl`'s `"auto"`); false: none. */
  readonly useGrouping: boolean;
}

/**
 * @internal A root's formatter and the grammar of the text it accepts, derived from the locale's
 * `formatToParts` output: its minus sign, decimal and group separators, digits and group sizes.
 * Framework-free, so the Node checks (NF2) run it.
 */
export interface NumberSyntax {
  readonly formatter: Intl.NumberFormat;
  /** The locale's minus sign; ASCII `-` and U+2212 also type one. */
  readonly minus: string;
  readonly decimal: string;
  /** Every character that types the group separator, the locale's first; empty without grouping. */
  readonly groups: readonly string[];
  /** The locale's digits, 0 to 9; ASCII digits also type them. */
  readonly digits: readonly string[];
  /** The size of the last group before the decimal separator. */
  readonly primaryGroup: number;
  /** The size of every other group but the first, which may be shorter. */
  readonly secondaryGroup: number;
  /** The effective maximum fraction digits: none, and no decimal separator, at 0. */
  readonly maximumFractionDigits: number;
}

/** Bidi marks a locale's formatting puts around its minus sign (`ar-EG`); text ignores them. */
const bidiMarks = /[؜‎‏]/g;
const spaceGroups = [" ", " ", " "];
const apostropheGroups = ["'", "’"];

function partValue(parts: Intl.NumberFormatPart[], type: Intl.NumberFormatPartTypes): string {
  for (const part of parts) {
    if (part.type === type) {
      return part.value;
    }
  }

  throw new Error(`Intl.NumberFormat gave no ${type} part.`);
}

/** The group separator and its aliases: a space-like one also types the others, an apostrophe both. */
function groupCharacters(group: string): string[] {
  if (spaceGroups.includes(group)) {
    return [group, ...spaceGroups.filter((alias) => alias !== group)];
  }

  if (apostropheGroups.includes(group)) {
    return [group, ...apostropheGroups.filter((alias) => alias !== group)];
  }

  return [group];
}

/**
 * Resolves a root's formatter and grammar. `Intl.NumberFormat` throws a `RangeError` for a locale
 * it refuses and for fraction digits out of range or in the wrong order.
 */
export function numberSyntax(request: NumberFormatRequest): NumberSyntax {
  const options: Intl.NumberFormatOptions = {};

  if (request.minimumFractionDigits !== null) {
    options.minimumFractionDigits = request.minimumFractionDigits;
  }

  if (request.maximumFractionDigits !== null) {
    options.maximumFractionDigits = request.maximumFractionDigits;
  }

  // Omitted, `useGrouping` is the locale's own ("auto"); `true` would force "always".
  if (!request.useGrouping) {
    options.useGrouping = false;
  }

  const formatter = new Intl.NumberFormat(request.locale, options);
  const locale = formatter.resolvedOptions().locale;
  const plain = new Intl.NumberFormat(locale, { useGrouping: false });
  const digits: string[] = [];

  for (let digit = 0; digit <= 9; digit += 1) {
    digits.push(plain.format(digit).replace(bidiMarks, ""));
  }

  const signed = new Intl.NumberFormat(locale, { minimumFractionDigits: 1 }).formatToParts(-1.5);
  let groups: string[] = [];
  let primaryGroup = 0;
  let secondaryGroup = 0;

  if (request.useGrouping) {
    // Typing the group separator follows the locale's symbol and sizes even where its own
    // formatting wouldn't group a short number (Spanish `1234`).
    const grouped = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(1234567890);
    const integers: string[] = [];

    for (const part of grouped) {
      if (part.type === "integer") {
        integers.push(part.value);
      }
    }

    if (integers.length > 1) {
      groups = groupCharacters(partValue(grouped, "group"));
      primaryGroup = Array.from(integers[integers.length - 1] ?? "").length;
      secondaryGroup = primaryGroup;

      if (integers.length > 2) {
        secondaryGroup = Array.from(integers[integers.length - 2] ?? "").length;
      }
    }
  }

  return {
    formatter,
    minus: partValue(signed, "minusSign"),
    decimal: partValue(signed, "decimal"),
    groups,
    digits,
    primaryGroup,
    secondaryGroup,
    maximumFractionDigits: formatter.resolvedOptions().maximumFractionDigits ?? 3,
  };
}

/**
 * The text of a value: empty for null and for a value that isn't finite; else the formatter's,
 * with `Intl`'s sign (`-0,00` for -0.001 at two digits), except that -0 itself shows as 0.
 */
export function formatNumber(syntax: NumberSyntax, value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "";
  }

  if (Object.is(value, -0)) {
    return syntax.formatter.format(0);
  }

  return syntax.formatter.format(value);
}

function digitValue(syntax: NumberSyntax, character: string): number | null {
  if (character >= "0" && character <= "9") {
    return character.charCodeAt(0) - 48;
  }

  const index = syntax.digits.indexOf(character);

  if (index === -1) {
    return null;
  }

  return index;
}

type Token =
  | { readonly kind: "minus" }
  | { readonly kind: "digit"; readonly value: number }
  | { readonly kind: "group" }
  | { readonly kind: "decimal" };

/** The text's tokens without its bidi marks, or null for a character the grammar doesn't have. */
function tokenize(syntax: NumberSyntax, text: string): Token[] | null {
  const tokens: Token[] = [];

  for (const character of text.replace(bidiMarks, "")) {
    const digit = digitValue(syntax, character);

    if (digit !== null) {
      tokens.push({ kind: "digit", value: digit });
    } else if (character === syntax.minus || character === "-" || character === "−") {
      tokens.push({ kind: "minus" });
    } else if (character === syntax.decimal) {
      tokens.push({ kind: "decimal" });
    } else if (syntax.groups.includes(character)) {
      tokens.push({ kind: "group" });
    } else {
      return null;
    }
  }

  return tokens;
}

/** A text's parts, read with the grammar: a sign, the integer's digit groups and the fraction. */
interface NumberText {
  readonly negative: boolean;
  /** The integer's digits between group separators; one empty group without any digit. */
  readonly groups: readonly string[];
  readonly hasDecimal: boolean;
  readonly fraction: string;
}

/**
 * Reads `text` with the grammar, as a prefix of a number the user may still be typing: an
 * optional leading minus; integer digits, with group separators after a digit and never two in a
 * row; at most one decimal separator, not right after a group separator, while fraction digits
 * are allowed; then fraction digits up to the maximum. Null when it isn't one.
 */
function read(syntax: NumberSyntax, text: string): NumberText | null {
  const tokens = tokenize(syntax, text);

  if (tokens === null) {
    return null;
  }

  let negative = false;
  const groups: string[] = [""];
  let hasDecimal = false;
  let fraction = "";

  for (const [index, token] of tokens.entries()) {
    const current = groups[groups.length - 1] ?? "";

    if (token.kind === "minus") {
      if (index !== 0) {
        return null;
      }

      negative = true;
    } else if (token.kind === "digit") {
      if (hasDecimal) {
        if (fraction.length >= syntax.maximumFractionDigits) {
          return null;
        }

        fraction += String(token.value);
      } else {
        groups[groups.length - 1] = current + String(token.value);
      }
    } else if (token.kind === "group") {
      if (hasDecimal || current === "") {
        return null;
      }

      groups.push("");
    } else {
      const afterGroup = groups.length > 1 && current === "";

      if (hasDecimal || syntax.maximumFractionDigits === 0 || afterGroup) {
        return null;
      }

      hasDecimal = true;
    }
  }

  return { negative, groups, hasDecimal, fraction };
}

/** Whether `text` is a prefix of the grammar: what an edit may leave in the Input. */
export function acceptsNumberText(syntax: NumberSyntax, text: string): boolean {
  return read(syntax, text) !== null;
}

/** Whether every group separator stands at one of the locale's group positions. */
function grouped(syntax: NumberSyntax, groups: readonly string[]): boolean {
  if (groups.length === 1) {
    return true;
  }

  const last = groups.length - 1;

  for (const [index, group] of groups.entries()) {
    if (index === last) {
      if (group.length !== syntax.primaryGroup) {
        return false;
      }
    } else if (index === 0) {
      if (group.length === 0 || group.length > syntax.secondaryGroup) {
        return false;
      }
    } else if (group.length !== syntax.secondaryGroup) {
      return false;
    }
  }

  return true;
}

/**
 * Parses the whole text: empty is null; only a sign and/or decimal separator is
 * `numberIncomplete`; a group separator off the locale's group positions, a trailing one, text
 * outside the grammar and a number too large for `Number` are `numberInvalid`; anything else is
 * its number, never -0.
 */
export function parseNumberText(syntax: NumberSyntax, text: string): ParseResult<number | null> {
  if (text.replace(bidiMarks, "") === "") {
    return { value: null };
  }

  const parts = read(syntax, text);

  if (parts === null) {
    return { error: { kind: "numberInvalid" } };
  }

  const integer = parts.groups.join("");

  if (integer === "" && parts.fraction === "") {
    return { error: { kind: "numberIncomplete" } };
  }

  if (!grouped(syntax, parts.groups)) {
    return { error: { kind: "numberInvalid" } };
  }

  let source = `${integer || "0"}.${parts.fraction || "0"}`;

  if (parts.negative) {
    source = `-${source}`;
  }

  const value = Number(source);

  if (!Number.isFinite(value)) {
    return { error: { kind: "numberInvalid" } };
  }

  if (value === 0) {
    return { value: 0 };
  }

  return { value };
}
