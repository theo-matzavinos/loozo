import { test, expect } from "./contract-test.js";
import type { Locator, Page, TestInfo } from "playwright/test";
import { bootstrapHeld, fixture } from "./observation.js";
import { expectPreferred } from "./geometry.js";

// CB means section 31. Cases run against the `combobox` fixture. "Open" is `:popover-open` on
// Content with the input's `aria-expanded="true"`; "active" is the input's
// `aria-activedescendant` naming the option, which alone has `data-active`.

function shown(content: Locator): () => Promise<boolean> {
  return () => content.evaluate((node) => node.matches(":popover-open"));
}

async function expectOpen(input: Locator, content: Locator): Promise<void> {
  await expect.poll(shown(content)).toBe(true);
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await expect(content).not.toHaveAttribute("inert", /.*/);
}

async function expectClosed(input: Locator, content: Locator): Promise<void> {
  await expect.poll(shown(content)).toBe(false);
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(input).not.toHaveAttribute("aria-activedescendant", /.*/);
}

/** The input names `option` as its active descendant, and only `option` is marked active. */
async function expectActive(input: Locator, option: Locator, content: Locator): Promise<void> {
  const id = await option.getAttribute("id");

  expect(id).toMatch(/\S/);
  await expect(input).toHaveAttribute("aria-activedescendant", id ?? "");
  await expect(option).toHaveAttribute("data-active", "");
  await expect(content.locator("[data-active]")).toHaveCount(1);
}

async function expectNoneActive(input: Locator, content: Locator): Promise<void> {
  await expect(input).not.toHaveAttribute("aria-activedescendant", /.*/);
  await expect(content.locator("[data-active]")).toHaveCount(0);
}

/** Two animation frames, so a stray write or a scheduled reopen would have rendered. */
async function frames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

/** A script action: a click without the pointer, so no layer sees an outside press. */
async function script(control: Locator): Promise<void> {
  await control.evaluate((node) => (node as HTMLElement).click());
}

/** Selects the input's whole text and deletes it, a trusted edit. */
async function empty(page: Page, input: Locator): Promise<void> {
  await input.focus();
  await input.evaluate((node: HTMLInputElement) => node.select());
  await page.keyboard.press("Backspace");
}

/** Puts the caret at the end of the input's text. */
async function caretAtEnd(input: Locator): Promise<void> {
  await input.focus();
  await input.evaluate((node: HTMLInputElement) =>
    node.setSelectionRange(node.value.length, node.value.length),
  );
}

function countryParts(page: Page) {
  return {
    input: page.getByTestId("country-input"),
    trigger: page.getByTestId("country-trigger"),
    content: page.getByTestId("country-content"),
    option: (code: string) => page.getByTestId(`country-${code}`),
    value: page.getByTestId("country-value"),
    query: page.getByTestId("country-query"),
    open: page.getByTestId("country-open"),
    valueOutputs: page.getByTestId("country-value-outputs"),
    submits: page.getByTestId("country-submits"),
  };
}

/** The Country combobox's server HTML: closed, Greece chosen, its name in the input. */
async function expectServerCountry(page: Page): Promise<void> {
  const { input, trigger, content, option } = countryParts(page);
  const contentId = await content.getAttribute("id");

  expect(contentId).toMatch(/\S/);
  await expect(input).toHaveAttribute("role", "combobox");
  await expect(input).toHaveAttribute("aria-autocomplete", "list");
  await expect(input).toHaveAttribute("autocomplete", "off");
  await expect(input).toHaveAttribute("id", /\S/);
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(input).toHaveAttribute("aria-controls", contentId ?? "");
  await expect(input).toHaveAttribute("value", "Greece");
  await expect(input).not.toHaveAttribute("aria-activedescendant", /.*/);
  await expect(trigger).toHaveAttribute("type", "button");
  await expect(trigger).toHaveAttribute("tabindex", "-1");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toHaveAttribute("aria-controls", contentId ?? "");
  await expect(content).toHaveAttribute("role", "listbox");
  await expect(content).toHaveAttribute("popover", "manual");
  await expect(content).toHaveAttribute("inert", "");
  await expect(content).toHaveAttribute("aria-label", "Country");
  await expect(option("gr")).toHaveAttribute("role", "option");
  await expect(option("gr")).toHaveAttribute("id", /\S/);
  await expect(option("gr")).toHaveAttribute("aria-selected", "true");
  await expect(option("gr")).toHaveAttribute("data-selected", "");
  await expect(option("al")).toHaveAttribute("aria-selected", "false");
  await expect(option("be")).toHaveAttribute("aria-disabled", "true");
  await expect(option("be")).toHaveAttribute("data-disabled", "");
}

test("CB1 H1 H2: the input is a list-autocomplete combobox controlling a listbox, with its query as its value, a template autocomplete winning, and an optional tabindex -1 button; server HTML is closed and hydration keeps it", async ({
  page,
}, info) => {
  const { input, trigger, content, option, value, query, open } = countryParts(page);

  await fixture(page, "combobox", info, async () => {
    await expectServerCountry(page);
    await expect(page.getByTestId("customer-input")).toHaveAttribute("value", "Bianca Rossi");
  });

  await expectServerCountry(page);
  await expect(input).toHaveValue("Greece");
  await expect(value).toHaveText("string:gr");
  await expect(query).toHaveText("Greece");
  await expect(open).toHaveText("false false");
  await expect(page.getByRole("combobox", { name: "Country" })).toHaveAttribute(
    "data-testid",
    "country-input",
  );
  await expect(page.getByTestId("named-own-input")).toHaveAttribute("autocomplete", "on");
  await expect(option("be")).not.toHaveAttribute("data-active", /.*/);

  // Clicking or focusing the input doesn't open the list.
  await input.click();
  await frames(page);
  await expectClosed(input, content);
  await expect(input).toBeFocused();
  await expect(page.getByRole("listbox", { name: "Country" })).toHaveCount(0);

  await page.keyboard.press("ArrowDown");
  await expectOpen(input, content);
  await expect(open).toHaveText("true true");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("listbox", { name: "Country" })).toHaveAttribute(
    "data-testid",
    "country-content",
  );
  await expectActive(input, option("gr"), content);

  // A click on the open input keeps it open.
  await input.click();
  await frames(page);
  await expectOpen(input, content);
  await page.keyboard.press("Escape");
  await expectClosed(input, content);
  await expect(input).toBeFocused();
});

