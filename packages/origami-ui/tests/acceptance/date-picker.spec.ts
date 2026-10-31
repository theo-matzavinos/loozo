import { test, expect } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import { fixture } from "./observation.js";
import { expectPreferred } from "./geometry.js";

// Date picker (section 27, DP), against the `date-picker` fixture. Every Calendar shows
// 27 October 2026 as today.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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

/** Whether picker `name`'s Content is natively shown. */
async function shown(page: Page, name: string): Promise<boolean> {
  return page
    .getByTestId(`${name}-content`)
    .evaluate((content) => content.matches(":popover-open"));
}

/** Records every `focusout` reaching picker `name`'s root host. */
async function recordFocusOut(page: Page, name: string): Promise<void> {
  await page.getByTestId(`${name}-root`).evaluate((root, name) => {
    const log: unknown[] = [];

    (window as unknown as Record<string, unknown>)[`${name}FocusOut`] = log;
    root.addEventListener("focusout", (event) => {
      const related = (event as FocusEvent).relatedTarget;

      log.push({
        related:
          related instanceof Element
            ? (related.getAttribute("data-testid") ?? related.tagName)
            : null,
        inside: related instanceof Node && root.contains(related),
      });
    });
  }, name);
}

async function focusOutLog(page: Page, name: string): Promise<unknown[]> {
  return page.evaluate((name) => {
    const log = (window as unknown as Record<string, unknown[]>)[`${name}FocusOut`];

    return log.splice(0);
  }, name);
}

/** The `relatedTarget` of the last `focusout` picker `name`'s root host received, and clears the log. */
async function lastFocusOut(page: Page, name: string): Promise<string> {
  const log = (await focusOutLog(page, name)) as { related: string | null }[];

  return String(log.at(-1)?.related);
}

/** Records the Trigger's text whenever it takes focus, read synchronously in the focus event. */
async function recordTriggerFocus(page: Page, name: string): Promise<void> {
  await page.getByTestId(`${name}-trigger`).evaluate((trigger, name) => {
    const log: string[] = [];

    (window as unknown as Record<string, unknown>)[`${name}TriggerFocus`] = log;
    trigger.addEventListener("focus", () => {
      log.push(trigger.textContent!.trim());
    });
  }, name);
}

async function triggerFocusLog(page: Page, name: string): Promise<string[]> {
  return page.evaluate((name) => {
    const log = (window as unknown as Record<string, string[]>)[`${name}TriggerFocus`];

    return log.splice(0);
  }, name);
}

/** The closed picker's naming and popup attributes, as the server rendered them or as they are now. */
async function describeClosed(page: Page): Promise<Record<string, unknown>> {
  const read: Record<string, unknown> = {};

  for (const name of ["a", "b"]) {
    const trigger = page.getByTestId(`${name}-trigger`);
    const content = page.getByTestId(`${name}-content`);
    const attributes: Record<string, string | null> = {};

    for (const attribute of [
      "id",
      "type",
      "aria-haspopup",
      "aria-expanded",
      "aria-controls",
      "aria-labelledby",
      "aria-required",
    ]) {
      attributes[`trigger ${attribute}`] = await trigger.getAttribute(attribute);
    }

    for (const attribute of [
      "id",
      "role",
      "tabindex",
      "popover",
      "aria-labelledby",
      "aria-label",
      "aria-modal",
      "inert",
    ]) {
      attributes[`content ${attribute}`] = await content.getAttribute(attribute);
    }

    attributes["grid aria-labelledby"] = await page
      .getByTestId(`${name}-grid`)
      .getAttribute("aria-labelledby");
    attributes["trigger text"] = (await trigger.textContent())?.trim() ?? null;
    attributes["layout"] = await page.getByTestId(`${name}-root`).getAttribute("data-layout");
    read[name] = attributes;
  }

  return read;
}

test("DP1 server HTML and hydration of a closed picker: Trigger, dialog Content and Field naming; Content authored before the Trigger leaves the Field to it", async ({
  page,
}, info) => {
  let server: Record<string, unknown> = {};

  await fixture(page, "date-picker", info, async () => {
    server = await describeClosed(page);
  });

  const attached = await describeClosed(page);

  expect(attached).toEqual(server);

  for (const [name, text] of [
    ["a", "Choose a date"],
    ["b", "2026-10-15"],
  ] as const) {
    const read = attached[name] as Record<string, string | null>;
    const triggerId = read["trigger id"];
    const contentId = read["content id"];

    expect(triggerId).toMatch(/\S/);
    expect(contentId).toMatch(/\S/);
    expect(read).toMatchObject({
      "trigger type": "button",
      "trigger aria-haspopup": "dialog",
      "trigger aria-expanded": "false",
      "trigger aria-controls": contentId,
      "trigger aria-labelledby": `${name}-label ${triggerId}`,
      "content role": "dialog",
      "content tabindex": "-1",
      "content popover": "manual",
      "content aria-labelledby": `${name}-label`,
      "content aria-label": null,
      "content aria-modal": null,
      "content inert": "",
      "trigger text": text,
    });
    // The bridged Grid never joins the Field: its name is the Heading's alone.
    expect(read["grid aria-labelledby"]?.split(" ")).not.toContain(`${name}-label`);
    // The composed date field's layout seed, also in the button shape.
    expect(JSON.parse(read["layout"] ?? "null")).toEqual(expect.anything());
  }

  expect((attached["a"] as Record<string, unknown>)["trigger aria-required"]).toBe("true");
  await expect(page.getByTestId("a-trigger")).toHaveAccessibleName("Valid from Choose a date");
  await expect(page.getByTestId("b-trigger")).toHaveAccessibleName("Valid until 2026-10-15");
  await expect(page.getByTestId("a-segments")).toHaveText("5");
  expect(await shown(page, "a")).toBe(false);
});

