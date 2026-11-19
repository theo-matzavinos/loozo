import { createBuilder, type BuilderOutput } from "@angular-devkit/architect";
import chokidar from "chokidar";
import { Observable } from "rxjs";
import { dirname, resolve, basename } from "node:path";
import { readFile } from "node:fs/promises";
import { generate, type GenerationOptions, type GenerationState } from "../generation/generate.js";
import type { LocaleWords } from "../generation/localization.js";
import { workspacePaths, markers, ownedBy, colocatedFiles } from "../generation/files.js";
import { CompilerState } from "../generation/compiler.js";
import { AnchorState } from "../generation/anchor.js";
import {
  changedTableWarning,
  checkDefine,
  localeTable,
  localeTableWarnings,
  withLocaleTable,
  type LocaleTable,
} from "./locale-table.js";
import { buildTargetOptions, message, projectI18n, type JsonObject } from "./options.js";

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
      // The locale table of a pass, from the build target's options and that pass's words.
      let tableOf: (words: LocaleWords | undefined) => LocaleTable | undefined = () => undefined;
      // The table the dev server started with: its define is read once, at its start.
      let started: LocaleTable | undefined;
      // Each later table that differed from it, by JSON, so each is warned about once.
      const warned = new Set<string>();
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
      async function regenerate(): Promise<LocaleWords | undefined> {
        try {
          return await generate(context.workspaceRoot, router, () => stopped, state);
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

      // Later passes log their failures and keep serving.
      function startPass(): void {
        regeneration = "running";
        pass = regenerate().then(compareTable, (error) => context.logger.error(message(error)));
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

        if (colocatedFiles.has(basename(path))) {
          try {
            const bytes = await readFile(path, "utf8");

            if (ownedBy(basename(path), bytes, markers)) {
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
        checkDefine(devServer.define);

        const target = await buildTargetOptions(context, options.buildTarget);

        router = target.router;

        if (stopped) {
          return;
        }

        const { official } = target;

        if (Array.isArray(official.localize) && official.localize.length === 1) {
          const i18n = await projectI18n(context, target.project);

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

        const access = await workspacePaths(context.workspaceRoot);

        if (stopped) {
          return;
        }

        const configFile = access.resolve(router.tsconfig);
        const roots = [access.resolve(resolve(dirname(configFile), router.scanDirectories[0]))];

        if (stopped) {
          return;
        }

        // A catalog edit regenerates too: bytes stay the same, so only the per-locale check runs.
        // Angular's dev server applies a catalog at its next rebuild, not at this edit.
        const watched = [...roots];

        for (const locale of router.localization?.locales ?? []) {
          watched.push(...locale.files);
        }

        const watcher = chokidar.watch(watched, { ignoreInitial: true, followSymlinks: false });
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
        let words: LocaleWords | undefined;

        pass = initial;

        try {
          words = await initial;
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
