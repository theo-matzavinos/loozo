import type { Locator } from "playwright/test";
import { test, expect } from "./contract-test.js";
import { fieldWithTooltipCase } from "./co-applied-description.js";
import { fixture } from "./observation.js";

test("G1: native click/Enter/Space flip checked exactly once, form type, disabled blocks only user activation", async ({
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
  await expect(factoryObserver).toHaveAttribute("data-observed-checked", "false");
  await page.getByTestId("factory-press").click();
  await expect(factory).toHaveAttribute("aria-pressed", "true");
  await expect(factory).toHaveAttribute("data-pressed", "");
  await expect(factoryObserver).toHaveAttribute("data-observed-checked", "true");
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
    "data-observed-checked",
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

      // Replacement, not the contradicting own `[checked]="false"` and `[disabled]="true"`.
      await expect(part("checked")).toHaveText("true");
      await expect(part("disabled")).toHaveText("false");
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await expect(toggle).toBeEnabled();
      await expect(part("shared")).toHaveText("true");
      await expect(part("independent")).toHaveText("true");
      await expect(part("independent-toggle")).toHaveAttribute("aria-pressed", "false");

      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await expect(part("checked")).toHaveText("false");
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

/** ARIA doesn't support these on a button, so a Toggle never binds them; the Field carries them. */
const unsupportedAria = ["aria-invalid", "aria-required", "aria-readonly"];

async function expectNoFormAria(toggle: Locator): Promise<void> {
  for (const attribute of unsupportedAria) {
    await expect(toggle).not.toHaveAttribute(attribute, /.*/);
  }
}

test("G4: a standalone Toggle has a generated id, keeps a static aria-describedby and emits touch on blur; inside a Field the Label names it with for, before and after it, giving its accessible name; a label click toggles it; the Description replaces the static aria-describedby", async ({
  page,
}, info) => {
  await fixture(page, "toggle", info);

  const standalone = page.getByTestId("standalone");

  await expect(standalone).toHaveAttribute("id", /\S/);
  await expect(standalone).toHaveAttribute("aria-pressed", "false");
  await expect(standalone).not.toHaveAttribute("role", /.*/);
  await expect(standalone).not.toHaveAttribute("aria-checked", /.*/);
  await expect(standalone).toHaveAttribute("aria-describedby", "standalone-hint");
  await expectNoFormAria(standalone);
  await expect(page.getByRole("button", { name: "Bold", exact: true })).toHaveAttribute(
    "data-testid",
    "standalone",
  );
  await standalone.click();
  await expect(page.getByTestId("standalone-value")).toHaveText("true");
  await expect(standalone).toHaveAttribute("aria-pressed", "true");
  await standalone.focus();
  await standalone.blur();
  await expect(page.getByTestId("standalone-touches")).toHaveText("1");

  const mute = page.getByTestId("mute");
  const label = page.getByTestId("mute-label");

  await expect(mute).toHaveAttribute("id", "mute");
  await expect(label).toHaveAttribute("for", "mute");
  await expect(mute).toHaveAttribute("aria-describedby", "mute-description");
  await expect(page.getByRole("button", { name: "Mute notifications" })).toHaveAttribute(
    "data-testid",
    "mute",
  );
  await expect(mute).toHaveAccessibleDescription("You can unmute at any time.");
  await expectNoFormAria(mute);

  for (const attribute of ["data-invalid", "data-disabled", "data-required", "role"]) {
    await expect(page.getByTestId("mute-field")).not.toHaveAttribute(attribute, /.*/);
  }

  // A label click activates the button.
  await label.click();
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("mute-value")).toHaveText("true");
  await label.click();
  await expect(mute).toHaveAttribute("aria-pressed", "false");

  await page.getByTestId("rename-mute").click();
  await expect(mute).toHaveAttribute("id", "renamed-mute");
  await expect(label).toHaveAttribute("for", "renamed-mute");
  await expect(page.getByRole("button", { name: "Mute notifications" })).toHaveAttribute(
    "data-testid",
    "mute",
  );

  // A Label after the control.
  const pin = page.getByTestId("pin");
  const pinLabel = page.getByTestId("pin-label");

  await expect(pin).toHaveAttribute("id", "pin");
  await expect(pinLabel).toHaveAttribute("for", "pin");
  await expect(page.getByRole("button", { name: "Pin the conversation" })).toHaveAttribute(
    "data-testid",
    "pin",
  );
  await expect(pin).not.toHaveAttribute("aria-describedby", /.*/);
  await pinLabel.click();
  await expect(pin).toHaveAttribute("aria-pressed", "true");
});

test("G5: with [formField] the Toggle shows the initial value, writes user changes, follows model writes, emits touch on blur, shows required errors through the Field after blur and submit(), resets, takes focus from focusBoundControl(), drops user writes while readonly and is natively disabled by disabled(); it never binds aria-invalid, aria-required or aria-readonly", async ({
  page,
}, info) => {
  await fixture(page, "toggle", info);

  const field = page.getByTestId("bold-field");
  const bold = page.getByTestId("bold");
  const value = page.getByTestId("bold-value");
  const touched = page.getByTestId("bold-touched");
  const shown = page.getByTestId("bold-errors-shown");

  // Initial values come from the model; required reaches the Field, nothing is shown.
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("italic")).toHaveAttribute("aria-pressed", "true");
  await expect(field).toHaveAttribute("data-required", "");
  await expect(field).not.toHaveAttribute("data-invalid", /.*/);
  await expect(bold).toHaveAttribute("aria-describedby", "bold-description");
  await expectNoFormAria(bold);
  await expect(page.getByRole("button", { name: "Bold headings" })).toHaveAttribute(
    "data-testid",
    "bold",
  );

  // A user change updates the model without touching.
  await bold.click();
  await expect(value).toHaveText("true");
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(touched).toHaveText("false");

  // Blur emits touch.
  await bold.focus();
  await bold.blur();
  await expect(touched).toHaveText("true");
  await expect(shown).toHaveText("false");

  // A programmatic model write reaches the control; the touched, now invalid field shows errors.
  await page.getByTestId("write-bold").click();
  await expect(value).toHaveText("false");
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await expect(shown).toHaveText("true");
  await expect(field).toHaveAttribute("data-invalid", "");
  await expect(bold).toHaveAttribute("aria-describedby", "bold-description bold-error");
  await expect(bold).toHaveAccessibleDescription(
    "Headings need emphasis. Turn bold headings on to continue.",
  );
  await expectNoFormAria(bold);
  await bold.click();
  await expect(value).toHaveText("true");
  await expect(field).not.toHaveAttribute("data-invalid", /.*/);
  await expect(bold).toHaveAttribute("aria-describedby", "bold-description");
  await bold.click();
  await expect(field).toHaveAttribute("data-invalid", "");

  // reset() untouches the field, so its errors hide; the value stays.
  await page.getByTestId("reset-bold").click();
  await expect(touched).toHaveText("false");
  await expect(field).not.toHaveAttribute("data-invalid", /.*/);
  await expect(value).toHaveText("false");

  // submit() touches everything and shows the errors without running the action.
  await page.getByTestId("submit-format").click();
  await expect(touched).toHaveText("true");
  await expect(field).toHaveAttribute("data-invalid", "");
  await expect(page.getByTestId("submits")).toHaveText("0");

  // focusBoundControl() focuses the button.
  await page.getByTestId("focus-bold").click();
  await expect(bold).toBeFocused();

  // readonly(): user writes are dropped; the Toggle stays enabled and binds no aria-readonly.
  const italic = page.getByTestId("italic");
  const italicValue = page.getByTestId("italic-value");

  await page.getByTestId("freeze-italic").click();
  await expect(italic).toBeEnabled();
  await expectNoFormAria(italic);
  await italic.click();
  await expect(italicValue).toHaveText("true");
  await italic.focus();
  await page.keyboard.press("Space");
  await expect(italicValue).toHaveText("true");
  await page.keyboard.press("Enter");
  await expect(italicValue).toHaveText("true");
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("freeze-italic").click();
  await italic.click();
  await expect(italicValue).toHaveText("false");
  // Enter keeps native button activation.
  await italic.focus();
  await page.keyboard.press("Enter");
  await expect(italicValue).toHaveText("true");

  // disabled(): native disabled through ogButton, and the Field's data-disabled.
  await page.getByTestId("lock-italic").click();
  await expect(italic).toBeDisabled();
  await expect(italic).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("italic-field")).toHaveAttribute("data-disabled", "");
  await page.getByTestId("lock-italic").click();
  await expect(italic).toBeEnabled();
  await expect(page.getByTestId("italic-field")).not.toHaveAttribute("data-disabled", /.*/);
});

