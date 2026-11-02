import { test, expect } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import { fixture } from "./observation.js";

// Date-time picker (section 27, DP28–DP37), against the `date-time-picker` fixture. Every
// Calendar shows 27 October 2026 as today.

/** A script action: a click from script on a fixture button, not a pointer gesture. */
async function scriptControl(page: Page, id: string): Promise<void> {
  await page.getByTestId(id).evaluate((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      throw new Error("Expected a script-action button");
    }

    node.click();
  });
}

/** The cell of `date` in picker `name`'s Calendar. */
function cell(page: Page, name: string, date: string): Locator {
  return page.getByTestId(`${name}-content`).locator(`td[data-date="${date}"]`);
}

/** Picker `name`'s segment of `unit`. */
function segment(page: Page, name: string, unit: string): Locator {
  return page.getByTestId(`${name}-input`).locator(`[data-segment="${unit}"]`);
}

/**
 * Picker `name`'s segment and literal texts, joined, with whitespace runs as one space: Node's
 * and the browsers' ICU differ in the space before AM (U+202F or U+0020).
 */
async function segmentTexts(page: Page, name: string): Promise<string> {
  const texts = await page
    .getByTestId(`${name}-input`)
    .locator("[data-segment], [data-literal]")
    .evaluateAll((elements) => elements.map((element) => element.textContent ?? ""));

  return texts.join("").replace(/\s+/g, " ");
}

/** Whether picker `name`'s Content is natively shown. */
async function shown(page: Page, name: string): Promise<boolean> {
  return page
    .getByTestId(`${name}-content`)
    .evaluate((content) => content.matches(":popover-open"));
}

/** The day picker `name`'s Calendar selects, or null. */
async function selectedDay(page: Page, name: string): Promise<string | null> {
  return page
    .getByTestId(`${name}-content`)
    .evaluate(
      (content) =>
        content.querySelector('td[aria-selected="true"]')?.getAttribute("data-date") ?? null,
    );
}

/** Presses `key` until `target` has focus, at most `limit` times. */
async function pressUntilFocused(
  page: Page,
  key: string,
  target: Locator,
  limit: number,
): Promise<void> {
  for (let press = 0; press < limit; press += 1) {
    const focused = await target.evaluate((element) => element === document.activeElement);

    if (focused) {
      return;
    }

    await page.keyboard.press(key);
  }

  await expect(target).toBeFocused();
}

/** Opens picker `name` by its Trigger and waits for the grid's focus on `date`. */
async function openOn(page: Page, name: string, date: string): Promise<void> {
  await page.getByTestId(`${name}-trigger`).click();
  await expect(page.getByTestId(`${name}-open`)).toHaveText("true");
  await expect(cell(page, name, date)).toBeFocused();
}

/** Waits for picker `name` to be closed: its `open` false and Content no longer shown. */
async function expectClosed(page: Page, name: string): Promise<void> {
  await expect(page.getByTestId(`${name}-open`)).toHaveText("false");
  await expect.poll(() => shown(page, name)).toBe(false);
}

/** The closed pickers' naming and popup attributes, as the server rendered them or as they are now. */
async function describeClosed(page: Page): Promise<Record<string, Record<string, string | null>>> {
  const read: Record<string, Record<string, string | null>> = {};

  for (const name of ["t", "s"]) {
    const parts = {
      trigger: page.getByTestId(`${name}-trigger`),
      input: page.getByTestId(`${name}-input`),
      content: page.getByTestId(`${name}-content`),
      hour: segment(page, name, "hour"),
    };
    const attributes = {
      trigger: [
        "id",
        "type",
        "aria-haspopup",
        "aria-expanded",
        "aria-controls",
        "aria-label",
        "aria-labelledby",
        "aria-invalid",
        "aria-required",
      ],
      input: ["role", "aria-labelledby"],
      content: ["id", "role", "tabindex", "popover", "aria-labelledby", "aria-label", "inert"],
      hour: ["role", "aria-valuenow"],
    };
    const attributesRead: Record<string, string | null> = {};

    for (const [part, names] of Object.entries(attributes)) {
      for (const attribute of names) {
        attributesRead[`${part} ${attribute}`] =
          await parts[part as keyof typeof parts].getAttribute(attribute);
      }
    }

    attributesRead["grid aria-labelledby"] = await page
      .getByTestId(`${name}-grid`)
      .getAttribute("aria-labelledby");
    attributesRead["layout"] = await page.getByTestId(`${name}-root`).getAttribute("data-layout");
    attributesRead["segments"] = await segmentTexts(page, name);
    attributesRead["day periods"] = String(await segment(page, name, "dayPeriod").count());
    attributesRead["seconds"] = String(await segment(page, name, "second").count());
    read[name] = attributesRead;
  }

  return read;
}

