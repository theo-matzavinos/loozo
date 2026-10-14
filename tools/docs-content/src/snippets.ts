import { existsSync, readFileSync, realpathSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import type { Token } from "markdown-it";

const snippetLanguages: Record<string, string> = {
  ".ts": "ts",
  ".js": "js",
  ".mjs": "js",
  ".json": "json",
  ".html": "html",
};

const reservedViews = new Set(["both", "output", "playground"]);
const markerLine = /^\s*(?:\/\/|<!--)\s*#(?:end)?region\b/;

/** A paragraph that consists of a single link to a file in the package's `snippets/` directory. */
export interface SnippetEmbed {
  readonly file: string;
  /** Package-relative POSIX path, shown as the caption. */
  readonly caption: string;
  readonly region: string | undefined;
}

export interface Snippet extends SnippetEmbed {
  readonly language: string;
  readonly code: string;
  /** 1-based inclusive line range of the region in the file; undefined for the whole file. */
  readonly lines: readonly [number, number] | undefined;
}

/** markdown-it types attribute values as `string | number`; links and headings only hold strings. */
export function attribute(token: Token, name: string): string | undefined {
  const value = token.attrGet(name);

  if (value === null) {
    return undefined;
  }

  return String(value);
}

export class SourceError extends Error {
  constructor(file: string, line: number, message: string) {
    super(`${file}:${line}: ${message}`);
  }
}

/**
 * Recognizes a snippet embed at `tokens[index]` (a `paragraph_open`).
 *
 * @param baseDir - Directory that relative links in this markdown resolve against.
 * @param line - 1-based line of the paragraph, for error context.
 * @returns The embed, or undefined for an ordinary paragraph.
 * @throws SourceError for a nested embed, a reserved or unknown view, an unsupported snippet file
 * type, or a paragraph-only link to a code file outside the package's `snippets/` directory.
 */
export function findSnippetEmbed(
  tokens: readonly Token[],
  index: number,
  packageDir: string,
  baseDir: string,
  file: string,
  line: number,
): SnippetEmbed | undefined {
  const link = paragraphLink(tokens, index);

  if (link === undefined) {
    return undefined;
  }

  const href = attribute(link, "href") ?? "";

  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("#")) {
    return undefined;
  }

  const hashIndex = href.indexOf("#");
  let path = href;
  let region: string | undefined = undefined;

  if (hashIndex !== -1) {
    path = href.slice(0, hashIndex);
    region = decodeURIComponent(href.slice(hashIndex + 1));
  }

  const target = resolve(baseDir, decodeURIComponent(path));
  const snippetsDir = resolve(packageDir, "snippets") + sep;
  const extension = extname(target);

  if (!target.startsWith(snippetsDir)) {
    if (Object.hasOwn(snippetLanguages, extension)) {
      throw new SourceError(
        file,
        line,
        `a paragraph-only link to code must point into this package's snippets/ directory: ${href}`,
      );
    }

    return undefined;
  }

  if (tokens[index].level !== 0) {
    throw new SourceError(file, line, `snippet embeds must be top-level paragraphs: ${href}`);
  }

  if (!Object.hasOwn(snippetLanguages, extension)) {
    throw new SourceError(file, line, `unsupported snippet file type "${extension}": ${href}`);
  }

  const view = attribute(link, "title");

  if (view !== undefined && view !== "source") {
    if (reservedViews.has(view)) {
      throw new SourceError(file, line, `snippet view "${view}" is not supported yet: ${href}`);
    }

    throw new SourceError(file, line, `unknown snippet view "${view}": ${href}`);
  }

  // A symlink inside snippets/ must not publish a file from elsewhere.
  if (
    existsSync(target) &&
    !realpathSync(target).startsWith(`${realpathSync(packageDir)}${sep}snippets${sep}`)
  ) {
    throw new SourceError(
      file,
      line,
      `snippet resolves outside this package's snippets/ directory: ${href}`,
    );
  }

  const caption = relative(packageDir, target).split(sep).join("/");

  return { file: target, caption, region };
}

