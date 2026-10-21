import type { Page, TestInfo } from "playwright/test";
import { expect } from "./contract-test.js";
import { fixture } from "./observation.js";

/**
 * Checkbox (J) and Switch (W) share their contract except for role and Enter, so their cases
 * share bodies; each fixture route renders the same test IDs.
 */
export type BooleanControl = {
  readonly route: "checkbox" | "switch";
  readonly role: "checkbox" | "switch";
  /** Switch lets a button's Enter activation through; Checkbox suppresses it (APG). */
  readonly enterToggles: boolean;
};

export const checkboxControl: BooleanControl = {
  route: "checkbox",
  role: "checkbox",
  enterToggles: false,
};
export const switchControl: BooleanControl = {
  route: "switch",
  role: "switch",
  enterToggles: true,
};

const formAria = ["aria-invalid", "aria-required", "aria-readonly"];

/** Standalone two-way model, keys, State, disabled and focusable disabled, static ARIA kept. */
export async function standaloneCase(
  page: Page,
  info: TestInfo,
  control: BooleanControl,
): Promise<void> {
  await fixture(page, control.route, info);

  const standalone = page.getByTestId("standalone");
  const value = page.getByTestId("standalone-value");
  const outputs = page.getByTestId("standalone-outputs");

  await expect(standalone).toHaveAttribute("role", control.role);
  await expect(standalone).toHaveAttribute("type", "button");
  await expect(standalone).toHaveAttribute("aria-checked", "false");
  await expect(standalone).not.toHaveAttribute("data-checked", /.*/);
  await expect(standalone).toHaveAttribute("id", /\S/);
  // Outside a Field: the consumer's static aria-describedby stays and no form ARIA is added.
  await expect(standalone).toHaveAttribute("aria-describedby", "standalone-hint");

  for (const attribute of [...formAria, "aria-disabled", "data-disabled", "disabled"]) {
    await expect(standalone).not.toHaveAttribute(attribute, /.*/);
  }

  await expect(page.getByRole(control.role, { name: "Remember me" })).toHaveAttribute(
    "data-testid",
    "standalone",
  );
  await expect(standalone).toHaveAccessibleDescription("Stay signed in on this device.");
  await expect(page.getByTestId("standalone-state")).toHaveText("false false");

  // A click flips the model once and emits once.
  await standalone.click();
  await expect(standalone).toHaveAttribute("aria-checked", "true");
  await expect(standalone).toHaveAttribute("data-checked", "");
  await expect(value).toHaveText("true");
  await expect(outputs).toHaveText("1");
  await expect(page.getByTestId("standalone-state")).toHaveText("true false");
  await expect(page.getByTestId("standalone-probe")).toHaveAttribute("data-checked-state", "true");

  // Space is native button activation.
  await standalone.focus();
  await page.keyboard.press("Space");
  await expect(standalone).toHaveAttribute("aria-checked", "false");
  await expect(value).toHaveText("false");
  await expect(outputs).toHaveText("2");

  await page.keyboard.press("Enter");

  if (control.enterToggles) {
    await expect(standalone).toHaveAttribute("aria-checked", "true");
    await expect(value).toHaveText("true");
    await expect(outputs).toHaveText("3");
    await page.keyboard.press("Enter");
    await expect(value).toHaveText("false");
    await expect(outputs).toHaveText("4");
  } else {
    await expect(outputs).toHaveText("2");
    await expect(standalone).toHaveAttribute("aria-checked", "false");
    await expect(value).toHaveText("false");
  }

  const emitted = await outputs.textContent();

  // An external write drives the control and emits nothing.
  await page.getByTestId("write-standalone").click();
  await expect(value).toHaveText("true");
  await expect(standalone).toHaveAttribute("aria-checked", "true");
  await expect(outputs).toHaveText(emitted ?? "");

  // Natively disabled: no activation reaches it.
  const disabled = page.getByTestId("disabled");
  const disabledValue = page.getByTestId("disabled-value");

  await expect(disabled).toBeDisabled();
  await expect(disabled).toHaveAttribute("aria-disabled", "true");
  await expect(disabled).toHaveAttribute("data-disabled", "");
  await disabled.click({ force: true });
  await expect(disabledValue).toHaveText("false");

  // Focusable disabled: the consumer's own click listener runs, the control ignores it.
  const focusable = page.getByTestId("focusable-disabled");

  await expect(focusable).toHaveJSProperty("disabled", false);
  await expect(focusable).toHaveAttribute("aria-disabled", "true");
  await expect(focusable).toHaveAttribute("data-disabled", "");
  // Actionability treats aria-disabled as disabled; the trusted click still reaches the button.
  await focusable.click({ force: true });
  await expect(page.getByTestId("own-clicks")).toHaveText("1");
  await expect(disabledValue).toHaveText("false");
  await focusable.focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("own-clicks")).toHaveText("2");
  await expect(focusable).toHaveAttribute("aria-checked", "false");

  // External writes stay authoritative while disabled.
  await page.getByTestId("write-disabled").click();
  await expect(disabledValue).toHaveText("true");
  await expect(disabled).toHaveAttribute("aria-checked", "true");
  await expect(focusable).toHaveAttribute("aria-checked", "true");
}

