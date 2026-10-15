import { createBuilder, type BuilderRun, type BuilderOutput } from "@angular-devkit/architect";
import { generate } from "../generation/generate.js";
import { message, split, type JsonObject } from "./options.js";

const officialApplicationBuilder = "@angular/build:application";

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

    generation = generate(context.workspaceRoot, router, () => stopped);

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
