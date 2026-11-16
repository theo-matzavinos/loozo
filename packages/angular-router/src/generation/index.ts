// Closed integration seam for @loozo/angular-launch. Node-only, not a plugin API.
import { discover, type Sources } from "./sources.js";
import { selections } from "./validate.js";
import { emit } from "./emit.js";
import type { CompilerState } from "./compiler.js";
import type { LaunchCopies } from "./copies.js";

/**
 * Discovers an application's routes in Launch mode: the router's own discovery, with
 * Launch's server aggregate admitted by the import rule and validated as a generated file.
 */
export function discoverLaunchRoutes(
  workspace: string,
  options: { tsconfig: string; scanDirectories: string[]; outDirectory: string },
  compiler?: CompilerState,
): Promise<Sources> {
  return discover(
    workspace,
    options.tsconfig,
    options.scanDirectories,
    options.outDirectory,
    undefined,
    new Map(),
    false,
    true,
    compiler,
  );
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
export { fail, properties } from "./sources.js";
export type { Sources, Declaration } from "./sources.js";
export type { Json, JsonRecord, LaunchCopies } from "./copies.js";
