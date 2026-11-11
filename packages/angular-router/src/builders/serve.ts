import { createBuilder, type BuilderOutput } from "@angular-devkit/architect";
import chokidar from "chokidar";
import { Observable } from "rxjs";
import { dirname, resolve, basename } from "node:path";
import { readFile } from "node:fs/promises";
import { generate, type GenerationOptions, type GenerationState } from "../generation/generate.js";
import { workspacePaths, marked, markers } from "../generation/files.js";
import { CompilerState } from "../generation/compiler.js";
import { AnchorState } from "../generation/anchor.js";
import { buildTargetOptions, message, type JsonObject } from "./options.js";

// Polling catches what Angular 22.2's native watcher (@parcel/watcher) misses: edits to files
// inside a renamed directory, which otherwise leave the dev server serving stale output.
const defaultPoll = 1000;
const devServerBuilder = "@angular/build:dev-server";

export default createBuilder<JsonObject & { buildTarget: string; poll?: number | false }>(
  (options, context) =>
    new Observable<BuilderOutput>((subscriber) => {
      let stopped = false;
      // One pass at a time. "pending" lasts until the initial generation starts, which covers the
      // edits before it. An edit during a "running" pass makes it "rerun": exactly one more pass
      // follows it, however many edits arrive.
      let regeneration: "pending" | "idle" | "running" | "rerun" = "pending";
      // The latest pass, settled once idle; stopping waits for it.
      let pass: Promise<unknown> = Promise.resolve();
      // What start() acquired, released last-acquired first. Each release runs as stop() is called;
      // the promises they return settle together, with the latest pass, before the compiler state
      // clears.
      const releases: (() => Promise<unknown>)[] = [];
      let cleanup: Promise<void> | undefined;
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
        if (cleanup) {
          return cleanup;
        }

        stopped = true;

        const settling = [pass.catch(() => undefined)];

        for (let index = releases.length - 1; index >= 0; index--) {
          settling.push(releases[index]());
        }

        cleanup = Promise.all(settling).then(() => clear());

        return cleanup;
      }

      context.addTeardown(stop);

      // Later passes log their failures and keep serving.
      function startPass(): void {
        regeneration = "running";
        pass = regenerate().catch((error) => context.logger.error(message(error)));
        void pass.then(passEnded);
      }

      function passEnded(): void {
        if (regeneration === "rerun" && !stopped) {
          startPass();

          return;
        }

        regeneration = "idle";
      }

      function edited(): void {
        if (regeneration === "idle") {
          startPass();
        } else if (regeneration === "running") {
          regeneration = "rerun";
        }
      }

      async function changed(path: string): Promise<void> {
        if (stopped) {
          return;
        }

        if (basename(path) === "route.generated.ts") {
          try {
            const bytes = await readFile(path, "utf8");

            if (marked(bytes, markers["route.generated.ts"])) {
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

        edited();
      }

      async function start(): Promise<void> {
        const { poll = defaultPoll, ...devServer } = options;

        if (poll !== false) {
          devServer.poll = poll;
        }

        // Architect already validated the dev-server options against schemas/serve.json, Angular's
        // dev-server schema with this poll. The build target is validated before the watcher and
        // generation too, so invalid options never write.
        router = await buildTargetOptions(context, options.buildTarget);

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

        const watcher = chokidar.watch(roots, { ignoreInitial: true, followSymlinks: false });
        const ready = Promise.withResolvers<boolean>();

        releases.push(() => {
          ready.resolve(false);

          return watcher.close();
        });
        // A watcher error fails startup until the watcher is ready. From then on, including during
        // the initial generation, it's logged and serve carries on.
        watcher.on("error", ready.reject);
        watcher.once("ready", () => {
          watcher.off("error", ready.reject);
          watcher.on("error", (error) => context.logger.error(String(error)));
          ready.resolve(true);
        });
        watcher.on("all", (_event, path) => {
          void changed(path).catch((error) => context.logger.error(String(error)));
        });

        const readyForGeneration = await ready.promise;

        if (stopped || !readyForGeneration) {
          return;
        }

        regeneration = "running";

        const initial = regenerate();

        pass = initial;

        try {
          await initial;
        } catch (error) {
          // The dev server never starts on a failed initial generation; report it as a build failure.
          context.logger.error(message(error));
          await stop();
          subscriber.next({ success: false });
          subscriber.complete();

          return;
        }

        if (stopped) {
          return;
        }

        passEnded();

        if (stopped) {
          return;
        }

        const acquisition = context.scheduleBuilder(devServerBuilder, devServer, {
          target: context.target,
        });

        // The release stops the run, including one acquired after a stop.
        releases.push(() =>
          acquisition.then(
            (run) => run.stop(),
            () => undefined,
          ),
        );

        const run = await acquisition;

        if (stopped) {
          return;
        }

        const forwarding = run.output.subscribe({
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

        releases.push(async () => forwarding.unsubscribe());
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
