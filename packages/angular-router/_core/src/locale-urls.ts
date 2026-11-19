import { destinationRecord, type Destination, type UrlMetadata } from "./destination.js";
import type { Segment } from "./path.js";
import type { AnyRoute, SearchOf, UrlValues } from "./types.js";
import { serializeUrl } from "./url.js";

/** The value the router's builders define `loozoRouterLocales` as (src/builders/locale-table.ts). */
interface DefinedTable {
  readonly locales: readonly {
    readonly code: string;
    readonly baseHref: string;
    readonly words: readonly (readonly [string, string])[];
  }[];
}

interface Locale {
  readonly code: string;
  readonly baseHref: string;
  /** Authored word → this locale's text, where they differ. */
  readonly words: ReadonlyMap<string, string>;
}

declare const loozoRouterLocales: DefinedTable | undefined;

// Read once, at module evaluation. The router's builders replace the identifier with the table in
// a localized build; anywhere else (unit tests, Launch, an unlocalized build) it isn't defined.
// A side-effect-free expression, so a bundle that never calls localeUrls drops the table.
const defined = typeof loozoRouterLocales === "undefined" ? undefined : loozoRouterLocales;
let locales: readonly Locale[] | undefined;

function tableLocales(table: DefinedTable): readonly Locale[] {
  if (!locales) {
    const read: Locale[] = [];

    for (const { code, baseHref, words } of table.locales) {
      read.push({ code, baseHref, words: new Map(words) });
    }

    locales = read;
  }

  return locales;
}

/** One locale's URL for a page: a document URL under that locale's base href. */
export interface LocaleUrl {
  /** The locale's code, as configured in `angular.json` `i18n`. */
  readonly locale: string;
  /** The page's URL in that locale's build, its base href included: for a plain `href`. */
  readonly url: string;
}

function localeSegments(
  segments: readonly Segment[],
  words: ReadonlyMap<string, string>,
): readonly Segment[] {
  const result: Segment[] = [];

  for (const segment of segments) {
    if (segment.kind !== "static") {
      result.push(segment);

      continue;
    }

    const word = segment.canonical ?? segment.text;

    result.push({ kind: "static", text: words.get(word) ?? word });
  }

  return result;
}

/**
 * Synchronously serializes a destination's explicit values into its document URL in every
 * locale of a localized build: the same page in each locale, for a language switcher's plain
 * `href`s and `<link rel="alternate" hreflang>`.
 *
 * @remarks
 * Locales come in the table's order: the source locale first, then `angular.json`'s
 * `i18n.locales` in order, each with that locale's build base href, every configured
 * locale whatever `localize` selects. Each locale's static words are its translations,
 * from the catalogs the router's builder read; param, catchall, search and fragment
 * values are kept as given. Serialization, validation and errors are `createUrl`'s, so
 * a named-outlet destination gives its exact branch URL under each base.
 *
 * Returns an empty list where no build injected a locale table: an unlocalized build, a
 * multi-locale `ng serve`, `ng test`, a build that doesn't run the router's builders
 * (Launch apps included) and plain Node. The values are still checked.
 *
 * Unlike `createUrl`, whose URL is this build's router-root-relative URL for `RouterLink`
 * and navigation, these URLs include each locale's base href: never pass one to
 * `RouterLink` or `navigateByUrl`, which compose it under this build's base.
 *
 * @param destination - A genuine destination imported from a `destination.generated.ts`.
 * @param values - Explicit destination-typed params, search and optional fragment, as
 * `createUrl` takes them.
 * @returns A frozen list of `{ locale, url }`, one per configured locale.
 * @throws TypeError for anything `createUrl` rejects, or a value that isn't a genuine
 * destination. Application stringifier failures propagate unchanged.
 *
 * @example
 * ```ts
 * import { destination as product } from "./routes/products/$productId/destination.generated.js";
 *
 * localeUrls(product, { params: { productId: 42 } });
 * // [{ locale: "en", url: "/en/products/42" }, { locale: "de", url: "/de/produkte/42" }]
 * ```
 */
export function localeUrls<
  Target extends AnyRoute,
  SearchKeys extends keyof SearchOf<NoInfer<Target>> = never,
>(
  destination: Destination<Target>,
  values: UrlValues<NoInfer<Target>, SearchKeys>,
): readonly LocaleUrl[];

export function localeUrls(destination: unknown, values: unknown): readonly LocaleUrl[] {
  const record = destinationRecord(destination);

  if (!defined) {
    // Checked anyway, so a call that fails in a localized build fails everywhere.
    serializeUrl(record.url, record.id, values);

    return Object.freeze([]);
  }

  const { url } = record;
  const result: LocaleUrl[] = [];

  for (const { code, baseHref, words } of tableLocales(defined)) {
    let branch: UrlMetadata["branch"];

    if (url.branch) {
      branch = { outlet: url.branch.outlet, anchor: localeSegments(url.branch.anchor, words) };
    }

    const metadata: Omit<UrlMetadata, "parent"> = {
      ...url,
      segments: localeSegments(url.segments, words),
      branch,
    };

    const path = serializeUrl(metadata, record.id, values).slice(1);
    let base = baseHref;

    if (!base.endsWith("/")) {
      base = `${base}/`;
    }

    result.push(Object.freeze({ locale: code, url: `${base}${path}` }));
  }

  return Object.freeze(result);
}
