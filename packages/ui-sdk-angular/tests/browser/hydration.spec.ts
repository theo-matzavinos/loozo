// The falsifier (plan §13 P1c, §15) as the suite's copies: no non-exempt attribute on a slot
// element leaves its server value between its instance's hydration start and the first event
// core receives for it, except the disclosed C21 repair; plus the early-dispatch queue (Q1–Q6)
// and the kept-item lifecycle (P1c-L).
import { type Page, expect, test } from "@playwright/test";
import {
  captureMessages,
  evidence,
  expectClean,
  falsifiers,
  instanceId,
  modeOf,
  openObserved,
  serverAttributes,
} from "./harness";
import type { Evidence, Mutation } from "./observer";

const fruit = "[data-testid=fruit]";
const trigger = `${fruit} [uiSelectTrigger]`;
const content = `${fruit} [uiSelectContent]`;

type Author = { id: string; label: string | null; color: string };

async function author(page: Page): Promise<Author> {
  return page.evaluate(() => ({
    id: document.querySelector("[data-testid=fruit] [uiSelectTrigger]")!.id,
    label: document
      .querySelector("[data-testid=fruit] [uiSelectTrigger]")!
      .getAttribute("aria-label"),
    color: (document.querySelector("[data-testid=fruit] [uiSelectContent]") as HTMLElement).style
      .color,
  }));
}

const authored: Author = {
  id: "author-fruit-trigger",
  label: "Fruit",
  color: "rgb(120, 180, 240)",
};

/** C21: the order Select's content names the made trigger id until its authored trigger binds. */
function isDisclosed(mutation: Mutation, orderId: string): boolean {
  return (
    mutation.instance === "order" &&
    mutation.slot === "select-content" &&
    mutation.name === "aria-labelledby" &&
    mutation.server === `${orderId}-trigger` &&
    mutation.value === "author-order-trigger" &&
    mutation.phase === "init"
  );
}

/** Splits the falsifier records into C21's disclosed repair and everything else. */
function classify(records: Evidence, orderId: string) {
  const disclosed = [];
  const unexpected = [];

  for (const mutation of falsifiers(records)) {
    if (isDisclosed(mutation, orderId)) {
      disclosed.push(mutation);
      continue;
    }

    unexpected.push(mutation);
  }

  return { disclosed, unexpected };
}

function expectDisclosedRepair(records: Evidence, disclosed: Mutation[]): void {
  expect(disclosed).toHaveLength(1);

  const orderTriggerBound = records.bounds.find(
    (bound) => bound.instance === "order" && bound.slot === "select-trigger",
  );

  expect(orderTriggerBound, "the order trigger binds").toBeTruthy();
  expect(disclosed[0]!.sequence, "the repair follows the authored trigger's bind").toBeGreaterThan(
    orderTriggerBound!.sequence,
  );
}

function expectWindows(records: Evidence, mode: string): void {
  const instances = records.instances;

  expect(Object.keys(instances).sort()).toEqual(["composed", "fruit", "order", "toggle"]);

  for (const [name, window] of Object.entries(instances)) {
    expect(window.start, `${name} starts`).toBeTruthy();
    expect(window.end, `${name} ends`).toBeTruthy();
    expect(window.start!.sequence, `${name} starts before it ends`).toBeLessThan(
      window.end!.sequence,
    );
  }

  const window = instances["fruit"]!;
  const bounds = records.bounds.filter((bound) => bound.instance === "fruit");
  const slots: Record<string, number> = {};

  for (const bound of bounds) {
    slots[bound.slot] = (slots[bound.slot] ?? 0) + 1;
    expect(bound.phase, `fruit's ${bound.slot} binds inside its window`).toBe("init");
    expect(bound.sequence).toBeGreaterThan(window.start!.sequence);
    expect(bound.sequence).toBeLessThan(window.end!.sequence);
  }

  expect(slots).toEqual({
    select: 1,
    "select-trigger": 1,
    "select-value": 1,
    "select-content": 1,
    "select-item": 3,
  });

  const input = records.firstTrustedInput!;

  expect(input).toBeTruthy();

  if (mode === "eager") {
    for (const bound of records.bounds) {
      expect(
        bound.sequence,
        "eager hydration binds every slot before the first input",
      ).toBeLessThan(input.sequence);
    }
  } else {
    expect(
      instances["fruit"]!.start!.sequence,
      "the Select block hydrates after the first input",
    ).toBeGreaterThan(input.sequence);
    expect(instances["order"]!.start!.sequence).toBeGreaterThan(input.sequence);
    expect(instances["toggle"]!.start!.sequence).toBeLessThan(input.sequence);
  }

  // Replayed (and live) events reach the fruit Select only after all its slots bound.
  const firstReach = records.reaches.find((reach) => reach.instance === "fruit");

  expect(
    firstReach?.bounds,
    "the first event reaching the trigger finds every fruit slot bound",
  ).toBe(7);
}

