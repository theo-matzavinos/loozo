import { test, expect } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import { bootstrapHeld, fixture } from "./observation.js";

// Date field (section 30, DF). DF1 is the segment engine in Node (date-field-checks.mjs).

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

/**
 * Focuses `target` from script, as a click or a key does: focus moves straight to it. Playwright's
 * own `focus()` blurs to nothing first, which leaves the Input group and so touches its field.
 */
async function moveFocus(target: Locator): Promise<void> {
  await target.evaluate((element: HTMLElement) => element.focus());
}

/** Focuses a segment afresh, as a user entering it does, so its next digit starts over. */
async function enter(page: Page, target: Locator): Promise<void> {
  await page.getByTestId("before-fields").focus();
  await target.focus();
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

/** A segment's attributes as the contract names them. */
async function segmentAttributes(page: Page, name: string): Promise<Record<string, unknown>[]> {
  return root(page, name)
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
          "aria-invalid",
          "aria-readonly",
          "aria-disabled",
          "inputmode",
          "enterkeyhint",
          "spellcheck",
          "autocorrect",
          "contenteditable",
          "tabindex",
          "data-placeholder",
        ]) {
          read[attribute] = element.getAttribute(attribute);
        }

        return read;
      }),
    );
}

/** The Field case's naming and values, as the server rendered them or as they are now. */
async function describeDirect(page: Page): Promise<Record<string, unknown>> {
  const group = page.getByTestId("direct-group");
  const layout = JSON.parse((await root(page, "direct").getAttribute("data-layout")) ?? "null");

  return {
    group: {
      role: await group.getAttribute("role"),
      labelledBy: await group.getAttribute("aria-labelledby"),
      describedBy: await group.getAttribute("aria-describedby"),
    },
    layout: layout?.parts.map((part: { type: string }) => part.type),
    segments: await segmentAttributes(page, "direct"),
  };
}

test("DF2 server HTML and hydration: the Input group joins the Field; each segment is a named spinbutton with its value", async ({
  page,
}, info) => {
  let server: Record<string, unknown> = {};

  await fixture(page, "date-field", info, async () => {
    server = await describeDirect(page);
  });

  const attached = await describeDirect(page);

  expect(attached).toEqual(server);
  expect(attached["group"]).toEqual({
    role: "group",
    labelledBy: "direct-label",
    describedBy: "direct-description",
  });
  expect(attached["layout"]).toEqual(["month", "literal", "day", "literal", "year"]);

  const shared = {
    role: "spinbutton",
    "aria-required": "true",
    "aria-invalid": null,
    "aria-readonly": null,
    "aria-disabled": null,
    inputmode: "numeric",
    enterkeyhint: "next",
    spellcheck: "false",
    autocorrect: "off",
    contenteditable: "true",
    tabindex: "0",
    "data-placeholder": null,
  };
  const segments = attached["segments"] as Record<string, unknown>[];
  const expected = [
    ["month", "10", "month", "10", "1", "12", "October"],
    ["day", "27", "day", "27", "1", "31", null],
    ["year", "2026", "year", "2026", "1", "9999", null],
  ];

  for (const [index, [unit, text, label, now, min, max, valueText]] of expected.entries()) {
    const read = segments[index]!;
    const id = read["id"];

    expect(typeof id).toBe("string");
    expect(read).toEqual({
      ...shared,
      "data-segment": unit,
      text,
      id,
      "aria-label": label,
      "aria-labelledby": `direct-label ${String(id)}`,
      "aria-valuenow": now,
      "aria-valuemin": min,
      "aria-valuemax": max,
      "aria-valuetext": valueText,
    });
  }

  expect(new Set(segments.map((read) => read["id"])).size).toBe(3);
  await expect(segment(page, "direct", "day")).toHaveAccessibleName("Date of birth day");
  await expect(page.getByTestId("direct-group")).toHaveAccessibleName("Date of birth");
  await expect(page.getByTestId("direct-group")).toHaveAccessibleDescription("Day, month and year");
});