test("DP28 date-time picker, server HTML and hydration of a closed picker: segments and Trigger in the Input, which is the Field's control; the Trigger an action button named by its aria-label, which names Content; en-GB lays out 24 hours with no day period, second precision a second", async ({
  page,
}, info) => {
  let server: Record<string, Record<string, string | null>> = {};

  await fixture(page, "date-time-picker", info, async () => {
    server = await describeClosed(page);
  });

  const attached = await describeClosed(page);

  expect(attached).toEqual(server);

  for (const name of ["t", "s"]) {
    const read = attached[name]!;

    expect(read["trigger id"]).toMatch(/\S/);
    expect(read).toMatchObject({
      "trigger type": "button",
      "trigger aria-haspopup": "dialog",
      "trigger aria-expanded": "false",
      "trigger aria-controls": read["content id"],
      "trigger aria-label": "Choose date",
      "trigger aria-labelledby": null,
      "trigger aria-invalid": null,
      "trigger aria-required": null,
      "input role": "group",
      "input aria-labelledby": `${name}-label`,
      "content role": "dialog",
      "content tabindex": "-1",
      "content popover": "manual",
      "content aria-labelledby": null,
      "content aria-label": "Choose date",
      "content inert": "",
      "hour role": "spinbutton",
    });
    // The bridged Grid never joins the Field.
    expect(read["grid aria-labelledby"]?.split(" ")).not.toContain(`${name}-label`);
    // The composed date-time field's layout seed on the root.
    expect(JSON.parse(read["layout"] ?? "null")).toEqual(expect.anything());
    expect(await shown(page, name)).toBe(false);
  }

  expect(attached["t"]).toMatchObject({
    segments: "––/––/––––, ––:–– ––",
    "day periods": "1",
    seconds: "0",
    "hour aria-valuenow": null,
  });
  expect(attached["s"]).toMatchObject({
    segments: "27/10/2026, 21:30:15",
    "day periods": "0",
    seconds: "1",
    "hour aria-valuenow": "21",
  });

  await expect(page.getByTestId("t-input")).toHaveAccessibleName("Starts at");
  await expect(segment(page, "t", "hour")).toHaveAccessibleName(/^Starts at /);
  await expect(page.getByTestId("t-trigger")).toHaveAccessibleName("Choose date");
  await expect(page.getByTestId("s-input")).toHaveAccessibleName("Ends at");

  await openOn(page, "t", "2026-10-27");
  await expect(page.getByTestId("t-content")).toHaveAccessibleName("Choose date");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("t-trigger")).toBeFocused();
});

