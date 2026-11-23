// Accordion over core's presence: items found through DI with made values that survive
// hydration, A2's request-and-complete item outputs in core's order, vetoes that claim nothing,
// late panels that follow their item, nested accordions, and the shared panel lifecycle.
import { type Page, expect, test } from "@playwright/test";
import { accordion } from "@ui-sdk/core/accordion";
import { type OraclePart, expectServerMatchesCore } from "./core-oracle";
import {
  captureMessages,
  changedOffServer,
  expectClean,
  modeOf,
  openObserved,
  serverAttributes,
} from "./harness";
import {
  type Findable,
  type Invalidation,
  type Lifecycle,
  destroyDuringExit,
  exitThenRemove,
  findAfterBind,
  findBeforeBind,
  firstFrame,
  invalidatedBeforeBind,
  reopenDuringExit,
} from "./panel-cases";
import {
  after,
  completions,
  currentPanel,
  cut,
  expectOnlyError,
  first,
  frameAndTask,
  hydrate,
  openPanels,
  outputs,
  readLog,
  recordPanelLog,
  serverHtml,
  waitBound,
  waitLog,
} from "./panel-log";

const path = "/accordion";
const probe = (page: Page, label: string) => page.locator(`[data-probe="${label}"]`);
const state = (page: Page, testId: string) => page.getByTestId(testId);

async function rootId(page: Page, testId: string): Promise<string> {
  return (await page.getByTestId(testId).getAttribute("data-ui-sdk-id"))!;
}

async function start(page: Page, testInfo: Parameters<typeof hydrate>[1], ...ready: string[]) {
  await openPanels(page, path);
  await hydrate(page, testInfo);
  await waitBound(page, ...ready);
}

const life: Lifecycle = {
  path,
  open: "life-trigger",
  close: "life-trigger",
  panel: "life-panel",
  completion: "life",
  ready: ["life-trigger"],
  stable: async (page) => {
    const root = await rootId(page, "life");
    const trigger = await probe(page, "life-trigger").getAttribute("id");

    return {
      attrs: {
        "data-slot": "accordion-panel",
        id: `${root}-panel-life`,
        role: "region",
        "aria-labelledby": trigger!,
        "data-open": "",
      },
      controlledBy: "life-trigger",
    };
  },
};

const find: Findable = {
  path,
  ready: ["f-trigger"],
  panel: "f-panel",
  shownBy: { label: "f-trigger", attribute: "aria-expanded" },
  state: { testId: "outer-state", closed: "open", found: "f" },
  request: { label: "f", name: "openChangeRequest", value: true },
  veto: "veto-item",
  completion: "f",
};

const flicker: Invalidation = {
  path,
  ready: ["c1-trigger"],
  flicker: "flicker",
  remount: "set-controlled",
  panel: "c1-panel",
  controlledBy: "c1-trigger",
  close: "c1-trigger",
  completion: "c1",
};

const flickerFindable: Invalidation = {
  path,
  ready: ["c1-trigger"],
  flicker: "flicker-find",
  remount: "remount-find",
  unmount: "unfind",
  panel: "c1-panel",
  controlledBy: "c1-trigger",
  close: "c1-trigger",
  find: { label: "c1", name: "openChangeRequest", value: true },
  completion: "c1",
};

test.beforeEach(async ({ page }) => {
  await recordPanelLog(page);
});

test("the server renders an explicit default as core does", async ({ page }) => {
  const html = await serverHtml(page, path);
  const { "data-ui-sdk-id": id } = await serverAttributes(page, html, "[data-testid=outer]");
  const made = async (label: string) =>
    (await serverAttributes(page, html, `[data-probe=${label}-item]`))["data-ui-sdk-id"]!;
  const parts: OraclePart[] = [{ slot: "root", selector: "[data-testid=outer]" }];

  for (const [label, value, panel] of [
    ["x", "x", {}],
    ["m", await made("m"), {}],
    ["mk", await made("mk"), { keepMounted: true }],
    ["y", "y", {}],
    ["f", "f", { hiddenUntilFound: true }],
    ["open", "open", {}],
  ] as const) {
    const item = `[data-probe=${label}-item]`;

    parts.push(
      { slot: "item", props: { value }, selector: item, authored: ["value"] },
      { slot: "header", props: { value }, selector: `${item} > h3` },
      { slot: "trigger", props: { value }, selector: `[data-probe=${label}-trigger]` },
      { slot: "panel", props: { value, ...panel }, selector: `[data-probe=${label}-panel]` },
    );
  }

  await expectServerMatchesCore(page, html, accordion, { id, defaultValue: ["open"] }, parts);
});

