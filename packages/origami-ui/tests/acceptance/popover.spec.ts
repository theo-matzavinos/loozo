import { test, expect, type ErrorRecord } from "./contract-test.js";
import type { Page, TestInfo } from "playwright/test";
import {
  fixture,
  bootstrapHeld,
  assertReferences,
  stopRetentionObservation,
  captureReferences,
} from "./observation.js";
import { geometry, expectPreferred, candidates } from "./geometry.js";

interface PresentationFrame {
  opacity: string;
  pointer: string;
  left: number;
  top: number;
  anchorLeft: number;
  anchorBottom: number;
}

interface PresentationBatch {
  changed: string[];
  phase: string | null;
  entering: boolean;
  present: boolean;
  leaving: boolean;
  left: string;
  top: string;
  native: boolean;
}

declare global {
  interface Window {
    presentationProof: {
      animations: Record<string, Animation>;
      content: Element | null;
      autofocus: Element | null;
      frames: PresentationFrame[];
      firstVisible: PresentationFrame | null;
      batches: PresentationBatch[];
    };
    acceptancePointerOrigin: {
      trusted: boolean;
      inside: boolean;
      target: string | null;
      path: (string | null)[];
      pointerId: number;
    } | null;
  }
}

/** A script close/open or part-lifecycle action is not presented as a trusted pointer gesture. */
async function scriptControl(page: Page, id: string): Promise<void> {
  await page.getByTestId(id).evaluate((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      throw new Error("Expected a public script-action control");
    }

    node.click();
  });
}

async function nativeOpen(page: Page): Promise<void> {
  await scriptControl(page, "native-open");
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await expect
    .poll(() =>
      page.getByTestId("native-content").evaluate((node) => node.matches(":popover-open")),
    )
    .toBe(true);
  await expect(page.getByTestId("native-content")).toHaveAttribute("data-phase", "open");
  await expect(page.getByTestId("native-trigger")).toHaveAttribute("aria-expanded", "true");
}

async function closed(page: Page): Promise<void> {
  await expect(page.getByTestId("native-intent")).toHaveText("false");
  await expect
    .poll(() =>
      page.getByTestId("native-content").evaluate((node) => node.matches(":popover-open")),
    )
    .toBe(false);
}

/** Observe native authored traversal; only the independent control may discover a natural host stop. */
async function authoredTabSequence(
  page: Page,
  buttons: string[],
  info: TestInfo,
  evidenceName: string,
  expectedHostStop?: boolean,
) {
  const sequence: { key: string; focused: string | null }[] = [];

  async function record(key: string): Promise<void> {
    sequence.push({
      key,
      focused: await page.evaluate(
        () => document.activeElement?.getAttribute("data-testid") ?? null,
      ),
    });
  }

  async function step(key: string, expected: string): Promise<void> {
    await page.keyboard.press(key);
    await record(key);
    await expect(page.getByTestId(expected)).toBeFocused();
  }

  try {
    await page.getByTestId("native-trigger").focus();
    await record("start");
    await expect(page.getByTestId("native-trigger")).toBeFocused();
    await page.keyboard.press("Tab");
    await record("Tab");

    const hostStop = await page
      .getByTestId("native-content")
      .evaluate((node) => node === document.activeElement);

    if (expectedHostStop !== undefined) {
      expect(hostStop, "Natural host eligibility comes from the independent native control").toBe(
        expectedHostStop,
      );
    }

    if (hostStop) {
      await step("Tab", buttons[0]);
    } else {
      await expect(page.getByTestId(buttons[0])).toBeFocused();
    }

    for (let index = 1; index < buttons.length; index += 1) {
      await step("Tab", buttons[index]);
    }

    for (let index = buttons.length - 2; index >= 0; index -= 1) {
      await step("Shift+Tab", buttons[index]);
    }

    if (hostStop) {
      await step("Shift+Tab", "native-content");
    }

    await step("Shift+Tab", "native-trigger");

    return { hostStop, sequence };
  } finally {
    await info.attach(evidenceName, {
      body: JSON.stringify({ buttons, expectedHostStop, sequence }, null, 2),
      contentType: "application/json",
    });
  }
}

/** Same authored markup, no Angular/library script, tabindex, autofocus, source option or Tab bridge. */
async function assertNativeAuthoredOrder(
  page: Page,
  info: TestInfo,
  coLocated: boolean,
): Promise<void> {
  const authored = await page.getByTestId("native-content").evaluate((node) => {
    if (!(node instanceof HTMLElement)) {
      throw new Error("Missing persistent authored Content");
    }

    const style = getComputedStyle(node);
    const buttons: string[] = [];

    for (const button of node.querySelectorAll("button")) {
      if (!button.disabled && !button.closest("[inert]") && button.getClientRects().length > 0) {
        const id = button.getAttribute("data-testid");

        if (!id) {
          throw new Error("Authored navigation button has no observation label");
        }

        buttons.push(id);
      }
    }

    const firstButton = node.querySelector("button");

    if (!firstButton) {
      throw new Error("Authored Content has no native button");
    }

    return {
      html: node.innerHTML,
      buttons,
      overflowing: node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth,
      dimensions: {
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      },
      styles: {
        width: style.width,
        height: style.height,
        boxSizing: style.boxSizing,
        padding: style.padding,
        border: style.border,
        overflow: style.overflow,
        gap: style.gap,
        direction: style.direction,
        writingMode: style.writingMode,
        font: style.font,
        transform: style.transform,
      },
      buttonFont: getComputedStyle(firstButton).font,
    };
  });

  expect(authored.buttons[0]).toBe("native-first");
  expect(authored.buttons[1]).toBe("native-inside-close");
  await expect(page.getByTestId("native-content")).not.toHaveAttribute("tabindex", /.*/);
  await expect(page.getByTestId("native-content").locator("[tabindex], [autofocus]")).toHaveCount(
    0,
  );
  await expect(page.getByTestId("native-trigger")).not.toHaveAttribute("popovertarget", /.*/);

  const control = await page.context().newPage();
  const controls = [];
  let expectedHostStop: boolean | undefined;

  try {
    for (const overflowing of [false, true]) {
      let anchor = "";

      if (!coLocated) {
        anchor = '<span data-testid="native-anchor">Separate anchor</span>';
      }

      await control.setContent(
        `<style>html{color-scheme:dark}button{margin:2px}.surface{background:#242424;color:#eee}.surface:popover-open{display:grid}</style><section><button type="button" data-testid="native-trigger">Native trigger</button>${anchor}<section popover="manual" class="surface" data-testid="native-content"></section></section>`,
      );
      await control.getByTestId("native-content").evaluate(
        (node, { authored, overflowing }) => {
          if (!(node instanceof HTMLElement)) {
            throw new Error("Missing independent native manual control");
          }

          node.innerHTML = authored.html;
          Object.assign(node.style, authored.styles);
          node.style.position = "fixed";
          node.style.top = "24px";
          node.style.left = "24px";
          node.style.margin = "0";

          for (const button of node.querySelectorAll("button")) {
            button.style.font = authored.buttonFont;
          }

          if (!overflowing) {
            node.style.width = `${Math.min(600, document.documentElement.clientWidth - 64)}px`;
            node.style.height = "auto";
          } else if (!authored.overflowing) {
            // Only the independent variant changes; the authored package host is never mutated.
            const ordinary = document.createElement("p");

            ordinary.textContent = "Native nonfocusable overflow content";
            ordinary.style.height = `${authored.dimensions.clientHeight + 240}px`;
            node.append(ordinary);
          }

          node.showPopover(); // Native control only, exactly zero arguments; never the package host.
        },
        { authored, overflowing },
      );
      await expect(control.getByTestId("native-content")).not.toHaveAttribute("tabindex", /.*/);
      await expect(control.locator("[tabindex], [autofocus], [popovertarget]")).toHaveCount(0);

      const dimensions = await control.getByTestId("native-content").evaluate((node) => ({
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      }));
      const actualOverflow =
        dimensions.scrollHeight > dimensions.clientHeight ||
        dimensions.scrollWidth > dimensions.clientWidth;

      expect(actualOverflow, "The native control must genuinely fit or overflow as labelled").toBe(
        overflowing,
      );

      let evidenceName = `V14-native-fitting-coLocated=${coLocated}`;

      if (overflowing) {
        evidenceName = `V14-native-overflowing-coLocated=${coLocated}`;
      }

      const traversal = await authoredTabSequence(control, authored.buttons, info, evidenceName);

      controls.push({ overflowing, dimensions, traversal, html: await control.content() });

      if (overflowing === authored.overflowing) {
        expectedHostStop = traversal.hostStop;
      }
    }
  } finally {
    await control.close();
    await page.bringToFront();
    await info.attach("V14-independent-native-fitting-overflowing-controls", {
      body: JSON.stringify({ coLocated, authored, controls }, null, 2),
      contentType: "application/json",
    });
  }

  if (expectedHostStop === undefined) {
    throw new Error("No matching fit/overflow native control was observed");
  }

  const actual = await authoredTabSequence(
    page,
    authored.buttons,
    info,
    `V14-package-coLocated=${coLocated}`,
    expectedHostStop,
  );

  await info.attach("V14-full-authored-native-forward-reverse", {
    body: JSON.stringify({ coLocated, actual, expectedHostStop }, null, 2),
    contentType: "application/json",
  });
}

interface NativeGestureEvent {
  type: string;
  trusted: boolean;
  target: string | null;
  path: (string | null)[];
  time: number;
  preventedAtCapture: boolean;
  preventedAtWindowBubble?: boolean;
  pointerId?: number;
  button?: number;
  buttons?: number;
  primary?: boolean;
  pointerType?: string;
  x?: number;
  y?: number;
  types?: string[];
}

/** Passive full native gesture journal; no dispatch, capture setters or library/framework hooks. */
async function nativeGestureJournal(page: Page) {
  return page.evaluateHandle(() => {
    const events: NativeGestureEvent[] = [];
    const records = new WeakMap<Event, NativeGestureEvent>();
    const pointers: PointerEvent[] = [];
    const listeners: {
      type: string;
      listener: (event: Event) => void;
      bubble: (event: Event) => void;
    }[] = [];

    for (const type of [
      "pointerdown",
      "pointerup",
      "pointercancel",
      "gotpointercapture",
      "lostpointercapture",
      "dragstart",
      "dragover",
      "drop",
      "dragend",
    ]) {
      const listener = (event: Event) => {
        const record: (typeof events)[number] = {
          type,
          trusted: event.isTrusted,
          time: event.timeStamp,
          target: null,
          path: [],
          preventedAtCapture: event.defaultPrevented,
        };

        if (event.target instanceof Element) {
          record.target = event.target.getAttribute("data-testid");
        }

        for (const node of event.composedPath()) {
          if (node instanceof Element) {
            record.path.push(node.getAttribute("data-testid") ?? node.tagName);
          } else {
            record.path.push(String(node));
          }
        }

        if (event instanceof PointerEvent) {
          pointers.push(event);
          record.pointerId = event.pointerId;
          record.button = event.button;
          record.buttons = event.buttons;
          record.primary = event.isPrimary;
          record.pointerType = event.pointerType;
          record.x = event.clientX;
          record.y = event.clientY;
        }

        if (event instanceof DragEvent && event.dataTransfer) {
          record.types = [...event.dataTransfer.types];
        }

        events.push(record);
        records.set(event, record);
      };
      const bubble = (event: Event) => {
        const record = records.get(event);

        if (record) {
          record.preventedAtWindowBubble = event.defaultPrevented;
        }
      };

      listeners.push({ type, listener, bubble });
      document.addEventListener(type, listener, { capture: true, passive: true });
      window.addEventListener(type, bubble, { passive: true });
    }

    return {
      events,
      finalPointers() {
        return pointers.map((event) => ({
          type: event.type,
          trusted: event.isTrusted,
          primary: event.isPrimary,
          pointerId: event.pointerId,
          button: event.button,
          buttons: event.buttons,
          prevented: event.defaultPrevented,
          eventPhase: event.eventPhase,
          currentTargetIsNull: event.currentTarget === null,
        }));
      },
      stop() {
        for (const { type, listener, bubble } of listeners) {
          document.removeEventListener(type, listener, true);
          window.removeEventListener(type, bubble);
        }
      },
    };
  });
}

function assertCompletedNativeDrag(events: NativeGestureEvent[]) {
  let previous = -1;

  for (const type of ["pointerdown", "dragstart", "drop", "dragend"]) {
    const index = events.findIndex((event) => event.type === type);

    expect(index, `Actual ${type} follows the preceding native drag event`).toBeGreaterThan(
      previous,
    );
    expect(events[index].trusted).toBe(true);
    previous = index;
  }

  expect(events.find((event) => event.type === "pointerdown")).toMatchObject({
    trusted: true,
    primary: true,
    button: 0,
    target: "native-drag-source",
  });
  expect(events.find((event) => event.type === "drop")?.target).toBe("native-drag-target");
  expect(events.find((event) => event.type === "drop")?.types).toContain("text/plain");
  expect(events.find((event) => event.type === "pointerdown")?.path).not.toContain(
    "native-content",
  );
}

function nativePointerShape(events: NativeGestureEvent[]) {
  const shape = [];

  for (const event of events) {
    if (
      [
        "pointerdown",
        "pointerup",
        "pointercancel",
        "gotpointercapture",
        "lostpointercapture",
      ].includes(event.type)
    ) {
      shape.push({
        type: event.type,
        trusted: event.trusted,
        primary: event.primary,
        button: event.button,
        buttons: event.buttons,
        pointerType: event.pointerType,
        target: event.target,
        preventedAtCapture: event.preventedAtCapture,
        preventedAtWindowBubble: event.preventedAtWindowBubble,
      });
    }
  }

  return shape;
}

