import { resolve } from "node:path";
import { discover } from "./sources.js";
import { selections, validateProgram } from "./validate.js";
import { emit } from "./emit.js";
import { planOutputs, publish, walk } from "./files.js";

export interface GenerationOptions {
  tsconfig: string;
  scanDirectories: string[];
  outDirectory: string;
  check?: boolean;
}

export async function generate(
  workspace: string,
  options: GenerationOptions,
  stopped: () => boolean,
): Promise<void> {
  const sources = await discover(
    workspace,
    options.tsconfig,
    options.scanDirectories,
    options.outDirectory,
  );
  const selected = selections(sources);
  const desired = emit(sources, selected);
  const globalFiles = [
    resolve(sources.output, "routes.generated.ts"),
    resolve(sources.output, "destinations.generated.ts"),
  ];

  await walk(sources.output);

  const plan = await planOutputs(desired, sources.encountered, globalFiles);

  // Unrelated output contents are audited but never become cleanup candidates.
  await validateProgram(sources, desired, plan.stale);
  publish(plan, options.check === true, stopped);
}
