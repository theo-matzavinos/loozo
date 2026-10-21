import { test, expect, type ErrorRecord } from "./contract-test.js";
import type { Locator, Page, TestInfo } from "playwright/test";
import { fixture } from "./observation.js";
import { expectPreferred } from "./geometry.js";
import {
  sharedOwnerCase,
  tooltipOutsideFieldCase,
  withoutStaticCase,
} from "./co-applied-description.js";

declare global {
  interface Window {
    tooltipDocumentListeners: Record<string, number>;
    tooltipDocumentListenersAdded: Record<string, number>;
    labelProbe: {
      events: string[];
      task: number;
      shows: number;
      samples: { when: string; shown: boolean }[];
    };
  }
}

type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };

/** A script action on a fixture control; never a trusted pointer gesture, so no hover or outside press. */
async function script(page: Page, id: string): Promise<void> {
  await page.getByTestId(id).evaluate((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      throw new Error("Expected a fixture control button");
    }

    node.click();
  });
}

function native(locator: Locator): Promise<boolean> {
  return locator.evaluate((node) => node.matches(":popover-open"));
}

/** Shown and participating: natively open and not inert. */
async function expectShown(content: Locator): Promise<void> {
  await expect.poll(() => native(content)).toBe(true);
  await expect(content).not.toHaveAttribute("inert");
}

/** Hidden: not natively open (after any retained exit) and inert. */
async function expectHidden(content: Locator): Promise<void> {
  await expect.poll(() => native(content)).toBe(false);
  await expect(content).toHaveAttribute("inert", "");
}

/** A page-side wait, for claims that something does not happen within `ms`; not evidence of a positive. */
async function elapse(page: Page, ms: number): Promise<void> {
  await page.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), ms);
}

/**
 * Waits out the delay group's 300 ms warm window after a hover- or focus-opened Tooltip closed, so
 * the next hover open waits for its delay.
 */
async function cool(page: Page): Promise<void> {
  await elapse(page, 350);
}

/** A wrong write would render only after the zoneless scheduler's next turn. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))),
  );
}

async function box(locator: Locator): Promise<Box> {
  const measured = await locator.boundingBox();

  if (measured === null) {
    throw new Error("Expected a rendered box");
  }

  return measured;
}

function center(measured: Box): Point {
  return { x: measured.x + measured.width / 2, y: measured.y + measured.height / 2 };
}

/** Centers a case in the viewport so its Content has room on every side. */
async function stage(locator: Locator): Promise<void> {
  await locator.evaluate((node) => node.scrollIntoView({ block: "center", inline: "center" }));
}

/** Parks the pointer on a corner of the viewport, outside every case. */
async function away(page: Page): Promise<void> {
  await page.mouse.move(2, 2);
}

/** Keyboard focus: focus the element before `target` by script, then Tab onto it. */
async function tabTo(page: Page, before: Locator, target: Locator): Promise<void> {
  await before.focus();
  await page.keyboard.press("Tab");
  await expect(target).toBeFocused();
}

/** Chromium's native accessibility tree, through the DevTools protocol. */
async function chromiumDescription(page: Page, testid: string): Promise<string | undefined> {
  const session = await page.context().newCDPSession(page);

  try {
    await session.send("Accessibility.enable");

    const document = await session.send("DOM.getDocument");
    const { nodeId } = await session.send("DOM.querySelector", {
      nodeId: document.root.nodeId,
      selector: `[data-testid="${testid}"]`,
    });
    const { nodes } = await session.send("Accessibility.getPartialAXTree", {
      nodeId,
      fetchRelatives: false,
    });

    for (const node of nodes) {
      if (!node.ignored) {
        const description = node.description?.value;

        if (typeof description === "string") {
          return description;
        }

        return undefined;
      }
    }

    return undefined;
  } finally {
    await session.detach();
  }
}

/** Counts `document` listeners and their additions per event type; installed before bootstrap, it only records. */
async function countDocumentListeners(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    const listeners = new Map<string, Set<unknown>>();

    window.tooltipDocumentListeners = {};
    window.tooltipDocumentListenersAdded = {};
    document.addEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      const ofType = listeners.get(type) ?? new Set<unknown>();

      ofType.add(listener);
      listeners.set(type, ofType);
      window.tooltipDocumentListeners[type] = ofType.size;
      window.tooltipDocumentListenersAdded[type] =
        (window.tooltipDocumentListenersAdded[type] ?? 0) + 1;
      add(type, listener, options);
    };
    document.removeEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      const ofType = listeners.get(type);

      if (ofType !== undefined) {
        ofType.delete(listener);
        window.tooltipDocumentListeners[type] = ofType.size;
      }

      remove(type, listener, options);
    };
  });
}

function documentListeners(page: Page, type: string): Promise<number> {
  return page.evaluate((recorded) => window.tooltipDocumentListeners[recorded] ?? 0, type);
}

/** Every `document` listener addition so far, per type, including ones already removed. */
function documentListenerAdditions(page: Page, types: readonly string[]): Promise<number[]> {
  return page.evaluate((recorded) => {
    const additions: number[] = [];

    for (const type of recorded) {
      additions.push(window.tooltipDocumentListenersAdded[type] ?? 0);
    }

    return additions;
  }, types);
}

function consoleMessage(record: ErrorRecord, message: string): boolean {
  if (record.source !== "console") {
    return false;
  }

  for (const argument of record.arguments ?? []) {
    if (
      typeof argument === "object" &&
      argument !== null &&
      "message" in argument &&
      argument.message === message
    ) {
      return true;
    }
  }

  return false;
}

test("N1: the Trigger is described by mounted Content, open or closed, replacing its static value, which returns without Content; closed inert Content still describes it", async ({
  page,
  browserName,
}, info) => {
  await fixture(page, "tooltip", info);

  const trigger = page.getByTestId("describe-trigger");
  const content = page.getByTestId("describe-content");
  const description = "Switch between light and dark";

  // Closed: the static `aria-describedby` is replaced by the registered Content's ID.
  await expect(trigger).toHaveAttribute("aria-describedby", "describe-content-a");
  await expect(content).toHaveAttribute("id", "describe-content-a");
  await expect(content).toHaveAttribute("role", "tooltip");
  await expect(content).toHaveAttribute("popover", "manual");
  await expect(content).toHaveAttribute("inert", "");
  await expect(content).toHaveText(description);
  expect(await native(content)).toBe(false);
  await expect(trigger).toHaveAccessibleName("Theme");
  await expect(trigger).toHaveAccessibleDescription(description);

  if (browserName === "chromium") {
    expect(await chromiumDescription(page, "describe-trigger")).toBe(description);
  }

  // Open, then closed again: the description never depends on presentation.
  await script(page, "describe-toggle");
  await expect(page.getByTestId("describe-open")).toHaveText("true");
  await expectShown(content);
  await expect(trigger).toHaveAccessibleDescription(description);

  if (browserName === "chromium") {
    expect(await chromiumDescription(page, "describe-trigger")).toBe(description);
  }

  await script(page, "describe-toggle");
  await expectHidden(content);
  await expect(trigger).toHaveAccessibleDescription(description);

  if (browserName === "chromium") {
    expect(await chromiumDescription(page, "describe-trigger")).toBe(description);
  }

  // The association follows the effective ID and names mounted Content only.
  await script(page, "describe-rename");
  await expect(content).toHaveAttribute("id", "describe-content-b");
  await expect(trigger).toHaveAttribute("aria-describedby", "describe-content-b");
  await script(page, "describe-mount");
  await expect(content).toHaveCount(0);
  // Without Content nothing names an ID: the static value returns.
  await expect(trigger).toHaveAttribute("aria-describedby", "static-note");
  await expect(trigger).toHaveAccessibleDescription("Static note named only without Content");
  await script(page, "describe-mount");
  await expect(trigger).toHaveAttribute("aria-describedby", "describe-content-b");
  await expect(trigger).toHaveAccessibleDescription(description);

  // A consumer's static role overrides the default.
  await expect(page.getByTestId("role-content")).toHaveAttribute("role", "status");
  await expect(page.getByTestId("role-trigger")).toHaveAccessibleDescription("Consumer role");
});

type JournalEntry = { kind: string; at: number; event: string };

async function hoverJournal(page: Page): Promise<JournalEntry[]> {
  const text = await page.getByTestId("hover-journal").textContent();

  return JSON.parse(text ?? "[]");
}

test("N2: mouse hover opens after openDelay, once; leaving first cancels; a pending open expiring while disabled does nothing; 0 opens in the entering event", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);

  const trigger = page.getByTestId("hover-trigger");
  const content = page.getByTestId("hover-content");
  const intent = page.getByTestId("hover-intent");

  await stage(trigger);
  await away(page);

  const point = center(await box(trigger));

  // Not open before the delay, open after it, once, from the timer.
  await page.mouse.move(point.x, point.y);
  await expect(intent).toHaveText("true");
  await expectShown(content);

  let journal = await hoverJournal(page);

  expect(journal.map((entry) => entry.kind)).toEqual(["enter", "change:true"]);
  expect(journal[1].at - journal[0].at).toBeGreaterThanOrEqual(200 - 2);
  expect(journal[1].event).toBe("none");

  // Leaving closes the hover-opened Tooltip.
  await away(page);
  await expect(intent).toHaveText("false");
  await cool(page);

  // The steps before a delay expires take a few round trips, which a loaded host can stretch past
  // 200 ms: give them the 1000 ms delay.
  await script(page, "hover-delay-slow");

  // Entering and leaving before the delay cancels it.
  await page.mouse.move(point.x, point.y);
  await away(page);
  await elapse(page, 1300);
  journal = await hoverJournal(page);
  expect(journal.map((entry) => entry.kind)).toEqual([
    "enter",
    "change:true",
    "change:false",
    "enter",
  ]);
  await expect(intent).toHaveText("false");

  // A pending open that expires while the root is disabled does nothing.
  await page.mouse.move(point.x, point.y);
  await script(page, "hover-disable");
  await elapse(page, 1300);
  await expect(intent).toHaveText("false");

  // Disabled and enabled again before a pending open expires: the open happens at expiry.
  await script(page, "hover-disable");
  await away(page);
  await page.mouse.move(point.x, point.y);
  await script(page, "hover-disable");
  await script(page, "hover-disable");
  await expect(intent).toHaveText("true");
  await away(page);
  await expect(intent).toHaveText("false");

  // An observed close cancels a pending open: the application opens it during the slow delay and
  // Escape closes it before the delay expires.
  await page.mouse.move(point.x, point.y);
  await script(page, "hover-open");
  await expectShown(content);
  await page.keyboard.press("Escape");
  await expect(intent).toHaveText("false");
  await elapse(page, 1300);
  await expect(intent).toHaveText("false");

  // Opened by the application after hover opened it earlier, a leave doesn't close it.
  await script(page, "hover-open");
  await expectShown(content);
  await away(page);
  await elapse(page, 200);
  await expect(intent).toHaveText("true");
  await page.keyboard.press("Escape");
  await expect(intent).toHaveText("false");

  // Delay 0 opens in the entering event itself.
  await script(page, "hover-delay-zero");
  await page.mouse.move(point.x, point.y);
  await expect(intent).toHaveText("true");
  journal = await hoverJournal(page);

  // The consumer's own pointerenter listener may run after the Trigger's.
  const opened = journal.filter((entry) => entry.kind === "change:true");

  expect(opened.at(-1)?.event).toBe("pointerenter");
  await away(page);
  await expect(intent).toHaveText("false");
});

test("N2: a pen behaves as a mouse (synthetic handler check); Escape closes it", async ({
  page,
}, info) => {
  info.annotations.push({
    type: "handler-check",
    description:
      "Playwright has no trusted pen input in every engine; pen pointerenter is synthetic",
  });
  await fixture(page, "tooltip", info);

  const trigger = page.getByTestId("hover-trigger");

  await script(page, "hover-delay-zero");
  await trigger.evaluate((node) => {
    const bounds = node.getBoundingClientRect();

    node.dispatchEvent(
      new PointerEvent("pointerenter", {
        pointerType: "pen",
        clientX: bounds.left + 4,
        clientY: bounds.top + 4,
      }),
    );
  });
  await expect(page.getByTestId("hover-intent")).toHaveText("true");
  await expectShown(page.getByTestId("hover-content"));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("hover-intent")).toHaveText("false");
});

