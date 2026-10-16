import { test, expect } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import { fixture } from "./observation.js";

const coreKeys = ["profile", "billing", "security"];

function tab(page: Page, key: string): Locator {
  return page.getByTestId(`tab-${key}`);
}

function panel(page: Page, key: string): Locator {
  return page.getByTestId(`panel-${key}`);
}

/**
 * Makes the next focus of the focus-disable target end with a synchronous blur after its own
 * handler disabled it, as an engine that blurs a disabled element at once would. The engines in
 * the matrix defer that blur to rendering.
 */
async function blurDisabledTargetOnFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(
      '[data-tabs-case="focus-disable"] [data-role="target"]',
    )!;

    target.addEventListener("focus", () => target.blur(), { once: true });
  });
}

/** Exactly one Trigger of `list` is the tab stop, and it is `expected`; null means none is. */
async function expectTabStop(list: Locator, expected: Locator | null): Promise<void> {
  const stops = list.locator('[role="tab"][tabindex="0"]');

  if (expected === null) {
    await expect(stops).toHaveCount(0);

    return;
  }

  await expect(stops).toHaveCount(1);
  await expect(expected).toHaveAttribute("tabindex", "0");
}

test("S1: roles, mounted-only associations, exactly-once selection, disabled blocks only user selection", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const list = page.getByTestId("tabs-list");
  const outputs = page.getByTestId("tab-outputs");

  await expect(page.getByTestId("tabs")).toHaveAttribute("data-orientation", "horizontal");
  await expect(page.getByTestId("tabs")).not.toHaveAttribute("data-disabled", /.*/);
  await expect(list).toHaveAttribute("role", "tablist");
  await expect(list).toHaveAttribute("aria-orientation", "horizontal");

  for (const key of coreKeys) {
    const trigger = tab(page, key);
    const content = panel(page, key);
    const triggerId = await trigger.getAttribute("id");
    const panelId = await content.getAttribute("id");

    expect(triggerId).toBeTruthy();
    expect(panelId).toBeTruthy();
    await expect(trigger).toHaveAttribute("role", "tab");
    await expect(trigger).toHaveAttribute("type", "button");
    await expect(trigger).toHaveAttribute("aria-controls", panelId ?? "");
    await expect(trigger).not.toHaveAttribute("aria-disabled", /.*/);
    await expect(content).toHaveAttribute("role", "tabpanel");
    await expect(content).toHaveAttribute("aria-labelledby", triggerId ?? "");
  }

  await expect(tab(page, "profile")).toHaveAttribute("aria-selected", "true");
  await expect(tab(page, "profile")).toHaveAttribute("data-selected", "");
  await expect(tab(page, "billing")).toHaveAttribute("aria-selected", "false");
  await expect(tab(page, "billing")).not.toHaveAttribute("data-selected", /.*/);
  await expectTabStop(list, tab(page, "profile"));
  await expect(tab(page, "billing")).toHaveAttribute("tabindex", "-1");
  await expect(panel(page, "profile")).toBeVisible();
  await expect(panel(page, "profile")).toHaveAttribute("data-selected", "");
  await expect(panel(page, "billing")).toBeHidden();
  await expect(panel(page, "billing")).toHaveAttribute("hidden", "");
  await expect(panel(page, "profile")).toHaveAttribute("tabindex", "0");
  // A consumer's static tabindex overrides the Panel's default tab stop.
  await expect(panel(page, "security")).toHaveAttribute("tabindex", "-1");

  // Keyboard focus starts on another Trigger and the click must take the roving position. Safari
  // on macOS doesn't focus a clicked button; preventing mousedown's default reproduces that in
  // every engine here.
  await tab(page, "profile").focus();
  await page.evaluate(() => {
    document.addEventListener("mousedown", (event) => event.preventDefault(), {
      capture: true,
      once: true,
    });
  });
  await tab(page, "billing").click();
  await expect(tab(page, "billing")).toHaveAttribute("aria-selected", "true");
  await expect(tab(page, "profile")).toHaveAttribute("aria-selected", "false");
  await expect(panel(page, "billing")).toBeVisible();
  await expect(panel(page, "profile")).toBeHidden();
  await expect(page.getByTestId("tabs-state")).toHaveText("billing");
  await expect(outputs).toHaveText("1");
  await expect(tab(page, "billing")).toBeFocused();
  await expectTabStop(list, tab(page, "billing"));
  // Re-selecting the selected tab writes nothing; there is no deselection.
  await tab(page, "billing").click();
  await expect(outputs).toHaveText("1");
  await expect(tab(page, "billing")).toHaveAttribute("aria-selected", "true");
  // The next move starts from the clicked Trigger.
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "security")).toBeFocused();
  await expect(page.getByTestId("tabs-state")).toHaveText("security");
  await expect(outputs).toHaveText("2");

  await tab(page, "billing").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("tabs-state")).toHaveText("billing");
  await expect(outputs).toHaveText("3");
  await tab(page, "profile").focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("tabs-state")).toHaveText("profile");
  await expect(outputs).toHaveText("4");
  await expect(page.getByTestId("tab-submits")).toHaveText("0");

  // Associations name only mounted counterparts.
  await page.getByTestId("billing-panel-mount").click();
  await expect(panel(page, "billing")).toHaveCount(0);
  await expect(tab(page, "billing")).not.toHaveAttribute("aria-controls", /.*/);
  await page.getByTestId("billing-panel-mount").click();
  await expect(tab(page, "billing")).toHaveAttribute(
    "aria-controls",
    (await panel(page, "billing").getAttribute("id")) ?? "",
  );
  await page.getByTestId("remove-security-tab").click();
  await expect(panel(page, "security")).not.toHaveAttribute("aria-labelledby", /.*/);
  await page.getByTestId("restore-tabs").click();
  await expect(panel(page, "security")).toHaveAttribute(
    "aria-labelledby",
    (await tab(page, "security").getAttribute("id")) ?? "",
  );

  await page.getByTestId("disable-billing-tab").click();
  await expect(tab(page, "billing")).toBeDisabled();
  await expect(tab(page, "billing")).toHaveAttribute("aria-disabled", "true");
  await expect(tab(page, "billing")).toHaveAttribute("data-disabled", "");
  // A trusted click on the native disabled button dispatches nothing.
  await tab(page, "billing").click({ force: true });
  await expect(page.getByTestId("tabs-state")).toHaveText("profile");
  await page.getByTestId("disable-billing-tab").click();
  await expect(tab(page, "billing")).toBeEnabled();

  await page.getByTestId("disable-tabs").click();
  await expect(page.getByTestId("tabs")).toHaveAttribute("data-disabled", "");

  for (const key of coreKeys) {
    await expect(tab(page, key)).toBeDisabled();
    await expect(tab(page, key)).toHaveAttribute("aria-disabled", "true");
  }

  // With every Trigger disabled there is no tab stop.
  await expectTabStop(list, null);
  await tab(page, "billing").click({ force: true });
  await expect(page.getByTestId("tabs-state")).toHaveText("profile");
  // External writes stay authoritative while disabled and emit no model output.
  await page.getByTestId("script-tab").click();
  await expect(tab(page, "security")).toHaveAttribute("aria-selected", "true");
  await expect(panel(page, "security")).toBeVisible();
  await expect(outputs).toHaveText("4");
  await page.getByTestId("disable-tabs").click();
  await expectTabStop(list, tab(page, "security"));
  await tab(page, "profile").click();
  await expect(outputs).toHaveText("5");
});

