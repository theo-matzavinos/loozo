import { expect, test } from "./reader-test.js";
import type { Page } from "@playwright/test";
import type { Run } from "./reader-test.js";

// Records what each reader says while the keyboard drives Menu on /menu-speech, a page with no
// live diagnostics: opening, arrow navigation across a group, a disabled item, a link and a
// sub-trigger, typeahead, checkbox and radio items with Space (stays open) and Enter (closes),
// a submenu, focus return to the Trigger, and the hand-off to an AlertDialog. Same rules as
// toast.spec.ts: speech is never asserted, every key and focus is its own captured step, a step's
// action waits only for the first DOM change proving it happened, and state is checked outside
// the captures. The keys are Playwright's, sent to the page: the readers' own key handling, such
// as NVDA's browse mode, isn't exercised.

/** Presses `key` in one captured step and waits for focus to land on `focused`. */
async function press(run: Run, page: Page, key: string, focused: string): Promise<void> {
  await run.step(`${key} → ${focused}`, async () => {
    await page.keyboard.press(key);
    await expect(page.getByTestId(focused)).toBeFocused();
  });
}

/** Whether the menu Content with test ID `menu` is shown. */
async function shown(page: Page, menu: string): Promise<boolean> {
  return page.getByTestId(menu).evaluate((content) => content.matches(":popover-open"));
}

test("m1-navigate", async ({ page, run }) => {
  await run.open("/menu-speech");
  await run.step("focus Actions", () => page.getByTestId("actions-trigger").focus());
  await press(run, page, "Enter", "rename");

  for (const item of ["duplicate", "archive", "details", "move", "delete", "rename"]) {
    await press(run, page, "ArrowDown", item);
  }

  await press(run, page, "Escape", "actions-trigger");
  await run.check("Actions closed", async () => {
    expect(await shown(page, "actions-menu")).toBe(false);
  });
});

test("m2-typeahead", async ({ page, run }) => {
  await run.open("/menu-speech");
  await run.step("focus Actions", () => page.getByTestId("actions-trigger").focus());
  await press(run, page, "Enter", "rename");

  for (const [key, item] of [
    ["d", "duplicate"],
    ["d", "delete"],
    ["o", "details"],
    ["a", "archive"],
  ]) {
    // Outside the captures: keys more than 500 ms apart are separate searches, as a reader's
    // capture already makes them; the wait keeps that true however short a capture is.
    await page.waitForTimeout(600);
    await press(run, page, key, item);
  }
});

test("m3-checkbox", async ({ page, run }) => {
  await run.open("/menu-speech");
  await run.step("focus View", () => page.getByTestId("view-trigger").focus());
  await press(run, page, "Enter", "owner");
  await run.step("Space on Owner", async () => {
    await page.keyboard.press("Space");
    await expect(page.getByTestId("owner")).toHaveAttribute("aria-checked", "false");
  });
  await run.check("View stays open on Owner", async () => {
    expect(await shown(page, "view-menu")).toBe(true);
    await expect(page.getByTestId("owner")).toBeFocused();
  });
  await press(run, page, "ArrowDown", "due");
  await press(run, page, "Enter", "view-trigger");
  await run.check("Due date checked and View closed", async () => {
    await expect(page.getByTestId("due")).toHaveAttribute("aria-checked", "true");
    expect(await shown(page, "view-menu")).toBe(false);
  });
});

test("m4-radio", async ({ page, run }) => {
  await run.open("/menu-speech");
  await run.step("focus View", () => page.getByTestId("view-trigger").focus());
  await press(run, page, "ArrowUp", "comfortable");
  await press(run, page, "ArrowUp", "compact");
  await run.step("Space on Compact", async () => {
    await page.keyboard.press("Space");
    await expect(page.getByTestId("compact")).toHaveAttribute("aria-checked", "true");
  });
  await run.check("View stays open on Compact", async () => {
    expect(await shown(page, "view-menu")).toBe(true);
    await expect(page.getByTestId("compact")).toBeFocused();
  });
  await press(run, page, "ArrowDown", "comfortable");
  await press(run, page, "Enter", "view-trigger");
  await run.check("Comfortable checked and View closed", async () => {
    await expect(page.getByTestId("comfortable")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("compact")).toHaveAttribute("aria-checked", "false");
    expect(await shown(page, "view-menu")).toBe(false);
  });
});

test("m5-submenu", async ({ page, run }) => {
  await run.open("/menu-speech");
  await run.step("focus Actions", () => page.getByTestId("actions-trigger").focus());
  await press(run, page, "Enter", "rename");
  await press(run, page, "End", "delete");
  await press(run, page, "ArrowUp", "move");
  await press(run, page, "ArrowRight", "inbox");
  await press(run, page, "ArrowDown", "later");
  await press(run, page, "ArrowLeft", "move");
  await run.check("Move to closed, Actions open", async () => {
    expect(await shown(page, "move-menu")).toBe(false);
    expect(await shown(page, "actions-menu")).toBe(true);
  });
  await press(run, page, "Enter", "inbox");
  await press(run, page, "Enter", "actions-trigger");
  await run.check("both menus closed", async () => {
    expect(await shown(page, "move-menu")).toBe(false);
    expect(await shown(page, "actions-menu")).toBe(false);
  });
});

test("m6-dialog", async ({ page, run }) => {
  // Delete… focuses the Trigger, closes the menu, then opens the AlertDialog on Cancel, which
  // returns focus to the Trigger.
  await run.open("/menu-speech");
  await run.step("focus Actions", () => page.getByTestId("actions-trigger").focus());
  await press(run, page, "Enter", "rename");
  await press(run, page, "End", "delete");
  await press(run, page, "Enter", "delete-cancel");
  await run.check("Actions closed and the dialog modal", async () => {
    expect(await shown(page, "actions-menu")).toBe(false);
    expect(
      await page.getByTestId("delete-dialog").evaluate((dialog) => dialog.matches(":modal")),
    ).toBe(true);
  });
  await press(run, page, "Enter", "actions-trigger");
  await run.check("the dialog closed", () =>
    expect(page.getByTestId("delete-dialog")).toHaveJSProperty("open", false),
  );
});
