import { test, expect } from "./contract-test.js";
import type { Locator, Page, TestInfo } from "playwright/test";
import {
  assertReferences,
  bootstrapHeld,
  fixture,
  stopRetentionObservation,
} from "./observation.js";

// ScrollArea (section 36, SA). SA1 is the package, type and documentation gates, SA13 the `errors`
// fixture. Every area is styled by the README recipe (`scrollAreaRecipe` in the fixture): 10 px
// border-box tracks with 1 px padding, rounded thumbs with an 18 px minimum on the scrolling axis.
// Geometry is compared in layout px: a track's used border-box size against its client rect gives
// the scale, so the scaled areas are read the same way. Tolerances: 0.5 layout px for geometry,
// 1 px for a written scroll position and the thumb against the pointer (engines snap scroll
// positions to whole px).

declare global {
  interface Window {
    scrollAreaErrors?: string[];
    scrollAreaWheels?: { prevented: boolean; target: string | null }[];
    scrollAreaServer?: Record<string, Record<string, string | null>>;
    scrollAreaMutations?: {
      testid: string;
      name: string;
      oldValue: string | null;
      /** The MutationObserver delivery that reported it: one per synchronous pass. */
      batch?: number;
    }[];
    scrollAreaNodes?: Record<string, Element | null>;
    scrollAreaThumbWrites?: number;
  }
}

type Axis = "x" | "y";

/** One axis of an area as the browser lays it out, in layout px. */
interface AxisReading {
  readonly visible: boolean;
  readonly rail: number;
  readonly length: number;
  readonly requested: number;
  /** The thumb's CSS minimum on the scrolling axis. */
  readonly minimum: number;
  readonly travel: number;
  readonly range: number;
  readonly position: number;
  readonly expectedOffset: number;
  readonly paintedOffset: number;
  readonly paintedLength: number;
  readonly endGap: number;
  readonly scale: number;
  readonly inside: boolean;
}

function out(page: Page, testid: string): Locator {
  return page.getByTestId(testid);
}

function bar(area: string, axis: Axis): string {
  if (axis === "y") {
    return `${area}-vbar`;
  }

  return `${area}-hbar`;
}

function incremental(info: TestInfo): boolean {
  return info.project.metadata.hydration === "incremental";
}

/** Reads an axis of an area from its `<area>-viewport` and `<area>-vbar`/`-hbar` test IDs. */
async function read(
  page: Page,
  area: string,
  axis: Axis,
  viewportId = `${area}-viewport`,
): Promise<AxisReading> {
  return page.evaluate(
    ([area, axis, viewportId]) => {
      const vertical = axis === "y";
      const viewport = document.querySelector<HTMLElement>(`[data-testid="${viewportId}"]`)!;
      const track = document.querySelector<HTMLElement>(
        `[data-testid="${area}-${vertical ? "v" : "h"}bar"]`,
      )!;
      const thumb = track.querySelector<HTMLElement>("[ogscrollareathumb]")!;
      const px = Number.parseFloat;
      const trackStyle = getComputedStyle(track);
      const thumbStyle = getComputedStyle(thumb);
      const rtl = getComputedStyle(viewport).direction === "rtl";
      let size = px(trackStyle.width);
      let start = px(trackStyle.borderLeftWidth) + px(trackStyle.paddingLeft);
      let end = px(trackStyle.borderRightWidth) + px(trackStyle.paddingRight);
      let length = px(thumbStyle.width);
      let minimum = px(thumbStyle.minWidth) || 0;
      let client = viewport.clientWidth;
      let scroll = viewport.scrollWidth;
      let native = viewport.scrollLeft;

      if (vertical) {
        size = px(trackStyle.height);
        start = px(trackStyle.borderTopWidth) + px(trackStyle.paddingTop);
        end = px(trackStyle.borderBottomWidth) + px(trackStyle.paddingBottom);
        length = px(thumbStyle.height);
        minimum = px(thumbStyle.minHeight) || 0;
        client = viewport.clientHeight;
        scroll = viewport.scrollHeight;
        native = viewport.scrollTop;
      } else if (rtl) {
        [start, end] = [end, start];
      }

      // The thumb's border-box length and minimum, as for a `content-box` thumb too.
      if (thumbStyle.boxSizing !== "border-box") {
        let extra =
          px(thumbStyle.paddingLeft) +
          px(thumbStyle.paddingRight) +
          px(thumbStyle.borderLeftWidth) +
          px(thumbStyle.borderRightWidth);

        if (vertical) {
          extra =
            px(thumbStyle.paddingTop) +
            px(thumbStyle.paddingBottom) +
            px(thumbStyle.borderTopWidth) +
            px(thumbStyle.borderBottomWidth);
        }

        length += extra;
        minimum += extra;
      }

      const rail = size - start - end;
      const range = Math.max(0, scroll - client);
      let position = native;

      if (!vertical && rtl) {
        position = -native;
      }

      const travel = Math.max(0, rail - length);
      let expectedOffset = 0;

      if (range > 0) {
        expectedOffset = (travel * Math.min(range, Math.max(0, position))) / range;
      }

      const trackRect = track.getBoundingClientRect();
      const thumbRect = thumb.getBoundingClientRect();
      let scale = trackRect.width / size;
      let paintedOffset = (thumbRect.left - trackRect.left) / scale - start;
      let paintedLength = thumbRect.width / scale;
      let endGap = (trackRect.right - thumbRect.right) / scale;

      if (vertical) {
        scale = trackRect.height / size;
        paintedOffset = (thumbRect.top - trackRect.top) / scale - start;
        paintedLength = thumbRect.height / scale;
        endGap = (trackRect.bottom - thumbRect.bottom) / scale;
      } else if (rtl) {
        paintedOffset = (trackRect.right - thumbRect.right) / scale - start;
        endGap = (thumbRect.left - trackRect.left) / scale;
      }

      let requested = rail;

      if (range > 0) {
        requested = (rail * client) / scroll;
      }

      const slack = 0.5;

      return {
        visible: track.hasAttribute("data-visible"),
        rail,
        length,
        requested,
        minimum,
        travel,
        range,
        position,
        expectedOffset,
        paintedOffset,
        paintedLength,
        endGap,
        scale,
        inside:
          thumbRect.left >= trackRect.left - slack &&
          thumbRect.right <= trackRect.right + slack &&
          thumbRect.top >= trackRect.top - slack &&
          thumbRect.bottom <= trackRect.bottom + slack,
      };
    },
    [area, axis, viewportId] as const,
  );
}

/** The thumb is where its length and the scroll position put it, inside its track. */
async function expectPlaced(
  page: Page,
  area: string,
  axis: Axis,
  label: string,
  viewportId = `${area}-viewport`,
): Promise<void> {
  const reading = await read(page, area, axis, viewportId);

  expect(reading.paintedLength, `${area} ${axis} ${label}: length`).toBeCloseTo(reading.length, 0);
  expect(
    Math.abs(reading.paintedLength - Math.max(reading.requested, reading.minimum)),
    `${area} ${axis} ${label}: requested or the minimum`,
  ).toBeLessThanOrEqual(0.5);
  expect(
    Math.abs(reading.paintedOffset - reading.expectedOffset),
    `${area} ${axis} ${label}: offset ${JSON.stringify(reading)}`,
  ).toBeLessThanOrEqual(0.5);
  expect(reading.inside, `${area} ${axis} ${label}: inside its track`).toBe(true);
}

/** Lets the page run four frames and any change detection they schedule: a measure settles. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let count = 0;

        function next(): void {
          count += 1;

          if (count === 4) {
            setTimeout(resolve, 50);

            return;
          }

          requestAnimationFrame(next);
        }

        requestAnimationFrame(next);
      }),
  );
}

async function box(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const value = await locator.boundingBox();

  if (value === null) {
    throw new Error("Expected a rendered element");
  }

  return value;
}

async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const value = await box(locator);

  return { x: value.x + value.width / 2, y: value.y + value.height / 2 };
}

/** Puts the pointer over the area and waits until the overflowing axes' bars show. */
async function showBars(page: Page, area: string, axes: readonly Axis[]): Promise<void> {
  await out(page, area).scrollIntoViewIfNeeded();

  const point = await center(out(page, area));

  await page.mouse.move(point.x, point.y);

  for (const axis of axes) {
    await expect(out(page, bar(area, axis))).toHaveAttribute("data-visible", "");
  }
}

/** Moves the pointer off every area, to the page's top-left corner. */
async function leave(page: Page): Promise<void> {
  await page.mouse.move(1, 1);
}

async function scrollViewport(page: Page, area: string, options: ScrollToOptions): Promise<void> {
  await page.evaluate(
    ([area, options]) => {
      document
        .querySelector(`[data-testid="${area}-viewport"]`)!
        .scrollTo({ ...options, behavior: "instant" });
    },
    [area, options] as const,
  );
}

async function scrollPosition(page: Page, area: string): Promise<{ top: number; left: number }> {
  return out(page, `${area}-viewport`).evaluate((viewport) => ({
    top: viewport.scrollTop,
    left: viewport.scrollLeft,
  }));
}

/** Records window `error` events from the first script: a ResizeObserver loop error is one. */
async function recordErrors(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.scrollAreaErrors = [];
    addEventListener("error", (event) => {
      window.scrollAreaErrors!.push(String(event.message));
    });
  });
}

/** Records every wheel's `defaultPrevented` once its own listeners ran, at the document. */
async function recordWheels(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollAreaWheels = [];
    document.addEventListener(
      "wheel",
      (event) => {
        let target: string | null = null;

        if (event.target instanceof Element) {
          target = event.target.closest("[data-testid]")?.getAttribute("data-testid") ?? null;
        }

        window.scrollAreaWheels!.push({ prevented: event.defaultPrevented, target });
      },
      { passive: true },
    );
  });
}

async function lastWheel(page: Page): Promise<{ prevented: boolean; target: string | null }> {
  return page.evaluate(() => window.scrollAreaWheels!.at(-1)!);
}

/** Wheels over a point and waits for the wheel's default action to settle. */
async function wheel(
  page: Page,
  point: { x: number; y: number },
  deltaX: number,
  deltaY: number,
): Promise<{ prevented: boolean; target: string | null }> {
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(deltaX, deltaY);
  await settle(page);

  return lastWheel(page);
}

/**
 * A point along a track's rail, `fraction` of the way from its start (top, left, or right in RTL),
 * on whole CSS px, since Firefox and WebKit round pointer coordinates; `local` is where that
 * point lies along the rail, in layout px, for the expected positions.
 */
async function railAt(
  page: Page,
  area: string,
  axis: Axis,
  fraction: number,
  rtl = false,
): Promise<{ x: number; y: number; local: number }> {
  const track = await box(out(page, bar(area, axis)));
  const reading = await read(page, area, axis);
  const inset = 1 * reading.scale;
  const along = inset + reading.rail * reading.scale * fraction;

  if (axis === "y") {
    const y = Math.round(track.y + along);

    return {
      x: Math.round(track.x + track.width / 2),
      y,
      local: (y - track.y) / reading.scale - 1,
    };
  }

  if (rtl) {
    const x = Math.round(track.x + track.width - along);

    return {
      x,
      y: Math.round(track.y + track.height / 2),
      local: (track.x + track.width - x) / reading.scale - 1,
    };
  }

  const x = Math.round(track.x + along);

  return { x, y: Math.round(track.y + track.height / 2), local: (x - track.x) / reading.scale - 1 };
}

/** The scroll position a press at `local` along the rail gives: the thumb centered there. */
function pressedAt(reading: AxisReading, local: number, length = reading.length): number {
  const travel = Math.max(0, reading.rail - length);

  return Math.min(1, Math.max(0, (local - length / 2) / travel)) * reading.range;
}

async function thumbCenter(
  page: Page,
  area: string,
  axis: Axis,
): Promise<{ x: number; y: number }> {
  return center(out(page, bar(area, axis)).locator("[ogscrollareathumb]"));
}

