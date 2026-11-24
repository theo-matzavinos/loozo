// node --test tools/bench/gate-lock.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { namesRelativePath, retryArguments } from "./gate-lock.mjs";

const benchModule = new URL("./bench.mjs", import.meta.url).href;
// machine() resolves Angular and TypeScript from the first measured package.
const routerPackage = fileURLToPath(new URL("../../packages/angular-router/", import.meta.url));
const lockedCommand = "pnpm --dir packages/angular-router run bench --";

// Strips --workload <name> before bench() parses the rest, as the Router runner does. The real
// runner's preprocessing is checked through its own refusal in "Router runner" below.
const takeWorkload = `
function takeWorkload(argv) {
  const rest = [];
  let name = "router";

  for (let index = 0; index < argv.length; index++) {
    if (argv[index] !== "--workload") {
      rest.push(argv[index]);
      continue;
    }

    name = argv[index + 1];
    index++;
  }

  return { workload: workloads[name], argv: rest };
}
`;

// A one-metric runner that opts in to the guard and takes --workload like the Router runner.
const runner = `
import { bench } from ${JSON.stringify(benchModule)};

const workloads = { router: { name: "router" }, remembered: { name: "remembered" }, launch: { name: "launch" } };
${takeWorkload}
const { workload, argv } = takeWorkload(process.argv.slice(2));

await bench(
  {
    lockedCommand: ${JSON.stringify(lockedCommand)},
    name: "example",
    metrics: [
      { key: "example.count", label: "Count", unit: "count", deterministic: true, budget: [1, 1] },
    ],
    scenarios: { default: ["one"], validate() {}, label: (scenario) => scenario, layout: "metric-rows" },
    samples: { count: 1 },
    budgets: "budgets.json",
    options: { workload: workload.name },
    conditions: {},
    packages: [${JSON.stringify(routerPackage)}],
    measure: async (scenario, run) => {
      await run.phase("count", () => run.record("example.count", [1]), { deterministic: true });
    },
  },
  argv,
);
`;

// Runs the runner in its own working directory, with the gate lock's marker or without it.
async function runIn(directory, argv, { held }) {
  const script = join(directory, "runner.mjs");
  const environment = { ...process.env };

  delete environment.LOOZO_GATE_LOCK_HELD;

  if (held) {
    environment.LOOZO_GATE_LOCK_HELD = "1";
  }

  await mkdir(directory, { recursive: true });
  await writeFile(script, runner);

  return spawnSync(process.execPath, [script, ...argv], {
    cwd: directory,
    encoding: "utf8",
    env: environment,
  });
}

// The run's output directory, relative to its working directory, and how it was read.
async function settings(directory, run) {
  assert.equal(run.status, 0, run.stderr);

  const path = run.stderr.match(/\[bench\] results: (.+)\n/)[1];
  const results = JSON.parse(await readFile(path, "utf8"));

  return {
    out: relative(directory, join(path, "..")),
    mode: results.mode,
    options: results.options,
    check: results.check?.file,
  };
}

describe("retryArguments", () => {
  const cases = [
    { args: ["--deterministic"], retry: ["--deterministic"] },
    { args: ["--", "--deterministic"], retry: ["--deterministic"] },
    { args: ["--", "--", "--out", "--"], retry: ["--out", "--"] },
    { args: ["--out", "--", "--deterministic"], retry: ["--out", "--", "--deterministic"] },
    {
      args: ["--check", "--workload", "router", "/b.json", "--out", "--", "--deterministic"],
      retry: ["--check", "--workload", "router", "/b.json", "--out", "--", "--deterministic"],
    },
  ];

  for (const { args, retry } of cases) {
    it(`keeps ${JSON.stringify(args)}`, () => {
      assert.deepEqual(retryArguments(args), retry);
    });
  }
});

// argv is what bench() parses, after the Router takes --workload.
describe("namesRelativePath", () => {
  const cases = [
    { argv: ["--deterministic"], relative: false },
    { argv: ["--out", "--", "--deterministic"], relative: true },
    { argv: ["--check", "/b.json", "--out", "--", "--deterministic"], relative: true },
    { argv: ["--scenarios", "10", "--out", "/abs/out"], relative: false },
    { argv: ["--out", "rel out"], relative: true },
    { argv: ["--check", "--deterministic"], relative: false },
    { argv: ["--check", "--", "--out", "/o"], relative: false },
    { argv: ["--check", "my/budgets.json"], relative: true },
    { argv: ["--scenarios", "--out", "--deterministic"], relative: false },
    { argv: ["--timeout"], relative: false },
  ];

  for (const { argv, relative: expected } of cases) {
    it(`reads ${JSON.stringify(argv)}`, () => {
      assert.equal(namesRelativePath(argv), expected);
    });
  }
});