test("DP29 date-time picker, a complete time: a choice by pointer or keys writes the day and keeps the time, commits at the root's precision, closes and returns focus to the Trigger; the day already selected writes nothing", async ({
  page,
}, info) => {
  await fixture(page, "date-time-picker", info);

  // Row A: 27 October 2026, 09:30 committed; choose 28.
  await scriptControl(page, "t-set");
  await expect.poll(() => segmentTexts(page, "t")).toBe("10/27/2026, 09:30 AM");
  await openOn(page, "t", "2026-10-27");
  expect(await selectedDay(page, "t")).toBe("2026-10-27");
  await cell(page, "t", "2026-10-28").click();
  await expectClosed(page, "t");
  await expect(page.getByTestId("t-trigger")).toBeFocused();
  await expect.poll(() => segmentTexts(page, "t")).toBe("10/28/2026, 09:30 AM");
  await expect(page.getByTestId("t-value")).toHaveText("2026-10-28T09:30");
  await expect(page.getByTestId("t-state-value")).toHaveText("2026-10-28T09:30");
  await expect(page.getByTestId("t-parse")).toHaveText("");
  await expect(page.getByTestId("t-value-changes")).toHaveText("1");

  // Row E: by keys, ArrowRight and Enter.
  await page.keyboard.press("Enter");
  await expect(cell(page, "t", "2026-10-28")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expectClosed(page, "t");
  await expect(page.getByTestId("t-trigger")).toBeFocused();
  await expect(page.getByTestId("t-value")).toHaveText("2026-10-29T09:30");
  await expect.poll(() => segmentTexts(page, "t")).toBe("10/29/2026, 09:30 AM");
  await expect(page.getByTestId("t-value-changes")).toHaveText("2");

  // The day already selected: the same write, no change, no valueChange.
  await page.keyboard.press("Enter");
  await expect(cell(page, "t", "2026-10-29")).toBeFocused();
  await page.keyboard.press("Enter");
  await expectClosed(page, "t");
  await expect(page.getByTestId("t-trigger")).toBeFocused();
  await expect(page.getByTestId("t-value")).toHaveText("2026-10-29T09:30");
  await expect(page.getByTestId("t-value-changes")).toHaveText("2");

  // A value of the other precision: the choice commits the root's, minute.
  await scriptControl(page, "t-set-seconds");
  await expect(page.getByTestId("t-value")).toHaveText("2026-10-27T09:30:15");
  await expect.poll(() => segmentTexts(page, "t")).toBe("10/27/2026, 09:30 AM");
  await openOn(page, "t", "2026-10-27");
  await cell(page, "t", "2026-10-28").click();
  await expectClosed(page, "t");
  await expect(page.getByTestId("t-value")).toHaveText("2026-10-28T09:30");
  await expect(page.getByTestId("t-value-changes")).toHaveText("3");
  await expect(page.getByTestId("t-touches")).toHaveText("0");
  await expect(page.getByTestId("t-touched")).toHaveText("false");
});

test("DP30 date-time picker, rows B and B′: a choice over a typed hour keeps it, writes no value, reports dateTimeIncomplete and moves focus to the minute; reopening selects the chosen day; typing the rest commits; Tab out touches once", async ({
  page,
}, info) => {
  await fixture(page, "date-time-picker", info);

  await segment(page, "t", "hour").click();
  await page.keyboard.type("9");
  await expect(segment(page, "t", "minute")).toBeFocused();
  await expect.poll(() => segmentTexts(page, "t")).toBe("––/––/––––, 09:–– ––");

  await openOn(page, "t", "2026-10-27");
  expect(await selectedDay(page, "t")).toBeNull();
  await cell(page, "t", "2026-10-28").click();
  await expectClosed(page, "t");
  await expect(segment(page, "t", "minute")).toBeFocused();
  await expect.poll(() => segmentTexts(page, "t")).toBe("10/28/2026, 09:–– ––");
  await expect(page.getByTestId("t-value")).toHaveText("null");
  await expect(page.getByTestId("t-parse")).toHaveText("dateTimeIncomplete");
  await expect(page.getByTestId("t-errors")).toHaveText("dateTimeIncomplete");
  await expect(page.getByTestId("t-value-changes")).toHaveText("0");

  // Reopening selects the day the segments show, in its month.
  await openOn(page, "t", "2026-10-28");
  expect(await selectedDay(page, "t")).toBe("2026-10-28");
  await expect(page.getByTestId("t-heading")).toHaveText("October 2026");
  await page.keyboard.press("Escape");
  await expectClosed(page, "t");
  await expect(page.getByTestId("t-trigger")).toBeFocused();

  // Row B′: type the rest.
  await segment(page, "t", "minute").click();
  await page.keyboard.type("30");
  await expect(segment(page, "t", "dayPeriod")).toBeFocused();
  await page.keyboard.type("a");
  await expect(page.getByTestId("t-value")).toHaveText("2026-10-28T09:30");
  await expect.poll(() => segmentTexts(page, "t")).toBe("10/28/2026, 09:30 AM");
  await expect(page.getByTestId("t-parse")).toHaveText("");
  await expect(page.getByTestId("t-value-changes")).toHaveText("1");
  await expect(segment(page, "t", "dayPeriod")).toBeFocused();
  await expect(page.getByTestId("t-touches")).toHaveText("0");

  // No choice touched; Tab out of the picker touches once.
  await pressUntilFocused(page, "Tab", page.getByTestId("t-after"), 4);
  await expect(page.getByTestId("t-touches")).toHaveText("1");
  await expect(page.getByTestId("t-touched")).toHaveText("true");
});

test("DP31 date-time picker, rows C and C′: with the minute cleared, choosing the same day or another keeps the empty minute and the last value, reports dateTimeIncomplete and moves focus to the minute; reopening selects the chosen day", async ({
  page,
}, info) => {
  await fixture(page, "date-time-picker", info);

  await scriptControl(page, "t-set");
  await segment(page, "t", "minute").click();
  await page.keyboard.press("Delete");
  await expect.poll(() => segmentTexts(page, "t")).toBe("10/27/2026, 09:–– AM");
  await expect(page.getByTestId("t-parse")).toHaveText("dateTimeIncomplete");

  // Row C: the same day.
  await openOn(page, "t", "2026-10-27");
  expect(await selectedDay(page, "t")).toBe("2026-10-27");
  await cell(page, "t", "2026-10-27").click();
  await expectClosed(page, "t");
  await expect(segment(page, "t", "minute")).toBeFocused();
  await expect.poll(() => segmentTexts(page, "t")).toBe("10/27/2026, 09:–– AM");
  await expect(page.getByTestId("t-value")).toHaveText("2026-10-27T09:30");
  await expect(page.getByTestId("t-parse")).toHaveText("dateTimeIncomplete");

  // Row C′: another day.
  await openOn(page, "t", "2026-10-27");
  await cell(page, "t", "2026-10-29").click();
  await expectClosed(page, "t");
  await expect(segment(page, "t", "minute")).toBeFocused();
  await expect.poll(() => segmentTexts(page, "t")).toBe("10/29/2026, 09:–– AM");
  await expect(page.getByTestId("t-value")).toHaveText("2026-10-27T09:30");
  await expect(page.getByTestId("t-parse")).toHaveText("dateTimeIncomplete");
  await expect(page.getByTestId("t-value-changes")).toHaveText("0");

  await openOn(page, "t", "2026-10-29");
  expect(await selectedDay(page, "t")).toBe("2026-10-29");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("t-trigger")).toBeFocused();
  await expect(page.getByTestId("t-touches")).toHaveText("0");
});

