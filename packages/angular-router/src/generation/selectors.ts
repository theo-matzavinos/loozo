import { authoredPath } from "./validate.js";
import type { Declaration, Sources } from "./sources.js";

// The ".." target of each retained declaration: the canonical destination of its nearest
// ancestor with a shorter effective path, or of the root path for a top-level route.
// Pathless ancestors share their child's path, so they are skipped.
export function parentTargets(
  sources: Sources,
  selected: ReadonlyMap<string, Declaration>,
): Map<string, string> {
  const result = new Map<string, string>();

  for (const origin of sources.declarations) {
    if (!origin.retained || origin.effective.length === 0) {
      continue;
    }

    let ancestor = origin.parent;

    while (ancestor && ancestor.effective.length >= origin.effective.length) {
      ancestor = ancestor.parent;
    }

    let path = "/";

    if (ancestor) {
      path = authoredPath(ancestor);
    }

    const target = selected.get(path);

    if (target) {
      result.set(origin.id, target.id);
    }
  }

  return result;
}
