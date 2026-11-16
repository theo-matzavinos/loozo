import {
  createBuilder,
  type Builder,
  type BuilderContext,
  type BuilderOutput,
} from "@angular-devkit/architect";
import chokidar from "chokidar";
import { Observable } from "rxjs";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { readFile, realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createGenerationSession, type GenerationSession } from "../generation/index.js";
import { forwardChannels, type DevServerMiddleware } from "./channel-forwarding.js";
import { buildTargetOptions, message, type JsonObject } from "./options.js";

// Polling catches what Angular 22.2's native watcher (@parcel/watcher) misses: edits to files
// inside a renamed directory, which otherwise leave the dev server serving stale output.
const defaultPoll = 1000;
const devServerBuilder = "@angular/build:dev-server";
// One change can reach the watcher as a burst of events: a save of several files, or a directory
// rename, whose unlinks chokidar holds back 100 ms to pair them with re-adds. A pass waits for the
// burst to go quiet, so it runs once and reads the finished change.
const settleDelay = 150;

// Generation's own marked outputs in the scan directory; their events need no further pass. The
// output directory can't overlap the scan directory, so its files never reach the watcher. The
// router's markers aren't part of its generation seam; if this copy drifts, a write only causes one
// redundant pass, which writes nothing. The router's per-route copies are line-aligned with their
// declaration, so they carry the marker on their last line; other router outputs on their first.
const generatedMarkers: Record<string, { marker: string; line: "first" | "last" }> = {
  "route.generated.ts": {
    marker: "// @loozo/angular-router routegen: owned route.generated.ts",
    line: "last",
  },
  "destination.generated.ts": {
    marker: "// @loozo/angular-router routegen: owned destination.generated.ts",
    line: "last",
  },
  "children.generated.ts": {
    marker: "// @loozo/angular-router routegen: owned children.generated.ts",
    line: "first",
  },
};

type ServeOptions = JsonObject & { buildTarget: string; poll?: number | false };

// What this builder uses of @angular/build's executeDevServerBuilder, which is experimental and
// whose middleware extension Angular doesn't support. Its own declarations reach into karma and
// @angular/localize types.
type ExecuteDevServer = (
  options: JsonObject,
  context: BuilderContext,
  extensions: { middleware: DevServerMiddleware[] },
) => AsyncIterable<BuilderOutput>;

// Angular's dev server from the @angular/build the workspace resolves, as Architect resolved the
// "@angular/build:dev-server" builder.
async function loadDevServer(workspaceRoot: string): Promise<ExecuteDevServer> {
  const entry = createRequire(import.meta.url).resolve("@angular/build", {
    paths: [workspaceRoot],
  });
  const angularBuild: { executeDevServerBuilder: ExecuteDevServer } = await import(
    pathToFileURL(entry).href
  );

  return angularBuild.executeDevServerBuilder;
}

// Annotated so the emitted declaration doesn't reach into @angular-devkit/core.
const builder: Builder<ServeOptions> = createBuilder<ServeOptions>(
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
      // the promises they return settle together, with the latest pass.
      const releases: (() => Promise<unknown>)[] = [];
      let cleanup: Promise<void> | undefined;
      let settling: NodeJS.Timeout | undefined;
      // Resolved before the watcher starts.
      let session: GenerationSession;

      async function changed(path: string): Promise<void> {
        if (stopped) {
          return;
        }

        const owned = generatedMarkers[basename(path)];

        if (owned !== undefined) {
          try {
            const bytes = await readFile(path, "utf8");
            const lines = bytes.split("\n");
            let line = lines[0];

            if (owned.line === "last") {
              line = lines.findLast((text) => text !== "" && text !== "\r") ?? "";
            }

            // Git may check the file out with CRLF line endings (core.autocrlf on Windows); the
            // router's generation still treats it as its own output.
            if (line === owned.marker || line === `${owned.marker}\r`) {
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

        clearTimeout(settling);
        settling = setTimeout(() => {
          settling = undefined;
          edited();
        }, settleDelay);
      }

      // A failed or stopped pass leaves the session clean; the next pass starts fresh.
      function regenerate(): Promise<void> {
        return session.generate(undefined, () => stopped);
      }

      function stop(): Promise<void> {
        if (cleanup) {
          return cleanup;
        }

        stopped = true;
        clearTimeout(settling);

        const closing = [pass.catch(() => undefined)];

        for (let index = releases.length - 1; index >= 0; index--) {
          closing.push(releases[index]());
        }

        cleanup = Promise.all(closing).then(() => undefined);

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

        const scanRoot = resolve(
          dirname(resolve(application, launch.tsconfig)),
          launch.scanDirectories[0],
        );
        session = createGenerationSession(context.workspaceRoot, launch);
        releases.push(() => session.dispose());

        const watcher = chokidar.watch([scanRoot], { ignoreInitial: true, followSymlinks: false });
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

        // Run directly, the dev server gets its options as given, so they're validated and
        // defaulted against its schema as scheduling it did.
        const validated = await context.validateOptions(devServer, devServerBuilder);
        const executeDevServer = await loadDevServer(context.workspaceRoot);

        if (stopped) {
          return;
        }

        // Angular's dev server adds its own teardowns, which close Vite's server and abort the
        // build's watch, to the context it runs in. Architect runs a context's teardowns only on a
        // Stop, not when the builder fails or ends, so the dev server gets a context that collects
        // them here, and its release runs them for every way serving ends.
        const devServerTeardowns: Array<() => Promise<void> | void> = [];
        const devServerContext: BuilderContext = {
          ...context,
          addTeardown(teardown) {
            devServerTeardowns.push(teardown);
          },
        };
        const serving = executeDevServer(validated, devServerContext, {
          middleware: [forwardChannels(context.logger)],
        })[Symbol.asyncIterator]();
        const stopping = Promise.withResolvers<undefined>();

        releases.push(() => {
          stopping.resolve(undefined);

          const closing: Promise<void>[] = [];

          for (const teardown of devServerTeardowns) {
            closing.push(Promise.resolve(teardown()));
          }

          // Ending the iteration releases the dev server's generator if it's waiting at a yield.
          // It isn't awaited: a pending step settles only once the teardowns above closed the
          // dev server.
          void serving.return?.().catch((error) => context.logger.error(String(error)));

          return Promise.all(closing);
        });

        while (!stopped) {
          const next = serving.next();

          // Once stopping wins the race nothing reads this step, so its failure is handled here.
          next.catch(() => undefined);

          const result = await Promise.race([next, stopping.promise]);

          if (result === undefined || result.done) {
            break;
          }

          subscriber.next(result.value);
        }

        if (stopped) {
          return;
        }

        // The dev server ended on its own.
        await stop();
        subscriber.complete();
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