function assertValidOutsidePair(events: NativeGestureEvent[]) {
  expect(nativePointerShape(events).map((event) => event.type)).toEqual([
    "pointerdown",
    "pointerup",
  ]);

  const down = events.find((event) => event.type === "pointerdown");
  const up = events.find((event) => event.type === "pointerup");

  for (const event of [down, up]) {
    expect(event).toMatchObject({
      trusted: true,
      primary: true,
      button: 0,
      target: "pointer-outside",
      preventedAtCapture: false,
      preventedAtWindowBubble: false,
    });
    expect(event?.path).not.toContain("native-content");
  }

  expect(up?.pointerId).toBe(down?.pointerId);
  expect(events.findIndex((event) => event.type === "pointerup")).toBeGreaterThan(
    events.findIndex((event) => event.type === "pointerdown"),
  );
}

test("V1: missing parts suppress native presentation but retain actual Options intent; remount and co-location", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);

  for (const part of ["trigger", "anchor", "content"]) {
    await nativeOpen(page);
    await scriptControl(page, `native-${part}-mount`);
    await expect(page.getByTestId("native-intent")).toHaveText("true");

    if (part === "content") {
      await expect(page.getByTestId("native-content")).toHaveCount(0);
    } else {
      await expect
        .poll(() =>
          page.getByTestId("native-content").evaluate((node) => node.matches(":popover-open")),
        )
        .toBe(false);
    }

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.acceptanceObservation.observers.filter((record) =>
              record.targets.some((target) =>
                ["native-anchor", "native-content"].includes(
                  target.getAttribute("data-testid") ?? "",
                ),
              ),
            ).length,
        ),
      )
      .toBe(0);

    await scriptControl(page, `native-${part}-mount`);
    await expect
      .poll(() =>
        page.getByTestId("native-content").evaluate((node) => node.matches(":popover-open")),
      )
      .toBe(true);
    await scriptControl(page, "native-close");
    await closed(page);
  }

  await scriptControl(page, "native-co-locate");
  await nativeOpen(page);
  await expect(page.getByTestId("native-trigger")).toHaveAttribute("id", "co-located-trigger");
  await expect(page.getByTestId("native-trigger")).toHaveAttribute(
    "aria-controls",
    "native-content-id",
  );
});

test("V2 V13: authored transformed/clipped hosts, independent coordinates, nested/document scroll and live bindings", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);

  const host = await page.getByTestId("native-content").elementHandle();
  const parent = await host?.evaluateHandle((node) => node.parentNode);

  await page.evaluate(() => {
    window.acceptanceObservation.watching = true;
  });
  await nativeOpen(page);
  await assertReferences(page, info);
  await captureReferences(page);
  await expectPreferred(page);
  await page.getByTestId("native-inside-style").click();
  await expect(page.getByTestId("native-live-text")).toHaveText("updated");
  await expect(page.getByTestId("native-content")).toHaveCSS("opacity", "0.75");
  await expect(page.getByTestId("native-content")).toHaveCSS("pointer-events", "auto");
  expect(
    await host?.evaluate(
      (node) => node === document.querySelector('[data-testid="native-content"]'),
    ),
  ).toBe(true);
  expect(
    await parent?.evaluate(
      (node) => node === document.querySelector('[data-testid="native-content"]')?.parentNode,
    ),
  ).toBe(true);

  const original = await geometry(page);

  for (const id of ["native-scroll-one", "native-scroll-two"]) {
    await page.getByTestId(id).evaluate((node) => {
      node.scrollTop += 20;
      node.scrollLeft += 10;
    });
    await expectPreferred(page);
  }

  const scrolled = await geometry(page);

  expect(Math.abs(scrolled.anchor.top - original.anchor.top)).toBeGreaterThan(10);
  expect(scrolled.zIndex).toBe("42");
  expect(scrolled.transform).toBe("matrix(1, 0, 0, 1, 0, 0)");

  const clipping = await page.getByTestId("native-scroll-one").boundingBox();

  expect(clipping).not.toBeNull();
  expect(scrolled.content.bottom).toBeGreaterThan((clipping?.y ?? 0) + (clipping?.height ?? 0));

  const paintsOutside = await page.evaluate(() => {
    const content = document.querySelector('[data-testid="native-content"]');
    const clip = document.querySelector('[data-testid="native-scroll-one"]');

    if (!(content instanceof HTMLElement) || !clip) {
      return false;
    }

    const a = content.getBoundingClientRect();
    const b = clip.getBoundingClientRect();
    const target = document.elementFromPoint(
      a.left + a.width / 2,
      Math.min(a.bottom - 2, b.bottom + 4),
    );

    return Boolean(target && content.contains(target));
  });

  expect(paintsOutside).toBe(true);
  await page.getByTestId("native-inside-size").click();
  await expectPreferred(page);
  await page.setViewportSize({ width: 1300, height: 1100 });
  await expectPreferred(page);
  await page.evaluate(() => window.scrollBy(0, 40));
  await expectPreferred(page);
  await assertReferences(page, info);
  await stopRetentionObservation(page);
});

for (const writingMode of ["horizontal-tb", "vertical-rl", "vertical-lr"]) {
  for (const direction of ["ltr", "rtl"]) {
    test(`V3: logical axes from ${writingMode}/${direction}, independently of Content direction`, async ({
      page,
    }, info) => {
      await fixture(page, "popover", info);
      await page.getByTestId("native-motion").selectOption("none");
      await page.getByTestId("writing-mode").selectOption(writingMode);
      await page.getByTestId("anchor-direction").selectOption(direction);

      let contentDirection = "rtl";

      if (direction === "rtl") {
        contentDirection = "ltr";
      }

      await page.getByTestId("content-direction").selectOption(contentDirection);

      for (const side of ["block-start", "block-end", "inline-start", "inline-end"] as const) {
        for (const align of ["start", "center", "end"] as const) {
          await page.getByTestId("native-side").selectOption(side);
          await page.getByTestId("native-align").selectOption(align);
          await nativeOpen(page);
          await expectPreferred(page, side, align, 8);
          await scriptControl(page, "native-close");
          await closed(page);
        }
      }
    });
  }
}

/** The separate Anchor's own direction and box; an unchanged box rules out observer-driven repositioning. */
async function anchorAxesBox(page: Page) {
  return page.getByTestId("native-anchor").evaluate((node) => {
    const rect = node.getBoundingClientRect();

    return {
      direction: getComputedStyle(node).direction,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  });
}

async function contentLeft(page: Page): Promise<number> {
  return page.getByTestId("native-content").evaluate((node) => node.getBoundingClientRect().left);
}

test("V3: an open Popover follows a live Anchor direction change with no Options change and an unmoved Anchor box", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await page.getByTestId("native-motion").selectOption("none");
  await nativeOpen(page);
  await expectPreferred(page, "block-end", "start", 8);

  const before = await anchorAxesBox(page);
  const left = await contentLeft(page);

  expect(before.direction).toBe("ltr");
  await scriptControl(page, "native-anchor-rtl");
  await expect.poll(() => anchorAxesBox(page)).toEqual({ ...before, direction: "rtl" });
  await expectPreferred(page, "block-end", "start", 8);
  expect(Math.abs((await contentLeft(page)) - left)).toBeGreaterThan(2);
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await expect(page.getByTestId("native-content")).toHaveAttribute("data-phase", "open");
});

test("V3 V10: Anchor axes changed by another owner's native show callback during WRITE position with the current axes", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await page.getByTestId("native-motion").selectOption("none");
  await nativeOpen(page);
  await expectPreferred(page, "block-end", "start", 8);

  const before = await anchorAxesBox(page);
  const left = await contentLeft(page);

  expect(before.direction).toBe("ltr");
  await scriptControl(page, "native-other-flip-anchor");
  await scriptControl(page, "native-other-open");
  await expect(page.getByTestId("native-other-intent")).toHaveText("true");
  await expect
    .poll(() =>
      page.getByTestId("native-other-content").evaluate((node) => node.matches(":popover-open")),
    )
    .toBe(true);
  // The callback wrote the Anchor directly: no signal, Options or layout change follows it.
  await expect.poll(() => anchorAxesBox(page)).toEqual({ ...before, direction: "rtl" });
  await expectPreferred(page, "block-end", "start", 8);
  expect(Math.abs((await contentLeft(page)) - left)).toBeGreaterThan(2);
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await expect
    .poll(() =>
      page.getByTestId("native-content").evaluate((node) => node.matches(":popover-open")),
    )
    .toBe(true);
});

for (const layout of ["bottom", "right", "corner", "oversized"]) {
  test(`V4: independent explicit flip candidates for ${layout}, no universal full-fit assertion`, async ({
    page,
  }, info) => {
    await fixture(page, "popover", info);
    await page.getByTestId("native-motion").selectOption("none");
    await page.getByTestId("native-layout").selectOption(layout);
    await nativeOpen(page);
    await expect
      .poll(async () => {
        const result = await geometry(page);
        let selected = result.expected.find(
          (candidate) => candidate.mainOverflow <= 0 && candidate.crossOverflow <= 0,
        );

        if (!selected) {
          const mainFits = result.expected.filter((candidate) => candidate.mainOverflow <= 0);

          if (mainFits.length > 0) {
            mainFits.sort((a, b) => a.primaryCrossOverflow - b.primaryCrossOverflow);
            selected = mainFits[0];
          } else {
            const leastOverflow = [...result.expected];

            leastOverflow.sort((a, b) => a.score - b.score);
            selected = leastOverflow[0];
          }
        }

        return Math.max(
          Math.abs(result.content.left - selected.x),
          Math.abs(result.content.top - selected.y),
        );
      })
      .toBeLessThanOrEqual(2);

    const result = await geometry(page);

    await info.attach("independent-fallback-dom-edges", {
      body: JSON.stringify(result, null, 2),
      contentType: "application/json",
    });

    if (layout === "bottom") {
      expect(
        result.expected.findIndex(
          (candidate) => candidate.mainOverflow <= 0 && candidate.crossOverflow <= 0,
        ),
      ).toBe(1);
    }

    if (layout === "right") {
      expect(
        result.expected.findIndex(
          (candidate) => candidate.mainOverflow <= 0 && candidate.crossOverflow <= 0,
        ),
      ).toBe(2);
    }

    if (layout === "corner") {
      expect(
        result.expected.findIndex(
          (candidate) => candidate.mainOverflow <= 0 && candidate.crossOverflow <= 0,
        ),
      ).toBe(3);
    }

    if (layout === "oversized") {
      expect(
        result.expected.every(
          (candidate) => candidate.mainOverflow > 0 || candidate.crossOverflow > 0,
        ),
      ).toBe(true);
      expect(result.content.width).toBeGreaterThan(result.viewport.width);
    }
  });
}

test("V5 V7: topmost branch veto consumes Escape and protected descendant prevents partial writes", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await nativeOpen(page);
  await page.getByTestId("native-child-trigger").click();
  await expect
    .poll(() =>
      page.getByTestId("native-child-content").evaluate((node) => node.matches(":popover-open")),
    )
    .toBe(true);
  await page.getByTestId("native-child-protect").click();

  const journal = await page.getByTestId("native-journal").textContent();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("native-child-intent")).toHaveText("true");
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await expect(page.getByTestId("native-journal")).toHaveText(journal ?? "");
  // The root's own trigger bypasses only its own flag, never its protected descendant.
  await page.getByTestId("native-trigger").click();
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await expect(page.getByTestId("native-child-intent")).toHaveText("true");
  await page.getByTestId("native-child-protect").click();
  await page.getByTestId("native-trigger").click();
  await expect(page.getByTestId("native-intent")).toHaveText("false");
  await expect(page.getByTestId("native-journal")).toContainText("child:false|parent:false");
});

test("V5: unrelated roots coexist, latest successful promotion owns Escape, consumed/composing handler variants", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await nativeOpen(page);
  await scriptControl(page, "native-other-open");
  await expect(page.getByTestId("native-other-intent")).toHaveText("true");
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("native-other-intent")).toHaveText("false");
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  // Untrusted synthetic keys establish the handler's consumed/composing filter only.
  // Genuine topmost targeting above uses Playwright keyboard input.
  await page.evaluate(() => {
    const composing = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      isComposing: true,
    });

    document.dispatchEvent(composing);

    const consumed = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });

    consumed.preventDefault();
    document.dispatchEvent(consumed);
  });
  await expect(page.getByTestId("native-intent")).toHaveText("true");
});

