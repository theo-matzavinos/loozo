import { test, expect } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import { fixture } from "./observation.js";
import { expectPreferred } from "./geometry.js";

// Z means section 23. Cases run against the `select` fixture; Z8's replay runs in hydration.spec.ts.

function shown(content: Locator): () => Promise<boolean> {
  return () => content.evaluate((node) => node.matches(":popover-open"));
}

async function expectOpen(trigger: Locator, content: Locator): Promise<void> {
  await expect.poll(shown(content)).toBe(true);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(content).not.toHaveAttribute("inert", /.*/);
}

async function expectClosed(trigger: Locator, content: Locator): Promise<void> {
  await expect.poll(shown(content)).toBe(false);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).not.toHaveAttribute("aria-activedescendant", /.*/);
}

/** The Trigger names `option` as its active descendant, and only `option` is marked active. */
async function expectActive(trigger: Locator, option: Locator, content: Locator): Promise<void> {
  const id = await option.getAttribute("id");

  expect(id).toMatch(/\S/);
  await expect(trigger).toHaveAttribute("aria-activedescendant", id ?? "");
  await expect(option).toHaveAttribute("data-active", "");
  await expect(content.locator("[data-active]")).toHaveCount(1);
}

/** Two animation frames, so a stray click or a scheduled reopen would have rendered. */
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

function fruitParts(page: Page) {
  return {
    trigger: page.getByTestId("fruit-trigger"),
    content: page.getByTestId("fruit-content"),
    option: (value: string) => page.getByTestId(`fruit-${value}`),
    value: page.getByTestId("fruit-value"),
    outputs: page.getByTestId("fruit-outputs"),
    open: page.getByTestId("fruit-open"),
  };
}

test("Z1: the Trigger is a combobox button controlling a listbox of options; aria-activedescendant names the active option only while the list is open and only while that option is mounted", async ({
  page,
}, info) => {
  await fixture(page, "select", info);

  const { trigger, content, option, open } = fruitParts(page);

  await expect(trigger).toHaveAttribute("role", "combobox");
  await expect(trigger).toHaveAttribute("type", "button");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toHaveAttribute("aria-controls", (await content.getAttribute("id")) ?? "");
  await expect(trigger).not.toHaveAttribute("aria-activedescendant", /.*/);
  await expect(trigger).not.toHaveAttribute("data-placeholder", /.*/);
  await expect(trigger).toHaveText("Banana");
  await expect(page.getByRole("combobox", { name: "Fruit" })).toHaveAttribute(
    "data-testid",
    "fruit-trigger",
  );
  await expect(content).toHaveAttribute("role", "listbox");
  await expect(content).toHaveAttribute("popover", "manual");
  await expect(content).toHaveAttribute("inert", "");
  await expect(content).toHaveAttribute("id", /\S/);
  await expect(option("banana")).toHaveAttribute("role", "option");
  await expect(option("banana")).toHaveAttribute("aria-selected", "true");
  await expect(option("banana")).toHaveAttribute("data-selected", "");
  await expect(option("banana")).toHaveAttribute("id", /\S/);
  await expect(option("apple")).toHaveAttribute("aria-selected", "false");
  await expect(option("apple")).not.toHaveAttribute("data-selected", /.*/);
  await expect(option("apple")).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(option("cherry")).toHaveAttribute("aria-disabled", "true");
  await expect(option("cherry")).toHaveAttribute("data-disabled", "");
  await expect(content.locator("[data-active]")).toHaveCount(0);
  await expect(open).toHaveText("false false");

  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expectOpen(trigger, content);
  await expectActive(trigger, option("banana"), content);
  await expect(open).toHaveText("true true");

  // The active option unmounts: nothing is named; it returns, and isn't active again by itself.
  await page.getByTestId("toggle-banana").evaluate((node) => (node as HTMLButtonElement).click());
  await expect(option("banana")).toHaveCount(0);
  await expect(trigger).not.toHaveAttribute("aria-activedescendant", /.*/);
  await page.getByTestId("toggle-banana").evaluate((node) => (node as HTMLButtonElement).click());
  await expect(option("banana")).toHaveCount(1);
  await expect(trigger).not.toHaveAttribute("aria-activedescendant", /.*/);
  await page.keyboard.press("ArrowDown");
  await expectActive(trigger, option("banana"), content);

  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  await expect(content).toHaveAttribute("inert", "");
  await expect(content.locator("[data-active]")).toHaveCount(0);
  await expect(open).toHaveText("false false");
  await expect(trigger).toBeFocused();

  await page.getByTestId("write-null").click();
  await expect(trigger).toHaveAttribute("data-placeholder", "");
  await expect(trigger).toHaveText("Choose a fruit");
  await expect(content.locator("[aria-selected=true]")).toHaveCount(0);
});

test("Z2: closed, Enter, Space, ArrowDown and ArrowUp open on the selected option, else the first enabled one; Home and End on the first and last; a character on the first option it starts; a disabled Select doesn't open, and disabling an open one closes it", async ({
  page,
}, info) => {
  await fixture(page, "select", info);

  const { trigger, content, option, open, outputs } = fruitParts(page);

  for (const key of ["Enter", " ", "ArrowDown", "ArrowUp"]) {
    await trigger.focus();
    await page.keyboard.press(key);
    await expectOpen(trigger, content);
    await expectActive(trigger, option("banana"), content);
    await page.keyboard.press("Escape");
    await expectClosed(trigger, content);
  }

  await trigger.focus();
  await page.keyboard.press("Home");
  await expectActive(trigger, option("apple"), content);
  await page.keyboard.press("Escape");
  await page.keyboard.press("End");
  await expectActive(trigger, option("papaya"), content);
  // Escape and Home in one task: the list closes and reopens before it participates again.
  await trigger.evaluate((node) => {
    for (const key of ["Escape", "Home"]) {
      node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }
  });
  await expectOpen(trigger, content);
  await expectActive(trigger, option("apple"), content);
  await page.keyboard.press("Escape");
  // From the start, not after the selected option.
  await page.keyboard.press("b");
  await expectOpen(trigger, content);
  await expectActive(trigger, option("banana"), content);
  await page.keyboard.press("Escape");
  await page.keyboard.press("G");
  await expectActive(trigger, option("grape"), content);
  await page.keyboard.press("Escape");
  // No match: the selected option.
  await page.keyboard.press("x");
  await expectOpen(trigger, content);
  await expectActive(trigger, option("banana"), content);
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  await expect(outputs).toHaveText("0");

  // Nothing selected: the first enabled option. The write reaches the root's model at the next render.
  await page.getByTestId("write-null").click();
  await expect(trigger).toHaveAttribute("data-placeholder", "");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expectActive(trigger, option("apple"), content);
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);

  // Disabled: the Trigger is natively disabled and nothing opens it.
  await page.getByTestId("toggle-fruit-disabled").click();
  await expect(trigger).toBeDisabled();
  await expect(trigger).toHaveAttribute("aria-disabled", "true");
  await expect(trigger).toHaveAttribute("data-disabled", "");
  await trigger.click({ force: true });
  await frames(page);
  expect(await shown(content)()).toBe(false);
  await expect(open).toHaveText("false false");
  await page.getByTestId("toggle-fruit-disabled").click();
  await expect(trigger).toBeEnabled();

  // Disabling an open Select closes it.
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expectOpen(trigger, content);
  await script(page.getByTestId("toggle-fruit-disabled"));
  await expectClosed(trigger, content);
  await expect(open).toHaveText("false false");
  await page.getByTestId("toggle-fruit-disabled").click();
  await expect(outputs).toHaveText("0");
});

