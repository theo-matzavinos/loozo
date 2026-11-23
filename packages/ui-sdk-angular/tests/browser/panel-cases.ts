// The structural-panel cases every component's spec runs on its own fixture: the first frame of a
// mount (P2), exit, reopen and destroy (P3), a mount invalidated before its bind (P7) and find in
// page (P5). Markers follow plan-3 step 7: node serials, core's bind marker on the exact element,
// and ordering by the log's sequence.
import { type Page, type TestInfo, expect } from "@playwright/test";
import { modeOf } from "./harness";
import {
  type PanelEntry,
  after,
  completions,
  currentPanel,
  cut,
  first,
  frameAndTask,
  hydrate,
  liveListeners,
  ofNode,
  openPanels,
  outputs,
  readLog,
  sampleFrames,
  serverHtml,
  settled,
  waitBound,
  waitLog,
} from "./panel-log";

const probe = (page: Page, label: string) => page.locator(`[data-probe="${label}"]`);
const byTestId = (page: Page, testId: string) => page.getByTestId(testId);

/** A panel that a click opens and another (or the same) click closes. */
export type Lifecycle = {
  path: string;
  /** What to click to open it. */
  open: string;
  /** What to click to close it: the same trigger, or another tab. */
  close: string;
  panel: string;
  /** The label its `openChangeComplete` reports under; Tabs have none. */
  completion?: string;
  /** Elements that must have bound before the case starts. */
  ready: string[];
  /** Its stable attributes at the first frame, and the element whose `aria-controls` names it. */
  stable: (page: Page) => Promise<{ attrs: Record<string, string>; controlledBy?: string }>;
};

async function start(page: Page, testInfo: TestInfo, path: string, ready: string[]) {
  await openPanels(page, path);
  await hydrate(page, testInfo);
  await waitBound(page, ...ready);
}

/** The panel transitions' length in the fixture (src/panels.ts). */
const transition = 200;

/**
 * Opens and waits until the panel settled: its completion; for Tabs, which have none, the end of
 * the new panel's enter transition, seen from the page.
 */
async function openSettled(page: Page, c: Lifecycle): Promise<number> {
  const from = await cut(page);

  await probe(page, c.open).click();
  await waitLog(page, ({ entries }) => {
    if (c.completion !== undefined) {
      return completions(entries, c.completion, from).length > 0;
    }

    const inserted = first(entries, "insert", c.panel, from);

    return inserted !== undefined && settled(entries, inserted.node!, from);
  });

  return from;
}

/**
 * P2: insertion `I` < the adapter's `data-slot` write `W` < `data-starting-style` `S`, no frame
 * in (I, S), no style or layout read in (I, W), and the first frame after `I` has the stable set.
 */
export async function firstFrame(page: Page, testInfo: TestInfo, c: Lifecycle): Promise<void> {
  await start(page, testInfo, c.path, c.ready);

  const expected = await c.stable(page);

  await sampleFrames(page);

  const from = await cut(page);

  await probe(page, c.open).click();
  await waitLog(page, ({ entries }) => {
    const inserted = first(entries, "insert", c.panel, from);

    return (
      inserted !== undefined && after(entries, inserted.seq).some((entry) => entry.kind === "frame")
    );
  });

  const { entries } = await readLog(page);
  const inserted = first(entries, "insert", c.panel, from)!;
  const node = inserted.node!;
  const written = after(ofNode(entries, "attr", node), inserted.seq).find(
    (entry) => entry.name === "data-slot",
  );
  const starting = after(ofNode(entries, "attr", node), written?.seq ?? Infinity).find(
    (entry) => entry.name === "data-starting-style" && entry.value === "",
  );
  const framesBeforeStart = after(entries, inserted.seq).filter(
    (entry) => entry.kind === "frame" && entry.seq < (starting?.seq ?? Infinity),
  );
  const readsBeforeWrite = after(entries, inserted.seq).filter(
    (entry) => entry.kind === "read" && entry.seq < (written?.seq ?? Infinity),
  );
  const frame = after(entries, inserted.seq).find((entry) => entry.kind === "frame");
  const sample = frame?.panels?.find((panel) => panel.node === node);

  expect(written, "the adapter writes data-slot after the insertion").toBeDefined();
  expect(starting, "core's starting style follows the adapter's write").toBeDefined();
  expect(framesBeforeStart, "no frame between insertion and the starting style").toEqual([]);
  expect(readsBeforeWrite, "no style or layout read before the first write").toEqual([]);
  expect(sample, "the first frame samples the new panel").toBeDefined();
  expect(sample!.attrs).toMatchObject(expected.attrs);
  expect(sample!.attrs["hidden"]).toBeUndefined();
  expect(sample!.attrs["data-starting-style"]).toBe("");
  expect(sample!.opacity).toBe("0");

  if (expected.controlledBy !== undefined) {
    expect(frame!.controls?.[expected.controlledBy]).toBe(sample!.attrs["id"]);
  }
}