test("DP32 date-time picker, row D: with nothing typed, a day in the next month fills only the date, writes no value and moves focus to the hour; reopening shows that month with the day selected; Tab out touches once; a date typed with no time is selected too", async ({
  page,
}, info) => {
  await fixture(page, "date-time-picker", info);

  await openOn(page, "t", "2026-10-27");
  expect(await selectedDay(page, "t")).toBeNull();
  await page.getByTestId("t-next").click();
  await expect(page.getByTestId("t-heading")).toHaveText("November 2026");
  await cell(page, "t", "2026-11-15").click();
  await expectClosed(page, "t");
  await expect(segment(page, "t", "hour")).toBeFocused();
  await expect.poll(() => segmentTexts(page, "t")).toBe("11/15/2026, ––:–– ––");
  await expect(page.getByTestId("t-value")).toHaveText("null");
  await expect(page.getByTestId("t-parse")).toHaveText("dateTimeIncomplete");
  await expect(page.getByTestId("t-value-changes")).toHaveText("0");

  await openOn(page, "t", "2026-11-15");
  expect(await selectedDay(page, "t")).toBe("2026-11-15");
  await expect(page.getByTestId("t-heading")).toHaveText("November 2026");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("t-trigger")).toBeFocused();
  await expect(page.getByTestId("t-touches")).toHaveText("0");
  // A Tab sent before the close renders Content inert would still enter it (synthetic speed).
  await expectClosed(page, "t");

  await page.keyboard.press("Tab");
  await expect(page.getByTestId("t-after")).toBeFocused();
  await expect(page.getByTestId("t-touches")).toHaveText("1");
  await expect(page.getByTestId("t-touched")).toHaveText("true");

  // A date typed into the segments, with no choice and no commit, is the Calendar's too.
  await segment(page, "t", "month").click();
  await page.keyboard.type("12");
  await expect(segment(page, "t", "day")).toBeFocused();
  await page.keyboard.type("24");
  await expect.poll(() => segmentTexts(page, "t")).toBe("12/24/2026, ––:–– ––");
  await expect(page.getByTestId("t-value")).toHaveText("null");
  await openOn(page, "t", "2026-12-24");
  expect(await selectedDay(page, "t")).toBe("2026-12-24");
  await expect(page.getByTestId("t-heading")).toHaveText("December 2026");
  await expect(page.getByTestId("t-touches")).toHaveText("1");
});