test("Z3: open, arrows move without wrapping, Home/End, PageUp/PageDown by ten, typeahead buffers, cycles, joins Space and skips disabled options; Enter and Space choose and close for good; Escape and Tab close without choosing; focus never leaves the Trigger", async ({
  page,
}, info) => {
  await fixture(page, "select", info);

  const { trigger, content, option, value, outputs, open } = fruitParts(page);
  const openOutputs = page.getByTestId("fruit-open-outputs");

  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expectActive(trigger, option("banana"), content);
  await page.keyboard.press("ArrowDown");
  await expectActive(trigger, option("blueberry"), content);
  // Cherry is disabled.
  await page.keyboard.press("ArrowDown");
  await expectActive(trigger, option("date"), content);
  await page.keyboard.press("ArrowUp");
  await expectActive(trigger, option("blueberry"), content);
  await page.keyboard.press("Home");
  await expectActive(trigger, option("apple"), content);
  await page.keyboard.press("ArrowUp");
  await expectActive(trigger, option("apple"), content);
  await page.keyboard.press("End");
  await expectActive(trigger, option("papaya"), content);
  await page.keyboard.press("ArrowDown");
  await expectActive(trigger, option("papaya"), content);
  // Fourteen enabled options: PageUp from the last goes ten back.
  await page.keyboard.press("PageUp");
  await expectActive(trigger, option("blueberry"), content);
  await page.keyboard.press("PageUp");
  await expectActive(trigger, option("apple"), content);
  await page.keyboard.press("PageDown");
  await expectActive(trigger, option("lime"), content);
  await page.keyboard.press("PageDown");
  await expectActive(trigger, option("papaya"), content);
  await expect(trigger).toBeFocused();

  // Typeahead: a repeated character cycles through the options it starts.
  await page.keyboard.press("Home");
  await page.keyboard.type("b");
  await expectActive(trigger, option("banana"), content);
  await page.keyboard.type("b");
  await expectActive(trigger, option("blueberry"), content);
  await page.keyboard.type("b");
  await expectActive(trigger, option("banana"), content);
  // A new search starts once 500 ms pass; Cherry is disabled, so "c" matches nothing.
  await page.waitForTimeout(700);
  await page.keyboard.type("c");
  await expectActive(trigger, option("banana"), content);
  await page.waitForTimeout(700);
  // Fig has no label: its text.
  await page.keyboard.type("f");
  await expectActive(trigger, option("fig"), content);
  await page.waitForTimeout(700);
  // "ap" from Apple's position stays on the multi-character match.
  await page.keyboard.type("ap");
  await expectActive(trigger, option("apple"), content);
  await page.waitForTimeout(700);
  // Space joins a running search instead of choosing.
  await page.keyboard.type("navel o");
  await expectActive(trigger, option("navel-orange"), content);
  await expect(value).toHaveText("string:banana");
  await expect(outputs).toHaveText("0");
  await expectOpen(trigger, content);
  await expect(trigger).toBeFocused();

  // Enter chooses and closes; the native click of Enter doesn't reopen it.
  await page.keyboard.press("Enter");
  await expectClosed(trigger, content);
  await expect(value).toHaveText("string:navel-orange");
  await expect(outputs).toHaveText("1");
  await frames(page);
  expect(await shown(content)()).toBe(false);
  await expect(open).toHaveText("false false");
  await expect(trigger).toBeFocused();

  const opened = Number(await openOutputs.textContent());

  // Space chooses and closes; its keyup doesn't click the button.
  await page.keyboard.press("ArrowDown");
  await expectActive(trigger, option("navel-orange"), content);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press(" ");
  await expectClosed(trigger, content);
  await expect(value).toHaveText("string:papaya");
  await expect(outputs).toHaveText("2");
  await frames(page);
  expect(await shown(content)()).toBe(false);
  await expect(openOutputs).toHaveText(String(opened + 2));
  await expect(trigger).toBeFocused();

  // Enter on the selected option closes without a write.
  await page.keyboard.press("Enter");
  await expectActive(trigger, option("papaya"), content);
  await page.keyboard.press("Enter");
  await expectClosed(trigger, content);
  await expect(outputs).toHaveText("2");

  // Escape closes without choosing.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  await expect(value).toHaveText("string:papaya");
  await expect(trigger).toBeFocused();

  // Tab closes without choosing and moves focus on; Shift+Tab comes back.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  await expectClosed(trigger, content);
  await expect(page.getByTestId("after")).toBeFocused();
  await expect(value).toHaveText("string:papaya");
  await page.keyboard.press("Shift+Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Shift+Tab");
  await expectClosed(trigger, content);
  await expect(page.getByTestId("before")).toBeFocused();
  await expect(outputs).toHaveText("2");

  // Modified keys do nothing.
  await trigger.focus();
  await page.keyboard.press("Control+ArrowDown");
  await frames(page);
  expect(await shown(content)()).toBe(false);
});

test("Z4: a click opens on the selected option and focuses the Trigger in every engine; hovering activates enabled options; clicking one chooses it and closes with focus on the Trigger; disabled options ignore both; an outside click closes without choosing", async ({
  page,
}, info) => {
  await fixture(page, "select", info);

  const { trigger, content, option, value, outputs } = fruitParts(page);

  await trigger.click();
  await expectOpen(trigger, content);
  await expect(trigger).toBeFocused();
  await expectActive(trigger, option("banana"), content);
  // Escape and a click in one task: the list closes and reopens before it participates again.
  await trigger.evaluate((node) => {
    node.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    (node as HTMLElement).click();
  });
  await expectOpen(trigger, content);
  await expectActive(trigger, option("banana"), content);
  // The same with a search running: the reopened list starts a new one, so Space chooses Banana.
  await trigger.evaluate((node) => {
    const press = (key: string) => {
      node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    };

    press("b");
    press("Escape");
    (node as HTMLElement).click();
    press(" ");
    node.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true }));
  });
  await expectClosed(trigger, content);
  await expect(value).toHaveText("string:banana");
  await expect(outputs).toHaveText("0");
  await trigger.click();
  await expectOpen(trigger, content);
  await expectActive(trigger, option("banana"), content);

  await option("date").hover();
  await expectActive(trigger, option("date"), content);
  await option("cherry").hover();
  await expectActive(trigger, option("date"), content);
  await option("cherry").click({ force: true });
  await frames(page);
  expect(await shown(content)()).toBe(true);
  await expect(value).toHaveText("string:banana");
  await expect(trigger).toBeFocused();

  await option("date").click();
  await expectClosed(trigger, content);
  await expect(value).toHaveText("string:date");
  await expect(outputs).toHaveText("1");
  await expect(option("date")).toHaveAttribute("aria-selected", "true");
  await expect(trigger).toHaveText("Date");
  await expect(trigger).toBeFocused();

  // The Trigger toggles.
  await trigger.click();
  await expectOpen(trigger, content);
  await expectActive(trigger, option("date"), content);
  await trigger.click();
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();

  // An outside click closes without choosing.
  await trigger.click();
  await expectOpen(trigger, content);
  await option("grape").hover();
  await page.getByRole("heading", { name: "Fruit" }).click();
  await expectClosed(trigger, content);
  await expect(value).toHaveText("string:date");
  await expect(outputs).toHaveText("1");

  // Keys continue from a pointer open.
  await trigger.click();
  await expectOpen(trigger, content);
  await page.keyboard.press("ArrowDown");
  await expectActive(trigger, option("elderberry"), content);
  await page.keyboard.press("Enter");
  await expectClosed(trigger, content);
  await expect(value).toHaveText("string:elderberry");
  await expect(trigger).toBeFocused();
});

test("Z5: external writes select their option without an output; an unknown value is kept and selects nothing; removing the selected option writes nothing; options arriving after the value select it; an open write opens with no active option until a key", async ({
  page,
}, info) => {
  await fixture(page, "select", info);

  const { trigger, content, option, value, outputs } = fruitParts(page);

  await page.getByTestId("write-kiwi").click();
  await expect(value).toHaveText("string:kiwi");
  await expect(content.locator("[aria-selected=true]")).toHaveCount(0);
  await expect(trigger).toHaveText("kiwi");
  await expect(trigger).not.toHaveAttribute("data-placeholder", /.*/);
  await page.getByTestId("write-banana").click();
  await expect(option("banana")).toHaveAttribute("aria-selected", "true");
  await expect(content.locator("[aria-selected=true]")).toHaveCount(1);
  await page.getByTestId("write-null").click();
  await expect(content.locator("[aria-selected=true]")).toHaveCount(0);
  await page.getByTestId("write-banana").click();

  // Removing the selected option keeps the value.
  await page.getByTestId("toggle-banana").click();
  await expect(option("banana")).toHaveCount(0);
  await expect(value).toHaveText("string:banana");
  await expect(content.locator("[aria-selected=true]")).toHaveCount(0);
  await page.getByTestId("toggle-banana").click();
  await expect(option("banana")).toHaveAttribute("aria-selected", "true");
  await expect(outputs).toHaveText("0");

  // Options arriving after the value.
  const late = page.getByTestId("late-y1");

  await expect(late).toHaveCount(0);
  await expect(page.getByTestId("late-value")).toHaveText("string:y");
  await page.getByTestId("toggle-late").click();
  await expect(late).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("late-x")).toHaveAttribute("aria-selected", "false");
  await expect(page.getByTestId("late-value")).toHaveText("string:y");

  // An open write: no active option until a key.
  await page.getByTestId("open-fruit").click();
  await expectOpen(trigger, content);
  await expect(trigger).not.toHaveAttribute("aria-activedescendant", /.*/);
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expectActive(trigger, option("banana"), content);
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  await expect(outputs).toHaveText("0");
});

