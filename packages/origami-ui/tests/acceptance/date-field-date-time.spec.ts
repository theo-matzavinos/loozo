import { test, expect } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import { fixture } from "./observation.js";

// Date-time field (section 25, DF from DF37), against the `date-time-field` fixture.

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

/** The `en-US` Field case's naming, layout, literals and segments, as rendered now. */
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

/** Pastes `text` on `target` with a plain event: Firefox drops a constructed ClipboardEvent's data. */
async function paste(target: Locator, text: string): Promise<void> {
  const prevented = await target.evaluate((element: HTMLElement, data: string) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });

    Object.defineProperty(event, "clipboardData", {
      value: { getData: (type: string) => (type === "text/plain" ? data : "") },
    });
    element.dispatchEvent(event);

    return event.defaultPrevented;
  }, text);

  expect(prevented).toBe(true);
}

/** Node's `en-US` texts for 2026-10-27T09:30, which a hydrated root keeps (U+202F before AM). */
const directTexts = ["10", "/", "27", "/", "2026", ", ", "09", ":", "30", " ", "AM"];

test("DF37 server HTML and hydration: an en-US date-time in a Field lays out month/day/year, then h:mm and AM/PM, from one locale format, each segment named and valued", async ({
  page,
}, info) => {
  let server: Record<string, unknown> = {};

  await fixture(page, "date-time-field", info, async () => {
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
    locale: string;
    hourCycle: number;
    periods: string[];
    parts: { type: string; text: string }[];
  };

  expect(layout.locale).toBe("en-US");
  expect(layout.hourCycle).toBe(12);
  expect(layout.periods).toEqual(["AM", "PM"]);
  expect(layout.parts.map((part) => part.type)).toEqual([
    "month",
    "literal",
    "day",
    "literal",
    "year",
    "literal",
    "hour",
    "literal",
    "minute",
    "literal",
    "dayPeriod",
  ]);
  expect(attached["literals"]).toEqual(["U+002F", "U+002F", "U+002C U+0020", "U+003A", "U+202F"]);
  await expect.poll(() => texts(page, "direct")).toEqual(directTexts);

  const segments = attached["segments"] as Record<string, unknown>[];
  const expected = [
    ["month", "10", "month", "10", "1", "12", "October", "numeric"],
    ["day", "27", "day", "27", "1", "31", null, "numeric"],
    ["year", "2026", "year", "2026", "1", "9999", null, "numeric"],
    ["hour", "09", "hour", "9", "1", "12", null, "numeric"],
    ["minute", "30", "minute", "30", "0", "59", null, "numeric"],
    ["dayPeriod", "AM", "AM/PM", "0", "0", "1", "AM", "text"],
  ];

  expect(segments).toHaveLength(expected.length);

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

  await expect(segment(page, "direct", "year")).toHaveAccessibleName("Starts at year");
  await expect(segment(page, "direct", "dayPeriod")).toHaveAccessibleName("Starts at AM/PM");
  await expect(page.getByTestId("direct-group")).toHaveAccessibleName("Starts at");
});

test("DF38 el and en-GB layouts: day/month/year, then the time; el is 12-hour with π.μ./μ.μ. and Greek names, en-GB 24-hour with no day period; a static precision=second hourCycle=24 en-US field adds the second", async ({
  page,
}, info) => {
  await fixture(page, "date-time-field", info);

  await expect
    .poll(() => order(page, "el"))
    .toEqual(["day", "month", "year", "hour", "minute", "dayPeriod"]);
  await expect
    .poll(() => texts(page, "el"))
    .toEqual(["––", "/", "––", "/", "––––", ", ", "––", ":", "––", " ", "––"]);

  for (const [unit, label] of [
    ["day", "ημέρα"],
    ["month", "μήνας"],
    ["year", "έτος"],
    ["hour", "ώρα"],
    ["minute", "λεπτό"],
    ["dayPeriod", "π.μ./μ.μ."],
  ]) {
    await expect(segment(page, "el", unit!)).toHaveAttribute("aria-label", label!);
  }

  await moveFocus(segment(page, "el", "day"));
  await page.keyboard.type("27102026");
  await expect.poll(() => focused(page)).toBe("hour");
  await page.keyboard.type("0145");
  await expect.poll(() => focused(page)).toBe("dayPeriod");
  await expect(page.getByTestId("el-parse")).toHaveText("dateTimeIncomplete");
  await page.keyboard.type("μ");
  await expect(page.getByTestId("el-value")).toHaveText("2026-10-27T13:45");
  await expect(segment(page, "el", "month")).toHaveAttribute("aria-valuetext", "Οκτωβρίου");
  await expect(segment(page, "el", "dayPeriod")).toHaveAttribute("aria-valuetext", "μ.μ.");
  await expectClean(page, "el");

  await expect.poll(() => order(page, "gb")).toEqual(["day", "month", "year", "hour", "minute"]);
  await expect
    .poll(() => texts(page, "gb"))
    .toEqual(["––", "/", "––", "/", "––––", ", ", "––", ":", "––"]);
  expect(JSON.parse((await root(page, "gb").getAttribute("data-layout"))!).hourCycle).toBe(24);
  await expect(segment(page, "gb", "hour")).toHaveAttribute("aria-label", "hour");

  await expect
    .poll(() => order(page, "seconds"))
    .toEqual(["month", "day", "year", "hour", "minute", "second"]);
  await expect
    .poll(() => texts(page, "seconds"))
    .toEqual(["––", "/", "––", "/", "––––", ", ", "––", ":", "––", ":", "––"]);
});

test("DF39 typing across the date→time boundary: the year's fourth digit moves to the hour, the minute to the day period, and the whole commits once; Left, Right and Tab cross the boundary", async ({
  page,
}, info) => {
  await fixture(page, "date-time-field", info);

  const value = page.getByTestId("us-value");
  const parse = page.getByTestId("us-parse");

  await expect
    .poll(() => texts(page, "us"))
    .toEqual(["––", "/", "––", "/", "––––", ", ", "––", ":", "––", " ", "––"]);

  await moveFocus(segment(page, "us", "month"));
  await page.keyboard.type("1027");
  await expect.poll(() => focused(page)).toBe("year");
  await page.keyboard.type("202");
  await expect.poll(() => focused(page)).toBe("year");
  await page.keyboard.type("6");
  await expect.poll(() => focused(page)).toBe("hour");
  await expect(parse).toHaveText("dateTimeIncomplete");
  await expect(value).toHaveText("null");
  await page.keyboard.type("0930");
  await expect.poll(() => focused(page)).toBe("dayPeriod");
  await expect(parse).toHaveText("dateTimeIncomplete");
  await expect(value).toHaveText("null");
  await page.keyboard.type("p");
  await expect(value).toHaveText("2026-10-27T21:30");
  await expect(parse).toHaveText("");
  await expect(page.getByTestId("us-writes")).toHaveText("1");
  await expect
    .poll(() => texts(page, "us"))
    .toEqual(["10", "/", "27", "/", "2026", ", ", "09", ":", "30", " ", "PM"]);

  // Left and Right cross between the halves; Tab visits every segment, then leaves.
  await moveFocus(segment(page, "us", "hour"));
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => focused(page)).toBe("year");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => focused(page)).toBe("hour");
  await moveFocus(segment(page, "us", "month"));

  for (const unit of ["day", "year", "hour", "minute", "dayPeriod"]) {
    await page.keyboard.press("Tab");
    await expect.poll(() => focused(page)).toBe(unit);
  }

  await page.keyboard.press("Tab");
  await expect.poll(() => focused(page)).not.toBe("dayPeriod");

  // Up on the hour steps it without carry into the date; focus stays.
  await moveFocus(segment(page, "us", "hour"));
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowUp");
  await expect(value).toHaveText("2026-10-27T13:30");
  await expect.poll(() => focused(page)).toBe("hour");

  // en-GB, 24-hour: the minute is the last segment.
  await moveFocus(segment(page, "gb", "day"));
  await page.keyboard.type("271020261345");
  await expect(page.getByTestId("gb-value")).toHaveText("2026-10-27T13:45");
  await expect.poll(() => focused(page)).toBe("minute");
  await expectClean(page, "us");
  await expectClean(page, "gb");
});

