import { test, expect } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import { fixture } from "./observation.js";

const speedKeys = ["standard", "express", "same-day"];

function speed(page: Page, key: string): Locator {
  return page.getByTestId(`speed-radio-${key}`);
}

/** Locates `role` inside the cases fixture's group, Toolbar or component marked `name`. */
function casePart(page: Page, name: string, role: string): Locator {
  return page.locator(`[data-radio-case="${name}"] [data-role="${role}"]`);
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

/**
 * Makes the next focus of the focus-disable target end with a synchronous blur after its own
 * handler disabled it, as an engine that blurs a disabled element at once would. The engines in
 * the matrix defer that blur to rendering.
 */
async function blurDisabledTargetOnFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(
      '[data-radio-case="focus-disable"] [data-role="target"]',
    )!;

    target.addEventListener("focus", () => target.blur(), { once: true });
  });
}

/** Exactly one button of `container` is the tab stop, and it is `expected`; null means none is. */
async function expectTabStop(container: Locator, expected: Locator | null): Promise<void> {
  const stops = container.locator('button[tabindex="0"]');

  if (expected === null) {
    await expect(stops).toHaveCount(0);

    return;
  }

  await expect(stops).toHaveCount(1);
  await expect(expected).toHaveAttribute("tabindex", "0");
}

type AXNode = {
  nodeId: string;
  parentId?: string;
  role?: { value: string };
  name?: { value: string };
  properties?: { name: string; value: { value: unknown } }[];
};

