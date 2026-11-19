// The documented Signal Forms caveats (plan-2 D5, D6, D10), pinned so a change in Angular or core
// that alters them fails loudly instead of silently changing what the readmes promise.
import { expect, test } from "@playwright/test";
import { captureMessages, expectClean } from "./harness";

test("an undefined field leaves the control uncontrolled until defined, and warns when it returns (D6)", async ({
  page,
}) => {
  const messages = captureMessages(page);

  await page.goto("/signal-forms-undefined");
  await expect(page.getByTestId("app-ready")).toHaveAttribute("data-ready", "true");

  // FormField skips its first write while the value is undefined: core shows its default.
  await expect(page.getByTestId("undefined-checkbox")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("undefined-switch")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("undefined-radio")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("undefined-select-a")).toHaveAttribute("aria-selected", "true");
  expect(JSON.parse(await page.getByTestId("undefined-flags").innerText())).toEqual([
    true,
    true,
    true,
    true,
  ]);
  await page.waitForTimeout(1200);
  expectClean(messages);

  await page.getByTestId("defined").click();
  await expect(page.getByTestId("undefined-checkbox")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("undefined-switch")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("undefined-radio")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("undefined-select-a")).toHaveAttribute("aria-selected", "false");
  await page.waitForTimeout(1200);
  expectClean(messages);

  // Back to undefined: core warns that each stopped being controlled and keeps its last value.
  const before = messages.console.length;

  await page.getByTestId("undefined").click();
  await expect
    .poll(async () => JSON.parse(await page.getByTestId("undefined-flags").innerText()))
    .toEqual([true, true, true, true]);
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("undefined-checkbox")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("undefined-switch")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("undefined-radio")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("undefined-select-a")).toHaveAttribute("aria-selected", "false");

  const expected = [
    ["checkbox", "checked"],
    ["switch", "checked"],
    ["radio", "value"],
    ["select", "value"],
  ].map(
    ([component, key]) =>
      `${component}: stopped controlling \`${key}\`: it was passed and is now undefined, so the component keeps its last value.`,
  );
  // Every warning or error since the click, each instance id (`select#<id>: …`) dropped.
  const noisy = messages.console
    .slice(before)
    .filter(({ type, text }) => type === "warning" || type === "error" || /NG05\d{2}/.test(text))
    .map(({ type, text }) => ({ type, text: text.replace(/^(\[ui-sdk\] [a-z-]+)#\S+:/, "$1:") }))
    .sort((a, b) => a.text.localeCompare(b.text));

  expect(noisy).toEqual(
    expected
      .map((text) => ({ type: "warning", text: `[ui-sdk] ${text}` }))
      .sort((a, b) => a.text.localeCompare(b.text)),
  );
  expect(messages.pageErrors).toEqual([]);
});

test("a controller puts 'indeterminate' into a field typed boolean (D5)", async ({ page }) => {
  const messages = captureMessages(page);

  await page.goto("/signal-forms-boolean");
  await expect(page.getByTestId("app-ready")).toHaveAttribute("data-ready", "true");
  await page.getByTestId("set-indeterminate").click();
  await expect(page.getByTestId("model")).toHaveText('"indeterminate"');
  await expect(page.getByTestId("boolean-checkbox")).toHaveAttribute("aria-checked", "mixed");
  await page.waitForTimeout(1200);
  expectClean(messages);
});

test("[formField] on a hidden input binds the input, so an external write misses the control (D10)", async ({
  page,
}) => {
  const messages = captureMessages(page);

  await page.goto("/signal-forms-hidden");
  await expect(page.getByTestId("app-ready")).toHaveAttribute("data-ready", "true");
  await page.getByTestId("hidden-checkbox").click();
  await page.getByTestId("hidden-select").locator("[data-slot=select-trigger]").click();
  await page.getByTestId("hidden-apple").click();
  await expect(page.getByTestId("model")).toContainText('"terms": true');
  await expect(page.getByTestId("model")).toContainText('"fruit": "apple"');

  await page.getByTestId("external").click();
  await expect(page.getByTestId("model")).toContainText('"terms": false');
  await expect(page.getByTestId("hidden-checkbox-input")).not.toBeChecked();
  await expect(page.getByTestId("hidden-select-input")).toHaveValue("");
  // The visible controls kept their state.
  await expect(page.getByTestId("hidden-checkbox")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("hidden-apple")).toHaveAttribute("aria-selected", "true");
  expectClean(messages);
});
