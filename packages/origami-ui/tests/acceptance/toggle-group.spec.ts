import { test, expect } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import { fixture } from "./observation.js";

const alignmentKeys = ["start", "center", "end"];

function align(page: Page, key: string): Locator {
  return page.getByTestId(`align-${key}`);
}

function mark(page: Page, key: string): Locator {
  return page.getByTestId(`mark-${key}`);
}

/** Locates `role` inside the cases fixture's group or element marked `name`. */
function casePart(page: Page, name: string, role: string): Locator {
  return page.locator(`[data-toggle-group-case="${name}"] [data-role="${role}"]`);
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

/** Exactly one item of `group` is the tab stop, and it is `expected`; null means none is. */
async function expectTabStop(group: Locator, expected: Locator | null): Promise<void> {
  const stops = group.locator(':scope > button[tabindex="0"]');

  if (expected === null) {
    await expect(stops).toHaveCount(0);

    return;
  }

  await expect(stops).toHaveCount(1);
  await expect(expected).toHaveAttribute("tabindex", "0");
}

test("U1: group semantics, Single activation exactly once, deselect policy, unknown values, disabled blocks only user activation", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const group = page.getByTestId("alignment");
  const value = page.getByTestId("alignment-value");
  const outputs = page.getByTestId("alignment-outputs");

  await expect(group).toHaveAttribute("role", "group");
  await expect(group).toHaveAttribute("aria-label", "Text alignment");
  await expect(group).toHaveAttribute("data-orientation", "horizontal");
  await expect(group).not.toHaveAttribute("aria-orientation", /.*/);
  await expect(group).not.toHaveAttribute("data-disabled", /.*/);

  for (const key of alignmentKeys) {
    await expect(align(page, key)).toHaveAttribute("type", "button");
    await expect(align(page, key)).not.toHaveAttribute("aria-disabled", /.*/);
    await expect(align(page, key)).not.toHaveAttribute("data-disabled", /.*/);
  }

  await expect(align(page, "start")).toHaveAttribute("aria-pressed", "true");
  await expect(align(page, "start")).toHaveAttribute("data-pressed", "");
  await expect(align(page, "center")).toHaveAttribute("aria-pressed", "false");
  await expect(align(page, "center")).not.toHaveAttribute("data-pressed", /.*/);
  await expectTabStop(group, align(page, "start"));
  await expect(align(page, "center")).toHaveAttribute("tabindex", "-1");

  // Keyboard focus starts on another item and the click must take the roving position.
  await align(page, "start").focus();
  await preventNextMousedownFocus(page);
  await align(page, "center").click();
  await expect(value).toHaveText("center");
  await expect(outputs).toHaveText("1");
  await expect(align(page, "center")).toHaveAttribute("aria-pressed", "true");
  await expect(align(page, "start")).toHaveAttribute("aria-pressed", "false");
  await expect(align(page, "center")).toBeFocused();
  await expectTabStop(group, align(page, "center"));
  // The next move starts from the clicked item and presses nothing.
  await page.keyboard.press("ArrowRight");
  await expect(align(page, "end")).toBeFocused();
  await settle(page);
  await expect(value).toHaveText("center");
  await expect(outputs).toHaveText("1");
  await expect(align(page, "end")).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Enter");
  await expect(value).toHaveText("end");
  await expect(outputs).toHaveText("2");
  await align(page, "start").focus();
  await page.keyboard.press("Space");
  await expect(value).toHaveText("start");
  await expect(outputs).toHaveText("3");
  await expect(page.getByTestId("alignment-submits")).toHaveText("0");

  // Without deselectable, the pressed item stays an ordinary enabled pressed button that writes nothing.
  await align(page, "start").click();
  await settle(page);
  await expect(value).toHaveText("start");
  await expect(outputs).toHaveText("3");
  await expect(align(page, "start")).toHaveAttribute("aria-pressed", "true");
  await expect(align(page, "start")).toBeEnabled();
  await expect(align(page, "start")).not.toHaveAttribute("aria-disabled", /.*/);

  await page.getByTestId("alignment-deselectable").click();
  await align(page, "start").click();
  await expect(value).toHaveText("");
  await expect(outputs).toHaveText("4");
  await expect(align(page, "start")).toHaveAttribute("aria-pressed", "false");
  await align(page, "start").click();
  await expect(value).toHaveText("start");
  await expect(outputs).toHaveText("5");
  await page.getByTestId("alignment-deselectable").click();

  // An unknown value presses nothing, is not rewritten, and leaves the first enabled item the tab stop.
  await page.getByTestId("script-alignment-unknown").click();
  await expect(value).toHaveText("unmounted");

  for (const key of alignmentKeys) {
    await expect(align(page, key)).toHaveAttribute("aria-pressed", "false");
  }

  await expectTabStop(group, align(page, "start"));
  await settle(page);
  await expect(value).toHaveText("unmounted");
  await expect(outputs).toHaveText("5");
  await align(page, "start").click();
  await expect(outputs).toHaveText("6");

  await page.getByTestId("disable-center-alignment").click();
  await expect(align(page, "center")).toBeDisabled();
  await expect(align(page, "center")).toHaveAttribute("aria-disabled", "true");
  await expect(align(page, "center")).toHaveAttribute("data-disabled", "");
  // A trusted click on the native disabled button dispatches nothing.
  await align(page, "center").click({ force: true });
  await settle(page);
  await expect(value).toHaveText("start");
  await page.getByTestId("disable-center-alignment").click();
  await expect(align(page, "center")).toBeEnabled();

  await page.getByTestId("disable-alignment").click();
  await expect(group).toHaveAttribute("data-disabled", "");
  await expect(page.getByTestId("alignment-disabled")).toHaveText("true");

  for (const key of alignmentKeys) {
    await expect(align(page, key)).toBeDisabled();
    await expect(align(page, key)).toHaveAttribute("aria-disabled", "true");
  }

  // With every item disabled there is no tab stop.
  await expectTabStop(group, null);
  await align(page, "end").click({ force: true });
  await settle(page);
  await expect(value).toHaveText("start");
  // External writes stay authoritative while disabled and emit no model output.
  await page.getByTestId("script-alignment").click();
  await expect(align(page, "end")).toHaveAttribute("aria-pressed", "true");
  await expect(outputs).toHaveText("6");
  await page.getByTestId("disable-alignment").click();
  await expectTabStop(group, align(page, "end"));
  await align(page, "center").click();
  await expect(value).toHaveText("center");
  await expect(outputs).toHaveText("7");
});

