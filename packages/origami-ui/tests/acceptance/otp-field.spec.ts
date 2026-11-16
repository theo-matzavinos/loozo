import { test, expect } from "./contract-test.js";
import type { Locator, Page, TestInfo } from "playwright/test";
import { bootstrapHeld, fixture } from "./observation.js";

// OTP field (section 32, OT). OT1 is the package and type gates, OT2 the code rules in Node
// (otp-field-checks.mjs), OT13 the `errors` fixture.

function field(page: Page, name: string): Locator {
  return page.getByTestId(`${name}-input`);
}

function out(page: Page, id: string): Locator {
  return page.getByTestId(id);
}

/**
 * Focuses `target` from script, as a click or a key does: focus moves straight to it. Playwright's
 * own `focus()` blurs to nothing first.
 */
async function moveFocus(target: Locator): Promise<void> {
  await target.evaluate((element: HTMLElement) => element.focus());
}

async function selection(target: Locator): Promise<[number | null, number | null]> {
  return target.evaluate((element: HTMLInputElement) => [
    element.selectionStart,
    element.selectionEnd,
  ]);
}

async function select(
  target: Locator,
  start: number,
  end: number,
  direction: "forward" | "backward" = "forward",
): Promise<void> {
  await target.evaluate(
    (element: HTMLInputElement, range: [number, number, "forward" | "backward"]) => {
      element.focus();
      element.setSelectionRange(range[0], range[1], range[2]);
    },
    [start, end, direction] as [number, number, "forward" | "backward"],
  );
}

async function focusedTestId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
}

/** Clicks a fixture control from script, so focus stays where it is. */
async function scriptClick(page: Page, id: string): Promise<void> {
  await page.getByTestId(id).dispatchEvent("click");
}

/** Copies `text` to the clipboard through a scratch textarea, which then loses focus. */
async function copy(page: Page, text: string): Promise<void> {
  await page.evaluate((value: string) => {
    let scratch = document.querySelector<HTMLTextAreaElement>("#ot-clipboard");

    if (scratch === null) {
      scratch = document.createElement("textarea");
      scratch.id = "ot-clipboard";
      document.body.append(scratch);
    }

    scratch.value = value;
    scratch.focus();
    scratch.select();
  }, text);
  await page.keyboard.press("ControlOrMeta+c");
}

/**
 * Pastes `text` into `target` through the real clipboard: a scratch textarea copies it, then the
 * Input's selection is put back and Ctrl+V pastes, so the browser runs its own paste.
 */
async function paste(page: Page, target: Locator, text: string): Promise<void> {
  const [start, end] = await selection(target);

  await copy(page, text);
  await select(target, start ?? 0, end ?? 0);
  await page.keyboard.press("ControlOrMeta+v");
}

/** The centre of a cell in page coordinates. */
async function cellCentre(
  page: Page,
  root: string,
  index: number,
): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId(`${root}-cell-${index}`).boundingBox();

  expect(box).not.toBeNull();

  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

async function clickCell(page: Page, root: string, index: number): Promise<void> {
  const centre = await cellCentre(page, root, index);

  await page.mouse.click(centre.x, centre.y);
}

/** Replaces the direct field's value from code, as the application would, with focus kept. */
async function writeDirect(page: Page, value: string): Promise<void> {
  await scriptClick(page, `direct-write-${value}`);
}

/**
 * Types `text` into the direct field from empty: focus, select its text and type it key by key.
 */
async function typeDirect(page: Page, text: string): Promise<void> {
  const input = field(page, "direct");

  await select(input, 0, (await input.inputValue()).length);
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text);
}

/** The direct Input's attributes and its Label's, as the contract names them. */
async function describe(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const read = (testId: string, names: string[]): Record<string, string | null> => {
      const element = document.querySelector(`[data-testid="${testId}"]`)!;
      const attributes: Record<string, string | null> = {};

      for (const name of names) {
        attributes[name] = element.getAttribute(name);
      }

      return attributes;
    };

    return {
      direct: read("direct-input", [
        "type",
        "id",
        "value",
        "inputmode",
        "autocomplete",
        "autocorrect",
        "autocapitalize",
        "spellcheck",
        "aria-describedby",
        "aria-required",
        "aria-invalid",
        "maxlength",
        "pattern",
        "disabled",
        "readonly",
        "role",
      ]),
      labelFor: document.querySelector("#direct-label")!.getAttribute("for"),
      pin: read("pin-input", ["type", "id", "autocomplete", "value"]),
      bound: read("bound-input", ["type", "autocomplete"]),
      preset: read("preset-input", ["value"]),
      composed: read("composed-input", ["value"]),
    };
  });
}

