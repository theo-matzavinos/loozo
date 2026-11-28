import { test, expect } from "./contract-test.js";
import type { Locator, Page, TestInfo } from "playwright/test";
import { bootstrapHeld, fixture } from "./observation.js";

// Pagination (section 39, PG). PG1 is the package, type, documentation and Node math gates.

type Attributes = Record<string, string | null>;

const names = [
  "type",
  "disabled",
  "aria-disabled",
  "data-disabled",
  "aria-current",
  "data-current",
];

/** Every attribute a Pagination part binds or composes, null when absent. */
async function attributes(locator: Locator): Promise<Attributes> {
  return locator.evaluate((element, names) => {
    const result: Record<string, string | null> = {};

    for (const name of names) {
      result[name] = element.getAttribute(name);
    }

    return result;
  }, names);
}

/** A button part's attributes: enabled or focusable-disabled, marked or not. */
function button({ disabled = false, current = false } = {}): Attributes {
  return {
    type: "button",
    disabled: null,
    "aria-disabled": disabled ? "true" : null,
    "data-disabled": disabled ? "" : null,
    "aria-current": current ? "page" : null,
    "data-current": current ? "" : null,
  };
}

/** A link part's attributes: marked or not, never disabled. */
function link({ current = false } = {}): Attributes {
  return {
    type: null,
    disabled: null,
    "aria-disabled": null,
    "data-disabled": null,
    "aria-current": current ? "page" : null,
    "data-current": current ? "" : null,
  };
}

function out(page: Page, testId: string): Locator {
  return page.getByTestId(testId);
}

/** A probe's State: `page | pageCount | from-to | previous/next | range`. */
async function state(page: Page, testId: string): Promise<string | null> {
  return out(page, testId).getAttribute("data-state");
}

/** Waits two frames: a write a click would make, or Angular's replay, has rendered by then. */
async function frames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** Writes one row of the results root's raw Options and clears the recorded `pageChange`s. */
async function set(page: Page, label: string): Promise<void> {
  await out(page, `results-set-${label}`).click();
  await out(page, "results-reset-changes").click();
  await expect(out(page, "results-changes")).toHaveText("");
}

/** The four results steps' disabled state, in First, Previous, Next, Last order. */
async function steps(page: Page): Promise<Attributes[]> {
  const result: Attributes[] = [];

  for (const step of ["first", "previous", "next", "last"]) {
    result.push(await attributes(out(page, `results-${step}`)));
  }

  return result;
}

const serverIds = [
  "results-first",
  "results-previous",
  "results-page-1",
  "results-page-2",
  "results-next",
  "results-last",
  "results-invalid",
  "static-item",
  "static-link",
  "links-page-1",
  "links-page-2",
  "composer-first",
  "composer-previous",
  "composer-page-1",
  "composer-next",
  "composer-last",
  "factory-first",
  "factory-page-3",
  "factory-next",
  "existing-page-2",
  "existing-link-2",
  "existing-factory-item",
  "existing-factory-link",
  "existing-source-item",
  "existing-source-link",
  "inner-first",
  "outer-first",
];

const serverExpected: Record<string, Attributes> = {
  "results-first": button({ disabled: true }),
  "results-previous": button({ disabled: true }),
  "results-page-1": button({ current: true }),
  "results-page-2": button(),
  "results-next": button(),
  "results-last": button(),
  "results-invalid": button({ disabled: true }),
  "static-item": button({ disabled: true }),
  "static-link": link(),
  "links-page-1": link({ current: true }),
  "links-page-2": link(),
  "composer-first": button({ disabled: true }),
  "composer-previous": button({ disabled: true }),
  "composer-page-1": button({ current: true }),
  "composer-next": button(),
  "composer-last": button(),
  "factory-first": button(),
  "factory-page-3": button({ current: true }),
  "factory-next": button(),
  "existing-page-2": button({ current: true }),
  "existing-link-2": link({ current: true }),
  "existing-factory-item": button({ disabled: true }),
  "existing-factory-link": link(),
  // Existing part Options say page 2, the root's page, over decoys of 1.
  "existing-source-item": button({ current: true }),
  "existing-source-link": link({ current: true }),
  "inner-first": button(),
  "outer-first": button({ disabled: true }),
};

