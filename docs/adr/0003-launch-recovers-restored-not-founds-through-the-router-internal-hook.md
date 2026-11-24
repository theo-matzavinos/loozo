# Launch recovers restored not-founds through the router's internal hook

`@loozo/angular-launch`'s `rpcNavigationErrors` imports `currentSearchRestore()` from `@loozo/angular-router/_generated` and always asks it, before setting status 404, whether the failing navigation restored a remembered search value; when it did, the handler forgets the restored values and retries the URL from before the restore. No application option turns this on or off. A Launch app that installs `provideSearchStorage()` therefore can't miss the wiring that keeps a stale remembered value from failing every entry (a development-server throw and a blank, bodyless 404 in production, on every visit), and the router's root keeps no runtime Angular import. It couples Launch to a router internal subpath, which Launch already does with `_core` and `_generation` under its exact router peer pin, so the two change together in one release train.

## Considered options

- **An explicit Launch option (`rpcNavigationErrors({ notFound, searchRestore: currentSearchRestore })`)**: no new internal import, and built end to end first, but every app that remembers keys needs one more config line, and omitting it silently keeps the failure above.
- **A root export of `currentSearchRestore()` that Launch imports**: automatic too, but gives the router's root, documented as typed declarations, codecs and synchronous URLs, and `_core`, which Launch's server modules load in Node, their first runtime Angular import, and splits the store's token across `_core` and `_generated`.

## Consequences

A Launch app that remembers keys can't opt out of the retry. A change to `_generated`'s hook is a Launch change in the same release.

Evidence: design-review-3-codex.md, prototype-4.md and prototype-5.md (both builds through Launch's real RPC transport and the built `dist/navigation.js` import) in the router-search-params-persistence work evidence.
