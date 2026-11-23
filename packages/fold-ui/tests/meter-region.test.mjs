// Runs the built meterRegion (dist/), which Node loads by stripping its types: native <meter>'s
// regions in value units, over Origami's raw bounds normalized as Origami normalizes them.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

const dist = new URL("../dist/", import.meta.url);
const { meterRegion } = await import(new URL("components/meter/meter-region.ts", dist).href);

const omitted = NaN;

// input: [min, max, value, low, high, optimum]
const cases = [
  // No finite threshold: no region.
  { input: [0, 100, 0, omitted, omitted, omitted], expected: null },
  { input: [0, 100, 42, omitted, omitted, omitted], expected: null },
  { input: [0, 100, 100, omitted, omitted, omitted], expected: null },
  { input: [10, 40, 25, -Infinity, Infinity, Infinity], expected: null },

  // Optimum below low: lower is better.
  { input: [0, 100, 60, 60, 85, 0], expected: "optimum" },
  { input: [0, 100, 85, 60, 85, 0], expected: "suboptimum" },
  { input: [10, 40, 35, 20, 30, -100], expected: "worst" },
  { input: [10, 40, 35, 10, 30, -100], expected: "suboptimum" },
  { input: [10, 40, 39, 99, 30, 0], expected: "optimum" },
  { input: [0, 100, 81, 80, 20, 0], expected: "worst" },
  { input: [0, 100, 80, 80, 20, 0], expected: "optimum" },
  { input: [0, 100, 80, 80, 20, 80], expected: "optimum" },

  // Optimum above high: higher is better.
  { input: [0, 100, 20, 20, 50, 100], expected: "suboptimum" },
  { input: [0, 100, 50, 20, 50, 100], expected: "optimum" },
  { input: [10, 40, 15, 20, 30, 100], expected: "worst" },
  { input: [10, 40, 15, 20, 40, 100], expected: "suboptimum" },

  // Optimum inside the band.
  { input: [0, 100, 20, 20, 80, 50], expected: "optimum" },
  { input: [0, 100, 80, 20, 80, 50], expected: "optimum" },
  { input: [0, 100, 10, 20, 80, 50], expected: "suboptimum" },
  { input: [0, 100, 90, 20, 80, 50], expected: "suboptimum" },
  { input: [10, 40, 10, 0, 30, 25], expected: "optimum" },
  { input: [10, 40, 40, 20, 44, 25], expected: "optimum" },

  // Omitted optimum: the midpoint.
  { input: [10, 40, 40, 20, 30, omitted], expected: "suboptimum" },
  { input: [0, 100, 70, 60, 80, omitted], expected: "suboptimum" },
  { input: [0, 140, 70, 60, 80, omitted], expected: "optimum" },

  // Empty and huge ranges.
  { input: [20, 20, 20, 50, 0, 100], expected: "optimum" },
  { input: [-1e308, 1e308, 5e307, -1, 1, omitted], expected: "suboptimum" },

  // Raw bounds that Origami normalizes: max raised to min, non-finite bounds defaulted.
  { input: [20, 10, 20, 20, omitted, omitted], expected: "optimum" },
  { input: [0, NaN, 90, 60, 85, 0], expected: "worst" },
  { input: [NaN, Infinity, 90, 60, 85, 0], expected: "worst" },
];

describe("meterRegion", () => {
  for (const { input, expected } of cases) {
    const [min, max, value, low, high, optimum] = input;

    test(`[${input.join(", ")}] → ${expected ?? "null"}`, () => {
      const region = meterRegion(low, high, optimum, () => [min, max, value]);

      assert.equal(region, expected);
    });
  }

  test("doesn't read the bounds while no threshold is set", () => {
    const region = meterRegion(omitted, omitted, omitted, () => {
      throw new Error("bounds read");
    });

    assert.equal(region, null);
  });
});
