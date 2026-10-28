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
    menuMoves?: Record<string, number>;
    menuLastMoves?: Record<string, number>;
    menuFocused?: string[];
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

  // After a key, pointer events at the pointer's last position aren't movement: leaving Share for
  // PDF and moving on it there, as every engine sends when the items move under a still cursor.
  await page.keyboard.press("ArrowDown");
  await expect(item("duplicate")).toBeFocused();
  await item("pdf").evaluate(
    (node, point) => {
      node.ownerDocument.querySelector('[data-testid="file-share"]')?.dispatchEvent(
        new PointerEvent("pointerout", {
          pointerType: "mouse",
          clientX: point.x,
          clientY: point.y,
          relatedTarget: node,
          bubbles: true,
        }),
      );
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

function viewParts(page: Page) {
  return {
    trigger: page.getByTestId("view-trigger"),
    content: page.getByTestId("view-content"),
    item: (name: string) => page.getByTestId(`view-${name}`),
    values: page.getByTestId("view-values"),
    open: page.getByTestId("view-open"),
    selected: page.getByTestId("view-selected"),
    changes: page.getByTestId("view-changes"),
    order: page.getByTestId("view-order"),
  };
}

async function expectChecked(item: Locator, checked: boolean): Promise<void> {
  await expect(item).toHaveAttribute("aria-checked", String(checked));

  if (checked) {
    await expect(item).toHaveAttribute("data-checked", "");
  } else {
    await expect(item).not.toHaveAttribute("data-checked", /.*/);
  }
}

test("MN23: checkbox and radio items are menuitemcheckbox and menuitemradio buttons with tabindex -1 whose aria-checked and data-checked follow their bound state, in server HTML, through hydration and after external writes; a radio group is a group named by its label", async ({
  page,
}, info) => {
  const { item, values, changes } = viewParts(page);
  const initial = async () => {
    for (const name of ["owner", "due", "archived"]) {
      await expect(item(name)).toHaveAttribute("role", "menuitemcheckbox");
    }

    for (const name of ["compact", "comfortable", "spacious"]) {
      await expect(item(name)).toHaveAttribute("role", "menuitemradio");
    }

    for (const name of ["owner", "due", "archived", "compact", "comfortable", "spacious"]) {
      await expect(item(name)).toHaveAttribute("tabindex", "-1");
      await expect(item(name)).toHaveAttribute("type", "button");
    }

    await expectChecked(item("owner"), true);
    await expectChecked(item("due"), false);
    await expectChecked(item("archived"), false);
    await expectChecked(item("compact"), true);
    await expectChecked(item("comfortable"), false);
    await expectChecked(item("spacious"), false);
    await expect(item("archived")).toHaveAttribute("aria-disabled", "true");
    await expect(item("archived")).not.toHaveAttribute("disabled", /.*/);
    await expect(item("spacious")).toHaveAttribute("aria-disabled", "true");
    await expect(item("spacious")).not.toHaveAttribute("disabled", /.*/);
    await expect(item("owner-mark")).toHaveText("✓");
    await expect(item("compact-mark")).toHaveText("●");
    await expect(item("density")).toHaveAttribute("role", "group");
    await expect(item("density")).toHaveAttribute(
      "aria-labelledby",
      (await item("density-label").getAttribute("id")) ?? "",
    );
  };

  await fixture(page, "menu", info, initial);
  await initial();

  // External writes are the bound state the items reflect; they emit no change output.
  await script(page, "view-write");
  await expect(values).toHaveText("false true false comfortable");
  await expectChecked(item("owner"), false);
  await expectChecked(item("due"), true);
  await expectChecked(item("compact"), false);
  await expectChecked(item("comfortable"), true);
  await expect(item("owner-mark")).toHaveText("·");
  await expect(item("compact-mark")).toHaveText("○");
  await expect(changes).toHaveText("");

  await page.getByTestId("view-trigger").click();
  await expect(item("owner")).toBeFocused();
  await expect(item("content")).toHaveAccessibleName("View");
  await expect(item("columns")).toHaveAccessibleName("Columns");
  await expect(item("density")).toHaveAccessibleName("Density");
});

test("MN24: Space and a click toggle a checkbox item and select a radio item, leaving the menu open with focus on the item, and (select) and the change output run with focus on the item and the menu open; a held Space toggles once; an action item still closes", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const { trigger, content, item, values, selected, changes, order } = viewParts(page);

  await trigger.click();
  await expect(item("owner")).toBeFocused();
  await page.keyboard.press(" ");
  await frames(page);
  await expectOpen(trigger, content);
  await expect(item("owner")).toBeFocused();
  await expectChecked(item("owner"), false);
  await expect(values).toHaveText("false false false compact");
  await expect(selected).toHaveText("owner@view-owner@true");
  await expect(changes).toHaveText("owner@view-owner@true");
  // The state is written before (select), which reads it.
  await expect(order).toHaveText("owner.change,owner.select=false");

  await item("due").click();
  await frames(page);
  await expectOpen(trigger, content);
  await expect(item("due")).toBeFocused();
  await expectChecked(item("due"), true);
  await expect(selected).toHaveText("owner@view-owner@true,due@view-due@true");
  await expect(changes).toHaveText("owner@view-owner@true,due@view-due@true");

  await item("comfortable").click();
  await frames(page);
  await expectOpen(trigger, content);
  await expect(item("comfortable")).toBeFocused();
  await expectChecked(item("comfortable"), true);
  await expectChecked(item("compact"), false);
  await expect(values).toHaveText("false true false comfortable");
  await expect(selected).toHaveText(
    "owner@view-owner@true,due@view-due@true,comfortable@view-comfortable@true",
  );
  await expect(changes).toHaveText(
    "owner@view-owner@true,due@view-due@true,density@view-comfortable@true",
  );
  await expect(order).toHaveText(
    "owner.change,owner.select=false,due.change,due.select=true,density.change,comfortable.select=comfortable",
  );

  await page.keyboard.press("ArrowUp");
  await expect(item("compact")).toBeFocused();
  await page.keyboard.press(" ");
  await frames(page);
  await expectOpen(trigger, content);
  await expect(item("compact")).toBeFocused();
  await expect(values).toHaveText("false true false compact");

  // Held: the auto-repeated keydowns click nothing; the one release toggles once.
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(item("due")).toBeFocused();
  await page.keyboard.down(" ");
  await page.keyboard.down(" ");
  await page.keyboard.down(" ");
  await page.keyboard.down(" ");
  await frames(page);
  await expectChecked(item("due"), true);
  await page.keyboard.up(" ");
  await frames(page);
  await expectChecked(item("due"), false);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(item("comfortable")).toBeFocused();
  await page.keyboard.down(" ");
  await page.keyboard.down(" ");
  await page.keyboard.down(" ");
  await page.keyboard.up(" ");
  await frames(page);
  await expectOpen(trigger, content);
  await expect(values).toHaveText("false false false comfortable");
  await expect(selected).toHaveText(
    "owner@view-owner@true,due@view-due@true,comfortable@view-comfortable@true,compact@view-compact@true,due@view-due@true,comfortable@view-comfortable@true",
  );
  await expect(changes).toHaveText(
    "owner@view-owner@true,due@view-due@true,density@view-comfortable@true,density@view-compact@true,due@view-due@true,density@view-comfortable@true",
  );
  await expect(order).toHaveText(
    "owner.change,owner.select=false,due.change,due.select=true,density.change,comfortable.select=comfortable,density.change,compact.select=compact,due.change,due.select=false,density.change,comfortable.select=comfortable",
  );

  // An action item beside them still closes on Space.
  await page.keyboard.press("End");
  await expect(item("reset")).toBeFocused();
  await page.keyboard.press(" ");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await expect(selected).toHaveText(/,reset@view-trigger@false$/);
});

test("MN25: Enter and Shift+Enter toggle a checkbox item and select a radio item and close the menu: (select) and the change output run with focus on the Trigger and the menu closed; Ctrl+Enter clicks only in Firefox, which stays open, and activates nothing elsewhere; an Enter during IME composition activates nothing", async ({
  page,
  browserName,
}, info) => {
  await fixture(page, "menu", info);

  const { trigger, content, item, values, selected, changes, order } = viewParts(page);

  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(item("owner")).toBeFocused();
  await page.keyboard.press("Enter");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await expectChecked(item("owner"), false);
  await expect(selected).toHaveText("owner@view-trigger@false");
  await expect(changes).toHaveText("owner@view-trigger@false");
  // The state is written before (select), which reads it.
  await expect(order).toHaveText("owner.change,owner.select=false");

  await page.keyboard.press("ArrowDown");
  await expect(item("owner")).toBeFocused();
  await page.keyboard.press("c");
  await page.keyboard.press("c");
  await expect(item("comfortable")).toBeFocused();
  await page.keyboard.press("Enter");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await expect(values).toHaveText("false false false comfortable");
  await expectChecked(item("comfortable"), true);
  await expect(selected).toHaveText("owner@view-trigger@false,comfortable@view-trigger@false");
  await expect(changes).toHaveText("owner@view-trigger@false,density@view-trigger@false");
  await expect(order).toHaveText(
    "owner.change,owner.select=false,density.change,comfortable.select=comfortable",
  );

  // Shift+Enter is Enter.
  await page.keyboard.press("ArrowDown");
  await expect(item("owner")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(item("due")).toBeFocused();
  await page.keyboard.press("Shift+Enter");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(item("owner")).toBeFocused();
  await page.keyboard.press("c");
  await expect(item("compact")).toBeFocused();
  await page.keyboard.press("Shift+Enter");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await expect(values).toHaveText("false true false compact");
  await expect(selected).toHaveText(
    "owner@view-trigger@false,comfortable@view-trigger@false,due@view-trigger@false,compact@view-trigger@false",
  );
  await expect(order).toHaveText(
    "owner.change,owner.select=false,density.change,comfortable.select=comfortable,due.change,due.select=true,density.change,compact.select=compact",
  );

  // Ctrl+Enter isn't the menu's: Firefox clicks the button, a click like any other, which stays
  // open; Chromium and WebKit click nothing.
  await trigger.click();
  await expect(item("owner")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(item("due")).toBeFocused();
  await page.keyboard.press("Control+Enter");
  await frames(page);
  await expectOpen(trigger, content);
  await expect(item("due")).toBeFocused();

  if (browserName === "firefox") {
    await expectChecked(item("due"), false);
    await expect(selected).toHaveText(/,compact@view-trigger@false,due@view-due@true$/);
  } else {
    await expectChecked(item("due"), true);
    await expect(selected).toHaveText(/,compact@view-trigger@false$/);
  }

  // An Enter keydown during IME composition is the composition's; the same keydown outside one
  // is the item's.
  const before = await selected.textContent();
  const enter = async (isComposing: boolean) => {
    await item("due").evaluate((node, isComposing) => {
      node.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          isComposing,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, isComposing);
  };

  await enter(true);
  await frames(page);
  await expectOpen(trigger, content);
  await expect(item("due")).toBeFocused();
  await expect(selected).toHaveText(before ?? "");
  await enter(false);
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await expect(selected).toHaveText(/,due@view-trigger@false$/);
});

test("MN26: selecting the checked radio item never clears the group: Space, a click and Enter write nothing and still emit (select), and Enter still closes", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const { trigger, content, item, values, selected, changes } = viewParts(page);

  await trigger.click();
  await expect(item("owner")).toBeFocused();
  await page.keyboard.press("c");
  await expect(item("compact")).toBeFocused();
  // After the search, so Space doesn't join it.
  await page.waitForTimeout(700);
  await page.keyboard.press(" ");
  await frames(page);
  await item("compact").click();
  await frames(page);
  await expectOpen(trigger, content);
  await expect(item("compact")).toBeFocused();
  await expectChecked(item("compact"), true);
  await expect(values).toHaveText("true false false compact");
  await page.keyboard.press("Enter");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await expectChecked(item("compact"), true);
  await expect(values).toHaveText("true false false compact");
  await expect(selected).toHaveText(
    "compact@view-compact@true,compact@view-compact@true,compact@view-trigger@false",
  );
  await expect(changes).toHaveText("");
});

test("MN27: arrows, Home, End, typeahead, Space inside a search and hover move focus across checkbox and radio items without checking anything", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const { trigger, content, item, values, selected, changes } = viewParts(page);
  const order = ["owner", "due", "archived", "compact", "comfortable", "spacious", "reset"];

  await trigger.focus();
  await page.keyboard.press("ArrowDown");

  for (let step = 0; step < order.length + 1; step++) {
    await expect(item(order[step % order.length])).toBeFocused();
    await page.keyboard.press("ArrowDown");
  }

  await page.keyboard.press("ArrowUp");
  await expect(item("owner")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(item("reset")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(item("owner")).toBeFocused();
  await page.keyboard.press("End");
  await expect(item("reset")).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("c");
  await expect(item("compact")).toBeFocused();
  await page.keyboard.press("c");
  await expect(item("comfortable")).toBeFocused();
  await page.waitForTimeout(700);
  // Space joins the running search "due d" and clicks nothing.
  await page.keyboard.type("due d");
  await expect(item("due")).toBeFocused();
  await frames(page);
  await item("spacious").hover();
  await expect(item("spacious")).toBeFocused();
  await item("comfortable").hover();
  await expect(item("comfortable")).toBeFocused();
  await expectOpen(trigger, content);
  await expect(values).toHaveText("true false false compact");
  await expectChecked(item("owner"), true);
  await expectChecked(item("due"), false);
  await expectChecked(item("compact"), true);
  await expectChecked(item("comfortable"), false);
  await expect(selected).toHaveText("");
  await expect(changes).toHaveText("");
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
});

test("MN28: a disabled checkbox or radio item writes and emits nothing on a click, Enter or Space and keeps the menu open with focus on it; only its own (click) runs", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const { trigger, content, item, values, selected, changes } = viewParts(page);

  await trigger.click();
  await expect(item("owner")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(item("archived")).toBeFocused();
  // The menu leaves a disabled item's Enter alone: its native click runs the item's own (click).
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("archived-clicks")).toHaveText("1");
  await page.keyboard.press(" ");
  // Forced: Playwright counts aria-disabled as not actionable.
  await item("archived").click({ force: true });
  await frames(page);
  await expect(page.getByTestId("archived-clicks")).toHaveText("3");
  await expectOpen(trigger, content);
  await expect(item("archived")).toBeFocused();
  await expectChecked(item("archived"), false);

  await page.keyboard.press("End");
  await page.keyboard.press("ArrowUp");
  await expect(item("spacious")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("spacious-clicks")).toHaveText("1");
  await page.keyboard.press(" ");
  await item("spacious").click({ force: true });
  await frames(page);
  await expect(page.getByTestId("spacious-clicks")).toHaveText("3");
  await expectOpen(trigger, content);
  await expect(item("spacious")).toBeFocused();
  await expectChecked(item("spacious"), false);
  await expect(values).toHaveText("true false false compact");
  await expect(selected).toHaveText("");
  await expect(changes).toHaveText("");
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
});

test("MN29 O1: a checkbox item and a radio group composed through hostDirectives with factory Options read and write the replacement signals", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = page.getByTestId("wrapped-trigger");
  const content = page.getByTestId("wrapped-content");
  const pin = page.getByTestId("wrapped-pin");
  const values = page.getByTestId("wrapped-values");

  await expect(pin).toHaveAttribute("role", "menuitemcheckbox");
  await expectChecked(pin, true);
  await expectChecked(page.getByTestId("wrapped-name"), true);
  await expectChecked(page.getByTestId("wrapped-date"), false);
  await trigger.click();
  await expect(pin).toBeFocused();
  await page.keyboard.press(" ");
  await expectChecked(pin, false);
  await page.getByTestId("wrapped-date").click();
  await expectOpen(trigger, content);
  await expect(values).toHaveText("false date");
  await expectChecked(page.getByTestId("wrapped-name"), false);
  await expectChecked(page.getByTestId("wrapped-date"), true);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(pin).toBeFocused();
  await page.keyboard.press("Enter");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await expect(values).toHaveText("true date");
});

test("MN30: a Trigger focus handler or an openChange listener that replaces only the activating checkable item during Enter's activation writes nothing: a replacement sharing its Options keeps the state, the surviving group its value, and nothing is emitted", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = page.getByTestId("remounted-trigger");
  const content = page.getByTestId("remounted-content");
  const shared = (generation: number) => page.getByTestId(`remounted-shared-${generation}`);
  const grid = (generation: number) => page.getByTestId(`remounted-grid-${generation}`);
  const values = page.getByTestId("remounted-values");
  const log = page.getByTestId("remounted-log");

  // Each Enter replaces both items, so Shared and Grid move one generation on.
  for (const [when, generation] of [
    ["focus", 1],
    ["close", 3],
  ] as const) {
    await trigger.click();
    await expect(shared(generation)).toBeFocused();
    await script(page, `remount-on-${when}`);
    await page.keyboard.press("Enter");
    await expectClosed(trigger, content);
    await expect(trigger).toBeFocused();
    await expect(shared(generation)).toHaveCount(0);
    await expectChecked(shared(generation + 1), false);
    await expect(values).toHaveText("false list");

    await trigger.click();
    await expect(shared(generation + 1)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(grid(generation + 1)).toBeFocused();
    await script(page, `remount-on-${when}`);
    await page.keyboard.press("Enter");
    await expectClosed(trigger, content);
    await expect(trigger).toBeFocused();
    await expect(grid(generation + 1)).toHaveCount(0);
    await expectChecked(grid(generation + 2), false);
    await expectChecked(page.getByTestId("remounted-list"), true);
    await expect(values).toHaveText("false list");
  }

  await expect(log).toHaveText("");

  // Not replaced, the same Enter writes and emits.
  await trigger.click();
  await expect(shared(5)).toBeFocused();
  await page.keyboard.press("Enter");
  await expectClosed(trigger, content);
  await expect(values).toHaveText("true list");
  await trigger.click();
  await expect(shared(5)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(grid(5)).toBeFocused();
  await page.keyboard.press("Enter");
  await expectClosed(trigger, content);
  await expect(values).toHaveText("true grid");
  await expect(log).toHaveText("shared,layout,grid");
});

/**
 * Arms a listener for the next Enter `type` event on the `on` test ID: it clicks the `click` test
 * ID by script, unless null, then cancels the event if `cancel`. `heard` counts its runs in the
 * body's `data-heard`.
 */
async function onNextEnter(
  page: Page,
  on: string,
  type: "keydown" | "keypress",
  click: string | null,
  cancel: boolean,
): Promise<void> {
  await page.evaluate(
    ([on, type, click, cancel]) => {
      const target = document.querySelector(`[data-testid="${on}"]`);
      const listener = (event: Event) => {
        if (!(event instanceof KeyboardEvent) || event.key !== "Enter") {
          return;
        }

        target?.removeEventListener(type, listener);
        document.body.dataset["heard"] = String(Number(document.body.dataset["heard"] ?? 0) + 1);

        if (click !== null) {
          document.querySelector<HTMLElement>(`[data-testid="${click}"]`)?.click();
        }

        if (cancel) {
          event.preventDefault();
        }
      };

      target?.addEventListener(type, listener);
    },
    [on, type, click, cancel] as const,
  );
}

test("MN31: an Enter keydown a listener on the item cancels activates nothing; a script's click from a keydown listener on the item toggles or selects and stays open, canceled or not, and an uncanceled Enter then closes once", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const { trigger, content, item, values, selected, order } = viewParts(page);
  const heard = page.locator("body");

  await trigger.click();
  await expect(item("owner")).toBeFocused();

  // Canceled before Content's listener: nothing activates.
  await page.keyboard.press("ArrowDown");
  await expect(item("due")).toBeFocused();
  await onNextEnter(page, "view-due", "keydown", null, true);
  await page.keyboard.press("Enter");
  await frames(page);
  await expect(heard).toHaveAttribute("data-heard", "1");
  await expectOpen(trigger, content);
  await expect(item("due")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(item("comfortable")).toBeFocused();
  await onNextEnter(page, "view-comfortable", "keydown", null, true);
  await page.keyboard.press("Enter");
  await frames(page);
  await expect(heard).toHaveAttribute("data-heard", "2");
  await expectOpen(trigger, content);
  await expect(item("comfortable")).toBeFocused();
  await expect(values).toHaveText("true false false compact");
  await expect(selected).toHaveText("");

  // The script's click, then the cancel: the click toggles or selects once and stays open.
  await onNextEnter(page, "view-comfortable", "keydown", "view-comfortable", true);
  await page.keyboard.press("Enter");
  await frames(page);
  await expect(heard).toHaveAttribute("data-heard", "3");
  await expectOpen(trigger, content);
  await expect(item("comfortable")).toBeFocused();
  await expect(values).toHaveText("true false false comfortable");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await expect(item("due")).toBeFocused();
  await onNextEnter(page, "view-due", "keydown", "view-due", true);
  await page.keyboard.press("Enter");
  await frames(page);
  await expect(heard).toHaveAttribute("data-heard", "4");
  await expectOpen(trigger, content);
  await expect(item("due")).toBeFocused();
  await expect(values).toHaveText("true true false comfortable");
  await expect(selected).toHaveText("comfortable@view-comfortable@true,due@view-due@true");

  // Uncanceled: the script's click stays open, then Content's Enter closes, once.
  await onNextEnter(page, "view-due", "keydown", "view-due", false);
  await page.keyboard.press("Enter");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await expect(heard).toHaveAttribute("data-heard", "5");
  await expect(values).toHaveText("true true false comfortable");
  await expect(selected).toHaveText(
    "comfortable@view-comfortable@true,due@view-due@true,due@view-due@true,due@view-trigger@false",
  );
  await expect(order).toHaveText(/,due\.change,due\.select=false,due\.change,due\.select=true$/);

  await page.keyboard.press("ArrowDown");
  await expect(item("owner")).toBeFocused();
  await page.keyboard.press("c");
  await expect(item("compact")).toBeFocused();
  await onNextEnter(page, "view-compact", "keydown", "view-compact", false);
  await page.keyboard.press("Enter");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await expect(heard).toHaveAttribute("data-heard", "6");
  await expect(values).toHaveText("true true false compact");
  await expect(selected).toHaveText(/,compact@view-compact@true,compact@view-trigger@false$/);
  await expect(order).toHaveText(
    /,density\.change,compact\.select=compact,compact\.select=compact$/,
  );
});

test("MN32: a script's click from an Enter keypress listener toggles or selects and stays open, canceled or not; an enabled checkable item's Enter has no keypress, so such a listener never runs and the Enter closes once", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const { trigger, content, item, values, selected, order } = viewParts(page);
  const heard = page.locator("body");

  // A disabled item's Enter is left to the button, so its keypress runs: a Content listener
  // clicks another item by script, which stays open with focus where it was.
  await trigger.click();
  await expect(item("owner")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(item("archived")).toBeFocused();
  await onNextEnter(page, "view-content", "keypress", "view-due", true);
  await page.keyboard.press("Enter");
  await frames(page);
  await expect(heard).toHaveAttribute("data-heard", "1");
  await expectOpen(trigger, content);
  await expect(item("archived")).toBeFocused();
  await expect(values).toHaveText("true true false compact");
  await expect(selected).toHaveText("due@view-archived@true");
  // Canceling the keypress cancels the button's own click.
  await expect(page.getByTestId("archived-clicks")).toHaveText("0");

  await onNextEnter(page, "view-content", "keypress", "view-due", false);
  await page.keyboard.press("Enter");
  await frames(page);
  await expect(heard).toHaveAttribute("data-heard", "2");
  await expectOpen(trigger, content);
  await expect(item("archived")).toBeFocused();
  await expect(values).toHaveText("true false false compact");
  await expect(selected).toHaveText("due@view-archived@true,due@view-archived@true");
  await expect(page.getByTestId("archived-clicks")).toHaveText("1");

  await page.keyboard.press("End");
  await page.keyboard.press("ArrowUp");
  await expect(item("spacious")).toBeFocused();
  await onNextEnter(page, "view-content", "keypress", "view-comfortable", true);
  await page.keyboard.press("Enter");
  await frames(page);
  await expect(heard).toHaveAttribute("data-heard", "3");
  await onNextEnter(page, "view-content", "keypress", "view-compact", false);
  await page.keyboard.press("Enter");
  await frames(page);
  await expect(heard).toHaveAttribute("data-heard", "4");
  await expectOpen(trigger, content);
  await expect(item("spacious")).toBeFocused();
  await expect(values).toHaveText("true false false compact");
  await expect(selected).toHaveText(/,comfortable@view-spacious@true,compact@view-spacious@true$/);
  await expect(page.getByTestId("spacious-clicks")).toHaveText("1");

  // Content cancels an enabled checkable item's Enter keydown, which cancels its keypress too.
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await expect(item("due")).toBeFocused();
  await onNextEnter(page, "view-content", "keypress", "view-due", false);
  await page.keyboard.press("Enter");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  await expect(values).toHaveText("true true false compact");
  await expect(selected).toHaveText(/,compact@view-spacious@true,due@view-trigger@false$/);
  await expect(order).toHaveText(/,compact\.select=compact,due\.change,due\.select=true$/);
  await expect(heard).toHaveAttribute("data-heard", "4");
});

function editParts(page: Page) {
  return {
    trigger: page.getByTestId("edit-trigger"),
    content: page.getByTestId("edit-content"),
    item: (name: string) => page.getByTestId(`edit-${name}`),
    move: page.getByTestId("edit-move"),
    moveContent: page.getByTestId("move-content"),
    moveItem: (name: string) => page.getByTestId(`move-${name}`),
    more: page.getByTestId("move-more"),
    moreContent: page.getByTestId("more-content"),
    share: page.getByTestId("edit-share"),
    shareContent: page.getByTestId("share-content"),
    exportTrigger: page.getByTestId("edit-export"),
    exportContent: page.getByTestId("export-content"),
    state: page.getByTestId("edit-state"),
    selected: page.getByTestId("edit-selected"),
    changes: page.getByTestId("edit-changes"),
  };
}

/** The last `count` entries of a comma-separated log. */
async function tail(log: Locator, count: number): Promise<string> {
  const text = (await log.textContent()) ?? "";

  return text.split(",").slice(-count).join(",");
}

/**
 * Records, from now on, the page clock's time of the first and the last mouse `pointermove` on each
 * element with a `data-testid`, and every item a `focusin` reaches, in `menuMoves`,
 * `menuLastMoves` and `menuFocused`.
 */
async function watchPointer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const moves: Record<string, number> = {};
    const lastMoves: Record<string, number> = {};
    const focused: string[] = [];

    window.menuMoves = moves;
    window.menuLastMoves = lastMoves;
    window.menuFocused = focused;
    document.addEventListener(
      "pointermove",
      (event) => {
        const target = event.target;
        const id = target instanceof Element ? target.getAttribute("data-testid") : null;

        if (event.pointerType === "mouse" && id !== null && window.menuMoves === moves) {
          const now = performance.now();

          moves[id] ??= now;
          lastMoves[id] = now;
        }
      },
      true,
    );
    document.addEventListener(
      "focusin",
      (event) => {
        const target = event.target;

        if (target instanceof Element && window.menuFocused === focused) {
          focused.push(target.getAttribute("data-testid") ?? "none");
        }
      },
      true,
    );
  });
}

