// ScrollArea's framework-free geometry, in layout px. Positions are normalized: 0 at the start of
// the axis, `range` at its end, toward the block end vertically and the inline end horizontally,
// so only the horizontal axis depends on the direction (a native RTL `scrollLeft` runs 0…−range).
// Two directions apply, which differ when `dir` is set on the Viewport alone: the Viewport's
// normalizes positions and converts them back, the track's places the thumb and maps the pointer,
// and the Context flips the progress when they differ, so the thumb matches the content physically.
// No entry point exports it; the Node checks import this file directly.

/** A scrolling axis: `x` horizontal, `y` vertical. */
export type ScrollAreaAxis = "x" | "y";

/** The client rect of a track along one axis, in viewport px. */
export interface ScrollAreaRect {
  readonly start: number;
  readonly end: number;
  readonly size: number;
}

/** Pixels a wheel line counts for, in `WheelEvent.DOM_DELTA_LINE` mode. */
export const wheelLine = 16;

/** `value` limited to `[low, high]`. */
export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** How far the viewport can scroll on an axis: never negative. */
export function scrollRange(scrollSize: number, clientSize: number): number {
  return Math.max(0, scrollSize - clientSize);
}

/**
 * The thumb length Origami requests: the rail scaled by the visible fraction, or the whole rail
 * when nothing overflows. The consumer's CSS minimum may make the used length longer.
 */
export function requestedLength(rail: number, clientSize: number, scrollSize: number): number {
  if (scrollRange(scrollSize, clientSize) > 0) {
    return (rail * clientSize) / scrollSize;
  }

  return rail;
}

/** How far the thumb can move along its rail: never negative. */
export function thumbTravel(rail: number, length: number): number {
  return Math.max(0, rail - length);
}

/**
 * The native `scrollTop` or `scrollLeft`, normalized: the horizontal axis is negated in a
 * right-to-left Viewport.
 */
export function normalizedPosition(axis: ScrollAreaAxis, rtl: boolean, native: number): number {
  if (axis === "x" && rtl) {
    return -native;
  }

  return native;
}

/** The position's fraction of the range, clamped to `[0, 1]`; 0 without a range. */
export function scrollProgress(position: number, range: number): number {
  if (range > 0) {
    return clamp(position, 0, range) / range;
  }

  return 0;
}

/**
 * The one inverse: a normalized position to native `scrollTo` coordinates. Only the horizontal
 * axis is negated in a right-to-left Viewport.
 */
export function toNative(axis: ScrollAreaAxis, rtl: boolean, position: number): ScrollToOptions {
  if (axis === "y") {
    return { top: position };
  }

  if (rtl) {
    return { left: -position };
  }

  return { left: position };
}

/**
 * A client pointer coordinate as layout px along the rail, from the rail's start: the track's left
 * or top edge, or its right edge for a horizontal track whose own direction is right to left. The track's rect-to-layout ratio
 * converts viewport px, so an ancestor's translation and scale map correctly.
 * @param rect - The track's client rect on the axis.
 * @param layoutSize - The track's used border-box size on the axis.
 * @param startInset - Border plus padding at the rail's start, in layout px.
 */
export function railPoint(
  axis: ScrollAreaAxis,
  rtl: boolean,
  client: number,
  rect: ScrollAreaRect,
  layoutSize: number,
  startInset: number,
): number {
  const scale = rect.size / layoutSize;
  let fromEdge = client - rect.start;

  if (axis === "x" && rtl) {
    fromEdge = rect.end - client;
  }

  return fromEdge / scale - startInset;
}

/**
 * A wheel's distance toward the axis end, in px. Line deltas count `wheelLine` px, page deltas the
 * viewport's client size on the axis. A vertical track takes `deltaY`; a horizontal one takes
 * `deltaX`, which keeps its physical sense (negated in RTL), or `deltaY` when `deltaX` is 0, which
 * moves toward the inline end.
 */
export function wheelForward(
  axis: ScrollAreaAxis,
  rtl: boolean,
  deltaX: number,
  deltaY: number,
  deltaMode: number,
  pageSize: number,
): number {
  let unit = 1;

  if (deltaMode === 1) {
    unit = wheelLine;
  } else if (deltaMode === 2) {
    unit = pageSize;
  }

  if (axis === "y" || deltaX === 0) {
    return deltaY * unit;
  }

  if (rtl) {
    return -deltaX * unit;
  }

  return deltaX * unit;
}

/**
 * The normalized position a wheel moves to, or null when the wheel isn't the area's to take:
 * no movement, or moving outward at an edge, so it chains to the page or an outer scroller. An
 * edge is reached within 1 px: with fractional content sizes, engines stop a scroller up to a
 * pixel short of `scrollWidth − clientWidth` (Chromium's right-to-left end, for one).
 */
export function wheelTarget(position: number, range: number, forward: number): number | null {
  if (forward === 0 || (position <= 1 && forward < 0) || (range - position <= 1 && forward > 0)) {
    return null;
  }

  return clamp(position + forward, 0, range);
}
