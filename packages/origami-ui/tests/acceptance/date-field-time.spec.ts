import { test, expect } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import { fixture } from "./observation.js";

// Time field (section 25, DF from DF23), against the `time-field` fixture.

function root(page: Page, name: string): Locator {
  return page.getByTestId(`${name}-root`);
}

function segment(page: Page, name: string, unit: string): Locator {
  return root(page, name).locator(`[data-segment="${unit}"]`);
}

/** The root's segment and literal texts in DOM order. */
async function texts(page: Page, name: string): Promise<string[]> {
  return root(page, name)
    .locator("[data-segment], [data-literal]")
    .evaluateAll((elements) => elements.map((element) => element.textContent ?? ""));
}

async function order(page: Page, name: string): Promise<string[]> {
  return root(page, name)
    .locator("[data-segment]")
    .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-segment")!));
}

/** The code points of the root's literals, so U+202F and U+0020 stay apart. */
async function literals(page: Page, name: string): Promise<string[]> {
  return root(page, name)
    .locator("[data-literal]")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const points: string[] = [];

        for (const character of element.textContent ?? "") {
          points.push(`U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);
        }

        return points.join(" ");
      }),
    );
}

/** The focused element's segment unit, or its test ID, or its tag. */
async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;

    if (active === null) {
      return "none";
    }

    return (
      active.getAttribute("data-segment") ?? active.getAttribute("data-testid") ?? active.tagName
    );
  });
}

/** Focuses `target` from script, so focus moves straight to it without touching its field. */
async function moveFocus(target: Locator): Promise<void> {
  await target.evaluate((element: HTMLElement) => element.focus());
}

/** Clicks a button from script, so focus stays where it is. */
async function press(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).evaluate((button: HTMLElement) => button.click());
}

/** Every segment of the root holds exactly one text node and no element. */
async function expectClean(page: Page, name: string): Promise<void> {
  const shapes = await root(page, name)
    .locator("[data-segment]")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const kinds: string[] = [];

        for (const node of element.childNodes) {
          kinds.push(node.nodeName);
        }

        return kinds.join(",");
      }),
    );

  for (const shape of shapes) {
    expect(shape).toBe("#text");
  }
}

/** The 12-hour Field case's naming, layout, literals and segments, as rendered now. */
async function describeDirect(page: Page): Promise<Record<string, unknown>> {
  const group = page.getByTestId("direct-group");
  const layout = JSON.parse((await root(page, "direct").getAttribute("data-layout")) ?? "null");

  return {
    group: {
      role: await group.getAttribute("role"),
      labelledBy: await group.getAttribute("aria-labelledby"),
      describedBy: await group.getAttribute("aria-describedby"),
    },
    layout,
    literals: await literals(page, "direct"),
    segments: await root(page, "direct")
      .locator("[data-segment]")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const read: Record<string, unknown> = { text: element.textContent };

          for (const attribute of [
            "data-segment",
            "role",
            "id",
            "aria-label",
            "aria-labelledby",
            "aria-valuenow",
            "aria-valuemin",
            "aria-valuemax",
            "aria-valuetext",
            "aria-required",
            "inputmode",
            "contenteditable",
            "tabindex",
            "data-placeholder",
          ]) {
            read[attribute] = element.getAttribute(attribute);
          }

          return read;
        }),
      ),
  };
}

test("DF23 server HTML and hydration: a 12-hour time in a Field has hour, minute and a day period segment named AM/PM with its localized value", async ({
  page,
}, info) => {
  let server: Record<string, unknown> = {};

  await fixture(page, "time-field", info, async () => {
    server = await describeDirect(page);
  });

  const attached = await describeDirect(page);

  expect(attached).toEqual(server);
  expect(attached["group"]).toEqual({
    role: "group",
    labelledBy: "direct-label",
    describedBy: "direct-description",
  });

  const layout = attached["layout"] as {
    hourCycle: number;
    periods: string[];
    parts: { type: string }[];
  };

  expect(layout.hourCycle).toBe(12);
  expect(layout.periods).toEqual(["AM", "PM"]);
  expect(layout.parts.map((part) => part.type)).toEqual([
    "hour",
    "literal",
    "minute",
    "literal",
    "dayPeriod",
  ]);

  const segments = attached["segments"] as Record<string, unknown>[];
  const expected = [
    ["hour", "09", "hour", "9", "1", "12", null, "numeric"],
    ["minute", "30", "minute", "30", "0", "59", null, "numeric"],
    ["dayPeriod", "AM", "AM/PM", "0", "0", "1", "AM", "text"],
  ];

  for (const [
    index,
    [unit, text, label, now, min, max, valueText, inputMode],
  ] of expected.entries()) {
    const read = segments[index]!;
    const id = read["id"];

    expect(read).toEqual({
      "data-segment": unit,
      text,
      role: "spinbutton",
      id,
      "aria-label": label,
      "aria-labelledby": `direct-label ${String(id)}`,
      "aria-valuenow": now,
      "aria-valuemin": min,
      "aria-valuemax": max,
      "aria-valuetext": valueText,
      "aria-required": "true",
      inputmode: inputMode,
      contenteditable: "true",
      tabindex: "0",
      "data-placeholder": null,
    });
  }

  await expect(segment(page, "direct", "dayPeriod")).toHaveAccessibleName("Opens at AM/PM");
  await expect(segment(page, "direct", "hour")).toHaveAccessibleName("Opens at hour");
  await expect(page.getByTestId("direct-group")).toHaveAccessibleName("Opens at");
});

test("DF24 24-hour layout (en-GB): hour 0–23 with no day period; typing advances, restarts past 23 and commits HH:mm; Up/Down wrap midnight", async ({
  page,
}, info) => {
  await fixture(page, "time-field", info);

  const value = page.getByTestId("gb-value");
  const hour = segment(page, "gb", "hour");
  const minute = segment(page, "gb", "minute");

  await expect.poll(() => order(page, "gb")).toEqual(["hour", "minute"]);
  await expect.poll(() => texts(page, "gb")).toEqual(["––", ":", "––"]);
  expect(JSON.parse((await root(page, "gb").getAttribute("data-layout"))!).hourCycle).toBe(24);

  await moveFocus(hour);
  await page.keyboard.type("0");
  await expect(hour).toHaveText("00");
  await expect.poll(() => focused(page)).toBe("hour");
  await page.keyboard.type("9");
  await expect.poll(() => focused(page)).toBe("minute");
  await expect(page.getByTestId("gb-parse")).toHaveText("timeIncomplete");
  await page.keyboard.type("30");
  await expect(value).toHaveText("09:30");
  await expect(page.getByTestId("gb-parse")).toHaveText("");

  // 2 waits for 20–23; 3 makes 23 and moves on; 2 then 4 restarts as 04.
  await moveFocus(hour);
  await page.keyboard.type("2");
  await expect(hour).toHaveText("02");
  await expect.poll(() => focused(page)).toBe("hour");
  await page.keyboard.type("3");
  await expect(value).toHaveText("23:30");
  await expect.poll(() => focused(page)).toBe("minute");
  await moveFocus(hour);
  await page.keyboard.type("24");
  await expect(hour).toHaveText("04");
  await expect(value).toHaveText("04:30");

  // Midnight is 00; Up from 23 wraps to 00 and Down from 00 to 23, without carry, focus kept.
  await moveFocus(hour);
  await page.keyboard.press("End");
  await expect(hour).toHaveAttribute("aria-valuemax", "23");
  await expect(value).toHaveText("23:30");
  await page.keyboard.press("ArrowUp");
  await expect(hour).toHaveText("00");
  await expect(hour).toHaveAttribute("aria-valuenow", "0");
  await expect(hour).toHaveAttribute("aria-valuemin", "0");
  await expect(value).toHaveText("00:30");
  await page.keyboard.press("ArrowDown");
  await expect(value).toHaveText("23:30");
  await page.keyboard.press("Home");
  await expect(value).toHaveText("00:30");
  await moveFocus(minute);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(value).toHaveText("00:28");
  await expect.poll(() => focused(page)).toBe("minute");
  await expectClean(page, "gb");
});

test("DF25 12-hour layout (en-US): the hour shows 1–12; midnight is 12 AM and noon 12 PM both ways; AM/PM by letter, Up/Down and Home/End", async ({
  page,
}, info) => {
  await fixture(page, "time-field", info);

  const value = page.getByTestId("us-value");
  const parse = page.getByTestId("us-parse");
  const hour = segment(page, "us", "hour");
  const period = segment(page, "us", "dayPeriod");

  await expect.poll(() => order(page, "us")).toEqual(["hour", "minute", "dayPeriod"]);
  await expect(period).toHaveAttribute("aria-label", "AM/PM");
  await expect(period).toHaveAttribute("inputmode", "text");
  await expect(period).toHaveText("––");

  // 1 waits for 10–12, 2 makes 12; a leading 0 waits and 00 is ignored; 2 alone advances.
  await moveFocus(hour);
  await page.keyboard.type("1");
  await expect(hour).toHaveText("01");
  await expect.poll(() => focused(page)).toBe("hour");
  await page.keyboard.type("2");
  await expect(hour).toHaveText("12");
  await expect(hour).toHaveAttribute("aria-valuemax", "12");
  await expect.poll(() => focused(page)).toBe("minute");
  await page.keyboard.type("00");
  await expect.poll(() => focused(page)).toBe("dayPeriod");
  await expect(parse).toHaveText("timeIncomplete");
  await expect(value).toHaveText("null");

  // Typing a period's first letter: a is AM, so 12:00 AM is midnight; P (any case) is noon.
  await page.keyboard.type("x");
  await expect(period).toHaveText("––");
  await page.keyboard.type("a");
  await expect(period).toHaveText("AM");
  await expect(value).toHaveText("00:00");
  await expect(parse).toHaveText("");
  await expect(period).toHaveAttribute("aria-valuetext", "AM");
  await expect(period).toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.type("P");
  await expect(period).toHaveText("PM");
  await expect(value).toHaveText("12:00");
  await expect(period).toHaveAttribute("aria-valuetext", "PM");
  await expect(period).toHaveAttribute("aria-valuenow", "1");

  // Up/Down toggle the period and keep focus; Home is AM, End PM.
  await page.keyboard.press("ArrowUp");
  await expect(value).toHaveText("00:00");
  await page.keyboard.press("ArrowDown");
  await expect(value).toHaveText("12:00");
  await page.keyboard.press("Home");
  await expect(period).toHaveText("AM");
  await page.keyboard.press("End");
  await expect(period).toHaveText("PM");
  await expect.poll(() => focused(page)).toBe("dayPeriod");

  // 1 PM is 13; the hour's own wrap stays within 1–12.
  await moveFocus(hour);
  await page.keyboard.type("1");
  await expect(value).toHaveText("13:00");
  await moveFocus(hour);
  await page.keyboard.press("ArrowDown");
  await expect(hour).toHaveText("12");
  await expect(value).toHaveText("12:00");
  await page.keyboard.press("ArrowUp");
  await expect(hour).toHaveText("01");
  await expect(value).toHaveText("13:00");
  await moveFocus(hour);
  await page.keyboard.type("0");
  await expect(hour).toHaveText("0");
  await page.keyboard.type("0");
  await expect(hour).toHaveText("0");
  await expect(parse).toHaveText("timeIncomplete");
  await page.keyboard.type("2");
  await expect(hour).toHaveText("02");
  await expect(value).toHaveText("14:00");

  // Writes show the other way: 00:00 is 12 AM, 12:00 is 12 PM, 23:59 is 11:59 PM.
  await page.getByTestId("us-write-midnight").click();
  await expect.poll(() => texts(page, "us")).toEqual(["12", ":", "00", "\u202f", "AM"]);
  await page.getByTestId("us-write-noon").click();
  await expect.poll(() => texts(page, "us")).toEqual(["12", ":", "00", "\u202f", "PM"]);
  await page.getByTestId("us-write-late").click();
  await expect.poll(() => texts(page, "us")).toEqual(["11", ":", "59", "\u202f", "PM"]);

  // Backspace and Delete empty the day period; Backspace on an empty one moves back.
  await moveFocus(period);
  await page.keyboard.press("Backspace");
  await expect(period).toHaveText("––");
  await expect(parse).toHaveText("timeIncomplete");
  await expect(value).toHaveText("23:59");
  await page.keyboard.press("Backspace");
  await expect.poll(() => focused(page)).toBe("minute");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => focused(page)).toBe("dayPeriod");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => focused(page)).toBe("dayPeriod");
  await page.keyboard.type("p");
  await expect(value).toHaveText("23:59");
  await page.keyboard.press("Delete");
  await expect(period).toHaveText("––");
  await expectClean(page, "us");
});

test("DF26 12-hour layout (el): Greek unit and day period names; π and μ, in either case, choose π.μ. and μ.μ.", async ({
  page,
}, info) => {
  await fixture(page, "time-field", info);

  const value = page.getByTestId("el-value");
  const period = segment(page, "el", "dayPeriod");

  await expect.poll(() => order(page, "el")).toEqual(["hour", "minute", "dayPeriod"]);
  await expect(segment(page, "el", "hour")).toHaveAttribute("aria-label", "ώρα");
  await expect(segment(page, "el", "minute")).toHaveAttribute("aria-label", "λεπτό");
  await expect(period).toHaveAttribute("aria-label", "π.μ./μ.μ.");

  await moveFocus(segment(page, "el", "hour"));
  await page.keyboard.type("0145");
  await expect.poll(() => focused(page)).toBe("dayPeriod");
  await page.keyboard.type("μ");
  await expect(period).toHaveText("μ.μ.");
  await expect(period).toHaveAttribute("aria-valuetext", "μ.μ.");
  await expect(value).toHaveText("13:45");
  await page.keyboard.type("Π");
  await expect(period).toHaveText("π.μ.");
  await expect(value).toHaveText("01:45");
  await page.keyboard.type("Μ");
  await expect(value).toHaveText("13:45");
  await page.keyboard.type("π");
  await expect(value).toHaveText("01:45");
  await page.keyboard.type("a");
  await expect(value).toHaveText("01:45");
  await expectClean(page, "el");
});

test("DF27 hourCycle: a static hourCycle=12 adds am/pm to en-GB; switching the cycle re-lays out and shows the value in the new cycle", async ({
  page,
}, info) => {
  await fixture(page, "time-field", info);

  await expect
    .poll(() => order(page, "seconds"))
    .toEqual(["hour", "minute", "second", "dayPeriod"]);
  await expect(segment(page, "seconds", "dayPeriod")).toHaveAttribute("aria-label", "am/pm");

  // en-GB follows its locale (24), then 12, then 24 forced, then the locale again.
  const layout = async (): Promise<{ hourCycle: number; periods: string[] | null }> =>
    JSON.parse((await root(page, "gb").getAttribute("data-layout"))!);

  await page.getByTestId("gb-write-minutes").click();
  await expect.poll(() => texts(page, "gb")).toEqual(["13", ":", "45"]);
  await page.getByTestId("gb-cycle").click();
  await expect.poll(() => texts(page, "gb")).toEqual(["01", ":", "45", expect.any(String), "pm"]);
  await expect.poll(async () => (await layout()).hourCycle).toBe(12);
  await expect(segment(page, "gb", "hour")).toHaveAttribute("aria-valuemax", "12");
  await moveFocus(segment(page, "gb", "dayPeriod"));
  await page.keyboard.type("a");
  await expect(page.getByTestId("gb-value")).toHaveText("01:45");
  await page.getByTestId("gb-cycle").click();
  await expect.poll(() => texts(page, "gb")).toEqual(["01", ":", "45"]);
  await expect.poll(async () => (await layout()).periods).toBe(null);
  await page.getByTestId("gb-cycle").click();
  await expect.poll(() => order(page, "gb")).toEqual(["hour", "minute"]);
  await expect(page.getByTestId("gb-value")).toHaveText("01:45");

  // en-US forced to 24: no day period, 0–23.
  await page.getByTestId("us-write-late").click();
  await page.getByTestId("us-cycle").click();
  await page.getByTestId("us-cycle").click();
  await expect.poll(() => order(page, "us")).toEqual(["hour", "minute"]);
  await expect.poll(() => texts(page, "us")).toEqual(["23", ":", "59"]);
  await expect(page.getByTestId("gb-writes")).toHaveText("1");
});

test("DF28 precision: second precision lays out the second and writes HH:mm:ss; switching precision re-lays out without writing, and the next edit writes the new precision", async ({
  page,
}, info) => {
  await fixture(page, "time-field", info);

  const seconds = page.getByTestId("seconds-value");

  await moveFocus(segment(page, "seconds", "hour"));
  await page.keyboard.type("093015");
  await expect.poll(() => focused(page)).toBe("dayPeriod");
  await expect(page.getByTestId("seconds-parse")).toHaveText("timeIncomplete");
  await page.keyboard.type("p");
  await expect(seconds).toHaveText("21:30:15");
  await expect
    .poll(() => texts(page, "seconds"))
    .toEqual(["09", ":", "30", ":", "15", "\u202f", "pm"]);

  // Minute precision writes HH:mm; switching to second shows :00 and writes nothing.
  const value = page.getByTestId("gb-value");

  await moveFocus(segment(page, "gb", "hour"));
  await page.keyboard.type("0930");
  await expect(value).toHaveText("09:30");
  await page.getByTestId("gb-precision").click();
  await expect.poll(() => order(page, "gb")).toEqual(["hour", "minute", "second"]);
  await expect.poll(() => texts(page, "gb")).toEqual(["09", ":", "30", ":", "00"]);
  await expect(value).toHaveText("09:30");
  await expect(page.getByTestId("gb-writes")).toHaveText("2");
  await expect(segment(page, "gb", "second")).toHaveAttribute("aria-label", "second");
  expect(
    JSON.parse((await root(page, "gb").getAttribute("data-layout"))!).parts.map(
      (part: { type: string }) => part.type,
    ),
  ).toEqual(["hour", "literal", "minute", "literal", "second"]);
  await moveFocus(segment(page, "gb", "minute"));
  await page.keyboard.press("ArrowUp");
  await expect(value).toHaveText("09:31:00");
  await moveFocus(segment(page, "gb", "second"));
  await page.keyboard.type("45");
  await expect(value).toHaveText("09:31:45");

  // Back to minutes: the second hides, the value stays until an edit writes HH:mm.
  await page.getByTestId("gb-precision").click();
  await expect.poll(() => order(page, "gb")).toEqual(["hour", "minute"]);
  await expect(value).toHaveText("09:31:45");
  await moveFocus(segment(page, "gb", "minute"));
  await page.keyboard.press("ArrowUp");
  await expect(value).toHaveText("09:32");
});

test("DF29 other-precision and non-canonical values: HH:mm:ss at minute precision shows HH:mm and the next edit drops the second; HH:mm at second precision shows :00; 9:30 shows empty and is kept", async ({
  page,
}, info) => {
  await fixture(page, "time-field", info);

  const value = page.getByTestId("gb-value");

  await page.getByTestId("gb-write-seconds").click();
  await expect.poll(() => texts(page, "gb")).toEqual(["09", ":", "30"]);
  await expect(value).toHaveText("09:30:15");
  await expect(page.getByTestId("gb-parse")).toHaveText("");
  await moveFocus(segment(page, "gb", "minute"));
  await page.keyboard.press("ArrowUp");
  await expect(value).toHaveText("09:31");

  await page.getByTestId("seconds-write").click();
  await expect
    .poll(() => texts(page, "seconds"))
    .toEqual(["09", ":", "30", ":", "00", "\u202f", "am"]);
  await expect(page.getByTestId("seconds-value")).toHaveText("09:30");
  await moveFocus(segment(page, "seconds", "minute"));
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("seconds-value")).toHaveText("09:31:00");

  // A non-canonical value shows empty segments and is kept, also while a draft is incomplete.
  await page.getByTestId("gb-write-text").click();
  await expect.poll(() => texts(page, "gb")).toEqual(["––", ":", "––"]);
  await expect(value).toHaveText("9:30");
  await moveFocus(segment(page, "gb", "hour"));
  await page.keyboard.type("1");
  await expect(page.getByTestId("gb-parse")).toHaveText("timeIncomplete");
  await expect(value).toHaveText("9:30");

  // Paste: a whole time of either precision commits at the root's; digits fill the focused unit.
  // A plain event with its own clipboardData: Firefox drops a constructed ClipboardEvent's.
  const paste = async (target: Locator, text: string): Promise<void> => {
    const prevented = await target.evaluate((element: HTMLElement, data: string) => {
      const event = new Event("paste", { bubbles: true, cancelable: true });

      Object.defineProperty(event, "clipboardData", {
        value: { getData: (type: string) => (type === "text/plain" ? data : "") },
      });
      element.dispatchEvent(event);

      return event.defaultPrevented;
    }, text);

    expect(prevented).toBe(true);
  };

  await paste(segment(page, "gb", "minute"), " 13:45:30 ");
  await expect(value).toHaveText("13:45");
  await expect.poll(() => texts(page, "gb")).toEqual(["13", ":", "45"]);
  await paste(segment(page, "gb", "minute"), "05");
  await expect(value).toHaveText("13:05");
  await paste(segment(page, "gb", "minute"), "1:45 PM");
  await expect(value).toHaveText("13:05");
  await paste(segment(page, "us", "dayPeriod"), "13:45");
  await expect(page.getByTestId("us-value")).toHaveText("13:45");
  await expect.poll(() => texts(page, "us")).toEqual(["01", ":", "45", "\u202f", "PM"]);
  await paste(segment(page, "us", "dayPeriod"), "AM");
  await expect(page.getByTestId("us-value")).toHaveText("13:45");
  await expectClean(page, "gb");
  await expectClean(page, "us");
});

for (const name of ["direct", "composed"] as const) {
  test(`DF30 ${name}: timeIncomplete keeps the value and reaches the form; reset discards the draft, also to the same value; clear() commits null`, async ({
    page,
  }, info) => {
    await fixture(page, "time-field", info);

    const value = page.getByTestId(`${name}-value`);
    const errors = page.getByTestId(`${name}-errors`);
    const parse = page.getByTestId(`${name}-parse`);
    let committed = ["09", ":", "30", "\u202f", "AM"];
    let other = ["09", ":", "15", "\u202f", "PM"];
    let start = "09:30";

    if (name === "composed") {
      committed = ["13", ":", "45"];
      other = ["21", ":", "15"];
      start = "13:45";
    }

    await expect(value).toHaveText(start);
    await expect.poll(() => texts(page, name)).toEqual(committed);

    // Clearing the minute keeps the others and the value; the form carries timeIncomplete.
    await segment(page, name, "minute").focus();
    await page.keyboard.press("Delete");
    await expect(segment(page, name, "minute")).toHaveText("––");
    await expect(value).toHaveText(start);
    await expect(errors).toHaveText("timeIncomplete");
    await expect(parse).toHaveText("timeIncomplete");

    // A same-value reset discards the draft; a reset to another value shows it.
    await page.getByTestId(`${name}-reset-same`).click();
    await expect(errors).toHaveText("");
    await expect(parse).toHaveText("");
    await expect.poll(() => texts(page, name)).toEqual(committed);
    await segment(page, name, "hour").focus();
    await page.keyboard.press("Delete");
    await expect(errors).toHaveText("timeIncomplete");
    await page.getByTestId(`${name}-reset-other`).click();
    await expect(value).toHaveText("21:15");
    await expect(errors).toHaveText("");
    await expect.poll(() => texts(page, name)).toEqual(other);

    // A complete edit commits at once.
    await segment(page, name, "minute").focus();
    await page.keyboard.type("40");
    await expect(value).toHaveText("21:40");

    // clear() over a half-typed draft commits null; the form sees it.
    await segment(page, name, "minute").focus();
    await page.keyboard.press("Delete");
    await expect(parse).toHaveText("timeIncomplete");
    await press(page, `${name}-clear`);
    await expect(value).toHaveText("");
    await expect(parse).toHaveText("");
    await expect.poll(async () => (await texts(page, name)).join("")).not.toMatch(/\d/);

    if (name === "direct") {
      await expect(errors).toHaveText("required");
    } else {
      await expect(errors).toHaveText("");
      // Signal Forms bound the composer's model, never the composed root's own one.
      await expect(page.getByTestId("composed-own-value")).toHaveText("null");
    }

    await expectClean(page, name);
  });
}

test("DF31 Field naming and touch: segments are named by the Label; focus moving inside the group doesn't touch, leaving it does; focusBoundControl() directly and through a composer; submit() shows the Error with aria-invalid", async ({
  page,
}, info) => {
  await fixture(page, "time-field", info);

  await press(page, "composed-focus");
  await expect.poll(() => focused(page)).toBe("hour");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("composed-touched")).toHaveText("false");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("composed-touched")).toHaveText("true");

  await press(page, "direct-focus");
  await expect.poll(() => focused(page)).toBe("hour");
  await expect(segment(page, "direct", "hour")).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(segment(page, "direct", "dayPeriod")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Shift+Tab");
  await expect(segment(page, "direct", "hour")).toBeFocused();
  await expect(page.getByTestId("direct-touched")).toHaveText("false");
  await page.keyboard.press("Delete");
  await press(page, "direct-submit");
  await expect(page.getByTestId("direct-touched")).toHaveText("true");
  await expect(page.getByTestId("direct-error")).toHaveText("timeIncomplete");
  await expect(page.getByTestId("direct-group")).toHaveAttribute(
    "aria-describedby",
    "direct-description direct-error",
  );

  for (const unit of ["hour", "minute", "dayPeriod"]) {
    await expect(segment(page, "direct", unit)).toHaveAttribute("aria-invalid", "true");
  }

  await expect(segment(page, "direct", "minute")).toHaveAccessibleName("Opens at minute");
});

test("DF32 seed: rendered with el on the server, a time root keeps the Greek 12-hour layout and names after hydration in an en-US browser and types π/μ; a browser-created root is en-US", async ({
  page,
}, info) => {
  let server = { layout: "", texts: [] as string[] };

  await fixture(page, "time-field", info, async () => {
    server = {
      layout: (await root(page, "seed").getAttribute("data-layout")) ?? "",
      texts: await texts(page, "seed"),
    };
  });

  expect(JSON.parse(server.layout).locale).toBe("el");
  expect(server.texts).toEqual(["01", ":", "45", " ", "μ.μ."]);
  await expect(root(page, "seed")).toHaveAttribute("data-layout", server.layout);
  await expect.poll(() => texts(page, "seed")).toEqual(server.texts);
  await expect(segment(page, "seed", "hour")).toHaveAttribute("aria-label", "ώρα");
  await expect(segment(page, "seed", "dayPeriod")).toHaveAttribute("aria-label", "π.μ./μ.μ.");
  await expect(segment(page, "seed", "dayPeriod")).toHaveAttribute("aria-valuetext", "μ.μ.");

  await moveFocus(segment(page, "seed", "dayPeriod"));
  await page.keyboard.type("π");
  await expect(segment(page, "seed", "dayPeriod")).toHaveText("π.μ.");
  await expect(page.getByTestId("seed-value")).toHaveText("01:45");
  await expectClean(page, "seed");

  await page.getByTestId("show-late").click();
  await expect.poll(() => texts(page, "late")).toEqual(["01", ":", "45", expect.any(String), "PM"]);
  await expect(segment(page, "late", "dayPeriod")).toHaveAttribute("aria-label", "AM/PM");
});

test("DF33 seed falsifier: an en-US 12-hour time rendered by Node (U+202F before the day period) keeps the server's literals after hydration in a browser whose Intl differs", async ({
  page,
  browserName,
}, info) => {
  let server: string[] = [];

  await fixture(page, "time-field", info, async () => {
    server = await literals(page, "direct");
  });

  // Node's ICU puts U+202F before "AM"; the hydrated root keeps it.
  expect(server).toEqual(["U+003A", "U+202F"]);
  await expect.poll(() => literals(page, "direct")).toEqual(server);

  // The browser's own Intl, which a browser-created twin uses.
  const own = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
    }).formatToParts(Date.UTC(2001, 10, 22, 13, 45));

    return parts.find((part, index) => part.type === "literal" && index > 2)?.value ?? "";
  });

  await page.getByTestId("show-twin").click();
  await expect.poll(() => texts(page, "late-twin")).toEqual(["09", ":", "30", own, "AM"]);
  console.log(`[DF33 ${browserName}] browser literal`, JSON.stringify(own), "server U+202F");

  // Chromium, Firefox and WebKit all put U+0020 there: the case is a falsifier in each.
  expect(own).toBe(" ");

  // Typing still works on the hydrated root.
  await moveFocus(segment(page, "direct", "dayPeriod"));
  await page.keyboard.type("p");
  await expect(page.getByTestId("direct-value")).toHaveText("21:30");
  await expect.poll(() => literals(page, "direct")).toEqual(server);
});

test("DF34 accessibility tree of a 12-hour field: an empty one, a filled one in a Field and its focused day period", async ({
  page,
  browserName,
}, info) => {
  await fixture(page, "time-field", info);

  await page
    .getByTestId("us-group")
    .evaluate((element) => element.setAttribute("aria-label", "Alarm"));

  const empty = await page.getByTestId("us-group").ariaSnapshot();
  const filled = await page.getByTestId("direct-group").ariaSnapshot();

  await moveFocus(segment(page, "direct", "dayPeriod"));

  const focusedSegment = await segment(page, "direct", "dayPeriod").ariaSnapshot();
  const snapshots: Record<string, unknown> = { empty, filled, focused: focusedSegment };

  if (browserName === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const spinbuttons: unknown[] = [];

    for (const node of nodes) {
      if (node.role?.value !== "spinbutton" || !String(node.name?.value).startsWith("Opens at")) {
        continue;
      }

      const properties: Record<string, unknown> = {};

      for (const property of node.properties ?? []) {
        properties[property.name] = property.value.value;
      }

      spinbuttons.push({ name: node.name?.value, value: node.value?.value, properties });
    }

    snapshots["chromium-spinbuttons"] = spinbuttons;
  }

  console.log(`[DF34 ${browserName}]`, JSON.stringify(snapshots, null, 1));
  await info.attach(`accessibility-${browserName}`, {
    body: JSON.stringify(snapshots, null, 2),
    contentType: "application/json",
  });

  expect(empty).toContain('group "Alarm"');
  expect(empty).toContain('spinbutton "hour"');
  expect(empty).toContain('spinbutton "minute"');
  expect(empty).toContain('spinbutton "AM/PM"');
  expect(empty).not.toContain("- text");
  expect(filled).toContain('group "Opens at"');
  expect(filled).toContain('spinbutton "Opens at hour"');
  expect(filled).toContain('spinbutton "Opens at minute"');
  expect(filled).toContain('spinbutton "Opens at AM/PM"');
  expect(focusedSegment).toContain('spinbutton "Opens at AM/PM"');
});

test("DF35 a precision change over a half-typed draft shows the value again: over null every unit empties and the next digit starts the hour over; over a non-canonical value the segments empty and it stays", async ({
  page,
}, info) => {
  await fixture(page, "time-field", info);

  const value = page.getByTestId("gb-value");
  const parse = page.getByTestId("gb-parse");
  const hour = segment(page, "gb", "hour");

  // Over null: the typed 1 goes with its error; 2 then waits as 02 instead of making 12.
  await moveFocus(hour);
  await page.keyboard.type("1");
  await expect(hour).toHaveText("01");
  await expect(parse).toHaveText("timeIncomplete");
  await press(page, "gb-precision");
  await expect.poll(() => texts(page, "gb")).toEqual(["––", ":", "––", ":", "––"]);
  await expect(parse).toHaveText("");
  await expect(value).toHaveText("null");
  await expect(hour).toBeFocused();
  await page.keyboard.type("2");
  await expect(hour).toHaveText("02");
  await expect(hour).toBeFocused();

  // Over a non-canonical value: the same, and the value stays.
  await press(page, "gb-write-text");
  await expect.poll(() => texts(page, "gb")).toEqual(["––", ":", "––", ":", "––"]);
  await page.keyboard.type("1");
  await expect(hour).toHaveText("01");
  await expect(parse).toHaveText("timeIncomplete");
  await press(page, "gb-precision");
  await expect.poll(() => texts(page, "gb")).toEqual(["––", ":", "––"]);
  await expect(parse).toHaveText("");
  await expect(value).toHaveText("9:30");
  await page.keyboard.type("2");
  await expect(hour).toHaveText("02");
  await expect(value).toHaveText("9:30");
  await expect(page.getByTestId("gb-writes")).toHaveText("0");
});

test("DF36 a precision or hour-cycle change over a half-typed draft of a committed value shows the value again with no parse error and the form valid, writing nothing", async ({
  page,
}, info) => {
  await fixture(page, "time-field", info);

  const value = page.getByTestId("layout-value");
  const errors = page.getByTestId("layout-errors");
  const parse = page.getByTestId("layout-parse");
  const valid = page.getByTestId("layout-valid");

  const expectShown = async (shown: unknown[]): Promise<void> => {
    await expect.poll(() => texts(page, "layout")).toEqual(shown);
    await expect(errors).toHaveText("");
    await expect(parse).toHaveText("");
    await expect(valid).toHaveText("true");
    await expect(value).toHaveText("09:30");
    await expect(page.getByTestId("layout-writes")).toHaveText("0");
  };
  const empty = async (unit: string): Promise<void> => {
    await moveFocus(segment(page, "layout", unit));
    await page.keyboard.press("Delete");
    await expect(segment(page, "layout", unit)).toHaveText("––");
    await expect(errors).toHaveText("timeIncomplete");
    await expect(valid).toHaveText("false");
  };

  await expectShown(["09", ":", "30"]);

  // Minute to second precision.
  await empty("minute");
  await press(page, "layout-precision");
  await expectShown(["09", ":", "30", ":", "00"]);
  await press(page, "layout-precision");
  await expectShown(["09", ":", "30"]);

  // 24 to 12 hours, then an emptied day period and 12 to 24: no error for a unit that's gone.
  await empty("minute");
  await press(page, "layout-cycle");
  await expectShown(["09", ":", "30", expect.any(String), "am"]);
  await empty("dayPeriod");
  await press(page, "layout-cycle");
  await expectShown(["09", ":", "30"]);
  await expect.poll(() => order(page, "layout")).toEqual(["hour", "minute"]);
});