/** The scroll position a thumb drag from `offset` by `moved` layout px gives. */
function dragged(reading: AxisReading, moved: number): number {
  const progress = Math.min(1, Math.max(0, (reading.expectedOffset + moved) / reading.travel));

  return progress * reading.range;
}

// ---------------------------------------------------------------------------------------------
// SA2–SA3: server HTML, hydration and input before it

/** What the server renders on ScrollArea nodes; the attributes Origami binds in render. */
const audited: Record<string, readonly string[]> = {
  table: ["data-overflow-x", "data-overflow-y"],
  "table-viewport": ["tabindex", "style"],
  "table-content": ["style"],
  "table-vbar": ["aria-hidden", "data-orientation", "data-visible"],
  "table-hbar": ["aria-hidden", "data-orientation", "data-visible"],
  "table-vthumb": ["style"],
  "table-hthumb": ["style"],
  panel: ["data-overflow-x", "data-overflow-y"],
  "panel-viewport": ["tabindex", "style"],
  "panel-content": ["style"],
  "panel-vbar": ["aria-hidden", "data-orientation", "data-visible"],
  "panel-vthumb": ["style"],
  composed: ["data-overflow-x", "data-overflow-y"],
  "composed-viewport": ["tabindex", "style"],
  "composed-content": ["style"],
  "composed-vbar": ["aria-hidden", "data-orientation", "data-visible"],
  railed: ["data-overflow-x", "data-overflow-y"],
  "railed-viewport": ["tabindex", "style"],
  "railed-content": ["style"],
  "railed-vbar": ["aria-hidden", "data-orientation", "data-visible"],
  "railed-hbar": ["aria-hidden", "data-orientation", "data-visible"],
  "railed-vthumb": ["style"],
  "railed-hthumb": ["style"],
  factory: ["data-overflow-x", "data-overflow-y"],
  "factory-viewport": ["tabindex", "style"],
  "factory-content": ["style"],
  "factory-hbar": ["aria-hidden", "data-orientation", "data-visible"],
};

/** Reads every audited attribute, `jsaction` and `ngh` aside, from the current DOM. */
async function auditedAttributes(
  page: Page,
): Promise<Record<string, Record<string, string | null>>> {
  return page.evaluate((audited) => {
    const result: Record<string, Record<string, string | null>> = {};

    for (const [testid, names] of Object.entries(audited)) {
      const element = document.querySelector(`[data-testid="${testid}"]`)!;
      const attributes: Record<string, string | null> = {
        jsaction: element.getAttribute("jsaction"),
      };

      for (const name of names) {
        attributes[name] = element.getAttribute(name);
      }

      // The browser may serialize longhands as a shorthand; compare the declarations instead.
      if ("style" in attributes) {
        const declarations: string[] = [];
        const style = (element as HTMLElement).style;

        for (let index = 0; index < style.length; index++) {
          const name = style.item(index);

          declarations.push(`${name}: ${style.getPropertyValue(name)}`);
        }

        attributes["style"] = declarations.sort().join("; ") || null;
      }

      result[testid] = attributes;
    }

    return result;
  }, audited);
}

/** The audited style declarations, as `auditedAttributes` normalized them. */
function declarations(style: string | null | undefined): string[] {
  if (style === null || style === undefined) {
    return [];
  }

  return style.split("; ");
}

/** An element's inline `overflow-y`, as the CSSOM reads it. */
async function overflowY(locator: Locator): Promise<string> {
  return locator.evaluate((element: HTMLElement) => element.style.overflowY);
}

test("SA2 server HTML has the hidden native bars, the overflow Origami owns, tabindex and the tracks' orientation, and hydration keeps them on the server's nodes before the browser measures", async ({
  page,
}, info) => {
  let server: Record<string, Record<string, string | null>> = {};
  let railedBefore = { width: 0, height: 0, top: 0, left: 0 };

  await fixture(page, "scroll-area", info, async () => {
    server = await auditedAttributes(page);

    // Before bootstrap: scroll railed natively, so hydration has a position and a box to keep.
    railedBefore = await out(page, "railed-viewport").evaluate((viewport) => {
      viewport.scrollTo({ top: 40, left: 30, behavior: "instant" });

      return {
        width: viewport.clientWidth,
        height: viewport.clientHeight,
        top: viewport.scrollTop,
        left: viewport.scrollLeft,
      };
    });

    // Before bootstrap: record every later change of an audited attribute on these nodes.
    await page.evaluate((audited) => {
      window.scrollAreaMutations = [];

      function normalized(value: string | null): string | null {
        if (value === null) {
          return null;
        }

        const probe = document.createElement("div");
        const declarations: string[] = [];

        probe.setAttribute("style", value);

        for (let index = 0; index < probe.style.length; index++) {
          const name = probe.style.item(index);

          declarations.push(`${name}: ${probe.style.getPropertyValue(name)}`);
        }

        return declarations.sort().join("; ") || null;
      }

      let batch = 0;
      const observer = new MutationObserver((records) => {
        batch += 1;

        for (const record of records) {
          const element = record.target as Element;
          let oldValue = record.oldValue;

          if (record.attributeName === "style") {
            oldValue = normalized(oldValue);
          }

          window.scrollAreaMutations!.push({
            testid: element.getAttribute("data-testid") ?? "",
            name: record.attributeName ?? "",
            oldValue,
            batch,
          });
        }
      });

      for (const [testid, names] of Object.entries(audited)) {
        observer.observe(document.querySelector(`[data-testid="${testid}"]`)!, {
          attributes: true,
          attributeOldValue: true,
          attributeFilter: [...names],
        });
      }
    }, audited);
  });

  const thumbs = new Set([
    "table-vthumb",
    "table-hthumb",
    "panel-vthumb",
    "railed-vthumb",
    "railed-hthumb",
  ]);

  // Server HTML: no jsaction, no measured fact, no thumb geometry.
  for (const [testid, attributes] of Object.entries(server)) {
    expect(attributes["jsaction"], `${testid} jsaction`).toBeNull();

    for (const name of ["data-overflow-x", "data-overflow-y", "data-visible"]) {
      if (name in attributes) {
        expect(attributes[name], `${testid} ${name}`).toBeNull();
      }
    }
  }

  for (const thumb of thumbs) {
    expect(server[thumb]!["style"], thumb).toBeNull();
  }

  for (const track of ["table-vbar", "panel-vbar", "composed-vbar", "railed-vbar"]) {
    expect(server[track]!["aria-hidden"]).toBe("true");
    expect(server[track]!["data-orientation"]).toBe("vertical");
  }

  for (const track of ["table-hbar", "factory-hbar", "railed-hbar"]) {
    expect(server[track]!["aria-hidden"]).toBe("true");
    expect(server[track]!["data-orientation"]).toBe("horizontal");
  }

  // Two axes with the Scrollbars in the same view (table) and in a child component's template
  // (railed), vertical only (panel, and composed's Scrollbar composer), and horizontal only through
  // factory Options.
  for (const viewport of ["table-viewport", "railed-viewport"]) {
    expect(declarations(server[viewport]!["style"]), viewport).toEqual([
      "overflow-x: auto",
      "overflow-y: auto",
      "scrollbar-width: none",
    ]);
  }

  expect(declarations(server["panel-viewport"]!["style"])).toEqual([
    "overflow-x: hidden",
    "overflow-y: auto",
    "scrollbar-width: none",
  ]);
  expect(declarations(server["composed-viewport"]!["style"])).toEqual([
    "overflow-x: hidden",
    "overflow-y: auto",
    "scrollbar-width: none",
  ]);
  expect(declarations(server["factory-viewport"]!["style"])).toEqual([
    "overflow-x: auto",
    "overflow-y: hidden",
    "scrollbar-width: none",
  ]);
  for (const content of ["table-content", "railed-content"]) {
    expect(declarations(server[content]!["style"]), content).toEqual([
      "inline-size: max-content",
      "min-inline-size: 100%",
    ]);
  }

  expect(server["panel-content"]!["style"]).toBeNull();
  expect(server["composed-content"]!["style"]).toBeNull();

  for (const viewport of [
    "table-viewport",
    "panel-viewport",
    "composed-viewport",
    "railed-viewport",
    "factory-viewport",
  ]) {
    expect(server[viewport]!["tabindex"]).toBe("0");
  }

  // After attach, measured on the same nodes (`fixture` proved the saved nodes were kept).
  await settle(page);
  await expect(out(page, "table")).toHaveAttribute("data-overflow-x", "");
  await expect(out(page, "table")).toHaveAttribute("data-overflow-y", "");
  await expect(out(page, "panel")).toHaveAttribute("data-overflow-y", "");
  await expect(out(page, "panel")).not.toHaveAttribute("data-overflow-x");
  await expect(out(page, "factory")).toHaveAttribute("data-overflow-x", "");
  await expect(out(page, "factory")).not.toHaveAttribute("data-overflow-y");
  await expect(out(page, "railed")).toHaveAttribute("data-overflow-x", "");
  await expect(out(page, "railed")).toHaveAttribute("data-overflow-y", "");
  await expectPlaced(page, "table", "y", "attached");
  await expectPlaced(page, "table", "x", "attached");
  await expectPlaced(page, "panel", "y", "attached");
  await expectPlaced(page, "railed", "y", "attached");
  await expectPlaced(page, "railed", "x", "attached");

  // Railed's box and the position reached before bootstrap survive hydration.
  const railedAfter = await out(page, "railed-viewport").evaluate((viewport) => ({
    width: viewport.clientWidth,
    height: viewport.clientHeight,
    top: viewport.scrollTop,
    left: viewport.scrollLeft,
  }));

  expect(railedBefore.top).toBeGreaterThan(0);
  expect(railedBefore.left).toBeGreaterThan(0);
  expect(railedAfter).toEqual(railedBefore);

  // Only the measured facts changed: every render-bound attribute kept the server's value through
  // every write.
  const current = await auditedAttributes(page);
  const measured = new Set(["data-overflow-x", "data-overflow-y", "data-visible"]);

  for (const [testid, names] of Object.entries(audited)) {
    for (const name of names) {
      if (measured.has(name) || thumbs.has(testid)) {
        continue;
      }

      expect(current[testid]![name], `${testid} ${name} after hydration`).toBe(
        server[testid]![name],
      );
    }
  }

  const mutations = await page.evaluate(() => window.scrollAreaMutations!);

  info.annotations.push({ type: "hydration writes", description: JSON.stringify(mutations) });

  for (const mutation of mutations) {
    if (measured.has(mutation.name) || thumbs.has(mutation.testid)) {
      continue;
    }

    const serverValue = server[mutation.testid]![mutation.name];

    if (mutation.name !== "style") {
      expect(mutation.oldValue, `${mutation.testid} ${mutation.name} was never another value`).toBe(
        serverValue,
      );
      continue;
    }

    // No part has a static style, so hydration's creation pass leaves the server's `style` alone
    // and every write is a binding's. A Scrollbar in a child component's template (railed)
    // registers after its parent's bindings wrote `hidden` and no Content sizing, which the same
    // pass then corrects. In between, a Viewport stays a scroll container without native bars, and
    // Content holds no declaration the server didn't.
    if (mutation.testid.endsWith("-viewport")) {
      const intermediate = declarations(mutation.oldValue);

      expect(intermediate, `${mutation.testid} kept its native bars hidden`).toContain(
        "scrollbar-width: none",
      );

      for (const axis of ["overflow-x", "overflow-y"]) {
        expect(
          [`${axis}: auto`, `${axis}: hidden`].filter((value) => intermediate.includes(value)),
          `${mutation.testid} stayed a scroll container on ${axis}: ${mutation.oldValue}`,
        ).toHaveLength(1);
      }

      continue;
    }

    for (const declaration of declarations(mutation.oldValue)) {
      expect(
        declarations(serverValue),
        `${mutation.testid} style never held ${declaration}`,
      ).toContain(declaration);
    }
  }

  // Every style write, railed's transient `hidden` and missing Content sizing included, is the
  // binding pass, in one MutationObserver delivery: no rendering opportunity fell between them, and
  // railed's box and position above survived them.
  const bindingPass = new Set<number | undefined>();

  for (const mutation of mutations) {
    if (mutation.name === "style" && !thumbs.has(mutation.testid)) {
      bindingPass.add(mutation.batch);
    }
  }

  expect([...bindingPass]).toHaveLength(1);

  const composedContent = await out(page, "composed-content").evaluate((element) => [
    element.getAttribute("data-overflow-y-state"),
    element.getAttribute("data-active-state"),
  ]);

  expect(composedContent).toEqual(["true", "false"]);
});

