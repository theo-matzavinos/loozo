import { targetFromTargetString, type BuilderContext } from "@angular-devkit/architect";
import { join } from "node:path";
import type { GenerationOptions } from "../generation/generate.js";
import type { Localization } from "../generation/localization.js";
import { checkDefine } from "./locale-table.js";

export type JsonObject = NonNullable<Parameters<BuilderContext["scheduleBuilder"]>[1]>;

export const applicationBuilder = "@loozo/angular-router:application";

function validateRouterOptions(value: JsonObject): asserts value is JsonObject & GenerationOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Router options must be an object");
  }

  for (const key of ["tsconfig", "outDirectory"] as const) {
    const option = value[key];

    if (typeof option !== "string" || option.trim() === "") {
      throw new Error(`Router option ${key} must be a nonempty string`);
    }
  }

  const scanDirectories = value.scanDirectories;

  if (
    !Array.isArray(scanDirectories) ||
    scanDirectories.length !== 1 ||
    scanDirectories.some((scan) => typeof scan !== "string" || scan.trim() === "")
  ) {
    throw new Error("scanDirectories must contain exactly one nonempty string");
  }

  const auto = value.autoDefineRoutes;

  if (auto !== undefined && auto !== false) {
    if (!auto || typeof auto !== "object" || Array.isArray(auto)) {
      throw new Error("autoDefineRoutes must be false or an object");
    }

    for (const key of Object.keys(auto)) {
      if (key !== "filename") {
        throw new Error(`Unknown autoDefineRoutes option: ${key}`);
      }
    }

    if (auto.filename !== undefined) {
      const filename = auto.filename;

      if (
        typeof filename !== "string" ||
        !/^[A-Za-z0-9_$][A-Za-z0-9_$.-]*\.ts$/.test(filename) ||
        filename.endsWith(".d.ts") ||
        [
          "route.generated.ts",
          "destination.generated.ts",
          "children.generated.ts",
          "routes.generated.ts",
        ].includes(filename)
      ) {
        throw new Error(
          "autoDefineRoutes.filename must be a simple implementation .ts basename, not a generated artifact",
        );
      }
    }
  }

  if (Object.hasOwn(value, "check") && typeof value.check !== "boolean") {
    throw new Error("check must be a boolean");
  }

  if (Object.hasOwn(value, "translateSegments") && typeof value.translateSegments !== "boolean") {
    throw new Error("translateSegments must be a boolean");
  }
}

export function message(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

// Router options drive generation; everything else belongs to Angular's application builder.
export function split(options: JsonObject): { router: GenerationOptions; official: JsonObject } {
  validateRouterOptions(options);

  const {
    tsconfig,
    scanDirectories,
    outDirectory,
    autoDefineRoutes,
    check,
    translateSegments,
    ...official
  } = options;
  const router: GenerationOptions = { tsconfig, scanDirectories, outDirectory };

  checkDefine(official.define);

  if (autoDefineRoutes !== undefined) {
    router.autoDefineRoutes = autoDefineRoutes;
  }

  if (check !== undefined) {
    router.check = check;
  }

  if (translateSegments !== undefined) {
    router.translateSegments = translateSegments;
  }

  return { router, official };
}

function translationFiles(value: unknown, locale: string): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value) && value.every((file) => typeof file === "string")) {
    return value;
  }

  throw new Error(`Project i18n locale ${locale} must name a translation file or a list of them`);
}

/**
 * The project's i18n configuration and the build's polyfills, normalized as Angular's
 * application builder normalizes them (@angular/build 22.3 i18n-options): the source locale is a
 * string or `{ code }` (en-US when omitted), each locale a file, a list or `{ translation }`, and
 * file paths are joined to the workspace root.
 */
export async function localization(
  context: BuilderContext,
  project: string,
  polyfills: unknown,
): Promise<Localization> {
  const metadata = await context.getProjectMetadata(project);
  const i18n = metadata.i18n ?? {};

  if (!i18n || typeof i18n !== "object" || Array.isArray(i18n)) {
    throw new Error("Project i18n must be an object");
  }

  let sourceLocale = "en-US";
  const source = i18n.sourceLocale;

  if (typeof source === "string") {
    sourceLocale = source;
  } else if (source && typeof source === "object" && !Array.isArray(source)) {
    if (typeof source.code === "string") {
      sourceLocale = source.code;
    }
  }

  const locales: { code: string; files: string[] }[] = [];
  const configured = i18n.locales ?? {};

  if (!configured || typeof configured !== "object" || Array.isArray(configured)) {
    throw new Error("Project i18n locales must be an object");
  }

  for (const [code, value] of Object.entries(configured)) {
    let files: string[];

    if (value && typeof value === "object" && !Array.isArray(value) && "translation" in value) {
      files = translationFiles(value.translation, code);
    } else {
      files = translationFiles(value, code);
    }

    const absolute: string[] = [];

    for (const file of files) {
      absolute.push(join(context.workspaceRoot, file));
    }

    locales.push({ code, files: absolute });
  }

  let list: string[] = [];

  if (typeof polyfills === "string") {
    list = [polyfills];
  } else if (Array.isArray(polyfills)) {
    for (const polyfill of polyfills) {
      if (typeof polyfill === "string") {
        list.push(polyfill);
      }
    }
  }

  return { sourceLocale, locales, polyfills: list };
}

/** The project's raw `i18n` metadata, which the locale table normalizes as Angular does. */
export async function projectI18n(context: BuilderContext, project: string): Promise<unknown> {
  const metadata = await context.getProjectMetadata(project);

  return metadata.i18n;
}

// Router options for serve come from its build target, resolved as Angular's dev server resolves
// it. The official options give the locale table its baseHref and localize; project is the build
// target's.
export async function buildTargetOptions(
  context: BuilderContext,
  buildTarget: string,
): Promise<{ router: GenerationOptions; official: JsonObject; project: string }> {
  const project = context.target?.project;

  if (!project) {
    throw new Error("The serve builder must run as a project target");
  }

  const target = targetFromTargetString(buildTarget, project, "build");
  const [builder, raw] = await Promise.all([
    context.getBuilderNameForTarget(target),
    context.getTargetOptions(target),
  ]);

  if (builder !== applicationBuilder) {
    throw new Error(
      `buildTarget ${target.project}:${target.target} must use ${applicationBuilder}, not ${builder}`,
    );
  }

  const options = await context.validateOptions(raw, builder);
  const { router, official } = split(options);

  if (router.check === true) {
    throw new Error("Serve writes generated files; its buildTarget must not resolve check: true");
  }

  if (router.translateSegments === true) {
    router.localization = await localization(context, target.project, official.polyfills);
  }

  return { router, official, project: target.project };
}