test("DP2 opening by click, Enter and Space focuses the grid's tab stop once Content is shown: today, else the selected day; a gated Calendar too; Escape returns to the Trigger; nothing touches", async ({
  page,
}, info) => {
  await fixture(page, "date-picker", info);
  await recordFocusOut(page, "a");

  await page.getByTestId("a-trigger").click();
  await expect(page.getByTestId("a-open")).toHaveText("true");
  await expect(cell(page, "a", "2026-10-27")).toBeFocused();
  await expect(page.getByTestId("a-trigger")).toHaveAttribute("aria-expanded", "true");
  expect(await shown(page, "a")).toBe(true);
  await expect(page.getByTestId("a-content")).not.toHaveAttribute("inert", /.*/);
  await expect(page.getByTestId("a-content")).toHaveAccessibleName("Valid from");
  expect(await focusOutLog(page, "a")).toEqual([{ related: "TD", inside: true }]);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("a-open")).toHaveText("false");
  await expect(page.getByTestId("a-trigger")).toBeFocused();
  expect(await focusOutLog(page, "a")).toEqual([{ related: "a-trigger", inside: true }]);

  for (const key of ["Enter", " "]) {
    await page.keyboard.press(key);
    await expect(page.getByTestId("a-open")).toHaveText("true");
    await expect(cell(page, "a", "2026-10-27")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("a-trigger")).toBeFocused();
    await expect(page.getByTestId("a-open")).toHaveText("false");
  }

  await expect(page.getByTestId("a-touches")).toHaveText("0");
  await expect(page.getByTestId("a-touched")).toHaveText("false");

  await page.getByTestId("b-trigger").click();
  await expect(cell(page, "b", "2026-10-15")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("b-trigger")).toBeFocused();
  await expect(page.getByTestId("b-touches")).toHaveText("0");

  // The Calendar mounts only once the picker opens; the focus request waits for it.
  await expect(page.getByTestId("c-grid")).toHaveCount(0);
  await page.getByTestId("c-trigger").click();
  await expect(cell(page, "c", "2026-10-27")).toBeFocused();
  await expect(page.getByTestId("c-content")).toHaveAccessibleName("Choose a date");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("c-open")).toHaveText("false");
  await expect(page.getByTestId("c-trigger")).toBeFocused();
});

