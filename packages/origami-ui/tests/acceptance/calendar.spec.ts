import { test, expect } from "./contract-test.js";
import type { Locator, Page, TestInfo } from "playwright/test";
import {
  assertReferences,
  bootstrapHeld,
  fixture,
  stopRetentionObservation,
} from "./observation.js";

/** The fixture's calendar marked `name`. */
function root(page: Page, name: string): Locator {
  return page.getByTestId(`${name}-root`);
}

/** The cell of `date` in the calendar marked `name`. */
function cell(page: Page, name: string, date: string): Locator {
  return root(page, name).locator(`td[data-date="${date}"]`);
}

/**
 * A wrong write would render only after the zoneless scheduler's next turn (an animation frame
 * or a timer), so let both pass before asserting it never happened.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))),
  );
}

/** Exactly one cell of the calendar is the tab stop, and it is `date`; null means none is. */
async function expectTabStop(page: Page, name: string, date: string | null): Promise<void> {
  const stops = root(page, name).locator('td[tabindex="0"]');

  if (date === null) {
    await expect(stops).toHaveCount(0);

    return;
  }

  await expect(stops).toHaveCount(1);
  await expect(stops).toHaveAttribute("data-date", date);
}

/** Presses `key` on the focused cell and expects focus on the cell of `date`. */
async function press(page: Page, key: string, date: string, name = "a"): Promise<void> {
  await page.keyboard.press(key);
  await expect(cell(page, name, date)).toBeFocused();
  await expectTabStop(page, name, date);
}