test("U2: Multiple writes new arrays, keeps unknown values and order, never prunes; moves press nothing", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const group = page.getByTestId("marks");
  const value = page.getByTestId("marks-value");
  const outputs = page.getByTestId("mark-outputs");

  await expect(group).toHaveAttribute("role", "group");
  await expect(value).toHaveText("unmounted");

  for (const key of ["bold", "italic", "underline"]) {
    await expect(mark(page, key)).toHaveAttribute("aria-pressed", "false");
  }

  // Nothing is pressed, so the first enabled item is the tab stop.
  await expectTabStop(group, mark(page, "bold"));

  await mark(page, "bold").click();
  await expect(value).toHaveText("unmounted,bold");
  await expect(outputs).toHaveText("1");
  await mark(page, "italic").click();
  await expect(value).toHaveText("unmounted,bold,italic");
  await expect(outputs).toHaveText("2");
  await mark(page, "bold").click();
  await expect(value).toHaveText("unmounted,italic");
  await expect(outputs).toHaveText("3");
  await expect(mark(page, "bold")).toHaveAttribute("aria-pressed", "false");
  await expect(mark(page, "italic")).toHaveAttribute("aria-pressed", "true");
  // The caller's frozen array is never mutated.
  await expect(page.getByTestId("marks-original")).toHaveText("unmounted");

  // Removing a pressed item doesn't prune its value.
  await page.getByTestId("remove-italic-mark").click();
  await expect(mark(page, "italic")).toHaveCount(0);
  await settle(page);
  await expect(value).toHaveText("unmounted,italic");
  await expect(outputs).toHaveText("3");

  await mark(page, "bold").focus();
  await page.keyboard.press("ArrowRight");
  await expect(mark(page, "underline")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(mark(page, "bold")).toBeFocused();
  await settle(page);
  await expect(value).toHaveText("unmounted,italic");
  await expect(outputs).toHaveText("3");
  await expect(mark(page, "underline")).toHaveAttribute("aria-pressed", "false");
});