test("OT3 typing commits each changed code at once; an edit that leaves anything but up to six digits is undone with its selection, after native listeners saw it; keys are native", async ({
  page,
}, info) => {
  await fixture(page, "otp-field", info);

  const input = field(page, "direct");
  const value = out(page, "direct-value");
  const changes = out(page, "direct-changes");

  await moveFocus(input);

  for (const digit of "012345") {
    await page.keyboard.type(digit);
  }

  await expect(value).toHaveText("012345");
  await expect(input).toHaveValue("012345");
  await expect(out(page, "direct-cells")).toHaveText("012345");
  await expect(out(page, "direct-complete")).toHaveText("true");
  await expect(changes).toHaveText("0/false,01/false,012/false,0123/false,01234/false,012345/true");

  await input.evaluate((element: HTMLInputElement) => {
    const seen: string[] = [];

    (window as unknown as { otSeen: string[] }).otSeen = seen;
    document.addEventListener(
      "input",
      (event) => {
        if (event.target === element) {
          seen.push(element.value);
        }
      },
      true,
    );
  });

  // A seventh digit at the end and a letter: undone, the caret kept.
  for (const key of ["7", "x"]) {
    await select(input, 6, 6);
    await page.keyboard.type(key);
    await expect(input).toHaveValue("012345");
    expect(await selection(input)).toEqual([6, 6]);
  }

  // A letter over a selection, forward and backward: the selection comes back as it was.
  await select(input, 1, 4);
  await page.keyboard.type("x");
  await expect(input).toHaveValue("012345");
  expect(await selection(input)).toEqual([1, 4]);
  await select(input, 1, 4, "backward");
  await page.keyboard.type("x");
  expect(await selection(input)).toEqual([1, 4]);
  expect(await input.evaluate((element: HTMLInputElement) => element.selectionDirection)).toBe(
    "backward",
  );
  expect(await page.evaluate(() => (window as unknown as { otSeen: string[] }).otSeen)).toEqual([
    "0123457",
    "012345x",
    "0x45",
    "0x45",
  ]);
  await expect(changes).toHaveText("0/false,01/false,012/false,0123/false,01234/false,012345/true");

  // A collapsed caret inside a full code inserts nothing.
  await select(input, 3, 3);
  await page.keyboard.type("9");
  await expect(input).toHaveValue("012345");
  expect(await selection(input)).toEqual([3, 3]);

  // Backspace, Delete, arrows, Home and End are native; deleting shifts the later digits left.
  await select(input, 6, 6);
  await page.keyboard.press("Backspace");
  await expect(value).toHaveText("01234");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  expect(await selection(input)).toEqual([3, 3]);
  await page.keyboard.type("9");
  await expect(value).toHaveText("012934");
  await page.keyboard.press("Home");
  expect(await selection(input)).toEqual([0, 0]);
  await page.keyboard.press("Delete");
  await expect(value).toHaveText("12934");
  await page.keyboard.press("End");
  expect(await selection(input)).toEqual([5, 5]);

  // A space or a dash typed leaves the same code: written back without them, nothing committed.
  const before = await changes.textContent();

  await page.keyboard.type(" ");
  await expect(input).toHaveValue("12934");
  expect(await selection(input)).toEqual([5, 5]);
  await page.keyboard.type("-");
  await expect(input).toHaveValue("12934");
  await expect(changes).toHaveText(before!);

  // Select all and type replaces; a leading zero stays.
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("0");
  await expect(value).toHaveText("0");
  await expect(out(page, "direct-cells")).toHaveText("0_____");

  // Enter submits the form natively: an incomplete code is refused by the schema.
  await page.keyboard.press("Enter");
  await expect(out(page, "direct-errors")).toHaveText("pattern");
  await expect(out(page, "direct-submits")).toHaveText("");
});

test("OT4 paste: a whole code replaces the text from any selection, a shorter one goes at the selection if it fits, anything else does nothing; the browser's undo restores the value", async ({
  page,
}, info) => {
  await fixture(page, "otp-field", info);

  const input = field(page, "direct");
  const value = out(page, "direct-value");
  const changes = out(page, "direct-changes");

  // From `12` with the caret at its end, a whole code replaces it: one edit, the caret at the end.
  for (const text of ["987654", "987 654", "９８７６５４", "98-76-54"]) {
    await typeDirect(page, "12");
    await expect(changes).toHaveText(/(?:^|,)1\/false,12\/false$/);

    const before = (await changes.textContent())!.split(",").length;

    await select(input, 2, 2);
    await paste(page, input, text);
    await expect(value).toHaveText("987654");
    await expect(input).toHaveValue("987654");
    expect(await selection(input)).toEqual([6, 6]);
    expect((await changes.textContent())!.split(",").length).toBe(before + 1);
    await expect(changes).toHaveText(/987654\/true$/);

    // Undo restores the value (the caret isn't promised).
    await page.keyboard.press("ControlOrMeta+z");
    await expect(value).toHaveText("12");
    await expect(input).toHaveValue("12");
  }

  // A shorter code at a partial selection.
  await typeDirect(page, "9876");
  await select(input, 1, 3);
  await paste(page, input, "12 34");
  await expect(value).toHaveText("912346");
  expect(await selection(input)).toEqual([5, 5]);

  // One that wouldn't fit, a longer one and one with a letter do nothing.
  await typeDirect(page, "12345");

  for (const text of ["12", "1234567890", "12ab34", "abc"]) {
    await select(input, 5, 5);
    await paste(page, input, text);
    await expect(input).toHaveValue("12345");
    await expect(value).toHaveText("12345");
  }

  // A whole code into a full one with a collapsed caret replaces it.
  await typeDirect(page, "111111");
  await select(input, 3, 3);
  await paste(page, input, "222222");
  await expect(value).toHaveText("222222");

  // Readonly: nothing.
  await scriptClick(page, "direct-freeze");
  await select(input, 0, 6);
  await paste(page, input, "333333");
  await expect(value).toHaveText("222222");
  await scriptClick(page, "direct-freeze");

  // Two undo steps: a paste, typing, another paste.
  await typeDirect(page, "");
  await select(input, 0, 0);
  await paste(page, input, "12");
  await expect(value).toHaveText("12");
  await page.keyboard.type("3");
  await expect(value).toHaveText("123");
  await paste(page, input, "4 5");
  await expect(value).toHaveText("12345");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(value).toHaveText("123");

  // A masked field pastes the same way.
  const pin = field(page, "pin");

  await select(pin, 0, 0);
  await paste(page, pin, "246 810");
  await expect(out(page, "pin-value")).toHaveText("246810");
  await expect(pin).toHaveAttribute("type", "password");
});

test("OT5 a fill, a drop and a scripted replacement without beforeinput are read as codes like typing", async ({
  page,
}, info) => {
  await fixture(page, "otp-field", info);

  const input = field(page, "direct");
  const value = out(page, "direct-value");
  const changes = out(page, "direct-changes");

  // Playwright's fill sets the text and dispatches `input`, as an autofill does.
  await input.fill("123 456");
  await expect(value).toHaveText("123456");
  await expect(input).toHaveValue("123456");
  await expect(changes).toHaveText("123456/true");

  // A drop and an autofill replacement: the text changes and `input` follows, no `beforeinput`.
  for (const [text, inputType, expected] of [
    ["12-34", "insertFromDrop", "12-34"],
    ["６５４３２１", "insertReplacementText", "654321"],
  ] as const) {
    await input.evaluate(
      (element: HTMLInputElement, [text, inputType]: readonly [string, string]) => {
        element.focus();
        element.value = text;
        element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data: text }));
      },
      [text, inputType] as const,
    );

    if (expected === "12-34") {
      await expect(value).toHaveText("1234");
      await expect(input).toHaveValue("1234");
    } else {
      await expect(value).toHaveText(expected);
    }
  }

  await expect(changes).toHaveText("123456/true,1234/false,654321/true");

  // An over-long fill is undone to the value, not truncated.
  await input.fill("1234567890");
  await expect(input).toHaveValue("654321");
  await expect(value).toHaveText("654321");
  await expect(changes).toHaveText("123456/true,1234/false,654321/true");
});

