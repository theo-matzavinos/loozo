import { createBuilder, type BuilderRun, type BuilderOutput } from "@angular-devkit/architect";
import { generate } from "../generation/generate.js";
import { delegate, type Options } from "./options.js";

export default createBuilder<Options>(async (options, context): Promise<BuilderOutput> => {
  let stopped = false;
  let acquisition: Promise<BuilderRun> | undefined;
  let generation: Promise<void> | undefined;
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
    const target = await delegate(context, options, false);

    if (stopped) {
      return { success: false };
    }

    generation = generate(context.workspaceRoot, options, () => stopped);
    await generation;

    if (stopped) {
      return { success: false };
    }

    acquisition = context.scheduleTarget(target);

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