test("Q1: radiogroup semantics, exactly-once activation without unchecking, a click takes the tab stop, unknown and null kept, disabled blocks only user selection", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const group = page.getByTestId("speed-group");
  const value = page.getByTestId("speed-value");
  const outputs = page.getByTestId("speed-outputs");

  await expect(group).toHaveAttribute("role", "radiogroup");
  await expect(group).toHaveAttribute("aria-labelledby", "shipping-speed-label");
  await expect(group).not.toHaveAttribute("aria-orientation", /.*/);
  await expect(group).not.toHaveAttribute("data-disabled", /.*/);

  for (const key of speedKeys) {
    await expect(speed(page, key)).toHaveAttribute("type", "button");
    await expect(speed(page, key)).toHaveAttribute("role", "radio");
    await expect(speed(page, key)).toHaveAttribute("aria-checked", "false");
    await expect(speed(page, key)).not.toHaveAttribute("data-checked", /.*/);
  }

  await expect(speed(page, "same-day")).toBeDisabled();
  await expect(speed(page, "same-day")).toHaveAttribute("aria-disabled", "true");
  await expect(speed(page, "same-day")).toHaveAttribute("data-disabled", "");
  await expect(speed(page, "standard")).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(speed(page, "standard")).not.toHaveAttribute("data-disabled", /.*/);
  await expectTabStop(group, speed(page, "standard"));

  // Keyboard focus starts on another radio and the click must take the roving position.
  await speed(page, "standard").focus();
  await preventNextMousedownFocus(page);
  await speed(page, "express").click();
  await expect(value).toHaveText("express");
  await expect(outputs).toHaveText("1");
  await expect(speed(page, "express")).toHaveAttribute("aria-checked", "true");
  await expect(speed(page, "express")).toHaveAttribute("data-checked", "");
  await expect(speed(page, "standard")).toHaveAttribute("aria-checked", "false");
  await expect(speed(page, "express")).toBeFocused();
  await expectTabStop(group, speed(page, "express"));

  // The checked radio can't be unchecked.
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  await settle(page);
  await expect(value).toHaveText("express");
  await expect(outputs).toHaveText("1");

  // The next move starts from the clicked radio.
  await page.keyboard.press("ArrowUp");
  await expect(speed(page, "standard")).toBeFocused();
  await expect(value).toHaveText("standard");
  await expect(outputs).toHaveText("2");

  await speed(page, "express").focus();
  await settle(page);
  await expect(value).toHaveText("standard");
  await page.keyboard.press("Enter");
  await expect(value).toHaveText("express");
  await expect(outputs).toHaveText("3");
  await speed(page, "standard").focus();
  await page.keyboard.press("Space");
  await expect(value).toHaveText("standard");
  await expect(outputs).toHaveText("4");
  await expect(page.getByTestId("speed-submits")).toHaveText("0");

  // Chromium's own accessibility tree; other engines have only the ARIA attributes above.
  if (info.project.use.browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    const { nodes } = (await session.send("Accessibility.getFullAXTree")) as {
      nodes: AXNode[];
    };
    const byId = new Map<string, AXNode>();
    const radios: { name: string; checked: unknown; group: unknown }[] = [];

    for (const node of nodes) {
      byId.set(node.nodeId, node);
    }

    for (const node of nodes) {
      const name = String(node.name?.value);

      if (node.role?.value !== "radio" || !/^(Standard|Express|Same day)/.test(name)) {
        continue;
      }

      let parent = byId.get(node.parentId ?? "");

      while (parent !== undefined && parent.role?.value !== "radiogroup") {
        parent = byId.get(parent.parentId ?? "");
      }

      let checked: unknown = undefined;

      for (const property of node.properties ?? []) {
        if (property.name === "checked") {
          checked = property.value.value;
        }
      }

      radios.push({ name, checked, group: parent?.name?.value });
    }

    expect(radios).toEqual([
      { name: "Standard · 3–5 days", checked: "true", group: "Shipping speed" },
      { name: "Express · next day", checked: "false", group: "Shipping speed" },
      { name: "Same day", checked: "false", group: "Shipping speed" },
    ]);
  }

  // Unknown and null check nothing, aren't rewritten and leave the tab stop on the first enabled radio.
  for (const [control, text] of [
    ["speed-unknown", "unmounted"],
    ["speed-null", ""],
  ]) {
    await page.getByTestId(control).click();
    await expect(value).toHaveText(text);
    await expect(page.getByTestId("speed-state")).toHaveText(text);

    for (const key of speedKeys) {
      await expect(speed(page, key)).toHaveAttribute("aria-checked", "false");
    }

    await expectTabStop(group, speed(page, "standard"));
  }

  // Root disabled blocks only user selection and leaves no tab stop.
  await page.getByTestId("speed-standard").click();
  await page.getByTestId("speed-disable").click();
  await expect(group).toHaveAttribute("data-disabled", "");
  await expect(page.getByTestId("speed-state-disabled")).toHaveText("true");

  for (const key of speedKeys) {
    await expect(speed(page, key)).toBeDisabled();
    await expect(speed(page, key)).toHaveAttribute("aria-disabled", "true");
    await expect(speed(page, key)).toHaveAttribute("data-disabled", "");
  }

  await expect(speed(page, "standard")).toHaveAttribute("aria-checked", "true");
  await expectTabStop(group, null);
  await speed(page, "express").click({ force: true });
  await settle(page);
  await expect(value).toHaveText("standard");
  await page.getByTestId("speed-unknown").click();
  await expect(value).toHaveText("unmounted");
  await expect(outputs).toHaveText("4");
  await page.getByTestId("speed-disable").click();
  await expect(group).not.toHaveAttribute("data-disabled", /.*/);

  // An enabled radio rejoins navigation.
  await page.getByTestId("speed-same-day").click();
  await expect(speed(page, "same-day")).toBeEnabled();
  await expect(speed(page, "same-day")).not.toHaveAttribute("aria-disabled", /.*/);
  await speed(page, "express").focus();
  await page.keyboard.press("ArrowDown");
  await expect(speed(page, "same-day")).toBeFocused();
  await expect(value).toHaveText("same-day");
  await expect(outputs).toHaveText("5");
  await expect(page.getByTestId("speed-submits")).toHaveText("0");
});

