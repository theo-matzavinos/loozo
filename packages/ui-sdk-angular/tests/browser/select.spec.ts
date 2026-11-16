// Select: controlled with null and cancellation, uncontrolled with its output.
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