test("CB2: closed, ArrowDown and ArrowUp open on the chosen option, else the first or last enabled one; Alt+ArrowDown opens with nothing active; Enter submits the form natively and Escape does nothing; a disabled Combobox doesn't open and disabling an open one closes it", async ({
  page,
}, info) => {
  await fixture(page, "combobox", info);

  const { input, trigger, content, option, value, query, valueOutputs, submits } =
    countryParts(page);

  for (const key of ["ArrowDown", "ArrowUp"]) {
    await input.focus();
    await page.keyboard.press(key);
    await expectOpen(input, content);
    await expectActive(input, option("gr"), content);
    await page.keyboard.press("Escape");
    await expectClosed(input, content);
  }

  await page.keyboard.press("Alt+ArrowDown");
  await expectOpen(input, content);
  await expectNoneActive(input, content);
  await page.keyboard.press("Escape");
  await expectClosed(input, content);

  // Emptied: every country matches and nothing is chosen.
  await empty(page, input);
  await expect(value).toHaveText("null");
  await page.keyboard.press("Escape");
  await expectClosed(input, content);
  await expect(input).toHaveValue("");
  await page.keyboard.press("ArrowDown");
  await expectActive(input, option("al"), content);
  await page.keyboard.press("Escape");
  await expectClosed(input, content);
  await page.keyboard.press("ArrowUp");
  await expectActive(input, option("zw"), content);
  await page.keyboard.press("Escape");
  await expectClosed(input, content);

  // Closed, Enter is the form's implicit submission and Escape isn't handled.
  await page.keyboard.press("Enter");
  await expect(submits).toHaveText("1");
  await page.keyboard.press("Escape");
  await frames(page);
  await expectClosed(input, content);
  await expect(input).toBeFocused();
  await expect(query).toHaveText("");

  // Modified keys do nothing.
  await page.keyboard.press("Control+ArrowDown");
  await frames(page);
  await expectClosed(input, content);

  await script(page.getByTestId("toggle-country-disabled"));
  await expect(input).toBeDisabled();
  await expect(trigger).toBeDisabled();
  await trigger.click({ force: true });
  await frames(page);
  await expectClosed(input, content);
  await script(page.getByTestId("toggle-country-disabled"));
  await expect(input).toBeEnabled();

  await input.focus();
  await page.keyboard.press("ArrowDown");
  await expectOpen(input, content);
  await script(page.getByTestId("toggle-country-disabled"));
  await expectClosed(input, content);
  await script(page.getByTestId("toggle-country-disabled"));
  await expect(valueOutputs).toHaveText("1");
});

