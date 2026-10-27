import { test, expect } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import { fixture } from "./observation.js";
import { expectPreferred } from "./geometry.js";

// MN means the Menu section. Cases run against the `menu` fixture; MN8's replay runs in
// hydration.spec.ts.

declare global {
  interface Window {
    menuBodyWatch?: { seen: boolean; stop: () => void };
    menuKeys?: string[];
    menuLinkClicks?: string[];
    menuPointer?: { x: number; y: number };
  }
}

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

/**
 * Records whether focus ever falls to the body (or nothing) from now on: every animation frame,
 * and every `focusout` that moves focus nowhere. `stopBodyWatch` reads and ends it.
 */
async function watchBody(page: Page): Promise<void> {
  await page.evaluate(() => {
    const watch = { seen: false, stop: () => {} };
    let running = true;
    const lost = (event: FocusEvent) => {
      if (event.relatedTarget === null) {
        watch.seen = true;
      }
    };
    const sample = () => {
      const active = document.activeElement;

      if (active === null || active === document.body) {
        watch.seen = true;
      }

      if (running) {
        requestAnimationFrame(sample);
      }
    };

    document.addEventListener("focusout", lost, true);
    requestAnimationFrame(sample);
    watch.stop = () => {
      running = false;
      document.removeEventListener("focusout", lost, true);
    };
    window.menuBodyWatch = watch;
  });
}

async function stopBodyWatch(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const watch = window.menuBodyWatch;

    watch?.stop();

    return watch?.seen ?? true;
  });
}

function fileParts(page: Page) {
  return {
    trigger: page.getByTestId("file-trigger"),
    content: page.getByTestId("file-content"),
    item: (name: string) => page.getByTestId(`file-${name}`),
    selected: page.getByTestId("file-selected"),
    open: page.getByTestId("file-state"),
    openOutputs: page.getByTestId("file-open-outputs"),
    saveClicks: page.getByTestId("save-clicks"),
  };
}

test("MN1: the Trigger is a menu button controlling a menu named by it; every item is a menuitem with tabindex -1, so the menu adds no Tab stop; a disabled item stays focusable; a group is named by its label and a separator is a separator", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const { trigger, content, item, open } = fileParts(page);
  const triggerId = await trigger.getAttribute("id");

  expect(triggerId).toMatch(/\S/);
  await expect(trigger).toHaveAttribute("type", "button");
  await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toHaveAttribute("aria-controls", (await content.getAttribute("id")) ?? "");
  await expect(content).toHaveAttribute("role", "menu");
  await expect(content).toHaveAttribute("popover", "manual");
  await expect(content).toHaveAttribute("inert", "");
  await expect(content).toHaveAttribute("tabindex", "-1");
  await expect(content).toHaveAttribute("aria-labelledby", triggerId ?? "");
  await expect(content).not.toHaveAttribute("aria-orientation", /.*/);

  for (const name of ["new", "open", "recent", "save", "share", "duplicate", "pdf", "csv"]) {
    await expect(item(name)).toHaveAttribute("role", "menuitem");
    await expect(item(name)).toHaveAttribute("tabindex", "-1");
    await expect(item(name)).toHaveAttribute("type", "button");
  }

  await expect(item("save")).toHaveAttribute("aria-disabled", "true");
  await expect(item("save")).toHaveAttribute("data-disabled", "");
  await expect(item("save")).not.toHaveAttribute("disabled", /.*/);
  await expect(item("new")).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(item("new")).not.toHaveAttribute("data-disabled", /.*/);
  await expect(page.getByTestId("file-separator")).toHaveAttribute("role", "separator");
  await expect(page.getByTestId("file-separator")).not.toHaveAttribute("tabindex", /.*/);

  const label = page.getByTestId("file-export-label");

  await expect(label).toHaveAttribute("id", /\S/);
  await expect(label).not.toHaveAttribute("tabindex", /.*/);
  await expect(page.getByTestId("file-export")).toHaveAttribute("role", "group");
  await expect(page.getByTestId("file-export")).toHaveAttribute(
    "aria-labelledby",
    (await label.getAttribute("id")) ?? "",
  );

  const link = page.getByTestId("row-edit-1");

  await expect(link).toHaveAttribute("role", "menuitem");
  await expect(link).toHaveAttribute("tabindex", "-1");
  await expect(link).toHaveAttribute("href", /edit=1/);
  await expect(page.getByTestId("row-trigger-1")).toHaveAttribute(
    "aria-label",
    "Actions for row 1",
  );

  // Closed: Tab passes from the Trigger to what follows the menu.
  await page.getByTestId("before").focus();
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("after")).toBeFocused();

  // Open by a model write, which moves no focus: still no Tab stop in the menu.
  await page.getByTestId("open-file").click();
  await expectOpen(trigger, content);
  await expect(open).toHaveText("true true");
  await expect(page.getByTestId("open-file")).toBeFocused();
  await expect(page.getByRole("menu", { name: "File" })).toHaveAttribute(
    "data-testid",
    "file-content",
  );
  await expect(page.getByRole("group", { name: "Export" })).toHaveAttribute(
    "data-testid",
    "file-export",
  );
  await trigger.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("after")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  await expect(open).toHaveText("false false");
});

test("MN2: Enter, Space and ArrowDown open on the first item and ArrowUp on the last, each once, without the button's own click toggling it again and without focus touching the body; a click opens on the first item in every engine; a model write moves no focus", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const { trigger, content, item, openOutputs } = fileParts(page);
  let outputs = 0;

  for (const [key, target] of [
    ["Enter", "new"],
    [" ", "new"],
    ["ArrowDown", "new"],
    ["ArrowUp", "csv"],
  ] as const) {
    await trigger.focus();
    await watchBody(page);
    await page.keyboard.press(key);
    await expect(item(target)).toBeFocused();
    await expectOpen(trigger, content);
    // Stays open: no native click re-toggled it after the key.
    await frames(page);
    expect(await shown(content)()).toBe(true);
    outputs += 1;
    await expect(openOutputs).toHaveText(String(outputs));
    expect(await stopBodyWatch(page), `${key}: focus fell to the body`).toBe(false);
    await page.keyboard.press("Escape");
    await expectClosed(trigger, content);
    await expect(trigger).toBeFocused();
    outputs += 1;
    await expect(openOutputs).toHaveText(String(outputs));
  }

  // A click: the first item, after the Trigger, in every engine.
  await trigger.click();
  await expect(item("new")).toBeFocused();
  await expectOpen(trigger, content);
  await expect(openOutputs).toHaveText(String(outputs + 1));
  // A click on the open Trigger closes it.
  await trigger.click();
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();

  // Items rendered only while Content is open.
  const gatedTrigger = page.getByTestId("gated-trigger");
  const gatedContent = page.getByTestId("gated-content");

  await gatedTrigger.focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("gated-last")).toBeFocused();
  await page.keyboard.press("Escape");
  await expectClosed(gatedTrigger, gatedContent);
  await gatedTrigger.click();
  await expect(page.getByTestId("gated-first")).toBeFocused();
  await page.keyboard.press("Escape");
  await expectClosed(gatedTrigger, gatedContent);

  // A model write opens without moving focus; ArrowDown on the Trigger then enters.
  await page.getByTestId("open-file").click();
  await expectOpen(trigger, content);
  await frames(page);
  await expect(page.getByTestId("open-file")).toBeFocused();
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(item("new")).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
});

