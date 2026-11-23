// Tabs over core's presence: D4's first-enabled-tab default by layout, selection and tab stop on
// the server and after bind, the panel lifecycle (Tabs has no completion output: settle and
// removal only), find in page, keys dispatched during the bind pass, and the keyboard contract.
import { type Page, expect, test } from "@playwright/test";
import { tabs } from "@ui-sdk/core/tabs";
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
  type PanelEntry,
  after,
  bound,
  currentPanel,
  cut,
  first,
  frameAndTask,
  hydrate,
  ofNode,
  openPanels,
  outputs,
  readLog,
  recordPanelLog,
  serverHtml,
  waitBound,
  waitLog,
} from "./panel-log";

const path = "/tabs";
const probe = (page: Page, label: string) => page.locator(`[data-probe="${label}"]`);

async function rootId(page: Page, testId: string): Promise<string> {
  return (await page.getByTestId(testId).getAttribute("data-ui-sdk-id"))!;
}

async function focused(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("data-probe") ?? null);
}

const life: Lifecycle = {
  path,
  open: "life-two",
  close: "life-one",
  panel: "life-two-panel",
  ready: ["life-two"],
  stable: async (page) => ({
    attrs: {
      "data-slot": "tabs-panel",
      id: `${await rootId(page, "life")}-panel-two`,
      role: "tabpanel",
      "aria-labelledby": (await probe(page, "life-two").getAttribute("id"))!,
      "data-selected": "",
    },
    controlledBy: "life-two",
  }),
};

const find: Findable = {
  path,
  ready: ["find-C"],
  panel: "find-C-panel",
  shownBy: { label: "find-C", attribute: "aria-selected" },
  state: { testId: "find-state", closed: "B", found: "C" },
  request: { label: "find", name: "valueChangeRequest", value: "C" },
  veto: "veto",
};

const flicker: Invalidation = {
  path,
  ready: ["flicker-two"],
  flicker: "flicker",
  remount: "reselect",
  panel: "flicker-two-panel",
  controlledBy: "flicker-two",
  close: "flicker-one",
};

const flickerFindable: Invalidation = {
  path,
  ready: ["flicker-three"],
  flicker: "flicker-find",
  remount: "remount-find",
  unmount: "unfind",
  panel: "flicker-three-panel",
  controlledBy: "flicker-three",
  close: "flicker-one",
  find: { label: "flicker", name: "valueChangeRequest", value: "three" },
};

test.beforeEach(async ({ page }) => {
  await recordPanelLog(page);
});

test("the server renders an explicit default as core does", async ({ page }) => {
  const html = await serverHtml(page, path);
  const { "data-ui-sdk-id": id } = await serverAttributes(page, html, "[data-testid=main]");
  const parts: OraclePart[] = [
    { slot: "root", selector: "[data-testid=main]", authored: ["defaultvalue"] },
    { slot: "list", selector: "[data-probe=main-list]", authored: ["aria-label"] },
  ];

  for (const [value, disabled] of [
    ["A", true],
    ["B", undefined],
    ["C", undefined],
    ["D", undefined],
  ] as const) {
    parts.push({
      slot: "tab",
      props: { value, disabled },
      selector: `[data-probe=main-${value}]`,
      authored: ["value"],
    });
  }

  parts.push({ slot: "indicator", selector: "[data-probe=main-indicator]" });

  for (const value of ["A", "B", "C", "D"]) {
    parts.push({ slot: "panel", props: { value }, selector: `[data-probe=main-${value}-panel]` });
  }

  await expectServerMatchesCore(page, html, tabs, { id, defaultValue: "C" }, parts);
});

test("the server renders a root hiddenUntilFound and a panel's false over it as core does", async ({
  page,
}) => {
  const html = await serverHtml(page, path);
  const { "data-ui-sdk-id": id } = await serverAttributes(page, html, "[data-testid=find]");
  const parts: OraclePart[] = [
    {
      slot: "root",
      selector: "[data-testid=find]",
      authored: ["defaultvalue", "hiddenuntilfound"],
    },
    { slot: "list", selector: "[data-probe=find-list]", authored: ["aria-label"] },
  ];

  for (const value of ["B", "C", "D"]) {
    parts.push({
      slot: "tab",
      props: { value },
      selector: `[data-probe=find-${value}]`,
      authored: ["value"],
    });
  }

  // B is selected; C inherits the root's findability; D's `false` leaves it out.
  parts.push(
    { slot: "panel", props: { value: "B" }, selector: "[data-probe=find-B-panel]" },
    { slot: "panel", props: { value: "C" }, selector: "[data-probe=find-C-panel]" },
    {
      slot: "panel",
      props: { value: "D", hiddenUntilFound: false },
      selector: "[data-probe=find-D-panel]",
    },
  );
  expect(html).toContain('data-probe="find-C-panel"');
  expect(html).not.toContain('data-probe="find-D-panel"');
  await expectServerMatchesCore(
    page,
    html,
    tabs,
    { id, defaultValue: "B", hiddenUntilFound: true },
    parts,
  );
});