test("V6: trusted primary outside down/up, inside-to-outside drag, right button and prevented down", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await nativeOpen(page);

  const inside = await page.getByTestId("native-first").evaluate((node) => {
    const content = node.closest('[data-testid="native-content"]');

    if (!(node instanceof HTMLElement) || !(content instanceof HTMLElement)) {
      throw new Error("Missing genuine Content/button hosts");
    }

    const button = node.getBoundingClientRect();
    const parent = content.getBoundingClientRect();
    const left = Math.max(button.left, parent.left, 0);
    const right = Math.min(button.right, parent.right, innerWidth);
    const top = Math.max(button.top, parent.top, 0);
    const bottom = Math.min(button.bottom, parent.bottom, innerHeight);

    // RTL overflow may place the button's bounding-box corner outside its visible parent clip.
    for (const xf of [0.5, 0.25, 0.75]) {
      for (const yf of [0.5, 0.25, 0.75]) {
        const x = left + (right - left) * xf;
        const y = top + (bottom - top) * yf;
        const target = document.elementFromPoint(x, y);

        if (target && node.contains(target) && content.contains(target)) {
          return {
            x,
            y,
            hit: target.getAttribute("data-testid"),
            contentRect: { x: parent.x, y: parent.y, width: parent.width, height: parent.height },
            inert: content.inert,
            opacity: getComputedStyle(content).opacity,
          };
        }
      }
    }

    throw new Error("No actual native-hit-contained visible Content button point");
  });
  const outside = await page.getByTestId("pointer-outside").boundingBox();

  if (!outside) {
    throw new Error("Outside target is not rendered");
  }

  await page.evaluate(() => {
    window.acceptancePointerOrigin = null;
    document.addEventListener(
      "pointerdown",
      (event) => {
        const content = document.querySelector('[data-testid="native-content"]');
        let target: string | null = null;

        if (event.target instanceof Element) {
          target = event.target.getAttribute("data-testid");
        }

        window.acceptancePointerOrigin = {
          trusted: event.isTrusted,
          inside: content !== null && event.composedPath().includes(content),
          target,
          pointerId: event.pointerId,
          path: event.composedPath().map((node) => {
            if (node instanceof Element) {
              return node.getAttribute("data-testid");
            }

            return null;
          }),
        };
      },
      { capture: true, passive: true, once: true },
    );
  });
  await page.mouse.move(inside.x, inside.y);
  await page.mouse.down();

  const origin = await page.evaluate(() => window.acceptancePointerOrigin);

  await info.attach("trusted-inside-pointer-origin", {
    body: JSON.stringify({ inside, origin }, null, 2),
    contentType: "application/json",
  });
  expect(origin).toMatchObject({ trusted: true, inside: true, target: "native-first" });
  expect(origin?.path).toContain("native-content");
  await page.mouse.move(outside.x + 4, outside.y + 4);
  await page.mouse.up();
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await page.getByTestId("pointer-outside").click({ button: "right" });
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  // Change only fixture policy, without generating an outside pointer gesture.
  await page.getByTestId("pointer-policy").selectOption("prevent");
  await page.getByTestId("pointer-outside").click();
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await page.getByTestId("pointer-policy").selectOption("normal");

  const beforeLateUp = await page.evaluate(() => {
    const values: Record<string, string | null> = {};

    for (const id of [
      "native-intent",
      "native-closings",
      "native-journal",
      "native-setter-observations",
      "native-unused-outputs",
    ]) {
      values[id] = document.querySelector(`[data-testid="${id}"]`)?.textContent ?? null;
    }

    return values;
  });
  const lateConsumer = await page.evaluateHandle(() => {
    const listener = (event: PointerEvent) => {
      const outside = document.querySelector('[data-testid="pointer-outside"]');

      if (
        event.isTrusted &&
        event.isPrimary &&
        event.button === 0 &&
        outside &&
        event.composedPath().includes(outside)
      ) {
        event.preventDefault();
      }
    };

    // Real consumer registered after Scene's document listener, not a synthetic event or model write.
    window.addEventListener("pointerup", listener, { passive: false });

    return { stop: () => window.removeEventListener("pointerup", listener) };
  });
  const lateJournal = await nativeGestureJournal(page);

  try {
    await page.getByTestId("pointer-outside").click();

    const events = await lateJournal.evaluate((observation) => observation.events);
    const finalPointers = await lateJournal.evaluate((observation) => observation.finalPointers());

    expect(nativePointerShape(events).map((event) => event.type)).toEqual([
      "pointerdown",
      "pointerup",
    ]);
    expect(events[0]).toMatchObject({
      type: "pointerdown",
      trusted: true,
      primary: true,
      button: 0,
      target: "pointer-outside",
      preventedAtWindowBubble: false,
    });
    expect(events[1]).toMatchObject({
      type: "pointerup",
      trusted: true,
      primary: true,
      button: 0,
      target: "pointer-outside",
      preventedAtWindowBubble: true,
    });
    expect(finalPointers[1]).toMatchObject({
      type: "pointerup",
      trusted: true,
      prevented: true,
      eventPhase: 0,
      currentTargetIsNull: true,
      pointerId: finalPointers[0]?.pointerId,
    });
    await expect(page.getByTestId("native-intent")).toHaveText("true");

    for (const [id, value] of Object.entries(beforeLateUp)) {
      await expect(page.getByTestId(id)).toHaveText(value ?? "");
    }

    await expect
      .poll(() =>
        page.getByTestId("native-content").evaluate((node) => node.matches(":popover-open")),
      )
      .toBe(true);
  } finally {
    await info.attach("V6-real-late-window-prevented-up", {
      body: JSON.stringify(
        {
          before: beforeLateUp,
          events: await lateJournal.evaluate((observation) => observation.events),
          finalPointers: await lateJournal.evaluate((observation) => observation.finalPointers()),
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    await lateJournal.evaluate((observation) => observation.stop());
    await lateJournal.dispose();
    await lateConsumer.evaluate((consumer) => consumer.stop());
    await lateConsumer.dispose();
  }

  await page.getByTestId("pointer-outside").click();
  await expect(page.getByTestId("native-intent")).toHaveText("false");
  await expect(page.getByTestId("pointer-outside")).toBeFocused();

  const trusted = await page.evaluate(() => window.acceptanceObservation.trust);

  expect(
    trusted
      .filter((event) => event.type === "pointerdown" || event.type === "pointerup")
      .every((event) => event.trusted),
  ).toBe(true);
});

test("V6: genuine completed HTML drag preserves intent; only a subsequent valid outside gesture dismisses", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);

  const markup = await page.locator(".gesture-controls").innerHTML();
  const outsideHTML = await page.getByTestId("pointer-outside").evaluate((node) => node.outerHTML);
  const control = await page.context().newPage();
  let nativeEvents: NativeGestureEvent[] = [];
  let nativeDrag: NativeGestureEvent[] = [];
  let nativeFirst: NativeGestureEvent[] = [];
  let nativeSecond: NativeGestureEvent[] = [];

  try {
    await control.setContent(
      `<style>html{color-scheme:dark}.gesture-controls{display:flex;flex-direction:column;width:220px;gap:40px}button{margin:2px}</style><div class="gesture-controls">${markup}</div>${outsideHTML}`,
    );
    await control.getByTestId("native-drag-source").evaluate((node) => {
      node.addEventListener("dragstart", (event) => {
        if (event instanceof DragEvent && event.dataTransfer) {
          event.dataTransfer.setData("text/plain", "origami-native-gesture");
        }
      });
    });
    await control.getByTestId("native-drag-target").evaluate((node) => {
      node.addEventListener("dragover", (event) => event.preventDefault());
      node.addEventListener("drop", (event) => event.preventDefault());
    });

    const journal = await nativeGestureJournal(control);

    try {
      await control
        .getByTestId("native-drag-source")
        .dragTo(control.getByTestId("native-drag-target"));
      nativeDrag = await journal.evaluate((observation) => observation.events);
      await control.getByTestId("pointer-outside").click();

      const throughFirst = await journal.evaluate((observation) => observation.events);

      nativeFirst = throughFirst.slice(nativeDrag.length);
      await control.getByTestId("pointer-outside").click();
      nativeSecond = await journal.evaluate(
        (observation, offset) => observation.events.slice(offset),
        throughFirst.length,
      );
    } finally {
      nativeEvents = await journal.evaluate((observation) => observation.events);
      await journal.evaluate((observation) => observation.stop());
      await journal.dispose();
      await info.attach("V6-independent-same-HTML-native-drag", {
        body: JSON.stringify(
          {
            events: nativeEvents,
            drag: nativeDrag,
            first: nativeFirst,
            second: nativeSecond,
            html: await control.content(),
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
    }
  } finally {
    await control.close();
    await page.bringToFront();
  }

  assertCompletedNativeDrag(nativeDrag);
  assertValidOutsidePair(nativeSecond);

  const firstHasDown = nativeFirst.some((event) => event.type === "pointerdown");

  if (firstHasDown) {
    assertValidOutsidePair(nativeFirst);
  } else {
    expect(nativePointerShape(nativeFirst).map((event) => event.type)).toEqual(["pointerup"]);
    expect(nativeFirst[0]).toMatchObject({
      trusted: true,
      primary: true,
      button: 0,
      target: "pointer-outside",
      preventedAtCapture: false,
      preventedAtWindowBubble: false,
      pointerId: nativeDrag.find((event) => event.type === "pointerdown")?.pointerId,
    });
    info.annotations.push({
      type: "native-control-incomplete-post-drag-up",
      description:
        "Actual same-HTML control emits only up on its first post-drag click, then a real fresh down/up on its second. Driver/engine origin unknown; no complete-gesture or cancel waiver. Package must preserve on partial first input and close only on the distinct next valid pair.",
    });
  }

  const nativeCanceled = nativeDrag.some(
    (event) => event.type === "pointercancel" && event.trusted,
  );

  if (info.project.use.browserName === "chromium" || info.project.use.browserName === "firefox") {
    expect(nativeCanceled, "Retain genuine Chromium/Firefox pointercancel calibration").toBe(true);
  }

  if (nativeCanceled) {
    const down = nativeDrag.find((event) => event.type === "pointerdown");
    const cancel = nativeDrag.find((event) => event.type === "pointercancel" && event.trusted);

    expect(cancel?.pointerId).toBe(down?.pointerId);
  }

  await nativeOpen(page);

  const journal = await nativeGestureJournal(page);

  try {
    await page.getByTestId("native-drag-source").dragTo(page.getByTestId("native-drag-target"));
    await expect(page.getByTestId("native-intent")).toHaveText("true");

    const events = await journal.evaluate((observation) => observation.events);

    await info.attach("V6-complete-trusted-drag-journal", {
      body: JSON.stringify({ nativeCanceled, events }, null, 2),
      contentType: "application/json",
    });
    assertCompletedNativeDrag(events);
    expect(events.some((event) => event.type === "pointercancel" && event.trusted)).toBe(
      nativeCanceled,
    );

    if (nativeCanceled) {
      const down = events.find((event) => event.type === "pointerdown");
      const cancel = events.find((event) => event.type === "pointercancel" && event.trusted);

      expect(cancel?.pointerId).toBe(down?.pointerId);
    } else {
      expect(info.project.use.browserName).toBe("webkit");
      expect(nativeDrag.some((event) => event.type === "pointercancel")).toBe(false);
      expect(events.some((event) => event.type === "pointercancel")).toBe(false);
      expect(nativeDrag.some((event) => event.type === "pointerup")).toBe(false);
      expect(events.some((event) => event.type === "pointerup")).toBe(false);
      info.annotations.push({
        type: "platform-cancel-unobserved",
        description:
          "Same-HTML native control and package complete trusted drag/drop without pointercancel or pointerup. This is not a complete valid outside gesture, cancel-handler proof, skip or platform certification.",
      });
    }

    expect(nativePointerShape(events)).toEqual(nativePointerShape(nativeDrag));
    await page.getByTestId("pointer-outside").click();

    const throughFirst = await journal.evaluate((observation) => observation.events);
    const first = throughFirst.slice(events.length);

    await info.attach("V6-first-post-drag-control-matched-input", {
      body: JSON.stringify({ nativeFirst, first, firstHasDown }, null, 2),
      contentType: "application/json",
    });
    expect(nativePointerShape(first)).toEqual(nativePointerShape(nativeFirst));

    if (firstHasDown) {
      assertValidOutsidePair(first);
      await expect(page.getByTestId("native-intent")).toHaveText("false");
      // A legitimately completed first dismissal needs a fresh activation for independent second proof.
      await nativeOpen(page);
    } else {
      expect(first[0]?.pointerId).toBe(
        events.find((event) => event.type === "pointerdown")?.pointerId,
      );
      await expect(page.getByTestId("native-intent")).toHaveText("true");
      await expect
        .poll(() =>
          page.getByTestId("native-content").evaluate((node) => node.matches(":popover-open")),
        )
        .toBe(true);
      // Hard failure above prevents a reopen from masking an incorrect partial-input dismissal.
    }

    const beforeSecond = {
      intent: await page.getByTestId("native-intent").textContent(),
      native: await page
        .getByTestId("native-content")
        .evaluate((node) => node.matches(":popover-open")),
    };

    expect(beforeSecond).toEqual({ intent: "true", native: true });

    const secondStart = await journal.evaluate((observation) => observation.events.length);

    await page.getByTestId("pointer-outside").click();

    const second = await journal.evaluate(
      (observation, offset) => observation.events.slice(offset),
      secondStart,
    );

    await info.attach("V6-next-valid-outside-gesture", {
      body: JSON.stringify({ beforeSecond, nativeSecond, second }, null, 2),
      contentType: "application/json",
    });
    assertValidOutsidePair(second);
    expect(nativePointerShape(second)).toEqual(nativePointerShape(nativeSecond));
    await expect(page.getByTestId("native-intent")).toHaveText("false");
  } finally {
    await info.attach("V6-full-native-event-journal", {
      body: JSON.stringify(await journal.evaluate((observation) => observation.events), null, 2),
      contentType: "application/json",
    });
    await journal.evaluate((observation) => observation.stop());
    await journal.dispose();
  }
});

test("V6: actual pointer-capture loss invalidates a trusted gesture; mismatched/cancel handler checks distinct", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await nativeOpen(page);
  await page.getByTestId("pointer-policy").selectOption("capture");

  const outside = await page.getByTestId("pointer-outside").boundingBox();

  if (!outside) {
    throw new Error("Outside capture target is missing");
  }

  await page.mouse.move(outside.x + 4, outside.y + 4);
  await page.mouse.down();
  await page.mouse.move(outside.x + 6, outside.y + 6);

  const pointer = await page.evaluate(() => {
    const events = window.acceptanceObservation.trust;

    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index].type === "pointerdown") {
        return events[index].pointerId;
      }
    }

    return undefined;
  });

  expect(pointer).toBeDefined();
  await page.getByTestId("pointer-outside").evaluate((node, pointerId) => {
    if (!(node instanceof HTMLElement) || pointerId === undefined) {
      throw new Error("Missing pointer capture target/id");
    }

    node.releasePointerCapture(pointerId);
  }, pointer);
  await page.mouse.move(outside.x + 8, outside.y + 8);
  await page.mouse.up();

  const captureLoss = await page.evaluate(() =>
    window.acceptanceObservation.trust.filter((event) => event.type === "lostpointercapture"),
  );

  expect(captureLoss.some((event) => event.trusted)).toBe(true);
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  // Browser-driver APIs do not supply cross-engine trusted pointercancel/wrong-pointer injection.
  // These dispatches test handler rejection, not a trusted-gesture certification.
  await page.evaluate(() => {
    document.dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 10, button: 0, bubbles: true }),
    );
    document.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 10, bubbles: true }));
    document.dispatchEvent(
      new PointerEvent("pointerup", { pointerId: 11, button: 0, bubbles: true }),
    );
  });
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  info.annotations.push({
    type: "coverage-limit",
    description:
      "Trusted mismatched-pointer/device gestures remain unproven; synthetic rejection is not trusted evidence. Genuine lost capture remains required in every engine; drag-generated pointercancel is independently asserted when the actual native control emits it (required in Chromium/Firefox).",
  });
});