test("MN3: arrows wrap, Home and End reach the ends, a disabled item is focused but inert, separators and labels are skipped; typeahead buffers, cycles, honours label overrides and lets Space join a search; a mouse moving over an item focuses it, touch doesn't, and a still pointer doesn't after a key", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const { trigger, content, item, selected } = fileParts(page);

  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(item("new")).toBeFocused();

  for (const name of ["open", "recent", "save", "share", "duplicate", "pdf", "csv", "new"]) {
    await page.keyboard.press("ArrowDown");
    await expect(item(name)).toBeFocused();
  }

  await page.keyboard.press("ArrowUp");
  await expect(item("csv")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(item("new")).toBeFocused();
  await page.keyboard.press("End");
  await expect(item("csv")).toBeFocused();
  await page.keyboard.press("Home");

  // Typeahead: a disabled item is a candidate, a repeated character cycles and wraps.
  await page.keyboard.press("s");
  await expect(item("save")).toBeFocused();
  await page.keyboard.press("s");
  await expect(item("share")).toBeFocused();
  await page.keyboard.press("s");
  await expect(item("save")).toBeFocused();
  await page.waitForTimeout(700);
  await page.keyboard.press("o");
  await expect(item("open")).toBeFocused();
  await page.keyboard.press("o");
  await expect(item("recent")).toBeFocused();
  await page.waitForTimeout(700);
  await page.keyboard.press("Home");
  // Space joins a running search instead of activating.
  await page.keyboard.type("open r");
  await expect(item("recent")).toBeFocused();
  await expect(content).not.toHaveAttribute("inert", /.*/);
  await expect(selected).toHaveText("");
  await page.waitForTimeout(700);
  // A label replaces the text: "Copy", not "Duplicate"; "cc" cycles on to CSV.
  await page.keyboard.press("c");
  await expect(item("duplicate")).toBeFocused();
  await page.keyboard.press("c");
  await expect(item("csv")).toBeFocused();
  await page.waitForTimeout(700);
  await page.keyboard.press("d");
  await expect(item("csv")).toBeFocused();
  await page.waitForTimeout(700);
  // A group label isn't an item.
  await page.keyboard.press("e");
  await expect(item("csv")).toBeFocused();
  await expect(selected).toHaveText("");

  // The mouse moving over an item focuses it.
  await page.evaluate(() => {
    document.addEventListener(
      "pointermove",
      (event) => {
        if (event.isTrusted) {
          window.menuPointer = { x: event.clientX, y: event.clientY };
        }
      },
      true,
    );
  });
  await item("share").hover();
  await expect(item("share")).toBeFocused();

  const point = await page.evaluate(() => window.menuPointer);

  expect(point).toBeDefined();

  const x = point?.x ?? 0;
  const y = point?.y ?? 0;

  // After a key, a pointer event at the pointer's last position isn't movement.
  await page.keyboard.press("ArrowDown");
  await expect(item("duplicate")).toBeFocused();
  await item("pdf").evaluate(
    (node, point) => {
      node.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerType: "mouse",
          clientX: point.x,
          clientY: point.y,
          bubbles: true,
        }),
      );
    },
    { x, y },
  );
  await frames(page);
  await expect(item("duplicate")).toBeFocused();
  // Touch and pen never move focus.
  for (const pointerType of ["touch", "pen"]) {
    await item("csv").evaluate(
      (node, options) => {
        node.dispatchEvent(
          new PointerEvent("pointermove", {
            pointerType: options.pointerType,
            clientX: options.x + 40,
            clientY: options.y + 40,
            bubbles: true,
          }),
        );
      },
      { x, y, pointerType },
    );
  }

  await frames(page);
  await expect(item("duplicate")).toBeFocused();
  // A real move does.
  await item("pdf").hover();
  await expect(item("pdf")).toBeFocused();
  // Hovering the disabled item focuses it too.
  await item("save").hover({ force: true });
  await expect(item("save")).toBeFocused();
  await expect(selected).toHaveText("");
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
});

test("MN4: a click, Enter or Space on an item emits (select) once with focus already on the Trigger and the menu closed; a disabled item emits nothing, stays open, and only its own (click) runs; an item composed through hostDirectives activates the same way", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const { trigger, content, item, selected, open, saveClicks } = fileParts(page);

  await trigger.click();
  await item("open").click();
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await expect(selected).toHaveText("open@file-trigger");
  await expect(open).toHaveText("false false");

  await page.keyboard.press("Enter");
  await expect(item("new")).toBeFocused();
  await page.keyboard.press("Enter");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await expect(selected).toHaveText("open@file-trigger,new@file-trigger");

  await page.keyboard.press("ArrowDown");
  await expect(item("new")).toBeFocused();
  await page.keyboard.press("s");
  await page.keyboard.press("s");
  await expect(item("share")).toBeFocused();
  await page.waitForTimeout(700);
  await page.keyboard.press(" ");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await expect(selected).toHaveText("open@file-trigger,new@file-trigger,share@file-trigger");

  // Disabled: the consumer's (click) is the escape hatch; (select) stays silent and the menu open.
  await trigger.click();
  await expect(item("new")).toBeFocused();
  // Forced: Playwright counts aria-disabled as not actionable.
  await item("save").click({ force: true });
  await frames(page);
  await expect(saveClicks).toHaveText("1");
  await expectOpen(trigger, content);
  await expect(item("save")).toBeFocused();
  await page.keyboard.press("Enter");
  await frames(page);
  await expect(saveClicks).toHaveText("2");
  await page.keyboard.press(" ");
  await frames(page);
  await expect(saveClicks).toHaveText("3");
  await expectOpen(trigger, content);
  await expect(selected).toHaveText("open@file-trigger,new@file-trigger,share@file-trigger");
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);

  // A consumer directive composing ogMenuItem through hostDirectives: its label and (select).
  const sortTrigger = page.getByTestId("sort-trigger");

  await sortTrigger.click();
  await expect(page.getByTestId("sort-name")).toBeFocused();
  await expect(page.getByTestId("sort-size")).toHaveAttribute("role", "menuitem");
  await expect(page.getByTestId("sort-size")).toHaveAttribute("type", "button");
  await page.keyboard.press("s");
  await expect(page.getByTestId("sort-size")).toBeFocused();
  await page.keyboard.press("Enter");
  await expectClosed(sortTrigger, page.getByTestId("sort-content"));
  await expect(page.getByTestId("sort-selected")).toHaveText("size@sort-trigger");
});

