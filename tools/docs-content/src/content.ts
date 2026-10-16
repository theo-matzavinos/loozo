import { existsSync } from "node:fs";
import { join } from "node:path";
import { isDocEntryWithSourceInfo, type DocEntryWithSourceInfo } from "@angular/compiler-cli";
import { isDocumented, symbolSlug, toApiSymbol, type DeclarationSource } from "./api.ts";
import { extractPackage, type ExtractedEntryPoint } from "./extract.ts";
import type { Demo } from "./demos.ts";
import { createHighlight, type PackageContext, type ReadmeAnchors } from "./markdown.ts";
import type { ApiSymbol, EntryPoint, PackageContent } from "./model.ts";
import { readWorkspacePackages, sourcePaths, type WorkspacePackage } from "./packages.ts";
import {
  parseEntryReadme,
  parsePackageReadme,
  renderEntryReadme,
  renderReadme,
  type ParsedReadme,
} from "./readme.ts";

export interface ContentOptions {
  /** Repository root containing `packages/*`. */
  readonly root: string;
  /** Commit that GitHub source links are pinned to. */
  readonly commit: string;
}

/** An entry-point README and the guide slug it is published under. */
interface EntryReadme {
  readonly slug: string;
  readonly readme: ParsedReadme;
}

/** Everything the content step writes. */
export interface BuiltContent {
  /** Ordered by slug. */
  readonly contents: readonly PackageContent[];
  /** Every running snippet of every package, ordered by id. */
  readonly demos: readonly Demo[];
}

interface Located {
  readonly entry: DocEntryWithSourceInfo;
  readonly importPath: string;
  readonly source: DeclarationSource;
}

/** Builds the docs content of every package under `<root>/packages`. */
export async function buildContent({ root, commit }: ContentOptions): Promise<BuiltContent> {
  const packages = readWorkspacePackages(root);
  const paths = sourcePaths(packages);
  const highlight = await createHighlight();
  const readmes = new Map<string, ParsedReadme>();
  // Package slug → entry point subpath → its README.
  const entryReadmes = new Map<string, Map<string, EntryReadme>>();
  const anchors = new Map<string, ReadmeAnchors>();
  const demos = new Map<string, Demo>();

  packages.sort((left, right) => compare(left.slug, right.slug));

  for (const workspacePackage of packages) {
    const readme = parsePackageReadme(workspacePackage.dir, workspacePackage.slug);
    const entries = parseEntryReadmes(workspacePackage, readme);

    readmes.set(workspacePackage.slug, readme);
    entryReadmes.set(workspacePackage.slug, entries);
    anchors.set(readme.file, readme.anchors);

    for (const entry of entries.values()) {
      anchors.set(entry.readme.file, entry.readme.anchors);
    }
  }

  const result: PackageContent[] = [];

  for (const workspacePackage of packages) {
    const entries = extractPackage(root, workspacePackage, paths);
    const { publicEntries, generatedEntries } = partition(workspacePackage, entries);
    const symbols = new Map<string, string>();
    const slugs = new Map<string, string>();

    for (const located of [...publicEntries.flat(), ...generatedEntries]) {
      const name = located.entry.name;
      const slug = symbolSlug(name);
      const existing = slugs.get(slug);

      if (existing !== undefined) {
        throw new Error(
          `${workspacePackage.name}: API slug "${slug}" is used by both ${existing} and ` +
            `${name} (${located.importPath})`,
        );
      }

      slugs.set(slug, `${name} (${located.importPath})`);
    }

    for (const located of publicEntries.flat()) {
      symbols.set(
        located.entry.name,
        `${workspacePackage.slug}/api/${symbolSlug(located.entry.name)}`,
      );
    }

    for (const located of generatedEntries) {
      symbols.set(
        located.entry.name,
        `${workspacePackage.slug}/generated-api#${symbolSlug(located.entry.name)}`,
      );
    }

    const context: PackageContext = {
      root,
      commit,
      repository: workspacePackage.repository,
      dir: workspacePackage.dir,
      slug: workspacePackage.slug,
      highlight,
      readmes: anchors,
      symbols,
      demos,
    };

    const entryPoints: EntryPoint[] = [];
    let position = 0;

    for (const entryPoint of workspacePackage.entryPoints) {
      if (entryPoint.internal) {
        continue;
      }

      const apiSymbols: ApiSymbol[] = [];

      for (const located of publicEntries[position]) {
        apiSymbols.push(toApiSymbol(context, located.entry, located.importPath, located.source));
      }

      position++;

      const entryReadme = entryReadmes.get(workspacePackage.slug)!.get(entryPoint.subpath);

      // An intentionally empty entry point, such as a root that only secondary entry points
      // populate, has nothing to list.
      if (apiSymbols.length === 0) {
        if (entryReadme !== undefined) {
          throw new Error(`${entryReadme.readme.file}: its entry point exports no symbols`);
        }

        continue;
      }

      let guide = null;

      if (entryReadme !== undefined) {
        guide = renderEntryReadme(context, entryReadme.readme, entryReadme.slug);
      }

      entryPoints.push({ importPath: entryPoint.importPath, symbols: apiSymbols, guide });
    }

    const generatedApi: ApiSymbol[] = [];

    for (const located of generatedEntries) {
      generatedApi.push(toApiSymbol(context, located.entry, located.importPath, located.source));
    }

    const { overviewHtml, guides } = renderReadme(context, readmes.get(workspacePackage.slug)!);

    result.push({
      name: workspacePackage.name,
      slug: workspacePackage.slug,
      version: workspacePackage.version,
      description: workspacePackage.description,
      overviewHtml,
      guides,
      entryPoints,
      generatedApi,
    });
  }

  const sortedDemos: Demo[] = [];

  for (const id of [...demos.keys()].sort(compare)) {
    sortedDemos.push(demos.get(id)!);
  }

  return { contents: result, demos: sortedDemos };
}

