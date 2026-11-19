// Signal Forms' `[formField]` on the four roots (plan-2 step 7, cases 1–8, 10 and 11).
import { type Locator, type Page, expect, test } from "@playwright/test";
import {
  captureMessages,
  evidence,
  expectClean,
  modeOf,
  openObserved,
  serverAttributes,
} from "./harness";

type Values = {
  terms: boolean | "indeterminate";
  wifi: boolean;
  size: string | null;
  fruit: string | null;
  country: { id: string; label: string } | null;
};

const initial: Values = {
  terms: true,
  wifi: true,
  size: "s",
  fruit: "apple",
  country: { id: "gr", label: "Greece" },
};
const alternate: Values = {
  terms: false,
  wifi: false,
  size: "l",
  fruit: "pear",
  country: { id: "fr", label: "France" },
};
const untouched = [false, false, false, false, false];

/** Longer than core's 1 s "controlled value not echoed" warning, before checking for noise. */
const settle = 1200;

function byTestId(page: Page, testId: string): Locator {
  return page.locator(`[data-testid="${testId}"]`);
}

function triggerOf(page: Page, root: "fruit" | "country"): Locator {
  return byTestId(page, root).locator("[data-slot=select-trigger]");
}

/** Opens the fixture and hydrates its block (a no-op in eager) by clicking a status element. */
async function open(page: Page, path = "/signal-forms"): Promise<void> {
  await page.goto(path);
  await byTestId(page, "hydrate").click();
  await expect(byTestId(page, "app-ready")).toHaveAttribute("data-ready", "true");
}

async function readJson<T>(page: Page, testId: string): Promise<T> {
  const text = await byTestId(page, testId).innerText();

  return JSON.parse(text) as T;
}

function model(page: Page): Promise<Values> {
  return readJson<Values>(page, "model");
}

function touched(page: Page): Promise<boolean[]> {
  return readJson<boolean[]>(page, "touched");
}

function formData(page: Page): Promise<[string, string][]> {
  return byTestId(page, "native-form").evaluate((form) => {
    const entries: [string, string][] = [];

    for (const [name, value] of new FormData(form as HTMLFormElement)) {
      if (typeof value !== "string") {
        throw new Error(`${name} submits a file`);
      }

      entries.push([name, value]);
    }

    return entries;
  });
}

/** Opens a Select from its trigger by keyboard, moves to the next item and selects it. */
async function chooseNext(page: Page, root: "fruit" | "country"): Promise<void> {
  const trigger = triggerOf(page, root);

  await trigger.focus();
  await trigger.press("ArrowDown");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}

/** Presses every control once: both toggles, the other radio and the other item of each Select. */
async function changeAll(page: Page, radio: "size-s" | "size-l"): Promise<void> {
  await byTestId(page, "terms").click();
  await byTestId(page, "wifi").click();
  await byTestId(page, radio).click();
  await chooseNext(page, "fruit");
  await chooseNext(page, "country");
}

async function expectUi(page: Page, values: Values): Promise<void> {
  await expect(byTestId(page, "terms")).toHaveAttribute("aria-checked", String(values.terms));
  await expect(byTestId(page, "wifi")).toHaveAttribute("aria-checked", String(values.wifi));

  for (const size of ["s", "l"]) {
    await expect(byTestId(page, `size-${size}`)).toHaveAttribute(
      "aria-checked",
      String(values.size === size),
    );
  }

  for (const fruit of ["apple", "pear"]) {
    await expect(byTestId(page, `fruit-${fruit}`)).toHaveAttribute(
      "aria-selected",
      String(values.fruit === fruit),
    );
  }

  for (const country of ["gr", "fr"]) {
    await expect(byTestId(page, `country-${country}`)).toHaveAttribute(
      "aria-selected",
      String(values.country?.id === country),
    );
  }
}