test("Z6: opening scrolls the selected option into view in a capped list of 111; keys keep the active option visible; the page never scrolls", async ({
  page,
}, info) => {
  await fixture(page, "select", info);

  const trigger = page.getByTestId("long-trigger");
  const content = page.getByTestId("long-content");

  async function visible(option: Locator): Promise<void> {
    await expect
      .poll(async () => {
        const box = await content.evaluate((node) => {
          const rect = node.getBoundingClientRect();

          return {
            top: rect.top + node.clientTop,
            bottom: rect.top + node.clientTop + node.clientHeight,
          };
        });
        const rect = await option.evaluate((node) => {
          const bounds = node.getBoundingClientRect();

          return { top: bounds.top, bottom: bounds.bottom };
        });

        return rect.top >= box.top - 0.5 && rect.bottom <= box.bottom + 0.5;
      })
      .toBe(true);
  }

  await trigger.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 40));

  const scrollY = await page.evaluate(() => window.scrollY);

  await trigger.evaluate((node) => (node as HTMLElement).focus({ preventScroll: true }));
  await page.keyboard.press("ArrowDown");
  await expectOpen(trigger, content);
  await expectActive(trigger, page.getByTestId("long-80"), content);
  await expect
    .poll(() => content.evaluate((node) => node.scrollHeight > node.clientHeight))
    .toBe(true);
  await visible(page.getByTestId("long-80"));
  expect(await content.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);

  await page.keyboard.press("End");
  await visible(page.getByTestId("long-111"));
  await page.keyboard.press("Home");
  await visible(page.getByTestId("long-1"));

  for (let step = 0; step < 3; step++) {
    await page.keyboard.press("PageDown");
  }

  await expectActive(trigger, page.getByTestId("long-31"), content);
  await visible(page.getByTestId("long-31"));

  for (let step = 0; step < 12; step++) {
    await page.keyboard.press("ArrowDown");
  }

  await visible(page.getByTestId("long-43"));
  await page.keyboard.type("Option 100");
  await expectActive(trigger, page.getByTestId("long-100"), content);
  await visible(page.getByTestId("long-100"));
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test("Z7: in a Dialog the first Escape and an outside click inside the dialog close only the Select; in Popover Content likewise, and choosing keeps the Popover open; a Tooltip on the Trigger closes when the Select opens", async ({
  page,
}, info) => {
  await fixture(page, "select", info);

  // Dialog.
  const dialogTrigger = page.getByTestId("dialog-select-trigger");
  const dialogList = page.getByTestId("dialog-select-content");
  const dialogState = page.getByTestId("dialog-state");
  const modal = () => page.getByTestId("dialog-content").evaluate((node) => node.matches(":modal"));

  await page.getByTestId("dialog-trigger").click();
  await expect.poll(modal).toBe(true);
  await dialogTrigger.click();
  await expectOpen(dialogTrigger, dialogList);
  await expect(dialogState).toHaveText("true true");
  await page.keyboard.press("Escape");
  await expectClosed(dialogTrigger, dialogList);
  await expect(dialogState).toHaveText("true false");
  expect(await modal()).toBe(true);
  await expect(dialogTrigger).toBeFocused();
  await dialogTrigger.click();
  await expectOpen(dialogTrigger, dialogList);
  await page.getByTestId("dialog-inside").click();
  await expectClosed(dialogTrigger, dialogList);
  await expect(dialogState).toHaveText("true false");
  expect(await modal()).toBe(true);
  // Escape in the opening frame, in the same task as the opening key and so before the list is
  // presented, still closes only the Select.
  const early = await dialogTrigger.evaluate((node) => {
    const list = document.querySelector('[data-testid="dialog-select-content"]');
    const opening = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });

    (node as HTMLElement).focus();
    node.dispatchEvent(opening);

    const presented = list?.matches(":popover-open") ?? null;

    node.dispatchEvent(escape);

    return { opened: opening.defaultPrevented, presented, consumed: escape.defaultPrevented };
  });

  expect(early).toEqual({ opened: true, presented: false, consumed: true });
  await expectClosed(dialogTrigger, dialogList);
  await frames(page);
  expect(await modal()).toBe(true);
  await expect(dialogState).toHaveText("true false");
  await dialogTrigger.click();
  await page.getByTestId("dialog-option-two").click();
  await expectClosed(dialogTrigger, dialogList);
  await expect(dialogTrigger).toHaveText("two");
  expect(await modal()).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(modal).toBe(false);
  await expect(dialogState).toHaveText("false false");

  // Popover Content.
  const popoverContent = page.getByTestId("popover-content");
  const popoverTrigger = page.getByTestId("popover-select-trigger");
  const popoverList = page.getByTestId("popover-select-content");
  const popoverState = page.getByTestId("popover-state");

  await page.getByTestId("popover-trigger").click();
  await expect.poll(shown(popoverContent)).toBe(true);
  await popoverTrigger.click();
  await expectOpen(popoverTrigger, popoverList);
  await expect(popoverState).toHaveText("true true");
  await page.keyboard.press("Escape");
  await expectClosed(popoverTrigger, popoverList);
  await expect(popoverState).toHaveText("true false");
  expect(await shown(popoverContent)()).toBe(true);
  await popoverTrigger.click();
  await expectOpen(popoverTrigger, popoverList);
  // Inside the Popover, beside the list, which covers the text under the Trigger.
  await popoverContent.click({ position: { x: 2, y: 2 } });
  await expectClosed(popoverTrigger, popoverList);
  await expect(popoverState).toHaveText("true false");
  await popoverTrigger.click();
  await page.getByTestId("popover-option-two").click();
  await expectClosed(popoverTrigger, popoverList);
  await expect(popoverTrigger).toHaveText("two");
  await expect(popoverState).toHaveText("true false");
  expect(await shown(popoverContent)()).toBe(true);
  // Closing the Popover by its model keeps the Select's request but not its active option.
  const popoverOne = page.getByTestId("popover-option-one");

  await popoverTrigger.focus();
  await page.keyboard.press("ArrowDown");
  await expectOpen(popoverTrigger, popoverList);
  await page.keyboard.press("ArrowUp");
  await expectActive(popoverTrigger, popoverOne, popoverList);
  await script(page.getByTestId("close-popover"));
  await expect(popoverState).toHaveText("false true");
  await expect.poll(shown(popoverContent)).toBe(false);
  await expect(popoverTrigger).not.toHaveAttribute("aria-activedescendant", /.*/);
  await expect(popoverList.locator("[data-active]")).toHaveCount(0);
  await script(page.getByTestId("open-popover"));
  await expect(popoverState).toHaveText("true true");
  await expectOpen(popoverTrigger, popoverList);
  await frames(page);
  await expect(popoverTrigger).not.toHaveAttribute("aria-activedescendant", /.*/);
  await expect(popoverList.locator("[data-active]")).toHaveCount(0);
  // Without an active option, Enter closes without choosing the old candidate.
  await popoverTrigger.focus();
  await page.keyboard.press("Enter");
  await expectClosed(popoverTrigger, popoverList);
  await expect(popoverTrigger).toHaveText("two");
  await expect(popoverState).toHaveText("true false");
  await page.keyboard.press("Escape");
  await expect.poll(shown(popoverContent)).toBe(false);
  await expect(popoverState).toHaveText("false false");

  // A Tooltip on the Trigger.
  const tipTrigger = page.getByTestId("tip-trigger");
  const tipContent = page.getByTestId("tip-content");
  const tipList = page.getByTestId("tip-select-content");
  const tipState = page.getByTestId("tip-state");

  await expect(tipTrigger).toHaveAttribute(
    "aria-describedby",
    (await tipContent.getAttribute("id")) ?? "",
  );
  await tipTrigger.hover();
  await expect.poll(shown(tipContent)).toBe(true);
  await expect(tipState).toHaveText("true false");
  await tipTrigger.click();
  await expectOpen(tipTrigger, tipList);
  await expect(tipState).toHaveText("false true");
  await expect.poll(shown(tipContent)).toBe(false);
  await page.getByTestId("sort-oldest").click();
  await expectClosed(tipTrigger, tipList);
  await expect(tipTrigger).toHaveText("oldest");
});

test("Z8: server HTML is closed, with the consumer's label from the selected option and no active descendant, and hydration keeps it; options in a deferred block are navigable only once they hydrate, with no value write", async ({
  page,
}, info) => {
  const { trigger, content, option } = fruitParts(page);
  const deferredTrigger = page.getByTestId("deferred-trigger");
  const deferredContent = page.getByTestId("deferred-content");
  const incremental = info.project.metadata.hydration === "incremental";

  await fixture(page, "select", info, async () => {
    await expect(trigger).toHaveText("Banana");
    await expect(trigger).toHaveAttribute("role", "combobox");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toHaveAttribute(
      "aria-controls",
      (await content.getAttribute("id")) ?? "",
    );
    await expect(trigger).not.toHaveAttribute("aria-activedescendant", /.*/);
    await expect(content).toHaveAttribute("popover", "manual");
    await expect(content).toHaveAttribute("inert", "");
    await expect(option("banana")).toHaveAttribute("aria-selected", "true");
    await expect(option("cherry")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("late-trigger")).toHaveText("Loading");
    await expect(deferredTrigger).toHaveAttribute("data-placeholder", "");

    if (incremental) {
      await expect(page.getByTestId("deferred-late-2")).toHaveCount(1);
      await expect(page.getByTestId("deferred-block-attached")).toHaveText("false");
    }
  });

  await expect(trigger).toHaveText("Banana");
  await expect(trigger).not.toHaveAttribute("aria-activedescendant", /.*/);

  // Dehydrated options can't be reached; the value isn't written meanwhile.
  await deferredTrigger.focus();
  await page.keyboard.press("ArrowDown");
  await expectOpen(deferredTrigger, deferredContent);
  await expectActive(deferredTrigger, page.getByTestId("deferred-early"), deferredContent);

  if (incremental) {
    await page.keyboard.press("End");
    await expectActive(deferredTrigger, page.getByTestId("deferred-early"), deferredContent);
  }

  await page.keyboard.press("Escape");
  await expectClosed(deferredTrigger, deferredContent);
  await page.getByTestId("hydrate-deferred").click();
  // The block's own binding refreshes once it has hydrated (or rendered, without incremental hydration).
  await expect(page.getByTestId("deferred-block-attached")).toHaveText("true");
  await deferredTrigger.focus();
  await page.keyboard.press("End");
  await expectActive(deferredTrigger, page.getByTestId("deferred-late-2"), deferredContent);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("deferred-value")).toHaveText("null");
  await expect(page.getByTestId("deferred-outputs")).toHaveText("0");
});