/**
 * Parses the READMEs in the directories of the package's public secondary entry points. Each is a
 * guide page named after the entry point's last subpath segment.
 */
function parseEntryReadmes(
  workspacePackage: WorkspacePackage,
  packageReadme: ParsedReadme,
): Map<string, EntryReadme> {
  const guidePrefix = `${workspacePackage.slug}/guide/`;
  const slugs = new Map<string, string>();
  const result = new Map<string, EntryReadme>();

  for (const href of packageReadme.anchors.anchors.values()) {
    if (href.startsWith(guidePrefix) && !href.includes("#")) {
      slugs.set(href.slice(guidePrefix.length), packageReadme.file);
    }
  }

  for (const entryPoint of workspacePackage.entryPoints) {
    const file = join(workspacePackage.dir, entryPoint.subpath, "README.md");

    if (entryPoint.internal || entryPoint.subpath === "." || !existsSync(file)) {
      continue;
    }

    const slug = entryPoint.subpath.slice(entryPoint.subpath.lastIndexOf("/") + 1);
    const existing = slugs.get(slug);

    if (existing !== undefined) {
      throw new Error(`${file}: guide slug "${slug}" is also used by ${existing}`);
    }

    slugs.set(slug, file);
    result.set(entryPoint.subpath, { slug, readme: parseEntryReadme(file, guidePrefix + slug) });
  }

  return result;
}

/**
 * Splits extracted entries into public entry points (in "exports" order) and the documented
 * symbols of internal entry points that no public entry point exports.
 */
function partition(
  workspacePackage: WorkspacePackage,
  extracted: ReadonlyMap<string, ExtractedEntryPoint>,
): { publicEntries: Located[][]; generatedEntries: Located[] } {
  const publicEntries: Located[][] = [];
  const publicNames = new Set<string>();
  const generatedEntries: Located[] = [];

  for (const entryPoint of workspacePackage.entryPoints) {
    if (!entryPoint.internal) {
      const located = sortedEntries(extracted.get(entryPoint.subpath)!, entryPoint.importPath);

      for (const { entry } of located) {
        publicNames.add(entry.name);
      }

      publicEntries.push(located);
    }
  }

  for (const entryPoint of workspacePackage.entryPoints) {
    if (!entryPoint.internal) {
      continue;
    }

    for (const located of sortedEntries(
      extracted.get(entryPoint.subpath)!,
      entryPoint.importPath,
    )) {
      if (isDocumented(located.entry) && !publicNames.has(located.entry.name)) {
        publicNames.add(located.entry.name);
        generatedEntries.push(located);
      }
    }
  }

  return { publicEntries, generatedEntries };
}

function sortedEntries(extracted: ExtractedEntryPoint, importPath: string): Located[] {
  const located: Located[] = [];

  for (const entry of extracted.entries) {
    if (!isDocEntryWithSourceInfo(entry)) {
      throw new Error(`${importPath}: extracted entry ${entry.name} has no source information`);
    }

    const declarations = extracted.declarations.get(entry.name);

    if (declarations === undefined) {
      throw new Error(`${importPath}: extracted entry ${entry.name} is not an export`);
    }

    located.push({ entry, importPath, source: { checker: extracted.checker, declarations } });
  }

  located.sort((left, right) => compareNames(left.entry.name, right.entry.name));

  return located;
}

/** Case-insensitive name order, with exact order as the tie-breaker so output is stable. */
function compareNames(left: string, right: string): number {
  const folded = compare(left.toLowerCase(), right.toLowerCase());

  if (folded !== 0) {
    return folded;
  }

  return compare(left, right);
}

function compare(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}
