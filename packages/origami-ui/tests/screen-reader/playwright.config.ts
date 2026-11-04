import assert from "node:assert/strict";
import { resolve } from "node:path";
import { withGuidepup } from "@guidepup/playwright";
import { defineConfig } from "@playwright/test";
import type { Project } from "@playwright/test";

// Runs only in the Screen reader workflow, on a disposable runner with the reader set up by
// `guidepup setup` and the production-eager consumer its build job produced. Local runs are
// unsupported, so it doesn't take the gate lock.
const reader = process.env.ORIGAMI_SR;

assert.ok(reader === "nvda" || reader === "voiceover", "ORIGAMI_SR must be nvda or voiceover");

// NVDA runs on Windows with Chromium and Firefox, VoiceOver on macOS with WebKit.
const browsers = { nvda: ["chromium", "firefox"], voiceover: ["webkit"] } as const;
const projects: Project[] = [];

for (const browserName of browsers[reader]) {
  projects.push({ name: `${reader}-${browserName}`, use: { browserName } });
}

const port = 4330;

export default defineConfig(
  withGuidepup({
    testDir: ".",
    testMatch: "*.spec.ts",
    outputDir: resolve(import.meta.dirname, "../../.acceptance-evidence/screen-reader/results"),
    reporter: [["list"], ["./missing-records.ts"]],
    timeout: 300_000,
    expect: { timeout: 10_000 },
    retries: 0,
    // Speech capture is a heuristic: three attempts show whether an outcome repeats.
    repeatEach: 3,
    use: {
      baseURL: `http://127.0.0.1:${port}`,
      trace: "retain-on-failure",
      screenshot: "only-on-failure",
    },
    projects,
    webServer: {
      command: "node server/server.mjs",
      cwd: resolve(import.meta.dirname, "../../.scratch/consumer/dist/consumer-eager"),
      env: { PORT: String(port) },
      url: `http://127.0.0.1:${port}/toast`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  }),
);
