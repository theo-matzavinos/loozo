// The output lock (SPEC "Generation and builders"): one generation run per output directory, held
// from before discovery until after publication, with dead holders reclaimed one at a time.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { mock, test } from "node:test";

const real = await import("node:fs/promises");
// Fault injection: a test sets one of these to stand in for the real call.
const faults = { unlink: undefined, open: undefined, readFile: undefined, lstat: undefined };

mock.module("node:fs/promises", {
  exports: {
    ...real,
    default: real.default,
    unlink: (...args) => (faults.unlink ?? real.unlink)(...args),
    open: (...args) => (faults.open ?? real.open)(...args),
    readFile: (...args) => (faults.readFile ?? real.readFile)(...args),
    lstat: (...args) => (faults.lstat ?? real.lstat)(...args),
  },
});

const { mkdir, readFile, readdir, realpath, rm, stat, symlink, writeFile } = real;
const { GenerationLockedError, lockHooks, lockOutput, outputLockPath } =
  await import("../dist/generation/output-lock.js");
const { runGeneration } = await import("../dist/generation/run.js");

const scratch = resolve(import.meta.dirname, "../../../examples/angular-launch/.scratch");
const holderScript = resolve(import.meta.dirname, "fixtures/generation-lock-holder.mjs");
const options = {
  tsconfig: "tsconfig.json",
  scanDirectories: ["src/routes"],
  outDirectory: "generated",
};
const label = "lock test";
const insensitive = process.platform === "win32" || process.platform === "darwin";
let sequence = 0;

async function put(root, name, text) {
  const path = resolve(root, name);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

async function fixture() {
  const root = resolve(scratch, `lock-${process.pid}-${++sequence}`);

  await rm(root, { recursive: true, force: true });
  await Promise.all([
    put(
      root,
      "package.json",
      JSON.stringify({ name: "lock-consumer", private: true, type: "module" }),
    ),
    put(
      root,
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ES2022",
          strict: true,
          skipLibCheck: true,
          experimentalDecorators: true,
          types: ["node"],
        },
        include: ["src/**/*.ts", "generated/**/*.ts"],
      }),
    ),
    put(
      root,
      "src/routes/route.ts",
      "import {defineRoute} from '@loozo/angular-launch';export default defineRoute('',{});",
    ),
    put(
      root,
      "src/routes/left/route.ts",
      "import {defineRoute} from '@loozo/angular-launch';import parent from '../route';export default defineRoute('left',{parent}).remote(({query}) => ({todos: {read: query({handler: () => 1})}}));",
    ),
    put(
      root,
      "src/routes/left/page.ts",
      "import {Component} from '@angular/core';@Component({selector:'lock-page',template:'ok'}) export default class Page {}",
    ),
  ]);

  return await realpath(root);
}

function outputOf(root) {
  return resolve(root, options.outDirectory);
}

function generate(root, overrides = {}, stopped = () => false) {
  return runGeneration(root, { ...options, ...overrides }, stopped, label);
}

// Every generated file under root, with its bytes and mtime.
async function snapshot(root) {
  const files = {};

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.name.includes(".generated.")) {
        const [bytes, info] = await Promise.all([
          readFile(path, "utf8"),
          stat(path, { bigint: true }),
        ]);

        files[relative(root, path).split(sep).join("/")] = { bytes, mtime: String(info.mtimeNs) };
      }
    }
  }

  await visit(root);

  return files;
}

