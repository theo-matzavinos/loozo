import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

// Completeness of ordinary Playwright JSON results, not the shape of the command that produced them.
// `--reset` starts an invocation of the full matrix: it refuses a focused selection and deletes every
// result this check reads, so only the group results written after it can be certified.
const groups = [
  "development-eager",
  "development-incremental",
  "production-eager",
  "production-incremental",
];
const files = [];

for (const group of groups) {
  files.push(`.acceptance-evidence/product/${group}/playwright-results.json`);
}

const summaryFile = ".acceptance-evidence/product/matrix-summary.json";
const reset = process.argv[2] === "--reset";

assert.ok(
  process.argv.length === 2 || (reset && process.argv.length === 3),
  `Unexpected arguments ${process.argv.slice(2).join(" ")}: the matrix certifies only its own unfocused results`,
);

if (reset) {
  for (const name of ["ORIGAMI_SUITE", "ORIGAMI_BROWSER", "ORIGAMI_MATRIX_TARGET"]) {
    assert.equal(
      process.env[name],
      undefined,
      `${name} focuses a run; the full gate runs every engine and group (focus with acceptance:test)`,
    );
  }

  for (const file of [...files, summaryFile]) {
    await rm(file, { force: true });
  }

  process.exit(0);
}

const expectedProjects = [];

for (const browser of ["chromium", "firefox", "webkit"]) {
  for (const group of groups) {
    for (const motion of ["no-preference", "reduce"]) {
      expectedProjects.push(`${browser}-${group}-${motion}`);
    }
  }
}

function* tests(suite, titles) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      const title = [...titles, spec.title].join(" › ");
      const id = `${test.projectName} › ${spec.file}:${spec.line} › ${title}`;

      yield { id, file: spec.file, title, test };
    }
  }

  for (const child of suite.suites ?? []) {
    yield* tests(child, [...titles, child.title]);
  }
}

function* reportTests(report) {
  for (const file of report.suites) {
    yield* tests(file, []);
  }
}

// The only accepted skips: hydration applicability, by test identity and the inapplicable mode.
const applicabilitySkips = [];

for (const action of ["click", "Enter", "Space"]) {
  applicabilitySkips.push({
    title: `H1 H2 H3 I4 R4: ${action} replay, genuine held unit dependency, B then A with C dehydrated`,
    hydration: "eager",
  });
}

applicabilitySkips.push(
  {
    title:
      "H1 H2 H3 I4 R4: Popover Trigger click replay, genuine held unit dependency, dismissible B closes once and reopens with A and C dehydrated",
    hydration: "eager",
  },
  {
    title:
      "H1 H5 R4: eager raw SSR identities, settled markers, no transient child removal or initial replayed entrance",
    hydration: "incremental",
  },
  {
    title:
      "H3: actual early capture readiness and exactly-once initiating eager action while bootstrap is held",
    hydration: "incremental",
  },
);

function applicabilitySkip(file, title, hydration) {
  if (file !== "hydration.spec.ts") {
    return false;
  }

  for (const skip of applicabilitySkips) {
    if (skip.title === title && skip.hydration === hydration) {
      return true;
    }
  }

  return false;
}

// The complete product inventory, discovered from the same configuration with no selection.
const environment = { ...process.env, ORIGAMI_SUITE: "product" };

for (const name of ["ORIGAMI_MATRIX_TARGET", "ORIGAMI_BROWSER", "ORIGAMI_FORENSIC"]) {
  delete environment[name];
}

const listed = spawnSync(
  process.execPath,
  [
    "node_modules/playwright/cli.js",
    "test",
    "--config",
    "tests/acceptance/playwright.config.ts",
    "--list",
    "--reporter=json",
  ],
  { encoding: "utf8", env: environment, maxBuffer: 256 * 1024 * 1024 },
);

assert.equal(listed.status, 0, listed.stderr);

const discovered = new Set();

for (const { id } of reportTests(JSON.parse(listed.stdout))) {
  discovered.add(id);
}

const executed = new Map();
const projects = new Map();
const skipReasons = new Map();
const failures = [];