test("Z9: with [formField] on the root the Select writes and follows the model, Field Labels name the Trigger and the listbox, its Description then Error describe the Trigger, only focus leaving the Trigger touches, focusBoundControl() focuses the Trigger, readonly() opens and browses but never writes, and required, errors and disabled() reach the Trigger", async ({
  page,
}, info) => {
  const field = page.getByTestId("priority-field");
  const trigger = page.getByTestId("priority-trigger");
  const content = page.getByTestId("priority-content");
  const option = (n: number) => page.getByTestId(`priority-${n}`);
  const value = page.getByTestId("priority-value");
  const touched = page.getByTestId("priority-touched");
  const labels = "priority-label priority-label-2";

  await fixture(page, "select", info, async () => {
    await expect(trigger).toHaveAttribute("aria-labelledby", labels);
    await expect(content).toHaveAttribute("aria-labelledby", labels);
    await expect(trigger).toHaveAttribute("aria-describedby", "priority-description");
    await expect(trigger).toHaveAttribute("aria-required", "true");
    await expect(trigger).not.toHaveAttribute("aria-invalid", /.*/);
    await expect(trigger).not.toHaveAttribute("aria-readonly", /.*/);
    await expect(trigger).toHaveAttribute("data-placeholder", "");
    await expect(field).toHaveAttribute("data-required", "");
  });

  // Initially null: nothing selected; the Labels name the Trigger, the Description describes it.
  await expect(value).toHaveText("null");
  await expect(trigger).toHaveText("Choose");
  await expect(content.locator('[aria-selected="true"]')).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-labelledby", labels);
  await expect(content).toHaveAttribute("aria-labelledby", labels);
  await expect(trigger).toHaveAttribute("aria-required", "true");
  await expect(page.getByRole("combobox", { name: "Priority (1 to 3)" })).toHaveAttribute(
    "data-testid",
    "priority-trigger",
  );
  await expect(trigger).toHaveAccessibleDescription("How urgent is it?");

  for (const label of ["priority-label", "priority-label-2"]) {
    await expect(page.getByTestId(label)).not.toHaveAttribute("for", /.*/);
  }

  // A Label click does nothing.
  await page.getByTestId("priority-label").click();
  await frames(page);
  await expectClosed(trigger, content);
  await expect(trigger).not.toBeFocused();

  // Opening, browsing, choosing and Escape keep focus on the Trigger, so none of them touches.
  await trigger.click();
  await expectOpen(trigger, content);
  await expect(page.getByRole("listbox", { name: "Priority (1 to 3)" })).toHaveAttribute(
    "data-testid",
    "priority-content",
  );
  await expect(content).toHaveAccessibleName("Priority (1 to 3)");
  await expectActive(trigger, option(1), content);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expectClosed(trigger, content);
  await expect(value).toHaveText("number:2");
  await expect(trigger).toHaveText("Medium");
  await page.keyboard.press("ArrowDown");
  await expectOpen(trigger, content);
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  await trigger.click();
  await expectOpen(trigger, content);
  await option(3).click();
  await expectClosed(trigger, content);
  await expect(value).toHaveText("number:3");
  await expect(trigger).toBeFocused();
  await frames(page);
  await expect(touched).toHaveText("false");

  // Focus leaving the Trigger touches.
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("priority-after")).toBeFocused();
  await expect(touched).toHaveText("true");
  await expect(field).not.toHaveAttribute("data-invalid", /.*/);

  // A model write reaches the Select; the touched, now invalid field shows its error.
  await page.getByTestId("clear-priority").click();
  await expect(value).toHaveText("null");
  await expect(trigger).toHaveAttribute("data-placeholder", "");
  await expect(content.locator('[aria-selected="true"]')).toHaveCount(0);
  await expect(field).toHaveAttribute("data-invalid", "");
  await expect(trigger).toHaveAttribute("aria-invalid", "true");
  await expect(trigger).toHaveAttribute("aria-describedby", "priority-description priority-error");
  await expect(trigger).toHaveAccessibleDescription("How urgent is it? Choose a priority.");
  await page.getByTestId("write-priority").click();
  await expect(value).toHaveText("number:3");
  await expect(option(3)).toHaveAttribute("aria-selected", "true");
  await expect(trigger).toHaveText("High");
  await expect(field).not.toHaveAttribute("data-invalid", /.*/);
  await expect(trigger).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(trigger).toHaveAttribute("aria-describedby", "priority-description");

  // reset() untouches and keeps the value.
  await page.getByTestId("reset-priority").click();
  await expect(touched).toHaveText("false");
  await expect(value).toHaveText("number:3");

  // submit() touches and shows the error without running the action.
  await page.getByTestId("clear-priority").click();
  await expect(field).not.toHaveAttribute("data-invalid", /.*/);
  await page.getByTestId("submit-todo").click();
  await expect(touched).toHaveText("true");
  await expect(field).toHaveAttribute("data-invalid", "");
  await expect(trigger).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("todo-submits")).toHaveText("0");

  // focusBoundControl() focuses the Trigger without opening the list.
  await page.getByTestId("focus-priority").click();
  await expect(trigger).toBeFocused();
  await frames(page);
  await expectClosed(trigger, content);

  // readonly(): the list opens and the active option moves, but nothing is written.
  await page.getByTestId("write-priority").click();
  await page.getByTestId("freeze-priority").click();
  await expect(trigger).toHaveAttribute("aria-readonly", "true");
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await expectOpen(trigger, content);
  await expectActive(trigger, option(3), content);
  await page.keyboard.press("ArrowUp");
  await expectActive(trigger, option(2), content);
  await page.keyboard.press("Enter");
  await frames(page);
  await expectOpen(trigger, content);
  await expect(value).toHaveText("number:3");
  await page.keyboard.press("l");
  await expectActive(trigger, option(1), content);
  await option(1).click();
  await frames(page);
  await expectOpen(trigger, content);
  await expect(value).toHaveText("number:3");
  await expect(option(3)).toHaveAttribute("aria-selected", "true");
  await expect(option(1)).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  await page.getByTestId("freeze-priority").click();
  await expect(trigger).not.toHaveAttribute("aria-readonly", /.*/);
  await trigger.click();
  await expectOpen(trigger, content);
  await option(1).click();
  await expectClosed(trigger, content);
  await expect(value).toHaveText("number:1");

  // disabled(): the Trigger is natively disabled, and the Field has data-disabled.
  await page.getByTestId("lock-priority").click();
  await expect(trigger).toBeDisabled();
  await expect(field).toHaveAttribute("data-disabled", "");
  await page.getByTestId("lock-priority").click();
  await expect(trigger).toBeEnabled();
  await expect(field).not.toHaveAttribute("data-disabled", /.*/);
});