/**
 * Watches the panel for `data-ending-style`, then 80 ms into the exit transition clicks the
 * element labeled `label` (or with that test id), and marks whether the exit was still running.
 */
async function clickDuringExit(page: Page, panel: string, target: string): Promise<void> {
  await page.evaluate(
    ({ panel, target }) => {
      const element = document.querySelector(`[data-probe="${panel}"]`)!;
      const follow = new MutationObserver(() => {
        if (!element.hasAttribute("data-ending-style")) {
          return;
        }

        follow.disconnect();
        setTimeout(() => {
          const running = element
            .getAnimations()
            .some((animation) => animation.playState === "running");

          window.__uiSdkPanels.mark(running ? "interrupted-running" : "interrupted-late");

          const button =
            document.querySelector<HTMLElement>(`[data-probe="${target}"]`) ??
            document.querySelector<HTMLElement>(`[data-testid="${target}"]`)!;

          button.click();
        }, 80);
      });

      follow.observe(element, { attributeFilter: ["data-ending-style"] });
    },
    { panel, target },
  );
}

function mark(entries: PanelEntry[], from: number): PanelEntry | undefined {
  return after(entries, from).find(
    (entry) => entry.kind === "mark" && entry.name?.startsWith("interrupted-"),
  );
}

/**
 * P3: one enter completion; closing runs the exit transition (running in its first frame), then
 * the completion, then the removal, in that order.
 */
export async function exitThenRemove(page: Page, testInfo: TestInfo, c: Lifecycle): Promise<void> {
  await start(page, testInfo, c.path, c.ready);

  const opened = await openSettled(page, c);
  const before = await readLog(page);

  if (c.completion !== undefined) {
    expect(completions(before.entries, c.completion, opened).map((entry) => entry.value)).toEqual([
      true,
    ]);
  }

  const node = currentPanel(before, c.panel)!.node;

  await sampleFrames(page);

  const from = await cut(page);

  await probe(page, c.close).click();
  await expect(probe(page, c.panel)).toHaveCount(0);

  const { entries } = await readLog(page);
  const click = first(entries, "click", c.close, from);
  const frame = after(entries, click?.seq ?? Infinity).find((entry) => entry.kind === "frame");
  const sample = frame?.panels?.find((panel) => panel.node === node);
  const ended = after(ofNode(entries, "transition-finished", node), from)[0];
  const removed = after(ofNode(entries, "remove", node), from)[0];

  expect(sample?.attrs["data-ending-style"], "the first frame is exiting").toBe("");
  expect(sample?.attrs["inert"]).toBe("");
  expect(sample?.transitions, "an opacity transition runs on the panel").toBeGreaterThan(0);
  expect(ended, "the exit transition ends").toBeDefined();
  expect(removed?.seq, "the panel leaves after its exit").toBeGreaterThan(ended!.seq);
  expect(ended!.t - frame!.t, "the exit really animates").toBeGreaterThanOrEqual(transition - 50);

  if (c.completion !== undefined) {
    const done = completions(entries, c.completion, from);

    expect(done.map((entry) => entry.value)).toEqual([false]);
    expect(done[0]!.seq).toBeGreaterThan(ended!.seq);
    expect(removed!.seq).toBeGreaterThan(done[0]!.seq);
  }
}

/**
 * P3: reopening during the exit keeps the same node, with no removal and no `false` completion;
 * the panel transitions back and comes to rest open and usable: its open attributes, no
 * `data-ending-style`, no `inert`, full opacity.
 */