/** Two task turns and a frame: later than the package's post-dispatch outside task. */
async function afterPointerTasks(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          setTimeout(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          }, 0);
        }, 0);
      }),
  );
}

/** Genuine mouse gesture on the outside target, which acquires capture through the consumer policy. */
async function capturedOutsideGesture(
  page: Page,
  { beforeUp = async () => {} }: { beforeUp?: (pointerId: number) => Promise<void> } = {},
) {
  const outside = await page.getByTestId("pointer-outside").boundingBox();

  if (!outside) {
    throw new Error("Outside capture target is missing");
  }

  const journal = await nativeGestureJournal(page);

  try {
    await page.mouse.move(outside.x + 4, outside.y + 4);
    await page.mouse.down();
    // A move processes the pending capture before the matching up.
    await page.mouse.move(outside.x + 6, outside.y + 6);

    const pointerId = await journal.evaluate((observation) => {
      for (const event of observation.events) {
        if (event.type === "pointerdown") {
          return event.pointerId;
        }
      }

      return undefined;
    });

    if (pointerId === undefined) {
      throw new Error("No trusted pointerdown was observed");
    }

    await beforeUp(pointerId);
    await page.mouse.move(outside.x + 8, outside.y + 8);
    await page.mouse.up();
    await afterPointerTasks(page);

    const events = await journal.evaluate((observation) => observation.events);
    const sequence = [];

    for (const event of events) {
      if (
        [
          "pointerdown",
          "pointerup",
          "pointercancel",
          "gotpointercapture",
          "lostpointercapture",
        ].includes(event.type)
      ) {
        expect(event, `${event.type} is a trusted event of the same pointer`).toMatchObject({
          trusted: true,
          pointerId,
        });
        expect(event.path).not.toContain("native-content");
        sequence.push(event.type);
      }
    }

    return { events, sequence };
  } finally {
    await journal.evaluate((observation) => observation.stop());
    await journal.dispose();
  }
}

test("V6: outside completion at the matching pointerup; capture loss before it invalidates, capture loss after it does not veto, late up prevention does", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await nativeOpen(page);
  await page.getByTestId("pointer-policy").selectOption("capture");

  const journalBefore = await page.getByTestId("native-journal").textContent();
  const evidence: Record<string, unknown> = {};

  // Consumer releases the capture it acquired while the button is still down.
  const lostBeforeUp = await capturedOutsideGesture(page, {
    beforeUp: async (pointerId) => {
      await page.getByTestId("pointer-outside").evaluate((node, id) => {
        if (!(node instanceof HTMLElement) || !node.hasPointerCapture(id)) {
          throw new Error("The consumer target must hold the actual pointer capture");
        }

        node.releasePointerCapture(id);
      }, pointerId);
    },
  });

  evidence.lostBeforeUp = lostBeforeUp;
  expect(lostBeforeUp.sequence).toEqual([
    "pointerdown",
    "gotpointercapture",
    "lostpointercapture",
    "pointerup",
  ]);
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await expect(page.getByTestId("native-journal")).toHaveText(journalBefore ?? "");

  // A real later window listener prevents the up; the normal capture release still follows it.
  const preventer = await page.evaluateHandle(() => {
    const listener = (event: PointerEvent) => {
      event.preventDefault();
    };

    window.addEventListener("pointerup", listener, { passive: false });

    return { stop: () => window.removeEventListener("pointerup", listener) };
  });
  let preventedUp: Awaited<ReturnType<typeof capturedOutsideGesture>>;

  try {
    preventedUp = await capturedOutsideGesture(page);
  } finally {
    await preventer.evaluate((consumer) => consumer.stop());
    await preventer.dispose();
  }

  evidence.preventedUp = preventedUp;
  expect(preventedUp.sequence).toEqual([
    "pointerdown",
    "gotpointercapture",
    "pointerup",
    "lostpointercapture",
  ]);
  expect(preventedUp.events.find((event) => event.type === "pointerup")).toMatchObject({
    preventedAtCapture: false,
    preventedAtWindowBubble: true,
  });
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await expect(page.getByTestId("native-journal")).toHaveText(journalBefore ?? "");

  // A later window listener explicitly releases the capture during the up dispatch.
  const releaser = await page.evaluateHandle(() => {
    const order: string[] = [];
    const listener = (event: PointerEvent) => {
      const target = document.querySelector('[data-testid="pointer-outside"]');

      if (target instanceof HTMLElement && target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
        order.push("released-in-up");
      }
    };
    const lost = () => {
      order.push("lostpointercapture");
    };

    window.addEventListener("pointerup", listener);
    window.addEventListener("lostpointercapture", lost);

    return {
      order,
      stop: () => {
        window.removeEventListener("pointerup", listener);
        window.removeEventListener("lostpointercapture", lost);
      },
    };
  });
  let releasedInUp: Awaited<ReturnType<typeof capturedOutsideGesture>>;
  let releaseOrder: string[];

  try {
    releasedInUp = await capturedOutsideGesture(page);
    releaseOrder = await releaser.evaluate((consumer) => consumer.order);
  } finally {
    await releaser.evaluate((consumer) => consumer.stop());
    await releaser.dispose();
  }

  evidence.releasedInUp = { ...releasedInUp, releaseOrder };
  expect(releasedInUp.sequence).toEqual([
    "pointerdown",
    "gotpointercapture",
    "pointerup",
    "lostpointercapture",
  ]);
  expect(releaseOrder).toEqual(["released-in-up", "lostpointercapture"]);
  await expect(page.getByTestId("native-intent")).toHaveText("false");
  await expect(page.getByTestId("native-journal")).toHaveText(`${journalBefore}|parent:false`);
  await closed(page);

  // Ordinary captured gesture: the browser's implicit release follows the completed up.
  await nativeOpen(page);

  const journalReopened = await page.getByTestId("native-journal").textContent();
  const implicitRelease = await capturedOutsideGesture(page);

  evidence.implicitRelease = implicitRelease;
  await info.attach("V6-pointerup-completion-native-capture", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
  expect(implicitRelease.sequence).toEqual([
    "pointerdown",
    "gotpointercapture",
    "pointerup",
    "lostpointercapture",
  ]);
  await expect(page.getByTestId("native-intent")).toHaveText("false");
  await expect(page.getByTestId("native-journal")).toHaveText(`${journalReopened}|parent:false`);
  await closed(page);
});

test("V8: synchronous effective Options setter reopening survives remaining branch dismissal", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await nativeOpen(page);
  await page.getByTestId("native-child-trigger").click();
  await expect(page.getByTestId("native-child-intent")).toHaveText("true");
  await page.getByTestId("native-child-reenter").click();
  // One trusted activation, not an outside-pointer dismissal followed by a separate Trigger click.
  await page.getByTestId("native-trigger").focus();
  await page.keyboard.press("Enter");
  // A newer descendant decision must not be overwritten by the old ancestor transaction.
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await expect(page.getByTestId("native-child-intent")).toHaveText("true");
  // Arm the public consumer flag without misclaiming a pointer through the still-open child top layer.
  await scriptControl(page, "native-inside-reentry");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await expect(page.getByTestId("native-setter-observations")).toContainText("parent:true");
});

test("V7 V8: a closing descendant's effective Options setter that protects its ancestor ends the remaining outside dismissal", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await nativeOpen(page);
  await page.getByTestId("native-child-trigger").click();
  await expect(page.getByTestId("native-child-intent")).toHaveText("true");
  await expect
    .poll(() =>
      page.getByTestId("native-child-content").evaluate((node) => node.matches(":popover-open")),
    )
    .toBe(true);
  await scriptControl(page, "native-child-protect-parent-on-close");

  const journal = await page.getByTestId("native-journal").textContent();

  // One trusted outside gesture dismisses the whole parent branch, descendant first. Closing
  // the child synchronously protects the parent: the old snapshot must not close it anyway.
  await page.getByTestId("pointer-outside").click();
  await expect(page.getByTestId("native-child-intent")).toHaveText("false");
  await expect(page.getByTestId("native-journal")).toHaveText(`${journal}|child:false`);
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await expect(page.getByTestId("native-unused-outputs")).toHaveText("0");
  await expect
    .poll(() =>
      page.getByTestId("native-content").evaluate((node) => node.matches(":popover-open")),
    )
    .toBe(true);
  await expect(page.getByTestId("native-content")).toHaveAttribute("data-phase", "open");
});

test("V9: Escape restores once; outside-pointer/script-outside preserve focus; nested script suppression retains intent", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await nativeOpen(page);
  await page.getByTestId("native-first").focus();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("native-trigger")).toBeFocused();
  await closed(page);
  await nativeOpen(page);
  await page.getByTestId("native-outside").click();
  await closed(page);
  await expect(page.getByTestId("native-outside")).toBeFocused();
  await nativeOpen(page);
  await page.getByTestId("native-outside").focus();
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await scriptControl(page, "native-close");
  await closed(page);
  await expect(page.getByTestId("native-outside")).toBeFocused();
  await nativeOpen(page);

  const liveChild = await page.getByTestId("native-child-owner").elementHandle();

  await page.getByTestId("native-child-trigger").click();
  await page.getByTestId("native-child-action").focus();
  await page.getByTestId("native-child-suppress-parent").click();
  await expect(page.getByTestId("native-trigger")).toBeFocused();
  await closed(page);
  await expect(page.getByTestId("native-child-intent")).toHaveText("true");
  expect(
    await liveChild?.evaluate(
      (node) =>
        node.isConnected && node === document.querySelector('[data-testid="native-child-owner"]'),
    ),
  ).toBe(true);
  await nativeOpen(page);
  await expect(page.getByTestId("native-child-intent")).toHaveText("true");
  expect(
    await liveChild?.evaluate(
      (node) => node === document.querySelector('[data-testid="native-child-owner"]'),
    ),
  ).toBe(true);
});

test("V9 R2: authored Content destruction ends child ownership; remount creates a new default-closed child", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await expect(page.getByTestId("native-child-owner")).toHaveCount(1);
  await expect(page.getByTestId("native-child-intent")).toHaveText("false");
  await expect(page.getByTestId("native-child-action")).toHaveCount(0);
  await nativeOpen(page);
  await page.getByTestId("native-child-trigger").click();
  await expect(page.getByTestId("native-child-intent")).toHaveText("true");

  const oldChild = await page.getByTestId("native-child-owner").elementHandle();

  await scriptControl(page, "native-content-mount");
  await expect(page.getByTestId("native-child-owner")).toHaveCount(0);
  expect(await oldChild?.evaluate((node) => node.isConnected)).toBe(false);
  await scriptControl(page, "native-content-mount");
  await expect(page.getByTestId("native-child-owner")).toHaveCount(1);
  await expect(page.getByTestId("native-child-intent")).toHaveText("false");
  await expect(page.getByTestId("native-child-action")).toHaveCount(0);
  expect(
    await oldChild?.evaluate(
      (node) => node === document.querySelector('[data-testid="native-child-owner"]'),
    ),
  ).toBe(false);
});

for (const eligibility of ["disabled", "trigger-inert", "trigger-mount"]) {
  test(`V9: no restoration to ${eligibility} trigger`, async ({ page }, info) => {
    await fixture(page, "popover", info);
    await nativeOpen(page);
    await scriptControl(page, `native-${eligibility}`);

    if (eligibility !== "trigger-mount") {
      await page.getByTestId("native-first").focus();
    }

    await scriptControl(page, "native-close");
    await closed(page);

    const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));

    expect(focused).not.toBe("native-trigger");
  });
}

for (const action of ["close-focus", "reopen-focus", "destroy-focus", "close-before-reveal"]) {
  test(`V10 V12: ${action} writes actual effective Options during native callback; no stale reveal`, async ({
    page,
  }, info) => {
    await fixture(page, "popover", info);
    await page.getByTestId("native-action").selectOption(action);
    await scriptControl(page, "native-open");

    if (action === "destroy-focus") {
      await expect(page.getByTestId("native-content")).toHaveCount(0);
    } else if (action === "reopen-focus") {
      await expect(page.getByTestId("native-intent")).toHaveText("true");
      await expect(page.getByTestId("native-content")).toHaveAttribute("data-phase", "open");
    } else {
      await closed(page);
      await expect(page.getByTestId("native-content")).toHaveAttribute("data-retained", "false");
      await expect(page.getByTestId("native-content")).not.toHaveAttribute("data-entering", /.*/);
    }

    if (action === "close-focus") {
      await expect(page.getByTestId("native-callbacks")).toContainText("focus:requested=false");
    }

    if (action === "close-before-reveal") {
      await expect(page.getByTestId("native-callbacks")).toContainText(
        "beforetoggle:open:requested=false",
      );
    }

    const paints = await page.evaluate(() => window.acceptanceObservation.paints);

    for (const paint of paints) {
      if (paint.opacity > 0 && !paint.inert) {
        expect(paint.left).not.toBe("");
        expect(paint.top).not.toBe("");
      }
    }
  });
}

test("V10 V14: no invented autofocus; native consumer autofocus once per fresh activation; authored Tab order", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await scriptControl(page, "native-autofocus-toggle");
  await page.getByTestId("native-outside").focus();
  await nativeOpen(page);
  await expect(page.getByTestId("native-outside")).toBeFocused();
  await expect(page.getByTestId("native-autofocus-count")).toHaveText("0");
  // Natural scroll-host focus is keyboard traversal, not invented activation autofocus.
  await assertNativeAuthoredOrder(page, info, false);
  await scriptControl(page, "native-close");
  await closed(page);
  await scriptControl(page, "native-autofocus-toggle");
  await nativeOpen(page);
  await expect(page.getByTestId("native-autofocus")).toBeFocused();
  await expect(page.getByTestId("native-openings")).toHaveText("2");
  await expect(page.getByTestId("native-autofocus-count")).toHaveText("1");
  await scriptControl(page, "native-transform");
  await expect(page.getByTestId("native-content")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 7, 0)",
  );
  await expect(page.getByTestId("native-content")).toHaveCSS("width", "180px");
  await expect(page.getByTestId("native-content")).toHaveCSS("overflow", "auto");
  await expect(page.getByTestId("native-content")).toHaveCSS("display", "grid");
  await scriptControl(page, "native-close");
  await closed(page);
  await expect(page.getByTestId("native-content")).toHaveCSS("display", "none");
});