test("Q2: all four arrows move and check once, skip disabled radios and wrap; Tab entry on the checked radio; reading direction swaps only the horizontal arrows", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const group = page.locator('[data-radio-case="keyboard"]');
  const part = (role: string) => casePart(page, "keyboard", role);

  await expect(part("m")).toBeDisabled();
  await expectTabStop(group, part("xs"));

  // Tab entry with nothing checked lands on the first enabled radio and checks nothing.
  await page.getByTestId("radio-keyboard-before").focus();
  await page.keyboard.press("Tab");
  await expect(part("xs")).toBeFocused();
  await settle(page);
  await expect(part("value")).toHaveText("");
  await expect(part("outputs")).toHaveText("0");

  const moves = [
    { key: "ArrowDown", focused: "s" },
    { key: "ArrowRight", focused: "l" },
    { key: "ArrowDown", focused: "xs" },
    { key: "ArrowUp", focused: "l" },
    { key: "ArrowLeft", focused: "s" },
    { key: "Home", focused: "xs" },
    { key: "End", focused: "l" },
  ];

  for (const [index, move] of moves.entries()) {
    await page.keyboard.press(move.key);
    await expect(part(move.focused)).toBeFocused();
    await expect(part("value")).toHaveText(move.focused);
    await expect(part(move.focused)).toHaveAttribute("aria-checked", "true");
    await expect(part("outputs")).toHaveText(String(index + 1));
    await expectTabStop(group, part(move.focused));
  }

  await expect(part("m")).toHaveAttribute("aria-checked", "false");

  // Modified keys do nothing.
  for (const key of ["Shift+ArrowDown", "Control+ArrowUp", "Alt+Home"]) {
    await page.keyboard.press(key);
    await expect(part("l")).toBeFocused();
  }

  // An earlier listener's preventDefault leaves the key to the application.
  await page.evaluate(() => {
    document.addEventListener("keydown", (event) => event.preventDefault(), {
      capture: true,
      once: true,
    });
  });
  await page.keyboard.press("ArrowDown");
  await expect(part("l")).toBeFocused();
  await settle(page);
  await expect(part("value")).toHaveText("l");
  await expect(part("outputs")).toHaveText("7");

  // Tab leaves the group; Shift+Tab re-enters on the checked radio and checks nothing.
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("radio-keyboard-after")).toBeFocused();
  await expectTabStop(group, part("l"));
  await part("xs").focus();
  await page.getByTestId("radio-keyboard-after").focus();
  await expectTabStop(group, part("l"));
  await page.keyboard.press("Shift+Tab");
  await expect(part("l")).toBeFocused();

  // With nothing checked, re-entry lands on the first enabled radio.
  await page.getByTestId("radio-keyboard-clear").click();
  await expect(part("value")).toHaveText("");
  await page.getByTestId("radio-keyboard-after").focus();
  await expectTabStop(group, part("xs"));
  await page.keyboard.press("Shift+Tab");
  await expect(part("xs")).toBeFocused();
  await settle(page);
  await expect(part("value")).toHaveText("");
  await expect(part("outputs")).toHaveText("7");

  // A move onto the focused radio checks it once, and again changes nothing.
  for (const [key, focused, outputs] of [
    ["Home", "xs", "8"],
    ["End", "l", "9"],
  ]) {
    await page.getByTestId("radio-keyboard-clear").click();
    await part(focused).focus();
    await page.keyboard.press(key);
    await expect(part(focused)).toBeFocused();
    await expect(part("value")).toHaveText(focused);
    await expect(part(focused)).toHaveAttribute("aria-checked", "true");
    await expect(part("outputs")).toHaveText(outputs);
    await page.keyboard.press(key);
    await settle(page);
    await expect(part("value")).toHaveText(focused);
    await expect(part("outputs")).toHaveText(outputs);
  }

  // Every arrow wraps to the only enabled radio, which the first one checks.
  const lonePart = (role: string) => casePart(page, "one-enabled", role);

  await lonePart("only").focus();

  for (const key of ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"]) {
    await page.keyboard.press(key);
    await expect(lonePart("only")).toBeFocused();
    await expect(lonePart("value")).toHaveText("only");
    await expect(lonePart("only")).toHaveAttribute("aria-checked", "true");
  }

  await settle(page);
  await expect(lonePart("outputs")).toHaveText("1");

  // A disabled checked radio stays checked and is not the tab stop.
  const locked = page.locator('[data-radio-case="disabled-checked"]');
  const lockedPart = (role: string) => casePart(page, "disabled-checked", role);

  await expect(lockedPart("first")).toBeDisabled();
  await expect(lockedPart("first")).toHaveAttribute("aria-checked", "true");
  await expectTabStop(locked, lockedPart("second"));

  const rtlPart = (role: string) => casePart(page, "rtl", role);
  const rtlMoves = [
    { key: "ArrowLeft", focused: "second" },
    { key: "ArrowRight", focused: "first" },
    { key: "ArrowRight", focused: "third" },
    { key: "ArrowDown", focused: "first" },
    { key: "ArrowUp", focused: "third" },
  ];

  await rtlPart("first").focus();

  for (const move of rtlMoves) {
    await page.keyboard.press(move.key);
    await expect(rtlPart(move.focused)).toBeFocused();
    await expect(rtlPart("value")).toHaveText(move.focused);
  }
});

