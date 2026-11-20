// Select: controlled with null and cancellation, uncontrolled with its output, and virtualFocus.
import { type Page, expect, test } from "@playwright/test";
import { captureMessages, expectClean } from "./harness";

const controlled = "[data-testid=controlled-select]";

async function hydrated(page: Page): Promise<void> {
  await page.goto("/controlled");
  await expect(page.locator(`${controlled} [uiSelectTrigger]`)).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.waitForFunction(() => document.readyState === "complete");
}

async function pick(page: Page, root: string, option: string): Promise<void> {
  const trigger = page.locator(`${root} [uiSelectTrigger]`);

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.locator(`${root} [data-option=${option}]`).click();
}

test("controlled: [(value)] follows selection, null clears it and stays controlled", async ({
  page,
}) => {
  const messages = captureMessages(page);

  await hydrated(page);
  await expect(page.locator(`${controlled} [data-option=apple]`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await pick(page, controlled, "cherry");
  await expect(page.locator("[data-testid=fruit]")).toHaveText("cherry");
  await expect(page.locator(`${controlled} [data-option=cherry]`)).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.locator("[data-testid=clear]").click();
  await expect(page.locator("[data-testid=fruit]")).toHaveText("null");
  await expect(page.locator(`${controlled} [uiSelectValue]`)).toHaveText("none");
  await expect(page.locator(`${controlled} [data-option=cherry]`)).toHaveAttribute(
    "aria-selected",
    "false",
  );

  await pick(page, controlled, "apple");
  await expect(page.locator("[data-testid=fruit]")).toHaveText("apple");
  await page.waitForTimeout(1500);
  expectClean(messages);
});

test("valueChangeRequest can cancel: the value stays, nothing warns", async ({ page }) => {
  const messages = captureMessages(page);

  await hydrated(page);
  await pick(page, controlled, "banana");
  await expect(page.locator("[data-testid=requests]")).toHaveText("1");
  await expect(page.locator("[data-testid=fruit]")).toHaveText("apple");
  await expect(page.locator(`${controlled} [data-option=banana]`)).toHaveAttribute(
    "aria-selected",
    "false",
  );
  await expect(page.locator(`${controlled} [data-option=apple]`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.waitForTimeout(1500);
  expectClean(messages);
});

test("uncontrolled: core owns the value; valueChange reports it", async ({ page }) => {
  const messages = captureMessages(page);
  const root = "[data-testid=uncontrolled-select]";

  await hydrated(page);
  await expect(page.locator(`${root} [uiSelectValue]`)).toHaveText("Pick one");
  await pick(page, root, "lime");
  await expect(page.locator("[data-testid=picked]")).toHaveText("lime");
  await expect(page.locator(`${root} [uiSelectValue]`)).toHaveText("Lime");
  await expect(page.locator(`${root} [data-option=lime]`)).toHaveAttribute("aria-selected", "true");
  expectClean(messages);
});

test("virtualFocus: keys move the highlight while focus stays on the trigger", async ({ page }) => {
  const messages = captureMessages(page);
  const response = await page.request.get("/virtual-focus");
  const html = await response.text();

  expect(html).not.toContain("aria-activedescendant");

  await page.goto("/virtual-focus");
  await page.waitForFunction(() => document.readyState === "complete");

  const trigger = page.locator("[data-testid=virtual] [uiSelectTrigger]");

  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(trigger).toBeFocused();

  const active = await trigger.getAttribute("aria-activedescendant");
  const first = await page.locator("[data-testid=virtual] [data-option=apple]").getAttribute("id");

  expect(active).toBe(first);
  await page.keyboard.press("ArrowDown");
  await expect(trigger).toHaveAttribute(
    "aria-activedescendant",
    (await page.locator("[data-testid=virtual] [data-option=banana]").getAttribute("id"))!,
  );
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-testid=virtual-value]")).toHaveText("banana");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).not.toHaveAttribute("aria-activedescendant");
  await expect(trigger).toBeFocused();

  // A press on an item keeps focus on the trigger too.
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.locator("[data-testid=virtual] [data-option=cherry]").click();
  await expect(page.locator("[data-testid=virtual-value]")).toHaveText("cherry");
  await expect(trigger).toBeFocused();

  // Without it, focus moves into the list.
  const roving = page.locator("[data-testid=roving] [uiSelectTrigger]");

  await roving.focus();
  await page.keyboard.press("ArrowDown");
  await expect(roving).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("[data-testid=roving] [data-option=apple]")).toBeFocused();
  await expect(roving).not.toHaveAttribute("aria-activedescendant");
  await page.keyboard.press("Escape");

  await page.waitForTimeout(700);
  expectClean(messages);
});