test("V11: canceled show keeps preparatory retention, grants no participation, no unchanged-intent retry, new-intent retry", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await page.getByTestId("native-action").selectOption("cancel");
  await scriptControl(page, "native-open");
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await expect(page.getByTestId("native-openings")).toHaveText("1");
  await expect(page.getByTestId("native-content")).toHaveAttribute("data-phase", "opening");
  await expect(page.getByTestId("native-content")).not.toHaveAttribute("data-entering", /.*/);
  await expect(page.getByTestId("native-trigger")).toHaveAttribute("aria-expanded", "false");
  expect(
    await page.getByTestId("native-content").evaluate((node) => node.matches(":popover-open")),
  ).toBe(false);
  await expect
    .poll(() =>
      page
        .getByTestId("native-content")
        .evaluate((node) => node instanceof HTMLElement && node.inert),
    )
    .toBe(true);

  const frames = await page.evaluate(() => window.acceptanceObservation.frames);

  await page.setViewportSize({ width: 1210, height: 1010 });
  await expect
    .poll(() => page.evaluate(() => window.acceptanceObservation.frames))
    .toBeGreaterThan(frames + 5);
  await expect(page.getByTestId("native-openings")).toHaveText("1");
  await scriptControl(page, "native-close");
  await expect(page.getByTestId("native-content")).toHaveAttribute("data-phase", "closed");
  await nativeOpen(page);
  await expect(page.getByTestId("native-openings")).toHaveText("2");
  await expect(page.getByTestId("native-unused-outputs")).toHaveText("0");
});

function isUnsupportedWritingMode(record: ErrorRecord): boolean {
  if (record.source !== "console") {
    return false;
  }

  for (const argument of record.arguments ?? []) {
    if (
      typeof argument === "object" &&
      argument !== null &&
      "message" in argument &&
      argument.message === "Unsupported Popover Anchor writing mode: sideways-lr."
    ) {
      return true;
    }
  }

  return false;
}

async function preparationState(page: Page) {
  return page.getByTestId("native-content").evaluate((node) => {
    if (!(node instanceof HTMLElement)) {
      throw new Error("Expected the authored Content host");
    }

    const privateDeclarations: string[] = [];

    for (const property of node.style) {
      if (property.startsWith("--")) {
        privateDeclarations.push(property);
      }
    }

    return {
      native: node.matches(":popover-open"),
      inert: node.inert,
      opacity: `${node.style.getPropertyValue("opacity")} ${node.style.getPropertyPriority("opacity")}`,
      pointer: `${node.style.getPropertyValue("pointer-events")} ${node.style.getPropertyPriority("pointer-events")}`,
      privateDeclarations,
    };
  });
}

test("V3 V11: an unsupported Anchor writing mode fails the show once; no reveal, participation or tracking; intent kept; configuration change retries", async ({
  page,
  runtimeErrors,
  drainIssues,
}, info) => {
  runtimeErrors.expectExactly([
    {
      description: "one unsupported writing-mode Error reported through ErrorHandler",
      matches: isUnsupportedWritingMode,
    },
  ]);
  await fixture(page, "popover", info);
  // Authored consumer CSS outside the three supported writing modes.
  await page.getByTestId("writing-mode").selectOption("sideways-lr");
  await scriptControl(page, "native-open");
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await expect
    .poll(async () => {
      await drainIssues();

      return runtimeErrors.records.length;
    })
    .toBe(1);
  await expect(page.getByTestId("native-openings")).toHaveText("1");
  await expect
    .poll(() => preparationState(page))
    .toEqual({
      native: false,
      inert: true,
      opacity: "1 ",
      pointer: "auto ",
      privateDeclarations: [],
    });
  await expect(page.getByTestId("native-trigger")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("native-content")).toHaveAttribute("data-phase", "opening");
  await expect(page.getByTestId("native-content")).not.toHaveAttribute("data-entering", /.*/);
  // Tracking was released with the failed activation.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.acceptanceObservation.observers.filter(
            (record) =>
              (record.stack ?? "").includes(window.location.origin) &&
              record.targets.some((target) =>
                ["native-anchor", "native-content"].includes(
                  target.getAttribute("data-testid") ?? "",
                ),
              ),
          ).length,
      ),
    )
    .toBe(0);

  // Real resize/scroll and a supported writing mode alone neither retry nor report again.
  const frames = await page.evaluate(() => window.acceptanceObservation.frames);

  await page.getByTestId("native-scroll-two").evaluate((node) => {
    node.scrollTop += 30;
  });
  await page.setViewportSize({ width: 1210, height: 1010 });
  await page.getByTestId("writing-mode").selectOption("horizontal-tb");
  await expect
    .poll(() => page.evaluate(() => window.acceptanceObservation.frames))
    .toBeGreaterThan(frames + 5);
  await expect(page.getByTestId("native-openings")).toHaveText("1");
  await drainIssues();
  expect(runtimeErrors.records.length).toBe(1);
  expect((await preparationState(page)).native).toBe(false);

  // A configuration change requests a fresh activation, which now succeeds.
  await page.getByTestId("native-side").selectOption("block-start");
  await expect(page.getByTestId("native-openings")).toHaveText("2");
  await expect(page.getByTestId("native-content")).toHaveAttribute("data-phase", "open");
  await expect(page.getByTestId("native-trigger")).toHaveAttribute("aria-expanded", "true");
  await expect
    .poll(() => preparationState(page))
    .toEqual({
      native: true,
      inert: false,
      opacity: "1 ",
      pointer: "auto ",
      privateDeclarations: [],
    });
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await expect(page.getByTestId("native-unused-outputs")).toHaveText("0");
});

test("V3 V11: a positioning failure after reveal and a configuration update hides once; intent and open phase kept; no unchanged retry", async ({
  page,
  runtimeErrors,
  drainIssues,
}, info) => {
  runtimeErrors.expectExactly([
    {
      description: "one unsupported writing-mode Error reported through ErrorHandler",
      matches: isUnsupportedWritingMode,
    },
  ]);
  await fixture(page, "popover", info);
  await nativeOpen(page);

  const content = page.getByTestId("native-content");
  const top = await content.evaluate((node) => node.style.getPropertyValue("top"));

  // A configuration update repositions the same visible activation.
  await page.getByTestId("native-side").selectOption("block-start");
  await expect
    .poll(() => content.evaluate((node) => node.style.getPropertyValue("top")))
    .not.toBe(top);
  await expect(content).toHaveAttribute("data-phase", "open");
  await expect(page.getByTestId("native-openings")).toHaveText("1");

  // Authored consumer CSS outside the three supported writing modes fails the next update.
  await page.getByTestId("writing-mode").selectOption("sideways-lr");
  await expect
    .poll(async () => {
      await drainIssues();

      return runtimeErrors.records.length;
    })
    .toBe(1);
  await expect
    .poll(() => preparationState(page))
    .toEqual({
      native: false,
      inert: true,
      opacity: "1 ",
      pointer: "auto ",
      privateDeclarations: [],
    });
  await expect(page.getByTestId("native-trigger")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  // The native activation ended; Presence keeps its settled phase.
  await expect(content).toHaveAttribute("data-phase", "open");

  // Real scroll/resize and a supported writing mode alone neither show again nor report again.
  const frames = await page.evaluate(() => window.acceptanceObservation.frames);

  await page.getByTestId("native-scroll-two").evaluate((node) => {
    node.scrollTop += 30;
  });
  await page.setViewportSize({ width: 1210, height: 1010 });
  await page.getByTestId("writing-mode").selectOption("horizontal-tb");
  await expect
    .poll(() => page.evaluate(() => window.acceptanceObservation.frames))
    .toBeGreaterThan(frames + 5);
  await expect(page.getByTestId("native-openings")).toHaveText("1");
  await drainIssues();
  expect(runtimeErrors.records.length).toBe(1);
  expect((await preparationState(page)).native).toBe(false);

  // A later configuration change retries with a fresh activation, which now succeeds.
  await page.getByTestId("native-side").selectOption("block-end");
  await expect(page.getByTestId("native-openings")).toHaveText("2");
  await expect(content).toHaveAttribute("data-phase", "open");
  await expect(page.getByTestId("native-trigger")).toHaveAttribute("aria-expanded", "true");
  await expect
    .poll(() => preparationState(page))
    .toEqual({
      native: true,
      inert: false,
      opacity: "1 ",
      pointer: "auto ",
      privateDeclarations: [],
    });
  await expect(page.getByTestId("native-unused-outputs")).toHaveText("0");
});

test("V11 V13: a missing required observer fails the show before tracking acquisition; no listener or observer is left attached", async ({
  page,
  runtimeErrors,
  drainIssues,
}, info) => {
  runtimeErrors.expectExactly([
    {
      description: "one missing-observer Error reported through ErrorHandler",
      matches: (record) => {
        if (record.source !== "console") {
          return false;
        }

        for (const argument of record.arguments ?? []) {
          if (
            typeof argument === "object" &&
            argument !== null &&
            "message" in argument &&
            argument.message ===
              "Popover position tracking requires ResizeObserver and IntersectionObserver."
          ) {
            return true;
          }
        }

        return false;
      },
    },
  ]);
  await fixture(page, "popover", info);

  const tracking = await page.evaluateHandle(() => {
    const live = new Map<EventTarget, Set<unknown>>();
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;

    // Passive registration ledger for the update events Floating UI subscribes to.
    EventTarget.prototype.addEventListener = function (...args: Parameters<typeof add>): void {
      if (args[0] === "scroll" || args[0] === "resize") {
        const listeners = live.get(this) ?? new Set();

        listeners.add(args[1]);
        live.set(this, listeners);
      }

      Reflect.apply(add, this, args);
    };
    EventTarget.prototype.removeEventListener = function (
      ...args: Parameters<typeof remove>
    ): void {
      if (args[0] === "scroll" || args[0] === "resize") {
        live.get(this)?.delete(args[1]);
      }

      Reflect.apply(remove, this, args);
    };

    return {
      count() {
        let total = 0;

        for (const listeners of live.values()) {
          total += listeners.size;
        }

        return total;
      },
      restore() {
        EventTarget.prototype.addEventListener = add;
        EventTarget.prototype.removeEventListener = remove;
      },
    };
  });

  try {
    const baseline = await tracking.evaluate((ledger) => ledger.count());
    const resizeObserver = await page.evaluateHandle(() => {
      const constructor = window.ResizeObserver;

      // An environment without a required capability; nothing is substituted.
      Reflect.deleteProperty(window, "ResizeObserver");

      return { restore: () => Reflect.set(window, "ResizeObserver", constructor) };
    });

    await scriptControl(page, "native-open");
    await expect(page.getByTestId("native-intent")).toHaveText("true");
    await expect
      .poll(async () => {
        await drainIssues();

        return runtimeErrors.records.length;
      })
      .toBe(1);
    await expect
      .poll(() => preparationState(page))
      .toEqual({
        native: false,
        inert: true,
        opacity: "1 ",
        pointer: "auto ",
        privateDeclarations: [],
      });
    await expect(page.getByTestId("native-trigger")).toHaveAttribute("aria-expanded", "false");

    const frames = await page.evaluate(() => window.acceptanceObservation.frames);

    await page.getByTestId("native-scroll-two").evaluate((node) => {
      node.scrollTop += 30;
    });
    await page.setViewportSize({ width: 1210, height: 1010 });
    await expect
      .poll(() => page.evaluate(() => window.acceptanceObservation.frames))
      .toBeGreaterThan(frames + 5);

    const leaked = {
      listeners: (await tracking.evaluate((ledger) => ledger.count())) - baseline,
      observers: await page.evaluate(
        () =>
          window.acceptanceObservation.observers.filter((record) =>
            record.targets.some((target) =>
              ["native-anchor", "native-content"].includes(
                target.getAttribute("data-testid") ?? "",
              ),
            ),
          ).length,
      ),
    };

    await info.attach("V13-missing-observer-acquisition", {
      body: JSON.stringify({ baseline, leaked, records: runtimeErrors.records.length }, null, 2),
      contentType: "application/json",
    });
    expect(leaked).toEqual({ listeners: 0, observers: 0 });
    await drainIssues();
    expect(runtimeErrors.records.length).toBe(1);

    // With the capability back, a configuration change requests a fresh activation.
    await resizeObserver.evaluate((environment) => environment.restore());
    await resizeObserver.dispose();
    await page.getByTestId("native-side").selectOption("block-start");
    await expect(page.getByTestId("native-content")).toHaveAttribute("data-phase", "open");
    await expect(page.getByTestId("native-trigger")).toHaveAttribute("aria-expanded", "true");
    await expect
      .poll(() => preparationState(page))
      .toEqual({
        native: true,
        inert: false,
        opacity: "1 ",
        pointer: "auto ",
        privateDeclarations: [],
      });
  } finally {
    await tracking.evaluate((ledger) => ledger.restore());
    await tracking.dispose();
  }
});

for (const motion of ["finite", "none", "zero", "infinite", "mixed"]) {
  test(`V12: ${motion} native exit retention, immediate inert/nonparticipation, scroll cannot strand completion`, async ({
    page,
  }, info) => {
    await fixture(page, "popover", info);
    await page.getByTestId("native-motion").selectOption(motion);
    await nativeOpen(page);
    await page.getByTestId("native-inside-close").click();
    await expect(page.getByTestId("native-trigger")).toHaveAttribute("aria-expanded", "false");

    if (
      (motion === "finite" || motion === "mixed") &&
      info.project.metadata.motion === "no-preference"
    ) {
      await expect(page.getByTestId("native-content")).toHaveAttribute("data-phase", "closing");
      expect(
        await page.getByTestId("native-content").evaluate((node) => node.matches(":popover-open")),
      ).toBe(true);
      expect(
        await page
          .getByTestId("native-content")
          .evaluate((node) => node instanceof HTMLElement && node.inert),
      ).toBe(true);
      await page.getByTestId("native-scroll-two").evaluate((node) => {
        node.scrollTop += 15;
      });

      const reads = await page.evaluate(() =>
        window.acceptanceObservation.discoveries.filter(
          (item) => item.testid === "native-content" && item.leaving,
        ),
      );

      expect(reads.length).toBeGreaterThan(0);

      for (const read of reads) {
        expect(read.inert).toBe(true);
        expect(read.native).toBe(true);
      }
    }

    await closed(page);
    await expect(page.getByTestId("native-content")).toHaveAttribute("data-retained", "false");
    await expect(page.getByTestId("native-closings")).toHaveText("1");
  });
}

test("V5 V12: before-hide reversal reuses native promotion; during-hide reentry must freshly activate after return", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await nativeOpen(page);
  await page.getByTestId("native-inside-close").click();

  if (info.project.metadata.motion === "no-preference") {
    await expect(page.getByTestId("native-content")).toHaveAttribute("data-phase", "closing");
    await scriptControl(page, "native-open");
    await expect(page.getByTestId("native-content")).toHaveAttribute("data-phase", "open");
    await expect(page.getByTestId("native-openings")).toHaveText("1");
    await expect(page.getByTestId("native-autofocus-count")).toHaveText("1");
  } else {
    await closed(page);
    await nativeOpen(page);
  }

  const before = Number(await page.getByTestId("native-openings").textContent());

  await page.getByTestId("native-inside-hide-reopen").click();
  await page.getByTestId("native-inside-close").click();
  await expect(page.getByTestId("native-content")).toHaveAttribute("data-phase", "open");
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await expect(page.getByTestId("native-openings")).toHaveText(String(before + 1));
  await expect(page.getByTestId("native-callbacks")).toContainText(
    "beforetoggle:closed:requested=true",
  );
});