/** Inside a Field: `for`, the accessible name, label clicks, Description, Label after the control. */
export async function fieldCase(
  page: Page,
  info: TestInfo,
  control: BooleanControl,
): Promise<void> {
  await fixture(page, control.route, info);

  const terms = page.getByTestId("terms");
  const label = page.getByTestId("terms-label");

  await expect(terms).toHaveAttribute("id", "terms");
  await expect(label).toHaveAttribute("for", "terms");
  await expect(label).toHaveAttribute("id", /\S/);
  // The Field's Description replaces the static aria-describedby.
  await expect(terms).toHaveAttribute("aria-describedby", "terms-description");
  await expect(page.getByRole(control.role, { name: "Accept the terms" })).toHaveAttribute(
    "data-testid",
    "terms",
  );
  await expect(terms).toHaveAccessibleDescription("You can withdraw at any time.");

  // No [formField]: no form ARIA, and the Field root has no data attributes.
  for (const attribute of formAria) {
    await expect(terms).not.toHaveAttribute(attribute, /.*/);
  }

  for (const attribute of ["data-invalid", "data-disabled", "data-required", "role"]) {
    await expect(page.getByTestId("terms-field")).not.toHaveAttribute(attribute, /.*/);
  }

  // A label click activates the button.
  await label.click();
  await expect(terms).toHaveAttribute("aria-checked", "true");
  await label.click();
  await expect(terms).toHaveAttribute("aria-checked", "false");

  await page.getByTestId("rename-terms").click();
  await expect(terms).toHaveAttribute("id", "renamed-terms");
  await expect(label).toHaveAttribute("for", "renamed-terms");
  await expect(page.getByRole(control.role, { name: "Accept the terms" })).toHaveAttribute(
    "data-testid",
    "terms",
  );

  // A Label after the control.
  const subscribe = page.getByTestId("subscribe");
  const subscribeLabel = page.getByTestId("subscribe-label");

  await expect(subscribe).toHaveAttribute("id", "subscribe");
  await expect(subscribeLabel).toHaveAttribute("for", "subscribe");
  await expect(
    page.getByRole(control.role, { name: "Subscribe to the newsletter" }),
  ).toHaveAttribute("data-testid", "subscribe");
  await expect(subscribe).not.toHaveAttribute("aria-describedby", /.*/);
  await subscribeLabel.click();
  await expect(subscribe).toHaveAttribute("aria-checked", "true");
}

