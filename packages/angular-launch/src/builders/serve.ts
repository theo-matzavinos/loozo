import {
  createBuilder,
  type Builder,
  type BuilderRun,
  type BuilderOutput,
} from "@angular-devkit/architect";
import chokidar, { type FSWatcher } from "chokidar";
import { Observable, type Subscription } from "rxjs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { readFile, realpath } from "node:fs/promises";
import { launchMarkers } from "@loozo/angular-router/_generation";
import { createGenerationSession, type GenerationSession } from "../generation/index.js";
import { contextFiles } from "../generation/context-file.js";
import { buildTargetOptions, message, type JsonObject } from "./options.js";

// Polling catches what Angular 22.2's native watcher (@parcel/watcher) misses: edits to files
// inside a renamed directory, which otherwise leave the dev server serving stale output.
const defaultPoll = 1000;
const devServerBuilder = "@angular/build:dev-server";

// Generation's own marked outputs in the scan directory; their events need no further pass. The
// output directory can't overlap the scan directory, so its files never reach the watcher. The
// router's marker isn't part of its generation seam; if this copy drifts, a write only causes one
// redundant pass, which writes nothing.
const generatedMarkers: Record<string, string> = {
  "route.generated.ts": "// @loozo/angular-router routegen: owned route.generated.ts",
  "rpc.generated.ts": launchMarkers["rpc.generated.ts"],
};

function contains(directory: string, file: string): boolean {
  const suffix = relative(directory, file);

  return (
    suffix === "" || (!isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${sep}`))
  );
}

type ServeOptions = JsonObject & { buildTarget: string; poll?: number | false };

// Annotated so the emitted declaration doesn't reach into @angular-devkit/core.
const builder: Builder<ServeOptions> = createBuilder<ServeOptions>(
  (options, context) =>
    new Observable<BuilderOutput>((subscriber) => {
      let stopped = false;
      let initial = true;
      let dirty = false;
      let watcher: FSWatcher | undefined;
      let contextWatcher: FSWatcher | undefined;
      let session: GenerationSession | undefined;
      let acquisition: Promise<BuilderRun> | undefined;
      let forwarding: Subscription | undefined;
      let active: Promise<unknown> | undefined;
      let cleanup: Promise<void> | undefined;
      let cancelReady: (() => void) | undefined;
      // Resolved before the watcher starts.
      let scanRoot: string;
      let watchedContext: string | undefined;

      // The context file can live anywhere in the app's sources, and its path and contents are part
      // of the generated app identity, so a watcher of its own follows wherever the last pass found
      // it. A file inside the scan directory is already watched.
      function followContext(): void {
        const contextFile = contextFiles.get(session!);

        if (stopped || contextFile === undefined || contextFile === watchedContext) {
          return;
        }

        const previous = contextWatcher;

        contextWatcher = undefined;
        watchedContext = contextFile;
        void previous?.close().catch((error) => context.logger.error(String(error)));

        if (contains(scanRoot, contextFile)) {
          return;
        }

        const followed = chokidar.watch(contextFile, {
          ignoreInitial: true,
          followSymlinks: false,
        });

        contextWatcher = followed;
        followed.on("error", (error) => context.logger.error(String(error)));
        followed.on("all", (_event, path) => {
          void changed(path).catch((error) => context.logger.error(String(error)));
        });

        // The pass that found this path read the context before its watch existed, so an edit since
        // went unseen. Once the watch is live, one more pass reads the current text; the watch
        // covers the rest.
        followed.once("ready", () => {
          if (stopped || contextWatcher !== followed) {
            return;
          }

          dirty = true;
          pump();
        });
      }

      async function changed(path: string): Promise<void> {
        if (stopped) {
          return;
        }

        const marker = generatedMarkers[basename(path)];

        if (marker !== undefined) {
          try {
            const bytes = await readFile(path, "utf8");

            if (bytes.split("\n", 1)[0] === marker) {
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

      // A failed or stopped pass leaves the session clean; the next pass starts fresh.
      async function regenerate(): Promise<void> {
        try {
          await session!.generate(undefined, () => stopped);
        } finally {
          followContext();
        }
      }

      function stop(): Promise<void> {
        stopped = true;
        dirty = false;
        cancelReady?.();
        forwarding?.unsubscribe();

        if (!cleanup) {
          const close = Promise.all([watcher?.close(), contextWatcher?.close()]);
          const delegateStop = acquisition?.then(
            (run) => run.stop(),
            () => undefined,
          );
          const drain = active?.catch(() => undefined);

          cleanup = Promise.all([close, delegateStop, drain, session?.dispose()]).then(
            () => undefined,
          );
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
              context.logger.error(message(error));
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

        // Architect already validated the dev-server options against schemas/serve.json, Angular's
        // dev-server schema with this poll. The build target is validated before the watcher and
        // generation too, so invalid options never write.
        const launch = await buildTargetOptions(context, options.buildTarget);

        if (stopped) {
          return;
        }

        const application = await realpath(context.workspaceRoot);

        if (stopped) {
          return;
        }

        scanRoot = resolve(
          dirname(resolve(application, launch.tsconfig)),
          launch.scanDirectories[0],
        );
        session = createGenerationSession(context.workspaceRoot, launch);
        watcher = chokidar.watch([scanRoot], { ignoreInitial: true, followSymlinks: false });

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

        try {
          await generation;
        } catch (error) {
          // The dev server never starts on a failed initial generation; report it as a build failure.
          context.logger.error(message(error));
          await stop();
          subscriber.next({ success: false });
          subscriber.complete();

          return;
        } finally {
          if (active === generation) {
            active = undefined;
          }
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

export default builder;