test("[formField] discovers each root's input and output pair: server value, interaction and external writes (case 1)", async ({
  page,
}, testInfo) => {
  const messages = captureMessages(page);
  const response = await page.request.get("/signal-forms");
  const html = await response.text();
  const server: [string, string][] = [
    ["terms", "aria-checked"],
    ["wifi", "aria-checked"],
    ["size-s", "aria-checked"],
    ["fruit-apple", "aria-selected"],
    ["country-gr", "aria-selected"],
  ];

  for (const [testId, attribute] of server) {
    const attributes = await serverAttributes(page, html, `[data-testid="${testId}"]`);

    expect(attributes[attribute], testId).toBe("true");
  }

  await open(page);
  await expectUi(page, initial);
  await page.screenshot({ path: testInfo.outputPath("initial.png"), fullPage: true });

  await changeAll(page, "size-l");
  await expectUi(page, alternate);
  await expect.poll(() => model(page)).toEqual(alternate);
  await page.screenshot({ path: testInfo.outputPath("changed.png"), fullPage: true });

  await byTestId(page, "angular-reset").click();
  await expectUi(page, initial);
  await byTestId(page, "external").click();
  await expectUi(page, alternate);
  expect(await model(page)).toEqual(alternate);
  await page.waitForTimeout(settle);
  expectClean(messages);
});

test("a canceled change request beside [formField] leaves the model and the control (case 2)", async ({
  page,
}) => {
  const messages = captureMessages(page);

  await open(page);
  await byTestId(page, "cancel").click();
  await byTestId(page, "terms").click();
  await byTestId(page, "wifi").click();
  await byTestId(page, "size-l").click();

  for (const root of ["fruit", "country"] as const) {
    const trigger = triggerOf(page, root);

    await trigger.focus();
    await trigger.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  }

  await expectUi(page, initial);
  expect(await model(page)).toEqual(initial);
  await page.waitForTimeout(settle);
  expectClean(messages);
});

test("Angular's reset() restores the controls and clears touched (case 3)", async ({ page }) => {
  const messages = captureMessages(page);

  await open(page);
  await changeAll(page, "size-l");
  await byTestId(page, "outside-a").focus();
  await expect.poll(() => touched(page)).not.toEqual(untouched);

  await byTestId(page, "angular-reset").click();
  await expectUi(page, initial);
  expect(await model(page)).toEqual(initial);
  expect(await touched(page)).toEqual(untouched);

  await byTestId(page, "alternate-reset").click();
  await expectUi(page, alternate);
  expect(await model(page)).toEqual(alternate);
  expect(await touched(page)).toEqual(untouched);
  await page.waitForTimeout(settle);
  expectClean(messages);
});

test("hidden inputs submit under the form's field names, and a native reset writes the model (case 4)", async ({
  page,
}) => {
  const messages = captureMessages(page);
  // D9: Checkbox, Switch and RadioGroup return to the first value they rendered, Select to null.
  const nativeReset: Values = { ...initial, fruit: null, country: null };

  await open(page);
  expect(await formData(page)).toEqual([
    ["signup.terms", "on"],
    ["signup.wifi", "on"],
    ["signup.size", "s"],
    ["signup.fruit", "apple"],
    ["signup.country", "gr"],
  ]);

  await changeAll(page, "size-l");
  expect(await formData(page)).toEqual([
    ["signup.size", "l"],
    ["signup.fruit", "pear"],
    ["signup.country", "fr"],
  ]);
  // The model keeps the object; the form submits its key.
  expect((await model(page)).country).toEqual(alternate.country);

  await byTestId(page, "native-reset").click();
  await expect.poll(() => model(page)).toEqual(nativeReset);
  await expectUi(page, nativeReset);
  await expect(byTestId(page, "fruit-input")).toHaveValue("");
  await expect(byTestId(page, "country-input")).toHaveValue("");

  // Native reset doesn't return to the last Angular reset.
  await byTestId(page, "alternate-reset").click();
  await expectUi(page, alternate);
  await byTestId(page, "native-reset").click();
  await expect.poll(() => model(page)).toEqual(nativeReset);
  await page.waitForTimeout(settle);
  expectClean(messages);
});