test("CB3: open, arrows move without wrapping and skip disabled options, PageUp/PageDown move ten; Home and End move the caret; Enter chooses the active option, writing its value and label and closing with focus kept, and with nothing active is prevented and does nothing; Alt+ArrowUp, Escape and Tab close without a choice", async ({
  page,
}, info) => {
  await fixture(page, "combobox", info);

  const { input, content, option, value, query, valueOutputs, submits } = countryParts(page);

  await empty(page, input);
  await expectOpen(input, content);
  await expectNoneActive(input, content);
  await page.keyboard.press("ArrowDown");
  await expectActive(input, option("al"), content);

  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press("ArrowDown");
  }

  await expectActive(input, option("at"), content);
  await page.keyboard.press("ArrowDown");
  await expectActive(input, option("br"), content);
  await page.keyboard.press("ArrowUp");
  await expectActive(input, option("at"), content);
  await page.keyboard.press("PageDown");
  await expectActive(input, option("zw"), content);
  await page.keyboard.press("ArrowDown");
  await expectActive(input, option("zw"), content);
  await page.keyboard.press("PageUp");
  await expectActive(input, option("ar"), content);
  await page.keyboard.press("Home");
  await page.keyboard.press("End");
  await expectActive(input, option("ar"), content);

  await page.keyboard.press("Enter");
  await expectClosed(input, content);
  await expect(value).toHaveText("string:ar");
  await expect(query).toHaveText("Argentina");
  await expect(input).toHaveValue("Argentina");
  await expect(input).toBeFocused();
  await expect(submits).toHaveText("0");
  await frames(page);
  expect(await shown(content)()).toBe(false);

  await page.keyboard.press("ArrowDown");
  await expectActive(input, option("ar"), content);
  // Home and End move the caret in nonempty text and leave the list, the text and the active option alone.
  await input.evaluate((element: HTMLInputElement) => element.setSelectionRange(3, 3));
  await page.keyboard.press("Home");
  expect(
    await input.evaluate((element: HTMLInputElement) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([0, 0]);
  await page.keyboard.press("End");
  expect(
    await input.evaluate((element: HTMLInputElement) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([9, 9]);
  await expectOpen(input, content);
  await expectActive(input, option("ar"), content);
  await expect(input).toHaveValue("Argentina");
  await expect(query).toHaveText("Argentina");
  await expect(value).toHaveText("string:ar");
  await page.keyboard.press("Alt+ArrowUp");
  await expectClosed(input, content);
  await expect(input).toHaveValue("Argentina");

  // Typed text opens with nothing active; Enter is prevented and does nothing.
  await caretAtEnd(input);
  await page.keyboard.type("x");
  await expectOpen(input, content);
  await expect(page.getByTestId("country-empty")).toBeVisible();
  await page.keyboard.press("Enter");
  await frames(page);
  await expectOpen(input, content);
  await expect(submits).toHaveText("0");
  await expect(query).toHaveText("Argentinax");
  await expect(value).toHaveText("string:ar");
  await page.keyboard.press("Escape");
  await expectClosed(input, content);
  await expect(input).toHaveValue("Argentina");
  await expect(query).toHaveText("Argentina");

  // Space is text; Tab closes without a choice and moves focus natively, past the button.
  await input.evaluate((node: HTMLInputElement) => node.select());
  await page.keyboard.type("C");
  await expect(content.locator("[role=option]")).toHaveCount(3);
  await page.keyboard.press("ArrowDown");
  await expectActive(input, option("ca"), content);
  await page.keyboard.press(" ");
  await expect(input).toHaveValue("C ");
  await expectNoneActive(input, content);
  await page.keyboard.press("Backspace");
  await expect(input).toHaveValue("C");
  await page.keyboard.press("ArrowDown");
  await expectActive(input, option("ca"), content);
  await page.keyboard.press("Tab");
  await expectClosed(input, content);
  await expect(page.getByTestId("after")).toBeFocused();
  await expect(input).toHaveValue("Argentina");
  await expect(value).toHaveText("string:ar");
  await page.keyboard.press("Shift+Tab");
  await expect(input).toBeFocused();
  // Emptying wrote null, and Enter wrote Argentina.
  await expect(valueOutputs).toHaveText("2");
});

test("CB4: typing writes the query, opens the list with nothing active and keeps the value; every edit clears the active option; emptying the input writes null and commits empty text; an outside query write becomes the committed text and an outside value write leaves the text", async ({
  page,
}, info) => {
  await fixture(page, "combobox", info);

  const { input, content, option, value, query, valueOutputs } = countryParts(page);

  await input.focus();
  await input.evaluate((node: HTMLInputElement) => node.select());
  await page.keyboard.type("a");
  await expectOpen(input, content);
  await expect(query).toHaveText("a");
  await expect(value).toHaveText("string:gr");
  await expect(content.locator("[role=option]")).toHaveCount(7);
  await expectNoneActive(input, content);
  await page.keyboard.type("n");
  await expect(content.locator("[role=option]")).toHaveCount(2);
  await page.keyboard.press("ArrowDown");
  await expectActive(input, option("ad"), content);
  await page.keyboard.type("g");
  await expect(query).toHaveText("ang");
  await expectNoneActive(input, content);
  await expect(option("ao")).toHaveCount(1);

  // Emptying writes null once and opens every option.
  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.press("Backspace");
  }

  await expect(value).toHaveText("null");
  await expect(valueOutputs).toHaveText("1");
  await expect(content.locator("[role=option]")).toHaveCount(16);
  await expectOpen(input, content);
  await page.keyboard.press("Escape");
  await expectClosed(input, content);
  await expect(input).toHaveValue("");
  await expect(query).toHaveText("");

  // A query written from outside shows and is what a close restores.
  await script(page.getByTestId("write-query"));
  await expect(input).toHaveValue("Denmark");
  await expect(value).toHaveText("null");
  await input.focus();
  await caretAtEnd(input);
  await page.keyboard.type("zz");
  await expect(query).toHaveText("Denmarkzz");
  await page.keyboard.press("Escape");
  await expect(input).toHaveValue("Denmark");

  // A value written from outside leaves the text (caveat C1).
  await script(page.getByTestId("write-cyprus"));
  await expect(value).toHaveText("string:cy");
  await expect(option("cy")).toHaveCount(0);
  await expect(input).toHaveValue("Denmark");
  await expect(query).toHaveText("Denmark");
  await expect(valueOutputs).toHaveText("1");

  // A query the consumer writes once from inside queryChange, while the Combobox writes a choice
  // or an emptying, stays the committed text: the close doesn't restore the Combobox's own text.
  const reentry = page.getByTestId("reentry-input");
  const reentryContent = page.getByTestId("reentry-content");
  const reentryValue = page.getByTestId("reentry-value");
  const reentryQuery = page.getByTestId("reentry-query");

  await reentry.focus();
  await page.keyboard.type("C");
  await expectOpen(reentry, reentryContent);
  await page.getByTestId("reentry-cy").click();
  await expectClosed(reentry, reentryContent);
  await expect(reentryValue).toHaveText("string:cy");
  await expect(reentry).toHaveValue("CYPRUS");
  await expect(reentryQuery).toHaveText("CYPRUS");
  await caretAtEnd(reentry);
  await page.keyboard.type("x");
  await expectOpen(reentry, reentryContent);
  await page.keyboard.press("Escape");
  await expectClosed(reentry, reentryContent);
  await expect(reentry).toHaveValue("CYPRUS");

  // A consumer that undoes an edit by writing back the text the input showed before it: the
  // input shows that text again, though the value binding's last write was that same text.
  await caretAtEnd(reentry);
  await page.keyboard.type("!");
  await expectOpen(reentry, reentryContent);
  await expect(reentryQuery).toHaveText("CYPRUS");
  await expect(reentry).toHaveValue("CYPRUS");
  await page.keyboard.press("Escape");
  await expectClosed(reentry, reentryContent);
  await expect(reentry).toHaveValue("CYPRUS");
  await expect(reentryQuery).toHaveText("CYPRUS");

  // The same undo written a microtask after the edit, past the input's own input handler but
  // before the next render.
  await caretAtEnd(reentry);
  await page.keyboard.type("?");
  await expectOpen(reentry, reentryContent);
  await frames(page);
  await expect(reentryQuery).toHaveText("CYPRUS");
  await expect(reentry).toHaveValue("CYPRUS");
  await page.keyboard.press("Escape");
  await expectClosed(reentry, reentryContent);
  await expect(reentry).toHaveValue("CYPRUS");
  await expect(reentryQuery).toHaveText("CYPRUS");
  await empty(page, reentry);
  await expectOpen(reentry, reentryContent);
  await expect(reentryValue).toHaveText("null");
  await expect(reentry).toHaveValue("Any");
  await page.keyboard.press("Escape");
  await expectClosed(reentry, reentryContent);
  await expect(reentry).toHaveValue("Any");
  await expect(reentryQuery).toHaveText("Any");
});

test("CB5: closing without a choice by Escape, Tab, an outside press, Alt+ArrowUp, the button, an open write or disabling restores the committed text and keeps the value, also when the consumer cancels an edit's open before it renders; a click on an option chooses it with focus kept", async ({
  page,
}, info) => {
  await fixture(page, "combobox", info);

  const { input, trigger, content, option, value, query, open, valueOutputs } = countryParts(page);
  const closers: [string, () => Promise<void>][] = [
    ["Escape", () => page.keyboard.press("Escape")],
    ["Tab", () => page.keyboard.press("Tab")],
    [
      "outside press",
      () => page.getByRole("heading", { name: "Customer search", exact: true }).click(),
    ],
    ["Alt+ArrowUp", () => page.keyboard.press("Alt+ArrowUp")],
    ["button", () => trigger.click()],
    ["open write", () => script(page.getByTestId("close-country"))],
    ["disabling", () => script(page.getByTestId("toggle-country-disabled"))],
  ];

  for (const [name, close] of closers) {
    await caretAtEnd(input);
    await page.keyboard.type("zz");
    await expectOpen(input, content);
    await expect(query, name).toHaveText("Greecezz");
    await close();
    await expectClosed(input, content);
    await expect(input, name).toHaveValue("Greece");
    await expect(query, name).toHaveText("Greece");
    await expect(value, name).toHaveText("string:gr");

    if (name === "disabling") {
      await script(page.getByTestId("toggle-country-disabled"));
      await expect(input).toBeEnabled();
    }
  }

  // The consumer cancels the open an edit makes before the list renders open, so no effect ever
  // sees it open: from `openChange` itself, then a microtask later.
  for (const veto of ["veto-open", "veto-open-later"]) {
    await script(page.getByTestId(veto));
    await caretAtEnd(input);
    await page.keyboard.type("x");
    await expectClosed(input, content);
    await expect(open, veto).toHaveText("false false");
    await expect(input, veto).toHaveValue("Greece");
    await expect(query, veto).toHaveText("Greece");
    await expect(value, veto).toHaveText("string:gr");
  }

  await script(page.getByTestId("allow-open"));
  await input.focus();
  await page.keyboard.press("ArrowDown");
  await expectOpen(input, content);
  await option("cy").click();
  await expectClosed(input, content);
  await expect(value).toHaveText("string:cy");
  await expect(query).toHaveText("Cyprus");
  await expect(input).toHaveValue("Cyprus");
  await expect(input).toBeFocused();
  await expect(valueOutputs).toHaveText("1");
});

test("CB6: the button toggles the list, highlights nothing and keeps focus in the input, also from elsewhere; a press inside the list keeps focus; the pointer highlights enabled options without scrolling; disabled options ignore it; an outside click closes", async ({
  page,
}, info) => {
  await fixture(page, "combobox", info);

  const { input, trigger, content, option, value, query } = countryParts(page);

  await page.getByTestId("after").focus();
  await trigger.click();
  await expectOpen(input, content);
  await expect(input).toBeFocused();
  await expectNoneActive(input, content);
  await trigger.click();
  await expectClosed(input, content);
  await expect(input).toBeFocused();

  await trigger.hover();
  await page.mouse.down();
  await expect(input).toBeFocused();
  await page.mouse.up();
  await expectOpen(input, content);
  await expect(input).toBeFocused();

  await page.getByTestId("country-padding").click();
  await frames(page);
  await expectOpen(input, content);
  await expect(input).toBeFocused();

  const scrollTop = await content.evaluate((node) => node.scrollTop);

  await option("br").hover();
  await expectActive(input, option("br"), content);
  await option("be").hover();
  await expectActive(input, option("br"), content);
  expect(await content.evaluate((node) => node.scrollTop)).toBe(scrollTop);
  await option("be").click({ force: true });
  await frames(page);
  await expectOpen(input, content);
  await expect(value).toHaveText("string:gr");

  await option("br").click();
  await expectClosed(input, content);
  await expect(value).toHaveText("string:br");
  await expect(query).toHaveText("Brazil");
  await expect(input).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expectOpen(input, content);
  await page.getByRole("heading", { name: "Country", exact: true }).click();
  await expectClosed(input, content);
  await expect(value).toHaveText("string:br");
});

test("CB7: keys reveal the active option in a capped list of 111 by scrolling the list, never the page", async ({
  page,
}, info) => {
  await fixture(page, "combobox", info);

  const input = page.getByTestId("long-input");
  const content = page.getByTestId("long-content");
  const option = (item: number) => page.getByTestId(`long-${item}`);

  await input.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 40));

  const scrollY = await page.evaluate(() => window.scrollY);
  const visible = (item: number) =>
    page.evaluate(
      ([list, target]) => {
        const box = document.querySelector<HTMLElement>(`[data-testid="${list}"]`);
        const node = document.querySelector<HTMLElement>(`[data-testid="${target}"]`);

        if (box === null || node === null) {
          return false;
        }

        const outer = box.getBoundingClientRect();
        const inner = node.getBoundingClientRect();

        return inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
      },
      ["long-content", `long-${item}`],
    );

  await input.evaluate((node) => node.focus({ preventScroll: true }));
  await page.keyboard.press("ArrowDown");
  await expectOpen(input, content);
  await expectActive(input, option(80), content);
  await expect.poll(() => visible(80)).toBe(true);

  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press("ArrowDown");
  }

  await expectActive(input, option(92), content);
  await expect.poll(() => visible(92)).toBe(true);
  await page.keyboard.press("PageUp");
  await page.keyboard.press("PageUp");
  await page.keyboard.press("PageUp");
  await page.keyboard.press("PageUp");
  await expectActive(input, option(52), content);
  await expect.poll(() => visible(52)).toBe(true);
  await page.keyboard.press("PageDown");
  await expectActive(input, option(62), content);
  await expect.poll(() => visible(62)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  await page.keyboard.press("Escape");
  await expectClosed(input, content);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test("CB8: server-search results never highlight by themselves; Enter with nothing highlighted does nothing; an active option that unmounts stops being active; a rich option chooses its label", async ({
  page,
}, info) => {
  await fixture(page, "combobox", info);

  const input = page.getByTestId("customer-input");
  const content = page.getByTestId("customer-content");
  const option = (id: number) => page.getByTestId(`customer-${id}`);
  const value = page.getByTestId("customer-value");
  const query = page.getByTestId("customer-query");
  const searches = page.getByTestId("customer-searches");

  await expect(input).toHaveValue("Bianca Rossi");
  await expect(content.locator("[role=option]")).toHaveCount(1);
  await input.focus();
  await page.keyboard.press("ArrowDown");
  await expectOpen(input, content);
  await expectActive(input, option(2), content);

  /** Types `key` and waits for its search's results, which arrive after a task as new elements. */
  async function search(key: string): Promise<void> {
    const count = Number(await searches.textContent());

    await page.keyboard.type(key);
    await expect(searches).toHaveText(String(count + 1));
  }

  await input.evaluate((node: HTMLInputElement) => node.select());
  await search("b");
  await expect(content.locator("[role=option]")).toHaveCount(2);
  await expectNoneActive(input, content);
  await page.keyboard.press("ArrowDown");
  await expectActive(input, option(2), content);
  await search("i");
  await expectNoneActive(input, content);
  await expect(content.locator("[role=option]")).toHaveCount(2);
  await page.keyboard.press("Enter");
  await frames(page);
  await expectOpen(input, content);
  await expect(value).toHaveText("number:2");
  await expect(query).toHaveText("bi");

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expectActive(input, option(3), content);

  // The same results as new records: the active option unmounts, and its replacement isn't active.
  const before = await searches.textContent();

  await script(page.getByTestId("customer-refresh"));
  await expect(option(3)).toHaveCount(1);
  await expectNoneActive(input, content);
  await expect(searches).toHaveText(before ?? "");
  await expectOpen(input, content);

  await page.keyboard.press("ArrowDown");
  await expectActive(input, option(2), content);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expectClosed(input, content);
  await expect(value).toHaveText("number:3");
  await expect(query).toHaveText("Bilal Haddad");
  await expect(input).toHaveValue("Bilal Haddad");
});

test("CB9: in a Dialog and in Popover Content, the first Escape and a press inside the parent close only the list, Escape with focus kept in the input and the press with focus where the browser puts it, and choosing keeps the parent open", async ({
  page,
}, info) => {
  await fixture(page, "combobox", info);

  const cases = [
    {
      open: () => page.getByTestId("dialog-trigger").click(),
      parent: page.getByTestId("dialog-content"),
      parentOpen: page.getByTestId("dialog-open"),
      inside: page.getByTestId("dialog-inside"),
      input: page.getByTestId("dialog-input"),
      list: page.getByTestId("dialog-list"),
      option: page.getByTestId("dialog-cy"),
      value: page.getByTestId("dialog-value"),
    },
    {
      open: () => page.getByTestId("popover-trigger").click(),
      parent: page.getByTestId("popover-content"),
      parentOpen: page.getByTestId("popover-open"),
      inside: page.getByTestId("popover-inside"),
      input: page.getByTestId("popover-input"),
      list: page.getByTestId("popover-list"),
      option: page.getByTestId("popover-cy"),
      value: page.getByTestId("popover-value"),
    },
  ];

  for (const nested of cases) {
    // Room below for the list, so it never covers the parent's text.
    await page
      .getByTestId(nested === cases[0] ? "dialog-trigger" : "popover-trigger")
      .evaluate((node) => node.scrollIntoView({ block: "start" }));
    await nested.open();
    await expect(nested.parentOpen).toHaveText("true");
    await nested.input.focus();
    await page.keyboard.press("ArrowDown");
    await expectOpen(nested.input, nested.list);
    await page.keyboard.press("Escape");
    await expectClosed(nested.input, nested.list);
    await expect(nested.input).toBeFocused();
    await expect(nested.parentOpen).toHaveText("true");

    await page.keyboard.press("ArrowDown");
    await expectOpen(nested.input, nested.list);
    // Popover's outside rule closes the list; the text isn't focusable, so focus leaves the input.
    await nested.inside.click();
    await expectClosed(nested.input, nested.list);
    await expect(nested.parentOpen).toHaveText("true");
    await expect(nested.input).not.toBeFocused();

    await nested.input.focus();
    await page.keyboard.type("C");
    await expectOpen(nested.input, nested.list);
    await nested.option.click();
    await expectClosed(nested.input, nested.list);
    await expect(nested.value).toHaveText("string:cy");
    await expect(nested.input).toHaveValue("Cyprus");
    await expect(nested.parentOpen).toHaveText("true");
    await expect(nested.input).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(nested.parentOpen).toHaveText("false");
  }
});

test("CB10: with [formField] the Field's label for names and focuses the input; its Description then Error describe it; required and invalid reach it; choosing writes a number without touching; leaving touches; readonly opens and browses but never writes; disabled; focusBoundControl(); an external value write keeps the text", async ({
  page,
}, info) => {
  await fixture(page, "combobox", info);

  const input = page.getByTestId("planet-input");
  const content = page.getByTestId("planet-content");
  const label = page.getByTestId("planet-label");
  const state = page.getByTestId("planet-state");
  const option = (id: number) => page.getByTestId(`planet-${id}`);
  const inputId = await input.getAttribute("id");
  const labelId = await label.getAttribute("id");

  await expect(label).toHaveAttribute("for", inputId ?? "");
  await expect(page.getByRole("combobox", { name: "Planet", exact: true })).toHaveAttribute(
    "data-testid",
    "planet-input",
  );
  await expect(input).toHaveAttribute(
    "aria-describedby",
    (await page.getByTestId("planet-description").getAttribute("id")) ?? "",
  );
  await expect(input).toHaveAttribute("aria-required", "true");
  await expect(input).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(input).not.toHaveAttribute("aria-labelledby", /.*/);
  await expect(content).toHaveAttribute("aria-labelledby", labelId ?? "");
  await expect(state).toHaveText("null||false|false");

  await label.click();
  await expect(input).toBeFocused();
  await page.keyboard.type("m");
  await expectOpen(input, content);
  await expect(content.locator("[role=option]")).toHaveCount(2);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expectActive(input, option(4), content);
  await page.keyboard.press("Enter");
  await expectClosed(input, content);
  await expect(state).toHaveText("number:4|Mars|false|true");
  await expect(page.getByRole("combobox", { name: "Planet", exact: true })).toHaveValue("Mars");
  await page.keyboard.press("Tab");
  await expect(state).toHaveText("number:4|Mars|true|true");

  // Emptied: null, and the Field shows the required error.
  await empty(page, input);
  await page.keyboard.press("Escape");
  await script(page.getByTestId("planet-submit"));
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveAttribute(
    "aria-describedby",
    `${await page.getByTestId("planet-description").getAttribute("id")} ${await page.getByTestId("planet-error").getAttribute("id")}`,
  );

  await script(page.getByTestId("planet-write"));
  await expect(state).toHaveText("number:4||true|true");
  await expect(input).toHaveValue("");
  await expect(input).not.toHaveAttribute("aria-invalid", /.*/);

  await script(page.getByTestId("planet-readonly"));
  await expect(input).toHaveJSProperty("readOnly", true);
  await input.focus();
  await page.keyboard.type("v");
  await expect(input).toHaveValue("");
  await page.keyboard.press("ArrowDown");
  await expectOpen(input, content);
  await expectActive(input, option(4), content);
  await page.keyboard.press("ArrowUp");
  await expectActive(input, option(3), content);
  await page.keyboard.press("Enter");
  await frames(page);
  await expectOpen(input, content);
  await option(1).click();
  await frames(page);
  await expectOpen(input, content);
  // Signal Forms reports a readonly field neither touched nor dirty; the value and text stay.
  await expect(state).toHaveText(/^number:4\|\|/);
  await page.keyboard.press("Escape");
  await expectClosed(input, content);
  await script(page.getByTestId("planet-readonly"));
  await expect(input).toHaveJSProperty("readOnly", false);

  await script(page.getByTestId("planet-disabled"));
  await expect(input).toBeDisabled();
  await expect(page.getByTestId("planet-field")).toHaveAttribute("data-disabled", "");
  await script(page.getByTestId("planet-disabled"));
  await expect(input).toBeEnabled();

  await page.getByTestId("planet-after").focus();
  await script(page.getByTestId("planet-focus"));
  await expect(input).toBeFocused();
  await script(page.getByTestId("planet-reset"));
  await expect(state).toHaveText("null||false|false");

  // A consumer component composing the root through hostDirectives is the bound control.
  const wrapped = page.getByTestId("wrapped-input");
  const wrappedState = page.getByTestId("wrapped-state");

  await expect(page.getByRole("combobox", { name: "Wrapped planet" })).toHaveAttribute(
    "data-testid",
    "wrapped-input",
  );
  // The form's submit() above touched it already.
  await wrapped.focus();
  await page.keyboard.type("e");
  await expect(page.getByTestId("wrapped-content").locator("[role=option]")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(wrappedState).toHaveText("number:3|Earth|true");
  await page.getByTestId("planet-after").focus();
  await script(page.getByTestId("wrapped-focus"));
  await expect(wrapped).toBeFocused();
});

test("CB11: outside a Field the list takes the input's static aria-label or aria-labelledby; its own static aria-label wins over the input's aria-label; the input's aria-labelledby wins over its own aria-labelledby and names it over its own aria-label; a bound input aria-label isn't copied", async ({
  page,
}, info) => {
  await fixture(page, "combobox", info);

  const own = page.getByTestId("named-own-content");
  const heading = page.getByTestId("named-heading-content");
  const bound = page.getByTestId("named-bound-content");

  await expect(page.getByTestId("country-content")).toHaveAttribute("aria-label", "Country");
  await expect(page.getByTestId("country-content")).not.toHaveAttribute("aria-labelledby", /.*/);
  await expect(own).toHaveAttribute("aria-label", "Own name");
  await expect(heading).toHaveAttribute("aria-labelledby", "named-heading");
  await expect(heading).not.toHaveAttribute("aria-label", /.*/);
  await expect(page.getByRole("combobox", { name: "Heading name" })).toHaveAttribute(
    "data-testid",
    "named-heading-input",
  );
  await expect(page.getByTestId("named-bound-input")).toHaveAttribute("aria-label", "Bound name");
  await expect(bound).not.toHaveAttribute("aria-label", /.*/);
  await expect(bound).not.toHaveAttribute("aria-labelledby", /.*/);

  // Select's rule: the input's aria-labelledby wins over the list's own.
  const both = page.getByTestId("named-both-content");
  const mixed = page.getByTestId("named-mixed-content");

  await expect(both).toHaveAttribute("aria-labelledby", "named-input-heading");
  await expect(both).not.toHaveAttribute("aria-label", /.*/);
  // The list's own aria-label stays beside the input's aria-labelledby, which names it.
  await expect(mixed).toHaveAttribute("aria-labelledby", "named-input-heading");
  await expect(mixed).toHaveAttribute("aria-label", "Own name");

  for (const [input, content] of [
    [page.getByTestId("named-both-input"), both],
    [page.getByTestId("named-mixed-input"), mixed],
  ] as const) {
    await input.focus();
    await page.keyboard.press("ArrowDown");
    await expectOpen(input, content);
    await expect(content).toHaveAccessibleName("Input heading");
    await page.keyboard.press("Escape");
    await expectClosed(input, content);
  }
});

for (const name of ["combobox-factory", "combobox-existing"]) {
  test(`CB12 O1 O3: ${name.replace("combobox-", "")} replacements of every host-composed part drive value, query, open, disabled, IDs and placement over the composed parts' contradicting own inputs, and the unused models emit nothing`, async ({
    page,
  }, info) => {
    await fixture(page, "combobox", info);

    const co = (role: string) => page.locator(`[data-case="${name}"] [data-co="${role}"]`);
    const input = co("input");
    const trigger = co("trigger");
    const content = co("content");

    await expect(co("value")).toHaveText("number:2");
    await expect(co("query")).toHaveText("Two");
    await expect(input).toHaveValue("Two");
    await expect(co("open")).toHaveText("false false");
    await expect(co("disabled")).toHaveText("true");
    expect(await shown(content)()).toBe(false);
    await expect(input).toBeDisabled();
    await expect(trigger).toBeDisabled();
    await expect(input).toHaveAttribute("id", `${name}-input`);
    await expect(trigger).toHaveAttribute("id", `${name}-trigger`);
    await expect(content).toHaveAttribute("id", `${name}-content`);
    await expect(input).toHaveAttribute("aria-controls", `${name}-content`);
    await expect(trigger).toHaveAttribute("aria-controls", `${name}-content`);

    for (const code of [1, 2, 3]) {
      await expect(co(`option-${code}`)).toHaveAttribute("id", `${name}-option-${code}`);
    }

    await expect(co("option-2")).toHaveAttribute("aria-selected", "true");
    await expect(co("option-1")).not.toHaveAttribute("aria-disabled", /.*/);
    await expect(co("option-3")).toHaveAttribute("aria-disabled", "true");

    await co("enable").click();
    await expect(input).toBeEnabled();
    await input.evaluate((node) => node.scrollIntoView({ block: "center", inline: "center" }));
    await input.focus();
    await page.keyboard.press("ArrowDown");
    await expect(co("open")).toHaveText("true true");
    await expectOpen(input, content);
    await expectActive(input, co("option-2"), content);
    await expectPreferred(page, "inline-end", "center", 11, {
      anchor: `${name}-input`,
      content: `${name}-content`,
    });
    await page.keyboard.press("ArrowDown");
    await expectActive(input, co("option-2"), content);
    await page.keyboard.press("ArrowUp");
    await expectActive(input, co("option-1"), content);
    await page.keyboard.press("Enter");
    await expectClosed(input, content);
    await expect(co("value")).toHaveText("number:1");
    await expect(co("query")).toHaveText("One");
    await expect(input).toHaveValue("One");
    await expect(co("open")).toHaveText("false false");

    await trigger.click();
    await expectOpen(input, content);
    await co("option-3").click({ force: true });
    await frames(page);
    await expect(co("value")).toHaveText("number:1");
    await co("option-2").click();
    await expectClosed(input, content);
    await expect(co("value")).toHaveText("number:2");
    await expect(input).toBeFocused();

    await co("ids").click();
    await expect(input).toHaveAttribute("id", `${name}-input-changed`);
    await expect(trigger).toHaveAttribute("id", `${name}-trigger-changed`);
    await expect(input).toHaveAttribute("aria-controls", `${name}-content-changed`);
    await expect(co("unused-outputs")).toHaveText("0");
  });
}

test("CB13: an IME composition suspends the keys and choosing, and holds the input's text until it ends; Chromium's composition commits its text once", async ({
  page,
  browserName,
}, info) => {
  await fixture(page, "combobox", info);

  const { input, content, option, value, query } = countryParts(page);

  await input.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expectActive(input, option("zw"), content);
  await input.evaluate((node) =>
    node.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" })),
  );
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp");
  await frames(page);
  await expectOpen(input, content);
  await expectActive(input, option("zw"), content);
  await expect(value).toHaveText("string:gr");
  // The pointer still highlights; the click's choice is dropped.
  await option("cy").click();
  await frames(page);
  await expectOpen(input, content);
  await expectActive(input, option("cy"), content);
  await expect(value).toHaveText("string:gr");
  await input.evaluate((node) =>
    node.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "" })),
  );
  await page.keyboard.press("ArrowUp");
  await expectActive(input, option("cl"), content);
  await page.keyboard.press("Escape");
  await expectClosed(input, content);

  if (browserName === "chromium") {
    const cdp = await page.context().newCDPSession(page);

    await caretAtEnd(input);
    await cdp.send("Input.imeSetComposition", {
      text: "愛",
      selectionStart: 1,
      selectionEnd: 1,
    });
    await expect(input).toHaveValue("Greece愛");
    await expectOpen(input, content);

    // A query written while composing waits for the composition to end.
    await script(page.getByTestId("write-query"));
    await expect(query).toHaveText("Denmark");
    await frames(page);
    await expect(input).toHaveValue("Greece愛");
    // The commit's last input event writes its text after the held write.
    await cdp.send("Input.insertText", { text: "愛" });
    await frames(page);
    await expect(input).toHaveValue("Greece愛");
    await expect(query).toHaveText("Greece愛");

    // A consumer that undoes the composition's last change by writing back the text the input
    // showed, and rendered, during the composition: once it ends, the input shows that text.
    const reentry = page.getByTestId("reentry-input");
    const reentryQuery = page.getByTestId("reentry-query");

    await reentry.focus();
    await page.keyboard.type("Cy");
    await expect(reentryQuery).toHaveText("Cy");
    await cdp.send("Input.imeSetComposition", {
      text: "a",
      selectionStart: 1,
      selectionEnd: 1,
    });
    await expect(reentryQuery).toHaveText("Cya");
    await frames(page);
    await cdp.send("Input.imeSetComposition", {
      text: "a!",
      selectionStart: 2,
      selectionEnd: 2,
    });
    await expect(reentry).toHaveValue("Cya!");
    await cdp.send("Input.insertText", { text: "a!" });
    await frames(page);
    await expect(reentryQuery).toHaveText("Cya");
    await expect(reentry).toHaveValue("Cya");
    await cdp.detach();
  }
});