test("V13: burst real scroll/layout/config/resize then remount, current geometry wins and dead host stays detached", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await nativeOpen(page);
  await page.getByTestId("native-inside-layout").click();
  await page.getByTestId("native-scroll-two").evaluate((node) => {
    for (let index = 0; index < 20; index += 1) {
      node.scrollTop = index;
      node.scrollLeft = index / 2;
    }
  });
  await page.getByTestId("native-inside-size").click();
  await expectPreferred(page, "inline-end", "end", 12);

  const old = await page.getByTestId("native-content").elementHandle();

  if (!old) {
    throw new Error("Missing the first Content host");
  }

  await scriptControl(page, "native-content-mount");
  // The unmount must render before the remount request; otherwise the toggles coalesce.
  await expect.poll(() => old.evaluate((node) => node.isConnected)).toBe(false);
  await expect(page.getByTestId("native-content")).toHaveCount(0);
  await expect(page.getByTestId("native-intent")).toHaveText("true");
  await scriptControl(page, "native-content-mount");
  await expect(page.getByTestId("native-content")).toHaveAttribute("data-phase", "open");
  await expectPreferred(page, "inline-end", "end", 12);

  // The replacement is a new host; the dead host stays detached and closed across frames.
  const dead = await old.evaluate(async (node) => {
    const samples: { connected: boolean; native: boolean }[] = [];

    for (let index = 0; index < 10; index += 1) {
      samples.push({ connected: node.isConnected, native: node.matches(":popover-open") });
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    return {
      replaced: node !== document.querySelector('[data-testid="native-content"]'),
      samples,
    };
  });

  expect(dead.replaced).toBe(true);

  for (const sample of dead.samples) {
    expect(sample).toEqual({ connected: false, native: false });
  }

  info.annotations.push({
    type: "coverage-limit",
    description:
      "Real burst/remount exercised; out-of-order async resolution is not claimed without independently observed interleaving.",
  });
});

test("V11 H1: canceled initial SSR-open activation keeps settled retained phase and exact server children", async ({
  page,
}, info) => {
  const release = await bootstrapHeld(page, "/popover?initial=true&native=cancel", info);

  await expect(page.getByTestId("native-content")).toHaveAttribute("data-phase", "open");
  await expect(page.getByTestId("native-content")).toHaveAttribute("data-present", "");
  expect(
    await page.getByTestId("native-content").evaluate((node) => node.matches(":popover-open")),
  ).toBe(false);
  release();
  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  await page.getByTestId("attach-fixture").click();
  await expect(page.getByTestId("fixture-attached")).toHaveText("true");
  await expect(page.getByTestId("native-openings")).toHaveText("1");
  await expect(page.getByTestId("native-content")).toHaveAttribute("data-phase", "open");
  await expect(page.getByTestId("native-content")).toHaveAttribute("data-present", "");
  await expect(page.getByTestId("native-trigger")).toHaveAttribute("aria-expanded", "false");
  await assertReferences(page, info);
  await stopRetentionObservation(page);
  await scriptControl(page, "native-close");
  await closed(page);
  await expect(page.getByTestId("native-content")).toHaveAttribute("data-retained", "false");
});

test("V14: adjacent authored co-located Trigger/Content navigation without source association", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await scriptControl(page, "native-co-locate");
  await scriptControl(page, "native-autofocus-toggle");
  await nativeOpen(page);
  await assertNativeAuthoredOrder(page, info, true);
  await expect(page.getByTestId("native-trigger")).not.toHaveAttribute("popovertarget", /.*/);
});

test("V10: consumer opacity/pointer/live bindings changed during native autofocus preparation survive owned override cleanup", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await page.getByTestId("native-action").selectOption("style-focus");
  await nativeOpen(page);
  await expect(page.getByTestId("native-live-text")).toHaveText("during-preparation");
  await expect(page.getByTestId("native-content")).toHaveCSS("opacity", "0.6");
  await expect(page.getByTestId("native-content")).toHaveCSS("pointer-events", "auto");

  const priorities = await page.getByTestId("native-content").evaluate((node) => {
    if (!(node instanceof HTMLElement)) {
      throw new Error("Missing native host");
    }

    return [
      node.style.getPropertyPriority("opacity"),
      node.style.getPropertyPriority("pointer-events"),
    ];
  });

  expect(priorities).toEqual(["", ""]);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.acceptanceObservation.paints.some((paint) => paint.opacity > 0 && !paint.inert),
      ),
    )
    .toBe(true);

  const paints = await page.evaluate(() => window.acceptanceObservation.paints);

  for (const paint of paints) {
    if (paint.opacity > 0 && !paint.inert) {
      expect(paint.left).not.toBe("");
      expect(paint.top).not.toBe("");

      if (!paint.anchor || !paint.writingMode || !paint.direction) {
        throw new Error("Missing actual first-paint reference geometry");
      }

      const box = {
        left: paint.x,
        right: paint.x + paint.width,
        top: paint.y,
        bottom: paint.y + paint.height,
        width: paint.width,
        height: paint.height,
      };
      const preferred = candidates(
        paint.anchor,
        box,
        paint.viewport,
        paint.writingMode,
        paint.direction,
        "block-end",
        "start",
        8,
      )[0];

      expect(preferred.mainOverflow).toBeLessThanOrEqual(0);
      expect(preferred.crossOverflow).toBe(0);
      expect(Math.abs(paint.x - preferred.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(paint.y - preferred.y)).toBeLessThanOrEqual(2);
    }
  }
});

test("V9 V13: restoration occurs once; closed surfaces do no new observable geometry work after real resize/scroll", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await nativeOpen(page);
  await page.getByTestId("native-first").focus();

  const observersBefore = await page.evaluate(
    () =>
      window.acceptanceObservation.observers.filter(
        (record) =>
          (record.stack ?? "").includes(window.location.origin) &&
          record.targets.some((target) =>
            ["native-anchor", "native-content"].includes(target.getAttribute("data-testid") ?? ""),
          ),
      ).length,
  );

  expect(
    observersBefore,
    "Genuine observer registrations must be visible before cleanup is asserted",
  ).toBeGreaterThan(0);

  const focusedBefore = await page.evaluate(
    () => window.acceptanceObservation.focus.filter((id) => id === "native-trigger").length,
  );

  await page.keyboard.press("Escape");
  await closed(page);
  await expect(page.getByTestId("native-trigger")).toBeFocused();

  const focusedAfter = await page.evaluate(
    () => window.acceptanceObservation.focus.filter((id) => id === "native-trigger").length,
  );

  expect(focusedAfter - focusedBefore).toBe(1);

  const observedOpenReads = await page.evaluate(() =>
    window.acceptanceObservation.geometry.some(
      (read) =>
        (read.testid === "native-anchor" || read.testid === "native-content") &&
        (read.stack ?? "").includes(window.location.origin),
    ),
  );

  expect(
    observedOpenReads,
    "The forwarding probe must observe genuine served-script geometry before asserting shutdown",
  ).toBe(true);

  const before = await page.evaluate(() => ({
    count: window.acceptanceObservation.geometry.length,
    frames: window.acceptanceObservation.frames,
  }));

  await page.getByTestId("native-anchor").evaluate((node) => {
    if (!(node instanceof HTMLElement)) {
      throw new Error("Missing consumer anchor");
    }

    node.style.width = "120px";
  });
  await page.getByTestId("native-scroll-two").evaluate((node) => {
    node.scrollTop += 30;
  });
  await page.setViewportSize({ width: 1250, height: 1050 });
  await expect
    .poll(() => page.evaluate(() => window.acceptanceObservation.frames))
    .toBeGreaterThan(before.frames + 3);

  const reads = await page.evaluate(
    (count) =>
      window.acceptanceObservation.geometry
        .slice(count)
        .filter(
          (read) =>
            (read.testid === "native-anchor" || read.testid === "native-content") &&
            (read.stack ?? "").includes(window.location.origin),
        ),
    before.count,
  );

  expect(reads).toEqual([]);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.acceptanceObservation.observers.filter(
            (record) =>
              (record.stack ?? "").includes(window.location.origin) &&
              record.targets.some((target) =>
                ["native-anchor", "native-content"].includes(
                  target.getAttribute("data-testid") ?? "",
                ),
              ),
          ).length,
      ),
    )
    .toBe(0);
});

async function mountPresentation(page: Page, info: TestInfo): Promise<void> {
  await fixture(page, "popover", info);
  await page.getByTestId("presentation-mount").click();
  await expect(page.getByTestId("presentation-content")).toHaveAttribute("data-phase", "closed");
  await page.evaluate(() => {
    window.presentationProof = {
      animations: {},
      content: null,
      autofocus: null,
      frames: [],
      firstVisible: null,
      batches: [],
    };
  });
}

async function presentationNative(page: Page): Promise<boolean> {
  return page.getByTestId("presentation-content").evaluate((node) => node.matches(":popover-open"));
}

/** Pause the genuine finite host animation for one transition and keep its reference. */
async function pausePresentation(
  page: Page,
  marker: "data-entering" | "data-leaving",
  slot: string,
): Promise<void> {
  const content = page.getByTestId("presentation-content");

  await expect(content).toHaveAttribute(marker, "");
  await content.evaluate((host, slot) => {
    let finite: Animation | null = null;

    for (const animation of host.getAnimations()) {
      const end = Number(animation.effect?.getComputedTiming().endTime);

      if (finite === null && Number.isFinite(end)) {
        finite = animation;
      }
    }

    if (finite === null) {
      throw new Error("Expected a genuine finite host animation");
    }

    finite.pause();
    window.presentationProof.animations[slot] = finite;
  }, slot);
}

async function presentationStyles(page: Page) {
  return page.getByTestId("presentation-content").evaluate((node) => {
    if (!(node instanceof HTMLElement)) {
      throw new Error("Expected the authored Content host");
    }

    const computed = getComputedStyle(node);

    return {
      opacity: node.style.getPropertyValue("opacity"),
      opacityPriority: node.style.getPropertyPriority("opacity"),
      computedOpacity: computed.opacity,
      pointer: node.style.getPropertyValue("pointer-events"),
      pointerPriority: node.style.getPropertyPriority("pointer-events"),
      computedPointer: computed.pointerEvents,
      consumerVisual: node.style.getPropertyValue("--consumer-visual").trim(),
      native: node.matches(":popover-open"),
      inert: node.inert,
    };
  });
}

async function expectAuthored(
  page: Page,
  expected: { opacity: string; opacityPriority: string; native: boolean },
): Promise<void> {
  await expect
    .poll(async () => {
      const actual = await presentationStyles(page);

      return {
        opacity: actual.opacity,
        opacityPriority: actual.opacityPriority,
        native: actual.native,
        consumerVisual: actual.consumerVisual,
      };
    })
    .toEqual({ ...expected, consumerVisual: "preserved" });
}

async function callbackCapture(page: Page, testId: string) {
  const text = await page.getByTestId(testId).textContent();
  const value: unknown = JSON.parse(text ?? "");

  if (typeof value !== "object" || value === null) {
    throw new Error(`Missing native callback capture ${testId}`);
  }

  return value;
}

async function openPresentation(page: Page): Promise<void> {
  await scriptControl(page, "presentation-open");
  await expect(page.getByTestId("presentation-content")).toHaveAttribute("data-phase", "open");
  await expect.poll(() => presentationNative(page)).toBe(true);
}

async function closePresentation(page: Page): Promise<void> {
  await scriptControl(page, "presentation-close");
  await expect(page.getByTestId("presentation-content")).toHaveAttribute("data-phase", "closed");
  await expect.poll(() => presentationNative(page)).toBe(false);
}