test("disabled(), required() and readonly() rules reach the controls (case 5)", async ({
  page,
}, testInfo) => {
  const messages = captureMessages(page);
  const inputs = [
    "terms-input",
    "wifi-input",
    "size-s-input",
    "size-l-input",
    "fruit-input",
    "country-input",
  ];

  await open(page);

  await byTestId(page, "required").click();

  for (const testId of inputs) {
    await expect(byTestId(page, testId), testId).toHaveAttribute("required", "");
  }

  await byTestId(page, "required").click();

  for (const testId of inputs) {
    await expect(byTestId(page, testId), testId).not.toHaveAttribute("required");
  }

  await byTestId(page, "disabled").click();

  for (const testId of ["terms", "wifi", "size-s", "size-l"]) {
    await expect(byTestId(page, testId), testId).toBeDisabled();
  }

  await expect(triggerOf(page, "fruit")).toBeDisabled();
  await expect(triggerOf(page, "country")).toBeDisabled();
  expect(await formData(page)).toEqual([]);
  await byTestId(page, "disabled").click();

  await byTestId(page, "readonly").click();
  await expect.poll(() => readJson(page, "field-flags")).toEqual([false, false, true]);
  await page.screenshot({ path: testInfo.outputPath("readonly.png"), fullPage: true });
  await byTestId(page, "terms").click();
  await byTestId(page, "terms").focus();
  await expect(byTestId(page, "terms")).toBeFocused();
  await byTestId(page, "wifi").click();
  await byTestId(page, "size-s").focus();
  await page.keyboard.press("ArrowDown");
  await byTestId(page, "size-l").click();

  for (const root of ["fruit", "country"] as const) {
    const trigger = triggerOf(page, root);

    await trigger.focus();
    await trigger.press("ArrowDown");
    // A read-only Select opens but doesn't change its value.
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
  }

  await expectUi(page, initial);
  expect(await model(page)).toEqual(initial);
  // Still submitted.
  expect(await formData(page)).toEqual([
    ["signup.terms", "on"],
    ["signup.wifi", "on"],
    ["signup.size", "s"],
    ["signup.fruit", "apple"],
    ["signup.country", "gr"],
  ]);
  await page.waitForTimeout(settle);
  expectClean(messages);
});

test("touch fires when focus leaves the control, not while it moves inside it (case 6)", async ({
  page,
}, testInfo) => {
  const messages = captureMessages(page);
  const outside = byTestId(page, "outside-a");

  await open(page);

  await byTestId(page, "terms").focus();
  await outside.focus();
  await byTestId(page, "wifi").focus();
  await outside.focus();
  await expect.poll(() => touched(page)).toEqual([true, true, false, false, false]);

  // Arrow keys move between radios inside the group; Tab leaves it for the fruit trigger.
  await byTestId(page, "size-s").focus();
  await page.keyboard.press("ArrowDown");
  await expect(byTestId(page, "size-l")).toBeFocused();
  expect((await touched(page))[2]).toBe(false);
  await page.keyboard.press("Tab");
  await expect(triggerOf(page, "fruit")).toBeFocused();
  await expect.poll(async () => (await touched(page))[2]).toBe(true);

  // Trigger → popup → Escape back to the trigger stays inside; so does a selection that closes it.
  // Tab from the trigger then leaves for the next tab stop.
  for (const [root, index, next] of [
    ["fruit", 3, triggerOf(page, "country")],
    ["country", 4, byTestId(page, "native-reset")],
  ] as const) {
    const trigger = triggerOf(page, root);

    await trigger.focus();
    await trigger.press("ArrowDown");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowDown");
    expect((await touched(page))[index]).toBe(false);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await trigger.press("ArrowDown");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
    await page.waitForTimeout(100);
    expect((await touched(page))[index], `${root} inside`).toBe(false);
    await page.keyboard.press("Tab");
    await expect(next).toBeFocused();
    await expect.poll(async () => (await touched(page))[index], `${root} left`).toBe(true);
  }

  // Tab straight from the open popup: core closes it, refocuses the trigger, and the Tab moves on.
  await byTestId(page, "angular-reset").click();
  await expect.poll(() => touched(page)).toEqual(untouched);

  for (const [root, index, next] of [
    ["fruit", 3, triggerOf(page, "country")],
    ["country", 4, byTestId(page, "native-reset")],
  ] as const) {
    const trigger = triggerOf(page, root);

    await trigger.focus();
    await trigger.press("ArrowDown");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowDown");
    expect((await touched(page))[index], `${root} open`).toBe(false);
    await page.keyboard.press("Tab");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(next).toBeFocused();
    await expect.poll(async () => (await touched(page))[index], `${root} tabbed out`).toBe(true);
  }

  await page.screenshot({ path: testInfo.outputPath("touched.png"), fullPage: true });
  await page.waitForTimeout(settle);
  expectClean(messages);
});