test("CB14 H1 H3: text typed into the server's input before the application hydrates is kept as the query: in the input, in the query model and in the replayed input event; the value and the committed text don't change", async ({
  page,
}, info) => {
  const input = page.getByTestId("customer-input");
  const query = page.getByTestId("customer-query");
  const value = page.getByTestId("customer-value");
  const content = page.getByTestId("customer-content");
  const release = await bootstrapHeld(page, "/combobox", info);

  try {
    await expect(input).toHaveValue("Bianca Rossi");
    await caretAtEnd(input);
    await page.keyboard.type(" xyz");
    await expect(input).toHaveValue("Bianca Rossi xyz");
  } finally {
    release();
  }

  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  // Typing is the incremental block's hydration trigger; its replayed input sees the draft.
  await expect(query).toHaveText("Bianca Rossi xyz");
  await expect(input).toHaveValue("Bianca Rossi xyz");
  await expect(value).toHaveText("number:2");
  await expect(input).toBeFocused();
  // Adoption alone doesn't open: the replayed input events did, with no live key yet.
  await expectOpen(input, content);

  // The draft isn't committed: closing without a choice restores the server's text.
  await page.keyboard.press("Escape");
  await expectClosed(input, content);
  await expect(input).toHaveValue("Bianca Rossi");
  await expect(query).toHaveText("Bianca Rossi");
});