test("Z9: without a form the Field's Label still names the Trigger and the listbox, replacing static values, and its Description joins a co-applied Tooltip's description; a standalone Select keeps its static attributes, names its listbox by the Trigger's aria-labelledby, else keeps Content's own, and emits touch only when focus leaves the Trigger", async ({
  page,
}, info) => {
  const sort = page.getByTestId("sort-trigger");
  const sortContent = page.getByTestId("sort-content");
  const flavour = page.getByTestId("flavour-trigger");
  const flavourContent = page.getByTestId("flavour-content");

  await fixture(page, "select", info, async () => {
    await expect(sortContent).toHaveAttribute("aria-labelledby", "sort-label");
    await expect(flavourContent).toHaveAttribute("aria-labelledby", "flavour-heading");
  });

  await expect(sort).toHaveAttribute("aria-labelledby", "sort-label");
  await expect(sortContent).toHaveAttribute("aria-labelledby", "sort-label");
  await expect(sort).toHaveAttribute("aria-describedby", "sort-description sort-tip");
  await expect(page.getByTestId("sort-label")).not.toHaveAttribute("for", /.*/);
  await expect(page.getByRole("combobox", { name: "Sort order" })).toHaveAttribute(
    "data-testid",
    "sort-trigger",
  );

  // Without [formField] there is no form state to expose.
  for (const attribute of ["aria-invalid", "aria-required", "aria-readonly"]) {
    await expect(sort).not.toHaveAttribute(attribute, /.*/);
  }

  await sort.click();
  await expectOpen(sort, sortContent);
  await expect(page.getByRole("listbox", { name: "Sort order" })).toHaveAttribute(
    "data-testid",
    "sort-content",
  );
  await expect(sortContent).toHaveAccessibleName("Sort order");
  await page.getByTestId("sort-field-oldest").click();
  await expectClosed(sort, sortContent);
  await expect(sort).toHaveText("oldest");

  // Standalone: static attributes kept; the listbox takes the Trigger's static aria-labelledby.
  const colour = page.getByTestId("colour-trigger");
  const colourContent = page.getByTestId("colour-content");
  const touches = page.getByTestId("colour-touches");

  await expect(colour).toHaveAttribute("aria-labelledby", "standalone-heading");
  await expect(colour).toHaveAttribute("aria-describedby", "standalone-hint");
  await expect(colourContent).toHaveAttribute("aria-labelledby", "standalone-heading");
  await expect(page.getByRole("combobox", { name: "Standalone colour" })).toHaveAttribute(
    "data-testid",
    "colour-trigger",
  );
  await expect(colour).toHaveAccessibleDescription("Colours may vary.");

  for (const attribute of ["aria-invalid", "aria-required", "aria-readonly"]) {
    await expect(colour).not.toHaveAttribute(attribute, /.*/);
  }

  await colour.click();
  await expectOpen(colour, colourContent);
  await expect(colourContent).toHaveAccessibleName("Standalone colour");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expectClosed(colour, colourContent);
  await page.keyboard.press("ArrowDown");
  await expectOpen(colour, colourContent);
  await page.keyboard.press("Escape");
  await expectClosed(colour, colourContent);
  await colour.click();
  await expectOpen(colour, colourContent);
  await page.getByTestId("colour-red").click();
  await expectClosed(colour, colourContent);
  await expect(colour).toHaveText("red");
  await expect(page.getByTestId("colour-outputs")).toHaveText("2");
  await frames(page);
  await expect(touches).toHaveText("0");
  await page.getByTestId("colour-after").click();
  await expect(touches).toHaveText("1");

  // A Trigger named by aria-label alone leaves Content's own static aria-labelledby in place.
  await expect(flavour).toHaveAccessibleName("Flavour");
  await expect(flavour).not.toHaveAttribute("aria-labelledby", /.*/);
  await expect(flavourContent).toHaveAttribute("aria-labelledby", "flavour-heading");
  await flavour.click();
  await expectOpen(flavour, flavourContent);
  await expect(flavourContent).toHaveAccessibleName("Flavours");
  await page.getByTestId("flavour-lemon").click();
  await expectClosed(flavour, flavourContent);
  await expect(flavour).toHaveText("lemon");
  await expect(flavourContent).toHaveAttribute("aria-labelledby", "flavour-heading");
});

test("Z9: a consumer component composing the Select through hostDirectives with exposed value, valueChange, disabled and touch is the control [formField] finds; the Select reads FORM_FIELD on its element, and focusBoundControl() reaches the Trigger through the component's own focus()", async ({
  page,
}, info) => {
  await fixture(page, "select", info);

  const field = page.getByTestId("status-field");
  const trigger = page.getByTestId("status-trigger");
  const content = page.getByTestId("status-content");
  const value = page.getByTestId("status-value");
  const touched = page.getByTestId("status-touched");

  await expect(field).toHaveAttribute("data-required", "");
  await expect(trigger).toHaveAttribute("aria-required", "true");
  await expect(trigger).toHaveAttribute("aria-labelledby", "status-label");
  await expect(page.getByRole("combobox", { name: "Status" })).toHaveAttribute(
    "data-testid",
    "status-trigger",
  );

  await trigger.click();
  await expectOpen(trigger, content);
  await page.getByTestId("status-open").click();
  await expectClosed(trigger, content);
  await expect(value).toHaveText("string:open");
  await expect(touched).toHaveText("false");
  await page.getByTestId("status-after").click();
  await expect(touched).toHaveText("true");

  // A programmatic write changes the selected option.
  await page.getByTestId("write-status").click();
  await expect(value).toHaveText("string:closed");
  await expect(page.getByTestId("status-closed")).toHaveAttribute("aria-selected", "true");
  await expect(trigger).toHaveText("Closed");
  await page.getByTestId("focus-status").click();
  await expect(trigger).toBeFocused();

  // The Select reads the readonly rule from FORM_FIELD on its own element.
  await page.getByTestId("freeze-status").click();
  await expect(trigger).toHaveAttribute("aria-readonly", "true");
  await trigger.click();
  await expectOpen(trigger, content);
  await page.getByTestId("status-open").click();
  await frames(page);
  await expect(value).toHaveText("string:closed");
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  await page.getByTestId("freeze-status").click();

  await page.getByTestId("lock-status").click();
  await expect(trigger).toBeDisabled();
  await expect(field).toHaveAttribute("data-disabled", "");
  await page.getByTestId("lock-status").click();
  await trigger.click();
  await expectOpen(trigger, content);
  await page.getByTestId("status-open").click();
  await expect(value).toHaveText("string:open");
});

test("Z9: with the root, its [formField], the Field and Content mounted, a Trigger mounted later, removed and replaced is the one focusBoundControl() focuses and whose Labels name the listbox; without one, focusing does nothing and the listbox has no aria-labelledby", async ({
  page,
}, info) => {
  await fixture(page, "select", info);

  const first = page.getByTestId("size-first");
  const second = page.getByTestId("size-second");
  const content = page.getByTestId("size-content");
  const focus = page.getByTestId("focus-size");

  // No Trigger yet: focusing does nothing, and nothing names the listbox.
  await expect(first).toHaveCount(0);
  await expect(content).not.toHaveAttribute("aria-labelledby", /.*/);
  await focus.click();
  await expect(focus).toBeFocused();

  // A Trigger mounted in a later view registers: the Field's Label replaces its static value
  // and names the listbox, focusBoundControl() focuses it, and it chooses.
  await page.getByTestId("mount-first-size").click();
  await expect(first).toHaveAttribute("aria-labelledby", "size-label");
  await expect(content).toHaveAttribute("aria-labelledby", "size-label");
  await focus.click();
  await expect(first).toBeFocused();
  await frames(page);
  await expectClosed(first, content);
  await first.click();
  await expectOpen(first, content);
  await page.getByTestId("size-large").click();
  await expectClosed(first, content);
  await expect(page.getByTestId("size-value")).toHaveText("string:large");

  // Removed: the registration goes with it, including the static value it would fall back to.
  await page.getByTestId("remove-size").click();
  await expect(first).toHaveCount(0);
  await expect(content).not.toHaveAttribute("aria-labelledby", /.*/);
  await focus.click();
  await expect(focus).toBeFocused();

  // Another Trigger, then a direct replacement: each time the current one registers.
  await page.getByTestId("mount-second-size").click();
  await expect(second).toHaveAttribute("aria-labelledby", "size-label");
  await expect(content).toHaveAttribute("aria-labelledby", "size-label");
  await focus.click();
  await expect(second).toBeFocused();
  await page.getByTestId("mount-first-size").click();
  await expect(second).toHaveCount(0);
  await expect(content).toHaveAttribute("aria-labelledby", "size-label");
  await focus.click();
  await expect(first).toBeFocused();
  await expect(first).toHaveText("large");
});

test("Z10: number and boolean values select and write with their own types; a string option value never matches a number", async ({
  page,
}, info) => {
  await fixture(page, "select", info);

  const countTrigger = page.getByTestId("count-trigger");
  const countContent = page.getByTestId("count-content");
  const countValue = page.getByTestId("count-value");

  await countTrigger.click();
  await page.getByTestId("count-2").click();
  await expectClosed(countTrigger, countContent);
  await expect(countValue).toHaveText("number:2");
  await expect(page.getByTestId("count-2")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("count-outputs")).toHaveText("1");

  await page.getByTestId("write-count-1").click();
  await expect(countValue).toHaveText("number:1");
  await expect(page.getByTestId("count-1")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("count-string-1")).toHaveAttribute("aria-selected", "false");
  await expect(page.getByTestId("count-selected")).toHaveText(
    JSON.stringify({ value: 1, label: "One", disabled: false }),
  );

  // Opening starts on the number 1, not the string "1".
  await countTrigger.focus();
  await page.keyboard.press("ArrowDown");
  await expectActive(countTrigger, page.getByTestId("count-1"), countContent);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(countValue).toHaveText("string:1");
  await expect(page.getByTestId("count-1")).toHaveAttribute("aria-selected", "false");
  await expect(page.getByTestId("count-string-1")).toHaveAttribute("aria-selected", "true");

  const agreeTrigger = page.getByTestId("agree-trigger");
  const agreeValue = page.getByTestId("agree-value");

  await expect(agreeTrigger).toHaveAttribute("data-placeholder", "");
  await agreeTrigger.click();
  await page.getByTestId("agree-no").click();
  await expect(agreeValue).toHaveText("boolean:false");
  await expect(page.getByTestId("agree-no")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("agree-yes")).toHaveAttribute("aria-selected", "false");
  // False is a value, not nothing.
  await expect(agreeTrigger).not.toHaveAttribute("data-placeholder", /.*/);
  await expect(agreeTrigger).toHaveText("No");
  await agreeTrigger.focus();
  await page.keyboard.press("ArrowUp");
  await expectActive(agreeTrigger, page.getByTestId("agree-no"), page.getByTestId("agree-content"));
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(agreeValue).toHaveText("boolean:true");
  await expect(agreeTrigger).toHaveText("Yes");
});

