// Closed integration seam for @loozo/angular-launch. Node-only, not a plugin API.
import { discover } from "./sources.js";
import { selections } from "./validate.js";
import { emit } from "./emit.js";
import type { CompilerState } from "./compiler.js";

export async function prepareLaunchRoutes(
  workspace: string,
  options: { tsconfig: string; scanDirectories: string[]; outDirectory: string },
  typeEntry: string,
  compiler?: CompilerState,
) {
  const sources = await discover(
    workspace,
    options.tsconfig,
    options.scanDirectories,
    options.outDirectory,
    undefined,
    new Map(),
    false,
    { typeEntry },
    compiler,
  );
  const desired = emit(sources, selections(sources));

  return { sources, desired };
}

export { CompilerState } from "./compiler.js";
export { createValidationProgram, validateRoutes } from "./validate.js";
export { planOutputs, publish, walk, auditPath, launchMarkers } from "./files.js";
export { fail, properties, namedImport, genuineImport } from "./sources.js";
export { specifier } from "./emit.js";
export type { Sources, Declaration, LaunchDeclaration } from "./sources.js";
