import type { Locator, Page, TestInfo } from "playwright/test";
import { expect, test } from "./contract-test.js";
import {
  checkboxControl,
  composedCase,
  fieldCase,
  replacementCase,
  signalFormsCase,
  standaloneCase,
} from "./boolean-controls.js";
import {
  fieldWithTooltipCase,
  mixedViewsCase,
  withoutStaticCase,
} from "./co-applied-description.js";
import {
  assertReferences,
  bootstrapHeld,
  fixture,
  stopRetentionObservation,
} from "./observation.js";

test("J1: a standalone Checkbox is role=checkbox with aria-checked; click and Space flip [(checked)] once, Enter doesn't; external writes are authoritative, also while disabled; a focusable disabled Checkbox runs only its own click listener; static ARIA is kept outside a Field", async ({
  page,
}, info) => {
  await standaloneCase(page, info, checkboxControl);
});

test("J2: inside a Field the Label names the Checkbox with for, before and after it, giving its accessible name; a label click toggles it; the Description replaces a static aria-describedby", async ({
  page,
}, info) => {
  await fieldCase(page, info, checkboxControl);
});

test("J3: with [formField] the Checkbox shows the initial value, writes user changes, follows model writes, emits touch on blur, shows required errors after blur and submit(), resets, takes focus from focusBoundControl(), drops user writes while readonly and is natively disabled by disabled()", async ({
  page,
}, info) => {
  await signalFormsCase(page, info, checkboxControl);
});

test("J4: a consumer component composing the Checkbox through hostDirectives with exposed checked, checkedChange, disabled and touch is the control [formField] finds, and the Checkbox reads FORM_FIELD on its element", async ({
  page,
}, info) => {
  await composedCase(page, info, checkboxControl);
});

test("J5: factory and existing Checkbox Options replace the exposed own inputs and drive checked, disabled, focusability and ID without emitting the unused model's output", async ({
  page,
}, info) => {
  await replacementCase(page, info, checkboxControl);
});

test("J7: a Checkbox co-applied with a Tooltip Trigger inside a Field has one aria-describedby naming the Field's IDs and the Content's in registration order, from server HTML on, in both directive orders; each side's change keeps the other's IDs", async ({
  page,
}, info) => {
  await fieldWithTooltipCase(page, info, "checkbox");
});

test("J8: M8 with a Checkbox instead of <input ogFieldControl>", async ({ page }, info) => {
  await withoutStaticCase(
    page,
    info,
    [{ testId: "bare-field-checkbox", id: "bare-field-checkbox-error" }],
    "toggle-bare-error",
  );
});

test("J9: M9 with a Checkbox instead of <input ogFieldControl>", async ({ page }, info) => {
  await mixedViewsCase(page, info, {
    testId: "mixed-checkbox",
    tipId: "mixed-checkbox-tip",
    errorId: "mixed-checkbox-error",
  });
});

/** Mixed presentation: `aria-checked="mixed"`, `data-mixed` and no `data-checked`. */
async function expectMixed(control: Locator): Promise<void> {
  await expect(control).toHaveAttribute("aria-checked", "mixed");
  await expect(control).toHaveAttribute("data-mixed", "");
  await expect(control).not.toHaveAttribute("data-checked", /.*/);
}

/** Checked presentation: `aria-checked="true"`, `data-checked` and no `data-mixed`. */
async function expectChecked(control: Locator): Promise<void> {
  await expect(control).toHaveAttribute("aria-checked", "true");
  await expect(control).toHaveAttribute("data-checked", "");
  await expect(control).not.toHaveAttribute("data-mixed", /.*/);
}

/** Unchecked presentation: `aria-checked="false"` and neither marker. */
async function expectUnchecked(control: Locator): Promise<void> {
  await expect(control).toHaveAttribute("aria-checked", "false");
  await expect(control).not.toHaveAttribute("data-checked", /.*/);
  await expect(control).not.toHaveAttribute("data-mixed", /.*/);
}

/**
 * Opens the checkbox route and clicks before it hydrates: under eager hydration while the main
 * bundle is held, once Angular's early event contract listens for body clicks, so it replays the
 * click; under incremental hydration once the shell runs, holding the fixture's deferred chunk, so
 * the block's queue replays it. `server` runs against the server-rendered HTML before the click
 * and again before release.
 */
