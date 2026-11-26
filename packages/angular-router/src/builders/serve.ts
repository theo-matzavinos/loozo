import { createBuilder, type BuilderOutput } from "@angular-devkit/architect";
import chokidar from "chokidar";
import { Observable } from "rxjs";
import { dirname, resolve, basename } from "node:path";
import { lstatSync, readFileSync } from "node:fs";
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
import { isInertFileEvent, watchConfigInputs, type ConfigWatch } from "./serve-events.js";

// Polling catches what Angular 22.2's native watcher (@parcel/watcher) misses: edits to files
// inside a renamed directory, which otherwise leave the dev server serving stale output.
const defaultPoll = 1000;
const devServerBuilder = "@angular/build:dev-server";
// One change can reach the watcher as a burst of events: a save of several files, or a directory
// rename, whose unlinks chokidar holds back 100 ms to pair them with re-adds. A pass waits for the
// burst to go quiet, so it runs once and reads the finished change. It also outlasts the 50 ms in
// which chokidar drops a second change event for the same file, so a check when it ends sees an
// edit whose event was dropped.
const settleDelay = 150;

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
      let settling: NodeJS.Timeout | undefined;
      // Whether the latest completed pass, the initial one included, succeeded. An event for a
      // file no pass reads is skipped only after a success: a failed pass may have read it.
      let succeeded = false;
      // Resolved from the build target before anything reads it.
      let router: GenerationOptions;
      // The watched locale catalogs, whose events always regenerate.
      const catalogs: string[] = [];
      // Checks the tsconfig, its extends chain, the manifest and the catalogs wherever they live,
      // including what the watcher misses inside the scan directory; refreshed before every pass,
      // so it watches what that pass reads.
      let configWatch: ConfigWatch;
      // The locale table of a pass, from the build target's options and that pass's words.
      let tableOf: (words: LocaleWords | undefined) => LocaleTable | undefined = () => undefined;
      // The table the dev server started with: its define is read once, at its start.
      let started: LocaleTable | undefined;
      // Each later table that differed from it, by JSON, so each is warned about once.
      const warned = new Set<string>();
      // The filesystem definitions the latest pass wrote, with their bytes; empty while a pass
      // runs and after a failed or stopped one. A watcher event for one is an echo of that write.
      const written = new Map<string, string>();
      // The burst the settle delay is waiting on: whether a signal in it needs a pass, and the
      // written files it echoed, which need one only if they changed again.
      let burstNeedsPass = false;
      const echoes = new Set<string>();
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
        written.clear();

        try {
          const generation = await generate(context.workspaceRoot, router, () => stopped, state);

          // A stopped pass publishes nothing, and stopping clears the record.
          if (!stopped) {
            for (const [file, bytes] of generation.authored) {
              written.set(resolve(file), bytes);
            }
          }

          return generation.words;
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
        clearTimeout(settling);
        written.clear();
        echoes.clear();

        const closing = [pass.catch(() => undefined)];

        for (let index = releases.length - 1; index >= 0; index--) {
          closing.push(releases[index]());
        }

        cleanup = Promise.all(closing).then(() => clear());

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
        configWatch.refresh();
        regeneration = "running";
        pass = regenerate().then(
          (words) => {
            succeeded = true;
            compareTable(words);
          },
          (error) => {
            succeeded = false;
            context.logger.error(message(error));
          },
        );
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

      async function changed(event: string, path: string): Promise<void> {
        if (stopped) {
          return;
        }

        // For the inert skip below: a pass that was running or queued when the event arrived may
        // have read the file before or after it changed, so only an event that arrived while idle
        // can be skipped.
        const idleOnArrival = regeneration === "idle";

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

        const echoed = resolve(path);

        // Only a pass's own write is known here; whether the file still holds it is checked when
        // the burst settles, after any edit whose event chokidar dropped.
        if (written.has(echoed)) {
          echo(echoed);

          return;
        }

        const inert = idleOnArrival && (await isInertFileEvent(event, path, catalogs));

        if (stopped) {
          return;
        }

        // Checked again once the file was inspected: a pass that started or failed meanwhile needs
        // this event's pass. A settling burst doesn't block the inert skip: it regenerates anyway,
        // unless it holds only echoes, which never needed this event's pass either.
        if (inert && regeneration === "idle" && succeeded) {
          return;
        }

        schedule();
      }

      // A signal that needs a pass once the burst settles.
      function schedule(): void {
        burstNeedsPass = true;
        settle();
      }

      // An event for a file the latest pass wrote, which needs a pass only if the file changed.
      function echo(path: string): void {
        if (stopped) {
          return;
        }

        echoes.add(path);
        settle();
      }

      // Whether the file is still the regular file the latest pass wrote, byte for byte. A link, a
      // directory or an error reading it isn't: the pass runs and reports what's there.
      function unchanged(path: string): boolean {
        const bytes = Buffer.from(written.get(path)!, "utf8");

        try {
          return lstatSync(path).isFile() && readFileSync(path).equals(bytes);
        } catch {
          return false;
        }
      }

      // Starts or restarts the settle delay. When it ends, the burst runs a pass unless it holds
      // only echoes of files that are unchanged. No pass can start meanwhile: an echo is only
      // possible between passes, and only this delay starts one then.
      function settle(): void {
        if (stopped) {
          return;
        }

        clearTimeout(settling);
        settling = setTimeout(() => {
          settling = undefined;

          let needsPass = burstNeedsPass;

          for (const path of echoes) {
            if (!needsPass && !unchanged(path)) {
              needsPass = true;
            }
          }

          burstNeedsPass = false;
          echoes.clear();

          if (needsPass) {
            edited();
          }
        }, settleDelay);
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
        for (const locale of router.localization?.locales ?? []) {
          catalogs.push(...locale.files);
        }

        // Generation reads these too, wherever they live, so an edit regenerates, also one the
        // watcher misses inside the scan directory.
        configWatch = watchConfigInputs({
          configFile,
          manifest: resolve(context.workspaceRoot, "package.json"),
          catalogs,
          changed: schedule,
        });
        releases.push(async () => configWatch.close());

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
        burstNeedsPass = false;
        echoes.clear();
        configWatch.refresh();
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
