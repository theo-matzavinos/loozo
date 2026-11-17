# Translated route segments proof

A filesystem-mode Angular 22.2.6 app built in English and German with `translateSegments`, `localize: true`, `outputMode: "server"` and `i18nMissingTranslation: "error"`. Its routes, with their German words from `src/locale/messages.de.xlf`:

- `products` (`produkte`), a list page, and `products/$productId`, a product page showing its id, a typed handle link and its `createUrl` text.
- `teams/$teamId`, componentless; its lazy children table holds a pathless overview and `members` (`mitglieder`). The shell links only to the team, so the members destination is first evaluated in that table's chunk.
- `old-products/$productId` (`alte-produkte`), a redirect to the product below a componentless parent.
- `$segments[]`, a root not-found catchall.

`src/app.routes.server.ts` names the product route with `serverRoutePath` and prerenders product 1 only; every other URL renders on the server. `src/server.ts` serves the browser build's scripts and styles and hands pages to Angular's engine; it is a proof surface, not production hosting.

Generated files are committed. After building the package, run the proof from the repository root:

```sh
pnpm --filter @loozo/angular-router run test:localize /absolute/new-directory
```

It copies this app into that directory, links the workspace's installed dependencies, and records each step there: the `ci` build and its bundles, raw server responses across both locales from one process, Chromium hydration and a click into the lazy members page (screenshots and a video), `ng extract-i18n`, the build → extract → translate flow for a new route word, and `ng serve` through broken catalog edits and their repair.