test("CB15 H2 H3: under incremental hydration, text typed into a dehydrated block while its genuine deferred dependency is held is kept once the block hydrates", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const input = page.getByTestId("customer-input");
  const query = page.getByTestId("customer-query");
  const value = page.getByTestId("customer-value");
  const content = page.getByTestId("customer-content");
  const release = await bootstrapHeld(page, "/combobox", info);

  release();
  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");

  let releaseLazy = () => {};
  const requests: string[] = [];

  if (incremental) {
    const gate = new Promise<void>((resolve) => {
      releaseLazy = resolve;
    });

    await page.route("**/*", async (route) => {
      if (route.request().resourceType() !== "script") {
        await route.fallback();

        return;
      }

      const response = await route.fetch();
      const text = await response.text();

      if (text.includes("data-combobox-fixture-chunk")) {
        requests.push(route.request().url());
        await gate;
      }

      await route.fulfill({ response });
    });
  }

  try {
    // Focus isn't a hydration trigger; the first key is.
    await caretAtEnd(input);
    await page.keyboard.type(" xyz");

    if (incremental) {
      await expect.poll(() => requests.length).toBeGreaterThan(0);
      await page.keyboard.type(" abc");
      await expect(query).toHaveText("Bianca Rossi");
      await expect(input).toHaveValue("Bianca Rossi xyz abc");
    } else {
      await page.keyboard.type(" abc");
    }
  } finally {
    releaseLazy();
  }

  await expect(query).toHaveText("Bianca Rossi xyz abc");
  await expect(input).toHaveValue("Bianca Rossi xyz abc");
  await expect(value).toHaveText("number:2");

  if (incremental) {
    // The replayed input events opened it, with no live key since.
    await expectOpen(input, content);
  } else {
    // Eager typing lands before or after the input's ngOnInit: adopted (closed) or typed (open).
    await page.keyboard.press("ArrowDown");
    await expectOpen(input, content);
  }

  // The draft isn't committed: closing without a choice restores the server's text.
  await page.keyboard.press("Escape");
  await expectClosed(input, content);
  await expect(input).toHaveValue("Bianca Rossi");
  await expect(query).toHaveText("Bianca Rossi");
  await expect(value).toHaveText("number:2");
});