test("PG2 server HTML carries the current marks and the steps' focusable disabled state, and eager and incremental hydration keep the nodes and the attributes", async ({
  page,
}, info) => {
  const server: Record<string, Attributes> = {};
  const serverState: Record<string, string | null> = {};

  await fixture(page, "pagination", info, async () => {
    for (const id of serverIds) {
      server[id] = await attributes(out(page, id));
    }

    for (const id of ["results-probe", "factory-probe", "existing-probe", "inner-probe"]) {
      serverState[id] = await state(page, id);
    }

    serverState["summary"] = await out(page, "results-summary").textContent();
  });

  expect(server).toEqual(serverExpected);
  expect(serverState).toEqual({
    "results-probe": "1 | 10 | 1-10 | null/2 | 1 2 3 4 5 … 10",
    // The factory and existing roots read their replacements, never the decoys.
    "factory-probe": "3 | 10 | 21-30 | 2/4 | 1 2 3 4 5 … 10",
    "existing-probe": "2 | 3 | 11-20 | 1/3 | 1 2 3",
    "inner-probe": "5 | 10 | 41-50 | 4/6 | 1 … 4 5 6 … 10",
    summary: expect.stringMatching(/^\s*Showing 1–10 of 100\s*$/),
  });

  // `fixture` already proved the saved nodes were kept; the attributes are unchanged too.
  for (const id of serverIds) {
    expect(await attributes(out(page, id)), id).toEqual(server[id]);
  }

  await expect(out(page, "results-page-1")).toHaveAccessibleName("Page 1");
  await expect(out(page, "results-first")).toHaveAccessibleName("First page");
});

test("PG3 State derives the page, the page count, the requested page's item bounds, the neighbours and the fixed-slot range from the raw Options, as the section's tables say", async ({
  page,
}, info) => {
  await fixture(page, "pagination", info);

  const max = String(Number.MAX_SAFE_INTEGER);
  const rows: [string, string][] = [
    ["1-95-10", "1 | 10 | 1-10 | null/2 | 1 2 3 4 5 … 10"],
    ["10-95-10", "10 | 10 | 91-95 | 9/null | 1 … 6 7 8 9 10"],
    ["7-45-10", "5 | 5 | 0-0 | 4/null | 1 2 3 4 5"],
    ["1-0-10", "1 | 0 | 0-0 | null/null | "],
    ["0-95-10", "1 | 10 | 0-0 | null/2 | 1 2 3 4 5 … 10"],
    ["-3-95-10", "1 | 10 | 0-0 | null/2 | 1 2 3 4 5 … 10"],
    ["NaN-95-10", "1 | 10 | 0-0 | null/2 | 1 2 3 4 5 … 10"],
    ["2.7-95-10", "2 | 10 | 11-20 | 1/3 | 1 2 3 4 5 … 10"],
    ["3-95-NaN", "3 | 95 | 3-3 | 2/4 | 1 2 3 4 5 … 95"],
    ["3-95-0", "3 | 95 | 3-3 | 2/4 | 1 2 3 4 5 … 95"],
    ["3-95--5", "3 | 95 | 3-3 | 2/4 | 1 2 3 4 5 … 95"],
    ["1-NaN-10", "1 | 0 | 0-0 | null/null | "],
    ["1--1-10", "1 | 0 | 0-0 | null/null | "],
    ["1-Infinity-10", "1 | 0 | 0-0 | null/null | "],
    ["1-2^60-1", `1 | ${max} | 1-1 | null/2 | 1 2 3 4 5 … ${max}`],
    [
      "last-2^60-1",
      `${max} | ${max} | ${max}-${max} | ${Number.MAX_SAFE_INTEGER - 1}/null | 1 … ${[4, 3, 2, 1, 0]
        .map((offset) => String(Number.MAX_SAFE_INTEGER - offset))
        .join(" ")}`,
    ],
    ["1-100-10", "1 | 10 | 1-10 | null/2 | 1 2 3 4 5 … 10"],
    ["4-100-10", "4 | 10 | 31-40 | 3/5 | 1 2 3 4 5 … 10"],
    ["5-100-10", "5 | 10 | 41-50 | 4/6 | 1 … 4 5 6 … 10"],
    ["10-100-10", "10 | 10 | 91-100 | 9/null | 1 … 6 7 8 9 10"],
    ["1-7-1", "1 | 7 | 1-1 | null/2 | 1 2 3 4 5 6 7"],
    ["1-1-1", "1 | 1 | 1-1 | null/null | 1"],
    ["50-100-1", "50 | 100 | 50-50 | 49/51 | 1 … 49 50 51 … 100"],
    ["1-10-1-s1b0", "1 | 10 | 1-1 | null/2 | 1 2 3 4 …"],
    ["5-10-1-s1b0", "5 | 10 | 5-5 | 4/6 | … 4 5 6 …"],
    ["10-10-1-s1b0", "10 | 10 | 10-10 | 9/null | … 7 8 9 10"],
  ];

  for (const [label, expected] of rows) {
    await out(page, `results-set-${label}`).click();
    await expect.poll(() => state(page, "results-probe"), label).toBe(expected);
  }

  // Each gap's key names its side: an end gap alone on page 1, a start gap alone on page 10.
  await out(page, "results-set-1-100-10").click();
  await expect(out(page, "results-ellipsis-end")).toHaveCount(1);
  await expect(out(page, "results-ellipsis-start")).toHaveCount(0);
  await out(page, "results-set-10-100-10").click();
  await expect(out(page, "results-ellipsis-start")).toHaveCount(1);
  await expect(out(page, "results-ellipsis-end")).toHaveCount(0);

  // The rendered range follows State: one control per page record, one gap per gap.
  await out(page, "results-set-5-100-10").click();
  await expect(out(page, "results").locator("li button")).toHaveText(["1", "4", "5", "6", "10"]);
  await expect(out(page, "results-ellipsis-start")).toHaveAttribute("aria-hidden", "true");
  await expect(out(page, "results-ellipsis-end")).toHaveAttribute("aria-hidden", "true");
  // The gaps' list items are hidden too, so the exposed list has only the five page entries.
  await expect(out(page, "results").getByRole("listitem")).toHaveCount(5);
  await expect(out(page, "results-summary")).toHaveText("Showing 41–50 of 100");

  // A stale page reports no items; with no items the consumer's own text shows.
  await out(page, "results-set-7-45-10").click();
  await expect(out(page, "results-summary")).toHaveText("45 results");
  await out(page, "results-set-1-0-10").click();
  await expect(out(page, "results-summary")).toHaveText("0 results");
  await expect(out(page, "results").locator("li")).toHaveCount(0);
});