async function clickBeforeHydration(
  page: Page,
  info: TestInfo,
  control: Locator,
  server: () => Promise<void>,
): Promise<void> {
  const incremental = info.project.metadata.hydration === "incremental";
  const release = await bootstrapHeld(page, "/checkbox", info);
  let releaseChunk = () => {};

  try {
    await server();

    if (!incremental) {
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.acceptanceObservation.registrations.some(
              (item) => item.type === "click" && item.target === "body",
            ),
          ),
        )
        .toBe(true);
      await control.click();
      await server();
      release();
      await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");

      return;
    }

    const gate = new Promise<void>((resolve) => {
      releaseChunk = resolve;
    });
    let held = false;

    await page.route(
      (url) => /\.m?js$/.test(url.pathname),
      async (route) => {
        const response = await route.fetch();
        const source = await response.text();

        if (source.includes("Attach checkbox behavior")) {
          held = true;
          await gate;
        }

        await route.fulfill({ response });
      },
    );
    release();
    await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
    await control.click();
    await expect.poll(() => held).toBe(true);
    await server();
    releaseChunk();
  } finally {
    release();
    releaseChunk();
  }
}

test("J10: a Checkbox whose mixed model is true is aria-checked=mixed with data-mixed and no data-checked from server HTML on, also while checked; a click or Space from mixed writes mixed false, then checked true, once each; a mixed write shows mixed again without an output; Enter does nothing; disabled mixed Checkboxes stay mixed", async ({
  page,
}, info) => {
  const mixedTestIds = [
    "mixed-standalone",
    "mixed-checked",
    "mixed-disabled",
    "mixed-focusable-disabled",
  ];

  await fixture(page, "checkbox", info, async () => {
    for (const testId of mixedTestIds) {
      await expectMixed(page.getByTestId(testId));
    }
  });

  for (const testId of mixedTestIds) {
    await expectMixed(page.getByTestId(testId));
  }

  const standalone = page.getByTestId("mixed-standalone");
  const log = page.getByTestId("mixed-standalone-log");
  const state = page.getByTestId("mixed-standalone-state");
  const probe = page.getByTestId("mixed-standalone-probe");

  await expect(page.getByRole("checkbox", { name: "Select all files" })).toBeChecked({
    indeterminate: true,
  });
  await expect(state).toHaveText("false true");
  await expect(probe).toHaveAttribute("data-checked-state", "false");
  await expect(probe).toHaveAttribute("data-mixed-state", "true");

  // A click from mixed clears mixed, then checks: one output each, in that order.
  await standalone.click();
  await expectChecked(standalone);
  await expect(page.getByRole("checkbox", { name: "Select all files" })).toBeChecked();
  await expect(log).toHaveText("mixed:false checked:true");
  await expect(state).toHaveText("true false");
  await expect(probe).toHaveAttribute("data-checked-state", "true");
  await expect(probe).toHaveAttribute("data-mixed-state", "false");

  // An owner write shows mixed again, over a checked value, and emits nothing.
  await page.getByTestId("write-mixed").click();
  await expectMixed(standalone);
  await expect(state).toHaveText("true true");
  await expect(log).toHaveText("mixed:false checked:true");

  // Enter does nothing, also from mixed.
  await standalone.focus();
  await page.keyboard.press("Enter");
  await expectMixed(standalone);
  await expect(log).toHaveText("mixed:false checked:true");

  // Space from checked and mixed only clears mixed: checked doesn't change, so it doesn't emit.
  await page.keyboard.press("Space");
  await expectChecked(standalone);
  await expect(log).toHaveText("mixed:false checked:true mixed:false");
  await expect(state).toHaveText("true false");

  // One that starts checked and mixed logs only the mixed write.
  const checked = page.getByTestId("mixed-checked");

  await checked.click();
  await expectChecked(checked);
  await expect(page.getByTestId("mixed-checked-log")).toHaveText("mixed:false");

  // Disabled mixed Checkboxes stay mixed and write nothing; the focusable one runs its listener.
  const disabled = page.getByTestId("mixed-disabled");
  const focusable = page.getByTestId("mixed-focusable-disabled");

  await expect(disabled).toBeDisabled();
  await disabled.click({ force: true });
  await expect(focusable).toHaveJSProperty("disabled", false);
  await focusable.click({ force: true });
  await expect(page.getByTestId("mixed-own-clicks")).toHaveText("1");
  await focusable.focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("mixed-own-clicks")).toHaveText("2");
  await expectMixed(disabled);
  await expectMixed(focusable);
  await expect(page.getByTestId("mixed-disabled-writes")).toHaveText("0");
});