test("Z11: selectedOption() is the matching option's value, explicit label and disabled state; null for null, unknown and not-yet-mounted values; it follows options arriving later and the first registered of duplicate values", async ({
  page,
}, info) => {
  await fixture(page, "select", info);

  const selected = page.getByTestId("fruit-selected");

  await expect(selected).toHaveText(
    JSON.stringify({ value: "banana", label: "Banana", disabled: false }),
  );

  const { trigger, option } = fruitParts(page);

  await trigger.click();
  await option("fig").click();
  await expect(selected).toHaveText(JSON.stringify({ value: "fig", label: null, disabled: false }));
  // Without a label the Trigger falls back to the value.
  await expect(trigger).toHaveText("fig");
  await page.getByTestId("write-kiwi").click();
  await expect(selected).toHaveText("null");
  await page.getByTestId("write-null").click();
  await expect(selected).toHaveText("null");

  const late = page.getByTestId("late-selected");
  const lateTrigger = page.getByTestId("late-trigger");

  await expect(late).toHaveText("null");
  await expect(lateTrigger).toHaveText("Loading");
  await page.getByTestId("toggle-late").click();
  // Two options have "y": the first registered one, enabled, wins.
  await expect(late).toHaveText(
    JSON.stringify({ value: "y", label: "Why first", disabled: false }),
  );
  await expect(lateTrigger).toHaveText("Why first");
  await page.getByTestId("write-late-z").click();
  await expect(late).toHaveText(JSON.stringify({ value: "z", label: null, disabled: false }));
  await page.getByTestId("write-late-q").click();
  await expect(late).toHaveText("null");
  await page.getByTestId("write-late-z").click();
  await page.getByTestId("toggle-late").click();
  await expect(late).toHaveText("null");
  await expect(page.getByTestId("late-value")).toHaveText("string:z");
});

for (const name of ["select-factory", "select-existing"]) {
  test(`Z12 O1 O3: ${name.replace("select-", "")} replacements of every host-composed part drive value, open, IDs, disabled policy and placement over the composed parts' contradicting own inputs, and the unused models emit nothing`, async ({
    page,
  }, info) => {
    await fixture(page, "select", info);

    const co = (role: string) => page.locator(`[data-case="${name}"] [data-co="${role}"]`);
    const trigger = co("trigger");
    const content = co("content");

    // Before any action, every effective replacement contradicts the own inputs.
    await expect(co("value")).toHaveText("number:2");
    await expect(co("open")).toHaveText("false false");
    await expect(co("disabled")).toHaveText("true");
    expect(await shown(content)()).toBe(false);
    await expect(trigger).toHaveAttribute("id", `${name}-trigger`);
    await expect(trigger).toHaveAttribute("aria-controls", `${name}-content`);
    await expect(content).toHaveAttribute("id", `${name}-content`);
    // The Select's disabled with the replaced focusableWhenDisabled false: natively disabled.
    await expect(trigger).toBeDisabled();
    await expect(trigger).toHaveAttribute("aria-disabled", "true");

    // Options registered from their wrapper's input: value, label, disabled and ID.
    for (const code of [1, 2, 3]) {
      await expect(co(`option-${code}`)).toHaveAttribute("id", `${name}-option-${code}`);
    }

    await expect(co("option-2")).toHaveAttribute("aria-selected", "true");
    await expect(co("option-1")).toHaveAttribute("aria-selected", "false");
    await expect(co("option-1")).not.toHaveAttribute("aria-disabled", /.*/);
    await expect(co("option-3")).toHaveAttribute("aria-disabled", "true");
    await expect(co("selected")).toHaveText('{"value":2,"label":"Two","disabled":false}');
    await expect(trigger).toHaveText("Two");

    await co("enable").click();
    await expect(co("disabled")).toHaveText("false");
    await expect(trigger).toBeEnabled();
    // The replaced Trigger disabled policy, never its own input; the Select stays enabled.
    await co("trigger-disable").click();
    await expect(trigger).toBeDisabled();
    await expect(co("disabled")).toHaveText("false");
    await co("trigger-disable").click();
    await expect(trigger).toBeEnabled();

    // Opening writes the replaced open; Content takes the replaced placement.
    await trigger.evaluate((node) => node.scrollIntoView({ block: "center", inline: "center" }));
    await trigger.click();
    await expect(co("open")).toHaveText("true true");
    await expectOpen(trigger, content);
    await expectActive(trigger, co("option-2"), content);
    await expectPreferred(page, "inline-end", "center", 11, {
      anchor: `${name}-trigger`,
      content: `${name}-content`,
    });

    // Keys skip the disabled option; Enter writes the replaced value and closes.
    await page.keyboard.press("ArrowDown");
    await expectActive(trigger, co("option-2"), content);
    await page.keyboard.press("ArrowUp");
    await expectActive(trigger, co("option-1"), content);
    await page.keyboard.press("Enter");
    await expectClosed(trigger, content);
    await expect(co("value")).toHaveText("number:1");
    await expect(co("open")).toHaveText("false false");
    await expect(co("selected")).toHaveText('{"value":1,"label":"One","disabled":false}');
    await expect(trigger).toHaveText("One");

    // A click on the disabled option does nothing; a click on another chooses it.
    await trigger.click();
    await expectActive(trigger, co("option-1"), content);
    await co("option-3").click({ force: true });
    await frames(page);
    expect(await shown(content)()).toBe(true);
    await expect(co("value")).toHaveText("number:1");
    await co("option-2").click();
    await expectClosed(trigger, content);
    await expect(co("value")).toHaveText("number:2");
    await expect(trigger).toBeFocused();

    await co("ids").click();
    await expect(trigger).toHaveAttribute("id", `${name}-trigger-changed`);
    await expect(content).toHaveAttribute("id", `${name}-content-changed`);
    await expect(trigger).toHaveAttribute("aria-controls", `${name}-content-changed`);
    await expect(co("unused-outputs")).toHaveText("0");
  });
}

function toppingParts(page: Page) {
  return {
    trigger: page.getByTestId("toppings-trigger"),
    content: page.getByTestId("toppings-content"),
    option: (value: string) => page.getByTestId(`toppings-${value}`),
    value: page.getByTestId("toppings-value"),
    selected: page.getByTestId("toppings-selected"),
    outputs: page.getByTestId("toppings-outputs"),
    open: page.getByTestId("toppings-open"),
  };
}