test("DF3 typing: digits fill the unit and advance once no digit fits; a leading zero waits; re-entering replaces; any decimal digits", async ({
  page,
}, info) => {
  await fixture(page, "date-field", info);

  const value = page.getByTestId("typing-value");
  const parse = page.getByTestId("typing-parse");

  await expect.poll(() => texts(page, "typing")).toEqual(["––", "/", "––", "/", "––––"]);
  await expect(page.getByTestId("typing-state-segments")).toHaveText(
    "month=–– literal-0=/ day=–– literal-1=/ year=––––",
  );
  await expect(segment(page, "typing", "month")).toHaveAttribute("data-placeholder", "");
  await expect(segment(page, "typing", "month")).not.toHaveAttribute("aria-valuenow", /./);

  await segment(page, "typing", "month").focus();
  await page.keyboard.type("1");
  await expect(segment(page, "typing", "month")).toHaveText("01");
  await expect.poll(() => focused(page)).toBe("month");
  await expect(parse).toHaveText("dateIncomplete");
  await page.keyboard.type("0");
  await expect(segment(page, "typing", "month")).toHaveText("10");
  await expect.poll(() => focused(page)).toBe("day");
  await page.keyboard.type("4");
  await expect(segment(page, "typing", "day")).toHaveText("04");
  await expect.poll(() => focused(page)).toBe("year");
  await page.keyboard.type("202");
  await expect(segment(page, "typing", "year")).toHaveText("202");
  await expect(value).toHaveText("null");
  await expect(parse).toHaveText("dateIncomplete");
  await page.keyboard.type("6");
  await expect(value).toHaveText("2026-10-04");
  await expect(parse).toHaveText("");
  await expect(page.getByTestId("typing-writes")).toHaveText("1");
  await expect.poll(() => focused(page)).toBe("year");
  await expect(page.getByTestId("typing-state-segments")).toHaveText(
    "month=10 literal-0=/ day=04 literal-1=/ year=2026",
  );

  // Re-entering a filled unit replaces it on the first digit.
  await segment(page, "typing", "month").focus();
  await page.keyboard.type("3");
  await expect(value).toHaveText("2026-03-04");
  await expect.poll(() => focused(page)).toBe("day");

  // A leading zero waits for the next digit.
  await page.keyboard.type("0");
  await expect(segment(page, "typing", "day")).toHaveText("0");
  await expect(parse).toHaveText("dateIncomplete");
  await expect(value).toHaveText("2026-03-04");
  await expect.poll(() => focused(page)).toBe("day");
  await page.keyboard.type("7");
  await expect(value).toHaveText("2026-03-07");
  await expect.poll(() => focused(page)).toBe("year");

  // A digit past the maximum starts over with that digit.
  await segment(page, "typing", "month").focus();
  await page.keyboard.type("13");
  await expect(segment(page, "typing", "month")).toHaveText("03");
  await expect.poll(() => focused(page)).toBe("day");

  // The locale's own and full-width digits, inserted as text (Firefox composes them).
  await page.keyboard.insertText("٢");
  await expect(segment(page, "typing", "day")).toHaveText("02");
  await page.keyboard.insertText("５");
  await expect(segment(page, "typing", "day")).toHaveText("25");
  await expect(value).toHaveText("2026-03-25");

  // Other characters and Enter type nothing.
  await segment(page, "typing", "day").focus();
  await page.keyboard.type("x");
  await page.keyboard.press("Enter");
  await expect(segment(page, "typing", "day")).toHaveText("25");
  await expectClean(page, "typing");
  await expect(page.getByTestId("typing-writes")).toHaveText("7");
});

test("DF4 Up/Down step the unit and wrap without carry, keeping focus; an empty year starts at this year; Home/End", async ({
  page,
}, info) => {
  await fixture(page, "date-field", info);

  const value = page.getByTestId("typing-value");
  const year = segment(page, "typing", "year");
  const month = segment(page, "typing", "month");
  const day = segment(page, "typing", "day");
  const thisYear = await page.evaluate(() => String(new Date().getFullYear()));

  await year.focus();
  await page.keyboard.press("ArrowUp");
  await expect(year).toHaveText(thisYear);
  await expect.poll(() => focused(page)).toBe("year");
  await page.keyboard.press("Delete");
  await page.keyboard.press("ArrowDown");
  await expect(year).toHaveText(thisYear);
  await page.keyboard.type("2026");

  await month.focus();
  await page.keyboard.press("ArrowDown");
  await expect(month).toHaveText("12");
  await page.keyboard.press("ArrowUp");
  await expect(month).toHaveText("01");
  await expect(year).toHaveText("2026");
  await page.keyboard.press("ArrowUp");
  await expect(month).toHaveText("02");
  await expect.poll(() => focused(page)).toBe("month");

  await day.focus();
  await page.keyboard.press("ArrowDown");
  await expect(day).toHaveText("28");
  await expect(value).toHaveText("2026-02-28");
  await expect(day).toHaveAttribute("aria-valuemax", "28");
  await page.keyboard.press("ArrowUp");
  await expect(day).toHaveText("01");
  await expect(month).toHaveText("02");
  await expect(value).toHaveText("2026-02-01");
  await page.keyboard.press("End");
  await expect(day).toHaveText("28");
  await page.keyboard.press("Home");
  await expect(day).toHaveText("01");
  await expect.poll(() => focused(page)).toBe("day");

  await year.focus();
  await page.keyboard.press("End");
  await expect(value).toHaveText("9999-02-01");
  await page.keyboard.press("ArrowUp");
  await expect(value).toHaveText("0001-02-01");
  await page.keyboard.press("Home");
  await expect(year).toHaveText("0001");

  // Modified keys do nothing.
  await page.keyboard.press("Control+ArrowUp");
  await page.keyboard.press("Alt+ArrowUp");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(year).toHaveText("0002");
  await expect(month).toHaveAttribute("aria-valuetext", "February");
  await expectClean(page, "typing");
});