/** Today in `timeZone`, `YYYY-MM-DD`, on the test runner's clock. */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** The en-US heading of a day's month, such as "October 2026". */
function monthHeading(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Today on the page's clock in the page's time zone. */
async function browserToday(page: Page): Promise<string> {
  return page.evaluate(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${now.getFullYear()}-${month}-${day}`;
  });
}

/** The server's seed for the seeded calendar, read from the raw server HTML before bootstrap. */
async function serverSeed(page: Page): Promise<{ today: string; weekStart: string }> {
  const seeded = root(page, "seed");
  const today = await seeded.getAttribute("data-today");
  const weekStart = await seeded.getAttribute("data-week-start");

  expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(weekStart).toMatch(/^[1-7]$/);

  return { today: today!, weekStart: weekStart! };
}

test("CA1: grid semantics in server HTML and after hydration: full-date names, one tab stop on today, the seed on the root, the Heading naming the grid", async ({
  page,
}, info) => {
  async function expectSemantics(): Promise<void> {
    const grid = page.getByTestId("a-grid");
    const heading = page.getByTestId("a-heading");
    const today = cell(page, "a", "2026-10-27");

    await expect(grid).toHaveAttribute("role", "grid");
    await expect(grid).not.toHaveAttribute("aria-multiselectable", /.*/);
    await expect(heading).toHaveAttribute("id", /\S/);
    await expect(heading).toHaveAttribute("aria-live", "polite");
    await expect(heading).toHaveText("October 2026");
    await expect(grid).toHaveAttribute("aria-labelledby", (await heading.getAttribute("id"))!);
    await expect(root(page, "a")).toHaveAttribute("data-week-start", "7");
    await expect(root(page, "a")).toHaveAttribute("data-today", /^\d{4}-\d{2}-\d{2}$/);
    await expect(grid.locator("th").first()).toHaveText("Sun");
    await expect(grid.locator("th").first()).toHaveAttribute("abbr", "Sunday");
    await expect(grid.locator("td")).toHaveCount(35);
    await expect(grid.locator('td[role="gridcell"]')).toHaveCount(35);
    await expect(today).toHaveAttribute("aria-label", "Tuesday, October 27, 2026");
    await expect(today).toHaveAttribute("aria-current", "date");
    await expect(today).toHaveAttribute("data-today", "");
    await expect(today).toHaveText("27");
    await expect(grid.locator("[aria-current]")).toHaveCount(1);
    await expect(grid.locator("[aria-selected]")).toHaveCount(0);
    await expect(grid.locator("[aria-disabled]")).toHaveCount(0);
    await expect(cell(page, "a", "2026-09-27")).toHaveAttribute("data-outside", "");
    await expect(cell(page, "a", "2026-10-01")).not.toHaveAttribute("data-outside", /.*/);
    await expect(cell(page, "a", "2026-10-01")).toHaveAttribute("tabindex", "-1");
    await expectTabStop(page, "a", "2026-10-27");
    await expect(page.getByTestId("a-previous")).toHaveAttribute("type", "button");
    await expect(page.getByTestId("a-next")).toHaveAttribute("type", "button");
    await expect(page.getByTestId("a-previous")).not.toHaveAttribute("aria-disabled", /.*/);
  }

  await fixture(page, "calendar", info, expectSemantics);
  await expectSemantics();
  await expect(page.getByTestId("a-state")).toHaveText("null 2026-10");
});

test("CA2: the APG key map moves focus in date arithmetic; the week start and right-to-left text change it", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);
  await cell(page, "a", "2026-10-27").focus();
  await press(page, "ArrowLeft", "2026-10-26");
  await press(page, "ArrowRight", "2026-10-27");
  await press(page, "ArrowUp", "2026-10-20");
  await press(page, "ArrowDown", "2026-10-27");
  await press(page, "Home", "2026-10-25");
  await press(page, "End", "2026-10-31");
  await press(page, "PageUp", "2026-09-30");
  await expect(page.getByTestId("a-heading")).toHaveText("September 2026");
  await press(page, "PageDown", "2026-10-30");
  await press(page, "Shift+PageUp", "2025-10-30");
  await expect(page.getByTestId("a-heading")).toHaveText("October 2025");
  await press(page, "Shift+PageDown", "2026-10-30");
  await expect(page.getByTestId("a-month")).toHaveText("2026-10");

  // Modified keys are the browser's or the application's.
  await page.keyboard.press("Control+ArrowRight");
  await page.keyboard.press("Alt+ArrowDown");
  await settle(page);
  await expect(cell(page, "a", "2026-10-30")).toBeFocused();

  // Space and Enter choose the focused day.
  await page.keyboard.press("Space");
  await expect(page.getByTestId("a-value")).toHaveText("2026-10-30");
  await press(page, "ArrowLeft", "2026-10-29");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("a-value")).toHaveText("2026-10-29");
  await expect(page.getByTestId("a-outputs")).toHaveText("2");

  // weekStart overrides the locale's Sunday.
  await page.getByTestId("a-monday").click();
  await expect(page.getByTestId("a-grid").locator("th").first()).toHaveText("Mon");
  await cell(page, "a", "2026-10-29").focus();
  await press(page, "Home", "2026-10-26");
  await press(page, "End", "2026-11-01");

  // Right-to-left text swaps Left and Right, read from the cell when the key is pressed.
  await page.getByTestId("a-rtl").click();
  await expect(root(page, "a")).toHaveAttribute("dir", "rtl");
  await cell(page, "a", "2026-11-01").focus();
  await press(page, "ArrowLeft", "2026-11-02");
  await press(page, "ArrowRight", "2026-11-01");
  await press(page, "ArrowUp", "2026-10-25");
});

test("CA3: moving past the month shows the next one and focus waits for its cell; Previous and Next step a month and keep their focus", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const heading = page.getByTestId("a-heading");

  await cell(page, "a", "2026-10-31").focus();
  await press(page, "ArrowRight", "2026-11-01");
  await expect(heading).toHaveText("November 2026");
  await expect(page.getByTestId("a-month")).toHaveText("2026-11");
  await expect(page.getByTestId("a-month-outputs")).toHaveText("1");
  await expect(cell(page, "a", "2026-10-31")).toHaveCount(0);

  // Back across: October 31 isn't in November's grid until October shows again.
  await press(page, "ArrowLeft", "2026-10-31");
  await expect(heading).toHaveText("October 2026");
  await cell(page, "a", "2026-10-27").focus();
  await press(page, "ArrowDown", "2026-11-03");
  await expect(heading).toHaveText("November 2026");
  await expect(page.getByTestId("a-month-outputs")).toHaveText("3");

  // Next from the keyboard: the button keeps focus and the grid's tab stop follows the month.
  await page.getByTestId("a-next").focus();
  await page.keyboard.press("Enter");
  await expect(heading).toHaveText("December 2026");
  await expect(page.getByTestId("a-next")).toBeFocused();
  await expect(page.getByTestId("a-month")).toHaveText("2026-12");
  await expectTabStop(page, "a", "2026-12-01");
  await page.getByTestId("a-previous").focus();
  await page.keyboard.press("Space");
  await expect(heading).toHaveText("November 2026");
  await expect(page.getByTestId("a-previous")).toBeFocused();
  await expectTabStop(page, "a", "2026-11-03");
  await page.keyboard.press("Enter");
  await expect(heading).toHaveText("October 2026");
  await expectTabStop(page, "a", "2026-10-27");

  // Tab enters the grid on its tab stop.
  await page.getByTestId("a-next").focus();
  await page.keyboard.press("Tab");
  await expect(cell(page, "a", "2026-10-27")).toBeFocused();
});

test("CA4: PageDown from January 31 lands on February 28, or 29 in a leap year, not March 3", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);
  await page.getByTestId("a-january-2026").click();
  await expect(page.getByTestId("a-heading")).toHaveText("January 2026");
  await cell(page, "a", "2026-01-31").focus();
  await press(page, "PageDown", "2026-02-28");
  await expect(page.getByTestId("a-heading")).toHaveText("February 2026");
  await press(page, "PageDown", "2026-03-28");
  await page.getByTestId("a-january-2028").click();
  await cell(page, "a", "2028-01-31").focus();
  await press(page, "PageDown", "2028-02-29");
  await press(page, "Shift+PageDown", "2029-02-28");
  await press(page, "Shift+PageUp", "2028-02-28");
});

test("CA5: minDate and maxDate disable the days outside them, stop moves and disable Previous and Next while they stay focusable", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const previous = page.getByTestId("a-previous");
  const next = page.getByTestId("a-next");

  await next.click();
  await expect(page.getByTestId("a-heading")).toHaveText("November 2026");
  await page.getByTestId("a-bound").click();
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await expect(next).toHaveAttribute("data-disabled", "");
  await expect(previous).not.toHaveAttribute("aria-disabled", /.*/);

  // Stepping back to the bound keeps focus on the now-disabled Previous.
  await previous.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("a-heading")).toHaveText("October 2026");
  await expect(previous).toHaveAttribute("aria-disabled", "true");
  await expect(previous).toHaveAttribute("data-disabled", "");
  await expect(previous).not.toHaveAttribute("disabled", /.*/);
  await expect(previous).toBeFocused();
  await page.keyboard.press("Enter");
  // A forced, still trusted click: Playwright doesn't click an aria-disabled element otherwise.
  await previous.click({ force: true });
  await settle(page);
  await expect(page.getByTestId("a-heading")).toHaveText("October 2026");

  for (const date of ["2026-10-04", "2026-10-21", "2026-10-27", "2026-09-30"]) {
    await expect(cell(page, "a", date)).toHaveAttribute("aria-disabled", "true");
    await expect(cell(page, "a", date)).toHaveAttribute("data-disabled", "");
  }

  for (const date of ["2026-10-05", "2026-10-20"]) {
    await expect(cell(page, "a", date)).not.toHaveAttribute("aria-disabled", /.*/);
  }

  await expect(cell(page, "a", "2026-10-27")).toHaveAttribute("aria-current", "date");

  // Moves clamp at the bounds.
  await cell(page, "a", "2026-10-06").focus();
  await press(page, "ArrowUp", "2026-10-05");
  await press(page, "ArrowLeft", "2026-10-05");
  await press(page, "PageUp", "2026-10-05");
  await press(page, "PageDown", "2026-10-20");
  await press(page, "End", "2026-10-20");
  await press(page, "Shift+PageDown", "2026-10-20");

  // Days outside can't be chosen.
  await cell(page, "a", "2026-10-03").click({ force: true });
  await cell(page, "a", "2026-10-21").focus();
  await page.keyboard.press("Enter");
  await settle(page);
  await expect(page.getByTestId("a-value")).toHaveText("null");
  await cell(page, "a", "2026-10-20").click();
  await expect(page.getByTestId("a-value")).toHaveText("2026-10-20");
});

test("CA6: dateDisabled days take focus with aria-disabled but can't be chosen", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);
  await page.getByTestId("a-weekends").click();

  const saturday = cell(page, "a", "2026-10-24");

  await expect(saturday).toHaveAttribute("aria-disabled", "true");
  await expect(saturday).toHaveAttribute("data-disabled", "");
  await expect(cell(page, "a", "2026-10-23")).not.toHaveAttribute("aria-disabled", /.*/);
  await cell(page, "a", "2026-10-23").focus();
  await press(page, "ArrowRight", "2026-10-24");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await saturday.click({ force: true });
  await settle(page);
  await expect(page.getByTestId("a-value")).toHaveText("null");
  await expect(page.getByTestId("a-outputs")).toHaveText("0");
  await expect(saturday).toBeFocused();
});

test("CA7: choosing writes one day once; an outside day shows its month; external and non-canonical values", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const value = page.getByTestId("a-value");
  const outputs = page.getByTestId("a-outputs");
  const fifteenth = cell(page, "a", "2026-10-15");

  await fifteenth.click();
  await expect(value).toHaveText("2026-10-15");
  await expect(outputs).toHaveText("1");
  await expect(fifteenth).toHaveAttribute("aria-selected", "true");
  await expect(fifteenth).toHaveAttribute("data-selected", "");
  await expect(fifteenth).toBeFocused();
  await expect(page.getByTestId("a-grid").locator("[aria-selected]")).toHaveCount(1);
  await expect(page.getByTestId("a-state")).toHaveText("2026-10-15 2026-10");
  await expectTabStop(page, "a", "2026-10-15");

  // Choosing the chosen day keeps it and writes nothing.
  await fifteenth.click();
  await page.keyboard.press("Enter");
  await settle(page);
  await expect(outputs).toHaveText("1");

  // An outside day: its month shows and focus follows to its cell there. While `month` follows
  // the value (null), the choice itself moves the display and `month` stays null.
  await cell(page, "a", "2026-09-30").click();
  await expect(value).toHaveText("2026-09-30");
  await expect(page.getByTestId("a-heading")).toHaveText("September 2026");
  await expect(page.getByTestId("a-month")).toHaveText("null");
  await expect(cell(page, "a", "2026-09-30")).toBeFocused();
  await expect(cell(page, "a", "2026-09-30")).not.toHaveAttribute("data-outside", /.*/);

  // A set month is written to the outside day's month.
  await press(page, "PageDown", "2026-10-30");
  await expect(page.getByTestId("a-month")).toHaveText("2026-10");
  await cell(page, "a", "2026-09-29").click();
  await expect(value).toHaveText("2026-09-29");
  await expect(page.getByTestId("a-month")).toHaveText("2026-09");
  await expect(cell(page, "a", "2026-09-29")).toBeFocused();
  await expect(outputs).toHaveText("3");

  // While month follows, an external value write shows the value's month.
  await page.getByTestId("a-follow").click();
  await expect(page.getByTestId("a-month")).toHaveText("null");
  await page.getByTestId("a-write-christmas").click();
  await expect(page.getByTestId("a-heading")).toHaveText("December 2026");
  await expect(cell(page, "a", "2026-12-25")).toHaveAttribute("aria-selected", "true");
  await expect(outputs).toHaveText("3");

  // A non-canonical value selects nothing, is kept, and today's month shows.
  await page.getByTestId("a-write-invalid").click();
  await expect(value).toHaveText("2026-02-31");
  await expect(page.getByTestId("a-heading")).toHaveText("October 2026");
  await expect(page.getByTestId("a-state")).toHaveText("2026-02-31 2026-10");
  await expect(page.getByTestId("a-grid").locator("[aria-selected]")).toHaveCount(0);
  // The last focused day keeps the tab stop while it is displayed, here as an outside day.
  await expectTabStop(page, "a", "2026-09-29");

  // A set month holds the display against value writes.
  await page.getByTestId("a-next").click();
  await page.getByTestId("a-write-christmas").click();
  await expect(page.getByTestId("a-heading")).toHaveText("November 2026");
});

test("CA8: readonly browses without writing; disabled takes no focus and ignores the pointer while writes still apply", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const grid = page.getByTestId("a-grid");
  const value = page.getByTestId("a-value");

  await page.getByTestId("a-readonly").click();
  await expect(grid).toHaveAttribute("aria-readonly", "true");
  await cell(page, "a", "2026-10-27").focus();
  await press(page, "ArrowRight", "2026-10-28");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await cell(page, "a", "2026-10-15").click();
  await expect(cell(page, "a", "2026-10-15")).toBeFocused();
  await press(page, "PageDown", "2026-11-15");
  await page.getByTestId("a-next").click();
  await expect(page.getByTestId("a-heading")).toHaveText("December 2026");
  await settle(page);
  await expect(value).toHaveText("null");
  await expect(page.getByTestId("a-outputs")).toHaveText("0");
  await page.getByTestId("a-readonly").click();
  await expect(grid).not.toHaveAttribute("aria-readonly", /.*/);
  await page.getByTestId("a-follow").click();

  await page.getByTestId("a-disable").click();
  await expect(grid).toHaveAttribute("aria-disabled", "true");
  await expect(grid.locator("td[tabindex]")).toHaveCount(0);
  await expect(cell(page, "a", "2026-10-15")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("a-previous")).toBeDisabled();
  await expect(page.getByTestId("a-previous")).toHaveAttribute("disabled", "");
  await expect(page.getByTestId("a-next")).toHaveAttribute("disabled", "");
  await cell(page, "a", "2026-10-15").click({ force: true });
  await cell(page, "a", "2026-10-15").focus();
  await settle(page);
  await expect(cell(page, "a", "2026-10-15")).not.toBeFocused();
  await expect(value).toHaveText("null");

  await page.getByTestId("a-write-christmas").click();
  await expect(page.getByTestId("a-heading")).toHaveText("December 2026");
  await expect(cell(page, "a", "2026-12-25")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("a-disable").click();
  await expectTabStop(page, "a", "2026-12-25");
});

test("CA9: focus() before the cells render waits for the tab-stop cell instead of focusing another", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);
  await expect(page.getByTestId("pending-grid")).toHaveCount(0);
  await page.getByTestId("pending-show-and-focus").click();
  await expect(
    page.locator('[data-testid="pending-grid"] td[data-date="2026-10-09"]'),
  ).toBeFocused();
  await expect(
    page.locator('[data-testid="pending-grid"] td[data-date="2026-10-09"]'),
  ).toHaveAttribute("aria-selected", "true");
});

test.describe("browsing 25 hours behind the server", () => {
  test.use({ timezoneId: "Pacific/Pago_Pago" });

  test("CA10: SSR at UTC+14 hydrated at UTC−11: the server's today stays today, with no hydration mismatch; a browser-created root uses the browser's", async ({
    page,
  }, info) => {
    let seed = { today: "", weekStart: "" };

    await fixture(page, "calendar", info, async () => {
      seed = await serverSeed(page);
    });

    const local = await browserToday(page);

    expect(seed.today, "The servers render in Pacific/Kiritimati").toBe(
      todayIn("Pacific/Kiritimati"),
    );
    expect(local).toBe(todayIn("Pacific/Pago_Pago"));
    expect(local, "The two todays always differ: the falsifier bites").not.toBe(seed.today);
    await expect(root(page, "seed")).toHaveAttribute("data-today", seed.today);
    await expect(page.getByTestId("seed-heading")).toHaveText(monthHeading(seed.today));
    await expect(root(page, "seed").locator('[aria-current="date"]')).toHaveAttribute(
      "data-date",
      seed.today,
    );
    await expect(cell(page, "seed", seed.today)).toHaveAttribute("data-today", "");

    await page.getByTestId("show-late").click();
    await expect(root(page, "late")).toHaveAttribute("data-today", local);
    await expect(page.getByTestId("late-heading")).toHaveText(monthHeading(local));
    await expect(root(page, "late").locator('[aria-current="date"]')).toHaveAttribute(
      "data-date",
      local,
    );
  });
});

test("CA11: a Calendar hydrating long after the app keeps the server's month and today, and a replayed focus request reaches its cell", async ({
  page,
}, info: TestInfo) => {
  // The browser's clock is in 2001: a root that computed today again would show January 2001.
  await page.clock.setFixedTime(new Date("2001-01-15T12:00:00"));

  const release = await bootstrapHeld(page, "/calendar", info);
  const seed = await serverSeed(page);

  release();
  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("seed-heading")).toHaveText(monthHeading(seed.today));

  // Under incremental hydration this click hydrates the block, and Angular replays it.
  await page.getByTestId("seed-focus").click();
  await expect(cell(page, "seed", seed.today)).toBeFocused();
  await expect(cell(page, "seed", seed.today)).toHaveAttribute("aria-current", "date");
  await expect(page.getByTestId("seed-heading")).toHaveText(monthHeading(seed.today));
  await expect(root(page, "seed")).toHaveAttribute("data-today", seed.today);
  await page.getByTestId("attach-fixture").click();
  await expect(page.getByTestId("fixture-attached")).toHaveText("true");
  await assertReferences(page, info);
  await stopRetentionObservation(page);

  await page.getByTestId("show-late").click();
  await expect(page.getByTestId("late-heading")).toHaveText("January 2001");
});

test("CA12: an engine without Intl week data keeps the server's Sunday start on hydration; a browser-created root falls back to Monday", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Intl.Locale.prototype, "getWeekInfo");
    Reflect.deleteProperty(Intl.Locale.prototype, "weekInfo");
  });

  let seed = { today: "", weekStart: "" };

  await fixture(page, "calendar", info, async () => {
    seed = await serverSeed(page);
  });

  expect(seed.weekStart, "en-US weeks start on Sunday on the server").toBe("7");
  expect(
    await page.evaluate(() => {
      const locale = new Intl.Locale("en-US");

      return [typeof Reflect.get(locale, "getWeekInfo"), typeof Reflect.get(locale, "weekInfo")];
    }),
  ).toEqual(["undefined", "undefined"]);
  await expect(root(page, "seed")).toHaveAttribute("data-week-start", "7");
  await expect(page.getByTestId("seed-grid").locator("th").first()).toHaveText("Sun");
  await expect(page.getByTestId("a-grid").locator("th").first()).toHaveText("Sun");
  await page.getByTestId("show-late").click();
  await expect(root(page, "late")).toHaveAttribute("data-week-start", "1");
  await expect(page.getByTestId("late-grid").locator("th").first()).toHaveText("Mon");
});

test.describe("browsing in São Paulo", () => {
  test.use({ timezoneId: "America/Sao_Paulo" });

  test("CA13: around the night São Paulo skipped midnight (2018-11-04), keys, labels and choices never shift a day", async ({
    page,
  }, info) => {
    await fixture(page, "calendar", info);
    await page.getByTestId("a-dst").click();
    await expect(page.getByTestId("a-heading")).toHaveText("November 2018");

    const transition = cell(page, "a", "2018-11-04");

    await expect(cell(page, "a", "2018-11-03")).toHaveAttribute("aria-selected", "true");
    await expect(transition).toHaveAttribute("aria-label", "Sunday, November 4, 2018");
    await expect(transition).toHaveText("4");
    expect(await transition.evaluate((element: HTMLTableCellElement) => element.cellIndex)).toBe(0);
    await cell(page, "a", "2018-11-03").focus();
    await press(page, "ArrowRight", "2018-11-04");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("a-value")).toHaveText("2018-11-04");
    await press(page, "ArrowRight", "2018-11-05");
    await press(page, "ArrowLeft", "2018-11-04");
    await press(page, "PageUp", "2018-10-04");
    await press(page, "PageDown", "2018-11-04");
    await press(page, "ArrowUp", "2018-10-28");
    await press(page, "ArrowDown", "2018-11-04");
    await expect(transition).toHaveAttribute("aria-selected", "true");
  });
});

test("CA14: Signal Forms and Field: Labels then the Heading name the grid, Descriptions and Errors describe it, touch only when focus leaves the root, focusBoundControl, readonly and disabled rules", async ({
  page,
}, info) => {
  const grid = page.getByTestId("appeal-grid");
  const value = page.getByTestId("appeal-value");
  const touched = page.getByTestId("appeal-touched");

  async function expectNaming(): Promise<void> {
    await expect(grid).toHaveAttribute("aria-labelledby", "appeal-label appeal-heading");
    await expect(grid).toHaveAttribute("aria-describedby", "appeal-description");
    await expect(grid).toHaveAttribute("aria-required", "true");
    await expect(grid).not.toHaveAttribute("aria-invalid", /.*/);
    await expect(cell(page, "appeal", "2026-10-04")).toHaveAttribute("aria-disabled", "true");
    await expectTabStop(page, "appeal", "2026-10-27");
  }

  await fixture(page, "calendar", info, expectNaming);
  await expectNaming();
  await expect(page.getByRole("grid", { name: "Appeal date October 2026" })).toHaveCount(1);

  // focusBoundControl() focuses the tab stop; moving inside the root never touches.
  await page.getByTestId("focus-appeal").click();
  await expect(cell(page, "appeal", "2026-10-27")).toBeFocused();
  await press(page, "ArrowRight", "2026-10-28", "appeal");
  await page.getByTestId("appeal-next").focus();
  await cell(page, "appeal", "2026-10-31").focus();
  await press(page, "ArrowRight", "2026-11-01", "appeal");
  await press(page, "ArrowLeft", "2026-10-31", "appeal");
  await settle(page);
  await expect(touched).toHaveText("false");
  await expect(value).toHaveText("null");

  // Leaving the root touches; the required error shows and describes the grid.
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("appeal-after")).toBeFocused();
  await expect(touched).toHaveText("true");
  await expect(grid).toHaveAttribute("aria-invalid", "true");
  await expect(grid).toHaveAttribute("aria-describedby", "appeal-description appeal-error");
  await expect(page.locator("#appeal-error")).toHaveText("Choose the appeal date.");

  // A choice writes the field; the bound minDate stops earlier days.
  await cell(page, "appeal", "2026-10-04").click({ force: true });
  await settle(page);
  await expect(value).toHaveText("null");
  await cell(page, "appeal", "2026-10-20").click();
  await expect(value).toHaveText("2026-10-20");
  await expect(grid).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(grid).toHaveAttribute("aria-describedby", "appeal-description");
  await page.getByTestId("write-appeal").click();
  await expect(cell(page, "appeal", "2026-10-15")).toHaveAttribute("aria-selected", "true");
  await expect(cell(page, "appeal", "2026-10-20")).not.toHaveAttribute("aria-selected", /.*/);

  // The last focused day keeps the tab stop over the written value.
  await page.getByTestId("focus-appeal").click();
  await expect(cell(page, "appeal", "2026-10-20")).toBeFocused();

  // Readonly from the field: keys browse, nothing writes.
  await page.getByTestId("freeze-appeal").click();
  await expect(grid).toHaveAttribute("aria-readonly", "true");
  await cell(page, "appeal", "2026-10-16").click();
  await press(page, "ArrowRight", "2026-10-17", "appeal");
  await page.keyboard.press("Enter");
  await settle(page);
  await expect(value).toHaveText("2026-10-15");
  await page.getByTestId("freeze-appeal").click();
  await expect(grid).not.toHaveAttribute("aria-readonly", /.*/);

  // Disabled from the field: no tab stop, no pointer, natively disabled steps.
  await page.getByTestId("lock-appeal").click();
  await expect(grid).toHaveAttribute("aria-disabled", "true");
  await expect(grid.locator("td[tabindex]")).toHaveCount(0);
  await expect(page.getByTestId("appeal-previous")).toHaveAttribute("disabled", "");
  await cell(page, "appeal", "2026-10-22").click({ force: true });
  await page.getByTestId("focus-appeal").click();
  await settle(page);
  await expect(page.getByTestId("focus-appeal")).toBeFocused();
  await expect(value).toHaveText("2026-10-15");
  await page.getByTestId("lock-appeal").click();
  await expectTabStop(page, "appeal", "2026-10-17");
});

test("CA14: submit() shows the required error on an untouched Calendar", async ({ page }, info) => {
  await fixture(page, "calendar", info);
  await page.getByTestId("submit-appeal").click();
  await expect(page.getByTestId("appeal-grid")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("appeal-submits")).toHaveText("0");
});

test("CA15: factory Options through hostDirectives replace the whole configuration", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const grid = page.getByTestId("february-grid");

  await expect(page.getByTestId("february-heading")).toHaveText("February 2026");
  await expect(grid.locator("tbody tr")).toHaveCount(6);
  await expect(grid.locator("th").first()).toHaveText("Mon");
  await expect(cell(page, "february", "2026-02-14")).toHaveAttribute("aria-current", "date");
  await expect(cell(page, "february", "2026-02-14")).toHaveAttribute(
    "aria-label",
    /14 February 2026/,
  );
  await cell(page, "february", "2026-02-10").click();
  await expect(page.getByTestId("february-value")).toHaveText("2026-02-10");
  await expect(cell(page, "february", "2026-02-10")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("PageDown");
  await expect(page.getByTestId("february-heading")).toHaveText("March 2026");
  await expect(cell(page, "february", "2026-03-10")).toBeFocused();
});

test("CA16: the cell structure's accessibility tree: a focused cell, a selected cell and the grid", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);
  await cell(page, "a", "2026-10-15").click();
  await page.keyboard.press("ArrowRight");
  await expect(cell(page, "a", "2026-10-16")).toBeFocused();
  await expect(cell(page, "a", "2026-10-15")).toHaveAttribute("aria-selected", "true");

  const focused = await cell(page, "a", "2026-10-16").ariaSnapshot();
  const selected = await cell(page, "a", "2026-10-15").ariaSnapshot();
  const grid = await page.getByTestId("a-grid").ariaSnapshot();

  expect(focused).toBe('- gridcell "Friday, October 16, 2026": "16"');
  expect(selected).toBe('- gridcell "Thursday, October 15, 2026" [selected]: "15"');
  expect(grid).toContain('- grid "October 2026"');
  expect(grid).toContain('- columnheader "Sun"');
  expect(grid).toContain('- gridcell "Tuesday, October 27, 2026"');

  const snapshots: Record<string, unknown> = { focused, selected, grid };

  // Chromium's own accessibility tree; other engines have only Playwright's snapshot above.
  if (info.project.use.browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    const { nodes } = (await session.send("Accessibility.getFullAXTree")) as {
      nodes: {
        role?: { value: string };
        name?: { value: string };
        properties?: { name: string; value: { value: unknown } }[];
      }[];
    };
    const cells: Record<string, Record<string, unknown>> = {};

    for (const node of nodes) {
      const name = String(node.name?.value);

      // The first matches are the first calendar's; later calendars repeat these names.
      if (
        node.role?.value !== "gridcell" ||
        !/October 1[56], 2026$/.test(name) ||
        Object.hasOwn(cells, name)
      ) {
        continue;
      }

      const properties: Record<string, unknown> = {};

      for (const property of node.properties ?? []) {
        properties[property.name] = property.value.value;
      }

      cells[name] = properties;
    }

    expect(cells["Thursday, October 15, 2026"]).toMatchObject({ selected: true, focusable: true });
    expect(cells["Friday, October 16, 2026"]).toMatchObject({ focusable: true, focused: true });
    snapshots.chromiumCells = cells;
  }

  await info.attach("calendar-accessibility", {
    body: JSON.stringify(snapshots, null, 2),
    contentType: "application/json",
  });
  console.log(`CA16 ${info.project.name}\n${JSON.stringify(snapshots, null, 2)}`);
});

test("CA17: a hydrated Grid's name follows its Heading's rename and removal as a browser-created one does, and keeps a static aria-labelledby", async ({
  page,
}, info) => {
  async function expectNaming(name: string): Promise<void> {
    const plain = page.getByTestId(`${name}-plain-grid`);
    const captioned = page.getByTestId(`${name}-captioned-grid`);

    await expect(plain).toHaveAttribute("aria-labelledby", `${name}-plain-period`);
    await expect(captioned).toHaveAttribute(
      "aria-labelledby",
      `naming-caption ${name}-captioned-period`,
    );
    await page.getByTestId(`${name}-rename-heading`).click();
    await expect(plain).toHaveAttribute("aria-labelledby", `${name}-plain-renamed`);
    await expect(captioned).toHaveAttribute(
      "aria-labelledby",
      `naming-caption ${name}-captioned-renamed`,
    );
    await expect(captioned).toHaveAccessibleName("Appointment October 2026");
    await page.getByTestId(`${name}-remove-heading`).click();
    await expect(plain).not.toHaveAttribute("aria-labelledby", /.*/);
    await expect(captioned).toHaveAttribute("aria-labelledby", "naming-caption");
    await expect(captioned).toHaveAccessibleName("Appointment");
  }

  await fixture(page, "calendar", info, async () => {
    await expect(page.getByTestId("hydrated-plain-grid")).toHaveAttribute(
      "aria-labelledby",
      "hydrated-plain-period",
    );
    await expect(page.getByTestId("hydrated-captioned-grid")).toHaveAttribute(
      "aria-labelledby",
      "naming-caption hydrated-captioned-period",
    );
  });
  await expectNaming("hydrated");
  await page.getByTestId("show-late-naming").click();
  await expectNaming("late");
});

test("CA18: a focus request waiting for its cell never takes focus from Previous, stepped or only focused, and still lands while focus stays put", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const previous = page.getByTestId("stale-previous");
  const grid = page.getByTestId("stale-grid");
  const month = page.getByTestId("stale-month");

  /** Fires a window event the fixture listens to, without moving focus. */
  async function dispatch(type: string): Promise<void> {
    await page.evaluate((name) => window.dispatchEvent(new Event(name)), type);
  }

  async function showGrid(): Promise<void> {
    await dispatch("calendar-stale-show");
    await expect(grid.locator("td")).not.toHaveCount(0);
    await settle(page);
  }

  async function hideGrid(): Promise<void> {
    await dispatch("calendar-stale-hide");
    await expect(grid).toHaveCount(0);
  }

  // focus() from outside asks for the chosen 1 October; Previous by keyboard shows September,
  // whose last week holds 1 October as an outside day.
  await page.getByTestId("stale-focus").click();
  await previous.focus();
  await page.keyboard.press("Enter");
  await expect(month).toHaveText("2026-09");
  await showGrid();
  await expect(grid.locator('td[data-date="2026-10-01"]')).toHaveAttribute("data-outside", "");
  await expect(previous).toBeFocused();

  // Asked from Previous itself, for 1 September, which August's last week holds: the step drops it.
  await hideGrid();
  await previous.focus();
  await dispatch("calendar-stale-focus");
  await page.keyboard.press("Enter");
  await expect(month).toHaveText("2026-08");
  await showGrid();
  await expect(grid.locator('td[data-date="2026-09-01"]')).toHaveCount(1);
  await expect(previous).toBeFocused();

  // Focus moved to Previous without a step: not stolen either.
  await hideGrid();
  await page.getByTestId("stale-focus").click();
  await previous.focus();
  await showGrid();
  await expect(previous).toBeFocused();

  // Focus still where the request was made: it lands on August's tab stop.
  await hideGrid();
  await page.getByTestId("stale-focus").click();
  await showGrid();
  await expect(grid.locator('td[data-date="2026-08-01"]')).toBeFocused();

  // A keyboard move into another month removes the focused cell, so focus falls to the body:
  // the request still lands on the new month's day.
  await grid.locator('td[data-date="2026-08-10"]').focus();
  await page.keyboard.press("PageDown");
  await expect(month).toHaveText("2026-09");
  await expect(grid.locator('td[data-date="2026-09-10"]')).toBeFocused();

  // Focus went elsewhere and came back to where the request was made: the request is gone.
  await hideGrid();
  await page.getByTestId("stale-focus").click();
  await page.getByTestId("a-before").focus();
  await page.getByTestId("stale-focus").focus();
  await showGrid();
  await expect(page.getByTestId("stale-focus")).toBeFocused();

  // Focus went elsewhere, then fell to the body: gone too.
  await hideGrid();
  await page.getByTestId("stale-focus").click();
  await page.getByTestId("a-before").focus();
  await page.getByTestId("a-before").blur();
  await showGrid();
  await expect(grid.locator("td:focus")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test("CA19: the first and last months shown keep whole weeks under their weekday headers, and moves and Previous/Next stop there", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const grid = page.getByTestId("a-grid");

  /** Every row has seven cells, each named by a date of its column's weekday. */
  async function expectColumns(): Promise<void> {
    const headers = await grid
      .locator("thead th")
      .evaluateAll((cells) => cells.map((cell) => cell.getAttribute("abbr")));
    const rows = await grid
      .locator("tbody tr")
      .evaluateAll((rows) =>
        rows.map((row) => Array.from(row.querySelectorAll("td"), (cell) => cell.ariaLabel)),
      );

    expect(rows.length).toBeGreaterThanOrEqual(4);

    for (const row of rows) {
      expect(row).toHaveLength(7);

      for (let column = 0; column < 7; column += 1) {
        expect(row[column]).toMatch(new RegExp(`^${headers[column]},`));
      }
    }
  }

  await page.getByTestId("a-first-month").click();
  await expect(page.getByTestId("a-state")).toHaveText("null 0001-02");
  await expect(page.getByTestId("a-previous")).toHaveAttribute("aria-disabled", "true");
  await expectColumns();
  await expect(grid.locator("tbody tr").first().locator("td").first()).toHaveAttribute(
    "data-date",
    "0001-01-28",
  );

  const first = cell(page, "a", "0001-02-01");
  const below = await cell(page, "a", "0001-02-08").boundingBox();

  expect((await first.boundingBox())!.x).toBe(below!.x);
  await cell(page, "a", "0001-02-08").focus();
  await press(page, "ArrowUp", "0001-02-01");
  await press(page, "ArrowUp", "0001-02-01");
  await press(page, "ArrowLeft", "0001-02-01");
  await expect(page.getByTestId("a-state")).toHaveText("null 0001-02");

  // A day of January 0001 is a valid value, chosen by the pointer.
  await cell(page, "a", "0001-01-30").click();
  await expect(cell(page, "a", "0001-01-30")).toBeFocused();
  await expect(cell(page, "a", "0001-01-30")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("a-state")).toHaveText("0001-01-30 0001-02");

  await page.getByTestId("a-last-month").click();
  await expect(page.getByTestId("a-state")).toHaveText("0001-01-30 9999-11");
  await expect(page.getByTestId("a-next")).toHaveAttribute("aria-disabled", "true");
  await expectColumns();
  await cell(page, "a", "9999-11-30").focus();
  await press(page, "ArrowRight", "9999-11-30");
  await press(page, "PageDown", "9999-11-30");
  await expect(page.getByTestId("a-state")).toHaveText("0001-01-30 9999-11");
});

test("CA21: a hydrated Grid names no Heading still dehydrated in its own hydrate boundary and keeps a composed static aria-labelledby; the Heading is named once it hydrates", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const plain = page.locator("#split-plain-grid");
  const captioned = page.locator("#split-captioned-grid");

  await fixture(page, "calendar", info, async () => {
    if (incremental) {
      await expect(plain).toHaveAttribute("aria-labelledby", "split-plain-period");
      await expect(captioned).toHaveAttribute(
        "aria-labelledby",
        "split-caption split-captioned-period",
      );

      return;
    }

    // Without incremental hydration the server renders the blocks' placeholders.
    await expect(plain).not.toHaveAttribute("aria-labelledby", /.*/);
    await expect(captioned).toHaveAttribute("aria-labelledby", "split-caption");
  });

  if (incremental) {
    // The Headings' server elements are still there, dehydrated.
    await expect(page.locator("#split-plain-period")).toHaveText("October 2026");
    await expect(plain).not.toHaveAttribute("aria-labelledby", /.*/);
    await expect(captioned).toHaveAttribute("aria-labelledby", "split-caption");
    await expect(captioned).toHaveAccessibleName("Visit");
  }

  await page.getByTestId("split-hydrate-headings").click();
  await expect(plain).toHaveAttribute("aria-labelledby", "split-plain-period");
  await expect(plain).toHaveAccessibleName("October 2026");
  await expect(captioned).toHaveAttribute(
    "aria-labelledby",
    "split-caption split-captioned-period",
  );
  await expect(captioned).toHaveAccessibleName("Visit October 2026");
});

test("CA22: a bound among the first or last shown month's outside days holds keyboard moves at the focused day instead of crossing it", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  // February 0001 shows 28–31 January; maxDate is 30 January, before every day keys can reach.
  await page.getByTestId("a-first-bound").click();
  await expect(page.getByTestId("a-state")).toHaveText("null 0001-02");
  await expect(cell(page, "a", "0001-02-01")).toHaveAttribute("aria-disabled", "true");
  await cell(page, "a", "0001-01-30").click();
  await expect(cell(page, "a", "0001-01-30")).toBeFocused();
  await press(page, "ArrowRight", "0001-01-30");
  await press(page, "ArrowLeft", "0001-01-30");
  await press(page, "PageDown", "0001-01-30");

  // November 9999 from Monday shows 1–5 December; minDate is 2 December, after every reachable day.
  await page.getByTestId("a-last-bound").click();
  await expect(page.getByTestId("a-state")).toHaveText("0001-01-30 9999-11");
  await expect(cell(page, "a", "9999-11-30")).toHaveAttribute("aria-disabled", "true");
  await cell(page, "a", "9999-12-02").click();
  await expect(cell(page, "a", "9999-12-02")).toBeFocused();
  await expect(page.getByTestId("a-state")).toHaveText("9999-12-02 9999-11");
  await press(page, "ArrowLeft", "9999-12-02");
  await press(page, "ArrowRight", "9999-12-02");
  await press(page, "PageUp", "9999-12-02");
});

/** The cells of the calendar marked `name` that carry `attribute`, in DOM order, by day. */
async function daysWith(page: Page, name: string, attribute: string): Promise<string[]> {
  return root(page, name)
    .locator(`td[${attribute}]`)
    .evaluateAll((cells) => cells.map((cell) => cell.getAttribute("data-date") ?? ""));
}

test("CA23: several days and a range with values in server HTML and after hydration: aria-multiselectable, aria-selected on every day, the range's markers and tab stops", async ({
  page,
}, info) => {
  async function expectSelection(): Promise<void> {
    const several = page.getByTestId("m-grid");
    const range = page.getByTestId("r-grid");

    await expect(several).toHaveAttribute("aria-multiselectable", "true");
    await expect(page.getByTestId("m-heading")).toHaveText("October 2026");
    await expect(several.locator('td[aria-selected="true"]')).toHaveCount(2);
    await expect(several.locator('td[aria-selected="false"]')).toHaveCount(33);
    await expect(cell(page, "m", "2026-10-06")).toHaveAttribute("aria-selected", "true");
    await expect(cell(page, "m", "2026-10-06")).toHaveAttribute("data-selected", "");
    await expect(cell(page, "m", "2026-10-20")).toHaveAttribute("aria-selected", "true");
    await expect(cell(page, "m", "2026-09-27")).toHaveAttribute("aria-selected", "false");
    await expect(
      several.locator("[data-range-start], [data-range-end], [data-in-range], [data-preview]"),
    ).toHaveCount(0);
    await expectTabStop(page, "m", "2026-10-06");

    await expect(range).toHaveAttribute("aria-multiselectable", "true");
    await expect(page.getByTestId("r-heading")).toHaveText("October 2026");
    await expect(range.locator('td[aria-selected="false"]')).toHaveCount(30);
    await expect
      .poll(() => daysWith(page, "r", 'aria-selected="true"'))
      .toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
    await expect
      .poll(() => daysWith(page, "r", "data-selected"))
      .toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
    await expect.poll(() => daysWith(page, "r", "data-in-range")).toHaveLength(5);
    await expect.poll(() => daysWith(page, "r", "data-range-start")).toEqual(["2026-10-12"]);
    await expect.poll(() => daysWith(page, "r", "data-range-end")).toEqual(["2026-10-16"]);
    await expect(range.locator("[data-preview]")).toHaveCount(0);
    await expectTabStop(page, "r", "2026-10-12");
    await expect(page.getByTestId("r-anchor")).toHaveText("null");
  }

  await fixture(page, "calendar", info, expectSelection);
  await expectSelection();

  // The hydrated roots choose once per click.
  await cell(page, "m", "2026-10-13").click();
  await expect(page.getByTestId("m-value")).toHaveText("2026-10-06 2026-10-13 2026-10-20");
  await cell(page, "r", "2026-10-20").click();
  await expect(page.getByTestId("r-anchor")).toHaveText("2026-10-20");
  await cell(page, "r", "2026-10-22").click();
  await expect(page.getByTestId("r-value")).toHaveText("2026-10-20 2026-10-22");
  await expect(page.getByTestId("m-outputs")).toHaveText("1");
  await expect(page.getByTestId("r-outputs")).toHaveText("1");
});

test("CA24: several days: choosing toggles, writing the canonical days in chronological order, days no cell shows included, then the entries that aren't days", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const value = page.getByTestId("m-value");
  const thirteenth = cell(page, "m", "2026-10-13");

  await thirteenth.click();
  await expect(value).toHaveText("2026-10-06 2026-10-13 2026-10-20");
  await expect(thirteenth).toHaveAttribute("aria-selected", "true");
  await expect(thirteenth).toHaveAttribute("data-selected", "");
  await expect(thirteenth).toBeFocused();
  await cell(page, "m", "2026-10-01").click();
  await cell(page, "m", "2026-10-31").click();
  await expect(value).toHaveText("2026-10-01 2026-10-06 2026-10-13 2026-10-20 2026-10-31");

  // Choosing a chosen day removes it; Enter and Space toggle the focused day.
  await thirteenth.click();
  await expect(value).toHaveText("2026-10-01 2026-10-06 2026-10-20 2026-10-31");
  await expect(thirteenth).toHaveAttribute("aria-selected", "false");
  await expect(thirteenth).not.toHaveAttribute("data-selected", /.*/);
  await page.keyboard.press("Enter");
  await expect(value).toHaveText("2026-10-01 2026-10-06 2026-10-13 2026-10-20 2026-10-31");
  await page.keyboard.press("Space");
  await expect(value).toHaveText("2026-10-01 2026-10-06 2026-10-20 2026-10-31");
  await expect(page.getByTestId("m-outputs")).toHaveText("6");
  await expect(page.getByTestId("m-grid").locator('td[aria-selected="true"]')).toHaveCount(4);

  // The write is kept as written and the display follows its first canonical day; a choice keeps
  // the day no cell shows and moves the entry that isn't a day after the days.
  await page.getByTestId("m-write").click();
  await expect(value).toHaveText("27/10/2026 2026-10-20 2026-12-25");
  await expect(page.getByTestId("m-state")).toHaveText("27/10/2026 2026-10-20 2026-12-25 2026-10");
  await expect(page.getByTestId("m-grid").locator('td[aria-selected="true"]')).toHaveCount(1);
  await cell(page, "m", "2026-10-10").click();
  await expect(value).toHaveText("2026-10-10 2026-10-20 2026-12-25 27/10/2026");
  await cell(page, "m", "2026-10-30").click();
  await expect(value).toHaveText("2026-10-10 2026-10-20 2026-10-30 2026-12-25 27/10/2026");
  await cell(page, "m", "2026-10-20").click();
  await expect(value).toHaveText("2026-10-10 2026-10-30 2026-12-25 27/10/2026");

  // An outside day is added in order too, and its month shows with focus on it.
  await cell(page, "m", "2026-09-30").click();
  await expect(value).toHaveText("2026-09-30 2026-10-10 2026-10-30 2026-12-25 27/10/2026");
  await expect(page.getByTestId("m-heading")).toHaveText("September 2026");
  await expect(cell(page, "m", "2026-09-30")).toBeFocused();
  await expect(cell(page, "m", "2026-09-30")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("m-outputs")).toHaveText("10");
});

test("CA25: a range by pointer: the first choice anchors and the hovered day previews; the second writes the range sorted, the same day allowed", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const value = page.getByTestId("r-value");
  const anchor = page.getByTestId("r-anchor");
  const outputs = page.getByTestId("r-outputs");

  await cell(page, "r", "2026-10-20").click();
  await expect(anchor).toHaveText("2026-10-20");
  await expect(cell(page, "r", "2026-10-20")).toBeFocused();
  await expect.poll(() => daysWith(page, "r", "data-preview")).toEqual(["2026-10-20"]);
  // The value is never half a range: the committed one keeps its markers.
  await settle(page);
  await expect(value).toHaveText("2026-10-12 2026-10-16");
  await expect(outputs).toHaveText("0");
  await expect.poll(() => daysWith(page, "r", "data-range-start")).toEqual(["2026-10-12"]);

  await cell(page, "r", "2026-10-23").hover();
  await expect(cell(page, "r", "2026-10-23")).toHaveAttribute("data-preview", "");
  await expect
    .poll(() => daysWith(page, "r", "data-preview"))
    .toEqual(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
  await cell(page, "r", "2026-10-18").hover();
  await expect(cell(page, "r", "2026-10-23")).not.toHaveAttribute("data-preview", /.*/);
  await expect
    .poll(() => daysWith(page, "r", "data-preview"))
    .toEqual(["2026-10-18", "2026-10-19", "2026-10-20"]);

  // Choosing before the anchor writes the range sorted.
  await cell(page, "r", "2026-10-18").click();
  await expect(value).toHaveText("2026-10-18 2026-10-20");
  await expect(anchor).toHaveText("null");
  await expect(outputs).toHaveText("1");
  await expect(page.getByTestId("r-grid").locator("[data-preview]")).toHaveCount(0);
  await expect
    .poll(() => daysWith(page, "r", 'aria-selected="true"'))
    .toEqual(["2026-10-18", "2026-10-19", "2026-10-20"]);
  await expect
    .poll(() => daysWith(page, "r", "data-in-range"))
    .toEqual(["2026-10-18", "2026-10-19", "2026-10-20"]);
  await expect.poll(() => daysWith(page, "r", "data-range-start")).toEqual(["2026-10-18"]);
  await expect.poll(() => daysWith(page, "r", "data-range-end")).toEqual(["2026-10-20"]);
  await expect(cell(page, "r", "2026-10-12")).toHaveAttribute("aria-selected", "false");
  await expect(page.getByTestId("r-state")).toHaveText("2026-10-18 2026-10-20 2026-10");

  // The same day twice is a one-day range.
  await cell(page, "r", "2026-10-05").click();
  await cell(page, "r", "2026-10-05").click();
  await expect(value).toHaveText("2026-10-05 2026-10-05");
  await expect.poll(() => daysWith(page, "r", "data-range-start")).toEqual(["2026-10-05"]);
  await expect.poll(() => daysWith(page, "r", "data-range-end")).toEqual(["2026-10-05"]);
  await expect.poll(() => daysWith(page, "r", "data-in-range")).toEqual(["2026-10-05"]);

  // Choosing after the anchor.
  await cell(page, "r", "2026-10-07").click();
  await cell(page, "r", "2026-10-09").click();
  await expect(value).toHaveText("2026-10-07 2026-10-09");
  await expect(outputs).toHaveText("3");
});

test("CA26: a range by keys: Enter anchors, focus previews, across months too; Escape drops the anchor without writing", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const value = page.getByTestId("r-value");
  const anchor = page.getByTestId("r-anchor");

  await cell(page, "r", "2026-10-05").focus();
  await page.keyboard.press("Enter");
  await expect(anchor).toHaveText("2026-10-05");
  await press(page, "ArrowRight", "2026-10-06", "r");
  await press(page, "ArrowRight", "2026-10-07", "r");
  await press(page, "ArrowRight", "2026-10-08", "r");
  await expect
    .poll(() => daysWith(page, "r", "data-preview"))
    .toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]);
  await press(page, "ArrowUp", "2026-10-01", "r");
  await expect
    .poll(() => daysWith(page, "r", "data-preview"))
    .toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]);

  await page.keyboard.press("Escape");
  await expect(anchor).toHaveText("null");
  await expect(page.getByTestId("r-grid").locator("[data-preview]")).toHaveCount(0);
  await expect(cell(page, "r", "2026-10-01")).toBeFocused();
  await settle(page);
  await expect(value).toHaveText("2026-10-12 2026-10-16");
  await expect(page.getByTestId("r-outputs")).toHaveText("0");

  // Backwards, then across a month: the preview follows focus into November.
  await cell(page, "r", "2026-10-15").focus();
  await page.keyboard.press("Space");
  await press(page, "ArrowLeft", "2026-10-14", "r");
  await press(page, "ArrowLeft", "2026-10-13", "r");
  await page.keyboard.press("Enter");
  await expect(value).toHaveText("2026-10-13 2026-10-15");
  await expect(anchor).toHaveText("null");

  await cell(page, "r", "2026-10-28").focus();
  await page.keyboard.press("Enter");
  await press(page, "PageDown", "2026-11-28", "r");
  await expect(page.getByTestId("r-heading")).toHaveText("November 2026");
  await expect(anchor).toHaveText("2026-10-28");
  await expect.poll(() => daysWith(page, "r", "data-preview")).toHaveLength(28);
  await page.keyboard.press("Enter");
  await expect(value).toHaveText("2026-10-28 2026-11-28");
  await expect.poll(() => daysWith(page, "r", "data-in-range")).toHaveLength(28);
  await expect.poll(() => daysWith(page, "r", "data-range-start")).toEqual([]);
  await expect.poll(() => daysWith(page, "r", "data-range-end")).toEqual(["2026-11-28"]);
  await page.getByTestId("r-previous").click();
  await expect.poll(() => daysWith(page, "r", "data-range-start")).toEqual(["2026-10-28"]);
  await expect
    .poll(() => daysWith(page, "r", "data-in-range"))
    .toEqual(["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]);
  await expect(page.getByTestId("r-outputs")).toHaveText("2");
});

test("CA27: a range's anchor survives focus leaving and Previous/Next, and is dropped by a value write, readonly and disabled; readonly never anchors", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const value = page.getByTestId("r-value");
  const anchor = page.getByTestId("r-anchor");

  // Leaving the root keeps the anchor.
  await cell(page, "r", "2026-10-20").click();
  await page.getByTestId("r-after").click();
  await settle(page);
  await expect(anchor).toHaveText("2026-10-20");
  await cell(page, "r", "2026-10-22").click();
  await expect(value).toHaveText("2026-10-20 2026-10-22");

  // Next keeps it, so a pointer range can span months.
  await cell(page, "r", "2026-10-29").click();
  await page.getByTestId("r-next").click();
  await expect(page.getByTestId("r-heading")).toHaveText("November 2026");
  await expect(anchor).toHaveText("2026-10-29");
  await cell(page, "r", "2026-11-03").hover();
  await expect
    .poll(() => daysWith(page, "r", "data-preview"))
    .toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  await cell(page, "r", "2026-11-03").click();
  await expect(value).toHaveText("2026-10-29 2026-11-03");

  // A value write drops the anchor without writing: the next choice anchors again.
  await cell(page, "r", "2026-11-10").click();
  await expect(anchor).toHaveText("2026-11-10");
  await page.getByTestId("r-write").click();
  await expect(value).toHaveText("2026-11-02 2026-11-06");
  await expect(anchor).toHaveText("null");
  await expect(page.getByTestId("r-grid").locator("[data-preview]")).toHaveCount(0);
  await cell(page, "r", "2026-11-12").click();
  await expect(anchor).toHaveText("2026-11-12");
  await expect(value).toHaveText("2026-11-02 2026-11-06");

  // Becoming readonly drops it, and readonly never anchors.
  await page.getByTestId("r-readonly").click();
  await expect(page.getByTestId("r-grid")).toHaveAttribute("aria-readonly", "true");
  await expect(anchor).toHaveText("null");
  await cell(page, "r", "2026-11-14").click();
  await page.keyboard.press("Enter");
  await settle(page);
  await expect(anchor).toHaveText("null");
  await expect(page.getByTestId("r-grid").locator("[data-preview]")).toHaveCount(0);
  await page.getByTestId("r-readonly").click();

  // Becoming disabled drops it.
  await cell(page, "r", "2026-11-14").click();
  await expect(anchor).toHaveText("2026-11-14");
  await page.getByTestId("r-disable").click();
  await expect(anchor).toHaveText("null");
  await page.getByTestId("r-disable").click();
  await settle(page);
  await expect(value).toHaveText("2026-11-02 2026-11-06");
  await expect(page.getByTestId("r-outputs")).toHaveText("2");
});

test("CA28: a range's ends must be enabled while disabled days may lie inside it; a range with its end before its start selects nothing and is kept", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const value = page.getByTestId("r-value");
  const anchor = page.getByTestId("r-anchor");

  await page.getByTestId("r-weekends").click();
  await expect(cell(page, "r", "2026-10-10")).toHaveAttribute("aria-disabled", "true");

  // A disabled first day doesn't anchor; a disabled second day doesn't end the range.
  await cell(page, "r", "2026-10-10").click({ force: true });
  await settle(page);
  await expect(anchor).toHaveText("null");
  await cell(page, "r", "2026-10-09").click();
  await expect(anchor).toHaveText("2026-10-09");
  await cell(page, "r", "2026-10-11").click({ force: true });
  await settle(page);
  await expect(anchor).toHaveText("2026-10-09");
  await expect(value).toHaveText("2026-10-12 2026-10-16");

  // Disabled days inside the range are part of it.
  await cell(page, "r", "2026-10-13").click();
  await expect(value).toHaveText("2026-10-09 2026-10-13");
  await expect
    .poll(() => daysWith(page, "r", "data-in-range"))
    .toEqual(["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"]);
  await expect(cell(page, "r", "2026-10-10")).toHaveAttribute("aria-selected", "true");
  await expect(cell(page, "r", "2026-10-10")).toHaveAttribute("aria-disabled", "true");

  // A reversed value selects nothing, is kept, and the display follows today.
  await page.getByTestId("r-write-reversed").click();
  await expect(value).toHaveText("2026-10-20 2026-10-10");
  await expect(page.getByTestId("r-state")).toHaveText("2026-10-20 2026-10-10 2026-10");
  await expect(page.getByTestId("r-grid").locator('td[aria-selected="true"]')).toHaveCount(0);
  await expect(
    page.getByTestId("r-grid").locator("[data-in-range], [data-range-start], [data-range-end]"),
  ).toHaveCount(0);
  await expect(page.getByTestId("r-outputs")).toHaveText("1");
});

test("CA29: Signal Forms and Field for several days and a range: Labels then the Heading name the grids, the bound values, touch on leaving with the anchor kept, readonly and disabled rules", async ({
  page,
}, info) => {
  const trip = page.getByTestId("trip-grid");
  const stay = page.getByTestId("stay-grid");

  async function expectNaming(): Promise<void> {
    await expect(trip).toHaveAttribute("aria-labelledby", "trip-label trip-heading");
    await expect(trip).toHaveAttribute("aria-describedby", "trip-description");
    await expect(trip).toHaveAttribute("aria-multiselectable", "true");
    await expect(stay).toHaveAttribute("aria-labelledby", "stay-label stay-heading");
    await expect(stay).toHaveAttribute("aria-multiselectable", "true");
    await expectTabStop(page, "trip", "2026-10-27");
    await expectTabStop(page, "stay", "2026-10-27");
  }

  await fixture(page, "calendar", info, expectNaming);
  await expectNaming();
  await expect(page.getByRole("grid", { name: "Trip days October 2026" })).toHaveCount(1);
  await expect(page.getByRole("grid", { name: "Stay October 2026" })).toHaveCount(1);

  // Several days: focusBoundControl, toggles written to the field, touch only on leaving.
  await page.getByTestId("focus-trip").click();
  await expect(cell(page, "trip", "2026-10-27")).toBeFocused();
  await page.keyboard.press("Enter");
  await press(page, "ArrowLeft", "2026-10-26", "trip");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("trip-value")).toHaveText("2026-10-26 2026-10-27");
  await expect(page.getByTestId("trip-touched")).toHaveText("false");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("trip-after")).toBeFocused();
  await expect(page.getByTestId("trip-touched")).toHaveText("true");

  // A range: never half in the field; leaving touches and keeps the anchor.
  await page.getByTestId("focus-stay").click();
  await expect(cell(page, "stay", "2026-10-27")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("stay-anchor")).toHaveText("2026-10-27");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("stay-after")).toBeFocused();
  await expect(page.getByTestId("stay-touched")).toHaveText("true");
  await expect(page.getByTestId("stay-anchor")).toHaveText("2026-10-27");
  await expect(page.getByTestId("stay-value")).toHaveText("null");
  await cell(page, "stay", "2026-10-29").click();
  await expect(page.getByTestId("stay-value")).toHaveText("2026-10-27 2026-10-29");

  // A model write selects in both, and drops a pending anchor.
  await cell(page, "stay", "2026-10-20").click();
  await expect(page.getByTestId("stay-anchor")).toHaveText("2026-10-20");
  await page.getByTestId("write-booking").click();
  await expect(page.getByTestId("stay-anchor")).toHaveText("null");
  await expect
    .poll(() => daysWith(page, "trip", 'aria-selected="true"'))
    .toEqual(["2026-10-02", "2026-10-09"]);
  await expect
    .poll(() => daysWith(page, "stay", "data-in-range"))
    .toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]);

  // Readonly rules: nothing writes and no anchor is set.
  await page.getByTestId("freeze-booking").click();
  await expect(trip).toHaveAttribute("aria-readonly", "true");
  await expect(stay).toHaveAttribute("aria-readonly", "true");
  await cell(page, "trip", "2026-10-15").click();
  await cell(page, "stay", "2026-10-15").click();
  await settle(page);
  await expect(page.getByTestId("trip-value")).toHaveText("2026-10-02 2026-10-09");
  await expect(page.getByTestId("stay-anchor")).toHaveText("null");
  await page.getByTestId("freeze-booking").click();

  // Disabled rules: no tab stop, and a pending anchor is dropped.
  await cell(page, "stay", "2026-10-20").click();
  await expect(page.getByTestId("stay-anchor")).toHaveText("2026-10-20");
  await page.getByTestId("lock-booking").click();
  await expect(trip).toHaveAttribute("aria-disabled", "true");
  await expect(stay).toHaveAttribute("aria-disabled", "true");
  await expect(trip.locator("td[tabindex]")).toHaveCount(0);
  await expect(stay.locator("td[tabindex]")).toHaveCount(0);
  await expect(page.getByTestId("stay-anchor")).toHaveText("null");
  await page.getByTestId("lock-booking").click();
  await expect(page.getByTestId("stay-value")).toHaveText("2026-10-05 2026-10-08");
});

test("CA30: several days: whatever order an external value has, a choice writes its canonical days in chronological order, each once, then the entries that aren't days", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const value = page.getByTestId("m-value");

  // The write is kept as written until the next choice.
  await page.getByTestId("m-write-unsorted").click();
  await expect(value).toHaveText("2026-10-20 2026-10-06");
  await expectTabStop(page, "m", "2026-10-20");
  await cell(page, "m", "2026-10-13").click();
  await expect(value).toHaveText("2026-10-06 2026-10-13 2026-10-20");

  // A removal sorts too, with a day no cell shows, an entry that isn't a day and a repeated day.
  await page.getByTestId("m-write-mixed").click();
  await expect(value).toHaveText("2026-10-20 27/10/2026 2026-12-25 2026-10-06 2026-10-06");
  await cell(page, "m", "2026-10-20").click();
  await expect(value).toHaveText("2026-10-06 2026-12-25 27/10/2026");
  await page.getByTestId("m-write-mixed").click();
  await cell(page, "m", "2026-10-13").click();
  await expect(value).toHaveText("2026-10-06 2026-10-13 2026-10-20 2026-12-25 27/10/2026");
  await expect(page.getByTestId("m-outputs")).toHaveText("3");
});

test("CA31: a choice inside the displayed month keeps a followed display there by writing it to month, so the chosen day keeps focus", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const value = page.getByTestId("m-value");
  const month = page.getByTestId("m-month");
  const heading = page.getByTestId("m-heading");

  // A choice that doesn't move the display writes no month.
  await cell(page, "m", "2026-10-13").click();
  await expect(value).toHaveText("2026-10-06 2026-10-13 2026-10-20");
  await settle(page);
  await expect(month).toHaveText("null");

  // By keys: removing the first day would show December.
  await page.getByTestId("m-write-spread").click();
  await expect(heading).toHaveText("October 2026");
  await cell(page, "m", "2026-10-20").focus();
  await page.keyboard.press("Enter");
  await expect(value).toHaveText("2026-12-25");
  await expect(month).toHaveText("2026-10");
  await expect(heading).toHaveText("October 2026");
  await expect(cell(page, "m", "2026-10-20")).toBeFocused();
  await press(page, "ArrowRight", "2026-10-21", "m");

  // By pointer.
  await page.getByTestId("m-write-spread").click();
  await page.getByTestId("m-follow").click();
  await expect(month).toHaveText("null");
  await cell(page, "m", "2026-10-20").click();
  await expect(value).toHaveText("2026-12-25");
  await expect(month).toHaveText("2026-10");
  await expect(heading).toHaveText("October 2026");
  await expect(cell(page, "m", "2026-10-20")).toBeFocused();

  // Removing the only day of a followed month other than today's would show today's.
  await page.getByTestId("m-follow").click();
  await expect(heading).toHaveText("December 2026");
  await cell(page, "m", "2026-12-25").click();
  await expect(value).toHaveText("");
  await expect(month).toHaveText("2026-12");
  await expect(heading).toHaveText("December 2026");
  await expect(cell(page, "m", "2026-12-25")).toBeFocused();
  await press(page, "ArrowLeft", "2026-12-24", "m");
});

test("CA32: a range: Escape drops the anchor from Previous and Next too; inside a Dialog the first Escape drops it and the next closes the Dialog", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const anchor = page.getByTestId("r-anchor");
  const next = page.getByTestId("r-next");
  const previous = page.getByTestId("r-previous");

  await cell(page, "r", "2026-10-29").click();
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("r-heading")).toHaveText("November 2026");
  await expect(next).toBeFocused();
  await expect(anchor).toHaveText("2026-10-29");
  await page.keyboard.press("Escape");
  await expect(anchor).toHaveText("null");
  await expect(next).toBeFocused();
  await expect(page.getByTestId("r-grid").locator("[data-preview]")).toHaveCount(0);

  await cell(page, "r", "2026-11-03").click();
  await previous.focus();
  await page.keyboard.press("Escape");
  await expect(anchor).toHaveText("null");
  await expect(previous).toBeFocused();
  await settle(page);
  await expect(page.getByTestId("r-value")).toHaveText("2026-10-12 2026-10-16");
  await expect(page.getByTestId("r-outputs")).toHaveText("0");

  // In a Dialog, from a cell, then from Next.
  const open = page.getByTestId("d-open-state");
  const dialogAnchor = page.getByTestId("d-anchor");
  const content = page.getByTestId("d-content");

  await page.getByTestId("d-open").click();
  await expect(content).toBeVisible();
  await cell(page, "d", "2026-10-20").click();
  await expect(dialogAnchor).toHaveText("2026-10-20");
  await page.keyboard.press("Escape");
  await expect(dialogAnchor).toHaveText("null");
  await settle(page);
  await expect(open).toHaveText("true");
  await expect(cell(page, "d", "2026-10-20")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(open).toHaveText("false");
  await expect(content).toBeHidden();

  await page.getByTestId("d-open").click();
  await expect(content).toBeVisible();
  await cell(page, "d", "2026-10-22").click();
  await expect(dialogAnchor).toHaveText("2026-10-22");
  await page.getByTestId("d-next").focus();
  await page.keyboard.press("Escape");
  await expect(dialogAnchor).toHaveText("null");
  await settle(page);
  await expect(open).toHaveText("true");
  await expect(page.getByTestId("d-next")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(open).toHaveText("false");
  await expect(content).toBeHidden();
});

test("CA33: a range: a second choice after the bounds or dateDisabled disabled the anchor anchors anew and writes nothing", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const value = page.getByTestId("r-value");
  const anchor = page.getByTestId("r-anchor");

  // dateDisabled.
  await cell(page, "r", "2026-10-10").click();
  await expect(anchor).toHaveText("2026-10-10");
  await page.getByTestId("r-weekends").click();
  await expect(cell(page, "r", "2026-10-10")).toHaveAttribute("aria-disabled", "true");
  await cell(page, "r", "2026-10-13").click();
  await expect(anchor).toHaveText("2026-10-13");
  await settle(page);
  await expect(value).toHaveText("2026-10-12 2026-10-16");
  await expect(page.getByTestId("r-outputs")).toHaveText("0");
  await cell(page, "r", "2026-10-14").click();
  await expect(value).toHaveText("2026-10-13 2026-10-14");

  // minDate raised past the anchor.
  await cell(page, "r", "2026-10-20").click();
  await expect(anchor).toHaveText("2026-10-20");
  await page.getByTestId("r-min").click();
  await expect(cell(page, "r", "2026-10-20")).toHaveAttribute("aria-disabled", "true");
  await cell(page, "r", "2026-10-22").click();
  await expect(anchor).toHaveText("2026-10-22");
  await settle(page);
  await expect(value).toHaveText("2026-10-13 2026-10-14");
  await cell(page, "r", "2026-10-23").click();
  await expect(value).toHaveText("2026-10-22 2026-10-23");

  // maxDate lowered before it.
  await cell(page, "r", "2026-10-29").click();
  await expect(anchor).toHaveText("2026-10-29");
  await page.getByTestId("r-max").click();
  await expect(cell(page, "r", "2026-10-29")).toHaveAttribute("aria-disabled", "true");
  await cell(page, "r", "2026-10-26").click();
  await expect(anchor).toHaveText("2026-10-26");
  await settle(page);
  await expect(value).toHaveText("2026-10-22 2026-10-23");
  await cell(page, "r", "2026-10-27").click();
  await expect(value).toHaveText("2026-10-26 2026-10-27");
  await expect(page.getByTestId("r-outputs")).toHaveText("3");
});

/** A page of years as the en-US heading writes it, "2016 – 2027", thin spaces around the dash. */
function yearsHeading(first: string, last: string): RegExp {
  return new RegExp(`^${first}\\s–\\s${last}$`);
}

/** The months from `first` to `last` of one year, `YYYY-MM`. */
function monthsFrom(year: string, first: number, last: number): string[] {
  const months: string[] = [];

  for (let month = first; month <= last; month += 1) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
  }

  return months;
}

/** Presses `key` and expects focus to stay on the cell of `date`. */
async function pressHeld(page: Page, key: string, date: string, name: string): Promise<void> {
  await page.keyboard.press(key);
  await settle(page);
  await expect(cell(page, name, date)).toBeFocused();
}

test("CA34: views drill down from years to months to a day with focus following each time; only the day writes the value", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const heading = page.getByTestId("v-heading");
  const value = page.getByTestId("v-value");
  const month = page.getByTestId("v-month");
  const view = page.getByTestId("v-view");

  await page.getByTestId("v-switch").click();
  await expect(view).toHaveText("years");
  await expect(heading).toHaveText(yearsHeading("2016", "2027"));
  await expect(page.getByTestId("v-grid").locator('td[role="gridcell"]')).toHaveCount(12);
  await expectTabStop(page, "v", "2026");

  // By keys: a year shows its months with the displayed month's number focused, a month its days.
  await cell(page, "v", "2026").focus();
  await press(page, "ArrowRight", "2027", "v");
  await page.keyboard.press("Enter");
  await expect(view).toHaveText("months");
  await expect(heading).toHaveText("2027");
  await expect(cell(page, "v", "2027-10")).toBeFocused();
  await expectTabStop(page, "v", "2027-10");
  await expect(month).toHaveText("2027-10");
  await press(page, "ArrowLeft", "2027-09", "v");
  await page.keyboard.press("Space");
  await expect(view).toHaveText("days");
  await expect(heading).toHaveText("September 2027");
  await expect(cell(page, "v", "2027-09-01")).toBeFocused();
  await expectTabStop(page, "v", "2027-09-01");
  await expect(month).toHaveText("2027-09");
  await expect(value).toHaveText("null");
  await press(page, "ArrowRight", "2027-09-02", "v");
  await page.keyboard.press("Enter");
  await expect(value).toHaveText("2027-09-02");
  await expect(view).toHaveText("days");
  await expect(cell(page, "v", "2027-09-02")).toBeFocused();

  // By pointer: the months view's tab stop is the displayed month's number.
  await page.getByTestId("v-switch").click();
  await expect(heading).toHaveText(yearsHeading("2016", "2027"));
  await cell(page, "v", "2020").click();
  await expect(heading).toHaveText("2020");
  await expect(cell(page, "v", "2020-09")).toBeFocused();
  await cell(page, "v", "2020-02").click();
  await expect(heading).toHaveText("February 2020");
  await expect(cell(page, "v", "2020-02-01")).toBeFocused();
  await cell(page, "v", "2020-02-14").click();
  await expect(value).toHaveText("2020-02-14");
  await expect(page.getByTestId("v-state")).toHaveText("days 2020-02");
  await expect(page.getByTestId("v-outputs")).toHaveText("2");
  await expect(page.getByTestId("v-view-outputs")).toHaveText("4");

  // Readonly still drills down, and the day isn't written.
  await page.getByTestId("v-readonly").click();
  await page.getByTestId("v-months").click();
  await cell(page, "v", "2020-05").click();
  await expect(heading).toHaveText("May 2020");
  await expect(cell(page, "v", "2020-05-01")).toBeFocused();
  await cell(page, "v", "2020-05-06").click();
  await settle(page);
  await expect(value).toHaveText("2020-02-14");
});

test("CA35: keys in the months and years views move by one, by columns, to the row's ends and by a year or twelve, showing the next year or page; Previous and Next step a year or twelve", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const heading = page.getByTestId("v-heading");
  const month = page.getByTestId("v-month");

  await page.getByTestId("v-months").click();
  await expect(heading).toHaveText("2026");
  await expect(page.getByTestId("v-grid").locator("tr")).toHaveCount(4);
  await expect(cell(page, "v", "2026-10")).toHaveText("Oct");
  await expectTabStop(page, "v", "2026-10");
  await cell(page, "v", "2026-10").focus();
  await press(page, "ArrowRight", "2026-11", "v");
  await press(page, "ArrowLeft", "2026-10", "v");
  await press(page, "End", "2026-12", "v");
  await press(page, "Home", "2026-10", "v");
  await press(page, "ArrowUp", "2026-07", "v");
  await press(page, "ArrowDown", "2026-10", "v");
  await expect(month).toHaveText("null");
  await press(page, "ArrowDown", "2027-01", "v");
  await expect(heading).toHaveText("2027");
  await expect(month).toHaveText("2027-01");
  await press(page, "ArrowLeft", "2026-12", "v");
  await expect(heading).toHaveText("2026");
  await press(page, "PageDown", "2027-12", "v");
  await expect(heading).toHaveText("2027");
  await press(page, "PageUp", "2026-12", "v");
  await pressHeld(page, "Shift+PageDown", "2026-12", "v");
  await expect(heading).toHaveText("2026");

  // Previous and Next step a year and keep their focus.
  await page.getByTestId("v-next").click();
  await expect(heading).toHaveText("2027");
  await expect(month).toHaveText("2027-12");
  await expect(page.getByTestId("v-next")).toBeFocused();
  await expectTabStop(page, "v", "2027-12");
  await page.getByTestId("v-previous").click();
  await expect(heading).toHaveText("2026");
  await expect(page.getByTestId("v-previous")).toBeFocused();

  // Years: a page of twelve in rows of three.
  await page.getByTestId("v-years").click();
  await expect(heading).toHaveText(yearsHeading("2016", "2027"));
  await expectTabStop(page, "v", "2026");
  await cell(page, "v", "2026").focus();
  await press(page, "ArrowRight", "2027", "v");
  await press(page, "ArrowRight", "2028", "v");
  await expect(heading).toHaveText(yearsHeading("2028", "2039"));
  await expect(month).toHaveText("2028-12");
  await press(page, "ArrowLeft", "2027", "v");
  await expect(heading).toHaveText(yearsHeading("2016", "2027"));
  await press(page, "ArrowUp", "2024", "v");
  await press(page, "ArrowDown", "2027", "v");
  await press(page, "Home", "2025", "v");
  await press(page, "End", "2027", "v");
  await press(page, "PageDown", "2039", "v");
  await expect(heading).toHaveText(yearsHeading("2028", "2039"));
  await press(page, "PageUp", "2027", "v");
  await page.getByTestId("v-next").click();
  await expect(heading).toHaveText(yearsHeading("2028", "2039"));
  await expect(month).toHaveText("2039-12");
  await expect(page.getByTestId("v-next")).toBeFocused();
  await expectTabStop(page, "v", "2039");
  await page.getByTestId("v-previous").click();
  await expect(heading).toHaveText(yearsHeading("2016", "2027"));
  await expect(month).toHaveText("2027-12");

  // Four columns: three rows, and Up and Down move by four.
  await page.getByTestId("v-four-columns").click();
  await page.getByTestId("v-months").click();
  await expect(page.getByTestId("v-grid").locator("tr")).toHaveCount(3);
  await expect(page.getByTestId("v-grid").locator("tr").first().locator("td")).toHaveCount(4);
  await cell(page, "v", "2027-12").focus();
  await press(page, "ArrowUp", "2027-08", "v");
  await press(page, "Home", "2027-05", "v");
  await press(page, "End", "2027-08", "v");
});

test("CA36: Escape in the months or years view shows the days again without changing month, focus following from a cell and staying on Previous; a range's anchor goes first", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const heading = page.getByTestId("v-heading");
  const month = page.getByTestId("v-month");
  const view = page.getByTestId("v-view");

  await page.evaluate(() => {
    const escapes: boolean[] = [];

    Object.assign(window, { calendarEscapes: escapes });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        escapes.push(event.defaultPrevented);
      }
    });
  });

  await page.getByTestId("v-years").click();
  await cell(page, "v", "2026").focus();
  await press(page, "PageDown", "2038", "v");
  await expect(month).toHaveText("2038-10");
  await page.keyboard.press("Escape");
  await expect(view).toHaveText("days");
  await expect(heading).toHaveText("October 2038");
  await expect(month).toHaveText("2038-10");
  await expect(cell(page, "v", "2038-10-01")).toBeFocused();
  await expectTabStop(page, "v", "2038-10-01");

  // From Previous: the days show and Previous keeps focus.
  await page.getByTestId("v-months").click();
  await expect(heading).toHaveText("2038");
  await page.getByTestId("v-previous").focus();
  await page.keyboard.press("Escape");
  await expect(view).toHaveText("days");
  await expect(page.getByTestId("v-previous")).toBeFocused();
  await expect(month).toHaveText("2038-10");

  // In the days view Escape is left alone.
  await cell(page, "v", "2038-10-01").focus();
  await page.keyboard.press("Escape");
  await settle(page);
  await expect(view).toHaveText("days");
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "calendarEscapes")))
    .toEqual([true, true, false]);
  await expect(page.getByTestId("v-view-outputs")).toHaveText("2");

  // A range: the first Escape drops the anchor, the next shows the days.
  const anchor = page.getByTestId("vr-anchor");

  await cell(page, "vr", "2026-09-15").click();
  await expect(anchor).toHaveText("2026-09-15");
  await page.getByTestId("vr-months").click();
  await cell(page, "vr", "2026-09").focus();
  await page.keyboard.press("Escape");
  await expect(anchor).toHaveText("null");
  await expect(page.getByTestId("vr-view")).toHaveText("months");
  await expect(cell(page, "vr", "2026-09")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("vr-view")).toHaveText("days");
  await expect(cell(page, "vr", "2026-09-28")).toBeFocused();
  await expect(page.getByTestId("vr-value")).toHaveText("2026-09-28 2026-10-03");
});

test("CA37: in the months and years views a month or year is disabled only when wholly outside minDate/maxDate; keys stop there, Previous and Next disable, and disabled cells don't drill down; dateDisabled disables days alone", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const heading = page.getByTestId("v-heading");
  const previous = page.getByTestId("v-previous");
  const next = page.getByTestId("v-next");

  await page.getByTestId("v-bound").click();
  await page.getByTestId("v-months").click();
  await expect.poll(() => daysWith(page, "v", "aria-disabled")).toEqual(monthsFrom("2026", 1, 9));
  await expect.poll(() => daysWith(page, "v", "data-disabled")).toEqual(monthsFrom("2026", 1, 9));
  await expect(previous).toHaveAttribute("aria-disabled", "true");
  await expect(next).not.toHaveAttribute("aria-disabled", /.*/);
  await cell(page, "v", "2026-10").focus();
  await pressHeld(page, "ArrowLeft", "2026-10", "v");
  await pressHeld(page, "PageUp", "2026-10", "v");
  await press(page, "ArrowUp", "2026-10", "v");
  await cell(page, "v", "2026-09").click({ force: true });
  await settle(page);
  await expect(page.getByTestId("v-view")).toHaveText("months");

  await next.click();
  await expect(heading).toHaveText("2027");
  await expect.poll(() => daysWith(page, "v", "aria-disabled")).toEqual(monthsFrom("2027", 3, 12));
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await expect(next).toBeFocused();
  await expect(previous).not.toHaveAttribute("aria-disabled", /.*/);
  await cell(page, "v", "2027-02").focus();
  await pressHeld(page, "ArrowRight", "2027-02", "v");
  await pressHeld(page, "PageDown", "2027-02", "v");

  // Years: only 2026 and 2027 hold days within the bounds.
  await page.getByTestId("v-years").click();
  await expect.poll(() => daysWith(page, "v", "aria-disabled")).toHaveLength(10);
  await expect(cell(page, "v", "2026")).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(cell(page, "v", "2027")).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(previous).toHaveAttribute("aria-disabled", "true");
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await cell(page, "v", "2027").focus();
  await pressHeld(page, "ArrowRight", "2027", "v");
  await press(page, "ArrowLeft", "2026", "v");
  await pressHeld(page, "ArrowLeft", "2026", "v");
  await pressHeld(page, "PageUp", "2026", "v");
  await cell(page, "v", "2025").click({ force: true });
  await settle(page);
  await expect(page.getByTestId("v-view")).toHaveText("years");

  // dateDisabled doesn't disable months; their days are.
  await page.getByTestId("v-every-day").click();
  await cell(page, "v", "2027").click();
  await expect(heading).toHaveText("2027");
  await expect(cell(page, "v", "2027-01")).not.toHaveAttribute("aria-disabled", /.*/);
  await cell(page, "v", "2027-01").click();
  await expect(heading).toHaveText("January 2027");
  await expect(page.getByTestId("v-grid").locator('td[aria-disabled="true"]')).toHaveCount(42);
});

test("CA38: writing view yourself keeps focus where it is and moves the grid's tab stop to the displayed period", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const toggle = page.getByTestId("v-switch");

  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("v-view")).toHaveText("years");
  await expect(toggle).toBeFocused();
  await expectTabStop(page, "v", "2026");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("v-next")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cell(page, "v", "2026")).toBeFocused();
  await press(page, "ArrowLeft", "2025", "v");

  // A focused cell of another view keeps no tab stop: back in the days, it's today.
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("v-view")).toHaveText("days");
  await expect(toggle).toBeFocused();
  await expectTabStop(page, "v", "2026-10-27");

  // The months view's tab stop is the displayed month, and follows a month write.
  await page.getByTestId("v-months").click();
  await expect(page.getByTestId("v-months")).toBeFocused();
  await expectTabStop(page, "v", "2026-10");
  await page.getByTestId("v-march-2025").click();
  await expect(page.getByTestId("v-heading")).toHaveText("2025");
  await expectTabStop(page, "v", "2025-03");
  await page.getByTestId("v-days").click();
  await expectTabStop(page, "v", "2025-03-01");
  await expect(page.getByTestId("v-days")).toBeFocused();
});

test("CA39: per view, the months and years mark the selection's period, the displayed one and today's, aria-selected only in the days, and aria-multiselectable only there", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  // One day: 15 October 2026 chosen, March 2025 displayed.
  await page.getByTestId("v-write").click();
  await page.getByTestId("v-march-2025").click();
  await page.getByTestId("v-months").click();

  const grid = page.getByTestId("v-grid");

  await expect(page.getByTestId("v-heading")).toHaveText("2025");
  await expect.poll(() => daysWith(page, "v", "data-current")).toEqual(["2025-03"]);
  await expect.poll(() => daysWith(page, "v", "data-selected")).toEqual([]);
  await expect.poll(() => daysWith(page, "v", "data-today")).toEqual([]);
  await expect(grid.locator("[aria-selected]")).toHaveCount(0);
  await expect(grid.locator("[aria-current]")).toHaveCount(0);
  await expect(cell(page, "v", "2025-03")).toHaveAttribute("aria-label", "March 2025");
  await page.getByTestId("v-next").click();
  await expect.poll(() => daysWith(page, "v", "data-current")).toEqual(["2026-03"]);
  await expect.poll(() => daysWith(page, "v", "data-selected")).toEqual(["2026-10"]);
  await expect.poll(() => daysWith(page, "v", "data-today")).toEqual(["2026-10"]);
  await expect(cell(page, "v", "2026-10")).toHaveAttribute("aria-current", "date");
  await expect(grid.locator("[aria-selected]")).toHaveCount(0);
  await page.getByTestId("v-years").click();
  await expect(page.getByTestId("v-heading")).toHaveText(yearsHeading("2016", "2027"));
  await expect.poll(() => daysWith(page, "v", "data-current")).toEqual(["2026"]);
  await expect.poll(() => daysWith(page, "v", "data-selected")).toEqual(["2026"]);
  await expect.poll(() => daysWith(page, "v", "data-today")).toEqual(["2026"]);
  await expect(cell(page, "v", "2026")).toHaveAttribute("aria-label", "2026");
  await expect(cell(page, "v", "2026")).toHaveAttribute("aria-current", "date");
  await expect(grid.locator("[aria-selected], [data-outside]")).toHaveCount(0);
  await expect(grid).not.toHaveAttribute("aria-multiselectable", /.*/);
  await page.getByTestId("v-days").click();
  await expect(cell(page, "v", "2026-03-04")).toHaveAttribute(
    "aria-label",
    "Wednesday, March 4, 2026",
  );
  await expect(grid.locator("[data-current]")).toHaveCount(0);

  // Several days: the first value's month and year; the days alone are multiselectable.
  const several = page.getByTestId("vm-grid");

  await expect(several).toHaveAttribute("aria-multiselectable", "true");
  await page.getByTestId("vm-months").click();
  await expect(page.getByTestId("vm-heading")).toHaveText("2026");
  await expect(several).not.toHaveAttribute("aria-multiselectable", /.*/);
  await expect.poll(() => daysWith(page, "vm", "data-selected")).toEqual(["2026-11"]);
  await expect.poll(() => daysWith(page, "vm", "data-current")).toEqual(["2026-11"]);
  await expect(several.locator("[aria-selected]")).toHaveCount(0);
  await page.getByTestId("vm-years").click();
  await expect.poll(() => daysWith(page, "vm", "data-selected")).toEqual(["2026"]);
  await expect(several.locator("[aria-selected]")).toHaveCount(0);
  await page.getByTestId("vm-days").click();
  await expect(several).toHaveAttribute("aria-multiselectable", "true");
  await expect(several.locator('td[aria-selected="true"]')).toHaveCount(1);

  // A range: its start's month; no range markers outside the days.
  const range = page.getByTestId("vr-grid");

  await page.getByTestId("vr-months").click();
  await expect(range).not.toHaveAttribute("aria-multiselectable", /.*/);
  await expect.poll(() => daysWith(page, "vr", "data-selected")).toEqual(["2026-09"]);
  await expect(
    range.locator(
      "[aria-selected], [data-range-start], [data-range-end], [data-in-range], [data-preview]",
    ),
  ).toHaveCount(0);
  await page.getByTestId("vr-days").click();
  await expect.poll(() => daysWith(page, "vr", "data-in-range")).toHaveLength(6);
});

test("CA40: a month Calendar writes the chosen YYYY-MM; keys, a year drilling down to its months, minMonth/maxMonth, monthDisabled and readonly", async ({
  page,
}, info) => {
  async function expectMonths(): Promise<void> {
    const grid = page.getByTestId("mc-grid");

    await expect(page.getByTestId("mc-heading")).toHaveText("2026");
    await expect(grid).toHaveAttribute("role", "grid");
    await expect(grid.locator('td[role="gridcell"]')).toHaveCount(12);
    await expect(cell(page, "mc", "2026-10")).toHaveAttribute("aria-current", "date");
    await expect(grid.locator("[aria-selected]")).toHaveCount(0);
    await expectTabStop(page, "mc", "2026-10");
    await expect(root(page, "mc")).toHaveAttribute("data-today", /^\d{4}-\d{2}-\d{2}$/);
    await expect(root(page, "mc")).not.toHaveAttribute("data-week-start", /.*/);
  }

  await fixture(page, "calendar", info, expectMonths);
  await expectMonths();

  const value = page.getByTestId("mc-value");
  const heading = page.getByTestId("mc-heading");

  // Choosing writes the month and keeps the view.
  await cell(page, "mc", "2026-03").click();
  await expect(value).toHaveText("2026-03");
  await expect(cell(page, "mc", "2026-03")).toHaveAttribute("aria-selected", "true");
  await expect(cell(page, "mc", "2026-03")).toHaveAttribute("data-selected", "");
  await expect(page.getByTestId("mc-view")).toHaveText("months");
  await expect(page.getByTestId("mc-month")).toHaveText("null");
  await expect(cell(page, "mc", "2026-03")).toBeFocused();
  await press(page, "ArrowDown", "2026-06", "mc");
  await page.keyboard.press("Enter");
  await expect(value).toHaveText("2026-06");
  await press(page, "PageDown", "2027-06", "mc");
  await expect(heading).toHaveText("2027");
  await page.keyboard.press("Enter");
  await expect(value).toHaveText("2027-06");
  await expect(cell(page, "mc", "2027-06")).toBeFocused();

  // A year shows its months; Escape returns from the years.
  await page.getByTestId("mc-switch").click();
  await expect(heading).toHaveText(yearsHeading("2016", "2027"));
  await expectTabStop(page, "mc", "2027");
  await cell(page, "mc", "2027").focus();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("mc-view")).toHaveText("months");
  await expect(cell(page, "mc", "2027-06")).toBeFocused();
  await page.getByTestId("mc-switch").click();
  await cell(page, "mc", "2020").click();
  await expect(heading).toHaveText("2020");
  await expect(cell(page, "mc", "2020-06")).toBeFocused();
  await expect(page.getByTestId("mc-month")).toHaveText("2020-06");
  await expect(value).toHaveText("2027-06");
  await expect(page.getByTestId("mc-state")).toHaveText("2027-06 2020-06 months");
  await expect(page.getByTestId("mc-outputs")).toHaveText("3");

  // Bounds: months outside, and years wholly outside, are disabled; keys and steps stop.
  await page.getByTestId("mc-bound").click();
  await expect(heading).toHaveText("2020");
  await expect.poll(() => daysWith(page, "mc", "aria-disabled")).toHaveLength(12);
  await expect(page.getByTestId("mc-next")).toHaveAttribute("aria-disabled", "true");
  await page.getByTestId("mc-switch").click();
  await expect.poll(() => daysWith(page, "mc", "aria-disabled")).toHaveLength(10);
  await expect(page.getByTestId("mc-previous")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("mc-next")).toHaveAttribute("aria-disabled", "true");
  await cell(page, "mc", "2026").click();
  await expect(heading).toHaveText("2026");
  await expect.poll(() => daysWith(page, "mc", "aria-disabled")).toEqual(["2026-01", "2026-02"]);
  await expect(page.getByTestId("mc-previous")).toHaveAttribute("aria-disabled", "true");
  await cell(page, "mc", "2026-03").focus();
  await pressHeld(page, "ArrowLeft", "2026-03", "mc");
  await cell(page, "mc", "2026-02").click({ force: true });
  await settle(page);
  await expect(value).toHaveText("2027-06");
  await page.getByTestId("mc-next").click();
  await expect.poll(() => daysWith(page, "mc", "aria-disabled")).toEqual(monthsFrom("2027", 9, 12));
  await cell(page, "mc", "2027-08").focus();
  await pressHeld(page, "ArrowRight", "2027-08", "mc");

  // monthDisabled disables months alone.
  await page.getByTestId("mc-july").click();
  await expect(cell(page, "mc", "2027-07")).toHaveAttribute("aria-disabled", "true");
  await cell(page, "mc", "2027-07").click({ force: true });
  await settle(page);
  await expect(value).toHaveText("2027-06");
  await page.getByTestId("mc-switch").click();
  await expect(cell(page, "mc", "2027")).not.toHaveAttribute("aria-disabled", /.*/);
  await page.getByTestId("mc-switch").click();

  // Readonly browses and drills down without writing.
  await page.getByTestId("mc-readonly").click();
  await cell(page, "mc", "2027-05").click();
  await settle(page);
  await expect(value).toHaveText("2027-06");
  await page.getByTestId("mc-switch").click();
  await cell(page, "mc", "2026").click();
  await expect(heading).toHaveText("2026");
  await page.getByTestId("mc-readonly").click();

  // A value that isn't a month selects nothing and is kept.
  await page.getByTestId("mc-write-invalid").click();
  await expect(page.getByTestId("mc-grid").locator("[aria-selected]")).toHaveCount(0);
  await expect(value).toHaveText("2026-13");
  await expect(page.getByTestId("mc-outputs")).toHaveText("3");
});

test("CA41: Signal Forms and Field for a month: Labels then the Heading name the grid, the bound value, touch only on leaving, focusBoundControl, minMonth next to formField, readonly and disabled rules", async ({
  page,
}, info) => {
  const grid = page.getByTestId("start-grid");
  const value = page.getByTestId("start-value");
  const touched = page.getByTestId("start-touched");

  async function expectNaming(): Promise<void> {
    await expect(grid).toHaveAttribute("aria-labelledby", "start-label start-heading");
    await expect(grid).toHaveAttribute("aria-describedby", "start-description");
    await expect(grid).toHaveAttribute("aria-required", "true");
    await expect(cell(page, "start", "2026-02")).toHaveAttribute("aria-disabled", "true");
    await expectTabStop(page, "start", "2026-10");
  }

  await fixture(page, "calendar", info, expectNaming);
  await expectNaming();
  await expect(page.getByRole("grid", { name: "Start month 2026" })).toHaveCount(1);

  await page.getByTestId("focus-start").click();
  await expect(cell(page, "start", "2026-10")).toBeFocused();
  await press(page, "PageDown", "2027-10", "start");
  await press(page, "PageUp", "2026-10", "start");
  await settle(page);
  await expect(touched).toHaveText("false");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("start-after")).toBeFocused();
  await expect(touched).toHaveText("true");
  await expect(grid).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#start-error")).toHaveText("Choose the start month.");

  await cell(page, "start", "2026-02").click({ force: true });
  await settle(page);
  await expect(value).toHaveText("null");
  await cell(page, "start", "2026-04").click();
  await expect(value).toHaveText("2026-04");
  await expect(grid).not.toHaveAttribute("aria-invalid", /.*/);
  await page.getByTestId("write-start").click();
  await expect(cell(page, "start", "2026-05")).toHaveAttribute("aria-selected", "true");

  await page.getByTestId("freeze-start").click();
  await expect(grid).toHaveAttribute("aria-readonly", "true");
  await cell(page, "start", "2026-08").click();
  await settle(page);
  await expect(value).toHaveText("2026-05");
  await page.getByTestId("freeze-start").click();

  await page.getByTestId("lock-start").click();
  await expect(grid).toHaveAttribute("aria-disabled", "true");
  await expect(grid.locator("td[tabindex]")).toHaveCount(0);
  await cell(page, "start", "2026-09").click({ force: true });
  await settle(page);
  await expect(value).toHaveText("2026-05");
  await page.getByTestId("lock-start").click();
  await expectTabStop(page, "start", "2026-08");
});

test("CA43: the first and last year pages, 0012–0023 and 9984–9995, and the months of 0001 and 9999 hold keys and Previous/Next at their edges", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const heading = page.getByTestId("v-heading");

  await page.getByTestId("v-first-month").click();
  await page.getByTestId("v-years").click();
  await expect(heading).toHaveText(yearsHeading("12", "23"));
  await expect(page.getByTestId("v-previous")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("v-grid").locator('td[role="gridcell"]')).toHaveCount(12);
  await expectTabStop(page, "v", "0012");
  await cell(page, "v", "0012").focus();
  await pressHeld(page, "ArrowLeft", "0012", "v");
  await pressHeld(page, "PageUp", "0012", "v");
  await expect(page.getByTestId("v-month")).toHaveText("0001-01");

  await page.getByTestId("v-months").click();
  await expect(heading).toHaveText("1");
  await expect(page.getByTestId("v-previous")).toHaveAttribute("aria-disabled", "true");
  await cell(page, "v", "0001-01").focus();
  await pressHeld(page, "ArrowLeft", "0001-01", "v");
  await pressHeld(page, "PageUp", "0001-01", "v");
  await page.keyboard.press("Enter");
  await expect(heading).toHaveText("February 1");
  await expect(cell(page, "v", "0001-02-01")).toBeFocused();

  await page.getByTestId("v-last-month").click();
  await page.getByTestId("v-years").click();
  await expect(heading).toHaveText(yearsHeading("9984", "9995"));
  await expect(page.getByTestId("v-next")).toHaveAttribute("aria-disabled", "true");
  await expectTabStop(page, "v", "9984");
  await cell(page, "v", "9995").focus();
  await pressHeld(page, "ArrowRight", "9995", "v");
  await pressHeld(page, "PageDown", "9995", "v");

  await page.getByTestId("v-last-month").click();
  await page.getByTestId("v-months").click();
  await expect(heading).toHaveText("9999");
  await expect(page.getByTestId("v-next")).toHaveAttribute("aria-disabled", "true");
  await cell(page, "v", "9999-12").focus();
  await pressHeld(page, "ArrowRight", "9999-12", "v");
  await pressHeld(page, "PageDown", "9999-12", "v");
});

test("CA44: the years view and a month Calendar in server HTML and after hydration: the years, the selection's and today's markers, aria-selected only in the value's view, tab stops; choices once hydrated", async ({
  page,
}, info) => {
  async function expectViews(): Promise<void> {
    const years = page.getByTestId("vy-grid");
    const months = page.getByTestId("ms-grid");

    await expect(page.getByTestId("vy-heading")).toHaveText(yearsHeading("2016", "2027"));
    await expect(years.locator('td[role="gridcell"]')).toHaveCount(12);
    await expect(years.locator("th")).toHaveCount(0);
    await expect(cell(page, "vy", "2026")).toHaveAttribute("aria-label", "2026");
    await expect(cell(page, "vy", "2026")).toHaveAttribute("data-selected", "");
    await expect(cell(page, "vy", "2026")).toHaveAttribute("data-current", "");
    await expect(cell(page, "vy", "2026")).toHaveAttribute("data-today", "");
    await expect(cell(page, "vy", "2026")).toHaveAttribute("aria-current", "date");
    await expect(years.locator("[aria-selected]")).toHaveCount(0);
    await expectTabStop(page, "vy", "2026");
    await expect(years).toHaveAttribute(
      "aria-labelledby",
      (await page.getByTestId("vy-heading").getAttribute("id"))!,
    );

    await expect(page.getByTestId("ms-heading")).toHaveText("2026");
    await expect(months.locator('td[role="gridcell"]')).toHaveCount(12);
    await expect(cell(page, "ms", "2026-05")).toHaveAttribute("aria-selected", "true");
    await expect(cell(page, "ms", "2026-05")).toHaveAttribute("data-selected", "");
    await expect(cell(page, "ms", "2026-05")).toHaveAttribute("aria-label", "May 2026");
    await expect(cell(page, "ms", "2026-05")).toHaveText("May");
    await expect(cell(page, "ms", "2026-10")).toHaveAttribute("aria-current", "date");
    await expect(months.locator("[aria-selected]")).toHaveCount(1);
    await expectTabStop(page, "ms", "2026-05");
  }

  await fixture(page, "calendar", info, expectViews);
  await expectViews();
  await expect(page.getByTestId("vy-state")).toHaveText("years 2026-10");

  // The hydrated roots drill down and choose once per click.
  await cell(page, "vy", "2020").click();
  await expect(page.getByTestId("vy-heading")).toHaveText("2020");
  await expect(cell(page, "vy", "2020-10")).toBeFocused();
  await cell(page, "ms", "2026-07").click();
  await expect(page.getByTestId("ms-value")).toHaveText("2026-07");
  await expect(page.getByTestId("ms-grid").locator("[aria-selected]")).toHaveCount(1);
});

test("CA45: writing view yourself away and back puts the tab stop on the displayed period, not the cell that last had focus there", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const months = page.getByTestId("v-months");

  // A day root's months view: November last had focus, October is displayed.
  await months.click();
  await cell(page, "v", "2026-10").focus();
  await press(page, "ArrowRight", "2026-11", "v");
  await page.getByTestId("v-years").click();
  await expectTabStop(page, "v", "2026");
  await months.click();
  await expect(page.getByTestId("v-heading")).toHaveText("2026");
  await expect(months).toBeFocused();
  await expectTabStop(page, "v", "2026-10");
  await expect(page.getByTestId("v-month")).toHaveText("null");

  // Its days view: 20 October last had focus, today is the tab stop.
  await page.getByTestId("v-days").click();
  await cell(page, "v", "2026-10-20").focus();
  await months.click();
  await page.getByTestId("v-days").click();
  await expect(page.getByTestId("v-days")).toBeFocused();
  await expectTabStop(page, "v", "2026-10-27");

  // A month Calendar's months view by its Heading button.
  const toggle = page.getByTestId("mc-switch");

  await cell(page, "mc", "2026-10").focus();
  await press(page, "ArrowRight", "2026-11", "mc");
  await toggle.click();
  await expect(page.getByTestId("mc-view")).toHaveText("years");
  await expectTabStop(page, "mc", "2026");
  await toggle.click();
  await expect(page.getByTestId("mc-view")).toHaveText("months");
  await expect(toggle).toBeFocused();
  await expectTabStop(page, "mc", "2026-10");
});

test("CA46: a focus request waiting for its cell is dropped when view is written yourself, and still lands without one", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const grid = page.getByTestId("mp-grid");
  const hold = page.getByTestId("mp-hold");

  /** Fires a window event the fixture listens to, without moving focus. */
  async function dispatch(type: string): Promise<void> {
    await page.evaluate((name) => window.dispatchEvent(new Event(name)), type);
  }

  // Asked for 2026 in the years view with no cells; the months, then the years render.
  await hold.focus();
  await dispatch("calendar-month-pending-focus");
  await dispatch("calendar-month-pending-months");
  await dispatch("calendar-month-pending-show");
  await expect(grid.locator('td[data-date="2026-10"]')).toHaveCount(1);
  await settle(page);
  await dispatch("calendar-month-pending-years");
  await expect(grid.locator('td[data-date="2026"]')).toHaveCount(1);
  await settle(page);
  await expect(hold).toBeFocused();

  // No view written in between: it lands on 2026.
  await dispatch("calendar-month-pending-hide");
  await expect(grid).toHaveCount(0);
  await dispatch("calendar-month-pending-focus");
  await dispatch("calendar-month-pending-show");
  await expect(grid.locator('td[data-date="2026"]')).toBeFocused();
});

test("CA47: a range's hovered day is forgotten when the view changes, so back in the days only the anchor previews", async ({
  page,
}, info) => {
  await fixture(page, "calendar", info);

  const value = page.getByTestId("vr-value");
  const anchor = page.getByTestId("vr-anchor");
  const months = page.getByTestId("vr-months");
  const days = page.getByTestId("vr-days");

  await cell(page, "vr", "2026-09-10").click();
  await expect(anchor).toHaveText("2026-09-10");
  await months.focus();
  await cell(page, "vr", "2026-09-20").hover();
  await expect(cell(page, "vr", "2026-09-20")).toHaveAttribute("data-preview", "");
  await expect.poll(() => daysWith(page, "vr", "data-preview")).toHaveLength(11);

  // The days go with the pointer still on 20 September, which then leaves the grid.
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("vr-view")).toHaveText("months");
  await expect(page.getByTestId("vr-heading")).toHaveText("2026");
  await page.mouse.move(0, 0);
  await days.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("vr-view")).toHaveText("days");
  await expect(cell(page, "vr", "2026-09-10")).toHaveCount(1);
  await settle(page);
  await expect(days).toBeFocused();
  await expect(anchor).toHaveText("2026-09-10");
  await expect(value).toHaveText("2026-09-28 2026-10-03");
  await expect.poll(() => daysWith(page, "vr", "data-preview")).toEqual(["2026-09-10"]);
});