test("PG4 items and links mark the effective page with aria-current and data-current, only while there are pages", async ({
  page,
}, info) => {
  await fixture(page, "pagination", info);

  await set(page, "5-100-10");
  expect(await attributes(out(page, "results-page-5"))).toEqual(button({ current: true }));
  expect(await attributes(out(page, "results-page-4"))).toEqual(button());

  // A stale request marks the clamped page.
  await set(page, "7-50-10");
  expect(await attributes(out(page, "results-page-5"))).toEqual(button({ current: true }));
  await set(page, "2.7-95-10");
  expect(await attributes(out(page, "results-page-2"))).toEqual(button({ current: true }));

  // A static page-1 item and link, across empty, populated and empty again.
  const item = out(page, "static-item");
  const staticLink = out(page, "static-link");

  expect(await attributes(item)).toEqual(button({ disabled: true }));
  expect(await attributes(staticLink)).toEqual(link());
  await out(page, "static-populate").click();
  await expect(item).toHaveAttribute("aria-current", "page");
  expect(await attributes(item)).toEqual(button({ current: true }));
  expect(await attributes(staticLink)).toEqual(link({ current: true }));
  await out(page, "static-empty").click();
  await expect(item).not.toHaveAttribute("aria-current", /.*/);
  expect(await attributes(item)).toEqual(button({ disabled: true }));
  expect(await attributes(staticLink)).toEqual(link());
});