test("DF5 Left/Right move in visual order and stop at the ends, Tab visits every segment, Backspace and Delete erase; right to left flips the arrows", async ({
  page,
}, info) => {
  await fixture(page, "date-field", info);

  const value = page.getByTestId("typing-value");
  const parse = page.getByTestId("typing-parse");

  await segment(page, "typing", "month").focus();
  await page.keyboard.type("10272026");
  await expect(value).toHaveText("2026-10-27");
  await expect.poll(() => focused(page)).toBe("year");

  await page.keyboard.press("ArrowRight");
  await expect.poll(() => focused(page)).toBe("year");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => focused(page)).toBe("day");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => focused(page)).toBe("month");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => focused(page)).toBe("month");
  await page.keyboard.press("Tab");
  await expect.poll(() => focused(page)).toBe("day");
  await page.keyboard.press("Tab");
  await expect.poll(() => focused(page)).toBe("year");
  await page.keyboard.press("Tab");
  await expect.poll(() => focused(page)).toBe("typing-write-day");
  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => focused(page)).toBe("year");

  // Backspace removes the last digit; on an empty unit, focus moves back.
  await page.keyboard.press("Backspace");
  await expect(segment(page, "typing", "year")).toHaveText("202");
  await expect(value).toHaveText("2026-10-27");
  await expect(parse).toHaveText("dateIncomplete");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(segment(page, "typing", "year")).toHaveText("––––");
  await expect(segment(page, "typing", "year")).toHaveAttribute("data-placeholder", "");
  await page.keyboard.press("Backspace");
  await expect.poll(() => focused(page)).toBe("day");
  await page.keyboard.press("Backspace");
  await expect(segment(page, "typing", "day")).toHaveText("02");
  await page.keyboard.press("Backspace");
  await expect(segment(page, "typing", "day")).toHaveText("––");
  await page.keyboard.press("Backspace");
  await expect.poll(() => focused(page)).toBe("month");
  await expect(value).toHaveText("2026-10-27");

  // Delete empties the unit; with every unit empty the value is null.
  await page.keyboard.press("Delete");
  await expect(segment(page, "typing", "month")).toHaveText("––");
  await expect(value).toHaveText("null");
  await expect(parse).toHaveText("");
  await expectClean(page, "typing");

  // Right to left: the DOM order is day, month, year; ArrowLeft is the next one.
  await expect.poll(() => order(page, "rtl")).toEqual(["day", "month", "year"]);
  await expect.poll(() => texts(page, "rtl")).toEqual(["٢٧", "‏/", "١٠", "‏/", "٢٠٢٦"]);
  await expect(segment(page, "rtl", "day")).toHaveAttribute("aria-label", "يوم");
  await expect(segment(page, "rtl", "month")).toHaveAttribute("aria-valuenow", "10");
  await segment(page, "rtl", "day").focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => focused(page)).toBe("month");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => focused(page)).toBe("year");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => focused(page)).toBe("year");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => focused(page)).toBe("month");
  await page.keyboard.press("ArrowUp");
  await expect(segment(page, "rtl", "month")).toHaveText("١١");
});

/** Dispatches a paste of `text` on the focused element, as the clipboard would. */
async function paste(page: Page, text: string): Promise<boolean> {
  return page.evaluate((data) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });

    Object.defineProperty(event, "clipboardData", {
      value: { getData: (type: string) => (type === "text/plain" ? data : "") },
    });
    document.activeElement!.dispatchEvent(event);

    return event.defaultPrevented;
  }, text);
}

test("DF6 paste: a whole value replaces every unit, digits fill the focused unit, anything else is ignored", async ({
  page,
}, info) => {
  await fixture(page, "date-field", info);

  const value = page.getByTestId("typing-value");

  await segment(page, "typing", "day").focus();
  expect(await paste(page, "2026-10-27")).toBe(true);
  await expect(value).toHaveText("2026-10-27");
  await expect.poll(() => texts(page, "typing")).toEqual(["10", "/", "27", "/", "2026"]);
  await expect.poll(() => focused(page)).toBe("day");

  await segment(page, "typing", "month").focus();
  await paste(page, " 2001-02-03 ");
  await expect(value).toHaveText("2001-02-03");

  await segment(page, "typing", "day").focus();
  await paste(page, "15");
  await expect(value).toHaveText("2001-02-15");
  await expect.poll(() => focused(page)).toBe("day");

  for (const ignored of ["27/10/2026", "abc", "2026-02-31", "1 5"]) {
    expect(await paste(page, ignored)).toBe(true);
  }

  await expect(value).toHaveText("2001-02-15");
  await expect.poll(() => texts(page, "typing")).toEqual(["02", "/", "15", "/", "2001"]);
  await expectClean(page, "typing");
});

