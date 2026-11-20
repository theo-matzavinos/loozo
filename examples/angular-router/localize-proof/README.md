# Translated route segments proof

A filesystem-mode Angular 22.3.0 app built in English and German with `translateSegments`, `localize: true`, `outputMode: "server"` and `i18nMissingTranslation: "error"`. Its routes, with their German words from `src/locale/messages.de.xlf`:

- `products` (`produkte`), a list page with a `page` search key (`withFallback(numberParam, 1)`) and a link to page 2, and `products/$productId`, a product page showing its id, a typed handle link and its `createUrl` text.
- `teams/$teamId`, componentless; its lazy children table holds a pathless overview and `members` (`mitglieder`). The shell links only to the team, so the members destination is first evaluated in that table's chunk. The members page renders its own `localeUrls` call into `data-locale-urls`.
- `old-products/$productId` (`alte-produkte`), a redirect to the product below a componentless parent.
- `$segments[]`, a root not-found catchall.

The shell renders the router README's language switcher (`src/language-switcher.ts`) from the active route, linking to the same page in English and German, and keeps hreflang alternates for both and `x-default` in `<head>` (`src/alternates.ts`, origin `https://example.test`). `src/app.config.ts` installs `provideActiveRouteHydration()`, so the hydrated switcher keeps the server's links.

`src/app.routes.server.ts` names the product route with `serverRoutePath` and prerenders product 1 only; every other URL renders on the server. `src/server.ts` serves the browser build's scripts and styles and hands pages to Angular's engine; it is a proof surface, not production hosting.

Generated files are committed. After building the package, run the proof from the repository root:

```sh
pnpm --filter @loozo/angular-router run test:localize /absolute/new-directory
```

It copies this app into that directory, links the workspace's installed dependencies, and records each step there: the `ci` build, its bundles and their locale tables, the prerendered pages' switcher and alternates, raw server responses across both locales from one process, Chromium hydration, a click into the lazy members page and the switcher's English link (screenshots and a video), `ng extract-i18n`, the build → extract → translate flow for a new route word, and `ng serve` through broken catalog edits, their repair, a translation edit and a restart.