export async function reopenDuringExit(
  page: Page,
  testInfo: TestInfo,
  c: Lifecycle,
): Promise<void> {
  await start(page, testInfo, c.path, c.ready);
  await openSettled(page, c);

  const node = currentPanel(await readLog(page), c.panel)!.node;
  const from = await cut(page);

  await clickDuringExit(page, c.panel, c.open);
  await probe(page, c.close).click();
  await waitLog(page, ({ entries }) => {
    const interrupted = mark(entries, from);

    if (interrupted === undefined) {
      return false;
    }

    if (
      c.completion !== undefined &&
      completions(entries, c.completion, interrupted.seq).length === 0
    ) {
      return false;
    }

    return settled(entries, node, interrupted.seq);
  });

  const log = await readLog(page);
  const interrupted = mark(log.entries, from)!;
  const panel = currentPanel(log, c.panel);
  const expected = await c.stable(page);

  expect(interrupted.name, "the click lands while the exit runs").toBe("interrupted-running");
  expect(panel?.node, "the same node").toBe(node);
  expect(panel!.attrs).toMatchObject(expected.attrs);
  expect(panel!.attrs["data-ending-style"]).toBeUndefined();
  expect(panel!.attrs["inert"], "the reopened panel is usable").toBeUndefined();
  expect(panel!.attrs["hidden"]).toBeUndefined();
  expect(panel!.opacity, "it comes to rest shown").toBe("1");
  expect(panel!.transitions).toBe(0);
  expect(after(ofNode(log.entries, "remove", node), from)).toEqual([]);

  if (c.completion !== undefined) {
    const done = completions(log.entries, c.completion, from);
    const ended = after(ofNode(log.entries, "transition-finished", node), interrupted.seq)[0];

    expect(done.map((entry) => entry.value)).toEqual([true]);
    expect(done[0]!.seq).toBeGreaterThan(ended!.seq);
  }
}

/** P3: destroying the root mid-exit: no completion after it, no listener left on the node. */
export async function destroyDuringExit(
  page: Page,
  testInfo: TestInfo,
  c: Lifecycle & { destroy: string },
): Promise<void> {
  await start(page, testInfo, c.path, c.ready);
  await openSettled(page, c);

  const node = currentPanel(await readLog(page), c.panel)!.node;
  const from = await cut(page);

  await clickDuringExit(page, c.panel, c.destroy);
  await probe(page, c.close).click();
  await expect(probe(page, c.panel)).toHaveCount(0);
  await page.waitForTimeout(300);

  const { entries } = await readLog(page);
  const interrupted = mark(entries, from);

  expect(interrupted?.name).toBe("interrupted-running");

  if (c.completion !== undefined) {
    expect(completions(entries, c.completion, interrupted!.seq)).toEqual([]);
  }

  expect(liveListeners(entries, node)).toBe(0);
}

/** A panel whose mount a fixture invalidates before its bind, then mounts normally (P7). */
export type Invalidation = {
  path: string;
  ready: string[];
  /** Test ids: the flicker, the normal mount and, for a findable panel, its unmount. */
  flicker: string;
  remount: string;
  unmount?: string;
  panel: string;
  /** The element whose `aria-controls` names the panel once it binds. */
  controlledBy: string;
  /** What closes it again: its trigger, or another tab. */
  close: string;
  /** The label its `openChangeComplete` reports under; Tabs have none. */
  completion?: string;
  /** Findable: a `beforematch` on the new node requests this once. */
  find?: { label: string; name: string; value: unknown };
};

/**
 * P7, rule 5: the first node is inserted and invalidated before any bind evidence, removed before
 * the invalidation ends, and never bound; the remount is a new node with one `beforematch`
 * listener, referenced by its trigger, and cleaned up once when it leaves the page.
 */
