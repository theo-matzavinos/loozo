import { positionKey } from "./validate.js";
import type { Declaration, Sources } from "./sources.js";

// The ".." target of each retained declaration: the canonical destination of its nearest
// ancestor with a shorter effective path, or of the root path for a top-level route.
// Pathless ancestors share their child's path, so they are skipped. Inside a named outlet
// the walk stays in the branch, so a branch root has none.
export function parentTargets(
  sources: Sources,
  selected: ReadonlyMap<string, Declaration>,
): Map<string, string> {
  const result = new Map<string, string>();

  for (const origin of sources.declarations) {
    if (!origin.retained || origin.effective.length === 0 || origin.outlet !== undefined) {
      continue;
    }

    let ancestor = origin.parent;

    while (ancestor && ancestor.effective.length >= origin.effective.length) {
      // A branch member's walk ends at its branch root; the primary path isn't its parent.
      if (origin.branch && ancestor.outlet !== undefined) {
        ancestor = undefined;

        break;
      }

      ancestor = ancestor.parent;
    }

    let key = positionKey({ effective: [] });

    if (ancestor) {
      key = positionKey(ancestor);
    } else if (origin.branch) {
      continue;
    }

    const target = selected.get(key);

    if (target) {
      result.set(origin.id, target.id);
    }
  }

  return result;
}
