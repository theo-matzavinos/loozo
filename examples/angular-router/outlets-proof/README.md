# Named outlets proof

Handwritten dark-mode SSR application for named outlets, with `autoDefineRoutes: false` and `provideActiveRouteHydration()`. `chat/$id` is a root-level `chat` branch with a `settings` child and a `$rest[]` not-found panel, next to a `files` path whose `$rest[]` child takes `[]`; `products` has a `detail` branch `item/$id` next to its `list` and guarded pathless overview; `teams/$teamId` anchors a `detail` branch on a param; `account`'s pathless layout holds `profile` and an `aside` branch. The guarded home and overview are the empty leaves generation matches by prefix beside a branch. A primary literal `products/(detail:item)` sits next to the static `detail` branch `item`. `old-chat/$id` and `old-chat-kept/$id` redirect into chat (dropping, and keeping the query and fragment), `old-item/$id` into the nested item. The shell builds its open, close and list links from `injectActiveRoute()`, in its template and in `computed`s; pages build theirs from `injectRoute()`. `?hold=1` holds the browser's initial navigation in the list resolver, and `?guard=redirect|async` drives the home and overview guards.

After the pinned workspace install and the package build, run from the repository root:

```sh
pnpm_config_pm_on_fail=error pnpm_config_verify_deps_before_run=error pnpm --filter @loozo/angular-router run test:outlets /absolute/owned/absent-evidence-directory
```

The harness copies this app, binds the installed dependency leaves and the current package, checks the committed generated files with `proof:build:ci`, requests named-outlet URLs from the built Node entry, then drives the dev server's SSR and hydration in Chromium. Observations, screenshots and the flow's video go to the evidence directory.