/**
 * Dispatches an edit appending " x" to the customer input when Angular attaches its `input`
 * listener, in its creation pass, before the update pass sets the root's inputs and runs the
 * input's ngOnInit, then bootstraps the held page and waits for the shell to attach.
 */
async function draftBeforeInit(page: Page, info: TestInfo): Promise<void> {
  await page.addInitScript(() => {
    const add = EventTarget.prototype.addEventListener;
    const marked = window as unknown as { cb18Dispatched?: boolean };

    EventTarget.prototype.addEventListener = function (
      this: EventTarget,
      ...args: Parameters<EventTarget["addEventListener"]>
    ): void {
      add.apply(this, args);

      if (
        args[0] === "input" &&
        marked.cb18Dispatched === undefined &&
        this instanceof HTMLInputElement &&
        this.dataset["testid"] === "customer-input"
      ) {
        marked.cb18Dispatched = true;
        this.value = `${this.value} x`;
        this.dispatchEvent(
          new InputEvent("input", { bubbles: true, inputType: "insertText", data: "x" }),
        );
      }
    };
  });

  const release = await bootstrapHeld(page, "/combobox", info);

  release();
  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
}

test("CB18 H3: an input event between the input's creation and its ngOnInit, before Angular set the root's inputs, is adopted as a draft: not committed, nothing opened, the consumer's query binding kept", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const input = page.getByTestId("customer-input");
  const query = page.getByTestId("customer-query");
  const value = page.getByTestId("customer-value");
  const content = page.getByTestId("customer-content");

  await draftBeforeInit(page, info);

  if (incremental) {
    // The block's listeners attach when it hydrates, which a key triggers; ArrowDown replays and opens.
    await expect(query).toHaveText("Bianca Rossi");
    await input.focus();
    await page.keyboard.press("ArrowDown");
  } else {
    await expect(query).toHaveText("Bianca Rossi x");
    // Adoption doesn't open.
    await expectClosed(input, content);
    await input.focus();
    await page.keyboard.press("ArrowDown");
  }

  await expectOpen(input, content);
  await expect
    .poll(() => page.evaluate(() => (window as { cb18Dispatched?: boolean }).cb18Dispatched))
    .toBe(true);
  await expect(input).toHaveValue("Bianca Rossi x");
  await expect(query).toHaveText("Bianca Rossi x");
  await expect(value).toHaveText("number:2");

  // The draft isn't committed: closing restores the consumer's original query.
  await page.keyboard.press("Escape");
  await expectClosed(input, content);
  await expect(input).toHaveValue("Bianca Rossi");
  await expect(query).toHaveText("Bianca Rossi");
  await expect(value).toHaveText("number:2");
});