// Either root flag alone keeps a closed panel in the page, so each has its own root: a closed
// panel that inherits it, and one whose explicit `false` overrides it.
for (const [option, flag, flags] of [
  ["kept", "keepMounted", { keepMounted: true, hiddenUntilFound: false }],
  ["found", "hiddenUntilFound", { keepMounted: false, hiddenUntilFound: true }],
] as const) {
  test(`the server renders a root ${flag} and a panel's false over it as core does`, async ({
    page,
  }) => {
    const html = await serverHtml(page, path);
    const root = `[data-testid=${option}-root]`;
    const { "data-ui-sdk-id": id } = await serverAttributes(page, html, root);
    const parts: OraclePart[] = [{ slot: "root", selector: root }];

    for (const [label, panel] of [
      ["inherit", {}],
      ["override", { keepMounted: false, hiddenUntilFound: false }],
    ] as const) {
      const item = `[data-probe=${option}-${label}-item]`;
      const value = label;

      parts.push(
        { slot: "item", props: { value }, selector: item, authored: ["value"] },
        { slot: "header", props: { value }, selector: `${item} > h3` },
        { slot: "trigger", props: { value }, selector: `[data-probe=${option}-${label}-trigger]` },
        {
          slot: "panel",
          props: { value, ...panel },
          selector: `[data-probe=${option}-${label}-panel]`,
        },
      );
    }

    // The inherited panel is in the page, closed; the overriding one isn't.
    expect(html).toContain(`data-probe="${option}-inherit-panel"`);
    expect(html).not.toContain(`data-probe="${option}-override-panel"`);
    await expectServerMatchesCore(page, html, accordion, { id, ...flags }, parts);
  });
}

test.describe("D-b: an item without a value gets a made value that survives hydration", () => {
  test("default panel: the item and trigger carry it on the server; the panel's id follows a press", async ({
    page,
  }, testInfo) => {
    const messages = captureMessages(page);
    const html = await serverHtml(page, path);
    const { "data-ui-sdk-id": root } = await serverAttributes(page, html, "[data-testid=outer]");
    const { "data-ui-sdk-id": made } = await serverAttributes(page, html, "[data-probe=m-item]");
    const { id: trigger } = await serverAttributes(page, html, "[data-probe=m-trigger]");

    expect(made).toMatch(/^ui-sdk-s\d+$/);
    expect(trigger).toBe(`${root}-trigger-${made}`);
    expect(html).not.toContain('data-probe="m-panel"');

    await start(page, testInfo, "m-trigger");
    await expect(probe(page, "m-item")).toHaveAttribute("data-ui-sdk-id", made!);
    await probe(page, "m-trigger").click();
    await expect(state(page, "outer-state")).toHaveText(made!);
    await expect(probe(page, "m-panel")).toHaveAttribute("id", `${root}-panel-${made}`);
    await expect(probe(page, "m-trigger")).toHaveAttribute(
      "aria-controls",
      `${root}-panel-${made}`,
    );
    expectClean(messages);
  });

  test("kept panel: the server renders its id from the made value", async ({ page }, testInfo) => {
    const messages = captureMessages(page);
    const html = await serverHtml(page, path);
    const { "data-ui-sdk-id": root } = await serverAttributes(page, html, "[data-testid=outer]");
    const { "data-ui-sdk-id": made } = await serverAttributes(page, html, "[data-probe=mk-item]");
    const panel = await serverAttributes(page, html, "[data-probe=mk-panel]");

    expect(panel["id"]).toBe(`${root}-panel-${made}`);
    expect(panel["hidden"]).toBe("");

    await start(page, testInfo, "mk-trigger");
    await probe(page, "mk-trigger").click();
    await expect(state(page, "outer-state")).toHaveText(made!);
    await expect(probe(page, "mk-panel")).toHaveAttribute("id", panel["id"]!);
    expect(await page.evaluate(() => window.__uiSdkPanels.sameServerNode("mk-panel"))).toBe(true);
    expectClean(messages);
  });
});

