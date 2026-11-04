import { existsSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { recordPath, writeRecord } from "./speech-record.js";
import type { SpeechRecord } from "./speech-record.js";

/**
 * Writes a record for every attempt whose test wrote none: its `run` fixture never started,
 * because the reader or the browser failed to, so the summary and artifact still show it.
 */
export default class MissingRecords implements Reporter {
  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project();
    const reader = process.env.ORIGAMI_SR;
    const browser = project?.use.browserName;

    // The config asserts ORIGAMI_SR and gives every project its browser.
    if (reader !== "nvda" && reader !== "voiceover") {
      throw new Error("ORIGAMI_SR must be nvda or voiceover");
    }

    if (browser === undefined) {
      throw new Error(`Project ${project?.name} has no browserName`);
    }

    const record: SpeechRecord = {
      scenario: test.title,
      attempt: test.repeatEachIndex + 1,
      reader,
      browser,
      versions: null,
      status: result.status,
      steps: [],
      checks: [],
      log: null,
      note: "The test wrote no record: its reader or browser didn't start.",
    };

    if (result.error?.message !== undefined) {
      record.error = stripVTControlCharacters(result.error.message);
    }

    if (!existsSync(recordPath(record))) {
      writeRecord(record);
    }
  }
}
