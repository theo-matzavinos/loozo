import { computePosition, flip, offset, platform } from "@floating-ui/dom";
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

/** `names` labels errors with the owning primitive and its reference, such as "Popover" and "Anchor". */
export function positionContent(
  reference: HTMLElement,
  content: HTMLElement,
  configuration: PositionConfiguration,
  axes: PositionAxes,
  names: { readonly label: string; readonly referenceLabel: string },
) {
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
    ],
  });
}
