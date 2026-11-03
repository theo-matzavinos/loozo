import { test, expect, type ErrorRecord } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import { fixture } from "./observation.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The `ErrorHandler` report of a second region registering with a toaster. */
function isSecondRegion(record: ErrorRecord): boolean {
  if (record.source !== "console") {
    return false;
  }

  for (const argument of record.arguments ?? []) {
    if (
      isRecord(argument) &&
      argument.message === "A toaster supports only one mounted toast region."
    ) {
      return true;
    }
  }

  return false;
}

function toast(page: Page, title: string): Locator {
  return page.getByTestId(`toast-${title}`);
}

/** The test IDs of the main region's toasts, in DOM order. */
function order(page: Page): Promise<(string | null)[]> {
  return page
    .getByTestId("region")
    .locator("li")
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-testid")));
}

async function expectRegion(region: Locator): Promise<void> {
  await expect(region).toHaveAttribute("role", "region");
  await expect(region).toHaveAttribute("aria-live", "polite");
  await expect(region).toHaveAttribute("aria-relevant", "additions text");
  await expect(region).toHaveAttribute("aria-atomic", "false");
  await expect(region).toHaveAttribute("tabindex", "-1");
  await expect(region).toHaveAttribute("aria-label", "Notifications");
}

/** A script click: never a trusted gesture, and it doesn't move focus or the pointer. */
async function script(page: Page, id: string): Promise<void> {
  await page.getByTestId(id).evaluate((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      throw new Error("Expected a fixture control button");
    }

    node.click();
  });
}

type Exit = {
  /** Milliseconds from `data-leaving` to removal, or null when it never had `data-leaving`. */
  exit: number | null;
  /** The test ID of the focused element when `data-leaving` first appeared. */
  focusAtLeaving: string | null;
  /** The toast's `data-open` (its State) when `data-leaving` first appeared. */
  openAtLeaving: string | null;
  /** The main region's State `toasts()` titles when `data-leaving` first appeared. */
  stateAtLeaving: string | null;
};

/** What the page saw of the AlertDialog's delete flow, sampled in the page. */
type DeleteFlow = {
  /** One sample per animation frame from the Delete activation until the toast's removal. */
  frames: { at: number; open: boolean; leaving: boolean; toasts: number; state: string }[];
  /** When the dialog's first `toggle` or `close` after its native `close()` reached the window. */
  closedAt: number | null;
  /** How many frames had been sampled by then. */
  closedFrame: number | null;
  /** The toast element's insertion, and what the page was like then. */
  rendered: {
    at: number;
    frame: number;
    open: boolean;
    modal: boolean;
    focus: string | null;
  } | null;
  /** When the toast element was removed. */
  removedAt: number | null;
};

/** What the page saw of a held toast's release around a modal dialog's removal, sampled in the page. */
type RemovedRelease = {
  /** One sample per animation frame, from the watch until three frames after the toast's insertion. */
  frames: { at: number; connected: boolean; toasts: number }[];
  /** How many frames had been sampled when the dialog left the document. */
  removedFrame: number | null;
  /** Whether a closing `toggle` or a `close` event of the dialog reached the window. */
  eventReached: boolean;
  /** The toast element's insertion, and what the page was like then. */
  rendered: { frame: number; connected: boolean; modal: boolean; focus: string | null } | null;
};

declare global {
  interface Window {
    toastExits?: Map<string, Promise<Exit>>;
    toastsRendered?: string[];
    toastDeleteFlow?: Promise<DeleteFlow>;
    toastRemovedRelease?: Promise<RemovedRelease>;
    dialogClosedAt?: Record<string, number>;
  }
}

/**
 * Records, from now on, the test ID of every toast element the page ever gets, once each, also
 * inside a region mounted later, so a toast that renders for a moment and is removed is caught.
 * The returned function reads them in order of first appearance.
 */
async function watchRendered(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const rendered: string[] = [];

    window.toastsRendered = rendered;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }

          const items = [...node.querySelectorAll("li")];

          if (node instanceof HTMLLIElement) {
            items.unshift(node);
          }

          // A list inserted with its items reports each item again as its own addition.
          for (const item of items) {
            const testId = item.getAttribute("data-testid") ?? "";

            if (!rendered.includes(testId)) {
              rendered.push(testId);
            }
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });

  return () => page.evaluate(() => window.toastsRendered!);
}

/**
 * Watches `testId`'s element from now until it is removed, sampled in the page by a mutation
 * observer, so no round trip can straddle its exit. Await it before the action that closes the
 * toast; the returned function waits for the removal.
 */
async function watchExit(page: Page, testId: string): Promise<() => Promise<Exit>> {
  await page.getByTestId(testId).evaluate((element, testId) => {
    const exits = (window.toastExits ??= new Map());

    exits.set(
      testId,
      new Promise<Exit>((resolve) => {
        let leftAt: number | null = null;
        let focusAtLeaving: string | null = null;
        let openAtLeaving: string | null = null;
        let stateAtLeaving: string | null = null;
        const observer = new MutationObserver(() => {
          if (leftAt === null && element.hasAttribute("data-leaving")) {
            leftAt = performance.now();
            focusAtLeaving = document.activeElement?.getAttribute("data-testid") ?? null;
            openAtLeaving = element.getAttribute("data-open");
            stateAtLeaving =
              document.querySelector('[data-testid="region-state"]')?.textContent?.trim() ?? null;
          }

          if (!element.isConnected) {
            observer.disconnect();

            let exit: number | null = null;

            if (leftAt !== null) {
              exit = performance.now() - leftAt;
            }

            resolve({ exit, focusAtLeaving, openAtLeaving, stateAtLeaving });
          }
        });

        observer.observe(element.ownerDocument, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["data-leaving"],
        });
      }),
    );
  }, testId);

  return () => page.evaluate((testId) => window.toastExits!.get(testId)!, testId);
}

/**
 * Runs `steps` with the page clock, which `page.clock.install()` faked, paused, so the toasts'
 * timers and rendering advance only by `page.clock.runFor`, however loaded the host is.
 */
async function paused(page: Page, steps: () => Promise<void>): Promise<void> {
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);

  try {
    await steps();
  } finally {
    await page.clock.resume();
  }
}

/** Sets `document.hidden` and dispatches `visibilitychange`, as a hidden tab would. */
async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((hidden) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

/** Whether the main region contains the focused element. */
function focusInRegion(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const region = document.querySelector('[data-testid="region"]');

    return region !== null && region.contains(document.activeElement);
  });
}