test("hydration keeps the server nodes and every attribute but core's bind-time ones", async ({
  page,
}) => {
  const messages = captureMessages(page);

  await openObserved(page, path, () => page.evaluate(() => window.__uiSdkPanels.remember()));
  await expect(page.getByTestId("app-ready")).toHaveAttribute("data-ready", "true");

  if (modeOf(test.info()) === "incremental") {
    await page.getByTestId("hydrate").click();
  }

  await waitBound(page, "open-panel", "mk-panel", "f-panel", "x-trigger", "fenced-trigger");

  // Core's bind-time writes (the readme's SSR rules): items' `data-index`, triggers'
  // `aria-controls` for the panels in the page, panels' size variables, and a disabled fieldset's
  // `aria-disabled` and `data-disabled`. `unknown` is the made-value items' parts: their nearest
  // `data-ui-sdk-id` is their own.
  const bindTime = [
    "controlled accordion-item data-index",
    "fenced accordion data-disabled",
    "fenced accordion-header data-disabled",
    "fenced accordion-item data-disabled",
    "fenced accordion-item data-index",
    "fenced accordion-trigger aria-disabled",
    "fenced accordion-trigger data-disabled",
    "found-root accordion-item data-index",
    "found-root accordion-panel style",
    "found-root accordion-trigger aria-controls",
    "inner accordion-item data-index",
    "kept-root accordion-item data-index",
    "kept-root accordion-panel style",
    "kept-root accordion-trigger aria-controls",
    "life accordion-item data-index",
    "locked accordion-item data-index",
    "locked accordion-panel style",
    "locked accordion-trigger aria-controls",
    "multi accordion-item data-index",
    "outer accordion-item data-index",
    "outer accordion-panel style",
    "outer accordion-trigger aria-controls",
    "single accordion-item data-index",
    "unknown accordion-item data-index",
    "unknown accordion-panel style",
    "unknown accordion-trigger aria-controls",
  ];

  // The bind-time writes arrive; then a window in which no other change and no node
  // replacement may land.
  await expect.poll(() => changedOffServer(page)).toEqual(bindTime);
  await page.waitForTimeout(300);

  for (const label of ["open-panel", "mk-panel", "f-panel", "x-trigger", "m-item"]) {
    expect(
      await page.evaluate((label) => window.__uiSdkPanels.sameServerNode(label), label),
      label,
    ).toBe(true);
  }

  expect(await changedOffServer(page)).toEqual(bindTime);
  expectClean(messages);
});

test.describe("a default panel's life", () => {
  test("P2: it has its attributes and starting style by the first frame", async ({
    page,
  }, testInfo) => {
    const messages = captureMessages(page);

    await firstFrame(page, testInfo, life);
    expectClean(messages);
  });

  test("P3: it exits, completes, then leaves", async ({ page }, testInfo) => {
    const messages = captureMessages(page);

    await exitThenRemove(page, testInfo, life);
    expect(completions((await readLog(page)).entries, "open")).toEqual([]);
    expectClean(messages);
  });

  test("P3: reopened during its exit, it stays the same node", async ({ page }, testInfo) => {
    const messages = captureMessages(page);

    await reopenDuringExit(page, testInfo, life);
    expectClean(messages);
  });

  test("P3: destroyed during its exit, it completes nothing and keeps no listener", async ({
    page,
  }, testInfo) => {
    const messages = captureMessages(page);

    await destroyDuringExit(page, testInfo, { ...life, destroy: "destroy" });
    expectClean(messages);
  });
});

test("P7: a mount invalidated before its bind never binds, and the remount does once", async ({
  page,
}, testInfo) => {
  const messages = captureMessages(page);

  await invalidatedBeforeBind(page, testInfo, flicker);
  await invalidatedBeforeBind(page, testInfo, flickerFindable);
  expectClean(messages);
});

test.describe("find in page", () => {
  test("A3: a find before the panel binds reveals it closed; bind restores the token", async ({
    page,
  }, testInfo) => {
    const messages = captureMessages(page);

    await findBeforeBind(page, testInfo, find);
    expectClean(messages);
  });

  test("P5: a find after bind opens it on the same node", async ({ page }, testInfo) => {
    const messages = captureMessages(page);

    await findAfterBind(page, testInfo, find, false);
    expectClean(messages);
  });

  test("P5: a canceled find restores until-found", async ({ page }, testInfo) => {
    const messages = captureMessages(page);

    await findAfterBind(page, testInfo, find, true);
    expectClean(messages);
  });
});

