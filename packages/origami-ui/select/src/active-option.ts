/**
 * The Select's active-option rules: where a key moves the highlighted option. Pure and
 * framework-free; the Select Context feeds them its registered options in DOM order at event time.
 * Typeahead is the shared `ɵmatchTypeahead` and `ɵTypeaheadBuffer` from /collection.
 * Package-private.
 */

/** What the rules read from an option, at event time. */
export interface ActiveOptionCandidate {
  disabled(): boolean;
}

/** A keyboard move of the active option. Moves don't wrap; pages move ten enabled options. */
export type ActiveOptionMove = "first" | "last" | "next" | "previous" | "pageUp" | "pageDown";

const pageSize = 10;

/**
 * The option a move lands on.
 * @param options - Registered options in DOM order.
 * @param active - The current active option, or null. A disabled or unregistered active option
 *   keeps its DOM position: the next move goes to the enabled option after it.
 * @param move - The move.
 * @returns The target, which is `active` itself when a move can't go further; null when no
 *   option is enabled. Without an active option, forward moves land on the first enabled option
 *   and backward moves on the last.
 */
export function moveActiveOption<C extends ActiveOptionCandidate>(
  options: readonly C[],
  active: C | null,
  move: ActiveOptionMove,
): C | null {
  const enabled: C[] = [];
  // The number of enabled options before the active one in DOM order; -1 without an active one.
  let before = -1;
  let activeEnabled = false;

  for (const option of options) {
    if (option === active) {
      before = enabled.length;
      activeEnabled = !option.disabled();
    }

    if (!option.disabled()) {
      enabled.push(option);
    }
  }

  const last = enabled.length - 1;

  if (last < 0) {
    return null;
  }

  if (move === "first") {
    return enabled[0];
  }

  if (move === "last") {
    return enabled[last];
  }

  if (before === -1) {
    if (move === "next" || move === "pageDown") {
      return enabled[0];
    }

    return enabled[last];
  }

  // An enabled active option sits at `before`; a disabled one sits between `before - 1` and `before`.
  let forward = before;
  let backward = before - 1;

  if (activeEnabled) {
    forward = before + 1;
    backward = before - 1;
  }

  if (move === "next") {
    return enabled[Math.min(forward, last)];
  }

  if (move === "previous") {
    return enabled[Math.max(backward, 0)];
  }

  if (move === "pageDown") {
    return enabled[Math.min(forward + pageSize - 1, last)];
  }

  return enabled[Math.max(backward - pageSize + 1, 0)];
}