test("S2: automatic horizontal arrows skip disabled Triggers, wrap, select once per move", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const list = page.getByTestId("tabs-list");
  const outputs = page.getByTestId("tab-outputs");
  const state = page.getByTestId("tabs-state");

  await tab(page, "profile").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "billing")).toBeFocused();
  await expect(state).toHaveText("billing");
  await expect(outputs).toHaveText("1");
  await expectTabStop(list, tab(page, "billing"));

  // Billing stays selected while disabled; navigation now skips it.
  await page.getByTestId("disable-billing-tab").click();
  await expect(tab(page, "billing")).toBeDisabled();
  await tab(page, "profile").focus();
  await expect(outputs).toHaveText("1");

  // Home onto the focused unselected tab selects it; again, it writes nothing.
  await page.keyboard.press("Home");
  await expect(tab(page, "profile")).toBeFocused();
  await expect(state).toHaveText("profile");
  await expect(outputs).toHaveText("2");
  await page.keyboard.press("Home");
  // A duplicate write would render only after the zoneless scheduler's next turn (an animation
  // frame or a timer), so let both pass before asserting it never happened.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))),
  );
  await expect(outputs).toHaveText("2");

  const moves = [
    { key: "ArrowRight", focused: "security" },
    { key: "ArrowRight", focused: "profile" },
    { key: "ArrowLeft", focused: "security" },
    { key: "Home", focused: "profile" },
    { key: "End", focused: "security" },
  ];
  let count = 2;

  for (const move of moves) {
    await page.keyboard.press(move.key);
    count += 1;
    await expect(tab(page, move.focused)).toBeFocused();
    await expect(state).toHaveText(move.focused);
    await expect(outputs).toHaveText(String(count));
    await expectTabStop(list, tab(page, move.focused));
  }

  // Unhandled axis and modified keys do nothing.
  for (const key of ["ArrowDown", "ArrowUp", "Shift+ArrowRight", "Control+ArrowLeft", "Alt+Home"]) {
    await page.keyboard.press(key);
    await expect(tab(page, "security")).toBeFocused();
    await expect(state).toHaveText("security");
  }

  await expect(outputs).toHaveText(String(count));

  // An earlier listener's preventDefault leaves the key to the application.
  await page.evaluate(() => {
    document.addEventListener("keydown", (event) => event.preventDefault(), {
      capture: true,
      once: true,
    });
  });
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "security")).toBeFocused();
  await expect(outputs).toHaveText(String(count));

  // Tab leaves the list for the selected Panel's content; Shift+Tab re-enters on the selected tab.
  await page.keyboard.press("Tab");
  await expect(panel(page, "security").locator("button")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(tab(page, "security")).toBeFocused();
});