test("DP3 a choice closes and returns focus to the Trigger after its new text renders, in the root's view, an @if and a child component; the selected day closes too without a write", async ({
  page,
}, info) => {
  await fixture(page, "date-picker", info);

  for (const name of ["a", "b", "c"]) {
    await recordTriggerFocus(page, name);
  }

  await recordFocusOut(page, "a");

  // Text interpolated in the root's own view; by click, then by Enter.
  await page.getByTestId("a-trigger").click();
  await expect(cell(page, "a", "2026-10-27")).toBeFocused();
  await triggerFocusLog(page, "a");
  await focusOutLog(page, "a");
  await cell(page, "a", "2026-10-20").click();
  await expect(page.getByTestId("a-open")).toHaveText("false");
  await expect(page.getByTestId("a-trigger")).toBeFocused();
  expect(await triggerFocusLog(page, "a")).toEqual(["2026-10-20"]);
  // Focus leaves the chosen cell for the Trigger, or for nothing while Content turns inert
  // before the restore (Chromium): neither touches.
  expect(await lastFocusOut(page, "a")).toMatch(/^(a-trigger|null)$/);
  await expect(page.getByTestId("a-value")).toHaveText("2026-10-20");

  await page.keyboard.press("Enter");
  await expect(cell(page, "a", "2026-10-20")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await triggerFocusLog(page, "a");
  await focusOutLog(page, "a");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("a-trigger")).toBeFocused();
  expect(await triggerFocusLog(page, "a")).toEqual(["2026-10-21"]);
  expect(await lastFocusOut(page, "a")).toMatch(/^(a-trigger|null)$/);
  await expect(page.getByTestId("a-touches")).toHaveText("0");

  // Text inside an `@if` in the Trigger.
  await page.getByTestId("b-trigger").click();
  await expect(cell(page, "b", "2026-10-15")).toBeFocused();
  await triggerFocusLog(page, "b");
  await cell(page, "b", "2026-10-22").click();
  await expect(page.getByTestId("b-trigger")).toBeFocused();
  expect(await triggerFocusLog(page, "b")).toEqual(["2026-10-22"]);
  await expect(page.getByTestId("b-value-changes")).toHaveText("1");

  // The selected day, by click and by Enter: the picker closes and nothing is written.
  await page.getByTestId("b-trigger").click();
  await cell(page, "b", "2026-10-22").click();
  await expect(page.getByTestId("b-open")).toHaveText("false");
  await expect(page.getByTestId("b-trigger")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(cell(page, "b", "2026-10-22")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("b-open")).toHaveText("false");
  await expect(page.getByTestId("b-trigger")).toBeFocused();
  await expect(page.getByTestId("b-value")).toHaveText("2026-10-22");
  await expect(page.getByTestId("b-value-changes")).toHaveText("1");
  await expect(page.getByTestId("b-touches")).toHaveText("0");

  // Text in a child component's view; Content retains its gated Calendar until focus returned.
  await page.getByTestId("c-trigger").click();
  await expect(cell(page, "c", "2026-10-27")).toBeFocused();
  await triggerFocusLog(page, "c");
  await cell(page, "c", "2026-10-23").click();
  await expect(page.getByTestId("c-trigger")).toBeFocused();
  expect(await triggerFocusLog(page, "c")).toEqual(["2026-10-23"]);
  await expect(page.getByTestId("c-value")).toHaveText("2026-10-23");
});

test("DP4 each open resets the Calendar: a month and view navigated to are gone on reopen, which shows the value's month", async ({
  page,
}, info) => {
  await fixture(page, "date-picker", info);

  await page.getByTestId("a-trigger").click();
  await expect(cell(page, "a", "2026-10-27")).toBeFocused();
  await page.getByTestId("a-next").click();
  await expect(page.getByTestId("a-heading")).toHaveText("November 2026");
  await expect(page.getByTestId("a-month")).toHaveText("2026-11");
  await page.getByTestId("a-years").click();
  await expect(page.getByTestId("a-view")).toHaveText("years");

  // Closing by the Trigger.
  await page.getByTestId("a-trigger").click();
  await expect(page.getByTestId("a-open")).toHaveText("false");
  await page.getByTestId("a-trigger").click();
  await expect(page.getByTestId("a-view")).toHaveText("days");
  await expect(page.getByTestId("a-month")).toHaveText("null");
  await expect(page.getByTestId("a-heading")).toHaveText("October 2026");
  await expect(cell(page, "a", "2026-10-27")).toBeFocused();

  // With a value, after navigating away and closing by Escape.
  await cell(page, "a", "2026-10-20").click();
  await expect(page.getByTestId("a-trigger")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(cell(page, "a", "2026-10-20")).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect(cell(page, "a", "2026-11-20")).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect(cell(page, "a", "2026-12-20")).toBeFocused();
  await expect(page.getByTestId("a-heading")).toHaveText("December 2026");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("a-trigger")).toBeFocused();
  await expect(page.getByTestId("a-open")).toHaveText("false");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("a-heading")).toHaveText("October 2026");
  await expect(cell(page, "a", "2026-10-20")).toBeFocused();
  await expect(page.getByTestId("a-touches")).toHaveText("0");
});

test("DP5 in a Dialog, Escape unwinds one layer per press: the Calendar's view, then the picker with focus on its Trigger, then the Dialog", async ({
  page,
}, info) => {
  await fixture(page, "date-picker", info);

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
});

test("DP6 leaving: Tab past the last control and a press on another field close without moving focus and touch once each; a press on Content's padding stays; focus falling to nothing touches without closing", async ({
  page,
}, info) => {
  await fixture(page, "date-picker", info);
  await recordFocusOut(page, "a");

  await page.getByTestId("a-trigger").click();
  await expect(cell(page, "a", "2026-10-27")).toBeFocused();
  await focusOutLog(page, "a");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("a-after")).toBeFocused();
  expect(await focusOutLog(page, "a")).toEqual([{ related: "a-after", inside: false }]);
  await expect(page.getByTestId("a-open")).toHaveText("false");
  await expect(page.getByTestId("a-touched")).toHaveText("true");
  await expect(page.getByTestId("a-touches")).toHaveText("1");
  await expect(page.getByTestId("a-after")).toBeFocused();

  // A press on Content's padding focuses Content, inside the picker.
  await page.getByTestId("a-trigger").click();
  await expect(cell(page, "a", "2026-10-27")).toBeFocused();
  await focusOutLog(page, "a");

  const box = (await page.getByTestId("a-content").boundingBox())!;

  await page.mouse.click(box.x + 4, box.y + 4);
  await expect(page.getByTestId("a-content")).toBeFocused();
  expect(await focusOutLog(page, "a")).toEqual([{ related: "a-content", inside: true }]);
  await expect(page.getByTestId("a-open")).toHaveText("true");
  await expect(page.getByTestId("a-touches")).toHaveText("1");

  // A press on another field's Trigger: focus stays there.
  await page.getByTestId("b-trigger").click();
  await expect(page.getByTestId("a-open")).toHaveText("false");
  await expect(page.getByTestId("a-touches")).toHaveText("2");
  await expect(cell(page, "b", "2026-10-15")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("b-trigger")).toBeFocused();

  // Focus falling to nothing, as when the window loses focus.
  await page.getByTestId("a-trigger").click();
  await expect(cell(page, "a", "2026-10-27")).toBeFocused();
  await focusOutLog(page, "a");
  await cell(page, "a", "2026-10-27").evaluate((element: HTMLElement) => element.blur());
  expect(await focusOutLog(page, "a")).toEqual([{ related: null, inside: false }]);
  await expect(page.getByTestId("a-touches")).toHaveText("3");
  await expect(page.getByTestId("a-open")).toHaveText("true");
  expect(await shown(page, "a")).toBe(true);
});

