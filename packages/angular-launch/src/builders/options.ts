import { targetFromTargetString, type BuilderContext } from "@angular-devkit/architect";
import type { GenerationOptions } from "../generation/index.js";

export type JsonObject = NonNullable<Parameters<BuilderContext["scheduleBuilder"]>[1]>;

export const applicationBuilder = "@loozo/angular-launch:application";

function validateLaunchOptions(value: JsonObject): asserts value is JsonObject & GenerationOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Launch options must be an object");
  }

  for (const key of ["tsconfig", "outDirectory"] as const) {
    const option = value[key];

    if (typeof option !== "string" || option.trim() === "") {
      throw new Error(`Launch option ${key} must be a nonempty string`);
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

  for (const key of ["tanstackQuery", "check"] as const) {
    if (Object.hasOwn(value, key) && typeof value[key] !== "boolean") {
      throw new Error(`${key} must be a boolean`);
    }
  }
}

export function message(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

// Launch options drive generation; everything else belongs to Angular's application builder.
export function split(options: JsonObject): { launch: GenerationOptions; official: JsonObject } {
  validateLaunchOptions(options);

  const { tsconfig, scanDirectories, outDirectory, tanstackQuery, check, ...official } = options;
  const launch: GenerationOptions = { tsconfig, scanDirectories, outDirectory };

  if (tanstackQuery !== undefined) {
    launch.tanstackQuery = tanstackQuery;
  }

  if (check !== undefined) {
    launch.check = check;
  }

  return { launch, official };
}

// Launch options for serve come from its build target, resolved as Angular's dev server resolves it.
export async function buildTargetOptions(
  context: BuilderContext,
  buildTarget: string,
): Promise<GenerationOptions> {
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
  const { launch } = split(options);

  if (launch.check === true) {
    throw new Error("Serve writes generated files; its buildTarget must not resolve check: true");
  }

  return launch;
}