test("SA3 before hydration the area scrolls natively by wheel, Tab and PageDown without hydrating, keeps its box and position through attach, and a pointer resting over it shows the bars once it hydrates", async ({
  page,
  browserName,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  const release = await bootstrapHeld(page, "/scroll-area", info);
  const before = await out(page, "table-viewport").evaluate((viewport) => ({
    width: viewport.clientWidth,
    height: viewport.clientHeight,
    computed: getComputedStyle(viewport).scrollbarWidth,
    attribute: viewport.getAttribute("style"),
  }));

  expect(before.attribute).toContain("scrollbar-width: none");

  // Firefox headless computes `scrollbar-width: none` for every element; the attribute is the
  // assertion there.
  if (browserName !== "firefox") {
    expect(before.computed).toBe("none");
  }

  // Wheel over the viewport, then Tab to it and PageDown: native scrolling.
  await out(page, "table").scrollIntoViewIfNeeded();

  const viewportPoint = await center(out(page, "table-viewport"));

  await page.mouse.move(viewportPoint.x, viewportPoint.y);
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await scrollPosition(page, "table")).top).toBeGreaterThan(0);
  await out(page, "table-narrow").focus();
  await page.keyboard.press("Tab");
  await expect(out(page, "table-viewport")).toBeFocused();

  const wheeled = (await scrollPosition(page, "table")).top;

  await page.keyboard.press("PageDown");
  await expect
    .poll(async () => (await scrollPosition(page, "table")).top)
    .toBeGreaterThan(wheeled + 50);

  // Wait for the keyboard scroll to finish before reading the position kept through attach.
  let position = -1;

  await expect
    .poll(async () => {
      const now = (await scrollPosition(page, "table")).top;
      const stable = now === position;

      position = now;

      return stable;
    })
    .toBe(true);

  // Still the server's: nothing hydrated it.
  await expect(page.locator("acceptance-scroll-area-fixture")).not.toHaveAttribute(
    "data-client-rendered",
  );
  await expect(out(page, "table")).not.toHaveAttribute("data-overflow-y");

  // The pointer rests over the area through hydration and never moves.
  await page.mouse.move(viewportPoint.x, viewportPoint.y);
  release();
  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");

  if (incremental(info)) {
    // A click outside the block, without moving the pointer, hydrates it.
    await out(page, "attach-fixture").evaluate((button: HTMLButtonElement) => {
      button.click();
    });
  }

  await expect(page.locator("acceptance-scroll-area-fixture")).toHaveAttribute(
    "data-client-rendered",
    "true",
  );
  await expect(out(page, "table-vbar")).toHaveAttribute("data-visible", "");
  await expect(out(page, "table-hbar")).toHaveAttribute("data-visible", "");
  await settle(page);

  const after = await out(page, "table-viewport").evaluate((viewport) => ({
    width: viewport.clientWidth,
    height: viewport.clientHeight,
    top: viewport.scrollTop,
  }));

  expect({ width: after.width, height: after.height }).toEqual({
    width: before.width,
    height: before.height,
  });
  expect(after.top).toBe(position);
  await expectPlaced(page, "table", "y", "kept position");
  expect((await read(page, "table", "y")).expectedOffset).toBeGreaterThan(0);

  // Leaving hides them after the hide delay.
  await leave(page);
  await expect(out(page, "table-vbar")).not.toHaveAttribute("data-visible", "", { timeout: 3000 });
  await assertReferences(page, info);
  await stopRetentionObservation(page);
});

// ---------------------------------------------------------------------------------------------
// SA4: geometry

test("SA4 geometry follows the content, the viewport, the tracks and the thumbs' own CSS, in layout px under a scaled ancestor too, with no ResizeObserver loop error", async ({
  page,
}, info) => {
  await recordErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page, "scroll-area", info);
  await settle(page);

  // Start, middle and end, both axes, LTR and RTL.
  for (const area of ["table", "rtl"]) {
    let sign = 1;

    if (area === "rtl") {
      sign = -1;
    }

    for (const [label, top, left] of [
      ["start", 0, 0],
      ["middle", 600, 200],
      ["end", 1e6, 1e6],
    ] as const) {
      await scrollViewport(page, area, { top, left: sign * left });
      await settle(page);
      await expectPlaced(page, area, "y", label);
      await expectPlaced(page, area, "x", label);
    }

    // At the end the thumb ends 1 layout px (the track's padding) before the track's end; an
    // engine that stops a pixel short of a fractional range leaves it up to one scroll pixel of
    // travel further.
    for (const axis of ["y", "x"] as const) {
      const reading = await read(page, area, axis);
      const slack = 0.5 + (reading.range - reading.position) * (reading.travel / reading.range);

      expect(reading.range - reading.position).toBeLessThanOrEqual(1);
      expect(
        Math.abs(reading.endGap - 1),
        `${area} ${axis} end ${JSON.stringify(reading)}`,
      ).toBeLessThanOrEqual(slack);
    }
  }

  // The 18 px floor at 9600 px of content.
  await scrollViewport(page, "table", { top: 0, left: 0 });
  await out(page, "table-rows").click();
  await settle(page);

  const floor = await read(page, "table", "y");

  expect(floor.requested).toBeLessThan(18);
  expect(floor.paintedLength).toBeCloseTo(18, 1);
  await expectPlaced(page, "table", "y", "floor");

  // A thumb-only minimum change, the pointer inside the area and nothing else resized.
  await showBars(page, "table", ["y", "x"]);
  await scrollViewport(page, "table", { top: 1e6 });
  await settle(page);

  for (const minimum of [36, 18]) {
    await out(page, "table-min").evaluate((button: HTMLButtonElement) => {
      button.click();
    });
    await settle(page);

    const reading = await read(page, "table", "y");

    expect(reading.paintedLength, `minimum ${minimum}`).toBeCloseTo(minimum, 1);
    expect(reading.endGap, `minimum ${minimum} end`).toBeCloseTo(1, 0);
    await expectPlaced(page, "table", "y", `minimum ${minimum}`);

    // Settled: no further write to the thumb while idle.
    const writes = await out(page, "table-vthumb").evaluate(
      (thumb) =>
        new Promise<number>((resolve) => {
          let count = 0;
          const observer = new MutationObserver((records) => {
            count += records.length;
          });

          observer.observe(thumb, { attributes: true, attributeFilter: ["style"] });

          let frames = 0;

          function next(): void {
            frames += 1;

            if (frames === 10) {
              observer.disconnect();
              resolve(count);

              return;
            }

            requestAnimationFrame(next);
          }

          requestAnimationFrame(next);
        }),
    );

    expect(writes, `minimum ${minimum}: idle writes`).toBe(0);
  }

  // Viewport and track resizes.
  await out(page, "table-narrow").evaluate((button: HTMLButtonElement) => {
    button.click();
  });
  await settle(page);
  await expectPlaced(page, "table", "x", "narrow");
  await expectPlaced(page, "table", "y", "narrow");
  await out(page, "table-few").click();
  await settle(page);
  await expect(out(page, "table")).not.toHaveAttribute("data-overflow-y");
  await expectPlaced(page, "table", "x", "few rows");

  // A `content-box` thumb gaining padding with nothing else changing remeasures: observed on its
  // border box.
  await out(page, "panel").scrollIntoViewIfNeeded();
  await out(page, "panel-vthumb").evaluate((thumb: HTMLElement) => {
    thumb.style.boxSizing = "content-box";
  });
  await settle(page);
  await expectPlaced(page, "panel", "y", "content-box");
  await out(page, "panel-vthumb").evaluate((thumb: HTMLElement) => {
    thumb.style.paddingBlock = "4px";
  });
  await settle(page);
  await expectPlaced(page, "panel", "y", "content-box padded");
  await out(page, "panel-vthumb").evaluate((thumb: HTMLElement) => {
    thumb.style.removeProperty("box-sizing");
    thumb.style.removeProperty("padding-block");
  });
  await settle(page);
  await expectPlaced(page, "panel", "y", "border-box again");

  // A rail shorter than the minimum: travel 0, the thumb clipped to the track, presses inert.
  await showBars(page, "short", ["y"]);

  const short = await read(page, "short", "y");

  expect(short.rail).toBeLessThan(18);
  expect(short.travel).toBe(0);
  expect(short.paintedOffset).toBeCloseTo(0, 1);

  const shortTrack = await box(out(page, "short-vbar"));
  const hit = await page.evaluate(
    ([x, y]) =>
      document.elementFromPoint(x, y)?.closest("[data-testid]")?.getAttribute("data-testid") ??
      null,
    [shortTrack.x + shortTrack.width / 2, shortTrack.y + shortTrack.height + 2] as const,
  );

  expect(hit).toBe("short-after");
  await page.mouse.move(shortTrack.x + shortTrack.width / 2, shortTrack.y + shortTrack.height / 2);
  await page.mouse.down();
  await page.mouse.move(shortTrack.x + shortTrack.width / 2, shortTrack.y + 40, { steps: 4 });
  await page.mouse.up();
  expect((await scrollPosition(page, "short")).top).toBe(0);

  // The forced-colors border keeps the same rectangles.
  await showBars(page, "panel", ["y"]);

  const plain = await out(page, "panel-vthumb").boundingBox();

  await page.emulateMedia({ forcedColors: "active" });
  await settle(page);
  expect(await out(page, "panel-vthumb").boundingBox()).toEqual(plain);
  await page.emulateMedia({ forcedColors: "none" });

  // Under scale(0.5), LTR and RTL: lengths in layout px, the end 1 layout px before the track's end.
  for (const area of ["scaled", "scaled-rtl"]) {
    let sign = 1;

    if (area === "scaled-rtl") {
      sign = -1;
    }

    await scrollViewport(page, area, { top: 1e6, left: sign * 1e6 });
    await settle(page);

    for (const axis of ["y", "x"] as const) {
      const reading = await read(page, area, axis);

      expect(reading.scale, `${area} scale`).toBeCloseTo(0.5, 2);
      expect(reading.paintedLength, `${area} ${axis} length`).toBeCloseTo(reading.length, 0);
      expect(reading.endGap, `${area} ${axis} end`).toBeCloseTo(1, 0);
      await expectPlaced(page, area, axis, "scaled end");
    }
  }

  // Overflow growing inside a fixed-size Content box isn't observed; the next pointer entry
  // corrects it.
  await out(page, "wrapper").scrollIntoViewIfNeeded();
  await out(page, "wrapper-grow").click();
  await settle(page);

  const stale = await read(page, "wrapper", "y");

  expect(Math.abs(stale.paintedLength - Math.max(stale.requested, stale.minimum))).toBeGreaterThan(
    1,
  );
  await showBars(page, "wrapper", ["y"]);
  await settle(page);
  await expectPlaced(page, "wrapper", "y", "after pointer entry");

  // Offsets follow wheel, keys and scrollTo the frame after.
  await leave(page);
  await out(page, "panel").scrollIntoViewIfNeeded();

  const panelPoint = await center(out(page, "panel-viewport"));

  await page.mouse.move(panelPoint.x, panelPoint.y);
  await page.mouse.wheel(0, 100);
  await settle(page);
  await expectPlaced(page, "panel", "y", "wheel");
  await out(page, "panel-viewport").focus();
  await page.keyboard.press("End");
  await expect.poll(async () => (await read(page, "panel", "y")).position).toBeGreaterThan(200);
  await settle(page);
  await expectPlaced(page, "panel", "y", "End");
  await scrollViewport(page, "panel", { top: 40 });
  await settle(page);
  await expectPlaced(page, "panel", "y", "scrollTo");

  expect(await page.evaluate(() => window.scrollAreaErrors!)).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// SA5: visibility

test("SA5 bars are hidden at attach, show on hover for overflowing axes only and hide hideDelay after the pointer leaves or scrolling stops, on the page clock", async ({
  page,
}, info) => {
  await page.clock.install();
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page, "scroll-area", info);
  await settle(page);

  await expect(out(page, "table-vbar")).not.toHaveAttribute("data-visible");
  await expect(out(page, "table-hbar")).not.toHaveAttribute("data-visible");
  await expect(out(page, "table")).toHaveAttribute("data-overflow-y", "");

  // Overflowing axes only: three rows overflow sideways but not down.
  await out(page, "table-few").click();
  await expect(out(page, "table")).not.toHaveAttribute("data-overflow-y");
  await showBars(page, "table", ["x"]);
  await expect(out(page, "table-vbar")).not.toHaveAttribute("data-visible");

  async function hidesAfter(area: string, testid: string, delay: number): Promise<void> {
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);

    try {
      await leave(page);
      await page.clock.runFor(delay - 100);
      await expect(out(page, testid), `${area} at ${delay - 100} ms`).toHaveAttribute(
        "data-visible",
        "",
      );
      await page.clock.runFor(200);
      await expect(out(page, testid), `${area} by ${delay + 100} ms`).not.toHaveAttribute(
        "data-visible",
      );
    } finally {
      await page.clock.resume();
    }
  }

  await hidesAfter("table", "table-hbar", 600);

  // Re-entry cancels the pending hide.
  await showBars(page, "panel", ["y"]);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);

  try {
    await leave(page);
    await page.clock.runFor(300);

    const point = await center(out(page, "panel"));

    await page.mouse.move(point.x, point.y);
    await page.clock.runFor(800);
    await expect(out(page, "panel-vbar")).toHaveAttribute("data-visible", "");
  } finally {
    await page.clock.resume();
  }

  // A replaced hideDelay applies to the next hide.
  await showBars(page, "factory", ["x"]);
  await hidesAfter("factory", "factory-hbar", 200);
  await out(page, "factory-delay").click();
  await showBars(page, "factory", ["x"]);
  await hidesAfter("factory", "factory-hbar", 400);

  // Scrolling with the pointer outside shows the bars, then hides them.
  await out(page, "panel").scrollIntoViewIfNeeded();
  await leave(page);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);

  try {
    // Waits for the scroll event itself, which the paused clock doesn't hold.
    await out(page, "panel-viewport").evaluate(
      (viewport) =>
        new Promise<void>((resolve) => {
          viewport.addEventListener("scroll", () => resolve(), { once: true });
          viewport.scrollTo({ top: 50, behavior: "instant" });
        }),
    );
    await page.clock.runFor(100);
    await expect(out(page, "panel-vbar")).toHaveAttribute("data-visible", "");
    await page.clock.runFor(400);
    await expect(out(page, "panel-vbar")).toHaveAttribute("data-visible", "");
    await page.clock.runFor(300);
    await expect(out(page, "panel-vbar")).not.toHaveAttribute("data-visible");
  } finally {
    await page.clock.resume();
  }
});