test("DP7 Signal Forms and the Field: focusBoundControl() focuses the Trigger, submit shows the error on it, a choice clears it; clear() and a model write; Content names without a Field", async ({
  page,
}, info) => {
  await fixture(page, "date-picker", info);

  const trigger = page.getByTestId("a-trigger");

  await scriptControl(page, "a-focus");
  await expect(trigger).toBeFocused();
  await expect(page.getByTestId("a-touched")).toHaveText("false");

  await scriptControl(page, "a-submit");
  await expect(page.getByTestId("a-error")).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-invalid", "true");

  const errorId = await page.getByTestId("a-error").getAttribute("id");

  await expect(trigger).toHaveAttribute("aria-describedby", errorId ?? "");

  await trigger.click();
  await cell(page, "a", "2026-10-20").click();
  await expect(page.getByTestId("a-value")).toHaveText("2026-10-20");
  await expect(page.getByTestId("a-error")).toHaveCount(0);
  await expect(trigger).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(trigger).toHaveAccessibleName("Valid from 2026-10-20");

  // A model write shows on the Trigger and on reopen.
  await scriptControl(page, "a-write");
  await expect(trigger).toHaveText("2026-12-24");
  await trigger.click();
  await expect(page.getByTestId("a-heading")).toHaveText("December 2026");
  await expect(cell(page, "a", "2026-12-24")).toBeFocused();
  await page.keyboard.press("Escape");

  await scriptControl(page, "a-clear");
  await expect(page.getByTestId("a-value")).toHaveText("null");
  await expect(trigger).toHaveText("Choose a date");

  // Outside a Field: the Trigger's static name names Content, else the Trigger itself.
  await expect(page.getByTestId("n1-content")).toHaveAttribute("aria-label", "Start date");
  await expect(page.getByTestId("n1-content")).not.toHaveAttribute("aria-labelledby", /.*/);
  await expect(page.getByTestId("n1-trigger")).not.toHaveAttribute("aria-labelledby", /.*/);
  await expect(page.getByTestId("n2-content")).toHaveAttribute("aria-label", "Calendar");
  await expect(page.getByTestId("n2-content")).not.toHaveAttribute("aria-labelledby", /.*/);

  const n3 = await page.getByTestId("n3-trigger").getAttribute("id");

  await expect(page.getByTestId("n3-trigger")).toHaveAttribute("aria-labelledby", `n3-name ${n3}`);
  await expect(page.getByTestId("n3-content")).toHaveAttribute("aria-labelledby", "n3-name");

  const c = await page.getByTestId("c-trigger").getAttribute("id");

  await expect(page.getByTestId("c-content")).toHaveAttribute("aria-labelledby", c ?? "");
});

test("DP8 readonly opens and browses but never chooses or closes on a choice; disabled natively disables the Trigger while an open write still applies", async ({
  page,
}, info) => {
  await fixture(page, "date-picker", info);
  await expect(page.getByTestId("d-state")).toHaveText("true true");

  await expect(page.getByTestId("r-trigger")).toHaveAttribute("aria-readonly", "true");
  await page.getByTestId("r-trigger").click();
  await expect(cell(page, "r", "2026-10-15")).toBeFocused();
  await expect(page.getByTestId("r-grid")).toHaveAttribute("aria-readonly", "true");
  await cell(page, "r", "2026-10-20").click();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await expect(cell(page, "r", "2026-10-21")).toBeFocused();
  await expect(page.getByTestId("r-open")).toHaveText("true");
  await expect(page.getByTestId("r-value")).toHaveText("2026-10-15");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("r-trigger")).toBeFocused();

  const disabled = page.getByTestId("d-trigger");

  await expect(disabled).toBeDisabled();
  await expect(disabled).toHaveAttribute("aria-disabled", "true");
  await disabled.click({ force: true });
  await expect(page.getByTestId("d-open")).toHaveText("false");
  expect(await shown(page, "d")).toBe(false);

  await scriptControl(page, "d-open-write");
  await expect.poll(() => shown(page, "d")).toBe(true);
  await expect(page.getByTestId("d-grid")).toHaveAttribute("aria-disabled", "true");
  await scriptControl(page, "d-close-write");
  await expect.poll(() => shown(page, "d")).toBe(false);
});

