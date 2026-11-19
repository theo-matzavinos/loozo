// Group context: Toolbar, ToggleGroup, SelectLabel/SelectGroup and CheckboxGroup find their
// parent through DI. Hydration keeps every server attribute until the first input except core's
// disclosed bind-time changes (K1–K8), and each group's flows work.
import { type Page, expect, test } from "@playwright/test";
import {
  captureMessages,
  evidence,
  expectClean,
  falsifiers,
  modeOf,
  openObserved,
} from "./harness";

async function hydrated(page: Page, path = "/groups"): Promise<void> {
  await page.goto(path);
  await expect(page.locator("[data-testid=app-ready]")).toHaveAttribute("data-ready", "true");
}

async function focusedTestId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
}

/** The test ids focus visits, starting at `start`, over `count` presses of `key`. */
async function walk(page: Page, start: string, key: string, count: number): Promise<string[]> {
  await page.locator(`[data-testid=${start}]`).focus();

  const visited = [start];

  for (let press = 0; press < count; press++) {
    await page.keyboard.press(key);
    visited.push((await focusedTestId(page)) ?? "none");
  }

  return visited;
}

/**
 * Core's bind-time changes the readmes disclose, by owner, slot and attribute: K1 a grouped
 * checkbox's made `id`, K2 a parent's `aria-controls`, K3 a parent without `allValues` settling
 * its checked state, K4 a Select group's server `hidden`, K5 a group's `aria-labelledby` once its
 * label binds, K6 the content's name moving to the SelectLabel, K7 a labeled trigger that also
 * has an `aria-label`, K8 the tab stop of a toolbar whose items are all disabled.
 */
const disclosed = [
  "all checkbox aria-controls",
  "berries select-group aria-labelledby",
  "berries select-group hidden",
  "cheese checkbox id",
  "citrus select-group aria-labelledby",
  "citrus select-group hidden",
  "fruit select-content aria-labelledby",
  "ham checkbox id",
  "loose-a checkbox id",
  "loose-all checkbox aria-checked",
  "loose-all checkbox aria-controls",
  "loose-all checkbox data-indeterminate",
  "loose-all checkbox data-unchecked",
  "loose-b checkbox id",
  "off-toolbar toolbar-button tabindex",
  "olives checkbox id",
  "vegetable select-content aria-labelledby",
  "vegetable select-trigger aria-labelledby",
];

test("hydration keeps every server attribute but core's disclosed bind-time changes", async ({
  page,
}, testInfo) => {
  const messages = captureMessages(page);
  const response = await page.request.get("/groups");
  const html = await response.text();
  const serverStops = await page.evaluate((html) => {
    const document = new DOMParser().parseFromString(html, "text/html");

    return [...document.querySelectorAll('[data-testid=toolbar] [tabindex="0"]')].map((element) =>
      element.getAttribute("data-testid"),
    );
  }, html);

  expect(serverStops, "the server renders one tab stop").toEqual(["bold"]);

  await openObserved(page, "/groups");
  await page.locator("[data-testid=app-ready][data-ready=true]").waitFor();
  // Core's bind microtasks settle with no input yet.
  await page.waitForTimeout(700);

  const records = await evidence(page);
  const changed = [];

  for (const mutation of falsifiers(records)) {
    changed.push(`${mutation.instance} ${mutation.slot} ${mutation.name}`);
  }

  await testInfo.attach("evidence", {
    body: JSON.stringify(records, null, 2),
    contentType: "application/json",
  });
  expect([...new Set(changed)].sort()).toEqual(disclosed);
  await expect(page.locator("[data-testid=loose-all]")).toHaveAttribute("aria-checked", "mixed");
  await expect(page.locator("[data-testid=all]")).toHaveAttribute("aria-checked", "mixed");
  expectClean(messages);
});

test("toolbar: one tab stop, and arrow keys cross toggles, groups, buttons, links and inputs", async ({
  page,
}) => {
  const messages = captureMessages(page);

  await hydrated(page);
  expect(await walk(page, "bold", "ArrowRight", 10)).toEqual([
    "bold",
    "align-left",
    "align-center",
    "align-right",
    "share",
    "italic",
    "bullets",
    "help",
    "size",
    "bold",
    "align-left",
  ]);
  expect(await walk(page, "bold", "ArrowLeft", 1)).toEqual(["bold", "size"]);
  await expect(page.locator("[data-testid=toolbar] [tabindex='0']")).toHaveCount(1);
  await expect(page.locator("[data-testid=separator]")).toHaveAttribute(
    "aria-orientation",
    "vertical",
  );
  expectClean(messages);
});

