import { resolve } from "node:path";
import { discover } from "./sources.js";
import { createValidationProgram, selections, validateRoutes } from "./validate.js";
import { emit } from "./emit.js";
import { auditPath, metadata, planOutputs, publish, walk } from "./files.js";
import type { AutoDefineRoutes } from "./filesystem.js";
import type { CompilerState } from "./compiler.js";
import type { AnchorState } from "./anchor.js";

export interface GenerationOptions {
  tsconfig: string;
  scanDirectories: string[];
  outDirectory: string;
  check?: boolean;
  // Omitted enables filesystem route definitions with route.ts; false selects explicit authoring.
  autoDefineRoutes?: AutoDefineRoutes | false;
}

// Compiler state reused across one owner's sequential passes. The owner clears
// every slot after a failed or stopped pass and when it is released.
export interface GenerationState {
  discovery: CompilerState;
  overlay: CompilerState;
  anchor: AnchorState;
}

export async function generate(
  workspace: string,
  options: GenerationOptions,
  stopped: () => boolean,
  state?: GenerationState,
): Promise<void> {
  const { autoDefineRoutes = {} } = options;
  let auto: AutoDefineRoutes | undefined;

  if (autoDefineRoutes !== false) {
    auto = autoDefineRoutes;
  }

  const sources = await discover(
    workspace,
    options.tsconfig,
    options.scanDirectories,
    options.outDirectory,
    auto,
    undefined,
    undefined,
    undefined,
    state?.discovery,
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

  const validation = createValidationProgram(sources, desired, plan.stale, state?.overlay);

  await validateRoutes(sources, desired, validation, state?.anchor);

  publish(plan, options.check === true, stopped, sources.authored, seeds);
}
