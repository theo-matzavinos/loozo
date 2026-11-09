import { expect, test } from "./reader-test.js";
import type { Locator, Page } from "@playwright/test";
import type { Run } from "./reader-test.js";

// Records what each reader says while the keyboard drives the date and time fields on
// /date-field-speech, a page with nothing live: entering a required date field in a Field,
// typing a date digit by digit, the month's name, the arrow, Home/End, Delete and Backspace keys,
// the required and invalid-date errors, a 12-hour time field's hour, minute and AM/PM, and what an
// empty segment announces under each option the probes compare. Same rules as menu.spec.ts:
// speech is never asserted, every key and focus is its own captured step, a step's action waits
// only for the first DOM change proving it happened, and state is checked outside the captures.
// In d1–d5 the keys are Playwright's, sent to the page, which bypasses the reader. d6 and d7 send
// them through the reader instead, as a person's keys reach it: NVDA switches to focus mode by
// itself when focus lands on a segment, and each of their steps waits for the key's DOM change, so
// a key NVDA kept in browse mode (a digit there jumps to a heading) fails its step. d8 is a probe:
// it sends Home and End through the reader to Origami's segments and to static ones with no key
// handling, waits for no outcome, and keeps the page's event trace of each key.

type Unit = "month" | "day" | "year" | "hour" | "minute" | "dayPeriod";

/** The `unit` segment in the Input group with test ID `group`. */
function segment(page: Page, group: string, unit: Unit): Locator {
  return page.getByTestId(group).locator(`[data-segment="${unit}"]`);
}

/** Presses `key` in one captured step and waits for focus to land on `target`. */
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
  });
}

/**
 * Presses `key` in one captured step and waits for `unit` in `group` to hold `value` as its
 * aria-valuenow, or none while `value` is null.
 */
async function change(
  run: Run,
  page: Page,
  key: string,
  group: string,
  unit: Unit,
  value: string | null,
): Promise<void> {
  const target = segment(page, group, unit);

  await run.step(`${key} → ${unit} ${value ?? "empty"}`, async () => {
    await page.keyboard.press(key);

    if (value === null) {
      await expect(target).not.toHaveAttribute("aria-valuenow");
      return;
    }

    await expect(target).toHaveAttribute("aria-valuenow", value);
  });
}

/** Presses `key` in one captured step and waits for `target` to show `text`. */
async function show(
  run: Run,
  page: Page,
  key: string,
  target: Locator,
  text: string,
): Promise<void> {
  await run.step(`${key} → shows ${text}`, async () => {
    await page.keyboard.press(key);
    await expect(target).toHaveText(text);
  });
}

/** Sends `key` through the reader in one captured step and waits for focus to land on `target`. */
async function readerPress(run: Run, key: string, target: Locator, name: string): Promise<void> {
  await run.readerPress(`${key} → ${name}`, key, () => expect(target).toBeFocused());
}

/**
 * Sends `key` through the reader in one captured step and waits for `unit` in `group` to hold
 * `value` as its aria-valuenow, or none while `value` is null.
 */
async function readerChange(
  run: Run,
  page: Page,
  key: string,
  group: string,
  unit: Unit,
  value: string | null,
): Promise<void> {
  const target = segment(page, group, unit);

  await run.readerPress(`${key} → ${unit} ${value ?? "empty"}`, key, async () => {
    if (value === null) {
      await expect(target).not.toHaveAttribute("aria-valuenow");
      return;
    }

    await expect(target).toHaveAttribute("aria-valuenow", value);
  });
}

/** Sends `key` through the reader in one captured step and waits for `target` to show `text`. */
async function readerShow(run: Run, key: string, target: Locator, text: string): Promise<void> {
  await run.readerPress(`${key} → shows ${text}`, key, () => expect(target).toHaveText(text));
}

/**
 * Focuses `unit` in `group` from code, then sends `key` through the reader and waits for nothing:
 * where the key lands and what it changes is what the step's event trace records.
 */
async function probeKey(
  run: Run,
  page: Page,
  key: string,
  group: string,
  unit: Unit,
): Promise<void> {
  await run.step(`focus ${group} ${unit}`, () => segment(page, group, unit).focus());
  await run.readerPress(`${key} on ${group} ${unit}`, key, async () => {});
}

