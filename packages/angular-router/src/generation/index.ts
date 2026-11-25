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
 * exports and handle members when `copies` is given, and `$localize`-tagged static segments
 * when `options.translateSegments` is true.
 */
export function emitLaunchRoutes(
  sources: Sources,
  copies?: LaunchCopies,
  options: { translateSegments?: boolean } = {},
): Map<string, string> {
  return emit(sources, selections(sources), copies, options);
}

export { CompilerState } from "./compiler.js";
export { AnchorState } from "./anchor.js";
export { createValidationProgram, validateRoutes } from "./validate.js";
export { planOutputs, publish, walk, auditPath, launchMarkers, specifier } from "./files.js";
export { fail, properties } from "./sources.js";
export type { Sources, Declaration } from "./sources.js";
export type { Json, JsonRecord, LaunchCopies } from "./copies.js";
export { segmentMessage, validateLocales } from "./localization.js";
export type { Localization, LocaleWords } from "./localization.js";
export { localization as projectLocalization, projectI18n } from "../builders/options.js";
export {
  changedTableWarning,
  checkDefine as checkLocaleTableDefine,
  localeTable,
  localeTableWarnings,
  withLocaleTable,
} from "../builders/locale-table.js";
export type { LocaleTable } from "../builders/locale-table.js";
export { isInertFileEvent, watchConfigInputs, type ConfigWatch } from "../builders/serve-events.js";