test("V10 V12 R3: Anchor suppression rejects an obsolete paused entrance; the same retained host acquires a fresh one", async ({
  page,
}, info) => {
  await mountPresentation(page, info);

  const content = page.getByTestId("presentation-content");
  const intent = page.getByTestId("presentation-intent");
  const shows = page.getByTestId("presentation-shows");
  // Genuine finite motion exists only without reduced motion; reduced projects prove the
  // same intent/retention/fresh-activation outcomes with direct settlement.
  const finite = info.project.metadata.motion === "no-preference";

  if (finite) {
    // A consumer script entrance survives suppression, unlike the marker-bound CSS one.
    await scriptControl(page, "presentation-arm-script-entrance");
  }

  await scriptControl(page, "presentation-open");
  await expect.poll(() => presentationNative(page)).toBe(true);

  if (finite) {
    await pausePresentation(page, "data-entering", "released");
    await content.evaluate((host) => {
      for (const animation of host.getAnimations()) {
        if (animation.id === "script-entrance") {
          animation.pause();
          window.presentationProof.animations["script"] = animation;
        }
      }

      if (!window.presentationProof.animations["script"]) {
        throw new Error("Expected the consumer's live script entrance");
      }
    });
    await expect(content).toHaveAttribute("data-phase", "opening");
    // Presence discovered this entrance, so its wait includes the script animation.
    expect(
      await page.evaluate(() =>
        window.acceptanceObservation.discoveries.some(
          (discovery) =>
            discovery.testid === "presentation-content" &&
            discovery.entering &&
            (discovery.stack ?? "").includes(window.location.origin),
        ),
      ),
    ).toBe(true);
  } else {
    await expect(content).toHaveAttribute("data-phase", "open");
  }

  await expect(shows).toHaveText("1");
  await page.evaluate(() => {
    window.presentationProof.content = document.querySelector(
      '[data-testid="presentation-content"]',
    );
    window.presentationProof.autofocus = document.querySelector(
      '[data-testid="presentation-autofocus"]',
    );
  });
  await scriptControl(page, "presentation-remove-anchor");
  await expect.poll(() => presentationNative(page)).toBe(false);
  await expect(intent).toHaveText("true");

  if (finite) {
    const obsolete = await page.evaluate(async () => {
      const marker = window.presentationProof.animations["released"];
      const script = window.presentationProof.animations["script"];

      if (!marker || !script) {
        throw new Error("Missing the released entrances");
      }

      // Suppression style-cancels the marker-bound entrance; the script one is still live.
      const playStates = { marker: marker.playState, script: script.playState };
      const completion = script.finished;

      script.cancel();
      await completion.catch(() => undefined);

      return playStates;
    });

    await info.attach("obsolete-entrance-play-state-before-cancel", {
      body: JSON.stringify(obsolete),
      contentType: "application/json",
    });
    expect(obsolete).toEqual({ marker: "idle", script: "paused" });
    // The suppressed transition must not settle from the obsolete activation's completion.
    await expect(content).toHaveAttribute("data-phase", "opening");
    await expect(content).not.toHaveAttribute("data-entering", /.*/);
  }

  await expect(intent).toHaveText("true");
  // Restoring the Anchor keeps intent unchanged: same host, fresh native activation.
  await scriptControl(page, "presentation-restore-anchor");
  await expect.poll(() => presentationNative(page)).toBe(true);
  await expect(shows).toHaveText("2");

  if (finite) {
    await pausePresentation(page, "data-entering", "fresh");
    expect(
      await page.evaluate(
        () =>
          window.presentationProof.animations["fresh"] !==
          window.presentationProof.animations["released"],
      ),
    ).toBe(true);
  }

  expect(
    await page.evaluate(
      () =>
        window.presentationProof.content ===
          document.querySelector('[data-testid="presentation-content"]') &&
        window.presentationProof.autofocus ===
          document.querySelector('[data-testid="presentation-autofocus"]'),
    ),
  ).toBe(true);

  // Position and scroll updates during the fresh entrance do not invalidate its completion.
  const before = await content.boundingBox();

  await scriptControl(page, "presentation-place");
  await page.getByTestId("presentation-inner").evaluate((node) => {
    node.scrollTop = 8;
  });
  await page.getByTestId("presentation-outer").evaluate((node) => {
    node.scrollTop = 12;
  });
  await expect.poll(async () => (await content.boundingBox())?.x).not.toBe(before?.x);

  if (finite) {
    await expect(content).toHaveAttribute("data-phase", "opening");
    await page.evaluate(() => window.presentationProof.animations["fresh"]?.finish());
  }

  await expect(content).toHaveAttribute("data-phase", "open");
  await expect.poll(() => presentationNative(page)).toBe(true);

  // A visible exit settles from its own leaving discovery without a fresh reveal.
  await scriptControl(page, "presentation-close");

  if (finite) {
    await pausePresentation(page, "data-leaving", "exit");
    await expect(content).toHaveAttribute("data-phase", "closing");
    expect(await presentationNative(page)).toBe(true);
    await page.evaluate(() => window.presentationProof.animations["exit"]?.finish());
  }

  await expect(content).toHaveAttribute("data-phase", "closed");
  await expect.poll(() => presentationNative(page)).toBe(false);
  await expect(shows).toHaveText("2");

  // A suppressed preparatory activation closes nonvisually and settles directly.
  await scriptControl(page, "presentation-open");
  await expect.poll(() => presentationNative(page)).toBe(true);

  if (finite) {
    await pausePresentation(page, "data-entering", "nonvisual");
  }

  await scriptControl(page, "presentation-remove-anchor");
  await expect.poll(() => presentationNative(page)).toBe(false);

  if (finite) {
    await expect(content).toHaveAttribute("data-phase", "opening");
  }

  await scriptControl(page, "presentation-close");
  await expect(content).toHaveAttribute("data-phase", "closed");
  await expect(intent).toHaveText("false");
  expect(await presentationNative(page)).toBe(false);
  await expect(page.getByTestId("presentation-unused")).toHaveText("0");
});

/**
 * Records each MutationObserver delivery: the presentation attributes it changed, in order, and
 * the Content's state after them. One Angular render lands in one delivery.
 */
async function recordPresentationBatches(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = document.querySelector("acceptance-popover-presentation");
    const content = document.querySelector('[data-testid="presentation-content"]');

    if (host === null || !(content instanceof HTMLElement)) {
      throw new Error("Expected the presentation hosts");
    }

    const observer = new MutationObserver((records) => {
      const changed: string[] = [];

      for (const record of records) {
        let target = "content";

        if (record.target === host) {
          target = "host";
        }

        changed.push(`${target}:${record.attributeName}`);
      }

      window.presentationProof.batches.push({
        changed,
        phase: content.getAttribute("data-phase"),
        entering: content.hasAttribute("data-entering"),
        present: content.hasAttribute("data-present"),
        leaving: content.hasAttribute("data-leaving"),
        left: content.style.getPropertyValue("left"),
        top: content.style.getPropertyValue("top"),
        native: content.matches(":popover-open"),
      });
    });

    observer.observe(host, { attributeFilter: ["data-settle-read"] });
    observer.observe(content, {
      attributeFilter: ["style", "data-entering", "data-present", "data-leaving"],
    });
  });
}

test("V12 V13: a finite entrance or exit that settles after the READ starting a position calculation keeps that calculation", async ({
  page,
}, info) => {
  await mountPresentation(page, info);

  const content = page.getByTestId("presentation-content");
  const hosts = { content: "presentation-content", anchor: "presentation-trigger" };
  // Genuine finite motion exists only without reduced motion; reduced projects prove the
  // same placement outcomes with direct settlement and no animation to finish.
  const finite = info.project.metadata.motion === "no-preference";

  if (!finite) {
    await openPresentation(page);
    await expectPreferred(page, "block-end", "start", 8, hosts);
    await scriptControl(page, "presentation-place-settle");
    await expectPreferred(page, "block-start", "end", 12, hosts);
    expect(await presentationRecord(page, "data-settle-read")).toMatchObject({
      phase: "open",
      finished: 0,
    });
    await closePresentation(page);
    await scriptControl(page, "presentation-default-place-settle");
    await expect
      .poll(() => presentationRecord(page, "data-settle-read"))
      .toMatchObject({ phase: "closed", finished: 0 });
    await openPresentation(page);
    await expectPreferred(page, "block-end", "start", 8, hosts);
    await expect(page.getByTestId("presentation-unused")).toHaveText("0");

    return;
  }

  await scriptControl(page, "presentation-open");
  await pausePresentation(page, "data-entering", "entrance");
  await expect.poll(() => presentationNative(page)).toBe(true);
  await expect(content).toHaveAttribute("data-phase", "opening");
  await expectPreferred(page, "block-end", "start", 8, hosts);
  await recordPresentationBatches(page);

  // The placement change starts a position calculation in the next render's READ; a consumer
  // READ hook after it finishes the entrance, so Presence settles before any WRITE can commit
  // that result. Nothing else changes, so no further tracking event can request another one.
  await scriptControl(page, "presentation-place-settle");
  await expect(content).toHaveAttribute("data-phase", "open");
  await expectPreferred(page, "block-start", "end", 12, hosts);

  const entrance = await page.evaluate(() => window.presentationProof.batches);

  await info.attach("entrance-settle-interleaving", {
    body: JSON.stringify(entrance, null, 2),
    contentType: "application/json",
  });
  expect(await presentationRecord(page, "data-settle-read")).toMatchObject({
    phase: "opening",
    entering: true,
    finished: 1,
  });

  // Actual interleaving: the settle-READ record lands while still entering at the old
  // coordinates; the settled render (data-present) is no later than the coordinate commit.
  const readBatch = entrance.findIndex((batch) => batch.changed.includes("host:data-settle-read"));
  const presentBatch = entrance.findIndex((batch) => batch.present);
  const movedBatch = entrance.findIndex((batch) => batch.left !== entrance[0]?.left);

  expect(readBatch).toBe(0);
  expect(entrance[readBatch]).toMatchObject({ entering: true, present: false });
  expect(presentBatch).toBeGreaterThan(readBatch);
  expect(movedBatch).toBeGreaterThanOrEqual(presentBatch);

  // A visible exit that settles while that READ's calculation is pending hides without error.
  await scriptControl(page, "presentation-close");
  await pausePresentation(page, "data-leaving", "exit");
  await expect(content).toHaveAttribute("data-phase", "closing");
  expect(await presentationNative(page)).toBe(true);
  await page.evaluate(() => {
    window.presentationProof.batches = [];
  });
  await scriptControl(page, "presentation-default-place-settle");
  await expect(content).toHaveAttribute("data-phase", "closed");
  await expect.poll(() => presentationNative(page)).toBe(false);
  await info.attach("exit-settle-interleaving", {
    body: JSON.stringify(await page.evaluate(() => window.presentationProof.batches), null, 2),
    contentType: "application/json",
  });
  expect(await presentationRecord(page, "data-settle-read")).toMatchObject({
    phase: "closing",
    leaving: true,
    finished: 1,
  });

  // The same retained host still opens at the default placement afterwards.
  await openPresentation(page);
  await expectPreferred(page, "block-end", "start", 8, hosts);
  await expect(page.getByTestId("presentation-unused")).toHaveText("0");
});

test("V10 V11: authored important opacity survives reveal/exit, callback writes, synchronous focus-close and canceled show", async ({
  page,
}, info) => {
  await mountPresentation(page, info);
  await scriptControl(page, "presentation-important-opacity");
  await expectAuthored(page, { opacity: "0.8", opacityPriority: "important", native: false });
  await openPresentation(page);
  await expectAuthored(page, { opacity: "0.8", opacityPriority: "important", native: true });
  await closePresentation(page);
  await expectAuthored(page, { opacity: "0.8", opacityPriority: "important", native: false });

  // beforetoggle observes a transparent, noninteractive preparation; its important write wins.
  await scriptControl(page, "presentation-arm-show-opacity");
  await openPresentation(page);
  expect(await callbackCapture(page, "presentation-show-capture")).toMatchObject({
    computedOpacity: "0",
    computedPointer: "none",
    trusted: true,
    native: false,
  });
  await expectAuthored(page, { opacity: "0.65", opacityPriority: "important", native: true });

  const shown = await presentationStyles(page);

  expect([shown.pointer, shown.pointerPriority]).toEqual(["auto", ""]);
  // A later normal-priority binding write also survives reveal cleanup and exit.
  await scriptControl(page, "presentation-normal-opacity");
  await expectAuthored(page, { opacity: "0.6", opacityPriority: "", native: true });
  await closePresentation(page);
  await expectAuthored(page, { opacity: "0.6", opacityPriority: "", native: false });

  await scriptControl(page, "presentation-arm-focus-opacity");
  await openPresentation(page);
  expect(await callbackCapture(page, "presentation-focus-capture")).toMatchObject({
    computedOpacity: "0",
    computedPointer: "none",
    trusted: true,
    native: true,
  });
  await expectAuthored(page, { opacity: "0.45", opacityPriority: "important", native: true });
  await closePresentation(page);
  await expectAuthored(page, { opacity: "0.45", opacityPriority: "important", native: false });

  // Both callbacks inside one activation; autofocus sees the beforetoggle write, then closes
  // synchronously. Release keeps the latest value and priority.
  await scriptControl(page, "presentation-arm-show-opacity");
  await scriptControl(page, "presentation-arm-focus-opacity");
  await scriptControl(page, "presentation-arm-focus-close");
  await scriptControl(page, "presentation-open");
  await expect(page.getByTestId("presentation-sync")).toHaveText("focus-close:false");
  await expect(page.getByTestId("presentation-content")).toHaveAttribute("data-phase", "closed");
  expect(await callbackCapture(page, "presentation-show-capture")).toMatchObject({
    computedOpacity: "0",
    trusted: true,
  });
  expect(await callbackCapture(page, "presentation-focus-capture")).toMatchObject({
    computedOpacity: "0.65",
    trusted: true,
  });
  await expectAuthored(page, { opacity: "0.45", opacityPriority: "important", native: false });

  // A canceled show restores the consumer's callback write, not a preparation value.
  await scriptControl(page, "presentation-cancel-show");
  await scriptControl(page, "presentation-arm-show-opacity");
  await scriptControl(page, "presentation-open");
  await expect(page.getByTestId("presentation-intent")).toHaveText("true");
  await expectAuthored(page, { opacity: "0.65", opacityPriority: "important", native: false });
  await scriptControl(page, "presentation-close");
  await expect(page.getByTestId("presentation-content")).toHaveAttribute("data-phase", "closed");
  await expectAuthored(page, { opacity: "0.65", opacityPriority: "important", native: false });
  await expect(page.getByTestId("presentation-unused")).toHaveText("0");
});