test.describe("touch", () => {
  test.use({ hasTouch: true });

  test("N2: touch never opens a Tooltip; a touch press closes an open one", async ({
    page,
  }, info) => {
    await fixture(page, "tooltip", info);

    const trigger = page.getByTestId("hover-trigger");
    const intent = page.getByTestId("hover-intent");

    // With no delay, a touch enter that opened would show in the journal even if the press
    // closed it at once.
    await script(page, "hover-delay-zero");
    await stage(trigger);

    const point = center(await box(trigger));

    await page.touchscreen.tap(point.x, point.y);
    await elapse(page, 400);
    await expect(intent).toHaveText("false");
    await script(page, "hover-open");
    await expectShown(page.getByTestId("hover-content"));
    await page.touchscreen.tap(point.x, point.y);
    await expect(intent).toHaveText("false");

    const journal = await hoverJournal(page);
    const changes = journal.filter((entry) => entry.kind.startsWith("change:"));

    // The application's write emits nothing; the press emits one close.
    expect(changes.map((entry) => entry.kind)).toEqual(["change:false"]);
  });

  test("N4: a touch tap focuses a Trigger without opening it, also an <input> Trigger, which matches :focus-visible on that focus; a later keyboard focus opens", async ({
    page,
  }, info) => {
    await fixture(page, "tooltip", info);

    const trigger = page.getByTestId("focus-trigger");
    const input = page.getByTestId("focus-input");

    await stage(trigger);

    // A tap sends its compatibility mousedown just before the focus it causes, so that focus
    // doesn't open. Any open, even one the click closed in the same turn, would count.
    for (const target of [trigger, input]) {
      const point = center(await box(target));

      await page.touchscreen.tap(point.x, point.y);
      await expect(target).toBeFocused();
      await elapse(page, 500);
      await expect(page.getByTestId("focus-open")).toHaveText("false");
      await expect(page.getByTestId("input-tip-open")).toHaveText("false");
    }

    await expect(page.getByTestId("focus-changes")).toHaveText("0");

    // A later keyboard focus onto the input opens. Forward first: WebKit's Shift+Tab doesn't
    // leave an element a pointer focused.
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("focus-after")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(input).toBeFocused();
    await expect(page.getByTestId("input-tip-open")).toHaveText("true");
  });

  test("N4: a touch drag on a touch-action: none Trigger sends no mousedown, so a later keyboard focus opens; a Tooltip never adds a document pointerup, pointercancel or keydown listener", async ({
    page,
  }, info) => {
    await countDocumentListeners(page);
    await fixture(page, "tooltip", info);

    const trigger = page.getByTestId("focus-trigger");
    const open = page.getByTestId("focus-open");
    const types = ["pointerup", "pointercancel", "keydown"];
    const baseline = await documentListenerAdditions(page, types);

    await stage(trigger);
    await trigger.evaluate((node) => {
      node.style.touchAction = "none";
    });

    // No pointercancel (nothing to pan) and no tap: a touch pointerup on the Trigger without a
    // mousedown, focus or click.
    if (info.project.use.browserName === "chromium") {
      const session = await page.context().newCDPSession(page);
      const point = center(await box(trigger));

      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });

      for (let step = 1; step <= 5; step++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: point.x + step * 40, y: point.y }],
        });
      }

      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      info.annotations.push({
        type: "handler-check",
        description:
          "Playwright has no dragged trusted touch in Firefox or WebKit; the drag's touch pointerdown and pointerup are synthetic",
      });
      await trigger.evaluate((node) => {
        for (const type of ["pointerdown", "pointerup"]) {
          node.dispatchEvent(
            new PointerEvent(type, {
              pointerType: "touch",
              pointerId: 7,
              isPrimary: true,
              bubbles: true,
            }),
          );
        }
      });
    }

    await expect(trigger).not.toBeFocused();
    await tabTo(page, page.getByTestId("focus-before"), trigger);
    await expect(open).toHaveText("true");
    await page.keyboard.press("Shift+Tab");
    await expect(open).toHaveText("false");

    // A tap and a mouse press held on the Trigger.
    const point = center(await box(trigger));

    await page.touchscreen.tap(point.x, point.y);
    await expect(trigger).toBeFocused();
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    expect(await documentListenerAdditions(page, types)).toEqual(baseline);
    await page.mouse.up();
    await away(page);
    await expect(open).toHaveText("false");
    expect(await documentListenerAdditions(page, types)).toEqual(baseline);
  });
});

test("N2: an invalid effective openDelay throws RangeError when a hover open is scheduled", async ({
  page,
  runtimeErrors,
  drainIssues,
}, info) => {
  const message = "Tooltip open delay must be finite and nonnegative (milliseconds).";

  runtimeErrors.expectExactly([
    { description: "RangeError for -1", matches: (record) => consoleMessage(record, message) },
    { description: "RangeError for NaN", matches: (record) => consoleMessage(record, message) },
  ]);
  await fixture(page, "tooltip", info);

  const trigger = page.getByTestId("hover-trigger");

  await stage(trigger);
  await away(page);

  const point = center(await box(trigger));

  await script(page, "hover-delay-invalid");
  await page.mouse.move(point.x, point.y);
  await expect
    .poll(async () => {
      await drainIssues();

      return runtimeErrors.records.length;
    })
    .toBe(1);
  await away(page);
  await script(page, "hover-delay-nan");
  await page.mouse.move(point.x, point.y);
  await expect
    .poll(async () => {
      await drainIssues();

      return runtimeErrors.records.length;
    })
    .toBe(2);
  await expect(page.getByTestId("hover-intent")).toHaveText("false");
});

/** The point `distance` px past `from`'s edge, moving from `from`'s center directly away from `toward`. */
function awayFrom(from: Box, toward: Box, distance: number): Point {
  const start = center(from);
  const target = center(toward);
  const dx = start.x - target.x;
  const dy = start.y - target.y;
  const length = Math.hypot(dx, dy);
  const reach = Math.max(from.width, from.height) / 2 + distance;

  return { x: start.x + (dx / length) * reach, y: start.y + (dy / length) * reach };
}

function inside(measured: Box, point: Point): boolean {
  return (
    point.x >= measured.x &&
    point.x <= measured.x + measured.width &&
    point.y >= measured.y &&
    point.y <= measured.y + measured.height
  );
}

/** The middle of the gap the center-to-center segment crosses between the two boxes. */
function gapPoint(from: Box, to: Box): Point {
  const start = center(from);
  const end = center(to);
  let exit = 0;
  let entry = 1;

  for (let step = 0; step <= 200; step += 1) {
    const t = step / 200;
    const point = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };

    if (inside(from, point)) {
      exit = t;
    }

    if (inside(to, point) && t < entry) {
      entry = t;
    }
  }

  const middle = (exit + entry) / 2;

  return { x: start.x + (end.x - start.x) * middle, y: start.y + (end.y - start.y) * middle };
}

/** The corner of `measured`, inset by `inset`, farthest from `from`. */
function farthestCorner(measured: Box, from: Point, inset: number): Point {
  let farthest: Point = { x: measured.x + inset, y: measured.y + inset };

  for (const corner of [
    { x: measured.x + measured.width - inset, y: measured.y + inset },
    { x: measured.x + inset, y: measured.y + measured.height - inset },
    { x: measured.x + measured.width - inset, y: measured.y + measured.height - inset },
  ]) {
    if (
      Math.hypot(corner.x - from.x, corner.y - from.y) >
      Math.hypot(farthest.x - from.x, farthest.y - from.y)
    ) {
      farthest = corner;
    }
  }

  return farthest;
}

async function graceOpen(page: Page): Promise<{ trigger: Box; content: Box }> {
  const trigger = page.getByTestId("grace-trigger");
  const content = page.getByTestId("grace-content");

  await away(page);
  await expect(page.getByTestId("grace-intent")).toHaveText("false");
  await stage(page.locator('[data-tooltip-case="grace"]'));

  const point = center(await box(trigger));

  await page.mouse.move(point.x, point.y);
  await expect(page.getByTestId("grace-intent")).toHaveText("true");
  await expectShown(content);
  // Wait for the reveal: the coordinates are committed before the grace area is measured.
  await expect
    .poll(async () => await content.evaluate((node) => getComputedStyle(node).opacity))
    .toBe("1");

  return { trigger: await box(trigger), content: await box(content) };
}

for (const [mode, direction] of [
  ["horizontal-tb", "ltr"],
  ["horizontal-tb", "rtl"],
  ["vertical-rl", "ltr"],
] as const) {
  test(`N3: the grace area keeps a hover-opened Tooltip open across the gap on every side, ${mode} ${direction}; leaving it closes; the pointermove listener exists only in transit`, async ({
    page,
  }, info) => {
    await countDocumentListeners(page);
    await fixture(page, "tooltip", info);
    await page.getByTestId("grace-mode").selectOption(mode);
    await page.getByTestId("grace-direction").selectOption(direction);

    const intent = page.getByTestId("grace-intent");
    const baseline = await documentListeners(page, "pointermove");

    for (const side of ["block-start", "block-end", "inline-start", "inline-end"]) {
      await page.getByTestId("grace-side").selectOption(side);

      // Straight from the Trigger's center to Content's: inside the area, landing ends the transit.
      let open = await graceOpen(page);
      let target = center(open.content);

      await page.mouse.move(target.x, target.y, { steps: 12 });
      await expect(intent).toHaveText("true");
      expect(await documentListeners(page, "pointermove")).toBe(baseline);

      // Content → Trigger works the same way.
      target = center(open.trigger);
      await page.mouse.move(target.x, target.y, { steps: 12 });
      await expect(intent).toHaveText("true");
      expect(await documentListeners(page, "pointermove")).toBe(baseline);

      // Leaving Content directly away from the Trigger: the first move outside closes.
      target = center(open.content);
      await page.mouse.move(target.x, target.y, { steps: 12 });

      const leave = awayFrom(open.content, open.trigger, 30);

      await page.mouse.move(leave.x, leave.y);
      await expect(intent).toHaveText("false");
      expect(await documentListeners(page, "pointermove")).toBe(baseline);

      // Diagonally from the Trigger's center to Content's farthest corner.
      open = await graceOpen(page);

      const end = farthestCorner(open.content, center(open.trigger), 3);

      await page.mouse.move(end.x, end.y, { steps: 16 });
      await expect(intent).toHaveText("true");
      expect(await documentListeners(page, "pointermove")).toBe(baseline);

      // Leaving the Trigger directly away from Content closes at once.
      open = await graceOpen(page);

      const back = awayFrom(open.trigger, open.content, 30);

      await page.mouse.move(back.x, back.y);
      await expect(intent).toHaveText("false");
    }

    // A pointer parked inside the area keeps it open; the listener exists only meanwhile.
    await page.getByTestId("grace-side").selectOption("block-start");

    const open = await graceOpen(page);
    const between = gapPoint(open.trigger, open.content);

    await page.mouse.move(between.x, between.y);
    expect(await documentListeners(page, "pointermove")).toBe(baseline + 1);
    await elapse(page, 300);
    await expect(intent).toHaveText("true");

    // Any observed close, here Escape, ends the transit.
    await page.keyboard.press("Escape");
    await expect(intent).toHaveText("false");
    expect(await documentListeners(page, "pointermove")).toBe(baseline);
  });
}

test("N3 N12: removing Content, the Trigger or the root ends a transit; removing the Trigger cancels a pending open", async ({
  page,
}, info) => {
  await countDocumentListeners(page);
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="removal"]'));

  const intent = page.getByTestId("removal-intent");
  const baseline = await documentListeners(page, "pointermove");

  /** Hover-opens the Tooltip, then parks the pointer in the gap: a transit is active. */
  async function inTransit(): Promise<void> {
    await away(page);

    const trigger = page.getByTestId("removal-trigger");
    const content = page.getByTestId("removal-content");
    const point = center(await box(trigger));

    await page.mouse.move(point.x, point.y);
    await expectShown(content);
    await expect
      .poll(async () => await content.evaluate((node) => getComputedStyle(node).opacity))
      .toBe("1");

    const between = gapPoint(await box(trigger), await box(content));

    await page.mouse.move(between.x, between.y);
    expect(await documentListeners(page, "pointermove")).toBe(baseline + 1);
  }

  for (const control of ["removal-content-mount", "removal-trigger-mount", "removal-root"]) {
    await inTransit();
    await script(page, control);
    expect(await documentListeners(page, "pointermove")).toBe(baseline);

    // Removal keeps intent; the remounted parts present it again, and Escape closes it.
    await script(page, control);
    await expect(intent).toHaveText("true");
    await expectShown(page.getByTestId("removal-content"));
    await page.keyboard.press("Escape");
    await expect(intent).toHaveText("false");
  }

  // A pending open doesn't survive its Trigger, even when a replacement Trigger mounts.
  await script(page, "removal-slow");
  await away(page);
  await cool(page);

  const point = center(await box(page.getByTestId("removal-trigger")));

  await page.mouse.move(point.x, point.y);
  await script(page, "removal-trigger-mount");
  await away(page);
  await script(page, "removal-trigger-mount");
  await elapse(page, 1300);
  await expect(intent).toHaveText("false");
});