async function firstMove(page: Page, testId: string): Promise<number> {
  return page.evaluate((id) => window.menuMoves?.[id] ?? Number.NaN, testId);
}

async function focusedSince(page: Page): Promise<string[]> {
  return page.evaluate(() => [...(window.menuFocused ?? [])]);
}

/**
 * Runs `steps` with the page clock, which `page.clock.install()` faked, paused, so the menus' hover
 * waits, rendering and the times the page records advance only by `page.clock.runFor`, however
 * loaded the host is; then lets it run again. `pauseAt` fires what's due up to a second ahead, so
 * call it with no hover wait pending.
 */
async function paused(page: Page, steps: () => Promise<void>): Promise<void> {
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);

  try {
    await steps();
  } finally {
    await page.clock.resume();
  }
}

/**
 * With the page clock paused: moves the mouse onto `point`, then on to the left, 2 px every 20 ms,
 * for 80 ms, and runs 19 ms more, so 99 ms have passed since the first move. A wait that the later
 * moves started over wouldn't end at 100 ms.
 */
async function wander(page: Page, point: { x: number; y: number }): Promise<void> {
  await page.mouse.move(point.x, point.y);

  for (let step = 1; step <= 4; step++) {
    await page.clock.runFor(20);
    await page.mouse.move(point.x - 2 * step, point.y);
  }

  await page.clock.runFor(19);
}