async function expectServerState(page: Page, html: string): Promise<{ orderId: string }> {
  const fruitTrigger = await serverAttributes(page, html, trigger);
  const fruitContent = await serverAttributes(page, html, content);
  const order = await serverAttributes(page, html, "[data-testid=order]");
  const orderTrigger = await serverAttributes(page, html, "[data-testid=order] [uiSelectTrigger]");
  const orderContent = await serverAttributes(page, html, "[data-testid=order] [uiSelectContent]");
  const toggle = await serverAttributes(page, html, "[data-testid=toggle]");

  // Author attributes win over core's, from the first render.
  expect(fruitTrigger["id"]).toBe("author-fruit-trigger");
  expect(fruitTrigger["aria-label"]).toBe("Fruit");
  expect(fruitTrigger["aria-haspopup"]).toBe("listbox");
  expect(fruitTrigger["aria-expanded"]).toBe("false");
  expect(fruitContent["aria-labelledby"]).toBe("author-fruit-trigger");
  expect(fruitContent["style"]).toContain("color: rgb(120, 180, 240)");
  expect(fruitContent["role"]).toBe("listbox");
  expect(fruitContent).toHaveProperty("hidden");
  expect(toggle["aria-pressed"]).toBe("false");
  expect(toggle["data-ui-sdk-id"]).toMatch(/^ui-sdk-s\d+$/);

  // D19's disclosed server state: content before its authored-id trigger names the made id.
  const orderId = order["data-ui-sdk-id"]!;

  expect(orderId).toMatch(/^ui-sdk-s\d+$/);
  expect(orderTrigger["id"]).toBe("author-order-trigger");
  expect(orderContent["aria-labelledby"]).toBe(`${orderId}-trigger`);

  return { orderId };
}

async function serverHtml(page: Page, path: string): Promise<string> {
  const response = await page.request.get(path);

  expect(response.status()).toBe(200);

  return response.text();
}

/** Opens the fruit Select with its first input, hydrating its block first under incremental hydration. */
async function firstInput(page: Page, first: "click" | "Enter"): Promise<void> {
  const button = page.locator(trigger);

  if (first === "click") {
    await button.click();

    return;
  }

  await button.focus();
  await button.press("Enter");
}

async function settleOrder(page: Page): Promise<void> {
  await page.locator("[data-testid=select-ready][data-ready=true]").waitFor();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__uiSdkProbe!.settle("order"));
}