test("DP33 date-time picker: a choice of the day shown replaces an impossible or half-typed date, clears dateInvalid and dateTimeIncomplete, and with the time complete writes nothing new", async ({
  page,
}, info) => {
  await fixture(page, "date-time-picker", info);

  await scriptControl(page, "t-set-31");
  await expect.poll(() => segmentTexts(page, "t")).toBe("10/31/2026, 09:30 AM");

  // November has no 31st: the draft names no day, so the Calendar selects the committed one.
  await segment(page, "t", "month").click();
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => segmentTexts(page, "t")).toBe("11/31/2026, 09:30 AM");
  await expect(page.getByTestId("t-parse")).toHaveText("dateInvalid");
  await expect(page.getByTestId("t-errors")).toHaveText("dateInvalid");
  await expect(page.getByTestId("t-value")).toHaveText("2026-10-31T09:30");

  await openOn(page, "t", "2026-10-31");
  expect(await selectedDay(page, "t")).toBe("2026-10-31");
  await expect(page.getByTestId("t-heading")).toHaveText("October 2026");
  await cell(page, "t", "2026-10-31").click();
  await expectClosed(page, "t");
  await expect(page.getByTestId("t-trigger")).toBeFocused();
  await expect.poll(() => segmentTexts(page, "t")).toBe("10/31/2026, 09:30 AM");
  await expect(page.getByTestId("t-parse")).toHaveText("");
  await expect(page.getByTestId("t-errors")).toHaveText("");
  await expect(page.getByTestId("t-value")).toHaveText("2026-10-31T09:30");

  // A half-typed date, chosen again by keys.
  await segment(page, "t", "day").click();
  await page.keyboard.press("Delete");
  await expect.poll(() => segmentTexts(page, "t")).toBe("10/––/2026, 09:30 AM");
  await expect(page.getByTestId("t-parse")).toHaveText("dateTimeIncomplete");
  await pressUntilFocused(page, "Tab", page.getByTestId("t-trigger"), 6);
  await page.keyboard.press("Enter");
  await expect(cell(page, "t", "2026-10-31")).toBeFocused();
  await page.keyboard.press("Enter");
  await expectClosed(page, "t");
  await expect(page.getByTestId("t-trigger")).toBeFocused();
  await expect.poll(() => segmentTexts(page, "t")).toBe("10/31/2026, 09:30 AM");
  await expect(page.getByTestId("t-parse")).toHaveText("");
  await expect(page.getByTestId("t-value-changes")).toHaveText("0");
  await expect(page.getByTestId("t-touches")).toHaveText("0");
});