// ---------------------------------------------------------------------------------------------
// SA6–SA9: pointer and wheel

/** Drags a thumb by `moved` layout px along its axis and returns the reading it started from. */
async function dragThumb(
  page: Page,
  area: string,
  axis: Axis,
  moved: number,
  rtl = false,
): Promise<AxisReading> {
  const start = await read(page, area, axis);
  const from = await thumbCenter(page, area, axis);
  let dx = 0;
  let dy = moved * start.scale;

  if (axis === "x") {
    dx = moved * start.scale;
    dy = 0;

    if (rtl) {
      dx = -dx;
    }
  }

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 5 });

  return start;
}

async function expectScrolledTo(
  page: Page,
  area: string,
  axis: Axis,
  expected: number,
  label: string,
): Promise<void> {
  const position = await scrollPosition(page, area);
  let actual = position.top;

  if (axis === "x") {
    actual = position.left;
  }

  expect(
    Math.abs(actual - expected),
    `${label}: ${actual} against ${expected}`,
  ).toBeLessThanOrEqual(1);
}

test("SA6 a thumb drag scrolls by the formula on both axes, in RTL and under a scaled ancestor, captures outside the root without selecting or moving focus, and ends cleanly", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page, "scroll-area", info);
  await settle(page);
  await out(page, "sa-before").focus();

  for (const [area, rtl] of [
    ["table", false],
    ["rtl", true],
    ["scaled", false],
    ["scaled-rtl", true],
  ] as const) {
    for (const [axis, moved] of [
      ["y", 70],
      ["x", 100],
    ] as const) {
      await scrollViewport(page, area, { top: 0, left: 0 });
      await showBars(page, area, ["y", "x"]);
      await settle(page);

      const start = await dragThumb(page, area, axis, moved, rtl);
      let expected = dragged(start, moved);

      if (axis === "x" && rtl) {
        expected = -expected;
      }

      await expectScrolledTo(page, area, axis, expected, `${area} ${axis}`);

      // The thumb followed the pointer: its center moved by the same distance.
      await settle(page);

      const after = await read(page, area, axis);

      expect(
        Math.abs(after.paintedOffset - (start.expectedOffset + moved)),
        `${area} ${axis} thumb under the pointer`,
      ).toBeLessThanOrEqual(1);
      await page.mouse.up();
    }
  }

  // No selection, focus unchanged.
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("");
  await expect(out(page, "sa-before")).toBeFocused();

  // Captured outside the root: the drag continues to the end, the bars stay visible while
  // captured, and hide after a release outside.
  await scrollViewport(page, "table", { top: 0, left: 0 });
  await showBars(page, "table", ["y", "x"]);

  const from = await thumbCenter(page, "table", "y");

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 400, from.y + 600, { steps: 8 });

  const range = (await read(page, "table", "y")).range;

  await expectScrolledTo(page, "table", "y", range, "captured to the end");
  await page.waitForTimeout(800);
  await expect(out(page, "table-vbar")).toHaveAttribute("data-visible", "");
  await page.mouse.up();
  await expect(out(page, "table-vbar")).not.toHaveAttribute("data-visible", "", { timeout: 3000 });

  // Other buttons don't drag.
  await scrollViewport(page, "table", { top: 0 });
  await showBars(page, "table", ["y"]);

  const thumb = await thumbCenter(page, "table", "y");

  await page.mouse.move(thumb.x, thumb.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(thumb.x, thumb.y + 60, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  expect((await scrollPosition(page, "table")).top).toBe(0);

  // A second (non-primary) pointer isn't handled; pointercancel ends a drag.
  const secondary = await out(page, "table-vbar").evaluate((track) => {
    const event = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      isPrimary: false,
      pointerId: 9,
    });

    track.dispatchEvent(event);

    return event.defaultPrevented;
  });

  expect(secondary).toBe(false);
  await page.evaluate(() => {
    document.querySelector('[data-testid="table-vbar"]')!.addEventListener(
      "pointerdown",
      (event) => {
        (window as unknown as { dragPointer: number }).dragPointer = (
          event as PointerEvent
        ).pointerId;
      },
      { once: true },
    );
  });
  await page.mouse.move(thumb.x, thumb.y);
  await page.mouse.down();
  await page.mouse.move(thumb.x, thumb.y + 20, { steps: 2 });

  const canceledAt = (await scrollPosition(page, "table")).top;

  expect(canceledAt).toBeGreaterThan(0);
  await out(page, "table-vbar").evaluate((track) => {
    track.dispatchEvent(
      new PointerEvent("pointercancel", {
        bubbles: true,
        pointerId: (window as unknown as { dragPointer: number }).dragPointer,
      }),
    );
  });
  await page.mouse.move(thumb.x, thumb.y + 80, { steps: 4 });
  expect((await scrollPosition(page, "table")).top).toBe(canceledAt);
  await page.mouse.up();

  // A smooth-scrolling viewport moves within the task: the writes are instant.
  await showBars(page, "smooth", ["y"]);

  const smoothStart = await dragThumb(page, "smooth", "y", 40);

  await expectScrolledTo(page, "smooth", "y", dragged(smoothStart, 40), "smooth");
  await page.mouse.up();

  // A rail shrunk under a live drag: the drag ends, with no jump and no non-finite write.
  await scrollViewport(page, "table", { top: 0 });
  await showBars(page, "table", ["y"]);

  const shrink = await thumbCenter(page, "table", "y");

  await page.evaluate(() => {
    document.querySelector('[data-testid="table-vbar"]')!.addEventListener(
      "pointerdown",
      (event) => {
        (window as unknown as { dragPointer: number }).dragPointer = (
          event as PointerEvent
        ).pointerId;
      },
      { once: true },
    );
  });
  await page.mouse.move(shrink.x, shrink.y);
  await page.mouse.down();
  await page.mouse.move(shrink.x, shrink.y + 30, { steps: 3 });

  const beforeShrink = (await scrollPosition(page, "table")).top;

  await out(page, "table-vthumb").evaluate((element: HTMLElement) => {
    element.style.minHeight = "1000px";
  });
  // Observed in the next frames: the following move finds no travel and ends the drag.
  await settle(page);
  await page.mouse.move(shrink.x, shrink.y + 60, { steps: 3 });
  await page.mouse.move(shrink.x, shrink.y + 90, { steps: 3 });

  const afterShrink = (await scrollPosition(page, "table")).top;

  expect(Number.isFinite(afterShrink)).toBe(true);
  expect(afterShrink).toBe(beforeShrink);
  expect(
    await out(page, "table-vbar").evaluate((track) =>
      track.hasPointerCapture((window as unknown as { dragPointer: number }).dragPointer),
    ),
  ).toBe(false);
  await page.mouse.up();
  await page.mouse.down();
  await page.mouse.move(shrink.x, shrink.y + 120, { steps: 3 });
  await page.mouse.up();
  expect((await scrollPosition(page, "table")).top).toBe(beforeShrink);
});

test("SA7 a track press centers the thumb on the pointer and continues as a drag, clamps beyond the rail, under a scaled ancestor too, and reads geometry resized before the frame", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page, "scroll-area", info);
  await settle(page);

  for (const area of ["table", "scaled"]) {
    await scrollViewport(page, area, { top: 0, left: 0 });
    await showBars(page, area, ["y", "x"]);
    await settle(page);

    const reading = await read(page, area, "y");
    const point = await railAt(page, area, "y", 0.75);

    await page.mouse.move(point.x, point.y);
    await page.mouse.down();

    await expectScrolledTo(page, area, "y", pressedAt(reading, point.local), `${area} press`);
    await settle(page);

    const thumb = await thumbCenter(page, area, "y");

    expect(Math.abs(thumb.y - point.y), `${area} thumb centered`).toBeLessThanOrEqual(1);

    // Continues as a drag, 20 layout px back.
    await page.mouse.move(point.x, point.y - 20 * reading.scale, { steps: 3 });
    await expectScrolledTo(
      page,
      area,
      "y",
      pressedAt(reading, point.local - 20),
      `${area} press drag`,
    );
    await page.mouse.up();

    // At the rail's very end, past where the thumb's center can go, clamps to the range.
    const endTrack = await box(out(page, bar(area, "x")));
    const endPoint = {
      x: Math.floor(endTrack.x + endTrack.width) - 1,
      y: Math.round(endTrack.y + endTrack.height / 2),
    };

    await page.mouse.move(endPoint.x, endPoint.y);
    await page.mouse.down();
    await page.mouse.up();
    await expectScrolledTo(page, area, "x", (await read(page, area, "x")).range, `${area} clamp`);
  }

  // Geometry changed under a hovered pointer is read at the press, before the next frame: the
  // clock is paused, so the deferred measure can't run first.
  await scrollViewport(page, "table", { top: 0, left: 0 });
  await showBars(page, "table", ["y", "x"]);
  await page.clock.install();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);

  try {
    await out(page, "table").evaluate((root: HTMLElement) => {
      root.style.inlineSize = "300px";
    });

    // Past the stale thumb; the expected position uses the new rail and the new requested length.
    const point = await railAt(page, "table", "x", 0.9);
    const reading = await read(page, "table", "x");
    const length = Math.max(reading.requested, reading.minimum);

    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.up();

    const expected = pressedAt(reading, point.local, length);

    expect(reading.rail).toBeLessThan(300);
    expect(Math.abs(reading.length - length), "the thumb was still stale").toBeGreaterThan(1);
    await expectScrolledTo(page, "table", "x", expected, "resized before the frame");
  } finally {
    await page.clock.resume();
  }
});