test("A2: a press asks the open item, the pressed item, then the accordion, then commits; completion follows the settle", async ({
  page,
}, testInfo) => {
  const messages = captureMessages(page);

  await start(page, testInfo, "x-trigger", "open-trigger");

  const opened = await cut(page);

  await probe(page, "x-trigger").click();
  await waitLog(page, ({ entries }) => completions(entries, "x", opened).length > 0);

  let log = await readLog(page);
  const order = outputs(log.entries, opened).filter(
    (entry) =>
      entry.label === "outer" ||
      ((entry.label === "x" || entry.label === "open") && entry.name !== "openChangeComplete"),
  );
  const inserted = first(log.entries, "insert", "x-panel", opened)!;
  const entered = first(log.entries, "transition-finished", "x-panel", opened)!;

  // Core asks the open item to close, then x to open, then the accordion.
  expect(order).toMatchObject([
    {
      label: "open",
      name: "openChangeRequest",
      value: false,
      canceled: false,
      reason: "trigger-press",
    },
    {
      label: "x",
      name: "openChangeRequest",
      value: true,
      canceled: false,
      reason: "trigger-press",
    },
    { label: "outer", name: "valueChangeRequest", value: ["x"], canceled: false },
    // A listener of the proposal still reads the committed value.
    { label: "outer", name: "valueChange", value: ["x"], previous: ["open"] },
  ]);
  expect(order).toHaveLength(4);
  expect(order[3]!.seq).toBeLessThan(inserted.seq);
  expect(completions(log.entries, "x", opened).map((entry) => entry.value)).toEqual([true]);
  expect(completions(log.entries, "x", opened)[0]!.seq).toBeGreaterThan(entered.seq);
  await expect(state(page, "outer-state")).toHaveText("x");

  const closed = await cut(page);

  await probe(page, "x-trigger").click();
  await expect(probe(page, "x-panel")).toHaveCount(0);
  log = await readLog(page);

  const done = completions(log.entries, "x", closed);
  const exited = first(log.entries, "transition-finished", "x-panel", closed)!;
  const removed = first(log.entries, "remove", "x-panel", closed)!;

  expect(done.map((entry) => entry.value)).toEqual([false]);
  expect(done[0]!.seq).toBeGreaterThan(exited.seq);
  expect(done[0]!.seq).toBeLessThan(removed.seq);
  // The server-open item emitted nothing on load, and one `false` when x replaced it.
  expect(completions(log.entries, "open").map((entry) => entry.value)).toEqual([false]);
  expectClean(messages);
});

// Each veto stops the transaction where it lands: nothing after it is asked.
for (const veto of ["outgoing", "item", "root"] as const) {
  test(`A2: a${veto === "outgoing" ? "n" : ""} ${veto} veto changes nothing and nothing claims the change`, async ({
    page,
  }, testInfo) => {
    const messages = captureMessages(page);

    await start(page, testInfo, "x-trigger");
    await page.getByTestId(`veto-${veto}`).click();

    const from = await cut(page);

    await probe(page, "x-trigger").click();
    // Past the 200 ms transition, so a late completion would show.
    await page.waitForTimeout(300);

    const log = await readLog(page);
    const expected: object[] = [
      { label: "open", name: "openChangeRequest", value: false, canceled: veto === "outgoing" },
    ];

    if (veto !== "outgoing") {
      expected.push({
        label: "x",
        name: "openChangeRequest",
        value: true,
        canceled: veto === "item",
      });
    }

    if (veto === "root") {
      expected.push({ label: "outer", name: "valueChangeRequest", value: ["x"], canceled: true });
    }

    expect(outputs(log.entries, from)).toMatchObject(expected);
    expect(outputs(log.entries, from)).toHaveLength(expected.length);
    expect(first(log.entries, "insert", "x-panel", from)).toBeUndefined();
    await expect(state(page, "outer-state")).toHaveText("open");
    await expect(probe(page, "open-trigger")).toHaveAttribute("aria-expanded", "true");
    expectClean(messages);
  });
}

test("a direct [value] write opens the item with no request and one completion", async ({
  page,
}, testInfo) => {
  const messages = captureMessages(page);

  await start(page, testInfo, "c1-trigger");

  const from = await cut(page);

  await page.getByTestId("set-controlled").click();
  await waitLog(page, ({ entries }) => completions(entries, "c1", from).length > 0);
  await page.waitForTimeout(250);
  expect(outputs((await readLog(page)).entries, from)).toMatchObject([
    { label: "c1", name: "openChangeComplete", value: true },
  ]);
  expect(outputs((await readLog(page)).entries, from)).toHaveLength(1);
  await expect(probe(page, "c1-trigger")).toHaveAttribute("aria-expanded", "true");
  expectClean(messages);
});

test("single, multiple and collapsible off", async ({ page }, testInfo) => {
  const messages = captureMessages(page);

  await start(page, testInfo, "single-b-trigger", "multi-b-trigger", "locked-a-trigger");

  await probe(page, "single-a-trigger").click();
  await probe(page, "single-b-trigger").click();
  await expect(state(page, "single-state")).toHaveText("b");

  await probe(page, "multi-a-trigger").click();
  await probe(page, "multi-b-trigger").click();
  await expect(state(page, "multi-state")).toHaveText("a b");

  // The one open item can't close: its trigger says so, and stays focusable.
  await expect(probe(page, "locked-a-trigger")).toHaveAttribute("aria-disabled", "true");
  await probe(page, "locked-a-trigger").press("Enter");
  await expect(state(page, "locked-state")).toHaveText("a");
  await probe(page, "locked-b-trigger").click();
  await expect(state(page, "locked-state")).toHaveText("b");
  expectClean(messages);
});

