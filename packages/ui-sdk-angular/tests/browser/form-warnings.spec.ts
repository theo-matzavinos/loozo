// Decision W, narrowed by D8: a static name without its input warns once in development; a bound
// `[name]`, like the one Signal Forms writes, doesn't. A Select's form part on the wrong tag counts
// as missing.
import { expect, test } from "@playwright/test";
import { captureMessages } from "./harness";

test("a statically named control without its input warns once; one with it, unnamed or with a bound name doesn't", async ({
  page,
}) => {
  const messages = captureMessages(page);

  await page.goto("/form-warnings");
  await page.waitForFunction(() => document.readyState === "complete");
  await page.locator("[data-testid=show]").click();
  await expect(page.locator("[data-testid=shown]")).toBeVisible();
  await page.waitForTimeout(500);

  const warnings = messages.console
    .filter((message) => message.type === "warning")
    .map((message) => message.text)
    .sort((a, b) => a.localeCompare(b));

  expect(warnings).toEqual([
    'uiCheckbox: name="lonely-checkbox" submits nothing without its input. Add <input [uiCheckboxInput]="ref" /> beside it.',
    'uiRadioGroup: name="lonely-radio" submits nothing without its input. Add <input [uiRadioInput]="radio" /> beside each radio.',
    'uiSelect: name="lonely-select" submits nothing without its input. Add <textarea uiSelectFormInput></textarea> inside it.',
    'uiSelect: name="wrong-tag-select" submits nothing without its input. Add <textarea uiSelectFormInput></textarea> inside it.',
    'uiSwitch: name="lonely-switch" submits nothing without its input. Add <input [uiSwitchInput]="ref" /> beside it.',
  ]);
  expect(messages.pageErrors).toEqual([]);
});
