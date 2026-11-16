// Closed integration seam for @loozo/angular-launch. Node-only, not a plugin API.
import { discover, type Sources } from "./sources.js";
import { selections } from "./validate.js";
import { emit } from "./emit.js";
import type { CompilerState } from "./compiler.js";
import type { LaunchCopies } from "./copies.js";

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
  const desired = emitLaunchRoutes(sources);

  return { sources, desired };
}

/**
 * The router's generated files for discovered routes, with Launch's copy data, type
 * exports and handle members when `copies` is given.
 */
export function emitLaunchRoutes(sources: Sources, copies?: LaunchCopies): Map<string, string> {
  return emit(sources, selections(sources), copies);
}

export { CompilerState } from "./compiler.js";
export { AnchorState } from "./anchor.js";
export { createValidationProgram, validateRoutes } from "./validate.js";
export { planOutputs, publish, walk, auditPath, launchMarkers, specifier } from "./files.js";
export { fail, properties, namedImport, genuineImport } from "./sources.js";
export type { Sources, Declaration, LaunchDeclaration } from "./sources.js";
export type { Json, JsonRecord, LaunchCopies } from "./copies.js";