test("DF40 31 February: a complete draft whose date doesn't exist shows as typed with dateInvalid and keeps the value; fixing the month commits", async ({
  page,
}, info) => {
  await fixture(page, "date-time-field", info);

  const value = page.getByTestId("gb-value");
  const parse = page.getByTestId("gb-parse");

  await moveFocus(segment(page, "gb", "day"));
  await page.keyboard.type("31022026");
  await expect(parse).toHaveText("dateTimeIncomplete");
  await page.keyboard.type("0930");
  await expect
    .poll(() => texts(page, "gb"))
    .toEqual(["31", "/", "02", "/", "2026", ", ", "09", ":", "30"]);
  await expect(parse).toHaveText("dateInvalid");
  await expect(value).toHaveText("null");
  await expect(segment(page, "gb", "day")).toHaveAttribute("aria-valuemax", "28");

  await moveFocus(segment(page, "gb", "month"));
  await page.keyboard.type("03");
  await expect(value).toHaveText("2026-03-31T09:30");
  await expect(parse).toHaveText("");
  await expect(page.getByTestId("gb-writes")).toHaveText("1");

  // Back to February over a committed value: the value stays, dateInvalid again.
  await moveFocus(segment(page, "gb", "month"));
  await page.keyboard.type("02");
  await expect(parse).toHaveText("dateInvalid");
  await expect(value).toHaveText("2026-03-31T09:30");
  await expectClean(page, "gb");
});

