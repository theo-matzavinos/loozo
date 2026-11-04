import { createRequire } from "node:module";
import { release, version } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";
import assert from "node:assert/strict";
import { nvdaTest, voiceOverTest } from "@guidepup/playwright";
import { expect } from "@playwright/test";
import type { ScreenReader } from "@guidepup/guidepup";
import type {
  Browser,
  Page,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  TestInfo,
  TestType,
} from "@playwright/test";
import { writeRecord } from "./speech-record.js";
import type { InsertionState, Reader, SpeechRecord, SpeechStep } from "./speech-record.js";

export { expect };

declare global {
  interface Window {
    speechInsertion?: InsertionState | null;
  }
}

/**
 * What a step samples the page at: a toast's insertion into Origami's region, with the dialog host
 * to check for, or the first text written into the plain live region with test ID `liveRegion`.
 */
export type InsertionWatch = { toast: string; host?: string } | { liveRegion: string };

export interface Run {
  /** Opens a fixture route, attaches it and moves the reader into the page, once per test. */
  open(path: string): Promise<void>;
  /**
   * Performs `action` inside one full capture and records the step. With `insertion`, an observer
   * installed before the capture samples the page when that toast or text is inserted, and the step
   * waits for that sample after the capture ends, since the toast itself may have expired by then.
   */
  step(
    label: string,
    action: () => Promise<void>,
    options?: { insertion?: InsertionWatch },
  ): Promise<SpeechStep>;
  /** Runs `assertion` outside any capture and records whether it passed. */
  check(label: string, assertion: () => Promise<void>): Promise<void>;
}

type SpeechReader = Pick<ScreenReader, "capture" | "spokenPhraseLog"> & {
  navigateToWebContent(): Promise<void>;
};

interface RunContext {
  speechReader: SpeechReader;
  page: Page;
  browser: Browser;
  browserName: SpeechRecord["browser"];
  readerSettings?: Record<string, unknown>;
}

const selectedReader = process.env.ORIGAMI_SR;

assert.ok(
  selectedReader === "nvda" || selectedReader === "voiceover",
  "ORIGAMI_SR must be nvda or voiceover",
);

const reader: Reader = selectedReader;
const guidepupManifest: { version: string } = createRequire(import.meta.url)(
  "@guidepup/guidepup/package.json",
);
// Waits for a capture in flight, which may never settle; the record is written before and after.
const logTimeout = 10_000;
// VoiceOver's spoken instructions (VoiceOver Utility › Verbosity › Hints), off so "You are currently
// on…" hints don't crowd the captures. The key's mapping to that checkbox is unverified; each
// record holds the value VoiceOver ended up with.
const voiceOverHints = "SCRShouldOutputVOInstructions";

