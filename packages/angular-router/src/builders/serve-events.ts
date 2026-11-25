import { lstatSync, realpathSync, statSync, type Stats } from "node:fs";
import { lstat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import ts from "typescript";
import { contains } from "../generation/files.js";

// How often serve checks the config inputs. They change rarely, so a pass may start up to this
// much later than for a watched source edit.
const configPollInterval = 500;

// Files no generation pass reads: Angular's template compiler never runs in generation, and
// TypeScript resolves an import of one of these to its declaration (a companion such as
// `x.d.svg.ts`, or a `declare module "*.svg"` wildcard), never to the file itself.
const inertExtensions = new Set([
  ".html",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".md",
]);

/**
 * Whether a serve watcher event touched only a file no generation pass reads, so it needs no
 * pass: an added, changed or removed template, style, image, font or Markdown file that's a
 * regular file now (or gone, for a removal) and isn't one of the locale `catalogs` or the file one
 * resolves to. Anything else, a directory event or a symlink included, needs one. The builder
 * still decides whether its pass state allows skipping.
 */
export async function isInertFileEvent(
  event: string,
  path: string,
  catalogs: readonly string[],
): Promise<boolean> {
  if (event !== "add" && event !== "change" && event !== "unlink") {
    return false;
  }

  if (!inertExtensions.has(extname(path).toLowerCase())) {
    return false;
  }

  // Compared without case: on a case-sensitive filesystem that only costs a pass. Generation reads
  // a catalog through any symlink it is, so the file it resolves to is the catalog too, and while
  // one doesn't resolve this file could be it. Resolved synchronously: a few calls, only for these
  // extensions with catalogs configured.
  const spellings = [path.toLowerCase()];

  if (catalogs.length > 0) {
    try {
      spellings.push(join(realpathSync(dirname(path)), basename(path)).toLowerCase());
    } catch {
      // A removed directory: its events regenerate anyway.
    }
  }

  for (const catalog of catalogs) {
    let target: string;

    try {
      target = realpathSync(catalog);
    } catch {
      return false;
    }

    if (spellings.includes(catalog.toLowerCase()) || spellings.includes(target.toLowerCase())) {
      return false;
    }
  }

  // A symlink can point generation's walk somewhere else, and a delayed removal can arrive while
  // a dangling one sits at the path, so only a regular file, or nothing for a removal, is inert.
  try {
    const entry = await lstat(path);

    return entry.isFile();
  } catch (error) {
    return event === "unlink" && (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

/**
 * Serve's check of the files outside its scan directories that generation reads: the generation
 * tsconfig, the configs its `extends` chain resolves to, the candidates TypeScript probed for that
 * chain, the application manifest and the locale catalogs. `refresh()` lists them again from the
 * tsconfig and takes each one's current state as the baseline; every 500 ms each is checked
 * against it, and `changed` runs once when any differs. A path serve's watcher sees, inside a scan
 * root with no link on the way, is left to it.
 */
export interface ConfigWatch {
  /** Lists the inputs again and takes their current state as the baseline, before a pass reads them. */
  refresh(): void;
  /** Stops checking. */
  close(): void;
}

/**
 * Starts serve's check of its config inputs (see {@link ConfigWatch}), with the baseline taken now.
 * Polled rather than watched: an input may be absent, behind a link, or deleted and recreated, and
 * `stat` sees each of those the same way.
 */
export function watchConfigInputs({
  configFile,
  manifest,
  catalogs,
  roots,
  changed,
}: {
  configFile: string;
  manifest: string;
  catalogs: readonly string[];
  roots: readonly string[];
  changed: () => void;
}): ConfigWatch {
  let baseline = new Map<string, string>();

  function refresh(): void {
    // TypeScript can't list an input that's missing, such as an installed base or a package
    // manifest deleted for a reinstall, so one the last refresh listed stays while it's absent: its
    // return is a change. Looked at before the parse, so a return during it is one too.
    const missing: string[] = [];

    for (const path of baseline.keys()) {
      if (signature(path) === "absent") {
        missing.push(path);
      }
    }

    const inputs = configInputs(configFile, manifest);

    for (const path of missing) {
      if (!inputs.has(path)) {
        inputs.set(path, "absent");
      }
    }

    for (const catalog of catalogs) {
      const path = resolve(catalog);

      if (!inputs.has(path)) {
        inputs.set(path, signature(path));
      }
    }

    for (const path of inputs.keys()) {
      for (const root of roots) {
        if (watchedBy(root, path)) {
          inputs.delete(path);
          break;
        }
      }
    }

    baseline = inputs;
  }

  function check(): void {
    let differs = false;

    for (const [path, before] of baseline) {
      const now = signature(path);

      if (now !== before) {
        baseline.set(path, now);
        differs = true;
      }
    }

    if (differs) {
      changed();
    }
  }

  refresh();

  const interval = setInterval(check, configPollInterval);

  return {
    refresh,
    close() {
      clearInterval(interval);
      baseline.clear();
    },
  };
}

// The config inputs of `configFile`: the tsconfig, every config its `extends` chain resolved to (a
// package base at its real path), every other path TypeScript read (a package manifest whose
// `exports` chose a base) or probed outside `node_modules` (a candidate that would change the
// chain once created), and the manifest. Each has the state it had
// just before TypeScript read it, or for a path it only probed, when it first probed it, so a
// change after that, even during this parse, differs from the baseline. Generation reports config
// errors, so diagnostics are ignored here, and a path that isn't a regular file is never opened:
// generation's audit reports it.
function configInputs(configFile: string, manifest: string): Map<string, string> {
  const seen = new Map<string, string>();
  // Files TypeScript read, as opposed to probed: a package manifest it read to resolve an
  // `extends` (its `exports` choose the base) is an input even under `node_modules`.
  const read = new Set<string>();

  // A path's state now, kept as its baseline if it's TypeScript's first look at it (a read
  // replaces it with the state just before the read).
  function look(path: string): string {
    const absolute = resolve(path);
    const state = signature(absolute);

    if (!seen.has(absolute)) {
      seen.set(absolute, state);
    }

    return state;
  }

  // TypeScript's own host otherwise (realpath and directoryExists decide how a package base
  // resolves), without enumerating root files.
  const host: ts.ParseConfigHost = {
    ...ts.sys,
    readDirectory: () => [],
    fileExists: (path) => look(path).startsWith("file:"),
    // Looked at again right before the read, so a path that stopped being a regular file since a
    // probe is never opened, and what's read has the baseline of the state just before the read.
    readFile(path) {
      const state = signature(resolve(path));

      seen.set(resolve(path), state);

      if (!state.startsWith("file:")) {
        return undefined;
      }

      read.add(resolve(path));

      return ts.sys.readFile(path);
    },
  };
  const inputs = new Map<string, string>();

  try {
    if (host.fileExists(configFile)) {
      const source = ts.readJsonConfigFile(configFile, (path) => host.readFile(path));

      ts.parseJsonSourceFileConfigFileContent(source, host, dirname(configFile), {}, configFile);

      for (const path of source.extendedSourceFiles ?? []) {
        inputs.set(resolve(path), baselineOf(seen, path));
      }
    }
  } catch {
    // An unreadable chain (a link loop, a permission error) is generation's to report; what was
    // probed before it is still watched.
  }

  for (const [path, state] of seen) {
    if (read.has(path) || !path.split(/[\\/]/).includes("node_modules")) {
      inputs.set(path, state);
    }
  }

  inputs.set(resolve(configFile), baselineOf(seen, configFile));
  inputs.set(resolve(manifest), baselineOf(seen, manifest));

  return inputs;
}

function baselineOf(seen: Map<string, string>, path: string): string {
  return seen.get(resolve(path)) ?? signature(resolve(path));
}

// Serve's watcher watches a scan root without following links, so it sees a path's changes only
// when no link lies between the root and the path, a dangling one included.
function watchedBy(root: string, path: string): boolean {
  if (!contains(root, path)) {
    return false;
  }

  const top = resolve(root);

  // Up to the root; the filesystem root's parent is itself, which ends the walk whatever spelling
  // the root has.
  for (
    let current = path;
    current !== top && dirname(current) !== current;
    current = dirname(current)
  ) {
    try {
      if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) {
        return false;
      }
    } catch {
      // Unreadable on the way (a file where a directory should be, a permission error): checked
      // here rather than trusted to the watcher.
      return false;
    }
  }

  return true;
}

// A path's state: `absent`, `directory`, `other`, `error:<code>`, or a regular file's identity,
// size and modification and change times. `stat` follows every link in the path, so retargeting a
// link anywhere along it changes the state; reading the file doesn't.
function signature(path: string): string {
  let entry: Stats | undefined;

  try {
    entry = statSync(path, { throwIfNoEntry: false });
  } catch (error) {
    return `error:${(error as NodeJS.ErrnoException).code}`;
  }

  if (entry === undefined) {
    return "absent";
  }

  if (entry.isFile()) {
    return `file:${entry.dev}:${entry.ino}:${entry.size}:${entry.mtimeMs}:${entry.ctimeMs}`;
  }

  if (entry.isDirectory()) {
    return "directory";
  }

  return "other";
}
