import { test, expect } from "./contract-test.js";
import type { Locator, Page, TestInfo } from "playwright/test";
import { bootstrapHeld, fixture } from "./observation.js";

// Number field (section 30, NF). NF1 is the package and type gates, NF2 the grammar and step math
// in Node (number-field-checks.mjs), NF13 the `errors` fixture.

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

/** Focuses the Input and selects its whole text, so the next key replaces it. */
async function selectAll(target: Locator): Promise<void> {
  await target.evaluate((element: HTMLInputElement) => {
    element.focus();
    element.select();
  });
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

async function selectionDirection(target: Locator): Promise<string | null> {
  return target.evaluate((element: HTMLInputElement) => element.selectionDirection);
}

async function focusedTestId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
}

/**
 * Pastes `text` into `target` through the real clipboard: a scratch textarea copies it, then
 * the Input's selection is put back and Ctrl+V pastes, so the browser inserts it natively.
 */
async function paste(page: Page, target: Locator, text: string): Promise<void> {
  const [start, end] = await selection(target);

  await page.evaluate((value: string) => {
    let scratch = document.querySelector<HTMLTextAreaElement>("#nf-clipboard");

    if (scratch === null) {
      scratch = document.createElement("textarea");
      scratch.id = "nf-clipboard";
      document.body.append(scratch);
    }

    scratch.value = value;
    scratch.focus();
    scratch.select();
  }, text);
  await page.keyboard.press("Control+c");
  await select(target, start ?? 0, end ?? 0);
  await page.keyboard.press("Control+v");
}

/** The direct field's attributes and its Label's and buttons', as the contract names them. */
async function describeDirect(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('[data-testid="direct-input"]')!;
    const read = (element: Element, names: string[]): Record<string, string | null> => {
      const attributes: Record<string, string | null> = {};

      for (const name of names) {
        attributes[name] = element.getAttribute(name);
      }

      return attributes;
    };
    const buttons = ["direct-decrement", "direct-increment"].map((id) =>
      read(document.querySelector(`[data-testid="${id}"]`)!, [
        "type",
        "tabindex",
        "aria-controls",
        "aria-label",
        "disabled",
        "aria-disabled",
      ]),
    );

    return {
      input: read(input, [
        "type",
        "id",
        "value",
        "inputmode",
        "autocomplete",
        "autocorrect",
        "spellcheck",
        "aria-describedby",
        "aria-required",
        "aria-invalid",
        "disabled",
        "readonly",
        "role",
      ]),
      labelFor: document.querySelector("#direct-label")!.getAttribute("for"),
      buttons,
    };
  });
}

test("NF9 server HTML and hydration: the Input is the Field's labelled, described, required control with its text; the step buttons name it", async ({
  page,
}, info) => {
  let server: Record<string, unknown> = {};

  await fixture(page, "number-field", info, async () => {
    server = await describeDirect(page);
  });

  const serverInput = server["input"] as Record<string, string | null>;
  const id = serverInput["id"];

  expect(id).toMatch(/^og-number-field-input-s\d+$/);
  expect(server).toEqual({
    input: {
      type: "text",
      id,
      value: "12,50",
      inputmode: "decimal",
      autocomplete: "off",
      autocorrect: "off",
      spellcheck: "false",
      "aria-describedby": "direct-description",
      "aria-required": "true",
      "aria-invalid": null,
      disabled: null,
      readonly: null,
      role: null,
    },
    labelFor: id,
    buttons: [
      {
        type: "button",
        tabindex: "-1",
        "aria-controls": id,
        "aria-label": "Μείωση",
        disabled: null,
        "aria-disabled": null,
      },
      {
        type: "button",
        tabindex: "-1",
        "aria-controls": id,
        "aria-label": "Αύξηση",
        disabled: null,
        "aria-disabled": null,
      },
    ],
  });
  expect(await describeDirect(page)).toEqual(server);
  await expect(field(page, "direct")).toHaveValue("12,50");

  const textbox = page.getByRole("textbox", { name: "Ποσό" });

  await expect(textbox).toHaveAccessibleDescription("Σε ευρώ");
  await expect(textbox).toHaveAttribute("data-testid", "direct-input");

  // A Label click focuses the Input natively.
  await page.locator("#direct-label").click();
  expect(await focusedTestId(page)).toBe("direct-input");

  // An error shown after the field is touched: aria-invalid, and the Error describes the Input.
  await selectAll(field(page, "direct"));
  await page.keyboard.type("-");
  await expect(out(page, "direct-errors")).toHaveText("numberIncomplete");
  await expect(field(page, "direct")).not.toHaveAttribute("aria-invalid", /.*/);
  await moveFocus(out(page, "before-fields"));
  await expect(out(page, "direct-error")).toHaveText("numberIncomplete");
  await expect(field(page, "direct")).toHaveAttribute("aria-invalid", "true");
  await expect(field(page, "direct")).toHaveAttribute(
    "aria-describedby",
    "direct-description direct-error",
  );
  await expect(textbox).toHaveAccessibleDescription("Σε ευρώ numberIncomplete");
});