async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error("Expected a rendered element");
  }

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("TO1: the region is a polite live region with its attributes and an empty list in server HTML, both kept through hydration; add on the server keeps nothing and returns an id; a bad duration, the toast's or the region's, a finite one above the 2147483647 ms timer maximum included, or a bad limit throws a RangeError and keeps nothing; 2147483647 is accepted", async ({
  page,
}, info) => {
  const region = page.getByTestId("region");

  // The list's test ID makes the fixture's retention check compare it as well as the region.
  await fixture(page, "toast", info, async () => {
    await expectRegion(region);
    await expect(page.getByTestId("region-list")).toHaveCount(1);
    await expect(region.locator("li")).toHaveCount(0);
    await expect(page.getByTestId("server-add")).toHaveAttribute("data-id", /^og-toast-\d+$/);
    await expect(page.getByTestId("region-state")).toHaveText("");
  });

  await expectRegion(region);
  await expect(page.getByRole("region", { name: "Notifications", exact: true })).toHaveCount(1);
  await expect(page.getByTestId("region-list")).toHaveCount(1);
  await expect(region.locator("li")).toHaveCount(0);
  await expect(page.getByTestId("region-probe")).toHaveAttribute("data-count", "0");
  await expect(page.getByTestId("server-add")).not.toHaveAttribute("data-id", /.*/);

  // The browser's toaster holds nothing from the server: its first toast is the only one.
  await page.getByTestId("add").click();
  await expect(page.getByTestId("region-state")).toHaveText("T1");
  await expect(region.locator("li")).toHaveCount(1);
  await expect(toast(page, "T1")).not.toHaveAttribute("role", /.*/);
  await expect(toast(page, "T1")).not.toHaveAttribute("aria-live", /.*/);
  await expect(page.getByTestId("close-T1")).toHaveAttribute("type", "button");

  await page.getByTestId("bad-duration").click();
  await expect(page.getByTestId("bad-duration-error")).toHaveText(
    "RangeError: A toast's duration must be a positive number of milliseconds up to 2147483647, or Infinity, not 0.",
  );
  await expect(page.getByTestId("region-state")).toHaveText("T1");

  // Above the longest setTimeout delay, which would overflow and run at once: rejected. The
  // maximum itself is accepted, and T2 stays open through the rest of the test.
  await page.getByTestId("huge-duration").click();
  await expect(page.getByTestId("bad-duration-error")).toHaveText(
    "RangeError: A toast's duration must be a positive number of milliseconds up to 2147483647, or Infinity, not 2147483648.",
  );
  await expect(page.getByTestId("region-state")).toHaveText("T1");
  await page.getByTestId("add-max").click();
  await expect(page.getByTestId("region-state")).toHaveText("T2 T1");

  // The region's limit 0, its duration -1, then 2147483648: add throws, T3 to T5 are kept
  // nowhere. Its duration 2147483647 shows T6.
  await page.getByTestId("break-limit").click();
  await expect(page.getByTestId("main-config")).toHaveText("60000 0");
  await page.getByTestId("try-add").click();
  await expect(page.getByTestId("config-error")).toHaveText(
    /^RangeError: A toast region's limit must be a positive integer or Infinity, not 0/,
  );
  await page.getByTestId("fix-config").click();
  await page.getByTestId("break-duration").click();
  await expect(page.getByTestId("main-config")).toHaveText("-1 3");
  await page.getByTestId("try-add").click();
  await expect(page.getByTestId("config-error")).toHaveText(
    "RangeError: A toast region's duration must be a positive number of milliseconds up to 2147483647, or Infinity, not -1.",
  );
  await page.getByTestId("huge-region-duration").click();
  await expect(page.getByTestId("main-config")).toHaveText("2147483648 3");
  await page.getByTestId("try-add").click();
  await expect(page.getByTestId("config-error")).toHaveText(
    "RangeError: A toast region's duration must be a positive number of milliseconds up to 2147483647, or Infinity, not 2147483648.",
  );
  await expect(page.getByTestId("region-state")).toHaveText("T2 T1");
  await page.getByTestId("max-region-duration").click();
  await expect(page.getByTestId("main-config")).toHaveText("2147483647 3");
  await page.getByTestId("try-add").click();
  await expect(page.getByTestId("region-state")).toHaveText("T6 T2 T1");

  // Fixed, the next add shows exactly one toast, and the limit of 3 closes T1: no failed add
  // comes back, and the two toasts at the maximum are still open.
  await page.getByTestId("fix-config").click();
  await expect(page.getByTestId("main-config")).toHaveText("60000 3");
  await page.getByTestId("add").click();
  await expect(page.getByTestId("region-state")).toHaveText("T7 T6 T2");
  expect(await order(page)).toEqual(["toast-T7", "toast-T6", "toast-T2"]);
  await expect(toast(page, "T6")).toHaveAttribute("data-open", "true");
  await expect(toast(page, "T2")).toHaveAttribute("data-open", "true");
});

test("TO2: add renders newest first with its data by reference in State toasts(); a toast outlives the caller that added it and a router navigation", async ({
  page,
}, info) => {
  await fixture(page, "toast", info);

  await page.getByTestId("add").click();
  await page.getByTestId("add").click();
  await expect(page.getByTestId("region-state")).toHaveText("T2 T1");
  expect(await order(page)).toEqual(["toast-T2", "toast-T1"]);
  await expect(page.getByTestId("same-data")).toHaveText("true");
  await expect(page.getByTestId("last-id")).toHaveText(/^og-toast-\d+$/);
  await expect(page.getByTestId("region-probe")).toHaveAttribute("data-count", "2");
  await expect(toast(page, "T2")).toHaveAttribute("data-open", "true");
  await expect(page.getByTestId("probe-T2")).toHaveAttribute("data-open", "true");

  // The caller adds a toast and is destroyed in the same turn, like a row a refetch removes.
  await page.getByTestId("caller-add").click();
  await expect(page.locator("toast-caller")).toHaveCount(0);
  await expect(page.getByTestId("region-state")).toHaveText("Deleted T2 T1");
  expect(await order(page)).toEqual(["toast-Deleted", "toast-T2", "toast-T1"]);

  // Toasts never follow Location.
  await page.getByTestId("navigate").click();
  await expect(page).toHaveURL(/[?&]n=q1\b/);
  await page.getByTestId("navigate").click();
  await expect(page).toHaveURL(/[?&]n=q2\b/);
  await expect(page.getByTestId("region-state")).toHaveText("Deleted T2 T1");
  await expect(toast(page, "Deleted")).toHaveAttribute("data-open", "true");
  await expect(toast(page, "T1")).toHaveAttribute("data-open", "true");
});