test("toggle group: [(value)] follows presses inside a toolbar, one pressed at a time", async ({
  page,
}) => {
  const messages = captureMessages(page);
  const value = page.locator("[data-testid=align-value]");

  await hydrated(page);
  await expect(page.locator("[data-testid=align-left]")).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-testid=align-center]").click();
  await expect(value).toHaveText("center");
  await expect(page.locator("[data-testid=align-left]")).toHaveAttribute("aria-pressed", "false");
  await page.locator("[data-testid=align-center]").click();
  await expect(value).toHaveText("");
  await page.locator("[data-testid=align-right]").press("Space");
  await expect(value).toHaveText("right");
  await expect(page.locator("[data-testid=align-right]")).toHaveAttribute("tabindex", "0");
  // Core warns in development when a controlled value isn't written back within 1 s.
  await page.waitForTimeout(1500);
  expectClean(messages);
});

test("toggle group: valueChangeRequest can cancel: no change, no output", async ({ page }) => {
  const messages = captureMessages(page);

  await hydrated(page);
  await page.locator("[data-testid=vetoed-a]").click();
  await expect(page.locator("[data-testid=veto-requests]")).toHaveText("a");
  await expect(page.locator("[data-testid=vetoed-a]")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-testid=veto-changes]")).toHaveText("0");
  expectClean(messages);
});

test("toolbar group and toolbar disabled: items stay focusable with aria-disabled, presses do nothing", async ({
  page,
}) => {
  const messages = captureMessages(page);
  const grouped = ["share", "italic", "bullets"];

  await hydrated(page);
  await page.locator("[data-testid=set-group-disabled]").click();
  await expect(page.locator("[data-testid=toolbar-group]")).toHaveAttribute("data-disabled", "");

  for (const item of grouped) {
    await expect(page.locator(`[data-testid=${item}]`)).toHaveAttribute("aria-disabled", "true");
  }

  await expect(page.locator("[data-testid=bold]")).not.toHaveAttribute("aria-disabled", "true");
  expect(await walk(page, "align-right", "ArrowRight", 4)).toEqual([
    "align-right",
    "share",
    "italic",
    "bullets",
    "help",
  ]);
  // Playwright won't click an aria-disabled element unless forced; core refuses the press.
  await page.locator("[data-testid=italic]").click({ force: true });
  await page.locator("[data-testid=bullets]").press("Space");
  await expect(page.locator("[data-testid=italic]")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-testid=bullets]")).toHaveAttribute("aria-pressed", "false");

  await page.locator("[data-testid=set-group-disabled]").click();
  await expect(page.locator("[data-testid=italic]")).not.toHaveAttribute("aria-disabled", "true");
  await page.locator("[data-testid=italic]").click();
  await expect(page.locator("[data-testid=italic]")).toHaveAttribute("aria-pressed", "true");

  await page.locator("[data-testid=set-toolbar-disabled]").click();

  for (const item of ["bold", "align-left", "share", "italic", "help", "size"]) {
    await expect(page.locator(`[data-testid=${item}]`)).toHaveAttribute("aria-disabled", "true");
  }

  await page.locator("[data-testid=bold]").click({ force: true });
  await expect(page.locator("[data-testid=bold]")).toHaveAttribute("aria-pressed", "false");
  await page.locator("[data-testid=share]").click({ force: true });
  await page.locator("[data-testid=share]").press("Enter");
  await expect(page.locator("[data-testid=shares]")).toHaveText("0");
  await page.locator("[data-testid=set-toolbar-disabled]").click();
  await page.locator("[data-testid=share]").click();
  await page.locator("[data-testid=share]").press("Enter");
  await page.locator("[data-testid=share]").press("Space");
  await expect(page.locator("[data-testid=shares]")).toHaveText("3");
  expectClean(messages);
});