test("NF3 typing commits each whole number at once, keeps the last one through a half-typed text, and leaving shows the format without a write", async ({
  page,
}, info) => {
  await fixture(page, "number-field", info);

  const input = field(page, "direct");
  const value = out(page, "direct-value");
  const writes = out(page, "direct-writes");

  await selectAll(input);

  for (const [key, text, committed] of [
    ["1", "1", "1"],
    ["2", "12", "12"],
    ["3", "123", "123"],
    ["4", "1234", "1234"],
    [",", "1234,", "1234"],
    ["5", "1234,5", "1234.5"],
  ]) {
    await page.keyboard.type(key);
    await expect(input).toHaveValue(text);
    await expect(value).toHaveText(committed);
  }
  await expect(writes).toHaveText("5");
  await expect(out(page, "direct-errors")).toHaveText("max");
  await expect(out(page, "direct-parse")).toHaveText("");

  // Leaving shows the format; nothing is written.
  await moveFocus(out(page, "before-fields"));
  await expect(input).toHaveValue("1.234,50");
  await expect(value).toHaveText("1234.5");
  await expect(writes).toHaveText("5");
  await expect(out(page, "direct-touched")).toHaveText("true");

  // A misgrouped number, typed key by key: the value is the last whole number typed.
  await selectAll(input);
  await page.keyboard.type("1");
  await expect(value).toHaveText("1");
  await page.keyboard.type(".");
  await expect(out(page, "direct-parse")).toHaveText("numberInvalid");
  await page.keyboard.type("5");
  await expect(input).toHaveValue("1.5");
  await expect(value).toHaveText("1");
  await expect(out(page, "direct-errors")).toHaveText("numberInvalid");
  await expect(writes).toHaveText("6");

  // A text with a parse error stays as typed on leaving.
  await moveFocus(out(page, "before-fields"));
  await expect(input).toHaveValue("1.5");

  // Completing the groups commits; ASCII `-` and U+2212 type the minus.
  await selectAll(input);
  await page.keyboard.type("1.500");
  await expect(value).toHaveText("1500");
  await selectAll(input);
  await page.keyboard.type("−12,3");
  await expect(value).toHaveText("-12.3");
  await expect(out(page, "direct-errors")).toHaveText("min");

  // Empty commits null.
  await selectAll(input);
  await page.keyboard.press("Backspace");
  await expect(input).toHaveValue("");
  await expect(value).toHaveText("null");
  await expect(out(page, "direct-errors")).toHaveText("required");

  // A value write replaces the text.
  await page.keyboard.type("-");
  await expect(out(page, "direct-parse")).toHaveText("numberIncomplete");
  await page.getByTestId("direct-write").click();
  await expect(input).toHaveValue("7,25");
  await expect(out(page, "direct-parse")).toHaveText("");

  // A programmatic value with more fraction digits than shown, under a counter of the effective
  // value's `set` calls: focusing and leaving calls none and keeps it; typing the text it shows
  // over itself is an edit, which commits it.
  const counted = field(page, "counted");
  const countedValue = out(page, "counted-value");
  const sets = out(page, "counted-sets");

  await expect(counted).toHaveValue("1,23");
  await moveFocus(counted);
  await moveFocus(out(page, "after-fields"));
  await expect(counted).toHaveValue("1,23");
  await expect(countedValue).toHaveText("1.234");
  await expect(sets).toHaveText("0");
  await select(counted, 3, 4);
  await page.keyboard.type("3");
  await expect(counted).toHaveValue("1,23");
  await expect(countedValue).toHaveText("1.23");
  await expect(sets).toHaveText("1");
});

