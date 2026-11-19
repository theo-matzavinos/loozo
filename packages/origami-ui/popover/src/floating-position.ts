import { computePosition, flip, limitShift, offset, platform, shift, size } from "@floating-ui/dom";
import type { Placement, Side } from "@floating-ui/dom";

export interface PositionConfiguration {
  readonly id: string;
  readonly side: "block-start" | "block-end" | "inline-start" | "inline-end";
  readonly align: "start" | "center" | "end";
  readonly gap: number;
}

const opposites: Record<Side, Side> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

/** Scalar reference axes read in the same READ phase that positions; never a live style declaration. */
export interface PositionAxes {
  readonly writingMode: string;
  readonly direction: string;
}

/** The `size` middleware's measurements after `flip` and `shift`, in CSS pixels. */
export interface PositionSize {
  /** The reference's border-box width. */
  readonly anchorWidth: number;
  /**
   * The height Content can take without overflowing the viewport, never negative: from the gap to
   * the viewport's edge on a top or bottom side, the viewport's full height on a left or right
   * side, where `shift` slides Content vertically.
   */
  readonly availableHeight: number;
}

/** What a calculation resolves to: fixed-strategy coordinates and the logical side Content was placed on. */
export interface PositionResolution {
  readonly x: number;
  readonly y: number;
  /** The final placement's side, mapped back with this calculation's axes; an alignment-only flip keeps it. */
  readonly side: PositionConfiguration["side"];
}

/**
 * `names` labels errors with the owning primitive and its reference, such as "Popover" and "Anchor".
 * `measured` runs inside the calculation, so a Content resize it causes is measured again before
 * the coordinates resolve.
 */
export function positionContent(
  reference: HTMLElement,
  content: HTMLElement,
  configuration: PositionConfiguration,
  axes: PositionAxes,
  names: { readonly label: string; readonly referenceLabel: string },
  measured: (size: PositionSize) => void,
): Promise<PositionResolution> {
  let blockStart: Side;
  let inlineStart: Side;

  switch (axes.writingMode) {
    case "horizontal-tb":
      blockStart = "top";
      inlineStart = "left";

      break;
    case "vertical-rl":
      blockStart = "right";
      inlineStart = "top";

      break;
    case "vertical-lr":
      blockStart = "left";
      inlineStart = "top";

      break;
    default:
      throw new Error(
        `Unsupported ${names.label} ${names.referenceLabel} writing mode: ${axes.writingMode}.`,
      );
  }

  if (axes.direction === "rtl") {
    inlineStart = opposites[inlineStart];
  }

  let side: Side;
  let crossStart: Side;

  switch (configuration.side) {
    case "block-start":
      side = blockStart;
      crossStart = inlineStart;

      break;
    case "block-end":
      side = opposites[blockStart];
      crossStart = inlineStart;

      break;
    case "inline-start":
      side = inlineStart;
      crossStart = blockStart;

      break;
    case "inline-end":
      side = opposites[inlineStart];
      crossStart = blockStart;

      break;
    default:
      throw new Error(`Invalid ${names.label} side: ${configuration.side}.`);
  }

  let placement: Placement = side;
  const fallbackPlacements: Placement[] = [];

  if (configuration.align === "center") {
    fallbackPlacements.push(opposites[side]);
  } else {
    let alignment: "start" | "end" = "start";

    if (crossStart === "bottom" || crossStart === "right") {
      alignment = "end";
    }

    if (configuration.align === "end") {
      if (alignment === "start") {
        alignment = "end";
      } else {
        alignment = "start";
      }
    } else if (configuration.align !== "start") {
      throw new Error(`Invalid ${names.label} alignment: ${configuration.align}.`);
    }

    let oppositeAlignment: "start" | "end" = "start";

    if (alignment === "start") {
      oppositeAlignment = "end";
    }

    placement = `${side}-${alignment}`;
    fallbackPlacements.push(
      `${opposites[side]}-${alignment}`,
      `${side}-${oppositeAlignment}`,
      `${opposites[side]}-${oppositeAlignment}`,
    );
  }

  return computePosition(reference, content, {
    placement,
    strategy: "fixed",
    platform: { ...platform, isRTL: () => false },
    middleware: [
      offset(configuration.gap),
      flip({
        fallbackPlacements,
        mainAxis: true,
        crossAxis: true,
        flipAlignment: false,
        fallbackStrategy: "bestFit",
        boundary: "clippingAncestors",
        rootBoundary: "viewport",
      }),
      // After flip, so flip chooses from unshifted candidates. Floating UI's mainAxis is the
      // alignment axis (x on top/bottom placements); the limiter keeps Content touching its reference.
      shift({
        mainAxis: true,
        crossAxis: false,
        limiter: limitShift({ crossAxis: false }),
        boundary: "clippingAncestors",
        rootBoundary: "viewport",
      }),
      // After flip and shift, so it measures the final position.
      size({
        boundary: "clippingAncestors",
        rootBoundary: "viewport",
        apply: ({ rects, availableHeight }) => {
          measured({
            anchorWidth: rects.reference.width,
            availableHeight: Math.max(0, availableHeight),
          });
        },
      }),
    ],
  }).then(({ x, y, placement: placed }) => {
    const placedSide = placed.split("-")[0];

    if (placedSide === blockStart) {
      return { x, y, side: "block-start" };
    }

    if (placedSide === opposites[blockStart]) {
      return { x, y, side: "block-end" };
    }

    if (placedSide === inlineStart) {
      return { x, y, side: "inline-start" };
    }

    return { x, y, side: "inline-end" };
  });
}