test("Z13: ogSelectMultiple's list is aria-multiselectable; closed keys open on the first selected option in DOM order; Enter and Space toggle the active option and keep the list open; arrows, Home/End and typeahead only move; Escape and Tab close without writing; Enter with no active option closes without writing", async ({
  page,
}, info) => {
  await fixture(page, "select", info);

  const { trigger, content, option, value, selected, outputs, open } = toppingParts(page);

  // Value order is onion, anchovy (no option), basil; DOM order puts Basil before Onion.
  await expect(content).toHaveAttribute("aria-multiselectable", "true");
  await expect(page.getByTestId("fruit-content")).not.toHaveAttribute("aria-multiselectable", /.*/);
  await expect(trigger).toHaveAttribute("role", "combobox");
  await expect(trigger).not.toHaveAttribute("data-placeholder", /.*/);
  await expect(trigger).toHaveText("3 selected");
  await expect(selected).toHaveText("Onion,Basil");

  for (const [name, state] of [
    ["olives", "false"],
    ["basil", "true"],
    ["capers", "false"],
    ["garlic", "false"],
    ["mushroom", "false"],
    ["onion", "true"],
  ]) {
    await expect(option(name)).toHaveAttribute("aria-selected", state);
  }

  await expect(option("basil")).toHaveAttribute("data-selected", "");
  await expect(option("olives")).not.toHaveAttribute("data-selected", /.*/);

  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expectOpen(trigger, content);
  await expectActive(trigger, option("basil"), content);
  await expect(content).toHaveAccessibleName("Toppings");
  await expect(open).toHaveText("true true");

  // Enter toggles the active option off, Space back on at the end; the list stays open.
  await page.keyboard.press("Enter");
  await expect(value).toHaveText("onion,anchovy");
  await expect(option("basil")).toHaveAttribute("aria-selected", "false");
  await frames(page);
  await expectOpen(trigger, content);
  await expectActive(trigger, option("basil"), content);
  await page.keyboard.press(" ");
  await expect(value).toHaveText("onion,anchovy,basil");
  await expect(option("basil")).toHaveAttribute("aria-selected", "true");
  await expect(selected).toHaveText("Onion,Basil");
  await frames(page);
  await expectOpen(trigger, content);
  await expect(outputs).toHaveText("2");
  await expect(open).toHaveText("true true");

  // Moves never toggle: arrows skip the disabled Capers, Home and End, typeahead.
  await page.keyboard.press("ArrowDown");
  await expectActive(trigger, option("garlic"), content);
  await page.keyboard.press("Home");
  await expectActive(trigger, option("olives"), content);
  await page.keyboard.press("End");
  await expectActive(trigger, option("onion"), content);
  await page.keyboard.press("ArrowDown");
  await expectActive(trigger, option("onion"), content);
  await page.keyboard.press("ArrowUp");
  await expectActive(trigger, option("mushroom"), content);
  await page.keyboard.press("PageUp");
  await expectActive(trigger, option("olives"), content);
  await page.keyboard.press("g");
  await expectActive(trigger, option("garlic"), content);
  // Space joins a running search instead of toggling.
  await page.keyboard.press(" ");
  await expectActive(trigger, option("garlic"), content);
  await expect(value).toHaveText("onion,anchovy,basil");
  await expect(outputs).toHaveText("2");
  await page.waitForTimeout(600);
  await page.keyboard.press(" ");
  await expect(value).toHaveText("onion,anchovy,basil,garlic");
  await expect(trigger).toHaveText("4 selected");
  await expect(trigger).toBeFocused();

  // Escape closes without writing.
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  await expect(value).toHaveText("onion,anchovy,basil,garlic");
  await expect(open).toHaveText("false false");
  await expect(trigger).toBeFocused();

  // Closed Enter opens without toggling, on the first selected option in DOM order.
  await page.keyboard.press("Enter");
  await expectOpen(trigger, content);
  await expectActive(trigger, option("basil"), content);
  await expect(value).toHaveText("onion,anchovy,basil,garlic");

  // Tab closes without writing and moves focus on.
  await page.keyboard.press("Tab");
  await expectClosed(trigger, content);
  await expect(page.getByTestId("toppings-after")).toBeFocused();
  await expect(value).toHaveText("onion,anchovy,basil,garlic");
  await expect(outputs).toHaveText("3");

  // Opened by a write, nothing is active: Enter closes without writing, as under ogSelect.
  await script(page.getByTestId("open-toppings"));
  await expectOpen(trigger, content);
  await trigger.focus();
  await expect(content.locator("[data-active]")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expectClosed(trigger, content);
  await expect(value).toHaveText("onion,anchovy,basil,garlic");
  await expect(outputs).toHaveText("3");
});

test("Z14: ogSelectMultiple's empty value shows the placeholder and a click opens on the first enabled option; option clicks toggle and keep the list open with focus on the Trigger; disabled options ignore them; a Trigger click and an outside click close without writing", async ({
  page,
}, info) => {
  await fixture(page, "select", info);

  const { trigger, content, option, value, selected, outputs, open } = toppingParts(page);

  await page.getByTestId("clear-toppings").click();
  await expect(value).toHaveText("");
  await expect(selected).toHaveText("");
  await expect(trigger).toHaveAttribute("data-placeholder", "");
  await expect(trigger).toHaveText("Choose toppings");
  await expect(content.locator('[aria-selected="true"]')).toHaveCount(0);

  await trigger.click();
  await expectOpen(trigger, content);
  await expectActive(trigger, option("olives"), content);
  await expect(trigger).toBeFocused();

  await option("mushroom").click();
  await expect(value).toHaveText("mushroom");
  await expect(trigger).not.toHaveAttribute("data-placeholder", /.*/);
  await frames(page);
  await expectOpen(trigger, content);
  await expect(trigger).toBeFocused();
  await option("olives").click();
  await expect(value).toHaveText("mushroom,olives");
  await option("capers").click({ force: true });
  await frames(page);
  await expect(value).toHaveText("mushroom,olives");
  await expect(option("capers")).toHaveAttribute("aria-selected", "false");
  await option("mushroom").click();
  await expect(value).toHaveText("olives");
  await expect(selected).toHaveText("Olives");
  await expectOpen(trigger, content);
  await expect(trigger).toBeFocused();
  await expect(outputs).toHaveText("3");
  await expect(open).toHaveText("true true");

  // A Trigger click closes without writing.
  await trigger.click();
  await expectClosed(trigger, content);
  await expect(value).toHaveText("olives");
  await expect(open).toHaveText("false false");

  // Reopened on the selected option; an outside click closes without writing.
  await trigger.click();
  await expectOpen(trigger, content);
  await expectActive(trigger, option("olives"), content);
  await page.getByRole("heading", { name: "Toppings" }).click();
  await expectClosed(trigger, content);
  await expect(value).toHaveText("olives");
  await expect(outputs).toHaveText("3");

  // Disabled: the Trigger can't open it.
  await page.getByTestId("disable-toppings").click();
  await expect(trigger).toBeDisabled();
  await page.getByTestId("disable-toppings").click();
  await expect(trigger).toBeEnabled();
});

test("Z15: ogSelectMultiple keeps the value's order and unknown values and never prunes; external writes emit nothing; selectedOptions() lists registered matches in value order, the first registered option of a duplicate value, and follows options that arrive and go; a NaN option is never selected", async ({
  page,
}, info) => {
  await fixture(page, "select", info);

  const value = page.getByTestId("numbers-value");
  const records = page.getByTestId("numbers-records");
  const trigger = page.getByTestId("numbers-trigger");
  const content = page.getByTestId("numbers-content");
  const option = (name: string) => page.getByTestId(`numbers-${name}`);

  // 3 isn't mounted and 9 has no option; 2 has two options, and Two registered first.
  await expect(value).toHaveText("number:3,number:9,number:2");
  await expect(records).toHaveText("number:2:Two");
  await expect(option("2")).toHaveAttribute("aria-selected", "true");
  await expect(option("2-again")).toHaveAttribute("aria-selected", "true");
  await expect(option("1")).toHaveAttribute("aria-selected", "false");
  await expect(option("string-1")).toHaveAttribute("aria-selected", "false");

  // An option arriving later joins in value order; nothing is written.
  await page.getByTestId("toggle-three").click();
  await expect(option("3")).toHaveAttribute("aria-selected", "true");
  await expect(records).toHaveText("number:3:Three,number:2:Two");
  await expect(value).toHaveText("number:3,number:9,number:2");

  // Toggling appends and removes, keeping the other values in order.
  await trigger.click();
  await expectOpen(trigger, content);
  await expectActive(trigger, option("2"), content);
  await option("1").click();
  await expect(value).toHaveText("number:3,number:9,number:2,number:1");
  await expect(option("string-1")).toHaveAttribute("aria-selected", "false");
  await option("2-again").click();
  await expect(value).toHaveText("number:3,number:9,number:1");
  await expect(option("2")).toHaveAttribute("aria-selected", "false");
  await expect(records).toHaveText("number:3:Three,number:1:One");
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);

  // Removing a selected option prunes nothing.
  await page.getByTestId("toggle-three").click();
  await expect(option("3")).toHaveCount(0);
  await expect(value).toHaveText("number:3,number:9,number:1");
  await expect(records).toHaveText("number:1:One");

  // Values compare with ===, so a NaN option is never selected, not even by a NaN value.
  await page.getByTestId("write-nan").click();
  await expect(value).toHaveText("number:NaN");
  await expect(option("nan")).toHaveAttribute("aria-selected", "false");
  await expect(records).toHaveText("");
  await trigger.click();
  await expectActive(trigger, option("1"), content);
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);

  // External writes select without an output, and removing their option keeps them.
  const toppings = toppingParts(page);

  await page.getByTestId("write-toppings").click();
  await expect(toppings.value).toHaveText("garlic,olives");
  await expect(toppings.selected).toHaveText("Garlic,Olives");
  await expect(toppings.option("garlic")).toHaveAttribute("aria-selected", "true");
  await expect(toppings.option("onion")).toHaveAttribute("aria-selected", "false");
  await page.getByTestId("toggle-garlic").click();
  await expect(toppings.option("garlic")).toHaveCount(0);
  await expect(toppings.value).toHaveText("garlic,olives");
  await expect(toppings.selected).toHaveText("Olives");
  await page.getByTestId("toggle-garlic").click();
  await expect(toppings.selected).toHaveText("Garlic,Olives");
  await expect(toppings.outputs).toHaveText("0");
});