test("MN5: Delete… opens an AlertDialog that returns focus to the row's Trigger on Cancel and Escape, by click and by Enter, because (select) runs with focus on the Trigger; a confirmed delete that removes the row lands on the next row's Trigger with the README recipe, and on the table once no row is left", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = (row: number) => page.getByTestId(`row-trigger-${row}`);
  const menu = (row: number) => page.getByTestId(`row-menu-${row}`);
  const dialog = (row: number) => page.getByTestId(`row-dialog-${row}`);
  const modal = (row: number) => () => dialog(row).evaluate((node) => node.matches(":modal"));
  const selected = page.getByTestId("row-selected");

  // By click.
  await trigger(2).click();
  await expect(page.getByTestId("row-edit-2")).toBeFocused();
  await page.getByTestId("row-delete-2").click();
  await expect.poll(modal(2)).toBe(true);
  await expectClosed(trigger(2), menu(2));
  await expect(page.getByTestId("row-cancel-2")).toBeFocused();
  // The falsifier: the listener ran with focus on the Trigger.
  await expect(selected).toHaveText("delete@row-trigger-2");
  await frames(page);
  await expect(page.getByTestId("row-cancel-2")).toBeFocused();
  await page.getByTestId("row-cancel-2").click();
  await expect.poll(modal(2)).toBe(false);
  await expect(trigger(2)).toBeFocused();

  // By Enter, then Escape.
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("row-edit-2")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("row-delete-2")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(modal(2)).toBe(true);
  await expect(page.getByTestId("row-cancel-2")).toBeFocused();
  await expect(selected).toHaveText("delete@row-trigger-2,delete@row-trigger-2");
  await page.keyboard.press("Escape");
  await expect.poll(modal(2)).toBe(false);
  await expect(trigger(2)).toBeFocused();

  // Confirm: the row goes, and the recipe focuses the next row's Trigger.
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("row-delete-2")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(modal(2)).toBe(true);
  await page.getByTestId("row-confirm-2").click();
  await expect(page.getByTestId("rows")).toHaveText("1,3");
  await expect(trigger(3)).toBeFocused();
  // The last row: the previous one's Trigger.
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("row-delete-3")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(modal(3)).toBe(true);
  await page.getByTestId("row-confirm-3").click();
  await expect(page.getByTestId("rows")).toHaveText("1");
  await expect(trigger(1)).toBeFocused();
  // The final row: the table.
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("row-delete-1")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(modal(1)).toBe(true);
  await page.getByTestId("row-confirm-1").click();
  await expect(page.getByTestId("rows")).toHaveText("");
  await expect(page.getByTestId("rows-table")).toBeFocused();
});

test("MN6: Tab and Shift+Tab from an item close the menu and land after and before the Trigger, also with Content that doesn't follow the Trigger", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = (row: number) => page.getByTestId(`row-trigger-${row}`);
  const menu = (row: number) => page.getByTestId(`row-menu-${row}`);

  await trigger(2).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("row-edit-2")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(trigger(3)).toBeFocused();
  await expectClosed(trigger(2), menu(2));
  await trigger(2).focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("row-delete-2")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(trigger(1)).toBeFocused();
  await expectClosed(trigger(2), menu(2));

  // Content after another control: Tab continues from the Trigger, not from Content.
  const sortTrigger = page.getByTestId("sort-trigger");
  const sortContent = page.getByTestId("sort-content");

  await sortTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sort-name")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("between-sort")).toBeFocused();
  await expectClosed(sortTrigger, sortContent);
  await expect(page.getByTestId("sort-open")).toHaveText("false");
  await sortTrigger.click();
  await expect(page.getByTestId("sort-name")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByTestId("before-sort")).toBeFocused();
  await expectClosed(sortTrigger, sortContent);
});

test("MN7: a link item follows its RouterLink on Enter, Space and a click and closes the menu with (select); Ctrl and middle clicks keep it open and are never prevented", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = (row: number) => page.getByTestId(`row-trigger-${row}`);
  const menu = (row: number) => page.getByTestId(`row-menu-${row}`);
  const edit = (row: number) => page.getByTestId(`row-edit-${row}`);
  const selected = page.getByTestId("row-selected");

  await trigger(1).focus();
  await page.keyboard.press("Enter");
  await expect(edit(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/[?&]edit=1\b/);
  await expectClosed(trigger(1), menu(1));
  await expect(trigger(1)).toBeFocused();
  await expect(selected).toHaveText("edit@row-trigger-1");

  await trigger(2).click();
  await edit(2).click();
  await expect(page).toHaveURL(/[?&]edit=2\b/);
  await expectClosed(trigger(2), menu(2));
  await expect(trigger(2)).toBeFocused();

  await trigger(3).focus();
  await page.keyboard.press("ArrowDown");
  await expect(edit(3)).toBeFocused();
  await page.keyboard.press(" ");
  await expect(page).toHaveURL(/[?&]edit=3\b/);
  await expectClosed(trigger(3), menu(3));
  await expect(selected).toHaveText("edit@row-trigger-1,edit@row-trigger-2,edit@row-trigger-3");

  // Modified and middle clicks: the page records whether anything prevented them, then keeps the
  // browser from opening a tab.
  await page.evaluate(() => {
    const clicks: string[] = [];
    const record = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[ogMenuLink], a[role=menuitem]")
      ) {
        clicks.push(`${event.type}:${event.button}:${event.defaultPrevented}`);
        event.preventDefault();
      }
    };

    document.addEventListener("click", record);
    document.addEventListener("auxclick", record);
    window.menuLinkClicks = clicks;
  });
  await trigger(1).click();
  await expect(edit(1)).toBeFocused();
  await edit(1).click({ modifiers: ["ControlOrMeta"] });
  await frames(page);
  await expectOpen(trigger(1), menu(1));
  await edit(1).click({ button: "middle" });
  await frames(page);
  await expectOpen(trigger(1), menu(1));
  await expect(page).toHaveURL(/[?&]edit=3\b/);
  await expect(selected).toHaveText("edit@row-trigger-1,edit@row-trigger-2,edit@row-trigger-3");

  const clicks = await page.evaluate(() => window.menuLinkClicks ?? []);

  expect(clicks).toContain("click:0:false");
  expect(clicks).toContain("auxclick:1:false");

  for (const click of clicks) {
    expect(click).toMatch(/:false$/);
  }

  await page.keyboard.press("Escape");
  await expectClosed(trigger(1), menu(1));
});

