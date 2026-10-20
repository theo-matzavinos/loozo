import { test, expect } from "./contract-test.js";
import { fixture } from "./observation.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

test("M1: Labels name their control with for, before or after it; aria-describedby names the Description and replaces a static one; IDs follow bound changes and mounting", async ({
  page,
}, info) => {
  await fixture(page, "field", info);

  const nameLabel = page.getByTestId("name-label");
  const name = page.getByTestId("name-control");
  const nameDescription = page.getByTestId("name-description");
  const descriptionId = await nameDescription.getAttribute("id");

  expect(descriptionId).toMatch(/\S/);
  await expect(name).toHaveAttribute("id", "name");
  await expect(nameLabel).toHaveAttribute("for", "name");
  await expect(nameLabel).toHaveAttribute("id", /\S/);
  // The Field's Description replaces the consumer's static value.
  await expect(name).toHaveAttribute("aria-describedby", descriptionId ?? "");
  await expect(name).toHaveAccessibleName("Display name");
  await expect(name).toHaveAccessibleDescription("Shown on your profile.");

  // Without [formField] there is no form state to reflect; aria-required and aria-readonly never.
  for (const attribute of ["aria-invalid", "aria-required", "aria-readonly"]) {
    await expect(name).not.toHaveAttribute(attribute, /.*/);
  }

  for (const attribute of ["data-invalid", "data-disabled", "data-required", "role"]) {
    await expect(page.getByTestId("name-field")).not.toHaveAttribute(attribute, /.*/);
  }

  await nameLabel.click();
  await expect(name).toBeFocused();
  await page.getByTestId("rename-control").click();
  await expect(name).toHaveAttribute("id", "renamed-name");
  await expect(nameLabel).toHaveAttribute("for", "renamed-name");
  await expect(name).toHaveAccessibleName("Display name");

  // A Label after its control, both with static IDs.
  const newsletterLabel = page.getByTestId("newsletter-label");
  const newsletter = page.getByTestId("newsletter-control");

  await expect(newsletter).toHaveAttribute("id", "newsletter");
  await expect(newsletterLabel).toHaveAttribute("id", "newsletter-label");
  await expect(newsletterLabel).toHaveAttribute("for", "newsletter");
  await expect(newsletter).toHaveAccessibleName("Newsletter");
  await expect(newsletter).not.toHaveAttribute("aria-describedby", /.*/);
  await newsletterLabel.click();
  await expect(newsletter).toBeChecked();

  // A native select with a generated ID.
  const country = page.getByTestId("country-control");
  const countryId = await country.getAttribute("id");

  expect(countryId).toMatch(/\S/);
  await expect(page.getByTestId("country-label")).toHaveAttribute("for", countryId ?? "");
  await expect(country).toHaveAccessibleName("Country");

  // A control mounted later and removed again.
  const lateLabel = page.getByTestId("late-label");

  await expect(lateLabel).not.toHaveAttribute("for", /.*/);
  await page.getByTestId("toggle-late-control").click();

  const late = page.getByTestId("late-control");
  const lateId = await late.getAttribute("id");

  expect(lateId).toMatch(/\S/);
  await expect(lateLabel).toHaveAttribute("for", lateId ?? "");
  await expect(late).toHaveAccessibleName("Late control");
  await page.getByTestId("toggle-late-control").click();
  await expect(late).toHaveCount(0);
  await expect(lateLabel).not.toHaveAttribute("for", /.*/);
});

test("M2: aria-describedby names the Descriptions, then the mounted Errors, each in registration order; an Error leaves and re-enters as it unmounts and mounts", async ({
  page,
}, info) => {
  await fixture(page, "field", info);

  const code = page.getByTestId("code-control");

  await expect(code).toHaveAttribute(
    "aria-describedby",
    "code-first-description code-second-description code-first-error code-second-error",
  );
  await expect(code).toHaveAccessibleDescription(
    "Six digits. From your authenticator app. Too short. Digits only.",
  );
  await page.getByTestId("toggle-first-error").click();
  await expect(code).toHaveAttribute(
    "aria-describedby",
    "code-first-description code-second-description code-second-error",
  );
  await page.getByTestId("toggle-first-error").click();
  // It registers again, after the Error that stayed mounted.
  await expect(code).toHaveAttribute(
    "aria-describedby",
    "code-first-description code-second-description code-second-error code-first-error",
  );
});