/**
 * A step of a synthetic input-method composition: its start; a composing `input` that leaves
 * `text`; its end; or the non-composing `input` Firefox dispatches after the end.
 */
type CompositionStep = "start" | { readonly text: string } | "end" | "trailing";

/**
 * Dispatches a composition's events on `target`. They bubble, as a browser's do, so Angular's
 * event contract on the body records them for replay before the Input hydrates.
 */
async function compose(target: Locator, steps: readonly CompositionStep[]): Promise<void> {
  await target.evaluate((element: HTMLInputElement, steps: readonly CompositionStep[]) => {
    for (const step of steps) {
      if (step === "start") {
        element.dispatchEvent(
          new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
        );
      } else if (step === "end") {
        element.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true, data: element.value }),
        );
      } else if (step === "trailing") {
        element.dispatchEvent(
          new InputEvent("input", { bubbles: true, inputType: "insertCompositionText" }),
        );
      } else {
        element.value = step.text;
        element.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            isComposing: true,
            inputType: "insertCompositionText",
          }),
        );
      }
    }
  }, steps);
}

test("OT6 a composition is checked once, when it ends: full-width digits with separators commit once, a rejected one is undone, Firefox's trailing input isn't another edit, and its end wins over a write during it", async ({
  page,
  browserName,
}, info) => {
  await fixture(page, "otp-field", info);

  const input = field(page, "direct");
  const value = out(page, "direct-value");
  const changes = out(page, "direct-changes");

  await moveFocus(input);

  // Composed full-width digits and separators: nothing while composing, one commit at the end,
  // its trailing `input` included.
  for (const text of ["１２－３４－５６", "１２３　４５６"]) {
    await select(input, 0, (await input.inputValue()).length);
    await compose(input, ["start", { text: "１２" }]);
    await expect(input).toHaveValue("１２");
    await compose(input, [{ text }]);
    await expect(input).toHaveValue(text);
    await compose(input, ["end", "trailing"]);
    await expect(input).toHaveValue("123456");
    await expect(value).toHaveText("123456");
  }

  // The second composition left the same code: one commit in all.
  await expect(changes).toHaveText("123456/true");

  // A rejected composition is undone to the value and the selection it started with.
  await select(input, 1, 3, "backward");
  await compose(input, ["start", { text: "1ご" }, "end", "trailing"]);
  await expect(input).toHaveValue("123456");
  expect(await selection(input)).toEqual([1, 3]);
  await expect(changes).toHaveText("123456/true");

  // A value written while a composition is open waits; the accepted end overwrites it.
  await select(input, 0, 6);
  await compose(input, ["start", { text: "9" }]);
  await writeDirect(page, "987654");
  await expect(value).toHaveText("987654");
  await expect(input).toHaveValue("9");
  await compose(input, [{ text: "98" }, "end"]);
  await expect(value).toHaveText("98");
  await expect(input).toHaveValue("98");
  await expect(changes).toHaveText("123456/true,98/false");

  if (browserName === "chromium") {
    // A real input-method composition through CDP: full-width digits commit once, at its end.
    const cdp = await page.context().newCDPSession(page);

    await select(input, 0, 2);
    await cdp.send("Input.imeSetComposition", { text: "１", selectionStart: 1, selectionEnd: 1 });
    await cdp.send("Input.imeSetComposition", { text: "１２", selectionStart: 2, selectionEnd: 2 });
    await expect(value).toHaveText("98");
    await cdp.send("Input.insertText", { text: "１２" });
    await expect(value).toHaveText("12");
    await expect(input).toHaveValue("12");
    await expect(changes).toHaveText("123456/true,98/false,12/false");

    // Letters composed and committed: undone.
    await cdp.send("Input.imeSetComposition", { text: "あ", selectionStart: 1, selectionEnd: 1 });
    await cdp.send("Input.insertText", { text: "愛" });
    await expect(input).toHaveValue("12");
    await expect(changes).toHaveText("123456/true,98/false,12/false");
  }
});

test("OT7 valueChange is the edit boundary: once per changed edit, synchronously with state.complete() current, never for application writes", async ({
  page,
}, info) => {
  await fixture(page, "otp-field", info);

  const input = field(page, "direct");
  const changes = out(page, "direct-changes");

  await moveFocus(input);
  await page.keyboard.type("123456");
  await expect(changes).toHaveText("1/false,12/false,123/false,1234/false,12345/false,123456/true");

  // A full-to-full replacement: one change; delete and retype the same digit: two.
  await select(input, 3, 4);
  await page.keyboard.type("9");
  await expect(changes).toHaveText(/,123956\/true$/);
  await select(input, 6, 6);
  await page.keyboard.press("Backspace");
  await page.keyboard.type("6");
  await expect(changes).toHaveText(/,123956\/true,12395\/false,123956\/true$/);

  const count = (await changes.textContent())!.split(",").length;

  // Application writes: none, focused or not.
  await writeDirect(page, "987654");
  await expect(input).toHaveValue("987654");
  await writeDirect(page, "");
  await expect(input).toHaveValue("");
  await moveFocus(out(page, "before-fields"));
  await writeDirect(page, "012345");
  await expect(input).toHaveValue("012345");
  expect((await changes.textContent())!.split(",").length).toBe(count);

  // A value complete from the server never emits.
  await expect(out(page, "preset-changes")).toHaveText("0");
});

