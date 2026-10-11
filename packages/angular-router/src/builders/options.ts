import {
  targetFromTargetString,
  type BuilderContext,
  type Target,
} from "@angular-devkit/architect";
import type { GenerationOptions } from "../generation/generate.js";

export interface Options extends GenerationOptions {
  delegateTarget: string;
}

export function validateOptions(value: Options, serve: boolean): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Companion options must be an object");
  }

  const allowed = new Set([
    "tsconfig",
    "scanDirectories",
    "outDirectory",
    "delegateTarget",
    "autoDefineRoutes",
  ]);

  if (!serve) {
    allowed.add("check");
  }

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown companion option: ${key}`);
    }
  }

  for (const key of ["tsconfig", "outDirectory", "delegateTarget"] as const) {
    if (typeof value[key] !== "string" || value[key].trim() === "") {
      throw new Error(`Companion option ${key} must be a nonempty string`);
    }
  }

  if (
    !Array.isArray(value.scanDirectories) ||
    value.scanDirectories.length !== 1 ||
    value.scanDirectories.some((scan) => typeof scan !== "string" || scan.trim() === "")
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

function explicitTarget(value: string): Target {
  const parts = value.split(":");

  if (parts.length < 2 || parts.length > 3 || parts.some((part) => part.trim() === "")) {
    throw new Error(`delegateTarget must explicitly name project:target[:configuration]: ${value}`);
  }

  return targetFromTargetString(value);
}

async function official(context: BuilderContext, target: Target, expected: string) {
  const [builder, options] = await Promise.all([
    context.getBuilderNameForTarget(target),
    context.getTargetOptions(target),
  ]);

  if (builder !== expected) {
    throw new Error(
      `Delegate ${target.project}:${target.target} must use ${expected}, not ${builder}`,
    );
  }

  return context.validateOptions(options, builder);
}

export async function delegate(
  context: BuilderContext,
  options: Options,
  serve: boolean,
): Promise<Target> {
  validateOptions(options, serve);

  const target = explicitTarget(options.delegateTarget);

  if (context.target?.project === target.project && context.target.target === target.target) {
    throw new Error("Every configuration of the current companion target is forbidden as delegate");
  }

  if (!serve) {
    const resolved = await official(context, target, "@angular/build:application");

    if (resolved.watch === true) {
      throw new Error("Application delegate must not have resolved watch:true");
    }

    return target;
  }

  const resolved = await official(context, target, "@angular/build:dev-server");
  let buildTarget = resolved.buildTarget;

  if (buildTarget === undefined) {
    buildTarget = "::development";
  }

  if (typeof buildTarget !== "string" || buildTarget.split(":").length > 3) {
    throw new Error("Official dev-server buildTarget is malformed");
  }

  const application = targetFromTargetString(buildTarget, target.project, "build");

  await official(context, application, "@angular/build:application");

  return target;
}