test("N3: a flipped placement near the viewport edge keeps the grace area; a leave while Content doesn't participate closes at once", async ({
  page,
  runtimeErrors,
  drainIssues,
}, info) => {
  const unsupported = {
    description: "an unsupported writing-mode Error reported through ErrorHandler",
    matches: (record: ErrorRecord) =>
      consoleMessage(record, "Unsupported Tooltip Trigger writing mode: sideways-lr."),
  };

  // One report per attempt: hover-opened, then hover-opened again after a close.
  runtimeErrors.expectExactly([unsupported, unsupported]);
  await fixture(page, "tooltip", info);

  const trigger = page.getByTestId("edge-trigger");
  const content = page.getByTestId("edge-content");
  const intent = page.getByTestId("edge-intent");

  await trigger.evaluate((node) => node.scrollIntoView({ block: "start" }));
  await away(page);

  let point = center(await box(trigger));

  await page.mouse.move(point.x, point.y);
  await expect(intent).toHaveText("true");
  await expectShown(content);
  await expect
    .poll(async () => await content.evaluate((node) => getComputedStyle(node).opacity))
    .toBe("1");

  const triggerBox = await box(trigger);
  const contentBox = await box(content);

  // block-start doesn't fit above the Trigger, so Content flipped below it.
  expect(contentBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height);

  const target = center(contentBox);

  await page.mouse.move(target.x, target.y, { steps: 12 });
  await expect(intent).toHaveText("true");
  await away(page);
  await expect(intent).toHaveText("false");

  // Positioning fails for an unsupported writing mode, so Content doesn't participate.
  await stage(page.locator('[data-tooltip-case="grace"]'));
  await page.getByTestId("grace-mode").selectOption("sideways-lr");

  const grace = page.getByTestId("grace-trigger");

  point = center(await box(grace));
  await page.mouse.move(point.x, point.y);
  await expect(page.getByTestId("grace-intent")).toHaveText("true");
  await expect
    .poll(async () => {
      await drainIssues();

      return runtimeErrors.records.length;
    })
    .toBe(1);
  await expectHidden(page.getByTestId("grace-content"));

  const graceBox = await box(grace);

  // Keyboard focus holds it against a leave, even without shown Content; blur then closes it.
  await tabTo(page, page.getByTestId("hover-open"), grace);
  await page.mouse.move(point.x, graceBox.y - 1);
  await elapse(page, 100);
  await expect(page.getByTestId("grace-intent")).toHaveText("true");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByTestId("grace-intent")).toHaveText("false");

  // Hover-opened again (a new attempt, reported again): one pixel past the Trigger's top edge,
  // where a transit area would be, the leave closes at once.
  await page.mouse.move(point.x, point.y);
  await expect(page.getByTestId("grace-intent")).toHaveText("true");
  await expect
    .poll(async () => {
      await drainIssues();

      return runtimeErrors.records.length;
    })
    .toBe(2);
  await page.mouse.move(point.x, graceBox.y - 1);
  await expect(page.getByTestId("grace-intent")).toHaveText("false");
});

test("N3: a leave between Content's native show and its reveal closes at once, also toward where Content is about to be", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="grace"]'));
  await away(page);

  const trigger = page.getByTestId("grace-trigger");

  info.annotations.push({
    type: "handler-check",
    description:
      "the enter, leave and move are synthetic, so the leave lands after Content's native show and before its reveal",
  });

  // `openDelay` 0 opens inside the enter. The leave comes once Content is natively open and
  // participating but not yet placed, and the move goes inside the hull its unplaced rect would give.
  const leave = await trigger.evaluate(
    (node) =>
      new Promise<{ placed: boolean; offTrigger: boolean }>((resolve) => {
        const content = document.querySelector<HTMLElement>('[data-testid="grace-content"]')!;
        const rect = node.getBoundingClientRect();
        const exit = { x: rect.left + rect.width / 2, y: rect.top };
        const observer = new MutationObserver(() => {
          if (!content.matches(":popover-open")) {
            return;
          }

          observer.disconnect();

          const unplaced = content.getBoundingClientRect();
          // Halfway from the middle of the padded exit points to the unplaced Content's center.
          const toward = {
            x: (exit.x + (unplaced.left + unplaced.right) / 2) / 2,
            y: (exit.y + 5 + (unplaced.top + unplaced.bottom) / 2) / 2,
          };
          const offTrigger = !(
            toward.x >= rect.left &&
            toward.x <= rect.right &&
            toward.y >= rect.top &&
            toward.y <= rect.bottom
          );

          node.dispatchEvent(
            new PointerEvent("pointerleave", {
              pointerType: "mouse",
              clientX: exit.x,
              clientY: exit.y,
            }),
          );
          document.dispatchEvent(
            new PointerEvent("pointermove", {
              pointerType: "mouse",
              clientX: toward.x,
              clientY: toward.y,
              bubbles: true,
            }),
          );
          resolve({ placed: content.style.getPropertyValue("left") !== "", offTrigger });
        });

        observer.observe(content, { attributes: true });
        node.dispatchEvent(
          new PointerEvent("pointerenter", {
            pointerType: "mouse",
            clientX: exit.x,
            clientY: exit.y + 1,
          }),
        );
      }),
  );

  // The leave came before the reveal, and the move point lies outside the Trigger.
  expect(leave).toEqual({ placed: false, offTrigger: true });
  await settle(page);
  await expect(page.getByTestId("grace-intent")).toHaveText("false");
  await expect(page.getByTestId("grace-changes")).toHaveText("2");
  await expectHidden(page.getByTestId("grace-content"));
});

test("N3: reopened during a retained visible exit, a leave toward the still-visible Content at the first moment it participates again keeps the Tooltip open; with reduced motion the leave hides Content at once", async ({
  page,
}, info) => {
  const finite = info.project.metadata.motion === "no-preference";

  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="lifecycle"]'));
  await away(page);

  const trigger = page.getByTestId("life-trigger");
  const content = page.getByTestId("life-content");
  const intent = page.getByTestId("life-intent");
  const point = center(await box(trigger));

  // Hover-opened and revealed, then left: the finite exit, paused, keeps Content visible.
  await page.mouse.move(point.x, point.y);
  await expectShown(content);
  await expect
    .poll(async () => await content.evaluate((node) => getComputedStyle(node).opacity))
    .toBe("1");

  // Pause the 300 ms exit in the page as it starts: on a loaded host, the round trips before a
  // later pause can outlast it.
  if (finite) {
    await content.evaluate((node) => {
      const observer = new MutationObserver(() => {
        if (!node.hasAttribute("data-leaving")) {
          return;
        }

        observer.disconnect();

        for (const animation of node.getAnimations()) {
          animation.pause();
        }
      });

      observer.observe(node, { attributes: true, attributeFilter: ["data-leaving"] });
    });
  }

  await away(page);
  await expect(intent).toHaveText("false");

  // Reduced motion retains no visible exit, so there is nothing to reopen into.
  if (!finite) {
    await expectHidden(content);
    await expect(content).not.toHaveAttribute("data-leaving");

    return;
  }

  await expect(content).toHaveAttribute("data-leaving", "");
  expect(await native(content)).toBe(true);

  info.annotations.push({
    type: "handler-check",
    description:
      "the enter, leave and move are synthetic, so the leave lands at the first moment after the reopen that Content participates again",
  });

  // `openDelay` 0 reopens inside the enter, reusing the visible host. The leave comes in the first
  // observer callback after Content is no longer inert, and the move goes halfway toward Content.
  const leave = await trigger.evaluate(
    (node) =>
      new Promise<{ entering: boolean; offTrigger: boolean }>((resolve) => {
        const content = document.querySelector<HTMLElement>('[data-testid="life-content"]')!;
        const rect = node.getBoundingClientRect();
        const exit = { x: rect.left + rect.width / 2, y: rect.top };
        const observer = new MutationObserver(() => {
          if (content.inert) {
            return;
          }

          observer.disconnect();

          const visible = content.getBoundingClientRect();
          const toward = {
            x: (exit.x + (visible.left + visible.right) / 2) / 2,
            y: (exit.y + 5 + (visible.top + visible.bottom) / 2) / 2,
          };
          const offTrigger = !(
            toward.x >= rect.left &&
            toward.x <= rect.right &&
            toward.y >= rect.top &&
            toward.y <= rect.bottom
          );

          node.dispatchEvent(
            new PointerEvent("pointerleave", {
              pointerType: "mouse",
              clientX: exit.x,
              clientY: exit.y,
            }),
          );
          document.dispatchEvent(
            new PointerEvent("pointermove", {
              pointerType: "mouse",
              clientX: toward.x,
              clientY: toward.y,
              bubbles: true,
            }),
          );
          resolve({ entering: content.hasAttribute("data-entering"), offTrigger });
        });

        observer.observe(content, { attributes: true });
        node.dispatchEvent(
          new PointerEvent("pointerenter", {
            pointerType: "mouse",
            clientX: exit.x,
            clientY: exit.y + 1,
          }),
        );
      }),
  );

  expect(leave.offTrigger).toBe(true);
  info.annotations.push({
    type: "reversal",
    description: `data-entering at the leave: ${leave.entering}`,
  });
  await content.evaluate((node) => {
    for (const animation of node.getAnimations()) {
      animation.play();
    }
  });
  await settle(page);
  await elapse(page, 100);
  await expect(intent).toHaveText("true");
  await expectShown(content);

  // The real pointer's next move, outside the area, ends the transit and closes it.
  await page.mouse.move(3, 3);
  await expect(intent).toHaveText("false");
});

test("N4: keyboard focus opens at once and holds it open; pointer focus never opens; blur closes unless hovered; restored focus after keyboard use opens; opening never moves focus", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);

  const trigger = page.getByTestId("focus-trigger");
  const content = page.getByTestId("focus-content");
  const open = page.getByTestId("focus-open");
  const input = page.getByTestId("focus-input");
  const inputOpen = page.getByTestId("input-tip-open");

  await stage(trigger);
  await away(page);

  // Tab onto a button Trigger opens it without a hover; Tab onward onto the editable Trigger
  // moves the open Tooltip, since blur closes a focus-opened one.
  await tabTo(page, page.getByTestId("focus-before"), trigger);
  await expect(open).toHaveText("true");
  await expectShown(content);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await expect(inputOpen).toHaveText("true");
  await expect(open).toHaveText("false");
  await page.keyboard.press("Tab");
  await expect(inputOpen).toHaveText("false");

  // A click focuses without opening: the press cancels the hover, and its mousedown keeps the
  // focus it causes from opening, also on the editable Trigger, which matches :focus-visible.
  for (const target of [trigger, input]) {
    const point = center(await box(target));

    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await expect(target).toBeFocused();
    await elapse(page, 100);
    await expect(open).toHaveText("false");
    await expect(inputOpen).toHaveText("false");
    await page.mouse.up();
    await expect(target).toBeFocused();
    await elapse(page, 500);
    await expect(open).toHaveText("false");
    await expect(inputOpen).toHaveText("false");
    await away(page);
  }

  // Script focus after pointer use doesn't match :focus-visible, so it doesn't open either.
  const before = center(await box(page.getByTestId("focus-before")));

  await page.mouse.click(before.x, before.y);
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await elapse(page, 100);
  await expect(open).toHaveText("false");
  await away(page);

  // A mousedown that focuses nothing, as a click on a button in Safari, keeps only a focus in its
  // own task from opening: a keyboard focus in a later task opens (synthetic handler check).
  info.annotations.push({
    type: "handler-check",
    description:
      "the mousedown that focuses nothing is a synthetic MouseEvent; every engine Playwright drives focuses a clicked button",
  });
  await page.getByTestId("focus-before").focus();
  await trigger.evaluate((node) =>
    node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
  );
  await elapse(page, 100);
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await expect(open).toHaveText("true");
  await page.keyboard.press("Shift+Tab");
  await expect(open).toHaveText("false");

  // Only the first Trigger focus after a mousedown is the press's: another focus in the same task
  // opens, even without a blur between them (synthetic handler check). Focus is on the button
  // before the Trigger after keyboard use, so the script focus matches :focus-visible.
  info.annotations.push({
    type: "handler-check",
    description:
      "the press's mousedown and its focus are a synthetic MouseEvent and FocusEvent, followed in the same task by script focus after keyboard use",
  });
  await trigger.evaluate((node) => {
    node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    node.dispatchEvent(new FocusEvent("focus"));
    node.focus();
  });
  await expect(trigger).toBeFocused();
  await expect(open).toHaveText("true");
  await page.keyboard.press("Shift+Tab");
  await expect(open).toHaveText("false");

  // The Trigger's click ends the press: a Safari click doesn't focus a button, so a keyboard
  // focus after it in the same task, as replay delivers one, opens (synthetic handler check).
  info.annotations.push({
    type: "handler-check",
    description:
      "the press is a synthetic mousedown and click that focus nothing, followed in the same task by script focus after keyboard use; every engine Playwright drives focuses a clicked button",
  });
  await trigger.evaluate((node) => {
    node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    node.focus();
  });
  await expect(trigger).toBeFocused();
  await expect(open).toHaveText("true");
  await page.keyboard.press("Shift+Tab");
  await expect(open).toHaveText("false");

  // A blur dispatched while the Trigger keeps focus is stale and ignored (synthetic handler check).
  await tabTo(page, page.getByTestId("focus-before"), trigger);
  await expect(open).toHaveText("true");
  info.annotations.push({
    type: "handler-check",
    description: "the stale blur is a synthetic FocusEvent on the still-focused Trigger",
  });
  await trigger.evaluate((node) => node.dispatchEvent(new FocusEvent("blur")));
  await settle(page);
  await expect(open).toHaveText("true");
  await page.keyboard.press("Shift+Tab");
  await expect(open).toHaveText("false");

  // The same inside an open shadow root, where the document reports focus on the shadow host.
  const shadowTrigger = page.getByTestId("shadow-trigger");
  const shadowOpen = page.getByTestId("shadow-open");

  await tabTo(page, page.getByTestId("shadow-before"), shadowTrigger);
  await expect(shadowOpen).toHaveText("true");
  await shadowTrigger.evaluate((node) => node.dispatchEvent(new FocusEvent("blur")));
  await settle(page);
  await expect(shadowOpen).toHaveText("true");
  await page.keyboard.press("Shift+Tab");
  await expect(shadowOpen).toHaveText("false");

  // Tab away while the pointer is over the Trigger keeps it open until the pointer leaves.
  await tabTo(page, page.getByTestId("focus-before"), trigger);
  await expect(open).toHaveText("true");

  const point = center(await box(trigger));

  await page.mouse.move(point.x, point.y);
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByTestId("focus-before")).toBeFocused();
  await settle(page);
  await expect(open).toHaveText("true");
  await away(page);
  await expect(open).toHaveText("false");

  // Focus holds it against leaving Content, and Tab away while the pointer is over Content keeps
  // it open the same way.
  await tabTo(page, page.getByTestId("focus-before"), trigger);
  await expectShown(content);

  const over = center(await box(content));

  await page.mouse.move(over.x, over.y);
  await away(page);
  await elapse(page, 200);
  await expect(open).toHaveText("true");
  await page.mouse.move(over.x, over.y);
  await page.keyboard.press("Shift+Tab");
  await settle(page);
  await expect(open).toHaveText("true");
  await away(page);
  await expect(open).toHaveText("false");

  // A hover-opened Tooltip, then Tab onto its Trigger: focus holds it against a pointer leave,
  // and opening by hover never moved focus.
  await page.getByTestId("focus-before").focus();
  await page.mouse.move(point.x, point.y);
  await expect(open).toHaveText("true");
  await expect(page.getByTestId("focus-before")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await away(page);
  await elapse(page, 400);
  await expect(open).toHaveText("true");
  await page.keyboard.press("Shift+Tab");
  await expect(open).toHaveText("false");

  // Popover's Escape restores focus to a Trigger that is also a Tooltip Trigger: that script
  // focus after keyboard use matches :focus-visible and opens the Tooltip.
  const restore = page.getByTestId("restore-trigger");

  await stage(restore);
  await tabTo(page, page.getByTestId("focus-after"), restore);
  await expect(page.getByTestId("restore-tip-open")).toHaveText("true");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("restore-open")).toHaveText("true");
  await expect(page.getByTestId("restore-tip-open")).toHaveText("false");
  await expectShown(page.getByTestId("restore-content"));
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("restore-item")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("restore-open")).toHaveText("false");
  await expect(restore).toBeFocused();
  await expect(page.getByTestId("restore-tip-open")).toHaveText("true");
  await expectShown(page.getByTestId("restore-tip-content"));
});

