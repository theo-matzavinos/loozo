import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { lstatSync, realpathSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const markers = {
  "routes.generated.ts": "// @loozo/angular-router routegen: owned routes.generated.ts",
  "destinations.generated.ts": "// @loozo/angular-router routegen: owned destinations.generated.ts",
  "route.generated.ts": "// @loozo/angular-router routegen: owned route.generated.ts",
} as const;

export const launchMarkers = {
  "rpc.generated.ts": "// @loozo/angular-launch: owned rpc.generated.ts",
  "context.generated.d.ts": "// @loozo/angular-launch: owned context.generated.d.ts",
  "server.generated.ts": "// @loozo/angular-launch: owned server.generated.ts",
} as const;

export function contains(directory: string, file: string): boolean {
  const suffix = relative(directory, file);

  return (
    suffix === "" || (!isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${sep}`))
  );
}

export async function metadata(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

// Resolve only aliases for the workspace access prefix, never a source/output suffix.
export async function workspacePaths(workspace: string) {
  const canonical = await realpath(workspace);

  return {
    canonical,
    // Config matching needs synchronous directory-entry lookup. The optional
    // directory leaf uses the same restricted prefix policy as file ancestors.
    resolve(path: string, directory = false): string {
      const absolute = resolve(workspace, path);

      // Inside the workspace every link is a suffix, even a link back to its root.
      // Preserve that spelling for audit; only external access aliases may map.
      if (contains(canonical, absolute)) {
        return absolute;
      }

      if (contains(workspace, absolute)) {
        return resolve(canonical, relative(workspace, absolute));
      }

      const ancestors: string[] = [];
      let current = dirname(absolute);

      if (directory) {
        current = absolute;
      }

      while (dirname(current) !== current) {
        ancestors.unshift(current);
        current = dirname(current);
      }

      for (const ancestor of ancestors) {
        const info = lstatSync(ancestor, { throwIfNoEntry: false });

        if (info?.isSymbolicLink()) {
          const target = realpathSync(ancestor);

          if (target === canonical) {
            return resolve(canonical, relative(ancestor, absolute));
          }

          // A source/output link cannot become legitimate by resolving its target.
          return absolute;
        }
      }

      return absolute;
    },
  };
}

export async function auditPath(path: string): Promise<void> {
  const parent = dirname(path);

  if (parent !== path) {
    await auditPath(parent);
  }

  const info = await metadata(path);

  if (info?.isSymbolicLink()) {
    throw new Error(`Unsafe source/output symbolic link: ${path}`);
  }

  if (info && parent !== path && !info.isDirectory() && !info.isFile()) {
    throw new Error(`Unsafe filesystem entry: ${path}`);
  }
}

export async function walk(directory: string): Promise<string[]> {
  await auditPath(directory);

  const info = await metadata(directory);

  if (!info) {
    return [];
  }

  if (!info.isDirectory()) {
    throw new Error(`Scan/output directory is not a directory: ${directory}`);
  }

  const result: string[] = [];

  async function visit(path: string): Promise<void> {
    const entries = await readdir(path, { withFileTypes: true });

    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));

    for (const entry of entries) {
      const child = resolve(path, entry.name);

      if (entry.isSymbolicLink()) {
        throw new Error(`Unsafe source/output symbolic link: ${child}`);
      }

      if (entry.isDirectory()) {
        // Dependency package-manager links are not application sources.
        if (entry.name !== "node_modules") {
          await visit(child);
        }
      } else if (entry.isFile()) {
        result.push(child);
      } else {
        throw new Error(`Unsafe filesystem entry: ${child}`);
      }
    }
  }

  await visit(directory);

  return result;
}

export interface OutputPlan {
  changed: string[];
  missing: string[];
  stale: string[];
  desired: ReadonlyMap<string, string>;
}

export async function planOutputs(
  desired: ReadonlyMap<string, string>,
  encountered: readonly string[],
  globals: readonly string[],
  mode?: "router-and-launch",
): Promise<OutputPlan> {
  const changed: string[] = [];
  const missing: string[] = [];
  const stale: string[] = [];
  const possible = new Set([...desired.keys(), ...globals]);

  for (const path of encountered) {
    if (
      path.endsWith(`${sep}route.generated.ts`) ||
      (mode === "router-and-launch" &&
        Object.keys(launchMarkers).some((name) => path.endsWith(`${sep}${name}`)))
    ) {
      possible.add(path);
    }
  }

  for (const path of [...possible].sort()) {
    await auditPath(path);

    const info = await metadata(path);
    const expected = desired.get(path);

    if (!info) {
      if (expected !== undefined) {
        missing.push(path);
      }

      continue;
    }

    if (!info.isFile()) {
      throw new Error(`Generated output is not a regular file: ${path}`);
    }

    const bytes = await readFile(path, "utf8");
    const ownership: Record<string, string> = { ...markers };

    if (mode === "router-and-launch") {
      Object.assign(ownership, launchMarkers);
    }

    const name = path.slice(path.lastIndexOf(sep) + 1);
    const owned = bytes.split("\n", 1)[0] === ownership[name];

    if (!owned) {
      if (expected !== undefined) {
        throw new Error(`Unmarked generated-output collision: ${path}`);
      }

      continue;
    }

    if (expected === undefined) {
      stale.push(path);
    } else if (bytes !== expected) {
      changed.push(path);
    }
  }

  return { changed, missing, stale, desired };
}

export function publish(
  plan: OutputPlan,
  check: boolean,
  stopped: () => boolean,
  authored: ReadonlyMap<string, string>,
  seeds: ReadonlySet<string>,
): string[] {
  if (stopped()) {
    return [];
  }

  if (check) {
    if (authored.size > 0) {
      throw new Error(
        `Filesystem definitions missing/changed:\n${[...authored.keys()].join("\n")}`,
      );
    }

    for (const [kind, paths] of [
      ["changed", plan.changed],
      ["missing", plan.missing],
      ["stale", plan.stale],
    ] as const) {
      if (paths.length > 0) {
        throw new Error(`Generated artifacts ${kind}:\n${paths.join("\n")}`);
      }
    }

    return [];
  }

  // No awaits from the final stop check through this short publication section.
  for (const [file, bytes] of authored) {
    if (seeds.has(file)) {
      writeFileSync(file, bytes, { encoding: "utf8", flag: "wx" });
    } else {
      writeFileSync(file, bytes, "utf8");
    }
  }

  for (const path of [...plan.changed, ...plan.missing]) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, plan.desired.get(path)!, "utf8");
  }

  for (const path of plan.stale) {
    unlinkSync(path);
  }

  return [...authored.keys(), ...plan.changed, ...plan.missing];
}
