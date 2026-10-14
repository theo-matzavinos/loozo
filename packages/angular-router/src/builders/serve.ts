import { createBuilder, type BuilderRun, type BuilderOutput } from "@angular-devkit/architect";
import chokidar, { type FSWatcher } from "chokidar";
import { Observable, type Subscription } from "rxjs";
import { dirname, resolve, basename } from "node:path";
import { readFile } from "node:fs/promises";
import { generate, type GenerationOptions, type GenerationState } from "../generation/generate.js";
import { workspacePaths, markers } from "../generation/files.js";
import { CompilerState } from "../generation/compiler.js";
import { AnchorState } from "../generation/anchor.js";
import { buildTargetOptions, type JsonObject } from "./options.js";

// Polling catches what Angular 22.2's native watcher (@parcel/watcher) misses: edits to files
// inside a renamed directory, which otherwise leave the dev server serving stale output.
const defaultPoll = 1000;
const devServerBuilder = "@angular/build:dev-server";

export default createBuilder<JsonObject & { buildTarget: string; poll?: number | false }>(
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
      // Resolved from the build target before anything reads it.
      let router: GenerationOptions;
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
      async function regenerate(): Promise<void> {
        try {
          await generate(context.workspaceRoot, router, () => stopped, state);
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

          cleanup = Promise.all([close, delegateStop, drain]).then(() => clear());
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
              await regenerate();
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
        const { poll = defaultPoll, ...devServer } = options;

        if (poll !== false) {
          devServer.poll = poll;
        }

        // Both validations precede the watcher and generation, so invalid options never write.
        [, router] = await Promise.all([
          context.validateOptions(devServer, devServerBuilder),
          buildTargetOptions(context, options.buildTarget),
        ]);

        if (stopped) {
          return;
        }

        const access = await workspacePaths(context.workspaceRoot);

        if (stopped) {
          return;
        }

        const configFile = access.resolve(router.tsconfig);
        const roots = [access.resolve(resolve(dirname(configFile), router.scanDirectories[0]))];

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

        acquisition = context.scheduleBuilder(devServerBuilder, devServer, {
          target: context.target,
        });

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
