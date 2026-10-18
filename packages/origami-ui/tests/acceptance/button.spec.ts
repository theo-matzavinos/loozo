import { test, expect } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import { fixture } from "./observation.js";

/** Locates `role` inside the Button cases fixture's element marked `name`. */
function casePart(page: Page, name: string, role: string): Locator {
  return page.locator(`[data-button-case="${name}"] [data-role="${role}"]`);
}

/**
 * A wrong write would render only after the zoneless scheduler's next turn (an animation frame
 * or a timer), so let both pass before asserting it never happened.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))),
  );
}

/** Safari on macOS doesn't focus a clicked button; preventing mousedown's default reproduces that in every engine. */
async function preventNextMousedownFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.addEventListener("mousedown", (event) => event.preventDefault(), {
      capture: true,
      once: true,
    });
  });
}

/** Disabled but focusable: `aria-disabled` and `data-disabled` without native `disabled`. */
async function expectFocusableDisabled(button: Locator): Promise<void> {
  await expect(button).toHaveJSProperty("disabled", false);
  await expect(button).not.toHaveAttribute("disabled");
  await expect(button).toHaveAttribute("aria-disabled", "true");
  await expect(button).toHaveAttribute("data-disabled", "");
}

async function expectEnabled(button: Locator): Promise<void> {
  await expect(button).toHaveJSProperty("disabled", false);
  await expect(button).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(button).not.toHaveAttribute("data-disabled", /.*/);
}

async function expectNativelyDisabled(button: Locator): Promise<void> {
  await expect(button).toHaveJSProperty("disabled", true);
  await expect(button).toHaveAttribute("aria-disabled", "true");
  await expect(button).toHaveAttribute("data-disabled", "");
}

/** Exactly one button inside `container` is the tab stop, and it is `expected`; null means none is. */
async function expectTabStop(container: Locator, expected: Locator | null): Promise<void> {
  const stops = container.locator('button[tabindex="0"]');

  if (expected === null) {
    await expect(stops).toHaveCount(0);

    return;
  }

  await expect(stops).toHaveCount(1);
  await expect(expected).toHaveAttribute("tabindex", "0");
}

test("F1: a Button binds type=button and its disabled attributes; focusable while disabled it keeps its Tab stop and the consumer's click listener still runs; replaced Options win", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const part = (role: string) => casePart(page, "standalone", role);
  const save = part("save");

  await expect(save).toHaveAttribute("type", "button");
  await expectEnabled(save);
  await save.click();
  await expect(part("clicks")).toHaveText("1");
  await save.focus();
  await page.keyboard.press("Enter");
  await expect(part("clicks")).toHaveText("2");
  await expect(part("submits")).toHaveText("0");

  // Natively disabled: out of the Tab order, and a trusted click never reaches the listener.
  await part("disable").click();
  await expectNativelyDisabled(save);
  await part("before").focus();
  await page.keyboard.press("Tab");
  await expect(part("after")).toBeFocused();
  await save.click({ force: true });
  await settle(page);
  await expect(part("clicks")).toHaveText("2");

  // Focusable: in the Tab order and announced disabled; the consumer's own listener still runs.
  await part("focusable").click();
  await expectFocusableDisabled(save);
  await part("before").focus();
  await page.keyboard.press("Tab");
  await expect(save).toBeFocused();
  await save.click({ force: true });
  await expect(part("clicks")).toHaveText("3");
  await expect(part("submits")).toHaveText("0");

  // Enabled again, focusableWhenDisabled has no effect.
  await part("disable").click();
  await expectEnabled(save);

  // Factory and existing replacements win over the composed Button's contradicting own inputs.
  const precedence = (role: string) => casePart(page, "precedence", role);

  for (const role of ["factory", "existing"]) {
    await expectFocusableDisabled(precedence(role));
  }

  await precedence("focusable").click();

  for (const role of ["factory", "existing"]) {
    await expectNativelyDisabled(precedence(role));
  }

  await precedence("disable").click();

  for (const role of ["factory", "existing"]) {
    await expectEnabled(precedence(role));
  }
});

