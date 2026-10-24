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