test("MN8: in a Dialog and in Popover Content the first Escape closes only the menu, also an Escape in the opening frame, and an activation keeps the enclosing layer open; a Tooltip on the Trigger closes when the menu opens", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  // Dialog.
  const dialogTrigger = page.getByTestId("dialog-menu-trigger");
  const dialogMenu = page.getByTestId("dialog-menu-content");
  const dialogState = page.getByTestId("dialog-state");
  const modal = () => page.getByTestId("dialog-content").evaluate((node) => node.matches(":modal"));

  await page.getByTestId("dialog-trigger").click();
  await expect.poll(modal).toBe(true);
  await dialogTrigger.click();
  await expect(page.getByTestId("dialog-menu-rename")).toBeFocused();
  await expect(dialogState).toHaveText("true true");
  await page.keyboard.press("Escape");
  await expectClosed(dialogTrigger, dialogMenu);
  await expect(dialogState).toHaveText("true false");
  expect(await modal()).toBe(true);
  await expect(dialogTrigger).toBeFocused();
  // Escape in the same task as the opening key, before the menu is presented.
  const early = await dialogTrigger.evaluate((node) => {
    const menu = document.querySelector('[data-testid="dialog-menu-content"]');
    const opening = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });

    node.dispatchEvent(opening);

    const presented = menu?.matches(":popover-open") ?? null;

    node.dispatchEvent(escape);

    return { opened: opening.defaultPrevented, presented, consumed: escape.defaultPrevented };
  });

  expect(early).toEqual({ opened: true, presented: false, consumed: true });
  await expectClosed(dialogTrigger, dialogMenu);
  await frames(page);
  expect(await modal()).toBe(true);
  await expect(dialogState).toHaveText("true false");
  await dialogTrigger.focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("dialog-menu-archive")).toBeFocused();
  await page.keyboard.press("Enter");
  await expectClosed(dialogTrigger, dialogMenu);
  await expect(dialogTrigger).toBeFocused();
  expect(await modal()).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(modal).toBe(false);
  await expect(dialogState).toHaveText("false false");

  // Popover Content.
  const popoverContent = page.getByTestId("popover-content");
  const popoverTrigger = page.getByTestId("popover-menu-trigger");
  const popoverMenu = page.getByTestId("popover-menu-content");
  const popoverState = page.getByTestId("popover-state");

  await page.getByTestId("popover-trigger").click();
  await expect.poll(shown(popoverContent)).toBe(true);
  await popoverTrigger.click();
  await expect(page.getByTestId("popover-menu-recent")).toBeFocused();
  await expect(popoverState).toHaveText("true true");
  await page.keyboard.press("Escape");
  await expectClosed(popoverTrigger, popoverMenu);
  await expect(popoverState).toHaveText("true false");
  await expect(popoverTrigger).toBeFocused();
  expect(await shown(popoverContent)()).toBe(true);
  await popoverTrigger.click();
  await page.getByTestId("popover-menu-starred").click();
  await expectClosed(popoverTrigger, popoverMenu);
  await expect(popoverTrigger).toBeFocused();
  await expect(popoverState).toHaveText("true false");
  expect(await shown(popoverContent)()).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(shown(popoverContent)).toBe(false);
  await expect(popoverState).toHaveText("false false");

  // A Tooltip on the Trigger.
  const tipTrigger = page.getByTestId("tip-trigger");
  const tipContent = page.getByTestId("tip-content");
  const tipMenu = page.getByTestId("tip-menu-content");
  const tipState = page.getByTestId("tip-state");

  await expect(tipTrigger).toHaveAttribute(
    "aria-describedby",
    (await tipContent.getAttribute("id")) ?? "",
  );
  await tipTrigger.hover();
  await expect.poll(shown(tipContent)).toBe(true);
  await expect(tipState).toHaveText("true false");
  await tipTrigger.click();
  await expectOpen(tipTrigger, tipMenu);
  await expect(page.getByTestId("tip-menu-pin")).toBeFocused();
  await expect(tipState).toHaveText("false true");
  await expect.poll(shown(tipContent)).toBe(false);
  await page.keyboard.press("Escape");
  await expectClosed(tipTrigger, tipMenu);
});

