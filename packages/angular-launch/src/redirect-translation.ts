import { InjectionToken, makeEnvironmentProviders, type EnvironmentProviders } from "@angular/core";

/**
 * Puts the listed static word positions of a canonical redirect target in this build's
 * language. Internal.
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

/**
 * Swaps the words at `words` in `to`'s path for their translation in `table`.
 *
 * @remarks
 * Internal. Only the listed path positions change: parameter and catchall values, the search
 * and the fragment stay byte for byte, and a word missing from `table` stays canonical.
 */
export function swap(
  table: ReadonlyMap<string, string>,
  to: `/${string}`,
  words: readonly number[],
): `/${string}` {
  // createUrl encodes "?" and "#" inside segments, so the first one ends the path.
  const cut = to.search(/[?#]/);
  const path = cut === -1 ? to : to.slice(0, cut);
  const suffix = cut === -1 ? "" : to.slice(cut);
  const parts = path.slice(1).split("/");

  for (const at of words) {
    let canonical: string;

    try {
      canonical = decodeURIComponent(parts[at]);
    } catch {
      continue;
    }

    const word = table.get(canonical);

    if (word !== undefined) {
      parts[at] = encode(word);
    }
  }

  return `/${parts.join("/")}${suffix}`;
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
