// localeUrls with a locale table, as the router's builders define it. The table is read when the
// package evaluates, so this file sets it before importing and runs in its own process.
import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.loozoRouterLocales = {
  locales: [
    { code: "en", baseHref: "/en/", words: [] },
    {
      code: "de",
      baseHref: "/de/",
      words: [
        ["chat", "unterhaltung"],
        ["compare", "vergleich"],
        ["docs", "dokumente"],
        ["item", "artikel"],
        ["members", "mitglieder"],
        ["old-products", "alte-produkte"],
        ["products", "produkte"],
        ["with", "mit"],
        ["über", "ueber"],
      ],
    },
    // An absolute base without a trailing slash.
    { code: "fr", baseHref: "https://example.fr/app", words: [["products", "produits"]] },
  ],
};

const { createUrl, localeUrls } = await import("@loozo/angular-router");
const { defineDestination, defineRoute, numberParam, stringParam, arrayParam, withFallback } =
  await import("@loozo/angular-router/_core");

// The German build's destinations: each translated static segment carries its German text.
const root = defineDestination("", {}, "root", []);
const products = defineDestination("products", {}, "products", ["produkte"]);
const product = defineDestination(
  "products/$id",
  {
    params: { id: stringParam },
    search: {
      q: stringParam,
      tag: arrayParam(stringParam),
      page: withFallback(numberParam, 1),
    },
    fragments: ["reviews"],
  },
  "product",
  ["produkte"],
);
const compare = defineDestination(
  "compare/$id/with/$id",
  { params: { id: numberParam } },
  "compare",
  ["vergleich", "mit"],
);
const docs = defineDestination("docs/$path[]", { params: { path: stringParam } }, "docs", [
  "dokumente",
]);
const team = defineDestination("teams/$teamId", { params: { teamId: numberParam } }, "team", [
  "teams",
]);
const members = defineDestination("members", { parent: team }, "members", ["mitglieder"]);
const group = defineDestination("", {}, "group", []);
const grouped = defineDestination("products", { parent: group }, "grouped", ["produkte"]);
const old = defineDestination("old-products", {}, "old", ["alte-produkte"]);
const redirect = defineDestination(
  "$productId",
  { parent: old, params: { productId: numberParam } },
  "redirect",
  [],
);
const item = defineDestination(
  "item/$id",
  { parent: products, outlet: "detail", params: { id: numberParam } },
  "item",
  ["artikel"],
);
const chat = defineDestination(
  "chat/$id",
  { outlet: "chat", params: { id: numberParam } },
  "chat",
  ["unterhaltung"],
);

function urls(destination, values) {
  const result = localeUrls(destination, values);
  const byLocale = {};

  for (const { locale, url } of result) {
    byLocale[locale] = url;
  }

  // This build is the German one: its own entry is createUrl's URL under its base, byte for byte.
  assert.equal(byLocale.de, `/de/${createUrl(destination, values).slice(1)}`);

  return byLocale;
}

test("each locale's URL maps static words and keeps values, in table order", () => {
  const result = localeUrls(product, { params: { id: "42" } });

  assert.deepEqual(result, [
    { locale: "en", url: "/en/products/42" },
    { locale: "de", url: "/de/produkte/42" },
    { locale: "fr", url: "https://example.fr/app/produits/42" },
  ]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result[0]), true);

  assert.deepEqual(urls(root, {}), { en: "/en/", de: "/de/", fr: "https://example.fr/app/" });
  assert.deepEqual(urls(products, {}), {
    en: "/en/products",
    de: "/de/produkte",
    fr: "https://example.fr/app/produits",
  });
  assert.deepEqual(urls(compare, { params: { id: 3 } }), {
    en: "/en/compare/3/with/3",
    de: "/de/vergleich/3/mit/3",
    fr: "https://example.fr/app/compare/3/with/3",
  });
});