test("DP9 a Calendar of another mode inside Content is reported through ErrorHandler and stays an unbound inline Calendar", async ({
  page,
  runtimeErrors,
}, info) => {
  const message =
    "ogCalendarRange inside ogDatePicker Content isn't bound to the picker; author an ogCalendar there.";

  runtimeErrors.expectExactly([
    {
      description: "one mode-mismatch Error reported through ErrorHandler",
      matches: (record) => {
        if (record.source !== "console") {
          return false;
        }

        for (const argument of record.arguments ?? []) {
          if (isRecord(argument) && argument["message"] === message) {
            return true;
          }
        }

        return false;
      },
    },
  ]);
  await fixture(page, "date-picker", info);
  await scriptControl(page, "m-mount");
  await page.getByTestId("m-trigger").click();
  await expect(page.getByTestId("m-open")).toHaveText("true");
  await expect.poll(() => shown(page, "m")).toBe(true);
  // No bound Calendar registered, so nothing moves focus into Content.
  expect(
    await page
      .getByTestId("m-content")
      .evaluate((content) => content.contains(document.activeElement)),
  ).toBe(false);

  await cell(page, "m", "2026-10-20").click();
  await cell(page, "m", "2026-10-22").click();
  await expect(page.getByTestId("m-range")).toHaveText("2026-10-20 2026-10-22");
  await expect(page.getByTestId("m-value")).toHaveText("null");
  await expect(page.getByTestId("m-open")).toHaveText("true");
});

test("DP10 each open forgets the last session's navigation in the same month and view: reopening focuses the selected day, else today", async ({
  page,
}, info) => {
  await fixture(page, "date-picker", info);

  // Without a value: today.
  await page.getByTestId("a-trigger").click();
  await expect(cell(page, "a", "2026-10-27")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(cell(page, "a", "2026-10-28")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("a-trigger")).toBeFocused();
  // The close must render first: an open flip within one change detection doesn't reset.
  await expect(page.getByTestId("a-open")).toHaveText("false");
  await page.keyboard.press("Enter");
  await expect(cell(page, "a", "2026-10-27")).toBeFocused();
  await expect(page.getByTestId("a-heading")).toHaveText("October 2026");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("a-trigger")).toBeFocused();
  await expect(page.getByTestId("a-touches")).toHaveText("0");

  // With a value: the selected day.
  await page.getByTestId("b-trigger").click();
  await expect(cell(page, "b", "2026-10-15")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(cell(page, "b", "2026-10-16")).toBeFocused();
  await page.getByTestId("b-trigger").click();
  await expect(page.getByTestId("b-open")).toHaveText("false");
  await page.getByTestId("b-trigger").click();
  await expect(cell(page, "b", "2026-10-15")).toBeFocused();
  await expect(page.getByTestId("b-touches")).toHaveText("0");
});

test("DP11 a Calendar gated by Content resets when it mounts after the open: an authored month and view on the first open, and bound ones the last session changed", async ({
  page,
}, info) => {
  await fixture(page, "date-picker", info);
  await expect(page.getByTestId("e-month")).toHaveText("2020-01");
  await expect(page.getByTestId("e-view")).toHaveText("years");
  await expect(page.getByTestId("e-grid")).toHaveCount(0);

  await page.getByTestId("e-trigger").click();
  await expect(cell(page, "e", "2026-10-27")).toBeFocused();
  await expect(page.getByTestId("e-month")).toHaveText("null");
  await expect(page.getByTestId("e-view")).toHaveText("days");
  await expect(page.getByTestId("e-heading")).toHaveText("October 2026");

  // Navigate, close by the Trigger and let Content's retention unmount the Calendar.
  await page.getByTestId("e-next").click();
  await expect(page.getByTestId("e-month")).toHaveText("2026-11");
  await page.getByTestId("e-years").click();
  await expect(page.getByTestId("e-view")).toHaveText("years");
  await page.getByTestId("e-trigger").click();
  await expect(page.getByTestId("e-open")).toHaveText("false");
  await expect(page.getByTestId("e-grid")).toHaveCount(0);
  await expect(page.getByTestId("e-month")).toHaveText("2026-11");
  await expect(page.getByTestId("e-view")).toHaveText("years");

  await page.getByTestId("e-trigger").click();
  await expect(cell(page, "e", "2026-10-27")).toBeFocused();
  await expect(page.getByTestId("e-month")).toHaveText("null");
  await expect(page.getByTestId("e-view")).toHaveText("days");
  await expect(page.getByTestId("e-heading")).toHaveText("October 2026");
});

test("DP12 disabling an open picker closes it; focus in Content doesn't return to the natively disabled Trigger", async ({
  page,
}, info) => {
  await fixture(page, "date-picker", info);

  await page.getByTestId("c-trigger").click();
  await expect(cell(page, "c", "2026-10-27")).toBeFocused();
  await scriptControl(page, "c-disable");
  await expect(page.getByTestId("c-open")).toHaveText("false");
  await expect.poll(() => shown(page, "c")).toBe(false);
  await expect(page.getByTestId("c-trigger")).toBeDisabled();
  await expect(page.getByTestId("c-trigger")).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.localName)).toBe("body");
  // Focus fell from the inert closing Content, not to another element: no touch.
  await expect(page.getByTestId("c-touches")).toHaveText("0");

  await scriptControl(page, "c-enable");
  await page.getByTestId("c-trigger").click();
  await expect(cell(page, "c", "2026-10-27")).toBeFocused();
  await expect(page.getByTestId("c-open")).toHaveText("true");
});