test("S3: manual vertical arrows move focus only; Enter selects; Shift+Tab leaves from an unselected tab", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const root = page.locator('[data-tabs-case="manual"]');
  const part = (role: string) => root.locator(`[data-role="${role}"]`);
  const list = part("list");

  await expect(list).toHaveAttribute("aria-orientation", "vertical");
  await expect(root).toHaveAttribute("data-orientation", "vertical");
  await part("profile").focus();
  await page.keyboard.press("ArrowDown");
  // Billing is disabled and skipped; manual activation does not select.
  await expect(part("security")).toBeFocused();
  await expect(part("value")).toHaveText("profile");
  await expectTabStop(list, part("security"));
  await page.keyboard.press("ArrowDown");
  await expect(part("profile")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(part("security")).toBeFocused();

  for (const key of ["ArrowLeft", "ArrowRight"]) {
    await page.keyboard.press(key);
    await expect(part("security")).toBeFocused();
  }

  await expect(part("outputs")).toHaveText("0");
  await expect(part("panel-profile")).toBeVisible();

  // Focus stays the tab stop, so Shift+Tab from an unselected tab leaves the list.
  await page.keyboard.press("Shift+Tab");
  await expect(part("security")).not.toBeFocused();
  await expect(list.locator(":focus")).toHaveCount(0);
  await expectTabStop(list, part("profile"));
  // Re-entry lands on the selected tab.
  await page.getByTestId("manual-tabs-after").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(part("profile")).toBeFocused();

  await page.keyboard.press("End");
  await expect(part("security")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(part("value")).toHaveText("security");
  await expect(part("outputs")).toHaveText("1");
  await expect(part("panel-security")).toBeVisible();
  await expect(part("panel-profile")).toBeHidden();

  // Home onto the focused unselected tab only keeps focus there.
  await part("profile").focus();
  await page.keyboard.press("Home");
  await expect(part("profile")).toBeFocused();
  // A wrong selection would render only after the zoneless scheduler's next turn (an animation
  // frame or a timer), so let both pass before asserting it never happened.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))),
  );
  await expect(part("value")).toHaveText("security");
  await expect(part("outputs")).toHaveText("1");
});