// A child process holding root's lock, blocked after validation until released or killed.
async function holder(root, t) {
  const ready = resolve(root, `ready-${randomUUID()}`);
  const release = `${ready}.release`;
  const child = spawn(process.execPath, [holderScript, root, ready, release], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  const closed = new Promise((done) => {
    child.on("close", (code, signal) => done({ code, signal }));
  });
  const spawned = new Promise((done, fail) => {
    child.on("spawn", done);
    child.on("error", fail);
  });

  child.stderr.on("data", (chunk) => (stderr += chunk));
  t.after(async () => {
    child.kill("SIGKILL");
    await closed;
  });
  await spawned;

  const deadline = Date.now() + 60_000;
  let exited = false;

  void closed.then(() => (exited = true));

  while (!existsSync(ready)) {
    assert.equal(exited, false, `The holder exited before holding: ${stderr}`);
    assert.ok(Date.now() < deadline, "The holder never became ready");
    await new Promise((done) => setTimeout(done, 20));
  }

  return {
    pid: child.pid,
    closed,
    async release() {
      await writeFile(release, "");

      return await within(closed, "the released holder to exit");
    },
    async kill() {
      child.kill("SIGKILL");

      return await within(closed, "the killed holder to exit");
    },
  };
}

// Fails the test instead of hanging when a promise doesn't settle in time.
async function within(promise, description, ms = 60_000) {
  let timer;
  const timeout = new Promise((_, fail) => {
    timer = setTimeout(() => fail(new Error(`Timed out waiting for ${description}`)), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// A pid no process has: a child that already exited.
function deadPid() {
  const { pid, status } = spawnSync(process.execPath, ["-e", ""]);

  assert.equal(status, 0);

  return pid;
}

async function seed(path, record) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, typeof record === "string" ? record : JSON.stringify(record));
}

function record(pid, overrides = {}) {
  return {
    pid,
    hostname: hostname(),
    startedAt: "2026-11-28T00:00:00.000Z",
    label: "seeded",
    token: randomUUID(),
    ...overrides,
  };
}

function gateOf(lock) {
  return lock.replace(/\.lock$/, ".reclaim");
}

function lockFiles(lock) {
  return [existsSync(lock), existsSync(gateOf(lock))];
}

test("a run, check included, refused while another process holds the output writes nothing and names it", async (t) => {
  const root = await fixture();

  await generate(root);

  const before = await snapshot(root);
  const held = await holder(root, t);

  for (const check of [false, true]) {
    await assert.rejects(generate(root, { check }), (error) => {
      assert.ok(error instanceof GenerationLockedError, error.message);
      assert.match(
        error.message,
        new RegExp(
          `already running for .*generated: lock test holder, pid ${held.pid}, started \\d{4}-\\d{2}-\\d{2}T`,
        ),
      );

      return true;
    });
  }

  assert.deepEqual(await snapshot(root), before);
  assert.deepEqual(await held.release(), { code: 0, signal: null });
  await generate(root);
  assert.deepEqual(lockFiles(outputLockPath(outputOf(root))), [false, false]);
});

test("a refused run doesn't discover: a scan root that's a file still gets the lock error", async (t) => {
  const root = await fixture();
  const held = await holder(root, t);

  await rm(resolve(root, "src/routes"), { recursive: true });
  await writeFile(resolve(root, "src/routes"), "not a directory");
  await assert.rejects(generate(root), GenerationLockedError);
  await held.release();
  await assert.rejects(generate(root), /Scan\/output directory is not a directory/);
});

test("a lock whose holder was killed is reclaimed by the next run", async (t) => {
  const root = await fixture();
  const lock = outputLockPath(outputOf(root));
  const held = await holder(root, t);

  assert.equal((await held.kill()).signal, "SIGKILL");
  assert.equal(
    JSON.parse(readFileSync(lock, "utf8")).pid,
    held.pid,
    "The killed holder's record remains",
  );
  await generate(root);
  assert.ok((await snapshot(root))["generated/server.generated.ts"]);
  assert.deepEqual(lockFiles(lock), [false, false]);
});

// B reads the stopped holder, then waits until A has reclaimed and holds a fresh lock; B must
// re-read under the gate and leave A's lock alone.
async function reclaimRace(output, lock) {
  const bRead = Promise.withResolvers();
  const aHolds = Promise.withResolvers();
  let calls = 0;

  lockHooks.afterStaleRead = async () => {
    calls++;

    if (calls === 1) {
      bRead.resolve();
      await aHolds.promise;
    }
  };

  try {
    const b = lockOutput(output, "B");

    await within(bRead.promise, "B to read the stopped holder", 10_000);

    const releaseA = await lockOutput(output, "A");
    const aRecord = readFileSync(lock, "utf8");

    aHolds.resolve();
    await assert.rejects(b, (error) => {
      assert.ok(error instanceof GenerationLockedError, error.message);
      assert.match(error.message, /in this process: A, pid/);

      return true;
    });
    assert.equal(readFileSync(lock, "utf8"), aRecord, "A's lock is intact");
    await releaseA();
  } finally {
    lockHooks.afterStaleRead = undefined;
  }
}

test("of two runs that read one stopped holder, the later reclaimer leaves the earlier one's lock", async () => {
  const output = outputOf(await fixture());
  const lock = outputLockPath(output);

  await seed(lock, record(deadPid()));
  await reclaimRace(output, lock);
  assert.deepEqual(lockFiles(lock), [false, false]);
});

test("of two runs recovering this process's failed release, one claims it and the other is refused", async () => {
  const output = outputOf(await fixture());
  const lock = outputLockPath(output);
  const release = await lockOutput(output, "failing");

  faults.unlink = async (path) => {
    if (path === lock) {
      throw Object.assign(new Error(`EBUSY: ${path}`), { code: "EBUSY" });
    }

    return await real.unlink(path);
  };

  try {
    await assert.rejects(release(), /couldn't remove its lock/);
  } finally {
    faults.unlink = undefined;
  }

  // B claims the stranded token, then pauses before the gate; A, meanwhile, sees a live holder.
  const bClaimed = Promise.withResolvers();
  const resume = Promise.withResolvers();

  let reads = 0;

  // Only B pauses, so A, if it could also claim the token, would get through and reclaim.
  lockHooks.afterStaleRead = async () => {
    reads++;

    if (reads === 1) {
      bClaimed.resolve();
      await resume.promise;
    }
  };

  try {
    const b = lockOutput(output, "B");

    await within(bClaimed.promise, "B to claim the token", 10_000);
    await assert.rejects(lockOutput(output, "A"), /in this process: failing, pid/);
    resume.resolve();

    const releaseB = await b;

    assert.equal(JSON.parse(readFileSync(lock, "utf8")).label, "B");
    await releaseB();
  } finally {
    lockHooks.afterStaleRead = undefined;
  }

  assert.deepEqual(lockFiles(lock), [false, false]);
});

test("a recovery gate held, left or unreadable refuses with what's known, touching nothing", async () => {
  const output = outputOf(await fixture());
  const lock = outputLockPath(output);
  const gate = gateOf(lock);
  const main = JSON.stringify(record(deadPid()));
  const cases = [
    [JSON.stringify(record(process.pid)), new RegExp(`being recovered by pid ${process.pid}`)],
    [
      JSON.stringify(record(deadPid())),
      /recovery file left by a stopped process: .*\.reclaim\. If no Launch generation is running for this app, delete it\./,
    ],
    [
      "",
      /recovery file it can't read: .*\.reclaim\. If no Launch generation is running for this app, delete it\./,
    ],
    [
      JSON.stringify(record(deadPid(), { hostname: "elsewhere.example" })),
      /recovery file from pid \d+ on elsewhere\.example: .*If no Launch generation is running there, delete it\./,
    ],
  ];

  for (const [gateText, expected] of cases) {
    await seed(lock, main);
    await seed(gate, gateText);
    await assert.rejects(lockOutput(output, label), (error) => {
      assert.ok(error instanceof GenerationLockedError, error.message);
      assert.match(error.message, expected);

      return true;
    });
    assert.equal(readFileSync(lock, "utf8"), main);
    assert.equal(readFileSync(gate, "utf8"), gateText);
    await rm(gate);
    await rm(lock);
  }
});

test("an unreadable lock is waited on briefly, then refused with the file to delete", async () => {
  const output = outputOf(await fixture());
  const lock = outputLockPath(output);
  const pid = deadPid();
  const invalid = [
    "",
    "null",
    JSON.stringify(record(0)),
    JSON.stringify(record(2 ** 31)),
    JSON.stringify(record(pid, { token: "" })),
  ];

  for (const text of invalid) {
    await seed(lock, text);
    await assert.rejects(lockOutput(output, label), (error) => {
      assert.ok(error instanceof GenerationLockedError, error.message);
      assert.match(
        error.message,
        /locked by a file it can't read: .*\.lock\. If no Launch generation is running/,
      );

      return true;
    });
    assert.equal(readFileSync(lock, "utf8"), text, "An unreadable lock is never removed");
  }

  // A holder that finishes writing its record within the wait is reported as that holder.
  await seed(lock, "");

  const attempt = lockOutput(output, label);

  await new Promise((done) => setTimeout(done, 200));
  await writeFile(lock, JSON.stringify(record(process.pid, { label: "slow writer" })));
  await assert.rejects(attempt, /in this process: slow writer, pid/);
  await rm(lock);
});

test("a lock from another host is refused naming the host, even when its pid is unused here", async () => {
  const output = outputOf(await fixture());
  const lock = outputLockPath(output);

  await seed(lock, record(deadPid(), { hostname: "elsewhere.example", label: "remote" }));
  await assert.rejects(lockOutput(output, label), (error) => {
    assert.ok(error instanceof GenerationLockedError, error.message);
    assert.match(error.message, /locked by remote, pid \d+ on elsewhere\.example, /);
    assert.ok(error.message.endsWith(`If it isn't running there, delete ${lock}.`), error.message);

    return true;
  });
  assert.ok(existsSync(lock));
  await rm(lock);
});

test("two runs in one process into one output: the second is refused", async () => {
  const root = await fixture();
  const results = await Promise.allSettled([generate(root), generate(root)]);
  const refusals = [];

  for (const result of results) {
    if (result.status === "rejected") {
      refusals.push(result.reason.message);
    }
  }

  assert.equal(refusals.length, 1);
  assert.match(refusals[0], /in this process: lock test, pid/);
});

test("release retries a transient failure and reports a lasting one with the lock's path", async () => {
  const root = await fixture();
  const lock = outputLockPath(outputOf(root));
  let busy = 2;

  faults.unlink = async (path) => {
    if (path === lock && busy > 0) {
      busy--;

      throw Object.assign(new Error(`EBUSY: ${path}`), { code: "EBUSY" });
    }

    return await real.unlink(path);
  };

  try {
    await generate(root);
    assert.equal(busy, 0);
    assert.equal(existsSync(lock), false);

    // A lasting failure after a successful run fails the run, naming the lock.
    busy = Infinity;
    await assert.rejects(generate(root), (error) => {
      assert.ok(
        error.message.startsWith(`Launch generation couldn't remove its lock ${lock}`),
        error.message,
      );

      return true;
    });

    // The next run of this process reclaims that lock.
    busy = 0;
    await generate(root, { check: true });
    assert.equal(existsSync(lock), false);

    // After a failed run, both messages reach the caller, the run's own first.
    busy = Infinity;
    await put(
      root,
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: false }, include: ["src/**/*.ts"] }),
    );
    await assert.rejects(generate(root), (error) => {
      const [own, cleanup] = error.message.split("\n");

      assert.match(own, /requires effective strict TypeScript checking/);
      assert.match(cleanup, /couldn't remove its lock/);

      return true;
    });
  } finally {
    faults.unlink = undefined;
  }

  // This process reclaims its own stranded lock.
  await lockOutput(outputOf(root), label).then((release) => release());
  assert.equal(existsSync(lock), false);
});

test("a lock whose record can't be written is removed, or named when it can't be", async () => {
  const output = outputOf(await fixture());
  const lock = outputLockPath(output);

  faults.open = async (path, flags) => {
    const handle = await real.open(path, flags);

    if (path === lock) {
      return {
        async writeFile() {
          throw Object.assign(new Error("ENOSPC: no space left"), { code: "ENOSPC" });
        },
        close: () => handle.close(),
      };
    }

    return handle;
  };

  try {
    await assert.rejects(lockOutput(output, label), /ENOSPC/);
    assert.equal(existsSync(lock), false);

    faults.unlink = async () => {
      throw Object.assign(new Error("EACCES: denied"), { code: "EACCES" });
    };
    await assert.rejects(lockOutput(output, label), (error) => {
      assert.ok(error.message.includes(`couldn't write its lock ${lock}`), error.message);

      return true;
    });
  } finally {
    faults.open = undefined;
    faults.unlink = undefined;
  }

  await rm(lock, { force: true });
});

test("outputs that differ only by case share a lock on Windows and macOS, and different outputs don't", async () => {
  const root = await fixture();
  const lower = await lockOutput(resolve(root, "generated"), label);

  try {
    const other = await lockOutput(resolve(root, "elsewhere"), label);

    await other();

    if (insensitive) {
      await assert.rejects(lockOutput(resolve(root, "Generated"), label), GenerationLockedError);
    } else {
      const upper = await lockOutput(resolve(root, "Generated"), label);

      await upper();
    }
  } finally {
    await lower();
  }
});

test("a run that owns the recovery gate shuts out a second reclaimer until it has the lock", async () => {
  const output = outputOf(await fixture());
  const lock = outputLockPath(output);
  const ownsGate = Promise.withResolvers();
  const resume = Promise.withResolvers();
  let gates = 0;

  await seed(lock, record(deadPid()));
  // Only the first owner pauses, so a second one, if the gate let it in, shows up in the count.
  lockHooks.afterGate = async () => {
    gates++;

    if (gates === 1) {
      ownsGate.resolve();
      await resume.promise;
    }
  };

  try {
    const a = lockOutput(output, "A");

    await within(ownsGate.promise, "A to own the gate");

    const started = Date.now();

    await assert.rejects(
      lockOutput(output, "B"),
      new RegExp(`being recovered by pid ${process.pid}`),
    );
    assert.ok(Date.now() - started >= 900, "A busy gate is waited on before it's reported");
    assert.equal(gates, 1, "B never owned the gate");
    resume.resolve();

    const releaseA = await within(a, "A to acquire");

    assert.equal(JSON.parse(readFileSync(lock, "utf8")).label, "A");
    await releaseA();
  } finally {
    lockHooks.afterGate = undefined;
    resume.resolve();
  }

  assert.deepEqual(lockFiles(lock), [false, false]);
});

test("a lock that exists but can't be read, also as a dangling symlink, is refused after the wait", async () => {
  const output = outputOf(await fixture());
  const lock = outputLockPath(output);

  await seed(lock, JSON.stringify(record(process.pid)));
  faults.readFile = async (path, ...rest) => {
    if (path === lock) {
      throw Object.assign(new Error(`EACCES: ${path}`), { code: "EACCES" });
    }

    return await real.readFile(path, ...rest);
  };

  try {
    await assert.rejects(lockOutput(output, label), /locked by a file it can't read/);
  } finally {
    faults.readFile = undefined;
  }

  await rm(lock);

  // Creating symlinks needs a privilege on Windows.
  if (process.platform !== "win32") {
    await symlink(resolve(dirname(lock), "missing-target"), lock);
    await within(
      assert.rejects(lockOutput(output, label), /locked by a file it can't read/),
      "the dangling symlink's refusal",
      10_000,
    );
    await rm(lock);
  }
});

test("release reports a lock it can't read instead of leaving it silently", async () => {
  const output = outputOf(await fixture());
  const lock = outputLockPath(output);
  const release = await lockOutput(output, label);

  await writeFile(lock, "");
  await assert.rejects(release(), (error) => {
    assert.ok(
      error.message.startsWith(`Launch generation couldn't remove its lock ${lock}`),
      error.message,
    );

    return true;
  });
  await rm(lock);
});

test("a reclaim whose lock and recovery file both can't be removed reports both", async () => {
  const output = outputOf(await fixture());
  const lock = outputLockPath(output);
  const gate = gateOf(lock);

  await seed(lock, record(deadPid()));
  faults.unlink = async (path) => {
    if (path === lock || path === gate) {
      throw Object.assign(new Error(`EPERM: ${path}`), { code: "EPERM" });
    }

    return await real.unlink(path);
  };

  try {
    await assert.rejects(lockOutput(output, label), (error) => {
      const [first, second] = error.message.split("\n");

      assert.ok(first.includes(`lock of a run that stopped, ${lock}`), error.message);
      assert.ok(second.includes(`recovery file ${gate}`), error.message);

      return true;
    });
  } finally {
    faults.unlink = undefined;
  }

  await rm(gate, { force: true });
  await rm(lock, { force: true });
});

function failing(code) {
  return (path) => Object.assign(new Error(`${code}: ${path}`), { code });
}

test("release retries a read its lock briefly refuses, such as a Windows sharing conflict", async () => {
  const root = await fixture();
  const lock = outputLockPath(outputOf(root));
  let busy = 1;

  faults.readFile = async (path, ...rest) => {
    if (path === lock && busy > 0) {
      busy--;

      throw failing("EBUSY")(path);
    }

    return await real.readFile(path, ...rest);
  };

  try {
    await generate(root);
  } finally {
    faults.readFile = undefined;
  }

  assert.equal(busy, 0, "Release read the lock");
  assert.equal(existsSync(lock), false);
});

test("an inconclusive re-read under the gate keeps this process's failed release reclaimable", async () => {
  const output = outputOf(await fixture());
  const lock = outputLockPath(output);
  const release = await lockOutput(output, "failing");

  faults.unlink = async (path) => {
    if (path === lock) {
      throw failing("EPERM")(path);
    }

    return await real.unlink(path);
  };

  try {
    await assert.rejects(release(), /couldn't remove its lock/);
  } finally {
    faults.unlink = undefined;
  }

  // The contended read succeeds; the re-read under the gate fails once.
  let reads = 0;

  faults.readFile = async (path, ...rest) => {
    if (path === lock) {
      reads++;

      if (reads === 2) {
        throw failing("EBUSY")(path);
      }
    }

    return await real.readFile(path, ...rest);
  };

  try {
    const releaseAgain = await within(lockOutput(output, "again"), "the reacquisition", 10_000);

    assert.ok(reads >= 3, "It re-read after the inconclusive read");
    assert.equal(JSON.parse(readFileSync(lock, "utf8")).label, "again");
    await releaseAgain();
  } finally {
    faults.readFile = undefined;
  }

  assert.deepEqual(lockFiles(lock), [false, false]);
});

test("an entry whose existence can't be confirmed is treated as unreadable, not as gone", async () => {
  const output = outputOf(await fixture());
  const lock = outputLockPath(output);

  await seed(lock, JSON.stringify(record(process.pid)));
  faults.readFile = async (path, ...rest) => {
    if (path === lock) {
      throw failing("ENOENT")(path);
    }

    return await real.readFile(path, ...rest);
  };
  faults.lstat = async (path, ...rest) => {
    if (path === lock) {
      throw failing("EIO")(path);
    }

    return await real.lstat(path, ...rest);
  };

  try {
    await within(
      assert.rejects(lockOutput(output, label), /locked by a file it can't read/),
      "the refusal",
      10_000,
    );
  } finally {
    faults.readFile = undefined;
    faults.lstat = undefined;
  }

  await rm(lock);
});

test("two reclaimers reaching the gate together: only one owns it at a time", async () => {
  const output = outputOf(await fixture());
  const lock = outputLockPath(output);
  const bothRead = Promise.withResolvers();
  let read = 0;
  let owners = 0;
  let mostOwners = 0;

  await seed(lock, record(deadPid()));
  // Both read the stopped holder, then go for the gate in the same turn.
  lockHooks.afterStaleRead = async () => {
    read++;

    if (read === 2) {
      bothRead.resolve();
    }

    await bothRead.promise;
  };
  lockHooks.afterGate = async () => {
    owners++;
    mostOwners = Math.max(mostOwners, owners);
    await new Promise((done) => setTimeout(done, 20));
    owners--;
  };

  try {
    const results = await within(
      Promise.allSettled([lockOutput(output, "A"), lockOutput(output, "B")]),
      "both reclaimers",
      10_000,
    );
    const winners = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        winners.push(result.value);
      } else {
        assert.match(result.reason.message, /in this process/);
      }
    }

    assert.equal(mostOwners, 1, "The gate had one owner at a time");
    assert.equal(winners.length, 1);
    await winners[0]();
  } finally {
    lockHooks.afterStaleRead = undefined;
    lockHooks.afterGate = undefined;
  }

  assert.deepEqual(lockFiles(lock), [false, false]);
});

test("a liveness probe that fails inconclusively keeps the lock held", async (t) => {
  const output = outputOf(await fixture());
  const lock = outputLockPath(output);
  const pid = deadPid();
  const kill = process.kill;

  await seed(lock, record(pid, { label: "probed" }));
  process.kill = (target, signal) => {
    if (target === pid) {
      throw Object.assign(new Error("EIO"), { code: "EIO" });
    }

    return kill.call(process, target, signal);
  };
  t.after(() => {
    process.kill = kill;
  });

  await assert.rejects(lockOutput(output, label), /already running for .*: probed, pid/);
  process.kill = kill;
  assert.equal(JSON.parse(readFileSync(lock, "utf8")).label, "probed", "The lock is kept");
  await rm(lock);
});

test("composed and decomposed spellings share a lock on Windows and macOS only", () => {
  const composed = resolve(scratch, "café", "generated");
  const decomposed = resolve(scratch, "café", "generated");

  assert.equal(outputLockPath(composed) === outputLockPath(decomposed), insensitive);
});

test("re-reads under the gate that keep failing, or keep finding an unreadable record, end in a refusal and keep this process's failed release reclaimable", async () => {
  for (const failure of ["thrown", "unreadable"]) {
    const output = outputOf(await fixture());
    const lock = outputLockPath(output);
    const release = await lockOutput(output, "failing");

    faults.unlink = async (path) => {
      if (path === lock) {
        throw failing("EPERM")(path);
      }

      return await real.unlink(path);
    };

    try {
      await assert.rejects(release(), /couldn't remove its lock/);
    } finally {
      faults.unlink = undefined;
    }

    // Every contended read succeeds; every re-read under the gate fails.
    let reads = 0;

    faults.readFile = async (path, ...rest) => {
      if (path === lock) {
        reads++;

        if (reads % 2 === 0) {
          if (failure === "thrown") {
            throw failing("EBUSY")(path);
          }

          return "";
        }
      }

      return await real.readFile(path, ...rest);
    };

    try {
      await within(
        assert.rejects(lockOutput(output, label), /locked by a file it can't read: /),
        `the refusal (${failure})`,
        10_000,
      );
    } finally {
      faults.readFile = undefined;
    }

    assert.equal(JSON.parse(readFileSync(lock, "utf8")).label, "failing", failure);

    const reacquired = await within(
      lockOutput(output, "again"),
      `the recovery (${failure})`,
      10_000,
    );

    await reacquired();
    assert.deepEqual(lockFiles(lock), [false, false], failure);
  }
});