/** Signal Forms: model both ways, touch, errors, required, readonly, disabled, focus and reset. */
export async function signalFormsCase(
  page: Page,
  info: TestInfo,
  control: BooleanControl,
): Promise<void> {
  await fixture(page, control.route, info);

  const field = page.getByTestId("consent-field");
  const consent = page.getByTestId("consent");
  const value = page.getByTestId("consent-value");
  const touched = page.getByTestId("consent-touched");

  // Initial values come from the model; required reaches ARIA and the Field, nothing is shown.
  await expect(consent).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("updates")).toHaveAttribute("aria-checked", "true");
  await expect(consent).toHaveAttribute("aria-required", "true");
  await expect(field).toHaveAttribute("data-required", "");
  await expect(consent).toHaveAttribute("aria-describedby", "consent-description");
  await expect(consent).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(consent).not.toHaveAttribute("aria-readonly", /.*/);
  await expect(field).not.toHaveAttribute("data-invalid", /.*/);
  await expect(page.getByTestId("updates")).not.toHaveAttribute("aria-required", /.*/);
  await expect(
    page.getByRole(control.role, { name: "I agree to the privacy policy" }),
  ).toHaveAttribute("data-testid", "consent");

  // A user change updates the model without touching.
  await consent.click();
  await expect(value).toHaveText("true");
  await expect(consent).toHaveAttribute("aria-checked", "true");
  await expect(touched).toHaveText("false");

  // Blur emits touch.
  await consent.focus();
  await consent.blur();
  await expect(touched).toHaveText("true");
  await expect(consent).not.toHaveAttribute("aria-invalid", /.*/);

  // A programmatic model write reaches the control; the touched, now invalid field shows errors.
  await page.getByTestId("write-consent").click();
  await expect(value).toHaveText("false");
  await expect(consent).toHaveAttribute("aria-checked", "false");
  await expect(consent).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAttribute("data-invalid", "");
  await expect(consent).toHaveAttribute("aria-describedby", "consent-description consent-error");
  await expect(consent).toHaveAccessibleDescription(
    "Required to continue. Accept the privacy policy to continue.",
  );
  await consent.click();
  await expect(value).toHaveText("true");
  await expect(consent).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(consent).toHaveAttribute("aria-describedby", "consent-description");
  await consent.click();
  await expect(consent).toHaveAttribute("aria-invalid", "true");

  // reset() untouches the field, so its errors hide; the value stays.
  await page.getByTestId("reset-consent").click();
  await expect(touched).toHaveText("false");
  await expect(consent).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(field).not.toHaveAttribute("data-invalid", /.*/);
  await expect(value).toHaveText("false");

  // submit() touches everything and shows the errors without running the action.
  await page.getByTestId("submit-account").click();
  await expect(touched).toHaveText("true");
  await expect(consent).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("submits")).toHaveText("0");

  // focusBoundControl() focuses the button.
  await page.getByTestId("focus-consent").click();
  await expect(consent).toBeFocused();

  // readonly(): user writes are dropped and aria-readonly reports it.
  const updates = page.getByTestId("updates");
  const updatesValue = page.getByTestId("updates-value");

  await page.getByTestId("freeze-updates").click();
  await expect(updates).toHaveAttribute("aria-readonly", "true");
  await expect(updates).toBeEnabled();
  await updates.click();
  await expect(updatesValue).toHaveText("true");
  await updates.focus();
  await page.keyboard.press("Space");
  await expect(updatesValue).toHaveText("true");
  await expect(updates).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("freeze-updates").click();
  await expect(updates).not.toHaveAttribute("aria-readonly", /.*/);
  await updates.click();
  await expect(updatesValue).toHaveText("false");

  // disabled(): native disabled through ogButton, and the Field's data-disabled.
  await page.getByTestId("lock-updates").click();
  await expect(updates).toBeDisabled();
  await expect(updates).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("updates-field")).toHaveAttribute("data-disabled", "");
  await page.getByTestId("lock-updates").click();
  await expect(updates).toBeEnabled();
  await expect(page.getByTestId("updates-field")).not.toHaveAttribute("data-disabled", /.*/);
}

/**
 * The falsifier: a consumer component composing the control through `hostDirectives` and exposing
 * `checked`, `checkedChange`, `disabled` and `touch` is the control `[formField]` finds, and the
 * composed control reads `FORM_FIELD` on its element.
 */
