import {
  computePosition,
  detectOverflow,
  flip,
  limitShift,
  offset,
  platform,
  shift,
  size,
} from "@floating-ui/dom";
import type { Middleware, Placement, Side } from "@floating-ui/dom";

export interface PositionConfiguration {
  readonly id: string;
  readonly side: "block-start" | "block-end" | "inline-start" | "inline-end";
  readonly align: "start" | "center" | "end";
  readonly gap: number;
  /**
   * For an inline `side` only: when the main edge of neither inline side fits, position as
   * `block-end`, keeping `align` and `gap`. Nested Menu Content alone sets it.
   */
  readonly blockFallback: boolean;
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

  /** Section 10's placement and fallback candidates for a logical side; throws on an invalid one. */
  const candidatesFor = (logical: PositionConfiguration["side"]) => {
    let side: Side;
    let crossStart: Side;

    switch (logical) {
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
        throw new Error(`Invalid ${names.label} side: ${logical}.`);
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

    return { side, placement, fallbackPlacements };
  };

  // Shared by the block fallback's room check and the placement, so the room check measures
  // Content at the size an inline placement gives it.
  const sizing: Middleware[] = [
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
  ];

  const place = ({
    placement,
    fallbackPlacements,
  }: ReturnType<typeof candidatesFor>): Promise<PositionResolution> =>
    computePosition(reference, content, {
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
        ...sizing,
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

  // Validates the side and alignment before anything is computed.
  const requested = candidatesFor(configuration.side);

  if (
    !configuration.blockFallback ||
    (configuration.side !== "inline-start" && configuration.side !== "inline-end")
  ) {
    return place(requested);
  }

  let opposite: PositionConfiguration["side"] = "inline-start";

  if (configuration.side === "inline-start") {
    opposite = "inline-end";
  }

  const second = candidatesFor(opposite);

  // The room check. Assumes a larger anchor width or available height never makes Content
  // smaller. In a horizontal writing mode an inline side's cap is the viewport's full height, at
  // least the current one, so a side that misses at the current size also misses at its own: a
  // write-free pass decides that first, and the sizing pass, whose writes would grow Content and
  // clamp a scroll offset inside it, runs only when a side fits now. In a vertical mode a block
  // side's cap is the larger one, so the sizing pass always runs: it can only shrink Content
  // below the current block-side size, and the placement restores that size in the same READ.
  let current: Promise<boolean> = Promise.resolve(true);

  if (axes.writingMode === "horizontal-tb") {
    current = inlineSideFits(reference, content, requested, second, configuration.gap, []);
  }

  // Whether the sizing pass ran, leaving Content at an inline side's size.
  let sized = false;

  return current
    .then((fitsNow) => {
      if (!fitsNow) {
        return false;
      }

      sized = true;

      return inlineSideFits(reference, content, requested, second, configuration.gap, sizing);
    })
    .then((fits) => {
      if (fits) {
        return place(requested);
      }

      const block = candidatesFor("block-end");

      if (!sized) {
        return place(block);
      }

      // `flip` would choose a block side with the inline size the sizing pass left: a first
      // block calculation writes a block side's size, so the second chooses with it, as an
      // authored block `side` does from the previous calculation's size.
      return place(block).then(() => place(block));
    });
}

/**
 * Whether the main edge of `first`, else of `second`, fits: flip's own first test of each inline
 * candidate, since neither alignment nor the alignment-axis shift moves the main side. `sizing`
 * runs before the room test. Empty, the pass writes nothing and reads Content at its current size.
 * With the placement's `shift` and `size`, their guarded writes give Content the anchor width and
 * available height that placement would, and `size` measures again when they resize it. Places
 * nothing; the placement that follows writes the final values in the same READ.
 */
async function inlineSideFits(
  reference: HTMLElement,
  content: HTMLElement,
  first: { readonly side: Side; readonly placement: Placement },
  second: { readonly side: Side; readonly placement: Placement },
  gap: number,
  sizing: readonly Middleware[],
): Promise<boolean> {
  let probed = first;
  let fits = false;

  await computePosition(reference, content, {
    placement: first.placement,
    strategy: "fixed",
    platform: { ...platform, isRTL: () => false },
    middleware: [
      offset(gap),
      ...sizing,
      {
        name: "origamiInlineRoom",
        async fn(state) {
          // Flip's boundaries, so this is the overflow flip records for the side.
          const overflow = await detectOverflow(state, {
            boundary: "clippingAncestors",
            rootBoundary: "viewport",
          });

          if (overflow[probed.side] <= 0) {
            fits = true;

            return {};
          }

          if (probed === first) {
            probed = second;

            return { reset: { placement: second.placement } };
          }

          return {};
        },
      },
    ],
  });

  return fits;
}
