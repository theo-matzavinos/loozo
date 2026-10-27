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