test("S4: horizontal arrows follow reading direction; vertical arrows ignore it", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const rtl = page.locator('[data-tabs-case="rtl"]');
  const rtlPart = (role: string) => rtl.locator(`[data-role="${role}"]`);

  await rtlPart("first").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(rtlPart("second")).toBeFocused();
  await expect(rtlPart("value")).toHaveText("second");
  await page.keyboard.press("ArrowRight");
  await expect(rtlPart("first")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(rtlPart("third")).toBeFocused();
  await expect(rtlPart("value")).toHaveText("third");

  const vertical = page.locator('[data-tabs-case="rtl-vertical"]');
  const verticalPart = (role: string) => vertical.locator(`[data-role="${role}"]`);

  await verticalPart("first").focus();
  await page.keyboard.press("ArrowDown");
  await expect(verticalPart("second")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(verticalPart("first")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(verticalPart("first")).toBeFocused();
  await expect(verticalPart("value")).toHaveText("first");
});

test("S5: no auto-selection; disabled and removed selections keep the value; focus repair never steals focus", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const list = page.getByTestId("tabs-list");
  const outputs = page.getByTestId("tab-outputs");
  const state = page.getByTestId("tabs-state");

  for (const control of ["script-tab-null", "script-tab-unknown"]) {
    await page.getByTestId(control).click();

    for (const key of coreKeys) {
      await expect(tab(page, key)).toHaveAttribute("aria-selected", "false");
      await expect(panel(page, key)).toBeHidden();
    }

    await expectTabStop(list, tab(page, "profile"));
  }

  await expect(state).toHaveText("unmounted");

  // A value only a Panel has selects no Trigger but shows that Panel.
  await page.getByTestId("remove-security-tab").click();
  await page.getByTestId("script-tab").click();
  await expect(state).toHaveText("security");

  for (const key of ["profile", "billing"]) {
    await expect(tab(page, key)).toHaveAttribute("aria-selected", "false");
    await expect(panel(page, key)).toBeHidden();
  }

  await expect(panel(page, "security")).toBeVisible();
  await expectTabStop(list, tab(page, "profile"));
  await page.getByTestId("script-tab-null").click();
  await page.getByTestId("restore-tabs").click();

  // A keyed reorder with no selection moves the tab stop to the new first Trigger.
  await page.getByTestId("reverse-tabs").click();
  await expectTabStop(list, tab(page, "security"));
  await page.getByTestId("restore-tabs").click();
  await expectTabStop(list, tab(page, "profile"));
  await expect(outputs).toHaveText("0");

  // A disabled selected Trigger keeps its selection and Panel but is not the tab stop.
  await tab(page, "billing").click();
  await page.getByTestId("disable-billing-tab").click();
  await expect(tab(page, "billing")).toHaveAttribute("aria-selected", "true");
  await expect(panel(page, "billing")).toBeVisible();
  await expectTabStop(list, tab(page, "profile"));
  await page.getByTestId("disable-billing-tab").click();
  await expect(tab(page, "billing")).toBeEnabled();

  // Removing the selected Trigger keeps the value and its still-mounted Panel. The control:
  // focus the application moved to the removing button stays there.
  await tab(page, "security").click();
  await tab(page, "security").focus();
  await page.getByTestId("remove-security-tab").focus();
  await page.keyboard.press("Enter");
  await expect(tab(page, "security")).toHaveCount(0);
  await expect(state).toHaveText("security");
  await expect(panel(page, "security")).toBeVisible();
  await expectTabStop(list, tab(page, "profile"));
  await expect(page.getByTestId("remove-security-tab")).toBeFocused();
  await page.getByTestId("restore-tabs").click();

  const selections = await outputs.textContent();

  // A blur queued before the same unselected Trigger regains focus doesn't clear its tab stop,
  // so removing it afterwards still repairs focus.
  await page.evaluate(() => {
    const billing = document.querySelector<HTMLElement>('[data-testid="tab-billing"]');
    const outside = document.querySelector<HTMLElement>('[data-testid="tabs-outside"]');

    billing?.focus();
    outside?.focus();
    billing?.focus();
  });
  await expect(tab(page, "billing")).toBeFocused();
  await expectTabStop(list, tab(page, "billing"));
  await page.keyboard.press("Delete");
  await expect(tab(page, "billing")).toHaveCount(0);
  await expect(tab(page, "security")).toBeFocused();
  await expect(state).toHaveText("security");
  await page.getByTestId("restore-tabs").click();
  await expect(tab(page, "billing")).toHaveCount(1);

  // Removing the focused Trigger moves focus to the new tab stop without selecting.
  await tab(page, "security").focus();
  await page.keyboard.press("Delete");
  await expect(tab(page, "security")).toHaveCount(0);
  await expect(tab(page, "profile")).toBeFocused();
  await expectTabStop(list, tab(page, "profile"));
  await expect(state).toHaveText("security");
  await page.getByTestId("restore-tabs").click();
  await expect(tab(page, "security")).toHaveCount(1);

  // Disabling the focused Trigger repairs focus the same way.
  await tab(page, "billing").focus();
  await page.keyboard.press("d");
  await expect(tab(page, "billing")).toBeDisabled();
  await expect(tab(page, "security")).toBeFocused();
  await expect(state).toHaveText("security");
  await expect(outputs).toHaveText(selections ?? "");
  await page.getByTestId("disable-billing-tab").click();
  await expect(tab(page, "billing")).toBeEnabled();

  // Focus the application moved elsewhere is never stolen.
  await tab(page, "billing").focus();
  await page.getByTestId("disable-billing-tab").focus();
  await page.keyboard.press("Enter");
  await expect(tab(page, "billing")).toBeDisabled();
  await expect(page.getByTestId("disable-billing-tab")).toBeFocused();

  // A click whose activation focus removes or disables the Trigger doesn't select it. The
  // mousedown default is prevented, as in S1, so that focus happens inside the activation.
  for (const name of ["focus-vanish", "focus-disable"]) {
    await test.step(`click ${name}`, async () => {
      const part = (role: string) =>
        page.locator(`[data-tabs-case="${name}"] [data-role="${role}"]`);

      await part("start").focus();

      if (name === "focus-disable") {
        await blurDisabledTargetOnFocus(page);
      }

      await page.evaluate(() => {
        document.addEventListener("mousedown", (event) => event.preventDefault(), {
          capture: true,
          once: true,
        });
      });
      await part("target").click();
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))),
      );
      await expect(part("value")).toHaveText("start");
      await expect(part("start")).toHaveAttribute("aria-selected", "true");
      // Focus lost with the Trigger, or blurred to the body, is repaired to the tab stop.
      await expect(part("start")).toBeFocused();
    });
  }

  await expect(page.locator('[data-tabs-case="focus-vanish"] [data-role="target"]')).toHaveCount(0);
  await expect(
    page.locator('[data-tabs-case="focus-disable"] [data-role="target"]'),
  ).toBeDisabled();
  await expect(page.getByTestId("focus-guard-outputs")).toHaveText("0");
  await page.getByTestId("restore-focus-targets").click();
  await expect(page.locator('[data-tabs-case="focus-vanish"] [data-role="target"]')).toHaveCount(1);
  await expect(page.locator('[data-tabs-case="focus-disable"] [data-role="target"]')).toBeEnabled();

  // Automatic navigation selects only a target that is still mounted, enabled and focused
  // after its own focus handlers ran.
  for (const name of ["focus-vanish", "focus-disable", "focus-redirect"]) {
    await test.step(name, async () => {
      const part = (role: string) =>
        page.locator(`[data-tabs-case="${name}"] [data-role="${role}"]`);

      await part("start").focus();

      if (name === "focus-disable") {
        await blurDisabledTargetOnFocus(page);
      }

      await page.keyboard.press("ArrowRight");
      // A wrong selection would render only after the zoneless scheduler's next turn (an
      // animation frame or a timer), so let both pass before asserting it never happened.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))),
      );
      await expect(part("value")).toHaveText("start");
      await expect(part("start")).toHaveAttribute("aria-selected", "true");

      if (name !== "focus-redirect") {
        await expect(part("start")).toBeFocused();
      }
    });
  }

  await expect(page.locator('[data-tabs-case="focus-vanish"] [data-role="target"]')).toHaveCount(0);
  await expect(
    page.locator('[data-tabs-case="focus-disable"] [data-role="target"]'),
  ).toBeDisabled();
  await expect(page.getByTestId("focus-redirect-target")).toBeFocused();
  await expect(page.getByTestId("focus-guard-outputs")).toHaveText("0");
});