test("R2-F2: a panel mounted after hydration follows its item's disabled on the same node", async ({
  page,
}, testInfo) => {
  const messages = captureMessages(page);

  await start(page, testInfo, "y-trigger");
  await probe(page, "y-trigger").click();
  await waitLog(page, ({ entries }) => {
    const inserted = first(entries, "insert", "y-panel");

    return (
      inserted !== undefined &&
      first(entries, "transition-finished", "y-panel", inserted.seq) !== undefined
    );
  });

  const node = currentPanel(await readLog(page), "y-panel")!.node;

  for (const disabled of [true, false]) {
    await page.getByTestId("toggle-y-disabled").click();
    await frameAndTask(page);

    const panel = currentPanel(await readLog(page), "y-panel")!;

    expect(panel.node, "the same node").toBe(node);
    expect("data-disabled" in panel.attrs, "the panel's data-disabled").toBe(disabled);
    expect("data-open" in panel.attrs).toBe(true);
    expect("hidden" in panel.attrs).toBe(false);

    if (disabled) {
      await expect(probe(page, "y-item")).toHaveAttribute("data-disabled", "");
      await expect(probe(page, "y-trigger")).toHaveAttribute("aria-disabled", "true");
    } else {
      await expect(probe(page, "y-item")).not.toHaveAttribute("data-disabled");
      await expect(probe(page, "y-trigger")).not.toHaveAttribute("aria-disabled");
    }

    await expect(page.getByTestId("y-disabled")).toHaveText(String(disabled));
  }

  expectClean(messages);
});

test("nested: an inner accordion works on its own", async ({ page }, testInfo) => {
  const messages = captureMessages(page);

  await start(page, testInfo, "inner-trigger");
  await probe(page, "inner-trigger").click();
  await expect(state(page, "inner-state")).toHaveText("inner");
  await expect(state(page, "outer-state")).toHaveText("open");
  await expect(probe(page, "inner-panel")).toBeVisible();
  expectClean(messages);
});

const misuse =
  "uiAccordionTrigger goes inside a uiAccordionItem of the same uiAccordion. Wrap it in <div uiAccordionItem> inside that accordion.";

test("nested: a trigger in an inner accordion without its own item throws UiSdkError", async ({
  page,
}, testInfo) => {
  const messages = captureMessages(page);

  await start(page, testInfo, "inner-trigger");

  const from = await cut(page);

  await page.getByTestId("misuse").click();
  await frameAndTask(page);
  expect(await page.evaluate(() => window.__uiSdkErrors ?? [])).toEqual([
    { name: "UiSdkError", message: misuse, devMode: true },
  ]);
  expect(outputs((await readLog(page)).entries, from)).toEqual([]);
  await expect(state(page, "outer-state")).toHaveText("open");
  expectOnlyError(messages, misuse);
});

test("a disabled fieldset disables the triggers once they bind", async ({ page }, testInfo) => {
  const messages = captureMessages(page);
  const html = await serverHtml(page, path);

  expect(
    (await serverAttributes(page, html, "[data-probe=fenced-trigger]"))["aria-disabled"],
  ).toBeUndefined();
  await start(page, testInfo, "fenced-trigger");
  await expect(probe(page, "fenced-trigger")).toHaveAttribute("aria-disabled", "true");
  expectClean(messages);
});

test("incremental: a press before hydration is replayed after bind and opens once", async ({
  page,
}, testInfo) => {
  test.skip(modeOf(testInfo) !== "incremental", "replay through a hydrate trigger");

  const messages = captureMessages(page);

  await openPanels(page, path);
  await expect(page.getByTestId("app-ready")).toHaveAttribute("data-ready", "true");
  await probe(page, "x-trigger").click();
  await waitLog(page, ({ entries }) => completions(entries, "x").length > 0);
  await page.waitForTimeout(250);

  const log = await readLog(page);

  expect(outputs(log.entries, 0, { label: "x" }).map((entry) => entry.name)).toEqual([
    "openChangeRequest",
    "openChangeComplete",
  ]);
  expect(
    after(log.entries, 0).filter((entry) => entry.kind === "insert" && entry.label === "x-panel"),
  ).toHaveLength(1);
  expect(await page.evaluate(() => window.__uiSdkPanels.sameServerNode("mk-panel"))).toBe(true);
  expectClean(messages);
});