test("MN8: server HTML is closed with the menu's roles, names and tabindex, and hydration keeps it; items in a deferred block are reachable only once they hydrate, and a menu whose items all wait holds focus on Content until the first arrives", async ({
  page,
}, info) => {
  const { trigger, content, item } = fileParts(page);
  const incremental = info.project.metadata.hydration === "incremental";

  await fixture(page, "menu", info, async () => {
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toHaveAttribute(
      "aria-controls",
      (await content.getAttribute("id")) ?? "",
    );
    await expect(content).toHaveAttribute("role", "menu");
    await expect(content).toHaveAttribute("popover", "manual");
    await expect(content).toHaveAttribute("inert", "");
    await expect(content).toHaveAttribute("tabindex", "-1");
    await expect(content).toHaveAttribute(
      "aria-labelledby",
      (await trigger.getAttribute("id")) ?? "",
    );
    await expect(item("new")).toHaveAttribute("role", "menuitem");
    await expect(item("new")).toHaveAttribute("tabindex", "-1");
    await expect(item("save")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("file-export")).toHaveAttribute(
      "aria-labelledby",
      (await page.getByTestId("file-export-label").getAttribute("id")) ?? "",
    );

    if (incremental) {
      await expect(page.getByTestId("deferred-late-2")).toHaveCount(1);
      await expect(page.getByTestId("deferred-block-attached")).toHaveText("false");
    }
  });

  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(content).toHaveAttribute(
    "aria-labelledby",
    (await trigger.getAttribute("id")) ?? "",
  );

  const deferredTrigger = page.getByTestId("deferred-trigger");
  const deferredContent = page.getByTestId("deferred-content");
  const waitingTrigger = page.getByTestId("waiting-trigger");
  const waitingContent = page.getByTestId("waiting-content");

  if (incremental) {
    // Dehydrated items can't be reached.
    await deferredTrigger.focus();
    await page.keyboard.press("ArrowUp");
    await expectOpen(deferredTrigger, deferredContent);
    await expect(page.getByTestId("deferred-early")).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByTestId("deferred-early")).toBeFocused();
    await page.keyboard.press("Escape");
    await expectClosed(deferredTrigger, deferredContent);
    // No item can take focus yet: Content holds it, and the first item takes it on arrival.
    await waitingTrigger.focus();
    await page.keyboard.press("Enter");
    await expectOpen(waitingTrigger, waitingContent);
    await expect(waitingContent).toBeFocused();
    await page.getByTestId("hydrate-deferred").evaluate((node) => (node as HTMLElement).click());
    await expect(page.getByTestId("waiting-first")).toBeFocused();
    await page.keyboard.press("Escape");
    await expectClosed(waitingTrigger, waitingContent);
  } else {
    await page.getByTestId("hydrate-deferred").click();
  }

  await expect(page.getByTestId("deferred-block-attached")).toHaveText("true");
  await deferredTrigger.focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("deferred-late-2")).toBeFocused();
  await page.keyboard.press("Escape");
  await expectClosed(deferredTrigger, deferredContent);
  await waitingTrigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("waiting-first")).toBeFocused();
  await page.keyboard.press("Escape");
});

/** A scripted click, which moves no focus. */
async function script(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).evaluate((node) => (node as HTMLElement).click());
}

test("MN9: Enter and Space while an opening hasn't reached its item keep the menu opening on the requested item; focus moved anywhere but the Trigger or the menu cancels a pending entry for good, also when it comes back or falls to the body", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = page.getByTestId("mounting-trigger");
  const open = page.getByTestId("mounting-open");

  // Enter and Space keydowns as the window sees them, after every handler.
  await page.evaluate(() => {
    const keys: string[] = [];

    window.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        keys.push(`${event.key}:${event.defaultPrevented}`);
      }
    });
    window.menuKeys = keys;
  });

  // ArrowUp, then Enter while Content isn't mounted: the menu can't be revealed yet.
  await trigger.focus();
  await page.keyboard.press("ArrowUp");
  await expect(open).toHaveText("true");
  await page.keyboard.press("Enter");
  await frames(page);
  await expect(open).toHaveText("true");
  await expect(trigger).toBeFocused();
  await script(page, "toggle-mounting-content");
  await expect(page.getByTestId("mounting-last")).toBeFocused();
  await expectOpen(trigger, page.getByTestId("mounting-content"));
  await page.keyboard.press("Escape");
  await expectClosed(trigger, page.getByTestId("mounting-content"));
  await expect(open).toHaveText("false");

  // A click, then Space.
  await script(page, "toggle-mounting-content");
  await expect(page.getByTestId("mounting-content")).toHaveCount(0);
  await trigger.click();
  await expect(open).toHaveText("true");
  await expect(trigger).toBeFocused();
  await page.keyboard.press(" ");
  await frames(page);
  await expect(open).toHaveText("true");
  await script(page, "toggle-mounting-content");
  await expect(page.getByTestId("mounting-first")).toBeFocused();
  await expectOpen(trigger, page.getByTestId("mounting-content"));
  await page.keyboard.press("Escape");

  const keys = await page.evaluate(() => window.menuKeys ?? []);

  expect(keys).toEqual(["Enter:true", " :true"]);

  // Focus leaves and comes back before the items arrive: they take nothing.
  const lateTrigger = page.getByTestId("late-trigger");
  const lateContent = page.getByTestId("late-content");

  await lateTrigger.focus();
  await page.keyboard.press("Enter");
  await expectOpen(lateTrigger, lateContent);
  await expect(lateContent).toBeFocused();
  await page.getByTestId("elsewhere").focus();
  await lateTrigger.focus();
  await script(page, "toggle-late-items");
  await expect(page.getByTestId("late-first")).toHaveCount(1);
  await frames(page);
  await expect(lateTrigger).toBeFocused();
  await page.keyboard.press("Escape");
  await expectClosed(lateTrigger, lateContent);

  // Focus leaves and falls to the body with the control's removal: the items take nothing.
  await script(page, "toggle-late-items");
  await expect(page.getByTestId("late-first")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expectOpen(lateTrigger, lateContent);
  await expect(lateContent).toBeFocused();
  await page.getByTestId("elsewhere").focus();
  await script(page, "toggle-elsewhere");
  await expect(page.getByTestId("elsewhere")).toHaveCount(0);
  await script(page, "toggle-late-items");
  await expect(page.getByTestId("late-first")).toHaveCount(1);
  await frames(page);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test("MN10: disabling the root or the Trigger while the menu is open closes it; an activation whose Trigger can't take focus still closes the menu and emits once", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = page.getByTestId("disabling-trigger");
  const content = page.getByTestId("disabling-content");
  const open = page.getByTestId("disabling-open");
  const selected = page.getByTestId("lifecycle-selected");

  for (const toggle of ["toggle-disabling-root", "toggle-disabling-trigger"]) {
    await trigger.click();
    await expect(page.getByTestId("disabling-first")).toBeFocused();
    await expect(open).toHaveText("true");
    await script(page, toggle);
    await expectClosed(trigger, content);
    await expect(open).toHaveText("false");
    await expect(trigger).toBeDisabled();
    await script(page, toggle);
    await expect(trigger).toBeEnabled();
  }

  // A Trigger that can't take focus, inert and then detached for the activation's task (put
  // back before the next render, so the Popover keeps its Anchor): the activation still closes
  // and emits, once each time, with focus left on the item.
  for (const block of ["inert", "detached"] as const) {
    await trigger.click();
    await expect(page.getByTestId("disabling-first")).toBeFocused();
    await trigger.evaluate((node, block) => {
      const first = document.querySelector('[data-testid="disabling-first"]');
      const parent = node.parentNode;
      const next = node.nextSibling;

      if (!(first instanceof HTMLElement) || !(node instanceof HTMLElement) || parent === null) {
        throw new Error("Missing the Disabling menu's parts");
      }

      if (block === "inert") {
        node.inert = true;
        first.click();
        node.inert = false;
      } else {
        node.remove();
        first.click();
        parent.insertBefore(node, next);
      }
    }, block);
    await expect(open).toHaveText("false");
    await expectClosed(trigger, content);
    await frames(page);
  }

  await expect(selected).toHaveText("first@disabling-first,first@disabling-first");
});

