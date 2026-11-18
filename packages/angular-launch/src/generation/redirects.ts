import { launchMarkers, segmentMessage, type Sources } from "@loozo/angular-router/_generation";

/**
 * The text of `redirects.generated.ts`: every distinct canonical static word of every route,
 * with the router's own message for it, so each localized build swaps a redirect's words into
 * its language exactly as its destination copies translate them.
 *
 * @remarks
 * A declaration's local static segments cover every effective one, since each effective static
 * is some declaration's local static. Words are sorted by code unit, so the bytes don't depend
 * on the machine's locale. The tags sit inside the table function: nothing evaluates them
 * until a client in a localized application needs the table, and the module imports no
 * destination, so lazy children stay lazy.
 */
export function emitRedirects(sources: Sources): string {
  const words = new Set<string>();

  for (const declaration of sources.declarations) {
    for (const segment of declaration.segments) {
      if (segment.kind === "static") {
        words.add(segment.text);
      }
    }
  }

  const sorted = [...words].sort((a, b) => {
    if (a < b) {
      return -1;
    }

    return Number(a > b);
  });

  return [
    launchMarkers["redirects.generated.ts"],
    `import { redirectTranslation } from '@loozo/angular-launch/_redirects';`,
    "",
    "// Every static route segment, canonical, with the router's own message for it.",
    "export const provideRedirectTranslation = () =>",
    "  redirectTranslation(() => ({",
    `    words: [${sorted.map((word) => JSON.stringify(word)).join(", ")}],`,
    "    translations: [",
    ...sorted.map((word) => `      ${segmentMessage(word)},`),
    "    ],",
    "  }));",
    "",
  ].join("\n");
}
