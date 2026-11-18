// Installs a source-text `$localize` tag in the unlocalized server host, so the destination
// copies a translated app's server.generated.ts reaches evaluate to canonical URLs. Internal:
// exported only as `@loozo/angular-launch/_source-text`, which a translated app's generated
// server.generated.ts imports first. Side effects only.
//
// Angular never runs polyfills in the SSR host entry, and inlining replaces
// `@angular/localize/init` with a `{ locale }` object in the bundles that do run them. Importing
// that init module here would print Angular's "Direct import" warning and, in each localized
// server application that also reaches server.generated.ts, replace the `.locale` Angular sets.
// So this tag mirrors `ɵ$localize` from `@angular/localize` 22.2 without importing it: it applies
// a `translate` hook when one was attached, strips a leading `:meaning|description@@id:` block
// from each part (honoring `\:` escapes, as Angular's `findEndOfBlock` does) and joins the parts
// with their expressions. It touches only `globalThis.$localize`, never a bare `$localize`
// identifier, so Angular's inliner has nothing to rewrite here.

type Translate = (
  parts: TemplateStringsArray,
  expressions: readonly unknown[],
) => [TemplateStringsArray, readonly unknown[]];

interface SourceTag {
  (parts: TemplateStringsArray, ...expressions: unknown[]): string;
  locale?: string;
  translate?: Translate;
}

const host = globalThis as { $localize?: unknown };

// Where a part's leading metadata block ends: the index of its closing ":".
function endOfBlock(cooked: string, raw: string): number {
  for (let at = 1, rawAt = 1; at < cooked.length; at++, rawAt++) {
    if (raw[rawAt] === "\\") {
      rawAt++;
    } else if (cooked[at] === ":") {
      return at;
    }
  }

  throw new Error(`Unterminated $localize metadata block in "${raw}".`);
}

function stripBlock(cooked: string, raw: string): string {
  if (raw.charAt(0) !== ":") {
    return cooked;
  }

  return cooked.substring(endOfBlock(cooked, raw) + 1);
}

// An existing tag, such as Angular's own from an earlier `@angular/localize/init`, is kept.
if (typeof host.$localize !== "function") {
  const existing = host.$localize as { locale?: unknown } | undefined;
  const tag: SourceTag = (parts, ...expressions) => {
    let messageParts = parts;
    let values: readonly unknown[] = expressions;

    if (tag.translate) {
      [messageParts, values] = tag.translate(messageParts, values);
    }

    let message = stripBlock(messageParts[0], messageParts.raw[0]);

    for (let index = 1; index < messageParts.length; index++) {
      // `+`, as Angular's tag joins them: its conversion differs from String() for some objects.
      message +=
        (values[index - 1] as string) + stripBlock(messageParts[index], messageParts.raw[index]);
    }

    return message;
  };

  if (typeof existing === "object" && existing !== null && typeof existing.locale === "string") {
    tag.locale = existing.locale;
  }

  host.$localize = tag;
}

export {};
