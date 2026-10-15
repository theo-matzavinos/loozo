# loozo docs site

The static documentation site for the loozo packages, published to GitHub Pages at <https://theo-matzavinos.github.io/loozo/>. It is an Angular application built on `@loozo/angular-router` and fully prerendered.

Page content comes from `generated/content/`, which `@loozo/docs-content` (`tools/docs-content`) generates from the packages' READMEs, snippets and TSDoc; packages marked `"private": true` are left out. Every `build`, `generate` and `serve` regenerates it first. It is gitignored because its source links pin the current commit; `pnpm --filter @loozo/docs run content` regenerates it on its own, for example before type-checking in an editor.

From the workspace root:

```sh
pnpm run docs                                         # build @loozo/angular-router, then content and the site
pnpm --filter @loozo/docs run serve                   # dev server; regenerates route files
pnpm --filter @loozo/docs run generate                # regenerate route files with a development build
```

Routes use the router's filesystem mode, its default: directories under `src/routes/` give the paths (`$package` is a param, `+overview` adds no segment), a `page.ts` is the route's page and `route.ts` its editable declaration. A directory without either, like `guide/`, isn't a route; it only adds its name to the path below it (`guide/$guide`). `generate` and `serve` create missing `route.ts` files and keep their paths and parents in step with the directories.

`build` checks the committed route files without writing them and fails on drift; run `generate` or `serve` after adding, moving or renaming a route directory or changing a declaration. It writes `dist/docs/browser/` with base href `/loozo/`, one `index.html` per page and a `404.html` for GitHub Pages.
