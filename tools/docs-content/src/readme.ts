import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type { Token } from "markdown-it";
import type { GuideBlock, GuideHeading, GuidePage } from "./model.ts";
import {
  demoOf,
  markdown,
  transformTokens,
  type PackageContext,
  type ReadmeAnchors,
} from "./markdown.ts";
import { repositoryUrl } from "./packages.ts";
import { attribute, findSnippetEmbed, readSnippet, SourceError } from "./snippets.ts";

/** A README parsed once, with heading ids assigned GitHub-style across the whole file. */
export interface ParsedReadme {
  readonly file: string;
  readonly tokens: Token[];
  readonly anchors: ReadmeAnchors;
}

/** Parses `<packageDir>/README.md`: the package overview, and a guide page per H2. */
export function parsePackageReadme(packageDir: string, slug: string): ParsedReadme {
  const file = join(packageDir, "README.md");
  const tokens = parseWithHeadingIds(file);
  const anchors = new Map<string, string>();
  let guide: string | undefined = undefined;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];

    if (token.type !== "heading_open") {
      continue;
    }

    const id = attribute(token, "id")!;

    if (token.tag === "h1") {
      anchors.set(id, slug);
    } else if (token.tag === "h2") {
      if (id === "") {
        throw new SourceError(file, token.map![0] + 1, "a guide heading needs text");
      }

      guide = `${slug}/guide/${id}`;
      anchors.set(id, guide);
    } else if (guide === undefined) {
      anchors.set(id, `${slug}#${id}`);
    } else {
      anchors.set(id, `${guide}#${id}`);
    }
  }

  return { file, tokens, anchors: { href: slug, anchors } };
}

/**
 * Parses an entry-point README: one guide page at `href`, titled by the H1 it starts with.
 *
 * @throws SourceError when the README doesn't start with its only H1.
 */
export function parseEntryReadme(file: string, href: string): ParsedReadme {
  const tokens = parseWithHeadingIds(file);
  const anchors = new Map<string, string>();

  if (tokens[0]?.type !== "heading_open" || tokens[0].tag !== "h1") {
    throw new SourceError(file, 1, "an entry-point README starts with an H1 title");
  }

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];

    if (token.type !== "heading_open") {
      continue;
    }

    if (token.tag === "h1" && index !== 0) {
      throw new SourceError(file, token.map![0] + 1, "an entry-point README has one H1");
    }

    const id = attribute(token, "id")!;

    if (index === 0) {
      anchors.set(id, href);
    } else {
      anchors.set(id, `${href}#${id}`);
    }
  }

  return { file, tokens, anchors: { href, anchors } };
}

function parseWithHeadingIds(file: string): Token[] {
  const tokens = markdown.parse(readFileSync(file, "utf8"), {});
  const seen = new Map<string, number>();

  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].type === "heading_open") {
      tokens[index].attrSet("id", uniqueSlug(seen, headingText(tokens[index + 1])));
    }
  }

  return tokens;
}

/** Splits a parsed README into the overview (before the first H2, H1 excluded) and guide pages. */
export function renderReadme(
  context: PackageContext,
  readme: ParsedReadme,
): { overviewHtml: string; guides: GuidePage[] } {
  const tokens = readme.tokens;

  transformTokens(context, tokens, { file: readme.file, line: 1, tsdoc: false });

  const overview: Token[] = [];
  const guides: GuidePage[] = [];
  let current: { slug: string; title: string; tokens: Token[]; headings: GuideHeading[] } | null =
    null;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];

    if (token.type === "heading_open" && (token.tag === "h1" || token.tag === "h2")) {
      if (current !== null) {
        guides.push(renderGuide(current));
      }

      current = null;

      if (token.tag === "h2") {
        current = {
          slug: attribute(token, "id")!,
          title: headingText(tokens[index + 1]),
          tokens: [],
          headings: [],
        };
      }

      // Skip the heading's inline and closing tokens.
      index += 2;
      continue;
    }

    if (current === null) {
      if (demoOf(token) !== undefined) {
        throw new SourceError(
          readme.file,
          token.map![0] + 1,
          "running snippets belong in guide pages",
        );
      }

      overview.push(token);
      continue;
    }

    if (token.type === "heading_open" && (token.tag === "h3" || token.tag === "h4")) {
      current.headings.push({
        id: attribute(token, "id")!,
        text: headingText(tokens[index + 1]),
        level: Number(token.tag.slice(1)) as 3 | 4,
      });
    }

    current.tokens.push(token);
  }

  if (current !== null) {
    guides.push(renderGuide(current));
  }

  return { overviewHtml: render(overview), guides };
}

