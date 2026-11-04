import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TestInfo } from "@playwright/test";

export type Reader = "nvda" | "voiceover";

/** What the page looked like when a watched toast was inserted, sampled by an in-page observer. */
export interface InsertionState {
  /** Whether any dialog was still modal. */
  modal: boolean;
  /** The test ID of the focused element. */
  focus: string | null;
  /** Whether the watched dialog host was still in the document, when the step watched one. */
  hostConnected?: boolean;
}

/** One action and what the reader was asked to say while Guidepup captured it. */
export interface SpeechStep {
  label: string;
  /** Milliseconds since the test began, with its reader already running. */
  startedAt: number;
  endedAt: number;
  /** Guidepup's capture of the step: the phrases it saw, joined with ". ". */
  spoken: string;
  after: { activeElement: string; toasts: string[]; modalOpen: boolean };
  /** The page when the step's watched toast was inserted; null until it was. */
  atInsertion?: InsertionState | null;
}

/** An assertion made after a capture, outside any capture window. */
export interface SpeechCheck {
  label: string;
  /** Milliseconds since the test began, when the assertion settled. */
  at: number;
  passed: boolean;
}

/** Everything one test attempt recorded, written after every step and when the attempt ends. */
export interface SpeechRecord {
  scenario: string;
  attempt: number;
  reader: Reader;
  browser: "chromium" | "firefox" | "webkit";
  /** Null when the attempt never got a running reader and browser to ask. */
  versions: { os: string; browser: string; guidepup: string } | null;
  /** Playwright's test status; absent while the attempt is still running. */
  status: TestInfo["status"];
  error?: string;
  steps: SpeechStep[];
  checks: SpeechCheck[];
  /** The reader's spokenPhraseLog() at the end, one entry per capture; null when unavailable. */
  log: string[] | null;
  /** Why something the record would hold is missing. */
  note?: string;
}

export const speechDirectory = resolve(
  import.meta.dirname,
  "../../.acceptance-evidence/screen-reader/speech",
);

export function recordPath(record: SpeechRecord): string {
  return resolve(
    speechDirectory,
    `${record.reader}-${record.browser}-${record.scenario}-${record.attempt}.json`,
  );
}

/** Replaces the attempt's record file with `record`. */
export function writeRecord(record: SpeechRecord): void {
  mkdirSync(speechDirectory, { recursive: true });
  writeFileSync(recordPath(record), `${JSON.stringify(record, null, 2)}\n`);
}