/** Records the editing events every segment receives, in order. */
async function recordEvents(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: string[] = [];

    Reflect.set(window, "segmentEvents", log);

    for (const type of [
      "keydown",
      "beforeinput",
      "input",
      "compositionstart",
      "compositionupdate",
      "compositionend",
    ]) {
      document.addEventListener(
        type,
        (event) => {
          const target = event.target;

          if (!(target instanceof Element) || !target.hasAttribute("data-segment")) {
            return;
          }

          let detail = "";

          if (event instanceof InputEvent) {
            detail = `${event.inputType}:${JSON.stringify(event.data)}:${event.cancelable}`;
          } else if (event instanceof CompositionEvent) {
            detail = JSON.stringify(event.data);
          } else if (event instanceof KeyboardEvent) {
            detail = event.key;
          }

          log.push(`${type} ${detail} [${target.textContent}]`);
        },
        true,
      );
    }
  });
}

async function events(page: Page): Promise<string[]> {
  return page.evaluate(() => Reflect.get(window, "segmentEvents") as string[]);
}

test("DF7 composition and beforeinput: keys, insertText, synthetic beforeinput and a composition's text are typed once and never corrupt a segment", async ({
  page,
  browserName,
}, info) => {
  await recordEvents(page);
  await fixture(page, "date-field", info);

  const day = segment(page, "plain", "day");

  await enter(page, day);
  await page.keyboard.type("05");
  await expect(day).toHaveText("05");
  await enter(page, day);
  await page.keyboard.insertText("1");
  await expect(day).toHaveText("01");
  await page.keyboard.type("x");
  await expect(day).toHaveText("01");
  await day.evaluate((element) => {
    element.dispatchEvent(
      new InputEvent("beforeinput", {
        inputType: "insertText",
        data: "2",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(day).toHaveText("12");
  await enter(page, day);
  await page.keyboard.press("Backspace");
  await expect(day).toHaveText("01");
  await expect(page.getByTestId("plain-value")).toHaveText("2026-10-01");

  // A composition's text arrives as an uncancellable composing beforeinput (Chromium, Gecko) or
  // insertFromComposition (WebKit) and again at compositionend: it is typed once. Gecko ends a
  // composition twice when the advance moves focus inside the first compositionend (DF3).
  for (const inputType of ["insertText", "insertCompositionText", "insertFromComposition"]) {
    await enter(page, day);
    await day.evaluate((element, type) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { data: "", bubbles: true }));
      element.dispatchEvent(
        new InputEvent("beforeinput", {
          inputType: type,
          data: "1",
          isComposing: true,
          bubbles: true,
          cancelable: type !== "insertCompositionText",
        }),
      );
      element.dispatchEvent(new CompositionEvent("compositionend", { data: "1", bubbles: true }));
      element.dispatchEvent(new CompositionEvent("compositionend", { data: "1", bubbles: true }));
    }, inputType);
    await expect(day, inputType).toHaveText("01");
  }

  await expectClean(page, "plain");

  if (browserName === "chromium") {
    // Real IME composition through CDP; Firefox's and WebKit's automation have no IME API
    // (Firefox's insertText composes: DF3).
    const cdp = await page.context().newCDPSession(page);
    const results: Record<string, unknown> = {};

    await enter(page, day);
    await cdp.send("Input.imeSetComposition", { text: "0", selectionStart: 1, selectionEnd: 1 });
    results["mid-composition"] = await day.evaluate((element) => element.innerHTML);
    await cdp.send("Input.imeSetComposition", { text: "08", selectionStart: 2, selectionEnd: 2 });
    await cdp.send("Input.insertText", { text: "08" });
    await expect(day).toHaveText("08");
    await expectClean(page, "plain");

    // Letters composed and committed: nothing typed, nothing left.
    await enter(page, day);
    await cdp.send("Input.imeSetComposition", { text: "あ", selectionStart: 1, selectionEnd: 1 });
    await cdp.send("Input.imeSetComposition", { text: "あい", selectionStart: 2, selectionEnd: 2 });
    await cdp.send("Input.insertText", { text: "愛" });
    await expect(day).toHaveText("08");
    await expectClean(page, "plain");

    // A composition cancelled with an empty commit.
    await cdp.send("Input.imeSetComposition", { text: "5", selectionStart: 1, selectionEnd: 1 });
    await cdp.send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });
    await expect(day).toHaveText("08");
    await expectClean(page, "plain");

    // Full-width digits through the IME (a Japanese numeric composition).
    await enter(page, day);
    await cdp.send("Input.imeSetComposition", { text: "１", selectionStart: 1, selectionEnd: 1 });
    await cdp.send("Input.insertText", { text: "１" });
    await expect(day).toHaveText("01");
    await expectClean(page, "plain");

    await enter(page, day);
    await page.keyboard.type("09");
    await expect(day).toHaveText("09");
    await expect(page.getByTestId("plain-value")).toHaveText("2026-10-09");
    results["events"] = await events(page);
    console.log("[DF7 composition chromium]", JSON.stringify(results));
  }

  await expectClean(page, "plain");
  console.log(`[DF7 events ${browserName}]`, JSON.stringify(await events(page)));
});

