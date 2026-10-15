# Origami UI consumer

The Angular SSR application that [`@loozo/origami-ui`](../../packages/origami-ui/README.md)'s acceptance suite runs against. These are its authored sources: an ordinary Angular 22.2.2 application that imports the library only through its public entry points.

It isn't a demo or a starter. Each route is a fixture for a group of acceptance cases, with test IDs and deliberately unusual setups such as nested owners, failing parts and reordered hydration. For usage examples, read the package README.

| Path                                  | Contents                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes.ts`                       | Lazy fixture routes: `core`, `composition`, `popover`, `hydration`, `nested` and `errors`                                                                           |
| `src/fixtures/`                       | The fixtures, plus `server-*.ts` fixtures that only the Node SSR checks compile                                                                                     |
| `src/fixtures/seeds/`                 | The handwritten consumers from [`packages/origami-ui/acceptance`](../../packages/origami-ui/acceptance/); the two hydration ones are extended for the runtime cases |
| `src/app-config.ts`                   | Incremental hydration, the default                                                                                                                                  |
| `src/app-config.eager.ts`             | Eager hydration with event replay, swapped in by the `*-eager` build configurations                                                                                 |
| `src/server.ts`, `src/main.server.ts` | The Express SSR server and server bootstrap                                                                                                                         |

## Serving it

From the repository root, build the library first; the workspace resolves `@loozo/origami-ui` to `packages/origami-ui/dist`:

```sh
pnpm --filter @loozo/origami-ui run build
pnpm --filter @loozo/origami-ui run example:serve   # http://127.0.0.1:4310
pnpm --filter @loozo/origami-ui run example:build   # production build into dist/consumer
```

`example:serve` runs `ng serve` with the development configuration, server rendering and incremental hydration. Rebuild the library to pick up library changes. Serving and building here are a convenience for looking at the fixtures, not qualification.

## How acceptance uses it

Acceptance never installs into or builds this directory. Each `acceptance:sync` (part of the package's `test`, `test:fast` and `test:focus`) stages these files into the ignored scratch consumer `packages/origami-ui/.scratch/consumer`. There the library dependency is replaced by the real `npm pack` tarball of the current build, installed with a strict npm installation instead of the workspace link, and the `scripts` and `devDependencies` are dropped. The browser tests, the AOT/SSR builds and the Node checks all run against that scratch copy.

So edit fixtures here, never in `.scratch/consumer`; the next sync overwrites it. Changing this `package.json` needs a clean reinstall: `pnpm --filter @loozo/origami-ui run acceptance:prepare`. See [the acceptance suite's README](../../packages/origami-ui/tests/acceptance/README.md) for the full flow.