const parts = [
  { role: "toggle", value: "false" },
  { role: "toggle-group-item", value: "" },
  { role: "accordion-trigger", value: "" },
  { role: "popover-trigger", value: "false" },
  { role: "tabs-trigger", value: "one" },
  { role: "radio-group-item", value: "standard" },
  { role: "toolbar-item", value: null },
  { role: "toolbar-toggle", value: "false" },
  { role: "toolbar-popover-trigger", value: "false" },
];

test("F3: every button part disabled by itself or its root and focusable has no native disabled, takes focus, and ignores activation while its own click listeners run", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const part = (role: string) => casePart(page, "parts", role);

  for (const { role, value } of parts) {
    const button = part(role);

    await expectFocusableDisabled(button);
    await button.focus();
    await expect(button).toBeFocused();
    // A trusted click and Enter's native activation reach the button's own listener: the part's
    // guard, not native disabled, keeps them from activating it.
    await button.click({ force: true });
    await expect(part(`${role}-clicks`)).toHaveText("1");
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(part(`${role}-clicks`)).toHaveText("2");
    await settle(page);

    if (value !== null) {
      await expect(part(`${role}-value`)).toHaveText(value);
    }

    await expectFocusableDisabled(button);
  }

  await expect(part("toggle")).toHaveAttribute("aria-pressed", "false");
  await expect(part("toggle-group-item")).toHaveAttribute("aria-pressed", "false");
  await expect(part("accordion-trigger")).toHaveAttribute("aria-expanded", "false");
  await expect(part("tabs-trigger")).toHaveAttribute("aria-selected", "false");
  await expect(part("radio-group-item")).toHaveAttribute("aria-checked", "false");
  await expect(part("toolbar-toggle")).toHaveAttribute("aria-pressed", "false");

  // A click focuses a focusable disabled roving item in every engine, without selecting it.
  for (const role of ["tabs-trigger", "radio-group-item", "toggle-group-item", "toolbar-item"]) {
    await part("cut").focus();
    await preventNextMousedownFocus(page);
    await part(role).click({ force: true });
    await expect(part(role)).toBeFocused();
    await expect(part(role)).toHaveAttribute("tabindex", "0");
  }

  await settle(page);
  await expect(part("tabs-trigger-value")).toHaveText("one");
  await expect(part("radio-group-item-value")).toHaveText("standard");
  await expect(part("toggle-group-item-value")).toHaveText("");
});