export async function composedCase(
  page: Page,
  info: TestInfo,
  control: BooleanControl,
): Promise<void> {
  await fixture(page, control.route, info);

  const field = page.getByTestId("composed-field");
  const composed = page.getByTestId("composed");
  const value = page.getByTestId("composed-value");

  await expect(composed).toHaveAttribute("role", control.role);
  await expect(composed).toHaveAttribute("aria-checked", "false");
  // FORM_FIELD reached the composed control: required in its ARIA and in the Field.
  await expect(composed).toHaveAttribute("aria-required", "true");
  await expect(field).toHaveAttribute("data-required", "");
  await expect(page.getByRole(control.role, { name: "Composed consent" })).toHaveAttribute(
    "data-testid",
    "composed",
  );
  await expect(page.getByTestId("composed-touched")).toHaveText("false");

  await composed.click();
  await expect(value).toHaveText("true");
  await expect(composed).toHaveAttribute("aria-checked", "true");

  await composed.focus();
  await composed.blur();
  await expect(page.getByTestId("composed-touched")).toHaveText("true");

  await page.getByTestId("write-composed").click();
  await expect(value).toHaveText("false");
  await expect(composed).toHaveAttribute("aria-checked", "false");
  await expect(composed).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAttribute("data-invalid", "");
  await expect(composed).toHaveAttribute("aria-describedby", "composed-error");

  await page.getByTestId("freeze-composed").click();
  await expect(composed).toHaveAttribute("aria-readonly", "true");
  await composed.click();
  await expect(value).toHaveText("false");
  await page.getByTestId("freeze-composed").click();
  await expect(composed).not.toHaveAttribute("aria-readonly", /.*/);

  await page.getByTestId("lock-composed").click();
  await expect(composed).toBeDisabled();
  await expect(field).toHaveAttribute("data-disabled", "");
  await page.getByTestId("lock-composed").click();
  await expect(composed).toBeEnabled();
  await composed.click();
  await expect(value).toHaveText("true");
}

/** Factory and existing Options replace the exposed own inputs and drive every host binding. */
export async function replacementCase(
  page: Page,
  info: TestInfo,
  control: BooleanControl,
): Promise<void> {
  await fixture(page, control.route, info);

  const replaced = page.getByTestId("replaced");
  const label = page.getByTestId("replaced-label");
  const value = page.getByTestId("replaced-value");

  await expect(replaced).toHaveAttribute("id", `replaced-${control.route}`);
  await expect(label).toHaveAttribute("for", `replaced-${control.route}`);
  await expect(replaced).toHaveAttribute("aria-checked", "true");
  await expect(replaced).toHaveAttribute("data-checked", "");
  await expect(page.getByRole(control.role, { name: "Replaced" })).toHaveAttribute(
    "data-testid",
    "replaced",
  );

  // The replacement owns the value; the unused own model emits nothing.
  await replaced.click();
  await expect(value).toHaveText("false");
  await expect(replaced).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("replaced-outputs")).toHaveText("0");

  await page.getByTestId("disable-replaced").click();
  await expect(replaced).toBeDisabled();
  await expect(replaced).toHaveAttribute("aria-disabled", "true");
  await page.getByTestId("focusable-replaced").click();
  await expect(replaced).toHaveJSProperty("disabled", false);
  await expect(replaced).toHaveAttribute("aria-disabled", "true");
  await replaced.click({ force: true });
  await expect(value).toHaveText("false");
  await page.getByTestId("disable-replaced").click();
  await expect(replaced).not.toHaveAttribute("aria-disabled", /.*/);
  await replaced.click();
  await expect(value).toHaveText("true");

  await page.getByTestId("rename-replaced").click();
  await expect(replaced).toHaveAttribute("id", `replaced-${control.route}-2`);
  await expect(label).toHaveAttribute("for", `replaced-${control.route}-2`);

  const existing = page.getByTestId("existing");

  await expect(existing).toHaveAttribute("id", `existing-${control.route}`);
  await expect(existing).toHaveAttribute("aria-checked", "false");
  await existing.click();
  await expect(existing).toHaveAttribute("aria-checked", "true");
}