for (const name of ["direct", "composed", "linked"]) {
  test(`DF8 ${name}: an incomplete or impossible draft keeps the value and reaches the form; a real date commits; reset discards the draft, also to the same value`, async ({
    page,
  }, info) => {
    await fixture(page, "date-field", info);

    const value = page.getByTestId(`${name}-value`);
    const errors = page.getByTestId(`${name}-errors`);
    const parse = page.getByTestId(`${name}-parse`);

    await expect(value).toHaveText("2026-10-27");
    await expect(errors).toHaveText("");
    await expect.poll(() => texts(page, name)).toEqual(["10", "/", "27", "/", "2026"]);

    // Clear the day: year and month stay, the value stays, the form carries dateIncomplete.
    await segment(page, name, "day").focus();
    await page.keyboard.press("Delete");
    await expect(segment(page, name, "day")).toHaveText("––");
    await expect(value).toHaveText("2026-10-27");
    await expect(errors).toHaveText("dateIncomplete");
    await expect(parse).toHaveText("dateIncomplete");
    await expect.poll(() => texts(page, name)).toEqual(["10", "/", "––", "/", "2026"]);

    // 31 commits 2026-10-31; month 02 makes 02/31: dateInvalid, shown as typed, the value stays.
    await page.keyboard.type("31");
    await expect(value).toHaveText("2026-10-31");
    await expect(errors).toHaveText("");
    await segment(page, name, "month").focus();
    await page.keyboard.type("02");
    await expect.poll(() => texts(page, name)).toEqual(["02", "/", "31", "/", "2026"]);
    await expect(errors).toHaveText("dateInvalid");
    await expect(parse).toHaveText("dateInvalid");
    await expect(value).toHaveText("2026-10-31");

    // reset() to the value already committed discards the draft and clears the error.
    await page.getByTestId(`${name}-reset-same`).click();
    await expect(errors).toHaveText("");
    await expect(parse).toHaveText("");
    await expect.poll(() => texts(page, name)).toEqual(["10", "/", "31", "/", "2026"]);
    await expect(value).toHaveText("2026-10-31");

    // A draft again, then reset() to another value.
    await segment(page, name, "year").focus();
    await page.keyboard.press("Delete");
    await expect(errors).toHaveText("dateIncomplete");
    await page.getByTestId(`${name}-reset-other`).click();
    await expect(value).toHaveText("2001-02-03");
    await expect(errors).toHaveText("");
    await expect(parse).toHaveText("");
    await expect.poll(() => texts(page, name)).toEqual(["02", "/", "03", "/", "2001"]);

    // 02/31/2001 is invalid; month 03 then commits 2001-03-31.
    await segment(page, name, "day").focus();
    await page.keyboard.type("31");
    await expect(errors).toHaveText("dateInvalid");
    await segment(page, name, "month").focus();
    await page.keyboard.type("03");
    await expect(value).toHaveText("2001-03-31");
    await expect(errors).toHaveText("");

    // A reset ends the typing in the segment that keeps focus: the next digits start the year
    // over, never continuing the discarded ones. A script click leaves focus where it is.
    const year = segment(page, name, "year");

    await year.focus();
    await page.keyboard.type("20");
    await expect(year).toHaveText("20");
    await page.getByTestId(`${name}-reset-same`).evaluate((button: HTMLElement) => button.click());
    await expect(year).toHaveText("2001");
    await expect(errors).toHaveText("");
    await page.keyboard.type("27");
    await expect(year).toHaveText("27");
    await expect(errors).toHaveText("dateIncomplete");
    await expect(value).toHaveText("2001-03-31");
    await page.getByTestId(`${name}-reset-other`).evaluate((button: HTMLElement) => button.click());
    await expect(year).toHaveText("2001");
    await expect(value).toHaveText("2001-02-03");
    await page.keyboard.type("27");
    await expect(year).toHaveText("27");
    await expect(errors).toHaveText("dateIncomplete");
    await expect(value).toHaveText("2001-02-03");
    await expect.poll(() => focused(page)).toBe("year");
    await expectClean(page, name);

    if (name === "composed") {
      // Signal Forms bound the composer's model, never the composed root's own one.
      await expect(page.getByTestId("composed-own-value")).toHaveText("null");
    }
  });
}

test("DF9 without Signal Forms: state.parseErrors carries the same errors, for the directive's model and replaced plain signal() Options", async ({
  page,
}, info) => {
  await fixture(page, "date-field", info);

  for (const name of ["plain", "signal"]) {
    const value = page.getByTestId(`${name}-value`);
    const parse = page.getByTestId(`${name}-parse`);

    await expect(value).toHaveText("2026-10-27");
    await segment(page, name, "day").focus();
    await page.keyboard.press("Delete");
    await expect(parse).toHaveText("dateIncomplete");
    await expect(value).toHaveText("2026-10-27");
    await page.keyboard.type("1");
    await expect(value).toHaveText("2026-10-01");
    await expect(parse).toHaveText("");
    await segment(page, name, "month").focus();
    await page.keyboard.type("02");
    await expect(value).toHaveText("2026-02-01");
    await segment(page, name, "day").focus();
    await page.keyboard.press("Delete");
    await page.keyboard.type("30");
    await expect(parse).toHaveText("dateInvalid");
    await expect(value).toHaveText("2026-02-03");
    await expectClean(page, name);
  }
});