/** The page clock's time when `testId`'s submenu last opened or closed, -1 before. */
async function recorded(page: Page, testId: string): Promise<number> {
  return Number(await page.getByTestId(testId).textContent());
}

async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error("No box");
  }

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("MN33: a sub-trigger is a menuitem that controls its submenu, a menu named by it beside it, in server HTML and after hydration; a click after hydration opens the submenu, keeps focus on the sub-trigger and a second click keeps it open; a disabled sub-trigger stays focusable", async ({
  page,
}, info) => {
  const parts = editParts(page);
  const closedStructure = async () => {
    for (const subTrigger of [parts.move, parts.more, parts.share, parts.exportTrigger]) {
      await expect(subTrigger).toHaveAttribute("role", "menuitem");
      await expect(subTrigger).toHaveAttribute("aria-haspopup", "menu");
      await expect(subTrigger).toHaveAttribute("aria-expanded", "false");
      await expect(subTrigger).toHaveAttribute("tabindex", "-1");
      await expect(subTrigger).toHaveAttribute("type", "button");
    }

    for (const [subTrigger, content] of [
      [parts.move, parts.moveContent],
      [parts.more, parts.moreContent],
      [parts.share, parts.shareContent],
    ] as const) {
      const id = await subTrigger.getAttribute("id");

      expect(id).toMatch(/\S/);
      await expect(subTrigger).toHaveAttribute(
        "aria-controls",
        (await content.getAttribute("id")) ?? "",
      );
      await expect(content).toHaveAttribute("role", "menu");
      await expect(content).toHaveAttribute("popover", "manual");
      await expect(content).toHaveAttribute("inert", "");
      await expect(content).toHaveAttribute("tabindex", "-1");
      await expect(content).toHaveAttribute("aria-labelledby", id ?? "");
    }

    await expect(parts.exportTrigger).toHaveAttribute("aria-disabled", "true");
    await expect(parts.exportTrigger).toHaveAttribute("data-disabled", "");
    await expect(parts.exportTrigger).not.toHaveAttribute("disabled", /.*/);
    await expect(parts.move).not.toHaveAttribute("aria-disabled", /.*/);
  };

  await fixture(page, "menu", info, closedStructure);
  await closedStructure();
  await expect(parts.state).toHaveText("false false false false false");

  await parts.trigger.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await parts.trigger.click();
  await expectOpen(parts.trigger, parts.content);
  await parts.move.click();
  await expectOpen(parts.move, parts.moveContent);
  await expect(parts.move).toBeFocused();
  await expect(parts.state).toHaveText("true true false false false");
  await expect(page.getByTestId("move-state")).toHaveText("true true");
  await expect(parts.moveContent).toHaveAccessibleName("Move to");
  await expectPreferred(page, "inline-end", "start", 0, {
    anchor: "edit-move",
    content: "move-content",
  });
  // The open submenu's sub-trigger doesn't toggle it closed.
  await parts.move.click();
  await frames(page);
  await expectOpen(parts.move, parts.moveContent);
  await expect(parts.changes).toHaveText("edit:true,move:true");
  // A disabled sub-trigger is focused by arrows and opens nothing.
  await page.keyboard.press("End");
  await expect(parts.exportTrigger).toBeFocused();
  await expectClosed(parts.move, parts.moveContent);
  await page.keyboard.press("Escape");
  await expectClosed(parts.trigger, parts.content);
  await expect(parts.trigger).toBeFocused();
  await expect(parts.state).toHaveText("false false false false false");
});