test("Z16: ogSelectMultiple with [formField] on a number[] field writes and follows the model; Field Labels name the Trigger and the listbox; only focus leaving the Trigger touches; focusBoundControl() focuses the Trigger; readonly() opens on the first selected option but never toggles; required, errors and disabled() reach the Trigger", async ({
  page,
}, info) => {
  const field = page.getByTestId("labels-field");
  const trigger = page.getByTestId("labels-trigger");
  const content = page.getByTestId("labels-content");
  const option = (n: number) => page.getByTestId(`labels-${n}`);
  const value = page.getByTestId("labels-value");
  const touched = page.getByTestId("labels-touched");

  await fixture(page, "select", info, async () => {
    await expect(trigger).toHaveAttribute("aria-labelledby", "labels-label");
    await expect(content).toHaveAttribute("aria-labelledby", "labels-label");
    await expect(content).not.toHaveAttribute("aria-label", /.*/);
    await expect(content).toHaveAttribute("aria-multiselectable", "true");
    await expect(trigger).toHaveAttribute("aria-describedby", "labels-description");
    await expect(trigger).toHaveAttribute("aria-required", "true");
    await expect(trigger).toHaveAttribute("data-placeholder", "");
  });

  await expect(value).toHaveText("");
  await expect(trigger).toHaveText("Any label");
  await expect(page.getByRole("combobox", { name: "Labels" })).toHaveAttribute(
    "data-testid",
    "labels-trigger",
  );
  await expect(trigger).toHaveAccessibleDescription("Pick one or more.");

  // Opening, toggling and Escape keep focus on the Trigger, so none of them touches.
  await trigger.click();
  await expectOpen(trigger, content);
  await expect(content).toHaveAccessibleName("Labels");
  await option(20).click();
  await expect(value).toHaveText("number:20");
  await page.keyboard.press("ArrowDown");
  await expectActive(trigger, option(30), content);
  await page.keyboard.press("Enter");
  await expect(value).toHaveText("number:20,number:30");
  await expect(trigger).toHaveText("Feature,Docs");
  await expectOpen(trigger, content);
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  await frames(page);
  await expect(touched).toHaveText("false");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("labels-after")).toBeFocused();
  await expect(touched).toHaveText("true");

  // An empty array fails minLength once touched; the Error describes the Trigger.
  await page.getByTestId("clear-labels").click();
  await expect(trigger).toHaveAttribute("data-placeholder", "");
  await expect(field).toHaveAttribute("data-invalid", "");
  await expect(trigger).toHaveAttribute("aria-invalid", "true");
  await expect(trigger).toHaveAttribute("aria-describedby", "labels-description labels-error");
  await expect(trigger).toHaveAccessibleDescription("Pick one or more. Choose a label.");
  await page.getByTestId("write-labels").click();
  await expect(value).toHaveText("number:30,number:10");
  await expect(trigger).toHaveText("Docs,Bug");
  await expect(trigger).not.toHaveAttribute("aria-invalid", /.*/);

  // focusBoundControl() focuses the Trigger without opening the list.
  await page.getByTestId("focus-labels").click();
  await expect(trigger).toBeFocused();
  await frames(page);
  await expectClosed(trigger, content);

  // readonly(): opens on the first selected option in DOM order, moves, never toggles.
  await page.getByTestId("freeze-labels").click();
  await expect(trigger).toHaveAttribute("aria-readonly", "true");
  await trigger.click();
  await expectOpen(trigger, content);
  await expectActive(trigger, option(10), content);
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await expectActive(trigger, option(20), content);
  await page.keyboard.press(" ");
  await option(30).click();
  await frames(page);
  await expectOpen(trigger, content);
  await expect(value).toHaveText("number:30,number:10");
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  await page.getByTestId("freeze-labels").click();
  await expect(trigger).not.toHaveAttribute("aria-readonly", /.*/);

  // disabled(): the Trigger is natively disabled.
  await page.getByTestId("lock-labels").click();
  await expect(trigger).toBeDisabled();
  await expect(field).toHaveAttribute("data-disabled", "");
  await page.getByTestId("lock-labels").click();
  await expect(trigger).toBeEnabled();
});

for (const name of ["multiple-factory", "multiple-existing"]) {
  test(`Z17 O1 O3: ${name.replace("multiple-", "")} replacement Options of a host-composed ogSelectMultiple drive value, open and disabled over its contradicting own inputs, and the unused models emit nothing`, async ({
    page,
  }, info) => {
    await fixture(page, "select", info);

    const co = (role: string) => page.locator(`[data-case="${name}"] [data-co="${role}"]`);
    const trigger = co("trigger");
    const content = co("content");

    await expect(co("value")).toHaveText("2,7");
    await expect(co("selected")).toHaveText("Two");
    await expect(co("open")).toHaveText("false false");
    await expect(co("disabled")).toHaveText("true");
    await expect(trigger).toBeDisabled();
    await expect(co("option-2")).toHaveAttribute("aria-selected", "true");
    await expect(co("option-1")).toHaveAttribute("aria-selected", "false");
    await expect(content).toHaveAttribute("aria-multiselectable", "true");
    expect(await shown(content)()).toBe(false);

    await co("enable").click();
    await expect(trigger).toBeEnabled();
    await trigger.click();
    await expectOpen(trigger, content);
    await expect(co("open")).toHaveText("true true");
    await expectActive(trigger, co("option-2"), content);
    await co("option-1").click();
    await expect(co("value")).toHaveText("2,7,1");
    await co("option-2").click();
    await expect(co("value")).toHaveText("7,1");
    await expect(co("selected")).toHaveText("One");
    await expectOpen(trigger, content);
    await page.keyboard.press("Escape");
    await expectClosed(trigger, content);
    await expect(co("open")).toHaveText("false false");
    await expect(co("unused-outputs")).toHaveText("0");
  });
}

test("Z18: the list takes the Trigger's static aria-label while nothing names it by aria-labelledby; Content's own static aria-label wins; a bound Trigger aria-label isn't copied; a Label or a Trigger that comes and goes updates it", async ({
  page,
}, info) => {
  const copied = page.getByTestId("copied-content");
  const own = page.getByTestId("own-content");
  const referenced = page.getByTestId("referenced-content");
  const bound = page.getByTestId("bound-content");
  const late = page.getByTestId("naming-late-content");

  await fixture(page, "select", info, async () => {
    await expect(copied).toHaveAttribute("aria-label", "Copied name");
    await expect(own).toHaveAttribute("aria-label", "Own name");
    await expect(referenced).not.toHaveAttribute("aria-label", /.*/);
    await expect(bound).not.toHaveAttribute("aria-label", /.*/);
    await expect(late).toHaveAttribute("aria-label", "Late name");
  });

  // Copied from the Trigger; the listbox is named by it.
  await expect(copied).toHaveAttribute("aria-label", "Copied name");
  await expect(copied).not.toHaveAttribute("aria-labelledby", /.*/);
  await page.getByTestId("copied-trigger").click();
  await expectOpen(page.getByTestId("copied-trigger"), copied);
  await expect(copied).toHaveAccessibleName("Copied name");
  await page.getByTestId("copied-one").click();
  await expectClosed(page.getByTestId("copied-trigger"), copied);
  await expect(copied).toHaveAttribute("aria-label", "Copied name");

  // Content's own static aria-label wins over the Trigger's.
  await expect(own).toHaveAttribute("aria-label", "Own name");
  await page.getByTestId("own-trigger").click();
  await expect(own).toHaveAccessibleName("Own name");
  await page.keyboard.press("Escape");

  // Content's own static aria-labelledby: no aria-label is copied.
  await expect(referenced).toHaveAttribute("aria-labelledby", "naming-heading");
  await expect(referenced).not.toHaveAttribute("aria-label", /.*/);
  await page.getByTestId("referenced-trigger").click();
  await expect(referenced).toHaveAccessibleName("List names");
  await page.keyboard.press("Escape");

  // A bound Trigger aria-label names the Trigger only.
  await expect(page.getByTestId("bound-trigger")).toHaveAccessibleName("Bound name");
  await expect(bound).not.toHaveAttribute("aria-label", /.*/);
  await expect(bound).not.toHaveAttribute("aria-labelledby", /.*/);

  // A Field Label arriving replaces the copy by aria-labelledby, and leaving restores it.
  await page.getByTestId("toggle-naming-late-label").click();
  await expect(page.getByTestId("naming-late-trigger")).toHaveAttribute(
    "aria-labelledby",
    "naming-late-label",
  );
  await expect(late).toHaveAttribute("aria-labelledby", "naming-late-label");
  await expect(late).not.toHaveAttribute("aria-label", /.*/);
  await page.getByTestId("toggle-naming-late-label").click();
  await expect(late).not.toHaveAttribute("aria-labelledby", /.*/);
  await expect(late).toHaveAttribute("aria-label", "Late name");

  // The copy goes with the Trigger and returns with a new one.
  await page.getByTestId("toggle-naming-late-trigger").click();
  await expect(page.getByTestId("naming-late-trigger")).toHaveCount(0);
  await expect(late).not.toHaveAttribute("aria-label", /.*/);
  await page.getByTestId("toggle-naming-late-trigger").click();
  await expect(late).toHaveAttribute("aria-label", "Late name");
});