test("PG5 a page item writes its page once and emits once; the marked item of a settled pager writes nothing, a stale request's marked item writes back, and an invalid item writes nothing", async ({
  page,
}, info) => {
  await fixture(page, "pagination", info);

  const changes = out(page, "results-changes");
  const current = out(page, "results-page");

  await set(page, "1-100-10");
  await out(page, "results-page-3").click();
  await expect(current).toHaveText("3");
  await expect(changes).toHaveText("3");
  // Now the marked item: its target is the requested page, so it writes nothing.
  await out(page, "results-page-3").click();
  await expect(out(page, "results-page-3")).toHaveAttribute("aria-current", "page");
  await expect(changes).toHaveText("3");

  // 5 of 5: the marked item stays enabled and writes nothing.
  await set(page, "5-50-10");
  expect(await attributes(out(page, "results-page-5"))).toEqual(button({ current: true }));
  await out(page, "results-page-5").click();
  await frames(page);
  await expect(changes).toHaveText("");
  await expect(current).toHaveText("5");
  await out(page, "results-page-4").click();
  await expect(changes).toHaveText("4");

  // 7 of 5: the marked 5 writes 5 once.
  await set(page, "7-50-10");
  await out(page, "results-page-5").click();
  await expect(current).toHaveText("5");
  await expect(changes).toHaveText("5");

  // 1.7 of one page: item 1, First and Last each write 1 once.
  for (const control of ["results-page-1", "results-first", "results-last"]) {
    await set(page, "1.7-5-10");
    await out(page, control).click();
    await expect(current, control).toHaveText("1");
    await expect(changes, control).toHaveText("1");
  }

  // An item whose page isn't one of the pages is disabled but focusable, and writes nothing.
  await set(page, "1-100-10");

  const invalid = out(page, "results-invalid");

  expect(await attributes(invalid)).toEqual(button({ disabled: true }));
  // Playwright refuses an `aria-disabled` target unless forced; the click is still trusted.
  await invalid.click({ force: true });
  await expect(invalid).toBeFocused();
  await out(page, "results-page-2").click();
  await expect(changes).toHaveText("2");
});

test("PG6 First, Previous, Next and Last target their pages and are disabled but focusable while they have no target or it is the requested page; a disabled step writes nothing", async ({
  page,
}, info) => {
  await fixture(page, "pagination", info);

  const enabled = button();
  const disabled = button({ disabled: true });
  const rows: [string, Attributes[]][] = [
    ["1-100-10", [disabled, disabled, enabled, enabled]],
    ["5-100-10", [enabled, enabled, enabled, enabled]],
    ["10-100-10", [enabled, enabled, disabled, disabled]],
    ["7-50-10", [enabled, enabled, disabled, enabled]],
    ["7-5-10", [enabled, disabled, disabled, enabled]],
    ["1.7-5-10", [enabled, disabled, disabled, enabled]],
    ["NaN-100-10", [enabled, disabled, enabled, enabled]],
    ["0-100-10", [enabled, disabled, enabled, enabled]],
    ["-3-100-10", [enabled, disabled, enabled, enabled]],
    ["1-0-10", [disabled, disabled, disabled, disabled]],
  ];

  for (const [label, expected] of rows) {
    await set(page, label);
    expect(await steps(page), label).toEqual(expected);
  }

  const changes = out(page, "results-changes");
  const clicks: [string, string, string][] = [
    ["5-100-10", "first", "1"],
    ["5-100-10", "previous", "4"],
    ["5-100-10", "next", "6"],
    ["5-100-10", "last", "10"],
    ["7-50-10", "first", "1"],
    ["7-50-10", "previous", "4"],
    ["7-50-10", "last", "5"],
    ["7-5-10", "first", "1"],
    ["7-5-10", "last", "1"],
    ["NaN-100-10", "first", "1"],
    ["NaN-100-10", "next", "2"],
    ["-3-100-10", "last", "10"],
  ];

  for (const [label, step, expected] of clicks) {
    await set(page, label);
    await out(page, `results-${step}`).click();
    await expect(changes, `${label} ${step}`).toHaveText(expected);
    await expect(out(page, "results-page"), `${label} ${step}`).toHaveText(expected);
  }

  // Disabled steps receive the clicks and write nothing.
  const silent: [string, string][] = [
    ["1-100-10", "first"],
    ["1-100-10", "previous"],
    ["10-100-10", "next"],
    ["10-100-10", "last"],
    ["7-50-10", "next"],
    ["1-0-10", "first"],
    ["1-0-10", "previous"],
    ["1-0-10", "next"],
    ["1-0-10", "last"],
  ];

  for (const [label, step] of silent) {
    await set(page, label);
    await out(page, `results-${step}`).click({ force: true });
    await expect(out(page, `results-${step}`)).toBeFocused();
    await frames(page);
    await expect(changes, `${label} ${step}`).toHaveText("");
  }
});