test("S6: replaced root, Trigger and Panel Options drive behavior and associations; nested Tabs are independent", async ({
  page,
}, info) => {
  await fixture(page, "composition", info);

  const root = page.getByTestId("factory-tabs");
  const list = page.getByTestId("factory-tabs-list");
  const profile = page.getByTestId("consumer-tab-profile");
  const billing = page.getByTestId("consumer-tab-billing");
  const security = page.getByTestId("consumer-tab-security");

  // Factory Options, not the unused root model's bound "billing".
  await expect(page.getByTestId("factory-tabs-state")).toHaveText("profile");
  await expect(root).toHaveAttribute("data-orientation", "vertical");
  await expect(list).toHaveAttribute("aria-orientation", "vertical");
  // Upper Trigger Options alone drive the composed Collection's values and the IDs.
  await expect(page.getByTestId("factory-tabs-items")).toHaveText("profile,billing,security");
  await expect(profile).toHaveAttribute("id", "consumer-tab-profile");
  await expect(profile).toHaveAttribute("aria-controls", "consumer-panel-profile");
  await expect(billing).not.toHaveAttribute("aria-controls", /.*/);
  await expect(billing).toBeDisabled();
  await expect(page.getByTestId("consumer-panel-profile")).toHaveAttribute(
    "id",
    "consumer-panel-profile",
  );
  await expect(page.getByTestId("consumer-panel-profile")).toHaveAttribute(
    "aria-labelledby",
    "consumer-tab-profile",
  );
  await expect(page.getByTestId("tabs-observer")).toHaveAttribute("data-observed-value", "profile");

  // Manual vertical from the factory: arrows move focus only.
  await profile.focus();
  await page.keyboard.press("ArrowDown");
  await expect(security).toBeFocused();
  await expect(page.getByTestId("factory-tabs-state")).toHaveText("profile");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("factory-tabs-state")).toHaveText("security");
  await expect(page.getByTestId("consumer-panel-security")).toBeVisible();
  await expect(page.getByTestId("consumer-panel-profile")).toBeHidden();

  await page.getByTestId("factory-tabs-horizontal").click();
  await expect(list).toHaveAttribute("aria-orientation", "horizontal");
  await security.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(profile).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("tabs-observer")).toHaveAttribute("data-observed-value", "profile");

  await page.getByTestId("factory-tabs-disable").click();
  await expect(root).toHaveAttribute("data-disabled", "");
  await expect(security).toBeDisabled();
  await security.click({ force: true });
  await expect(page.getByTestId("factory-tabs-state")).toHaveText("profile");
  await page.getByTestId("factory-tabs-select").click();
  await expect(security).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("factory-tabs-disable").click();
  // Ordinary writable factory signals never fabricate the unused root model output.
  await expect(page.getByTestId("unused-tab-outputs")).toHaveText("0");
});

