import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// SA4, SA5 (wheel), SA6, SA7 and SA9 in Node: the ScrollArea's package-private geometry, through
// its framework-free source, which no entry point exports. Positions are normalized (0 at the
// axis start, range at its end); only the horizontal axis depends on the direction.
const geometry = await import(
  pathToFileURL(resolve("scroll-area/src/scroll-area-geometry.ts")).href
);
const {
  normalizedPosition,
  railPoint,
  requestedLength,
  scrollProgress,
  scrollRange,
  thumbTravel,
  toNative,
  wheelForward,
  wheelTarget,
} = geometry;

// Requested length: the rail scaled by the visible fraction, the whole rail without overflow.
assert.equal(requestedLength(228, 230, 2300), 22.8);
assert.equal(requestedLength(228, 230, 230), 228);
assert.equal(requestedLength(228, 230, 100), 228);
assert.equal(scrollRange(2300, 230), 2070);
assert.equal(scrollRange(100, 230), 0);

// Travel from a used length: a CSS minimum longer than the rail leaves no travel.
assert.equal(thumbTravel(228, 28.5), 199.5);
assert.equal(thumbTravel(14, 18), 0);

// Progress, LTR and vertical: clamped at both ends, never a division by zero.
const range = 200;

for (const [native, expected] of [
  [-20, 0],
  [0, 0],
  [100, 0.5],
  [200, 1],
  [220, 1],
]) {
  assert.equal(
    scrollProgress(normalizedPosition("x", false, native), range),
    expected,
    `LTR ${native}`,
  );
  assert.equal(
    scrollProgress(normalizedPosition("y", true, native), range),
    expected,
    `vertical RTL ${native}`,
  );
}

// RTL horizontal: scrollLeft runs 0…−range; an overscrolled +20 is the start, −range − 20 the end.
for (const [native, expected] of [
  [20, 0],
  [0, 0],
  [-100, 0.5],
  [-200, 1],
  [-220, 1],
]) {
  assert.equal(
    scrollProgress(normalizedPosition("x", true, native), range),
    expected,
    `RTL ${native}`,
  );
}

assert.equal(scrollProgress(50, 0), 0);
// Math.abs(scrollLeft) would map an RTL overscroll of +20 to 0.1 instead of the start.
assert.notEqual(
  scrollProgress(Math.abs(20), range),
  scrollProgress(normalizedPosition("x", true, 20), range),
);

// The one inverse: only horizontal positions are negated in RTL.
assert.deepEqual(toNative("y", false, 120), { top: 120 });
assert.deepEqual(toNative("y", true, 120), { top: 120 });
assert.deepEqual(toNative("x", false, 120), { left: 120 });
assert.deepEqual(toNative("x", true, 120), { left: -120 });

// The rail point: from the track's left/top, from its right only for horizontal RTL, converted
// through the rect-to-layout ratio, minus the start inset.
const track = { start: 100, end: 300, size: 200 };

assert.equal(railPoint("x", false, 150, track, 200, 1), 49);
assert.equal(railPoint("x", true, 150, track, 200, 1), 149);
assert.equal(railPoint("y", false, 150, track, 200, 1), 49);
assert.equal(railPoint("y", true, 150, track, 200, 1), 49);

const scaled = { start: 100, end: 200, size: 100 };

assert.equal(railPoint("x", false, 150, scaled, 200, 1), 99);
assert.equal(railPoint("x", true, 150, scaled, 200, 1), 99);
assert.equal(railPoint("y", false, 125, scaled, 200, 1), 49);

// Wheel: line deltas × 16, page deltas × the client size, pixels as they are.
assert.equal(wheelForward("y", false, 0, 3, 1, 230), 48);
assert.equal(wheelForward("y", false, 0, 1, 2, 230), 230);
assert.equal(wheelForward("y", true, 0, 100, 0, 230), 100);
assert.equal(wheelForward("y", false, 40, 100, 0, 230), 100);
// A horizontal track takes deltaX in its physical sense, or deltaY toward the inline end.
assert.equal(wheelForward("x", false, 50, 100, 0, 360), 50);
assert.equal(wheelForward("x", true, 50, 100, 0, 360), -50);
assert.equal(wheelForward("x", false, 0, 100, 0, 360), 100);
assert.equal(wheelForward("x", true, 0, 100, 0, 360), 100);
assert.equal(wheelForward("x", false, 0, 2, 1, 360), 32);

// Edge chaining: nothing to do, or outward at an edge, isn't handled.
assert.equal(wheelTarget(0, 200, 0), null);
assert.equal(wheelTarget(0, 200, -100), null);
assert.equal(wheelTarget(200, 200, 100), null);
assert.equal(wheelTarget(0, 200, 100), 100);
assert.equal(wheelTarget(200, 200, -100), 100);
assert.equal(wheelTarget(150, 200, 100), 200);
assert.equal(wheelTarget(50, 200, -100), 0);
// Within 1 px of an edge counts as the edge: an RTL scroller that stops at −332 of a 333 range.
assert.equal(wheelTarget(332, 333, 60), null);
assert.equal(wheelTarget(0.5, 333, -60), null);
assert.equal(wheelTarget(331.5, 333, -60), 271.5);

console.log("ScrollArea geometry checks passed.");
