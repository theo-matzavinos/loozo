import { createBuilder, type BuilderRun, type BuilderOutput } from "@angular-devkit/architect";
import { generate } from "../generation/generate.js";
import { localeTable, localeTableWarnings, withLocaleTable } from "./locale-table.js";
import { localization, message, projectI18n, split, type JsonObject } from "./options.js";

const officialApplicationBuilder = "@angular/build:application";

// The conditions @angular/build 22.2's bundler uses when none are configured, chosen from the
// normalized optimization as it chooses them.
function defaultConditions(optimization: JsonObject[string] = true): string[] {
  let scripts = optimization;

  if (typeof optimization === "object" && optimization !== null && !Array.isArray(optimization)) {
    scripts = optimization.scripts;
  }

  if (scripts) {
    return ["module", "production"];
  }

  return ["module", "development"];
}

export default createBuilder<JsonObject>(async (options, context): Promise<BuilderOutput> => {
  let stopped = false;
  let acquisition: Promise<BuilderRun> | undefined;
  let generation: Promise<void> | undefined;
  let cleanup: Promise<void> | undefined;

  function stop(): Promise<void> {
    stopped = true;

    if (!cleanup) {
      const delegateStop = acquisition?.then((run) => run.stop());

      // The builder reports a failed generation itself; stopping only waits for it to settle.
      const drain = generation?.catch(() => undefined);

      cleanup = Promise.all([delegateStop, drain]).then(() => undefined);
    }

    return cleanup;
  }

  context.addTeardown(stop);

  try {
    const { router, official } = split(options);

    if (official.watch === true) {
      throw new Error("The application builder runs once; it does not support watch: true");
    }

    // The schema's false marks an omitted conditions (scripts/builder-schemas.mjs). Omitting it
    // here would reach Angular as an explicit [] again, so Angular's default list goes instead.
    if (official.conditions === false) {
      official.conditions = defaultConditions(official.optimization);
    }

    generation = (async () => {
      const project = context.target?.project;

      if (router.translateSegments === true) {
        if (!project) {
          throw new Error(
            "translateSegments needs the application builder to run as a project target",
          );
        }

        router.localization = await localization(context, project, official.polyfills);
      }

      const words = await generate(context.workspaceRoot, router, () => stopped);

      // Angular's own builder needs a project target to localize, so a build without one fails there.
      if (!project || official.localize === undefined || official.localize === false) {
        return;
      }

      // After generation validated the catalogs, from the same words, so the table and the
      // inlined destination text agree.
      const table = localeTable({
        i18n: await projectI18n(context, project),
        baseHref: official.baseHref,
        localize: official.localize,
        words,
      });

      if (table) {
        for (const warning of localeTableWarnings(table)) {
          context.logger.warn(warning);
        }

        official.define = withLocaleTable(official.define, table);
      }
    })();

    try {
      await generation;
    } catch (error) {
      // Diagnostics, synchronization conflicts and check-mode drift are build failures, not crashes.
      context.logger.error(message(error));

      return { success: false };
    }

    if (stopped) {
      return { success: false };
    }

    acquisition = context.scheduleBuilder(officialApplicationBuilder, official, {
      target: context.target,
    });

    const run = await acquisition;

    if (stopped) {
      await run.stop();

      return { success: false };
    }

    const output = await run.result;

    return output;
  } finally {
    await stop();
  }
});