test("NF4 an edit that leaves text outside the grammar is undone with its selection, after native listeners saw it; paste and composition are checked", async ({
  page,
}, info) => {
  await fixture(page, "number-field", info);

  const input = field(page, "direct");
  const value = out(page, "direct-value");
  const writes = out(page, "direct-writes");

  await input.evaluate((element: HTMLInputElement) => {
    const seen: string[] = [];

    (window as unknown as { nfSeen: string[] }).nfSeen = seen;
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

  // A letter, a third fraction digit and a second decimal separator at the end.
  for (const key of ["x", "5", ","]) {
    await select(input, 5, 5);
    await page.keyboard.type(key);
    await expect(input).toHaveValue("12,50");
    expect(await selection(input)).toEqual([5, 5]);
  }

  expect(await page.evaluate(() => (window as unknown as { nfSeen: string[] }).nfSeen)).toEqual([
    "12,50x",
    "12,505",
    "12,50,",
  ]);

  // A letter over a selection: the selection comes back.
  await select(input, 1, 4);
  await page.keyboard.type("x");
  await expect(input).toHaveValue("12,50");
  expect(await selection(input)).toEqual([1, 4]);
  await expect(writes).toHaveText("0");
  await expect(value).toHaveText("12.5");

  // A backward selection comes back backward.
  await select(input, 1, 4, "backward");
  await page.keyboard.type("x");
  await expect(input).toHaveValue("12,50");
  expect(await selection(input)).toEqual([1, 4]);
  expect(await selectionDirection(input)).toBe("backward");

  // Paste: text outside the grammar is undone; a grouped number replaces the selection.
  await select(input, 5, 5);
  await paste(page, input, "abc");
  await expect(input).toHaveValue("12,50");
  expect(await selection(input)).toEqual([5, 5]);
  await select(input, 0, 5);
  await paste(page, input, "1.234,56");
  await expect(input).toHaveValue("1.234,56");
  await expect(value).toHaveText("1234.56");
  await page.keyboard.press("Backspace");
  await expect(input).toHaveValue("1.234,5");
  await expect(value).toHaveText("1234.5");

  // Deleting a digit inside the groups is kept: the groups are only misplaced.
  await select(input, 4, 4);
  await page.keyboard.press("Backspace");
  await expect(input).toHaveValue("1.24,5");
  await expect(out(page, "direct-parse")).toHaveText("numberInvalid");
  await expect(value).toHaveText("1234.5");

  // A composition is checked once, when it ends; its undo puts back the selection it started
  // with, backward included.
  await selectAll(input);
  await page.keyboard.type("12,5");
  await select(input, 1, 3, "backward");
  await input.evaluate((element: HTMLInputElement) => {
    element.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
    element.value = "12,5ü";
    element.dispatchEvent(
      new InputEvent("input", { isComposing: true, inputType: "insertCompositionText" }),
    );
  });
  await expect(input).toHaveValue("12,5ü");
  await input.evaluate((element: HTMLInputElement) => {
    element.dispatchEvent(new CompositionEvent("compositionend", { data: "ü" }));
  });
  await expect(input).toHaveValue("12,5");
  expect(await selection(input)).toEqual([1, 3]);
  expect(await selectionDirection(input)).toBe("backward");
  await input.evaluate((element: HTMLInputElement) => {
    element.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
    element.value = "12,56";
    element.dispatchEvent(
      new InputEvent("input", { isComposing: true, inputType: "insertCompositionText" }),
    );
    element.dispatchEvent(new CompositionEvent("compositionend", { data: "6" }));
  });
  await expect(input).toHaveValue("12,56");
  await expect(value).toHaveText("12.56");

  // Firefox's last `input` of a composition comes after `compositionend`, not composing. Over the
  // counting field at 1.234, shown as `1,23`: after a rejected composition it neither commits the
  // restored text nor moves the selection; after an accepted one it doesn't write again; a later
  // edit leaving the same text still commits.
  const counted = field(page, "counted");
  const countedValue = out(page, "counted-value");
  const sets = out(page, "counted-sets");

  await select(counted, 1, 3, "backward");
  await counted.evaluate((element: HTMLInputElement) => {
    element.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
    element.value = "1,23ü";
    element.dispatchEvent(
      new InputEvent("input", { isComposing: true, inputType: "insertCompositionText" }),
    );
    element.dispatchEvent(new CompositionEvent("compositionend", { data: "ü" }));
    element.dispatchEvent(new InputEvent("input", { inputType: "insertCompositionText" }));
  });
  await expect(counted).toHaveValue("1,23");
  expect(await selection(counted)).toEqual([1, 3]);
  expect(await selectionDirection(counted)).toBe("backward");
  await expect(countedValue).toHaveText("1.234");
  await expect(sets).toHaveText("0");
  await select(counted, 3, 4);
  await counted.evaluate((element: HTMLInputElement) => {
    element.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
    element.value = "1,25";
    element.dispatchEvent(
      new InputEvent("input", { isComposing: true, inputType: "insertCompositionText" }),
    );
    element.dispatchEvent(new CompositionEvent("compositionend", { data: "5" }));
    element.dispatchEvent(new InputEvent("input", { inputType: "insertCompositionText" }));
  });
  await expect(counted).toHaveValue("1,25");
  await expect(countedValue).toHaveText("1.25");
  await expect(sets).toHaveText("1");
  await select(counted, 3, 4);
  await page.keyboard.type("5");
  await expect(counted).toHaveValue("1,25");
  await expect(sets).toHaveText("2");
});

test("NF5 Signal Forms: schema bounds reach the root, parse errors come before the schema's, reset() restores the text, focusBoundControl() focuses the Input and only leaving it touches", async ({
  page,
}, info) => {
  await fixture(page, "number-field", info);

  const input = field(page, "direct");
  const value = out(page, "direct-value");
  const errors = out(page, "direct-errors");

  await expect(out(page, "direct-bounds")).toHaveText("0..1000");
  await expect(out(page, "direct-touched")).toHaveText("false");

  // A mouse press on Increment focuses the Input and steps; focus never left it, so no touch.
  await page.getByTestId("direct-increment").click();
  await expect(value).toHaveText("13");
  await expect(input).toHaveValue("13,00");
  expect(await focusedTestId(page)).toBe("direct-input");
  await expect(out(page, "direct-touched")).toHaveText("false");
  await moveFocus(out(page, "before-fields"));
  await expect(out(page, "direct-touched")).toHaveText("true");

  // numberIncomplete and required coexist over null; reset() restores the empty text.
  await page.getByTestId("direct-reset-null").click();
  await expect(input).toHaveValue("");
  await selectAll(input);
  await page.keyboard.type("-");
  await expect(errors).toHaveText("numberIncomplete,required");
  await expect(value).toHaveText("null");
  await page.getByTestId("direct-reset-same").click();
  await expect(input).toHaveValue("");
  await expect(errors).toHaveText("required");

  // reset() to the value already committed discards a half-typed text.
  await page.getByTestId("direct-write").click();
  await expect(input).toHaveValue("7,25");
  await selectAll(input);
  await page.keyboard.type("-");
  await expect(errors).toHaveText("numberIncomplete");
  await expect(value).toHaveText("7.25");
  await page.getByTestId("direct-reset-same").click();
  await expect(input).toHaveValue("7,25");
  await expect(errors).toHaveText("");

  // Writing null over null keeps a half-typed minus.
  await page.getByTestId("direct-write-null").click();
  await expect(input).toHaveValue("");
  await selectAll(input);
  await page.keyboard.type("-");
  await expect(errors).toHaveText("numberIncomplete,required");
  await page.getByTestId("direct-write-null").click();
  await expect(input).toHaveValue("-");
  await expect(errors).toHaveText("numberIncomplete,required");

  await page.getByTestId("direct-focus").click();
  expect(await focusedTestId(page)).toBe("direct-input");

  // The readonly rule: native readonly, still focusable; edits and steps change nothing.
  await page.getByTestId("direct-write").click();
  await page.getByTestId("direct-freeze").click();
  await expect(input).toHaveAttribute("readonly", "");
  await selectAll(input);
  await page.keyboard.type("9");
  await page.keyboard.press("ArrowUp");
  await expect(input).toHaveValue("7,25");
  await expect(value).toHaveText("7.25");

  for (const button of ["direct-increment", "direct-decrement"]) {
    await expect(page.getByTestId(button)).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId(button)).not.toHaveAttribute("disabled", /.*/);
  }

  // Focusable but disabled: Playwright waits for an enabled button unless forced.
  await page.getByTestId("direct-increment").click({ force: true });
  await expect(value).toHaveText("7.25");
  await page.getByTestId("direct-freeze").click();

  // The disabled rule: the Input and the buttons are natively disabled; focus() does nothing.
  await page.getByTestId("direct-lock").click();
  await expect(input).toBeDisabled();
  await expect(page.getByTestId("direct-increment")).toBeDisabled();
  await expect(page.getByTestId("direct-decrement")).toBeDisabled();
  await moveFocus(out(page, "before-fields"));
  await page.getByTestId("direct-focus").click();
  expect(await focusedTestId(page)).toBe("direct-focus");
  await page.getByTestId("direct-lock").click();
  await expect(input).toBeEnabled();
});

test("NF6 F3 guard: parse errors and reset() reach the form through a composer's model and a forwarding linkedSignal, and State carries them with a plain signal()", async ({
  page,
}, info) => {
  await fixture(page, "number-field", info);

  // The composer's model.
  const composed = field(page, "composed");

  await expect(composed).toHaveValue("12.50");
  await selectAll(composed);
  await page.keyboard.type("-");
  await expect(out(page, "composed-errors")).toHaveText("numberIncomplete");
  await expect(out(page, "composed-parse")).toHaveText("numberIncomplete");
  await expect(out(page, "composed-value")).toHaveText("12.5");
  await page.getByTestId("composed-reset-same").click();
  await expect(composed).toHaveValue("12.50");
  await expect(out(page, "composed-errors")).toHaveText("");
  await selectAll(composed);
  await page.keyboard.type("150");
  await expect(out(page, "composed-value")).toHaveText("150");
  await expect(out(page, "composed-errors")).toHaveText("max");
  await expect(out(page, "composed-writes")).toHaveText("3");
  // The composed root's own model is never bound or written.
  await expect(out(page, "composed-own-value")).toHaveText("null");

  // A linkedSignal forwarding to the composer's model.
  const linked = field(page, "linked");

  await expect(linked).toHaveValue("12,5");
  await selectAll(linked);
  await page.keyboard.type(",");
  await expect(out(page, "linked-errors")).toHaveText("numberIncomplete");
  await expect(out(page, "linked-parse")).toHaveText("numberIncomplete");
  await page.getByTestId("linked-reset-same").click();
  await expect(linked).toHaveValue("12,5");
  await expect(out(page, "linked-errors")).toHaveText("");
  await selectAll(linked);
  await page.keyboard.type("8");
  await expect(out(page, "linked-value")).toHaveText("8");

  // A plain signal(), without Signal Forms.
  const signalled = field(page, "signal");

  await expect(signalled).toHaveValue("5");
  await selectAll(signalled);
  await page.keyboard.type("-");
  await expect(out(page, "signal-parse")).toHaveText("numberIncomplete");
  await page.keyboard.type("7");
  await expect(out(page, "signal-parse")).toHaveText("");
  await expect(out(page, "signal-value")).toHaveText("-7");
});

test("NF7 stepping: aligned to min, clamped, never against its direction, from null and from a text with a parse error; buttons disabled at the bounds; readonly and disabled", async ({
  page,
}, info) => {
  await fixture(page, "number-field", info);

  const input = field(page, "plain");
  const value = out(page, "plain-value");
  const writes = out(page, "plain-writes");
  const increment = page.getByTestId("plain-increment");
  const decrement = page.getByTestId("plain-decrement");

  await expect(input).toHaveAttribute("inputmode", "numeric");
  await expect(input).toHaveValue("");

  // From null: up writes min.
  await moveFocus(input);
  await page.keyboard.press("ArrowUp");
  await expect(value).toHaveText("0");
  await expect(input).toHaveValue("0");
  await expect(decrement).toHaveAttribute("aria-disabled", "true");
  await expect(decrement).toHaveAttribute("data-disabled", "");
  await expect(decrement).not.toHaveAttribute("disabled", /.*/);
  await page.keyboard.press("ArrowDown");
  await expect(value).toHaveText("0");
  await expect(writes).toHaveText("1");

  await page.keyboard.press("ArrowUp");
  await expect(value).toHaveText("5");
  await increment.click();
  await expect(value).toHaveText("10");

  // From a value off the steps: the next aligned value, in the key's direction.
  await selectAll(input);
  await page.keyboard.type("7");
  await page.keyboard.press("ArrowUp");
  await expect(value).toHaveText("10");
  await expect(input).toHaveValue("10");
  expect(await selection(input)).toEqual([2, 2]);
  await selectAll(input);
  await page.keyboard.type("7");
  await page.keyboard.press("ArrowDown");
  await expect(value).toHaveText("5");

  // Modified arrows are native.
  await page.keyboard.press("Shift+ArrowUp");
  await page.keyboard.press("Alt+ArrowUp");
  await expect(value).toHaveText("5");

  // A typed value above max is kept; down clamps to max; up does nothing there.
  await selectAll(input);
  await page.keyboard.type("25");
  await expect(value).toHaveText("25");
  await expect(increment).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("ArrowUp");
  await expect(value).toHaveText("25");
  await page.keyboard.press("ArrowDown");
  await expect(value).toHaveText("20");
  await expect(increment).toHaveAttribute("aria-disabled", "true");
  await expect(decrement).not.toHaveAttribute("aria-disabled", /.*/);

  // A text with a parse error steps from the committed value and is replaced.
  await selectAll(input);
  await page.keyboard.type("-");
  await expect(out(page, "plain-parse")).toHaveText("numberIncomplete");
  await page.keyboard.press("ArrowDown");
  await expect(value).toHaveText("15");
  await expect(input).toHaveValue("15");
  await expect(out(page, "plain-parse")).toHaveText("");

  // A decimal separator isn't in the grammar without fraction digits.
  await page.keyboard.type(",");
  await expect(input).toHaveValue("15");

  // Down from null writes max.
  await selectAll(input);
  await page.keyboard.press("Backspace");
  await expect(value).toHaveText("null");
  await decrement.click();
  await expect(value).toHaveText("20");

  // Readonly: steps change nothing, both buttons focusable but disabled.
  await page.getByTestId("plain-freeze").click();
  await expect(input).toHaveAttribute("readonly", "");
  await moveFocus(input);
  await page.keyboard.press("ArrowDown");
  await decrement.click({ force: true });
  await expect(value).toHaveText("20");
  await expect(decrement).toHaveAttribute("aria-disabled", "true");
  await expect(decrement).not.toHaveAttribute("disabled", /.*/);
  await page.getByTestId("plain-freeze").click();

  // Disabled: natively disabled Input and buttons.
  await page.getByTestId("plain-lock").click();
  await expect(input).toBeDisabled();
  await expect(decrement).toBeDisabled();
  await expect(increment).toBeDisabled();
  await page.getByTestId("plain-lock").click();
  await expect(decrement).toBeEnabled();

  // A write is authoritative and replaces the text.
  await page.getByTestId("plain-write").click();
  await expect(input).toHaveValue("25");

  // A step whose value shows as the text it had still moves the caret to the end: 1234.5 up is
  // 1235, both `1.235` without fraction digits.
  const formatted = field(page, "format");

  await page.getByTestId("format-digits").click();
  await expect(formatted).toHaveValue("1.235");
  await select(formatted, 0, 0);
  await page.keyboard.press("ArrowUp");
  await expect(out(page, "format-value")).toHaveText("1235");
  await expect(formatted).toHaveValue("1.235");
  expect(await selection(formatted)).toEqual([5, 5]);
});

test("NF8 a mouse press on a step button keeps focus and the selection in the Input, or moves focus there; a tap steps and is otherwise native under touch emulation", async ({
  page,
  browser,
}, info) => {
  await fixture(page, "number-field", info);

  const input = field(page, "direct");
  const increment = page.getByTestId("direct-increment");

  await select(input, 1, 3);
  await increment.hover();
  await page.mouse.down();
  expect(await focusedTestId(page)).toBe("direct-input");
  expect(await selection(input)).toEqual([1, 3]);
  await expect(input).toHaveValue("12,50");
  await page.mouse.up();
  await expect(out(page, "direct-value")).toHaveText("13");
  await expect(input).toHaveValue("13,00");
  expect(await focusedTestId(page)).toBe("direct-input");
  expect(await selection(input)).toEqual([5, 5]);

  // From elsewhere, the press moves focus to the Input.
  await moveFocus(out(page, "before-fields"));
  await page.getByTestId("direct-decrement").hover();
  await page.mouse.down();
  expect(await focusedTestId(page)).toBe("direct-input");
  await page.mouse.up();
  await expect(out(page, "direct-value")).toHaveText("12");

  // A secondary-button press is native.
  await moveFocus(out(page, "before-fields"));
  await increment.click({ button: "right" });
  expect(await focusedTestId(page)).not.toBe("direct-input");

  const context = await browser.newContext({ hasTouch: true });

  try {
    const touch = await context.newPage();

    await fixture(touch, "number-field", info);

    const touchInput = field(touch, "direct");

    // Where native focus lands after a tap is the engine's; the field doesn't move it.
    await select(touchInput, 1, 3);
    await touch.getByTestId("direct-increment").tap();
    await expect(out(touch, "direct-value")).toHaveText("13");
    await moveFocus(out(touch, "before-fields"));
    await touch.getByTestId("direct-increment").tap();
    await expect(out(touch, "direct-value")).toHaveText("14");
    expect(await focusedTestId(touch)).not.toBe("direct-input");
  } finally {
    await context.close();
  }
});

test("NF10 replacement Options: a composer's existing Options and a factory drive the Input and buttons; focus() before the Input mounts focuses it once it renders", async ({
  page,
}, info) => {
  await fixture(page, "number-field", info);

  // The composer's locale, step and fraction digits.
  const composed = field(page, "composed");

  await expect(composed).toHaveAttribute("inputmode", "decimal");
  await page.getByTestId("composed-increment").click();
  await expect(out(page, "composed-value")).toHaveText("13");
  await expect(composed).toHaveValue("13.00");
  await selectAll(composed);
  await page.keyboard.type("100");
  // The schema's max reached the composer's own input.
  await expect(page.getByTestId("composed-increment")).toHaveAttribute("aria-disabled", "true");
  await page.getByTestId("composed-decrement").click();
  await expect(out(page, "composed-value")).toHaveText("99.5");
  await page.getByTestId("composed-focus").click();
  expect(await focusedTestId(page)).toBe("composed-input");
  await moveFocus(out(page, "before-fields"));
  await expect(out(page, "composed-touched")).toHaveText("true");

  // The factory's el-GR locale and Intl's default digits.
  await expect(field(page, "linked")).toHaveValue("12,5");
  await expect(field(page, "signal")).toHaveValue("5");

  await page.getByTestId("later-focus").click();
  await expect(field(page, "later")).toHaveValue("3");
  await expect.poll(() => focusedTestId(page)).toBe("later-input");
});

test("NF11 a change of locale, fraction digits or grouping shows the value again in the new format, discarding a half-typed text without a write", async ({
  page,
}, info) => {
  await fixture(page, "number-field", info);

  const input = field(page, "format");
  const parse = out(page, "format-parse");

  await expect(input).toHaveValue("1.234,5");
  await selectAll(input);
  await page.keyboard.type("-");
  await expect(parse).toHaveText("numberIncomplete");
  await page.getByTestId("format-locale").click();
  await expect(input).toHaveValue("1,234.5");
  await expect(parse).toHaveText("");
  await expect(out(page, "format-value")).toHaveText("1234.5");

  // Fewer fraction digits show the value rounded and keep it.
  await page.getByTestId("format-digits").click();
  await expect(input).toHaveValue("1,235");
  await expect(input).toHaveAttribute("inputmode", "numeric");
  await expect(out(page, "format-value")).toHaveText("1234.5");

  await page.getByTestId("format-grouping").click();
  await expect(input).toHaveValue("1235");
  await moveFocus(input);
  await input.evaluate((element: HTMLInputElement) => {
    element.setSelectionRange(1, 1);
  });
  await page.keyboard.type(",");
  await expect(input).toHaveValue("1235");

  await page.getByTestId("format-digits").click();
  await expect(input).toHaveValue("1234.5");
  await expect(input).toHaveAttribute("inputmode", "decimal");
  await expect(out(page, "format-writes")).toHaveText("0");
});

/**
 * Loads the fixture at `url` with bootstrap held and runs `before` while the fixture is still the
 * server's: under eager hydration before the application bootstraps, under incremental hydration
 * once the shell attached with the fixture's block still dehydrated, so `before` is what hydrates
 * it.
 */
async function hydrateAfter(
  page: Page,
  info: TestInfo,
  before: () => Promise<void>,
  url = "/number-field",
): Promise<void> {
  const incremental = info.project.metadata.hydration === "incremental";
  const host = page.locator("acceptance-number-field-fixture");
  const release = await bootstrapHeld(page, url, info);

  if (incremental) {
    release();
    await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  }

  await expect(host).not.toHaveAttribute("data-client-rendered", /.*/);
  await before();

  if (!incremental) {
    release();
    await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  }

  await expect(host).toHaveAttribute("data-client-rendered", "true");
}

test("NF12 hydration keeps the server's text and writes no value property", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!;
    const writes: string[] = [];

    (window as unknown as { nfWrites: string[] }).nfWrites = writes;
    Object.defineProperty(HTMLInputElement.prototype, "value", {
      ...descriptor,
      set(this: HTMLInputElement, value: string) {
        writes.push(`${this.getAttribute("data-testid")}=${value}`);
        descriptor.set!.call(this, value);
      },
    });
  });
  await fixture(page, "number-field", info);
  await expect(field(page, "direct")).toHaveValue("12,50");
  await expect(field(page, "format")).toHaveValue("1.234,5");
  expect(await page.evaluate(() => (window as unknown as { nfWrites: string[] }).nfWrites)).toEqual(
    [],
  );
});