type Layout = {
  name: string;
  /** Selected tab, server panel, tab stop and the root's rendered `state().value` in the raw HTML. */
  server: { selected: string | null; panel: string | null; stop: string | null; state: string };
  /** After bind. */
  bound: {
    selected: string | null;
    panel: string | null;
    stop: string;
    state: string;
    sameNode: boolean;
  };
  /** The tab whose bind the case waits for. */
  wait: string;
};

const layouts: Layout[] = [
  {
    name: "a",
    server: { selected: "B", panel: "B", stop: "B", state: "null" },
    bound: { selected: "B", panel: "B", stop: "B", state: "B", sameNode: true },
    wait: "B",
  },
  {
    name: "b",
    server: { selected: "B", panel: "B", stop: "B", state: "null" },
    bound: { selected: "B", panel: "B", stop: "B", state: "B", sameNode: true },
    wait: "B",
  },
  {
    name: "c",
    server: { selected: "B", panel: null, stop: "B", state: "null" },
    bound: { selected: "B", panel: "B", stop: "B", state: "B", sameNode: false },
    wait: "B",
  },
  {
    name: "d",
    server: { selected: "B", panel: null, stop: "B", state: "null" },
    bound: { selected: "B", panel: "B", stop: "B", state: "B", sameNode: false },
    wait: "B",
  },
  {
    name: "c-default",
    server: { selected: "C", panel: "C", stop: "C", state: "C" },
    bound: { selected: "C", panel: "C", stop: "C", state: "C", sameNode: true },
    wait: "B",
  },
  {
    name: "d-default",
    server: { selected: "C", panel: "C", stop: "C", state: "C" },
    bound: { selected: "C", panel: "C", stop: "C", state: "C", sameNode: true },
    wait: "B",
  },
  {
    name: "e",
    server: { selected: null, panel: null, stop: "B", state: "null" },
    bound: { selected: null, panel: null, stop: "B", state: "null", sameNode: false },
    wait: "B",
  },
  {
    name: "f",
    server: { selected: "A", panel: "A", stop: "A", state: "A" },
    bound: { selected: "A", panel: "A", stop: "B", state: "A", sameNode: true },
    wait: "B",
  },
  {
    name: "g",
    server: { selected: null, panel: null, stop: null, state: "null" },
    bound: { selected: null, panel: null, stop: "A", state: "null", sameNode: false },
    wait: "A",
  },
  // A mixed list: B's claim runs in the list's own view, before A's in its `@if` view, so the
  // server selects B against DOM order; bind selects A by DOM order, with no output.
  {
    name: "h",
    server: { selected: "B", panel: "B", stop: "B", state: "null" },
    bound: { selected: "A", panel: "A", stop: "A", state: "A", sameNode: false },
    wait: "A",
  },
];

/** Which tab is selected and which holds the tab stop, and which panels exist, in `html` or the page. */
async function layoutDom(page: Page, html?: string) {
  return page.evaluate((html) => {
    let root: ParentNode = document;

    if (html !== undefined) {
      root = new DOMParser().parseFromString(html, "text/html");
    }

    const selected = [];
    const stops = [];
    const panels = [];

    for (const tab of root.querySelectorAll("[data-testid=layout] [data-slot=tabs-tab]")) {
      if (tab.getAttribute("aria-selected") === "true") {
        selected.push(tab.getAttribute("data-probe"));
      }

      if (tab.getAttribute("tabindex") === "0") {
        stops.push(tab.getAttribute("data-probe"));
      }
    }

    for (const panel of root.querySelectorAll("[data-testid=layout] [data-probe-panel]")) {
      panels.push(panel.getAttribute("data-probe")!.replace(/-panel$/, ""));
    }

    return { selected, stops, panels };
  }, html);
}

