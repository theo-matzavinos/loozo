// Native form participation (D14-B): the hidden inputs the author writes, before and after
// hydration, through changes, a reset and validation.
import { type Page, expect, test } from "@playwright/test";
import {
  captureMessages,
  evidence,
  expectClean,
  falsifiers,
  openObserved,
  serverAttributes,
} from "./harness";

type Entries = [string, string][];

/** What the form would submit now. */
async function formData(page: Page, testId: string): Promise<Entries> {
  return page.evaluate((id) => {
    const form = document.querySelector<HTMLFormElement>(`[data-testid=${id}]`)!;

    return [...new FormData(form).entries()].map(([name, value]) => [
      name,
      typeof value === "string" ? value : value.name,
    ]);
  }, testId) as Promise<Entries>;
}

async function validity(page: Page, testId: string): Promise<boolean> {
  return page.evaluate(
    (id) => document.querySelector<HTMLFormElement>(`[data-testid=${id}]`)!.checkValidity(),
    testId,
  );
}

async function hydrated(page: Page): Promise<void> {
  await page.goto("/forms");
  await expect(page.locator("[data-testid=app-ready]")).toHaveAttribute("data-ready", "true");
}

const initial: Entries = [
  ["terms", "on"],
  ["size", "m"],
  ["fruit", "pear"],
  ["outside", "on"],
];

/** The instances whose input sits beside them, which the fixture names for the observer. */
const besideInputs = ["terms", "news", "partial", "wifi", "composed", "outside", "agree", "alerts"];

test("the server renders each hidden input from its control's options", async ({ page }) => {
  const response = await page.request.get("/forms");
  const html = await response.text();
  const attributes = (selector: string) => serverAttributes(page, html, selector);

  expect(response.status()).toBe(200);

  const terms = await attributes("[data-testid=terms-input]");

  expect(terms).toMatchObject({
    "data-slot": "checkbox-input",
    type: "checkbox",
    name: "terms",
    value: "on",
    checked: "",
    "aria-hidden": "true",
    tabindex: "-1",
  });
  expect(terms["style"]).toContain("clip-path: inset(50%)");
  expect(await attributes("[data-testid=news-input]")).toMatchObject({
    name: "news",
    value: "weekly",
  });
  expect(await attributes("[data-testid=news-input]")).not.toHaveProperty("checked");
  expect(await attributes("[data-testid=partial-input]")).not.toHaveProperty("checked");
  expect(await attributes("[data-testid=wifi-input]")).toMatchObject({
    "data-slot": "switch-input",
    type: "checkbox",
    name: "wifi",
  });
  expect(await attributes("[data-testid=size-input-m]")).toMatchObject({
    "data-slot": "radio-input",
    type: "radio",
    name: "size",
    value: "m",
    checked: "",
  });
  expect(await attributes("[data-testid=size-input-s]")).not.toHaveProperty("checked");
  expect(await attributes("[data-testid=fruit-input]")).toMatchObject({
    "data-slot": "select-form-input",
    type: "text",
    name: "fruit",
    value: "pear",
    autocomplete: "off",
  });
  expect(await attributes("[data-testid=outside-input]")).toMatchObject({
    form: "main-form",
    checked: "",
  });
  expect(await attributes("[data-testid=terms]")).toMatchObject({
    role: "checkbox",
    "aria-checked": "true",
    "data-checked": "",
  });
  expect((await attributes("[data-testid=terms]"))["data-ui-sdk-id"]).toMatch(/^ui-sdk-s/);
  expect(await attributes("[data-testid=partial]")).toMatchObject({
    "aria-checked": "mixed",
    "data-indeterminate": "",
  });
  expect(await attributes("[data-testid=wifi]")).toMatchObject({
    role: "switch",
    "aria-checked": "false",
  });
  expect(await attributes("[data-testid=size]")).toMatchObject({ role: "radiogroup" });
  expect(await attributes("[data-testid=size-m]")).toMatchObject({
    role: "radio",
    "aria-checked": "true",
    tabindex: "0",
  });
  expect(await attributes("[data-testid=size-s]")).toMatchObject({ tabindex: "-1" });
  expect(await attributes("[data-testid=agree]")).toMatchObject({ "aria-required": "true" });
});

test("before hydration, the form submits the server's values and validates", async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const page = await context.newPage();

  // No application code runs: only the server HTML takes part in the form.
  await page.route("**/main.js", (route) => route.abort());
  await page.goto("/forms");

  expect(await formData(page, "main-form")).toEqual(initial);
  expect(await validity(page, "required-form")).toBe(false);
  await context.close();
});

test("hydration rewrites no server attribute, and every input binds", async ({
  page,
}, testInfo) => {
  const messages = captureMessages(page);

  await openObserved(page, "/forms");
  await expect(page.locator("[data-testid=app-ready]")).toHaveAttribute("data-ready", "true");
  await page.waitForTimeout(700);

  const records = await evidence(page);

  await testInfo.attach("evidence", {
    body: JSON.stringify(records, null, 2),
    contentType: "application/json",
  });
  expect(falsifiers(records)).toEqual([]);

  const bound = new Set(records.bounds.map((record) => `${record.instance}:${record.slot}`));

  for (const instance of besideInputs) {
    const slot = instance === "wifi" || instance === "alerts" ? "switch" : "checkbox";

    expect(bound, `${instance}'s input binds`).toContain(`${instance}:${slot}-input`);
  }

  expect(bound).toContain("size:radio-input");
  expect(bound).toContain("fruit:select-form-input");
  expect(await formData(page, "main-form")).toEqual(initial);
  expectClean(messages);
});