test("F4: arrows, Home and End reach focusable disabled items without selecting or checking them; the tab stop prefers enabled items; a focused item that turns disabled but focusable keeps focus", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const part = (role: string) => casePart(page, "parts", role);
  const toolbar = part("toolbar");

  // Every Toolbar control, focusable disabled ones included, is in the arrow sequence.
  await expectTabStop(toolbar, part("cut"));
  await part("cut").focus();

  for (const role of [
    "toolbar-item",
    "toolbar-toggle",
    "toolbar-popover-trigger",
    "paste",
    "cut",
  ]) {
    await page.keyboard.press("ArrowRight");
    await expect(part(role)).toBeFocused();
  }

  await page.keyboard.press("ArrowLeft");
  await expect(part("paste")).toBeFocused();
  await part("toolbar-item").focus();
  await page.keyboard.press("Home");
  await expect(part("cut")).toBeFocused();
  await page.keyboard.press("End");
  await expect(part("paste")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(part("toolbar-popover-trigger")).toBeFocused();
  await expectTabStop(toolbar, part("toolbar-popover-trigger"));
  await settle(page);
  await expect(part("toolbar-toggle-value")).toHaveText("false");
  await expect(part("toolbar-popover-trigger-value")).toHaveText("false");

  // Automatic Tabs: a move focuses the disabled Trigger without selecting it.
  await part("tabs-one").focus();
  await page.keyboard.press("ArrowRight");
  await expect(part("tabs-trigger")).toBeFocused();
  await settle(page);
  await expect(part("tabs-trigger-value")).toHaveText("one");
  await expect(part("tabs-trigger")).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("ArrowRight");
  await expect(part("tabs-three")).toBeFocused();
  await expect(part("tabs-trigger-value")).toHaveText("three");
  await page.keyboard.press("ArrowLeft");
  await expect(part("tabs-trigger")).toBeFocused();
  await settle(page);
  await expect(part("tabs-trigger-value")).toHaveText("three");

  // A standalone RadioGroup: a move focuses the disabled radio without checking it.
  await part("radio-standard").focus();
  await page.keyboard.press("ArrowDown");
  await expect(part("radio-group-item")).toBeFocused();
  await settle(page);
  await expect(part("radio-group-item-value")).toHaveText("standard");
  await expect(part("radio-group-item")).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("ArrowDown");
  await expect(part("radio-same-day")).toBeFocused();
  await expect(part("radio-group-item-value")).toHaveText("same-day");
  await page.keyboard.press("ArrowUp");
  await expect(part("radio-group-item")).toBeFocused();
  await settle(page);
  await expect(part("radio-group-item-value")).toHaveText("same-day");

  // The pressed Start is disabled but focusable: the first enabled item holds the tab stop.
  const roving = (role: string) => casePart(page, "roving", role);
  const group = roving("group");

  await expectFocusableDisabled(roving("start"));
  await expect(roving("start")).toHaveAttribute("aria-pressed", "true");
  await expectTabStop(group, roving("center"));
  await roving("center").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(roving("start")).toBeFocused();
  await expectTabStop(group, roving("start"));
  await page.keyboard.press("ArrowRight");
  await expect(roving("center")).toBeFocused();

  // Disabling the focused item keeps focus on it: it is still focusable, so nothing repairs.
  await page.keyboard.press("d");
  await expectFocusableDisabled(roving("center"));
  await settle(page);
  await expect(roving("center")).toBeFocused();
  await expectTabStop(group, roving("center"));
  await page.keyboard.press("ArrowRight");
  await expect(roving("end")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(roving("center")).toBeFocused();
  await page.keyboard.press("d");
  await expectEnabled(roving("center"));
  await expect(roving("value")).toHaveText("start");

  // With no enabled item the first focusable disabled one is the tab stop; with none focusable,
  // there is none.
  await roving("disable-all").click();
  await expectTabStop(group, roving("start"));
  await roving("unfocusable-all").click();

  for (const role of ["start", "center", "end"]) {
    await expectNativelyDisabled(roving(role));
  }

  await expectTabStop(group, null);

  // Home and End reach focusable disabled endpoints: the tab stop follows focus, and the
  // follow-focus Tabs and RadioGroup select or check nothing.
  const endpoint = (role: string) => casePart(page, "endpoints", role);

  for (const [container, first, middle, last] of [
    ["tabs", "tabs-first", "tabs-middle", "tabs-last"],
    ["radio-group", "radio-first", "radio-middle", "radio-last"],
    ["toolbar", "toolbar-first", "toolbar-middle", "toolbar-last"],
  ]) {
    await expectFocusableDisabled(endpoint(first));
    await expectFocusableDisabled(endpoint(last));
    await expectTabStop(endpoint(container), endpoint(middle));
    await endpoint(middle).focus();
    await page.keyboard.press("Home");
    await expect(endpoint(first)).toBeFocused();
    await expectTabStop(endpoint(container), endpoint(first));
    await page.keyboard.press("End");
    await expect(endpoint(last)).toBeFocused();
    await expectTabStop(endpoint(container), endpoint(last));
  }

  await settle(page);
  await expect(endpoint("tabs-value")).toHaveText("middle");
  await expect(endpoint("tabs-first")).toHaveAttribute("aria-selected", "false");
  await expect(endpoint("tabs-last")).toHaveAttribute("aria-selected", "false");
  await expect(endpoint("radio-group-value")).toHaveText("air");
  await expect(endpoint("radio-first")).toHaveAttribute("aria-checked", "false");
  await expect(endpoint("radio-last")).toHaveAttribute("aria-checked", "false");
  await expect(endpoint("toolbar-first-value")).toHaveText("false");
  await expect(endpoint("toolbar-first")).toHaveAttribute("aria-pressed", "false");
  await expect(endpoint("toolbar-last-value")).toHaveText("false");
  await expect(endpoint("toolbar-last")).toHaveAttribute("aria-expanded", "false");
});
