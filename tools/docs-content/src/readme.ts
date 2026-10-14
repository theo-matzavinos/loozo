import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Token } from "markdown-it";
import type { GuideHeading, GuidePage } from "./model.ts";
import { markdown, transformTokens, type PackageContext, type ReadmeAnchors } from "./markdown.ts";
import { attribute, findSnippetEmbed, readSnippet } from "./snippets.ts";

/** A README parsed once, with heading ids assigned GitHub-style across the whole file. */
export interface ParsedReadme {
  readonly file: string;
  readonly tokens: Token[];
  readonly anchors: ReadmeAnchors;
}

export function parseReadme(packageDir: string, slug: string): ParsedReadme {
  const file = join(packageDir, "README.md");
  const tokens = markdown.parse(readFileSync(file, "utf8"), {});
  const anchors = new Map<string, string>();
  const seen = new Map<string, number>();
  let guide: string | undefined = undefined;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];

    if (token.type !== "heading_open") {
      continue;
    }

    const id = uniqueSlug(seen, headingText(tokens[index + 1]));

    token.attrSet("id", id);

    if (token.tag === "h1") {
      anchors.set(id, slug);
    } else if (token.tag === "h2") {
      if (id === "") {
        throw new Error(`${file}:${token.map![0] + 1}: a guide heading needs text`);
      }

      guide = `${slug}/guide/${id}`;
      anchors.set(id, guide);
    } else if (guide === undefined) {
      anchors.set(id, `${slug}#${id}`);
    } else {
      anchors.set(id, `${guide}#${id}`);
    }
  }

  return { file, tokens, anchors: { slug, anchors } };
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

function renderGuide(guide: {
  slug: string;
  title: string;
  tokens: Token[];
  headings: GuideHeading[];
}): GuidePage {
  return {
    slug: guide.slug,
    title: guide.title,
    html: render(guide.tokens),
    headings: guide.headings,
  };
}

function render(tokens: Token[]): string {
  return markdown.renderer.render(tokens, markdown.options, {});
}

/**
 * Renders the README as published to npm: each snippet embed becomes its caption followed by a
 * fenced code block of the (region-extracted, dedented) snippet. Everything else is unchanged.
 */
export function renderPublishedReadme(packageDir: string): string {
  const file = join(packageDir, "README.md");
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  const tokens = markdown.parse(source, {});
  const replacements: { start: number; end: number; text: string }[] = [];

  for (let index = 0; index < tokens.length; index++) {
    const map = tokens[index].map;

    if (tokens[index].type !== "paragraph_open" || map === null) {
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
  }

  for (let position = replacements.length - 1; position >= 0; position--) {
    const replacement = replacements[position];

    lines.splice(replacement.start, replacement.end - replacement.start, replacement.text);
  }

  return lines.join("\n");
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