test("MN11: a Trigger focus handler that destroys the menu during an activation or a Tab exit ends it there: the destroyed menu writes no open, which its replacement shares and keeps, and emits nothing", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const open = page.getByTestId("teardown-open");
  const selected = page.getByTestId("lifecycle-selected");

  // Activation.
  await page.getByTestId("teardown-trigger-1").click();
  await expect(page.getByTestId("teardown-item-1")).toBeFocused();
  await expect(open).toHaveText("true");
  await script(page, "arm-teardown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("teardown-trigger-1")).toHaveCount(0);
  await expect.poll(shown(page.getByTestId("teardown-content-2"))).toBe(true);
  await frames(page);
  await expect(open).toHaveText("true");
  expect(await shown(page.getByTestId("teardown-content-2"))()).toBe(true);
  await expect(selected).toHaveText("");

  // Tab.
  await page.getByTestId("teardown-trigger-2").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("teardown-item-2")).toBeFocused();
  await script(page, "arm-teardown");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("teardown-trigger-2")).toHaveCount(0);
  await expect.poll(shown(page.getByTestId("teardown-content-3"))).toBe(true);
  await frames(page);
  await expect(open).toHaveText("true");
  expect(await shown(page.getByTestId("teardown-content-3"))()).toBe(true);
  await expect(selected).toHaveText("");
});

test("MN12: a close and a reopen written in one callback before the menu renders cancel a pending request, through the root's model, through replaced Options and after an Escape in the opening frame, and an openChange listener's inside a key's or a click's opening write keeps its request: the reopened menu focuses the requested item", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const cases = [
    { menu: "mounting", reopen: "reopen-mounting" },
    { menu: "mounting", reopen: "escape-reopen-mounting" },
    { menu: "replaced", reopen: "reopen-replaced" },
  ];

  for (const { menu, reopen } of cases) {
    const trigger = page.getByTestId(`${menu}-trigger`);
    const content = page.getByTestId(`${menu}-content`);
    const open = page.getByTestId(`${menu}-open`);

    // ArrowUp requests the last item while Content isn't mounted, so it stays pending.
    await expect(content).toHaveCount(0);
    await trigger.focus();
    await page.keyboard.press("ArrowUp");
    await expect(open).toHaveText("true");
    await script(page, reopen);
    await expectOpen(trigger, content);
    await frames(page);
    await expect(trigger).toBeFocused();
    await expect(open).toHaveText("true");

    await page.keyboard.press("Escape");
    await expectClosed(trigger, content);

    if (menu === "mounting") {
      await script(page, "toggle-mounting-content");
    }
  }

  // Restarting's listener closes and reopens the menu inside the opening's own write, which keeps
  // the opening; Content mounts after it.
  const trigger = page.getByTestId("restarting-trigger");
  const content = page.getByTestId("restarting-content");
  const open = page.getByTestId("restarting-open");

  for (const [opening, item] of [
    ["ArrowUp", "restarting-last"],
    ["click", "restarting-first"],
  ] as const) {
    await expect(content).toHaveCount(0);
    await script(page, "arm-restarting");

    if (opening === "click") {
      await trigger.click();
    } else {
      await trigger.focus();
      await page.keyboard.press(opening);
    }

    await expect(open).toHaveText("true");
    await script(page, "toggle-restarting-content");
    await expectOpen(trigger, content);
    await expect(page.getByTestId(item)).toBeFocused();
    await expect(open).toHaveText("true");

    await script(page, "close-restarting");
    await expectClosed(trigger, content);
    await script(page, "toggle-restarting-content");
  }
});

test("MN13: an item's focus handler that moves focus out of the menu while an opening focuses it keeps focus where it put it: Content doesn't take it back", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = page.getByTestId("redirect-trigger");
  const content = page.getByTestId("redirect-content");
  const elsewhere = page.getByTestId("redirect-elsewhere");

  await trigger.click();
  await expectOpen(trigger, content);
  await expect(elsewhere).toBeFocused();
  await frames(page);
  await expect(elsewhere).toBeFocused();
  await expect(content).not.toBeFocused();
});

test("MN14: a whole menu in a shadow root is named by its Trigger; Content with items that arrive late holds focus for a request, and the requested item takes it; a move to a control in that shadow root cancels the request for good, also when focus comes back to the Trigger", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = page.getByTestId("shadow-trigger");
  const content = page.getByTestId("shadow-content");
  const elsewhere = page.getByTestId("shadow-elsewhere");
  const inShadow = (testId: string) =>
    page.evaluate((testId) => {
      const host = document.querySelector("acceptance-menu-shadow");

      return host?.shadowRoot?.activeElement?.getAttribute("data-testid") === testId;
    }, testId);

  // Fallback focus inside the shadow root keeps the request; the late Last takes it.
  await trigger.focus();
  await page.keyboard.press("ArrowUp");
  await expectOpen(trigger, content);
  await expect(content).toHaveAccessibleName("Shadow");
  await expect.poll(() => inShadow("shadow-content")).toBe(true);
  await script(page, "toggle-shadow-items");
  await expect.poll(() => inShadow("shadow-last")).toBe(true);
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  await script(page, "toggle-shadow-items");

  // A move within the shadow root, staying there and then coming back to the Trigger.
  for (const back of [false, true]) {
    await expect(page.getByTestId("shadow-first")).toHaveCount(0);
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await expectOpen(trigger, content);
    await expect.poll(() => inShadow("shadow-content")).toBe(true);
    await elsewhere.focus();
    await expect.poll(() => inShadow("shadow-elsewhere")).toBe(true);

    if (back) {
      await trigger.focus();
    }

    await script(page, "toggle-shadow-items");
    await expect(page.getByTestId("shadow-first")).toHaveCount(1);
    await frames(page);

    if (back) {
      await expect(trigger).toBeFocused();
    } else {
      expect(await inShadow("shadow-elsewhere")).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expectClosed(trigger, content);
    await script(page, "toggle-shadow-items");
  }
});