test("G6: a consumer component composing the Toggle through hostDirectives with exposed checked, checkedChange, disabled and touch is the control [formField] finds, and the Toggle reads FORM_FIELD on its element", async ({
  page,
}, info) => {
  await fixture(page, "toggle", info);

  const field = page.getByTestId("composed-field");
  const composed = page.getByTestId("composed");
  const value = page.getByTestId("composed-value");

  await expect(composed).toHaveAttribute("aria-pressed", "false");
  // The Field reads the form state through the composed Toggle's registration.
  await expect(field).toHaveAttribute("data-required", "");
  await expect(page.getByRole("button", { name: "Underline links" })).toHaveAttribute(
    "data-testid",
    "composed",
  );
  await expect(page.getByTestId("composed-touched")).toHaveText("false");

  await composed.click();
  await expect(value).toHaveText("true");
  await expect(composed).toHaveAttribute("aria-pressed", "true");

  await composed.focus();
  await composed.blur();
  await expect(page.getByTestId("composed-touched")).toHaveText("true");

  await page.getByTestId("write-composed").click();
  await expect(value).toHaveText("false");
  await expect(composed).toHaveAttribute("aria-pressed", "false");
  await expect(field).toHaveAttribute("data-invalid", "");
  await expect(composed).toHaveAttribute("aria-describedby", "composed-error");
  await expectNoFormAria(composed);

  // The Toggle reads the readonly rule from FORM_FIELD on its own element.
  await page.getByTestId("freeze-composed").click();
  await composed.click();
  await expect(value).toHaveText("false");
  await page.getByTestId("freeze-composed").click();

  await page.getByTestId("lock-composed").click();
  await expect(composed).toBeDisabled();
  await expect(field).toHaveAttribute("data-disabled", "");
  await page.getByTestId("lock-composed").click();
  await expect(composed).toBeEnabled();
  await composed.click();
  await expect(value).toHaveText("true");
});