test("TO3: a toast closes at its duration on the page clock, Infinity never; hover, focus within and document.hidden pause every toast and each resumes with its remaining time; the region's default is 5000 ms from its release", async ({
  page,
}, info) => {
  await fixture(page, "toast", info);
  await page.clock.install();

  const outside = await center(page.getByTestId("outside"));

  // Expiry: open at 999 ms, closed at 1000.
  await paused(page, async () => {
    await page.getByTestId("add-short").click();
    await page.clock.runFor(100);
    await expect(toast(page, "T1")).toHaveAttribute("data-open", "true");
    await page.clock.runFor(899);
    await expect(toast(page, "T1")).toHaveAttribute("data-open", "true");
    await page.clock.runFor(1);
    await page.clock.runFor(200);
    await expect(toast(page, "T1")).toHaveCount(0);
  });

  // Infinity never expires.
  await paused(page, async () => {
    await page.getByTestId("add-infinite").click();
    await page.clock.runFor(20_000);
    await expect(toast(page, "T2")).toHaveAttribute("data-open", "true");
    await page.getByTestId("close-last").click();
    await page.clock.runFor(200);
    await expect(toast(page, "T2")).toHaveCount(0);
  });

  // Hover pauses both toasts; after leaving, the 1000 ms one has 600 left, the 1500 ms one 1100.
  await paused(page, async () => {
    await page.getByTestId("add-short").click();
    await page.getByTestId("add-medium").click();
    await page.clock.runFor(400);
    await expect(toast(page, "T3")).toHaveAttribute("data-open", "true");

    const point = await center(toast(page, "T3"));

    await page.mouse.move(point.x, point.y);
    await page.clock.runFor(2000);
    await expect(toast(page, "T3")).toHaveAttribute("data-open", "true");
    await expect(toast(page, "T4")).toHaveAttribute("data-open", "true");
    await page.mouse.move(outside.x, outside.y);
    await page.clock.runFor(599);
    await expect(toast(page, "T3")).toHaveAttribute("data-open", "true");
    await page.clock.runFor(1);
    await page.clock.runFor(100);
    await expect(toast(page, "T3")).toHaveCount(0);
    await expect(toast(page, "T4")).toHaveAttribute("data-open", "true");
    await page.clock.runFor(399);
    await expect(toast(page, "T4")).toHaveAttribute("data-open", "true");
    await page.clock.runFor(1);
    await page.clock.runFor(200);
    await expect(toast(page, "T4")).toHaveCount(0);
  });

  // Focus within pauses it.
  await paused(page, async () => {
    await page.getByTestId("add-short").click();
    await page.clock.runFor(400);
    await page.getByTestId("close-T5").focus();
    await page.clock.runFor(2000);
    await expect(toast(page, "T5")).toHaveAttribute("data-open", "true");
    await page.getByTestId("outside").focus();
    await page.clock.runFor(599);
    await expect(toast(page, "T5")).toHaveAttribute("data-open", "true");
    await page.clock.runFor(1);
    await page.clock.runFor(200);
    await expect(toast(page, "T5")).toHaveCount(0);
  });

  // A hidden document pauses it (synthetic: a headless page can't really be hidden).
  await paused(page, async () => {
    await page.getByTestId("add-short").click();
    await page.clock.runFor(400);
    await setHidden(page, true);
    await page.clock.runFor(2000);
    await expect(toast(page, "T6")).toHaveAttribute("data-open", "true");
    await setHidden(page, false);
    await page.clock.runFor(599);
    await expect(toast(page, "T6")).toHaveAttribute("data-open", "true");
    await page.clock.runFor(1);
    await page.clock.runFor(200);
    await expect(toast(page, "T6")).toHaveCount(0);
  });

  // Angular removes the focused Close, which dispatches no focusout: focus is outside, so T7
  // resumes with its 600 ms left, and T8, added afterwards, runs its full 1000.
  await paused(page, async () => {
    await page.getByTestId("add-short").click();
    await page.clock.runFor(400);
    await page.getByTestId("close-T7").focus();
    await page.clock.runFor(2000);
    await expect(toast(page, "T7")).toHaveAttribute("data-open", "true");
    await script(page, "hide-closes");
    await page.clock.runFor(100);
    await expect(page.getByTestId("close-T7")).toHaveCount(0);
    expect(await focusInRegion(page)).toBe(false);
    await script(page, "add-short");
    await page.clock.runFor(400);
    await expect(toast(page, "T7")).toHaveAttribute("data-open", "true");
    await page.clock.runFor(300);
    await expect(toast(page, "T7")).toHaveCount(0);
    await expect(toast(page, "T8")).toHaveAttribute("data-open", "true");
    await page.clock.runFor(200);
    await expect(toast(page, "T8")).toHaveAttribute("data-open", "true");
    await page.clock.runFor(300);
    await expect(toast(page, "T8")).toHaveCount(0);
  });

  // Angular removes the Toast element holding focus, without a Close, while its record stays
  // shown: T9 resumes with its 600 ms left and then closes unrendered.
  await paused(page, async () => {
    await page.getByTestId("add-short").click();
    await page.clock.runFor(400);
    await page.getByTestId("probe-T9").focus();
    await page.clock.runFor(2000);
    await expect(toast(page, "T9")).toHaveAttribute("data-open", "true");
    await script(page, "hide-list");
    await page.clock.runFor(100);
    await expect(toast(page, "T9")).toHaveCount(0);
    expect(await focusInRegion(page)).toBe(false);
    await page.clock.runFor(400);
    await expect(page.getByTestId("region-state")).toHaveText("T9");
    await page.clock.runFor(300);
    await expect(page.getByTestId("region-state")).toHaveText("");
    await script(page, "show-all");
    await page.clock.runFor(100);
  });

  // The default 5000 ms runs from the release: added long before its region mounts, and again in
  // full after its region is destroyed 3000 ms in and mounted again.
  await paused(page, async () => {
    await page.getByTestId("late-add").click();
    await page.clock.runFor(6000);
    await page.getByTestId("late-mount").click();
    await page.clock.runFor(100);
    await expect(toast(page, "Late1")).toBeVisible();
    await page.clock.runFor(3000);
    await page.getByTestId("late-unmount").click();
    await page.clock.runFor(100);
    await expect(page.getByTestId("late-region")).toHaveCount(0);
    await page.getByTestId("late-mount").click();
    await page.clock.runFor(100);
    await expect(toast(page, "Late1")).toBeVisible();
    await page.clock.runFor(4800);
    await expect(toast(page, "Late1")).toBeVisible();
    await page.clock.runFor(300);
    await expect(toast(page, "Late1")).toHaveCount(0);
  });
});

test("TO4: when a release takes the open toasts over the limit of 3, the oldest open toast closes with its exit; four added before a render: the oldest of them is dropped and never renders", async ({
  page,
}, info) => {
  await fixture(page, "toast", info);

  await page.getByTestId("add-exit").click();
  await page.getByTestId("add-exit").click();
  await page.getByTestId("add-exit").click();
  await expect(page.getByTestId("region-state")).toHaveText("T3 T2 T1");

  const oldest = await watchExit(page, "toast-T1");

  await page.getByTestId("add").click();

  const { exit, openAtLeaving, stateAtLeaving } = await oldest();

  expect(exit).not.toBeNull();
  expect(exit!).toBeGreaterThanOrEqual(250);
  expect(openAtLeaving).toBe("false");
  expect(stateAtLeaving).toBe("T4 T3 T2 T1");
  await expect(page.getByTestId("region-state")).toHaveText("T4 T3 T2");
  expect(await order(page)).toEqual(["toast-T4", "toast-T3", "toast-T2"]);
  await expect(toast(page, "T2")).toHaveAttribute("data-open", "true");

  // T5–T8 in one handler: the limit closes T2–T4, which exit, and T5, which never renders.
  const rendered = await watchRendered(page);

  await script(page, "add-four");
  await expect(page.getByTestId("region-state")).toHaveText("T8 T7 T6");
  expect(await order(page)).toEqual(["toast-T8", "toast-T7", "toast-T6"]);
  expect((await rendered()).sort()).toEqual(["toast-T6", "toast-T7", "toast-T8"]);
});