test("DF41 dateTimeIncomplete with only the time empty and with only the date empty keeps the value; emptying every unit commits null", async ({
  page,
}, info) => {
  await fixture(page, "date-time-field", info);

  const value = page.getByTestId("us-value");
  const parse = page.getByTestId("us-parse");
  const empty = async (units: string[]): Promise<void> => {
    for (const unit of units) {
      await moveFocus(segment(page, "us", unit));
      await page.keyboard.press("Delete");
    }
  };

  await page.getByTestId("us-write").click();
  await expect.poll(() => texts(page, "us")).toEqual(directTexts);

  await empty(["hour", "minute", "dayPeriod"]);
  await expect
    .poll(() => texts(page, "us"))
    .toEqual(["10", "/", "27", "/", "2026", ", ", "––", ":", "––", " ", "––"]);
  await expect(parse).toHaveText("dateTimeIncomplete");
  await expect(value).toHaveText("2026-10-27T09:30");

  // Typing the time again commits the same value: no write, the error goes.
  await moveFocus(segment(page, "us", "hour"));
  await page.keyboard.type("0930a");
  await expect(parse).toHaveText("");
  await expect(value).toHaveText("2026-10-27T09:30");

  await empty(["month", "day", "year"]);
  await expect
    .poll(() => texts(page, "us"))
    .toEqual(["––", "/", "––", "/", "––––", ", ", "09", ":", "30", " ", "AM"]);
  await expect(parse).toHaveText("dateTimeIncomplete");
  await expect(value).toHaveText("2026-10-27T09:30");

  await empty(["hour", "minute", "dayPeriod"]);
  await expect(value).toHaveText("null");
  await expect(parse).toHaveText("");
  await expect(page.getByTestId("us-writes")).toHaveText("1");
  await expectClean(page, "us");
});