test("G7: ToggleGroup Items and Toolbar Toggles inside a Field never join it: the Label names nothing, their static aria-describedby stays and the Field has no form state; items and Toolbar Toggles keep a static id, bind their id input or get a generated one", async ({
  page,
}, info) => {
  await fixture(page, "toggle", info);

  const left = page.getByTestId("align-left");
  const center = page.getByTestId("align-center");
  const right = page.getByTestId("align-right");

  await expect(page.getByTestId("group-label")).not.toHaveAttribute("for", /.*/);
  await expect(left).toHaveAttribute("id", "align-left");
  await expect(center).toHaveAttribute("id", /\S/);
  await expect(right).toHaveAttribute("id", "align-right");
  await expect(left).toHaveAttribute("aria-describedby", "alignment-note");
  await expect(center).not.toHaveAttribute("aria-describedby", /.*/);

  for (const item of [left, center, right]) {
    await expectNoFormAria(item);
  }

  for (const attribute of ["data-invalid", "data-disabled", "data-required"]) {
    await expect(page.getByTestId("group-field")).not.toHaveAttribute(attribute, /.*/);
  }

  // The group still presses its items.
  await right.click();
  await expect(page.getByTestId("alignment-value")).toHaveText("right");
  await expect(right).toHaveAttribute("aria-pressed", "true");
  await expect(left).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("rename-right").click();
  await expect(right).toHaveAttribute("id", "align-right-2");
  await expect(right).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("group-label")).not.toHaveAttribute("for", /.*/);

  const spelling = page.getByTestId("toolbar-toggle");
  const grammar = page.getByTestId("toolbar-toggle-generated");

  await expect(page.getByTestId("toolbar-label")).not.toHaveAttribute("for", /.*/);
  await expect(spelling).toHaveAttribute("id", "spelling");
  await expect(grammar).toHaveAttribute("id", /\S/);
  await expect(spelling).toHaveAttribute("aria-describedby", "alignment-note");
  await expect(grammar).not.toHaveAttribute("aria-describedby", /.*/);
  await spelling.click();
  await expect(page.getByTestId("spelling-value")).toHaveText("true");
  await expect(spelling).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("rename-spelling").click();
  await expect(spelling).toHaveAttribute("id", "spelling-2");
  await expect(page.getByTestId("toolbar-label")).not.toHaveAttribute("for", /.*/);
});

test("G9: a Toggle co-applied with a Tooltip Trigger inside a Field has one aria-describedby naming the Field's IDs and the Content's in registration order, from server HTML on, in both directive orders; each side's change keeps the other's IDs", async ({
  page,
}, info) => {
  await fieldWithTooltipCase(page, info, "toggle");
});
