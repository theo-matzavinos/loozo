import {
  type LaunchOptions,
  type PlaywrightTestConfig,
  type Project,
  defineConfig,
} from "@playwright/test";
// One private WebKit setup for the workspace: Origami's suite owns it (ORIGAMI_WEBKIT_DEPS_ROOT).
import { webkitLaunchOptions } from "../../../origami-ui/tests/acceptance/webkit-launch.js";

type Engine = "chromium" | "firefox" | "webkit";
type Mode = "eager" | "incremental";

const ports: Record<Mode, number> = { eager: 4611, incremental: 4612 };
const engines = selected<Engine>("UI_SDK_BROWSER", ["chromium", "firefox", "webkit"]);
const modes = selected<Mode>("UI_SDK_MODE", ["eager", "incremental"]);

/** The comma-separated subset an environment variable names, or all of them. */
function selected<T extends string>(variable: string, all: T[]): T[] {
  const value = process.env[variable];

  if (value === undefined || value === "") {
    return all;
  }

  const names = value.split(",");

  for (const name of names) {
    if (!all.includes(name as T)) {
      throw new Error(`${variable} must list ${all.join(", ")}; got ${name}`);
    }
  }

  return names as T[];
}

function launchOptions(engine: Engine): LaunchOptions {
  if (engine === "webkit") {
    return webkitLaunchOptions();
  }

  return { headless: true };
}

const projects: Project[] = [];

for (const engine of engines) {
  for (const mode of modes) {
    projects.push({
      name: `${engine}-${mode}`,
      metadata: { mode },
      use: {
        browserName: engine,
        baseURL: `http://127.0.0.1:${ports[mode]}`,
        launchOptions: launchOptions(engine),
      },
    });
  }
}

const webServer: NonNullable<PlaywrightTestConfig["webServer"]> = [];

for (const mode of modes) {
  webServer.push({
    command: `node dist/${mode}/server/server.mjs`,
    cwd: import.meta.dirname,
    env: { PORT: String(ports[mode]) },
    url: `http://127.0.0.1:${ports[mode]}/`,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  });
}

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: "*.spec.ts",
  outputDir: "../../.scratch/browser-results",
  fullyParallel: true,
  workers: 4,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  projects,
  webServer,
});