test("MN34: ArrowRight, Enter and Space on a sub-trigger open its submenu on its first item; ArrowLeft and Escape close one level and focus the sub-trigger; arrows leaving a sub-trigger close its submenu; one submenu is open per menu", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const parts = editParts(page);

  await parts.trigger.focus();
  await page.keyboard.press("Enter");
  await expect(parts.item("undo")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(parts.move).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expectOpen(parts.move, parts.moveContent);
  await expect(parts.moveItem("inbox")).toBeFocused();
  await expect(parts.state).toHaveText("true true false false false");
  await page.keyboard.press("ArrowLeft");
  await expectClosed(parts.move, parts.moveContent);
  await expect(parts.move).toBeFocused();
  await expect(parts.state).toHaveText("true false false false false");
  await expectOpen(parts.trigger, parts.content);
  await page.keyboard.press("Enter");
  await expect(parts.moveItem("inbox")).toBeFocused();
  // Two levels: arrows move within the submenu; ArrowLeft closes only the inner one.
  await page.keyboard.press("ArrowDown");
  await expect(parts.moveItem("archive")).toBeFocused();
  await page.keyboard.press("End");
  await expect(parts.more).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expectOpen(parts.more, parts.moreContent);
  await expect(page.getByTestId("more-trash")).toBeFocused();
  await expect(parts.state).toHaveText("true true true false false");
  await page.keyboard.press("ArrowLeft");
  await expectClosed(parts.more, parts.moreContent);
  await expect(parts.more).toBeFocused();
  await expectOpen(parts.move, parts.moveContent);
  await expect(parts.state).toHaveText("true true false false false");
  // Space opens once: its release clicks nothing.
  await page.keyboard.press("Space");
  await expect(page.getByTestId("more-trash")).toBeFocused();
  await frames(page);
  await expect(parts.state).toHaveText("true true true false false");
  await expect(parts.selected).toHaveText("");
  // Escape closes one level at a time.
  await page.keyboard.press("Escape");
  await expectClosed(parts.more, parts.moreContent);
  await expect(parts.more).toBeFocused();
  await page.keyboard.press("Escape");
  await expectClosed(parts.move, parts.moveContent);
  await expect(parts.move).toBeFocused();
  await expectOpen(parts.trigger, parts.content);
  await expect(parts.state).toHaveText("true false false false false");

  // A submenu a click opened, focus on its sub-trigger, closes when arrows move focus on.
  await parts.move.click();
  await expectOpen(parts.move, parts.moveContent);
  await expect(parts.move).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(parts.item("rename")).toBeFocused();
  await expectClosed(parts.move, parts.moveContent);
  await expect(parts.state).toHaveText("true false false false false");

  // Opening a sibling closes the open submenu with its own open submenu.
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await expect(parts.moveItem("inbox")).toBeFocused();
  await page.keyboard.press("End");
  await expect(parts.more).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expectOpen(parts.more, parts.moreContent);
  await parts.share.click();
  // At once, within the 100 ms wait the mouse moving onto Share started while Move to was open: a
  // script's click on Move to, which moves no focus, closes Share. The click on Share ended that
  // wait, so Share doesn't take over again once it would have expired.
  await script(page, "edit-move");
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 250)));
  await expectOpen(parts.move, parts.moveContent);
  await expectClosed(parts.share, parts.shareContent);
  await expectClosed(parts.more, parts.moreContent);
  await expect(parts.state).toHaveText("true true false false false");
  expect(await tail(parts.changes, 3)).toBe("share:true,share:false,move:true");
  await page.keyboard.press("Escape");
  await expectClosed(parts.move, parts.moveContent);
  await page.keyboard.press("Escape");
  await expectClosed(parts.trigger, parts.content);
});