test("TO5: Close and close(id) run the exit and then remove the toast; unknown and repeated ids do nothing; without an animation, also under reduced motion, it is removed at once; one closed before it renders never renders", async ({
  page,
}, info) => {
  await fixture(page, "toast", info);

  // Close: State open turns false during the exit, which keeps the record in toasts().
  await page.getByTestId("add-exit").click();
  await expect(toast(page, "T1")).toHaveAttribute("data-open", "true");

  const closed = await watchExit(page, "toast-T1");

  await page.getByTestId("close-T1").click();

  const exited = await closed();

  expect(exited.exit!).toBeGreaterThanOrEqual(250);
  expect(exited.openAtLeaving).toBe("false");
  expect(exited.stateAtLeaving).toBe("T1");
  await expect(page.getByTestId("region-state")).toHaveText("");

  // close(id), then the same id again during the exit and after the removal.
  await page.getByTestId("add-exit").click();
  await page.getByTestId("add").click();
  await expect(page.getByTestId("region-state")).toHaveText("T3 T2");

  // The last id is T3's, without an exit.
  const byId = await watchExit(page, "toast-T3");

  await script(page, "close-last");
  await script(page, "close-last");
  expect((await byId()).exit ?? 0).toBeLessThan(200);
  await script(page, "close-last");
  await script(page, "close-unknown");
  await expect(page.getByTestId("region-state")).toHaveText("T2");
  await expect(toast(page, "T2")).toHaveAttribute("data-open", "true");

  // Reduced motion: the consumer's CSS drops the exit, so it is removed at once.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("add-reduce").click();

  const reduced = await watchExit(page, "toast-T4");

  await page.getByTestId("close-T4").click();
  expect((await reduced()).exit ?? 0).toBeLessThan(200);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByTestId("add-reduce").click();

  const animated = await watchExit(page, "toast-T5");

  await page.getByTestId("close-T5").click();
  expect((await animated()).exit!).toBeGreaterThanOrEqual(250);
  await expect(page.getByTestId("region-state")).toHaveText("T2");

  // Closed in the handler that added it: dropped, never rendered; the next add renders.
  const rendered = await watchRendered(page);

  await script(page, "add-close");
  await script(page, "add");
  await expect(page.getByTestId("region-state")).toHaveText("T7 T2");
  expect(await rendered()).toEqual(["toast-T7"]);
});

test("TO6: a new toast doesn't take focus; closing the focused last toast returns focus to what had it before the region, before the exit; with others open focus goes to the region, and Tab during the exit skips the inert closing toast for the next one; a focused toast the limit closes moves focus first", async ({
  page,
}, info) => {
  await fixture(page, "toast", info);

  const add = page.getByTestId("add-exit");
  const region = page.getByTestId("region");

  await add.focus();
  await page.keyboard.press("Enter");
  await expect(toast(page, "T1")).toHaveAttribute("data-open", "true");
  await expect(add).toBeFocused();

  // Close on the last toast: focus is back on the button before the exit starts, also after the
  // window's reactivation restored focus to the Close, a focusin without a relatedTarget.
  // Playwright's focus emulation masks a real window round trip, so the focusin is synthetic.
  await page.getByTestId("close-T1").focus();
  await page.getByTestId("close-T1").evaluate((node) => {
    node.dispatchEvent(new FocusEvent("focusin", { bubbles: true, relatedTarget: null }));
  });

  const last = await watchExit(page, "toast-T1");

  await page.keyboard.press("Enter");
  expect(await last()).toMatchObject({ exit: expect.any(Number), focusAtLeaving: "add-exit" });
  await expect(add).toBeFocused();

  // With others open: focus goes to the region, and Tab during T3's exit skips T3, which is
  // inert, for the next toast's Close.
  await page.getByTestId("add").click();
  await page.getByTestId("add-long").click();
  await expect(page.getByTestId("region-state")).toHaveText("T3 T2");
  await expect(toast(page, "T3")).not.toHaveAttribute("inert");
  await page.getByTestId("close-T3").focus();

  const exiting = await watchExit(page, "toast-T3");

  await page.keyboard.press("Enter");
  await expect(region).toBeFocused();
  await expect(toast(page, "T3")).toHaveAttribute("data-open", "false");
  await page.keyboard.press("Tab");

  const duringExit = await page.evaluate(() => {
    const closing = document.querySelector('[data-testid="toast-T3"]');

    return {
      focused: document.activeElement?.getAttribute("data-testid") ?? null,
      leaving: closing?.hasAttribute("data-leaving") ?? false,
      inert: closing?.getAttribute("inert") ?? null,
    };
  });

  expect(duringExit).toEqual({ focused: "close-T2", leaving: true, inert: "" });
  expect(await exiting()).toMatchObject({ exit: expect.any(Number), focusAtLeaving: "region" });
  await expect(page.getByTestId("close-T2")).toBeFocused();

  // The limit closes the focused oldest toast: focus moves to the region before its exit.
  await page.getByTestId("outside").focus();
  await script(page, "add-exit");
  await script(page, "add");
  await expect(page.getByTestId("region-state")).toHaveText("T5 T4 T2");

  // T2 is the oldest, without an exit; T4 has one. Close T2 first so the oldest has an exit.
  await page.getByTestId("close-T2").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("region-state")).toHaveText("T5 T4");
  await script(page, "add");
  await expect(page.getByTestId("region-state")).toHaveText("T6 T5 T4");
  await page.getByTestId("close-T4").focus();

  const limited = await watchExit(page, "toast-T4");

  await script(page, "add");
  expect(await limited()).toMatchObject({ exit: expect.any(Number), focusAtLeaving: "region" });
  await expect(region).toBeFocused();
  await expect(page.getByTestId("region-state")).toHaveText("T7 T6 T5");

  // Focus that left the region for another element forgets the button: entering again from
  // nothing, the last toast's close moves focus to the region.
  await script(page, "close-T5");
  await script(page, "close-T6");
  await script(page, "close-T7");
  await expect(page.getByTestId("region-state")).toHaveText("");
  await add.focus();
  await script(page, "add");
  await page.getByTestId("close-T8").focus();
  await page.getByTestId("outside").focus();
  await page.getByTestId("outside").blur();
  await page.getByTestId("close-T8").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("region-state")).toHaveText("");
  await expect(region).toBeFocused();
});