test("DF42 precision: second precision writes YYYY-MM-DDTHH:mm:ss; values of the other precision show and the next edit, a date edit included, writes the root's precision", async ({
  page,
}, info) => {
  await fixture(page, "date-time-field", info);

  const seconds = page.getByTestId("seconds-value");

  await moveFocus(segment(page, "seconds", "month"));
  await page.keyboard.type("10272026093015");
  await expect(seconds).toHaveText("2026-10-27T09:30:15");
  await expect(page.getByTestId("seconds-parse")).toHaveText("");

  // A minute value at second precision shows :00, and an edit writes the second.
  await page.getByTestId("seconds-write").click();
  await expect
    .poll(() => texts(page, "seconds"))
    .toEqual(["10", "/", "27", "/", "2026", ", ", "09", ":", "30", ":", "00"]);
  await expect(seconds).toHaveText("2026-10-27T09:30");
  await moveFocus(segment(page, "seconds", "minute"));
  await page.keyboard.press("ArrowUp");
  await expect(seconds).toHaveText("2026-10-27T09:31:00");

  // A second value at minute precision shows HH:mm; a date edit writes the minute precision.
  const value = page.getByTestId("gb-value");

  await page.getByTestId("gb-write-seconds").click();
  await expect
    .poll(() => texts(page, "gb"))
    .toEqual(["27", "/", "10", "/", "2026", ", ", "09", ":", "30"]);
  await expect(value).toHaveText("2026-10-27T09:30:15");
  await expect(page.getByTestId("gb-parse")).toHaveText("");
  await moveFocus(segment(page, "gb", "day"));
  await page.keyboard.press("ArrowUp");
  await expect(value).toHaveText("2026-10-28T09:30");

  // Switching the precision re-lays out and writes nothing; the next edit writes the new one.
  await page.getByTestId("gb-precision").click();
  await expect
    .poll(() => order(page, "gb"))
    .toEqual(["day", "month", "year", "hour", "minute", "second"]);
  await expect
    .poll(() => texts(page, "gb"))
    .toEqual(["28", "/", "10", "/", "2026", ", ", "09", ":", "30", ":", "00"]);
  await expect(value).toHaveText("2026-10-28T09:30");
  await moveFocus(segment(page, "gb", "second"));
  await page.keyboard.type("45");
  await expect(value).toHaveText("2026-10-28T09:30:45");
  await page.getByTestId("gb-precision").click();
  await expect.poll(() => order(page, "gb")).toEqual(["day", "month", "year", "hour", "minute"]);
  await expect(value).toHaveText("2026-10-28T09:30:45");
  await moveFocus(segment(page, "gb", "year"));
  await page.keyboard.press("ArrowDown");
  await expect(value).toHaveText("2025-10-28T09:30");
  // The day's Up, the second's 4 (09:30:04 on the way) and 5, and the year's Down.
  await expect(page.getByTestId("gb-writes")).toHaveText("4");
});

test("DF43 no zone: a Z or offset value isn't canonical: it shows empty and stays untouched, also under a half-typed draft; pasting one is ignored, a whole local date-time commits", async ({
  page,
}, info) => {
  await fixture(page, "date-time-field", info);

  const value = page.getByTestId("us-value");
  const parse = page.getByTestId("us-parse");
  const noDigits = async (): Promise<void> => {
    await expect.poll(async () => (await texts(page, "us")).join("")).not.toMatch(/\d/);
  };

  await page.getByTestId("us-write-zulu").click();
  await noDigits();
  await expect(value).toHaveText("2026-10-27T09:30Z");
  await expect(parse).toHaveText("");
  await moveFocus(segment(page, "us", "month"));
  await page.keyboard.type("1");
  await expect(parse).toHaveText("dateTimeIncomplete");
  await expect(value).toHaveText("2026-10-27T09:30Z");

  await page.getByTestId("us-write-offset").click();
  await noDigits();
  await expect(value).toHaveText("2026-10-27T09:30:00+03:00");
  await expect(parse).toHaveText("");

  // Paste: a zoned or offset string, a date alone and a time alone change nothing.
  for (const text of [
    "2026-10-27T09:30Z",
    "2026-10-27T09:30:00+03:00",
    "2026-10-27T09:30:00.000Z",
    "2026-10-27",
    "09:30",
  ]) {
    await paste(segment(page, "us", "day"), text);
    await expect(value).toHaveText("2026-10-27T09:30:00+03:00");
  }

  await noDigits();
  await expect(page.getByTestId("us-writes")).toHaveText("0");

  // A whole local date-time of either precision commits at the root's.
  await paste(segment(page, "us", "day"), " 2026-12-24T21:15:30 ");
  await expect(value).toHaveText("2026-12-24T21:15");
  await expect
    .poll(() => texts(page, "us"))
    .toEqual(["12", "/", "24", "/", "2026", ", ", "09", ":", "15", " ", "PM"]);
  await paste(segment(page, "us", "dayPeriod"), "2026-10-27T09:30");
  await expect(value).toHaveText("2026-10-27T09:30");
  await expect(page.getByTestId("us-writes")).toHaveText("2");
  await expectClean(page, "us");
});

