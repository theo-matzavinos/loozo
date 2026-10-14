import { expect } from "playwright/test";
import type { Page } from "playwright/test";

type Edge = "top" | "bottom" | "left" | "right";
type Side = "block-start" | "block-end" | "inline-start" | "inline-end";
type Align = "start" | "center" | "end";
interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}
interface GeometryHosts {
  content: string;
  anchor: string;
  fallbackAnchor?: string;
}
interface Candidate {
  side: Edge;
  cross: Edge | "center";
  x: number;
  y: number;
  mainOverflow: number;
  crossOverflow: number;
  primaryCrossOverflow: number;
  score: number;
}

const opposite: Record<Edge, Edge> = { top: "bottom", bottom: "top", left: "right", right: "left" };

/** Independent DOM-edge arithmetic. No Floating UI invocation, import or generated expectation. */
export function candidates(
  anchor: Rect,
  content: Rect,
  viewport: { width: number; height: number },
  writingMode: string,
  direction: string,
  side: Side,
  align: Align,
  gap: number,
): Candidate[] {
  let blockStart: Edge = "top";
  let blockEnd: Edge = "bottom";
  let inlineStart: Edge = "left";
  let inlineEnd: Edge = "right";

  if (writingMode === "vertical-rl") {
    blockStart = "right";
    blockEnd = "left";
    inlineStart = "top";
    inlineEnd = "bottom";
  }

  if (writingMode === "vertical-lr") {
    blockStart = "left";
    blockEnd = "right";
    inlineStart = "top";
    inlineEnd = "bottom";
  }

  if (direction === "rtl") {
    const old = inlineStart;

    inlineStart = inlineEnd;
    inlineEnd = old;
  }

  const sides: Record<Side, Edge> = {
    "block-start": blockStart,
    "block-end": blockEnd,
    "inline-start": inlineStart,
    "inline-end": inlineEnd,
  };
  const physical = sides[side];
  let cross: Edge | "center" = "center";

  if (align === "start") {
    cross = inlineStart;

    if (side.startsWith("inline")) {
      cross = blockStart;
    }
  }

  if (align === "end") {
    cross = inlineEnd;

    if (side.startsWith("inline")) {
      cross = blockEnd;
    }
  }

  const pairs: [Edge, Edge | "center"][] = [
    [physical, cross],
    [opposite[physical], cross],
  ];

  if (cross !== "center") {
    pairs.push([physical, opposite[cross]], [opposite[physical], opposite[cross]]);
  }

  const output: Candidate[] = [];

  for (const [main, alignment] of pairs) {
    let x = anchor.left + (anchor.width - content.width) / 2;
    let y = anchor.top + (anchor.height - content.height) / 2;

    if (main === "top") {
      y = anchor.top - gap - content.height;
    }

    if (main === "bottom") {
      y = anchor.bottom + gap;
    }

    if (main === "left") {
      x = anchor.left - gap - content.width;
    }

    if (main === "right") {
      x = anchor.right + gap;
    }

    if (alignment === "left") {
      x = anchor.left;
    }

    if (alignment === "right") {
      x = anchor.right - content.width;
    }

    if (alignment === "top") {
      y = anchor.top;
    }

    if (alignment === "bottom") {
      y = anchor.bottom - content.height;
    }

    const overflows: Record<Edge, number> = {
      left: -x,
      right: x + content.width - viewport.width,
      top: -y,
      bottom: y + content.height - viewport.height,
    };
    let crossEdges: Edge[] = ["left", "right"];

    if (main === "left" || main === "right") {
      crossEdges = ["top", "bottom"];
    }

    const crossOverflow =
      Math.max(overflows[crossEdges[0]], 0) + Math.max(overflows[crossEdges[1]], 0);
    let primaryCross = crossEdges[0];
    let referenceLength = anchor.width;
    let contentLength = content.width;

    if (main === "left" || main === "right") {
      referenceLength = anchor.height;
      contentLength = content.height;
    }

    if (alignment !== "center") {
      primaryCross = opposite[alignment];
    }

    if (referenceLength > contentLength) {
      primaryCross = opposite[primaryCross];
    }

    output.push({
      side: main,
      cross: alignment,
      x,
      y,
      mainOverflow: overflows[main],
      crossOverflow,
      primaryCrossOverflow: overflows[primaryCross],
      score: Math.max(overflows[main], 0) + crossOverflow,
    });
  }

  return output;
}

export async function geometry(
  page: Page,
  side: Side = "block-end",
  align: Align = "start",
  gap = 8,
  hosts: GeometryHosts = {
    content: "native-content",
    anchor: "native-anchor",
    fallbackAnchor: "native-trigger",
  },
) {
  const measured = await page.evaluate((hosts) => {
    const content = document.querySelector(`[data-testid="${hosts.content}"]`);
    let anchor = document.querySelector(`[data-testid="${hosts.anchor}"]`);

    if (!anchor && hosts.fallbackAnchor) {
      anchor = document.querySelector(`[data-testid="${hosts.fallbackAnchor}"]`);
    }

    if (!(content instanceof HTMLElement) || !(anchor instanceof HTMLElement)) {
      throw new Error("Missing genuine geometry hosts");
    }

    const style = getComputedStyle(anchor);
    const rectangle = (node: Element) => {
      const rect = node.getBoundingClientRect();

      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };

    return {
      anchor: rectangle(anchor),
      content: rectangle(content),
      writingMode: style.writingMode,
      direction: style.direction,
      viewport: {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
      native: content.matches(":popover-open"),
      transform: getComputedStyle(content).transform,
      zIndex: getComputedStyle(content).zIndex,
    };
  }, hosts);
  const expected = candidates(
    measured.anchor,
    measured.content,
    measured.viewport,
    measured.writingMode,
    measured.direction,
    side,
    align,
    gap,
  );

  return { ...measured, expected };
}

export async function expectPreferred(
  page: Page,
  side: Side = "block-end",
  align: Align = "start",
  gap = 8,
  hosts?: GeometryHosts,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const result = await geometry(page, side, align, gap, hosts);
        const preferred = result.expected[0];

        if (preferred.mainOverflow > 0 || preferred.crossOverflow > 0) {
          throw new Error(
            "Preferred-placement fixture does not fit; this is not a preferred-placement proof",
          );
        }

        return Math.max(
          Math.abs(result.content.left - preferred.x),
          Math.abs(result.content.top - preferred.y),
        );
      },
      { message: "Independent anchor/content logical-edge expectation, tolerance 2 CSS px" },
    )
    .toBeLessThanOrEqual(2);
}