test("TO7: the abstract toaster isn't injectable; factory and existing Options replace the region's, a Toast's and a Close's through hostDirectives; toasters are independent and a second region on one throws; toasts wait for a region that mounts later, comes back or hydrates later, and one closing when its region is destroyed is dropped", async ({
  page,
  runtimeErrors,
  drainIssues,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const deferredRegion = page.getByTestId("deferred-region");

  await fixture(page, "toast", info, async () => {
    if (incremental) {
      await expect(deferredRegion).toHaveAttribute("aria-live", "polite");
    }
  });

  // The abstract base has no provider: only the consumer's subclass resolves.
  await expect(page.getByTestId("toaster-injectable")).toHaveText("false true");

  // Factory region: the other toaster, a limit of 1 and no expiry, over the exposed inputs.
  await page.getByTestId("other-add").click();
  await expect(page.getByTestId("factory-region-state")).toHaveText("Other1");
  await page.getByTestId("other-add").click();
  await expect(page.getByTestId("factory-region-state")).toHaveText("Other2");
  await expect(page.getByTestId("factory-region")).toHaveAttribute("aria-live", "polite");
  await page.waitForTimeout(300);
  await expect(page.getByTestId("factory-region-state")).toHaveText("Other2");
  await expect(page.getByTestId("region-state")).toHaveText("");

  // Factory Toast: its record, not the decoy its exposed input binds.
  await expect(page.getByTestId("probe-Other2")).toHaveAttribute("data-open", "true");
  await expect(page.getByTestId("factory-close-Other2")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("factory-close-Other2")).not.toHaveAttribute("disabled");
  await page.getByTestId("factory-close-Other2").click({ force: true });
  await page.waitForTimeout(100);
  await expect(page.getByTestId("factory-region-state")).toHaveText("Other2");
  await page.getByTestId("close-Other2").click();
  await expect(page.getByTestId("factory-region-state")).toHaveText("");

  // Existing region and Toast: the third toaster with a limit of 2; an existing Close stays
  // enabled over its exposed `disabled`.
  await page.getByTestId("third-add").click();
  await page.getByTestId("third-add").click();
  await page.getByTestId("third-add").click();
  await expect(page.getByTestId("existing-region-state")).toHaveText("Third3 Third2");
  await expect(page.getByTestId("probe-Third3")).toHaveAttribute("data-open", "true");
  await expect(page.getByTestId("close-Third3")).not.toHaveAttribute("aria-disabled");
  await expect(page.getByTestId("close-Third3")).not.toHaveAttribute("disabled");
  await page.getByTestId("close-Third3").click();
  await expect(page.getByTestId("existing-region-state")).toHaveText("Third2");

  // A toast added before its region mounts waits; destroying the region sends an open toast
  // back and drops one running its exit.
  await page.getByTestId("late-add").click();
  await expect(page.getByTestId("late-region")).toHaveCount(0);
  await page.getByTestId("late-mount").click();
  await expect(toast(page, "Late1")).toBeVisible();
  await page.getByTestId("late-add-exit").click();
  await expect(toast(page, "Late2")).toBeVisible();

  // Close Late2, then unmount the region as soon as its 300 ms exit starts.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const closing = document.querySelector('[data-testid="toast-Late2"]');
        const close = document.querySelector('[data-testid="late-close-exit"]');
        const unmount = document.querySelector('[data-testid="late-unmount"]');

        if (
          closing === null ||
          !(close instanceof HTMLButtonElement) ||
          !(unmount instanceof HTMLButtonElement)
        ) {
          reject(new Error("Expected the late toast and its fixture controls"));

          return;
        }

        const observer = new MutationObserver(() => {
          if (closing.hasAttribute("data-leaving")) {
            observer.disconnect();
            unmount.click();
            resolve();
          }
        });

        observer.observe(closing, { attributes: true, attributeFilter: ["data-leaving"] });
        close.click();
      }),
  );
  await expect(page.getByTestId("late-region")).toHaveCount(0);

  const remounted = await watchRendered(page);

  await page.getByTestId("late-mount").click();
  await expect(toast(page, "Late1")).toBeVisible();
  await page.waitForTimeout(300);
  await expect(toast(page, "Late1")).toHaveAttribute("data-present", "");
  expect(await remounted()).toEqual(["toast-Late1"]);

  // A focus listener that destroys the region during a close's focus move finds that toast
  // already closing: the destroyed region writes nothing afterwards, so neither a later region
  // nor a replacement registered inside the close shows it, and an open toast comes back with
  // its full duration.
  const lifetime = page.getByTestId("lifetime-region");

  await page.mouse.move(0, 0);
  await page.clock.install();
  await paused(page, async () => {
    // The return target's listener destroys the region.
    await script(page, "lifetime-mount");
    await script(page, "lifetime-add");
    await page.clock.runFor(100);
    await expect(page.getByTestId("lifetime-toast-1-L1")).toHaveAttribute("data-open", "true");
    await page.getByTestId("lifetime-return").focus();
    await page.getByTestId("lifetime-close-L1").focus();
    await script(page, "lifetime-arm-return-destroy");
    await page.keyboard.press("Enter");
    await expect(lifetime).toHaveCount(0);
    await expect(page.getByTestId("lifetime-return")).toBeFocused();

    const rendered = await watchRendered(page);

    await script(page, "lifetime-mount");
    await page.clock.runFor(100);
    await expect(lifetime).toHaveAttribute("data-generation", "2");
    await expect(page.getByTestId("lifetime-region-state")).toHaveText("");
    expect(await rendered()).toEqual([]);

    // The return target's listener replaces the region, which registers inside the close.
    await script(page, "lifetime-add");
    await page.clock.runFor(100);
    await page.getByTestId("lifetime-return").focus();
    await page.getByTestId("lifetime-close-L2").focus();
    await script(page, "lifetime-arm-return-replace");
    await page.keyboard.press("Enter");
    await page.clock.runFor(100);
    await expect(lifetime).toHaveAttribute("data-generation", "3");
    await expect(page.getByTestId("lifetime-region-state")).toHaveText("");
    expect(await rendered()).toEqual(["lifetime-toast-2-L2"]);

    // The region host's listener replaces the region while L3 stays open, 500 ms into its
    // 1000: the replacement shows L3 alone, from the start of its duration.
    await script(page, "lifetime-add");
    await page.clock.runFor(400);
    await script(page, "lifetime-add");
    await page.clock.runFor(100);
    await page.getByTestId("lifetime-close-L4").focus();
    await script(page, "lifetime-arm-host-replace");
    await page.keyboard.press("Enter");
    await page.clock.runFor(100);
    await expect(lifetime).toHaveAttribute("data-generation", "4");
    await expect(page.getByTestId("lifetime-region-state")).toHaveText("L3");
    await expect(page.getByTestId("lifetime-toast-4-L3")).toHaveAttribute("data-open", "true");
    await page.clock.runFor(800);
    await expect(page.getByTestId("lifetime-toast-4-L3")).toHaveAttribute("data-open", "true");
    await page.clock.runFor(300);
    await expect(page.getByTestId("lifetime-toast-4-L3")).toHaveCount(0);
    expect(await rendered()).toEqual([
      "lifetime-toast-2-L2",
      "lifetime-toast-3-L3",
      "lifetime-toast-3-L4",
      "lifetime-toast-4-L3",
    ]);
  });

  // A toast added before a deferred region hydrates waits for it.
  await page.getByTestId("deferred-add").click();

  if (incremental) {
    await page.waitForTimeout(300);
    await expect(deferredRegion.locator("li")).toHaveCount(0);
  }

  await page.getByTestId("deferred-hydrate").click();
  await expect(toast(page, "Deferred1")).toBeVisible();

  // A second region on the main toaster throws when it registers, through ErrorHandler.
  await drainIssues();
  expect(runtimeErrors.records).toEqual([]);
  info.annotations.push({ type: "expected-error", description: "second region" });
  await page.getByTestId("mount-second-region").click();
  await expect
    .poll(async () => {
      await drainIssues();

      return runtimeErrors.records.length;
    })
    .toBeGreaterThan(0);

  for (const record of runtimeErrors.records) {
    expect(isSecondRegion(record), record.text).toBe(true);
  }

  // The first region keeps working.
  await page.getByTestId("add").click();
  await expect(page.getByTestId("region-state")).toHaveText("T1");
});