/** Prototype 1's flows: keyboard and pointer selection, Escape, and both Toggles. */
async function originalFlows(page: Page): Promise<void> {
  const button = page.locator(trigger);

  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(content)).toBeVisible();
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-option") === "apple");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("[data-option=banana]")).toBeFocused();
  await expect(page.locator("[data-option=banana]")).toHaveAttribute("data-highlighted", "");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("[data-option=cherry]")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("[data-option=banana]")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-testid=value]")).toHaveText("banana");
  await expect(button).toHaveText("Fruit: banana");
  await expect(page.locator("[data-option=banana]")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-option=apple]")).toHaveAttribute("aria-selected", "false");
  await expect(button).toHaveAttribute("aria-expanded", "false");

  await button.focus();
  await button.press("ArrowDown");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toBeFocused();
  await expect(page.locator(content)).toBeHidden();

  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await page.locator("[data-option=cherry]").click();
  await expect(page.locator("[data-testid=value]")).toHaveText("cherry");
  await expect(button).toHaveAttribute("aria-expanded", "false");

  for (const testId of ["toggle", "composed"]) {
    const toggle = page.locator(`[data-testid=${testId}]`);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.press("Space");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.press("Enter");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  }

  await expect(page.locator("[data-testid=composed]")).toHaveClass(/app-toggle-on/);
}

for (const first of ["click", "Enter"] as const) {
  test(`hydration keeps every server attribute until core's first event, first input ${first}`, async ({
    page,
  }, testInfo) => {
    const mode = modeOf(testInfo);
    const html = await serverHtml(page, "/");
    const { orderId } = await expectServerState(page, html);
    const messages = captureMessages(page);
    const chunks = await openObserved(page, "/");

    await page.locator("[data-testid=app-ready][data-ready=true]").waitFor();

    if (mode === "incremental") {
      await expect(page.locator("[data-testid=select-ready]")).toHaveAttribute(
        "data-ready",
        "false",
      );
      expect((await evidence(page)).bounds.filter((bound) => bound.instance === "fruit")).toEqual(
        [],
      );
    } else {
      await settleOrder(page);
    }

    // Hydration and core's bind microtasks settle with no input yet.
    await page.waitForTimeout(700);
    expect(await author(page)).toEqual(authored);

    chunks.delayChunks = mode === "incremental";
    await firstInput(page, first);
    await settleOrder(page);
    await originalFlows(page);

    const kept = await page.evaluate(() =>
      window.__uiSdkServerNodes.every((node) => node.isConnected),
    );

    expect(kept, "hydration reuses every server-rendered slot element").toBe(true);

    if (mode === "incremental") {
      expect(chunks.delayed, "the Select chunk loads on interaction").toBeGreaterThan(0);
    }

    // Let development warning timers and popup work finish before the console check.
    await page.waitForTimeout(700);

    const records = await evidence(page);
    const { disclosed, unexpected } = classify(records, orderId);

    await testInfo.attach("evidence", {
      body: JSON.stringify(records, null, 2),
      contentType: "application/json",
    });
    expect(unexpected).toEqual([]);
    expectDisclosedRepair(records, disclosed);
    expectWindows(records, mode);
    expect(await author(page)).toEqual(authored);
    expectClean(messages);
  });
}

test("the falsifier sees a rewrite and an addition inside the window (positive controls)", async ({
  page,
}, testInfo) => {
  const mode = modeOf(testInfo);
  const html = await serverHtml(page, "/?control=1");
  const { orderId } = await expectServerState(page, html);
  const messages = captureMessages(page);
  const chunks = await openObserved(page, "/?control=1");

  await page.locator("[data-testid=app-ready][data-ready=true]").waitFor();

  if (mode === "eager") {
    await settleOrder(page);
  }

  await page.waitForTimeout(700);
  chunks.delayChunks = mode === "incremental";
  await firstInput(page, "click");
  await settleOrder(page);
  await expect(page.locator(trigger)).toHaveAttribute("aria-expanded", "true");
  await page.waitForTimeout(700);

  const records = await evidence(page);
  const { disclosed, unexpected } = classify(records, orderId);
  const onFruitTrigger =
    (name: string, server: string | null, value: string | null) => (mutation: Mutation) =>
      mutation.instance === "fruit" &&
      mutation.slot === "select-trigger" &&
      mutation.phase === "init" &&
      mutation.name === name &&
      mutation.server === server &&
      mutation.value === value;

  await testInfo.attach("evidence", {
    body: JSON.stringify(records, null, 2),
    contentType: "application/json",
  });
  expect(unexpected).toHaveLength(2);
  expect(unexpected.some(onFruitTrigger("aria-haspopup", "listbox", "menu"))).toBe(true);
  expect(unexpected.some(onFruitTrigger("aria-controls", null, "control-wrong-content"))).toBe(
    true,
  );

  // The restorations are recorded and, being back at the server value, not counted.
  const restored = (name: string, old: string, value: string | null) =>
    records.mutations.some(
      (mutation) =>
        mutation.instance === "fruit" &&
        mutation.name === name &&
        mutation.old === old &&
        mutation.value === value &&
        !mutation.changesServerValue,
    );

  expect(restored("aria-haspopup", "menu", "listbox")).toBe(true);
  expect(restored("aria-controls", "control-wrong-content", null)).toBe(true);
  expectDisclosedRepair(records, disclosed);
  expectClean(messages);
});

