import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The OTP field's package-private code rules in Node (OT2), through their framework-free source,
// which no entry point exports and which imports nothing.
const { normalizeCode, acceptsCode, isComplete } = await import(
  pathToFileURL(resolve("otp-field/src/otp-code.ts")).href
);

// What an edit leaves, read as a code: NFKC, then without whitespace and dash-like separators.
// Accepted means ASCII digits only, at most six.
for (const [text, normalized, accepted] of [
  ["123456", "123456", true],
  ["１２３４５６", "123456", true],
  ["１２３\u3000４５６", "123456", true],
  ["１２－３４－５６", "123456", true],
  ["123 456", "123456", true],
  ["12-34-56", "123456", true],
  ["12\u201334\u201456", "123456", true],
  ["12\u201034\u201556", "123456", true],
  ["12\u221234", "1234", true],
  ["12\u00a034\u202f56", "123456", true],
  ["\t12 34\n", "1234", true],
  ["①②③④⑤⑥", "123456", true],
  ["¹²³⁴⁵⁶", "123456", true],
  ["𝟏𝟐𝟑𝟒𝟓𝟔", "123456", true],
  ["⑩", "10", true],
  ["½", "1\u20442", false],
  ["⒈", "1.", false],
  ["١٢٣٤٥٦", "١٢٣٤٥٦", false],
  ["12ab34", "12ab34", false],
  ["１２ａｂ３４", "12ab34", false],
  ["12.34.56", "12.34.56", false],
  ["12/34", "12/34", false],
  ["12_34", "12_34", false],
  ["+123456", "+123456", false],
  ["1234567", "1234567", false],
  ["", "", true],
  ["   ", "", true],
]) {
  assert.equal(normalizeCode(text), normalized, `normalizeCode(${JSON.stringify(text)})`);
  assert.equal(
    acceptsCode(normalizeCode(text), 6),
    accepted,
    `acceptsCode of ${JSON.stringify(text)}`,
  );
}

// The capacity is the length, whatever it is.
assert.equal(acceptsCode("", 6), true);
assert.equal(acceptsCode("123456", 6), true);
assert.equal(acceptsCode("1234567", 6), false);
assert.equal(acceptsCode("1234", 4), true);
assert.equal(acceptsCode("12345", 4), false);
assert.equal(acceptsCode("12a", 6), false);
assert.equal(acceptsCode(" 1", 6), false, "acceptsCode takes a normalized code");

// A whole code: exactly `length` ASCII digits, a leading zero kept.
assert.equal(isComplete("012345", 6), true);
assert.equal(isComplete("123456", 6), true);
assert.equal(isComplete("12345", 6), false);
assert.equal(isComplete("1234567", 6), false);
assert.equal(isComplete("12ab34", 6), false);
assert.equal(isComplete("", 6), false);
assert.equal(isComplete("１２３４５６", 6), false, "isComplete reads the value as written");
assert.equal(isComplete("1234", 4), true);

console.log("OTP field checks passed");
