import { defineConfig } from "playwright/test";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import type { LaunchOptions, Project, PlaywrightTestConfig } from "playwright/test";
import { webkitLaunchOptions } from "./webkit-launch.js";

type Server = Exclude<NonNullable<PlaywrightTestConfig["webServer"]>, unknown[]>;
type BrowserName = "chromium" | "firefox" | "webkit";

const suite = process.env.ORIGAMI_SUITE ?? "product";
const target = process.env.ORIGAMI_MATRIX_TARGET;
const selectedBrowser = process.env.ORIGAMI_BROWSER;
const tier = process.env.ORIGAMI_TIER ?? "release";
const browserNames: BrowserName[] = ["chromium", "firefox", "webkit"];

assert.ok(
  suite === "product" || suite === "calibration",
  "ORIGAMI_SUITE must be product or calibration",
);
assert.ok(
  selectedBrowser === undefined || browserNames.some((name) => name === selectedBrowser),
  "ORIGAMI_BROWSER must name chromium, firefox or webkit",
);
assert.ok(tier === "commit" || tier === "release", "ORIGAMI_TIER must be commit or release");

// The commit tier runs each axis only where it reaches the library. A project's `grep` also sees
// the file name. Reduced motion changes only Presence and its composers; production and incremental
// hydration change only creation through hydration and Angular's production errors; the Calendar's
// seed cases (CA10–CA12), its split Heading boundary (CA21), its hydrated several days and range
// (CA23) and its hydrated years view and month Calendar (CA44) check what hydration keeps, so they
// run there too.
const presenceSpecs = /\b(?:core|composition|popover|tooltip|lifetimes|hydration)\.spec\.ts\b/;
const hydrationAndErrorCases =
  /\b(?:hydration|errors)\.spec\.ts\b|\bH\d+\b|\bCA(?:1[0-2]|2[13]|44)\b/;

let browsers = browserNames;

if (selectedBrowser) {
  browsers = browserNames.filter((name) => name === selectedBrowser);
}

/** Only an actually selected WebKit project evaluates the optional private dependency setup. */
function launchOptions(browserName: BrowserName): LaunchOptions {
  if (browserName === "webkit") {
    return webkitLaunchOptions();
  }

  return { headless: true };
}

// Explicit opt-in: serve the production outputs `acceptance:aot` just built instead of rebuilding.
let productionBuild = "";

if (process.env.ORIGAMI_PREBUILT !== "1") {
  productionBuild =
    "node ../../node_modules/@angular/cli/bin/ng.js build consumer --configuration ";
}

function productionCommand(configuration: string, output: string, port: number): string {
  const serve = `PORT=${port} node dist/${output}/server/server.mjs`;

  if (!productionBuild) {
    return serve;
  }

  return `${productionBuild}${configuration} && ${serve}`;
}

// The servers render in UTC+14 while Calendar cases browse at UTC−11 or another zone, so a
// "today" computed twice, once by the server and once by the browser, can't go unnoticed (CA10).
const serverEnvironment = { TZ: "Pacific/Kiritimati" };

const servers: Record<string, Server> = {
  "development-eager": {
    cwd: resolve(".scratch/consumer"),
    command:
      "node ../../node_modules/@angular/cli/bin/ng.js serve consumer --configuration development-eager --host 127.0.0.1 --port 4320 --no-hmr",
    url: "http://127.0.0.1:4320/core",
    reuseExistingServer: false,
    timeout: 180_000,
    env: serverEnvironment,
  },
  "development-incremental": {
    cwd: resolve(".scratch/consumer"),
    command:
      "node ../../node_modules/@angular/cli/bin/ng.js serve consumer --configuration development-incremental --host 127.0.0.1 --port 4321 --no-hmr",
    url: "http://127.0.0.1:4321/core",
    reuseExistingServer: false,
    timeout: 180_000,
    env: serverEnvironment,
  },
  "production-eager": {
    cwd: resolve(".scratch/consumer"),
    command: productionCommand("production-eager", "consumer-eager", 4322),
    url: "http://127.0.0.1:4322/core",
    reuseExistingServer: false,
    timeout: 180_000,
    env: serverEnvironment,
  },
  "production-incremental": {
    cwd: resolve(".scratch/consumer"),
    command: productionCommand("production-incremental", "consumer-incremental", 4323),
    url: "http://127.0.0.1:4323/core",
    reuseExistingServer: false,
    timeout: 180_000,
    env: serverEnvironment,
  },
};