test("d1-type", async ({ page, run }) => {
  await run.open("/date-field-speech");
  const month = segment(page, "birth-group", "month");
  const day = segment(page, "birth-group", "day");
  const year = segment(page, "birth-group", "year");

  await run.step("focus Before", () => page.getByTestId("birth-before").focus());
  await press(run, page, "Tab", month, "month (empty)");
  await change(run, page, "1", "birth-group", "month", "1");
  await press(run, page, "0", day, "day (month October)");
  await change(run, page, "2", "birth-group", "day", "2");
  await press(run, page, "7", year, "year (day 27)");
  // A year of fewer than four digits holds no value, so it has no aria-valuenow yet.
  await show(run, page, "1", year, "1");
  await show(run, page, "9", year, "19");
  await show(run, page, "9", year, "199");
  await change(run, page, "0", "birth-group", "year", "1990");
  await run.check("10/27/1990 typed", async () => {
    await expect(month).toHaveAttribute("aria-valuenow", "10");
    await expect(day).toHaveAttribute("aria-valuenow", "27");
    await expect(year).toBeFocused();
  });
  await press(run, page, "Shift+Tab", day, "day 27");
  await press(run, page, "Shift+Tab", month, "month October");
  await press(run, page, "Tab", day, "day 27");
  await press(run, page, "Tab", year, "year 1990");
  await press(run, page, "Tab", page.getByTestId("birth-after"), "After");
  await run.check("no error shown", () => expect(month).not.toHaveAttribute("aria-invalid"));
});

test("d2-keys", async ({ page, run }) => {
  await run.open("/date-field-speech");
  const month = segment(page, "birth-group", "month");

  await run.step("focus Before", () => page.getByTestId("birth-before").focus());
  await press(run, page, "Tab", month, "month (empty)");
  await change(run, page, "ArrowUp", "birth-group", "month", "1");
  await change(run, page, "ArrowUp", "birth-group", "month", "2");
  await change(run, page, "End", "birth-group", "month", "12");
  await press(run, page, "ArrowRight", segment(page, "birth-group", "day"), "day (empty)");
  await change(run, page, "ArrowDown", "birth-group", "day", "31");
  await change(run, page, "Delete", "birth-group", "day", null);
  await press(run, page, "Backspace", month, "month December");
});

test("d3-errors", async ({ page, run }) => {
  await run.open("/date-field-speech");
  const month = segment(page, "birth-group", "month");
  const day = segment(page, "birth-group", "day");
  const year = segment(page, "birth-group", "year");
  const after = page.getByTestId("birth-after");

  await run.step("focus Before", () => page.getByTestId("birth-before").focus());
  await press(run, page, "Tab", month, "month (empty)");
  await press(run, page, "Tab", day, "day (empty)");
  await press(run, page, "Tab", year, "year (empty)");
  await press(run, page, "Tab", after, "After");
  await run.check("the required error shown", async () => {
    await expect(page.getByText("Enter your date of birth")).toBeVisible();
    await expect(year).toHaveAttribute("aria-invalid", "true");
  });
  await press(run, page, "Shift+Tab", year, "year (empty, invalid)");
  await press(run, page, "Shift+Tab", day, "day (empty, invalid)");
  await press(run, page, "Shift+Tab", month, "month (empty, invalid)");
  await press(run, page, "2", day, "day (month February)");
  await change(run, page, "3", "birth-group", "day", "3");
  await press(run, page, "1", year, "year (day 31)");
  await run.step("ArrowUp → year (this year: 02/31 doesn't exist)", async () => {
    await page.keyboard.press("ArrowUp");
    await expect(year).toHaveAttribute("aria-valuenow", /^\d{4}$/);
  });
  await press(run, page, "Tab", after, "After");
  await run.check("the invalid-date error shown", async () => {
    await expect(page.getByText("Enter a date that exists")).toBeVisible();
    await expect(month).toHaveAttribute("aria-invalid", "true");
  });
});

test("d4-time", async ({ page, run }) => {
  await run.open("/date-field-speech");
  const hour = segment(page, "opens-group", "hour");
  const minute = segment(page, "opens-group", "minute");
  const dayPeriod = segment(page, "opens-group", "dayPeriod");

  await run.step("focus Before", () => page.getByTestId("opens-before").focus());
  await press(run, page, "Tab", hour, "hour 9");
  await press(run, page, "Tab", minute, "minute 30");
  await press(run, page, "Tab", dayPeriod, "AM");
  await change(run, page, "p", "opens-group", "dayPeriod", "1");
  await change(run, page, "ArrowUp", "opens-group", "dayPeriod", "0");
  await press(run, page, "Shift+Tab", minute, "minute 30");
  await press(run, page, "Shift+Tab", hour, "hour 9");
  await change(run, page, "1", "opens-group", "hour", "1");
  await press(run, page, "1", minute, "minute (hour 11)");
  await press(run, page, "Tab", dayPeriod, "AM");
  await press(run, page, "Tab", page.getByTestId("opens-after"), "After");
  await run.check("11:30 AM", async () => {
    await expect(hour).toHaveAttribute("aria-valuenow", "11");
    await expect(dayPeriod).toHaveAttribute("aria-valuenow", "0");
  });
});