test("OT7 the PIN pad flow: keypad and keyboard complete once each, the keypad is capped at six, a mismatch clears and keeps its error, and Back starts the new PIN empty", async ({
  page,
}, info) => {
  await fixture(page, "otp-field-pin-pad", info);

  const input = page.getByTestId("pin-pad-input");
  const completions = out(page, "pin-pad-completions");
  const cells = out(page, "pin-pad-cells");
  const marks = out(page, "pin-pad-marks");
  const root = out(page, "pin-pad-root");
  const cellStyle = (index: number, property: "backgroundColor" | "borderTopColor") =>
    page
      .getByTestId(`pin-pad-cell-${index}`)
      .evaluate(
        (element, name: "backgroundColor" | "borderTopColor") => getComputedStyle(element)[name],
        property,
      );

  // The keypad to six: one completion.
  for (const digit of "123456") {
    await page.getByTestId(`key-${digit}`).click();
  }

  await expect(completions).toHaveText("code:123456");
  await expect(input).toHaveValue("123456");

  // A seventh keypad digit: the keypad's own model is re-capped; one clear gives five.
  await page.getByTestId("key-7").click();
  await expect(out(page, "pin-pad-keypad")).toHaveText("123456");
  await expect(out(page, "pin-pad-code")).toHaveText("123456");
  await page.getByTestId("key-clear").click();
  await expect(out(page, "pin-pad-code")).toHaveText("12345");
  await expect(out(page, "pin-pad-keypad")).toHaveText("12345");
  await expect(cells).toHaveText("5");

  // A physical key with focus outside the Input goes through the keypad.
  await page.getByTestId("pin-pad-before").focus();
  await page.keyboard.press("6");
  await expect(out(page, "pin-pad-code")).toHaveText("123456");
  await expect(completions).toHaveText("code:123456,code:123456");

  // With focus in the Input, keys are native edits, never entered twice. The full code with the
  // caret at its end has no caret cell, so the row draws the focus; Backspace puts the caret on
  // the sixth cell.
  await moveFocus(input);
  await select(input, 6, 6);
  await expect(marks).toHaveText("......");
  await expect(root).toHaveClass(/\bfocused\b/);
  expect(
    await out(page, "pin-pad-cell-row").evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).toBe("solid");
  await page.keyboard.press("Backspace");
  await expect(out(page, "pin-pad-code")).toHaveText("12345");
  await expect(marks).toHaveText(".....c");
  expect(await cellStyle(5, "borderTopColor")).not.toBe(await cellStyle(4, "borderTopColor"));
  await page.keyboard.press("6");
  await expect(out(page, "pin-pad-code")).toHaveText("123456");
  await expect(out(page, "pin-pad-keypad")).toHaveText("123456");
  await expect(completions).toHaveText("code:123456,code:123456,code:123456");

  // A rejection clears the code and shows its error; the next edit clears the error.
  await page.getByTestId("pin-pad-reject").click();
  await expect(page.getByTestId("pin-pad-error")).toBeVisible();
  await expect(input).toHaveValue("");
  await page.getByTestId("key-1").click();
  await expect(page.getByTestId("pin-pad-error")).toHaveCount(0);

  // New PIN, then a mismatching confirmation: cleared, the error kept.
  await page.getByTestId("pin-pad-accept").click();
  await expect(out(page, "pin-pad-step")).toHaveText("new");
  await expect(cells).toHaveText("0");
  await expect(root).not.toHaveClass(/\bfocused\b/);

  // The masked New PIN from the keyboard: Tab in, type three digits; the caret, a selected digit
  // and select-all each show on the dotted cells.
  await page.getByTestId("pin-pad-description-id").focus();
  await page.keyboard.press("Tab");
  expect(await focusedTestId(page)).toBe("pin-pad-input");
  await expect(input).toHaveAttribute("type", "password");
  await expect(marks).toHaveText("c.....");
  await expect(root).toHaveClass(/\bfocused\b/);
  await page.keyboard.type("111");
  await expect(cells).toHaveText("3");
  await expect(marks).toHaveText("...c..");
  expect(await cellStyle(3, "borderTopColor")).not.toBe(await cellStyle(2, "borderTopColor"));
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(marks).toHaveText("..s...");
  expect(await cellStyle(2, "backgroundColor")).not.toBe(await cellStyle(1, "backgroundColor"));
  await info.attach("pin-pad-selected-digit", {
    body: await root.screenshot(),
    contentType: "image/png",
  });
  await page.keyboard.press("ControlOrMeta+a");
  await expect(marks).toHaveText("sss...");
  await page.keyboard.press("End");
  await expect(marks).toHaveText("...c..");

  // The keypad finishes it.
  for (const digit of "111") {
    await page.getByTestId(`key-${digit}`).click();
  }

  await expect(out(page, "pin-pad-step")).toHaveText("confirm");
  await expect(cells).toHaveText("0");

  for (const digit of "222222") {
    await page.getByTestId(`key-${digit}`).click();
  }

  await expect(page.getByTestId("pin-pad-error")).toBeVisible();
  await expect(cells).toHaveText("0");
  await expect(out(page, "pin-pad-confirm")).toHaveText("null");

  // The same wrong PIN again completes again.
  for (const digit of "222222") {
    await page.getByTestId(`key-${digit}`).click();
  }

  await expect(completions).toHaveText(/,new:111111,confirm:222222,confirm:222222$/);
  await expect(page.getByTestId("pin-pad-error")).toBeVisible();

  // Back from the confirmation: the new PIN starts empty.
  await page.getByTestId("pin-pad-back").click();
  await expect(out(page, "pin-pad-step")).toHaveText("new");
  await expect(cells).toHaveText("0");
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("autocomplete", "new-password");
  await expect(input).toHaveAttribute("type", "password");
});