for (const callback of ["show", "focus"]) {
  test(`V10: authored ${callback}-callback opacity 0 / pointer-events none !important equal to preparation are not overwritten`, async ({
    page,
  }, info) => {
    await mountPresentation(page, info);
    await scriptControl(page, "presentation-collision-baseline");
    await expect
      .poll(() => presentationStyles(page))
      .toEqual({
        opacity: "0.8",
        opacityPriority: "important",
        computedOpacity: "0.8",
        pointer: "auto",
        pointerPriority: "important",
        computedPointer: "auto",
        consumerVisual: "preserved",
        native: false,
        inert: true,
      });
    await scriptControl(page, `presentation-arm-${callback}-suppression`);
    await openPresentation(page);
    await expect(page.getByTestId("presentation-bound-opacity")).toHaveText("0 !important");
    await expect(page.getByTestId("presentation-bound-pointer")).toHaveText("none !important");
    // The callback ran during transparent, noninteractive preparation with the earlier bindings.
    expect(await callbackCapture(page, `presentation-${callback}-capture`)).toMatchObject({
      computedOpacity: "0",
      computedPointer: "none",
      boundOpacity: "0.8 !important",
      boundPointer: "auto !important",
      trusted: true,
    });
    await expect
      .poll(() => presentationStyles(page))
      .toEqual({
        opacity: "0",
        opacityPriority: "important",
        computedOpacity: "0",
        pointer: "none",
        pointerPriority: "important",
        computedPointer: "none",
        consumerVisual: "preserved",
        native: true,
        inert: false,
      });
    await expect(page.getByTestId("presentation-shows")).toHaveText("1");
    await expect(page.getByTestId("presentation-focuses")).toHaveText("1");
    await expect(page.getByTestId("presentation-intent")).toHaveText("true");

    // The next genuine keyboard-driven consumer update applies; no temporary override sticks.
    await page.getByTestId("presentation-next-style").press("Enter");
    await expect
      .poll(() => presentationStyles(page))
      .toEqual({
        opacity: "0.35",
        opacityPriority: "important",
        computedOpacity: "0.35",
        pointer: "auto",
        pointerPriority: "",
        computedPointer: "auto",
        consumerVisual: "preserved",
        native: true,
        inert: false,
      });
  });
}

test("V10 V11: preparatory frames stay transparent; the first visible frame is positioned with authored important styles", async ({
  page,
}, info) => {
  await mountPresentation(page, info);
  await scriptControl(page, "presentation-collision-baseline");
  await expectAuthored(page, { opacity: "0.8", opacityPriority: "important", native: false });
  await page.evaluate(() => {
    const sample = () => {
      const content = document.querySelector('[data-testid="presentation-content"]');
      const anchor = document.querySelector('[data-testid="presentation-trigger"]');

      if (!(content instanceof HTMLElement) || !(anchor instanceof HTMLElement)) {
        throw new Error("Missing presentation geometry hosts");
      }

      if (content.matches(":popover-open")) {
        const computed = getComputedStyle(content);
        const rect = content.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        const frame = {
          opacity: computed.opacity,
          pointer: computed.pointerEvents,
          left: rect.left,
          top: rect.top,
          anchorLeft: anchorRect.left,
          anchorBottom: anchorRect.bottom,
        };

        if (Number(computed.opacity) > 0) {
          window.presentationProof.firstVisible = frame;

          return;
        }

        window.presentationProof.frames.push(frame);
      }

      requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
  });
  await openPresentation(page);
  await expect
    .poll(() => page.evaluate(() => window.presentationProof.firstVisible !== null))
    .toBe(true);

  const proof = await page.evaluate(() => window.presentationProof);

  for (const frame of proof.frames) {
    expect([frame.opacity, frame.pointer]).toEqual(["0", "none"]);
  }

  const first = proof.firstVisible;

  if (!first) {
    throw new Error("Missing the first visible frame");
  }

  expect([first.opacity, first.pointer]).toEqual(["0.8", "auto"]);
  // Preferred block-end/start with gap 8 in a horizontal LTR Anchor.
  expect(Math.abs(first.left - first.anchorLeft)).toBeLessThanOrEqual(2);
  expect(Math.abs(first.top - first.anchorBottom - 8)).toBeLessThanOrEqual(2);
  expect(await callbackCapture(page, "presentation-show-capture")).toMatchObject({
    computedOpacity: "0",
    computedPointer: "none",
    trusted: true,
    native: false,
  });
  expect(await callbackCapture(page, "presentation-focus-capture")).toMatchObject({
    computedOpacity: "0",
    computedPointer: "none",
    trusted: true,
    native: true,
  });
  await expect(page.getByTestId("presentation-autofocus")).toBeFocused();
  await expect
    .poll(() => presentationStyles(page))
    .toMatchObject({
      opacity: "0.8",
      opacityPriority: "important",
      pointer: "auto",
      pointerPriority: "important",
      consumerVisual: "preserved",
      native: true,
    });
  await scriptControl(page, "presentation-live-change");
  await expect(page.getByTestId("presentation-live")).toHaveText("updated");
  await closePresentation(page);
  await expect
    .poll(() => presentationStyles(page))
    .toMatchObject({
      opacity: "0.8",
      opacityPriority: "important",
      pointer: "auto",
      pointerPriority: "important",
      consumerVisual: "preserved",
      native: false,
    });

  // A canceled show restores the same authored baseline and unrelated custom property.
  await scriptControl(page, "presentation-cancel-show");
  await scriptControl(page, "presentation-open");
  await expect(page.getByTestId("presentation-intent")).toHaveText("true");
  await expect
    .poll(() => presentationStyles(page))
    .toMatchObject({
      opacity: "0.8",
      opacityPriority: "important",
      pointer: "auto",
      pointerPriority: "important",
      consumerVisual: "preserved",
      native: false,
    });
});

/** A JSON record the presentation fixture's render hooks keep on its host. */
async function presentationRecord(page: Page, attribute: string): Promise<unknown> {
  const text = await page.locator("acceptance-popover-presentation").getAttribute(attribute);

  return JSON.parse(text ?? "null");
}

test("V3 V10: Anchor axes changed before the earlyRead of a ready, unrevealed result reveal first with the current axes", async ({
  page,
}, info) => {
  await mountPresentation(page, info);
  // A consumer render hook, running before the owner's hooks in each phase, flips the Anchor's
  // direction in earlyRead while the entering Content is still transparent, and records the
  // presentation in READ at the moment opacity suppression is released.
  await scriptControl(page, "presentation-arm-axes");
  await openPresentation(page);
  await expect.poll(() => presentationRecord(page, "data-first-visible")).not.toBeNull();

  const first = await presentationRecord(page, "data-first-visible");

  if (typeof first !== "object" || first === null) {
    throw new Error("Missing the first visible presentation");
  }

  const frame = new Map(Object.entries(first));
  const left = Number(frame.get("left"));
  const right = Number(frame.get("right"));
  const anchorLeft = Number(frame.get("anchorLeft"));
  const anchorRight = Number(frame.get("anchorRight"));

  // Unequal widths make start alignment differ between LTR and RTL.
  expect(Math.abs(right - left - (anchorRight - anchorLeft))).toBeGreaterThan(8);

  // block-end/start with gap 8: the first visible Content aligns with the inline start the
  // Anchor had at that moment, its left edge in LTR and its right edge in RTL.
  let startError = Math.abs(left - anchorLeft);

  if (frame.get("anchorDirection") === "rtl") {
    startError = Math.abs(right - anchorRight);
  }

  expect(startError).toBeLessThanOrEqual(2);
  expect(
    Math.abs(Number(frame.get("top")) - Number(frame.get("anchorBottom")) - 8),
  ).toBeLessThanOrEqual(2);
  // Every change landed on an entering, transparent, natively open Content before that reveal.
  expect(await presentationRecord(page, "data-axes-changes")).toEqual([
    { direction: "rtl", native: true },
    { direction: "ltr", native: true },
    { direction: "rtl", native: true },
  ]);
  expect(frame.get("anchorDirection")).toBe("rtl");
  await expect(page.getByTestId("presentation-intent")).toHaveText("true");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const content = document.querySelector('[data-testid="presentation-content"]');
        const anchor = document.querySelector('[data-testid="presentation-trigger"]');

        if (content === null || anchor === null) {
          throw new Error("Missing presentation geometry hosts");
        }

        return Math.abs(
          content.getBoundingClientRect().right - anchor.getBoundingClientRect().right,
        );
      }),
    )
    .toBeLessThanOrEqual(2);
});

for (const [callback, arm, intent, calls] of [
  ["show", "presentation-cancel-show", "true", "presentation-shows"],
  ["focus", "presentation-arm-focus-close", "false", "presentation-focuses"],
] as const) {
  test(`V10 V11: a DOM-only consumer opacity/pointer-events write in the ${callback} callback survives override release with no binding update`, async ({
    page,
  }, info) => {
    await mountPresentation(page, info);
    // Canceled show, or autofocus closing synchronously: preparation is released without
    // another preparation recapturing the consumer's write.
    await scriptControl(page, arm);
    await scriptControl(page, `presentation-arm-${callback}-dom-only`);
    await scriptControl(page, "presentation-open");
    await expect(page.getByTestId("presentation-intent")).toHaveText(intent);

    const consumer = {
      opacity: "0.3",
      opacityPriority: "",
      pointer: "auto",
      pointerPriority: "",
      native: false,
    };

    // Captured by a microtask the callback queued: after the native call and its cleanup returned.
    await expect(page.getByTestId("presentation-cleanup-capture")).not.toHaveText("");
    expect(await callbackCapture(page, "presentation-cleanup-capture")).toEqual(consumer);
    // No binding or signal changed, so no later Angular binding write could repair an overwrite.
    await expect(page.getByTestId("presentation-bound-opacity")).toHaveText("0.8");
    await expect(page.getByTestId("presentation-bound-pointer")).toHaveText("");
    await expect(page.getByTestId(calls)).toHaveText("1");
    await scriptControl(page, "presentation-close");
    await expect(page.getByTestId("presentation-intent")).toHaveText("false");
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        }),
    );
    expect(await presentationStyles(page)).toMatchObject({
      opacity: "0.3",
      opacityPriority: "",
      pointer: "auto",
      pointerPriority: "",
      consumerVisual: "preserved",
      native: false,
    });
  });
}

async function latePointerJournal(page: Page): Promise<Record<string, unknown>[]> {
  const text = await page.getByTestId("late-pointer-journal").textContent();
  const value: unknown = JSON.parse(text ?? "");

  if (!Array.isArray(value)) {
    throw new Error("Late pointer journal must be an array");
  }

  const entries: Record<string, unknown>[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("Late pointer journal entries must be objects");
    }

    entries.push({ ...entry });
  }

  return entries;
}

for (const [mode, label] of [
  ["target-drag", "target"],
  ["window-drag", "later window"],
] as const) {
  test(`V6: a ${label}-prevented native dragstart does not suppress the valid outside pointer pair`, async ({
    page,
  }, info) => {
    await fixture(page, "popover", info);
    await page.getByTestId("late-pointer-enable").click();
    await page.getByTestId(`late-pointer-mount-${mode}`).click();
    await expect(page.getByTestId("late-pointer-ready")).toHaveText("true");
    await expect
      .poll(() =>
        page
          .getByTestId("late-pointer-content")
          .evaluate(
            (node) => node.matches(":popover-open") && getComputedStyle(node).opacity !== "0",
          ),
      )
      .toBe(true);
    await expect(page.getByTestId("late-pointer-outputs")).toHaveText("[]");

    const start = (await latePointerJournal(page)).length;

    await page
      .getByTestId("late-pointer-drag-source")
      .dragTo(page.getByTestId("late-pointer-drop-target"));
    await expect
      .poll(async () => {
        let finalUps = 0;

        for (const entry of (await latePointerJournal(page)).slice(start)) {
          if (entry["stage"] === "after-task" && entry["type"] === "pointerup") {
            finalUps += 1;
          }
        }

        return finalUps;
      })
      .toBe(1);

    const entries = (await latePointerJournal(page)).slice(start);
    const downs: Record<string, unknown>[] = [];
    const ups: Record<string, unknown>[] = [];
    let finalStart: Record<string, unknown> | null = null;

    for (const entry of entries) {
      if (entry["stage"] === "document" && entry["type"] === "pointerdown") {
        downs.push(entry);
      }

      if (entry["stage"] === "document" && entry["type"] === "pointerup") {
        ups.push(entry);
      }

      if (entry["stage"] === "after-task" && entry["type"] === "dragstart") {
        finalStart = entry;
      }
    }

    await info.attach("prevented-drag-journal", {
      body: JSON.stringify(entries, null, 2),
      contentType: "application/json",
    });
    // The genuine dragstart was finally prevented, so no drag operation took over the gesture.
    expect(finalStart).toMatchObject({ trusted: true, phase: 0, prevented: true });
    expect(downs).toHaveLength(1);
    expect(ups).toHaveLength(1);
    expect(downs[0]).toMatchObject({
      trusted: true,
      primary: true,
      button: 0,
      target: "late-pointer-drag-source",
    });
    expect(ups[0]).toMatchObject({ trusted: true, primary: true, button: 0 });
    expect(downs[0]?.["id"]).toBe(ups[0]?.["id"]);
    // A valid outside down/up pair still dismisses exactly once.
    await expect(page.getByTestId("late-pointer-intent")).toHaveText("false");
    await expect(page.getByTestId("late-pointer-outputs")).toHaveText("[false]");
  });
}