/** Whether the dialog is in a modal session (`:modal`). */
function modal(dialog: Locator): Promise<boolean> {
  return dialog.evaluate((element) => element.matches(":modal"));
}

/** Chromium's accessibility tree: whether the node `selector` matches is ignored. */
async function ignored(page: Page, selector: string): Promise<boolean> {
  const cdp = await page.context().newCDPSession(page);

  try {
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    const { nodes } = await cdp.send("Accessibility.getPartialAXTree", {
      nodeId,
      fetchRelatives: false,
    });

    return nodes[0]!.ignored;
  } finally {
    await cdp.detach();
  }
}

/**
 * Records, from now on, the page time (`performance.now()`, the page clock's once installed) of
 * each dialog's first `toggle` or `close` after it stopped being open, by test ID, captured at the
 * window before the region's own listeners on the document.
 */
async function watchDialogCloses(page: Page): Promise<(testId: string) => Promise<number | null>> {
  await page.evaluate(() => {
    const closedAt: Record<string, number> = {};
    const closed = (event: Event): void => {
      const dialog = event.target;

      if (!(dialog instanceof HTMLDialogElement) || dialog.open) {
        return;
      }

      const testId = dialog.getAttribute("data-testid") ?? "";

      closedAt[testId] ??= performance.now();
    };

    window.dialogClosedAt = closedAt;
    window.addEventListener("toggle", closed, true);
    window.addEventListener("close", closed, true);
  });

  return (testId) => page.evaluate((testId) => window.dialogClosedAt![testId] ?? null, testId);
}

test("TO8: falsifier — a toast an AlertDialog's Delete adds as it requests close is held through the dialog's 300 ms exit and renders at its native close(), with focus back on the opener, and its time runs from then; Chromium's accessibility tree has the region ignored under the modal and the region and the toast not ignored after", async ({
  page,
}, info) => {
  await fixture(page, "toast-modal", info);

  const chromium = info.project.use.browserName === "chromium";
  const content = page.getByTestId("delete-content");

  await page.getByTestId("delete-trigger").click();
  await expect.poll(() => modal(content)).toBe(true);
  await expect(page.getByTestId("delete-cancel")).toBeFocused();

  // The premise: under the modal the region is inert and out of the accessibility tree.
  if (chromium) {
    expect(await ignored(page, '[data-testid="region"]')).toBe(true);
  }

  // Sampled in the page on every frame, so no round trip can straddle the exit's end.
  await page.evaluate(() => {
    const dialog = document.querySelector<HTMLDialogElement>('[data-testid="delete-content"]')!;
    const region = document.querySelector('[data-testid="region"]')!;
    const state = document.querySelector('[data-testid="region-state"]')!;

    window.toastDeleteFlow = new Promise<DeleteFlow>((resolve) => {
      const flow: DeleteFlow = {
        frames: [],
        closedAt: null,
        closedFrame: null,
        rendered: null,
        removedAt: null,
      };
      const start = performance.now();
      const closed = (event: Event): void => {
        if (event.target === dialog && !dialog.open && flow.closedAt === null) {
          flow.closedAt = performance.now();
          flow.closedFrame = flow.frames.length;
        }
      };

      window.addEventListener("toggle", closed, true);
      window.addEventListener("close", closed, true);
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof HTMLLIElement && flow.rendered === null) {
              flow.rendered = {
                at: performance.now(),
                frame: flow.frames.length,
                open: dialog.open,
                modal: document.querySelector("dialog:modal") !== null,
                focus: document.activeElement?.getAttribute("data-testid") ?? null,
              };
            }
          }

          for (const node of record.removedNodes) {
            if (node instanceof HTMLLIElement) {
              flow.removedAt = performance.now();
            }
          }
        }
      }).observe(region, { childList: true, subtree: true });

      function frame(): void {
        flow.frames.push({
          at: performance.now(),
          open: dialog.open,
          leaving: dialog.hasAttribute("data-leaving"),
          toasts: region.querySelectorAll("li").length,
          state: state.textContent?.trim() ?? "",
        });

        if (flow.removedAt !== null || performance.now() - start > 8000) {
          resolve(flow);

          return;
        }

        requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);
    });
  });

  await page.getByTestId("delete-action").click();

  const toastElement = toast(page, "Deleted1");

  await expect(toastElement).toHaveAttribute("data-open", "true");
  await expect(page.getByTestId("delete-trigger")).toBeFocused();

  // Released into a region that isn't inert any more: both are in the accessibility tree.
  if (chromium) {
    expect(await ignored(page, '[data-testid="region"]')).toBe(false);
    expect(await ignored(page, '[data-testid="toast-Deleted1"]')).toBe(false);
  }

  const flow = await page.evaluate(() => window.toastDeleteFlow!);

  await info.attach("delete-flow", {
    body: JSON.stringify(flow, null, 2),
    contentType: "application/json",
  });

  // The exit ran for its 300 ms while the dialog stayed open, and no toast was shown in it.
  const exit = flow.frames.filter((frame) => frame.leaving && frame.open);

  expect(exit.length).toBeGreaterThan(2);
  expect(exit[exit.length - 1]!.at - exit[0]!.at).toBeGreaterThanOrEqual(200);

  for (const frame of flow.frames) {
    if (frame.open) {
      expect(frame).toEqual({ ...frame, toasts: 0, state: "" });
    }
  }

  // Rendered at the native close(): after the dialog left the top layer, within two frames.
  expect(flow.closedAt).not.toBeNull();
  expect(flow.rendered).toEqual({
    at: flow.rendered!.at,
    frame: flow.rendered!.frame,
    open: false,
    modal: false,
    focus: "delete-trigger",
  });
  expect(flow.rendered!.at).toBeGreaterThanOrEqual(flow.closedAt!);
  expect(flow.rendered!.frame - flow.closedFrame!).toBeLessThanOrEqual(2);

  // Its 2000 ms ran from the close, not from the Delete 300 ms earlier.
  expect(flow.removedAt).not.toBeNull();
  expect(flow.removedAt! - flow.closedAt!).toBeGreaterThanOrEqual(1995);
  await expect(toastElement).toHaveCount(0);
});