test("MN35: activating an item in a submenu closes the whole tree, innermost first, with focus on the root's Trigger before (select); a checkable item's Space and click keep the tree open and its Enter closes it", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const parts = editParts(page);

  // Enter on an item two levels down.
  await parts.trigger.focus();
  await page.keyboard.press("Enter");
  await expect(parts.item("undo")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(parts.moveItem("inbox")).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("more-trash")).toBeFocused();
  await page.keyboard.press("Enter");
  await expectClosed(parts.trigger, parts.content);
  await expectClosed(parts.move, parts.moveContent);
  await expectClosed(parts.more, parts.moreContent);
  await expect(parts.trigger).toBeFocused();
  await expect(parts.selected).toHaveText("trash@edit-trigger@false/false/false/false/false/false");
  await expect(parts.changes).toHaveText(
    "edit:true,move:true,more:true,more:false,move:false,edit:false",
  );
  await expect(parts.state).toHaveText("false false false false false");

  // A click on an item one level down.
  await parts.trigger.click();
  await parts.move.click();
  await expectOpen(parts.move, parts.moveContent);
  await parts.moveItem("archive").click();
  await expectClosed(parts.trigger, parts.content);
  await expectClosed(parts.move, parts.moveContent);
  await expect(parts.trigger).toBeFocused();
  expect(await tail(parts.selected, 1)).toBe(
    "archive@edit-trigger@false/false/false/false/false/false",
  );
  expect(await tail(parts.changes, 2)).toBe("move:false,edit:false");

  // A checkable item: Space and a click keep the tree open; Enter closes it.
  await page.keyboard.press("Enter");
  await expect(parts.item("undo")).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowUp");
  await expect(parts.share).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("share-email")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("edit-notify")).toHaveText("true");
  await expect(page.getByTestId("share-notify")).toBeFocused();
  await expectOpen(parts.share, parts.shareContent);
  expect(await tail(parts.selected, 1)).toBe(
    "notify@share-notify@true/false/false/true/false/false",
  );
  await page.getByTestId("share-notify").click();
  await expect(page.getByTestId("edit-notify")).toHaveText("false");
  await expectOpen(parts.share, parts.shareContent);
  await expectOpen(parts.trigger, parts.content);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("edit-notify")).toHaveText("true");
  await expectClosed(parts.share, parts.shareContent);
  await expectClosed(parts.trigger, parts.content);
  await expect(parts.trigger).toBeFocused();
  expect(await tail(parts.selected, 1)).toBe(
    "notify@edit-trigger@false/false/false/false/false/false",
  );
  expect(await tail(parts.changes, 2)).toBe("share:false,edit:false");
});

test("MN36: Tab and Shift+Tab from a submenu close the whole tree and move on from the root's Trigger; an outside click closes the whole tree, innermost first, and leaves focus where it went", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const parts = editParts(page);
  const openMore = async () => {
    await page.keyboard.press("Enter");
    await expect(parts.item("undo")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await expect(parts.moveItem("inbox")).toBeFocused();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("more-trash")).toBeFocused();
    await expect(parts.state).toHaveText("true true true false false");
  };

  await parts.trigger.focus();
  await openMore();
  await page.keyboard.press("Tab");
  await expect(parts.item("after")).toBeFocused();
  await expectClosed(parts.trigger, parts.content);
  await expectClosed(parts.move, parts.moveContent);
  await expectClosed(parts.more, parts.moreContent);
  await expect(parts.state).toHaveText("false false false false false");
  expect(await tail(parts.changes, 3)).toBe("more:false,move:false,edit:false");

  await page.keyboard.press("Shift+Tab");
  await expect(parts.trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(parts.item("undo")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(parts.moveItem("inbox")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(parts.item("before")).toBeFocused();
  await expectClosed(parts.trigger, parts.content);
  await expect(parts.state).toHaveText("false false false false false");

  await parts.trigger.focus();
  await openMore();
  await parts.item("before").click();
  await expectClosed(parts.trigger, parts.content);
  await expectClosed(parts.move, parts.moveContent);
  await expectClosed(parts.more, parts.moreContent);
  await expect(parts.item("before")).toBeFocused();
  await expect(parts.state).toHaveText("false false false false false");
  expect(await tail(parts.changes, 3)).toBe("more:false,move:false,edit:false");
  await expect(parts.selected).toHaveText("");
});

test("MN37: in right to left, ArrowLeft opens a submenu placed on the left and ArrowRight closes it back to its sub-trigger", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = page.getByTestId("format-trigger");
  const content = page.getByTestId("format-content");
  const align = page.getByTestId("format-align");
  const alignContent = page.getByTestId("align-content");
  const state = page.getByTestId("format-state");

  await trigger.evaluate((node) => node.scrollIntoView({ block: "center", inline: "center" }));
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("format-bold")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(align).toBeFocused();
  // ArrowRight is the back arrow here: it opens nothing.
  await page.keyboard.press("ArrowRight");
  await frames(page);
  await expect(align).toBeFocused();
  await expect(state).toHaveText("true false");
  await page.keyboard.press("ArrowLeft");
  await expectOpen(align, alignContent);
  await expect(page.getByTestId("align-right")).toBeFocused();
  await expect(state).toHaveText("true true");
  await expectPreferred(page, "inline-end", "start", 0, {
    anchor: "format-align",
    content: "align-content",
  });
  const [alignBox, contentBox] = await Promise.all([
    align.boundingBox(),
    alignContent.boundingBox(),
  ]);

  expect((contentBox?.x ?? 0) + (contentBox?.width ?? 0)).toBeLessThanOrEqual(
    (alignBox?.x ?? 0) + 1,
  );
  // ArrowLeft inside moves nothing; ArrowRight closes the submenu.
  await page.keyboard.press("ArrowLeft");
  await frames(page);
  await expect(page.getByTestId("align-right")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expectClosed(align, alignContent);
  await expect(align).toBeFocused();
  await expect(state).toHaveText("true false");
  await expectOpen(trigger, content);
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  await expect(state).toHaveText("false false");
});

test("MN38: closing the root, by its Trigger or by a write, closes every submenu and writes their open false, so reopening it shows them all closed, also a close and a reopen written before effects run, at the root and at a submenu, while a submenu written open in that turn stays open", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const parts = editParts(page);
  const openMore = async () => {
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await expect(parts.moveItem("inbox")).toBeFocused();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("more-trash")).toBeFocused();
    await expect(parts.state).toHaveText("true true true false false");
  };

  await parts.trigger.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await parts.trigger.focus();
  await page.keyboard.press("Enter");
  await expect(parts.item("undo")).toBeFocused();
  await openMore();
  await parts.trigger.click();
  await expectClosed(parts.trigger, parts.content);
  await expect(parts.state).toHaveText("false false false false false");
  expect(await tail(parts.changes, 3)).toBe("more:false,move:false,edit:false");
  await expect(parts.trigger).toBeFocused();

  await page.keyboard.press("Enter");
  await expectOpen(parts.trigger, parts.content);
  await expect(parts.item("undo")).toBeFocused();
  await expect(parts.move).toHaveAttribute("aria-expanded", "false");
  await expect(parts.state).toHaveText("true false false false false");
  await openMore();

  // An external close of the root: the submenus' models follow.
  await script(page, "edit-close");
  await expectClosed(parts.trigger, parts.content);
  await expectClosed(parts.move, parts.moveContent);
  await expectClosed(parts.more, parts.moreContent);
  await expect(parts.state).toHaveText("false false false false false");
  await parts.trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expectOpen(parts.trigger, parts.content);
  await expect(parts.item("undo")).toBeFocused();
  await frames(page);
  await expect(parts.move).toHaveAttribute("aria-expanded", "false");
  await expect(parts.more).toHaveAttribute("aria-expanded", "false");
  await expect(parts.state).toHaveText("true false false false false");

  // Falsifier: the root's model written false and then true in one callback, before effects run,
  // is a new open decision, which every submenu belongs to no longer.
  await openMore();
  await script(page, "edit-reopen");
  await expectClosed(parts.more, parts.moreContent);
  await expectClosed(parts.move, parts.moveContent);
  await expectOpen(parts.trigger, parts.content);
  await expect(parts.state).toHaveText("true false false false false");
  expect(await tail(parts.changes, 4)).toBe("edit:false,edit:true,more:false,move:false");

  // The same one level down: Move to stays open and More closes.
  await parts.item("undo").focus();
  await openMore();
  await script(page, "move-reopen");
  await expectClosed(parts.more, parts.moreContent);
  await expectOpen(parts.move, parts.moveContent);
  await expect(parts.state).toHaveText("true true false false false");
  expect(await tail(parts.changes, 3)).toBe("move:false,move:true,more:false");
  await script(page, "edit-close");
  await expectClosed(parts.trigger, parts.content);

  // Final values: a submenu written open in the same turn as its parent's close and reopen, before
  // them, is bound to the reopened decision and stays open, at the root and one level down.
  await parts.trigger.focus();
  await page.keyboard.press("Enter");
  await expect(parts.item("undo")).toBeFocused();
  await script(page, "move-open-edit-reopen");
  await expectOpen(parts.trigger, parts.content);
  await expectOpen(parts.move, parts.moveContent);
  await expect(parts.state).toHaveText("true true false false false");
  expect(await tail(parts.changes, 3)).toBe("move:true,edit:false,edit:true");
  await script(page, "more-open-move-reopen");
  await expectOpen(parts.move, parts.moveContent);
  await expectOpen(parts.more, parts.moreContent);
  await expect(parts.state).toHaveText("true true true false false");
  expect(await tail(parts.changes, 3)).toBe("more:true,move:false,move:true");
  await frames(page);
  await expectOpen(parts.more, parts.moreContent);
  await expect(parts.state).toHaveText("true true true false false");
  await script(page, "edit-close");
  await expectClosed(parts.trigger, parts.content);
});