test("SA8 a wheel over a track scrolls its axis, takes a vertical wheel sideways on the horizontal track, chains at the edges, ignores ctrlKey and converts line deltas", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page, "scroll-area", info);
  await settle(page);
  await recordWheels(page);
  await showBars(page, "table", ["y", "x"]);

  let vertical = await railAt(page, "table", "y", 0.5);
  const horizontal = await railAt(page, "table", "x", 0.5);
  const outer = out(page, "outer");

  let record = await wheel(page, vertical, 0, 100);

  expect(record.prevented).toBe(true);
  expect((await scrollPosition(page, "table")).top).toBe(100);

  record = await wheel(page, horizontal, 0, 100);
  expect(record.prevented).toBe(true);
  expect((await scrollPosition(page, "table")).left).toBe(100);

  record = await wheel(page, horizontal, 60, 0);
  expect(record.prevented).toBe(true);
  expect((await scrollPosition(page, "table")).left).toBe(160);

  // At the start: an outward wheel isn't prevented and the outer scroller moves.
  await scrollViewport(page, "table", { top: 0 });
  await outer.evaluate((element) => {
    element.scrollTop = 20;
  });
  await showBars(page, "table", ["y"]);
  vertical = await railAt(page, "table", "y", 0.5);
  record = await wheel(page, vertical, 0, -10);
  expect(record.prevented).toBe(false);
  expect(await outer.evaluate((element) => element.scrollTop)).toBeLessThan(20);
  record = await wheel(page, vertical, 0, 50);
  expect(record.prevented).toBe(true);
  expect((await scrollPosition(page, "table")).top).toBe(50);

  // At the end: outward not prevented (the outer scroller moves), inward prevented.
  await scrollViewport(page, "table", { top: 1e6 });
  await outer.evaluate((element) => {
    element.scrollTop = 0;
  });
  await showBars(page, "table", ["y"]);
  vertical = await railAt(page, "table", "y", 0.5);

  const range = (await read(page, "table", "y")).range;

  record = await wheel(page, vertical, 0, 10);
  expect(record.prevented).toBe(false);
  expect(await outer.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await showBars(page, "table", ["y"]);
  vertical = await railAt(page, "table", "y", 0.5);
  record = await wheel(page, vertical, 0, -100);
  expect(record.prevented).toBe(true);
  expect(Math.abs((await scrollPosition(page, "table")).top - (range - 100))).toBeLessThanOrEqual(
    1,
  );

  // ctrlKey isn't handled; a line-mode wheel moves 3 × 16 px.
  const dispatched = await out(page, "table-vbar").evaluate((track) => {
    const zoom = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
      ctrlKey: true,
    });

    track.dispatchEvent(zoom);

    const viewport = document.querySelector('[data-testid="table-viewport"]')!;

    viewport.scrollTop = 0;

    const lines = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 3,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
    });

    track.dispatchEvent(lines);

    return { zoom: zoom.defaultPrevented, lines: lines.defaultPrevented, top: viewport.scrollTop };
  });

  expect(dispatched).toEqual({ zoom: false, lines: true, top: 48 });

  // Content grown at the old end, then wheeled before the frame: the range is current.
  await scrollViewport(page, "table", { top: 1e6 });
  await showBars(page, "table", ["y"]);
  vertical = await railAt(page, "table", "y", 0.5);
  await page.clock.install();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);

  try {
    const grownRange = await out(page, "table-content").evaluate((content) => {
      const table = content.querySelector("table")!;

      for (let index = 0; index < 10; index++) {
        table.insertRow().insertCell().textContent = `grown ${index}`;
      }

      const viewport = content.parentElement!;

      return viewport.scrollHeight - viewport.clientHeight;
    });
    const before = (await scrollPosition(page, "table")).top;

    expect(grownRange).toBeGreaterThan(before);
    await page.mouse.move(vertical.x, vertical.y);
    await page.mouse.wheel(0, 100);
    await expect
      .poll(async () => (await scrollPosition(page, "table")).top)
      .toBe(Math.min(grownRange, before + 100));
    expect((await lastWheel(page)).prevented).toBe(true);
  } finally {
    await page.clock.resume();
  }
});

test("SA9 right to left: the native range runs to −max, the horizontal thumb starts at the right and maps from the right edge, wheels follow the inline direction, and the vertical axis is exactly as in LTR", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page, "scroll-area", info);
  await settle(page);
  await recordWheels(page);

  await scrollViewport(page, "rtl", { left: -1e6 });

  const end = await out(page, "rtl-viewport").evaluate((viewport) => ({
    left: viewport.scrollLeft,
    max: viewport.scrollWidth - viewport.clientWidth,
  }));

  expect(Math.abs(end.left + end.max)).toBeLessThanOrEqual(1);
  await scrollViewport(page, "rtl", { left: 0, top: 0 });
  await showBars(page, "rtl", ["y", "x"]);
  await settle(page);

  // The thumb starts at the right and the vertical track is on the left.
  const track = await box(out(page, "rtl-hbar"));
  const thumb = await box(out(page, "rtl-hthumb"));

  expect(Math.abs(track.x + track.width - (thumb.x + thumb.width) - 1)).toBeLessThanOrEqual(0.5);
  expect((await box(out(page, "rtl-vbar"))).x).toBeCloseTo((await box(out(page, "rtl"))).x, 0);

  // Horizontal wheels: positive deltaX at the start chains; negative moves left; a vertical
  // wheel over the horizontal track moves left and chains at −max.
  const horizontal = await railAt(page, "rtl", "x", 0.5, true);
  let record = await wheel(page, horizontal, 40, 0);

  expect(record.prevented).toBe(false);
  expect((await scrollPosition(page, "rtl")).left).toBe(0);
  await showBars(page, "rtl", ["x"]);
  record = await wheel(page, horizontal, -40, 0);
  expect(record.prevented).toBe(true);
  expect((await scrollPosition(page, "rtl")).left).toBe(-40);
  await showBars(page, "rtl", ["x"]);
  record = await wheel(page, horizontal, 0, 60);
  expect(record.prevented).toBe(true);
  expect((await scrollPosition(page, "rtl")).left).toBe(-100);
  await scrollViewport(page, "rtl", { left: -1e6 });
  await showBars(page, "rtl", ["x"]);
  record = await wheel(page, horizontal, 0, 60);
  expect(record.prevented).toBe(false);

  // A horizontal drag maps from the right edge; a press does too.
  await scrollViewport(page, "rtl", { left: 0 });
  await showBars(page, "rtl", ["x"]);
  await settle(page);

  const start = await dragThumb(page, "rtl", "x", 100, true);

  await expectScrolledTo(page, "rtl", "x", -dragged(start, 100), "RTL drag");
  await page.mouse.up();
  await scrollViewport(page, "rtl", { left: 0 });
  await showBars(page, "rtl", ["x"]);
  await settle(page);

  const reading = await read(page, "rtl", "x");
  const press = await railAt(page, "rtl", "x", 0.8, true);

  await page.mouse.move(press.x, press.y);
  await page.mouse.down();
  await page.mouse.up();
  await expectScrolledTo(page, "rtl", "x", -pressedAt(reading, press.local), "RTL press");

  // The vertical axis: positive scrollTop by the same formula as LTR.
  await scrollViewport(page, "rtl", { top: 0 });
  await showBars(page, "rtl", ["y"]);
  await settle(page);

  const verticalStart = await dragThumb(page, "rtl", "y", 70);

  await expectScrolledTo(page, "rtl", "y", dragged(verticalStart, 70), "RTL vertical drag");
  await page.mouse.up();
  await scrollViewport(page, "rtl", { top: 0 });
  await showBars(page, "rtl", ["y"]);
  await settle(page);

  const verticalReading = await read(page, "rtl", "y");
  const below = await railAt(page, "rtl", "y", 0.6);

  await page.mouse.move(below.x, below.y);
  await page.mouse.down();
  await page.mouse.up();
  await expectScrolledTo(
    page,
    "rtl",
    "y",
    pressedAt(verticalReading, below.local),
    "RTL vertical press",
  );

  const vertical = await railAt(page, "rtl", "y", 0.5);

  await scrollViewport(page, "rtl", { top: 0 });
  await showBars(page, "rtl", ["y"]);
  record = await wheel(page, vertical, 0, 100);
  expect(record.prevented).toBe(true);
  expect((await scrollPosition(page, "rtl")).top).toBe(100);
  await scrollViewport(page, "rtl", { top: 0 });
  await showBars(page, "rtl", ["y"]);
  record = await wheel(page, vertical, 0, -100);
  expect(record.prevented).toBe(false);
  await scrollViewport(page, "rtl", { top: 1e6 });
  await showBars(page, "rtl", ["y"]);

  const verticalRange = (await read(page, "rtl", "y")).range;

  record = await wheel(page, vertical, 0, 100);
  expect(record.prevented).toBe(false);
  await showBars(page, "rtl", ["y"]);
  record = await wheel(page, vertical, 0, -100);
  expect(record.prevented).toBe(true);
  expect(
    Math.abs((await scrollPosition(page, "rtl")).top - (verticalRange - 100)),
  ).toBeLessThanOrEqual(1);
});

// ---------------------------------------------------------------------------------------------
// SA10–SA12: composition, lifecycle and split boundaries

test("SA10 composition: a hostDirectives root and Scrollbar, factory and existing Options for both inputs, nested and repeated roots independent, and State through a template reference", async ({
  page,
}, info) => {
  await page.clock.install();
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page, "scroll-area", info);
  await settle(page);

  // Template-reference State.
  await expect(out(page, "table-state")).toHaveText("true true false");

  async function hideDelay(area: string, axis: Axis, delay: number): Promise<void> {
    const testid = bar(area, axis);

    await showBars(page, area, [axis]);
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);

    try {
      await leave(page);
      await page.clock.runFor(delay - 100);
      await expect(out(page, testid), `${area} before ${delay}`).toHaveAttribute(
        "data-visible",
        "",
      );
      await page.clock.runFor(200);
      await expect(out(page, testid), `${area} after ${delay}`).not.toHaveAttribute("data-visible");
    } finally {
      await page.clock.resume();
    }
  }

  // The composer exposes hideDelay (300); its Scrollbar composer is vertical.
  await expect(out(page, "composed-vbar")).toHaveAttribute("data-orientation", "vertical");
  await hideDelay("composed", "y", 300);
  await expect(out(page, "composed-content")).toHaveAttribute("data-active-state", "false");

  // Factory: 200 ms and horizontal, over the decoys 5000 and vertical.
  await expect(out(page, "factory-hbar")).toHaveAttribute("data-orientation", "horizontal");
  await hideDelay("factory", "x", 200);

  // Existing: 1000 ms and vertical, over the decoys 5000 and horizontal.
  await expect(out(page, "existing-vbar")).toHaveAttribute("data-orientation", "vertical");
  await expect(out(page, "existing")).toHaveAttribute("data-overflow-y", "");
  await hideDelay("existing", "y", 1000);

  // Nested roots: the inner hides on its own while the pointer stays over the outer.
  await showBars(page, "nested-inner", ["y"]);
  await expect(out(page, "nested-outer-vbar")).toHaveAttribute("data-visible", "");
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);

  try {
    const outer = await box(out(page, "nested-outer"));

    await page.mouse.move(outer.x + 10, outer.y + outer.height - 10);
    await page.clock.runFor(800);
    await expect(out(page, "nested-inner-vbar")).not.toHaveAttribute("data-visible");
    await expect(out(page, "nested-outer-vbar")).toHaveAttribute("data-visible", "");
    await expect(out(page, "nested-inner-content")).toHaveAttribute("data-active-state", "false");
    await expect(out(page, "nested-outer-content")).toHaveAttribute("data-active-state", "true");
  } finally {
    await page.clock.resume();
  }

  // Repeated per-line areas are independent.
  await showBars(page, "line-0", ["y"]);
  await expect(out(page, "line-1-vbar")).not.toHaveAttribute("data-visible");
  await expect(out(page, "line-2-vbar")).not.toHaveAttribute("data-visible");
  await expect(out(page, "line-1")).toHaveAttribute("data-overflow-y", "");
});