test("MN15: a requested item that refuses focus, such as a hidden one, leaves focus on Content and the request pending: Enter on the Trigger meanwhile is consumed, and an item that arrives later takes it", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = page.getByTestId("refused-trigger");
  const content = page.getByTestId("refused-content");
  const open = page.getByTestId("refused-open");

  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expectOpen(trigger, content);
  await expect(content).toBeFocused();
  await frames(page);
  await expect(content).toBeFocused();

  await trigger.focus();
  await page.keyboard.press("Enter");
  await frames(page);
  await expect(open).toHaveText("true");
  await expectOpen(trigger, content);
  await expect(trigger).toBeFocused();

  await script(page, "toggle-refused-loaded");
  await expect(page.getByTestId("refused-loaded")).toBeFocused();
});

for (const name of ["menu-factory", "menu-existing"]) {
  test(`MN16 O1 O3: ${name.replace("menu-", "")} replacements of every host-composed part drive open, IDs, names, disabled policy, placement and typeahead labels over the composed parts' contradicting own inputs, and the unused model emits nothing`, async ({
    page,
  }, info) => {
    await fixture(page, "menu", info);

    const co = (role: string) => page.locator(`[data-case="${name}"] [data-co="${role}"]`);
    const trigger = co("trigger");
    const content = co("content");

    // Before any action, every effective replacement contradicts the own inputs.
    await expect(co("open")).toHaveText("false false");
    await expect(co("disabled")).toHaveText("true");
    expect(await shown(content)()).toBe(false);
    await expect(trigger).toHaveAttribute("id", `${name}-trigger`);
    await expect(trigger).toHaveAttribute("aria-controls", `${name}-content`);
    await expect(content).toHaveAttribute("id", `${name}-content`);
    await expect(content).toHaveAttribute("aria-labelledby", `${name}-trigger`);
    await expect(co("group-label")).toHaveAttribute("id", `${name}-group-label`);
    await expect(co("group")).toHaveAttribute("aria-labelledby", `${name}-group-label`);
    // The Menu's disabled with the replaced focusableWhenDisabled false: natively disabled.
    await expect(trigger).toBeDisabled();
    await expect(trigger).toHaveAttribute("aria-disabled", "true");
    // Items' disabled from their wrapper's required input.
    await expect(co("rename")).not.toHaveAttribute("aria-disabled", /.*/);
    await expect(co("archive")).toHaveAttribute("aria-disabled", "true");

    await co("enable").click();
    await expect(co("disabled")).toHaveText("false");
    await expect(trigger).toBeEnabled();
    // The replaced Trigger disabled policy, never its own input; the Menu stays enabled.
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
    await expect(co("rename")).toBeFocused();
    await expectPreferred(page, "inline-end", "center", 11, {
      anchor: `${name}-trigger`,
      content: `${name}-content`,
    });

    // Typeahead reads the replaced labels, never the text or the own label inputs. A close ends
    // a search, so each opening makes one; the last leaves the menu open on the disabled item.
    const searches = [
      { key: "l", focused: "share" },
      { key: "u", focused: "rename" },
      { key: "a", focused: "rename" },
      { key: "b", focused: "archive" },
    ];

    for (const [index, { key, focused }] of searches.entries()) {
      if (index > 0) {
        await trigger.click();
        await expectOpen(trigger, content);
        await expect(co("rename")).toBeFocused();
      }

      await page.keyboard.press(key);
      await expect(co(focused)).toBeFocused();

      if (focused !== "archive") {
        await page.keyboard.press("Escape");
        await expectClosed(trigger, content);
        await expect(co("open")).toHaveText("false false");
      }
    }

    // The replaced disabled item is focused and inert; the enabled one and the link activate.
    await expect(co("archive")).toBeFocused();
    await page.keyboard.press("Enter");
    await co("archive").click({ force: true });
    await frames(page);
    expect(await shown(content)()).toBe(true);
    await expect(co("selected")).toHaveText("");
    await co("rename").click();
    await expectClosed(trigger, content);
    await expect(co("open")).toHaveText("false false");
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expectOpen(trigger, content);
    await co("share").click();
    await expectClosed(trigger, content);
    await expect(co("selected")).toHaveText("rename,share");

    await co("ids").click();
    await expect(trigger).toHaveAttribute("id", `${name}-trigger-changed`);
    await expect(content).toHaveAttribute("id", `${name}-content-changed`);
    await expect(trigger).toHaveAttribute("aria-controls", `${name}-content-changed`);
    await expect(content).toHaveAttribute("aria-labelledby", `${name}-trigger-changed`);
    await expect(co("group-label")).toHaveAttribute("id", `${name}-group-label-changed`);
    await expect(co("group")).toHaveAttribute("aria-labelledby", `${name}-group-label-changed`);
    await expect(co("unused-outputs")).toHaveText("0");
  });
}

/** The focused element's test ID, inside open shadow roots too, or null. */
function deepFocus(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    let active = document.activeElement;

    while (active?.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }

    return active?.getAttribute("data-testid") ?? null;
  });
}

test("MN17: items in an open shadow root inside Content take the menu's keys and focus: entry, arrows and typeahead reach them, Tab and Shift+Tab close the menu from the Trigger's place, and removing the focused one repairs focus to the other", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = page.getByTestId("nested-trigger");
  const content = page.getByTestId("nested-content");
  const open = page.getByTestId("nested-open");

  await trigger.focus();
  await page.keyboard.press("Enter");
  await expectOpen(trigger, content);
  await expect.poll(() => deepFocus(page)).toBe("nested-alpha");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => deepFocus(page)).toBe("nested-bravo");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => deepFocus(page)).toBe("nested-alpha");
  await page.keyboard.press("b");
  await expect.poll(() => deepFocus(page)).toBe("nested-bravo");

  await page.keyboard.press("Tab");
  await expect(page.getByTestId("nested-after")).toBeFocused();
  await expectClosed(trigger, content);
  await expect(open).toHaveText("false");

  await trigger.focus();
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => deepFocus(page)).toBe("nested-bravo");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByTestId("nested-before")).toBeFocused();
  await expectClosed(trigger, content);
  await expect(open).toHaveText("false");

  // Bravo, reached by a move within the shadow root, is focused when it's removed: the roving
  // focus saw that move, which Content's own focus events never do.
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => deepFocus(page)).toBe("nested-alpha");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => deepFocus(page)).toBe("nested-bravo");
  await script(page, "toggle-nested-bravo");
  await expect.poll(() => deepFocus(page)).toBe("nested-alpha");
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await script(page, "toggle-nested-bravo");
});

