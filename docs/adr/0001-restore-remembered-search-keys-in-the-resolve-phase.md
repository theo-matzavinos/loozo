# Restore remembered search keys first in Angular's resolve phase

The router restores a remembered search key by returning a `RedirectCommand` synchronously from whichever generated resolver or dynamic-title adapter of a primary-outlet record Angular calls first, plus a resolver of its own on records under a remembered key. That is the one point where every guard of the whole target tree, named outlets and ancestors' `canActivateChild` included, has accepted the original URL, and no authored resolver or title has run yet, so no storage is read while a guard is pending and no resolver runs on the bare URL. It relies on Angular 22.3 implementation details, not documented guarantees: the resolve phase runs routes one at a time, primary children first, and a synchronously emitted `RedirectCommand` tears down the remaining resolvers before they start. The navigation and lifecycle proofs assert "no storage operation while a guard is pending" and "no authored call on the bare URL", so an Angular upgrade that changes the ordering fails them instead of silently degrading.

## Considered options

- **`canMatch`**: runs during recognition, before other routes' guards decide and before the navigation is accepted, so storage would be read for URLs a guard then refuses.
- **The last `canActivate`**: Angular runs activation guards concurrently and named-outlet branches and `canActivateChild` are separate checks, so no single guard runs after all others.
- **`UrlHandlingStrategy`**: rewrites URLs before recognition, outside any per-navigation guard order, with the same pre-acceptance reads as `canMatch`.
- **A resolver on the leaf only**: owners and ancestors resolve before the leaf, so their resolvers and titles ran on the bare URL (prototype-1/2: up to four bare calls).

Evidence: design-review-1-codex.md F1/F2 and prototypes 1 and 2 in the router-search-params-persistence work evidence; Angular 22.3 `_router-chunk.mjs` `resolveData` and `getDataKeys`.