test("toolbar button: a click before hydration on a disabled button never emits press", async ({
  page,
}) => {
  const messages = captureMessages(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route("**/main.js", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/groups", { waitUntil: "commit" });
  await page.locator("[data-testid=off-click]").waitFor({ state: "attached" });
  // Playwright won't click an aria-disabled element unless forced.
  await page.locator("[data-testid=off-press]").click({ force: true });
  await page.locator("[data-testid=off-click]").click({ force: true });
  release();
  await expect(page.locator("[data-testid=app-ready]")).toHaveAttribute("data-ready", "true");
  // Angular replays both clicks once the page hydrates; `press` refuses its replay.
  await expect(
    page.locator("[data-testid=off-clicks]"),
    "the readme's documented replay",
  ).toHaveText("1");
  await expect(page.locator("[data-testid=off-presses]")).toHaveText("0");

  await page.locator("[data-testid=off-press]").click({ force: true });
  await page.locator("[data-testid=off-press]").press("Enter");
  await page.waitForTimeout(300);
  await expect(page.locator("[data-testid=off-presses]")).toHaveText("0");
  expectClean(messages);
});

test("select label and groups: the label names and focuses the trigger, groups name their items", async ({
  page,
}) => {
  const messages = captureMessages(page);
  const fruit = page.locator("[data-testid=fruit]");
  const trigger = page.locator("[data-testid=fruit-trigger]");

  await hydrated(page);
  await expect(trigger).toHaveAccessibleName("Fruit");
  await page.locator("[data-testid=fruit-label]").click();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  const citrus = fruit.getByRole("group", { name: "Citrus" });

  await expect(citrus).toBeVisible();
  await expect(fruit.getByRole("group", { name: "Berries" })).toBeVisible();
  await expect(citrus.getByRole("option", { name: "Lemon" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await citrus.getByRole("option", { name: "Lime" }).click();
  await expect(trigger).toHaveText("Lime");
  await expect(page.locator("[data-testid=vegetable] [uiSelectTrigger]")).toHaveAccessibleName(
    "Vegetable",
  );
  expectClean(messages);
});

test("checkbox group: the parent checks all, [(value)] follows, children submit under the group's name", async ({
  page,
}) => {
  const messages = captureMessages(page);
  const parent = page.locator("[data-testid=all]");
  const chosen = page.locator("[data-testid=chosen]");
  const formData = () =>
    page.evaluate(() => [
      ...new FormData(document.querySelector("[data-testid=form]") as HTMLFormElement).entries(),
    ]);
  const valid = () =>
    page.evaluate(() =>
      (document.querySelector("[data-testid=form]") as HTMLFormElement).checkValidity(),
    );

  await hydrated(page);
  await expect(parent).toHaveAttribute("aria-checked", "mixed");
  await parent.click();
  await expect(chosen).toHaveText("cheese,ham,olives");
  await expect(parent).toHaveAttribute("aria-checked", "true");
  expect(await formData()).toEqual([
    ["toppings", "cheese"],
    ["toppings", "ham"],
    ["toppings", "olives"],
  ]);

  await parent.click();
  await expect(chosen).toHaveText("");
  await expect(parent).toHaveAttribute("aria-checked", "false");
  expect(await valid(), "required blocks submission with nothing checked").toBe(false);

  await page.locator("[data-testid=olives]").click();
  await expect(chosen).toHaveText("olives");
  await expect(parent).toHaveAttribute("aria-checked", "mixed");
  expect(await valid()).toBe(true);

  await page.locator("[data-testid=set-chosen]").click();
  await expect(page.locator("[data-testid=ham]")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("[data-testid=olives]")).toHaveAttribute("aria-checked", "false");
  await page.waitForTimeout(1500);
  expectClean(messages);
});

test("hydrate on interaction: a deferred toggle group joins its toolbar, a deferred Select lists its group", async ({
  page,
}, testInfo) => {
  test.skip(modeOf(testInfo) !== "incremental", "incremental hydration only");

  const messages = captureMessages(page);

  await openObserved(page, "/groups-defer");
  await page.locator("[data-testid=app-ready][data-ready=true]").waitFor();
  await page.waitForTimeout(700);
  expect(falsifiers(await evidence(page))).toEqual([]);

  await page.locator("[data-testid=align-left]").click();
  await expect(page.locator("[data-testid=align-left]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-testid=align-center]")).toHaveAttribute("aria-pressed", "false");
  expect(await walk(page, "first", "ArrowRight", 3)).toEqual([
    "first",
    "align-left",
    "align-center",
    "first",
  ]);

  // Enter, not a click: a first click here is the Select readme's known Chromium limitation.
  await page.locator("[data-testid=fruit-trigger]").press("Enter");
  await expect(page.getByRole("group", { name: "Citrus" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Lime" })).toHaveAttribute("aria-selected", "true");
  expectClean(messages);
});