test("MN39: the mouse resting on a sub-trigger opens its submenu after 100 ms, not before, without moving focus into it, and the mouse focuses the submenu's items; a disabled sub-trigger opens nothing by the mouse, a click or a key", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);
  await page.clock.install();

  const parts = editParts(page);

  await parts.trigger.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await parts.trigger.click();
  await expect(parts.item("undo")).toBeFocused();

  const move = await center(parts.move);

  await watchPointer(page);
  // Falsifier: 99 ms after the mouse moved onto Move to, the submenu is still closed; at 100 it opens.
  await paused(page, async () => {
    await page.mouse.move(move.x, move.y);
    await expect(parts.move).toBeFocused();
    await page.clock.runFor(99);
    await expect(parts.move).toHaveAttribute("aria-expanded", "false");
    expect(await recorded(page, "move-opened-at")).toBe(-1);
    await page.clock.runFor(1);
  });
  await expectOpen(parts.move, parts.moveContent);
  await expect(parts.move).toBeFocused();
  expect((await recorded(page, "move-opened-at")) - (await firstMove(page, "edit-move"))).toBe(100);
  expect(await focusedSince(page)).toEqual(["edit-move"]);
  await parts.moveItem("archive").hover();
  await expect(parts.moveItem("archive")).toBeFocused();
  await expect(parts.state).toHaveText("true true false false false");

  // The disabled Export: the mouse resting on it focuses it and closes Move to, and opens nothing.
  const exportPoint = await center(parts.exportTrigger);

  await paused(page, async () => {
    await page.mouse.move(exportPoint.x, exportPoint.y);
    await page.clock.runFor(100);
    await expect(parts.exportTrigger).toBeFocused();
    await page.clock.runFor(300);
  });
  await expectClosed(parts.move, parts.moveContent);
  await expect(parts.exportTrigger).toHaveAttribute("aria-expanded", "false");
  expect(await shown(parts.exportContent)()).toBe(false);
  await parts.exportTrigger.click({ force: true });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await frames(page);
  await expect(parts.exportTrigger).toBeFocused();
  await expect(parts.exportTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(parts.state).toHaveText("true false false false false");
  // The consumer's own (click) ran for the click, Enter and Space.
  await expect(page.getByTestId("export-clicks")).toHaveText("3");
  await page.keyboard.press("Escape");
  await expectClosed(parts.trigger, parts.content);
});

test("MN40: while a submenu is open, the mouse resting on another item focuses it and closes the submenu after 100 ms; a diagonal move across two items toward the submenu keeps it open and focuses neither", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);
  await page.clock.install();

  const parts = editParts(page);

  await parts.trigger.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await parts.trigger.click();
  await parts.move.hover();
  await expectOpen(parts.move, parts.moveContent);

  // Falsifier: a move straight down onto Rename, going on along it away from the submenu,
  // switches 100 ms after the mouse reached it.
  const start = await center(parts.move);
  const rename = await center(parts.item("rename"));

  await watchPointer(page);
  await paused(page, async () => {
    await wander(page, { x: start.x, y: rename.y });
    await expect(parts.move).toBeFocused();
    await page.clock.runFor(1);
    await expect(parts.item("rename")).toBeFocused();
  });
  await expectClosed(parts.move, parts.moveContent);
  expect((await recorded(page, "move-closed-at")) - (await firstMove(page, "edit-rename"))).toBe(
    100,
  );
  expect(await focusedSince(page)).toEqual(["edit-rename"]);

  // Reopen, then move diagonally across Rename and Delete into the submenu.
  await parts.move.hover();
  await expectOpen(parts.move, parts.moveContent);
  await watchPointer(page);

  const content = await parts.moveContent.boundingBox();
  const deleteBox = await parts.item("delete").boundingBox();

  if (content === null || deleteBox === null) {
    throw new Error("No box");
  }

  const from = await center(parts.move);
  const to = { x: content.x + 12, y: deleteBox.y + deleteBox.height * 0.75 };
  const steps = 24;

  expect(to.y).toBeLessThan(content.y + content.height);

  // A step every 20 ms of the page's clock, so the mouse stays over each item longer than the
  // delay while every step heads for the submenu.
  await paused(page, async () => {
    for (let step = 1; step <= steps; step++) {
      await page.mouse.move(
        from.x + ((to.x - from.x) * step) / steps,
        from.y + ((to.y - from.y) * step) / steps,
      );
      await page.clock.runFor(20);
    }

    await page.clock.runFor(250);
  });

  const dwell = await page.evaluate(() => {
    const first = window.menuMoves ?? {};
    const last = window.menuLastMoves ?? {};

    return {
      rename: (last["edit-rename"] ?? Number.NaN) - (first["edit-rename"] ?? Number.NaN),
      delete: (last["edit-delete"] ?? Number.NaN) - (first["edit-delete"] ?? Number.NaN),
    };
  });

  // It crossed both items and stayed over Rename longer than the delay.
  expect(dwell.rename).toBeGreaterThanOrEqual(100);
  expect(dwell.delete).toBeGreaterThanOrEqual(0);
  await expectOpen(parts.move, parts.moveContent);

  const focused = await focusedSince(page);

  expect(focused).not.toContain("edit-rename");
  expect(focused).not.toContain("edit-delete");
  await expect(parts.state).toHaveText("true true false false false");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expectClosed(parts.trigger, parts.content);
});

test.describe("touch", () => {
  test.use({ hasTouch: true });

  test("MN41: a touch tap on a sub-trigger opens its submenu without moving focus into it, and a tap on an item in it activates it and closes the tree", async ({
    page,
  }, info) => {
    await fixture(page, "menu", info);

    const parts = editParts(page);

    await parts.trigger.evaluate((node) => node.scrollIntoView({ block: "center" }));
    await parts.trigger.tap();
    await expectOpen(parts.trigger, parts.content);
    await parts.move.tap();
    await expectOpen(parts.move, parts.moveContent);
    await frames(page);

    const inside = await parts.moveContent.evaluate((node) =>
      node.contains(document.activeElement),
    );

    expect(inside).toBe(false);
    await expect(parts.state).toHaveText("true true false false false");
    await parts.moveItem("inbox").tap();
    await expectClosed(parts.trigger, parts.content);
    await expectClosed(parts.move, parts.moveContent);
    await expect(parts.selected).toHaveText(
      "inbox@edit-trigger@false/false/false/false/false/false",
    );
  });
});

test("MN42: in a Dialog, the first Escape closes only the submenu, the next only the menu, then the Dialog; activating an item in the submenu closes the menu tree and keeps the Dialog open", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = page.getByTestId("tools-trigger");
  const content = page.getByTestId("tools-content");
  const insert = page.getByTestId("tools-insert");
  const insertContent = page.getByTestId("insert-content");
  const state = page.getByTestId("tools-state");
  const modal = () => page.getByTestId("tools-dialog").evaluate((node) => node.matches(":modal"));

  await page.getByTestId("tools-dialog-trigger").click();
  await expect.poll(modal).toBe(true);
  await trigger.click();
  await expect(insert).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("insert-table")).toBeFocused();
  await expect(state).toHaveText("true true true");
  await page.keyboard.press("Escape");
  await expectClosed(insert, insertContent);
  await expect(insert).toBeFocused();
  await expect(state).toHaveText("true true false");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("insert-table")).toBeFocused();
  await page.keyboard.press("Enter");
  await expectClosed(trigger, content);
  await expectClosed(insert, insertContent);
  await expect(trigger).toBeFocused();
  await expect(state).toHaveText("true false false");
  expect(await modal()).toBe(true);
  expect(await tail(page.getByTestId("edit-selected"), 1)).toBe(
    "table@tools-trigger@false/false/false/false/false/false",
  );

  await trigger.click();
  await insert.click();
  await expectOpen(insert, insertContent);
  await page.keyboard.press("Escape");
  await expectClosed(insert, insertContent);
  await expectOpen(trigger, content);
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
  await expect(trigger).toBeFocused();
  expect(await modal()).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(modal).toBe(false);
  await expect(state).toHaveText("false false false");
});

