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
import type { Placement, Side } from "@floating-ui/dom";

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

/** Content's sizing writes, which the caller guards; both run inside a calculation. */
export interface PositionMeasured {
  /** After `flip` and `shift`: the final position's measurements. */
  readonly size: (size: PositionSize) => void;
  /**
   * Before the block fallback's room check: the reference's border-box width. Returns whether that
   * changed the written value, so Content is measured again with it.
   */
  readonly anchorWidth: (width: number) => boolean;
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
  measured: PositionMeasured,
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

    return { placement, fallbackPlacements };
  };

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
            measured.size({
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

  // Validates the side and alignment before anything is computed.
  const requested = candidatesFor(configuration.side);
  const inline = configuration.side === "inline-start" || configuration.side === "inline-end";

  if (!configuration.blockFallback || !inline) {
    return place(requested);
  }

  let first = opposites[inlineStart];

  if (configuration.side === "inline-start") {
    first = inlineStart;
  }

  return inlineSideFits(reference, content, first, configuration.gap, measured).then((fits) => {
    if (fits) {
      return place(requested);
    }

    return place(candidatesFor("block-end"));
  });
}

/**
 * Whether the main edge of `first`, else of its opposite side, fits: flip's own first test of
 * each inline candidate, since the main-side overflow is the same for either alignment. Publishes
 * Content's own anchor width first and measures again when that changed it, so consumer sizing
 * from it applies. Positions nothing and writes nothing else.
 */
async function inlineSideFits(
  reference: HTMLElement,
  content: HTMLElement,
  first: Side,
  gap: number,
  measured: PositionMeasured,
): Promise<boolean> {
  let probed = first;
  let anchorPublished = false;
  let fits = false;

  await computePosition(reference, content, {
    placement: first,
    strategy: "fixed",
    platform: { ...platform, isRTL: () => false },
    middleware: [
      offset(gap),
      {
        name: "origamiInlineRoom",
        async fn(state) {
          if (!anchorPublished) {
            anchorPublished = true;

            const changed = measured.anchorWidth(state.rects.reference.width);

            if (changed) {
              return { reset: { rects: true } };
            }
          }

          // Flip's boundaries, so this is the overflow flip records for the side.
          const overflow = await detectOverflow(state, {
            boundary: "clippingAncestors",
            rootBoundary: "viewport",
          });

          if (overflow[probed] <= 0) {
            fits = true;

            return {};
          }

          if (probed === first) {
            probed = opposites[first];

            return { reset: { placement: probed } };
          }

          return {};
        },
      },
    ],
  });

  return fits;
}