function paragraphLink(tokens: readonly Token[], index: number): Token | undefined {
  if (tokens[index].type !== "paragraph_open" || tokens[index + 1]?.type !== "inline") {
    return undefined;
  }

  const meaningful: Token[] = [];

  for (const child of tokens[index + 1].children ?? []) {
    const blank = child.type === "text" && child.content.trim() === "";

    if (!blank && child.type !== "softbreak") {
      meaningful.push(child);
    }
  }

  const first = meaningful[0];
  const last = meaningful[meaningful.length - 1];

  if (first?.type !== "link_open" || last?.type !== "link_close") {
    return undefined;
  }

  for (let position = 1; position < meaningful.length - 1; position++) {
    if (meaningful[position].type === "link_open" || meaningful[position].type === "link_close") {
      return undefined;
    }
  }

  return first;
}

/**
 * Reads an embedded snippet, selects its region and dedents it.
 *
 * @throws SourceError when the file or region is missing.
 */
export function readSnippet(embed: SnippetEmbed, file: string, line: number): Snippet {
  let text: string;

  try {
    text = readFileSync(embed.file, "utf8");
  } catch {
    throw new SourceError(file, line, `snippet file not found: ${embed.caption}`);
  }

  const allLines = text.split(/\r?\n/);
  let start = 0;
  let end = allLines.length;
  let lines: [number, number] | undefined = undefined;

  if (embed.region !== undefined) {
    const range = findRegion(allLines, embed.region);

    if (range === undefined) {
      throw new SourceError(file, line, `region "${embed.region}" not found in ${embed.caption}`);
    }

    if (range === "nested") {
      throw new SourceError(
        file,
        line,
        `region "${embed.region}" is opened again before it ends in ${embed.caption}`,
      );
    }

    start = range[0] + 1;
    end = range[1];
    lines = [start + 1, end];
  }

  const kept: string[] = [];

  for (let position = start; position < end; position++) {
    if (!markerLine.test(allLines[position])) {
      kept.push(allLines[position]);
    }
  }

  return {
    ...embed,
    language: snippetLanguages[extname(embed.file)],
    code: dedent(kept),
    lines,
  };
}

/**
 * @returns The 0-based indices of the region's start and end marker lines, or "nested" when the
 * region is opened again before it ends.
 */
function findRegion(
  lines: readonly string[],
  name: string,
): [number, number] | "nested" | undefined {
  let start: number | undefined = undefined;

  for (let position = 0; position < lines.length; position++) {
    const marker = /^\s*(?:\/\/|<!--)\s*#(region|endregion)\s+(\S+?)\s*(?:-->)?\s*$/.exec(
      lines[position],
    );

    if (marker === null || marker[2] !== name) {
      continue;
    }

    if (marker[1] === "region" && start !== undefined) {
      return "nested";
    }

    if (marker[1] === "region") {
      start = position;
    } else if (marker[1] === "endregion" && start !== undefined) {
      return [start, position];
    }
  }

  return undefined;
}

function dedent(lines: string[]): string {
  while (lines.length > 0 && lines[0].trim() === "") {
    lines.shift();
  }

  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  // Remove the longest whitespace prefix shared by all non-blank lines, so mixed tabs and spaces
  // keep their relative indentation.
  let prefix: string | undefined = undefined;

  for (const line of lines) {
    if (line.trim() === "") {
      continue;
    }

    const indent = /^\s*/.exec(line)![0];

    if (prefix === undefined) {
      prefix = indent;
      continue;
    }

    let length = 0;

    while (length < prefix.length && length < indent.length && prefix[length] === indent[length]) {
      length++;
    }

    prefix = prefix.slice(0, length);
  }

  const result: string[] = [];

  for (const line of lines) {
    if (prefix !== undefined && line.startsWith(prefix)) {
      result.push(line.slice(prefix.length));
    } else {
      // Only blank lines lack the prefix; their remaining whitespace is dropped.
      result.push(line.trimStart());
    }
  }

  return result.join("\n");
}