test("SA11 lifecycle: removing a Scrollbar, a Thumb, the Viewport or the root mid-drag or mid-timer ends the drag and writes nothing stale; a replacement is measured fresh", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page, "scroll-area", info);
  await settle(page);

  async function startDrag(): Promise<{ x: number; y: number }> {
    await showBars(page, "toggles", ["y"]);

    const from = await center(out(page, "toggles-vthumb"));

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 10, { steps: 2 });

    return from;
  }

  async function click(testid: string): Promise<void> {
    await out(page, testid).evaluate((button: HTMLButtonElement) => {
      button.click();
    });
  }

  function viewport(name: string): Locator {
    return out(page, `toggles-viewport-${name}`);
  }

  // The Scrollbar removed mid-drag: no later writes.
  let from = await startDrag();

  await click("toggles-bar");
  await expect(out(page, "toggles-vbar")).toHaveCount(0);

  let top = await viewport("a").evaluate((element) => element.scrollTop);

  await page.mouse.move(from.x, from.y + 80, { steps: 4 });
  expect(await viewport("a").evaluate((element) => element.scrollTop)).toBe(top);
  await page.mouse.up();
  await click("toggles-bar");
  await settle(page);

  // The Thumb removed and remounted: observed and measured again.
  await click("toggles-thumb");
  await expect(out(page, "toggles-vthumb")).toHaveCount(0);
  await click("toggles-thumb");
  await settle(page);
  await expectPlaced(page, "toggles", "y", "remounted Thumb", "toggles-viewport-a");

  // The Viewport swapped mid-drag: the overflow attribute drops, the old drag never writes the
  // replacement, which is measured fresh.
  await page.evaluate(() => {
    window.scrollAreaMutations = [];

    const root = document.querySelector('[data-testid="toggles"]')!;

    new MutationObserver((records) => {
      for (const record of records) {
        window.scrollAreaMutations!.push({
          testid: "toggles",
          name: record.attributeName ?? "",
          oldValue: record.oldValue,
        });
      }
    }).observe(root, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["data-overflow-y"],
    });
  });
  await page.evaluate(() => {
    document.querySelector('[data-testid="toggles-vbar"]')!.addEventListener(
      "pointerdown",
      (event) => {
        (window as unknown as { dragPointer: number }).dragPointer = (
          event as PointerEvent
        ).pointerId;
      },
      { once: true },
    );
  });
  from = await startDrag();
  await click("toggles-viewport");
  await expect(viewport("b")).toHaveCount(1);
  // The Viewport's removal ended the drag at once: capture is released before any move.
  expect(
    await out(page, "toggles-vbar").evaluate((track) =>
      track.hasPointerCapture((window as unknown as { dragPointer: number }).dragPointer),
    ),
  ).toBe(false);
  await page.mouse.move(from.x, from.y + 100, { steps: 5 });
  expect(await viewport("b").evaluate((element) => element.scrollTop)).toBe(0);
  await page.mouse.up();
  await settle(page);
  await expect(out(page, "toggles")).toHaveAttribute("data-overflow-y", "");

  const overflowRecords = await page.evaluate(() => window.scrollAreaMutations!);

  // Removed (old value "") and then set again by the replacement's measure.
  expect(overflowRecords.map((record) => record.oldValue)).toEqual(["", null]);
  await expectPlaced(page, "toggles", "y", "replacement Viewport", "toggles-viewport-b");
  top = await viewport("b").evaluate((element) => element.scrollTop);
  expect(top).toBe(0);

  // The root destroyed with a pending hide timer and a pending measure frame.
  await showBars(page, "toggles", ["y"]);
  await leave(page);
  await page.evaluate(() => {
    const thumb = document.querySelector('[data-testid="toggles-vthumb"]')!;

    window.scrollAreaThumbWrites = 0;
    window.scrollAreaNodes = { thumb };
    new MutationObserver((records) => {
      window.scrollAreaThumbWrites! += records.length;
    }).observe(thumb, { attributes: true, attributeFilter: ["style"] });

    // A resize schedules a measure frame; the root goes in the same task.
    (document.querySelector('[data-testid="toggles"]') as HTMLElement).style.inlineSize = "200px";
    requestAnimationFrame(() => {
      (document.querySelector('[data-testid="toggles-root"]') as HTMLButtonElement).click();
    });
  });
  await expect(out(page, "toggles")).toHaveCount(0);
  await page.waitForTimeout(1000);
  await settle(page);

  const writes = await page.evaluate(() => window.scrollAreaThumbWrites!);

  info.annotations.push({ type: "writes before removal", description: String(writes) });
  expect(
    await page.evaluate(() => {
      const before = window.scrollAreaThumbWrites!;

      return new Promise<number>((resolve) => {
        setTimeout(() => {
          resolve(window.scrollAreaThumbWrites! - before);
        }, 300);
      });
    }),
  ).toBe(0);
});

test("SA12 split boundaries: a Scrollbar or a Viewport still dehydrated in its own block is neither measured nor handled, and once it hydrates the server's node registers and shows", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await recordErrors(page);

  const release = await bootstrapHeld(page, "/scroll-area-split", info);

  if (!incremental(info)) {
    // Without incremental hydration the server renders the blocks' placeholders; the browser
    // renders them on idle, and the areas then work as one.
    await expect(out(page, "bar-vbar")).toHaveCount(0);
    expect(await overflowY(out(page, "bar-viewport"))).toBe("hidden");
    release();
    await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
    await out(page, "attach-fixture").click();
    await expect(out(page, "bar-vbar")).toHaveCount(1);
    await expect(out(page, "port-viewport")).toHaveCount(1);
    await settle(page);
    expect(await overflowY(out(page, "bar-viewport"))).toBe("auto");
    await showBars(page, "bar", ["y"]);
    await expectPlaced(page, "bar", "y", "rendered");
    await showBars(page, "port", ["y"]);
    await expectPlaced(page, "port", "y", "rendered");
    await assertReferences(page, info);
    await stopRetentionObservation(page);

    return;
  }

  // Server HTML: everything rendered, the bar's axis `auto`.
  expect(await overflowY(out(page, "bar-viewport"))).toBe("auto");
  await page.evaluate(() => {
    window.scrollAreaNodes = {
      bar: document.querySelector('[data-testid="bar-vbar"]'),
      port: document.querySelector('[data-testid="port-viewport"]'),
    };
  });
  release();
  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  await out(page, "attach-fixture").click();
  await expect(page.locator("acceptance-scroll-area-split-fixture")).toHaveAttribute(
    "data-client-rendered",
    "true",
  );
  await expect(out(page, "fixture-attached")).toHaveText("true");
  await settle(page);

  // The Scrollbar's block is dormant: its axis is `hidden` (the documented residual), nothing is
  // measured or shown on it.
  expect(await overflowY(out(page, "bar-viewport"))).toBe("hidden");
  await out(page, "bar").hover();
  await settle(page);
  await expect(out(page, "bar-vbar")).not.toHaveAttribute("data-visible");
  expect(await out(page, "bar-vthumb").getAttribute("style")).toBeNull();

  // The Viewport's block is dormant: no overflow, and the tracks neither handle nor prevent.
  await expect(out(page, "port")).not.toHaveAttribute("data-overflow-y");
  await out(page, "port").hover();
  await settle(page);
  await expect(out(page, "port-vbar")).not.toHaveAttribute("data-visible");

  const unhandled = await out(page, "port-vbar").evaluate((track) => {
    const press = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      isPrimary: true,
      pointerId: 1,
    });
    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100 });

    track.dispatchEvent(press);
    track.dispatchEvent(wheel);

    return {
      press: press.defaultPrevented,
      wheel: wheel.defaultPrevented,
      top: document.querySelector('[data-testid="port-viewport"]')!.scrollTop,
    };
  });

  expect(unhandled).toEqual({ press: false, wheel: false, top: 0 });

  // Hydrating each block registers the server's node.
  await out(page, "hydrate-bar").click();
  await expect.poll(() => overflowY(out(page, "bar-viewport"))).toBe("auto");
  await showBars(page, "bar", ["y"]);
  await settle(page);
  await expectPlaced(page, "bar", "y", "hydrated");
  await out(page, "hydrate-port").click();
  await expect(out(page, "port")).toHaveAttribute("data-overflow-y", "");
  await showBars(page, "port", ["y"]);
  await settle(page);
  await expectPlaced(page, "port", "y", "hydrated");
  expect(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="bar-vbar"]') === window.scrollAreaNodes!["bar"] &&
        document.querySelector('[data-testid="port-viewport"]') === window.scrollAreaNodes!["port"],
    ),
  ).toBe(true);
  await assertReferences(page, info);
  await stopRetentionObservation(page);
  expect(await page.evaluate(() => window.scrollAreaErrors!)).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// SA14–SA18: focus, forced colors, native flows, the appeal flow and authored triggers