export async function invalidatedBeforeBind(
  page: Page,
  testInfo: TestInfo,
  c: Invalidation,
): Promise<void> {
  await start(page, testInfo, c.path, c.ready);

  const from = await cut(page);

  await byTestId(page, c.flicker).click();
  await waitLog(
    page,
    ({ entries }) => outputs(entries, from, { name: "invalidate-end" }).length > 0,
  );

  const flickered = await readLog(page);
  const inserted = first(flickered.entries, "insert", c.panel, from);
  const startedAt = outputs(flickered.entries, from, { name: "invalidate-start" })[0]!;
  const endedAt = outputs(flickered.entries, from, { name: "invalidate-end" })[0]!;

  // The ordering this case needs; anything else fails instead of passing vacuously.
  expect(inserted, "ordering not reached: no insertion").toBeDefined();
  expect(startedAt.node, "ordering not reached: invalidated another node").toBe(inserted!.node);
  expect(startedAt.seq, "ordering not reached: invalidated before the insertion").toBeGreaterThan(
    inserted!.seq,
  );

  const firstNode = inserted!.node!;
  const evidenceBefore = [
    ...ofNode(flickered.entries, "bound", firstNode),
    ...ofNode(flickered.entries, "listener-add", firstNode),
  ].filter((entry) => entry.seq < startedAt.seq);

  expect(evidenceBefore, "ordering not reached: bound before the invalidation").toEqual([]);
  expect(after(ofNode(flickered.entries, "remove", firstNode), inserted!.seq)[0]?.seq).toBeLessThan(
    endedAt.seq,
  );

  const remountFrom = await cut(page);

  await byTestId(page, c.remount).click();
  await waitLog(page, ({ entries }) => {
    const remounted = first(entries, "insert", c.panel, remountFrom);

    return remounted !== undefined && ofNode(entries, "listener-add", remounted.node!).length > 0;
  });
  await frameAndTask(page);

  const remounted = await readLog(page);
  const second = first(remounted.entries, "insert", c.panel, remountFrom)!.node!;

  expect(second).not.toBe(firstNode);
  expect(ofNode(remounted.entries, "listener-add", second)).toHaveLength(1);
  await expect(probe(page, c.controlledBy)).toHaveAttribute(
    "aria-controls",
    currentPanel(remounted, c.panel)!.attrs["id"]!,
  );

  let openedFrom = remountFrom;

  if (c.find !== undefined) {
    const findFrom = await cut(page);

    openedFrom = findFrom;
    await probe(page, c.panel).dispatchEvent("beforematch");
    await waitLog(
      page,
      ({ entries }) => outputs(entries, findFrom, { name: c.find!.name }).length > 0,
    );
    await frameAndTask(page);
    expect(
      outputs((await readLog(page)).entries, findFrom, { name: c.find.name, label: c.find.label }),
    ).toMatchObject([{ reason: "find-in-page", value: c.find.value, canceled: false }]);
  }

  // The close starts from a settled open: the open's `true` completion, or for Tabs, which have
  // none, the end of the new node's enter transition, seen from the page.
  await waitLog(page, ({ entries }) => {
    if (c.completion !== undefined) {
      return completions(entries, c.completion, openedFrom).some((entry) => entry.value === true);
    }

    return settled(entries, second, openedFrom);
  });

  // Closing settles; a findable panel stays in the page with its listener until it isn't findable.
  const closeFrom = await cut(page);

  await probe(page, c.close).click();

  if (c.unmount !== undefined) {
    await waitLog(page, ({ entries }) => {
      return after(ofNode(entries, "attr", second), closeFrom).some(
        (entry) => entry.name === "hidden" && entry.value === "until-found",
      );
    });
    await page.waitForTimeout(250);
    expect(ofNode((await readLog(page)).entries, "listener-remove", second)).toEqual([]);
    await byTestId(page, c.unmount).click();
  }

  await expect(probe(page, c.panel)).toHaveCount(0);

  const closed = await readLog(page);

  expect(ofNode(closed.entries, "listener-add", second)).toHaveLength(1);
  expect(ofNode(closed.entries, "listener-remove", second)).toHaveLength(1);
  expect(ofNode(closed.entries, "listener-add", firstNode)).toEqual([]);
  expect(ofNode(closed.entries, "bound", firstNode)).toEqual([]);
}

/** A findable panel, closed on the server (P5). */
export type Findable = {
  path: string;
  ready: string[];
  panel: string;
  /** The element whose state shows it: `aria-expanded` for a trigger, `aria-selected` for a tab. */
  shownBy: { label: string; attribute: string };
  /** The fixture's rendered committed state, closed and after a find. */
  state: { testId: string; closed: string; found: string };
  request: { label: string; name: string; value: unknown };
  veto: string;
  completion?: string;
};

async function findState(page: Page, c: Findable) {
  return page.evaluate(
    ({ panel, shownBy, testId }) => ({
      hidden: document.querySelector(`[data-probe="${panel}"]`)?.getAttribute("hidden") ?? null,
      shown:
        document
          .querySelector(`[data-probe="${shownBy.label}"]`)
          ?.getAttribute(shownBy.attribute) ?? null,
      state: document.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? null,
    }),
    { panel: c.panel, shownBy: c.shownBy, testId: c.state.testId },
  );
}