test("d5-empty", async ({ page, run }) => {
  await run.open("/date-field-speech");

  // Focus from code, one segment per step: the static probes have no key handling.
  for (const [group, unit, name] of [
    ["probe1-group", "month", "probe one month (default placeholder)"],
    ["probe1-group", "day", "probe one day (default placeholder)"],
    ["probe2-group", "month", "probe two month (placeholder mm)"],
    ["probe3-group", "month", "probe three month (valuetext Empty)"],
    ["probe3-group", "day", "probe three day (valuetext Empty)"],
    ["probe4-group", "month", "probe four month (valuetext mm)"],
    ["probe5-group", "hour", "probe five hour (empty time)"],
    ["probe5-group", "dayPeriod", "probe five AM/PM (empty time)"],
  ] as const) {
    await run.step(`focus ${name}`, () => segment(page, group, unit).focus());
  }
});

test("d6-reader-type", async ({ page, run }) => {
  await run.open("/date-field-speech");
  const month = segment(page, "birth-group", "month");
  const day = segment(page, "birth-group", "day");
  const year = segment(page, "birth-group", "year");

  await run.step("focus Before", () => page.getByTestId("birth-before").focus());
  await readerPress(run, "Tab", month, "month (empty)");
  await readerChange(run, page, "1", "birth-group", "month", "1");
  await readerPress(run, "0", day, "day (month October)");
  await readerChange(run, page, "2", "birth-group", "day", "2");
  await readerPress(run, "7", year, "year (day 27)");
  // A year of fewer than four digits holds no value, so it has no aria-valuenow yet.
  await readerShow(run, "1", year, "1");
  await readerShow(run, "9", year, "19");
  await readerShow(run, "9", year, "199");
  await readerChange(run, page, "0", "birth-group", "year", "1990");
  await run.check("10/27/1990 typed", async () => {
    await expect(month).toHaveAttribute("aria-valuenow", "10");
    await expect(day).toHaveAttribute("aria-valuenow", "27");
    await expect(year).toBeFocused();
  });
});

test("d7-reader-keys", async ({ page, run }) => {
  await run.open("/date-field-speech");
  const month = segment(page, "birth-group", "month");

  await run.step("focus Before", () => page.getByTestId("birth-before").focus());
  await readerPress(run, "Tab", month, "month (empty)");
  await readerChange(run, page, "ArrowUp", "birth-group", "month", "1");
  await readerChange(run, page, "ArrowUp", "birth-group", "month", "2");
  await readerPress(run, "ArrowRight", segment(page, "birth-group", "day"), "day (empty)");
  // February without a year ends on the 29th.
  await readerChange(run, page, "ArrowDown", "birth-group", "day", "29");
  await readerChange(run, page, "Delete", "birth-group", "day", null);

  await run.step("focus Before the time", () => page.getByTestId("opens-before").focus());
  await readerPress(run, "Tab", segment(page, "opens-group", "hour"), "hour 9");
  await readerPress(run, "Tab", segment(page, "opens-group", "minute"), "minute 30");
  await readerPress(run, "Tab", segment(page, "opens-group", "dayPeriod"), "AM");
  await readerChange(run, page, "p", "opens-group", "dayPeriod", "1");
  await readerChange(run, page, "ArrowUp", "opens-group", "dayPeriod", "0");

  // Last: under VoiceOver, End on the month moved focus to the year and set it to 9999 instead
  // (run 42472169162), which fails this step, so it mustn't cut off the steps before it.
  await run.step("focus month February", () => month.focus());
  await readerChange(run, page, "End", "birth-group", "month", "12");
});

test("d8-reader-edges", async ({ page, run }) => {
  await run.open("/date-field-speech");

  // Origami's segments: V10 again, then Home and End from each position.
  await probeKey(run, page, "End", "birth-group", "month");
  await probeKey(run, page, "End", "birth-group", "day");
  await probeKey(run, page, "Home", "birth-group", "year");
  await probeKey(run, page, "Home", "birth-group", "day");
  await probeKey(run, page, "End", "opens-group", "hour");
  // Static segments with no key handling: editable (probe three), then not (probe six).
  await probeKey(run, page, "End", "probe3-group", "month");
  await probeKey(run, page, "Home", "probe3-group", "year");
  await probeKey(run, page, "End", "probe6-group", "month");
  await probeKey(run, page, "Home", "probe6-group", "year");
});