test("a popup moved out of the root still counts as inside the Select (case 6)", async ({
  page,
}) => {
  const messages = captureMessages(page);
  const trigger = triggerOf(page, "fruit");

  await open(page);
  await byTestId(page, "portal").click();
  await trigger.focus();
  await trigger.press("ArrowDown");
  await expect(byTestId(page, "fruit-apple")).toBeVisible();

  const insideRoot = await byTestId(page, "fruit-apple").evaluate((item) =>
    document.querySelector("[data-testid=fruit]")!.contains(item),
  );

  expect(insideRoot).toBe(false);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect((await touched(page))[3]).toBe(false);
  // Tab from the relocated popup still closes it through the trigger and leaves for the next stop.
  await trigger.press("ArrowDown");
  await expect(byTestId(page, "fruit-apple")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  expect((await touched(page))[3]).toBe(false);
  await page.keyboard.press("Tab");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(triggerOf(page, "country")).toBeFocused();
  await expect.poll(async () => (await touched(page))[3]).toBe(true);
  await page.waitForTimeout(settle);
  expectClean(messages);
});

test("touch after pointer presses only, recorded per engine (case 6)", async ({
  page,
}, testInfo) => {
  const messages = captureMessages(page);

  await open(page);
  await byTestId(page, "terms").click();
  await byTestId(page, "size-l").click();
  // Pressing non-focusable text moves focus to the body, wherever the press left it.
  await byTestId(page, "hydrate").click();

  const after = await touched(page);

  testInfo.annotations.push({
    type: "pointer-only touch",
    description: `${testInfo.project.name}: terms ${after[0]}, size ${after[2]}`,
  });
  await page.waitForTimeout(settle);
  expectClean(messages);
});

test("focusBoundControl() focuses the checked radio, the first enabled one, the Select trigger and the Checkbox (case 7)", async ({
  page,
}) => {
  const messages = captureMessages(page);

  await open(page);
  await byTestId(page, "external").click();
  await expectUi(page, alternate);

  await byTestId(page, "focus-size").click();
  await expect(byTestId(page, "size-l")).toBeFocused();
  await byTestId(page, "clear-size").click();
  await expect(byTestId(page, "size-l")).toHaveAttribute("aria-checked", "false");
  await byTestId(page, "focus-size").click();
  await expect(byTestId(page, "size-s")).toBeFocused();
  await byTestId(page, "focus-country").click();
  await expect(triggerOf(page, "country")).toBeFocused();
  await byTestId(page, "focus-terms").click();
  await expect(byTestId(page, "terms")).toBeFocused();
  await page.waitForTimeout(settle);
  expectClean(messages);
});

test("hostDirectives composers bind [formField], and controls without hidden inputs don't warn (cases 8, 9)", async ({
  page,
}) => {
  const messages = captureMessages(page);
  const agree = byTestId(page, "composed-agree");
  const trigger = byTestId(page, "composed-country-trigger");
  const composersModel = () => readJson<Record<string, unknown>>(page, "composers-model");
  const composersTouched = () => readJson<boolean[]>(page, "composers-touched");

  await page.goto("/signal-forms-composers");
  await expect(byTestId(page, "app-ready")).toHaveAttribute("data-ready", "true");

  await agree.click();
  await trigger.focus();
  await trigger.press("ArrowDown");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(composersModel)
    .toMatchObject({ agree: true, country: { id: "gr", label: "Greece" } });

  await byTestId(page, "composers-outside").focus();
  await expect.poll(composersTouched).toEqual([true, true]);

  await byTestId(page, "focus-composed-country").click();
  await expect(trigger).toBeFocused();

  await byTestId(page, "composers-readonly").click();
  await agree.click();
  await expect(agree).toHaveAttribute("aria-checked", "true");
  await byTestId(page, "composers-readonly").click();

  await byTestId(page, "composers-disabled").click();
  await expect(agree).toBeDisabled();
  await expect(trigger).toBeDisabled();
  await byTestId(page, "composers-disabled").click();

  await byTestId(page, "composers-external").click();
  await expect(byTestId(page, "composed-country-fr")).toHaveAttribute("aria-selected", "true");

  await byTestId(page, "plain-news").click();
  await expect.poll(composersModel).toMatchObject({ news: true });
  await page.waitForTimeout(settle);
  expectClean(messages);
});

for (const control of ["terms", "wifi", "size", "fruit", "country"] as const) {
  test(`the first press on ${control} before its block hydrates writes the model (case 10)`, async ({
    page,
  }, testInfo) => {
    const messages = captureMessages(page);
    const expected: Values = { ...initial };

    await page.goto("/signal-forms");

    if (control === "terms" || control === "wifi") {
      await byTestId(page, control).click();
      expected[control] = false;
    }

    if (control === "size") {
      await byTestId(page, "size-l").click();
      expected.size = "l";
    }

    if (control === "fruit" || control === "country") {
      const trigger = triggerOf(page, control);

      await trigger.click();
      await expect(byTestId(page, "app-ready")).toHaveAttribute("data-ready", "true");
      await page.waitForTimeout(250);

      // The known first-press inversion (select/README.md): record it, then press again.
      const expanded = await trigger.getAttribute("aria-expanded");

      testInfo.annotations.push({
        type: "first Select press",
        description: `${testInfo.project.name} ${control}: aria-expanded=${expanded}`,
      });

      if (expanded === "false") {
        await trigger.click();
      }

      await byTestId(page, control === "fruit" ? "fruit-pear" : "country-fr").click();
      expected[control] = alternate[control] as never;
    }

    await expect(byTestId(page, "app-ready")).toHaveAttribute("data-ready", "true");
    await expect.poll(() => model(page)).toEqual(expected);
    await page.waitForTimeout(settle);
    expectClean(messages);
  });
}

test("focus moving and focus() before the controls are ready do nothing, and touch works after (case 11)", async ({
  page,
}, testInfo) => {
  test.skip(
    modeOf(testInfo) !== "incremental",
    "the gap needs a block created outside a change-detection tick",
  );

  const messages = captureMessages(page);

  await openObserved(page, "/signal-forms?earlyFocus=1");
  await page.waitForTimeout(500);
  await byTestId(page, "hydrate").click();
  await expect(byTestId(page, "app-ready")).toHaveAttribute("data-ready", "true");
  await page.waitForTimeout(settle);

  const records = await evidence(page);

  await testInfo.attach("evidence", {
    body: JSON.stringify(records, null, 2),
    contentType: "application/json",
  });

  // The gap is real: before each root's ngOnInit and before any of its slots bound.
  expect(records.earlyFocus.map((entry) => entry.instance).sort()).toEqual(["country", "size"]);

  for (const entry of records.earlyFocus) {
    const window = records.instances[entry.instance]!;

    expect(entry, entry.instance).toMatchObject({
      ready: false,
      bounds: 0,
      thrown: null,
      focusUnchanged: true,
    });
    expect(window.ready, `${entry.instance} becomes ready`).toBeTruthy();
    expect(entry.sequence).toBeLessThan(window.ready!.sequence);

    for (const bound of records.bounds) {
      if (bound.instance === entry.instance) {
        expect(bound.sequence).toBeGreaterThan(entry.sequence);
      }
    }
  }

  // The listeners had work: Checkbox → Switch → radio → outside A → outside B.
  const country = records.earlyFocus.find((entry) => entry.instance === "country")!;

  expect(country.focusouts).toBeGreaterThanOrEqual(4);
  await expect(byTestId(page, "outside-b")).toBeFocused();

  // No error and no touch: without the gates, UiSdkError from Select and NG0950 from FormField.
  expectClean(messages);
  expect(await touched(page)).toEqual(untouched);

  // Ordinary touch once bound.
  const outside = byTestId(page, "outside-b");

  await triggerOf(page, "country").focus();
  await outside.focus();
  await expect.poll(async () => (await touched(page))[4]).toBe(true);
  await byTestId(page, "terms").focus();
  await outside.focus();
  await expect.poll(async () => (await touched(page))[0]).toBe(true);
  await byTestId(page, "size-s").focus();
  await page.keyboard.press("ArrowDown");
  expect((await touched(page))[2]).toBe(false);
  await outside.focus();
  await expect.poll(async () => (await touched(page))[2]).toBe(true);
  await page.waitForTimeout(settle);
  expectClean(messages);
});