test("MN43: one submenu is open per menu however it opens, the newest decision winning: a submenu written open closes the open one with its own, also with focus inside it, which returns to its sub-trigger, so does one that arrives open, and one whose openChange listener reopens it while a click opens another stays open and ends that opening", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const parts = editParts(page);

  // Share's model, written true while Move to and More are open. Scripts' clicks open them, so
  // focus stays on Undo, outside the submenus that close.
  await parts.trigger.focus();
  await page.keyboard.press("Enter");
  await expect(parts.item("undo")).toBeFocused();
  await script(page, "edit-move");
  await expectOpen(parts.move, parts.moveContent);
  await script(page, "move-more");
  await expectOpen(parts.more, parts.moreContent);
  await expect(parts.item("undo")).toBeFocused();
  await script(page, "share-open");
  await expectOpen(parts.share, parts.shareContent);
  await expectClosed(parts.more, parts.moreContent);
  await expectClosed(parts.move, parts.moveContent);
  await expect(parts.state).toHaveText("true false false true false");
  expect(await tail(parts.changes, 2)).toBe("more:false,move:false");

  // Move to's listener reopens it while a click on Share closes it: Share's opening ends there.
  await script(page, "edit-move");
  await expectOpen(parts.move, parts.moveContent);
  await expectClosed(parts.share, parts.shareContent);
  await script(page, "arm-keep-move");
  await script(page, "edit-share");
  await frames(page);
  await expectOpen(parts.move, parts.moveContent);
  await expectClosed(parts.share, parts.shareContent);
  await expect(parts.state).toHaveText("true true false false false");
  expect(await tail(parts.changes, 4)).toBe("share:false,move:true,move:false,move:true");
  await script(page, "edit-close");
  await expectClosed(parts.trigger, parts.content);

  // Share written open while focus is inside Move to: Move to's close returns focus to its
  // sub-trigger, which isn't a move to another item, so Share stays open.
  await parts.trigger.focus();
  await page.keyboard.press("Enter");
  await expect(parts.item("undo")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(parts.move).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(parts.moveItem("inbox")).toBeFocused();
  await script(page, "share-open");
  await expectOpen(parts.share, parts.shareContent);
  await expectClosed(parts.move, parts.moveContent);
  await expect(parts.move).toBeFocused();
  await frames(page);
  await expectOpen(parts.share, parts.shareContent);
  await expect(parts.move).toBeFocused();
  await expect(parts.state).toHaveText("true false false true false");
  await script(page, "edit-close");
  await expectClosed(parts.trigger, parts.content);

  // Late arrives with its `open` true while Open with is open.
  const files = page.getByTestId("files-trigger");
  const openWith = page.getByTestId("files-open-with");
  const openWithContent = page.getByTestId("open-with-content");
  const filesState = page.getByTestId("files-state");

  await files.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("files-copy")).toBeFocused();
  await script(page, "files-open-with");
  await expectOpen(openWith, openWithContent);
  await expect(filesState).toHaveText("true true false");
  await script(page, "files-mount-late");
  await expectOpen(page.getByTestId("files-late"), page.getByTestId("files-late-content"));
  await expectClosed(openWith, openWithContent);
  await expect(filesState).toHaveText("true false true");
  await script(page, "files-trigger");
  await expectClosed(files, page.getByTestId("files-content"));
  await expect(filesState).toHaveText("false false false");
});

test("MN44: a submenu's openChange listener that replaces the closing root, or the closing submenu around it, with one sharing its Options leaves the replacement open: the destroyed menu writes nothing once its submenus closed", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  // The root, disabled while its submenu is open.
  const treeOpen = page.getByTestId("tree-open");

  await page.getByTestId("tree-trigger-1").click();
  await expectOpen(page.getByTestId("tree-trigger-1"), page.getByTestId("tree-content-1"));
  await page.getByTestId("tree-sub-1").click();
  await expectOpen(page.getByTestId("tree-sub-1"), page.getByTestId("tree-sub-content-1"));
  await script(page, "arm-tree");
  await script(page, "disable-tree");
  await expect(page.getByTestId("tree-trigger-1")).toHaveCount(0);
  await expect.poll(shown(page.getByTestId("tree-content-2"))).toBe(true);
  await frames(page);
  await expect(treeOpen).toHaveText("true");
  expect(await shown(page.getByTestId("tree-content-2"))()).toBe(true);
  await script(page, "tree-trigger-2");
  await expectClosed(page.getByTestId("tree-trigger-2"), page.getByTestId("tree-content-2"));
  await expect(treeOpen).toHaveText("false");

  // A submenu, disabled while its own submenu is open.
  const branchOpen = page.getByTestId("branch-open");

  await page.getByTestId("branch-trigger").click();
  await expectOpen(page.getByTestId("branch-trigger"), page.getByTestId("branch-content"));
  await page.getByTestId("branch-sub-1").click();
  await expectOpen(page.getByTestId("branch-sub-1"), page.getByTestId("branch-sub-content-1"));
  await page.getByTestId("branch-deep-1").click();
  await expectOpen(page.getByTestId("branch-deep-1"), page.getByTestId("branch-deep-content-1"));
  await script(page, "arm-branch");
  await script(page, "disable-branch");
  await expect(page.getByTestId("branch-sub-1")).toHaveCount(0);
  await expect.poll(shown(page.getByTestId("branch-sub-content-2"))).toBe(true);
  await frames(page);
  await expect(branchOpen).toHaveText("true true");
  expect(await shown(page.getByTestId("branch-sub-content-2"))()).toBe(true);
  await script(page, "branch-trigger");
  await expectClosed(page.getByTestId("branch-trigger"), page.getByTestId("branch-content"));
  await expect(branchOpen).toHaveText("false false");
});

test("MN45: the mouse resting on a sub-trigger whose focus handler removes it, or replaces it, opens nothing", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);
  await page.clock.install();

  const trigger = page.getByTestId("swap-trigger");
  const first = page.getByTestId("swap-first");
  const firstContent = page.getByTestId("swap-first-content");
  const secondContent = page.getByTestId("swap-second-content");
  const state = page.getByTestId("swap-state");

  await trigger.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await trigger.click();
  await expect(first).toBeFocused();

  for (const [mode, generation, replacement] of [
    ["replace", 1, 2],
    ["remove", 2, null],
  ] as const) {
    await first.hover();
    await expectOpen(first, firstContent);
    await script(page, `arm-swap-${mode}`);

    const second = page.getByTestId(`swap-second-${generation}`);
    const point = await center(second);

    // While First is open, the mouse rests on Second for 100 ms: its focus closes First, and its
    // focus handler takes it out.
    await paused(page, async () => {
      await page.mouse.move(point.x, point.y);
      await page.clock.runFor(100);
      await page.clock.runFor(300);
    });
    await expect(second).toHaveCount(0);

    if (replacement !== null) {
      await expect(page.getByTestId(`swap-second-${replacement}`)).toHaveCount(1);
    }

    await expectClosed(first, firstContent);
    await frames(page);
    expect(await shown(secondContent)()).toBe(false);
    await expect(state).toHaveText("true false false 0");
  }

  await script(page, "swap-trigger");
  await expectClosed(trigger, page.getByTestId("swap-content"));
});

test("MN46: a submenu placed below its sub-trigger, with an item between them, keeps the safe corridor: a diagonal move across that item toward it keeps it open and focuses nothing; a move onto an item away from it switches after 100 ms", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);
  await page.clock.install();

  const trigger = page.getByTestId("files-trigger");
  const openWith = page.getByTestId("files-open-with");
  const openWithContent = page.getByTestId("open-with-content");
  const copy = page.getByTestId("files-copy");

  await trigger.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await trigger.click();
  await openWith.hover();
  await expectOpen(openWith, openWithContent);
  await expectPreferred(page, "block-end", "start", 60, {
    anchor: "files-open-with",
    content: "open-with-content",
  });

  const content = await openWithContent.boundingBox();
  const beta = await page.getByTestId("files-beta").boundingBox();

  if (content === null || beta === null) {
    throw new Error("No box");
  }

  // Alpha and Beta are between the sub-trigger and its submenu.
  expect(content.y).toBeGreaterThanOrEqual(beta.y + beta.height);

  const from = await center(openWith);
  const to = { x: content.x + content.width - 12, y: content.y + 12 };
  const steps = 30;

  await watchPointer(page);
  await paused(page, async () => {
    for (let step = 1; step <= steps; step++) {
      await page.mouse.move(
        from.x + ((to.x - from.x) * step) / steps,
        from.y + ((to.y - from.y) * step) / steps,
      );
      await page.clock.runFor(20);
    }

    await page.clock.runFor(250);
  });

  const dwell = await page.evaluate(() => {
    const first = window.menuMoves ?? {};
    const last = window.menuLastMoves ?? {};

    return (last["files-alpha"] ?? Number.NaN) - (first["files-alpha"] ?? Number.NaN);
  });

  // It stayed over Alpha longer than the delay.
  expect(dwell).toBeGreaterThanOrEqual(100);
  await expectOpen(openWith, openWithContent);

  const focused = await focusedSince(page);

  expect(focused).not.toContain("files-alpha");
  expect(focused).not.toContain("files-beta");
  await expect(page.getByTestId("files-state")).toHaveText("true true false");

  // Falsifier: straight up onto Copy, going on along it, away from the submenu, switches 100 ms
  // after the mouse reached it.
  await openWith.hover();
  await expect(openWith).toBeFocused();

  const copyPoint = await center(copy);

  await paused(page, async () => {
    await wander(page, { x: from.x, y: copyPoint.y });
    await expect(openWith).toBeFocused();
    await page.clock.runFor(1);
    await expect(copy).toBeFocused();
  });
  await expectClosed(openWith, openWithContent);
  await expect(page.getByTestId("files-state")).toHaveText("true false false");

  // Falsifier: Copy's left edge is on the line of the submenu's left edge. Up along that line,
  // away from the submenu, through the triangles with no area that line makes, switches too.
  await openWith.hover();
  await expectOpen(openWith, openWithContent);

  const copyBox = await copy.boundingBox();
  const edge = await openWithContent.boundingBox();

  if (copyBox === null || edge === null) {
    throw new Error("No box");
  }

  expect(Number.isInteger(edge.x)).toBe(true);
  expect(copyBox.x).toBe(edge.x);

  await paused(page, async () => {
    await page.mouse.move(edge.x, copyPoint.y);

    for (let step = 1; step <= 4; step++) {
      await page.clock.runFor(20);
      await page.mouse.move(edge.x, copyPoint.y - step);
    }

    await page.clock.runFor(19);
    await expect(openWith).toBeFocused();
    await page.clock.runFor(1);
    await expect(copy).toBeFocused();

    // Moving on along it past the delay.
    for (let step = 5; step <= 6; step++) {
      await page.mouse.move(edge.x, copyPoint.y - step);
      await page.clock.runFor(20);
    }

    await expect(copy).toBeFocused();
  });
  await expectClosed(openWith, openWithContent);
  await expect(page.getByTestId("files-state")).toHaveText("true false false");
  await page.keyboard.press("Escape");
  await expectClosed(trigger, page.getByTestId("files-content"));
});