test("catchall values, inherited words, pathless parents and redirect sources", () => {
  // Catchall values are kept as given; an empty array is valid.
  assert.deepEqual(urls(docs, { params: { path: ["guide", "start"] } }), {
    en: "/en/docs/guide/start",
    de: "/de/dokumente/guide/start",
    fr: "https://example.fr/app/docs/guide/start",
  });
  assert.deepEqual(urls(docs, { params: { path: [] } }), {
    en: "/en/docs",
    de: "/de/dokumente",
    fr: "https://example.fr/app/docs",
  });
  // The parent's words come from the parent destination.
  assert.deepEqual(urls(members, { params: { teamId: 7 } }), {
    en: "/en/teams/7/members",
    de: "/de/teams/7/mitglieder",
    fr: "https://example.fr/app/teams/7/members",
  });
  assert.deepEqual(urls(grouped, {}), {
    en: "/en/products",
    de: "/de/produkte",
    fr: "https://example.fr/app/produits",
  });
  assert.deepEqual(urls(redirect, { params: { productId: 1 } }), {
    en: "/en/old-products/1",
    de: "/de/alte-produkte/1",
    fr: "https://example.fr/app/old-products/1",
  });
});

test("search, fragments and encoding are createUrl's", () => {
  const values = {
    params: { id: "a/b(c)ü" },
    search: { tag: ["x/y", "x/y", "z"], q: "a b&c", page: undefined },
    fragment: "reviews",
  };

  assert.deepEqual(urls(product, values), {
    en: "/en/products/a%2Fb%28c%29%C3%BC?q=a%20b%26c&tag=x%2Fy&tag=x%2Fy&tag=z#reviews",
    de: "/de/produkte/a%2Fb%28c%29%C3%BC?q=a%20b%26c&tag=x%2Fy&tag=x%2Fy&tag=z#reviews",
    fr: "https://example.fr/app/produits/a%2Fb%28c%29%C3%BC?q=a%20b%26c&tag=x%2Fy&tag=x%2Fy&tag=z#reviews",
  });
  // An omitted key is left out; a fallback value given explicitly is written, as createUrl does.
  assert.deepEqual(urls(product, { params: { id: "1" }, search: { page: 1 } }), {
    en: "/en/products/1?page=1",
    de: "/de/produkte/1?page=1",
    fr: "https://example.fr/app/produits/1?page=1",
  });

  // A translated word is component-encoded like any static text.
  const umlaut = defineDestination("über", {}, "umlaut", ["ueber"]);

  assert.deepEqual(urls(umlaut, {}), {
    en: "/en/%C3%BCber",
    de: "/de/ueber",
    fr: "https://example.fr/app/%C3%BCber",
  });
});

test("named-outlet branches keep their outlet name and map anchor and group words", () => {
  assert.deepEqual(urls(item, { params: { id: 3 } }), {
    en: "/en/products/(detail:item/3)",
    de: "/de/produkte/(detail:artikel/3)",
    fr: "https://example.fr/app/produits/(detail:item/3)",
  });
  assert.deepEqual(urls(chat, { params: { id: 7 } }), {
    en: "/en/(chat:chat/7)",
    de: "/de/(chat:unterhaltung/7)",
    fr: "https://example.fr/app/(chat:chat/7)",
  });
  assert.throws(
    () => localeUrls(item, { params: { id: 3 }, search: {} }),
    /A destination in outlet detail takes params only/,
  );
});

test("a word the table doesn't list keeps its authored text; untranslated destinations map too", () => {
  // This build translates "settings", but the table has no entry for it: every locale uses the
  // authored word.
  const settings = defineDestination("settings", {}, "settings", ["einstellungen"]);

  assert.deepEqual(localeUrls(settings, {}), [
    { locale: "en", url: "/en/settings" },
    { locale: "de", url: "/de/settings" },
    { locale: "fr", url: "https://example.fr/app/settings" },
  ]);

  // A build without translateSegments: its destinations carry authored words only.
  const untranslated = defineDestination("products/$id", { params: { id: numberParam } }, "plain");

  assert.deepEqual(localeUrls(untranslated, { params: { id: 2 } }), [
    { locale: "en", url: "/en/products/2" },
    { locale: "de", url: "/de/produkte/2" },
    { locale: "fr", url: "https://example.fr/app/produits/2" },
  ]);
});