/** Saves the element as the window's `paginationTarget`, for an identity check after the change. */
async function saveTarget(locator: Locator): Promise<void> {
  await locator.evaluate((element) => {
    (window as unknown as { paginationTarget: Element }).paginationTarget = element;
  });
}

/** Whether the focused element is the saved node, and its text. */
async function focused(page: Page): Promise<[boolean, string]> {
  return page.evaluate(() => {
    const saved = (window as unknown as { paginationTarget: Element }).paginationTarget;
    const active = document.activeElement;

    return [active === saved, active?.textContent?.trim() ?? ""];
  });
}

test("PG7 an activated page button keeps its node and focus while the window shifts, and Next keeps focus on reaching the last page, where a second Enter writes nothing", async ({
  page,
}, info) => {
  await fixture(page, "pagination", info);

  const changes = out(page, "results-changes");
  const transitions: [string, string, "Enter" | "Space" | "click"][] = [
    ["1-100-10", "5", "Enter"],
    ["1-100-10", "5", "Space"],
    ["1-100-10", "5", "click"],
    ["1-100-10", "4", "click"],
    ["5-100-10", "10", "click"],
  ];

  for (const [label, target, action] of transitions) {
    const control = out(page, `results-page-${target}`);

    await set(page, label);
    await saveTarget(control);

    if (action === "click") {
      await control.click();
    } else {
      await control.focus();
      await page.keyboard.press(action);
    }

    await expect(changes, `${label} → ${target} by ${action}`).toHaveText(target);
    expect(await focused(page), `${label} → ${target} by ${action}`).toEqual([true, target]);
    await expect(control).toHaveAttribute("aria-current", "page");
  }

  // Next from 9 of 10: Enter writes 10 and Next keeps focus, focusable while disabled.
  const next = out(page, "results-next");

  await set(page, "9-100-10");
  await saveTarget(next);
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(changes).toHaveText("10");
  await expect(next).toHaveAttribute("aria-disabled", "true");
  expect(await focused(page)).toEqual([true, "›"]);
  expect(await next.evaluate((element) => (element as HTMLButtonElement).disabled)).toBe(false);
  await page.keyboard.press("Enter");
  await expect(next).toBeFocused();
  await expect(changes).toHaveText("10");
  await expect(out(page, "results-page")).toHaveText("10");

  // Last, disabled too, is still the next tab stop.
  await page.keyboard.press("Tab");
  await expect(out(page, "results-last")).toBeFocused();
});

test("PG8 a page link never writes the page: a same-tab RouterLink activation navigates once, the route-bound page moves the mark, and the activated link keeps its node and focus toward both edges", async ({
  page,
}, info) => {
  await fixture(page, "pagination", info);

  const history = () => page.evaluate(() => window.history.length);
  const transitions: [string, "Enter" | "click"][] = [
    ["5", "click"],
    ["10", "Enter"],
    ["1", "Enter"],
    ["5", "Enter"],
    ["1", "click"],
  ];

  const count = async (testId: string) => Number(await out(page, testId).textContent());

  for (const [target, action] of transitions) {
    const control = out(page, `links-page-${target}`);
    const before = await history();
    const clicks = await count("links-clicks");
    const requests = await count("links-navigation-requests");

    await saveTarget(control);

    if (action === "click") {
      await control.click();
    } else {
      await control.focus();
      await page.keyboard.press(action);
    }

    await expect(page, `${target} by ${action}`).toHaveURL(new RegExp(`[?&]page=${target}\\b`));
    await expect(out(page, "links-route-page")).toHaveText(target);
    await expect(control).toHaveAttribute("aria-current", "page");
    expect(await attributes(control)).toEqual(link({ current: true }));
    expect(await focused(page), `${target} by ${action}`).toEqual([true, target]);
    expect(await history(), `${target} by ${action}`).toBe(before + 1);
    // One delivery to the link and one request to the router, counted after a settle.
    await frames(page);
    expect(await count("links-clicks"), `${target} by ${action}: clicks`).toBe(clicks + 1);
    expect(await count("links-navigation-requests"), `${target} by ${action}: requests`).toBe(
      requests + 1,
    );
    await expect(out(page, "links-changes")).toHaveText("0");
  }
});

