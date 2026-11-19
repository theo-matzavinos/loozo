// The builders' locale table: its bases equal Angular's own for every i18n shape, its words, its
// define and its warnings. Parity runs against @angular/build's private code, which shipped code
// may not import (SPEC §12): a changed Angular normalization fails here on the next bump.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  changedTableWarning,
  localeTable,
  localeTableWarnings,
  withLocaleTable,
} from "../node/src/builders/locale-table.js";

const require = createRequire(import.meta.url);
const angular = dirname(require.resolve("@angular/build/package.json"));
const { createI18nOptions } = require("@angular/build/private");
// Not in the package exports: loaded by its file path.
const { getLocaleBaseHref } = require(join(angular, "src/builders/application/options.js"));

const configurations = [
  { name: "default subPath, no baseHref", i18n: { sourceLocale: "en", locales: { de: "de.xlf" } } },
  {
    name: "baseHref and a subPath",
    baseHref: "/app/",
    i18n: { sourceLocale: "en", locales: { de: { translation: "de.xlf", subPath: "deutsch" } } },
  },
  {
    name: "source locale at the root",
    i18n: { sourceLocale: { code: "en", subPath: "" }, locales: { de: "de.xlf" } },
  },
  {
    name: "a locale baseHref under the build's",
    baseHref: "/app/",
    i18n: { sourceLocale: "en", locales: { de: { translation: "de.xlf", baseHref: "/x/" } } },
  },
  {
    name: "an absolute build baseHref",
    baseHref: "https://cdn.example/app/",
    i18n: { sourceLocale: "en", locales: { de: "de.xlf" } },
  },
  {
    name: "an absolute locale baseHref",
    i18n: {
      sourceLocale: "en",
      locales: { de: { translation: "de.xlf", baseHref: "https://example.de/" } },
    },
  },
  {
    name: "a relative build baseHref",
    baseHref: "app/",
    i18n: { sourceLocale: "en", locales: { de: "de.xlf" } },
  },
  {
    name: "an empty locale baseHref",
    baseHref: "/app/",
    i18n: { sourceLocale: "en", locales: { de: { translation: "de.xlf", baseHref: "" } } },
  },
  {
    name: "an empty locale baseHref without a build baseHref",
    i18n: { sourceLocale: "en", locales: { de: { translation: "de.xlf", baseHref: "" } } },
  },
  {
    name: "a source locale baseHref",
    i18n: { sourceLocale: { code: "en", baseHref: "/root/" }, locales: { de: "de.xlf" } },
  },
  {
    name: "a build baseHref without a trailing slash",
    baseHref: "/app",
    i18n: { sourceLocale: "en", locales: { de: "de.xlf" } },
  },
  {
    name: "string, list and object translations, in order",
    i18n: {
      sourceLocale: { code: "en-GB" },
      locales: {
        fr: ["a.fr.json", "b.fr.json"],
        de: "de.xlf",
        "pt-BR": { translation: ["pt.xlf"], subPath: "pt" },
      },
    },
  },
  { name: "no i18n: Angular's en-US", i18n: undefined },
];

for (const { name, i18n, baseHref } of configurations) {
  for (const localize of [true, ["de"]]) {
    test(`bases equal Angular's: ${name}, localize ${JSON.stringify(localize)}`, () => {
      const metadata = {};

      if (i18n !== undefined) {
        metadata.i18n = i18n;
      }

      let inline = localize;

      // Angular rejects a selected locale that isn't configured.
      if (Array.isArray(localize) && !Object.keys(i18n?.locales ?? {}).includes("de")) {
        inline = true;
      }

      const options = createI18nOptions(metadata, inline, undefined, false);
      const expected = [];

      for (const code of Object.keys(options.locales)) {
        let base = getLocaleBaseHref(baseHref, options, code);

        // Angular keeps the build's own base where it gives none.
        if (base === undefined) {
          base = baseHref || "/";
        }

        expected.push({ code, baseHref: base });
      }

      const table = localeTable({ i18n, baseHref, localize: inline, words: undefined });
      const actual = [];

      for (const locale of table.locales) {
        actual.push({ code: locale.code, baseHref: locale.baseHref });
        assert.deepEqual(locale.words, []);
      }

      assert.deepEqual(actual, expected);
    });
  }
}

test("the parity cases give the bases the plan names", () => {
  function bases(baseHref, i18n) {
    const result = {};

    for (const locale of localeTable({ i18n, baseHref, localize: true, words: undefined })
      .locales) {
      result[locale.code] = locale.baseHref;
    }

    return result;
  }

  const [first, subPath, root, localeBase, cdn, domain, relative, empty] = configurations;

  assert.deepEqual(bases(first.baseHref, first.i18n), { en: "/en/", de: "/de/" });
  assert.deepEqual(bases(subPath.baseHref, subPath.i18n), { en: "/app/en/", de: "/app/deutsch/" });
  assert.deepEqual(bases(root.baseHref, root.i18n), { en: "/", de: "/de/" });
  assert.deepEqual(bases(localeBase.baseHref, localeBase.i18n), { en: "/app/en/", de: "/app/x/" });
  assert.deepEqual(bases(cdn.baseHref, cdn.i18n), {
    en: "https://cdn.example/app/en/",
    de: "https://cdn.example/app/de/",
  });
  assert.deepEqual(bases(domain.baseHref, domain.i18n), { en: "/en/", de: "https://example.de/" });
  assert.deepEqual(bases(relative.baseHref, relative.i18n), { en: "app/en/", de: "app/de/" });
  assert.deepEqual(bases(empty.baseHref, empty.i18n), { en: "/app/en/", de: "/app/" });
});

