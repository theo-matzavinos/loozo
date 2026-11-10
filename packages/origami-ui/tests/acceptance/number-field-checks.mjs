import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The number field's package-private grammar, formatter and step math in Node (NF2), through
// their framework-free sources, which no entry point exports. The sources import each other
// without an extension, as the library build resolves them; Node needs `.ts` added. Their other
// imports are types, which Node strips.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("./") && !specifier.endsWith(".ts")) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

async function source(name) {
  return import(pathToFileURL(resolve(`number-field/src/${name}.ts`)).href);
}

const { numberSyntax, formatNumber, acceptsNumberText, parseNumberText } =
  await source("number-format");
const { stepNumber } = await source("number-step");

function syntax(locale, options = {}) {
  return numberSyntax({
    locale,
    minimumFractionDigits: options.minimumFractionDigits ?? null,
    maximumFractionDigits: options.maximumFractionDigits ?? null,
    useGrouping: options.useGrouping ?? true,
  });
}

/** The parse result as `value`, `kind` or `null`, so a table reads plainly. */
function parsed(numbers, text) {
  const result = parseNumberText(numbers, text);

  if (result.error !== undefined) {
    return result.error.kind;
  }

  return result.value;
}

// Greek, the consumer's locale: `.` groups, `,` is the decimal separator.
const el = syntax("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

assert.equal(el.decimal, ",");
assert.deepEqual(el.groups, ["."]);
assert.equal(el.primaryGroup, 3);
assert.equal(el.secondaryGroup, 3);
assert.equal(el.maximumFractionDigits, 2);
assert.equal(formatNumber(el, 1234.5), "1.234,50");
assert.equal(formatNumber(el, null), "");
assert.equal(formatNumber(el, Number.NaN), "");
assert.equal(formatNumber(el, Number.POSITIVE_INFINITY), "");
assert.equal(formatNumber(el, -0), "0,00", "exactly -0 shows as 0");
assert.equal(formatNumber(el, -0.001), "-0,00", "Intl's sign of a negative value shown as zero");
assert.equal(formatNumber(el, -12.34), "-12,34");
assert.equal(formatNumber(el, 1.234), "1,23", "a value with more digits shows rounded");

for (const [text, expected] of [
  ["", null],
  ["-", "numberIncomplete"],
  [",", "numberIncomplete"],
  ["-,", "numberIncomplete"],
  ["−", "numberIncomplete"],
  ["−,", "numberIncomplete"],
  ["1", 1],
  ["1234", 1234],
  ["1234,", 1234],
  ["1234,5", 1234.5],
  [",5", 0.5],
  ["-,5", -0.5],
  ["−12,34", -12.34],
  ["-0", 0],
  ["-0,00", 0],
  ["1.234,56", 1234.56],
  ["1.234.567", 1234567],
  ["1.5", "numberInvalid"],
  ["12.34", "numberInvalid"],
  ["1.", "numberInvalid"],
  ["1234.567", "numberInvalid"],
  ["1.2345", "numberInvalid"],
  ["9".repeat(400), "numberInvalid"],
]) {
  assert.equal(parsed(el, text), expected, `el parse ${JSON.stringify(text)}`);
}

assert.ok(Object.is(parseNumberText(el, "-0").value, 0), "-0 parses to 0, not -0");

for (const [text, expected] of [
  ["", true],
  ["-", true],
  [",", true],
  ["1.5", true],
  ["12.34", true],
  ["1.", true],
  ["1.234,5", true],
  ["1.234,56", true],
  ["1.234,567", false],
  ["12,34x", false],
  ["x", false],
  ["abc", false],
  [".", false],
  ["-.", false],
  ["1..2", false],
  ["1.,5", false],
  ["1,2,3", false],
  ["1,2.3", false],
  ["--1", false],
  ["1-", false],
  ["+1", false],
  ["1e5", false],
  [" 1", false],
  ["1 ", false],
  ["€1", false],
]) {
  assert.equal(acceptsNumberText(el, text), expected, `el accepts ${JSON.stringify(text)}`);
}

// No fraction digits: no decimal separator at all.
const integers = syntax("el-GR", { maximumFractionDigits: 0 });

assert.equal(acceptsNumberText(integers, "12"), true);
assert.equal(acceptsNumberText(integers, "12,"), false);
assert.equal(acceptsNumberText(integers, ","), false);
assert.equal(formatNumber(integers, 12.6), "13");

// Intl's defaults: at most three fraction digits, and the minimum when it is larger.
assert.equal(syntax("el-GR").maximumFractionDigits, 3);
assert.equal(syntax("el-GR", { minimumFractionDigits: 4 }).maximumFractionDigits, 4);
assert.throws(
  () => syntax("el-GR", { minimumFractionDigits: 3, maximumFractionDigits: 2 }),
  RangeError,
);
assert.throws(() => syntax("not_a_locale"), RangeError);

// No grouping: a group separator isn't in the grammar.
const ungrouped = syntax("el-GR", { useGrouping: false });

assert.deepEqual(ungrouped.groups, []);
assert.equal(formatNumber(ungrouped, 1234567.5), "1234567,5");
assert.equal(acceptsNumberText(ungrouped, "1.234"), false);
assert.equal(parsed(ungrouped, "1234567,5"), 1234567.5);

// en-US: `,` groups, `.` is the decimal separator.
const en = syntax("en-US");

assert.equal(formatNumber(en, 1234567.891), "1,234,567.891");
assert.equal(parsed(en, "1,234.5"), 1234.5);
assert.equal(parsed(en, "1.5"), 1.5);
assert.equal(parsed(en, "12,34"), "numberInvalid");
assert.equal(acceptsNumberText(en, "1.2.3"), false);

// de-CH: both apostrophes group (WebKit formats with U+2019, the other engines with U+0027).
const ch = syntax("de-CH");

assert.equal(ch.decimal, ".");
assert.ok(ch.groups.includes("'") && ch.groups.includes("’"));
assert.equal(parsed(ch, "1'234.5"), 1234.5);
assert.equal(parsed(ch, "1’234.5"), 1234.5);

// fr-FR: U+202F groups; U+00A0 and an ordinary space too.
const fr = syntax("fr-FR");

assert.equal(formatNumber(fr, 1234567.891), "1 234 567,891");
assert.equal(parsed(fr, "1 234,5"), 1234.5);
assert.equal(parsed(fr, "1 234,5"), 1234.5);
assert.equal(parsed(fr, "1 234,5"), 1234.5);
assert.equal(acceptsNumberText(fr, "1.5"), false);

// ar-EG: Arabic-Indic digits and separators, an Arabic Letter Mark before the minus; ASCII
// digits also type, mixed in.
const ar = syntax("ar-EG");

assert.deepEqual(ar.digits, Array.from("٠١٢٣٤٥٦٧٨٩"));
assert.equal(formatNumber(ar, -1234.5), "؜-١٬٢٣٤٫٥");
assert.equal(parsed(ar, "؜-١٬٢٣٤٫٥"), -1234.5);
assert.equal(parsed(ar, "‏١٢٣"), 123);
assert.equal(parsed(ar, "1٢3٫5"), 123.5);
assert.equal(acceptsNumberText(ar, "1,234"), false);

// hi-IN: a primary group of three, then groups of two.
const hi = syntax("hi-IN");

assert.equal(hi.primaryGroup, 3);
assert.equal(hi.secondaryGroup, 2);
assert.equal(formatNumber(hi, 1234567), "12,34,567");
assert.equal(parsed(hi, "12,34,567"), 1234567);
assert.equal(parsed(hi, "1,234,567"), "numberInvalid");
assert.equal(parsed(hi, "12,345"), 12345);
assert.equal(parsed(hi, "123,456"), "numberInvalid");

// sv-SE: its minus is U+2212; ASCII `-` also types it.
const sv = syntax("sv-SE");

assert.equal(sv.minus, "−");
assert.equal(parsed(sv, "-1,5"), -1.5);
assert.equal(parsed(sv, "−1,5"), -1.5);

// Han decimal digits, which aren't \p{Nd}.
const han = syntax("zh-u-nu-hanidec");

assert.equal(formatNumber(han, 12), "一二");
assert.equal(parsed(han, "一二.五"), 12.5);

// Step math: aligned to min ?? 0, clamped, never against its direction, decimal-safe.
const unbounded = { min: undefined, max: undefined, step: 1 };

assert.equal(stepNumber(1234.5, 1, unbounded), 1235);
assert.equal(stepNumber(1234.5, -1, unbounded), 1234);
assert.equal(stepNumber(5, 1, unbounded), 6);
assert.equal(stepNumber(5, -1, unbounded), 4);
assert.equal(stepNumber(null, 1, unbounded), 0);
assert.equal(stepNumber(null, -1, unbounded), 0);
assert.equal(stepNumber(Number.NaN, 1, unbounded), 0);
assert.ok(Object.is(stepNumber(1, -1, unbounded), 0), "never -0");
assert.ok(Object.is(stepNumber(-1, 1, unbounded), 0), "never -0");

const cents = { min: undefined, max: undefined, step: 0.1 };

assert.equal(stepNumber(0.2, 1, cents), 0.3);
assert.equal(stepNumber(0.3, -1, cents), 0.2);
assert.equal(stepNumber(1.005, 1, { min: undefined, max: undefined, step: 0.01 }), 1.01);

const aligned = { min: 1, max: 10, step: 3 };

assert.equal(stepNumber(1, 1, aligned), 4);
assert.equal(stepNumber(2, 1, aligned), 4);
assert.equal(stepNumber(5, -1, aligned), 4);
assert.equal(stepNumber(7, 1, aligned), 10, "the next aligned value, 10");
assert.equal(stepNumber(9, 1, aligned), 10, "13 clamps to max");
assert.equal(stepNumber(10, 1, aligned), null, "up does nothing at max");
assert.equal(stepNumber(12, 1, aligned), null, "up does nothing above max");
assert.equal(stepNumber(12, -1, aligned), 10, "down from above max: 10, then clamped");
assert.equal(stepNumber(1, -1, aligned), null, "down does nothing at min");
assert.equal(stepNumber(-5, -1, aligned), null, "down does nothing below min");
assert.equal(stepNumber(-5, 1, aligned), 1, "up from below min clamps to min");
assert.equal(stepNumber(null, 1, aligned), 1, "up from null: min");
assert.equal(stepNumber(null, -1, aligned), 10, "down from null: max");
assert.equal(stepNumber(null, 1, { min: undefined, max: -5, step: 1 }), -5, "0 clamped to max");
assert.equal(stepNumber(null, -1, { min: 5, max: undefined, step: 1 }), 5, "0 clamped to min");
assert.equal(stepNumber(1000, 1, { min: 0, max: 1000, step: 1 }), null);
assert.equal(stepNumber(1234.5, 1, { min: 0, max: 1000, step: 1 }), null);
assert.equal(stepNumber(1234.5, -1, { min: 0, max: 1000, step: 1 }), 1000);

for (const step of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.equal(stepNumber(5, 1, { min: undefined, max: undefined, step }), null);
  assert.equal(stepNumber(null, -1, { min: undefined, max: undefined, step }), null);
}

// The result is always finite: past the scaled integers' safe range the step is plain arithmetic,
// and a result past `Number`'s range does nothing.
const finiteResult = (value, direction, range) => {
  const next = stepNumber(value, direction, range);

  assert.ok(next === null || Number.isFinite(next), `${value} ${direction} ${range.step}: ${next}`);

  return next;
};

assert.equal(finiteResult(0, 1, { min: undefined, max: undefined, step: 1e-309 }), 1e-309);
assert.equal(finiteResult(1, 1, { min: undefined, max: undefined, step: 1e-309 }), null);
assert.equal(
  finiteResult(1, 1, { min: undefined, max: 10, step: 1e-309 }),
  null,
  "not clamped to max",
);
assert.equal(finiteResult(1, -1, { min: undefined, max: undefined, step: 1e-309 }), null);
assert.equal(finiteResult(1e308, 1, { min: undefined, max: undefined, step: 1e308 }), null);
assert.equal(finiteResult(-1e308, -1, { min: undefined, max: undefined, step: 1e308 }), null);
assert.equal(finiteResult(1e308, -1, { min: undefined, max: undefined, step: 1e308 }), 0);
assert.equal(finiteResult(Number.MIN_VALUE, 1, unbounded), 1);
assert.equal(finiteResult(Number.MIN_VALUE, -1, unbounded), 0);
assert.equal(finiteResult(1, 1, { min: Number.MIN_VALUE, max: undefined, step: 1 }), 2);

// A step that writes moves strictly in its direction: a computed value with float noise counts
// its decimals at 15 significant digits, and plain arithmetic that lands back on the value steps
// once more, or does nothing.
const moved = (value, direction, range, expected) => {
  const next = stepNumber(value, direction, range);

  assert.equal(next, expected, `${value} ${direction} ${range.step}`);

  if (direction === 1) {
    assert.ok(next > value, `${value} up: strictly above`);
  } else {
    assert.ok(next < value, `${value} down: strictly below`);
  }
};

moved(0.1 + 0.2, 1, cents, 0.4);
moved(0.1 + 0.2, -1, cents, 0.2);
moved(1.1 + 0.1, 1, cents, 1.3);
moved(1.1 + 0.1, -1, cents, 1.1);
// 0.7 + 0.1 (0.7999999999999999) shows as 0.8: up goes to 0.9, not to 0.8, which would look like
// a step that did nothing.
moved(0.7 + 0.1, 1, cents, 0.9);
moved(0.7 + 0.1, -1, cents, 0.7);

// Sixty additions of 0.1 (5.999999999999995) scale exactly at their 15 places, not as a half that
// rounds onto the next grid point.
let sixtyTenths = 0;

for (let index = 0; index < 60; index++) {
  sixtyTenths += 0.1;
}

assert.equal(sixtyTenths, 5.999999999999995);
moved(sixtyTenths, 1, cents, 6);
moved(sixtyTenths, -1, cents, 5.9);
moved(sixtyTenths, 1, { min: undefined, max: undefined, step: 0.01 }, 6);
moved(sixtyTenths, -1, { min: undefined, max: undefined, step: 0.01 }, 5.99);
// An integer steps exactly, also past 15 significant digits.
moved(1e15 + 1, 1, unbounded, 1e15 + 2);
moved(1e15 + 1, -1, unbounded, 1e15);
moved(Number.MAX_SAFE_INTEGER, -1, unbounded, Number.MAX_SAFE_INTEGER - 1);
moved(Number.MAX_SAFE_INTEGER, 1, unbounded, Number.MAX_SAFE_INTEGER + 1);
moved(1234567890123456, 1, unbounded, 1234567890123457);
moved(1234567890123456, -1, unbounded, 1234567890123455);
// `min` 1e-20 leaves the scaled integers' safe range: plain arithmetic.
moved(0.1 + 0.2, -1, { min: 1e-20, max: undefined, step: 0.1 }, 0.20000000000000004);
assert.equal(stepNumber(1e20, 1, unbounded), null, "a step too small to change the value");
assert.equal(stepNumber(1e20, -1, unbounded), null);

// A bound that isn't finite is none.
assert.equal(stepNumber(5, 1, { min: Number.NaN, max: Number.NaN, step: 1 }), 6);
assert.equal(stepNumber(5, 1, { min: undefined, max: Number.POSITIVE_INFINITY, step: 1 }), 6);

console.log("number field checks passed");