test("OT8 cells mirror the value, the caret and the selection; a click selects the clicked cell's digit, a double-click all; modified, moved and other-button clicks and drags are native", async ({
  page,
}, info) => {
  await fixture(page, "otp-field", info);

  const input = field(page, "direct");
  const marks = out(page, "direct-marks");

  await writeDirect(page, "123456");
  await expect(out(page, "direct-cells")).toHaveText("123456");
  await expect(marks).toHaveText("......");

  // A click into the unfocused Input on cell 4 focuses it and selects that digit.
  await clickCell(page, "direct", 4);
  expect(await focusedTestId(page)).toBe("direct-input");
  expect(await selection(input)).toEqual([4, 5]);
  await expect(marks).toHaveText("....s.");
  await expect(out(page, "direct-focused")).toHaveText("true");

  // Cells in turn, then out of order.
  for (const index of [0, 1, 2, 3, 4, 5, 4, 1, 5, 0]) {
    await clickCell(page, "direct", index);
    expect(await selection(input), `cell ${index}`).toEqual([index, index + 1]);
  }

  // After select-all and after a double-click, a click still selects its cell.
  await page.keyboard.press("ControlOrMeta+a");
  await expect(marks).toHaveText("ssssss");
  await clickCell(page, "direct", 2);
  expect(await selection(input)).toEqual([2, 3]);

  const third = await cellCentre(page, "direct", 3);

  await page.mouse.dblclick(third.x, third.y);
  expect(await selection(input)).toEqual([0, 6]);
  await expect(marks).toHaveText("ssssss");
  await clickCell(page, "direct", 1);
  expect(await selection(input)).toEqual([1, 2]);

  // Click the digit, type its replacement.
  await clickCell(page, "direct", 2);
  await page.keyboard.type("9");
  await expect(out(page, "direct-value")).toHaveText("129456");
  await clickCell(page, "direct", 4);
  await page.keyboard.type("7");
  await expect(out(page, "direct-value")).toHaveText("129476");

  // A partial code: an empty cell puts the caret at the end of the code.
  await writeDirect(page, "98");
  await clickCell(page, "direct", 4);
  expect(await selection(input)).toEqual([2, 2]);
  await expect(marks).toHaveText("..c...");
  await clickCell(page, "direct", 1);
  expect(await selection(input)).toEqual([1, 2]);

  // Shift+click and a right click are native: no cell is selected for them.
  await writeDirect(page, "123456");
  await select(input, 0, 0);
  await page.keyboard.down("Shift");
  await clickCell(page, "direct", 3);
  await page.keyboard.up("Shift");
  expect(await selection(input)).not.toEqual([3, 4]);
  await select(input, 0, 0);

  const second = await cellCentre(page, "direct", 2);

  await page.mouse.click(second.x, second.y, { button: "right" });
  await page.keyboard.press("Escape");
  expect(await selection(input)).not.toEqual([2, 3]);

  // A click that moved 5 px from its press is native.
  await select(input, 0, 0);
  await page.mouse.move(second.x, second.y);
  await page.mouse.down();
  await page.mouse.move(second.x + 6, second.y);
  await page.mouse.up();
  expect(await selection(input)).not.toEqual([2, 3]);

  // A drag across the cells is the engine's: a collapsed caret, never the dragged-over digits,
  // and no glyph or selection paints with the cells hidden.
  const row = out(page, "direct-cell-row");
  const root = out(page, "direct-root");

  await clickCell(page, "direct", 0);
  await row.evaluate((element: HTMLElement) => {
    element.style.visibility = "hidden";
  });

  const still = await root.screenshot();
  const first = await cellCentre(page, "direct", 0);
  const last = await cellCentre(page, "direct", 5);

  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await page.mouse.move((first.x + last.x) / 2, first.y, { steps: 4 });
  await page.mouse.move(last.x, last.y, { steps: 4 });

  const dragging = await root.screenshot();

  await page.mouse.up();

  const [start, end] = await selection(input);

  expect(start).toBe(end);
  expect(dragging.equals(still), "a drag paints nothing over the hidden cells").toBe(true);
  await row.evaluate((element: HTMLElement) => {
    element.style.visibility = "";
  });

  // A readonly field still maps clicks: selection is allowed.
  await scriptClick(page, "direct-freeze");
  await clickCell(page, "direct", 2);
  expect(await selection(input)).toEqual([2, 3]);
  await scriptClick(page, "direct-freeze");

  // Keyboard selection and blur.
  await select(input, 6, 6);
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(marks).toHaveText(".....s");
  await page.keyboard.press("ArrowLeft");
  await expect(marks).toHaveText(".....c");
  await moveFocus(out(page, "before-fields"));
  await expect(marks).toHaveText("......");
  await expect(out(page, "direct-focused")).toHaveText("false");

  // A Label click focuses without mapping a cell.
  await page.locator("#direct-label").click();
  expect(await focusedTestId(page)).toBe("direct-input");

  // The engine's own label focus: Firefox selects all, Chromium and WebKit keep or end the caret.
  const [labelledStart, labelledEnd] = await selection(input);

  expect(labelledStart === labelledEnd || (labelledStart === 0 && labelledEnd === 6)).toBe(true);
});

test("OT9 a masked field is a password input whose records carry no digit; it renders dots, the selected cell, select-all and the full focus ring", async ({
  page,
  browserName,
}, info) => {
  await fixture(page, "otp-field", info);

  const pin = field(page, "pin");

  await expect(pin).toHaveAttribute("type", "password");
  await scriptClick(page, "pin-write-246810");
  await expect(out(page, "pin-chars")).toHaveText("null,null,null,null,null,null");
  await expect(out(page, "pin-cells")).toHaveText("••••••");

  // Every rendered cell is a dot, never a digit.
  for (let index = 0; index < 6; index++) {
    await expect(page.getByTestId(`pin-cell-${index}`)).toHaveText("•");
  }

  // The accessibility tree: one textbox named by its label, no cell text.
  // (Playwright's snapshot reads a textbox's value from the element, so it shows even a
  // password's digits; the accessibility tree's value is Chromium's check below.)
  const snapshot = await out(page, "pin-root").ariaSnapshot();

  expect(snapshot.trim().split("\n")).toHaveLength(1);
  expect(snapshot).toMatch(/^- textbox "PIN"/);

  if (browserName === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    const nodes = await (async () => {
      const { nodes } = await cdp.send("Accessibility.getFullAXTree");

      return nodes.filter((node) => node.role?.value === "textbox" && node.name?.value === "PIN");
    })();

    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.role?.value).toBe("textbox");
    expect(String(nodes[0]!.value?.value ?? "")).not.toMatch(/[0-9]/);
  }

  const cellBackground = (index: number) =>
    page
      .getByTestId(`pin-cell-${index}`)
      .evaluate((element) => getComputedStyle(element).backgroundColor);

  // Clicking cell 3 selects it, drawn differently from cell 2.
  await clickCell(page, "pin", 3);
  expect(await selection(pin)).toEqual([3, 4]);
  await expect(page.getByTestId("pin-cell-3")).toHaveClass(/\bselected\b/);
  await expect(page.getByTestId("pin-cell-2")).not.toHaveClass(/\bselected\b/);
  expect(await cellBackground(3)).not.toBe(await cellBackground(2));
  await info.attach("masked-selected-cell", {
    body: await out(page, "pin-root").screenshot(),
    contentType: "image/png",
  });

  // Select all: every cell.
  await page.keyboard.press("ControlOrMeta+a");
  await expect(out(page, "pin-marks")).toHaveText("ssssss");
  await info.attach("masked-select-all", {
    body: await out(page, "pin-root").screenshot(),
    contentType: "image/png",
  });

  // End in a full code: no caret cell, so the root draws the focus.
  await page.keyboard.press("End");
  await expect(out(page, "pin-marks")).toHaveText("......");
  await expect(out(page, "pin-root")).toHaveClass(/\bfocused\b/);
  expect(
    await out(page, "pin-cell-row").evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe("solid");
  await info.attach("masked-full-focused", {
    body: await out(page, "pin-root").screenshot(),
    contentType: "image/png",
  });

  // The mask follows its input live, records and type alike.
  await scriptClick(page, "pin-unmask");
  await expect(pin).toHaveAttribute("type", "text");
  await expect(out(page, "pin-chars")).toHaveText("2,4,6,8,1,0");
  await expect(page.getByTestId("pin-cell-0")).toHaveText("2");

  if (browserName === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const named = nodes.filter(
      (node) => node.role?.value === "textbox" && node.name?.value === "PIN",
    );

    expect(named[0]!.value?.value).toBe("246810");
  }

  await scriptClick(page, "pin-unmask");
  await expect(pin).toHaveAttribute("type", "password");
  await expect(out(page, "pin-chars")).toHaveText("null,null,null,null,null,null");
});