test("PG9 a click after an Options write in the same turn acts on the new values", async ({
  page,
}, info) => {
  await fixture(page, "pagination", info);

  // Page 3 of 10, then in one handler: 3 pages, page 1, and a synchronous click on Next, which
  // writes 2 (from the new page 1), not 4 (from the rendered page 3).
  await expect(out(page, "factory-settings-page")).toHaveText("3");
  await out(page, "factory-write-then-next").click();
  await expect(out(page, "factory-settings-page")).toHaveText("2");
  await expect.poll(() => state(page, "factory-probe")).toBe("2 | 3 | 11-20 | 1/3 | 1 2 3");
  await expect(out(page, "factory-decoy-changes")).toHaveText("0");
});

test("PG10 composers: the root, items, links and steps through hostDirectives, replacement Options over decoys, a composer's State shared with its descendants, parts in a child component view and independent nested roots", async ({
  page,
}, info) => {
  await fixture(page, "pagination", info);

  // A composing component: its State through its template reference is its descendants' State.
  // All four composed steps write and reach their edges.
  await expect(out(page, "composer-same-state")).toHaveText("true");
  await out(page, "composer-next").click();
  await expect(out(page, "composer-page")).toHaveText("2");
  await expect(out(page, "composer-state-page")).toHaveText("2");
  expect(await attributes(out(page, "composer-page-2"))).toEqual(button({ current: true }));
  expect(await attributes(out(page, "composer-previous"))).toEqual(button());
  await out(page, "composer-previous").click();
  await expect(out(page, "composer-page")).toHaveText("1");
  expect(await attributes(out(page, "composer-previous"))).toEqual(button({ disabled: true }));
  expect(await attributes(out(page, "composer-first"))).toEqual(button({ disabled: true }));
  await out(page, "composer-last").click();
  await expect(out(page, "composer-page")).toHaveText("3");
  expect(await attributes(out(page, "composer-next"))).toEqual(button({ disabled: true }));
  expect(await attributes(out(page, "composer-last"))).toEqual(button({ disabled: true }));
  expect(await attributes(out(page, "composer-first"))).toEqual(button());
  await out(page, "composer-first").click();
  await expect(out(page, "composer-page")).toHaveText("1");
  await out(page, "composer-page-2").click();
  await expect(out(page, "composer-page")).toHaveText("2");
  expect(await state(page, "composer-probe")).toBe("2 | 3 | 11-20 | 1/3 | 1 2 3");

  // Factory Options with a plain writable page: steps in a child component's view write it, and
  // the unused directive model emits nothing.
  await out(page, "factory-next").click();
  await expect(out(page, "factory-settings-page")).toHaveText("4");
  expect(await attributes(out(page, "factory-page-4"))).toEqual(button({ current: true }));
  await out(page, "factory-page-5").click();
  await expect(out(page, "factory-settings-page")).toHaveText("5");
  await out(page, "factory-last").click();
  await expect(out(page, "factory-settings-page")).toHaveText("10");
  await expect(out(page, "factory-decoy-changes")).toHaveText("0");

  // Existing Options through an abstract class; composed items and links; factory part Options.
  const sourceItem = out(page, "existing-source-item");
  const sourceLink = out(page, "existing-source-link");

  expect(await attributes(sourceItem)).toEqual(button({ current: true }));
  expect(await attributes(sourceLink)).toEqual(link({ current: true }));
  await out(page, "existing-page-1").click();
  await expect(out(page, "existing-page")).toHaveText("1");
  expect(await attributes(out(page, "existing-page-1"))).toEqual(button({ current: true }));
  expect(await attributes(out(page, "existing-link-2"))).toEqual(link());
  // The existing part sources now say 2, not their decoys' 1: unmarked at page 1.
  expect(await attributes(sourceItem)).toEqual(button());
  expect(await attributes(sourceLink)).toEqual(link());
  // Their effective page moves to 3: the item writes 3, and both are marked there.
  await out(page, "existing-sources-3").click();
  await expect(sourceItem).toHaveText("3");
  await sourceItem.click();
  await expect(out(page, "existing-page")).toHaveText("3");
  expect(await attributes(sourceItem)).toEqual(button({ current: true }));
  expect(await attributes(sourceLink)).toEqual(link({ current: true }));
  await out(page, "existing-page-1").click();
  await expect(out(page, "existing-page")).toHaveText("1");
  await out(page, "existing-write").click();
  await expect(out(page, "existing-page")).toHaveText("3");
  expect(await attributes(out(page, "existing-factory-item"))).toEqual(button({ disabled: true }));
  await out(page, "existing-total-40").click();
  await expect(out(page, "existing-factory-item")).not.toHaveAttribute("aria-disabled", /.*/);
  await out(page, "existing-factory-item").click();
  await expect(out(page, "existing-page")).toHaveText("4");
  expect(await attributes(out(page, "existing-factory-item"))).toEqual(button({ current: true }));
  expect(await attributes(out(page, "existing-factory-link"))).toEqual(link({ current: true }));
  // No siblings and no boundaries: three slots, so four pages show a gap.
  expect(await state(page, "existing-probe")).toBe("4 | 4 | 31-40 | 3/null | … 3 4");

  // Nested roots: each part and probe belongs to its nearest root.
  expect(await state(page, "outer-probe")).toBe("1 | 3 | 1-10 | null/2 | 1 2 3");
  expect(await state(page, "inner-probe")).toBe("5 | 10 | 41-50 | 4/6 | 1 … 4 5 6 … 10");
  await out(page, "outer-next").click();
  await expect.poll(() => state(page, "outer-probe")).toBe("2 | 3 | 11-20 | 1/3 | 1 2 3");
  expect(await state(page, "inner-probe")).toBe("5 | 10 | 41-50 | 4/6 | 1 … 4 5 6 … 10");
  await out(page, "inner-next").click();
  await expect.poll(() => state(page, "inner-probe")).toBe("6 | 10 | 51-60 | 5/7 | 1 … 5 6 7 … 10");
  expect(await state(page, "outer-probe")).toBe("2 | 3 | 11-20 | 1/3 | 1 2 3");
});

