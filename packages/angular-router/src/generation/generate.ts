import { resolve } from "node:path";
import { discover } from "./sources.js";
import { selections, validateProgram } from "./validate.js";
import { emit } from "./emit.js";
import { auditPath, metadata, planOutputs, publish, walk } from "./files.js";
import type { AutoDefineRoutes } from "./filesystem.js";

export interface GenerationOptions {
  tsconfig: string;
  scanDirectories: string[];
  outDirectory: string;
  check?: boolean;
  autoDefineRoutes?: AutoDefineRoutes;
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
    options.autoDefineRoutes,
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
  const seeds = new Set<string>();

  for (const file of sources.authored.keys()) {
    await auditPath(file);

    const info = await metadata(file);

    if (!info) {
      seeds.add(file);
    } else if (!info.isFile()) {
      throw new Error(`Filesystem definition is not a regular file: ${file}`);
    }
  }

  await validateProgram(sources, desired, plan.stale);
  publish(plan, options.check === true, stopped, sources.authored, seeds);
}
