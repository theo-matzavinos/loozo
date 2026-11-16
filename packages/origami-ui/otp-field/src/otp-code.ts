/**
 * Whitespace and the dash-like separators U+002D, U+2010–U+2015 and U+2212 that a code may be
 * written with: `123 456`, `12-34-56`, `12–34—56`. NFKC has already mapped full-width forms to
 * these.
 */
const SEPARATORS = /[\s\-\u2010-\u2015\u2212]/gu;

/** ASCII digits only. */
const DIGITS = /^[0-9]*$/;

/**
 * The text an edit leaves, read as a code: NFKC, then without whitespace and dash-like
 * separators. NFKC maps full-width digits, spaces and hyphens to ASCII (`１２－３４` is `12-34`), and
 * compatibility digits to the digits they denote (`①`, `²` and `𝟏` are `1`, `2` and `1`; `⑩` is
 * `10`); other characters stay as they are, so `½` (`1⁄2`), `⒈` (`1.`), Arabic-Indic digits and
 * letters remain and the code isn't accepted.
 */
export function normalizeCode(text: string): string {
  return text.normalize("NFKC").replace(SEPARATORS, "");
}

/** Whether `code`, already normalized, may be left by an edit: ASCII digits only, at most `length`. */
export function acceptsCode(code: string, length: number): boolean {
  return code.length <= length && DIGITS.test(code);
}

/** Whether `value` is a whole code: exactly `length` ASCII digits. */
export function isComplete(value: string, length: number): boolean {
  return value.length === length && DIGITS.test(value);
}