for (const name of ["date-picker-factory", "date-picker-existing"]) {
  test(`DP13 O1 O3: ${name.replace("date-picker-", "")} replacements of every host-composed part drive value, open, locale, IDs, disabled and readonly policy and placement over the composed parts' contradicting own inputs, and the unused models emit nothing`, async ({
    page,
  }, info) => {
    await fixture(page, "date-picker", info);

    const co = (role: string) => page.locator(`[data-case="${name}"] [data-co="${role}"]`);
    const trigger = co("trigger");
    const content = co("content");
    const day = (date: string) => content.locator(`td[data-date="${date}"]`);
    const isShown = () => content.evaluate((node) => node.matches(":popover-open"));

    // Before any action, every effective replacement contradicts the own inputs.
    await expect(co("value")).toHaveText("2026-10-15 2026-10-15");
    await expect(co("open")).toHaveText("false false");
    await expect(co("policy")).toHaveText("true false");
    // The composed date field and the bridged Calendar take the replaced policies too.
    await expect(co("lower-policy")).toHaveText("true false true");
    await expect(co("unused-outputs")).toHaveText("0");
    // The composed date field takes the replaced value and locale (en-US, not de-DE).
    await expect(co("segments")).toHaveText("10/15/2026");
    expect(await isShown()).toBe(false);
    await expect(trigger).toHaveText("2026-10-15");
    await expect(trigger).toHaveAttribute("id", `${name}-trigger`);
    await expect(trigger).toHaveAttribute("aria-controls", `${name}-content`);
    await expect(trigger).toHaveAttribute("aria-labelledby", `${name}-label ${name}-trigger`);
    await expect(content).toHaveAttribute("id", `${name}-content`);
    // The picker's replaced disabled, over the Trigger's own input too: natively disabled.
    await expect(trigger).toBeDisabled();
    await expect(trigger).toHaveAttribute("aria-disabled", "true");

    await co("disable").click();
    await expect(co("policy")).toHaveText("false false");
    await expect(co("lower-policy")).toHaveText("false false false");
    await expect(trigger).toBeEnabled();
    // The replaced Trigger disabled policy, never its own input; the picker stays enabled.
    await co("trigger-disable").click();
    await expect(trigger).toBeDisabled();
    await expect(co("policy")).toHaveText("false false");
    await co("trigger-disable").click();
    await expect(trigger).toBeEnabled();

    // Opening writes the replaced open; Content takes the replaced placement; the bridged
    // Calendar binds the replaced value and gets the grid's focus.
    await trigger.evaluate((node) => node.scrollIntoView({ block: "center", inline: "center" }));
    await trigger.click();
    await expect(co("open")).toHaveText("true true");
    await expect.poll(isShown).toBe(true);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(day("2026-10-15")).toBeFocused();
    await expect(day("2026-10-15")).toHaveAttribute("aria-selected", "true");
    await expect(content).toHaveAccessibleName("Departure");
    await expectPreferred(page, "inline-end", "center", 11, {
      anchor: `${name}-trigger`,
      content: `${name}-content`,
    });

    // A choice writes the replaced value and open, and focus returns to the Trigger.
    await day("2026-10-20").click();
    await expect(co("open")).toHaveText("false false");
    await expect.poll(isShown).toBe(false);
    await expect(co("value")).toHaveText("2026-10-20 2026-10-20");
    await expect(co("segments")).toHaveText("10/20/2026");
    await expect(trigger).toHaveText("2026-10-20");
    await expect(trigger).toBeFocused();

    // The replaced readonly, over the root's own true until now: opens and browses, never chooses.
    await co("readonly").click();
    await expect(co("policy")).toHaveText("false true");
    await expect(co("lower-policy")).toHaveText("false true false");
    await trigger.click();
    await expect(day("2026-10-20")).toBeFocused();
    await expect(co("grid")).toHaveAttribute("aria-readonly", "true");
    await day("2026-10-21").click();
    await expect(co("open")).toHaveText("true true");
    await expect(co("value")).toHaveText("2026-10-20 2026-10-20");
    await page.keyboard.press("Escape");
    await expect(co("open")).toHaveText("false false");
    await expect(trigger).toBeFocused();
    await co("readonly").click();
    await expect(co("policy")).toHaveText("false false");

    // Disabling the replaced picker while open closes it through the replaced open.
    await trigger.click();
    await expect(co("open")).toHaveText("true true");
    await co("disable").evaluate((node) => (node as HTMLElement).click());
    await expect(co("open")).toHaveText("false false");
    await expect.poll(isShown).toBe(false);
    await expect(trigger).toBeDisabled();
    await co("disable").click();
    await expect(trigger).toBeEnabled();

    await co("ids").click();
    await expect(trigger).toHaveAttribute("id", `${name}-trigger-changed`);
    await expect(content).toHaveAttribute("id", `${name}-content-changed`);
    await expect(trigger).toHaveAttribute("aria-controls", `${name}-content-changed`);
    await expect(trigger).toHaveAttribute(
      "aria-labelledby",
      `${name}-label ${name}-trigger-changed`,
    );
    await expect(co("unused-outputs")).toHaveText("0");
  });
}