/** The text of the element `selector` matches in `html`. */
async function serverText(page: Page, html: string, selector: string): Promise<string | null> {
  return page.evaluate(
    ({ html, selector }) =>
      new DOMParser()
        .parseFromString(html, "text/html")
        .querySelector(selector)
        ?.textContent?.trim() ?? null,
    { html, selector },
  );
}

test.describe("D4: selection and tab stop by layout", () => {
  for (const layout of layouts) {
    test(`(${layout.name})`, async ({ page }, testInfo) => {
      const messages = captureMessages(page);
      const route = `${path}?layout=${layout.name}`;
      const html = await serverHtml(page, route);
      const server = await layoutDom(page, html);
      const list = (value: string | null) => (value === null ? [] : [value]);

      // Selection, then tab stop, on the server.
      expect(server.selected).toEqual(list(layout.server.selected));
      expect(server.panels).toEqual(list(layout.server.panel));
      expect(server.stops).toEqual(list(layout.server.stop));
      // The root's state as the server rendered it, before anything hydrates. Without a default,
      // this read after the root renders `null`, also where the server selected B.
      expect(await serverText(page, html, "[data-testid=layout-state]")).toBe(layout.server.state);

      await openPanels(page, route);
      await hydrate(page, testInfo);
      await waitBound(page, layout.wait);

      if (layout.bound.panel !== null) {
        await waitBound(page, `${layout.bound.panel}-panel`);
      }

      const bound = {
        selected: list(layout.bound.selected),
        stops: [layout.bound.stop],
        panels: list(layout.bound.panel),
      };
      const state = page.getByTestId("layout-state");

      // The bound selection, tab stop, panels and state arrive (a leaving panel's exit included);
      // then a window in which none of them may change and no output may come.
      await expect.poll(() => layoutDom(page)).toEqual(bound);
      await expect(state).toHaveText(layout.bound.state);
      await page.waitForTimeout(300);
      expect(await layoutDom(page)).toEqual(bound);
      expect((await state.textContent())?.trim()).toBe(layout.bound.state);

      const log = await readLog(page);

      if (layout.bound.panel !== null) {
        const panel = `${layout.bound.panel}-panel`;
        const tab = probe(page, layout.bound.panel);

        await expect(tab).toHaveAttribute(
          "aria-controls",
          (await probe(page, panel).getAttribute("id"))!,
        );
        await expect(probe(page, panel)).toBeVisible();
        expect(currentPanel(log, panel)?.node === log.server[panel]).toBe(layout.bound.sameNode);
      }

      expect(outputs(log.entries)).toEqual([]);
      expectClean(messages);
    });
  }
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

  await waitBound(
    page,
    "main-C-panel",
    "main-indicator",
    "main-C-icon",
    "find-C-panel",
    "authored-one",
  );

  // Core's bind-time writes (the readme's SSR rules): tabs' `aria-controls` for the panels in
  // the page, a panel's `tabindex` without focusable content, the indicator's variables, the
  // icons' `data-has-icon` and the list's `data-has-icons`.
  const bindTime = [
    "authored tabs-panel tabindex",
    "authored tabs-tab aria-controls",
    "controlled tabs-panel tabindex",
    "controlled tabs-tab aria-controls",
    "find tabs-panel tabindex",
    "find tabs-tab aria-controls",
    "flicker-root tabs-panel tabindex",
    "flicker-root tabs-tab aria-controls",
    "life tabs-panel tabindex",
    "life tabs-tab aria-controls",
    "main tabs-indicator style",
    "main tabs-list data-has-icons",
    "main tabs-panel tabindex",
    "main tabs-tab aria-controls",
    "main tabs-tab data-has-icon",
    "manual tabs-panel tabindex",
    "manual tabs-tab aria-controls",
  ];

  // The bind-time writes arrive; then a window in which no other change and no node
  // replacement may land.
  await expect.poll(() => changedOffServer(page)).toEqual(bindTime);
  await page.waitForTimeout(300);

  for (const label of ["main-C-panel", "find-C-panel", "main-B", "main-indicator"]) {
    expect(
      await page.evaluate((label) => window.__uiSdkPanels.sameServerNode(label), label),
      label,
    ).toBe(true);
  }

  expect(await changedOffServer(page)).toEqual(bindTime);
  expectClean(messages);
});