for (const name of ["direct", "composed"] as const) {
  test(`DF44 ${name}: dateTimeIncomplete and dateInvalid keep the value and reach the form; reset discards the draft, also to the same value; clear() commits null`, async ({
    page,
  }, info) => {
    await fixture(page, "date-time-field", info);

    const value = page.getByTestId(`${name}-value`);
    const errors = page.getByTestId(`${name}-errors`);
    const parse = page.getByTestId(`${name}-parse`);
    let committed = directTexts;
    let other = ["12", "/", "24", "/", "2026", ", ", "09", ":", "15", " ", "PM"];
    let start = "2026-10-27T09:30";

    if (name === "composed") {
      committed = ["27", "/", "10", "/", "2026", ", ", "13", ":", "45"];
      other = ["24", "/", "12", "/", "2026", ", ", "21", ":", "15"];
      start = "2026-10-27T13:45";
    }

    await expect(value).toHaveText(start);
    await expect.poll(() => texts(page, name)).toEqual(committed);

    // Clearing the year keeps the other units and the value; the form carries the error.
    await segment(page, name, "year").focus();
    await page.keyboard.press("Delete");
    await expect(segment(page, name, "year")).toHaveText("––––");
    await expect(value).toHaveText(start);
    await expect(errors).toHaveText("dateTimeIncomplete");
    await expect(parse).toHaveText("dateTimeIncomplete");

    // A same-value reset discards the draft; a reset to another value shows it.
    await page.getByTestId(`${name}-reset-same`).click();
    await expect(errors).toHaveText("");
    await expect(parse).toHaveText("");
    await expect.poll(() => texts(page, name)).toEqual(committed);
    await segment(page, name, "hour").focus();
    await page.keyboard.press("Delete");
    await expect(errors).toHaveText("dateTimeIncomplete");
    await page.getByTestId(`${name}-reset-other`).click();
    await expect(value).toHaveText("2026-12-24T21:15");
    await expect(errors).toHaveText("");
    await expect.poll(() => texts(page, name)).toEqual(other);

    // 31 December commits; February 31 is dateInvalid in the form; March commits.
    await segment(page, name, "day").focus();
    await page.keyboard.type("31");
    await expect(value).toHaveText("2026-12-31T21:15");
    await segment(page, name, "month").focus();
    await page.keyboard.type("02");
    await expect(errors).toHaveText("dateInvalid");
    await expect(parse).toHaveText("dateInvalid");
    await expect(value).toHaveText("2026-12-31T21:15");
    await segment(page, name, "month").focus();
    await page.keyboard.type("03");
    await expect(value).toHaveText("2026-03-31T21:15");
    await expect(errors).toHaveText("");

    // clear() over a half-typed draft commits null; the form sees it.
    await segment(page, name, "minute").focus();
    await page.keyboard.press("Delete");
    await expect(parse).toHaveText("dateTimeIncomplete");
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

test("DF45 a precision or hour-cycle change over a half-typed draft refreshes the whole draft, date units included: the error clears, the form is valid and nothing is written; over null every unit empties and the next digit starts over", async ({
  page,
}, info) => {
  await fixture(page, "date-time-field", info);

  const value = page.getByTestId("layout-value");
  const errors = page.getByTestId("layout-errors");
  const parse = page.getByTestId("layout-parse");
  const valid = page.getByTestId("layout-valid");
  const date = ["27", "/", "10", "/", "2026", ", "];

  const expectShown = async (shown: unknown[]): Promise<void> => {
    await expect.poll(() => texts(page, "layout")).toEqual([...date, ...shown]);
    await expect(errors).toHaveText("");
    await expect(parse).toHaveText("");
    await expect(valid).toHaveText("true");
    await expect(value).toHaveText("2026-10-27T09:30");
    await expect(page.getByTestId("layout-writes")).toHaveText("0");
  };
  const empty = async (unit: string): Promise<void> => {
    await moveFocus(segment(page, "layout", unit));
    await page.keyboard.press("Delete");
    await expect(segment(page, "layout", unit)).not.toContainText(/\d|am|pm/);
    await expect(errors).toHaveText("dateTimeIncomplete");
    await expect(valid).toHaveText("false");
  };

  await expectShown(["09", ":", "30"]);

  // A date unit emptied, then minute to second precision and back.
  await empty("day");
  await press(page, "layout-precision");
  await expectShown(["09", ":", "30", ":", "00"]);
  await empty("month");
  await press(page, "layout-precision");
  await expectShown(["09", ":", "30"]);

  // The year emptied, then 24 to 12 hours; the day period emptied, then 12 to 24.
  await empty("year");
  await press(page, "layout-cycle");
  await expectShown(["09", ":", "30", expect.any(String), "am"]);
  await empty("dayPeriod");
  await press(page, "layout-cycle");
  await expectShown(["09", ":", "30"]);
  await expect
    .poll(() => order(page, "layout"))
    .toEqual(["day", "month", "year", "hour", "minute"]);

  // Over null: a typed day goes with its error, and 2 then waits as 02 instead of making 12.
  const day = segment(page, "gb", "day");

  await moveFocus(day);
  await page.keyboard.type("1");
  await expect(day).toHaveText("01");
  await expect(page.getByTestId("gb-parse")).toHaveText("dateTimeIncomplete");
  await press(page, "gb-precision");
  await expect
    .poll(() => texts(page, "gb"))
    .toEqual(["––", "/", "––", "/", "––––", ", ", "––", ":", "––", ":", "––"]);
  await expect(page.getByTestId("gb-parse")).toHaveText("");
  await expect(page.getByTestId("gb-value")).toHaveText("null");
  await expect(day).toBeFocused();
  await page.keyboard.type("2");
  await expect(day).toHaveText("02");
  await expect(day).toBeFocused();
  await expect(page.getByTestId("gb-writes")).toHaveText("0");
});

test("DF46 Field naming and touch: segments are named by the Label; focus moving across both halves doesn't touch, leaving the group does; focusBoundControl() directly and through a composer; submit() shows the Error with aria-invalid", async ({
  page,
}, info) => {
  await fixture(page, "date-time-field", info);

  await press(page, "composed-focus");
  await expect.poll(() => focused(page)).toBe("day");

  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("Tab");
  }

  await expect.poll(() => focused(page)).toBe("minute");
  await expect(page.getByTestId("composed-touched")).toHaveText("false");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("composed-touched")).toHaveText("true");

  await press(page, "direct-focus");
  await expect(segment(page, "direct", "month")).toBeFocused();

  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("Tab");
  }

  await expect(segment(page, "direct", "dayPeriod")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Shift+Tab");
  await expect(segment(page, "direct", "hour")).toBeFocused();
  await expect(page.getByTestId("direct-touched")).toHaveText("false");
  await page.keyboard.press("Delete");
  await press(page, "direct-submit");
  await expect(page.getByTestId("direct-touched")).toHaveText("true");
  await expect(page.getByTestId("direct-error")).toHaveText("dateTimeIncomplete");
  await expect(page.getByTestId("direct-group")).toHaveAttribute(
    "aria-describedby",
    "direct-description direct-error",
  );

  for (const unit of ["month", "day", "year", "hour", "minute", "dayPeriod"]) {
    await expect(segment(page, "direct", unit)).toHaveAttribute("aria-invalid", "true");
  }

  await expect(segment(page, "direct", "minute")).toHaveAccessibleName("Starts at minute");
  await expect(segment(page, "direct", "day")).toHaveAccessibleName("Starts at day");
});

test("DF47 seed: rendered with el on the server, a date-time root keeps the Greek day/month/year 12-hour layout and names after hydration in an en-US browser and types into both halves; a browser-created root is en-US", async ({
  page,
}, info) => {
  let server = { layout: "", texts: [] as string[] };

  await fixture(page, "date-time-field", info, async () => {
    server = {
      layout: (await root(page, "seed").getAttribute("data-layout")) ?? "",
      texts: await texts(page, "seed"),
    };
  });

  expect(JSON.parse(server.layout).locale).toBe("el");
  expect(server.texts).toEqual(["27", "/", "10", "/", "2026", ", ", "01", ":", "45", " ", "μ.μ."]);
  await expect(root(page, "seed")).toHaveAttribute("data-layout", server.layout);
  await expect.poll(() => texts(page, "seed")).toEqual(server.texts);
  await expect(segment(page, "seed", "day")).toHaveAttribute("aria-label", "ημέρα");
  await expect(segment(page, "seed", "month")).toHaveAttribute("aria-valuetext", "Οκτωβρίου");
  await expect(segment(page, "seed", "hour")).toHaveAttribute("aria-label", "ώρα");
  await expect(segment(page, "seed", "dayPeriod")).toHaveAttribute("aria-valuetext", "μ.μ.");

  await moveFocus(segment(page, "seed", "day"));
  await page.keyboard.type("15");
  await expect.poll(() => focused(page)).toBe("month");
  await expect(page.getByTestId("seed-value")).toHaveText("2026-10-15T13:45");
  await moveFocus(segment(page, "seed", "dayPeriod"));
  await page.keyboard.type("π");
  await expect(segment(page, "seed", "dayPeriod")).toHaveText("π.μ.");
  await expect(page.getByTestId("seed-value")).toHaveText("2026-10-15T01:45");
  await expectClean(page, "seed");

  await page.getByTestId("show-late").click();
  await expect
    .poll(() => texts(page, "late"))
    .toEqual([
      "10",
      "/",
      "27",
      "/",
      "2026",
      expect.any(String),
      "01",
      ":",
      "45",
      expect.any(String),
      "PM",
    ]);
  await expect(segment(page, "late", "day")).toHaveAttribute("aria-label", "day");
  await expect(segment(page, "late", "dayPeriod")).toHaveAttribute("aria-label", "AM/PM");
});

test("DF48 seed falsifier: an en-US date-time rendered by Node (U+202F before the day period) keeps the server's literals after hydration in a browser whose Intl differs", async ({
  page,
  browserName,
}, info) => {
  let server: string[] = [];

  await fixture(page, "date-time-field", info, async () => {
    server = await literals(page, "direct");
  });

  // Node's ICU puts U+202F before "AM"; the hydrated root keeps it.
  expect(server).toEqual(["U+002F", "U+002F", "U+002C U+0020", "U+003A", "U+202F"]);
  await expect.poll(() => literals(page, "direct")).toEqual(server);

  // The browser's own Intl, which a browser-created twin uses.
  const own = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat("en-US", {
      calendar: "gregory",
      timeZone: "UTC",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).formatToParts(Date.UTC(2001, 10, 22, 13, 45));
    const index = parts.findIndex((part) => part.type === "dayPeriod");

    return parts[index - 1]?.value ?? "";
  });

  await page.getByTestId("show-twin").click();
  await expect
    .poll(() => texts(page, "late-twin"))
    .toEqual(["10", "/", "27", "/", "2026", expect.any(String), "09", ":", "30", own, "AM"]);
  console.log(`[DF48 ${browserName}] browser literal`, JSON.stringify(own), "server U+202F");

  // Chromium, Firefox and WebKit all put U+0020 there: the case is a falsifier in each.
  expect(own).toBe(" ");

  // Typing still works on the hydrated root.
  await moveFocus(segment(page, "direct", "dayPeriod"));
  await page.keyboard.type("p");
  await expect(page.getByTestId("direct-value")).toHaveText("2026-10-27T21:30");
  await expect.poll(() => literals(page, "direct")).toEqual(server);
});

test("DF49 accessibility tree of an en-US date-time field: an empty one, a filled one in a Field and its focused day period", async ({
  page,
  browserName,
}, info) => {
  await fixture(page, "date-time-field", info);

  await page
    .getByTestId("us-group")
    .evaluate((element) => element.setAttribute("aria-label", "Meeting"));

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
      if (node.role?.value !== "spinbutton" || !String(node.name?.value).startsWith("Starts at")) {
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

  console.log(`[DF49 ${browserName}]`, JSON.stringify(snapshots, null, 1));
  await info.attach(`accessibility-${browserName}`, {
    body: JSON.stringify(snapshots, null, 2),
    contentType: "application/json",
  });

  expect(empty).toContain('group "Meeting"');

  for (const name of ["month", "day", "year", "hour", "minute", "AM/PM"]) {
    expect(empty).toContain(`spinbutton "${name}"`);
    expect(filled).toContain(`spinbutton "Starts at ${name}"`);
  }

  expect(empty).not.toContain("- text");
  expect(filled).toContain('group "Starts at"');
  expect(focusedSegment).toContain('spinbutton "Starts at AM/PM"');
});
