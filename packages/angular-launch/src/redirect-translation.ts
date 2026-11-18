import { InjectionToken, makeEnvironmentProviders, type EnvironmentProviders } from "@angular/core";

/**
 * Puts the listed static path segments of a canonical redirect target, ordinals of
 * {@link targetSegments}, in this build's language. Internal.
 */
export type TranslateRedirect = (to: `/${string}`, words: readonly number[]) => `/${string}`;

/**
 * The installed {@link TranslateRedirect}, which the generated client applies when it
 * recognizes a redirect frame with `words`. Internal.
 */
export const REDIRECT_TRANSLATOR = new InjectionToken<TranslateRedirect>(
  "Launch redirect translator",
);

/** Every canonical static word of an app and its text in this build, in the same order. */
export interface RedirectWords {
  readonly words: readonly string[];
  readonly translations: readonly string[];
}

// createUrl's encoding: component-encoded, with parentheses escaped too.
function encode(text: string): string {
  return encodeURIComponent(text).replaceAll("(", "%28").replaceAll(")", "%29");
}

// One path segment as createUrl encodes it, and an outlet group's label: the router's outlet
// name grammar, then ":". Sticky, so each match starts exactly at `lastIndex`.
const segmentText = /(?:[A-Za-z0-9\-_.!~*']|%[0-9A-Fa-f]{2})+/y;
const outletLabel = /[A-Za-z][A-Za-z0-9_-]*:/y;

// Reads `segment ("/" segment)*` from `at` into `spans`, stopping before an outlet group's
// "/(". Returns the offset after the last segment, or undefined when no segment starts there.
function readSegments(to: string, at: number, spans: [number, number][]): number | undefined {
  for (;;) {
    segmentText.lastIndex = at;

    if (!segmentText.test(to)) {
      return undefined;
    }

    const end = segmentText.lastIndex;

    spans.push([at, end]);

    if (to[end] !== "/" || to[end + 1] === "(") {
      return end;
    }

    at = end + 1;
  }
}

/**
 * The path segments of a redirect target, in order, as `[start, end)` offsets into `to`.
 *
 * @remarks
 * Internal. It recognizes only the paths `createUrl` writes: `/` or `/a/b` for a primary
 * destination, and `/(outlet:a/b)` or `/a/(outlet:b)` for one in a named outlet, the anchor's
 * segments before the group's; any `?` or `#` suffix follows. The outlet label is no segment.
 * Matrix parameters, several groups, nested outlets and anything else aren't recognized.
 *
 * @param to - A root-relative redirect target.
 * @returns The segment spans, or `undefined` for any other path.
 */
export function targetSegments(to: string): readonly (readonly [number, number])[] | undefined {
  // createUrl encodes "?" and "#" inside segments, so the first one ends the path.
  const cut = to.search(/[?#]/);
  const end = cut === -1 ? to.length : cut;
  const spans: [number, number][] = [];
  let at = 1;

  if (to[0] !== "/") {
    return undefined;
  }

  if (at < end && to[at] !== "(") {
    const after = readSegments(to, at, spans);

    if (after === undefined) {
      return undefined;
    }

    if (after === end) {
      return spans;
    }

    // Only "/(" ends the anchor early: the group follows.
    if (to[after] !== "/") {
      return undefined;
    }

    at = after + 1;
  }

  if (at === end) {
    return spans;
  }

  outletLabel.lastIndex = at + 1;

  if (to[at] !== "(" || !outletLabel.test(to)) {
    return undefined;
  }

  const close = readSegments(to, outletLabel.lastIndex, spans);

  if (close === undefined || to[close] !== ")" || close + 1 !== end) {
    return undefined;
  }

  return spans;
}

/**
 * Swaps the path segments at `words` in `to` for their words' translation in `table`.
 *
 * @remarks
 * Internal. `words` are ascending ordinals of {@link targetSegments}. Only those segments
 * change: parameter and catchall values, outlet labels, the search and the fragment stay byte
 * for byte, and a word missing from `table`, or one that doesn't decode, stays canonical.
 *
 * @throws TypeError when `to` isn't a path `createUrl` writes, which recognition already
 * refused.
 */
export function swap(
  table: ReadonlyMap<string, string>,
  to: `/${string}`,
  words: readonly number[],
): `/${string}` {
  const segments = targetSegments(to);

  if (segments === undefined) {
    throw new TypeError(`Not a createUrl path: ${to}`);
  }

  let result = "";
  let copied = 1;

  for (const at of words) {
    const [start, end] = segments[at];
    let canonical: string;

    try {
      canonical = decodeURIComponent(to.slice(start, end));
    } catch {
      continue;
    }

    const word = table.get(canonical);

    if (word !== undefined) {
      result += to.slice(copied, start) + encode(word);
      copied = end;
    }
  }

  return `/${result}${to.slice(copied)}`;
}

/**
 * Provides the {@link REDIRECT_TRANSLATOR} of one build's generated word table.
 *
 * @remarks
 * Internal: exported only from `@loozo/angular-launch/_redirects` for a translated app's
 * generated `redirects.generated.ts`. `table` runs once, the first time a client needs it, so
 * its `$localize` tags evaluate inside the localized application.
 *
 * @param table - Returns every canonical word and its translation in this build.
 * @returns The providers.
 */
export function redirectTranslation(table: () => RedirectWords): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: REDIRECT_TRANSLATOR,
      useFactory: (): TranslateRedirect => {
        let map: Map<string, string> | undefined;

        return (to, words) => {
          if (!map) {
            const { words: canonical, translations } = table();

            map = new Map(canonical.map((word, index) => [word, translations[index]]));
          }

          return swap(map, to, words);
        };
      },
    },
  ]);
}