test("M3: with [formField], errors show after blur and after submit(); required and disabled reach the Field, and Angular's native handling keeps working with no duplicated ARIA", async ({
  page,
}, info) => {
  await fixture(page, "field", info);

  const field = page.getByTestId("email-field");
  const control = page.getByTestId("email-control");
  const probe = page.getByTestId("email-probe");
  const error = page.getByTestId("email-error");

  // Required and invalid, but untouched: nothing shown.
  await expect(field).toHaveAttribute("data-required", "");
  await expect(field).not.toHaveAttribute("data-invalid", /.*/);
  await expect(field).not.toHaveAttribute("data-disabled", /.*/);
  // Native required, which ARIA in HTML says not to repeat with aria-required.
  await expect(control).toHaveAttribute("required", "");
  await expect(control).not.toHaveAttribute("aria-required", /.*/);
  await expect(control).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(control).not.toHaveAttribute("aria-readonly", /.*/);
  await expect(control).toHaveAttribute("aria-describedby", "email-description");
  await expect(page.getByTestId("email-state")).toHaveText("true false true false");
  await expect(probe).toHaveAttribute("data-errors-shown", "false");
  await expect(probe).toHaveAttribute("data-error-kinds", "required");
  await expect(error).toHaveCount(0);

  // Native value handling; typing alone doesn't touch.
  await control.fill("not-an-email");
  await expect(page.getByTestId("email-value")).toHaveText("not-an-email");
  await expect(probe).toHaveAttribute("data-error-kinds", "email");
  await expect(probe).toHaveAttribute("data-touched", "false");
  await expect(error).toHaveCount(0);

  // Blur touches through Angular's native handling. Focus goes nowhere else: no other field is touched.
  await control.blur();
  await expect(probe).toHaveAttribute("data-touched", "true");
  await expect(field).toHaveAttribute("data-invalid", "");
  await expect(control).toHaveAttribute("aria-invalid", "true");
  await expect(error).toHaveText("Enter a valid email.");
  await expect(control).toHaveAttribute("aria-describedby", "email-description email-error");
  await expect(control).toHaveAccessibleDescription("We never share it. Enter a valid email.");

  await control.fill("me@example.com");
  await expect(page.getByTestId("email-value")).toHaveText("me@example.com");
  await expect(error).toHaveCount(0);
  await expect(field).not.toHaveAttribute("data-invalid", /.*/);
  await expect(control).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(control).toHaveAttribute("aria-describedby", "email-description");
  await expect(probe).toHaveAttribute("data-error-kinds", "");
  await expect(field).toHaveAttribute("data-required", "");

  // submit() touches the untouched, empty, required nickname and runs no action.
  const nicknameField = page.getByTestId("nickname-field");
  const nickname = page.getByTestId("nickname-control");

  await expect(nicknameField).not.toHaveAttribute("data-invalid", /.*/);
  await expect(nickname).not.toHaveAttribute("aria-describedby", /.*/);
  await page.getByTestId("submit-account").click();
  await expect(nicknameField).toHaveAttribute("data-invalid", "");
  await expect(nickname).toHaveAttribute("aria-invalid", "true");
  await expect(nickname).toHaveAttribute("aria-describedby", "nickname-error");
  await expect(page.getByTestId("submits")).toHaveText("0");

  // readonly(): native readonly without aria-readonly; a readonly field isn't validated.
  await page.getByTestId("freeze-nickname").click();
  await expect(nickname).toHaveAttribute("readonly", "");
  await expect(nickname).not.toHaveAttribute("aria-readonly", /.*/);
  await expect(nickname).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(nicknameField).not.toHaveAttribute("data-invalid", /.*/);
  await page.getByTestId("freeze-nickname").click();
  await expect(nickname).not.toHaveAttribute("readonly", /.*/);
  await expect(nickname).not.toHaveAttribute("aria-readonly", /.*/);
  await expect(nickname).toHaveAttribute("aria-invalid", "true");

  // disabled(): native disabled and the Field's data-disabled; a native select keeps its value.
  const planField = page.getByTestId("plan-field");
  const plan = page.getByTestId("plan-control");

  await plan.selectOption("team");
  await expect(page.getByTestId("plan-value")).toHaveText("team");
  await page.getByTestId("lock-plan").click();
  await expect(plan).toBeDisabled();
  await expect(planField).toHaveAttribute("data-disabled", "");
  await page.getByTestId("lock-plan").click();
  await expect(plan).toBeEnabled();
  await expect(planField).not.toHaveAttribute("data-disabled", /.*/);
  await expect(plan).toHaveValue("team");
});

