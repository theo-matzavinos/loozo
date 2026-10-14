import { targetFromTargetString, type BuilderContext } from "@angular-devkit/architect";
import type { GenerationOptions } from "../generation/generate.js";

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

  if (value.autoDefineRoutes !== undefined) {
    const auto = value.autoDefineRoutes;

    if (!auto || typeof auto !== "object" || Array.isArray(auto)) {
      throw new Error("autoDefineRoutes must be an object");
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
        ["route.generated.ts", "routes.generated.ts", "destinations.generated.ts"].includes(
          filename,
        )
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
}

// Router options drive generation; everything else belongs to Angular's application builder.
export function split(options: JsonObject): { router: GenerationOptions; official: JsonObject } {
  validateRouterOptions(options);

  const { tsconfig, scanDirectories, outDirectory, autoDefineRoutes, check, ...official } = options;
  const router: GenerationOptions = { tsconfig, scanDirectories, outDirectory };

  if (autoDefineRoutes !== undefined) {
    router.autoDefineRoutes = autoDefineRoutes;
  }

  if (check !== undefined) {
    router.check = check;
  }

  return { router, official };
}

// Router options for serve come from its build target, resolved as Angular's dev server resolves it.
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
  const { router } = split(options);

  if (router.check === true) {
    throw new Error("Serve writes generated files; its buildTarget must not resolve check: true");
  }

  return router;
}