describe("assertGateLock", () => {
  const refusals = [
    {
      args: ["--", "--workload", "launch", "--out", "rel out", "--deterministic"],
      retry: "--workload launch --out 'rel out' --deterministic",
      absent: "rel out",
    },
    // The note reads --out after the Router takes --workload out of --check's way.
    {
      args: ["--check", "--workload", "router", "/b.json", "--out", "--", "--deterministic"],
      retry: "--check --workload router /b.json --out -- --deterministic",
      absent: "--",
    },
    // Absolute paths only: the retry needs no note.
    {
      args: ["--check", "/b.json", "--out", "/gate-lock-absent/out", "--deterministic"],
      retry: "--check /b.json --out /gate-lock-absent/out --deterministic",
      absent: "out",
      note: false,
    },
  ];

  for (const { args, retry, absent, note = true } of refusals) {
    it(`refuses ${JSON.stringify(args)} before any output, with the retry${note ? " and the note" : ""}`, async () => {
      const directory = await mkdtemp(join(os.tmpdir(), "gate-lock-"));

      try {
        const run = await runIn(directory, args, { held: false });
        const noteLine = note
          ? "(relative paths resolve from packages/angular-router there; pass absolute paths)\n"
          : "";

        assert.equal(run.status, 1);
        assert.equal(
          run.stderr,
          `this run needs the machine-wide gate lock. Run it from the repo root as:
  ${lockedCommand} ${retry}
${noteLine}`,
        );
        assert.equal(existsSync(join(directory, absent)), false);
      } finally {
        await rm(directory, { recursive: true });
      }
    });
  }

  // pnpm forwards the retry's own "--" first, so the runner gets ["--", ...retry].
  it("retries with the run's own output directory, mode, budgets and workload", async () => {
    const directory = await mkdtemp(join(os.tmpdir(), "gate-lock-"));
    const budgets = join(directory, "budgets.json");

    await writeFile(budgets, JSON.stringify({ bench: "example", one: { "example.count": 1 } }));

    try {
      for (const [index, args] of [
        ["--check", "--workload", "router", budgets, "--out", "--", "--deterministic"],
        ["--out", "--", "--deterministic"],
        ["--", "--deterministic", "--workload", "launch", "--out", "rel out"],
        ["--out", "o", "--samples", "count=1", "--scenarios", "one"],
      ].entries()) {
        const original = join(directory, `${index}-original`);
        const retried = join(directory, `${index}-retried`);

        assert.deepEqual(
          await settings(
            retried,
            await runIn(retried, ["--", ...retryArguments(args)], { held: true }),
          ),
          await settings(original, await runIn(original, args, { held: true })),
          JSON.stringify(args),
        );
      }
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});

// The real Router runner: its own --workload preprocessing feeds the same refusal, so the retry
// and the note match what it actually parses.
describe("Router runner", () => {
  const runnerPath = join(routerPackage, "bench/run.mjs");
  const cases = [
    {
      args: ["--check", "--workload", "router", "/b.json", "--out", "--", "--deterministic"],
      retry: "--check --workload router /b.json --out -- --deterministic",
      note: true,
    },
    {
      args: ["--workload", "launch", "--out", "/gate-lock-absent/out", "--deterministic"],
      retry: "--workload launch --out /gate-lock-absent/out --deterministic",
      note: false,
    },
  ];

  for (const { args, retry, note } of cases) {
    it(`refuses ${JSON.stringify(args)} without the lock`, async () => {
      const directory = await mkdtemp(join(os.tmpdir(), "gate-lock-router-"));
      const environment = { ...process.env };

      delete environment.LOOZO_GATE_LOCK_HELD;

      try {
        const run = spawnSync(process.execPath, [runnerPath, ...args], {
          cwd: directory,
          encoding: "utf8",
          env: environment,
        });
        const noteLine = note
          ? "(relative paths resolve from packages/angular-router there; pass absolute paths)\n"
          : "";

        assert.equal(run.status, 1, run.stderr);
        assert.equal(
          run.stderr,
          `this run needs the machine-wide gate lock. Run it from the repo root as:
  pnpm --dir packages/angular-router run bench -- ${retry}
${noteLine}`,
        );
      } finally {
        await rm(directory, { recursive: true });
      }
    });
  }
});