test("DF10 Signal Forms: touch only on leaving the Input group, errors shown with aria-invalid, required and dateIncomplete together, focusBoundControl(), submit(), a model write, readonly and disabled", async ({
  page,
}, info) => {
  await fixture(page, "date-field", info);

  const touched = page.getByTestId("direct-touched");
  const errors = page.getByTestId("direct-errors");
  const group = page.getByTestId("direct-group");

  // A composer is the bound control: focusBoundControl() reaches its first segment through its
  // own focus(), and leaving its group touches its field.
  await expect(page.getByTestId("composed-touched")).toHaveText("false");
  await page.getByTestId("composed-focus").click();
  await expect.poll(() => focused(page)).toBe("month");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("composed-touched")).toHaveText("false");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("composed-touched")).toHaveText("true");

  // focusBoundControl() focuses the first segment; moving between segments doesn't touch.
  await page.getByTestId("direct-focus").click();
  await expect.poll(() => focused(page)).toBe("month");
  await expect(touched).toHaveText("false");
  await page.keyboard.press("Tab");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => focused(page)).toBe("month");
  await expect(touched).toHaveText("false");

  // submit() touches without focus leaving.
  await moveFocus(segment(page, "direct", "day"));
  await page.keyboard.press("Delete");
  await expect(errors).toHaveText("dateIncomplete");
  await expect(page.getByTestId("direct-error")).toHaveCount(0);
  await page.getByTestId("direct-submit").evaluate((button: HTMLElement) => button.click());
  await expect(touched).toHaveText("true");
  await expect.poll(() => focused(page)).toBe("day");
  await expect(page.getByTestId("direct-error")).toHaveText("dateIncomplete");
  await expect(group).toHaveAttribute("aria-describedby", "direct-description direct-error");

  for (const unit of ["month", "day", "year"]) {
    await expect(segment(page, "direct", unit)).toHaveAttribute("aria-invalid", "true");
  }

  // Every unit empty commits null: required; one unit typed again: incomplete and required.
  await moveFocus(segment(page, "direct", "month"));
  await page.keyboard.press("Delete");
  await moveFocus(segment(page, "direct", "year"));
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("direct-value")).toHaveText("");
  await expect(errors).toHaveText("required");
  await moveFocus(segment(page, "direct", "month"));
  await page.keyboard.type("1");
  await expect(errors).toHaveText("dateIncomplete,required");

  // A model write replaces the draft.
  await page.getByTestId("direct-write").click();
  await expect.poll(() => texts(page, "direct")).toEqual(["12", "/", "25", "/", "2026"]);
  await expect(errors).toHaveText("");
  await expect(segment(page, "direct", "day")).not.toHaveAttribute("aria-invalid", /./);

  // Readonly from the form: segments focus and move, never edit.
  await page.getByTestId("direct-freeze").click();
  await expect(segment(page, "direct", "month")).toHaveAttribute("aria-readonly", "true");
  await expect(segment(page, "direct", "month")).not.toHaveAttribute("contenteditable", /./);
  await expect(segment(page, "direct", "month")).toHaveAttribute("tabindex", "0");
  await moveFocus(segment(page, "direct", "month"));
  await page.keyboard.press("ArrowUp");
  await page.keyboard.type("5");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("End");
  await expect.poll(() => focused(page)).toBe("month");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => focused(page)).toBe("day");
  await expect.poll(() => texts(page, "direct")).toEqual(["12", "/", "25", "/", "2026"]);
  await page.getByTestId("direct-freeze").click();
  await expect(segment(page, "direct", "month")).not.toHaveAttribute("aria-readonly", /./);

  // Disabled from the form: out of the tab order and not focusable.
  await page.getByTestId("direct-lock").click();

  for (const unit of ["month", "day", "year"]) {
    const element = segment(page, "direct", unit);

    await expect(element).toHaveAttribute("aria-disabled", "true");
    await expect(element).not.toHaveAttribute("tabindex", /./);
    await expect(element).not.toHaveAttribute("contenteditable", /./);
  }

  await page.getByTestId("direct-focus").click();
  await moveFocus(segment(page, "direct", "day"));
  await expect.poll(() => focused(page)).toBe("direct-focus");
  await page.getByTestId("direct-lock").click();
  await expect(segment(page, "direct", "day")).toHaveAttribute("tabindex", "0");
});