/** Saves each element under its name on the window, for identity checks after hydration. */
async function saveNodes(page: Page, nodes: Record<string, Locator>): Promise<void> {
  for (const [name, locator] of Object.entries(nodes)) {
    await locator.evaluate((element, name) => {
      const saved = ((
        window as unknown as { paginationNodes?: Record<string, Element> }
      ).paginationNodes ??= {});

      saved[name] = element;
    }, name);
  }
}

/** Whether the element is the node saved under `name`. */
async function sameNode(locator: Locator, name: string): Promise<boolean> {
  return locator.evaluate(
    (element, name) =>
      (window as unknown as { paginationNodes: Record<string, Element> }).paginationNodes[name] ===
      element,
    name,
  );
}

/** Waits until the early event contract listens for clicks, as `hydration.spec.ts` H3 does. */
async function clickCaptured(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.acceptanceObservation.registrations.some(
          (item) => item.type === "click" && item.target === "body",
        ),
      ),
    )
    .toBe(true);
}

/** Holds the response of every lazy script containing `marker` until `release`. */
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

async function shellAttached(page: Page, info: TestInfo): Promise<void> {
  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  await expect(page.locator("setup-readiness")).toHaveAttribute(
    "data-runtime",
    String(info.project.metadata.runtime),
  );
}

test("PG11 a Next click held before the pager hydrates is replayed once and writes the page once", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const host = page.locator("acceptance-pagination-fixture");
  const release = await bootstrapHeld(page, "/pagination", info);
  let lazy: { release: () => void; requests: string[] } | null = null;

  try {
    if (incremental) {
      // Bootstrap, but hold the fixture's own deferred code: the block stays the server's HTML.
      lazy = await holdDependency(page, "data-client-rendered");
      release();
      await shellAttached(page, info);
    }

    await clickCaptured(page);
    await expect(host).not.toHaveAttribute("data-client-rendered", /.*/);
    await out(page, "results-next").click();

    if (lazy !== null) {
      await expect.poll(() => lazy?.requests.length ?? 0).toBeGreaterThan(0);
    }

    await expect(out(page, "results-page")).toHaveText("1");
    await expect(host).not.toHaveAttribute("data-client-rendered", /.*/);
  } finally {
    release();
    lazy?.release();
  }

  await shellAttached(page, info);
  await expect(host).toHaveAttribute("data-client-rendered", "true");
  await expect(out(page, "results-page")).toHaveText("2");
  await expect(out(page, "results-changes")).toHaveText("2");
  await expect(out(page, "results-page-2")).toHaveAttribute("aria-current", "page");
  await frames(page);
  await expect(out(page, "results-changes")).toHaveText("2");
});