test("OT10 Field and Signal Forms: labelled, described, required and invalid; only leaving touches; readonly and disabled; exact validation with required and pattern", async ({
  page,
}, info) => {
  await fixture(page, "otp-field", info);

  const input = field(page, "direct");
  const id = await input.getAttribute("id");

  expect(id).toMatch(/^og-otp-field-input-/);
  await expect(page.locator("#direct-label")).toHaveAttribute("for", id!);

  const textbox = page.getByRole("textbox", { name: "Κωδικός" });

  await expect(textbox).toHaveAttribute("data-testid", "direct-input");
  await expect(textbox).toHaveAccessibleDescription("Ο 6-ψήφιος κωδικός");
  await expect(input).toHaveAttribute("aria-required", "true");
  await expect(input).not.toHaveAttribute("aria-invalid", /.*/);

  // A Label click focuses it; typing doesn't touch, leaving does, and shows the error.
  await page.locator("#direct-label").click();
  expect(await focusedTestId(page)).toBe("direct-input");
  await page.keyboard.type("12");
  await expect(out(page, "direct-touched")).toHaveText("false");
  await moveFocus(out(page, "before-fields"));
  await expect(out(page, "direct-touched")).toHaveText("true");
  await expect(out(page, "direct-error")).toHaveText("pattern");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveAttribute("aria-describedby", "direct-description direct-error");

  // focusBoundControl() focuses the Input; reset('') empties it.
  await page.getByTestId("direct-focus").click();
  expect(await focusedTestId(page)).toBe("direct-input");
  await scriptClick(page, "direct-reset");
  await expect(input).toHaveValue("");
  await expect(out(page, "direct-value")).toHaveText("");

  // Readonly: natively readonly, focusable, typing changes nothing.
  await scriptClick(page, "direct-freeze");
  await expect(input).toHaveAttribute("readonly", "");
  await moveFocus(input);
  await page.keyboard.type("5");
  await expect(out(page, "direct-value")).toHaveText("");
  await scriptClick(page, "direct-freeze");

  // Disabled: natively disabled, focusBoundControl() leaves focus where it is.
  await scriptClick(page, "direct-lock");
  await expect(input).toBeDisabled();
  await page.getByTestId("direct-focus").click();
  expect(await focusedTestId(page)).toBe("direct-focus");
  await scriptClick(page, "direct-lock");
  await expect(input).toBeEnabled();

  // Exact validation: required + pattern refuse every code that isn't six digits.
  const submits = out(page, "direct-submits");

  for (const [written, kind] of [
    ["1234567", "pattern"],
    ["12ab", "pattern"],
    ["", "required"],
    ["98", "pattern"],
  ] as const) {
    await page.getByTestId(`direct-write-${written}`).click();
    await page.getByTestId("direct-submit").click();
    await expect(out(page, "direct-errors")).toHaveText(kind);
    await expect(submits).toHaveText("");
  }

  await page.getByTestId("direct-write-012345").click();
  await page.getByTestId("direct-submit").click();
  await expect(submits).toHaveText("012345");

  // minLength alone lets an over-long application value through: the reason for pattern.
  await page.getByTestId("loose-write-1234567").click();
  await page.getByTestId("loose-submit").click();
  await expect(out(page, "loose-submits")).toHaveText("1234567");

  // A composer that is the control: its own model is bound, the composed root's is never written.
  const composed = field(page, "composed");

  await expect(out(page, "composed-cells")).toHaveText("12__");
  await select(composed, 2, 2);
  await page.keyboard.type("34");
  await expect(out(page, "composed-value")).toHaveText("1234");
  await expect(out(page, "composed-own-value")).toHaveText("");
  await expect(out(page, "composed-changes")).toHaveText("2");
  await page.keyboard.type("5");
  await expect(out(page, "composed-value")).toHaveText("1234");
  await moveFocus(out(page, "after-fields"));
  await expect(out(page, "composed-touched")).toHaveText("true");
  await page.getByTestId("composed-focus").click();
  expect(await focusedTestId(page)).toBe("composed-input");
  await scriptClick(page, "composed-reset");
  await expect(composed).toHaveValue("");
  await scriptClick(page, "composed-lock");
  await expect(composed).toBeDisabled();
  await scriptClick(page, "composed-lock");

  // Factory Options with a plain signal: five cells, one set per edit.
  const signalled = field(page, "signal");

  await expect(out(page, "signal-cells")).toHaveText("12___");
  await select(signalled, 2, 2);
  await page.keyboard.type("3");
  await expect(out(page, "signal-value")).toHaveText("123");
  await expect(out(page, "signal-sets")).toHaveText("1");
});

test("OT10 a composite's host Field names its Input with projected Description and Error components, mounted ones only, default and bound IDs alike", async ({
  page,
}, info) => {
  await fixture(page, "otp-field-pin-pad", info);

  const input = page.getByTestId("pin-pad-input");
  const description = page.getByTestId("pin-pad-description");
  const describedBy = () => input.getAttribute("aria-describedby");
  const descriptionId = await description.getAttribute("id");

  expect(descriptionId).toMatch(/^og-field-description-/);
  expect(await describedBy()).toBe(descriptionId);

  const titleId = await page.locator("acceptance-pin-title").getAttribute("id");

  await expect(input).toHaveAttribute("aria-labelledby", titleId!);
  await expect(page.getByRole("textbox", { name: "Κωδικός email" })).toHaveAccessibleDescription(
    "Ο κωδικός που στείλαμε",
  );

  // The Error is named while it is mounted.
  await page.getByTestId("pin-pad-reject").click();

  const errorId = await page.getByTestId("pin-pad-error").getAttribute("id");

  expect(errorId).toMatch(/^og-field-error-/);
  await expect(input).toHaveAttribute("aria-describedby", `${descriptionId} ${errorId}`);
  await page.getByTestId("key-1").click();
  await expect(page.getByTestId("pin-pad-error")).toHaveCount(0);
  await expect(input).toHaveAttribute("aria-describedby", descriptionId!);
  await page.getByTestId("pin-pad-reject").click();

  const remounted = await page.getByTestId("pin-pad-error").getAttribute("id");

  await expect(input).toHaveAttribute("aria-describedby", `${descriptionId} ${remounted}`);

  // A bound ID on the projected Description.
  await page.getByTestId("pin-pad-description-id").click();
  await expect(description).toHaveAttribute("id", "bound-description");
  await expect(input).toHaveAttribute("aria-describedby", `bound-description ${remounted}`);
});