test("Q3: a move or click target changed by its own focus handlers is not checked; focus repair never checks or steals focus; a removed checked value is kept", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  // A click whose activation focus removes or disables the radio doesn't check it. The
  // mousedown default is prevented, as in Q1, so that focus happens inside the activation.
  for (const name of ["focus-vanish", "focus-disable"]) {
    await test.step(`click ${name}`, async () => {
      const part = (role: string) => casePart(page, name, role);

      await part("start").focus();

      if (name === "focus-disable") {
        await blurDisabledTargetOnFocus(page);
      }

      await preventNextMousedownFocus(page);
      await part("target").click();
      await settle(page);
      await expect(part("value")).toHaveText("start");
      await expect(part("start")).toHaveAttribute("aria-checked", "true");
      // Focus lost with the radio, or blurred to the body, is repaired to the tab stop.
      await expect(part("start")).toBeFocused();
    });
  }

  await expect(casePart(page, "focus-vanish", "target")).toHaveCount(0);
  await expect(casePart(page, "focus-disable", "target")).toBeDisabled();
  await expect(page.getByTestId("radio-guard-outputs")).toHaveText("0");
  await page.getByTestId("radio-restore-targets").click();
  await expect(casePart(page, "focus-vanish", "target")).toHaveCount(1);
  await expect(casePart(page, "focus-disable", "target")).toBeEnabled();

  // A move checks only a target that is still mounted, enabled and focused after its own focus
  // handlers ran.
  for (const name of ["focus-vanish", "focus-disable", "focus-redirect"]) {
    await test.step(name, async () => {
      const part = (role: string) => casePart(page, name, role);

      await part("start").focus();

      if (name === "focus-disable") {
        await blurDisabledTargetOnFocus(page);
      }

      await page.keyboard.press("ArrowDown");
      await settle(page);
      await expect(part("value")).toHaveText("start");
      await expect(part("start")).toHaveAttribute("aria-checked", "true");

      if (name !== "focus-redirect") {
        await expect(part("start")).toBeFocused();
      }
    });
  }

  await expect(casePart(page, "focus-vanish", "target")).toHaveCount(0);
  await expect(casePart(page, "focus-disable", "target")).toBeDisabled();
  await expect(page.getByTestId("radio-redirect-target")).toBeFocused();
  await expect(page.getByTestId("radio-guard-outputs")).toHaveText("0");

  const repair = page.locator('[data-radio-case="repair"]');
  const part = (role: string) => casePart(page, "repair", role);
  const restore = page.getByTestId("radio-repair-restore");

  // Removing or disabling the focused radio moves focus to the tab stop without checking.
  for (const [role, key] of [
    ["beta", "Delete"],
    ["gamma", "d"],
  ]) {
    await part(role).focus();
    await page.keyboard.press(key);
    await expect(part("alpha")).toBeFocused();
    await expectTabStop(repair, part("alpha"));
    await settle(page);
    await expect(part("alpha")).toHaveAttribute("aria-checked", "false");
    await expect(part("outputs")).toHaveText("0");
    await restore.click();
    await expect(part(role)).toBeEnabled();
  }

  // Focus the application moved elsewhere is never stolen.
  await part("beta").focus();
  await page.getByTestId("radio-repair-remove-beta").focus();
  await page.keyboard.press("Enter");
  await expect(part("beta")).toHaveCount(0);
  await expect(page.getByTestId("radio-repair-remove-beta")).toBeFocused();
  await restore.click();

  // Removing the checked radio keeps the value; repair moves focus without checking.
  await part("gamma").click();
  await expect(part("value")).toHaveText("gamma");
  await expect(part("outputs")).toHaveText("1");
  await part("gamma").focus();
  await page.keyboard.press("Delete");
  await expect(part("gamma")).toHaveCount(0);
  await expect(part("alpha")).toBeFocused();
  await settle(page);
  await expect(part("value")).toHaveText("gamma");
  await expect(part("alpha")).toHaveAttribute("aria-checked", "false");
  await expect(part("outputs")).toHaveText("1");
  await restore.click();

  // A valueChange listener removes the radio a move just checked.
  await part("gamma").focus();
  await page.keyboard.press("ArrowDown");
  await expect(part("doomed")).toHaveCount(0);
  await expect(part("alpha")).toBeFocused();
  await settle(page);
  await expect(part("value")).toHaveText("doomed");
  await expect(part("alpha")).toHaveAttribute("aria-checked", "false");
  await expect(part("outputs")).toHaveText("2");
});