test("SA14 the Viewport is one tab stop between its neighbours in every engine, a static tabindex removes it, tracks and thumbs stay out of the accessibility tree, and a named region keeps its name", async ({
  page,
}, info) => {
  await fixture(page, "scroll-area", info);

  await out(page, "table-narrow").focus();
  await page.keyboard.press("Tab");
  await expect(out(page, "table-viewport")).toBeFocused();

  await out(page, "scaled-rtl-viewport").focus();
  await page.keyboard.press("Tab");
  await expect(out(page, "focus-viewport")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(out(page, "focus-input")).toBeFocused();

  await out(page, "control-input").focus();
  await page.keyboard.press("Tab");
  await expect(out(page, "sa-after")).toBeFocused();
  await expect(out(page, "untabbable-viewport")).toHaveAttribute("tabindex", "-1");

  await expect(out(page, "table-viewport")).toHaveRole("region");
  await expect(out(page, "table-viewport")).toHaveAccessibleName("Addresses");

  const snapshot = await out(page, "table").ariaSnapshot();

  expect(snapshot).toMatch(/^- region "Addresses"/);
  expect(snapshot).not.toMatch(/scrollbar|thumb/i);

  for (const testid of ["table-vbar", "table-hbar", "table-vthumb", "table-hthumb"]) {
    await expect(out(page, testid)).not.toBeFocused();
    expect(
      await out(page, testid).evaluate((element: HTMLElement) => element.tabIndex),
    ).toBeLessThan(0);
  }
});

test("SA15 the README's forced-colors recipe keeps the thumb visible against its track", async ({
  page,
  browserName,
}, info) => {
  await page.emulateMedia({ forcedColors: "active" });
  await fixture(page, "scroll-area", info);
  await settle(page);
  await showBars(page, "panel", ["y"]);
  await settle(page);

  const track = await box(out(page, "panel-vbar"));
  const thumb = await box(out(page, "panel-vthumb"));
  const shot = await page.screenshot({
    clip: { x: track.x, y: track.y, width: track.width, height: track.height },
  });

  await info.attach("panel-vbar-forced", { body: shot, contentType: "image/png" });

  const colours = await page.evaluate(
    async ({ base64, thumbY, trackY }) => {
      const image = new Image();

      image.src = `data:image/png;base64,${base64}`;
      await image.decode();

      const canvas = document.createElement("canvas");

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      const context = canvas.getContext("2d")!;

      context.drawImage(image, 0, 0);

      const ratio = image.naturalHeight / Math.round(image.naturalHeight / devicePixelRatio);
      const x = Math.floor(image.naturalWidth / 2);
      const thumbPixel = context.getImageData(x, Math.floor(thumbY * ratio), 1, 1).data;
      const trackPixel = context.getImageData(x, Math.floor(trackY * ratio), 1, 1).data;

      return { thumb: [...thumbPixel].slice(0, 3), track: [...trackPixel].slice(0, 3) };
    },
    {
      base64: shot.toString("base64"),
      thumbY: thumb.y - track.y + thumb.height / 2,
      trackY: track.height - 3,
    },
  );

  const difference = Math.max(
    Math.abs(colours.thumb[0]! - colours.track[0]!),
    Math.abs(colours.thumb[1]! - colours.track[1]!),
    Math.abs(colours.thumb[2]! - colours.track[2]!),
  );

  info.annotations.push({ type: "forced colours", description: JSON.stringify(colours) });

  if (browserName === "webkit") {
    // WebKit's emulation doesn't remap colours; the result is recorded, not asserted.
    return;
  }

  expect(difference, JSON.stringify(colours)).toBeGreaterThan(100);
});

test("SA16 native flows stay native: focus scrolling moves the thumb, selection autoscroll extends past the edge where a plain scroller does, and touch scrolls and drags in Chromium", async ({
  page,
  browser,
  browserName,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page, "scroll-area", info);
  await settle(page);

  // Tab to an offscreen input inside the viewport: scrolled into view, the thumb follows.
  await out(page, "focus-viewport").focus();
  await page.keyboard.press("Tab");
  await expect(out(page, "focus-input")).toBeFocused();
  await expect.poll(async () => (await scrollPosition(page, "focus")).top).toBeGreaterThan(0);
  await settle(page);
  await expectPlaced(page, "focus", "y", "focus scrolling");

  // Selection autoscroll, ScrollArea against the plain control box.
  async function autoscroll(
    area: string,
    viewport: string,
  ): Promise<{ top: number; selected: number }> {
    await out(page, viewport).evaluate((element) => {
      element.scrollTop = 0;
    });
    await out(page, area).scrollIntoViewIfNeeded();

    const rect = await box(out(page, viewport));

    await page.mouse.move(rect.x + 20, rect.y + 20);
    await page.mouse.down();
    await page.mouse.move(rect.x + 40, rect.y + rect.height + 30, { steps: 6 });
    await page.waitForTimeout(600);
    await page.mouse.move(rect.x + 41, rect.y + rect.height + 31);
    await page.waitForTimeout(300);
    await page.mouse.up();

    return out(page, viewport).evaluate((element) => ({
      top: element.scrollTop,
      selected: window.getSelection()?.toString().length ?? 0,
    }));
  }

  const control = await autoscroll("control", "control");
  const area = await autoscroll("focus", "focus-viewport");

  info.annotations.push({
    type: "selection autoscroll",
    description: JSON.stringify({ control, area }),
  });

  if (control.top > 0) {
    expect(area.top).toBeGreaterThan(0);
    expect(area.selected).toBeGreaterThan(0);
  } else {
    info.annotations.push({
      type: "unqualified",
      description: `${browserName}: the plain control box doesn't autoscroll under automation`,
    });
  }

  await page.evaluate(() => window.getSelection()?.removeAllRanges());

  if (browserName !== "chromium") {
    return;
  }

  // Touch, Chromium only: a synthesized touch scroll moves the viewport natively and shows the
  // bars, which hide after the delay; a touch drag on the shown thumb scrolls by the formula.
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1280, height: 900 },
  });

  try {
    const touch = await context.newPage();

    await fixture(touch, "scroll-area", info);
    await settle(touch);
    await out(touch, "panel").scrollIntoViewIfNeeded();

    const session = await context.newCDPSession(touch);
    const panel = await center(out(touch, "panel-viewport"));
    const finger = { x: Math.round(panel.x), y: Math.round(panel.y), id: 1 };

    // A touch pan over the content: Chromium scrolls the viewport natively. (CDP's
    // `Input.synthesizeScrollGesture` scrolls neither the viewport nor the page here.)
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [finger] });

    for (const step of [10, 30, 60, 90]) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...finger, y: finger.y - step }],
      });
    }

    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(async () => (await scrollPosition(touch, "panel")).top).toBeGreaterThan(0);
    await expect(out(touch, "panel-vbar")).toHaveAttribute("data-visible", "");
    await expect(out(touch, "panel-vbar")).not.toHaveAttribute("data-visible", "", {
      timeout: 3000,
    });

    // Show the bars with a scroll, then drag the thumb by touch.
    await scrollViewport(touch, "panel", { top: 0 });
    await expect(out(touch, "panel-vbar")).toHaveAttribute("data-visible", "");
    await settle(touch);

    const start = await read(touch, "panel", "y");
    const thumb = await center(out(touch, "panel-vthumb"));
    const point = { x: thumb.x, y: thumb.y, id: 1 };

    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });

    for (const step of [10, 20, 30, 40]) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...point, y: thumb.y + step }],
      });
    }

    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expectScrolledTo(touch, "panel", "y", dragged(start, 40), "touch drag");
  } finally {
    await context.close();
  }
});

test("SA17 the appeal flow: an area in a collapsed Accordion item measures when expanded, and follows its content's switch and the page's breakpoints in an OnPush composer", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await recordErrors(page);
  await fixture(page, "scroll-area-appeal", info);
  await settle(page);

  await expect(out(page, "appeal-panel")).toBeHidden();
  await expect(out(page, "appeal")).not.toHaveAttribute("data-overflow-x");
  await out(page, "appeal-trigger").click();
  await expect(out(page, "appeal-panel")).toBeVisible();
  await expect(out(page, "appeal")).toHaveAttribute("data-overflow-x", "");
  await expect(out(page, "appeal")).toHaveAttribute("data-overflow-y", "");
  await settle(page);
  await expectPlaced(page, "appeal", "x", "expanded");
  await expectPlaced(page, "appeal", "y", "expanded");

  // The form at 1280 px is 450 px wide: no horizontal overflow.
  await out(page, "appeal-switch").click();
  await expect(out(page, "appeal")).not.toHaveAttribute("data-overflow-x");
  await expect(out(page, "appeal-content")).toHaveAttribute("data-overflow-x-state", "false");

  // 800 px: 700 px wide, overflowing; 1300 px: 1000 px; back to 1280 px: none.
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(out(page, "appeal")).toHaveAttribute("data-overflow-x", "");
  await settle(page);
  await expectPlaced(page, "appeal", "x", "800 px");
  await page.setViewportSize({ width: 1300, height: 900 });
  await settle(page);
  await expectPlaced(page, "appeal", "x", "1300 px");
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(out(page, "appeal")).not.toHaveAttribute("data-overflow-x");

  // Shown on hover in the OnPush view, and the table back on both axes.
  await showBars(page, "appeal", ["y"]);
  await out(page, "appeal-switch").evaluate((button: HTMLButtonElement) => {
    button.click();
  });
  await expect(out(page, "appeal")).toHaveAttribute("data-overflow-x", "");
  await expect(out(page, "appeal-hbar")).toHaveAttribute("data-visible", "");
  await settle(page);

  const point = await railAt(page, "appeal", "x", 0.5);

  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.up();
  expect((await scrollPosition(page, "appeal")).left).toBeGreaterThan(0);
  await settle(page);
  await expectPlaced(page, "appeal", "x", "table again");
  await expectPlaced(page, "appeal", "y", "table again");
  expect(await page.evaluate(() => window.scrollAreaErrors!)).toEqual([]);
});

/** The position SA18 scrolls each dormant interaction viewport to by script, before hydration. */
const dormantPosition = 30;

/**
 * With focus on the dormant `<area>-viewport` of a `hydrate on interaction` block, presses PageDown
 * once: the block hydrates, keeps focus, and that key scrolls the viewport, from the position
 * `scrollDormant` set before hydration, by at least half its height, never the document. Returns
 * the distance it scrolled.
 */
async function hydratingPageDown(page: Page, area: string, info: TestInfo): Promise<number> {
  await expect(out(page, `${area}-viewport`)).toBeFocused();
  await expect(out(page, `${area}-rendered`)).not.toHaveAttribute("data-client-rendered");

  const start = (await scrollPosition(page, area)).top;
  const documentStart = await page.evaluate(() => scrollY);

  expect(start, `${area} scrolled before hydration`).toBe(dormantPosition);
  await page.keyboard.press("PageDown");
  await expect(out(page, `${area}-rendered`)).toHaveAttribute("data-client-rendered", "true");
  await expect(out(page, `${area}-viewport`)).toBeFocused();

  let position = -1;

  await expect
    .poll(async () => {
      const now = (await scrollPosition(page, area)).top;
      const stable = now === position;

      position = now;

      return stable;
    })
    .toBe(true);

  const height = await out(page, `${area}-viewport`).evaluate((viewport) => viewport.clientHeight);

  info.annotations.push({
    type: "hydrating PageDown",
    description: `${area}: ${start} to ${position} of ${height}`,
  });
  expect(position - start, `${area}: the hydrating PageDown scrolled it`).toBeGreaterThanOrEqual(
    height / 2,
  );
  expect(await page.evaluate(() => scrollY), `${area}: the document didn't scroll`).toBe(
    documentStart,
  );

  return position - start;
}

test("SA18 authored hydrate triggers on a root: hovering hydrates a hover block and its bars show without another move; Tab and PageDown hydrate an interaction block, keeping focus, and that first key scrolls it from its pre-hydration position as far as a plain scroller's", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  const release = await bootstrapHeld(page, "/scroll-area-triggers", info);

  if (!incremental(info)) {
    // Without incremental hydration the blocks render on idle after bootstrap.
    release();
    await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
    await out(page, "attach-fixture").click();
    await expect(out(page, "hover-rendered")).toHaveAttribute("data-client-rendered", "true");
    await expect(out(page, "interaction-rendered")).toHaveAttribute("data-client-rendered", "true");
    await showBars(page, "hover", ["y"]);
    await showBars(page, "interaction", ["y"]);
    await assertReferences(page, info);
    await stopRetentionObservation(page);

    return;
  }

  // Angular's trigger annotations are on the block roots; Origami adds none of its own.
  expect(await out(page, "hover").getAttribute("jsaction")).toMatch(/mouseenter|mouseover/);
  expect(await out(page, "interaction").getAttribute("jsaction")).toMatch(/click|keydown/);

  for (const testid of [
    "hover-viewport",
    "hover-vbar",
    "interaction-viewport",
    "interaction-vbar",
  ]) {
    expect(await out(page, testid).getAttribute("jsaction"), testid).toBeNull();
  }

  // Before bootstrap, by script (no trigger event): both interaction viewports leave the top.
  for (const area of ["interaction", "plain"]) {
    await scrollViewport(page, area, { top: dormantPosition });
  }

  release();
  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  await out(page, "attach-fixture").click();
  await expect(out(page, "fixture-attached")).toHaveText("true");
  await expect(out(page, "hover-rendered")).not.toHaveAttribute("data-client-rendered");

  // Hover: the block hydrates and, the pointer resting, its bars show.
  const hover = await center(out(page, "hover-viewport"));

  await page.mouse.move(hover.x, hover.y);
  await expect(out(page, "hover-rendered")).toHaveAttribute("data-client-rendered", "true");
  await expect(out(page, "hover-vbar")).toHaveAttribute("data-visible", "");

  // Interaction: Tab to the dormant viewport, PageDown; then the same for the plain control.
  await leave(page);
  await out(page, "triggers-before").focus();

  // The hover block's viewport is the next tab stop; then the interaction one, then the control.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");

  const interaction = await hydratingPageDown(page, "interaction", info);

  await page.keyboard.press("Tab");

  const plain = await hydratingPageDown(page, "plain", info);

  // The hydrating key scrolls Origami's viewport as far as it scrolls the plain one.
  expect(Math.abs(interaction - plain)).toBeLessThanOrEqual(1);
  await settle(page);
  await expectPlaced(page, "interaction", "y", "after hydration");
  expect((await read(page, "interaction", "y")).expectedOffset).toBeGreaterThan(0);
  await assertReferences(page, info);
  await stopRetentionObservation(page);
});

