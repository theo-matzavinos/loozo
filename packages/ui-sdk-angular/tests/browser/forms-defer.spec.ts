// A press on a form control before its hydrate-on-interaction block hydrates: Angular replays it
// once, and the form submits the new value (incremental hydration only).
import { expect, test } from "@playwright/test";
import { captureMessages, expectClean, modeOf } from "./harness";

const cases = [
  { target: "late-checkbox", entry: ["lateCheckbox", "on"] },
  { target: "late-switch", entry: ["lateSwitch", "on"] },
  { target: "late-radio-b", entry: ["lateRadio", "b"] },
] as const;

for (const { target, entry } of cases) {
  test(`a press on ${target} before its block hydrates changes it once`, async ({
    page,
  }, testInfo) => {
    test.skip(modeOf(testInfo) !== "incremental", "hydrate triggers need incremental hydration");

    const messages = captureMessages(page);
    const chunks: string[] = [];

    // Stretches the block's hydration so the press lands before it.
    await page.route("**/chunk-*.js", async (route) => {
      chunks.push(route.request().url());
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });
    await page.goto("/forms-defer");
    await page.waitForFunction(() => document.readyState === "complete");

    const before = chunks.length;
    const changes: (string | null)[] = [];

    await page.exposeFunction("__noteChecked", (value: string | null) => changes.push(value));
    await page.locator(`[data-testid=${target}]`).evaluate((element) => {
      new MutationObserver(() =>
        (window as unknown as { __noteChecked(value: string | null): void }).__noteChecked(
          element.getAttribute("aria-checked"),
        ),
      ).observe(element, { attributes: true, attributeFilter: ["aria-checked"] });
    });
    await page.locator(`[data-testid=${target}]`).click();
    await expect(page.locator(`[data-testid=${target}]`)).toHaveAttribute("aria-checked", "true");
    await page.waitForTimeout(800);

    expect(chunks.length, "the press loaded the block's code").toBeGreaterThan(before);
    expect(changes).toEqual(["true"]);

    const submitted = await page.evaluate(() => [
      ...new FormData(
        document.querySelector<HTMLFormElement>("[data-testid=defer-form]")!,
      ).entries(),
    ]);

    expect(submitted).toEqual([entry]);
    expectClean(messages);
  });
}