test("DP34 date-time picker, en-GB at second precision: 24 hours with no day period; a choice with the second cleared moves focus to the second; typing it commits; a complete choice writes the seconds", async ({
  page,
}, info) => {
  await fixture(page, "date-time-picker", info);

  await expect.poll(() => segmentTexts(page, "s")).toBe("27/10/2026, 21:30:15");
  await expect(segment(page, "s", "dayPeriod")).toHaveCount(0);
  await segment(page, "s", "second").click();
  await page.keyboard.press("Delete");
  await expect.poll(() => segmentTexts(page, "s")).toBe("27/10/2026, 21:30:––");
  await expect(page.getByTestId("s-parse")).toHaveText("dateTimeIncomplete");

  await openOn(page, "s", "2026-10-27");
  await cell(page, "s", "2026-10-28").click();
  await expectClosed(page, "s");
  await expect(segment(page, "s", "second")).toBeFocused();
  await expect.poll(() => segmentTexts(page, "s")).toBe("28/10/2026, 21:30:––");
  await expect(page.getByTestId("s-value")).toHaveText("2026-10-27T21:30:15");
  await expect(page.getByTestId("s-value-changes")).toHaveText("0");

  // Each digit that completes the draft commits: 04, then 45.
  await page.keyboard.type("45");
  await expect(page.getByTestId("s-value")).toHaveText("2026-10-28T21:30:45");
  await expect(page.getByTestId("s-parse")).toHaveText("");
  await expect(page.getByTestId("s-value-changes")).toHaveText("2");

  await openOn(page, "s", "2026-10-28");
  await cell(page, "s", "2026-10-29").click();
  await expectClosed(page, "s");
  await expect(page.getByTestId("s-trigger")).toBeFocused();
  await expect(page.getByTestId("s-value")).toHaveText("2026-10-29T21:30:45");
  await expect.poll(() => segmentTexts(page, "s")).toBe("29/10/2026, 21:30:45");
  await expect(page.getByTestId("s-value-changes")).toHaveText("3");
  await expect(page.getByTestId("s-touches")).toHaveText("0");
});

test("DP35 date-time picker in a Dialog: Escape unwinds one layer per press, the Calendar's view, then the picker with focus on its Trigger, then the Dialog", async ({
  page,
}, info) => {
  await fixture(page, "date-time-picker", info);

  await page.getByTestId("dialog-trigger").click();
  await expect(page.getByTestId("dialog-content")).toHaveJSProperty("open", true);
  await page.getByTestId("g-trigger").click();
  await expect(cell(page, "g", "2026-10-15")).toBeFocused();
  await page.getByTestId("g-years").click();
  await expect(page.getByTestId("g-state")).toHaveText("true true years");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("g-state")).toHaveText("true true days");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("g-state")).toHaveText("true false days");
  await expect(page.getByTestId("g-trigger")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("g-state")).toHaveText("false false days");
  await expect(page.getByTestId("dialog-content")).toHaveJSProperty("open", false);
  await expect(page.getByTestId("g-value")).toHaveText("2026-10-15T08:00");
});

test("DP36 date-time picker and Signal Forms: focusBoundControl() focuses the first segment untouched; a value written while open shows in the segments and the Calendar; clear() commits null", async ({
  page,
}, info) => {
  await fixture(page, "date-time-picker", info);

  await scriptControl(page, "t-focus");
  await expect(segment(page, "t", "month")).toBeFocused();
  await expect(page.getByTestId("t-touched")).toHaveText("false");

  // Written while open, by script: the Calendar follows the day the segments show.
  await pressUntilFocused(page, "Tab", page.getByTestId("t-trigger"), 6);
  await page.keyboard.press("Enter");
  await expect(cell(page, "t", "2026-10-27")).toBeFocused();
  expect(await selectedDay(page, "t")).toBeNull();
  await scriptControl(page, "t-set-31");
  await expect.poll(() => selectedDay(page, "t")).toBe("2026-10-31");
  await expect.poll(() => segmentTexts(page, "t")).toBe("10/31/2026, 09:30 AM");
  await expect(page.getByTestId("t-open")).toHaveText("true");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("t-trigger")).toBeFocused();

  await scriptControl(page, "t-clear");
  await expect(page.getByTestId("t-value")).toHaveText("null");
  await expect.poll(() => segmentTexts(page, "t")).toBe("––/––/––––, ––:–– ––");
  await expect(page.getByTestId("t-parse")).toHaveText("");
  await expect(page.getByTestId("t-value-changes")).toHaveText("1");
  await expect(page.getByTestId("t-touches")).toHaveText("0");
});

