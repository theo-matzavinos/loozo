import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

// The source-level half of matrix-summary.mjs's skip rule, so a forbidden skip fails in seconds instead of
// after the matrix. The summary accepts only listed hydration applicability skips in hydration.spec.ts;
// any skip, fixme, expected failure or focus elsewhere can never pass it. Any receiver counts
// (`test.step.skip`, `test.info().skip`, `test.describe.serial.only`), whitespace, line breaks and comments may
// precede the `(`, and the static form `{ annotation: { type: "skip" } }` counts too, with comments around its
// `:`. This guards against accidental skips, not deliberate evasion. A comment that names such a call also
// fails; reword it.
const directory = "tests/acceptance";
// Whitespace, or a comment that ends at its first terminator, so adjacent comments can't backtrack exponentially.
const gap = String.raw`(?:\s|/\*(?:(?!\*/)[\s\S])*\*/|//[^\n]*)*`;
const forbidden = [
  new RegExp(String.raw`\.(?:skip|fixme|fail|only)${gap}\(`, "g"),
  new RegExp(String.raw`\btype${gap}:${gap}["'\`](?:skip|fixme|fail)["'\`]`, "g"),
];
const violations = [];

for (const name of await readdir(directory)) {
  if (!name.endsWith(".spec.ts") || name === "hydration.spec.ts") {
    continue;
  }

  const source = await readFile(`${directory}/${name}`, "utf8");

  for (const pattern of forbidden) {
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split("\n").length;

      violations.push(`${name}:${line}: ${match[0]}`);
    }
  }
}

assert.deepEqual(
  violations,
  [],
  "Only hydration.spec.ts may skip, and only for a listed applicability case (matrix-summary.mjs); branch on project metadata instead",
);
console.log("Skip check: no skip, fixme, fail or only outside hydration.spec.ts.");