test("MN18: a Space the Trigger handled, released on the item it focused, leaves no guard behind: Space on the open Trigger closes the menu through its click", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const { trigger, content, item, selected, openOutputs } = fileParts(page);

  await trigger.focus();
  await page.keyboard.down(" ");
  await expect(item("new")).toBeFocused();
  await expectOpen(trigger, content);
  await page.keyboard.up(" ");
  await frames(page);
  // The release on New is no press of its own: nothing activates and the menu stays open.
  await expect(selected).toHaveText("");
  expect(await shown(content)()).toBe(true);
  await expect(openOutputs).toHaveText("1");

  await trigger.focus();
  await page.keyboard.press(" ");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await expect(openOutputs).toHaveText("2");
  await expect(selected).toHaveText("");
});

test("MN19: items in a shadow root beside a light-DOM item follow the displayed order: an item inserted before the shadow host later, and a move of the host, change entry, Home, End and the arrows", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = page.getByTestId("nested-trigger");
  const content = page.getByTestId("nested-content");

  /** Opens with `key` on the Trigger, then presses each key, expecting focus on each item. */
  async function walk(key: string, steps: readonly (readonly [string, string])[]): Promise<void> {
    await trigger.focus();
    await page.keyboard.press(key);
    await expectOpen(trigger, content);

    for (const [press, focused] of steps) {
      if (press !== "") {
        await page.keyboard.press(press);
      }

      await expect.poll(() => deepFocus(page)).toBe(focused);
    }

    await page.keyboard.press("Escape");
    await expectClosed(trigger, content);
  }

  // Zero registers after Alpha and Bravo but is displayed before them.
  await script(page, "nested-zero-first");
  await walk("ArrowDown", [
    ["", "nested-zero"],
    ["ArrowDown", "nested-alpha"],
    ["ArrowDown", "nested-bravo"],
    ["ArrowDown", "nested-zero"],
    ["ArrowUp", "nested-bravo"],
    ["Home", "nested-zero"],
    ["End", "nested-bravo"],
  ]);
  await walk("ArrowUp", [
    ["", "nested-bravo"],
    ["ArrowUp", "nested-alpha"],
  ]);

  // The shadow host moves before Zero.
  await script(page, "nested-zero-last");
  await walk("Enter", [
    ["", "nested-alpha"],
    ["End", "nested-zero"],
    ["ArrowDown", "nested-alpha"],
    ["ArrowUp", "nested-zero"],
    ["ArrowUp", "nested-bravo"],
  ]);

  // And back after it.
  await script(page, "nested-zero-first");
  await walk("Enter", [
    ["", "nested-zero"],
    ["ArrowUp", "nested-bravo"],
    ["Home", "nested-zero"],
  ]);
});

test("MN20: a Space that joined a search and is released after Escape closed the menu leaves no guard behind: a fresh Space on an item of the reopened menu activates it once", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const { trigger, content, item, selected } = fileParts(page);

  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(item("new")).toBeFocused();
  await page.keyboard.press("o");
  await expect(item("open")).toBeFocused();
  // The held Space joins the search; Escape closes the menu onto the Trigger, where it's released.
  await page.keyboard.down(" ");
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await page.keyboard.up(" ");
  await frames(page);
  await expectClosed(trigger, content);
  await expect(selected).toHaveText("");

  await page.keyboard.press("ArrowDown");
  await expect(item("new")).toBeFocused();
  await page.keyboard.press(" ");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await expect(selected).toHaveText("new@file-trigger");
});

test("MN21: a blur that leaves an item in a shadow root inside Content focused, as a window switch does, keeps it the focused item: removing it repairs focus", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = page.getByTestId("nested-trigger");

  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => deepFocus(page)).toBe("nested-alpha");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => deepFocus(page)).toBe("nested-bravo");
  // The blur a window switch fires: the item keeps focus.
  await page.evaluate(() => {
    const bravo = document
      .querySelector("acceptance-menu-shadow-items")
      ?.shadowRoot?.querySelector("[data-testid='nested-bravo']");

    bravo?.dispatchEvent(new FocusEvent("blur"));
  });
  await frames(page);
  await expect.poll(() => deepFocus(page)).toBe("nested-bravo");
  await script(page, "toggle-nested-bravo");
  await expect.poll(() => deepFocus(page)).toBe("nested-alpha");
});

test("MN22: an openChange listener that moves focus out of the menu while a key or a click opens it keeps focus where it put it: neither the revealed menu nor Content or items that arrive later take it back", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = page.getByTestId("departing-trigger");
  const content = page.getByTestId("departing-content");
  const elsewhere = page.getByTestId("departing-elsewhere");

  async function close(): Promise<void> {
    await script(page, "close-departing");
    await expectClosed(trigger, content);
  }

  async function open(opening: string): Promise<void> {
    if (opening === "click") {
      await trigger.click();
    } else {
      await trigger.focus();
      await page.keyboard.press(opening);
    }
  }

  for (const opening of ["ArrowUp", "click"]) {
    // Content and items present: the reveal takes nothing.
    await open(opening);
    await expectOpen(trigger, content);
    await frames(page);
    await expect(elsewhere).toBeFocused();
    await close();

    // Content mounts after the opening.
    await script(page, "toggle-departing-content");
    await expect(content).toHaveCount(0);
    await open(opening);
    await expect(elsewhere).toBeFocused();
    await script(page, "toggle-departing-content");
    await expectOpen(trigger, content);
    await frames(page);
    await expect(elsewhere).toBeFocused();
    await close();

    // The items mount after the reveal: Content doesn't hold focus for them, and they take nothing.
    await script(page, "toggle-departing-items");
    await expect(page.getByTestId("departing-last")).toHaveCount(0);
    await open(opening);
    await expectOpen(trigger, content);
    await frames(page);
    await expect(elsewhere).toBeFocused();
    await script(page, "toggle-departing-items");
    await expect(page.getByTestId("departing-last")).toHaveCount(1);
    await frames(page);
    await expect(elsewhere).toBeFocused();
    await close();
  }
});
