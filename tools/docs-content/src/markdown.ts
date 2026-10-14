import { existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import MarkdownIt, { type Token } from "markdown-it";
import { createHighlighter } from "shiki";
import { attribute, findSnippetEmbed, readSnippet, SourceError } from "./snippets.ts";

export const markdown = new MarkdownIt({ html: true });

const themes = { light: "github-light", dark: "github-dark" };
const languages = [
  "typescript",
  "javascript",
  "json",
  "jsonc",
  "html",
  "css",
  "shellscript",
  "yaml",
  "diff",
];

export type Highlight = (code: string, language: string) => string;

/** Creates a Shiki highlighter with dual light/dark themes exposed as CSS variables. */
export async function createHighlight(): Promise<Highlight> {
  const highlighter = await createHighlighter({ themes: Object.values(themes), langs: languages });

  return (code, language) => {
    return highlighter.codeToHtml(code, { lang: language, themes, defaultColor: false });
  };
}

/** Docs-site locations of the headings of one package README. */
export interface ReadmeAnchors {
  readonly slug: string;
  /** Heading id → docs href. */
  readonly anchors: ReadonlyMap<string, string>;
}

/** What markdown of one package needs to resolve its links and code. */
export interface PackageContext {
  readonly root: string;
  readonly commit: string;
  readonly repository: string;
  readonly dir: string;
  readonly slug: string;
  readonly highlight: Highlight;
  /** Absolute README path → anchors, for every documented package. */
  readonly readmes: ReadonlyMap<string, ReadmeAnchors>;
  /** Public and generated-API symbol name → docs href. */
  readonly symbols: ReadonlyMap<string, string>;
}

/** Where a piece of markdown comes from. */
export interface MarkdownOrigin {
  readonly file: string;
  /** 1-based line of the markdown's first line (or of its declaration, for TSDoc). */
  readonly line: number;
  /** TSDoc text supports `{@link Name}`; README text supports same-file `#anchor` links. */
  readonly tsdoc: boolean;
}

/** Renders TSDoc or other standalone markdown text of a package. */
export function renderMarkdown(context: PackageContext, text: string, origin: MarkdownOrigin) {
  if (text.trim() === "") {
    return "";
  }

  const tokens = markdown.parse(text, {});

  transformTokens(context, tokens, origin);

  return markdown.renderer.render(tokens, markdown.options, {});
}

/**
 * Rewrites parsed tokens in place: highlights code, embeds snippets, resolves links and links
 * inline code that names a public symbol.
 */
export function transformTokens(context: PackageContext, tokens: Token[], origin: MarkdownOrigin) {
  const baseDir = dirname(origin.file);

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const line = blockLine(token, origin);

    if (token.type === "fence" || token.type === "code_block") {
      let language = token.info.trim().split(/\s+/)[0];

      if (language === "") {
        language = "text";
      }

      try {
        token.content = context.highlight(token.content.replace(/\n$/, ""), language);
      } catch (error) {
        throw new SourceError(origin.file, line, `cannot highlight code: ${String(error)}`);
      }

      token.type = "html_block";
      continue;
    }

    if (token.type === "paragraph_open") {
      const embed = findSnippetEmbed(tokens, index, context.dir, baseDir, origin.file, line);

      if (embed !== undefined) {
        const snippet = readSnippet(embed, origin.file, line);
        let sourceUrl = repositoryUrl(context, snippet.file, "blob");

        if (snippet.lines !== undefined) {
          sourceUrl += `#L${snippet.lines[0]}-L${snippet.lines[1]}`;
        }

        token.type = "html_block";
        token.content =
          `<figure class="docs-snippet"><figcaption><code>${escapeHtml(snippet.caption)}</code> ` +
          `<a href="${escapeHtml(sourceUrl)}">Source</a></figcaption>` +
          `${context.highlight(snippet.code, snippet.language)}</figure>\n`;
        tokens.splice(index + 1, 2);
        continue;
      }
    }

    if (token.type === "html_block") {
      rejectRelativeHtmlLinks(token.content, origin, line);
    }

    if (token.type === "inline") {
      transformInline(context, token, origin, line, tokens[index - 1]?.type === "heading_open");
    }
  }
}