test("TO9: a toast added while a dialog stays open is held, using no time, until no modal dialog is left: nested dialogs hold it until the last closes, a non-Origami showModal() holds it too; a toast shown before the modal stays open under it and keeps its time", async ({
  page,
}, info) => {
  await fixture(page, "toast-modal", info);

  const rendered = await watchRendered(page);
  const editor = page.getByTestId("editor-content");
  const nested = page.getByTestId("nested-content");
  const native = page.getByTestId("native-content");
  const state = page.getByTestId("region-state");

  await page.clock.install();

  const closedAt = await watchDialogCloses(page);

  /** Runs the page clock to `ms` milliseconds after `from`, page time. */
  async function runTo(from: number, ms: number): Promise<void> {
    const now = await page.evaluate(() => performance.now());

    await page.clock.runFor(Math.round(from + ms - now));
  }

  await paused(page, async () => {
    // T1 is shown before the editor opens: under it, it stays and closes at its 1000 ms.
    await script(page, "add");
    await page.clock.runFor(100);
    await expect(toast(page, "T1")).toHaveAttribute("data-open", "true");
    await script(page, "editor-trigger");
    await page.clock.runFor(100);
    expect(await modal(editor)).toBe(true);

    // E1, added inside, is held: it isn't in State and never renders while a dialog is modal.
    await script(page, "editor-add");
    await page.clock.runFor(799);
    await expect(toast(page, "T1")).toHaveAttribute("data-open", "true");
    await expect(state).toHaveText("T1");
    await page.clock.runFor(1);
    await page.clock.runFor(200);
    await expect(toast(page, "T1")).toHaveCount(0);
    expect(await modal(editor)).toBe(true);
    await page.clock.runFor(5000);
    await expect(state).toHaveText("");

    // A nested dialog: N1 added in it; closing it leaves the editor modal, so both stay held.
    await script(page, "nested-trigger");
    await page.clock.runFor(100);
    expect(await modal(nested)).toBe(true);
    await script(page, "nested-add");
    await page.clock.runFor(100);
    await expect(state).toHaveText("");
    await script(page, "nested-close");
    await page.clock.runFor(100);
    await expect.poll(() => closedAt("nested-content")).not.toBeNull();
    expect(await modal(nested)).toBe(false);
    expect(await modal(editor)).toBe(true);
    await page.clock.runFor(2000);
    await expect(state).toHaveText("");

    // The last modal dialog closes: both are shown, newest first, and run 1000 ms from then.
    await script(page, "editor-close");
    await page.clock.runFor(100);
    await expect.poll(() => closedAt("editor-content")).not.toBeNull();

    const editorClosed = (await closedAt("editor-content"))!;

    await runTo(editorClosed, 100);
    await expect(state).toHaveText("N1 E1");
    await expect(toast(page, "N1")).toHaveAttribute("data-open", "true");
    await expect(toast(page, "E1")).toHaveAttribute("data-open", "true");
    await runTo(editorClosed, 999);
    await expect(toast(page, "E1")).toHaveAttribute("data-open", "true");
    await expect(toast(page, "N1")).toHaveAttribute("data-open", "true");
    await page.clock.runFor(1);
    await page.clock.runFor(200);
    await expect(state).toHaveText("");

    // A dialog Origami doesn't own, shown with showModal(), holds X1 the same way.
    await script(page, "native-open");
    expect(await modal(native)).toBe(true);
    await script(page, "native-add");
    await page.clock.runFor(100);
    await expect(state).toHaveText("");
    await page.clock.runFor(2900);
    await expect(state).toHaveText("");
    await script(page, "native-close");
    await expect.poll(() => closedAt("native-content")).not.toBeNull();

    const nativeClosed = (await closedAt("native-content"))!;

    await runTo(nativeClosed, 100);
    await expect(toast(page, "X1")).toHaveAttribute("data-open", "true");
    await runTo(nativeClosed, 999);
    await expect(toast(page, "X1")).toHaveAttribute("data-open", "true");
    await page.clock.runFor(1);
    await page.clock.runFor(200);
    await expect(toast(page, "X1")).toHaveCount(0);
  });

  // No held toast ever rendered early: each first appeared only after its release.
  expect(await rendered()).toEqual(["toast-T1", "toast-N1", "toast-E1", "toast-X1"]);
});

/**
 * Watches, from now on, the open dialog `testId` and the main region's toast `title`, sampled in
 * the page on every frame: whether the dialog's closing events reach the window, when it leaves
 * the document and when the toast is inserted. The returned function waits for the result, at
 * most 5 s.
 */
async function watchRemovedRelease(
  page: Page,
  testId: string,
  title: string,
): Promise<() => Promise<RemovedRelease>> {
  await page.getByTestId(testId).evaluate((dialog, title) => {
    const region = document.querySelector('[data-testid="region"]')!;
    const selector = `li[data-testid="toast-${title}"]`;

    window.toastRemovedRelease = new Promise<RemovedRelease>((resolve) => {
      const flow: RemovedRelease = {
        frames: [],
        removedFrame: null,
        eventReached: false,
        rendered: null,
      };
      const start = performance.now();
      const reached = (event: Event): void => {
        const closing =
          event.type === "close" || (event instanceof ToggleEvent && event.newState === "closed");

        if (event.target === dialog && closing) {
          flow.eventReached = true;
        }
      };

      window.addEventListener("toggle", reached, true);
      window.addEventListener("close", reached, true);
      new MutationObserver(() => {
        if (flow.removedFrame === null && !dialog.isConnected) {
          flow.removedFrame = flow.frames.length;
        }

        if (flow.rendered === null && region.querySelector(selector) !== null) {
          flow.rendered = {
            frame: flow.frames.length,
            connected: dialog.isConnected,
            modal: document.querySelector("dialog:modal") !== null,
            focus: document.activeElement?.getAttribute("data-testid") ?? null,
          };
        }
      }).observe(document.body, { childList: true, subtree: true });

      function frame(): void {
        flow.frames.push({
          at: performance.now(),
          connected: dialog.isConnected,
          toasts: region.querySelectorAll(selector).length,
        });

        const settled = flow.rendered !== null && flow.frames.length > flow.rendered.frame + 3;

        if (settled || performance.now() - start > 5000) {
          resolve(flow);

          return;
        }

        requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);
    });
  }, title);

  return () => page.evaluate(() => window.toastRemovedRelease!);
}

/**
 * The toast was held while the dialog was in the document and released within a few frames of
 * its removal, though none of the dialog's closing events reached the document.
 */
function expectReleasedAtRemoval(flow: RemovedRelease, focus?: string): void {
  // The premise: the document never heard the dialog close.
  expect(flow.eventReached).toBe(false);
  expect(flow.removedFrame).not.toBeNull();

  for (const frame of flow.frames) {
    if (frame.connected) {
      expect(frame).toEqual({ ...frame, toasts: 0 });
    }
  }

  expect(flow.rendered).toEqual({
    frame: flow.rendered!.frame,
    connected: false,
    modal: false,
    focus: focus ?? flow.rendered!.focus,
  });
  expect(flow.rendered!.frame - flow.removedFrame!).toBeLessThanOrEqual(4);
}

