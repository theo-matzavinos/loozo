import ts from "typescript";
import { readdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { contains } from "./files.js";

// TypeScript exports its native config matcher at runtime, but not in its .d.ts.
// Use the installed compiler's matcher, including its extension/exclusion rules.
const { matchFiles } = ts as typeof ts & {
  matchFiles(
    this: void,
    path: string,
    extensions: readonly string[] | undefined,
    excludes: readonly string[] | undefined,
    includes: readonly string[] | undefined,
    caseSensitive: boolean,
    currentDirectory: string,
    depth: number | undefined,
    entries: (directory: string) => { files: string[]; directories: string[] },
    realpath: (path: string) => string,
  ): string[];
};

export function overlayHost(options: ts.CompilerOptions, authored: ReadonlyMap<string, string>) {
  const host = ts.createCompilerHost(options, true);
  const read = host.readFile.bind(host);
  const exists = host.fileExists.bind(host);
  const directoryExists = host.directoryExists!.bind(host);

  host.readFile = (file) => {
    const raw = authored.get(resolve(file));

    if (raw === undefined) {
      return read(file);
    }

    // Match ts.sys.readFile's UTF-8 BOM normalization, including for shebangs.
    // The authored map remains raw publication text, not compiler text.
    if (raw.startsWith("\uFEFF")) {
      return raw.slice(1);
    }

    return raw;
  };
  host.fileExists = (file) => authored.has(resolve(file)) || exists(file);
  host.directoryExists = (directory) => {
    for (const file of authored.keys()) {
      if (contains(resolve(directory), file)) {
        return true;
      }
    }

    return directoryExists(directory);
  };
  host.getSourceFile = (file, language) => {
    const bytes = host.readFile(file);

    if (bytes === undefined) {
      return undefined;
    }

    return ts.createSourceFile(file, bytes, language, true);
  };

  return host;
}

export function overlayDirectory(
  authored: ReadonlyMap<string, string>,
  resolveDirectory: (directory: string) => string,
): ts.ParseConfigHost["readDirectory"] {
  if (authored.size === 0) {
    return ts.sys.readDirectory.bind(ts.sys);
  }

  return (root, extensions, excludes, includes, depth) =>
    matchFiles(
      root,
      extensions,
      excludes,
      includes,
      ts.sys.useCaseSensitiveFileNames,
      ts.sys.getCurrentDirectory(),
      depth,
      (directory) => {
        const files = new Set<string>();
        const directories = new Set<string>();
        // Lookup only: matchFiles still returns its original path spellings,
        // which discovery canonicalizes/audits before admitting any source.
        const canonicalDirectory = resolveDirectory(directory);

        if (ts.sys.directoryExists(directory)) {
          for (const entry of readdirSync(directory, { withFileTypes: true })) {
            if (entry.isDirectory()) {
              directories.add(entry.name);
            } else if (entry.isFile()) {
              files.add(entry.name);
            } else if (entry.isSymbolicLink()) {
              const path = resolve(directory, entry.name);

              if (ts.sys.directoryExists(path)) {
                directories.add(entry.name);
              } else {
                files.add(entry.name);
              }
            }
          }
        }

        for (const file of authored.keys()) {
          if (dirname(file) === canonicalDirectory) {
            files.add(basename(file));
          }
        }

        return { files: [...files].sort(), directories: [...directories].sort() };
      },
      (path) => {
        if (ts.sys.fileExists(path) || ts.sys.directoryExists(path)) {
          return ts.sys.realpath!(path);
        }

        return resolve(path);
      },
    );
}