test("a build that doesn't localize has no table; a served one only for a single locale", () => {
  const i18n = { sourceLocale: "en", locales: { de: "de.xlf" } };

  for (const localize of [undefined, false, []]) {
    assert.equal(localeTable({ i18n, baseHref: undefined, localize, words: undefined }), undefined);
  }

  for (const localize of [undefined, false, true, [], ["en", "de"]]) {
    assert.equal(
      localeTable({ i18n, baseHref: undefined, localize, served: true, words: undefined }),
      undefined,
    );
  }

  // The served locale is flat, at the build's base; the others keep their production bases.
  assert.deepEqual(
    localeTable({ i18n, baseHref: "/app/", localize: ["de"], served: true, words: undefined }),
    {
      locales: [
        { code: "en", baseHref: "/app/en/", words: [] },
        { code: "de", baseHref: "/app/", words: [] },
      ],
    },
  );
  assert.deepEqual(
    localeTable({ i18n, baseHref: undefined, localize: ["en"], served: true, words: undefined })
      .locales[0],
    { code: "en", baseHref: "/", words: [] },
  );
});

test("words: only those a locale changes, sorted; __proto__ survives the define", () => {
  const words = new Map([
    [
      "de",
      new Map([
        ["teams", "teams"],
        ["products", "produkte"],
        ["__proto__", "prototyp"],
        ["members", "mitglieder"],
      ]),
    ],
    ["fr", new Map([["products", "produits"]])],
  ]);
  const table = localeTable({
    i18n: { sourceLocale: "en", locales: { de: "de.xlf", fr: "fr.xlf" } },
    baseHref: undefined,
    localize: ["de"],
    words,
  });

  assert.deepEqual(table, {
    locales: [
      { code: "en", baseHref: "/en/", words: [] },
      {
        code: "de",
        baseHref: "/de/",
        words: [
          ["__proto__", "prototyp"],
          ["members", "mitglieder"],
          ["products", "produkte"],
        ],
      },
      { code: "fr", baseHref: "/fr/", words: [["products", "produits"]] },
    ],
  });

  const define = withLocaleTable({ appVersion: '"1"' }, table);

  assert.deepEqual(Object.keys(define), ["appVersion", "loozoRouterLocales"]);
  assert.equal(define.appVersion, '"1"');

  // As the runtime reads it: a Map from the pairs keeps __proto__ an ordinary word.
  const parsed = JSON.parse(define.loozoRouterLocales);
  const german = new Map(parsed.locales[1].words);

  assert.deepEqual(parsed, table);
  assert.equal(german.get("__proto__"), "prototyp");
  assert.equal(Object.getPrototypeOf(german), Map.prototype);

  assert.deepEqual(Object.keys(withLocaleTable(undefined, table)), ["loozoRouterLocales"]);
  assert.throws(() => withLocaleTable({ loozoRouterLocales: "{}" }, table), {
    message:
      "define.loozoRouterLocales is reserved by @loozo/angular-router: remove it from the build options",
  });
});

test("warnings: a relative base, and a changed table in serve", () => {
  const relative = localeTable({
    i18n: { sourceLocale: "en", locales: { de: "de.xlf" } },
    baseHref: "app/",
    localize: true,
    words: undefined,
  });

  assert.deepEqual(localeTableWarnings(relative), [
    `Locale en's base href "app/en/" is relative: localeUrls gives relative URLs, which the browser resolves against the current page's base. Use a baseHref that starts with "/" or "http".`,
    `Locale de's base href "app/de/" is relative: localeUrls gives relative URLs, which the browser resolves against the current page's base. Use a baseHref that starts with "/" or "http".`,
  ]);

  const absolute = localeTable({
    i18n: { sourceLocale: "en", locales: { de: "de.xlf" } },
    baseHref: "https://cdn.example/",
    localize: true,
    words: undefined,
  });

  assert.deepEqual(localeTableWarnings(absolute), []);

  const started = {
    locales: [
      { code: "en", baseHref: "/en/", words: [] },
      { code: "de", baseHref: "/", words: [["members", "mitglieder"]] },
    ],
  };
  const current = {
    locales: [
      { code: "en", baseHref: "/en/", words: [] },
      {
        code: "de",
        baseHref: "/",
        words: [
          ["members", "mitwirkende"],
          ["offers", "angebote"],
        ],
      },
    ],
  };

  assert.equal(
    changedTableWarning(started, current),
    "Locale words changed (route.segment.members in de, route.segment.offers in de). Links from localeUrls keep the words ng serve started with until you restart it.",
  );
});
