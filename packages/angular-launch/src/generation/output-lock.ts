import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// One generation run's claim on an output directory, as its lock file records it.
interface Holder {
  readonly pid: number;
  readonly hostname: string;
  readonly startedAt: string;
  readonly label: string;
  readonly token: string;
}

/** A generation run refused because another run holds, or may hold, its output's lock. */
export class GenerationLockedError extends Error {
  override name = "GenerationLockedError";
}

/**
 * Test seam: called after a run read a holder it found dead, before it takes the reclaim gate,
 * so tests can order two reclaimers deterministically.
 */
export const lockHooks: {
  afterStaleRead?: () => Promise<void>;
  // Called once a reclaimer owns the gate, before it re-reads the lock.
  afterGate?: () => Promise<void>;
} = {};

// Tokens of this process whose release couldn't remove the lock file. Only this process knows
// they're no longer running, so only it may reclaim them while its pid is alive.
const failedReleases = new Set<string>();

// How long an unreadable record or a busy gate counts as transient before it's reported.
const settleTime = 1000;
const retryDelay = 50;
const maxPid = 0x7fffffff;

// Launch's key rule: on Windows and macOS, whose default filesystems ignore case, ASCII and other
// case pairs toLowerCase folds and NFC-equivalent spellings share a lock (two directories that
// differ only that way falsely contend); elsewhere spellings are compared exactly.
function fold(path: string): string {
  const insensitive = process.platform === "win32" || process.platform === "darwin";

  if (!insensitive) {
    return path;
  }

  return path.normalize("NFC").toLowerCase();
}

/** The lock file of an output directory, given as an absolute path inside the real workspace. */
export function outputLockPath(output: string): string {
  const uid = process.getuid?.();
  let directory = "loozo-angular-launch";

  if (uid !== undefined) {
    directory += `-${uid}`;
  }

  const key = createHash("sha256").update(fold(output)).digest("hex").slice(0, 32);

  return join(tmpdir(), directory, `${key}.lock`);
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

// A record is external input: another process, an older version or a person may have written it.
function parseHolder(text: string): Holder | undefined {
  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }

  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const pid = record.pid;
  const isPid = typeof pid === "number" && Number.isInteger(pid) && pid >= 1 && pid <= maxPid;

  if (!isPid) {
    return undefined;
  }

  for (const field of ["hostname", "startedAt", "label", "token"]) {
    const text = record[field];

    if (typeof text !== "string" || text === "") {
      return undefined;
    }
  }

  return {
    pid,
    hostname: record.hostname as string,
    startedAt: record.startedAt as string,
    label: record.label as string,
    token: record.token as string,
  };
}

// The record at path: "gone" when there's no entry, "unreadable" when there's one whose contents
// aren't a record (being written, damaged, or a symlink to nothing). Throws when the filesystem
// can't say, such as a sharing conflict on Windows, so each caller applies its own retry policy.
async function readRecord(path: string): Promise<Holder | "gone" | "unreadable"> {
  let text: string;

  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      throw error;
    }

    try {
      await lstat(path);
    } catch (missing) {
      if (errorCode(missing) === "ENOENT") {
        return "gone";
      }

      throw missing;
    }

    return "unreadable";
  }

  return parseHolder(text) ?? "unreadable";
}

// A contender's read: a record it can't read for any reason gets the same bounded wait.
async function readContended(path: string): Promise<Holder | "gone" | "unreadable"> {
  try {
    return await readRecord(path);
  } catch {
    return "unreadable";
  }
}

// Only a definite "no such process" counts as stopped; anything inconclusive keeps the lock held.
function isStopped(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return false;
  } catch (error) {
    return errorCode(error) === "ESRCH";
  }
}