test("Q4: in a Toolbar Radio Group arrows only move focus and Space, Enter or a click checks once; a vertical Toolbar's axis applies; a standalone group in Popover Content keeps its own tab stop", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const toolbar = page.locator('[data-radio-case="toolbar"]');
  const part = (role: string) => casePart(page, "toolbar", role);

  await expect(part("alignment")).toHaveAttribute("role", "radiogroup");
  await expect(part("left")).toHaveAttribute("aria-checked", "true");
  await expectTabStop(toolbar, part("bold"));

  await part("bold").focus();

  for (const role of ["italic", "left", "center", "right", "copy", "bold"]) {
    await page.keyboard.press("ArrowRight");
    await expect(part(role)).toBeFocused();
    await expectTabStop(toolbar, part(role));
  }

  // Moves never check, and the off-axis arrows do nothing.
  await part("center").focus();
  await page.keyboard.press("ArrowDown");
  await expect(part("center")).toBeFocused();
  await settle(page);
  await expect(part("value")).toHaveText("left");
  await expect(part("outputs")).toHaveText("0");
  await expect(part("center")).toHaveAttribute("aria-checked", "false");

  await page.keyboard.press("Space");
  await expect(part("value")).toHaveText("center");
  await expect(part("outputs")).toHaveText("1");
  await part("right").focus();
  await page.keyboard.press("Enter");
  await expect(part("value")).toHaveText("right");
  await expect(part("outputs")).toHaveText("2");
  await preventNextMousedownFocus(page);
  await part("left").click();
  await expect(part("value")).toHaveText("left");
  await expect(part("outputs")).toHaveText("3");
  await expect(part("left")).toBeFocused();
  await expectTabStop(toolbar, part("left"));
  await page.keyboard.press("Space");
  await settle(page);
  await expect(part("outputs")).toHaveText("3");
  await expect(part("copies")).toHaveText("0");
  await expect(part("left")).toHaveAttribute("aria-checked", "true");
  await expect(part("right")).toHaveAttribute("aria-checked", "false");

  const vertical = page.locator('[data-radio-case="vertical-toolbar"]');
  const verticalPart = (role: string) => casePart(page, "vertical-toolbar", role);

  await expectTabStop(vertical, verticalPart("top"));
  await verticalPart("top").focus();

  for (const [key, role] of [
    ["ArrowDown", "one"],
    ["ArrowDown", "two"],
    ["ArrowDown", "bottom"],
    ["ArrowUp", "two"],
    ["ArrowLeft", "two"],
    ["ArrowRight", "two"],
    ["ArrowUp", "one"],
  ]) {
    await page.keyboard.press(key);
    await expect(verticalPart(role)).toBeFocused();
  }

  await settle(page);
  await expect(verticalPart("value")).toHaveText("two");
  await expect(verticalPart("one")).toHaveAttribute("aria-checked", "false");

  const popoverPart = (role: string) => casePart(page, "popover", role);

  await expect(popoverPart("before")).toHaveAttribute("tabindex", "0");
  await expect(popoverPart("trigger")).toHaveAttribute("tabindex", "-1");
  // The group's own tab stop, on its checked radio.
  await expect(popoverPart("single")).toHaveAttribute("tabindex", "0");
  await popoverPart("before").focus();

  for (const role of ["trigger", "after", "before"]) {
    await page.keyboard.press("ArrowRight");
    await expect(popoverPart(role)).toBeFocused();
  }

  await popoverPart("trigger").click();
  await expect(popoverPart("content")).toBeVisible();
  await popoverPart("single").focus();
  await page.keyboard.press("ArrowRight");
  await expect(popoverPart("double")).toBeFocused();
  await expect(popoverPart("value")).toHaveText("double");
  await page.keyboard.press("ArrowRight");
  await expect(popoverPart("single")).toBeFocused();
  await expect(popoverPart("value")).toHaveText("single");
});