/** What the page looks like once a step's capture ended. */
function readAfter(): SpeechStep["after"] {
  const active = document.activeElement;
  let activeElement = "none";

  if (active === document.body) {
    activeElement = "body";
  } else if (active !== null) {
    const testId = active.getAttribute("data-testid");
    const name = (active.getAttribute("aria-label") ?? active.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim();

    activeElement = `${active.localName} "${name}"`;

    if (testId !== null) {
      activeElement = `${active.localName}[data-testid=${testId}] "${name}"`;
    }
  }

  const toasts: string[] = [];

  for (const toast of document.querySelectorAll(
    '[data-testid="region"] li[data-testid^="toast-"]',
  )) {
    let description = toast.getAttribute("data-testid") ?? "";

    if (toast.hasAttribute("data-leaving")) {
      description = `${description} (leaving)`;
    }

    toasts.push(description);
  }

  return { activeElement, toasts, modalOpen: document.querySelector("dialog:modal") !== null };
}

/** Samples the page, in the page, when the watched toast or text is first inserted. */
function watchInsertion(watch: InsertionWatch): void {
  let regionId = "region";
  let hostElement: Element | null = null;

  if ("liveRegion" in watch) {
    regionId = watch.liveRegion;
  }

  const region = document.querySelector(`[data-testid="${regionId}"]`);

  if (region === null) {
    throw new Error(`The page has no ${regionId}`);
  }

  if ("host" in watch && watch.host !== undefined) {
    hostElement = document.querySelector(`[data-testid="${watch.host}"]`);

    if (hostElement === null) {
      throw new Error(`The page has no ${watch.host}`);
    }
  }

  const inserted = (): boolean => {
    if ("liveRegion" in watch) {
      return (region.textContent ?? "").trim() !== "";
    }

    return region.querySelector(`li[data-testid="${watch.toast}"]`) !== null;
  };

  window.speechInsertion = null;

  const observer = new MutationObserver(() => {
    if (!inserted()) {
      return;
    }

    observer.disconnect();

    const state: InsertionState = {
      modal: document.querySelector("dialog:modal") !== null,
      focus: document.activeElement?.getAttribute("data-testid") ?? null,
    };

    if (hostElement !== null) {
      state.hostConnected = hostElement.isConnected;
    }

    window.speechInsertion = state;
  });

  observer.observe(region, { childList: true, subtree: true, characterData: true });
}

async function useRun(
  { speechReader, page, browser, browserName, readerSettings }: RunContext,
  use: (run: Run) => Promise<void>,
  testInfo: TestInfo,
): Promise<void> {
  const testStart = performance.now();
  const elapsed = (): number => Math.round(performance.now() - testStart);
  const record: SpeechRecord = {
    scenario: testInfo.title,
    attempt: testInfo.repeatEachIndex + 1,
    reader,
    browser: browserName,
    versions: {
      os: `${version()} ${release()}`,
      browser: browser.version(),
      guidepup: guidepupManifest.version,
    },
    status: undefined,
    steps: [],
    checks: [],
    log: null,
  };

  if (readerSettings !== undefined) {
    record.readerSettings = readerSettings;
  }

  const run: Run = {
    async open(path) {
      await page.goto(path);
      await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
      await page.getByTestId("attach-fixture").click();
      await expect(page.getByTestId("fixture-attached")).toHaveText("true");
      await speechReader.navigateToWebContent();
    },
    async step(label, action, { insertion } = {}) {
      if (insertion !== undefined) {
        await page.evaluate(watchInsertion, insertion);
      }

      const startedAt = elapsed();
      const captured = await speechReader.capture(action, { capture: true });
      const endedAt = elapsed();
      const step: SpeechStep = {
        label,
        startedAt,
        endedAt,
        spoken: captured.spokenPhrase,
        after: await page.evaluate(readAfter),
      };

      record.steps.push(step);
      writeRecord(record);

      if (insertion !== undefined) {
        // Outside the capture: waits for the observer's sample, not the toast, which can expire
        // before a full capture ends (E1 lives 1 s; VoiceOver's settling alone takes longer).
        step.atInsertion = null;
        await expect.poll(() => page.evaluate(() => window.speechInsertion ?? null)).not.toBeNull();
        step.atInsertion = await page.evaluate(() => window.speechInsertion ?? null);
        writeRecord(record);
      }

      return step;
    },
    async check(label, assertion) {
      let passed = false;

      try {
        await assertion();
        passed = true;
      } finally {
        record.checks.push({ label, at: elapsed(), passed });
        writeRecord(record);
      }
    },
  };

  try {
    await use(run);
  } finally {
    record.status = testInfo.status;

    if (testInfo.error?.message !== undefined) {
      record.error = stripVTControlCharacters(testInfo.error.message);
    }

    // Written before asking for the log, which waits for any capture still in flight.
    writeRecord(record);

    try {
      const log = await Promise.race([
        speechReader.spokenPhraseLog(),
        delay(logTimeout, null, { ref: false }),
      ]);

      if (log === null) {
        record.note = `spokenPhraseLog() didn't settle within ${logTimeout} ms`;
      } else {
        record.log = [...log];
      }
    } catch (error) {
      record.note = `spokenPhraseLog() failed: ${String(error)}`;
    }

    writeRecord(record);
  }
}

type ReaderTest = TestType<
  PlaywrightTestArgs & PlaywrightTestOptions & { run: Run },
  PlaywrightWorkerArgs & PlaywrightWorkerOptions
>;

const nvdaRunTest: ReaderTest = nvdaTest.extend<{ run: Run }>({
  run: async ({ nvda, page, browser, browserName }, use, testInfo) => {
    await useRun({ speechReader: nvda, page, browser, browserName }, use, testInfo);
  },
});

const voiceOverRunTest: ReaderTest = voiceOverTest.extend<{ run: Run }>({
  // Applied by start() to Guidepup's mounted preferences before VoiceOver launches.
  voiceOverStartOptions: { capture: "initial", settings: { [voiceOverHints]: false } },
  run: async ({ voiceOver, page, browser, browserName }, use, testInfo) => {
    const settings = voiceOver.getSettings();
    const readerSettings = { [voiceOverHints]: settings[voiceOverHints] };

    await useRun(
      { speechReader: voiceOver, page, browser, browserName, readerSettings },
      use,
      testInfo,
    );
  },
});

function readerTest(): ReaderTest {
  if (reader === "voiceover") {
    return voiceOverRunTest;
  }

  return nvdaRunTest;
}

/**
 * Playwright's test with a running reader, picked by ORIGAMI_SR, and `run`. Drive the page with
 * Playwright's keyboard on the real controls; never send reader navigation between steps. A test
 * that never got its reader is recorded by the missing-records reporter.
 */
export const test = readerTest();