test("NF12 a digit typed into the server-rendered Input before its block hydrates commits once it hydrates", async ({
  page,
}, info) => {
  const input = field(page, "direct");

  await hydrateAfter(page, info, async () => {
    // Focus isn't a hydration trigger; the key is.
    await selectAll(input);
    await page.keyboard.type("4");
  });
  await expect(out(page, "direct-value")).toHaveText("4");
  await expect(input).toHaveValue("4");
  await expect(out(page, "direct-writes")).toHaveText("1");
  await expect(out(page, "direct-parse")).toHaveText("");
  // It keeps working afterwards.
  await page.keyboard.type("2");
  await expect(out(page, "direct-value")).toHaveText("42");
});

test("NF12 text typed before hydration that no edit could leave is replaced with the value's", async ({
  page,
}, info) => {
  const input = field(page, "direct");

  await hydrateAfter(page, info, async () => {
    await selectAll(input);
    await page.keyboard.type("x");
  });
  await expect(input).toHaveValue("12,50");
  await expect(out(page, "direct-value")).toHaveText("12.5");
  await expect(out(page, "direct-writes")).toHaveText("0");
});

/** Waits two frames: Angular replays the events a block queued before it hydrated by then. */
async function replayed(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

test("NF12 a replayed input doesn't edit again: a rejected edit before hydration keeps a value with more fraction digits than it shows, an accepted one sets once", async ({
  page,
}, info) => {
  // The counting field holds 1.234, shown as `1,23`. Its first render rejects `x` and restores
  // `1,23`; Angular's replay of the `input` then mustn't take the restored text as an edit.
  const counted = field(page, "counted");

  await hydrateAfter(page, info, async () => {
    await selectAll(counted);
    await page.keyboard.type("x");
  });
  await replayed(page);
  await expect(counted).toHaveValue("1,23");
  await expect(out(page, "counted-value")).toHaveText("1.234");
  await expect(out(page, "counted-sets")).toHaveText("0");

  // A genuine edit afterwards still commits.
  await selectAll(counted);
  await page.keyboard.type("5");
  await expect(out(page, "counted-value")).toHaveText("5");
  await expect(out(page, "counted-sets")).toHaveText("1");
});

test("NF12 a numeric edit before hydration commits once, not again when Angular replays its input", async ({
  page,
}, info) => {
  const counted = field(page, "counted");

  await hydrateAfter(page, info, async () => {
    await selectAll(counted);
    await page.keyboard.type("5");
  });
  await replayed(page);
  await expect(counted).toHaveValue("5");
  await expect(out(page, "counted-value")).toHaveText("5");
  await expect(out(page, "counted-sets")).toHaveText("1");
});

test("NF12 an edit before hydration that leaves the server's text as it was commits once, as it would after hydration", async ({
  page,
}, info) => {
  // The counting field holds 1.234, shown as `1,23`. `3` typed over its `3` leaves `1,23`, which
  // the first render can't tell from the server's text; the replayed `input` shows it was an edit.
  const counted = field(page, "counted");

  await hydrateAfter(page, info, async () => {
    await counted.evaluate((element: HTMLInputElement) => {
      element.focus();
      element.setSelectionRange(3, 4);
    });
    await page.keyboard.type("3");
  });
  await replayed(page);
  await expect(counted).toHaveValue("1,23");
  await expect(out(page, "counted-value")).toHaveText("1.23");
  await expect(out(page, "counted-sets")).toHaveText("1");
});

test("NF12 several edits before hydration that leave the server's text as it was commit once", async ({
  page,
}, info) => {
  // Two `input` events before the block hydrates, both leaving `1,23`: the first replay takes the
  // text, the second isn't another edit. The events bubble, as a browser's do.
  const counted = field(page, "counted");

  await hydrateAfter(page, info, async () => {
    await counted.evaluate((element: HTMLInputElement) => {
      element.focus();

      for (let edit = 0; edit < 2; edit++) {
        element.setSelectionRange(3, 4);
        element.setRangeText("3", 3, 4, "end");
        element.dispatchEvent(
          new InputEvent("input", { bubbles: true, data: "3", inputType: "insertText" }),
        );
      }
    });
  });
  await replayed(page);
  await expect(counted).toHaveValue("1,23");
  await expect(out(page, "counted-value")).toHaveText("1.23");
  await expect(out(page, "counted-sets")).toHaveText("1");
});

/**
 * Loads the fixture with the application held unstable (`?hold-stability`) and types `3` over the
 * `3` of the counting field's `1,23` before its block hydrates. Eager hydration replays the
 * `input` only once the application is stable, so the replay is still waiting when this returns
 * true: the field still holds 1.234. Incremental hydration replays a block's events as it hydrates
 * the block, so nothing can come between: the edit has committed 1.23, and this returns false.
 */
async function sameTextEditWithReplayHeld(page: Page, info: TestInfo): Promise<boolean> {
  const counted = field(page, "counted");

  await hydrateAfter(
    page,
    info,
    async () => {
      await counted.evaluate((element: HTMLInputElement) => {
        element.focus();
        element.setSelectionRange(3, 4);
      });
      await page.keyboard.type("3");
    },
    "/number-field?hold-stability",
  );
  await replayed(page);
  await expect(counted).toHaveValue("1,23");

  if (info.project.metadata.hydration === "incremental") {
    await expect(out(page, "counted-value")).toHaveText("1.23");
    await expect(out(page, "counted-sets")).toHaveText("1");

    return false;
  }

  await expect(out(page, "counted-value")).toHaveText("1.234");
  await expect(out(page, "counted-sets")).toHaveText("0");

  return true;
}

/** Ends the fixture's stability hold, from script so focus stays, and waits for the replay. */
async function releaseReplay(page: Page): Promise<void> {
  await page.getByTestId("release-stability").dispatchEvent("click");
  await replayed(page);
}

test("NF12 an edit before hydration that leaves the server's text as it was commits once when its replay waits for the application to be stable", async ({
  page,
}, info) => {
  const held = await sameTextEditWithReplayHeld(page, info);

  if (!held) {
    return;
  }

  await releaseReplay(page);
  await expect(field(page, "counted")).toHaveValue("1,23");
  await expect(out(page, "counted-value")).toHaveText("1.23");
  await expect(out(page, "counted-sets")).toHaveText("1");
});

test("NF12 a value written while the replay of an edit that left the server's text waits keeps its fraction digits", async ({
  page,
}, info) => {
  // 9.876 shows as `9,88`: the replay mustn't take that text as the edit's.
  const held = await sameTextEditWithReplayHeld(page, info);

  if (!held) {
    return;
  }

  await page.getByTestId("counted-write-more").dispatchEvent("click");
  await expect(field(page, "counted")).toHaveValue("9,88");
  await expect(out(page, "counted-value")).toHaveText("9.876");
  await releaseReplay(page);
  await expect(field(page, "counted")).toHaveValue("9,88");
  await expect(out(page, "counted-value")).toHaveText("9.876");
  await expect(out(page, "counted-sets")).toHaveText("1");
});

test("NF12 a value written while the replay waits keeps its fraction digits also when it shows the server's text", async ({
  page,
}, info) => {
  // 1.2341 shows as `1,23`, the text the edit left: the value tells the write apart.
  const held = await sameTextEditWithReplayHeld(page, info);

  if (!held) {
    return;
  }

  await page.getByTestId("counted-write-same").dispatchEvent("click");
  await expect(out(page, "counted-value")).toHaveText("1.2341");
  await releaseReplay(page);
  await expect(field(page, "counted")).toHaveValue("1,23");
  await expect(out(page, "counted-value")).toHaveText("1.2341");
  await expect(out(page, "counted-sets")).toHaveText("1");
});

test("NF12 a value written and written back to the server's while the replay waits keeps the written value", async ({
  page,
}, info) => {
  // 9.876, then 1.234 again: the field shows the server's text and value, but the replay's edit
  // came before both writes.
  const held = await sameTextEditWithReplayHeld(page, info);

  if (!held) {
    return;
  }

  await page.getByTestId("counted-write-more").dispatchEvent("click");
  await expect(field(page, "counted")).toHaveValue("9,88");
  await page.getByTestId("counted-write-server").dispatchEvent("click");
  await expect(field(page, "counted")).toHaveValue("1,23");
  await expect(out(page, "counted-value")).toHaveText("1.234");
  await releaseReplay(page);
  await expect(field(page, "counted")).toHaveValue("1,23");
  await expect(out(page, "counted-value")).toHaveText("1.234");
  await expect(out(page, "counted-sets")).toHaveText("2");
});

test("NF12 an edit after hydration while the replay of an earlier one that left the server's text waits commits once", async ({
  page,
}, info) => {
  const counted = field(page, "counted");
  const held = await sameTextEditWithReplayHeld(page, info);

  if (!held) {
    return;
  }

  await counted.evaluate((element: HTMLInputElement) => element.setSelectionRange(3, 4));
  await page.keyboard.type("5");
  await expect(counted).toHaveValue("1,25");
  await expect(out(page, "counted-value")).toHaveText("1.25");
  await expect(out(page, "counted-sets")).toHaveText("1");
  await releaseReplay(page);
  await expect(counted).toHaveValue("1,25");
  await expect(out(page, "counted-value")).toHaveText("1.25");
  await expect(out(page, "counted-sets")).toHaveText("1");
});

test("NF12 untouched server text keeps a value with more fraction digits than it shows when its block hydrates", async ({
  page,
}, info) => {
  // An edit to another Input hydrates the block; the counting field's own text is never edited.
  const counted = field(page, "counted");

  await hydrateAfter(page, info, async () => {
    await selectAll(field(page, "direct"));
    await page.keyboard.type("4");
  });
  await replayed(page);
  await expect(out(page, "direct-value")).toHaveText("4");
  await expect(counted).toHaveValue("1,23");
  await expect(out(page, "counted-value")).toHaveText("1.234");
  await expect(out(page, "counted-sets")).toHaveText("0");
});

/**
 * A step of a synthetic input-method composition: its start; a composing `input` that leaves
 * `text`, replacing the element's text or, with `range`, that range of it; its end; or the
 * non-composing `input` Firefox dispatches after the end.
 */
type CompositionStep =
  | "start"
  | { readonly text: string; readonly range?: readonly [number, number] }
  | "end"
  | "trailing";

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
        if (step.range === undefined) {
          element.value = step.text;
        } else {
          element.setRangeText(step.text, step.range[0], step.range[1], "end");
        }

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

test("NF12 a composition still open when the block hydrates isn't checked until it ends, which commits once", async ({
  page,
}, info) => {
  // The counting field holds 1.234, shown as `1,23`. The composition replaces it with `5` before
  // the block hydrates and is still open at its first render, which leaves it be. It goes on after
  // hydration, and ends without the `input` Firefox adds.
  const counted = field(page, "counted");
  const sets = out(page, "counted-sets");

  await hydrateAfter(page, info, async () => {
    await selectAll(counted);
    await compose(counted, ["start", { text: "5" }]);
  });
  await replayed(page);
  await expect(counted).toHaveValue("5");
  await expect(out(page, "counted-value")).toHaveText("1.234");
  await expect(sets).toHaveText("0");

  // The composing `input` renders; the render keeps the open composition's text.
  await compose(counted, [{ text: "56" }]);
  await replayed(page);
  expect(await counted.inputValue()).toBe("56");
  await expect(sets).toHaveText("0");
  await compose(counted, ["end"]);
  await expect(out(page, "counted-value")).toHaveText("56");
  await expect(counted).toHaveValue("56");
  await expect(sets).toHaveText("1");
  await replayed(page);
  await expect(sets).toHaveText("1");

  // Ordinary typing commits afterwards.
  await selectAll(counted);
  await page.keyboard.type("7");
  await expect(out(page, "counted-value")).toHaveText("7");
  await expect(sets).toHaveText("2");
});

test("NF12 a composition still open when the block hydrates keeps text the grammar rejects until it ends, which undoes it", async ({
  page,
}, info) => {
  const counted = field(page, "counted");
  const sets = out(page, "counted-sets");

  await hydrateAfter(page, info, async () => {
    await selectAll(counted);
    await compose(counted, ["start", { text: "ご" }]);
  });
  await replayed(page);
  expect(await counted.inputValue()).toBe("ご");
  await compose(counted, [{ text: "ごご" }]);
  await replayed(page);
  expect(await counted.inputValue()).toBe("ごご");
  await compose(counted, ["end"]);
  await expect(counted).toHaveValue("1,23");
  await expect(out(page, "counted-value")).toHaveText("1.234");
  await expect(sets).toHaveText("0");

  await selectAll(counted);
  await page.keyboard.type("7");
  await expect(out(page, "counted-value")).toHaveText("7");
  await expect(sets).toHaveText("1");
});

test("NF12 a composition that starts before hydration and ends before eager hydration replays its start commits once and leaves the Input not composing", async ({
  page,
}, info) => {
  // `?hold-stability` keeps eager hydration's replay waiting after the Input's listeners attach:
  // the composition's end arrives live, before Angular replays its start. Incremental hydration
  // replays a block's events as it hydrates the block, so there the end comes after the replay.
  const counted = field(page, "counted");
  const sets = out(page, "counted-sets");

  await hydrateAfter(
    page,
    info,
    async () => {
      await selectAll(counted);
      await compose(counted, ["start", { text: "5" }]);
    },
    "/number-field?hold-stability",
  );
  await replayed(page);
  await expect(counted).toHaveValue("5");
  await expect(out(page, "counted-value")).toHaveText("1.234");
  await expect(sets).toHaveText("0");

  await compose(counted, [{ text: "56" }, "end"]);
  await expect(out(page, "counted-value")).toHaveText("56");
  await expect(sets).toHaveText("1");

  await releaseReplay(page);
  await expect(counted).toHaveValue("56");
  await expect(out(page, "counted-value")).toHaveText("56");
  await expect(sets).toHaveText("1");

  await selectAll(counted);
  await page.keyboard.type("7");
  await expect(out(page, "counted-value")).toHaveText("7");
  await expect(sets).toHaveText("2");
});

test("NF12 a composition after hydration keeps its text while the replay of one completed before it runs, and is checked once at its end", async ({
  page,
}, info) => {
  // The first composition completes before the block hydrates; its first render takes `5`. A
  // second starts live while eager hydration's replay waits; the replay of the first one's start
  // and end mustn't close it.
  const counted = field(page, "counted");
  const sets = out(page, "counted-sets");

  await hydrateAfter(
    page,
    info,
    async () => {
      await selectAll(counted);
      await compose(counted, ["start", { text: "5" }, "end"]);
    },
    "/number-field?hold-stability",
  );
  await replayed(page);
  await expect(out(page, "counted-value")).toHaveText("5");
  await expect(sets).toHaveText("1");

  await compose(counted, ["start", { text: "56" }]);
  await releaseReplay(page);
  expect(await counted.inputValue()).toBe("56");
  await expect(sets).toHaveText("1");
  await compose(counted, ["end"]);
  await expect(out(page, "counted-value")).toHaveText("56");
  await expect(sets).toHaveText("2");
});

for (const trailing of [false, true]) {
  test(`NF12 a composition completed before hydration that leaves the server's text commits once${trailing ? ", its trailing input included" : ""}`, async ({
    page,
  }, info) => {
    // The counting field holds 1.234, shown as `1,23`. The composition writes `3` over its `3`:
    // the first render finds the server's text, and the replay of the composition's end takes it
    // as an edit. Firefox adds a non-composing `input` after the end, which isn't another edit.
    const counted = field(page, "counted");
    const sets = out(page, "counted-sets");
    const steps: CompositionStep[] = ["start", { text: "3", range: [3, 4] }, "end"];

    await hydrateAfter(page, info, async () => {
      await counted.evaluate((element: HTMLInputElement) => {
        element.focus();
        element.setSelectionRange(3, 4);
      });
      await compose(counted, trailing ? [...steps, "trailing"] : steps);
    });
    await replayed(page);
    await expect(counted).toHaveValue("1,23");
    await expect(out(page, "counted-value")).toHaveText("1.23");
    await expect(sets).toHaveText("1");
  });
}

test("NF12 a composition completed before hydration commits once and doesn't leave the Input composing", async ({
  page,
}, info) => {
  const counted = field(page, "counted");
  const sets = out(page, "counted-sets");

  await hydrateAfter(page, info, async () => {
    await selectAll(counted);
    await compose(counted, ["start", { text: "5" }, "end"]);
  });
  await replayed(page);
  await expect(counted).toHaveValue("5");
  await expect(out(page, "counted-value")).toHaveText("5");
  await expect(sets).toHaveText("1");

  // A genuine edit afterwards commits: the replay closed the composition.
  await selectAll(counted);
  await page.keyboard.type("7");
  await expect(out(page, "counted-value")).toHaveText("7");
  await expect(sets).toHaveText("2");
});

test("NF12 leaving the server-rendered Input before its block hydrates touches the field and reformats its text once it hydrates", async ({
  page,
}, info) => {
  const input = field(page, "direct");

  await hydrateAfter(page, info, async () => {
    // Text typed without a hydration trigger, then a click on another control in the block, which
    // takes focus from the Input.
    await input.evaluate((element: HTMLInputElement) => {
      element.focus();
      element.value = "1234,5";
    });
    await page.getByTestId("before-fields").click();
  });
  await expect(out(page, "direct-touched")).toHaveText("true");
  await expect(out(page, "direct-value")).toHaveText("1234.5");
  await expect(input).toHaveValue("1.234,50");
  await expect(out(page, "direct-writes")).toHaveText("1");
});

test("NF12 focus leaving the Input before its root's first render touches once the root has rendered", async ({
  page,
}, info) => {
  await fixture(page, "number-field", info);
  // The Input takes focus and loses it during the change detection that creates its root.
  await page.getByTestId("early-show").click();
  await expect(field(page, "early")).toHaveValue("3");
  await expect(out(page, "early-touches")).toHaveText("1");
});

test("NF12 a step waiting for the root's first render writes nothing once a touch before it has destroyed the root", async ({
  page,
}, info) => {
  await fixture(page, "number-field", info);
  // The Input loses focus, then Increment is clicked, during the change detection that creates
  // the root; the root's touch, run first, destroys it.
  await page.getByTestId("dropped-show").click();
  await expect(out(page, "dropped-touches")).toHaveText("1");
  await expect(field(page, "dropped")).toHaveCount(0);
  await expect(out(page, "dropped-value")).toHaveText("3");
  await expect(out(page, "dropped-sets")).toHaveText("0");
});

test("NF12 an Increment click before the block hydrates steps once it hydrates", async ({
  page,
}, info) => {
  await hydrateAfter(page, info, async () => {
    await page.getByTestId("direct-increment").click();
  });
  await expect(out(page, "direct-value")).toHaveText("13");
  await expect(field(page, "direct")).toHaveValue("13,00");
  await expect(out(page, "direct-writes")).toHaveText("1");
});