test.describe("a panel's life (no completion output)", () => {
  test("P2: it has its attributes and starting style by the first frame", async ({
    page,
  }, testInfo) => {
    const messages = captureMessages(page);

    await firstFrame(page, testInfo, life);
    expectClean(messages);
  });

  test("P3: it exits, then leaves", async ({ page }, testInfo) => {
    const messages = captureMessages(page);

    await exitThenRemove(page, testInfo, life);
    expectClean(messages);
  });

  test("P3: reselected during its exit, it stays the same node", async ({ page }, testInfo) => {
    const messages = captureMessages(page);

    await reopenDuringExit(page, testInfo, life);
    expectClean(messages);
  });

  test("P3: destroyed during its exit, it keeps no listener", async ({ page }, testInfo) => {
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
  test("A3: a find before the panel binds reveals it unselected; bind restores the token", async ({
    page,
  }, testInfo) => {
    const messages = captureMessages(page);

    await findBeforeBind(page, testInfo, find);
    expectClean(messages);
  });

  test("P5: a find after bind selects its tab on the same node", async ({ page }, testInfo) => {
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

function coreFocusCalls(entries: PanelEntry[]): PanelEntry[] {
  const calls = [];

  for (const entry of entries) {
    if (
      entry.kind === "focus" &&
      entry.stack?.includes("keydown") === true &&
      /roving|focusOn/.test(entry.stack)
    ) {
      calls.push(entry);
    }
  }

  return calls;
}

for (const ordered of [false, true]) {
  test(`R2-F1: a key dispatched during the bind pass reaches core once every tab bound${ordered ? ", after an earlier queued End" : ""}`, async ({
    page,
  }, testInfo) => {
    const messages = captureMessages(page);

    await openPanels(page, `/bind-pass/tabs${ordered ? "?order=1" : ""}`);
    await hydrate(page, testInfo);
    await waitBound(page, "tabs-list", "t1", "t2", "t3", "t4");
    await frameAndTask(page);

    const { entries } = await readLog(page);
    const start = outputs(entries, 0, { name: "bind-pass-start" })[0]!;
    const list = bound(entries, "tabs-list")!;
    const tabsBound = ["t1", "t2", "t3", "t4"].map((label) => bound(entries, label)!);
    const last = tabsBound[3]!;
    const calls = coreFocusCalls(entries);

    // Validity: the list bound before the probe ran, no tab had.
    expect(list.seq, "ordering not reached: the list binds first").toBeLessThan(start.seq);

    for (const tab of tabsBound) {
      expect(tab.seq, "ordering not reached: a tab bound before the probe").toBeGreaterThan(
        start.seq,
      );
    }

    expect(await focused(page)).toBe("t2");
    await expect(probe(page, "t2")).toHaveAttribute("aria-selected", "true");
    await expect(probe(page, "t2")).toHaveAttribute("tabindex", "0");
    expect(calls.map((call) => call.label)).toEqual(ordered ? ["t4", "t2"] : ["t2"]);

    for (const call of calls) {
      expect(call.seq, "core focuses after the last tab bound").toBeGreaterThan(last.seq);
    }

    expectClean(messages);
  });
}

test("arrows, Home and End move between tabs; a disabled tab is focusable but never selected", async ({
  page,
}, testInfo) => {
  const messages = captureMessages(page);

  await openPanels(page, path);
  await hydrate(page, testInfo);
  await waitBound(page, "main-D");
  await probe(page, "main-C").focus();

  // Each key: where focus lands, and what's selected after it.
  for (const [key, focus, selected] of [
    ["ArrowRight", "main-D", "D"],
    ["ArrowRight", "main-A", "D"],
    ["ArrowRight", "main-B", "B"],
    ["Home", "main-A", "B"],
    ["End", "main-D", "D"],
  ] as const) {
    await page.keyboard.press(key);
    expect(await focused(page), key).toBe(focus);
    await expect(page.getByTestId("main-state"), key).toHaveText(selected);
  }
  // A pointer click too: Playwright won't click an aria-disabled element without force.
  await probe(page, "main-A").click({ force: true });
  await expect(page.getByTestId("main-state")).toHaveText("D");
  await expect(probe(page, "main-A")).toHaveAttribute("aria-disabled", "true");
  expectClean(messages);
});

test("manual activation: arrows move focus, Enter selects", async ({ page }, testInfo) => {
  const messages = captureMessages(page);

  await openPanels(page, path);
  await hydrate(page, testInfo);
  await waitBound(page, "manual-two");
  await probe(page, "manual-one").focus();
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("manual-two");
  await expect(page.getByTestId("manual-state")).toHaveText("one");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("manual-state")).toHaveText("two");
  await expect(probe(page, "manual-two-panel")).toBeVisible();
  expectClean(messages);
});

test("a valueChangeRequest can refuse; [(value)] commits; null selects nothing and renders no panel", async ({
  page,
}, testInfo) => {
  const messages = captureMessages(page);

  await openPanels(page, path);
  await hydrate(page, testInfo);
  await waitBound(page, "main-B", "controlled-y");
  await page.getByTestId("veto").click();

  const from = await cut(page);

  await probe(page, "main-B").click();
  await page.waitForTimeout(250);
  expect(outputs((await readLog(page)).entries, from, { label: "main" })).toMatchObject([
    { name: "valueChangeRequest", value: "B", canceled: true, reason: "item-press" },
  ]);
  await expect(page.getByTestId("main-state")).toHaveText("C");

  await probe(page, "controlled-y").click();
  await expect(page.getByTestId("controlled-state")).toHaveText("y");
  await expect(probe(page, "controlled-y-panel")).toBeVisible();

  await page.getByTestId("select-none").click();
  await expect(probe(page, "controlled-y-panel")).toHaveCount(0);
  await expect(probe(page, "controlled-x-panel")).toHaveCount(0);
  await expect(probe(page, "controlled-x")).toHaveAttribute("aria-selected", "false");
  await expect(probe(page, "controlled-y")).toHaveAttribute("aria-selected", "false");
  expectClean(messages);
});

/** The authored tab and its authored panel name each other: `aria-controls` and `aria-labelledby`. */
async function expectAuthoredLinks(page: Page): Promise<void> {
  await expect(probe(page, "authored-one")).toHaveAttribute("id", "authored-tab");
  await expect(probe(page, "authored-one-panel")).toHaveAttribute("id", "authored-panel");
  await expect(probe(page, "authored-one-panel")).toHaveAttribute(
    "aria-labelledby",
    "authored-tab",
  );
  await expect(probe(page, "authored-one")).toHaveAttribute("aria-controls", "authored-panel");
}

test("authored tab and panel ids hold on the server, after bind and on a new panel node", async ({
  page,
}, testInfo) => {
  const messages = captureMessages(page);
  const html = await serverHtml(page, path);
  const server = await serverAttributes(page, html, "[data-probe=authored-one-panel]");

  expect(server["id"]).toBe("authored-panel");
  expect(server["aria-labelledby"]).toBe("authored-tab");

  await openPanels(page, path);

  const original = (await readLog(page)).server["authored-one-panel"]!;

  await hydrate(page, testInfo);
  await waitBound(page, "authored-one", "authored-one-panel");
  await expectAuthoredLinks(page);

  // Away, until the original panel has left the page; then back, onto a new node.
  const away = await cut(page);

  await probe(page, "authored-two").click();
  await waitLog(page, ({ entries }) => after(ofNode(entries, "remove", original), away).length > 0);

  const back = await cut(page);

  await probe(page, "authored-one").click();
  await waitLog(page, ({ entries }) => {
    const inserted = first(entries, "insert", "authored-one-panel", back);

    return inserted !== undefined && ofNode(entries, "bound", inserted.node!).length > 0;
  });

  const log = await readLog(page);
  const remounted = first(log.entries, "insert", "authored-one-panel", back)!.node!;

  expect(remounted).not.toBe(original);
  expect(currentPanel(log, "authored-one-panel")?.node, "the new node is the one shown").toBe(
    remounted,
  );
  expect(currentPanel(log, "authored-one-panel")!.attrs).toMatchObject({
    id: "authored-panel",
    "aria-labelledby": "authored-tab",
  });
  await expectAuthoredLinks(page);
  await expect(page.locator("#authored-panel")).toHaveCount(1);
  expectClean(messages);
});

test("incremental: a press before hydration is replayed after bind and selects once", async ({
  page,
}, testInfo) => {
  test.skip(modeOf(testInfo) !== "incremental", "replay through a hydrate trigger");

  const messages = captureMessages(page);

  await openPanels(page, path);
  await expect(page.getByTestId("app-ready")).toHaveAttribute("data-ready", "true");
  await probe(page, "main-B").click();
  await expect(page.getByTestId("main-state")).toHaveText("B");
  await waitLog(page, ({ entries }) => outputs(entries, 0, { name: "valueChange" }).length > 0);
  await page.waitForTimeout(250);
  expect(
    outputs((await readLog(page)).entries, 0, { label: "main" }).map((entry) => entry.name),
  ).toEqual(["valueChangeRequest", "valueChange"]);
  await expect(probe(page, "main-B-panel")).toBeVisible();
  expectClean(messages);
});