const precedenceCases = [
  "factory-upper-first",
  "factory-lower-first",
  "existing-upper-first",
  "existing-lower-first",
];

test("S6: whole Tabs root replacements win over direct inputs in both import orders", async ({
  page,
}, info) => {
  await fixture(page, "composition", info);

  for (const name of precedenceCases) {
    await test.step(name, async () => {
      const part = (role: string) =>
        page.locator(`[data-tabs-case="${name}"] [data-role="${role}"]`);

      // Replacement, not the contradicting direct value, disabled, orientation and activation.
      await expect(part("value")).toHaveText("one");
      await expect(part("disabled")).toHaveText("false");
      await expect(part("shared")).toHaveText("true");
      await expect(part("list")).toHaveAttribute("aria-orientation", "vertical");
      await expect(part("one")).toHaveAttribute("aria-selected", "true");
      await expect(part("one")).toBeEnabled();

      await part("one").focus();
      await page.keyboard.press("ArrowDown");
      await expect(part("two")).toBeFocused();
      await expect(part("value")).toHaveText("one");
      await part("two").click();
      await expect(part("value")).toHaveText("two");
      await expect(part("panel-two")).toBeVisible();

      await part("disable").click();
      await expect(part("one")).toBeDisabled();
      await part("external").click();
      await expect(part("one")).toHaveAttribute("aria-selected", "true");
      await part("disable").click();
      await expect(part("one")).toBeEnabled();
      // Replacement writes never emit the directly matched primitive's output.
      await expect(part("outputs")).toHaveText("0");
    });
  }
});

test("S6: a nested Tabs root has its own State, keys and tab stop", async ({ page }, info) => {
  await fixture(page, "core", info);

  const root = page.locator('[data-tabs-case="nested"]');
  const part = (role: string) => root.locator(`[data-role="${role}"]`);

  await expect(part("inner-shared")).toHaveText("true");
  await expect(part("independent")).toHaveText("true");
  await expectTabStop(part("outer-list"), part("outer-a"));
  await expectTabStop(part("inner-list"), part("inner-x"));

  await part("inner-x").focus();
  await page.keyboard.press("ArrowRight");
  await expect(part("inner-y")).toBeFocused();
  await expect(part("inner-value")).toHaveText("y");
  await expect(part("outer-value")).toHaveText("a");
  await expectTabStop(part("outer-list"), part("outer-a"));

  await part("outer-a").focus();
  await page.keyboard.press("ArrowRight");
  await expect(part("outer-b")).toBeFocused();
  await expect(part("outer-value")).toHaveText("b");
  await expect(part("inner-value")).toHaveText("y");
  await expect(part("outer-panel-a")).toBeHidden();
});