test("OT11 server HTML and hydration: the Input's attributes, its value and autocomplete overrides are rendered and kept, no value property is written and a server-complete code emits nothing", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!;
    const writes: string[] = [];

    (window as unknown as { otWrites: string[] }).otWrites = writes;
    Object.defineProperty(HTMLInputElement.prototype, "value", {
      ...descriptor,
      set(this: HTMLInputElement, value: string) {
        writes.push(`${this.getAttribute("data-testid")}=${value}`);
        descriptor.set!.call(this, value);
      },
    });
  });

  let server: Record<string, unknown> = {};

  await fixture(page, "otp-field", info, async () => {
    server = await describe(page);
  });

  const direct = server["direct"] as Record<string, string | null>;
  const id = direct["id"];

  expect(id).toMatch(/^og-otp-field-input-s\d+$/);
  expect(server).toEqual({
    direct: {
      type: "text",
      id,
      value: "",
      inputmode: "numeric",
      autocomplete: "one-time-code",
      autocorrect: "off",
      autocapitalize: "off",
      spellcheck: "false",
      "aria-describedby": "direct-description",
      "aria-required": "true",
      "aria-invalid": null,
      maxlength: null,
      pattern: null,
      disabled: null,
      readonly: null,
      role: null,
    },
    labelFor: id,
    pin: { type: "password", id: "pin-input", autocomplete: "new-password", value: "" },
    bound: { type: "text", autocomplete: "current-password" },
    preset: { value: "123456" },
    composed: { value: "12" },
  });
  expect(await describe(page)).toEqual(server);
  await expect(field(page, "preset")).toHaveValue("123456");
  await expect(out(page, "preset-changes")).toHaveText("0");
  expect(await page.evaluate(() => (window as unknown as { otWrites: string[] }).otWrites)).toEqual(
    [],
  );

  // A bound override follows its binding.
  await page.getByTestId("bound-autocomplete").click();
  await expect(field(page, "bound")).toHaveAttribute("autocomplete", "off");
});

/**
 * Holds the response of every lazy script containing `marker` until `release`, which the
 * hydration cases do as well: the genuine deferred dependency, never substituted.
 */
async function holdDependency(
  page: Page,
  marker: string,
): Promise<{ release: () => void; requests: string[] }> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requests: string[] = [];

  await page.route("**/*", async (route) => {
    if (
      route.request().resourceType() !== "script" ||
      /\/main(?:-[\w-]+)?\.(?:m?js|ts)$/.test(new URL(route.request().url()).pathname)
    ) {
      await route.fallback();

      return;
    }

    const response = await route.fetch();
    const text = await response.text();

    if (text.includes(marker)) {
      requests.push(route.request().url());
      await gate;
    }

    await route.fulfill({ response });
  });

  return { release, requests };
}

/**
 * Runs `before`, then `held`, while the fixture is still the server's HTML, then lets it hydrate.
 * Eager projects hold the application's bootstrap. Incremental ones bootstrap and hold the
 * deferred block's own dependency, the fixture's code (the only lazy script with its
 * `data-client-rendered` binding), so the block stays dehydrated after `before`'s events ask
 * Angular to hydrate it. `held` checks what the browser alone left, before the Input adopts it.
 */
async function hydrateAfter(
  page: Page,
  info: TestInfo,
  before: () => Promise<void>,
  held: () => Promise<void>,
): Promise<void> {
  const incremental = info.project.metadata.hydration === "incremental";
  const host = page.locator("acceptance-otp-field-fixture");
  const release = await bootstrapHeld(page, "/otp-field", info);
  let lazy: { release: () => void; requests: string[] } | null = null;

  try {
    if (incremental) {
      lazy = await holdDependency(page, "data-client-rendered");
      release();
      await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
      expect(lazy.requests).toEqual([]);
    }

    await expect(host).not.toHaveAttribute("data-client-rendered", /.*/);
    await before();

    if (lazy !== null) {
      // The events reached the dehydrated block: Angular asked for its code, which waits.
      await expect.poll(() => lazy?.requests.length ?? 0).toBeGreaterThan(0);
    }

    await held();
    await expect(host).not.toHaveAttribute("data-client-rendered", /.*/);
  } finally {
    release();
    lazy?.release();
  }

  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  await expect(host).toHaveAttribute("data-client-rendered", "true");
}

