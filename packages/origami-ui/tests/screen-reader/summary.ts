import { existsSync } from "node:fs";
import { appendFile, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SpeechRecord } from "./speech-record.js";

// Appends a table of each speech record's measured step, its scenario's last, to the job summary
// (standard output outside GitHub Actions). The JSON records in the artifact hold every step. Runs
// with plain Node, which can't import speech-record.ts's directory by its `.js` specifier.
const speechDirectory = resolve(
  import.meta.dirname,
  "../../.acceptance-evidence/screen-reader/speech",
);

function cell(text: string): string {
  return text.replace(/\s+/g, " ").replaceAll("|", "\\|").trim();
}

function row(record: SpeechRecord): string {
  const step = record.steps.at(-1);
  let measured = ["(no step)", "", "", ""];

  if (step !== undefined) {
    measured = [
      step.label,
      step.spoken || "(nothing captured)",
      step.after.activeElement,
      step.after.toasts.join(", "),
    ];
  }

  // Playwright types the status as optional; it's absent while an attempt is still running.
  let status = record.status ?? "unfinished";

  if (record.error !== undefined) {
    status = `${status}: ${record.error.split("\n")[0]}`;
  }

  const cells: string[] = [];

  for (const value of [record.scenario, String(record.attempt), status, ...measured]) {
    cells.push(cell(value));
  }

  return `| ${cells.join(" | ")} |`;
}

const lines: string[] = [];

if (!existsSync(speechDirectory)) {
  lines.push("No speech records: no test got as far as writing one.");
} else {
  const names = (await readdir(speechDirectory)).sort();
  const groups = new Map<string, SpeechRecord[]>();

  for (const name of names) {
    const record: SpeechRecord = JSON.parse(await readFile(resolve(speechDirectory, name), "utf8"));
    const heading = `${record.reader} · ${record.browser}`;
    const group = groups.get(heading) ?? [];

    group.push(record);
    groups.set(heading, group);
  }

  for (const [heading, records] of groups) {
    // An attempt whose reader never started has no versions; any other in the group has them.
    let versions = "Versions unknown: no attempt started its reader.";

    for (const record of records) {
      if (record.versions !== null) {
        versions = `${record.versions.os}, ${record.browser} ${record.versions.browser}, Guidepup ${record.versions.guidepup}`;
        break;
      }
    }

    lines.push(
      "",
      `### ${heading}`,
      "",
      versions,
      "",
      "| Scenario | Attempt | Status | Measured step | Spoken | Focus after | Toasts after |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    );

    for (const record of records) {
      lines.push(row(record));
    }
  }
}

const summary = `${lines.join("\n")}\n`;
const summaryFile = process.env.GITHUB_STEP_SUMMARY;

if (summaryFile === undefined) {
  process.stdout.write(summary);
} else {
  await appendFile(summaryFile, summary);
}
