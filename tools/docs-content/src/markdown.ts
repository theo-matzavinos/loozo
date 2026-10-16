import { existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import MarkdownIt, { type Token } from "markdown-it";
import { createHighlighter, type ThemedToken } from "shiki";
import { findDemo, type Demo } from "./demos.ts";
import { attribute, findSnippetEmbed, readSnippet, SourceError } from "./snippets.ts";

export const markdown = new MarkdownIt({ html: true });

// A wide table scrolls inside its own box instead of widening the page. The box is a focusable
// region so keyboard users can scroll it in every browser, named after its nearest heading and its
// column headers so several tables on one page stay distinguishable.
markdown.renderer.rules.table_open = (tokens, index, options, env, renderer) => {
  let heading = "";

  for (let position = index - 1; position >= 0; position--) {
    if (tokens[position].type === "heading_open") {
      heading = `${plainText(tokens[position + 1])}: `;
      break;
    }
  }

  const headers: string[] = [];

  for (let position = index + 1; position < tokens.length; position++) {
    if (tokens[position].type === "thead_close") {
      break;
    }

    if (tokens[position].type === "inline" && tokens[position - 1].type === "th_open") {
      headers.push(plainText(tokens[position]));
    }
  }

  const label = escapeHtml(`${heading}${headers.join(", ")} table`);

  return (
    `<div class="table-scroll" role="region" aria-label="${label}" tabindex="0">` +
    renderer.renderToken(tokens, index, options)
  );
};
markdown.renderer.rules.table_close = (tokens, index, options, env, renderer) => {
  return `${renderer.renderToken(tokens, index, options)}</div>\n`;
};

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

/**
 * Highlights code. `hidden` is text the grammar reads as if it were inserted into the first line,
 * without it appearing in the output.
 */
export type Highlight = (code: string, language: string, hidden?: Hidden) => string;

/** Text inserted into the first line, at `column`, for highlighting only. */
export interface Hidden {
  readonly column: number;
  readonly text: string;
}

/** Creates a Shiki highlighter with dual light/dark themes exposed as CSS variables. */
export async function createHighlight(): Promise<Highlight> {
  const highlighter = await createHighlighter({ themes: Object.values(themes), langs: languages });

  return (code, language, hidden) => {
    if (hidden === undefined) {
      return highlighter.codeToHtml(code, { lang: language, themes, defaultColor: false });
    }

    const { column, text } = hidden;
    const end = column + text.length;

    return highlighter.codeToHtml(code.slice(0, column) + text + code.slice(column), {
      lang: language,
      themes,
      defaultColor: false,
      transformers: [
        {
          tokens(lines) {
            const first: ThemedToken[] = [];
            let start = 0;

            for (const token of lines[0]) {
              const from = start;
              const content =
                token.content.slice(0, Math.max(0, column - from)) +
                token.content.slice(Math.max(0, end - from));

              start += token.content.length;

              if (content !== "") {
                first.push({ ...token, content });
              }
            }

            lines[0] = first;
          },
        },
      ],
    });
  };
}

/** Docs-site locations of one README and its headings. */
export interface ReadmeAnchors {
  /** Docs href of the README as a whole. */
  readonly href: string;
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
  /** Absolute README path → anchors, for every package and entry-point README. */
  readonly readmes: ReadonlyMap<string, ReadmeAnchors>;
  /** Public and generated-API symbol name → docs href. */
  readonly symbols: ReadonlyMap<string, string>;
  /** Running snippets by id; `transformTokens` adds every one it embeds. */
  readonly demos: Map<string, Demo>;
}

/** Where a piece of markdown comes from. */
export interface MarkdownOrigin {
  readonly file: string;
  /** 1-based line of the markdown's first line (or of its declaration, for TSDoc). */
  readonly line: number;
  /** TSDoc text supports `{@link Name}`; README text supports same-file `#anchor` links. */
  readonly tsdoc: boolean;
}

/** The demo id `transformTokens` put on a running snippet's token; undefined for other tokens. */
export function demoOf(token: Token): string | undefined {
  const meta: unknown = token.meta;

  if (
    typeof meta === "object" &&
    meta !== null &&
    "demo" in meta &&
    typeof meta.demo === "string"
  ) {
    return meta.demo;
  }

  return undefined;
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
 * inline code that names a public symbol. A running snippet becomes its source figure with the
 * demo id in `token.meta.demo`, for the guide page renderer to split on.
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

        if (embed.view === "both") {
          if (origin.tsdoc) {
            throw new SourceError(origin.file, line, "running snippets belong in guide pages");
          }

          const demo = findDemo(context.slug, embed, origin.file, line);

          context.demos.set(demo.id, demo);
          token.meta = { demo: demo.id };
        }

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
      return { href: readme.href, docs: true };
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

/** The visible text of an inline token, without markup. */
function plainText(inline: Token): string {
  let text = "";

  for (const child of inline.children ?? []) {
    if (child.type === "text" || child.type === "code_inline") {
      text += child.content;
    }
  }

  return text.trim();
}

export function escapeHtml(text: string): string {
  return markdown.utils.escapeHtml(text);
}