test("M4: parts join the nearest Field; outside a Field parts keep their static attributes, from the template or a composing directive's host; a second control is reported through ErrorHandler and ignored", async ({
  page,
  runtimeErrors,
  drainIssues,
}, info) => {
  const message = "Field supports only one control.";

  runtimeErrors.expectExactly([
    {
      description: "one duplicate-control Error reported through ErrorHandler",
      matches: (record) => {
        if (record.source !== "console") {
          return false;
        }

        for (const argument of record.arguments ?? []) {
          if (isRecord(argument) && argument.message === message) {
            return true;
          }
        }

        return false;
      },
    },
  ]);
  await fixture(page, "field", info);

  const outer = page.getByTestId("outer-control");
  const inner = page.getByTestId("inner-control");
  const outerId = await outer.getAttribute("id");
  const innerId = await inner.getAttribute("id");

  expect(outerId).toMatch(/\S/);
  expect(innerId).toMatch(/\S/);
  expect(innerId).not.toBe(outerId);
  await expect(page.getByTestId("outer-label")).toHaveAttribute("for", outerId ?? "");
  await expect(page.getByTestId("inner-label")).toHaveAttribute("for", innerId ?? "");
  await expect(outer).toHaveAttribute("aria-describedby", "outer-description");
  await expect(inner).toHaveAttribute("aria-describedby", "inner-description");

  const outsideLabel = page.getByTestId("outside-label");
  const outside = page.getByTestId("outside-control");

  await expect(outsideLabel).toHaveAttribute("for", "consumer-for");
  await expect(outsideLabel).toHaveAttribute("id", /\S/);
  await expect(outside).toHaveAttribute("id", "outside-control");
  await expect(outside).toHaveAttribute("aria-describedby", "outside-static");
  await expect(outside).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(page.locator("#outside-description")).toHaveCount(1);

  // The same static attributes from a composing directive's host.
  const composedLabel = page.getByTestId("composed-outside-label");
  const composed = page.getByTestId("composed-outside-control");

  await expect(composedLabel).toHaveAttribute("for", "composed-for");
  await expect(composedLabel).toHaveAttribute("id", /\S/);
  await expect(composed).toHaveAttribute("id", /\S/);
  await expect(composed).toHaveAttribute("aria-describedby", "composed-static");

  await drainIssues();
  expect(runtimeErrors.records).toEqual([]);
  await page.getByTestId("mount-duplicate").click();

  const duplicate = page.getByTestId("duplicate-control");

  await expect(duplicate).toHaveCount(1);
  await expect
    .poll(async () => {
      await drainIssues();

      return runtimeErrors.records.length;
    })
    .toBe(1);
  // Ignored: the first control keeps the Field.
  await expect(duplicate).not.toHaveAttribute("aria-describedby", /.*/);
  await expect(page.getByTestId("outer-label")).toHaveAttribute("for", outerId ?? "");
  await expect(outer).toHaveAttribute("aria-describedby", "outer-description");
});

test("M5: factory and existing part Options replace the exposed own IDs and drive the associations", async ({
  page,
}, info) => {
  await fixture(page, "field", info);

  const label = page.getByTestId("replaced-label");
  const control = page.getByTestId("replaced-control");
  const description = page.getByTestId("replaced-description");

  await expect(control).toHaveAttribute("id", "replaced-control");
  await expect(label).toHaveAttribute("id", "replaced-label");
  await expect(label).toHaveAttribute("for", "replaced-control");
  await expect(description).toHaveAttribute("id", "replaced-description");
  await expect(control).toHaveAttribute("aria-describedby", "replaced-description");
  await expect(control).toHaveAccessibleName("Replaced");
  await page.getByTestId("change-replaced-ids").click();
  await expect(control).toHaveAttribute("id", "replaced-control-2");
  await expect(label).toHaveAttribute("id", "replaced-label-2");
  await expect(label).toHaveAttribute("for", "replaced-control-2");
  await expect(description).toHaveAttribute("id", "replaced-description-2");
  await expect(control).toHaveAttribute("aria-describedby", "replaced-description-2");
});