test("N4: clicking the <label> of an <input> Trigger focuses it without a mousedown on it: in Chromium and Firefox openChange emits true, then false, and nothing is shown; in WebKit the click comes first and the focus opens it until blur", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);

  // Engine-specific, as documented: WebKit's label activation clicks the input, then focuses it;
  // Chromium and Firefox focus it, then click it.
  const clickFirst = info.project.use.browserName === "webkit";
  const journal = page.getByTestId("label-journal");
  const cases = [
    {
      name: "for",
      label: page.getByTestId("label-for"),
      input: "label-for-input",
      content: page.getByTestId("label-for-content"),
    },
    {
      name: "wrap",
      label: page.getByTestId("label-wrap"),
      input: "label-wrap-input",
      content: page.getByTestId("label-wrap-content"),
    },
  ];

  await stage(page.getByTestId("label-for"));

  for (const { name, label, input, content } of cases) {
    const trigger = page.getByTestId(input);

    await page.getByTestId("focus-after").focus();

    // Records the input's events and the task they run in, every showPopover call on Content,
    // and whether Content is shown (top layer or present) on every mutation and frame.
    await trigger.evaluate((node) => {
      const hint = node.closest("[ogtooltip]")?.querySelector("[ogtooltipcontent]");

      if (!(hint instanceof HTMLElement)) {
        throw new Error("Expected the Trigger's Content");
      }

      const probe: Window["labelProbe"] = { events: [], task: 0, shows: 0, samples: [] };
      const show = hint.showPopover.bind(hint);
      const sample = (when: string) => {
        const shown = hint.matches(":popover-open") || hint.hasAttribute("data-present");

        probe.samples.push({ when, shown });
      };

      window.labelProbe = probe;
      hint.showPopover = (...rest: Parameters<HTMLElement["showPopover"]>) => {
        probe.shows += 1;
        show(...rest);
      };

      for (const type of ["mousedown", "focus", "click"]) {
        node.addEventListener(type, () => {
          probe.events.push(`${type}@${probe.task}`);
          setTimeout(() => (probe.task += 1));
        });
      }

      new MutationObserver(() => sample("mutation")).observe(hint, { attributes: true });

      const frame = () => {
        if (window.labelProbe !== probe) {
          return;
        }

        sample("frame");
        requestAnimationFrame(frame);
      };

      requestAnimationFrame(frame);
    });

    const bounds = await box(label);

    // The label's text, never the input: a wrapping label's own text is at its start.
    await page.mouse.click(bounds.x + 4, bounds.y + bounds.height / 2);
    await expect(trigger).toBeFocused();
    await elapse(page, 500);

    const probe = await page.evaluate(() => window.labelProbe);
    let firstShown = -1;
    let hiddenAfterShown = 0;
    let shownFrames = 0;

    for (const [index, { when, shown }] of probe.samples.entries()) {
      if (shown && firstShown === -1) {
        firstShown = index;
      }

      if (!shown && firstShown !== -1) {
        hiddenAfterShown += 1;
      }

      if (shown && when === "frame") {
        shownFrames += 1;
      }
    }

    // No mousedown reaches the input, and both events run in one task.
    if (clickFirst) {
      expect(probe.events).toEqual(["click@0", "focus@0"]);
      expect(probe.shows).toBe(1);
      expect(shownFrames).toBeGreaterThan(0);
      expect(hiddenAfterShown).toBe(0);
      await expect(journal).toHaveText(new RegExp(`${name}:true;$`));
      await expectShown(content);
    } else {
      expect(probe.events).toEqual(["focus@0", "click@0"]);
      expect(probe.shows).toBe(0);
      expect(firstShown).toBe(-1);
      await expect(journal).toHaveText(new RegExp(`${name}:true;${name}:false;$`));
      await expectHidden(content);
    }
  }

  // WebKit's open Tooltip closes on blur.
  await page.getByTestId("focus-after").focus();
  await expect(journal).toHaveText("for:true;for:false;wrap:true;wrap:false;");
});

async function escapeJournal(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        document.body.dataset.lastEscapePrevented = String(event.defaultPrevented);
      }
    });
  });
}

function lastEscapePrevented(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.body.dataset.lastEscapePrevented);
}

test("N5: pointerdown, click, Enter and Space close at once and nothing reopens without a new edge; Escape closes, is consumed and keeps focus; leave and blur don't close an application-opened Tooltip", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);
  await escapeJournal(page);

  const trigger = page.getByTestId("activation-trigger");
  const open = page.getByTestId("activation-open");
  const changes = page.getByTestId("activation-changes");

  await stage(trigger);
  await away(page);

  const point = center(await box(trigger));

  // pointerdown closes at once; still hovered, it stays closed.
  await page.mouse.move(point.x, point.y);
  await expect(open).toHaveText("true");
  await page.mouse.down();
  await expect(open).toHaveText("false");
  await page.mouse.up();
  await elapse(page, 200);
  await expect(open).toHaveText("false");
  await expect(changes).toHaveText("2");

  // Leave and re-enter opens it again; a click closes it once.
  await away(page);
  await page.mouse.move(point.x, point.y);
  await expect(open).toHaveText("true");
  await page.mouse.click(point.x, point.y);
  await expect(open).toHaveText("false");
  await elapse(page, 200);
  await expect(changes).toHaveText("4");

  // Keyboard focus opens it; Enter closes it; blur and refocus opens it; Space closes it.
  await away(page);
  await tabTo(page, page.getByTestId("activation-field"), trigger);
  await expect(open).toHaveText("true");
  await page.keyboard.press("Enter");
  await expect(open).toHaveText("false");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await expect(open).toHaveText("true");
  await page.keyboard.press("Space");
  await expect(open).toHaveText("false");
  await expect(changes).toHaveText("8");

  // Escape while hover-opened with focus in an unrelated field: closes, is consumed, focus stays.
  const field = page.getByTestId("activation-field");

  await field.focus();
  await page.mouse.move(point.x, point.y);
  await expect(open).toHaveText("true");
  await expectShown(page.getByTestId("activation-content"));
  await page.keyboard.press("Escape");
  await expect(open).toHaveText("false");
  expect(await lastEscapePrevented(page)).toBe("true");
  await expect(field).toBeFocused();

  // An already-prevented Escape and a composing one are ignored.
  await away(page);
  await page.mouse.move(point.x, point.y);
  await expect(open).toHaveText("true");
  await expectShown(page.getByTestId("activation-content"));
  await script(page, "activation-prevent-escape");
  await page.keyboard.press("Escape");
  await settle(page);
  await expect(open).toHaveText("true");
  await script(page, "activation-prevent-escape");
  info.annotations.push({
    type: "handler-check",
    description: "the composing Escape is a synthetic keydown; IME composition isn't driven",
  });
  await field.evaluate((node) => {
    node.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true }),
    );
  });
  await settle(page);
  await expect(open).toHaveText("true");
  await page.keyboard.press("Escape");
  await expect(open).toHaveText("false");

  // An application-opened Tooltip survives hover and blur; a click closes it with one output.
  const app = page.getByTestId("app-trigger");
  const appIntent = page.getByTestId("app-intent");
  const appPoint = center(await box(app));

  await away(page);
  await script(page, "app-open");
  await expectShown(page.getByTestId("app-content"));
  await page.mouse.move(appPoint.x, appPoint.y);
  await away(page);
  await elapse(page, 200);
  await expect(appIntent).toHaveText("true");
  await tabTo(page, trigger, app);
  await page.keyboard.press("Shift+Tab");
  await settle(page);
  await expect(appIntent).toHaveText("true");
  await expect(page.getByTestId("app-changes")).toHaveText("0");
  await page.mouse.click(appPoint.x, appPoint.y);
  await expect(appIntent).toHaveText("false");
  await elapse(page, 200);
  await expect(page.getByTestId("app-changes")).toHaveText("1");
});

/** Button-owned disabled attributes, whatever else is on the element. */
async function disabledAttributes(button: Locator) {
  return button.evaluate((node) => ({
    disabled: node.hasAttribute("disabled"),
    ariaDisabled: node.getAttribute("aria-disabled"),
    dataDisabled: node.getAttribute("data-disabled"),
    type: node.getAttribute("type"),
  }));
}

test("N6: a disabled root and a natively disabled Trigger never open by intent, external writes still do; a focusable disabled button opens; co-applied button primitives keep their own disabled semantics", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);
  await away(page);

  // Root disabled: hover and focus don't open; an external write does.
  const rootTrigger = page.getByTestId("root-disabled-trigger");

  await stage(rootTrigger);

  let point = center(await box(rootTrigger));

  await page.mouse.move(point.x, point.y);
  await rootTrigger.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(rootTrigger).toBeFocused();
  await elapse(page, 200);
  await expect(page.getByTestId("root-disabled-intent")).toHaveText("false");
  await script(page, "root-disabled-open");
  await expectShown(page.getByTestId("root-disabled-content"));
  await away(page);

  // A natively disabled Trigger never opens by hover.
  const nativeTrigger = page.getByTestId("native-disabled-trigger");

  point = center(await box(nativeTrigger));
  await page.mouse.move(point.x, point.y);
  await elapse(page, 200);
  await expect(page.getByTestId("native-disabled-intent")).toHaveText("false");
  await away(page);

  // ogButton disabled with focusableWhenDisabled: hover and keyboard focus open it.
  const focusable = page.getByTestId("focusable-disabled-trigger");

  expect(await disabledAttributes(focusable)).toEqual({
    disabled: false,
    ariaDisabled: "true",
    dataDisabled: "",
    type: "button",
  });
  point = center(await box(focusable));
  await page.mouse.move(point.x, point.y);
  await expect(page.getByTestId("focusable-disabled-intent")).toHaveText("true");
  await away(page);
  await expect(page.getByTestId("focusable-disabled-intent")).toHaveText("false");
  await tabTo(page, nativeTrigger.locator("xpath=preceding::button[1]"), focusable);
  await expect(page.getByTestId("focusable-disabled-intent")).toHaveText("true");
  await page.keyboard.press("Shift+Tab");

  // Co-applied with each button primitive, disabled by its own binding: the primitive's
  // attributes are exactly Button's, and the natively disabled controls never open.
  const coApplied = [
    page.getByTestId("co-toggle"),
    page.getByTestId("co-popover-trigger"),
    page.getByTestId("co-toolbar-toggle"),
    page.getByTestId("co-toolbar-popover"),
  ];

  await stage(coApplied[0]);

  for (const control of coApplied) {
    expect(await disabledAttributes(control)).toEqual({
      disabled: true,
      ariaDisabled: "true",
      dataDisabled: "",
      type: "button",
    });
    await expect(control).toHaveAttribute("aria-describedby", /.+/);
    point = center(await box(control));
    await page.mouse.move(point.x, point.y);
  }

  await elapse(page, 200);

  for (const id of [
    "co-toggle-tip-open",
    "co-popover-tip-open",
    "co-toolbar-toggle-tip-open",
    "co-toolbar-popover-tip-open",
  ]) {
    await expect(page.getByTestId(id)).toHaveText("false");
  }

  await away(page);
  await script(page, "co-disable");

  for (const control of coApplied) {
    expect(await disabledAttributes(control)).toEqual({
      disabled: false,
      ariaDisabled: null,
      dataDisabled: null,
      type: "button",
    });
  }

  // Enabled: hover opens each Tooltip, and the click still activates the primitive while the
  // Tooltip closes.
  for (const [control, tip, activated] of [
    [coApplied[0], "co-toggle-tip-open", "co-pressed"],
    [coApplied[1], "co-popover-tip-open", "co-popover-open"],
    [coApplied[2], "co-toolbar-toggle-tip-open", "co-toolbar-pressed"],
    [coApplied[3], "co-toolbar-popover-tip-open", "co-toolbar-popover-open"],
  ] as const) {
    point = center(await box(control));
    await page.mouse.move(point.x, point.y);
    await expect(page.getByTestId(tip)).toHaveText("true");
    await page.mouse.click(point.x, point.y);
    await expect(page.getByTestId(tip)).toHaveText("false");
    await expect(page.getByTestId(activated)).toHaveText("true");
    await away(page);

    // An opened Popover would cover the next control.
    if (activated.endsWith("popover-open")) {
      await page.keyboard.press("Escape");
      await expect(page.getByTestId(activated)).toHaveText("false");
    }
  }

  await expect(coApplied[0]).toHaveAttribute("aria-pressed", "true");
  await expect(coApplied[2]).toHaveAttribute("aria-pressed", "true");

  // A Toolbar of Tooltip Triggers: arrows are keyboard-modality focus, one Tooltip at a time;
  // the Toolbar keeps one tab stop.
  const toolbar = page.getByTestId("tip-toolbar");
  const names = ["cut", "copy", "paste"];

  await stage(toolbar);
  await expect(toolbar.locator('button[tabindex="0"]')).toHaveCount(1);
  await tabTo(page, page.getByTestId("toolbar-before"), page.getByTestId("tip-toolbar-cut"));

  for (const [index, name] of names.entries()) {
    if (index > 0) {
      await page.keyboard.press("ArrowRight");
      await expect(page.getByTestId(`tip-toolbar-${name}`)).toBeFocused();
    }

    await expectShown(page.getByTestId(`tip-toolbar-${name}-content`));

    for (const other of names) {
      if (other !== name) {
        await expectHidden(page.getByTestId(`tip-toolbar-${other}-content`));
      }
    }
  }

  await expect(toolbar.locator('button[tabindex="0"]')).toHaveCount(1);
  await expect(page.getByTestId("tip-toolbar-paste")).toHaveAttribute("tabindex", "0");
});