/** Renders an entry-point README as one guide page; its H1 is the title. */
export function renderEntryReadme(
  context: PackageContext,
  readme: ParsedReadme,
  slug: string,
): GuidePage {
  const tokens = readme.tokens;

  transformTokens(context, tokens, { file: readme.file, line: 1, tsdoc: false });

  const headings: GuideHeading[] = [];

  // The title's open, inline and close tokens come first.
  for (let index = 3; index < tokens.length; index++) {
    const token = tokens[index];

    if (token.type === "heading_open" && token.tag !== "h5" && token.tag !== "h6") {
      headings.push({
        id: attribute(token, "id")!,
        text: headingText(tokens[index + 1]),
        level: Number(token.tag.slice(1)) as 2 | 3 | 4,
      });
    }
  }

  return {
    slug,
    title: headingText(tokens[1]),
    blocks: renderBlocks(tokens.slice(3)),
    headings,
  };
}

function renderGuide(guide: {
  slug: string;
  title: string;
  tokens: Token[];
  headings: GuideHeading[];
}): GuidePage {
  return {
    slug: guide.slug,
    title: guide.title,
    blocks: renderBlocks(guide.tokens),
    headings: guide.headings,
  };
}

/** Renders transformed tokens, splitting the HTML around each running snippet. */
function renderBlocks(tokens: Token[]): GuideBlock[] {
  const blocks: GuideBlock[] = [];
  let pending: Token[] = [];

  for (const token of tokens) {
    const demo = demoOf(token);

    if (demo === undefined) {
      pending.push(token);
      continue;
    }

    if (pending.length > 0) {
      blocks.push({ kind: "html", html: render(pending) });
    }

    blocks.push({ ...demo, sourceHtml: token.content });
    pending = [];
  }

  if (pending.length > 0) {
    blocks.push({ kind: "html", html: render(pending) });
  }

  return blocks;
}

function render(tokens: Token[]): string {
  return markdown.renderer.render(tokens, markdown.options, {});
}

/**
 * Renders the README as published to npm: each snippet embed becomes its caption followed by a
 * fenced code block of the (region-extracted, dedented) snippet, and every other relative link
 * becomes a GitHub URL pinned to the release tag `<package directory>@<version>`. Everything else
 * is unchanged.
 */
export function renderPublishedReadme(packageDir: string): string {
  const file = join(packageDir, "README.md");
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  const tokens = markdown.parse(source, {});
  const repository = readPinnedRepository(packageDir);
  const replacements: { start: number; end: number; text: string }[] = [];
  // Table cells' inline tokens have no lines of their own; their row's are the closest.
  let blockLines: [number, number] | null = null;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const map = token.map;

    if (token.type === "inline") {
      pinLinks(lines, token, map ?? blockLines!, repository, file);
      continue;
    }

    if (map !== null) {
      blockLines = map;
    }

    if (token.type !== "paragraph_open" || map === null) {
      continue;
    }

    const line = map[0] + 1;
    const embed = findSnippetEmbed(tokens, index, packageDir, packageDir, file, line);

    if (embed === undefined) {
      continue;
    }

    const snippet = readSnippet(embed, file, line);
    let fence = "```";

    while (snippet.code.includes(fence)) {
      fence += "`";
    }

    replacements.push({
      start: map[0],
      end: map[1],
      text: `\`${snippet.caption}\`\n\n${fence}${snippet.language}\n${snippet.code}\n${fence}`,
    });
    // The embed's inline and closing tokens are replaced with it.
    index += 2;
  }

  for (let position = replacements.length - 1; position >= 0; position--) {
    const replacement = replacements[position];

    lines.splice(replacement.start, replacement.end - replacement.start, replacement.text);
  }

  return lines.join("\n");
}