function transformInline(
  context: PackageContext,
  inline: Token,
  origin: MarkdownOrigin,
  blockStart: number,
  heading: boolean,
) {
  const baseDir = dirname(origin.file);
  const children = inline.children ?? [];
  let line = blockStart;
  let insideLink = false;
  // A `{@link Name | label}` whose label spans several tokens, e.g. a label with inline code.
  let openTsdocLink: OpenTsdocLink | undefined = undefined;

  for (let index = 0; index < children.length; index++) {
    const child = children[index];

    if (child.type === "softbreak" || child.type === "hardbreak") {
      if (!origin.tsdoc) {
        line++;
      }
    } else if (child.type === "html_inline") {
      rejectRelativeHtmlLinks(child.content, origin, line);
    } else if (child.type === "link_open") {
      insideLink = true;

      const resolved = resolveHref(context, attribute(child, "href") ?? "", baseDir, origin, line);

      child.attrSet("href", resolved.href);

      if (resolved.docs) {
        child.attrSet("data-docs-link", "");
      }
    } else if (child.type === "link_close") {
      insideLink = false;
    } else if (child.type === "code_inline" && openTsdocLink !== undefined) {
      // Label code is not linked again; inside an unresolved link's <code> it is plain text.
      if (openTsdocLink.closing === "</code>") {
        child.type = "text";
      }
    } else if (child.type === "code_inline" && !insideLink && !heading) {
      const href = context.symbols.get(child.content);

      if (href !== undefined) {
        child.type = "html_inline";
        child.content = docsLink(href, `<code>${escapeHtml(child.content)}</code>`);
      }
    } else if (
      child.type === "text" &&
      origin.tsdoc &&
      (openTsdocLink !== undefined || child.content.includes("{@link"))
    ) {
      let text = child.content;
      let html = "";

      if (openTsdocLink !== undefined) {
        const end = text.indexOf("}");

        if (end === -1) {
          continue;
        }

        html = escapeHtml(text.slice(0, end).trimEnd()) + openTsdocLink.closing;
        text = text.slice(end + 1);
        openTsdocLink = undefined;
      }

      const rendered = renderTsdocLinks(context, text, closesLater(children, index));

      child.type = "html_inline";
      child.content = html + rendered.html;
      openTsdocLink = rendered.open;
    }
  }
}

interface OpenTsdocLink {
  /** `</a>`, or `</code>` for an unresolvable target. */
  readonly closing: string;
}

/** Whether a text token after `index` can close a `{@link … | label}` opened in `index`. */
function closesLater(children: readonly Token[], index: number): boolean {
  for (let position = index + 1; position < children.length; position++) {
    if (children[position].type === "text" && children[position].content.includes("}")) {
      return true;
    }
  }

  return false;
}

/**
 * Replaces `{@link Name}`, `{@link Name | text}` and `{@link https://… | text}` in plain text.
 *
 * @param canOpen - Whether a trailing `{@link Name | ` may leave its link open for a label that
 * continues in later tokens.
 */
function renderTsdocLinks(
  context: PackageContext,
  text: string,
  canOpen: boolean,
): { html: string; open: OpenTsdocLink | undefined } {
  const pattern = /\{@link\s+([^\s|}]+)\s*(?:\|\s*([^}]*?)\s*)?\}/g;
  let html = "";
  let last = 0;

  for (const match of text.matchAll(pattern)) {
    const target = match[1];
    const label = match[2];
    const opening = tsdocLinkOpening(context, target);

    html += escapeHtml(text.slice(last, match.index));
    last = match.index + match[0].length;

    let labelHtml = escapeHtml(label ?? target);

    // A bare symbol link reads as code, like the inline code it resolves the same way as.
    if (label === undefined && context.symbols.has(target)) {
      labelHtml = `<code>${escapeHtml(target)}</code>`;
    }

    html += opening.html + labelHtml + opening.closing;
  }

  const rest = text.slice(last);
  const open = /\{@link\s+([^\s|}]+)\s*\|\s*([^}]*)$/.exec(rest);

  if (!canOpen || open === null) {
    return { html: html + escapeHtml(rest), open: undefined };
  }

  const opening = tsdocLinkOpening(context, open[1]);

  html += escapeHtml(rest.slice(0, open.index)) + opening.html + escapeHtml(open[2]);

  return { html, open: { closing: opening.closing } };
}