for (const name of ["date-time-picker-factory", "date-time-picker-existing"]) {
  test(`DP37 O1 O3: ${name.replace("date-time-picker-", "")} replacements of the date-time root drive value, open, locale, precision, hour cycle, disabled and readonly over its contradicting own inputs, and the unused models emit nothing`, async ({
    page,
  }, info) => {
    await fixture(page, "date-time-picker", info);

    const co = (role: string) => page.locator(`[data-case="${name}"] [data-co="${role}"]`);
    const trigger = co("trigger");
    const content = co("content");
    const day = (date: string) => content.locator(`td[data-date="${date}"]`);
    const isShown = () => content.evaluate((node) => node.matches(":popover-open"));

    // en-US, 12-hour and minute precision over the own de-DE, 24-hour and second precision.
    await expect(co("value")).toHaveText("2026-10-15T09:30 2026-10-15T09:30");
    await expect(co("segments")).toHaveText("10/15/2026, 09:30 AM");
    await expect(co("input").locator('[data-segment="second"]')).toHaveCount(0);
    await expect(co("open")).toHaveText("false false");
    await expect(co("policy")).toHaveText("true false");
    await expect(co("lower-policy")).toHaveText("true false true");
    await expect(co("unused-outputs")).toHaveText("0");
    expect(await isShown()).toBe(false);
    await expect(trigger).toBeDisabled();

    await co("disable").click();
    await expect(co("policy")).toHaveText("false false");
    await expect(co("lower-policy")).toHaveText("false false false");
    await expect(trigger).toBeEnabled();

    await trigger.click();
    await expect(co("open")).toHaveText("true true");
    await expect.poll(isShown).toBe(true);
    await expect(day("2026-10-15")).toBeFocused();
    await expect(day("2026-10-15")).toHaveAttribute("aria-selected", "true");
    await day("2026-10-20").click();
    await expect(co("open")).toHaveText("false false");
    await expect.poll(isShown).toBe(false);
    await expect(co("value")).toHaveText("2026-10-20T09:30 2026-10-20T09:30");
    await expect(co("segments")).toHaveText("10/20/2026, 09:30 AM");
    await expect(trigger).toBeFocused();

    // The replaced readonly, over the root's own true until now: browses, never chooses.
    await co("readonly").click();
    await expect(co("policy")).toHaveText("false true");
    await expect(co("lower-policy")).toHaveText("false true false");
    await trigger.click();
    await expect(day("2026-10-20")).toBeFocused();
    await expect(co("grid")).toHaveAttribute("aria-readonly", "true");
    await day("2026-10-21").click();
    await expect(co("open")).toHaveText("true true");
    await expect(co("value")).toHaveText("2026-10-20T09:30 2026-10-20T09:30");
    await page.keyboard.press("Escape");
    await expect(co("open")).toHaveText("false false");
    await expect(trigger).toBeFocused();
    await co("readonly").click();

    // Disabling the replaced picker while open closes it through the replaced open.
    await trigger.click();
    await expect(co("open")).toHaveText("true true");
    await co("disable").evaluate((node) => (node as HTMLElement).click());
    await expect(co("open")).toHaveText("false false");
    await expect.poll(isShown).toBe(false);
    await expect(trigger).toBeDisabled();
    await expect(co("unused-outputs")).toHaveText("0");
  });
}
