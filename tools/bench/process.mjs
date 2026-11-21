// Files, directories and child processes a runner measures with.
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, join } from "node:path";

export async function exists(path) {
  try {
    await access(path);

    return true;
  } catch {
    return false;
  }
}

export async function files(directory, predicate, found = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      await files(path, predicate, found);
    } else if (predicate(entry.name)) {
      found.push(path);
    }
  }

  return found;
}

// A new directory under the OS temp dir named after the bench, or the given one, which must not
// exist yet or be empty.
export async function outputDirectory(out, name) {
  if (out === undefined) {
    return mkdtemp(join(os.tmpdir(), `${name}-`));
  }

  const present = await exists(out);

  if (present) {
    const entries = await readdir(out);

    if (entries.length > 0) {
      throw new Error(`--out ${out} isn't empty; pass a new or empty directory.`);
    }
  }

  await mkdir(out, { recursive: true });

  return out;
}

// The path of a package's bin script, resolved from the runner's package (its `require`).
export async function bin(require, name, command) {
  const manifestPath = require.resolve(`${name}/package.json`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  let entry = manifest.bin;

  if (typeof entry === "object") {
    entry = entry[command];
  }

  return join(dirname(manifestPath), entry);
}

// Runs a Node script, keeps its combined output in a log, and fails on a nonzero exit or once it
// outlives the timeout.
export async function node(args, { cwd, log, timeoutMs }) {
  const started = performance.now();
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, NG_CLI_ANALYTICS: "false" },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  let output = "";

  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });

  const { code, signal } = await new Promise((resolvePromise, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode, exitSignal) => {
      resolvePromise({ code: exitCode, signal: exitSignal });
    });
  });
  const wallMs = performance.now() - started;

  await writeFile(log, output);

  if (signal && wallMs >= timeoutMs) {
    throw new Error(`Timed out after ${timeoutMs / 1000} s: node ${args.join(" ")}; see ${log}`);
  }

  if (code !== 0) {
    throw new Error(`Failed (${signal ?? `exit ${code}`}): node ${args.join(" ")}; see ${log}`);
  }

  return { wallMs, output };
}
