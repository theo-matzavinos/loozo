// Contract v2 (v1 + per-signature details, typeParams, grouped member overloads, generated-API deep links,
// typed slugs in the index). See contract-changes-v2.md.
//
// Content contract between the docs content step (tools/docs-content) and the docs app (docs/).
//
// The content step writes, into the output directory it is given:
//   model.generated.ts          a verbatim copy of this file (the app imports types from here)
//   index.generated.ts          exports `packageSlugs`, `packages` and `loadPackage`
//   <slug>.generated.ts         exports `content: PackageContent` for one package
//
// index.generated.ts shape:
//   export const packageSlugs = ["angular-launch", "angular-router"] as const;
//   export type PackageSlug = (typeof packageSlugs)[number];
//   export interface GeneratedPackageSummary extends PackageSummary { readonly slug: PackageSlug }
//   export const packages: readonly GeneratedPackageSummary[] = [...];
//   export function loadPackage(slug: PackageSlug): Promise<PackageContent>; // lazy import of <slug>.generated.ts
//
// All HTML is produced at build time from repository sources and is trusted.
// Code blocks are highlighted with Shiki dual themes (light + dark) using CSS variables
// (defaultColor: false), so the app switches themes with CSS only.
//
// Hrefs inside HTML:
//   - links to docs pages are relative to the site root WITHOUT a leading slash
//     (e.g. "angular-router/api/define-route"), so they resolve against <base href>;
//     they carry data-docs-link="" so the app can route them client-side;
//   - links to repository files are absolute GitHub URLs pinned to the commit
//     (https://github.com/theo-matzavinos/loozo/blob/<sha>/<path>);
//   - other absolute URLs are left as written.

/** Listing data for one package, small enough to load eagerly. */
export interface PackageSummary {
  /** npm package name, e.g. "@loozo/angular-router". */
  readonly name: string;
  /** URL segment, e.g. "angular-router". */
  readonly slug: string;
  readonly version: string;
  /** package.json description. */
  readonly description: string;
}

/** Everything the docs site shows for one package. */
export interface PackageContent extends PackageSummary {
  /** README content before the first H2, rendered (the H1 is excluded). */
  readonly overviewHtml: string;
  /** One page per README H2, in README order. */
  readonly guides: readonly GuidePage[];
  /** Public entry points with at least one symbol, in package.json "exports" order. */
  readonly entryPoints: readonly EntryPoint[];
  /**
   * Documented symbols from internal ("_"-prefixed) entry points that no public entry point exports.
   * Shown on `<slug>/generated-api`; each symbol is deep-linkable as `<slug>/generated-api#<symbol-slug>`.
   */
  readonly generatedApi: readonly ApiSymbol[];
}

export interface GuidePage {
  /** URL segment from the heading text, unique within the package. */
  readonly slug: string;
  /** Heading text, plain. */
  readonly title: string;
  /** Section body, rendered; the H2 itself is excluded; H3/H4 carry ids. */
  readonly html: string;
  /** H3/H4 headings for an on-page table of contents. */
  readonly headings: readonly GuideHeading[];
}

export interface GuideHeading {
  readonly id: string;
  readonly text: string;
  readonly level: 3 | 4;
}

export interface EntryPoint {
  /** Import specifier, e.g. "@loozo/angular-launch/server". */
  readonly importPath: string;
  readonly symbols: readonly ApiSymbol[];
}

export type ApiSymbolKind =
  | "function"
  | "constant"
  | "interface"
  | "type-alias"
  | "class"
  | "enum"
  | "directive"
  | "component"
  | "pipe";

export interface ApiSymbol {
  readonly name: string;
  /** URL segment, unique within the package (kebab-case of the name). */
  readonly slug: string;
  readonly kind: ApiSymbolKind;
  /** Import specifier of the entry point that exports it. */
  readonly importPath: string;
  /** First paragraph of the description, rendered; "" when undocumented. */
  readonly summaryHtml: string;
  /** Full description including @remarks, rendered; "" when undocumented. */
  readonly descriptionHtml: string;
  /** @typeParam entries in declaration order (undocumented type params included with descriptionHtml ""). */
  readonly typeParams: readonly ApiTypeParam[];
  /**
   * One per overload for functions; exactly one declaration signature (no params) for every other kind.
   */
  readonly signatures: readonly ApiSignature[];
  /** @example blocks, rendered. */
  readonly examplesHtml: readonly string[];
  /** @deprecated text, rendered; null when not deprecated. */
  readonly deprecatedHtml: string | null;
  /** Members of interfaces, classes, directives and components; [] otherwise. */
  readonly members: readonly ApiMember[];
  /** Angular metadata for directives/components; null otherwise. */
  readonly angular: AngularMetadata | null;
  /** GitHub URL of the declaration, pinned to the commit. */
  readonly sourceUrl: string;
}

export interface ApiSignature {
  /** Highlighted signature. */
  readonly html: string;
  /** Overload-specific description, rendered; "" when the overload has no own documentation. */
  readonly descriptionHtml: string;
  readonly params: readonly ApiParam[];
  /** @returns text, rendered; "" when absent. */
  readonly returnsHtml: string;
  /** @throws texts, rendered. */
  readonly throwsHtml: readonly string[];
}

export interface ApiTypeParam {
  readonly name: string;
  readonly descriptionHtml: string;
}

export interface ApiParam {
  readonly name: string;
  /** Type text from the type checker (may be expanded, e.g. `Size | undefined`). */
  readonly type: string;
  readonly optional: boolean;
  readonly descriptionHtml: string;
}

export interface ApiMember {
  /** Unique within its symbol: overloads of one method are grouped into one member. */
  readonly name: string;
  readonly kind: "property" | "method" | "getter" | "setter";
  /** One per overload for methods; exactly one for properties and accessors. */
  readonly signatures: readonly ApiSignature[];
  /** Member-level description, rendered. */
  readonly descriptionHtml: string;
  readonly readonly: boolean;
  readonly optional: boolean;
  /** Angular input public name when the member is an input; null otherwise. */
  readonly input: string | null;
  /** Angular output public name when the member is an output (model() has both); null otherwise. */
  readonly output: string | null;
}

export interface AngularMetadata {
  readonly selector: string;
  readonly exportAs: readonly string[];
}