/** Where a published README's relative links point: the package's release tag on GitHub. */
interface PinnedRepository {
  /** Repository root on disk. */
  readonly root: string;
  /** GitHub repository URL without a trailing slash. */
  readonly url: string;
  readonly tag: string;
}

function readPinnedRepository(packageDir: string): PinnedRepository {
  const manifestPath = join(packageDir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const directory: unknown = manifest.repository?.directory;
  const mismatch = `${manifestPath}: "repository.directory" must be this package's directory`;

  if (typeof directory !== "string") {
    throw new Error(mismatch);
  }

  const suffix = `${sep}${directory.split("/").join(sep)}`;

  if (!packageDir.endsWith(suffix)) {
    throw new Error(mismatch);
  }

  return {
    root: packageDir.slice(0, -suffix.length),
    url: repositoryUrl(manifestPath, manifest.repository),
    tag: `${basename(packageDir)}@${manifest.version}`,
  };
}

/** Rewrites, in the source lines `[start, end)` of `inline`, its relative Markdown link targets. */
function pinLinks(
  lines: string[],
  inline: Token,
  [start, end]: [number, number],
  repository: PinnedRepository,
  file: string,
) {
  const relativeHrefs = new Set<string>();

  for (const child of inline.children ?? []) {
    const href = attribute(child, "href");

    if (child.type !== "link_open" || href === undefined) {
      continue;
    }

    if (!/^[a-z][a-z\d+.-]*:/i.test(href) && !href.startsWith("//") && !href.startsWith("#")) {
      relativeHrefs.add(href);
    }
  }

  if (relativeHrefs.size === 0) {
    return;
  }

  // Code spans are matched first so that link-like text inside them is left alone.
  for (let line = start; line < end; line++) {
    lines[line] = lines[line].replace(
      /(`+)[^]*?\1|\]\(([^)\s]+)/g,
      (match, codeSpan: string | undefined, target: string | undefined) => {
        if (codeSpan !== undefined || !relativeHrefs.has(markdown.normalizeLink(target!))) {
          return match;
        }

        return `](${pinnedUrl(repository, file, line + 1, target!)}`;
      },
    );
  }
}

function pinnedUrl(repository: PinnedRepository, file: string, line: number, href: string) {
  const hashIndex = href.indexOf("#");
  let path = href;
  let hash = "";

  if (hashIndex !== -1) {
    path = href.slice(0, hashIndex);
    hash = href.slice(hashIndex);
  }

  let target = resolve(dirname(file), decodeURIComponent(path));

  if (path.startsWith("/")) {
    target = join(repository.root, decodeURIComponent(path));
  }

  if (relative(repository.root, target).startsWith("..") || !existsSync(target)) {
    throw new SourceError(file, line, `link target not found in the repository: ${href}`);
  }

  let kind = "blob";

  if (statSync(target).isDirectory()) {
    kind = "tree";
  }

  const segments: string[] = [];

  for (const segment of relative(repository.root, target).split(sep)) {
    segments.push(encodeURIComponent(segment));
  }

  return `${repository.url}/${kind}/${repository.tag}/${segments.join("/")}${hash}`;
}

function headingText(inline: Token): string {
  let text = "";

  for (const child of inline.children ?? []) {
    if (child.type === "text" || child.type === "code_inline") {
      text += child.content;
    } else if (child.type === "softbreak" || child.type === "hardbreak") {
      text += " ";
    }
  }

  return text.trim();
}

/** GitHub's heading anchor algorithm, so README `#anchor` links resolve the same way. */
function uniqueSlug(seen: Map<string, number>, text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");
  let slug = base;
  let count = seen.get(base) ?? 0;

  while (seen.has(slug)) {
    count++;
    slug = `${base}-${count}`;
  }

  seen.set(base, count);
  seen.set(slug, 0);

  return slug;
}