test("PG12 a step whose block is still dehydrated when the root's page changes acts on the live State when its click is replayed", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const a = out(page, "block-next-a");
  const b = out(page, "block-next-b");
  let server: Attributes[] = [];

  await fixture(page, "pagination-block", info, async () => {
    if (!incremental) {
      // Without incremental hydration the server renders the blocks' placeholders.
      await expect(a).toHaveCount(0);

      return;
    }

    server = [await attributes(a), await attributes(b)];
  });

  if (incremental) {
    // Server page 3: both Nexts are enabled.
    expect(server).toEqual([button(), button()]);
    await saveNodes(page, { a, b });
  } else {
    await expect(a).toHaveCount(1);
    await expect(b).toHaveCount(1);
  }

  // The root is hydrated; its page moves to 6 while A's block is still dehydrated.
  await out(page, "block-set-6").click();
  await expect(out(page, "block-page")).toHaveText("6");

  if (incremental) {
    await expect(a).not.toHaveAttribute("data-block-hydrated", /.*/);
  }

  await a.click();
  await expect(out(page, "block-page")).toHaveText("7");
  await expect(out(page, "block-changes")).toHaveText("7");

  if (incremental) {
    // The click hydrated A's block on the server's node.
    await expect(a).toHaveAttribute("data-block-hydrated", "true");
    expect(await sameNode(a, "a")).toBe(true);
  }

  // The live last page: B's replayed click finds no target and writes nothing.
  await out(page, "block-set-10").click();
  await expect(out(page, "block-page")).toHaveText("10");

  if (incremental) {
    // Still dormant, B shows the server's enabled attributes while the root is at 10.
    await expect(b).not.toHaveAttribute("data-block-hydrated", /.*/);
    expect(await attributes(b)).toEqual(button());
  }

  await expect(out(page, "block-b-clicks")).toHaveText("0");
  // Once hydrated, B is `aria-disabled`, which Playwright refuses unless forced.
  await b.click({ force: true });
  // The click reaches B exactly once, a delivery observed apart from the write it doesn't make.
  await expect(out(page, "block-b-clicks")).toHaveText("1");
  await expect(b).toHaveAttribute("aria-disabled", "true");
  await frames(page);
  await expect(out(page, "block-page")).toHaveText("10");
  await expect(out(page, "block-changes")).toHaveText("7");
  await expect(out(page, "block-b-clicks")).toHaveText("1");

  if (incremental) {
    await expect(b).toHaveAttribute("data-block-hydrated", "true");
    expect(await sameNode(b, "b")).toBe(true);
  }
});

test("PG13 a same-tab RouterLink click on a page link before its block hydrates navigates once and writes no page", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const linkLocator = out(page, "block-link-5");
  let server: Attributes | null = null;

  await fixture(page, "pagination-block", info, async () => {
    if (incremental) {
      server = await attributes(linkLocator);
    }
  });

  if (incremental) {
    expect(server).toEqual(link());
    await saveNodes(page, { link: linkLocator });
    // Still dormant at the click.
    await expect(linkLocator).not.toHaveAttribute("data-block-hydrated", /.*/);
  } else {
    await expect(linkLocator).toHaveCount(1);
  }

  const navigations = Number(await out(page, "block-navigations").textContent());
  const requests = Number(await out(page, "block-navigation-requests").textContent());

  await expect(out(page, "block-link-clicks")).toHaveText("0");
  await linkLocator.click();
  await expect(page).toHaveURL(/[?&]page=5\b/);
  await expect(out(page, "block-route-page")).toHaveText("5");
  await expect(linkLocator).toHaveAttribute("aria-current", "page");
  await expect(out(page, "block-navigations")).toHaveText(String(navigations + 1));
  // One delivery to the link and one request to the router, after a settle.
  await frames(page);
  await expect(out(page, "block-link-clicks")).toHaveText("1");
  await expect(out(page, "block-navigation-requests")).toHaveText(String(requests + 1));
  await expect(out(page, "block-link-changes")).toHaveText("0");
  await expect(out(page, "fixture-attached")).toHaveText("true");

  if (incremental) {
    // The click hydrated the link's block on the server's node.
    await expect(linkLocator).toHaveAttribute("data-block-hydrated", "true");
    expect(await sameNode(linkLocator, "link")).toBe(true);
  }
});