/** Models the browser revealing a findable panel: the event (when bound), then `hidden` removed. */
async function reveal(page: Page, panel: string, dispatch: boolean) {
  await page.evaluate(
    ({ panel, dispatch }) => {
      const element = document.querySelector(`[data-probe="${panel}"]`)!;

      if (dispatch) {
        element.dispatchEvent(new Event("beforematch"));
      }

      element.removeAttribute("hidden");
    },
    { panel, dispatch },
  );
}

/**
 * A3's pre-bind gap, as it behaves: the server writes `until-found`; a find before hydration
 * reveals the text without opening; the hidden state comes back by bind, with no output, on the
 * same node.
 */
export async function findBeforeBind(page: Page, testInfo: TestInfo, c: Findable): Promise<void> {
  const html = await serverHtml(page, c.path);
  const tag = new RegExp(`<[^>]*data-probe="${c.panel}"[^>]*>`).exec(html)?.[0];

  expect(tag).toMatch(/\bhidden="until-found"/);
  testInfo.annotations.push({
    type: "beforematch",
    description: String(await page.evaluate(() => "onbeforematch" in document.body)),
  });

  let revealedAt = 0;

  await openPanels(page, c.path, async () => {
    await reveal(page, c.panel, true);
    revealedAt = await cut(page);
    expect(await findState(page, c)).toMatchObject({ hidden: null, state: c.state.closed });
  });

  if (modeOf(testInfo) === "incremental") {
    await expect(page.getByTestId("app-ready")).toHaveAttribute("data-ready", "true");
    // Before its block hydrates, nothing restores it.
    expect((await findState(page, c)).hidden).toBeNull();
  }

  await hydrate(page, testInfo);
  await waitBound(page, ...c.ready, c.panel);
  await waitLog(page, ({ entries }) => first(entries, "listener-add", c.panel) !== undefined);
  await frameAndTask(page);

  const log = await readLog(page);
  const restored = after(log.entries, revealedAt).filter(
    (entry) =>
      entry.kind === "attr" &&
      entry.label === c.panel &&
      entry.name === "hidden" &&
      entry.value === "until-found",
  );

  expect(await findState(page, c)).toEqual({
    hidden: "until-found",
    shown: "false",
    state: c.state.closed,
  });
  expect(restored.length, "the hidden state comes back").toBeGreaterThan(0);
  expect(outputs(log.entries)).toEqual([]);
  expect(currentPanel(log, c.panel)?.node).toBe(log.server[c.panel]);
  testInfo.annotations.push({
    type: "restored by",
    description: restored[0]!.stack?.split("\n").slice(1, 4).join(" | ") ?? "",
  });
}

/** P5 after bind: an accepted find opens on the exact node; a canceled one restores the token. */
export async function findAfterBind(
  page: Page,
  testInfo: TestInfo,
  c: Findable,
  canceled: boolean,
): Promise<void> {
  await openPanels(page, c.path);

  const node = (await readLog(page)).server[c.panel]!;

  await hydrate(page, testInfo);
  await waitBound(page, ...c.ready, c.panel);
  await waitLog(page, ({ entries }) => ofNode(entries, "listener-add", node).length > 0);

  if (canceled) {
    await byTestId(page, c.veto).click();
  }

  const from = await cut(page);

  await reveal(page, c.panel, true);

  if (canceled) {
    await expect(probe(page, c.panel)).toHaveAttribute("hidden", "until-found");
  } else {
    await expect(byTestId(page, c.state.testId)).toHaveText(c.state.found);

    if (c.completion !== undefined) {
      await waitLog(page, ({ entries }) => completions(entries, c.completion!, from).length > 0);
    }
  }

  // Only an absence window: a late duplicate request or completion, or a completion after a
  // cancel, would land in it.
  await page.waitForTimeout(250);

  const log = await readLog(page);
  const requests = outputs(log.entries, from, { name: c.request.name, label: c.request.label });

  expect(requests).toMatchObject([{ reason: "find-in-page", value: c.request.value, canceled }]);
  expect(currentPanel(log, c.panel)?.node, "the same node").toBe(node);

  if (canceled) {
    expect(await findState(page, c)).toEqual({
      hidden: "until-found",
      shown: "false",
      state: c.state.closed,
    });

    if (c.completion !== undefined) {
      expect(completions(log.entries, c.completion, from)).toEqual([]);
    }

    return;
  }

  expect(await findState(page, c)).toEqual({ hidden: null, shown: "true", state: c.state.found });

  if (c.completion !== undefined) {
    expect(completions(log.entries, c.completion, from).map((entry) => entry.value)).toEqual([
      true,
    ]);
  }
}