// Creates path exclusively with the record; false when it already exists.
async function createExclusive(path: string, holder: Holder): Promise<boolean> {
  let handle;

  try {
    handle = await open(path, "wx");
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      return false;
    }

    throw error;
  }

  try {
    try {
      await handle.writeFile(JSON.stringify(holder));
    } finally {
      await handle.close();
    }
  } catch (error) {
    try {
      await unlink(path);
    } catch (cleanup) {
      throw new Error(
        `Launch generation couldn't write its lock ${path} (${String(error)}) or remove it ` +
          `(${String(cleanup)}). If no Launch generation is running for this app, delete it.`,
        { cause: error },
      );
    }

    throw error;
  }

  return true;
}

function heldBy(output: string, holder: Holder, path: string): GenerationLockedError {
  const isHere = holder.hostname === hostname();

  if (!isHere) {
    return new GenerationLockedError(
      `Launch generation for ${output} is locked by ${holder.label}, pid ${holder.pid} on ` +
        `${holder.hostname}, started ${holder.startedAt}. If it isn't running there, delete ${path}.`,
    );
  }

  let where = "";

  if (holder.pid === process.pid) {
    where = " in this process";
  }

  return new GenerationLockedError(
    `Launch generation is already running for ${output}${where}: ${holder.label}, pid ` +
      `${holder.pid}, started ${holder.startedAt}. Wait for it to finish, then run again.`,
  );
}

// Removes the lock whose holder stopped (token stale) under the reclaim gate, which serializes
// reclaimers: the lock is re-read under it, so a reclaimer that read the same stopped holder as
// an earlier one finds that one's fresh lock and leaves it. "busy" when another reclaimer owns the
// gate, "inconclusive" when the re-read couldn't tell what's there; either way the caller tries
// again with the same stale token.
async function reclaim(
  path: string,
  output: string,
  stale: string,
  mine: Holder,
  late: boolean,
): Promise<"done" | "busy" | "inconclusive"> {
  const gate = path.replace(/\.lock$/, ".reclaim");
  const created = await createExclusive(gate, mine);

  if (!created) {
    if (!late) {
      return "busy";
    }

    const gateHolder = await readContended(gate);

    if (gateHolder === "gone") {
      return "busy";
    }

    if (gateHolder === "unreadable") {
      throw new GenerationLockedError(
        `Launch generation for ${output} found a recovery file it can't read: ${gate}. If no ` +
          "Launch generation is running for this app, delete it.",
      );
    }

    if (gateHolder.hostname !== mine.hostname) {
      throw new GenerationLockedError(
        `Launch generation for ${output} found a recovery file from pid ${gateHolder.pid} on ` +
          `${gateHolder.hostname}: ${gate}. If no Launch generation is running there, delete it.`,
      );
    }

    if (!isStopped(gateHolder.pid)) {
      throw new GenerationLockedError(
        `Launch generation for ${output} is being recovered by pid ${gateHolder.pid}. Run again ` +
          "shortly.",
      );
    }

    throw new GenerationLockedError(
      `Launch generation for ${output} found a recovery file left by a stopped process: ${gate}. ` +
        "If no Launch generation is running for this app, delete it.",
    );
  }

  await lockHooks.afterGate?.();

  let failure: Error | undefined;
  let current: Holder | "gone" | "unreadable" | undefined;

  try {
    current = await readRecord(path);
  } catch {
    current = undefined;
  }

  try {
    const isStale = typeof current === "object" && current.token === stale;

    if (isStale) {
      await unlink(path);
    }
  } catch (error) {
    failure = new Error(
      `Launch generation couldn't remove the lock of a run that stopped, ${path}: ` +
        `${String(error)}. If no Launch generation is running for this app, delete it.`,
      { cause: error },
    );
  }

  try {
    await unlink(gate);
  } catch (error) {
    const gateFailure =
      `Launch generation couldn't remove its recovery file ${gate}: ${String(error)}. If no ` +
      "Launch generation is running for this app, delete it.";

    // Both reach the caller, the lock's first.
    if (failure) {
      throw new Error(`${failure.message}\n${gateFailure}`, { cause: failure });
    }

    throw new Error(gateFailure, { cause: error });
  }

  if (failure) {
    throw failure;
  }

  // A record being written, damaged or unreadable for now may still be the stale one.
  if (current === undefined || current === "unreadable") {
    return "inconclusive";
  }

  return "done";
}

