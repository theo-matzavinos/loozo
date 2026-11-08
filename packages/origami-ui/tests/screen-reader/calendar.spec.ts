import { expect, test } from "./reader-test.js";
import type { Locator, Page } from "@playwright/test";
import type { Run } from "./reader-test.js";

// Records what each reader says while the keyboard drives the Calendars on /calendar-speech, a page
// whose only live regions are the Calendars' own Headings and the range's prompt: entering a grid in a Field, full-date
// cells, today, a disabled day, moving into the next month and back, choosing; Previous, the view
// switch and drilling down from the years; several days; a range's anchor and end; a month
// Calendar. Same rules as menu.spec.ts: speech is never asserted, every key and focus is its own
// captured step, a step's action waits only for the first DOM change proving it happened, and
// state is checked outside the captures. The keys are Playwright's, sent to the page.

/** The cell for `date` in the Calendar with root test ID `root`. */
function cell(page: Page, root: string, date: string): Locator {
  return page.getByTestId(root).locator(`[data-date="${date}"]`);
}

/**
 * Presses `key` in one captured step and waits for focus to land on `target` and, for a cell, for
 * it to become the grid's tab stop: Angular writes the `tabindex` a render after focus moves, and
 * a Tab sent before then leaves from the previous tab stop.
 */
async function press(
  run: Run,
  page: Page,
  key: string,
  target: Locator,
  name: string,
): Promise<void> {
  await run.step(`${key} → ${name}`, async () => {
    await page.keyboard.press(key);
    await expect(target).toBeFocused();

    const role = await target.getAttribute("role");

    if (role === "gridcell") {
      await expect(target).toHaveAttribute("tabindex", "0");
    }
  });
}

test("c1-day", async ({ page, run }) => {
  await run.open("/calendar-speech");
  await run.step("focus Next month", () => page.getByTestId("appeal-next").focus());
  await press(run, page, "Tab", cell(page, "appeal-root", "2026-10-27"), "27 October (today)");
  await press(
    run,
    page,
    "ArrowRight",
    cell(page, "appeal-root", "2026-10-28"),
    "28 October (disabled)",
  );
  await press(run, page, "ArrowDown", cell(page, "appeal-root", "2026-11-04"), "4 November");
  await press(run, page, "ArrowUp", cell(page, "appeal-root", "2026-10-28"), "28 October");
  await press(run, page, "ArrowLeft", cell(page, "appeal-root", "2026-10-27"), "27 October");
  await run.step("Enter on 27 October", async () => {
    await page.keyboard.press("Enter");
    await expect(cell(page, "appeal-root", "2026-10-27")).toHaveAttribute("aria-selected", "true");
  });
  await press(run, page, "Tab", page.getByTestId("appeal-after"), "After");
});

test("c2-views", async ({ page, run }) => {
  await run.open("/calendar-speech");
  const previous = page.getByTestId("departure-previous");
  const viewSwitch = page.getByTestId("departure-switch");

  await run.step("focus Previous month", () => previous.focus());
  await run.step("Enter on Previous month", async () => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("departure-heading")).toHaveText("September 2026");
  });
  await press(run, page, "Tab", viewSwitch, "the view switch");
  await run.step("Enter on the view switch", async () => {
    await page.keyboard.press("Enter");
    await expect(cell(page, "departure-root", "2026")).toBeVisible();
  });
  await run.check("the view switch kept focus", () => expect(viewSwitch).toBeFocused());
  await press(run, page, "Tab", page.getByTestId("departure-next"), "Next 12 years");
  await press(run, page, "Tab", cell(page, "departure-root", "2026"), "2026");
  await press(run, page, "ArrowRight", cell(page, "departure-root", "2027"), "2027");
  await press(run, page, "Enter", cell(page, "departure-root", "2027-09"), "September 2027");
  await press(run, page, "Enter", cell(page, "departure-root", "2027-09-01"), "1 September 2027");
  await run.check("the days of September 2027", () =>
    expect(page.getByTestId("departure-heading")).toHaveText("September 2027"),
  );
});

test("c3-multiple", async ({ page, run }) => {
  await run.open("/calendar-speech");
  const october27 = cell(page, "delivery-root", "2026-10-27");
  const october28 = cell(page, "delivery-root", "2026-10-28");

  await run.step("focus Next month", () => page.getByTestId("delivery-next").focus());
  await press(run, page, "Tab", october27, "27 October");
  await run.step("Enter on 27 October", async () => {
    await page.keyboard.press("Enter");
    await expect(october27).toHaveAttribute("aria-selected", "true");
  });
  await press(run, page, "ArrowRight", october28, "28 October");
  await run.step("Space on 28 October", async () => {
    await page.keyboard.press("Space");
    await expect(october28).toHaveAttribute("aria-selected", "true");
  });
  await press(run, page, "ArrowLeft", october27, "27 October");
  await run.step("Enter on 27 October again", async () => {
    await page.keyboard.press("Enter");
    await expect(october27).toHaveAttribute("aria-selected", "false");
  });
  await press(run, page, "Tab", page.getByTestId("delivery-after"), "After");
  await run.check("28 October chosen alone", async () => {
    await expect(october27).toHaveAttribute("aria-selected", "false");
    await expect(october28).toHaveAttribute("aria-selected", "true");
  });
});

test("c4-range", async ({ page, run }) => {
  await run.open("/calendar-speech");
  const october27 = cell(page, "trip-root", "2026-10-27");
  const october29 = cell(page, "trip-root", "2026-10-29");

  await run.step("focus Next month", () => page.getByTestId("trip-next").focus());
  await press(run, page, "Tab", october27, "27 October");
  // The anchor has no ARIA by design: only the page's live prompt changes.
  await run.step("Enter on 27 October (anchor)", async () => {
    await page.keyboard.press("Enter");
    await expect(page.getByText("Choose the last day")).toBeVisible();
  });
  await press(run, page, "ArrowRight", cell(page, "trip-root", "2026-10-28"), "28 October");
  await press(run, page, "ArrowRight", october29, "29 October");
  await run.step("Enter on 29 October (end)", async () => {
    await page.keyboard.press("Enter");
    await expect(october29).toHaveAttribute("aria-selected", "true");
  });
  await press(run, page, "ArrowLeft", cell(page, "trip-root", "2026-10-28"), "28 October");
  await press(run, page, "Tab", page.getByTestId("trip-after"), "After");
  await run.check("27 to 29 October chosen", async () => {
    await expect(october27).toHaveAttribute("aria-selected", "true");
    await expect(cell(page, "trip-root", "2026-10-28")).toHaveAttribute("aria-selected", "true");
    await expect(cell(page, "trip-root", "2026-10-30")).toHaveAttribute("aria-selected", "false");
  });
});

test("c5-month", async ({ page, run }) => {
  await run.open("/calendar-speech");
  const february = cell(page, "expiry-root", "2027-02");

  await run.step("focus Next year", () => page.getByTestId("expiry-next").focus());
  await press(run, page, "Tab", cell(page, "expiry-root", "2026-10"), "October 2026");
  await press(run, page, "ArrowRight", cell(page, "expiry-root", "2026-11"), "November 2026");
  await press(run, page, "ArrowDown", february, "February 2027");
  await run.step("Enter on February 2027", async () => {
    await page.keyboard.press("Enter");
    await expect(february).toHaveAttribute("aria-selected", "true");
  });
  await press(run, page, "Tab", page.getByTestId("expiry-after"), "After");
});