test("DF11 accessibility tree: an empty field, a filled field in a Field and a focused segment", async ({
  page,
  browserName,
}, info) => {
  await fixture(page, "date-field", info);

  const empty = await root(page, "typing").ariaSnapshot();
  const filled = await page.getByTestId("direct-group").ariaSnapshot();

  await segment(page, "direct", "day").focus();

  const focusedSegment = await segment(page, "direct", "day").ariaSnapshot();
  const snapshots: Record<string, unknown> = { empty, filled, focused: focusedSegment };

  if (browserName === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const spinbuttons: unknown[] = [];

    for (const node of nodes) {
      if (node.role?.value !== "spinbutton") {
        continue;
      }

      const properties: Record<string, unknown> = {};

      for (const property of node.properties ?? []) {
        properties[property.name] = property.value.value;
      }

      spinbuttons.push({
        name: node.name?.value,
        value: node.value?.value,
        description: node.description?.value,
        properties,
      });
    }

    snapshots["chromium-spinbuttons"] = spinbuttons;
  }

  console.log(`[DF11 ${browserName}]`, JSON.stringify(snapshots, null, 1));
  await info.attach(`accessibility-${browserName}`, {
    body: JSON.stringify(snapshots, null, 2),
    contentType: "application/json",
  });

  expect(empty).toContain('group "Appointment"');
  expect(empty).toContain('spinbutton "month"');
  expect(empty).toContain('spinbutton "day"');
  expect(empty).toContain('spinbutton "year"');
  expect(empty).not.toContain("/");
  expect(filled).toContain('group "Date of birth"');
  expect(filled).toContain('spinbutton "Date of birth month"');
  expect(filled).toContain('spinbutton "Date of birth day"');
  expect(filled).toContain('spinbutton "Date of birth year"');
  expect(focusedSegment).toContain('spinbutton "Date of birth day"');
});

test("DF12 seed: rendered with el on the server, a root keeps day/month/year after hydration in an en-US browser and typing works; a browser-created root is en-US", async ({
  page,
}, info) => {
  let server = { layout: "", order: [] as string[] };

  await fixture(page, "date-field", info, async () => {
    server = {
      layout: (await root(page, "seed").getAttribute("data-layout")) ?? "",
      order: await order(page, "seed"),
    };
  });

  expect(server.order).toEqual(["day", "month", "year"]);
  expect(JSON.parse(server.layout).locale).toBe("el");
  await expect(root(page, "seed")).toHaveAttribute("data-layout", server.layout);
  await expect.poll(() => order(page, "seed")).toEqual(["day", "month", "year"]);
  await expect.poll(() => texts(page, "seed")).toEqual(["27", "/", "10", "/", "2026"]);
  await expect(segment(page, "seed", "day")).toHaveAttribute("aria-label", "ημέρα");
  await expect(segment(page, "seed", "month")).toHaveAttribute("aria-valuetext", "Οκτωβρίου");

  await segment(page, "seed", "day").focus();
  await page.keyboard.type("15");
  await expect(segment(page, "seed", "day")).toHaveText("15");
  await expect.poll(() => focused(page)).toBe("month");
  await expectClean(page, "seed");

  await page.getByTestId("show-late").click();
  await expect.poll(() => order(page, "late")).toEqual(["month", "day", "year"]);
  await expect(segment(page, "late", "day")).toHaveAttribute("aria-label", "day");
  await expect(segment(page, "late", "month")).toHaveAttribute("aria-valuetext", "October");
});

test("DF13 replay: the first digit typed into a server-rendered segment, before its block hydrates, lands in the segment", async ({
  page,
}, info) => {
  const release = await bootstrapHeld(page, "/date-field", info);

  release();
  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");

  const day = segment(page, "plain", "day");

  // Focus isn't a hydration trigger; the digit's keydown is.
  await day.evaluate((element: HTMLElement) => element.focus());
  await page.keyboard.type("4");
  await expect(page.getByTestId("plain-value")).toHaveText("2026-10-04");
  await expect(day).toHaveText("04");
  await expectClean(page, "plain");
  await expect.poll(() => focused(page)).toBe("year");
});