for (const leave of ["Tab", "a cancelled Trigger click"]) {
  test(`CB19 H3: a close leaving the adopted draft, by ${leave}, restores the committed text`, async ({
    page,
  }, info) => {
    const incremental = info.project.metadata.hydration === "incremental";
    const input = page.getByTestId("customer-input");
    const query = page.getByTestId("customer-query");
    const value = page.getByTestId("customer-value");
    const content = page.getByTestId("customer-content");

    await draftBeforeInit(page, info);

    if (incremental) {
      // The draft is adopted only when ArrowDown hydrates the block, whose replay opens the list.
      await input.focus();
      await page.keyboard.press("ArrowDown");
      await expectOpen(input, content);
    } else {
      // Adopted with the list closed: no session is pending.
      await input.focus();
      await expectClosed(input, content);
    }

    await expect(query).toHaveText("Bianca Rossi x");

    if (leave === "Tab") {
      // Focus moves to another element.
      await page.keyboard.press("Tab");
      await expect(input).not.toBeFocused();
    } else {
      // Under eager hydration the consumer cancels the Trigger's open from openChange, so no
      // effect sees it open; under incremental hydration the click closes the open list.
      await script(page.getByTestId("veto-open"));
      await page.getByTestId("customer-trigger").click();
      await expect(input).toBeFocused();
    }

    await frames(page);
    await expectClosed(input, content);
    await expect(input).toHaveValue("Bianca Rossi");
    await expect(query).toHaveText("Bianca Rossi");
    await expect(value).toHaveText("number:2");
  });
}