test("errors are createUrl's; anything but a genuine destination is rejected", () => {
  function message(call) {
    try {
      call();
    } catch (error) {
      assert.ok(error instanceof TypeError, String(error));

      return error.message;
    }

    assert.fail("expected a TypeError");
  }

  for (const values of [
    { params: {} },
    { params: { id: "1", extra: 2 } },
    { params: { id: "1" }, search: { tag: "x" } },
    { params: { id: "1" }, fragment: "summary" },
    { params: { id: "1" }, unknown: true },
  ]) {
    assert.equal(
      message(() => localeUrls(product, values)),
      message(() => createUrl(product, values)),
    );
  }

  assert.equal(
    message(() => localeUrls(product, { params: {} })),
    "Missing path value: id",
  );
  assert.equal(
    message(() => localeUrls(products, { params: {} })),
    "Route has no path params",
  );
  assert.equal(
    message(() => localeUrls(docs, { params: { path: "guide" } })),
    "Catchall requires an array: path",
  );

  const route = defineRoute("products", {});

  assert.throws(() => localeUrls(route, {}), { message: "Expected a genuine destination" });
  assert.throws(() => localeUrls({ ...products }, {}), {
    message: "Expected a genuine destination",
  });

  // An application stringifier's own error propagates unchanged.
  const failure = new RangeError("no");
  const failing = defineDestination(
    "$value",
    {
      params: {
        value: {
          parse: (text) => text,
          stringify: () => {
            throw failure;
          },
        },
      },
    },
    "failing",
    [],
  );

  assert.throws(
    () => localeUrls(failing, { params: { value: "x" } }),
    (error) => error === failure,
  );
});

test("the active route's localeUrls carries its current params and search, without fallback-equal values", async () => {
  await import("@angular/compiler");

  const {
    createEnvironmentInjector,
    platformCore,
    provideZonelessChangeDetection,
    runInInjectionContext,
    ɵINJECTOR_SCOPE: scope,
  } = await import("@angular/core");
  const { DOCUMENT } = await import("@angular/common");
  const { provideLocationMocks } = await import("@angular/common/testing");
  const { Router, provideRouter } = await import("@angular/router");
  const { injectGeneratedActiveRoute, record } = await import("@loozo/angular-router/_generated");

  const injector = createEnvironmentInjector(
    [
      { provide: scope, useValue: "root" },
      { provide: DOCUMENT, useValue: { title: "" } },
      provideZonelessChangeDetection(),
      provideLocationMocks(),
      provideRouter([{ path: "produkte/:id", children: [], ...record(product) }]),
    ],
    platformCore().injector,
  );
  const router = injector.get(Router);
  const active = runInInjectionContext(injector, () => injectGeneratedActiveRoute());

  // page=1 is the fallback and an undeclared key isn't route state: both are left out.
  assert.equal(
    await router.navigateByUrl("/produkte/42?tag=a&tag=b&page=1&utm_source=x#reviews"),
    true,
  );
  assert.deepEqual(active()?.localeUrls(), [
    { locale: "en", url: "/en/products/42?tag=a&tag=b" },
    { locale: "de", url: "/de/produkte/42?tag=a&tag=b" },
    { locale: "fr", url: "https://example.fr/app/produits/42?tag=a&tag=b" },
  ]);

  // A reused route recomputes with its new values.
  assert.equal(await router.navigateByUrl("/produkte/7?q=x%20y&page=2"), true);
  assert.deepEqual(active()?.localeUrls(), [
    { locale: "en", url: "/en/products/7?page=2&q=x%20y" },
    { locale: "de", url: "/de/produkte/7?page=2&q=x%20y" },
    { locale: "fr", url: "https://example.fr/app/produits/7?page=2&q=x%20y" },
  ]);

  injector.destroy();
});