function tsdocLinkOpening(context: PackageContext, target: string) {
  const href = context.symbols.get(target);

  if (/^https?:\/\//.test(target)) {
    return { html: `<a href="${escapeHtml(target)}">`, closing: "</a>" };
  }

  if (href === undefined) {
    return { html: "<code>", closing: "</code>" };
  }

  return { html: `<a href="${escapeHtml(href)}" data-docs-link="">`, closing: "</a>" };
}

/**
 * Raw HTML is not rewritten, so a relative link in it would resolve against the docs site
 * instead of the repository. Absolute URLs and same-page fragments are fine.
 */
function rejectRelativeHtmlLinks(html: string, origin: MarkdownOrigin, line: number) {
  const pattern = /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

  for (const match of html.matchAll(pattern)) {
    const href = match[1] ?? match[2] ?? match[3];
    const absolute = /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//");

    if (!absolute && !href.startsWith("#")) {
      throw new SourceError(
        origin.file,
        line,
        `relative links in raw HTML are not supported, use a Markdown link: ${href}`,
      );
    }
  }
}

function resolveHref(
  context: PackageContext,
  href: string,
  baseDir: string,
  origin: MarkdownOrigin,
  line: number,
): { href: string; docs: boolean } {
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//")) {
    return { href, docs: false };
  }

  const hashIndex = href.indexOf("#");
  let path = href;
  let hash = "";

  if (hashIndex !== -1) {
    path = href.slice(0, hashIndex);
    hash = href.slice(hashIndex + 1);
  }

  let target = resolve(baseDir, decodeURIComponent(path));

  if (path === "") {
    if (origin.tsdoc) {
      throw new SourceError(origin.file, line, `same-page anchor links are not supported: ${href}`);
    }

    target = origin.file;
  } else if (path.startsWith("/")) {
    target = join(context.root, decodeURIComponent(path));
  }

  const readme = context.readmes.get(target);

  if (readme !== undefined) {
    if (hash === "") {
      return { href: readme.slug, docs: true };
    }

    const anchor = readme.anchors.get(decodeURIComponent(hash));

    if (anchor === undefined) {
      throw new SourceError(origin.file, line, `no heading "#${hash}" in ${target}`);
    }

    return { href: anchor, docs: true };
  }

  if (relative(context.root, target).startsWith("..") || !existsSync(target)) {
    throw new SourceError(origin.file, line, `link target not found in the repository: ${href}`);
  }

  let kind = "blob";

  if (statSync(target).isDirectory()) {
    kind = "tree";
  }

  let url = repositoryUrl(context, target, kind);

  if (hash !== "") {
    url += `#${hash}`;
  }

  return { href: url, docs: false };
}

function blockLine(token: Token, origin: MarkdownOrigin): number {
  if (origin.tsdoc || token.map === null) {
    return origin.line;
  }

  return origin.line + token.map[0];
}

export function repositoryUrl(context: PackageContext, file: string, kind: string): string {
  const segments: string[] = [];

  for (const segment of relative(context.root, file).split(sep)) {
    segments.push(encodeURIComponent(segment));
  }

  return `${context.repository}/${kind}/${context.commit}/${segments.join("/")}`;
}

function docsLink(href: string, html: string): string {
  return `<a href="${escapeHtml(href)}" data-docs-link="">${html}</a>`;
}

export function escapeHtml(text: string): string {
  return markdown.utils.escapeHtml(text);
}
