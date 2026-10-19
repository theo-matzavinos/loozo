/** A viewport point in CSS pixels. */
export type GracePoint = { readonly x: number; readonly y: number };

/** How far the exit points sit along the crossed edge and back inside it, in CSS pixels. */
const exitPadding = 5;

/**
 * The area a pointer may cross from the element it left (`from`) toward the other one (`to`)
 * without closing the Tooltip: the convex hull of the exit point, padded 5 CSS px along the edge
 * it crossed and 5 CSS px back into `from`, and the four corners of `to`. Rectangles are read
 * once, at the leave event.
 */
export function graceArea(exit: GracePoint, from: DOMRect, to: DOMRect): GracePoint[] {
  const points: GracePoint[] = [];
  const top = Math.abs(from.top - exit.y);
  const bottom = Math.abs(from.bottom - exit.y);
  const left = Math.abs(from.left - exit.x);
  const right = Math.abs(from.right - exit.x);
  const nearest = Math.min(top, bottom, left, right);

  if (nearest === left) {
    points.push(
      { x: exit.x + exitPadding, y: exit.y - exitPadding },
      { x: exit.x + exitPadding, y: exit.y + exitPadding },
    );
  } else if (nearest === right) {
    points.push(
      { x: exit.x - exitPadding, y: exit.y - exitPadding },
      { x: exit.x - exitPadding, y: exit.y + exitPadding },
    );
  } else if (nearest === top) {
    points.push(
      { x: exit.x - exitPadding, y: exit.y + exitPadding },
      { x: exit.x + exitPadding, y: exit.y + exitPadding },
    );
  } else {
    points.push(
      { x: exit.x - exitPadding, y: exit.y - exitPadding },
      { x: exit.x + exitPadding, y: exit.y - exitPadding },
    );
  }

  points.push(
    { x: to.left, y: to.top },
    { x: to.right, y: to.top },
    { x: to.right, y: to.bottom },
    { x: to.left, y: to.bottom },
  );

  return convexHull(points);
}

/** Even-odd ray casting; a point on the boundary may fall either way. */
export function insideGraceArea(point: GracePoint, polygon: readonly GracePoint[]): boolean {
  let inside = false;
  let last = polygon[polygon.length - 1];

  for (const current of polygon) {
    const crosses =
      current.y > point.y !== last.y > point.y &&
      point.x < ((last.x - current.x) * (point.y - current.y)) / (last.y - current.y) + current.x;

    if (crosses) {
      inside = !inside;
    }

    last = current;
  }

  return inside;
}

/** Andrew's monotone chain; collinear points are dropped. */
function convexHull(points: readonly GracePoint[]): GracePoint[] {
  const sorted = [...points].sort((left, right) => left.x - right.x || left.y - right.y);

  if (sorted.length <= 1) {
    return sorted;
  }

  const lower: GracePoint[] = [];

  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      turn(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }

    lower.push(point);
  }

  const upper: GracePoint[] = [];

  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index];

    while (
      upper.length >= 2 &&
      turn(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }

    upper.push(point);
  }

  lower.pop();
  upper.pop();

  return [...lower, ...upper];
}

/** Positive for a counterclockwise turn from `origin` through `a` to `b`. */
function turn(origin: GracePoint, a: GracePoint, b: GracePoint): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}
