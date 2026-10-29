import { SchematicsException, type Rule, type Tree } from "@angular-devkit/schematics";
import { readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";
import { componentsDirectory, readFoldConfig } from "../fold-config.js";

export interface AddOptions {
  readonly names: readonly string[];
  /** What to do with a named component whose folder already exists. */
  readonly existing: "skip" | "overwrite" | "error";
}

const componentImport = /from\s+["']\.\.\/([a-z][a-z0-9-]*)["']/g;

export default function add(options: AddOptions): Rule {
  return (tree, context) => {
    const config = readFoldConfig(tree);

    if (config === undefined) {
      throw new SchematicsException(
        "fold isn't set up in this workspace. Run `ng add @loozo/fold-ui` first.",
      );
    }

    const named = new Set(options.names);
    const components = withDependencies(named);
    const kept: string[] = [];
    const conflicts: string[] = [];
    const writes: string[] = [];

    for (const name of components) {
      const folder = posix.join(config.path, name);
      const exists = folderExists(tree, folder);

      if (!exists) {
        writes.push(name);
        continue;
      }

      // An existing dependency is always kept: only naming a component replaces it.
      if (!named.has(name) || options.existing === "skip") {
        kept.push(folder);
        continue;
      }

      if (options.existing === "error") {
        conflicts.push(folder);
        continue;
      }

      writes.push(name);
    }

    if (conflicts.length > 0) {
      throw new SchematicsException(
        `${conflicts.join(", ")} already exist. Re-run with --existing skip to keep them, or --existing overwrite to replace fold's files in them.`,
      );
    }

    for (const name of writes) {
      for (const file of componentFiles(name)) {
        const path = posix.join(config.path, name, file);
        const content = readFileSync(join(componentsDirectory, name, file), "utf8");

        writeFile(tree, path, content.replaceAll("fold__", config.prefix));
      }
    }

    if (kept.length > 0) {
      context.logger.warn(
        `Kept your existing ${kept.join(", ")}. Name a component with --existing overwrite to replace fold's files in it.`,
      );
    }
  };
}

/** The named components and every component they import through `../<name>`, sorted. */
function withDependencies(names: ReadonlySet<string>): string[] {
  const queue = [...names];
  const result = new Set<string>();

  while (queue.length > 0) {
    const name = queue.shift()!;

    if (result.has(name)) {
      continue;
    }

    result.add(name);

    for (const file of componentFiles(name)) {
      const source = readFileSync(join(componentsDirectory, name, file), "utf8");

      for (const match of source.matchAll(componentImport)) {
        queue.push(match[1]);
      }
    }
  }

  return [...result].sort();
}

function componentFiles(name: string): string[] {
  return readdirSync(join(componentsDirectory, name)).sort();
}

function folderExists(tree: Tree, folder: string): boolean {
  const directory = tree.getDir(folder);

  return directory.subfiles.length > 0 || directory.subdirs.length > 0;
}

function writeFile(tree: Tree, path: string, content: string): void {
  if (tree.exists(path)) {
    tree.overwrite(path, content);
    return;
  }

  tree.create(path, content);
}
