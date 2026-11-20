# Translated Launch redirects proof

A Launch app built in English and German with `translateSegments`, `localize: true`, `outputMode: "server"` and `i18nMissingTranslation: "error"`, rendered on the server for every URL. Its routes, with their German words from `src/locale/messages.de.xlf`:

- `+authenticated`, a pathless group whose stage throws `redirect(signIn, {})` without a `proof-user` cookie. Below it: `guarded` (`geschuetzt`) and `lazy/guarded` (`spaet/geschuetzt`, in a lazy children table), whose resolvers call `session.current`, and `live` (`direkt`), which opens the group's stream and channel in the browser and shows each one's caught `RpcRedirect.to`.
- `sign-in` (`anmelden`), and `anmelden` (`empfangen`): a canonical word that is also sign-in's German word.
- `account/$id/sign-in` (`konto/…/anmelden`) and `help/$topic[]` (`hilfe`), where a parameter or catchall value equals a word.
- `docs` (`dokumente`) with a redirect child `old` (`alt`) and a catchall child `$rest[]`, and `manuals/start` (`handbuecher/anfang`), a two-word redirect target beside it.
- Named outlets: `products` (`produkte`), with a repeated `tag` search key and the fragment `über & (uns)`, anchors the `detail` outlet's `item/$id` (`artikel`) and `shelf/$rest[]` (`regal`); `teams/$team` (`mannschaften`) anchors another `detail` `item/$id`; and the root page holds the `chat` outlet's `chat/$id` (`plaudern`), whose outlet name is also a route word, and the `aside` outlet's `$note`, which has no static segment. The root catchall `$segments[]` lets Angular SSR render those URLs, as the router's README requires.
- `probe` (`sonde`), whose page calls `probe.go({ target })` and renders the redirect it caught next to its own `createUrl` for the same target; `jump` (`springen`), whose resolver follows the same redirect; and `missing` (`vermisst`), whose resolver's query answers `notFound()`.

The root route's `probe` namespace redirects to each target from `src/routes/route.ts`; `src/urls.ts` builds the same URLs in the page's build. `src/wire.ts` is an interceptor that records every 303 body it sees, on the page in the browser and in the server log while rendering. `src/server.ts` imports `server.generated` first, serves the browser build's files and hands pages to Angular's engine; it's a proof surface, not production hosting.

The shell renders the router's language switcher (`src/language-switcher.ts`) and calls its hreflang snippet (`src/alternates.ts`, origin `https://example.test`), both as the router's README gives them, over the locale table Launch's builders define. `src/config.server.ts` prerenders `manuals/start` in each locale's words and renders every other URL live.

Generated files aren't committed: every build regenerates them, and the `ci` configuration checks them without writing. After building the router and Launch, run the proof from the repository root:

```sh
pnpm --dir packages/angular-launch run test:localize /absolute/new-directory
```

It copies this app into that directory, links the Launch example's installed dependencies, and records each step there: the build and the `ci` check, the generated word table, per-locale bundles, raw RPC frames and SSR redirects across both locales from one process, redirects into named outlets (`outlets.json`: each canonical frame, SSR 302 and the committed browser URL with what each outlet renders), Chromium redirects (screenshots and videos), the locale table in each bundle (`bundles.json`), the switcher and alternates on prerendered and live pages (`prerender.json`, `http.json`) and across hydration, navigation and a switch to English (`de-switcher`), and `ng serve` with a bad and a valid catalog edit (`serve-links.json`, `serve.log`).
