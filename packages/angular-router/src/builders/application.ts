import { createBuilder, type BuilderRun, type BuilderOutput } from "@angular-devkit/architect";
import { generate } from "../generation/generate.js";
import { split, type JsonObject } from "./options.js";

const officialApplicationBuilder = "@angular/build:application";

export default createBuilder<JsonObject>(async (options, context): Promise<BuilderOutput> => {
  let stopped = false;
  let acquisition: Promise<BuilderRun> | undefined;
  let generation: Promise<string[]> | undefined;
  let cleanup: Promise<void> | undefined;

  function stop(): Promise<void> {
    stopped = true;

    if (!cleanup) {
      const delegateStop = acquisition?.then((run) => run.stop());

      cleanup = Promise.all([delegateStop, generation]).then(() => undefined);
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
    await generation;

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