assert.ok(
  target === undefined || Object.hasOwn(servers, target),
  "ORIGAMI_MATRIX_TARGET must name one of the four runtime-hydration groups",
);

// One fixed results directory per selection; a rerun of the same selection replaces it.
let scope = "all";

if (suite === "product" && target) {
  scope = target;
}

if (selectedBrowser) {
  scope = `${scope}-${selectedBrowser}`;
}

const evidenceDirectory = resolve(".acceptance-evidence", suite, scope);

// Read by the optional forensic hooks in the main process.
process.env.ORIGAMI_EVIDENCE_DIR = evidenceDirectory;

let forensicSetup: string[] = [];
let forensicTeardown: string[] = [];

if (process.env.ORIGAMI_FORENSIC === "1") {
  forensicSetup = ["./source-identity.mjs"];
  forensicTeardown = ["./source-freshness.mjs"];
}

const reporter: PlaywrightTestConfig["reporter"] = [
  ["list"],
  ["json", { outputFile: resolve(evidenceDirectory, "playwright-results.json") }],
];

function calibration(): PlaywrightTestConfig {
  const projects: Project[] = [];

  for (const browserName of browsers) {
    projects.push({
      name: `${browserName}-native-observer`,
      use: { browserName, launchOptions: launchOptions(browserName) },
    });
  }

  /** Native runner calibration only: no product imports, SSR servers or qualification claims. */
  return {
    testDir: ".",
    testMatch: "observer-calibration.test.ts",
    outputDir: resolve(evidenceDirectory, "browser-results"),
    reporter,
    globalSetup: forensicSetup,
    globalTeardown: forensicTeardown,
    timeout: 20_000,
    retries: 0,
    workers: 1,
    projects,
  };
}

function product(): PlaywrightTestConfig {
  const projects: Project[] = [];

  for (const browserName of browsers) {
    for (const runtime of ["development", "production"] as const) {
      for (const hydration of ["eager", "incremental"] as const) {
        const group = `${runtime}-${hydration}`;

        if (target && target !== group) {
          continue;
        }

        const server = servers[group]!;

        for (const motion of ["no-preference", "reduce"] as const) {
          const project: Project = {
            name: `${browserName}-${runtime}-${hydration}-${motion}`,
            metadata: { runtime, hydration, motion },
            use: {
              browserName,
              baseURL: new URL(server.url!).origin,
              reducedMotion: motion,
              launchOptions: launchOptions(browserName),
            },
          };

          if (tier === "commit" && group !== "development-eager") {
            if (motion === "reduce") {
              continue;
            }

            project.grep = hydrationAndErrorCases;
          } else if (tier === "commit" && motion === "reduce") {
            project.grep = presenceSpecs;
          }

          projects.push(project);
        }
      }
    }
  }

  let webServer = Object.values(servers);

  if (target) {
    // Official Angular build setting limits processing workers; no resource cap is relaxed.
    webServer = [{ ...servers[target]!, env: { ...serverEnvironment, NG_BUILD_MAX_WORKERS: "2" } }];
  }

  /** Ordinary matching server(s) only; no alternate rendering/runtime or mode annotations. */
  return {
    testDir: ".",
    testMatch: "*.spec.ts",
    outputDir: resolve(evidenceDirectory, "browser-results"),
    reporter,
    metadata: { suite, tier, matrixTarget: target ?? "all", browser: selectedBrowser ?? "all" },
    // After the servers start: any forensic fingerprint, then one sequential request per fixture route.
    globalSetup: [...forensicSetup, "./warm-servers.mjs"],
    globalTeardown: forensicTeardown,
    timeout: 45_000,
    expect: { timeout: 12_000 },
    retries: 0,
    // Test files run in parallel, each file's tests in order; `--workers=1` serializes a diagnostic run.
    workers: "50%",
    use: {
      viewport: { width: 1200, height: 1000 },
      trace: "retain-on-failure",
      screenshot: "only-on-failure",
    },
    projects,
    webServer,
  };
}

let config = product();

if (suite === "calibration") {
  config = calibration();
}

export default defineConfig(config);
