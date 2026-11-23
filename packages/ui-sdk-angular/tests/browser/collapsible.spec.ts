// Collapsible over core's presence: the server renders each panel mode as core does, hydration
// keeps the nodes, the panel mounts with its attributes by the first frame, exits before it
// leaves, survives an invalidated mount, follows find in page, and rejects a malformed template
// in production builds too.
import { type Page, expect, test } from "@playwright/test";
import { collapsible } from "@ui-sdk/core/collapsible";
import { expectServerMatchesCore } from "./core-oracle";
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
  completions,
  cut,
  expectOnlyError,
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

const path = "/collapsible";
const probe = (page: Page, label: string) => page.locator(`[data-probe="${label}"]`);

async function rootId(page: Page, testId: string): Promise<string> {
  return (await page.getByTestId(testId).getAttribute("data-ui-sdk-id"))!;
}

const life: Lifecycle = {
  path,
  open: "life-trigger",
  close: "life-trigger",
  panel: "life-panel",
  completion: "life",
  ready: ["life-trigger"],
  stable: async (page) => ({
    attrs: {
      "data-slot": "collapsible-panel",
      id: `${await rootId(page, "life")}-panel`,
      "data-open": "",
    },
    controlledBy: "life-trigger",
  }),
};

const find: Findable = {
  path,
  ready: ["find-trigger"],
  panel: "find-panel",
  shownBy: { label: "find-trigger", attribute: "aria-expanded" },
  state: { testId: "find-state", closed: "false", found: "true" },
  request: { label: "find", name: "openChangeRequest", value: true },
  veto: "veto",
  completion: "find",
};

const flicker: Invalidation = {
  path,
  ready: ["flicker-trigger"],
  flicker: "flicker",
  remount: "reopen",
  panel: "flicker-panel",
  controlledBy: "flicker-trigger",
  close: "flicker-trigger",
  completion: "flicker",
};

const flickerFindable: Invalidation = {
  path,
  ready: ["flicker-find-trigger"],
  flicker: "flicker-find",
  remount: "remount-find",
  unmount: "unfind",
  panel: "flicker-find-panel",
  controlledBy: "flicker-find-trigger",
  close: "flicker-find-trigger",
  find: { label: "flicker-find", name: "openChangeRequest", value: true },
  completion: "flicker-find",
};

test.beforeEach(async ({ page }) => {
  await recordPanelLog(page);
});

