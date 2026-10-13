import { createBuilder, type BuilderRun, type BuilderOutput } from "@angular-devkit/architect";
import chokidar, { type FSWatcher } from "chokidar";
import { Observable, type Subscription } from "rxjs";
import { dirname, resolve, basename } from "node:path";
import { readFile, utimes } from "node:fs/promises";
import { generate, type GenerationState } from "../generation/generate.js";
import { auditPath, workspacePaths, markers } from "../generation/files.js";
import { CompilerState } from "../generation/compiler.js";
import { AnchorState } from "../generation/anchor.js";
import { delegate, type Options } from "./options.js";

export default createBuilder<Options>(
  (options, context) =>
    new Observable<BuilderOutput>((subscriber) => {
      let stopped = false;
      let initial = true;
      let dirty = false;
      let watcher: FSWatcher | undefined;
      let acquisition: Promise<BuilderRun> | undefined;
      let forwarding: Subscription | undefined;
      let active: Promise<unknown> | undefined;
      let cleanup: Promise<void> | undefined;
      let cancelReady: (() => void) | undefined;
      let touching: Promise<void> | undefined;
      let touches = 0;
      const published = new Set<string>();
      const state: GenerationState = {
        discovery: new CompilerState(),
        overlay: new CompilerState(),
        anchor: new AnchorState(),
      };

      function clear(): void {
        state.discovery.clear();
        state.overlay.clear();
        state.anchor.clear();
      }

      // A failed or stopped pass may leave partial state; the next pass starts fresh.
      async function regenerate(): Promise<string[]> {
        try {
          return await generate(context.workspaceRoot, options, () => stopped, state);
        } catch (error) {
          clear();

          throw error;
        } finally {
          if (stopped) {
            clear();
          }
        }
      }

      function stop(): Promise<void> {
        stopped = true;
        dirty = false;
        cancelReady?.();
        forwarding?.unsubscribe();

        if (!cleanup) {
          const close = watcher?.close();
          const delegateStop = acquisition?.then(
            (run) => run.stop(),
            () => undefined,
          );
          const drain = active?.catch(() => undefined);

          cleanup = Promise.all([close, delegateStop, drain, touching]).then(() => clear());
        }

        return cleanup;
      }

      context.addTeardown(stop);

      // Angular's dev server can miss a warm rewrite: a build in flight reads the old bytes of a
      // file it watches only afterwards, and watchpack's initial scan absorbs our newer mtime
      // without reporting it. Touching the published paths after a failed build makes it report
      // them. The first touch can be absorbed the same way, hence two. Remove this once Angular
      // passes a start time when it watches newly discovered files.
      function touch(paths: string[]): void {
        const now = new Date();
        const batch = Promise.all(
          paths.map(async (path) => {
            try {
              // A published path may have been replaced since; never follow a symlink out.
              await auditPath(path);
              await utimes(path, now, now);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                context.logger.error(String(error));
              }
            }
          }),
        );

        touching = Promise.all([touching, batch]).then(() => undefined);
      }

      function pump(): void {
        if (stopped || initial || active || !dirty) {
          return;
        }

        const work = (async () => {
          while (dirty && !stopped) {
            dirty = false;

            try {
              const written = await regenerate();

              if (written.length > 0) {
                for (const path of written) {
                  published.add(path);
                }

                touches = 2;
              }
            } catch (error) {
              let message = String(error);

              if (error instanceof Error) {
                message = error.message;
              }

              context.logger.error(message);
            }
          }
        })();

        active = work;
        void work.finally(() => {
          if (active === work) {
            active = undefined;
          }

          // An edit between the loop's last check and finalization must not be lost.
          pump();
        });
      }

      async function start(): Promise<void> {
        const target = await delegate(context, options, true);

        if (stopped) {
          return;
        }

        const access = await workspacePaths(context.workspaceRoot);

        if (stopped) {
          return;
        }

        const configFile = access.resolve(options.tsconfig);
        const roots = [access.resolve(resolve(dirname(configFile), options.scanDirectories[0]))];

        if (stopped) {
          return;
        }

        watcher = chokidar.watch(roots, { ignoreInitial: true, followSymlinks: false });

        const ready = new Promise<boolean>((resolveReady, rejectReady) => {
          cancelReady = () => resolveReady(false);
          watcher!.once("ready", () => resolveReady(true));
          watcher!.on("error", (error) => {
            if (initial) {
              rejectReady(error);
            } else {
              context.logger.error(String(error));
            }
          });

          async function changed(path: string): Promise<void> {
            if (stopped) {
              return;
            }

            if (basename(path) === "route.generated.ts") {
              try {
                const bytes = await readFile(path, "utf8");

                if (bytes.split("\n", 1)[0] === markers["route.generated.ts"]) {
                  return;
                }
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                  throw error;
                }
              }
            }

            if (stopped) {
              return;
            }

            dirty = true;
            pump();
          }

          watcher!.on("all", (_event, path) => {
            void changed(path).catch((error) => context.logger.error(String(error)));
          });
        });
        const readyForGeneration = await ready;

        if (stopped || !readyForGeneration) {
          return;
        }

        dirty = false;

        const generation = regenerate();

        active = generation;
        await generation;

        if (active === generation) {
          active = undefined;
        }

        if (stopped) {
          return;
        }

        initial = false;
        pump();

        if (stopped) {
          return;
        }

        acquisition = context.scheduleTarget(target);

        const run = await acquisition;

        if (stopped) {
          await run.stop();

          return;
        }

        forwarding = run.output.subscribe({
          next: (output) => {
            subscriber.next(output);

            if (stopped) {
              return;
            }

            if (output.success) {
              published.clear();
              touches = 0;

              return;
            }

            if (published.size === 0 || touches === 0) {
              return;
            }

            const paths = [...published];

            touches -= 1;

            if (touches === 0) {
              published.clear();
            }

            touch(paths);
          },
          error: (error) => {
            void stop().then(
              () => subscriber.error(error),
              () => subscriber.error(error),
            );
          },
          complete: () => {
            void stop().then(
              () => subscriber.complete(),
              (error) => subscriber.error(error),
            );
          },
        });
      }

      void start().catch((error) => {
        void stop().then(
          () => subscriber.error(error),
          () => subscriber.error(error),
        );
      });

      return () => {
        void stop().catch((error) => context.logger.error(String(error)));
      };
    }),
);