test("J11: [formField] binds a mixed Checkbox's boolean checked only: a composed Checkbox exposing mixed fails required() while mixed, a click or Space writes mixed false before checked true and the field value, readonly and disabled keep it mixed; a constant [mixed] isn't restored by a form value write; replaced Options' mixed is cleared on activation without the unused models' outputs", async ({
  page,
}, info) => {
  await fixture(page, "checkbox", info);

  const newsletters = page.getByTestId("newsletters");
  const value = page.getByTestId("newsletters-value");
  const log = page.getByTestId("newsletters-log");
  const error = page.locator("#newsletters-error");

  // [formField] finds the exposed checked: the boolean value is false while it shows mixed.
  await expectMixed(newsletters);
  await expect(value).toHaveText("false");
  await expect(page.getByTestId("newsletters-touched")).toHaveText("false");
  await expect(newsletters).toHaveAttribute("aria-required", "true");
  await expect(newsletters).toHaveAttribute("aria-describedby", "newsletters-description");

  // Blur touches; the required error shows while it's still mixed, also after submit().
  await newsletters.focus();
  await newsletters.blur();
  await expect(page.getByTestId("newsletters-touched")).toHaveText("true");
  await page.getByTestId("submit-newsletters").click();
  await expect(error).toBeVisible();
  await expect(newsletters).toHaveAttribute("aria-invalid", "true");
  await expect(newsletters).toHaveAttribute(
    "aria-describedby",
    "newsletters-description newsletters-error",
  );
  await expectMixed(newsletters);

  // A click writes mixed false (checked and the value still false), then checked and the value.
  await newsletters.click();
  await expectChecked(newsletters);
  await expect(value).toHaveText("true");
  await expect(log).toHaveText(
    "mixedChange(checked:false,mixed:false,value:false) checkedChange(checked:true,mixed:false,value:true)",
  );
  await expect(error).toHaveCount(0);
  await expect(newsletters).not.toHaveAttribute("aria-invalid", /.*/);

  // Space from the reset partial state does the same.
  await page.getByTestId("reset-newsletters").click();
  await expectMixed(newsletters);
  await expect(value).toHaveText("false");
  await newsletters.focus();
  await page.keyboard.press("Space");
  await expectChecked(newsletters);
  await expect(value).toHaveText("true");
  await expect(log).toHaveText(
    "mixedChange(checked:false,mixed:false,value:false) checkedChange(checked:true,mixed:false,value:true)",
  );

  // Readonly blocks the activation that would clear mixed.
  await page.getByTestId("reset-newsletters").click();
  await page.getByTestId("freeze-newsletters").click();
  await expect(newsletters).toHaveAttribute("aria-readonly", "true");
  await newsletters.click();
  await newsletters.focus();
  await page.keyboard.press("Space");
  await expectMixed(newsletters);
  await expect(value).toHaveText("false");
  await expect(log).toHaveText("");
  await page.getByTestId("freeze-newsletters").click();

  // So does disabled().
  await page.getByTestId("lock-newsletters").click();
  await expect(newsletters).toBeDisabled();
  await newsletters.click({ force: true });
  await expectMixed(newsletters);
  await expect(value).toHaveText("false");
  await expect(log).toHaveText("");

  // A constant [mixed]="true" is cleared by a click; a form value write doesn't restore it.
  const reminders = page.getByTestId("reminders");

  await expectMixed(reminders);
  await expect(page.getByTestId("reminders-value")).toHaveText("false");
  await expect(page.getByTestId("reminders-valid")).toHaveText("false");
  await reminders.click();
  await expectChecked(reminders);
  await expect(page.getByTestId("reminders-value")).toHaveText("true");
  await expect(page.getByTestId("reminders-valid")).toHaveText("true");
  await page.getByTestId("replace-reminders").click();
  await expect(page.getByTestId("reminders-value")).toHaveText("false");
  await expectUnchecked(reminders);

  // Replaced Options: activation writes the replacement's mixed and checked, not the own models.
  const replaced = page.getByTestId("mixed-replaced");
  const replacedValue = page.getByTestId("mixed-replaced-value");

  await expect(replacedValue).toHaveText("false true");
  await expectMixed(replaced);
  await replaced.click();
  await expect(replacedValue).toHaveText("true false");
  await expectChecked(replaced);
  await expect(page.getByTestId("mixed-replaced-outputs")).toHaveText("0");
});