test("CB20: an opening key whose open the consumer cancels, from openChange or a microtask later, leaves nothing active and nothing to scroll to: the next Trigger open highlights nothing and Enter does nothing", async ({
  page,
}, info) => {
  await fixture(page, "combobox", info);

  const input = page.getByTestId("long-input");
  const trigger = page.getByTestId("long-trigger");
  const content = page.getByTestId("long-content");
  const value = page.getByTestId("long-value");

  for (const veto of ["veto-open", "veto-open-later"]) {
    await script(page.getByTestId(veto));
    await input.focus();
    await page.keyboard.press("ArrowDown");
    await frames(page);
    await expectClosed(input, content);
    await script(page.getByTestId("allow-open"));
    await trigger.click();
    await expectOpen(input, content);
    await expect(input).toBeFocused();
    await frames(page);
    await expectNoneActive(input, content);
    expect(await content.evaluate((node) => node.scrollTop), veto).toBe(0);
    await page.keyboard.press("Enter");
    await frames(page);
    await expectOpen(input, content);
    await expectNoneActive(input, content);
    await expect(value, veto).toHaveText("number:80");
    await page.keyboard.press("Escape");
    await expectClosed(input, content);
  }
});

test("CB21 C5: an input whose view an earlier consumer hook destroys before its ngOnInit initializes nothing and writes nothing; a replacement under the same root registers and works", async ({
  page,
}, info) => {
  await fixture(page, "combobox", info);

  const content = page.getByTestId("unregistered-input-content");
  const outputs = page.getByTestId("unregistered-input-outputs");

  await script(page.getByTestId("unregistered-input-mount"));
  await frames(page);
  // The view cleared itself during initialization: no input from it is in the document, and the
  // root wrote and emitted nothing. The contract fixture fails the case on NG0911 or any error.
  await expect(page.getByTestId("unregistered-input-gone")).toHaveCount(0);
  await expect(page.getByTestId("unregistered-input-query")).toHaveText("");
  await expect(outputs).toHaveText("0 0 0");
  expect(await content.evaluate((node) => node.matches(":popover-open"))).toBe(false);

  await script(page.getByTestId("unregistered-input-remount"));

  // The replacement is the root's input: it controls the list, opens it and chooses.
  const input = page.getByTestId("unregistered-input-kept");
  const id = await content.getAttribute("id");

  expect(id).not.toBeNull();
  await expect(input).toHaveAttribute("aria-controls", id ?? "");
  await input.focus();
  await page.keyboard.press("ArrowDown");
  await expectOpen(input, content);
  await expectActive(input, page.getByTestId("unregistered-input-a"), content);
  await page.keyboard.press("Enter");
  await expectClosed(input, content);
  await expect(input).toHaveValue("Alpha");
  await expect(page.getByTestId("unregistered-input-value")).toHaveText("a");
  await expect(page.getByTestId("unregistered-input-query")).toHaveText("Alpha");
  await expect(outputs).toHaveText("1 1 2");
});

test("CB17: focus moving to another element touches and closes without a choice; focus falling to nothing, as a script blur() or another window, touches and keeps the list open with its text", async ({
  page,
}, info) => {
  await fixture(page, "combobox", info);

  const { input, content, value, query } = countryParts(page);
  const touches = page.getByTestId("country-touches");

  await caretAtEnd(input);
  await page.keyboard.type("zz");
  await expectOpen(input, content);
  await input.evaluate((node) => (node as HTMLElement).blur());
  await expect(touches).toHaveText("1");
  await frames(page);
  await expectOpen(input, content);
  await expect(input).toHaveValue("Greecezz");
  await expect(query).toHaveText("Greecezz");

  // Back in the input, Tab closes, reverts and touches.
  await input.focus();
  await page.keyboard.press("Tab");
  await expectClosed(input, content);
  await expect(input).toHaveValue("Greece");
  await expect(touches).toHaveText("2");

  // Script focus of another element closes like Tab.
  await caretAtEnd(input);
  await page.keyboard.type("zz");
  await expectOpen(input, content);
  await page.getByTestId("after").evaluate((node) => (node as HTMLElement).focus());
  await expectClosed(input, content);
  await expect(input).toHaveValue("Greece");
  await expect(query).toHaveText("Greece");
  await expect(touches).toHaveText("3");
  await expect(value).toHaveText("string:gr");
});