test("U3: arrows skip disabled items and wrap; vertical and reading direction; one tab stop; re-entry on the pressed item", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const group = page.getByTestId("alignment");
  const value = page.getByTestId("alignment-value");
  const outputs = page.getByTestId("alignment-outputs");

  await page.getByTestId("disable-center-alignment").click();
  await expect(align(page, "center")).toBeDisabled();
  await align(page, "start").focus();

  const moves = [
    { key: "ArrowRight", focused: "end" },
    { key: "ArrowRight", focused: "start" },
    { key: "ArrowLeft", focused: "end" },
    { key: "Home", focused: "start" },
    { key: "End", focused: "end" },
  ];

  for (const move of moves) {
    await page.keyboard.press(move.key);
    await expect(align(page, move.focused)).toBeFocused();
    await expectTabStop(group, align(page, move.focused));
  }

  // Unhandled axis and modified keys do nothing.
  for (const key of ["ArrowDown", "ArrowUp", "Shift+ArrowRight", "Control+ArrowLeft", "Alt+Home"]) {
    await page.keyboard.press(key);
    await expect(align(page, "end")).toBeFocused();
  }

  // An earlier listener's preventDefault leaves the key to the application.
  await page.evaluate(() => {
    document.addEventListener("keydown", (event) => event.preventDefault(), {
      capture: true,
      once: true,
    });
  });
  await page.keyboard.press("ArrowRight");
  await expect(align(page, "end")).toBeFocused();
  await settle(page);
  await expect(value).toHaveText("start");
  await expect(outputs).toHaveText("0");

  // Tab leaves the group; Shift+Tab re-enters on the pressed item.
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("alignment-outside")).toBeFocused();
  await expectTabStop(group, align(page, "start"));
  await page.keyboard.press("Shift+Tab");
  await expect(align(page, "start")).toBeFocused();

  const vertical = page.locator('[data-toggle-group-case="vertical"]');
  const verticalPart = (role: string) => casePart(page, "vertical", role);

  await expect(vertical).toHaveAttribute("data-orientation", "vertical");
  await expect(vertical).not.toHaveAttribute("aria-orientation", /.*/);
  await verticalPart("list").focus();
  await page.keyboard.press("ArrowDown");
  await expect(verticalPart("grid")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(verticalPart("columns")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(verticalPart("list")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(verticalPart("columns")).toBeFocused();

  for (const key of ["ArrowLeft", "ArrowRight"]) {
    await page.keyboard.press(key);
    await expect(verticalPart("columns")).toBeFocused();
  }

  await expectTabStop(vertical, verticalPart("columns"));
  await settle(page);
  await expect(verticalPart("value")).toHaveText("list");
  await expect(verticalPart("outputs")).toHaveText("0");

  const rtlPart = (role: string) => casePart(page, "rtl", role);

  await rtlPart("first").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(rtlPart("second")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(rtlPart("first")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(rtlPart("third")).toBeFocused();
  await settle(page);
  await expect(rtlPart("value")).toHaveText("");

  const rtlVerticalPart = (role: string) => casePart(page, "rtl-vertical", role);

  await rtlVerticalPart("first").focus();
  await page.keyboard.press("ArrowDown");
  await expect(rtlVerticalPart("second")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(rtlVerticalPart("first")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(rtlVerticalPart("first")).toBeFocused();
  await expect(rtlVerticalPart("value")).toHaveText("first");
});

test("U4: focus repair never presses or steals focus; items removed or disabled during activation", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const group = page.getByTestId("alignment");
  const value = page.getByTestId("alignment-value");
  const outputs = page.getByTestId("alignment-outputs");

  // Removing the focused item moves focus to the new tab stop, the pressed item, without pressing.
  await align(page, "center").focus();
  await page.keyboard.press("Delete");
  await expect(align(page, "center")).toHaveCount(0);
  await expect(align(page, "start")).toBeFocused();
  await expectTabStop(group, align(page, "start"));
  await page.getByTestId("restore-alignments").click();
  await expect(align(page, "center")).toHaveCount(1);

  // Disabling the focused item repairs focus the same way.
  await align(page, "end").focus();
  await page.keyboard.press("d");
  await expect(align(page, "end")).toBeDisabled();
  await expect(align(page, "start")).toBeFocused();
  await page.getByTestId("restore-alignments").click();
  await expect(align(page, "end")).toBeEnabled();

  // Focus the application moved elsewhere is never stolen.
  await align(page, "center").focus();
  await page.getByTestId("remove-center-alignment").focus();
  await page.keyboard.press("Enter");
  await expect(align(page, "center")).toHaveCount(0);
  await expect(page.getByTestId("remove-center-alignment")).toBeFocused();
  await page.getByTestId("restore-alignments").click();
  await align(page, "center").focus();
  await page.getByTestId("disable-center-alignment").focus();
  await page.keyboard.press("Enter");
  await expect(align(page, "center")).toBeDisabled();
  await expect(page.getByTestId("disable-center-alignment")).toBeFocused();
  await settle(page);
  await expect(value).toHaveText("start");
  await expect(outputs).toHaveText("0");
  await page.getByTestId("restore-alignments").click();

  // The press is requested before the click's focus step; the valueChange listener removes the
  // item, which then isn't focused by its own click.
  const vanish = (role: string) => casePart(page, "press-vanish", role);

  await vanish("start").focus();
  await preventNextMousedownFocus(page);
  await vanish("target").click();
  await expect(vanish("target")).toHaveCount(0);
  await expect(vanish("value")).toHaveText("target");
  await expect(vanish("outputs")).toHaveText("1");
  await expect(vanish("start")).toBeFocused();

  // Reached by ArrowRight, the item that disables itself on focus is not pressed, and focus is
  // repaired to the tab stop.
  const disable = (role: string) => casePart(page, "focus-disable", role);

  await disable("start").focus();
  await page.keyboard.press("ArrowRight");
  await settle(page);
  await expect(disable("target")).toBeDisabled();
  await expect(disable("value")).toHaveText("start");
  await expect(disable("outputs")).toHaveText("0");
  await expect(disable("start")).toBeFocused();
  await page.getByTestId("restore-toggle-group-targets").click();
  await expect(disable("target")).toBeEnabled();

  // Clicked, the press was already requested when its focus handler disables it (toggle, then
  // focus). An engine that blurs a disabled element at once is reproduced with a synchronous blur.
  await disable("start").focus();
  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(
      '[data-toggle-group-case="focus-disable"] [data-role="target"]',
    )!;

    target.addEventListener("focus", () => target.blur(), { once: true });
  });
  await preventNextMousedownFocus(page);
  await disable("target").click();
  await expect(disable("target")).toBeDisabled();
  await expect(disable("value")).toHaveText("target");
  await expect(disable("outputs")).toHaveText("1");
  await expect(disable("target")).toHaveAttribute("aria-pressed", "true");
  await expect(disable("start")).toBeFocused();
  await expectTabStop(page.locator('[data-toggle-group-case="focus-disable"]'), disable("start"));
});

test("U5: replaced root and item Options drive behavior, roving order and the composed Toggle; State is shared", async ({
  page,
}, info) => {
  await fixture(page, "composition", info);

  const root = page.getByTestId("factory-alignment");
  const value = page.getByTestId("factory-alignment-value");
  const unused = page.getByTestId("unused-alignment-outputs");
  const item = (key: string) => page.getByTestId(`consumer-align-${key}`);
  const observer = (key: string) => page.getByTestId(`consumer-align-observer-${key}`);
  const groupObserver = page.getByTestId("toggle-group-observer");

  await expect(root).toHaveAttribute("role", "group");
  await expect(root).toHaveAttribute("data-orientation", "vertical");
  // The factory value wins over the unused lower model.
  await expect(item("start")).toHaveAttribute("aria-pressed", "true");
  await expect(item("end")).toHaveAttribute("aria-pressed", "false");
  // Domain-derived item Options drive the composed Toggle.
  await expect(item("center")).toBeDisabled();
  await expect(item("center")).toHaveAttribute("aria-disabled", "true");
  await expect(observer("start")).toHaveAttribute("data-observed-checked", "true");
  await expect(observer("end")).toHaveAttribute("data-observed-checked", "false");
  await expect(groupObserver).toHaveAttribute("data-observed-orientation", "vertical");
  await expect(groupObserver).toHaveAttribute("data-observed-disabled", "false");
  await expect(page.getByTestId("factory-alignment-shared")).toHaveText("true");

  await item("end").click();
  await expect(value).toHaveText("end");
  await expect(observer("end")).toHaveAttribute("data-observed-checked", "true");
  await expect(observer("start")).toHaveAttribute("data-observed-checked", "false");
  // The factory's deselectable policy applies.
  await item("end").click();
  await expect(value).toHaveText("");
  await item("end").click();
  await expect(value).toHaveText("end");
  await page.getByTestId("factory-alignment-strict").click();
  await item("end").click();
  await settle(page);
  await expect(value).toHaveText("end");
  await expect(unused).toHaveText("0");

  // Vertical arrows skip the domain-disabled item; making it available rejoins it.
  await item("start").focus();
  await page.keyboard.press("ArrowDown");
  await expect(item("end")).toBeFocused();
  await page.getByTestId("center-available").click();
  await expect(item("center")).toBeEnabled();
  await item("end").focus();
  await page.keyboard.press("ArrowUp");
  await expect(item("center")).toBeFocused();
  await page.getByTestId("factory-alignment-horizontal").click();
  await expect(root).toHaveAttribute("data-orientation", "horizontal");
  await expect(groupObserver).toHaveAttribute("data-observed-orientation", "horizontal");
  await item("center").focus();
  await page.keyboard.press("ArrowRight");
  await expect(item("end")).toBeFocused();

  // Arrow keys follow the reordered DOM.
  await page.getByTestId("reverse-alignments").click();
  await expect(root.locator("button").first()).toHaveAttribute("data-testid", "consumer-align-end");
  await item("end").focus();
  await page.keyboard.press("ArrowRight");
  await expect(item("center")).toBeFocused();

  await page.getByTestId("factory-alignment-disable").click();
  await expect(root).toHaveAttribute("data-disabled", "");
  await expect(groupObserver).toHaveAttribute("data-observed-disabled", "true");
  await item("start").click({ force: true });
  await settle(page);
  await expect(value).toHaveText("end");
  await page.getByTestId("factory-alignment-disable").click();
  await item("start").click();
  await expect(value).toHaveText("start");
  // External writes to the factory signals apply and fabricate no output.
  await page.getByTestId("factory-alignment-select").click();
  await expect(item("end")).toHaveAttribute("aria-pressed", "true");
  await expect(observer("end")).toHaveAttribute("data-observed-checked", "true");
  await expect(unused).toHaveText("0");
});

test("U5: whole root replacements win over the composed root's own inputs in both modes", async ({
  page,
}, info) => {
  await fixture(page, "composition", info);

  for (const name of ["single-precedence", "multiple-precedence"]) {
    await test.step(name, async () => {
      const single = name.startsWith("single");
      const part = (role: string) =>
        page.locator(`[data-toggle-group-case="${name}"] [data-role="${role}"]`);
      const root = part("root");

      await expect(root).toHaveAttribute("data-orientation", "vertical");
      await expect(root).not.toHaveAttribute("data-disabled", /.*/);
      await expect(part("disabled")).toHaveText("false");
      await expect(part("shared")).toHaveText("true");
      await expect(part("one")).toHaveAttribute("aria-pressed", "true");
      await expect(part("two")).toHaveAttribute("aria-pressed", "false");

      await part("two").click();

      if (single) {
        await expect(part("value")).toHaveText("two");
        // The replacement is deselectable although the own input isn't.
        await part("two").click();
        await expect(part("value")).toHaveText("");
      } else {
        await expect(part("value")).toHaveText("one,two");
        await part("one").click();
        await expect(part("value")).toHaveText("two");
      }

      await part("disable").click();
      await expect(root).toHaveAttribute("data-disabled", "");
      await part("two").click({ force: true });
      await settle(page);

      if (single) {
        await expect(part("value")).toHaveText("");
      } else {
        await expect(part("value")).toHaveText("two");
      }

      await part("external").click();
      await expect(part("one")).toHaveAttribute("aria-pressed", "true");
      await expect(part("outputs")).toHaveText("0");
    });
  }
});

test("U5: a nested root has its own State, keys and tab stop", async ({ page }, info) => {
  await fixture(page, "core", info);

  const part = (role: string) => casePart(page, "nested", role);
  const outer = page.locator('[data-toggle-group-case="nested"]');

  await expect(part("inner-shared")).toHaveText("true");
  await expect(part("independent")).toHaveText("true");
  await expectTabStop(outer, part("outer-a"));
  await expectTabStop(part("inner"), part("inner-x"));

  await part("outer-a").focus();
  await page.keyboard.press("ArrowRight");
  await expect(part("outer-b")).toBeFocused();
  // The inner items aren't part of the outer roving order.
  await page.keyboard.press("ArrowRight");
  await expect(part("outer-a")).toBeFocused();

  await part("inner-x").focus();
  await page.keyboard.press("ArrowDown");
  await expect(part("inner-y")).toBeFocused();
  await expectTabStop(outer, part("outer-a"));
  await part("inner-y").click();
  await expect(part("inner-value")).toHaveText("y");
  await expect(part("outer-value")).toHaveText("a");
});

test("U8: a ToggleGroup item's state, read through its template reference, follows the group value and the combined disabled state, also in a Toolbar Toggle Group", async ({
  page,
}, info) => {
  await fixture(page, "core", info);

  const part = (role: string) =>
    page.locator(`[data-state-case="toggle-group-item"] [data-role="${role}"]`);

  await expect(part("start-pressed")).toHaveText("false");
  await expect(part("end-pressed")).toHaveText("false");
  await part("end").click();
  await expect(part("end-pressed")).toHaveText("true");
  await expect(part("start-pressed")).toHaveText("false");
  await part("external").click();
  await expect(part("start-pressed")).toHaveText("true");
  await expect(part("end-pressed")).toHaveText("false");

  // The root's disabled reaches every item; the item's own reaches only that item.
  await expect(part("start-disabled")).toHaveText("false");
  await part("root-disable").click();
  await expect(part("start-disabled")).toHaveText("true");
  await expect(part("end-disabled")).toHaveText("true");
  await part("root-disable").click();
  await part("item-disable").click();
  await expect(part("start-disabled")).toHaveText("true");
  await expect(part("end-disabled")).toHaveText("false");
  await expect(part("start")).toBeDisabled();
  await part("item-disable").click();
  await expect(part("start-disabled")).toHaveText("false");

  // A Toolbar Toggle Group item exposes the same composed Toggle State.
  await expect(part("bold-pressed")).toHaveText("false");
  await part("bold").click();
  await expect(part("bold-pressed")).toHaveText("true");
  await expect(part("italic-pressed")).toHaveText("false");
  await expect(part("bold-disabled")).toHaveText("false");
  await part("bold-disable").click();
  await expect(part("bold-disabled")).toHaveText("true");
  await expect(part("bold")).toBeDisabled();
  await expect(part("bold-pressed")).toHaveText("true");
});

/** ARIA deprecates aria-invalid on group and doesn't support the others there; the Field carries them. */
async function expectNoGroupFormAria(group: Locator): Promise<void> {
  for (const attribute of ["aria-invalid", "aria-required", "aria-readonly"]) {
    await expect(group).not.toHaveAttribute(attribute, /.*/);
  }
}

test("U9: with [formField] Single and Multiple roots show the initial value, write user changes, follow model writes, emit touch only when focus leaves the group, show errors through the Field after blur and submit(), reset, focusBoundControl() focuses the tab stop, readonly() drops clicks and keys while focus still moves, and disabled() disables every item; they bind no aria-invalid, aria-required or aria-readonly", async ({
  page,
}, info) => {
  await fixture(page, "group-field", info);

  const field = page.getByTestId("layout-field");
  const layout = page.getByTestId("layout");
  const grid = page.getByTestId("layout-grid");
  const list = page.getByTestId("layout-list");
  const value = page.getByTestId("layout-value");
  const touched = page.getByTestId("layout-touched");
  const labelId = await field.locator("[ogFieldLabel]").getAttribute("id");

  expect(labelId).toMatch(/\S/);
  await expect(grid).toHaveAttribute("aria-pressed", "true");
  await expect(field).toHaveAttribute("data-required", "");
  await expect(layout).toHaveAttribute("aria-labelledby", labelId ?? "");
  await expect(layout).not.toHaveAttribute("aria-describedby", /.*/);
  await expect(page.getByRole("group", { name: "Layout" })).toHaveAttribute(
    "data-testid",
    "layout",
  );
  await expectNoGroupFormAria(layout);

  // User changes write the model; focus moving between items never touches.
  await list.click();
  await expect(value).toHaveText("list");
  await expect(list).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(grid).toBeFocused();
  await grid.click();
  await expect(value).toHaveText("grid");
  await expect(touched).toHaveText("false");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("write-layout")).toBeFocused();
  await expect(touched).toHaveText("true");

  // A programmatic write reaches the items; the touched, now invalid field shows errors.
  await page.getByTestId("write-layout").click();
  await expect(value).toHaveText("");
  await expect(grid).toHaveAttribute("aria-pressed", "false");
  await expect(field).toHaveAttribute("data-invalid", "");
  await expect(layout).toHaveAttribute("aria-describedby", "layout-error");
  await expect(layout).toHaveAccessibleDescription("Choose a layout.");
  await expectNoGroupFormAria(layout);

  // focusBoundControl() focuses the tab stop: nothing pressed, so the first enabled item.
  await page.getByTestId("focus-layout").click();
  await expect(grid).toBeFocused();
  await page.getByTestId("reset-layout").click();
  await expect(touched).toHaveText("false");
  await expect(field).not.toHaveAttribute("data-invalid", /.*/);

  // readonly(): clicks and keys write nothing; focus still moves.
  await page.getByTestId("freeze-layout").click();
  await list.click();
  await expect(list).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowLeft");
  await expect(grid).toBeFocused();
  await page.keyboard.press("Space");
  await settle(page);
  await expect(value).toHaveText("");
  await expect(grid).toHaveAttribute("aria-pressed", "false");
  await expect(list).toHaveAttribute("aria-pressed", "false");
  await expectNoGroupFormAria(layout);
  await page.getByTestId("freeze-layout").click();
  await list.click();
  await expect(value).toHaveText("list");

  // disabled(): every item natively disabled, and the Field's data-disabled.
  await page.getByTestId("lock-layout").click();
  await expect(grid).toBeDisabled();
  await expect(list).toBeDisabled();
  await expect(layout).toHaveAttribute("data-disabled", "");
  await expect(field).toHaveAttribute("data-disabled", "");
  await page.getByTestId("lock-layout").click();
  await expect(list).toBeEnabled();

  // Multiple, bound to a string[] model.
  const extrasField = page.getByTestId("extras-field");
  const extras = page.getByTestId("extras");
  const wrap = page.getByTestId("extras-wrap");
  const note = page.getByTestId("extras-note");
  const extrasValue = page.getByTestId("extras-value");
  const extrasTouched = page.getByTestId("extras-touched");

  await expect(extrasValue).toHaveText("");
  await expect(extras).toHaveAttribute("aria-describedby", "extras-description");
  await expect(page.getByRole("group", { name: "Extras" })).toHaveAttribute(
    "data-testid",
    "extras",
  );
  await page.getByTestId("submit-order").click();
  await expect(extrasTouched).toHaveText("true");
  await expect(extrasField).toHaveAttribute("data-invalid", "");
  await expect(extras).toHaveAttribute("aria-describedby", "extras-description extras-error");
  await expectNoGroupFormAria(extras);
  await page.getByTestId("reset-extras").click();
  await expect(extrasTouched).toHaveText("false");

  await wrap.click();
  await note.click();
  await expect(extrasValue).toHaveText("wrap,note");
  await page.keyboard.press("ArrowLeft");
  await expect(wrap).toBeFocused();
  await wrap.click();
  await expect(extrasValue).toHaveText("note");
  await expect(extrasTouched).toHaveText("false");
  await page.getByTestId("after").click();
  await expect(extrasTouched).toHaveText("true");

  // A programmatic write replaces the selection.
  await page.getByTestId("write-extras").click();
  await expect(extrasValue).toHaveText("wrap");
  await expect(wrap).toHaveAttribute("aria-pressed", "true");
  await expect(note).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("focus-extras").click();
  await expect(wrap).toBeFocused();

  await page.getByTestId("freeze-extras").click();
  await note.click();
  await wrap.click();
  await settle(page);
  await expect(extrasValue).toHaveText("wrap");
  await expect(note).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("freeze-extras").click();
  await note.click();
  await expect(extrasValue).toHaveText("wrap,note");

  await page.getByTestId("lock-extras").click();
  await expect(wrap).toBeDisabled();
  await expect(extrasField).toHaveAttribute("data-disabled", "");
  await page.getByTestId("lock-extras").click();
  await expect(wrap).toBeEnabled();
});

test("U10: inside a Field a ToggleGroup's aria-labelledby names its Label after it and its aria-describedby the Description; the Label gets no for; a standalone group keeps its static aria-labelledby and aria-describedby", async ({
  page,
}, info) => {
  await fixture(page, "group-field", info);

  const align = page.getByTestId("align");

  await expect(align).toHaveAttribute("aria-labelledby", "align-label");
  await expect(align).toHaveAttribute("aria-describedby", "align-description");
  await expect(page.locator("#align-label")).not.toHaveAttribute("for", /.*/);
  await expect(page.getByRole("group", { name: "Alignment" })).toHaveAttribute(
    "data-testid",
    "align",
  );
  await expect(align).toHaveAccessibleDescription("Applies to the title.");
  await expectNoGroupFormAria(align);
  await page.getByTestId("align-end").click();
  await expect(page.getByTestId("align-end")).toHaveAttribute("aria-pressed", "true");

  const standalone = page.getByTestId("standalone-toggle-group");

  await expect(standalone).toHaveAttribute("aria-labelledby", "standalone-heading");
  await expect(standalone).toHaveAttribute("aria-describedby", "standalone-hint");
  await expectNoGroupFormAria(standalone);
});

test("U11: a consumer component composing a ToggleGroup root through hostDirectives with exposed value, valueChange, disabled and touch is the control [formField] finds, and the root reads FORM_FIELD on its element", async ({
  page,
}, info) => {
  await fixture(page, "group-field", info);

  const field = page.getByTestId("topics-field");
  const topics = page.getByTestId("topics");
  const news = page.getByTestId("topic-news");
  const sports = page.getByTestId("topic-sports");
  const value = page.getByTestId("topics-value");
  const touched = page.getByTestId("topics-touched");

  await expect(topics).toHaveAttribute("role", "group");
  await expect(topics).toHaveAttribute("aria-labelledby", "topics-label");
  await expect(page.getByRole("group", { name: "Topics" })).toHaveAttribute(
    "data-testid",
    "topics",
  );

  await news.click();
  await expect(value).toHaveText("news");
  await page.keyboard.press("ArrowRight");
  await expect(sports).toBeFocused();
  await expect(touched).toHaveText("false");
  await page.getByTestId("before").click();
  await expect(touched).toHaveText("true");

  await page.getByTestId("freeze-topics").click();
  await sports.click();
  await settle(page);
  await expect(value).toHaveText("news");
  await expect(sports).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("freeze-topics").click();
  await sports.click();
  await expect(value).toHaveText("news,sports");

  await page.getByTestId("lock-topics").click();
  await expect(news).toBeDisabled();
  await expect(field).toHaveAttribute("data-disabled", "");
  await page.getByTestId("lock-topics").click();
  await expect(news).toBeEnabled();
});