test("Q5: replaced root and item Options drive behavior with no fallback; descendant State; replacements win over own inputs; nested roots are independent", async ({
  page,
}, info) => {
  await fixture(page, "composition", info);

  const group = page.getByTestId("checkout-speed");
  const option = (key: string) => page.getByTestId(`checkout-${key}`);
  const value = page.getByTestId("checkout-value");
  const estimate = page.getByTestId("checkout-estimate");

  await expect(group).toHaveAttribute("role", "radiogroup");
  // The factory value wins over the contradicting unused own model.
  await expect(option("standard")).toHaveAttribute("aria-checked", "true");
  await expect(option("same-day")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("checkout-state")).toHaveText("standard");
  await expect(estimate).toHaveAttribute("data-estimate", "3-5 days");
  // Domain-derived item Options drive native disabled.
  await expect(option("same-day")).toBeDisabled();
  await expectTabStop(group, option("standard"));

  await option("standard").focus();
  await page.keyboard.press("ArrowDown");
  await expect(option("express")).toBeFocused();
  await expect(value).toHaveText("express");
  await expect(page.getByTestId("checkout-state")).toHaveText("express");
  await expect(estimate).toHaveAttribute("data-estimate", "next day");
  await page.keyboard.press("ArrowDown");
  await expect(option("standard")).toBeFocused();
  await expect(value).toHaveText("standard");

  // A factory write checks without moving focus.
  await page.getByTestId("checkout-write-express").focus();
  await page.keyboard.press("Enter");
  await expect(option("express")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("checkout-write-express")).toBeFocused();

  await page.getByTestId("checkout-same-day-available").click();
  await expect(option("same-day")).toBeEnabled();
  await option("express").focus();
  await page.keyboard.press("ArrowDown");
  await expect(value).toHaveText("same-day");
  await expect(estimate).toHaveAttribute("data-estimate", "unknown");

  // The factory lock blocks only user selection.
  await page.getByTestId("checkout-lock").click();
  await expect(group).toHaveAttribute("data-disabled", "");
  await expect(page.getByTestId("checkout-state-disabled")).toHaveText("true");
  await expectTabStop(group, null);
  await option("standard").click({ force: true });
  await settle(page);
  await expect(value).toHaveText("same-day");
  await page.getByTestId("checkout-lock").click();
  await expect(option("standard")).toBeEnabled();
  await expect(page.getByTestId("checkout-unused-outputs")).toHaveText("0");

  // Whole replacement Options win over the composed directives' contradicting own inputs.
  const precedence = (role: string) => casePart(page, "precedence", role);
  const precedenceRoot = precedence("root");

  await expect(precedence("value")).toHaveText("last");
  await expect(precedence("disabled")).toHaveText("false");
  await expect(precedenceRoot).not.toHaveAttribute("data-disabled", /.*/);
  await expect(precedence("last")).toHaveAttribute("aria-checked", "true");
  await expect(precedence("first")).toHaveAttribute("aria-checked", "false");
  await expect(precedence("replaced")).toBeDisabled();
  await expectTabStop(precedenceRoot, precedence("last"));
  await precedence("first").focus();
  await page.keyboard.press("ArrowDown");
  await expect(precedence("last")).toBeFocused();
  await precedence("enable").click();
  await expect(precedence("replaced")).toBeEnabled();
  await precedence("first").focus();
  await page.keyboard.press("ArrowDown");
  await expect(precedence("replaced")).toBeFocused();
  await expect(precedence("value")).toHaveText("replaced");
  await expect(precedence("replaced")).toHaveAttribute("aria-checked", "true");
  // Replacement writes never emit the composed root's unused model output.
  await expect(precedence("outputs")).toHaveText("0");

  // A root inside a non-item descendant of another root has its own tab stop, keys and value.
  const nested = (key: string) => page.getByTestId(`nested-radio-${key}`);

  await expect(nested("a")).toHaveAttribute("tabindex", "0");
  await expect(nested("x")).toHaveAttribute("tabindex", "0");
  await expect(nested("b")).toHaveAttribute("tabindex", "-1");
  await nested("a").focus();
  await page.keyboard.press("ArrowDown");
  await expect(nested("b")).toBeFocused();
  await expect(page.getByTestId("nested-radio-outer-value")).toHaveText("b");
  await expect(page.getByTestId("nested-radio-inner-value")).toHaveText("x");
  await nested("x").focus();
  await page.keyboard.press("ArrowDown");
  await expect(nested("y")).toBeFocused();
  await expect(page.getByTestId("nested-radio-inner-value")).toHaveText("y");
  await expect(page.getByTestId("nested-radio-outer-value")).toHaveText("b");
});

