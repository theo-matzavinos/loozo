// Reads the structural panels' page log (observer.ts `recordPanels`) from the specs.
import { type Page, type TestInfo, expect } from "@playwright/test";
import { type Messages, modeOf, openObserved } from "./harness";
import { type PanelEntry, type PanelLog, recordPanels } from "./observer";

export type { PanelEntry, PanelLog };

/** Installs the panel log on every navigation of `page`. Call before the first `goto`. */
export async function recordPanelLog(page: Page): Promise<void> {
  await page.addInitScript(recordPanels);
}

/**
 * Loads `path` with main.js held, gives the server nodes their serials and runs `beforeRelease`
 * on the server-rendered page, then lets the app start.
 */
export async function openPanels(
  page: Page,
  path: string,
  beforeRelease?: () => Promise<void>,
): Promise<void> {
  await openObserved(page, path, async () => {
    await page.evaluate(() => window.__uiSdkPanels.remember());
    await beforeRelease?.();
  });
}

/** Waits for the first render; in incremental mode, clicks the block's neutral hydrate control. */
export async function hydrate(page: Page, testInfo: TestInfo): Promise<void> {
  await expect(page.getByTestId("app-ready")).toHaveAttribute("data-ready", "true");

  if (modeOf(testInfo) === "incremental") {
    await page.getByTestId("hydrate").click();
  }
}

export function readLog(page: Page): Promise<PanelLog> {
  return page.evaluate(() => window.__uiSdkPanels.read());
}

/** The log's current sequence number: entries after it are the next action's. */
export function cut(page: Page): Promise<number> {
  return page.evaluate(() => window.__uiSdkPanels.sequence());
}

export async function waitLog(page: Page, condition: (log: PanelLog) => unknown): Promise<void> {
  await expect
    .poll(async () => Boolean(condition(await readLog(page))), { timeout: 5_000 })
    .toBe(true);
}

/** Starts the frame sampler: the next frame and every one after it are sampled. */
export async function sampleFrames(page: Page): Promise<void> {
  await page.evaluate(() => window.__uiSdkPanels.sampleFrames());
}

/** Waits one animation frame and one task. */
export async function frameAndTask(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))),
  );
}

export function after(entries: PanelEntry[], from: number): PanelEntry[] {
  const later = [];

  for (const entry of entries) {
    if (entry.seq > from) {
      later.push(entry);
    }
  }

  return later;
}

/** The first entry of `kind` about the element labeled `label`, after `from`. */
export function first(
  entries: PanelEntry[],
  kind: PanelEntry["kind"],
  label: string,
  from = 0,
): PanelEntry | undefined {
  for (const entry of entries) {
    if (entry.seq > from && entry.kind === kind && entry.label === label) {
      return entry;
    }
  }

  return undefined;
}

/** Every entry of `kind` about node `node`. */
export function ofNode(
  entries: PanelEntry[],
  kind: PanelEntry["kind"],
  node: number,
): PanelEntry[] {
  const found = [];

  for (const entry of entries) {
    if (entry.kind === kind && entry.node === node) {
      found.push(entry);
    }
  }

  return found;
}

/** Core's bind marker for the element labeled `label`: its `followId` observe. */
export function bound(entries: PanelEntry[], label: string, from = 0): PanelEntry | undefined {
  return first(entries, "bound", label, from);
}

/** Waits until every labeled element has bound. */
export async function waitBound(page: Page, ...labels: string[]): Promise<void> {
  await waitLog(page, ({ entries }) => {
    for (const label of labels) {
      if (bound(entries, label) === undefined) {
        return false;
      }
    }

    return true;
  });
}

/** The fixture's outputs after `from`, optionally only `name` from `label`. */
export function outputs(
  entries: PanelEntry[],
  from = 0,
  { label, name }: { label?: string; name?: string } = {},
): PanelEntry[] {
  const found = [];

  for (const entry of entries) {
    if (entry.seq <= from || entry.kind !== "output") {
      continue;
    }

    if (label !== undefined && entry.label !== label) {
      continue;
    }

    if (name !== undefined && entry.name !== name) {
      continue;
    }

    found.push(entry);
  }

  return found;
}

/** `openChangeComplete` values from `label` after `from`. */
export function completions(entries: PanelEntry[], label: string, from = 0): PanelEntry[] {
  return outputs(entries, from, { label, name: "openChangeComplete" });
}

/**
 * Whether `node` ran an opacity transition after `from`, every one it ran since has ended, and
 * the last one finished: the panel came to rest. Read from the page's `transitionrun` record, not
 * from core.
 */
export function settled(entries: PanelEntry[], node: number, from: number): boolean {
  const runs = after(ofNode(entries, "transition-run", node), from);
  const ends = new Map<unknown, PanelEntry>();

  for (const end of ofNode(entries, "transition-end", node)) {
    ends.set(end.value, end);
  }

  if (runs.length === 0) {
    return false;
  }

  for (const run of runs) {
    if (!ends.has(run.value)) {
      return false;
    }
  }

  return ends.get(runs.at(-1)!.value)!.canceled === false;
}

/** Active `beforematch` listeners on `node`: adds minus removes. */
export function liveListeners(entries: PanelEntry[], node: number): number {
  return (
    ofNode(entries, "listener-add", node).length - ofNode(entries, "listener-remove", node).length
  );
}

/** The panel labeled `label` in the page now, if any. */
export function currentPanel(log: PanelLog, label: string) {
  for (const panel of log.current) {
    if (panel.label === label) {
      return panel;
    }
  }

  return undefined;
}

/**
 * The console line Angular's default ErrorHandler logs for one error, nothing else. The error
 * itself is checked through `window.__uiSdkErrors`: Firefox's console text for it is only
 * `ERROR Error`, while Chromium and WebKit include the message, checked here when present.
 */
export function expectOnlyError(messages: Messages, message: string): void {
  const noisy = [];

  for (const entry of messages.console) {
    if (entry.type === "warning" || entry.type === "error" || /NG0(5\d{2}|201)/.test(entry.text)) {
      noisy.push(entry);
    }
  }

  expect(noisy).toEqual([{ type: "error", text: expect.stringMatching(/^ERROR /) }]);

  if (!/^ERROR Error$/.test(noisy[0]!.text)) {
    expect(noisy[0]!.text).toContain(`UiSdkError: ${message}`);
  }

  expect(messages.pageErrors).toEqual([]);
}

/** The raw server HTML for `path`. */
export async function serverHtml(page: Page, path: string): Promise<string> {
  const response = await page.request.get(path);

  expect(response.ok()).toBe(true);

  return response.text();
}