test("the server renders each panel mode as core does", async ({ page }) => {
  const html = await serverHtml(page, path);

  for (const [testId, options, panel] of [
    ["life", {}, {}],
    ["kept", {}, { keepMounted: true }],
    ["find", {}, { hiddenUntilFound: true }],
    ["open", { defaultOpen: true }, {}],
  ] as const) {
    const { "data-ui-sdk-id": id } = await serverAttributes(page, html, `[data-testid=${testId}]`);

    await expectServerMatchesCore(page, html, collapsible, { ...options, id }, [
      { slot: "root", selector: `[data-testid=${testId}]`, authored: ["defaultopen"] },
      { slot: "trigger", selector: `[data-probe=${testId}-trigger]` },
      { slot: "panel", props: panel, selector: `[data-probe=${testId}-panel]` },
    ]);
  }

  // The literal token, which a find before hydration can match.
  expect(html).toMatch(/<div[^>]*data-probe="find-panel"[^>]*hidden="until-found"/);
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

  await waitBound(page, "kept-panel", "find-panel", "open-panel", "life-trigger");

  // Core's bind-time writes (the readme's SSR rules): a kept or findable closed panel's trigger
  // gains `aria-controls`; panels get their size variables.
  const bindTime = [
    "find collapsible-panel style",
    "find collapsible-trigger aria-controls",
    "kept collapsible-panel style",
    "kept collapsible-trigger aria-controls",
    "open collapsible-panel style",
  ];

  // The bind-time writes arrive; then a window in which no other change and no node
  // replacement may land.
  await expect.poll(() => changedOffServer(page)).toEqual(bindTime);
  await page.waitForTimeout(300);

  for (const label of ["kept-panel", "find-panel", "open-panel", "kept-trigger", "life-trigger"]) {
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

    // The server-open one reported nothing on its first render.
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

test("controlled: [(open)] commits through the binding, a request can refuse, a direct write needs none", async ({
  page,
}, testInfo) => {
  const messages = captureMessages(page);

  await openPanels(page, path);
  await hydrate(page, testInfo);
  await waitBound(page, "controlled-trigger");

  let from = await cut(page);

  await probe(page, "controlled-trigger").click();
  await expect(page.getByTestId("controlled-state")).toHaveText("true");
  await expect(probe(page, "controlled-panel")).toHaveCount(1);
  await waitLog(page, ({ entries }) => completions(entries, "controlled", from).length > 0);
  expect(outputs((await readLog(page)).entries, from, { label: "controlled" })).toMatchObject([
    { name: "openChangeRequest", value: true, canceled: false, reason: "trigger-press" },
    { name: "openChangeComplete", value: true },
  ]);

  await page.getByTestId("veto").click();
  from = await cut(page);
  await probe(page, "controlled-trigger").click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId("controlled-state")).toHaveText("true");
  await expect(probe(page, "controlled-panel")).not.toHaveAttribute("data-ending-style");
  expect(outputs((await readLog(page)).entries, from, { label: "controlled" })).toMatchObject([
    { name: "openChangeRequest", value: false, canceled: true },
  ]);

  await page.reload();
  await expect(page.getByTestId("app-ready")).toHaveAttribute("data-ready", "true");
  await hydrate(page, testInfo);
  await waitBound(page, "controlled-trigger");
  from = await cut(page);
  await page.getByTestId("set-open").click();
  await waitLog(page, ({ entries }) => completions(entries, "controlled", from).length > 0);
  await page.waitForTimeout(250);
  expect(outputs((await readLog(page)).entries, from, { label: "controlled" })).toMatchObject([
    { name: "openChangeComplete", value: true },
  ]);
  await expect(probe(page, "controlled-trigger")).toHaveAttribute("aria-expanded", "true");
  expectClean(messages);
});

test("incremental: a press before hydration is replayed after bind and opens once", async ({
  page,
}, testInfo) => {
  test.skip(modeOf(testInfo) !== "incremental", "replay through a hydrate trigger");

  const messages = captureMessages(page);

  await openPanels(page, path);
  await expect(page.getByTestId("app-ready")).toHaveAttribute("data-ready", "true");

  const kept = (await readLog(page)).server["kept-panel"];

  await probe(page, "life-trigger").click();
  await waitLog(page, ({ entries }) => completions(entries, "life").length > 0);
  await page.waitForTimeout(250);

  const log = await readLog(page);

  expect(outputs(log.entries, 0, { label: "life" }).map((entry) => entry.name)).toEqual([
    "openChangeRequest",
    "openChange",
    "openChangeComplete",
  ]);
  await expect(probe(page, "life-panel")).toBeVisible();
  expect(await page.evaluate(() => window.__uiSdkPanels.sameServerNode("kept-panel"))).toBe(true);
  expect(kept).toBeDefined();
  expectClean(messages);
});

const malformed =
  "uiCollapsiblePanel renders exactly one element, the panel: put everything else inside it. " +
  "Write <div *uiCollapsiblePanel>…</div>, or <ng-template uiCollapsiblePanel keepMounted><div>…</div></ng-template>.";

for (const production of [true, false]) {
  test(`a malformed panel template throws UiSdkError in ${production ? "production" : "development"} mode`, async ({
    page,
  }, testInfo) => {
    const messages = captureMessages(page);

    await openPanels(page, `${path}${production ? "?prod=1" : ""}`);
    await hydrate(page, testInfo);
    await waitBound(page, "malformed-trigger", "valid-trigger");
    await probe(page, "malformed-trigger").click();
    await frameAndTask(page);

    const after = await page.evaluate(() => ({
      devMode: Boolean((globalThis as { ngDevMode?: unknown }).ngDevMode),
      errors: window.__uiSdkErrors ?? [],
      children: [...document.querySelector("[data-testid=malformed]")!.childNodes]
        .filter((node) => node.nodeType !== Node.TEXT_NODE)
        .map((node) => node.nodeName),
    }));

    expect(after.devMode).toBe(!production);
    expect(after.errors).toEqual([
      { name: "UiSdkError", message: malformed, devMode: !production },
    ]);
    expect(after.children, "nothing from the template is left").toEqual(["BUTTON", "#comment"]);

    const from = await cut(page);

    await probe(page, "valid-trigger").click();
    await waitLog(page, ({ entries }) => completions(entries, "valid", from).length > 0);
    await expect(probe(page, "valid-panel")).toBeVisible();
    expect(
      completions((await readLog(page)).entries, "valid", from).map((entry) => entry.value),
    ).toEqual([true]);
    expectOnlyError(messages, malformed);
  });
}