test("a live event before the first bind waits in the queue and reaches core once (Q1–Q6)", async ({
  page,
}, testInfo) => {
  test.skip(
    modeOf(testInfo) !== "incremental",
    "the gap needs a block created outside a change-detection tick",
  );

  const messages = captureMessages(page);
  const chunks = await openObserved(page, "/?early=1");

  await page.locator("[data-testid=app-ready][data-ready=true]").waitFor();
  await page.waitForTimeout(700);
  chunks.delayChunks = true;
  // Hydrates the Select block without touching either Select.
  await page.locator("[data-testid=select-ready]").click();
  await page.waitForFunction(
    () => window.__uiSdkEvidence.bounds.filter((bound) => bound.instance === "fruit").length >= 7,
  );
  await page.waitForTimeout(500);

  const records = await evidence(page);
  const fruitWindow = records.instances["fruit"]!;
  const bounds = records.bounds.filter((bound) => bound.instance === "fruit");
  const early = records.early.filter((entry) => entry.instance === "fruit");
  const dispatched = records.dispatched.filter((entry) => entry.instance === "fruit");
  const expanded = records.mutations.filter(
    (mutation) =>
      mutation.instance === "fruit" &&
      mutation.slot === "select-trigger" &&
      mutation.name === "aria-expanded" &&
      mutation.value === "true",
  );
  // The real flag, uncounted: observer.early gave the event a counting `defaultPrevented`.
  const prevented = await page.evaluate(() => {
    const event = window.__uiSdkEarlyEvent;

    if (event === undefined) {
      return undefined;
    }

    return Reflect.get(Event.prototype, "defaultPrevented", event) as boolean;
  });

  await testInfo.attach("evidence", {
    body: JSON.stringify(records, null, 2),
    contentType: "application/json",
  });

  // Q1: the gap is real: after the block's creation, before its root's ngOnInit and any bind.
  expect(early).toHaveLength(1);
  expect(fruitWindow.start!.sequence).toBeLessThan(early[0]!.sequence);
  expect(fruitWindow.ready, "the root becomes ready").toBeTruthy();
  expect(early[0]!.sequence).toBeLessThan(fruitWindow.ready!.sequence);
  expect(early[0]!.bounds).toBe(0);
  expect(bounds).toHaveLength(7);

  for (const bound of bounds) {
    expect(bound.sequence).toBeGreaterThan(early[0]!.sequence);
  }

  // Q2: queued: the host listener returned with core untouched, nothing ready or bound.
  expect(dispatched).toHaveLength(1);
  expect(dispatched[0]).toMatchObject({
    bounds: 0,
    ready: false,
    defaultPrevented: false,
    expanded: "false",
  });

  // Q3: drained after every first bind of the render pass.
  expect(expanded.length).toBeGreaterThan(0);

  for (const bound of bounds) {
    expect(bound.sequence).toBeLessThan(expanded[0]!.sequence);
  }

  // Q4: one call into core. Core handled that event object, and one ArrowDown opened the list on
  // the selected item. A second forward would change neither: core's wrapper skips a prevented
  // event, and the trigger's ArrowDown on an open list does nothing visible. So the count of
  // `defaultPrevented` reads (observer.early) tells them apart: one call is the wrapper's entry
  // check plus one read in core's development check of the open change (beta.1's
  // kernel/change.js); a second call adds its own entry check, making three. A core upgrade that
  // changes that count fails here loudly; recount it then.
  expect(prevented).toBe(true);
  expect(records.earlyDelivery.defaultPreventedReads).toBe(2);
  expect(expanded).toHaveLength(1);
  await expect(page.locator("[data-option=apple]")).toHaveAttribute("data-highlighted", "");
  await expect(page.locator("[data-option=banana]")).not.toHaveAttribute("data-highlighted", "");

  // Q5: the effect: core opened the popup from a bound trigger.
  await expect(page.locator(trigger)).toHaveAttribute("aria-expanded", "true");

  // Q6
  expectClean(messages);
});

