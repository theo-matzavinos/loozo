// Toggle, used directly and through a consumer's `hostDirectives` composition: the same cases.
import { type Page, expect, test } from "@playwright/test";
import { captureMessages, expectClean } from "./harness";

async function hydrated(page: Page): Promise<void> {
  await page.goto("/controlled");
  // Every Select's trigger binds in the same render pass as the Toggles; wait for one.
  await expect(page.locator("[data-testid=controlled-select] [uiSelectTrigger]")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.waitForFunction(() => document.readyState === "complete");
}

for (const variant of ["direct", "composed"] as const) {
  test.describe(`${variant} toggle`, () => {
    test("uncontrolled: click, Space and Enter press it", async ({ page }) => {
      const messages = captureMessages(page);

      await hydrated(page);

      const toggle = page.locator(`[data-testid=${variant}] [data-testid=uncontrolled]`);

      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await toggle.press("Space");
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await toggle.press("Enter");
      await expect(toggle).toHaveAttribute("aria-pressed", "true");

      if (variant === "composed") {
        await expect(toggle, "the consumer's host binding reads state()").toHaveClass(
          /app-toggle-on/,
        );
      }

      expectClean(messages);
    });

    test("controlled: [(pressed)] follows presses and outside writes", async ({ page }) => {
      const messages = captureMessages(page);

      await hydrated(page);

      const section = page.locator(`[data-testid=${variant}]`);
      const toggle = section.locator("[data-testid=controlled]");
      const value = section.locator("[data-testid=controlled-value]");

      await toggle.click();
      await expect(value).toHaveText("true");
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await section.locator("[data-testid=controlled-set]").click();
      await expect(value).toHaveText("false");
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await toggle.press("Space");
      await expect(value).toHaveText("true");
      // Core warns in development when a controlled value isn't written back within 1 s.
      await page.waitForTimeout(1500);
      expectClean(messages);
    });

    test("pressedChangeRequest can cancel: no change, no output, no warning", async ({ page }) => {
      const messages = captureMessages(page);

      await hydrated(page);

      const section = page.locator(`[data-testid=${variant}]`);
      const toggle = section.locator("[data-testid=vetoed]");

      await toggle.click();
      await toggle.press("Enter");
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await expect(section.locator("[data-testid=vetoed-changes]")).toHaveText("0");
      await page.waitForTimeout(1500);
      expectClean(messages);
    });

    test("disabled: natively disabled, presses do nothing", async ({ page }) => {
      const messages = captureMessages(page);

      await hydrated(page);

      const toggle = page.locator(`[data-testid=${variant}] [data-testid=disabled]`);

      await expect(toggle).toBeDisabled();
      await toggle.click({ force: true });
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      expectClean(messages);
    });
  });
}
