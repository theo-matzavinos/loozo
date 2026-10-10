import { authoredPath } from "./validate.js";
import type { Declaration, Sources } from "./sources.js";

// Compile URL-template segment relationships, never authored directory ancestry.
export function relativeSelections(
  sources: Sources,
  selected: ReadonlyMap<string, Declaration>,
): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();

  for (const origin of sources.declarations) {
    if (!origin.retained) {
      continue;
    }

    const expressions = new Map<string, string>();

    result.set(origin.id, expressions);

    if (origin.effective.some((segment) => segment.kind === "catchall")) {
      continue;
    }

    let originParts: string[] = [];

    if (origin.effective.length > 0) {
      originParts = authoredPath(origin).slice(1).split("/");
    }

    for (let climb = 0; climb <= originParts.length; climb += 1) {
      const prefix = originParts.slice(0, originParts.length - climb);
      const steps: string[] = [];

      for (let index = 0; index < climb; index += 1) {
        steps.push("..");
      }

      for (const [path, target] of selected) {
        let targetParts: string[] = [];

        if (target.effective.length > 0) {
          targetParts = path.slice(1).split("/");
        }

        if (prefix.length > targetParts.length) {
          continue;
        }

        let matches = true;

        for (let index = 0; index < prefix.length; index += 1) {
          if (prefix[index] !== targetParts[index]) {
            matches = false;

            break;
          }
        }

        if (!matches) {
          continue;
        }

        const suffix = targetParts.slice(prefix.length);

        if (suffix.some((part) => part.includes("?") || part.includes("#"))) {
          continue;
        }

        let expression = "./";

        if (climb > 0) {
          expression = steps.join("/");

          if (suffix.length === 0) {
            expressions.set(expression, target.id);
          }

          expression += "/";
        }

        expression += suffix.join("/");
        expressions.set(expression, target.id);
      }
    }
  }

  return result;
}