/** Waits two frames: Angular replays the events a block queued before it hydrated by then. */
async function replayed(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * While the block is still the server's HTML: the Input shows the browser's own `text`, and
 * nothing is committed or touched yet.
 */
async function unadopted(page: Page, text: string): Promise<void> {
  await expect(field(page, "direct")).toHaveValue(text);
  await expect(out(page, "direct-value")).toHaveText("");
  await expect(out(page, "direct-changes")).toHaveText("");
  await expect(out(page, "direct-touched")).toHaveText("false");
  await expect(out(page, "direct-touches")).toHaveText("0:");
}

test("OT12 digits typed before the block hydrates commit once it hydrates, not again when Angular replays them", async ({
  page,
}, info) => {
  const input = field(page, "direct");

  await hydrateAfter(
    page,
    info,
    async () => {
      await moveFocus(input);
      await page.keyboard.type("12");
    },
    () => unadopted(page, "12"),
  );

  // Adopted at the first render, as one edit.
  await expect(out(page, "direct-value")).toHaveText("12");
  await expect(input).toHaveValue("12");
  await expect(out(page, "direct-changes")).toHaveText("12/false");

  // Angular's replay of the two keystrokes isn't another edit.
  await replayed(page);
  await expect(out(page, "direct-changes")).toHaveText("12/false");

  // It keeps working afterwards.
  await page.keyboard.type("3");
  await expect(out(page, "direct-changes")).toHaveText("12/false,123/false");
});

test("OT12 six digits typed before hydration commit once with state.complete() true in the handler", async ({
  page,
}, info) => {
  const input = field(page, "direct");

  await hydrateAfter(
    page,
    info,
    async () => {
      await moveFocus(input);
      await page.keyboard.type("123456");
    },
    () => unadopted(page, "123456"),
  );
  await expect(out(page, "direct-value")).toHaveText("123456");
  await expect(out(page, "direct-changes")).toHaveText("123456/true");
  await replayed(page);
  await expect(out(page, "direct-changes")).toHaveText("123456/true");
});

test("OT12 a letter typed before hydration is undone without a write", async ({ page }, info) => {
  const input = field(page, "direct");

  await hydrateAfter(
    page,
    info,
    async () => {
      await moveFocus(input);
      await page.keyboard.type("x");
    },
    () => unadopted(page, "x"),
  );
  await expect(input).toHaveValue("");
  await expect(out(page, "direct-changes")).toHaveText("");
  await replayed(page);
  await expect(input).toHaveValue("");
  await expect(out(page, "direct-changes")).toHaveText("");
});

test("OT12 a formatted code pasted before hydration is read as a code once", async ({
  page,
}, info) => {
  const input = field(page, "direct");

  await hydrateAfter(
    page,
    info,
    async () => {
      await copy(page, "123 456");
      await moveFocus(input);
      await page.keyboard.press("ControlOrMeta+v");
    },
    () => unadopted(page, "123 456"),
  );
  await expect(input).toHaveValue("123456");
  await expect(out(page, "direct-changes")).toHaveText("123456/true");
  await replayed(page);
  await expect(input).toHaveValue("123456");
  await expect(out(page, "direct-changes")).toHaveText("123456/true");
});

test("OT12 a composition still open when the block hydrates is checked once, at its end", async ({
  page,
}, info) => {
  const input = field(page, "direct");

  await hydrateAfter(
    page,
    info,
    async () => {
      await moveFocus(input);
      await compose(input, ["start", { text: "１" }]);
    },
    () => unadopted(page, "１"),
  );

  // Hydrated with the composition open: nothing checked yet, also after the replay.
  await replayed(page);
  await expect(input).toHaveValue("１");
  await expect(out(page, "direct-changes")).toHaveText("");
  await compose(input, [{ text: "１２" }]);
  await replayed(page);
  expect(await input.inputValue()).toBe("１２");
  await expect(out(page, "direct-changes")).toHaveText("");
  await compose(input, ["end"]);
  await expect(input).toHaveValue("12");
  await expect(out(page, "direct-changes")).toHaveText("12/false");
  await replayed(page);
  await expect(out(page, "direct-changes")).toHaveText("12/false");
});

test("OT12 a composition ended before hydration commits once", async ({ page }, info) => {
  const input = field(page, "direct");

  await hydrateAfter(
    page,
    info,
    async () => {
      await moveFocus(input);
      await compose(input, ["start", { text: "１２３" }, "end", "trailing"]);
    },
    () => unadopted(page, "１２３"),
  );
  await expect(input).toHaveValue("123");
  await expect(out(page, "direct-changes")).toHaveText("123/false");
  await replayed(page);
  await expect(out(page, "direct-changes")).toHaveText("123/false");

  // Not left composing: typing commits.
  await select(input, 3, 3);
  await page.keyboard.type("4");
  await expect(out(page, "direct-changes")).toHaveText("123/false,1234/false");
});

test("OT12 leaving the Input before its block hydrates touches the field once it hydrates, after the Input adopted its digits", async ({
  page,
}, info) => {
  const input = field(page, "direct");

  await hydrateAfter(
    page,
    info,
    async () => {
      // Digits set without an edit event, then a click on another control in the block, which
      // takes focus from the Input.
      await input.evaluate((element: HTMLInputElement) => {
        element.focus();
        element.value = "12";
      });
      await page.getByTestId("before-fields").click();
    },
    async () => {
      await unadopted(page, "12");
      expect(await focusedTestId(page)).toBe("before-fields");
    },
  );

  // One `touch`, which already reads the adopted code.
  await expect(out(page, "direct-touches")).toHaveText("1:12");
  await expect(out(page, "direct-touched")).toHaveText("true");
  await expect(out(page, "direct-value")).toHaveText("12");
  await expect(out(page, "direct-changes")).toHaveText("12/false");
  await replayed(page);
  await expect(out(page, "direct-touches")).toHaveText("1:12");
});

test("OT14 application writes show focused and unfocused, also values that aren't codes, without taking focus or emitting; the next edit leaves a code", async ({
  page,
}, info) => {
  await fixture(page, "otp-field", info);

  const input = field(page, "direct");
  const cells = out(page, "direct-cells");

  // Unfocused: shown, focus stays where it is.
  await moveFocus(out(page, "before-fields"));
  await writeDirect(page, "987654");
  await expect(input).toHaveValue("987654");
  await expect(cells).toHaveText("987654");
  expect(await focusedTestId(page)).toBe("before-fields");

  // Focused: shown with the caret at the end.
  await select(input, 1, 1);
  await writeDirect(page, "98");
  await expect(input).toHaveValue("98");
  expect(await selection(input)).toEqual([2, 2]);
  await expect(out(page, "direct-marks")).toHaveText("..c...");

  // Values that aren't codes are kept as written; the cells show their first six characters.
  await writeDirect(page, "12ab");
  await expect(input).toHaveValue("12ab");
  await expect(cells).toHaveText("12ab__");
  await expect(out(page, "direct-complete")).toHaveText("false");
  await writeDirect(page, "1234567");
  await expect(input).toHaveValue("1234567");
  await expect(cells).toHaveText("123456");
  await expect(out(page, "direct-complete")).toHaveText("false");
  await expect(out(page, "direct-changes")).toHaveText("");

  // The next edit must leave a code: Backspace commits six digits; a digit into `12ab` is undone.
  await select(input, 7, 7);
  await page.keyboard.press("Backspace");
  await expect(out(page, "direct-value")).toHaveText("123456");
  await expect(out(page, "direct-changes")).toHaveText("123456/true");
  await writeDirect(page, "12ab");
  await select(input, 4, 4);
  await page.keyboard.type("5");
  await expect(input).toHaveValue("12ab");
  await expect(out(page, "direct-value")).toHaveText("12ab");

  // Then an invalid application write is still refused on submit.
  await writeDirect(page, "1234567");
  await page.getByTestId("direct-submit").click();
  await expect(out(page, "direct-submits")).toHaveText("");
});