/** The field-shape picker f's segment of `unit`. */
function segment(page: Page, unit: string): Locator {
  return page.getByTestId("f-input").locator(`[data-segment="${unit}"]`);
}

/** The field-shape picker f's segment and literal texts, joined. */
async function segmentTexts(page: Page): Promise<string> {
  const texts = await page
    .getByTestId("f-input")
    .locator("[data-segment], [data-literal]")
    .evaluateAll((elements) => elements.map((element) => element.textContent ?? ""));

  return texts.join("");
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

/** The closed field-shape picker's naming and popup attributes. */
async function describeFieldShape(page: Page): Promise<Record<string, string | null>> {
  const read: Record<string, string | null> = {};
  const parts = {
    trigger: page.getByTestId("f-trigger"),
    input: page.getByTestId("f-input"),
    content: page.getByTestId("f-content"),
    day: segment(page, "day"),
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
      "aria-describedby",
      "aria-invalid",
      "aria-required",
      "aria-readonly",
    ],
    input: ["role", "aria-labelledby"],
    content: ["id", "role", "tabindex", "popover", "aria-labelledby", "aria-label", "inert"],
    day: ["aria-required"],
  };

  for (const [part, names] of Object.entries(attributes)) {
    for (const name of names) {
      read[`${part} ${name}`] = await parts[part as keyof typeof parts].getAttribute(name);
    }
  }

  read["grid aria-labelledby"] = await page.getByTestId("f-grid").getAttribute("aria-labelledby");
  read["segments"] = await segmentTexts(page);

  return read;
}

test("DP14 field shape, server HTML and hydration of a closed picker: the Input group is the Field's control, the Trigger an action button named by its aria-label, which names Content", async ({
  page,
}, info) => {
  let server: Record<string, string | null> = {};

  await fixture(page, "date-picker", info, async () => {
    server = await describeFieldShape(page);
  });

  const attached = await describeFieldShape(page);

  expect(attached).toEqual(server);
  expect(attached["trigger id"]).toMatch(/\S/);
  expect(attached).toMatchObject({
    "trigger type": "button",
    "trigger aria-haspopup": "dialog",
    "trigger aria-expanded": "false",
    "trigger aria-controls": attached["content id"],
    "trigger aria-label": "Choose date",
    "trigger aria-labelledby": null,
    "trigger aria-describedby": null,
    "trigger aria-invalid": null,
    "trigger aria-required": null,
    "trigger aria-readonly": null,
    "input role": "group",
    "input aria-labelledby": "f-label",
    "content role": "dialog",
    "content tabindex": "-1",
    "content popover": "manual",
    "content aria-labelledby": null,
    "content aria-label": "Choose date",
    "content inert": "",
    "day aria-required": "true",
    segments: "10/27/2026",
  });
  // The bridged Grid never joins the Field.
  expect(attached["grid aria-labelledby"]?.split(" ")).not.toContain("f-label");

  await expect(page.getByTestId("f-input")).toHaveAccessibleName("Date of birth");
  await expect(segment(page, "day")).toHaveAccessibleName("Date of birth day");
  await expect(page.getByTestId("f-trigger")).toHaveAccessibleName("Choose date");
  expect(await shown(page, "f")).toBe(false);

  await page.getByTestId("f-trigger").click();
  await expect(cell(page, "f", "2026-10-27")).toBeFocused();
  await expect(page.getByTestId("f-content")).toHaveAccessibleName("Choose date");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("f-trigger")).toBeFocused();
});

test("DP15 field shape: a choice discards a half-typed draft, the value already committed too, with no parse error and no write; another day writes once", async ({
  page,
}, info) => {
  await fixture(page, "date-picker", info);

  // The plan's falsifier: 2026-10-27 committed, the day cleared, then 27 October chosen. Focus
  // moves as a user's would: Playwright's `focus()` blurs first for a contenteditable target.
  await segment(page, "day").click();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("f-parse")).toHaveText("dateIncomplete");
  await expect(page.getByTestId("f-errors")).toHaveText("dateIncomplete");
  expect(await segmentTexts(page)).toBe("10/––/2026");
  await expect(page.getByTestId("f-value")).toHaveText("2026-10-27");

  await page.getByTestId("f-trigger").click();
  await expect(cell(page, "f", "2026-10-27")).toBeFocused();
  await cell(page, "f", "2026-10-27").click();
  await expect(page.getByTestId("f-open")).toHaveText("false");
  await expect(page.getByTestId("f-trigger")).toBeFocused();
  await expect.poll(() => segmentTexts(page)).toBe("10/27/2026");
  await expect(page.getByTestId("f-parse")).toHaveText("");
  await expect(page.getByTestId("f-errors")).toHaveText("");
  await expect(page.getByTestId("f-value")).toHaveText("2026-10-27");
  await expect(page.getByTestId("f-value-changes")).toHaveText("0");

  // The same by Enter on the selected day.
  await segment(page, "day").click();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("f-parse")).toHaveText("dateIncomplete");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("f-trigger")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(cell(page, "f", "2026-10-27")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("f-open")).toHaveText("false");
  await expect(page.getByTestId("f-trigger")).toBeFocused();
  await expect.poll(() => segmentTexts(page)).toBe("10/27/2026");
  await expect(page.getByTestId("f-parse")).toHaveText("");
  await expect(page.getByTestId("f-value-changes")).toHaveText("0");

  // Another day over a half-typed draft writes it once and shows it.
  await segment(page, "day").click();
  await page.keyboard.press("Delete");
  await page.getByTestId("f-trigger").click();
  await cell(page, "f", "2026-10-12").click();
  await expect(page.getByTestId("f-trigger")).toBeFocused();
  await expect(page.getByTestId("f-value")).toHaveText("2026-10-12");
  await expect.poll(() => segmentTexts(page)).toBe("10/12/2026");
  await expect(page.getByTestId("f-parse")).toHaveText("");
  await expect(page.getByTestId("f-errors")).toHaveText("");
  await expect(page.getByTestId("f-value-changes")).toHaveText("1");
  await expect(page.getByTestId("f-touches")).toHaveText("0");
  await expect(page.getByTestId("f-touched")).toHaveText("false");
});