test("kept items follow disabled, label and value changes (P1c-L)", async ({ page }) => {
  const messages = captureMessages(page);

  await page.goto("/");
  await page.locator("[data-testid=app-ready][data-ready=true]").waitFor();

  const button = page.locator(trigger);

  // Hydrates the Select block under incremental hydration; a no-op otherwise.
  await page.locator("[data-testid=select-ready]").click();
  await page.locator("[data-testid=select-ready][data-ready=true]").waitFor();

  const fruitId = await instanceId(page, "fruit");

  await page.evaluate(() => {
    const keep = window as unknown as Record<string, Element | null>;

    keep["banana"] = document.querySelector("[data-option=banana]");
    keep["cherry"] = document.querySelector("[data-option=cherry]");
  });

  // A label change on a kept, selected item reaches core, and the value's label follows it with
  // no further interaction.
  await button.click();
  await page.locator("[data-option=banana]").click();
  await expect(page.locator("[data-testid=label]")).toHaveText("Banana");
  await page.locator("[data-testid=relabel-banana]").click();
  await expect(page.locator("[data-testid=label]")).toHaveText("Ripe banana");

  // Disabled reaches core's pointer handling on the same node.
  await page.locator("[data-testid=disable-banana]").click();
  await expect(page.locator("[data-option=banana]")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("[data-option=banana]")).toHaveAttribute("data-disabled", "");
  await button.click();
  await page.locator("[data-option=cherry]").click();
  await expect(page.locator("[data-testid=value]")).toHaveText("cherry");
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");

  // A real pointer click: Playwright's locator.click refuses aria-disabled elements.
  const box = await page.locator("[data-option=banana]").boundingBox();

  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(100);
  await expect(page.locator("[data-testid=value]")).toHaveText("cherry");

  if ((await button.getAttribute("aria-expanded")) === "true") {
    await page.keyboard.press("Escape");
    await expect(button).toHaveAttribute("aria-expanded", "false");
  }

  // A new value on a kept element (track $index) gets a new part: new id, selectable.
  await page.locator("[data-testid=swap-cherry]").click();

  const date = page.locator("[data-option=date]");

  await expect(date).toHaveAttribute("id", `${fruitId}-option-date`);
  await expect(date).toHaveText("Date");
  await expect(date).toHaveAttribute("aria-selected", "false");
  await button.click();
  await date.click();
  await expect(page.locator("[data-testid=value]")).toHaveText("date");
  await expect(date).toHaveAttribute("aria-selected", "true");

  const same = await page.evaluate(() => {
    const keep = window as unknown as Record<string, Element | null>;

    return {
      banana: keep["banana"] === document.querySelector("[data-option=banana]"),
      date: keep["cherry"] === document.querySelector("[data-option=date]"),
    };
  });

  expect(same).toEqual({ banana: true, date: true });
  await page.waitForTimeout(700);
  expectClean(messages);
});