test("Q8: with [formField] the group shows the initial value, writes user changes, follows model writes, emits touch only when focus leaves the group, shows required errors through the Field after blur and submit(), resets, focusBoundControl() focuses the tab stop, readonly() drops clicks, keys and arrow selection while focus still moves, and disabled() disables every item; aria-invalid, aria-required and aria-readonly follow the Field", async ({
  page,
}, info) => {
  await fixture(page, "group-field", info);

  const field = page.getByTestId("speed-field");
  const group = page.getByTestId("speed");
  const standard = page.getByTestId("speed-standard");
  const express = page.getByTestId("speed-express");
  const sameDay = page.getByTestId("speed-same-day");
  const value = page.getByTestId("speed-value");
  const touched = page.getByTestId("speed-touched");

  // Initial value null checks nothing; required reaches the Field and aria-required.
  await expect(value).toHaveText("");
  await expect(group.locator('[aria-checked="true"]')).toHaveCount(0);
  await expect(field).toHaveAttribute("data-required", "");
  await expect(group).toHaveAttribute("aria-required", "true");
  await expect(group).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(group).not.toHaveAttribute("aria-readonly", /.*/);
  await expect(group).toHaveAttribute("aria-labelledby", "speed-label");
  await expect(group).toHaveAttribute("aria-describedby", "speed-description");
  await expect(page.getByRole("radiogroup", { name: "Shipping speed" })).toHaveAttribute(
    "data-testid",
    "speed",
  );
  await expect(group).toHaveAccessibleDescription("Express ships today.");

  // User changes write the model; focus moving between items never touches.
  await express.click();
  await expect(value).toHaveText("express");
  await expect(express).toHaveAttribute("aria-checked", "true");
  await expect(touched).toHaveText("false");
  await page.keyboard.press("ArrowDown");
  await expect(sameDay).toBeFocused();
  await expect(value).toHaveText("same-day");
  await standard.click();
  await expect(value).toHaveText("standard");
  await page.keyboard.press("End");
  await expect(value).toHaveText("same-day");
  await expect(touched).toHaveText("false");

  // Focus leaving the group touches.
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("write-speed")).toBeFocused();
  await expect(touched).toHaveText("true");
  await expect(field).not.toHaveAttribute("data-invalid", /.*/);

  // A programmatic write reaches the items; the touched, now invalid field shows errors.
  await page.getByTestId("clear-speed").click();
  await expect(value).toHaveText("");
  await expect(group.locator('[aria-checked="true"]')).toHaveCount(0);
  await expect(field).toHaveAttribute("data-invalid", "");
  await expect(group).toHaveAttribute("aria-invalid", "true");
  await expect(group).toHaveAttribute("aria-describedby", "speed-description speed-error");
  await expect(group).toHaveAccessibleDescription("Express ships today. Choose a shipping speed.");
  await page.getByTestId("write-speed").click();
  await expect(value).toHaveText("same-day");
  await expect(sameDay).toHaveAttribute("aria-checked", "true");
  await expect(field).not.toHaveAttribute("data-invalid", /.*/);
  await expect(group).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(group).toHaveAttribute("aria-describedby", "speed-description");

  // reset() untouches; the value stays.
  await page.getByTestId("reset-speed").click();
  await expect(touched).toHaveText("false");
  await expect(value).toHaveText("same-day");

  // submit() touches everything and shows the errors without running the action.
  await page.getByTestId("clear-speed").click();
  await expect(field).not.toHaveAttribute("data-invalid", /.*/);
  await page.getByTestId("submit-order").click();
  await expect(touched).toHaveText("true");
  await expect(field).toHaveAttribute("data-invalid", "");
  await expect(group).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("submits")).toHaveText("0");

  // focusBoundControl() focuses the tab stop: the checked item, else the first enabled one.
  await page.getByTestId("focus-speed").click();
  await expect(standard).toBeFocused();
  await page.getByTestId("write-speed").click();
  await page.getByTestId("focus-speed").click();
  await expect(sameDay).toBeFocused();

  // readonly(): clicks, keys and arrow selection write nothing; focus still moves.
  await page.getByTestId("freeze-speed").click();
  await expect(group).toHaveAttribute("aria-readonly", "true");
  await expect(express).toBeEnabled();
  await express.click();
  await expect(express).toBeFocused();
  await expect(value).toHaveText("same-day");
  await page.keyboard.press("ArrowUp");
  await expect(standard).toBeFocused();
  await expect(value).toHaveText("same-day");
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Home");
  await settle(page);
  await expect(value).toHaveText("same-day");
  await expect(standard).toHaveAttribute("aria-checked", "false");
  await expect(sameDay).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("freeze-speed").click();
  await expect(group).not.toHaveAttribute("aria-readonly", /.*/);
  await express.click();
  await expect(value).toHaveText("express");

  // disabled(): every item natively disabled, and the root's and the Field's data-disabled.
  await page.getByTestId("lock-speed").click();

  for (const item of [standard, express, sameDay]) {
    await expect(item).toBeDisabled();
  }

  await expect(group).toHaveAttribute("data-disabled", "");
  await expect(field).toHaveAttribute("data-disabled", "");
  await page.getByTestId("lock-speed").click();
  await expect(express).toBeEnabled();
  await expect(field).not.toHaveAttribute("data-disabled", /.*/);
});