test("MN47: submenus written open in one turn, before effects run, settle by their final values: the first in document order stays open, whichever was written first and although its effect runs last", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const trigger = page.getByTestId("panels-trigger");
  const content = page.getByTestId("panels-content");
  const left = page.getByTestId("panels-left");
  const leftContent = page.getByTestId("left-content");
  const right = page.getByTestId("panels-right");
  const rightContent = page.getByTestId("right-content");
  const state = page.getByTestId("panels-state");

  // Falsifier: Left's effect runs after Right's, in its embedded view, in both write orders.
  for (const order of ["panels-left-right", "panels-right-left"]) {
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(left).toBeFocused();
    await script(page, order);
    await expectOpen(left, leftContent);
    await expectClosed(right, rightContent);
    await expect(state).toHaveText("true true false");
    await frames(page);
    await expectClosed(right, rightContent);
    await expect(state).toHaveText("true true false");
    await script(page, "panels-trigger");
    await expectClosed(trigger, content);
    await expect(state).toHaveText("false false false");
  }
});

test("MN48: Space on a sub-trigger that a running search reached joins the search instead of opening its submenu, and its release clicks nothing; with no search running, Space opens it", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const parts = editParts(page);

  await parts.trigger.focus();
  await page.keyboard.press("Enter");
  await expect(parts.item("undo")).toBeFocused();
  // Falsifier: "move", Space, "to" is one search for "move to" in Edit.
  await page.keyboard.type("move");
  await expect(parts.move).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.type("to");
  await frames(page);
  await expect(parts.move).toBeFocused();
  await expectClosed(parts.move, parts.moveContent);
  await expect(parts.state).toHaveText("true false false false false");
  await expect(parts.changes).toHaveText("edit:true");

  // A closed menu ends the search: Space then opens Move to on its first item.
  await page.keyboard.press("Escape");
  await expectClosed(parts.trigger, parts.content);
  await page.keyboard.press("Enter");
  await expect(parts.item("undo")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(parts.move).toBeFocused();
  await page.keyboard.press("Space");
  await expectOpen(parts.move, parts.moveContent);
  await expect(parts.moveItem("inbox")).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expectClosed(parts.trigger, parts.content);
});

test("MN49: the mouse leaving a sub-trigger before its submenu opens ends the wait: coming back starts a new one of 100 ms", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);
  await page.clock.install();

  const parts = editParts(page);

  await parts.trigger.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await parts.trigger.click();
  await expect(parts.item("undo")).toBeFocused();

  const move = await center(parts.move);
  const box = await parts.content.boundingBox();

  if (box === null) {
    throw new Error("No box");
  }

  await watchPointer(page);
  // Falsifier: onto Move to at 0, off Content at 20, back onto Move to at 90: still closed at 100
  // and 189, open at 190.
  await paused(page, async () => {
    await page.mouse.move(move.x, move.y);
    await expect(parts.move).toBeFocused();
    await page.clock.runFor(20);
    await page.mouse.move(box.x + box.width + 40, move.y);
    await page.clock.runFor(70);
    await page.mouse.move(move.x + 4, move.y);
    await page.clock.runFor(10);
    expect(await recorded(page, "move-opened-at")).toBe(-1);
    await page.clock.runFor(89);
    await expect(parts.move).toHaveAttribute("aria-expanded", "false");
    expect(await recorded(page, "move-opened-at")).toBe(-1);
    await page.clock.runFor(1);
  });
  await expectOpen(parts.move, parts.moveContent);
  await expect(parts.move).toBeFocused();
  expect((await recorded(page, "move-opened-at")) - (await firstMove(page, "edit-move"))).toBe(190);
  await page.keyboard.press("Escape");
  await expectClosed(parts.move, parts.moveContent);
  await parts.item("undo").hover();
  await expect(parts.item("undo")).toBeFocused();

  const opened = await recorded(page, "move-opened-at");

  await watchPointer(page);
  // Falsifier: the same, back onto the very point it left: leaving forgot that point, so the
  // return is movement and starts a new wait.
  await paused(page, async () => {
    await page.mouse.move(move.x, move.y);
    await expect(parts.move).toBeFocused();
    await page.clock.runFor(20);
    await page.mouse.move(box.x + box.width + 40, move.y);
    await page.clock.runFor(70);
    await page.mouse.move(move.x, move.y);
    await page.clock.runFor(10);
    await page.clock.runFor(89);
    await expect(parts.move).toHaveAttribute("aria-expanded", "false");
    expect(await recorded(page, "move-opened-at")).toBe(opened);
    await page.clock.runFor(1);
  });
  await expectOpen(parts.move, parts.moveContent);
  expect((await recorded(page, "move-opened-at")) - (await firstMove(page, "edit-move"))).toBe(190);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expectClosed(parts.trigger, parts.content);
});

test("MN50: the mouse leaving a sub-trigger in a shadow root inside Content for a node in the same shadow root ends the wait: coming back starts a new one of 100 ms, also at the very point it left", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);
  await page.clock.install();

  const trigger = page.getByTestId("mail-trigger");
  const content = page.getByTestId("mail-content");
  const send = page.getByTestId("mail-send");
  const sendContent = page.getByTestId("send-content");

  await trigger.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await trigger.click();
  await expect(page.getByTestId("mail-reply")).toBeFocused();

  const point = await center(send);
  const spacer = await center(page.getByTestId("send-spacer"));
  let start = Number.NaN;

  // Falsifier: onto Send to at 0, onto the spacer beside it in its shadow root at 20, which
  // Content never hears of, back onto Send to at 90: still closed at 100 and 189, open at 190.
  await paused(page, async () => {
    await page.mouse.move(point.x, point.y);
    start = await page.evaluate(() => performance.now());
    await expect(send).toBeFocused();
    await page.clock.runFor(20);
    await page.mouse.move(spacer.x, spacer.y);
    await page.clock.runFor(70);
    await page.mouse.move(point.x + 4, point.y);
    await page.clock.runFor(10);
    expect(await recorded(page, "send-opened-at")).toBe(-1);
    await page.clock.runFor(89);
    await expect(send).toHaveAttribute("aria-expanded", "false");
    expect(await recorded(page, "send-opened-at")).toBe(-1);
    await page.clock.runFor(1);
  });
  await expectOpen(send, sendContent);
  await expect(send).toBeFocused();
  expect((await recorded(page, "send-opened-at")) - start).toBe(190);
  await page.keyboard.press("Escape");
  await expectClosed(send, sendContent);
  await page.getByTestId("mail-reply").hover();
  await expect(page.getByTestId("mail-reply")).toBeFocused();

  const opened = await recorded(page, "send-opened-at");

  // Falsifier: onto Send to at 0, onto the spacer at 20, past the first wait's end, back onto the
  // very point it left at 150: leaving forgot that point, so the return starts a new wait.
  await paused(page, async () => {
    await page.mouse.move(point.x, point.y);
    start = await page.evaluate(() => performance.now());
    await expect(send).toBeFocused();
    await page.clock.runFor(20);
    await page.mouse.move(spacer.x, spacer.y);
    await page.clock.runFor(130);
    await expect(send).toHaveAttribute("aria-expanded", "false");
    await page.mouse.move(point.x, point.y);
    await page.clock.runFor(99);
    await expect(send).toHaveAttribute("aria-expanded", "false");
    expect(await recorded(page, "send-opened-at")).toBe(opened);
    await page.clock.runFor(1);
  });
  await expectOpen(send, sendContent);
  expect((await recorded(page, "send-opened-at")) - start).toBe(250);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expectClosed(trigger, content);
});

test("MN51: a submenu written open while focus is inside a sibling submenu in an open shadow root closes that sibling, whose close returns focus to its sub-trigger in the shadow root, and stays open", async ({
  page,
}, info) => {
  await fixture(page, "menu", info);

  const send = page.getByTestId("mail-send");
  const sendContent = page.getByTestId("send-content");
  const forward = page.getByTestId("mail-forward");
  const forwardContent = page.getByTestId("forward-content");
  const state = page.getByTestId("mail-state");

  await page.getByTestId("mail-trigger").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("mail-reply")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(send).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expectOpen(send, sendContent);
  await expect(page.getByTestId("send-phone")).toBeFocused();
  // The document's `activeElement` is the shadow host.
  expect(await page.evaluate(() => document.activeElement?.localName)).toBe(
    "acceptance-menu-submenu-shadow",
  );
  await expect(state).toHaveText("true true false");

  await script(page, "forward-open");
  await expectOpen(forward, forwardContent);
  await expectClosed(send, sendContent);
  await expect(send).toBeFocused();
  await frames(page);
  await expectOpen(forward, forwardContent);
  await expect(send).toBeFocused();
  await expect(state).toHaveText("true false true");
});