// ---------------------------------------------------------------------------------------------
// SA19: what hydration keeps between its creation and update passes

/** An area's scroll position and box, as the browser lays it out. */
interface Laid {
  readonly top: number;
  readonly left: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly scrollWidth: number;
  readonly overflowX: string;
}

async function laid(page: Page, area: string): Promise<Laid> {
  return out(page, `${area}-viewport`).evaluate((viewport: HTMLElement) => ({
    top: viewport.scrollTop,
    left: viewport.scrollLeft,
    clientWidth: viewport.clientWidth,
    clientHeight: viewport.clientHeight,
    scrollWidth: viewport.scrollWidth,
    overflowX: getComputedStyle(viewport).overflowX,
  }));
}

/** Polls until the area's position stops changing, then returns its layout. */
async function laidOut(page: Page, area: string): Promise<Laid> {
  let last = "";

  await expect
    .poll(async () => {
      const now = JSON.stringify(await laid(page, area));
      const same = now === last;

      last = now;

      return same;
    })
    .toBe(true);

  return laid(page, area);
}

/**
 * With focus on the dormant `<area>-viewport` of a `hydrate on interaction` block, presses `key`
 * once: the block hydrates and keeps focus. Returns the layout before and after, and whether the
 * document scrolled.
 */
async function hydratingKey(
  page: Page,
  area: string,
  key: string,
  info: TestInfo,
): Promise<{ before: Laid; after: Laid; documentScrolled: boolean }> {
  await expect(out(page, `${area}-viewport`)).toBeFocused();
  await expect(out(page, `${area}-rendered`)).not.toHaveAttribute("data-client-rendered");

  const before = await laid(page, area);
  const documentStart = await page.evaluate(() => [scrollX, scrollY]);

  await page.keyboard.press(key);
  await expect(out(page, `${area}-rendered`)).toHaveAttribute("data-client-rendered", "true");
  await expect(out(page, `${area}-viewport`)).toBeFocused();

  const after = await laidOut(page, area);
  const documentEnd = await page.evaluate(() => [scrollX, scrollY]);
  const documentScrolled = documentEnd.join() !== documentStart.join();

  info.annotations.push({
    type: `hydrating ${key}`,
    description: `${area}: ${JSON.stringify(before)} to ${JSON.stringify(after)}, document scrolled: ${documentScrolled}`,
  });

  return { before, after, documentScrolled };
}

/** The areas whose Viewport and Content style writes SA19 records from before bootstrap. */
const styleWatched = [
  "axis",
  "override",
  "eager-classed",
  "eager-content",
  "eager-viewport",
  "classed",
  "content",
  "viewport",
];

/**
 * A two-axis area's final Viewport and Content declarations: Origami's, plus `color: inherit` where
 * the consumer's static style put it.
 */
async function expectRestored(
  page: Page,
  area: string,
  styled: "content" | "viewport",
): Promise<void> {
  const viewport = await out(page, `${area}-viewport`).evaluate((element: HTMLElement) =>
    element.getAttribute("style"),
  );
  const content = await out(page, `${area}-content`).evaluate((element: HTMLElement) =>
    element.getAttribute("style"),
  );
  const normalized = await page.evaluate(
    (values) =>
      values.map((value) => {
        const probe = document.createElement("div");
        const declarations: string[] = [];

        probe.setAttribute("style", value ?? "");

        for (let index = 0; index < probe.style.length; index++) {
          const name = probe.style.item(index);

          declarations.push(`${name}: ${probe.style.getPropertyValue(name)}`);
        }

        return declarations.sort();
      }),
    [viewport, content],
  );
  const viewportDeclarations = ["overflow-x: auto", "overflow-y: auto", "scrollbar-width: none"];
  const contentDeclarations = ["inline-size: max-content", "min-inline-size: 100%"];

  if (styled === "viewport") {
    viewportDeclarations.unshift("color: inherit");
  } else {
    contentDeclarations.unshift("color: inherit");
  }

  expect(normalized, `${area}: the bindings restored Origami's declarations`).toEqual([
    viewportDeclarations,
    contentDeclarations,
  ]);
}

/** The width-, height- and range-defining part of a layout: the box the server laid out. */
function boxOf(layout: Laid): number[] {
  return [layout.clientWidth, layout.clientHeight, layout.scrollWidth];
}

test("SA19 hydration keeps each axis's policy and, styled by class, the position: a vertical-only area's hydrating ArrowRight leaves its genuine sideways overflow unscrolled like a plain overflow-x: hidden scroller, also under a template overflow-x override; a two-axis area keeps its horizontal position and box eagerly and on interaction; a static style of the consumer's on its Content or Viewport ends restored, its position recorded", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  const release = await bootstrapHeld(page, "/scroll-area-hydration", info);
  const eager = ["eager-classed", "eager-content", "eager-viewport"];
  const server: Record<string, Laid> = {};

  // Without incremental hydration the blocks render on idle after bootstrap, so only the eager
  // areas are server-rendered.
  const blocks = incremental(info);
  const twoAxis = blocks ? [...eager, "classed", "content", "viewport"] : eager;

  // Before bootstrap, by script (no trigger event): the vertical-only areas and the override leave
  // the top; the two-axis areas leave the top and the start.
  if (blocks) {
    for (const area of ["axis", "axis-plain", "override"]) {
      await scrollViewport(page, area, { top: dormantPosition });
    }
  }

  for (const area of twoAxis) {
    await scrollViewport(page, area, { top: dormantPosition, left: dormantPosition });
    server[area] = await laid(page, area);
    expect(server[area]!.scrollWidth, `${area} overflows sideways`).toBeGreaterThan(
      server[area]!.clientWidth + 100,
    );
    expect([server[area]!.top, server[area]!.left]).toEqual([dormantPosition, dormantPosition]);
  }

  // Before bootstrap: record every Viewport and Content style write with its delivery.
  await page.evaluate((watched) => {
    window.scrollAreaMutations = [];

    let batch = 0;
    const observer = new MutationObserver((records) => {
      batch += 1;

      for (const record of records) {
        window.scrollAreaMutations!.push({
          testid: (record.target as Element).getAttribute("data-testid") ?? "",
          name: record.attributeName ?? "",
          oldValue: record.oldValue,
          batch,
        });
      }
    });

    for (const area of watched) {
      for (const part of ["viewport", "content"]) {
        const element = document.querySelector(`[data-testid="${area}-${part}"]`);

        if (element !== null) {
          observer.observe(element, {
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ["style"],
          });
        }
      }
    }
  }, styleWatched);

  release();
  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  await out(page, "attach-fixture").click();
  await expect(out(page, "fixture-attached")).toHaveText("true");

  // Eager. Styled by class, Origami's parts have no static style, so hydration leaves the server's
  // `style` until the bindings write the same values: position and box are the server's. A static
  // style of the consumer's is rewritten to just its declarations in the creation pass, and the
  // update pass restores Origami's, which a layout in between can miss (README, SPEC §36).
  for (const area of eager) {
    await expect(out(page, `${area}-rendered`)).toHaveAttribute("data-client-rendered", "true");
  }

  expect(await laidOut(page, "eager-classed"), "eager-classed after eager hydration").toEqual(
    server["eager-classed"],
  );

  for (const [area, styled] of [
    ["eager-content", "content"],
    ["eager-viewport", "viewport"],
  ] as const) {
    const after = await laidOut(page, area);

    info.annotations.push({
      type: "static style, eager",
      description: `${area}: ${JSON.stringify(server[area])} to ${JSON.stringify(after)}`,
    });
    expect(boxOf(after), `${area} ends with the server's box`).toEqual(boxOf(server[area]!));
    await expectRestored(page, area, styled);
  }

  await settle(page);

  for (const area of eager) {
    await expectPlaced(page, area, "x", "after eager hydration");
    await expectPlaced(page, area, "y", "after eager hydration");
  }

  info.annotations.push({
    type: "eager style writes",
    description: JSON.stringify(
      (await page.evaluate(() => window.scrollAreaMutations!)).filter((mutation) =>
        eager.some((area) => mutation.testid.startsWith(`${area}-`)),
      ),
    ),
  });

  if (!blocks) {
    await assertReferences(page, info);
    await stopRetentionObservation(page);

    return;
  }

  // Warm: the hover block hydrates first, so the blocks' lazily loaded areas are.
  const hover = await center(out(page, "hover-viewport"));

  await page.mouse.move(hover.x, hover.y);
  await expect(out(page, "hover-rendered")).toHaveAttribute("data-client-rendered", "true");
  await leave(page);

  // The vertical-only area, its plain control and the override, each dormant and overflowing
  // sideways with `overflow-x: hidden`: the hydrating ArrowRight scrolls none of them, nor the
  // document.
  await out(page, "axis-before").focus();

  for (const area of ["axis", "axis-plain", "override"]) {
    await page.keyboard.press("Tab");

    const { before, after, documentScrolled } = await hydratingKey(page, area, "ArrowRight", info);

    expect(before.overflowX, `${area} server overflow-x`).toBe("hidden");
    expect(before.scrollWidth, `${area} overflows sideways`).toBeGreaterThan(
      before.clientWidth + 100,
    );
    expect([before.left, before.top]).toEqual([0, dormantPosition]);
    expect(after.overflowX, `${area} overflow-x after hydration`).toBe("hidden");
    expect([after.left, after.top], `${area}: the hydrating ArrowRight scrolled nothing`).toEqual([
      0,
      dormantPosition,
    ]);
    expect(documentScrolled, `${area}: the document didn't scroll`).toBe(false);
  }

  // Styled by class: the hydrating PageDown scrolls it from its pre-hydration position, which
  // survives on the horizontal axis with the box, and never the document.
  await page.keyboard.press("Tab");

  const classed = await hydratingKey(page, "classed", "PageDown", info);

  expect(classed.before).toEqual(server["classed"]);
  expect(classed.after.left, "classed kept its horizontal position").toBe(dormantPosition);
  expect(boxOf(classed.after), "classed kept its box").toEqual(boxOf(classed.before));
  expect(
    classed.after.top - classed.before.top,
    "classed: the hydrating PageDown scrolled it",
  ).toBeGreaterThanOrEqual(classed.before.clientHeight / 2);
  expect(classed.documentScrolled, "classed: the document didn't scroll").toBe(false);

  // A static style of the consumer's on Content, then on the Viewport: recorded, and restored.
  for (const [area, styled] of [
    ["content", "content"],
    ["viewport", "viewport"],
  ] as const) {
    await page.keyboard.press("Tab");

    const { after } = await hydratingKey(page, area, "PageDown", info);

    expect(boxOf(after), `${area} ends with the server's box`).toEqual(boxOf(server[area]!));
    await expectRestored(page, area, styled);
  }

  await settle(page);

  for (const area of ["classed", "content", "viewport"]) {
    await expectPlaced(page, area, "x", "after hydration");
    await expectPlaced(page, area, "y", "after hydration");
  }

  info.annotations.push({
    type: "interaction style writes",
    description: JSON.stringify(
      (await page.evaluate(() => window.scrollAreaMutations!)).filter(
        (mutation) => !eager.some((area) => mutation.testid.startsWith(`${area}-`)),
      ),
    ),
  });
  await assertReferences(page, info);
  await stopRetentionObservation(page);
});
