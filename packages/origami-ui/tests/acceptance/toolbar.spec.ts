import { test, expect } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import {
  assertReferences,
  bootstrapHeld,
  fixture,
  stopRetentionObservation,
} from "./observation.js";

function tool(page: Page, key: string): Locator {
  return page.getByTestId(`toolbar-${key}`);
}

/** Locates `role` inside the cases fixture's Toolbar or element marked `name`. */
function casePart(page: Page, name: string, role: string): Locator {
  return page.locator(`[data-toolbar-case="${name}"] [data-role="${role}"]`);
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

/** Exactly one control of `toolbar` is the tab stop, and it is `expected`; null means none is. */
async function expectTabStop(toolbar: Locator, expected: Locator | null): Promise<void> {
  const stops = toolbar.locator('button[tabindex="0"]');

  if (expected === null) {
    await expect(stops).toHaveCount(0);

    return;
  }

  await expect(stops).toHaveCount(1);
  await expect(expected).toHaveAttribute("tabindex", "0");
}

test("K1: toolbar semantics, items keep their own activation, disabled items are skipped, a click takes the tab stop, orientation writes never move focus", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const toolbar = page.getByTestId("toolbar");

  await expect(toolbar).toHaveAttribute("role", "toolbar");
  await expect(toolbar).toHaveAttribute("aria-label", "Editing");
  await expect(toolbar).toHaveAttribute("aria-orientation", "horizontal");
  await expect(toolbar).toHaveAttribute("data-orientation", "horizontal");

  for (const key of ["undo", "redo", "clear"]) {
    await expect(tool(page, key)).toHaveAttribute("type", "button");
  }

  await expect(tool(page, "redo")).toBeDisabled();
  await expect(tool(page, "redo")).toHaveAttribute("aria-disabled", "true");
  await expect(tool(page, "redo")).toHaveAttribute("data-disabled", "");
  await expect(tool(page, "undo")).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(tool(page, "undo")).not.toHaveAttribute("data-disabled", /.*/);
  await expectTabStop(toolbar, tool(page, "undo"));
  await expect(tool(page, "clear")).toHaveAttribute("tabindex", "-1");

  // Keyboard focus starts on another item and the click must take the roving position.
  await tool(page, "undo").focus();
  await preventNextMousedownFocus(page);
  await tool(page, "clear").click();
  await expect(tool(page, "clears")).toHaveText("1");
  await expect(tool(page, "clear")).toBeFocused();
  await expectTabStop(toolbar, tool(page, "clear"));
  // The next move starts from the clicked item, skips nothing enabled, wraps and activates nothing.
  await page.keyboard.press("ArrowRight");
  await expect(tool(page, "undo")).toBeFocused();
  await settle(page);
  await expect(tool(page, "undos")).toHaveText("0");
  await expect(tool(page, "clears")).toHaveText("1");

  await page.keyboard.press("Enter");
  await expect(tool(page, "undos")).toHaveText("1");
  await tool(page, "clear").focus();
  await page.keyboard.press("Space");
  await expect(tool(page, "clears")).toHaveText("2");
  await expect(tool(page, "submits")).toHaveText("0");
  await expect(tool(page, "redos")).toHaveText("0");

  // An enabled item rejoins navigation.
  await tool(page, "redo-disable").click();
  await expect(tool(page, "redo")).toBeEnabled();
  await expect(tool(page, "redo")).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(tool(page, "redo")).not.toHaveAttribute("data-disabled", /.*/);
  await tool(page, "undo").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tool(page, "redo")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(tool(page, "redos")).toHaveText("1");
  await tool(page, "redo-disable").click();
  await expect(tool(page, "redo")).toBeDisabled();

  // An external orientation write flips the semantics without moving focus.
  await tool(page, "vertical").focus();
  await page.keyboard.press("Enter");
  await expect(toolbar).toHaveAttribute("aria-orientation", "vertical");
  await expect(toolbar).toHaveAttribute("data-orientation", "vertical");
  await expect(tool(page, "orientation")).toHaveText("vertical");
  await expect(tool(page, "vertical")).toBeFocused();
  await tool(page, "undo").focus();
  await page.keyboard.press("ArrowDown");
  await expect(tool(page, "clear")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(tool(page, "clear")).toBeFocused();
});

test("K2: arrows skip disabled items and wrap; vertical and reading direction; re-entry on the first enabled item; non-item content keeps its keys", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const keyboard = page.locator('[data-toolbar-case="keyboard"]');
  const part = (role: string) => casePart(page, "keyboard", role);

  await expect(part("second")).toBeDisabled();
  await expectTabStop(keyboard, part("first"));
  await part("first").focus();

  const moves = [
    { key: "ArrowRight", focused: "third" },
    { key: "ArrowRight", focused: "fourth" },
    { key: "ArrowRight", focused: "first" },
    { key: "ArrowLeft", focused: "fourth" },
    { key: "Home", focused: "first" },
    { key: "End", focused: "fourth" },
  ];

  for (const move of moves) {
    await page.keyboard.press(move.key);
    await expect(part(move.focused)).toBeFocused();
    await expectTabStop(keyboard, part(move.focused));
  }

  // Unhandled axis and modified keys do nothing.
  for (const key of ["ArrowDown", "ArrowUp", "Shift+ArrowRight", "Control+ArrowLeft", "Alt+Home"]) {
    await page.keyboard.press(key);
    await expect(part("fourth")).toBeFocused();
  }

  // An earlier listener's preventDefault leaves the key to the application.
  await page.evaluate(() => {
    document.addEventListener("keydown", (event) => event.preventDefault(), {
      capture: true,
      once: true,
    });
  });
  await page.keyboard.press("ArrowRight");
  await expect(part("fourth")).toBeFocused();

  // Tab leaves the items for the input, which has its own Tab stop; Shift+Tab re-enters on the
  // first enabled item, not the last focused one.
  await page.keyboard.press("Tab");
  await expect(part("find")).toBeFocused();
  await expectTabStop(keyboard, part("first"));
  await page.keyboard.press("Shift+Tab");
  await expect(part("first")).toBeFocused();

  // The non-item input keeps its arrow keys: the caret moves and focus stays.
  await part("find").focus();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await expect(part("find")).toBeFocused();
  await expect
    .poll(() => part("find").evaluate((input: HTMLInputElement) => input.selectionStart))
    .toBe(3);

  const vertical = page.locator('[data-toolbar-case="vertical"]');
  const verticalPart = (role: string) => casePart(page, "vertical", role);

  await expect(vertical).toHaveAttribute("aria-orientation", "vertical");
  await expect(vertical).toHaveAttribute("data-orientation", "vertical");
  await verticalPart("image").focus();
  await page.keyboard.press("ArrowDown");
  await expect(verticalPart("table")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(verticalPart("chart")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(verticalPart("image")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(verticalPart("chart")).toBeFocused();

  for (const key of ["ArrowLeft", "ArrowRight"]) {
    await page.keyboard.press(key);
    await expect(verticalPart("chart")).toBeFocused();
  }

  await expectTabStop(vertical, verticalPart("chart"));

  const rtlPart = (role: string) => casePart(page, "rtl", role);

  await rtlPart("first").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(rtlPart("second")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(rtlPart("first")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(rtlPart("third")).toBeFocused();

  const rtlVerticalPart = (role: string) => casePart(page, "rtl-vertical", role);

  await rtlVerticalPart("first").focus();
  await page.keyboard.press("ArrowDown");
  await expect(rtlVerticalPart("second")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(rtlVerticalPart("first")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(rtlVerticalPart("first")).toBeFocused();
});

test("K3: Toolbar groups share one tab stop and arrow sequence in DOM order, in server HTML, after hydration and after a keyed move", async ({
  page,
}, info) => {
  const release = await bootstrapHeld(page, "/core", info);
  const toolbar = page.locator('[data-toolbar-case="joined"]');
  const part = (role: string) => casePart(page, "joined", role);
  const outside = page.locator('[data-toolbar-case="outside-group"]');
  const order = ["cut", "copy", "b", "i", "u", "left", "right", "paste"];

  // Server HTML: one tab stop, on Cut, not on the pressed B or the pressed Right; the group
  // reports the Toolbar's orientation. The group outside keeps its own tab stop.
  await expectTabStop(toolbar, part("cut"));
  await expect(part("b")).toHaveAttribute("aria-pressed", "true");
  await expect(part("right")).toHaveAttribute("aria-pressed", "true");
  await expect(part("marks")).toHaveAttribute("role", "group");
  await expect(part("marks")).toHaveAttribute("data-orientation", "horizontal");
  await expect(part("marks")).not.toHaveAttribute("aria-orientation", /.*/);
  await expectTabStop(outside, outside.locator('[data-role="b"]'));

  release();
  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  await expect(page.locator("setup-readiness")).toHaveAttribute(
    "data-runtime",
    String(info.project.metadata.runtime),
  );
  await page.getByTestId("attach-fixture").click();
  await expect(page.getByTestId("fixture-attached")).toHaveText("true");
  await assertReferences(page, info);
  await stopRetentionObservation(page);
  await expectTabStop(toolbar, part("cut"));
  await expect(part("marks-orientation")).toHaveText("horizontal");

  await part("cut").focus();

  for (const role of [...order.slice(1), "cut"]) {
    await page.keyboard.press("ArrowRight");
    await expect(part(role)).toBeFocused();
    await expectTabStop(toolbar, part(role));
  }

  // Moves never press.
  await settle(page);
  await expect(part("marks-value")).toHaveText("b");
  await expect(part("mark-outputs")).toHaveText("0");
  await expect(casePart(page, "joined", "alignment-value")).toHaveText("right");

  // The Toolbar group's own vertical orientation has no effect.
  await part("b").focus();
  await page.keyboard.press("ArrowDown");
  await expect(part("b")).toBeFocused();
  await part("i").focus();
  await page.keyboard.press("Space");
  await expect(part("marks-value")).toHaveText("b,i");
  await expect(part("mark-outputs")).toHaveText("1");
  await preventNextMousedownFocus(page);
  await part("u").click();
  await expect(part("marks-value")).toHaveText("b,i,u");
  await expect(part("mark-outputs")).toHaveText("2");
  await expect(part("u")).toBeFocused();
  await expectTabStop(toolbar, part("u"));

  // A keyed move of the whole group reorders the interleaving.
  await page.getByTestId("toolbar-joined-move").click();
  await expect(toolbar.locator("button").first()).toHaveAttribute("data-role", "b");
  await part("paste").focus();
  await page.keyboard.press("End");
  await expect(part("paste")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(part("b")).toBeFocused();
  await part("u").focus();
  await page.keyboard.press("ArrowRight");
  await expect(part("cut")).toBeFocused();

  // A disabled group's items are skipped.
  await page.getByTestId("toolbar-marks-disable").click();
  await expect(part("b")).toBeDisabled();
  await part("cut").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(part("paste")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(part("cut")).toBeFocused();

  // The group outside the Toolbar keeps its own roving.
  await expectTabStop(outside, outside.locator('[data-role="b"]'));
  await outside.locator('[data-role="b"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(outside.locator('[data-role="a"]')).toBeFocused();
});

test("K4: focus repair for toolbar and Toolbar group items never activates or steals focus", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const toolbar = page.locator('[data-toolbar-case="repair"]');
  const part = (role: string) => casePart(page, "repair", role);
  const restore = page.getByTestId("toolbar-repair-restore");

  // Removing or disabling the focused toolbar item or Toolbar group item moves focus to the tab stop.
  for (const [role, key] of [
    ["beta", "Delete"],
    ["gamma", "d"],
    ["y", "Delete"],
    ["x", "d"],
  ]) {
    await part(role).focus();
    await page.keyboard.press(key);
    await expect(part("alpha")).toBeFocused();
    await expectTabStop(toolbar, part("alpha"));
    await restore.click();
    await expect(part(role)).toBeEnabled();
  }

  await expect(part("x")).toHaveAttribute("aria-pressed", "false");

  // Focus the application moved elsewhere is never stolen.
  await part("beta").focus();
  await page.getByTestId("toolbar-repair-remove-beta").focus();
  await page.keyboard.press("Enter");
  await expect(part("beta")).toHaveCount(0);
  await expect(page.getByTestId("toolbar-repair-remove-beta")).toBeFocused();
  await restore.click();

  // An item whose focus handler disables it, reached by ArrowRight and by a click.
  await part("y").focus();
  await page.keyboard.press("ArrowRight");
  await expect(part("self-disable")).toBeDisabled();
  await expect(part("alpha")).toBeFocused();
  await restore.click();
  await expect(part("self-disable")).toBeEnabled();
  await part("alpha").focus();
  await preventNextMousedownFocus(page);
  await part("self-disable").click();
  await expect(part("self-disable")).toBeDisabled();
  await expect(part("alpha")).toBeFocused();
  await expect(part("y")).toHaveAttribute("aria-pressed", "false");
});

test("K5: replaced root and item Options drive behavior with no fallback; State reaches a separator; a Toolbar Toggle is one control", async ({
  page,
}, info) => {
  await fixture(page, "composition", info);

  const toolbar = page.getByTestId("editor-toolbar");
  const command = (key: string) => page.getByTestId(`editor-${key}`);
  const separator = page.getByTestId("editor-separator");

  await expect(toolbar).toHaveAttribute("role", "toolbar");
  // The factory orientation wins over the contradicting unused own input.
  await expect(toolbar).toHaveAttribute("aria-orientation", "horizontal");
  await expect(toolbar).toHaveAttribute("data-orientation", "horizontal");
  await expect(page.getByTestId("editor-orientation")).toHaveText("horizontal");
  await expect(separator).toHaveAttribute("aria-orientation", "vertical");
  // Domain-derived item Options drive native disabled and navigation.
  await expect(command("paste")).toBeDisabled();
  await expect(command("paste")).toHaveAttribute("aria-disabled", "true");
  await expectTabStop(toolbar, command("cut"));
  await expect(command("spellcheck")).toHaveAttribute("aria-pressed", "false");

  await command("cut").focus();

  for (const key of ["copy", "spellcheck", "cut"]) {
    await page.keyboard.press("ArrowRight");
    await expect(command(key)).toBeFocused();
  }

  await command("spellcheck").focus();
  await page.keyboard.press("Enter");
  await expect(command("spellcheck")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("editor-spellcheck-value")).toHaveText("true");
  await expect(page.getByTestId("editor-spellcheck-outputs")).toHaveText("1");
  await preventNextMousedownFocus(page);
  await command("cut").focus();
  await command("spellcheck").click();
  await expect(command("spellcheck")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("editor-spellcheck-outputs")).toHaveText("2");
  await expect(command("spellcheck")).toBeFocused();

  // A factory write flips the orientation and the separator follows through State.
  await page.getByTestId("editor-vertical").click();
  await expect(toolbar).toHaveAttribute("aria-orientation", "vertical");
  await expect(separator).toHaveAttribute("aria-orientation", "horizontal");
  await page.getByTestId("editor-paste-available").click();
  await expect(command("paste")).toBeEnabled();
  await command("copy").focus();
  await page.keyboard.press("ArrowDown");
  await expect(command("paste")).toBeFocused();

  // The Toolbar Toggle's disabled binding disables it as a Toggle and as a control; every control
  // disabled leaves no tab stop.
  await page.getByTestId("editor-read-only").click();

  for (const key of ["cut", "copy", "paste", "spellcheck"]) {
    await expect(command(key)).toBeDisabled();
    await expect(command(key)).toHaveAttribute("aria-disabled", "true");
  }

  await expect(command("spellcheck")).toHaveAttribute("aria-pressed", "false");
  await expectTabStop(toolbar, null);
  await command("spellcheck").click({ force: true });
  await settle(page);
  await expect(command("spellcheck")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("editor-spellcheck-outputs")).toHaveText("2");
  await page.getByTestId("editor-read-only").click();
  await expect(command("spellcheck")).toBeEnabled();

  // Whole replacement Options win over the composed directives' contradicting own inputs.
  const precedence = (role: string) => casePart(page, "precedence", role);
  const precedenceRoot = precedence("root");

  await expect(precedenceRoot).toHaveAttribute("aria-orientation", "vertical");
  await expect(precedence("orientation")).toHaveText("vertical");
  await expect(precedence("replaced")).toBeDisabled();
  await precedence("first").focus();
  await page.keyboard.press("ArrowDown");
  await expect(precedence("last")).toBeFocused();
  await precedence("enable").click();
  await expect(precedence("replaced")).toBeEnabled();
  await precedence("last").focus();
  await page.keyboard.press("ArrowUp");
  await expect(precedence("replaced")).toBeFocused();
  await precedence("horizontal").click();
  await expect(precedenceRoot).toHaveAttribute("aria-orientation", "horizontal");
});

test("K7: a standalone group in Popover Content whose Trigger is a Toolbar Popover Trigger keeps its own roving and tab stop", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const toolbar = page.locator('[data-toolbar-case="popover"]');
  const part = (role: string) => casePart(page, "popover", role);

  await expect(part("before")).toHaveAttribute("tabindex", "0");
  await expect(part("trigger")).toHaveAttribute("tabindex", "-1");
  // The group's own tab stop, beside the Toolbar's.
  await expect(part("image")).toHaveAttribute("tabindex", "0");
  await expect(part("kinds")).toHaveAttribute("data-orientation", "horizontal");

  await part("before").focus();

  for (const role of ["trigger", "after", "before"]) {
    await page.keyboard.press("ArrowRight");
    await expect(part(role)).toBeFocused();
  }

  await part("trigger").click();
  await expect(part("content")).toBeVisible();
  await expect(part("trigger")).toHaveAttribute("tabindex", "0");
  await expect(toolbar.locator('button[tabindex="0"]')).toHaveCount(2);
  await part("image").focus();
  await page.keyboard.press("ArrowRight");
  await expect(part("table")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(part("image")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(part("table")).toBeFocused();
  // Focus is in the Trigger's own Content, so the Trigger keeps the Toolbar's tab stop; the
  // group's is the focused item.
  await expect(part("trigger")).toHaveAttribute("tabindex", "0");
  await expect(part("before")).toHaveAttribute("tabindex", "-1");
  await expect(part("table")).toHaveAttribute("tabindex", "0");
  await expect(toolbar.locator('button[tabindex="0"]')).toHaveCount(2);
  // Once focus leaves both, the tab stop returns to the Toolbar's first enabled item.
  await page.getByTestId("toolbar-format-before").focus();
  await expect(part("before")).toHaveAttribute("tabindex", "0");
  await expect(part("trigger")).toHaveAttribute("tabindex", "-1");
});

test("K10: a Toolbar Popover Trigger disabled by its own input or its Popover is skipped, leaves Tab on the toolbar and opens nothing, both ways", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const toolbar = page.locator('[data-toolbar-case="disabled-popover"]');
  const part = (role: string) => casePart(page, "disabled-popover", role);
  const trigger = part("trigger");

  /** Tab from the button before the Toolbar reaches its tab stop, `expected`. */
  async function expectTabReaches(expected: Locator): Promise<void> {
    await page.getByTestId("toolbar-format-before").focus();
    await page.keyboard.press("Tab");
    await expect(expected).toBeFocused();
  }

  async function expectDisabled(): Promise<void> {
    await expect(trigger).toHaveJSProperty("disabled", true);
    await expect(trigger).toHaveAttribute("aria-disabled", "true");
    await expect(trigger).toHaveAttribute("data-disabled", "");
    await expect(trigger).toHaveAttribute("tabindex", "-1");
    await expectTabStop(toolbar, part("bold"));
    await expectTabReaches(part("bold"));
    // The disabled Trigger is not in the arrow sequence.
    await page.keyboard.press("ArrowRight");
    await expect(part("bold")).toBeFocused();
    await trigger.click({ force: true });

    // Native `disabled` drops the trusted click before any listener runs. A dispatched click
    // still reaches the listeners, so only the Trigger's own guard keeps the Popover closed.
    const dispatched = await trigger.evaluate((element) => {
      let received = 0;

      element.addEventListener("click", () => {
        received += 1;
      });
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

      return received;
    });

    expect(dispatched).toBe(1);
    await settle(page);
    await expect(page.getByTestId("toolbar-format-open")).toHaveText("false");
    await expect(part("content")).toBeHidden();
  }

  await expectDisabled();
  await page.getByTestId("toolbar-format-disable").click();
  await expect(trigger).toHaveJSProperty("disabled", false);
  await expect(trigger).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(trigger).not.toHaveAttribute("data-disabled", /.*/);
  await expectTabStop(toolbar, trigger);
  await expect(part("bold")).toHaveAttribute("tabindex", "-1");
  await expectTabReaches(trigger);
  await page.keyboard.press("ArrowRight");
  await expect(part("bold")).toBeFocused();
  await trigger.click();
  await expect(part("content")).toBeVisible();
  await expect(page.getByTestId("toolbar-format-open")).toHaveText("true");
  await trigger.click();
  await expect(part("content")).toBeHidden();
  await expect(page.getByTestId("toolbar-format-open")).toHaveText("false");
  // The clicks gave the Trigger the tab stop, so disabling must move it back to Bold.
  await expectTabStop(toolbar, trigger);
  await page.getByTestId("toolbar-format-disable").click();
  await expectDisabled();

  // Disabling the Popover root disables its Trigger as a Toolbar control too.
  await page.getByTestId("toolbar-format-disable").click();
  await expectTabStop(toolbar, trigger);
  await page.getByTestId("toolbar-format-root-disable").click();
  await expectDisabled();
  await page.getByTestId("toolbar-format-root-disable").click();
  await expect(trigger).toHaveJSProperty("disabled", false);
  await expectTabStop(toolbar, trigger);
});

test("K11: a Toolbar Radio Group inside a Field never joins it: the Label names nothing, the group keeps its static aria-labelledby and gets no aria-describedby", async ({
  page,
}, info) => {
  await fixture(page, "group-field", info);

  const group = page.getByTestId("toolbar-radio");

  await expect(page.getByTestId("toolbar-label")).not.toHaveAttribute("for", /.*/);
  await expect(group).toHaveAttribute("aria-labelledby", "toolbar-static");
  await expect(group).not.toHaveAttribute("aria-describedby", /.*/);

  for (const attribute of ["aria-invalid", "aria-required", "aria-readonly"]) {
    await expect(group).not.toHaveAttribute(attribute, /.*/);
  }

  for (const attribute of ["data-invalid", "data-disabled", "data-required"]) {
    await expect(page.getByTestId("toolbar-field")).not.toHaveAttribute(attribute, /.*/);
  }

  await page.getByTestId("toolbar-left").click();
  await expect(page.getByTestId("toolbar-left")).toHaveAttribute("aria-checked", "true");
});

test("K12: while focus is in a Toolbar Popover Trigger's own Content inside the Toolbar, the Trigger keeps the tab stop, so Shift+Tab out of the Content returns to it", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const toolbar = page.locator('[data-toolbar-case="paste"]');
  const part = (role: string) => casePart(page, "paste", role);

  /** Shift+Tab from the Content's last control walks it back to the Trigger, which stays the tab stop. */
  async function expectShiftTabToTrigger(): Promise<void> {
    for (const role of ["unmount", "close", "remove", "first", "trigger"]) {
      await page.keyboard.press("Shift+Tab");
      await expect(part(role)).toBeFocused();
      await expectTabStop(toolbar, part("trigger"));
    }
  }

  // Keyboard opening: Tab in, arrow to the Trigger, Enter.
  await page.getByTestId("toolbar-paste-before").focus();
  await page.keyboard.press("Tab");
  await expect(part("copy")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(part("trigger")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(part("content")).toBeVisible();

  // Authored order runs from the Trigger into its Content, which keeps it the Toolbar's tab stop.
  for (const role of ["first", "remove", "close", "unmount", "last"]) {
    await page.keyboard.press("Tab");
    await expect(part(role)).toBeFocused();
    await expectTabStop(toolbar, part("trigger"));
  }

  await expectShiftTabToTrigger();
  await expect(part("content")).toBeVisible();

  // Tab out of the Content's last control leaves both, past the Toolbar's other items, and the
  // Popover stays open.
  await part("last").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("toolbar-paste-after")).toBeFocused();
  await expect(part("content")).toBeVisible();
  await expectTabStop(toolbar, part("copy"));

  // Pointer entry from outside makes the Trigger the tab stop without focusing it.
  await page.getByTestId("toolbar-paste-before").focus();
  await part("last").click();
  await expect(part("last")).toBeFocused();
  await expectTabStop(toolbar, part("trigger"));
  await expectShiftTabToTrigger();
});

test("K13: Content authored after or before its Toolbar keeps its Trigger the tab stop while it holds focus, in authored Tab order with no bridge", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const after = (role: string) => casePart(page, "content-after", role);
  const before = (role: string) => casePart(page, "content-before", role);
  const between = page.getByTestId("toolbar-outside-between");

  // Content after the Toolbar: Paste is not a tab stop, so Tab from the Trigger enters the Content.
  await after("trigger").click();
  await expect(after("content")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(after("first")).toBeFocused();
  await expectTabStop(after("toolbar"), after("trigger"));
  await page.keyboard.press("Shift+Tab");
  await expect(after("trigger")).toBeFocused();
  await after("last").focus();
  await expectTabStop(after("toolbar"), after("trigger"));
  await page.keyboard.press("Tab");
  await expect(between).toBeFocused();
  await expectTabStop(after("toolbar"), after("copy"));
  // Close it so it can't cover the second Toolbar.
  await after("trigger").click();
  await expect(after("content")).toBeHidden();

  // Content before the Toolbar: Shift+Tab out of it reaches what precedes it, Tab out of it
  // reaches the Trigger.
  await before("trigger").click();
  await expect(before("content")).toBeVisible();
  await before("first").focus();
  await expectTabStop(before("toolbar"), before("trigger"));
  await page.keyboard.press("Shift+Tab");
  await expect(between).toBeFocused();
  await expectTabStop(before("toolbar"), before("copy"));
  await before("last").focus();
  await expectTabStop(before("toolbar"), before("trigger"));
  await page.keyboard.press("Tab");
  await expect(before("trigger")).toBeFocused();
  await expect(before("content")).toBeVisible();
});

test("K14: focus leaving both the Toolbar and its Trigger's own Content, by any route, returns the tab stop to the first enabled item; close and removal never leave it on the Trigger", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const toolbar = page.locator('[data-toolbar-case="paste"]');
  const part = (role: string) => casePart(page, "paste", role);
  const before = page.getByTestId("toolbar-paste-before");
  const body = page.locator("body");

  /** Restores and opens the Popover with focus on `role` in its Content. */
  async function focusContent(role: string): Promise<void> {
    await page.getByTestId("toolbar-paste-restore").click();
    await expect(part("content")).toBeHidden();
    await part("trigger").click();
    await expect(part("content")).toBeVisible();
    await part(role).focus();
    await expectTabStop(toolbar, part("trigger"));
  }

  /** Re-entry from outside lands on the first enabled item, as in K2. */
  async function expectReentryOnCopy(): Promise<void> {
    await before.focus();
    await page.keyboard.press("Tab");
    await expect(part("copy")).toBeFocused();
  }

  // Script focus outside, then direct re-entry into the open Content.
  await focusContent("first");
  await before.focus();
  await expect(part("content")).toBeVisible();
  await expectTabStop(toolbar, part("copy"));
  await part("last").focus();
  await expectTabStop(toolbar, part("trigger"));
  // Clicking another control makes it the tab stop.
  await part("paste").click();
  await expect(part("paste")).toBeFocused();
  await expect(part("content")).toBeHidden();
  await expectTabStop(toolbar, part("paste"));

  // A click outside on nothing focusable closes the Popover and focuses nothing.
  await focusContent("first");
  await page.getByTestId("toolbar-paste-blank").click();
  await expect(part("content")).toBeHidden();
  await expect(body).toBeFocused();
  await expectTabStop(toolbar, part("copy"));
  await expectReentryOnCopy();

  // A click on a button outside closes it and focuses that button.
  await focusContent("first");
  await page.getByTestId("toolbar-paste-after").click();
  await expect(part("content")).toBeHidden();
  await expect(page.getByTestId("toolbar-paste-after")).toBeFocused();
  await expectTabStop(toolbar, part("copy"));

  // Escape and a consumer close from inside both restore focus to the Trigger, which keeps the
  // tab stop.
  await focusContent("first");
  await page.keyboard.press("Escape");
  await expect(part("content")).toBeHidden();
  await expect(part("trigger")).toBeFocused();
  await expectTabStop(toolbar, part("trigger"));
  await focusContent("close");
  await page.keyboard.press("Enter");
  await expect(part("content")).toBeHidden();
  await expect(part("trigger")).toBeFocused();
  await expectTabStop(toolbar, part("trigger"));

  // Removing the focused control drops focus to the body; not every engine fires focusout for it.
  await focusContent("remove");
  await page.keyboard.press("Enter");
  await expect(part("remove")).toHaveCount(0);
  await expect(body).toBeFocused();
  await expect(part("content")).toBeVisible();
  await expectTabStop(toolbar, part("copy"));
  await expectReentryOnCopy();

  // Unmounting the Content with focus inside it.
  await focusContent("unmount");
  await page.keyboard.press("Enter");
  await expect(part("content")).toHaveCount(0);
  await expect(body).toBeFocused();
  await expectTabStop(toolbar, part("copy"));
  await expectReentryOnCopy();
});