test("N7: Escape closes the most recently activated Popover or Tooltip first, in both orders, never past a consumed one; a Tooltip's close never moves focus", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);
  await away(page);

  // A focus-opened Tooltip in open Popover Content: Tooltip, then Popover.
  await script(page, "escape-popover-open");
  await expectShown(page.getByTestId("escape-popover-content"));

  const inner = page.getByTestId("inner-tip-trigger");

  await tabTo(page, page.getByTestId("escape-popover-trigger"), inner);
  await expect(page.getByTestId("inner-tip-intent")).toHaveText("true");
  await expectShown(page.getByTestId("inner-tip-content"));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("inner-tip-intent")).toHaveText("false");
  await expect(page.getByTestId("escape-popover-intent")).toHaveText("true");
  await expect(inner).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("escape-popover-intent")).toHaveText("false");

  // A Tooltip on a Popover Trigger, hover-opened after the Popover: Tooltip, then Popover.
  const tipTrigger = page.getByTestId("tip-popover-trigger");

  await page.getByTestId("outside-target").focus();
  await script(page, "tip-popover-open");
  await expectShown(page.getByTestId("tip-popover-content"));
  await stage(tipTrigger);

  const point = center(await box(tipTrigger));

  await page.mouse.move(point.x, point.y);
  await expect(page.getByTestId("trigger-tip-intent")).toHaveText("true");
  await expectShown(page.getByTestId("trigger-tip-content"));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("trigger-tip-intent")).toHaveText("false");
  await expect(page.getByTestId("tip-popover-intent")).toHaveText("true");
  await expect(page.getByTestId("outside-target")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tip-popover-intent")).toHaveText("false");
  await away(page);

  // An application-opened Tooltip opened before a Popover: Popover, then Tooltip.
  await page.getByTestId("outside-target").focus();
  await script(page, "app-open");
  await expectShown(page.getByTestId("app-content"));
  await script(page, "escape-popover-open");
  await expectShown(page.getByTestId("escape-popover-content"));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("escape-popover-intent")).toHaveText("false");
  await expect(page.getByTestId("app-intent")).toHaveText("true");

  // The Popover's Escape restored focus to its Trigger; the Tooltip's leaves it there.
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("app-intent")).toHaveText("false");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe(
    focused,
  );
});

test("N8: a Tooltip in Popover Content never vetoes or invalidates the Popover's outside dismissal; an outside click closes an application-opened Tooltip, a drag from its Content doesn't", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);
  await away(page);

  const outside = page.getByTestId("outside-target");
  const popoverIntent = page.getByTestId("outside-popover-intent");

  await stage(page.locator('[data-tooltip-case="outside"]'));

  const outsidePoint = center(await box(outside));

  // A keyboard-focused Tooltip Trigger in the Popover: one outside click dismisses both.
  await script(page, "outside-popover-open");
  await expectShown(page.getByTestId("outside-popover-content"));
  await tabTo(
    page,
    page.getByTestId("outside-popover-trigger"),
    page.getByTestId("outside-tip-trigger"),
  );
  await expect(page.getByTestId("outside-tip-intent")).toHaveText("true");
  await page.mouse.click(outsidePoint.x, outsidePoint.y);
  await expect(popoverIntent).toHaveText("false");
  await expect(page.getByTestId("outside-tip-intent")).toHaveText("false");
  await expect(page.getByTestId("outside-popover-changes")).toHaveText("1");

  // A hover-opened Tooltip whose pointer then moves out: the Popover still dismisses.
  await script(page, "outside-popover-open");
  await expectShown(page.getByTestId("outside-popover-content"));

  const tipPoint = center(await box(page.getByTestId("outside-tip-trigger")));

  await page.mouse.move(tipPoint.x, tipPoint.y);
  await expect(page.getByTestId("outside-tip-intent")).toHaveText("true");
  await page.mouse.move(outsidePoint.x, outsidePoint.y);
  await page.mouse.down();
  await page.mouse.up();
  await expect(popoverIntent).toHaveText("false");
  await expect(page.getByTestId("outside-tip-intent")).toHaveText("false");

  // A Tooltip mounted, then one unmounted, inside the branch during an acquired outside press.
  for (const step of ["mount", "unmount"]) {
    await script(page, "outside-popover-open");
    await expectShown(page.getByTestId("outside-popover-content"));
    await page.mouse.move(outsidePoint.x, outsidePoint.y);
    await page.mouse.down();
    await script(page, "press-mount");

    if (step === "mount") {
      await expectShown(page.getByTestId("late-tip-content"));
    } else {
      await expect(page.getByTestId("late-tip-content")).toHaveCount(0);
    }

    await page.mouse.up();
    await expect(popoverIntent).toHaveText("false");
  }

  // An application-opened top-level Tooltip: a drag from its Content outward keeps it; an
  // outside click closes it.
  await script(page, "drag-tip-open");

  const dragContent = page.getByTestId("drag-tip-content");

  await expectShown(dragContent);
  await expect
    .poll(async () => await dragContent.evaluate((node) => getComputedStyle(node).opacity))
    .toBe("1");

  const dragPoint = center(await box(dragContent));

  await page.mouse.move(dragPoint.x, dragPoint.y);
  await page.mouse.down();
  await page.mouse.move(outsidePoint.x, outsidePoint.y, { steps: 6 });
  await page.mouse.up();
  await settle(page);
  await elapse(page, 50);
  await expect(page.getByTestId("drag-tip-intent")).toHaveText("true");
  await page.mouse.click(outsidePoint.x, outsidePoint.y);
  await expect(page.getByTestId("drag-tip-intent")).toHaveText("false");
});

test("N9: a Tooltip in Popover Content activates only after the Popover's reveal; the Popover's close hides it at once and keeps its intent; reopening presents it again; destruction leaves no stale writes", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);
  await away(page);

  const tipContent = page.getByTestId("nested-tip-content");
  const journal = page.getByTestId("nested-journal");

  // Opened by keyboard: Enter opens the Popover and native autofocus focuses the inner Trigger
  // during the Popover's preparation. Whether that focus is keyboard modality is the engine's
  // heuristic: the Tooltip opens exactly when the Trigger matches :focus-visible.
  const nestedTrigger = page.getByTestId("nested-tip-trigger");

  await script(page, "nested-autofocus");
  await stage(page.getByTestId("nested-popover-trigger"));
  await page.getByTestId("nested-popover-trigger").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("nested-popover-intent")).toHaveText("true");
  await expect(nestedTrigger).toBeFocused();

  const focusVisible = await nestedTrigger.evaluate((node) => node.matches(":focus-visible"));
  let reveals = "";

  info.annotations.push({
    type: "engine-modality",
    description: `native Popover autofocus after Enter matches :focus-visible: ${focusVisible}`,
  });

  if (focusVisible) {
    await expect(page.getByTestId("nested-tip-intent")).toHaveText("true");
    await expectShown(tipContent);
    reveals = "revealed;";
  } else {
    await elapse(page, 100);
    await expect(page.getByTestId("nested-tip-intent")).toHaveText("false");
  }

  await expect(journal).toHaveText(reveals);
  await page.keyboard.press("Escape");

  if (focusVisible) {
    await page.keyboard.press("Escape");
  }

  await expect(page.getByTestId("nested-popover-intent")).toHaveText("false");

  // Opened together by the application.
  await script(page, "nested-autofocus");
  await page.getByTestId("outside-target").focus();
  await script(page, "nested-open-both");
  await expectShown(tipContent);
  reveals += "revealed;";
  await expect(journal).toHaveText(reveals);

  // The Popover's script close hides the Tooltip at once, without exit retention, keeping intent.
  await script(page, "nested-close-popover");
  await expect.poll(() => native(tipContent)).toBe(false);
  await expect(tipContent).not.toHaveAttribute("data-leaving");
  await expect(page.getByTestId("nested-tip-intent")).toHaveText("true");

  // Reopening the Popover presents the Tooltip again, after the Popover's reveal.
  await script(page, "nested-open-popover");
  await expectShown(tipContent);
  reveals += "revealed;";
  await expect(journal).toHaveText(reveals);

  // Destroying the Popover leaves no stale writes or errors.
  await script(page, "nested-destroy");
  await expect(tipContent).toHaveCount(0);
  await elapse(page, 100);
  await settle(page);
  await expect(page.getByTestId("nested-tip-intent")).toHaveText("true");
});

test("N10: Popover's placement contract with the Trigger as reference: default above and centered, reactive inputs, a complete factory, every writing mode and direction", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="placement"]'));

  const hosts = { content: "place-content", anchor: "place-trigger" };

  await script(page, "place-open");
  await expectShown(page.getByTestId("place-content"));
  await expectPreferred(page, "block-start", "center", 6, hosts);
  await page.getByTestId("place-side").selectOption("block-end");
  await expectPreferred(page, "block-end", "center", 6, hosts);
  await page.getByTestId("place-align").selectOption("start");
  await expectPreferred(page, "block-end", "start", 6, hosts);
  await script(page, "place-gap");
  await expectPreferred(page, "block-end", "start", 14, hosts);

  for (const mode of ["horizontal-tb", "vertical-rl", "vertical-lr"]) {
    for (const direction of ["ltr", "rtl"]) {
      await page.getByTestId("place-mode").selectOption(mode);
      await page.getByTestId("place-direction").selectOption(direction);

      for (const [side, align] of [
        ["block-start", "end"],
        ["inline-end", "center"],
      ] as const) {
        await page.getByTestId("place-side").selectOption(side);
        await page.getByTestId("place-align").selectOption(align);
        await expectPreferred(page, side, align, 14, hosts);
      }
    }
  }

  // A complete factory wins over the exposed inputs' contradicting values.
  const factoryHosts = { content: "factory-content", anchor: "factory-trigger" };

  await script(page, "factory-open");
  await expectShown(page.getByTestId("factory-content"));
  await expect(page.getByTestId("factory-content")).toHaveAttribute(
    "id",
    "factory-placement-content",
  );
  await expectPreferred(page, "inline-end", "start", 10, factoryHosts);
  await script(page, "factory-side");
  await expectPreferred(page, "block-end", "start", 2, factoryHosts);
});