test("changes reach the form, and a reset returns every control to its default", async ({
  page,
}) => {
  const messages = captureMessages(page);

  await hydrated(page);
  await page.locator("[data-testid=terms]").click();
  await page.locator("[data-testid=news]").click();
  await page.locator("[data-testid=wifi]").press("Space");
  await page.locator("[data-testid=size-m]").press("ArrowDown");
  await expect(page.locator("[data-testid=size-l]")).toBeFocused();
  await page.locator("[data-testid=fruit] [uiSelectTrigger]").click();
  await page.locator("[data-option=apple]").click();
  await page.locator("[data-testid=outside]").click();
  await page.locator("[data-testid=composed]").click();

  await expect(page.locator("[data-testid=composed]")).toHaveClass(/app-checkbox-on/);
  await expect(page.locator("[data-testid=terms-indicator]")).toHaveAttribute("data-unchecked", "");
  await expect(page.locator("[data-testid=wifi-thumb]")).toHaveAttribute("data-checked", "");
  await expect(page.locator("[data-testid=size-indicator-l]")).toHaveAttribute("data-checked", "");
  expect(await formData(page, "main-form")).toEqual([
    ["news", "weekly"],
    ["wifi", "on"],
    ["size", "l"],
    ["fruit", "apple"],
    ["composed", "on"],
  ]);

  await page.locator("[data-testid=reset]").click();

  for (const [id, checked] of [
    ["terms", "true"],
    ["news", "false"],
    ["wifi", "false"],
    ["size-m", "true"],
    ["size-l", "false"],
    ["composed", "false"],
    ["outside", "true"],
  ]) {
    await expect(page.locator(`[data-testid=${id}]`), id).toHaveAttribute("aria-checked", checked!);
  }

  await expect(page.locator("[data-testid=fruit-input]")).toHaveValue("pear");
  expect(await formData(page, "main-form")).toEqual(initial);
  expectClean(messages);
});

test("an indeterminate checkbox reaches its input, and a press checks it", async ({ page }) => {
  const messages = captureMessages(page);
  const input = page.locator("[data-testid=partial-input]");
  const native = () =>
    input.evaluate((element: HTMLInputElement) => [element.checked, element.indeterminate]);

  await hydrated(page);
  expect(await native()).toEqual([false, true]);
  await expect(page.locator("[data-testid=partial-indicator]")).toHaveAttribute(
    "data-indeterminate",
    "",
  );
  await page.locator("[data-testid=partial]").click();
  await expect(page.locator("[data-testid=partial]")).toHaveAttribute("aria-checked", "true");
  expect(await native()).toEqual([true, false]);
  expect(await formData(page, "main-form")).toContainEqual(["partial", "on"]);
  await page.locator("[data-testid=reset]").click();
  await expect(page.locator("[data-testid=partial]")).toHaveAttribute("aria-checked", "mixed");
  expect(await native()).toEqual([false, true]);
  expectClean(messages);
});

test("required controls block submission, and an invalid submit focuses the control", async ({
  page,
}) => {
  const messages = captureMessages(page);
  const submit = () =>
    page.evaluate(() =>
      document.querySelector<HTMLFormElement>("[data-testid=required-form]")!.requestSubmit(),
    );

  await hydrated(page);
  expect(await validity(page, "required-form")).toBe(false);

  // Each prompt is answered from the keyboard on the control the browser focused: Firefox's
  // validation message covers the controls next to it and takes the next click there.
  await submit();
  await expect(page.locator("[data-testid=agree]")).toBeFocused();
  await page.keyboard.press("Space");
  await submit();
  await expect(page.locator("[data-testid=alerts]")).toBeFocused();
  await page.keyboard.press("Space");
  await submit();
  await expect(page.locator("[data-testid=plan-free]")).toBeFocused();
  await page.keyboard.press("Space");
  await submit();
  await expect(page.locator("[data-testid=colour] [uiSelectTrigger]")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("[data-option=red]")).toHaveAttribute("data-highlighted", "");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-testid=colour] input")).toHaveValue("red");
  expect(await validity(page, "required-form")).toBe(true);
  expect(await formData(page, "required-form")).toEqual([
    ["agree", "on"],
    ["alerts", "on"],
    ["plan", "free"],
    ["colour", "red"],
  ]);
  expectClean(messages);
});

test("a label around the checkbox toggles it", async ({ page }) => {
  const messages = captureMessages(page);

  await hydrated(page);
  await page.getByText("Accept the terms").click();
  await expect(page.locator("[data-testid=terms]")).toHaveAttribute("aria-checked", "false");
  expect(await formData(page, "main-form")).not.toContainEqual(["terms", "on"]);
  expectClean(messages);
});