test("DF14 external writes replace the draft; a non-canonical value shows empty segments and is kept; a locale change re-lays out and keeps the draft by unit", async ({
  page,
}, info) => {
  await fixture(page, "date-field", info);

  const value = page.getByTestId("typing-value");
  const parse = page.getByTestId("typing-parse");

  await segment(page, "typing", "month").focus();
  await page.keyboard.type("1");
  await expect(parse).toHaveText("dateIncomplete");
  await page.getByTestId("typing-write-day").click();
  await expect.poll(() => texts(page, "typing")).toEqual(["12", "/", "25", "/", "2026"]);
  await expect(parse).toHaveText("");

  // Writing the value already committed changes nothing, so the draft stays.
  await segment(page, "typing", "day").focus();
  await page.keyboard.press("Delete");
  await page.getByTestId("typing-write-day").click();
  await expect(parse).toHaveText("dateIncomplete");
  await expect.poll(() => texts(page, "typing")).toEqual(["12", "/", "––", "/", "2026"]);

  await page.getByTestId("typing-write-text").click();
  await expect(value).toHaveText("27/10/2026");
  await expect.poll(() => texts(page, "typing")).toEqual(["––", "/", "––", "/", "––––"]);
  await expect(parse).toHaveText("");
  await segment(page, "typing", "month").focus();
  await page.keyboard.type("1");
  await expect(value).toHaveText("27/10/2026");
  await expect(parse).toHaveText("dateIncomplete");

  await page.getByTestId("typing-locale").click();
  await expect.poll(() => order(page, "typing")).toEqual(["day", "month", "year"]);
  await expect.poll(() => texts(page, "typing")).toEqual(["––", "/", "01", "/", "––––"]);
  await expect(segment(page, "typing", "month")).toHaveAttribute("aria-label", "μήνας");
  await expect(root(page, "typing")).toHaveAttribute("data-layout", /"locale":"el"/);
  await segment(page, "typing", "day").focus();
  await page.keyboard.type("5");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("2026");
  await expect(value).toHaveText("2026-01-05");
  await expect(page.getByTestId("typing-writes")).toHaveText("1");

  // An external write ends the typing in the segment that keeps focus: the next digits start
  // the year over. A script click leaves focus where it is.
  await page.keyboard.press("Delete");
  await page.keyboard.type("20");
  await expect(segment(page, "typing", "year")).toHaveText("20");
  await page.getByTestId("typing-write-day").evaluate((button: HTMLElement) => button.click());
  await expect(segment(page, "typing", "year")).toHaveText("2026");
  await expect(value).toHaveText("2026-12-25");
  await page.keyboard.type("27");
  await expect(segment(page, "typing", "year")).toHaveText("27");
  await expect(value).toHaveText("2026-12-25");
  await expect(parse).toHaveText("dateIncomplete");
  await expect.poll(() => focused(page)).toBe("year");
});

test("DF15 focus() before any segment is mounted focuses the first one once it renders", async ({
  page,
}, info) => {
  await fixture(page, "date-field", info);

  await page.getByTestId("later-focus").click();
  await expect.poll(() => focused(page)).toBe("month");
  expect(
    await root(page, "later").evaluate((element) =>
      element.contains(element.ownerDocument.activeElement),
    ),
  ).toBe(true);
});

test("DF17 tampered seed: a seed this runtime couldn't have laid out reads as none, and the hydrating root lays out locally without an error", async ({
  page,
}, info) => {
  await fixture(page, "date-field", info, async () => {
    await root(page, "seed").evaluate((element) => {
      const seed = JSON.parse(element.getAttribute("data-layout") ?? "null");

      element.setAttribute("data-layout", JSON.stringify({ ...seed, locale: "not_a_locale" }));
    });
  });

  await expect(root(page, "seed")).toHaveAttribute("data-layout", /"locale":"en-US"/);
  await expect.poll(() => order(page, "seed")).toEqual(["month", "day", "year"]);
  await expect.poll(() => texts(page, "seed")).toEqual(["10", "/", "27", "/", "2026"]);
  await expect(segment(page, "seed", "day")).toHaveAttribute("aria-label", "day");
  await expect(segment(page, "seed", "month")).toHaveAttribute("aria-valuetext", "October");

  await segment(page, "seed", "day").focus();
  await page.keyboard.type("15");
  await expect(segment(page, "seed", "day")).toHaveText("15");
  await expect.poll(() => focused(page)).toBe("year");
  await expectClean(page, "seed");
});

test("DF18 seed with non-consecutive digits: rendered with zh-u-nu-hanidec on the server, a root keeps year/month/day and Han digits after hydration in an en-US browser, and ASCII digits type into it", async ({
  page,
}, info) => {
  let server = { layout: "", texts: [] as string[] };

  await fixture(page, "date-field", info, async () => {
    server = {
      layout: (await root(page, "hanidec").getAttribute("data-layout")) ?? "",
      texts: await texts(page, "hanidec"),
    };
  });

  expect(server.texts).toEqual(["二〇二六", "/", "一〇", "/", "二七"]);
  expect(JSON.parse(server.layout)).toMatchObject({
    locale: "zh-u-nu-hanidec",
    digits: "〇一二三四五六七八九",
  });
  await expect(root(page, "hanidec")).toHaveAttribute("data-layout", server.layout);
  await expect.poll(() => order(page, "hanidec")).toEqual(["year", "month", "day"]);
  await expect.poll(() => texts(page, "hanidec")).toEqual(server.texts);
  await expect(segment(page, "hanidec", "day")).toHaveAttribute("aria-label", "日");
  await expect(segment(page, "hanidec", "month")).toHaveAttribute("aria-valuetext", "十月");
  await expect(segment(page, "hanidec", "month")).toHaveAttribute("aria-valuenow", "10");

  await segment(page, "hanidec", "month").focus();
  await page.keyboard.type("3");
  await expect(segment(page, "hanidec", "month")).toHaveText("〇三");
  await expect.poll(() => focused(page)).toBe("day");
  await page.keyboard.type("15");
  await expect(segment(page, "hanidec", "day")).toHaveText("一五");
  await expect(segment(page, "hanidec", "month")).toHaveAttribute("aria-valuetext", "三月");
  await expectClean(page, "hanidec");
});