test("Q9: inside a Field the group's aria-labelledby names every Label, before and after it, replacing a static value, and its aria-describedby the Description; Labels get no for; without a Label it has no aria-labelledby; a standalone group keeps its static attributes and emits touch only when focus leaves it", async ({
  page,
}, info) => {
  await fixture(page, "group-field", info);

  const delivery = page.getByTestId("delivery");

  await expect(delivery).toHaveAttribute("aria-labelledby", "delivery-label delivery-label-2");
  await expect(delivery).toHaveAttribute("aria-describedby", "delivery-description");
  await expect(page.getByTestId("delivery-label")).not.toHaveAttribute("for", /.*/);
  await expect(page.getByTestId("delivery-label-2")).not.toHaveAttribute("for", /.*/);
  await expect(page.getByRole("radiogroup", { name: "Delivery (choose one)" })).toHaveAttribute(
    "data-testid",
    "delivery",
  );
  await expect(delivery).toHaveAccessibleDescription("Pickup is free.");

  // Without [formField] the Field has no form state to expose.
  for (const attribute of ["aria-invalid", "aria-required", "aria-readonly"]) {
    await expect(delivery).not.toHaveAttribute(attribute, /.*/);
  }

  await page.getByTestId("toggle-second-label").click();
  await expect(delivery).toHaveAttribute("aria-labelledby", "delivery-label");
  await expect(page.getByRole("radiogroup", { name: "Delivery", exact: true })).toHaveAttribute(
    "data-testid",
    "delivery",
  );
  await page.getByTestId("toggle-second-label").click();
  await expect(delivery).toHaveAttribute("aria-labelledby", "delivery-label delivery-label-2");
  await page.getByTestId("delivery-courier").click();
  await expect(page.getByTestId("delivery-courier")).toHaveAttribute("aria-checked", "true");

  // A Field without a Label replaces the static value with nothing.
  await expect(page.getByTestId("unlabelled")).not.toHaveAttribute("aria-labelledby", /.*/);

  // Standalone: unchanged static attributes; touch only when focus leaves the group.
  const standalone = page.getByTestId("standalone-radio");
  const touches = page.getByTestId("standalone-touches");

  await expect(standalone).toHaveAttribute("aria-labelledby", "standalone-heading");
  await expect(standalone).toHaveAttribute("aria-describedby", "standalone-hint");
  await expect(page.getByRole("radiogroup", { name: "Standalone size" })).toHaveAttribute(
    "data-testid",
    "standalone-radio",
  );

  for (const attribute of ["aria-invalid", "aria-required", "aria-readonly"]) {
    await expect(standalone).not.toHaveAttribute(attribute, /.*/);
  }

  await page.getByTestId("size-s").click();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("size-m")).toBeFocused();
  await page.getByTestId("size-s").click();
  await expect(touches).toHaveText("0");
  await page.getByTestId("before").click();
  await expect(touches).toHaveText("1");
});

test("Q10: a consumer component composing the RadioGroup through hostDirectives with exposed value, valueChange, disabled and touch is the control [formField] finds; the group reads FORM_FIELD on its element, and focusBoundControl() reaches the tab stop through the component's own focus()", async ({
  page,
}, info) => {
  await fixture(page, "group-field", info);

  const field = page.getByTestId("plan-field");
  const plan = page.getByTestId("plan");
  const monthly = page.getByTestId("plan-monthly");
  const yearly = page.getByTestId("plan-yearly");
  const value = page.getByTestId("plan-value");
  const touched = page.getByTestId("plan-touched");

  await expect(plan).toHaveAttribute("role", "radiogroup");
  await expect(field).toHaveAttribute("data-required", "");
  await expect(plan).toHaveAttribute("aria-required", "true");
  await expect(plan).toHaveAttribute("aria-labelledby", "plan-label");
  await expect(page.getByRole("radiogroup", { name: "Billing plan" })).toHaveAttribute(
    "data-testid",
    "plan",
  );

  await monthly.click();
  await expect(value).toHaveText("monthly");
  await page.keyboard.press("ArrowDown");
  await expect(value).toHaveText("yearly");
  await expect(touched).toHaveText("false");
  await page.getByTestId("before").click();
  await expect(touched).toHaveText("true");

  // A programmatic write changes the checked item.
  await page.getByTestId("write-plan").click();
  await expect(value).toHaveText("monthly");
  await expect(monthly).toHaveAttribute("aria-checked", "true");
  await expect(yearly).toHaveAttribute("aria-checked", "false");
  await page.getByTestId("focus-plan").click();
  await expect(monthly).toBeFocused();

  // The group reads the readonly rule from FORM_FIELD on its own element.
  await page.getByTestId("freeze-plan").click();
  await expect(plan).toHaveAttribute("aria-readonly", "true");
  await yearly.click();
  await settle(page);
  await expect(value).toHaveText("monthly");
  await expect(yearly).toHaveAttribute("aria-checked", "false");
  await page.getByTestId("freeze-plan").click();

  await page.getByTestId("lock-plan").click();
  await expect(monthly).toBeDisabled();
  await expect(field).toHaveAttribute("data-disabled", "");
  await page.getByTestId("lock-plan").click();
  await yearly.click();
  await expect(value).toHaveText("yearly");
});