test("N10: an unsupported Trigger writing mode reports once through ErrorHandler, hides without exit retention, keeps intent and doesn't retry unchanged; a configuration change retries", async ({
  page,
  runtimeErrors,
  drainIssues,
}, info) => {
  runtimeErrors.expectExactly([
    {
      description: "one unsupported writing-mode Error reported through ErrorHandler",
      matches: (record) =>
        consoleMessage(record, "Unsupported Tooltip Trigger writing mode: sideways-lr."),
    },
  ]);
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="placement"]'));

  const content = page.getByTestId("place-content");

  await script(page, "place-open");
  await expectShown(content);
  // Changing only the Trigger's writing mode while open repositions, which fails.
  await page.getByTestId("place-mode").selectOption("sideways-lr");
  await expect
    .poll(async () => {
      await drainIssues();

      return runtimeErrors.records.length;
    })
    .toBe(1);
  await expectHidden(content);
  await expect(content).not.toHaveAttribute("data-leaving");
  await expect(page.getByTestId("place-intent")).toHaveText("true");

  // Opened by the application, it survives a hover leave even without shown Content.
  const placePoint = center(await box(page.getByTestId("place-trigger")));

  await page.mouse.move(placePoint.x, placePoint.y);
  await away(page);
  await elapse(page, 100);
  await expect(page.getByTestId("place-intent")).toHaveText("true");

  // A supported writing mode alone doesn't retry the unchanged attempt.
  await page.getByTestId("place-mode").selectOption("horizontal-tb");
  await elapse(page, 200);
  expect(await native(content)).toBe(false);
  await drainIssues();
  expect(runtimeErrors.records.length).toBe(1);

  // A configuration change does.
  await page.getByTestId("place-side").selectOption("block-end");
  await expectShown(content);
  await expectPreferred(page, "block-end", "center", 6, {
    content: "place-content",
    anchor: "place-trigger",
  });
});

async function lifePhase(content: Locator) {
  return content.evaluate((node) => ({
    native: node.matches(":popover-open"),
    inert: node.hasAttribute("inert"),
    entering: node.hasAttribute("data-entering"),
    present: node.hasAttribute("data-present"),
    leaving: node.hasAttribute("data-leaving"),
  }));
}

test("N11: Popover's lifecycle: retained finite exit while inert, reuse before native hide, a canceled show neither participates nor retries, a close before reveal settles, every animation variant settles", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="lifecycle"]'));

  const content = page.getByTestId("life-content");
  const shows = page.getByTestId("life-shows");
  const reduced = info.project.metadata.motion === "reduce";

  // A finite exit keeps the native host open and inert until Presence settles.
  await script(page, "life-open");
  await expectShown(content);
  await expect(content).toHaveAttribute("data-present", "");
  await script(page, "life-close");

  if (reduced) {
    await expect.poll(() => lifePhase(content)).toMatchObject({ native: false, leaving: false });
  } else {
    await expect
      .poll(() => lifePhase(content))
      .toMatchObject({
        native: true,
        inert: true,
        leaving: true,
      });
    await expect.poll(() => lifePhase(content)).toMatchObject({ native: false, leaving: false });
  }

  await expect(shows).toHaveText("1");

  // Reopened during a retained exit, before native hide: the host is reused, no new show.
  if (!reduced) {
    await script(page, "life-open");
    await expect(content).toHaveAttribute("data-present", "");
    await script(page, "life-close");
    await expect(content).toHaveAttribute("data-leaving", "");
    await content.evaluate((node) => {
      for (const animation of node.getAnimations()) {
        animation.pause();
      }
    });
    await script(page, "life-open");
    await expectShown(content);
    await expect(shows).toHaveText("2");
    await content.evaluate((node) => {
      for (const animation of node.getAnimations()) {
        animation.play();
      }
    });
    await expect(content).toHaveAttribute("data-present", "");
    await expect(shows).toHaveText("2");
    await script(page, "life-close");
    await expect.poll(() => native(content)).toBe(false);
  }

  // A canceled show grants no participation and isn't retried for unchanged intent.
  const before = Number(await shows.textContent());

  await script(page, "life-cancel");
  await script(page, "life-open");
  await expect(shows).toHaveText(String(before + 1));
  await elapse(page, 200);
  await settle(page);
  await expect(shows).toHaveText(String(before + 1));
  expect(await lifePhase(content)).toMatchObject({ native: false, inert: true });
  await expect(page.getByTestId("life-intent")).toHaveText("true");
  await script(page, "life-close");
  await script(page, "life-open");
  await expectShown(content);
  await expect(shows).toHaveText(String(before + 2));
  await script(page, "life-close");
  await expect.poll(() => native(content)).toBe(false);

  // Closed by a native callback during the show, before any reveal: it settles closed directly.
  await script(page, "life-close-on-show");
  await script(page, "life-open");
  await expect(page.getByTestId("life-intent")).toHaveText("false");
  await expect
    .poll(() => lifePhase(content))
    .toEqual({
      native: false,
      inert: true,
      entering: false,
      present: false,
      leaving: false,
    });

  // No, zero and infinite exit animations all settle; infinite ones are ignored.
  for (const motion of ["none", "zero", "infinite"]) {
    await page.getByTestId("life-motion").selectOption(motion);
    await script(page, "life-open");
    await expectShown(content);
    await script(page, "life-close");
    await expect.poll(() => lifePhase(content)).toMatchObject({ native: false, leaving: false });
  }
});

test("N12: replacement root and Content Options win without fabricated outputs; State is shared per root and separate per nested root; template references expose state", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="composition"]'));
  await away(page);

  // A component root through hostDirectives with factory Options over contradicting inputs:
  // not disabled and no delay, so hover opens at once.
  const hint = page.getByTestId("hint-trigger");
  const hintContent = page.getByTestId("hint-content");

  await expect(hintContent).toHaveAttribute("id", "hint-content");
  await expect(hint).toHaveAttribute("aria-describedby", "hint-content");

  const point = center(await box(hint));

  await page.mouse.move(point.x, point.y);
  await expectShown(hintContent);
  await expect(page.getByTestId("hint-state")).toHaveText("true");
  await expectPreferred(page, "block-end", "start", 4, {
    content: "hint-content",
    anchor: "hint-trigger",
  });
  await expect(page.getByTestId("hint-probe")).toHaveAttribute("data-shared", "true");
  await expect(page.getByTestId("hint-probe")).toHaveAttribute("data-open", "true");
  await away(page);
  await expect(page.getByTestId("hint-state")).toHaveText("false");
  await script(page, "hint-open");
  await expectShown(hintContent);
  await script(page, "hint-close");
  await expectHidden(hintContent);
  // Writes to the factory's ordinary signals never emit the unused directive model's output.
  await expect(page.getByTestId("hint-outputs")).toHaveText("0");

  // Template references and a descendant's injected State; nested roots are independent.
  await script(page, "outer-open");
  await expectShown(page.getByTestId("outer-content"));
  await expect(page.getByTestId("outer-state")).toHaveText("true");
  await expect(page.getByTestId("outer-content-state")).toHaveText("true");
  await expect(page.getByTestId("outer-probe")).toHaveAttribute("data-shared", "true");
  await expect(page.getByTestId("outer-probe")).toHaveAttribute("data-open", "true");
  await expect(page.getByTestId("inner-probe")).toHaveAttribute("data-shared", "true");
  await expect(page.getByTestId("inner-probe")).toHaveAttribute("data-open", "false");
  await expect(page.getByTestId("inner-intent")).toHaveText("false");
  expect(await native(page.getByTestId("nested-inner-content"))).toBe(false);
});

type GroupName = "a" | "b" | "c";

/**
 * An N13 journal from entry `from` on: each Trigger enter and open change, with its dispatching
 * event. The group-join case keeps its own, in `join-journal`.
 */
async function groupJournal(
  page: Page,
  from = 0,
  output = "group-journal",
): Promise<JournalEntry[]> {
  const text = await page.getByTestId(output).textContent();
  const entries: JournalEntry[] = JSON.parse(text ?? "[]");

  return entries.slice(from);
}

async function groupMark(page: Page, output = "group-journal"): Promise<number> {
  return (await groupJournal(page, 0, output)).length;
}

function groupKinds(entries: readonly JournalEntry[]): string[] {
  const kinds: string[] = [];

  for (const entry of entries) {
    kinds.push(entry.kind);
  }

  return kinds;
}

function groupEntry(entries: readonly JournalEntry[], kind: string): JournalEntry {
  const entry = entries.find((candidate) => candidate.kind === kind);

  if (entry === undefined) {
    throw new Error(`Expected a ${kind} journal entry in ${JSON.stringify(groupKinds(entries))}`);
  }

  return entry;
}

/** Opened inside an event dispatch, not by the 200 ms timer. */
function expectOpenedAtOnce(entries: readonly JournalEntry[], name: string): void {
  expect(groupEntry(entries, `${name}:true`).event).not.toBe("none");
}

/** Opened by the timer, at least the 200 ms delay after its enter. */
function expectOpenedAfterDelay(entries: readonly JournalEntry[], name: string): void {
  const enter = groupEntry(entries, `${name}:enter`);
  const opened = groupEntry(entries, `${name}:true`);

  expect(opened.event).toBe("none");
  expect(opened.at - enter.at).toBeGreaterThanOrEqual(200 - 2);
}

function groupTrigger(page: Page, name: GroupName): Locator {
  return page.getByTestId(`group-${name}-trigger`);
}

function groupIntent(page: Page, name: GroupName): Locator {
  return page.getByTestId(`group-${name}-intent`);
}

/** Hover-opens a group Tooltip and waits for its reveal, so a leave toward Content starts a transit. */
async function groupHoverOpen(page: Page, name: GroupName): Promise<void> {
  const point = center(await box(groupTrigger(page, name)));
  const content = page.getByTestId(`group-${name}-content`);

  await page.mouse.move(point.x, point.y);
  await expect(groupIntent(page, name)).toHaveText("true");
  await expectShown(content);
  await expect
    .poll(async () => await content.evaluate((node) => getComputedStyle(node).opacity))
    .toBe("1");
}

test("N13: a hover or focus open closes the other intent-opened Tooltip; the group is warm while one is open and for 300 ms after it closes, also by Escape; application writes neither join nor are affected", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="group"]'));
  await away(page);

  // Cold: B opens after its delay. Straight onto C, away from B's Content: C opens at once and B
  // closes, one change each. (A's Content reaches over B, so a move from A onto B is a transit.)
  let mark = await groupMark(page);

  await groupHoverOpen(page, "b");

  let point = center(await box(groupTrigger(page, "c")));

  await page.mouse.move(point.x, point.y, { steps: 10 });
  await expect(groupIntent(page, "c")).toHaveText("true");
  await expect(groupIntent(page, "b")).toHaveText("false");

  let entries = await groupJournal(page, mark);

  expectOpenedAfterDelay(entries, "b");
  expectOpenedAtOnce(entries, "c");
  expect(groupKinds(entries).filter((kind) => kind === "b:false")).toHaveLength(1);
  expect(groupKinds(entries).filter((kind) => kind === "c:true")).toHaveLength(1);

  // C closes by leaving; B, entered within 300 ms, opens at once.
  await away(page);
  await expect(groupIntent(page, "c")).toHaveText("false");
  mark = await groupMark(page);
  point = center(await box(groupTrigger(page, "b")));
  await page.mouse.move(point.x, point.y);
  await expect(groupIntent(page, "b")).toHaveText("true");
  expectOpenedAtOnce(await groupJournal(page, mark), "b");

  // After 300 ms, B opens after its delay again.
  await away(page);
  await expect(groupIntent(page, "b")).toHaveText("false");
  await cool(page);
  mark = await groupMark(page);
  await page.mouse.move(point.x, point.y);
  await expect(groupIntent(page, "b")).toHaveText("true");
  expectOpenedAfterDelay(await groupJournal(page, mark), "b");
  await away(page);
  await expect(groupIntent(page, "b")).toHaveText("false");

  // Focus counts: Tab onto B closes hover-opened A, which the pointer still holds against a blur.
  // B stays current past the window: hovering C opens it at once and closes B.
  await cool(page);
  await groupHoverOpen(page, "a");
  await tabTo(page, groupTrigger(page, "a"), groupTrigger(page, "b"));
  await expect(groupIntent(page, "b")).toHaveText("true");
  await expect(groupIntent(page, "a")).toHaveText("false");
  await cool(page);
  mark = await groupMark(page);
  point = center(await box(groupTrigger(page, "c")));
  await page.mouse.move(point.x, point.y);
  await expect(groupIntent(page, "c")).toHaveText("true");
  await expect(groupIntent(page, "b")).toHaveText("false");
  expectOpenedAtOnce(await groupJournal(page, mark), "c");
  await page.getByTestId("group-a-redecide").focus();
  await away(page);
  await expect(groupIntent(page, "c")).toHaveText("false");

  // An application-opened C isn't a member: A's hover open, after its delay, leaves it open.
  await cool(page);
  await script(page, "group-c-toggle");
  await expect(groupIntent(page, "c")).toHaveText("true");
  mark = await groupMark(page);
  await groupHoverOpen(page, "a");
  expectOpenedAfterDelay(await groupJournal(page, mark), "a");
  await expect(groupIntent(page, "c")).toHaveText("true");

  // Escape closes A, the most recently shown, and warms the group: B opens at once.
  await page.keyboard.press("Escape");
  await expect(groupIntent(page, "a")).toHaveText("false");
  mark = await groupMark(page);
  point = center(await box(groupTrigger(page, "b")));
  await page.mouse.move(point.x, point.y);
  await expect(groupIntent(page, "b")).toHaveText("true");
  expectOpenedAtOnce(await groupJournal(page, mark), "b");
  await expect(groupIntent(page, "c")).toHaveText("true");
  await away(page);
  await expect(groupIntent(page, "b")).toHaveText("false");
  await script(page, "group-c-toggle");
  await expect(groupIntent(page, "c")).toHaveText("false");

  // An application decision replacing A's hover open ends its membership: the leave doesn't close
  // A, B opens after its delay and B's hover open doesn't close A.
  await cool(page);
  await groupHoverOpen(page, "a");
  await script(page, "group-a-redecide");
  await expect(groupIntent(page, "a")).toHaveText("true");
  mark = await groupMark(page);
  await page.mouse.move(point.x, point.y, { steps: 10 });
  await expect(groupIntent(page, "b")).toHaveText("true");
  expectOpenedAfterDelay(await groupJournal(page, mark), "b");
  await expect(groupIntent(page, "a")).toHaveText("true");
  await away(page);
  await expect(groupIntent(page, "b")).toHaveText("false");
  await script(page, "group-a-close");
  await expect(groupIntent(page, "a")).toHaveText("false");

  // Its later close by the application doesn't warm the group either.
  await cool(page);
  await groupHoverOpen(page, "a");
  await script(page, "group-a-redecide");
  await script(page, "group-a-close");
  await expect(groupIntent(page, "a")).toHaveText("false");
  mark = await groupMark(page);
  await page.mouse.move(point.x, point.y, { steps: 10 });
  await expect(groupIntent(page, "b")).toHaveText("true");
  expectOpenedAfterDelay(await groupJournal(page, mark), "b");
});

