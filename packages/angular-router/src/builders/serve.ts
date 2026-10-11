import { createBuilder, type BuilderRun, type BuilderOutput } from "@angular-devkit/architect";
import chokidar, { type FSWatcher } from "chokidar";
import { Observable, type Subscription } from "rxjs";
import { dirname, resolve, basename } from "node:path";
import { readFile } from "node:fs/promises";
import { generate } from "../generation/generate.js";
import { workspacePaths, markers } from "../generation/files.js";
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
      let active: Promise<void> | undefined;
      let cleanup: Promise<void> | undefined;
      let cancelReady: (() => void) | undefined;

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

          cleanup = Promise.all([close, delegateStop, drain]).then(() => undefined);
        }

        return cleanup;
      }

      context.addTeardown(stop);

      function pump(): void {
        if (stopped || initial || active || !dirty) {
          return;
        }

        const work = (async () => {
          while (dirty && !stopped) {
            dirty = false;

            try {
              await generate(context.workspaceRoot, options, () => stopped);
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

        const generation = generate(context.workspaceRoot, options, () => stopped);

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
          next: (output) => subscriber.next(output),
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