for (const file of files) {
  assert.ok(existsSync(file), `${file}: missing; this invocation did not complete that group`);

  const report = JSON.parse(await readFile(file, "utf8"));

  assert.deepEqual(report.errors, [], `${file}: top-level errors`);
  assert.equal(report.stats.unexpected, 0, `${file}: unexpected results`);
  assert.equal(report.stats.flaky, 0, `${file}: flaky results`);

  const hydrations = new Map();

  for (const project of report.config.projects) {
    hydrations.set(project.name, project.metadata.hydration);
  }

  for (const { id, file: specFile, title, test } of reportTests(report)) {
    assert.ok(!executed.has(id), `Executed twice across result files: ${id}`);
    executed.set(id, test.status);

    const counts = projects.get(test.projectName) ?? { passed: 0, skipped: 0, total: 0 };
    const [result] = test.results;

    counts.total += 1;
    projects.set(test.projectName, counts);

    // Zero retries: exactly one attempt. A missing attempt is an interrupted or unexecuted row.
    if (test.results.length !== 1) {
      failures.push(`${id}: ${test.results.length} attempts`);

      continue;
    }

    if (test.status === "expected" && result.status === "passed") {
      counts.passed += 1;

      continue;
    }

    // Only an authored conditional skip (`test.skip(condition, reason)`) of a known applicability case.
    const skip = test.annotations.find((annotation) => annotation.type === "skip");
    const applicable = applicabilitySkip(specFile, title, hydrations.get(test.projectName));

    if (test.status === "skipped" && result.status === "skipped" && skip?.location && applicable) {
      const reason = `${path.basename(skip.location.file)}:${skip.location.line} ${skip.description}`;

      counts.skipped += 1;
      skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);

      continue;
    }

    failures.push(`${id}: ${test.status}/${result.status}`);
  }
}

assert.deepEqual([...projects.keys()].sort(), [...expectedProjects].sort(), "Product projects");

for (const id of discovered) {
  if (!executed.has(id)) {
    failures.push(`Discovered but not executed: ${id}`);
  }
}

for (const id of executed.keys()) {
  if (!discovered.has(id)) {
    failures.push(`Executed but not in the current inventory: ${id}`);
  }
}

// Release evidence: the source revision (and whether it was dirty), engine and dependency versions.
const require = createRequire(path.resolve(".scratch/consumer/package.json"));
const versions = {};

for (const name of ["@angular/core", "@loozo/origami-ui", "@floating-ui/dom"]) {
  const manifest = JSON.parse(await readFile(require.resolve(`${name}/package.json`), "utf8"));

  versions[name] = manifest.version;
}

const playwright = JSON.parse(await readFile("node_modules/playwright/package.json", "utf8"));

versions.playwright = playwright.version;
versions.node = process.version;

let browsers = null;

if (existsSync(".acceptance-evidence/browser-readiness.json")) {
  browsers = JSON.parse(await readFile(".acceptance-evidence/browser-readiness.json", "utf8"));
}

const summary = {
  commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  uncommitted: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean),
  versions,
  browsers,
  files: files.map((file) => path.resolve(file)),
  discovered: discovered.size,
  executed: executed.size,
  projects: Object.fromEntries([...projects].sort()),
  skips: Object.fromEntries(skipReasons),
  failures,
};

await mkdir(".acceptance-evidence/product", { recursive: true });
await writeFile(summaryFile, JSON.stringify(summary, null, 2));

for (const [project, counts] of [...projects].sort()) {
  console.log(`${project}: ${counts.passed} passed, ${counts.skipped} skipped of ${counts.total}`);
}

let revision = `commit ${summary.commit}`;

if (summary.uncommitted.length > 0) {
  revision += " with uncommitted changes (not release evidence)";
}

console.log(
  `${executed.size}/${discovered.size} discovered rows executed; ${failures.length} failures; ${revision}.`,
);
assert.deepEqual(
  failures,
  [],
  "Every discovered product row passes or is a known hydration applicability skip",
);