test("N13: a focus open of a Tooltip whose open an application decision replaced and the application then closed opens and stays open", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="group"]'));
  await away(page);

  // A focus open makes A current. The application replaces that open and then closes A; nothing
  // reads the group between them, and the observed close drops A before focus reopens it.
  await tabTo(page, page.getByTestId("group-a-redecide"), groupTrigger(page, "a"));
  await expect(groupIntent(page, "a")).toHaveText("true");
  await script(page, "group-a-redecide");
  await script(page, "group-a-close");
  await expect(groupIntent(page, "a")).toHaveText("false");
  await expectHidden(page.getByTestId("group-a-content"));
  await page.getByTestId("group-a-redecide").focus();

  const mark = await groupMark(page);

  await page.keyboard.press("Tab");
  await expect(groupTrigger(page, "a")).toBeFocused();
  await expect(groupIntent(page, "a")).toHaveText("true");
  await expectShown(page.getByTestId("group-a-content"));
  await elapse(page, 300);
  await settle(page);
  expect(groupKinds(await groupJournal(page, mark))).toEqual(["a:true"]);
  await expect(groupIntent(page, "a")).toHaveText("true");
  await expectShown(page.getByTestId("group-a-content"));
});

test("N13: an application close of the current Tooltip that runs before another Trigger's enter reads the group, unobserved yet, warms it", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="group"]'));
  await away(page);

  // Focus holds A open and current with no transit. A capture listener on an ancestor of B's
  // Trigger closes A by the application inside B's enter, before B's Trigger reads the group.
  await tabTo(page, page.getByTestId("group-a-redecide"), groupTrigger(page, "a"));
  await expect(groupIntent(page, "a")).toHaveText("true");
  await groupTrigger(page, "b").evaluate((trigger) => {
    trigger.parentElement?.parentElement?.addEventListener(
      "pointerenter",
      (event) => {
        const close = document.querySelector('[data-testid="group-a-close-now"]');

        if (event.target !== trigger || !(close instanceof HTMLButtonElement)) {
          return;
        }

        close.click();
      },
      { capture: true },
    );
  });

  const mark = await groupMark(page);
  const point = center(await box(groupTrigger(page, "b")));

  await page.mouse.move(point.x, point.y);
  await expect(groupIntent(page, "b")).toHaveText("true");
  await expect(groupIntent(page, "a")).toHaveText("false");

  const entries = await groupJournal(page, mark);

  expect(groupKinds(entries).sort()).toEqual(["a:false", "b:enter", "b:true"]);
  expectOpenedAtOnce(entries, "b");
});

/**
 * Cold, hover-opens A, leaves it through its top edge near B and moves into the part of B that
 * rises above A: inside A's grace area, toward A's Content, so B's enter waits.
 */
async function groupOverB(page: Page): Promise<{ a: Box; b: Box; point: Point }> {
  await away(page);
  await cool(page);
  await groupHoverOpen(page, "a");

  const a = await box(groupTrigger(page, "a"));
  const b = await box(groupTrigger(page, "b"));
  const x = a.x + a.width - 8;
  const y = a.y - 5;

  expect(b.y).toBeLessThan(y - 3);
  await page.mouse.move(x, a.y + 6);
  await page.mouse.move(x, y, { steps: 4 });

  const point = { x: b.x + 6, y };

  await page.mouse.move(point.x, point.y, { steps: 6 });

  return { a, b, point };
}

test("N13: while A's grace transit is active B's enter waits: landing on A's Content never opens B; leaving the area over B closes A and opens B at once; pressing B drops the wait", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="group"]'));
  await away(page);

  // During the transit B doesn't open, even after its delay; landing on A's Content keeps A.
  let mark = await groupMark(page);
  let over = await groupOverB(page);

  await elapse(page, 300);
  await expect(groupIntent(page, "b")).toHaveText("false");
  await expect(groupIntent(page, "a")).toHaveText("true");
  expect(groupKinds(await groupJournal(page, mark))).toContain("b:enter");

  const content = await box(page.getByTestId("group-a-content"));

  await page.mouse.move(over.point.x, content.y + content.height - 4, { steps: 4 });
  await elapse(page, 300);
  await expect(groupIntent(page, "a")).toHaveText("true");
  await expect(groupIntent(page, "b")).toHaveText("false");

  // Leaving the area while over B opens B at once, which then closes A.
  over = await groupOverB(page);
  await elapse(page, 300);
  await expect(groupIntent(page, "b")).toHaveText("false");
  mark = await groupMark(page);
  await page.mouse.move(over.point.x, over.b.y + over.b.height - 4);
  await expect(groupIntent(page, "b")).toHaveText("true");
  await expect(groupIntent(page, "a")).toHaveText("false");

  let entries = await groupJournal(page, mark);

  expect(groupKinds(entries)).toEqual(["b:true", "a:false"]);
  expect(groupEntry(entries, "b:true").event).toBe("pointermove");

  // Pressing B while it waits is an activation: it drops the wait, so the outside press that closes
  // A doesn't open B.
  over = await groupOverB(page);
  mark = await groupMark(page);
  await page.mouse.down();
  await page.mouse.up();
  await expect(groupIntent(page, "a")).toHaveText("false");
  await elapse(page, 300);
  await expect(groupIntent(page, "b")).toHaveText("false");
  entries = await groupJournal(page, mark);
  expect(groupKinds(entries)).toEqual(["a:false"]);
});

test("N13: a transit that ends other than by leaving the area drops B's waiting open: a focus open that closes A, Escape on A, destroying A with its Trigger in a child view", async ({
  page,
}, info) => {
  const warnings: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "warning") {
      warnings.push(message.text());
    }
  });
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="group"]'));
  await away(page);

  // Tab onto the waiting B, the pointer still on it: A closes once and B opens and is the group's
  // current, so after the window hovering C opens it at once and closes B.
  await groupOverB(page);

  let mark = await groupMark(page);

  await tabTo(page, groupTrigger(page, "a"), groupTrigger(page, "b"));
  await expect(groupIntent(page, "b")).toHaveText("true");
  await expect(groupIntent(page, "a")).toHaveText("false");
  await cool(page);
  expect(groupKinds(await groupJournal(page, mark))).toEqual(["b:true", "a:false"]);
  mark = await groupMark(page);

  const point = center(await box(groupTrigger(page, "c")));

  await page.mouse.move(point.x, point.y);
  await expect(groupIntent(page, "c")).toHaveText("true");
  await expect(groupIntent(page, "b")).toHaveText("false");
  expectOpenedAtOnce(await groupJournal(page, mark), "c");
  await page.getByTestId("group-a-redecide").focus();
  await away(page);
  await expect(groupIntent(page, "c")).toHaveText("false");

  // Focus landing on C while B waits: C opens, then closes A, and B doesn't open.
  await groupOverB(page);
  mark = await groupMark(page);
  await page.getByTestId("group-a-mount").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(groupTrigger(page, "c")).toBeFocused();
  await expect(groupIntent(page, "c")).toHaveText("true");
  await expect(groupIntent(page, "a")).toHaveText("false");
  await elapse(page, 300);
  expect(groupKinds(await groupJournal(page, mark))).toEqual(["c:true", "a:false"]);
  await page.getByTestId("group-a-redecide").focus();
  await expect(groupIntent(page, "c")).toHaveText("false");

  // Escape on A while B waits: B doesn't open.
  await groupOverB(page);
  mark = await groupMark(page);
  await page.keyboard.press("Escape");
  await expect(groupIntent(page, "a")).toHaveText("false");
  await elapse(page, 300);
  expect(groupKinds(await groupJournal(page, mark))).toEqual(["a:false"]);

  // Destroying A while B waits: A's Trigger, in a child view, is removed before its root leaves
  // the group. A gets no change and B doesn't open.
  await groupOverB(page);
  mark = await groupMark(page);
  await script(page, "group-a-mount");
  await expect(groupTrigger(page, "a")).toHaveCount(0);
  await settle(page);
  await elapse(page, 300);
  expect(await groupJournal(page, mark)).toEqual([]);
  await expect(groupIntent(page, "b")).toHaveText("false");
  expect(warnings).toEqual([]);
});

test("N13: when the waiting Tooltip's open output, resumed by leaving the area, destroys the transit's Tooltip, nothing is written to the destroyed one and nothing warns", async ({
  page,
}, info) => {
  const warnings: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "warning") {
      warnings.push(message.text());
    }
  });
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="group"]'));
  await script(page, "group-b-destroys-a");

  // B waits for A's transit. Leaving the area over B opens B at once, and B's open output destroys
  // A before A's own move handler, which resumed B, returns: A doesn't close itself afterwards.
  const over = await groupOverB(page);

  await elapse(page, 300);
  await expect(groupIntent(page, "b")).toHaveText("false");

  const mark = await groupMark(page);

  await page.mouse.move(over.point.x, over.b.y + over.b.height - 4);
  await expect(groupTrigger(page, "a")).toHaveCount(0);
  await settle(page);

  // A's removal reflows the row, so B may then be left and close; only its open is asserted.
  const entries = await groupJournal(page, mark);

  expect(groupEntry(entries, "b:true").event).toBe("pointermove");

  for (const kind of groupKinds(entries)) {
    expect(kind).not.toMatch(/^a:/);
  }

  expect(warnings).toEqual([]);
});

/** The teardown journal without Z's entries: the consumer's enter listener may run after the Trigger's. */
function teardownKinds(entries: readonly JournalEntry[]): string[] {
  const kinds: string[] = [];

  for (const kind of groupKinds(entries)) {
    if (!kind.startsWith("z:")) {
      kinds.push(kind);
    }
  }

  return kinds;
}

/**
 * Closes X (or `closed`) with `act`, hovers Z right after it and expects Z to open inside the
 * warm window. Z comes first in its section, so it's measured beforehand, and nothing else runs
 * between the close and the hover.
 */
async function expectTeardownWarm(
  page: Page,
  mark: number,
  act: () => Promise<void>,
  closed = "x:false",
): Promise<void> {
  const point = center(await box(page.getByTestId("teardown-z-trigger")));

  await act();
  await page.mouse.move(point.x, point.y);
  await expectShown(page.getByTestId("teardown-z-content"));

  const entries = await groupJournal(page, mark, "teardown-journal");
  const close = groupEntry(entries, closed);
  const enter = groupEntry(entries, "z:enter");

  expect(enter.at - close.at).toBeLessThan(300);
  expectOpenedAtOnce(entries, "z");
}

test("N13: when the previous Tooltip's close output destroys another Tooltip, nothing is written after its destruction, nothing warns and X's close warms the group", async ({
  page,
  browserName,
}, info) => {
  const warnings: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "warning") {
      warnings.push(message.text());
    }
  });
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="group-teardown"]'));
  await away(page);
  await script(page, "teardown-y-mount");

  const x = page.getByTestId("teardown-x-trigger");
  const y = page.getByTestId("teardown-y-trigger");
  let point = center(await box(x));

  // The pointer holds X against its blur. Y's focus open writes first and then closes X, whose
  // close output destroys Y. Y, current then, starts the warm window: Z opens at once. Chromium
  // blurs Y's focused Trigger as it removes it, before Y's destroy hooks, which closes Y first.
  await page.mouse.move(point.x, point.y);
  await expectShown(page.getByTestId("teardown-x-content"));

  let mark = await groupMark(page, "teardown-journal");

  await x.focus();
  await expectTeardownWarm(page, mark, async () => {
    await page.keyboard.press("Tab");
  });
  await expect(y).toHaveCount(0);

  const removed: string[] = ["y:true", "x:false"];

  if (browserName === "chromium") {
    removed.push("y:false");
  }

  expect(teardownKinds(await groupJournal(page, mark, "teardown-journal"))).toEqual(removed);
  await expectHidden(page.getByTestId("teardown-x-content"));
  await away(page);
  await expectHidden(page.getByTestId("teardown-z-content"));

  // Escape closes X, whose close output destroys the closed Y: X, still current while it closes,
  // warms the group.
  await cool(page);
  await script(page, "teardown-y-mount");
  await stage(page.locator('[data-tooltip-case="group-teardown"]'));
  point = center(await box(x));
  await page.mouse.move(point.x, point.y);
  await expectShown(page.getByTestId("teardown-x-content"));
  mark = await groupMark(page, "teardown-journal");
  await expectTeardownWarm(page, mark, async () => {
    await page.keyboard.press("Escape");
  });
  await expect(y).toHaveCount(0);
  expect(teardownKinds(await groupJournal(page, mark, "teardown-journal"))).toEqual(["x:false"]);
  await settle(page);
  expect(warnings).toEqual([]);
});