test("J12: a select-all parent Checkbox derived over the children its handler can change is mixed while some are selected and checked while all are; a Label click, click or Space from mixed checks it and its handler selects them, a disabled child never changes, and child changes reach it without its outputs", async ({
  page,
}, info) => {
  await fixture(page, "checkbox", info);

  const parent = page.getByTestId("vehicles-parent");
  const selected = page.getByTestId("vehicles-selected");
  const log = page.getByTestId("vehicles-log");
  const car = page.getByTestId("vehicle-car");
  const van = page.getByTestId("vehicle-van");
  const bus = page.getByTestId("vehicle-bus");

  await expectMixed(parent);
  await expect(page.getByRole("checkbox", { name: "Select all available vehicles" })).toBeChecked({
    indeterminate: true,
  });
  await expect(parent).toHaveAttribute("aria-controls", "vehicle-car vehicle-van vehicle-bus");
  await expect(selected).toHaveText("car");
  await expectChecked(car);
  await expectUnchecked(van);
  await expect(bus).toBeDisabled();

  // A Label click from mixed checks the parent; its handler selects the enabled children.
  await page.getByTestId("vehicles-label").click();
  await expectChecked(parent);
  await expect(selected).toHaveText("car,van");
  await expect(log).toHaveText("mixed:false checked:true");
  await expectChecked(car);
  await expectChecked(van);
  await expectUnchecked(bus);

  // From checked a click unchecks it and clears them.
  await parent.click();
  await expectUnchecked(parent);
  await expect(selected).toHaveText("");
  await expect(log).toHaveText("mixed:false checked:true checked:false");
  await expectUnchecked(car);
  await expectUnchecked(van);

  // Child changes drive the parent's bindings without its outputs.
  await car.click();
  await expectMixed(parent);
  await van.click();
  await expectChecked(parent);
  await expect(selected).toHaveText("car,van");
  await van.click();
  await expectMixed(parent);
  await expect(selected).toHaveText("car");
  await expect(log).toHaveText("mixed:false checked:true checked:false");

  // Space from mixed does what the click did.
  await parent.focus();
  await page.keyboard.press("Space");
  await expectChecked(parent);
  await expect(selected).toHaveText("car,van");
  await expect(log).toHaveText("mixed:false checked:true checked:false mixed:false checked:true");
  await expectChecked(car);
  await expectChecked(van);
  await expectUnchecked(bus);
  await expect(parent).toHaveAttribute("aria-controls", "vehicle-car vehicle-van vehicle-bus");
});

test("J13: a click on J12's mixed parent before the checkbox route hydrates is replayed once on the server-rendered node: the parent and the enabled children end checked, with one mixed and one checked output", async ({
  page,
}, info) => {
  const parent = page.getByTestId("vehicles-parent");

  // Server HTML and every moment before release: mixed, nothing written.
  await clickBeforeHydration(page, info, parent, async () => {
    await expectMixed(parent);
    await expect(page.getByTestId("vehicles-selected")).toHaveText("car");
    await expect(page.getByTestId("vehicles-log")).toHaveText("");
  });
  await expectChecked(parent);
  await expect(page.getByTestId("vehicles-selected")).toHaveText("car,van");
  await expect(page.getByTestId("vehicles-log")).toHaveText("mixed:false checked:true");
  await expectChecked(page.getByTestId("vehicle-car"));
  await expectChecked(page.getByTestId("vehicle-van"));
  await assertReferences(page, info);
  await stopRetentionObservation(page);
});