async function release(path: string, token: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      const current = await readRecord(path);

      // A record this run can't read may still be its own: report it rather than leave it.
      if (current === "unreadable") {
        throw Object.assign(new Error(`its record can't be read`), { code: "EUNREADABLE" });
      }

      const isMine = current !== "gone" && current.token === token;

      if (isMine) {
        await unlink(path);
      }

      return;
    } catch (error) {
      const isTransient = ["EBUSY", "EPERM", "EACCES"].includes(errorCode(error) ?? "");

      if (!isTransient || attempt === 4) {
        failedReleases.add(token);

        throw new Error(
          `Launch generation couldn't remove its lock ${path}: ${String(error)}. If no Launch ` +
            "generation is running for this app, delete it.",
          { cause: error },
        );
      }

      await sleep(retryDelay);
    }
  }
}

/**
 * Takes the lock of one output directory for a generation run, or throws
 * {@link GenerationLockedError} naming the run that holds it. A lock whose holder process no
 * longer exists on this host is reclaimed. The returned release removes the lock and throws, with
 * its path, only when it can't.
 *
 * @param output - The output directory's absolute path inside the real workspace.
 * @param label - What the run is, for another run's error.
 */
export async function lockOutput(output: string, label: string): Promise<() => Promise<void>> {
  const path = outputLockPath(output);
  const directory = dirname(path);
  const uid = process.getuid?.();

  await mkdir(directory, { recursive: true, mode: 0o700 });

  // In a shared temporary directory, another account could own the lock directory.
  if (uid !== undefined) {
    const info = await lstat(directory);
    const isPrivate = info.isDirectory() && info.uid === uid && (info.mode & 0o022) === 0;

    if (!isPrivate) {
      throw new Error(`Unsafe Launch lock directory: ${directory}`);
    }
  }

  const mine: Holder = {
    pid: process.pid,
    hostname: hostname(),
    startedAt: new Date().toISOString(),
    label,
    token: randomUUID(),
  };
  const deadline = Date.now() + settleTime;

  for (;;) {
    const created = await createExclusive(path, mine);

    if (created) {
      return () => release(path, mine.token);
    }

    const late = Date.now() >= deadline;
    const holder = await readContended(path);

    // Released since the create failed.
    if (holder === "gone") {
      continue;
    }

    // A holder between creating the file and writing its record reads as unreadable briefly.
    if (holder === "unreadable") {
      if (!late) {
        await sleep(retryDelay);
        continue;
      }

      throw new GenerationLockedError(
        `Launch generation for ${output} is locked by a file it can't read: ${path}. If no ` +
          "Launch generation is running for this app, delete it.",
      );
    }

    if (holder.hostname !== mine.hostname) {
      throw heldBy(output, holder, path);
    }

    const isOwnFailedRelease = holder.pid === process.pid && failedReleases.has(holder.token);

    if (!isOwnFailedRelease && !isStopped(holder.pid)) {
      throw heldBy(output, holder, path);
    }

    // Claimed before any await, so two runs of this process don't both reclaim it.
    if (isOwnFailedRelease) {
      failedReleases.delete(holder.token);
    }

    await lockHooks.afterStaleRead?.();

    let reclaimed: "done" | "busy" | "inconclusive";

    try {
      reclaimed = await reclaim(path, output, holder.token, mine, late);
    } catch (error) {
      if (isOwnFailedRelease) {
        failedReleases.add(holder.token);
      }

      throw error;
    }

    if (reclaimed === "done") {
      continue;
    }

    if (isOwnFailedRelease) {
      failedReleases.add(holder.token);
    }

    // Re-reads that keep failing end like any lock that can't be read.
    if (reclaimed === "inconclusive" && late) {
      throw new GenerationLockedError(
        `Launch generation for ${output} is locked by a file it can't read: ${path}. If no ` +
          "Launch generation is running for this app, delete it.",
      );
    }

    await sleep(retryDelay);
  }
}
