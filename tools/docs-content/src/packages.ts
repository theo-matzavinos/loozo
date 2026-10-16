import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

/** One workspace package under `<root>/packages/*`, with its entry points mapped to source. */
export interface WorkspacePackage {
  readonly dir: string;
  readonly name: string;
  readonly slug: string;
  readonly version: string;
  readonly description: string;
  /** GitHub repository URL without a trailing slash, from package.json "repository". */
  readonly repository: string;
  readonly entryPoints: readonly PackageEntryPoint[];
}

export interface PackageEntryPoint {
  /** package.json "exports" key, e.g. "./_core". */
  readonly subpath: string;
  readonly importPath: string;
  /** Whether the last subpath segment starts with "_". */
  readonly internal: boolean;
  readonly sourceFile: string;
  /** The package tsconfig whose program contains `sourceFile`. */
  readonly tsconfig: string;
}

interface ParsedTsconfig {
  readonly path: string;
  readonly fileNames: ReadonlySet<string>;
  readonly outDir: string | undefined;
  readonly rootDir: string | undefined;
}

/** Reads the published packages; `"private": true` packages have no public docs. */
export function readWorkspacePackages(root: string): WorkspacePackage[] {
  const packagesDir = join(root, "packages");
  const result: WorkspacePackage[] = [];

  for (const name of readdirSync(packagesDir).sort()) {
    const dir = join(packagesDir, name);

    if (!existsSync(join(dir, "package.json"))) {
      continue;
    }

    const workspacePackage = readWorkspacePackage(dir);

    if (workspacePackage !== undefined) {
      result.push(workspacePackage);
    }
  }

  return result;
}

function readWorkspacePackage(dir: string): WorkspacePackage | undefined {
  const manifestPath = join(dir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  if (manifest.private === true) {
    return undefined;
  }

  const name: string = manifest.name;
  const tsconfigs = readTsconfigs(dir);
  const entryPoints: PackageEntryPoint[] = [];

  if (typeof manifest.exports !== "object" || manifest.exports === null) {
    throw new Error(`${manifestPath}: expected an "exports" object`);
  }

  for (const [subpath, target] of Object.entries(manifest.exports)) {
    if (subpath === "./package.json") {
      continue;
    }

    const importPath = join(name, subpath);
    const segments = subpath.split("/");
    const internal = segments[segments.length - 1].startsWith("_");
    const located = locateSource(dir, subpath, target, tsconfigs);

    entryPoints.push({ subpath, importPath, internal, ...located });
  }

  return {
    dir,
    name,
    slug: name.slice(name.lastIndexOf("/") + 1),
    version: manifest.version,
    description: manifest.description ?? "",
    repository: repositoryUrl(manifestPath, manifest.repository),
    entryPoints,
  };
}

/** The GitHub URL of a package.json "repository", without a trailing slash. */
export function repositoryUrl(manifestPath: string, repository: unknown): string {
  let url: unknown = repository;

  if (typeof repository === "object" && repository !== null && "url" in repository) {
    url = repository.url;
  }

  const match = typeof url === "string" && /github\.com[/:]([^/]+\/[^/.]+)/.exec(url);

  if (!match) {
    throw new Error(`${manifestPath}: expected a GitHub "repository" URL`);
  }

  return `https://github.com/${match[1]}`;
}

/** Reads `tsconfig.json` first, then any other `tsconfig*.json` of the package, in name order. */
function readTsconfigs(dir: string): ParsedTsconfig[] {
  const names: string[] = [];

  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith("tsconfig") && name.endsWith(".json") && name !== "tsconfig.json") {
      names.push(name);
    }
  }

  if (existsSync(join(dir, "tsconfig.json"))) {
    names.unshift("tsconfig.json");
  }

  const result: ParsedTsconfig[] = [];

  for (const name of names) {
    const path = join(dir, name);
    const parsed = ts.getParsedCommandLineOfConfigFile(path, undefined, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic(diagnostic) {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
      },
    });

    if (parsed === undefined) {
      throw new Error(`${path}: could not be read`);
    }

    result.push({
      path,
      fileNames: new Set(parsed.fileNames.map((fileName) => resolve(fileName))),
      outDir: parsed.options.outDir,
      rootDir: parsed.options.rootDir,
    });
  }

  return result;
}

function locateSource(
  dir: string,
  subpath: string,
  target: unknown,
  tsconfigs: readonly ParsedTsconfig[],
): { sourceFile: string; tsconfig: string } {
  const ngPackage = join(dir, subpath, "ng-package.json");

  if (existsSync(join(dir, "ng-package.json")) && existsSync(ngPackage)) {
    const entryFile = JSON.parse(readFileSync(ngPackage, "utf8")).lib?.entryFile;

    if (typeof entryFile !== "string") {
      throw new Error(`${ngPackage}: expected lib.entryFile for "${subpath}"`);
    }

    const sourceFile = resolve(dirname(ngPackage), entryFile);

    for (const tsconfig of tsconfigs) {
      if (tsconfig.fileNames.has(sourceFile)) {
        return { sourceFile, tsconfig: tsconfig.path };
      }
    }

    throw new Error(`${dir}: no tsconfig includes ${relative(dir, sourceFile)} for "${subpath}"`);
  }

  let types: unknown = undefined;

  if (typeof target === "object" && target !== null && "types" in target) {
    types = target.types;
  }

  if (typeof types !== "string") {
    throw new Error(`${dir}/package.json: "${subpath}" has no "types" condition to map to source`);
  }

  const typesPath = resolve(dir, types);

  for (const tsconfig of tsconfigs) {
    if (tsconfig.outDir === undefined || tsconfig.rootDir === undefined) {
      continue;
    }

    const emitted = relative(tsconfig.outDir, typesPath);

    if (emitted.startsWith("..")) {
      continue;
    }

    const sourceFile = resolve(tsconfig.rootDir, emitted.replace(/\.d\.([cm]?)ts$/, ".$1ts"));

    if (tsconfig.fileNames.has(sourceFile)) {
      return { sourceFile, tsconfig: tsconfig.path };
    }
  }

  throw new Error(
    `${dir}/package.json: cannot map "${subpath}" (${types}) back to a source file through ` +
      `the outDir/rootDir of ${tsconfigs.map((tsconfig) => basename(tsconfig.path)).join(", ")}`,
  );
}

/** tsconfig `paths` that resolve every workspace entry point to its source entry file. */
export function sourcePaths(packages: readonly WorkspacePackage[]): Record<string, string[]> {
  const paths: Record<string, string[]> = {};

  for (const workspacePackage of packages) {
    for (const entryPoint of workspacePackage.entryPoints) {
      paths[entryPoint.importPath] = [entryPoint.sourceFile];
    }
  }

  return paths;
}