test("TO10: falsifier — a held toast is released within a few frames once its modal dialog leaves the document before its closing events reach it: an opened AlertDialog the opener removes after its exit, a plain dialog closed and removed in one task, and one removed without close()", async ({
  page,
}, info) => {
  await fixture(page, "toast-modal", info);

  const state = page.getByTestId("region-state");

  // The delete flow through injectOrigamiDialogOpener: Delete adds the toast, then requests
  // close; after the 300 ms exit the opener closes the dialog natively and removes it in the same
  // render, before its queued events dispatch.
  await page.getByTestId("opened-delete-open").focus();
  await page.keyboard.press("Enter");

  const opened = page.getByTestId("opened-delete-content");

  await expect.poll(() => modal(opened)).toBe(true);
  await expect(page.getByTestId("opened-delete-cancel")).toBeFocused();

  const deleteFlow = await watchRemovedRelease(page, "opened-delete-content", "Opened1");

  await script(page, "opened-delete-action");
  await expect(toast(page, "Opened1")).toHaveAttribute("data-open", "true");

  const flow = await deleteFlow();

  await info.attach("opened-delete-flow", {
    body: JSON.stringify(flow, null, 2),
    contentType: "application/json",
  });
  expectReleasedAtRemoval(flow, "opened-delete-open");

  // Its exit ran with the dialog in the document and the toast held.
  const exit = flow.frames.filter((frame) => frame.connected);

  expect(exit[exit.length - 1]!.at - exit[0]!.at).toBeGreaterThanOrEqual(200);

  // A plain modal dialog closed and removed in one task.
  const removable = page.getByTestId("removable-content");

  await script(page, "removable-open");
  expect(await modal(removable)).toBe(true);
  await script(page, "removable-add");
  await page.waitForTimeout(100);
  await expect(state).toHaveText("Opened1");

  const closeRemoveFlow = await watchRemovedRelease(page, "removable-content", "R1");

  await script(page, "removable-close-remove");
  await expect(toast(page, "R1")).toHaveAttribute("data-open", "true");
  expectReleasedAtRemoval(await closeRemoveFlow());

  // The same dialog, shown again and removed without close().
  await script(page, "removable-open");
  expect(await modal(removable)).toBe(true);
  await script(page, "removable-add");
  await page.waitForTimeout(100);
  await expect(toast(page, "R2")).toHaveCount(0);

  const removeFlow = await watchRemovedRelease(page, "removable-content", "R2");

  await script(page, "removable-remove");
  await expect(toast(page, "R2")).toHaveAttribute("data-open", "true");
  expectReleasedAtRemoval(await removeFlow());
});

test("TO11: falsifier — a modal's close releases two held toasts into a lifetime region with a limit of 1, whose limit close moves focus to the region host, whose listener destroys the region: the destroyed region shows nothing more and a later region shows both with their full duration; a replacement registered in that listener shows both the same way", async ({
  page,
}, info) => {
  await fixture(page, "toast", info);

  const lifetime = page.getByTestId("lifetime-region");
  const state = page.getByTestId("lifetime-region-state");
  const dialog = page.getByTestId("lifetime-dialog");

  await page.mouse.move(0, 0);
  await page.clock.install();

  const rendered = await watchRendered(page);

  await paused(page, async () => {
    // L1 is open and focused; the dialog opened from it holds L2 and L3.
    await script(page, "lifetime-mount-limited");
    await script(page, "lifetime-add");
    await page.clock.runFor(100);
    await expect(page.getByTestId("lifetime-toast-1-L1")).toHaveAttribute("data-open", "true");
    await page.getByTestId("lifetime-close-L1").focus();
    await script(page, "lifetime-arm-host-destroy");
    await script(page, "lifetime-dialog-open");
    expect(await modal(dialog)).toBe(true);
    await script(page, "lifetime-dialog-add");
    await script(page, "lifetime-dialog-add");
    await page.clock.runFor(100);
    await expect(state).toHaveText("L1");

    // Closing it returns focus to L1 and releases L2, which closes L1 for the limit; its focus
    // move to the host destroys the region before L3's turn.
    await script(page, "lifetime-dialog-close");
    await expect(lifetime).toHaveCount(0);

    await script(page, "lifetime-mount");
    await page.clock.runFor(100);
    await expect(lifetime).toHaveAttribute("data-generation", "2");
    await expect(state).toHaveText("L3 L2");
    await expect(page.getByTestId("lifetime-toast-2-L2")).toHaveAttribute("data-open", "true");
    await expect(page.getByTestId("lifetime-toast-2-L3")).toHaveAttribute("data-open", "true");
    await page.clock.runFor(800);
    await expect(state).toHaveText("L3 L2");
    await page.clock.runFor(300);
    await expect(state).toHaveText("");

    // Again, with the host's listener replacing the region inside that close.
    await script(page, "lifetime-mount-limited");
    await script(page, "lifetime-add");
    await page.clock.runFor(100);
    await expect(lifetime).toHaveAttribute("data-generation", "3");
    await expect(page.getByTestId("lifetime-toast-3-L4")).toHaveAttribute("data-open", "true");
    await page.getByTestId("lifetime-close-L4").focus();
    await script(page, "lifetime-arm-host-replace");
    await script(page, "lifetime-dialog-open");
    expect(await modal(dialog)).toBe(true);
    await script(page, "lifetime-dialog-add");
    await script(page, "lifetime-dialog-add");
    await page.clock.runFor(100);
    await expect(state).toHaveText("L4");
    await script(page, "lifetime-dialog-close");
    await page.clock.runFor(100);
    await expect(lifetime).toHaveAttribute("data-generation", "4");
    await expect(state).toHaveText("L6 L5");
    await page.clock.runFor(800);
    await expect(state).toHaveText("L6 L5");
    await page.clock.runFor(300);
    await expect(state).toHaveText("");
  });

  // No toast rendered in a region after it was destroyed.
  expect((await rendered()).sort()).toEqual([
    "lifetime-toast-1-L1",
    "lifetime-toast-2-L2",
    "lifetime-toast-2-L3",
    "lifetime-toast-3-L4",
    "lifetime-toast-4-L5",
    "lifetime-toast-4-L6",
  ]);
});

test("TO12: falsifier — a modal's close releases two held toasts into a lifetime region with a limit of 1 while focus is in the first toast; the limit close's focus move to the region host sends focus outside, while the first toast's exit still runs: the third toast's time runs and it closes on time", async ({
  page,
}, info) => {
  await fixture(page, "toast", info);
  await page.addStyleTag({
    content: `
      @keyframes to12-exit { to { opacity: 0.2; } }
      [data-testid="lifetime-toast-1-L1"][data-leaving] { animation: to12-exit 10s linear forwards; }
    `,
  });
  await page.mouse.move(0, 0);
  await page.clock.install();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);

  const click = async (id: string): Promise<void> => {
    await page.getByTestId(id).evaluate((node: HTMLButtonElement) => node.click());
  };

  await click("lifetime-mount-limited");
  await click("lifetime-add");
  await page.clock.runFor(100);
  await page.getByTestId("lifetime-close-L1").focus();
  await page.getByTestId("lifetime-region").evaluate((region) => {
    region.addEventListener("focus", () => {
      document.querySelector<HTMLButtonElement>('[data-testid="lifetime-return"]')!.focus();
    });
  });

  await click("lifetime-dialog-open");
  await click("lifetime-dialog-add");
  await click("lifetime-dialog-add");
  await page.clock.runFor(100);
  await expect(page.getByTestId("lifetime-region-state")).toHaveText("L1");

  await click("lifetime-dialog-close");
  await page.clock.runFor(100);
  await expect(page.getByTestId("lifetime-return")).toBeFocused();
  await expect(page.getByTestId("lifetime-region-state")).toHaveText("L3 L1");

  await page.clock.runFor(2000);
  await expect(page.getByTestId("lifetime-toast-1-L3")).toHaveCount(0, { timeout: 500 });
});
