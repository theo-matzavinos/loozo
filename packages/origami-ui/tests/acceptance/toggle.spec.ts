import { test, expect } from "./contract-test.js";
import { fixture } from "./observation.js";

test("G1: native click/Enter/Space flip pressed exactly once, form type, disabled blocks only user activation", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const toggle = page.getByTestId("toggle");
  const outputs = page.getByTestId("pressed-outputs");

  await expect(toggle).toHaveAttribute("type", "button");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).not.toHaveAttribute("data-pressed", /.*/);
  await expect(toggle).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(toggle).not.toHaveAttribute("data-disabled", /.*/);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveAttribute("data-pressed", "");
  await expect(page.getByTestId("toggle-state")).toHaveText("true");
  await expect(outputs).toHaveText("1");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).not.toHaveAttribute("data-pressed", /.*/);
  await expect(outputs).toHaveText("2");
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(outputs).toHaveText("3");
  await expect(page.getByTestId("toggle-submits")).toHaveText("0");

  await page.getByTestId("disable-toggle").click();
  await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  await expect(toggle).toHaveAttribute("data-disabled", "");
  // A trusted click on the native disabled button dispatches nothing.
  await toggle.click({ force: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  // External writes stay authoritative while disabled and emit no model output.
  await page.getByTestId("script-pressed").click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("toggle-state")).toHaveText("false");
  await expect(outputs).toHaveText("3");

  await page.getByTestId("disable-toggle").click();
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(toggle).not.toHaveAttribute("data-disabled", /.*/);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(outputs).toHaveText("4");
});

test("G2: factory and existing Toggle Options drive behavior; descendants share the nearest State", async ({
  page,
}, info) => {
  await fixture(page, "composition", info);

  const factory = page.getByTestId("factory-toggle");
  const factoryObserver = page.getByTestId("factory-toggle-observer");

  // The unused lower model's bound `true` is not merged into the factory replacement.
  await expect(factory).toHaveAttribute("aria-pressed", "false");
  await expect(factoryObserver).toHaveAttribute("data-observed-pressed", "false");
  await page.getByTestId("factory-press").click();
  await expect(factory).toHaveAttribute("aria-pressed", "true");
  await expect(factory).toHaveAttribute("data-pressed", "");
  await expect(factoryObserver).toHaveAttribute("data-observed-pressed", "true");
  await factory.click();
  await expect(factory).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("factory-toggle-state")).toHaveText("false");
  await page.getByTestId("factory-toggle-disable").click();
  await expect(factory).toBeDisabled();
  await expect(factory).toHaveAttribute("aria-disabled", "true");
  await factory.click({ force: true });
  await expect(factory).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("factory-toggle-disable").click();
  await expect(factory).toBeEnabled();
  await factory.click();
  await expect(factory).toHaveAttribute("aria-pressed", "true");
  // Ordinary writable factory signals never fabricate the unused lower model output.
  await expect(page.getByTestId("unused-toggle-outputs")).toHaveText("0");

  const existing = page.getByTestId("consumer-toggle");

  // The consumer's own bound model, not the existing class's default `true`.
  await expect(existing).toHaveAttribute("aria-pressed", "false");
  await existing.click();
  await expect(existing).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("consumer-toggle-observer")).toHaveAttribute(
    "data-observed-pressed",
    "true",
  );
  await expect(page.getByTestId("consumer-pressed")).toHaveText("true");
  await expect(page.getByTestId("consumer-toggle-outputs")).toHaveText("1");
  await page.getByTestId("consumer-toggle-disable").click();
  await expect(existing).toBeDisabled();
  await existing.click({ force: true });
  await expect(page.getByTestId("consumer-toggle-outputs")).toHaveText("1");
  await page.getByTestId("consumer-toggle-disable").click();
  await expect(existing).toBeEnabled();
});

const precedenceCases = ["factory", "existing"];

test("G2: whole Toggle replacements win over the composed Toggle's own inputs", async ({
  page,
}, info) => {
  await fixture(page, "composition", info);

  for (const name of precedenceCases) {
    await test.step(name, async () => {
      const part = (role: string) =>
        page.locator(`[data-toggle-case="${name}"] [data-role="${role}"]`);
      const toggle = part("toggle");

      // Replacement, not the contradicting own `[pressed]="false"` and `[disabled]="true"`.
      await expect(part("pressed")).toHaveText("true");
      await expect(part("disabled")).toHaveText("false");
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await expect(toggle).toBeEnabled();
      await expect(part("shared")).toHaveText("true");
      await expect(part("independent")).toHaveText("true");
      await expect(part("independent-toggle")).toHaveAttribute("aria-pressed", "false");

      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await expect(part("pressed")).toHaveText("false");
      await expect(part("independent-toggle")).toHaveAttribute("aria-pressed", "false");

      await part("disable").click();
      await expect(toggle).toBeDisabled();
      await expect(toggle).toHaveAttribute("aria-disabled", "true");
      await expect(toggle).toHaveAttribute("data-disabled", "");
      await part("external").click();
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await part("disable").click();
      await expect(toggle).toBeEnabled();
      // Replacement writes never emit the composed Toggle's unused model output.
      await expect(part("outputs")).toHaveText("0");
    });
  }
});