test("DP16 field shape: focusBoundControl() focuses the first segment; moving between the segments, the Trigger and Content doesn't touch or close; Tab out touches once and closes; Escape returns to the Trigger; a press on a segment closes without a touch", async ({
  page,
}, info) => {
  await fixture(page, "date-picker", info);
  await recordFocusOut(page, "f");

  const trigger = page.getByTestId("f-trigger");

  await scriptControl(page, "f-focus");
  await expect(segment(page, "month")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(segment(page, "day")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(segment(page, "year")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(cell(page, "f", "2026-10-27")).toBeFocused();

  // Back out of Content to the Trigger and the segments, and in again: it stays open.
  await pressUntilFocused(page, "Shift+Tab", trigger, 8);
  await page.keyboard.press("Shift+Tab");
  await expect(segment(page, "year")).toBeFocused();
  await expect(page.getByTestId("f-open")).toHaveText("true");
  expect(await shown(page, "f")).toBe(true);
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("f-previous")).toBeFocused();
  await expect(page.getByTestId("f-open")).toHaveText("true");
  await expect(page.getByTestId("f-touches")).toHaveText("0");

  for (const entry of (await focusOutLog(page, "f")) as { inside: boolean }[]) {
    expect(entry.inside).toBe(true);
  }

  // Tab past the Calendar's last control: closed, focus on After, touched once.
  await pressUntilFocused(page, "Tab", page.getByTestId("f-after"), 8);
  await expect(page.getByTestId("f-open")).toHaveText("false");
  await expect(page.getByTestId("f-touches")).toHaveText("1");
  await expect(page.getByTestId("f-touched")).toHaveText("true");
  await expect(page.getByTestId("f-after")).toBeFocused();

  // Escape returns focus to the Trigger, not a segment.
  await trigger.click();
  await expect(cell(page, "f", "2026-10-27")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("f-open")).toHaveText("false");
  await expect(trigger).toBeFocused();

  // A press on a segment while open is outside the Popover: it closes, focus stays on the
  // segment, and nothing touches.
  await expect(page.getByTestId("f-open")).toHaveText("false");
  await trigger.click();
  await expect(cell(page, "f", "2026-10-27")).toBeFocused();
  await segment(page, "day").click();
  await expect(page.getByTestId("f-open")).toHaveText("false");
  await expect.poll(() => shown(page, "f")).toBe(false);
  await expect(segment(page, "day")).toBeFocused();
  await expect(page.getByTestId("f-touches")).toHaveText("1");
});

test("DP17 field shape: a value typed while the picker is open shows in the Calendar, which follows it", async ({
  page,
}, info) => {
  await fixture(page, "date-picker", info);

  await page.getByTestId("f-trigger").click();
  await expect(cell(page, "f", "2026-10-27")).toBeFocused();
  await expect(page.getByTestId("f-heading")).toHaveText("October 2026");

  // Back to the year segment by keyboard, which keeps the picker open, and type 2027.
  await pressUntilFocused(page, "Shift+Tab", page.getByTestId("f-trigger"), 8);
  await page.keyboard.press("Shift+Tab");
  await expect(segment(page, "year")).toBeFocused();
  await page.keyboard.type("2027");
  await expect(page.getByTestId("f-value")).toHaveText("2027-10-27");
  await expect(page.getByTestId("f-open")).toHaveText("true");
  await expect(page.getByTestId("f-heading")).toHaveText("October 2027");
  await expect(page.getByTestId("f-month")).toHaveText("null");
  await expect(cell(page, "f", "2027-10-27")).toHaveAttribute("aria-selected", "true");

  // Then the month: the Calendar follows to December.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(segment(page, "month")).toBeFocused();
  await page.keyboard.type("12");
  await expect(page.getByTestId("f-value")).toHaveText("2027-12-27");
  await expect(page.getByTestId("f-heading")).toHaveText("December 2027");
  await expect(cell(page, "f", "2027-12-27")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("f-open")).toHaveText("true");
  await expect(page.getByTestId("f-touches")).toHaveText("0");
});
