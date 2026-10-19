import { test, expect, type ErrorRecord } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import { fixture } from "./observation.js";
import { expectPreferred } from "./geometry.js";

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

test("N1: the Trigger is described by mounted Content, open or closed, replacing its static value; closed inert Content still describes it", async ({
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
  await expect(trigger).not.toHaveAttribute("aria-describedby");
  await expect(trigger).toHaveAccessibleDescription("");
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

  // Entering and leaving before the delay cancels it.
  await page.mouse.move(point.x, point.y);
  await away(page);
  await elapse(page, 400);
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
  await elapse(page, 400);
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

  // An observed close cancels a pending open: the application opens it during a slow delay and
  // Escape closes it before the delay expires.
  await script(page, "hover-delay-slow");
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
