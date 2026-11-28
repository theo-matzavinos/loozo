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
import {
  changedTableWarning,
  checkLocaleTableDefine,
  isInertFileEvent,
  localeTable,
  localeTableWarnings,
  projectI18n,
  watchConfigInputs,
  withLocaleTable,
  type ConfigWatch,
  type LocaleTable,
  type LocaleWords,
} from "@loozo/angular-router/_generation";
import { GenerationLockedError } from "../generation/output-lock.js";
import { createBuilderSession, type BuilderSession } from "../generation/run.js";
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
// While another run holds the output's lock, a refused pass is tried again this often.
const lockedRetryDelay = 500;

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
      // follows it, however many edits arrive. A pass refused because another run holds the output's
      // lock makes it "waiting" until the retry, which reads every edit made meanwhile.
      let regeneration: "pending" | "idle" | "running" | "rerun" | "waiting" = "pending";
      // The retry of a refused pass, outside `pass`, which has settled by then.
      let retry: NodeJS.Timeout | undefined;
      // Whether the latest later pass was refused by the lock.
      let locked = false;
      // The refusal last logged in the current wait, so a wait logs again only when it changes.
      let lastRefusal: string | undefined;
      // Ends the initial pass's wait: on stop, or, once its delay is over, when a settled burst
      // wants its pass.
      let wake: (() => void) | undefined;
      // Whether the initial pass's retry delay is over.
      let retryDue = false;
      // The latest pass, settled once idle; stopping waits for it.
      let pass: Promise<unknown> = Promise.resolve();
      // What start() acquired, released last-acquired first. Each release runs as stop() is called;
      // the promises they return settle together, with the latest pass.
      const releases: (() => Promise<unknown>)[] = [];
      let cleanup: Promise<void> | undefined;
      let settling: NodeJS.Timeout | undefined;
      // Whether the latest completed pass, the initial one included, succeeded. An event for a
      // file no pass reads is skipped only after a success: a failed pass may have read it.
      let succeeded = false;
      // Resolved before the watcher starts.
      let session: BuilderSession;
      // The watched locale catalogs, whose events always regenerate.
      const catalogs: string[] = [];
      // Checks the tsconfig, its extends chain, the manifest and the catalogs wherever they live,
      // including what the watcher misses inside the scan directory; refreshed before every pass,
      // so it watches what that pass reads.
      let configWatch: ConfigWatch;
      // The router's locale table of a pass, from the build target's options and that pass's words.
      let tableOf: (words: LocaleWords | undefined) => LocaleTable | undefined = () => undefined;
      // The table the dev server started with: its define is read once, at its start.
      let started: LocaleTable | undefined;
      // Each later table that differed from it, by JSON, so each is warned about once.
      const warned = new Set<string>();

      async function changed(event: string, path: string): Promise<void> {
        if (stopped) {
          return;
        }

        // A pass that was running or queued when the event arrived may have read the file before
        // or after it changed, so only an event that arrived while idle can be skipped.
        const idleOnArrival = regeneration === "idle";

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

        const inert = idleOnArrival && (await isInertFileEvent(event, path, catalogs));

        if (stopped) {
          return;
        }

        // Checked again once the file was inspected: a pass that started or failed meanwhile needs
        // this event's pass. A settling burst doesn't block the skip: it regenerates anyway.
        if (inert && regeneration === "idle" && succeeded) {
          return;
        }

        schedule();
      }

      // Starts or restarts the settle delay, after which the change runs a pass.
      function schedule(): void {
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
      function regenerate(): Promise<LocaleWords | undefined> {
        return session.generate(undefined, () => stopped);
      }

      function stop(): Promise<void> {
        if (cleanup) {
          return cleanup;
        }

        stopped = true;
        clearTimeout(settling);
        clearTimeout(retry);
        wake?.();

        const closing = [pass.catch(() => undefined)];

        for (let index = releases.length - 1; index >= 0; index--) {
          closing.push(releases[index]());
        }

        cleanup = Promise.all(closing).then(() => undefined);

        return cleanup;
      }

      context.addTeardown(stop);

      // A later pass whose table differs from the started one: the running dev server keeps the
      // started table, so the developer learns to restart it.
      function compareTable(words: LocaleWords | undefined): void {
        const current = tableOf(words);

        if (!started || !current) {
          return;
        }

        const json = JSON.stringify(current);

        if (json === JSON.stringify(started) || warned.has(json)) {
          return;
        }

        warned.add(json);
        context.logger.warn(changedTableWarning(started, current));
      }

      // Logs a refusal by the lock unless this wait already logged the same one.
      function refused(error: GenerationLockedError): void {
        if (error.message === lastRefusal) {
          return;
        }

        lastRefusal = error.message;
        context.logger.warn(`${error.message} Serve will generate once it's free.`);
      }

      // Later passes log their failures and keep serving.
      function startPass(): void {
        if (stopped) {
          return;
        }

        configWatch.refresh();
        regeneration = "running";
        pass = regenerate().then(
          (words) => {
            succeeded = true;
            lastRefusal = undefined;
            compareTable(words);
          },
          (error) => {
            succeeded = false;

            if (error instanceof GenerationLockedError) {
              locked = true;

              // Stopping, serve won't retry, so it doesn't say it will.
              if (!stopped) {
                refused(error);
              }

              return;
            }

            lastRefusal = undefined;
            context.logger.error(message(error));
          },
        );
        void pass.then(passEnded);
      }

      // A due retry leaves a settling burst to start the pass once it's quiet.
      function retryPass(): void {
        retry = undefined;

        if (stopped || settling !== undefined) {
          return;
        }

        startPass();
      }

      function passEnded(): void {
        if (locked && !stopped) {
          locked = false;
          regeneration = "waiting";
          retry = setTimeout(retryPass, lockedRetryDelay);

          return;
        }

        locked = false;

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
        } else if (regeneration === "waiting") {
          // A settled burst during a wait runs its pass now. The initial pass's wait keeps its delay,
          // then ends for the burst.
          if (wake) {
            if (retryDue) {
              wake();
            }

            return;
          }

          clearTimeout(retry);
          retry = undefined;
          startPass();
        }
      }

      // The initial pass's wait for a lock: the retry delay, then any burst still settling.
      async function waitForLock(): Promise<void> {
        const woken = Promise.withResolvers<void>();

        wake = woken.resolve;
        retryDue = false;
        retry = setTimeout(() => {
          retry = undefined;
          retryDue = true;

          // The burst's edited() wakes this wait once it's quiet.
          if (settling === undefined) {
            woken.resolve();
          }
        }, lockedRetryDelay);

        await woken.promise;
        wake = undefined;
        clearTimeout(retry);
        retry = undefined;
      }

      async function start(): Promise<void> {
        const { poll = defaultPoll, ...devServer } = options;

        if (poll !== false) {
          devServer.poll = poll;
        }

        // Architect already validated the dev-server options against schemas/serve.json, Angular's
        // dev-server schema with this poll. The build target is validated before the watcher and
        // generation too, so invalid options never write.
        checkLocaleTableDefine(devServer.define);

        const { launch, official, project } = await buildTargetOptions(
          context,
          options.buildTarget,
        );

        if (stopped) {
          return;
        }

        // Angular's dev server localizes only a single-locale list, so only that gets a table.
        if (Array.isArray(official.localize) && official.localize.length === 1) {
          const i18n = await projectI18n(context, project);

          tableOf = (words) =>
            localeTable({
              i18n,
              baseHref: official.baseHref,
              localize: official.localize,
              served: true,
              words,
            });
        }

        if (stopped) {
          return;
        }

        const application = await realpath(context.workspaceRoot);

        if (stopped) {
          return;
        }

        const configFile = resolve(application, launch.tsconfig);
        const scanRoot = resolve(dirname(configFile), launch.scanDirectories[0]);
        session = createBuilderSession(context.workspaceRoot, launch, "Launch serve builder");
        releases.push(() => session.dispose());

        // A catalog edit regenerates too: bytes stay the same, so only the per-locale check runs.
        // Angular's dev server applies a catalog at its next rebuild, not at this edit.
        for (const locale of launch.localization?.locales ?? []) {
          catalogs.push(...locale.files);
        }

        // Generation reads these too, wherever they live, so an edit regenerates, also one the
        // watcher misses inside the scan directory.
        configWatch = watchConfigInputs({
          configFile,
          manifest: resolve(application, "package.json"),
          catalogs,
          changed: schedule,
        });
        releases.push(async () => configWatch.close());

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
        watcher.on("all", (event, path) => {
          void changed(event, path).catch((error) => context.logger.error(String(error)));
        });

        const readyForGeneration = await ready.promise;

        if (stopped || !readyForGeneration) {
          return;
        }

        // The initial pass reads every change so far, so a burst still settling needs no pass.
        clearTimeout(settling);
        settling = undefined;

        let words: LocaleWords | undefined;

        // Another run holding the output's lock delays the dev server until this pass can run.
        for (;;) {
          configWatch.refresh();
          regeneration = "running";

          const initial = regenerate();

          pass = initial;

          try {
            words = await initial;

            break;
          } catch (error) {
            if (error instanceof GenerationLockedError) {
              if (stopped) {
                return;
              }

              refused(error);
              regeneration = "waiting";
              await waitForLock();

              if (stopped) {
                return;
              }

              continue;
            }

            // The dev server never starts on a failed initial generation; report it as a build
            // failure.
            context.logger.error(message(error));
            await stop();
            subscriber.next({ success: false });
            subscriber.complete();

            return;
          }
        }

        if (stopped) {
          return;
        }

        lastRefusal = undefined;
        succeeded = true;
        // Before a queued pass can compare its table with it.
        started = tableOf(words);
        passEnded();

        if (stopped) {
          return;
        }

        if (started) {
          for (const warning of localeTableWarnings(started)) {
            context.logger.warn(warning);
          }

          devServer.define = withLocaleTable(devServer.define, started);
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