test("N13: when the current Tooltip's own close output destroys it, by leaving or by Escape, the group warms; destroying an application-reopened former current doesn't", async ({
  page,
}, info) => {
  const warnings: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "warning") {
      warnings.push(message.text());
    }
  });
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="group-teardown"]'));
  await away(page);

  const s = page.getByTestId("teardown-s-trigger");

  /** Mounts S and hover-opens it (`openDelay` 0), so it is the group's current. */
  async function hoverS(): Promise<void> {
    await script(page, "teardown-s-mount");

    const point = center(await box(s));

    await page.mouse.move(point.x, point.y);
    await expectShown(page.getByTestId("teardown-s-content"));
  }

  // S closes by leaving, and that close's output destroys S: Z opens at once.
  await hoverS();

  let mark = await groupMark(page, "teardown-journal");

  await expectTeardownWarm(page, mark, async () => await away(page), "s:false");
  await expect(s).toHaveCount(0);
  expect(teardownKinds(await groupJournal(page, mark, "teardown-journal"))).toEqual(["s:false"]);
  await away(page);
  await expectHidden(page.getByTestId("teardown-z-content"));

  // The same with Escape.
  await cool(page);
  await hoverS();
  mark = await groupMark(page, "teardown-journal");
  await expectTeardownWarm(
    page,
    mark,
    async () => {
      await page.keyboard.press("Escape");
    },
    "s:false",
  );
  await expect(s).toHaveCount(0);
  expect(teardownKinds(await groupJournal(page, mark, "teardown-journal"))).toEqual(["s:false"]);
  await away(page);
  await expectHidden(page.getByTestId("teardown-z-content"));

  // An application decision replaces S's hover open, so leaving doesn't close S. Destroying the
  // still-open S doesn't warm the group: Z waits for its delay.
  await cool(page);
  await hoverS();
  await script(page, "teardown-s-redecide");
  await away(page);
  await elapse(page, 100);
  await expectShown(page.getByTestId("teardown-s-content"));
  mark = await groupMark(page, "teardown-journal");
  await script(page, "teardown-s-unmount");
  await expect(s).toHaveCount(0);

  const point = center(await box(page.getByTestId("teardown-z-trigger")));

  await page.mouse.move(point.x, point.y);
  await expectShown(page.getByTestId("teardown-z-content"));

  const entries = await groupJournal(page, mark, "teardown-journal");

  expectOpenedAfterDelay(entries, "z");
  expect(teardownKinds(entries)).toEqual([]);
  await settle(page);
  expect(warnings).toEqual([]);
});

test("N13: when the previous Tooltip's close output removes only the opening Tooltip's Trigger, that Tooltip follows the Trigger-removal rules, and a replacement Trigger opens nothing", async ({
  page,
  browserName,
}, info) => {
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="group-teardown"]'));
  await away(page);
  await script(page, "teardown-w-mount");

  const x = page.getByTestId("teardown-x-trigger");
  const point = center(await box(x));

  // W's focus open writes before it closes X; X's close output then removes W's Trigger, which
  // ends W's focus without closing it. Chromium blurs the focused Trigger as it removes it, and
  // that blur closes the focus-opened W.
  await page.mouse.move(point.x, point.y);
  await expectShown(page.getByTestId("teardown-x-content"));

  let mark = await groupMark(page, "teardown-journal");

  await x.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("teardown-w-trigger")).toHaveCount(0);
  await expectHidden(page.getByTestId("teardown-x-content"));
  await expectHidden(page.getByTestId("teardown-w-content"));
  await settle(page);

  const blurred = browserName === "chromium";
  const removed: string[] = ["w:true", "x:false"];

  if (blurred) {
    removed.push("w:false");
  }

  expect(groupKinds(await groupJournal(page, mark, "teardown-journal"))).toEqual(removed);
  await expect(page.getByTestId("teardown-w-intent")).toHaveText(String(!blurred));

  // The replacement Trigger completes the parts with no change: a still-open W presents, a
  // closed one stays closed.
  mark = await groupMark(page, "teardown-journal");
  await script(page, "teardown-w-mount");
  await expect(page.getByTestId("teardown-w-trigger")).toHaveCount(1);

  if (blurred) {
    await elapse(page, 300);
    await expectHidden(page.getByTestId("teardown-w-content"));
  } else {
    await expectShown(page.getByTestId("teardown-w-content"));
  }

  await settle(page);
  expect(await groupJournal(page, mark, "teardown-journal")).toEqual([]);
  await expect(page.getByTestId("teardown-w-intent")).toHaveText(String(!blurred));
});

test("N13: an output handler that focus-opens another Tooltip leaves exactly one intent-opened Tooltip open", async ({
  page,
}, info) => {
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="group-reentry"]'));
  await away(page);

  // P's open output focuses Q's input: Q opens inside P's write, then P joins the group and
  // closes Q. P stays the one open.
  let mark = await groupMark(page);
  let point = center(await box(page.getByTestId("reentry-p-trigger")));

  await page.mouse.move(point.x, point.y);
  await expect(page.getByTestId("reentry-q-trigger")).toBeFocused();
  await expectShown(page.getByTestId("reentry-p-content"));
  await settle(page);
  expect(groupKinds(await groupJournal(page, mark))).toEqual(["p:true", "q:true", "q:false"]);
  await expect(page.getByTestId("reentry-p-intent")).toHaveText("true");
  await expect(page.getByTestId("reentry-q-intent")).toHaveText("false");
  await expectHidden(page.getByTestId("reentry-q-content"));

  // P's close output focuses Q instead. O's hover open closes P, whose close output focus-opens Q:
  // Q, the newer current, closes O, and O's own open doesn't take current back.
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="group-reentry"]'));
  await away(page);
  await script(page, "reentry-focus-on-close");
  point = center(await box(page.getByTestId("reentry-p-trigger")));
  await page.mouse.move(point.x, point.y);
  await expectShown(page.getByTestId("reentry-p-content"));
  mark = await groupMark(page);
  point = center(await box(page.getByTestId("reentry-o-trigger")));
  await page.mouse.move(point.x, point.y);
  await expect(page.getByTestId("reentry-q-trigger")).toBeFocused();
  await expect(page.getByTestId("reentry-q-intent")).toHaveText("true");
  await settle(page);
  expect(groupKinds(await groupJournal(page, mark))).toEqual([
    "o:true",
    "p:false",
    "q:true",
    "o:false",
  ]);
  await expect(page.getByTestId("reentry-o-intent")).toHaveText("false");
  await expect(page.getByTestId("reentry-p-intent")).toHaveText("false");
  await expectShown(page.getByTestId("reentry-q-content"));
  await expectHidden(page.getByTestId("reentry-o-content"));
});

test("N13: destroying the current Tooltip starts the warm window and writes nothing to it, throws or warns nothing; after the window the group is cold", async ({
  page,
}, info) => {
  const warnings: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "warning") {
      warnings.push(message.text());
    }
  });
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="group"]'));
  await away(page);

  // A is current by hover; its removal reflows the row, leaving no Trigger under the pointer. (A
  // focused Trigger isn't used: Chromium blurs it on removal, which closes A first.) Within the
  // window, B opens at once.
  await groupHoverOpen(page, "a");

  let mark = await groupMark(page);

  await script(page, "group-a-mount");
  await expect(groupTrigger(page, "a")).toHaveCount(0);
  await settle(page);
  expect(await groupJournal(page, mark)).toEqual([]);

  let point = center(await box(groupTrigger(page, "b")));

  await page.mouse.move(point.x, point.y);
  await expect(groupIntent(page, "b")).toHaveText("true");

  let entries = await groupJournal(page, mark);

  expectOpenedAtOnce(entries, "b");
  // Nothing was written to the destroyed A. The consumer's enter listener may run after the Trigger's.
  expect(groupKinds(entries).sort()).toEqual(["b:enter", "b:true"]);
  await away(page);
  await expect(groupIntent(page, "b")).toHaveText("false");

  // After the window, B waits for its delay.
  await script(page, "group-a-mount");
  await cool(page);
  await groupHoverOpen(page, "a");
  await script(page, "group-a-mount");
  await expect(groupTrigger(page, "a")).toHaveCount(0);
  await cool(page);
  mark = await groupMark(page);
  point = center(await box(groupTrigger(page, "b")));
  await page.mouse.move(point.x, point.y);
  await expect(groupIntent(page, "b")).toHaveText("true");
  expectOpenedAfterDelay(await groupJournal(page, mark), "b");
  expect(warnings).toEqual([]);
});

/** The group-join case with K hover-opened: the pointer holds it, and it is the group's current. */
async function joinHoldK(page: Page, info: TestInfo): Promise<void> {
  await fixture(page, "tooltip", info);
  await stage(page.locator('[data-tooltip-case="group-join"]'));
  await away(page);

  const point = center(await box(page.getByTestId("join-k-trigger")));

  await page.mouse.move(point.x, point.y);
  await expectShown(page.getByTestId("join-k-content"));
}

test("N13: a Tooltip whose own open output destroys it doesn't join the group: the current Tooltip stays open and current, nothing is written after the destruction, nothing warns", async ({
  page,
}, info) => {
  const warnings: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "warning") {
      warnings.push(message.text());
    }
  });
  await joinHoldK(page, info);
  await script(page, "join-v-mount");

  // Tab onto V: V writes its open, and that output destroys V. V doesn't join, so it doesn't close
  // K, which the pointer still holds against its blur.
  let mark = await groupMark(page, "join-journal");

  await page.getByTestId("join-k-trigger").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("join-v-trigger")).toHaveCount(0);
  await settle(page);
  expect(groupKinds(await groupJournal(page, mark, "join-journal"))).toEqual(["v:true"]);
  await expectShown(page.getByTestId("join-k-content"));

  // K is still current, so the group is warm: T opens at once, and K closes once. Opening T writes
  // nothing to the destroyed V.
  mark = await groupMark(page, "join-journal");

  const point = center(await box(page.getByTestId("join-t-trigger")));

  await page.mouse.move(point.x, point.y, { steps: 10 });
  await expectShown(page.getByTestId("join-t-content"));
  await expectHidden(page.getByTestId("join-k-content"));
  await settle(page);

  const entries = await groupJournal(page, mark, "join-journal");

  expectOpenedAtOnce(entries, "t");
  expect(groupKinds(entries).sort()).toEqual(["k:false", "t:enter", "t:true"]);
  expect(warnings).toEqual([]);
});

test("N13: a Tooltip whose own open output closes it again doesn't join the group: it doesn't close the current Tooltip or keep the group warm", async ({
  page,
}, info) => {
  await joinHoldK(page, info);

  // Tab onto U: U writes its open, and that output writes it closed. U doesn't join, so K, which
  // the pointer still holds against its blur, stays open.
  let mark = await groupMark(page, "join-journal");

  await page.getByTestId("join-k-trigger").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("join-u-trigger")).toBeFocused();
  await settle(page);
  expect(groupKinds(await groupJournal(page, mark, "join-journal"))).toEqual(["u:true", "u:false"]);
  await expectHidden(page.getByTestId("join-u-content"));
  await expectShown(page.getByTestId("join-k-content"));

  // K closes by leaving and warms the group for 300 ms; after that U, still focused, keeps nothing
  // warm, so T opens after its delay.
  await page.mouse.move(2, 2, { steps: 10 });
  await expectHidden(page.getByTestId("join-k-content"));
  await cool(page);
  mark = await groupMark(page, "join-journal");

  const point = center(await box(page.getByTestId("join-t-trigger")));

  await page.mouse.move(point.x, point.y);
  await expectShown(page.getByTestId("join-t-content"));
  expectOpenedAfterDelay(await groupJournal(page, mark, "join-journal"), "t");
  await expect(page.getByTestId("join-u-trigger")).toBeFocused();
});

test("N15: a Tooltip Trigger co-applied with a Checkbox, a Switch or an ogFieldControl outside a Field is described by its Content from server HTML on, in both directive orders, and keeps its static aria-describedby without Content", async ({
  page,
}, info) => {
  await tooltipOutsideFieldCase(page, info);
});

test("N16: a Field control and a Tooltip Trigger on one element share one description owner, in both directive orders and through a consumer's hostDirectives: each side's change keeps the other's IDs", async ({
  page,
}, info) => {
  await sharedOwnerCase(page, info);
});

test("N17: without a static aria-describedby, a Trigger alone and one co-applied with a Checkbox are described by Content mounted in server HTML; after hydration, unmounting the Content removes the attribute, remounting restores its ID, and unmounting again removes it", async ({
  page,
}, info) => {
  await withoutStaticCase(
    page,
    info,
    [
      { testId: "bare-trigger", id: "bare-trigger-tip" },
      { testId: "bare-checkbox", id: "bare-checkbox-tip" },
    ],
    "toggle-bare-content",
  );
});

test("N18: N17 with Content in a child component's view, which registers after the Trigger's aria-describedby was first evaluated", async ({
  page,
}, info) => {
  await withoutStaticCase(
    page,
    info,
    [{ testId: "late-trigger", id: "late-trigger-tip" }],
    "toggle-bare-content",
  );
});
