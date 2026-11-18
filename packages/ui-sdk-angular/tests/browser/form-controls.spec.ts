// Checkbox (direct and composed), Switch and RadioGroup: controlled, vetoed, disabled, and the
// radios' arrow keys.
import { type Page, expect, test } from "@playwright/test";
import { captureMessages, expectClean, serverAttributes } from "./harness";

async function hydrated(page: Page): Promise<void> {
  await page.goto("/form-controls");
  await expect(page.locator("[data-testid=app-ready]")).toHaveAttribute("data-ready", "true");
}

for (const variant of ["checkbox", "composed", "switch"] as const) {
  const value = variant === "switch" ? "switch" : variant;
  // The page's outside write: a checkbox goes from true to "indeterminate", a switch to false.
  const written = variant === "switch" ? ["false", "false"] : ["indeterminate", "mixed"];

  test.describe(variant, () => {
    test("controlled: [(checked)] follows presses and outside writes", async ({ page }) => {
      const messages = captureMessages(page);

      await hydrated(page);

      const control = page.locator(`[data-testid=${variant}] [data-testid=controlled]`);

      await control.click();
      await expect(page.locator(`[data-testid=${value}-value]`)).toHaveText("true");
      await expect(control).toHaveAttribute("aria-checked", "true");
      await page.locator(`[data-testid=${value}-set]`).click();
      await expect(page.locator(`[data-testid=${value}-value]`)).toHaveText(written[0]!);
      await expect(control).toHaveAttribute("aria-checked", written[1]!);
      await control.press("Space");
      await expect(page.locator(`[data-testid=${value}-value]`)).toHaveText("true");
      // Core warns in development when a controlled value isn't written back within 1 s.
      await page.waitForTimeout(1500);
      expectClean(messages);
    });

    test("checkedChangeRequest can cancel: no change, no output, no warning", async ({ page }) => {
      const messages = captureMessages(page);

      await hydrated(page);

      const control = page.locator(`[data-testid=${variant}] [data-testid=vetoed]`);

      await control.click();
      await control.press("Space");
      await expect(control).toHaveAttribute("aria-checked", "false");
      await expect(page.locator("[data-testid=changes]")).toHaveText("0");
      await page.waitForTimeout(1500);
      expectClean(messages);
    });

    test("disabled: natively disabled, presses do nothing", async ({ page }) => {
      const messages = captureMessages(page);

      await hydrated(page);

      const control = page.locator(`[data-testid=${variant}] [data-testid=disabled]`);

      await expect(control).toBeDisabled();
      await control.click({ force: true });
      await expect(control).toHaveAttribute("aria-checked", "false");
      expectClean(messages);
    });
  });
}

test("radio group: [(value)] follows arrow keys, skipping disabled radios, without loop", async ({
  page,
}) => {
  const messages = captureMessages(page);
  const radio = (value: string) => page.locator(`[data-testid=level-${value}]`);

  await hydrated(page);
  await expect(radio("low")).toHaveAttribute("aria-checked", "true");
  await expect(radio("mid")).toBeDisabled();
  await radio("low").press("ArrowDown");
  await expect(radio("high")).toBeFocused();
  await expect(page.locator("[data-testid=level-value]")).toHaveText("high");
  await expect(page.locator("[data-testid=level-requests]")).toHaveText("1 high");
  await radio("high").press("ArrowDown");
  await expect(radio("high")).toBeFocused();
  await expect(page.locator("[data-testid=level-requests]")).toHaveText("1 high");
  await radio("mid").click({ force: true });
  await expect(page.locator("[data-testid=level-value]")).toHaveText("high");

  // An outside write of null checks none; the first enabled radio takes the tab stop.
  await page.locator("[data-testid=level-clear]").click();
  await expect(page.locator("[data-testid=level-value]")).toHaveText("null");
  await expect(page.locator("[data-testid=level] [aria-checked=true]")).toHaveCount(0);
  await expect(radio("low")).toHaveAttribute("tabindex", "0");
  await radio("low").click();
  await expect(page.locator("[data-testid=level-value]")).toHaveText("low");
  await page.waitForTimeout(1500);
  expectClean(messages);
});

test("radio group: arrow keys wrap by default", async ({ page }) => {
  const messages = captureMessages(page);
  const radio = (value: string) => page.locator(`[data-testid=wrap-${value}]`);

  await hydrated(page);
  await radio("one").press("ArrowDown");
  await expect(radio("two")).toHaveAttribute("aria-checked", "true");
  await radio("two").press("ArrowDown");
  await expect(radio("one")).toBeFocused();
  await expect(radio("one")).toHaveAttribute("aria-checked", "true");
  await radio("one").press("ArrowUp");
  await expect(radio("two")).toHaveAttribute("aria-checked", "true");
  expectClean(messages);
});

test("radio group: valueChangeRequest can cancel a press and an arrow key", async ({ page }) => {
  const messages = captureMessages(page);
  const radio = (value: string) => page.locator(`[data-testid=locked-${value}]`);

  await hydrated(page);
  await radio("two").click();
  await expect(radio("one")).toHaveAttribute("aria-checked", "true");
  await radio("one").press("ArrowDown");
  await expect(radio("one")).toHaveAttribute("aria-checked", "true");
  await expect(radio("two")).toHaveAttribute("aria-checked", "false");
  expectClean(messages);
});

test("a disabled fieldset disables the controls inside it, natively from the server", async ({
  page,
}) => {
  const messages = captureMessages(page);
  const response = await page.request.get("/form-controls");
  const html = await response.text();
  const server = await serverAttributes(page, html, "[data-testid=fenced]");
  const control = page.locator("[data-testid=fenced]");
  const submitted = () =>
    page.evaluate(() => [
      ...new FormData(
        document.querySelector<HTMLFormElement>("[data-testid=fieldset-form]")!,
      ).keys(),
    ]);

  // The server can't see the fieldset: core adds its disabled attributes when the control binds.
  expect(server).not.toHaveProperty("aria-disabled");
  expect(server["tabindex"]).toBe("0");
  await hydrated(page);
  await expect(control).toBeDisabled();
  await expect(control).toHaveAttribute("aria-disabled", "true");
  await expect(control).toHaveAttribute("data-disabled", "");
  expect(await submitted()).toEqual([]);

  await page.locator("[data-testid=fieldset-toggle]").click();
  await expect(control).not.toHaveAttribute("aria-disabled", "true");
  await expect(control).toBeEnabled();
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "false");
  await control.click();
  expect(await submitted()).toEqual(["fenced"]);
  expectClean(messages);
});
