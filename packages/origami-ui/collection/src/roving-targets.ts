/**
 * The roving focus's rules: which member a key or an edge moves focus to and which members
 * typeahead searches. Pure and framework-free; `ɵOrigamiRovingFocusContext` feeds them its
 * registered members in DOM order at event time. Package-private.
 */
import type { Signal } from "@angular/core";

/** A widget's arrow keys: one orientation, or `both` for a widget with no orientation (RadioGroup). */
export type Orientation = "horizontal" | "vertical" | "both";
export type Move = "next" | "previous" | "first" | "last";

/**
 * One item host: its element and the value, disabled state and disabled focusability it
 * registers, and its typeahead text, read when a key is pressed, if it takes part in typeahead.
 */
export type Member = {
  readonly element: HTMLElement;
  readonly value: Signal<string>;
  readonly disabled: Signal<boolean>;
  readonly focusable: Signal<boolean>;
  readonly label: (() => string) | null;
};

/** Whether a member can take focus: enabled, or disabled but focusable. */
export function reachable(member: Member): boolean {
  return !member.disabled() || member.focusable();
}

/**
 * Maps a key to a move. Horizontal arrows follow reading direction; vertical arrows ignore it.
 * `both` takes the vertical and the horizontal arrows.
 */
export function moveFor(key: string, orientation: Orientation, rtl: boolean): Move | null {
  if (key === "Home") {
    return "first";
  }

  if (key === "End") {
    return "last";
  }

  if (orientation !== "horizontal") {
    if (key === "ArrowDown") {
      return "next";
    }

    if (key === "ArrowUp") {
      return "previous";
    }
  }

  if (orientation === "vertical") {
    return null;
  }

  if (key === "ArrowRight") {
    if (rtl) {
      return "previous";
    }

    return "next";
  }

  if (key === "ArrowLeft") {
    if (rtl) {
      return "next";
    }

    return "previous";
  }

  return null;
}

/**
 * Walks DOM order from `current`, skipping members that can't take focus and wrapping at both
 * ends. `first` and `last` ignore `current`; `next` and `previous` without one find nothing.
 */
export function targetOf(
  ordered: readonly Member[],
  current: Member | null,
  move: Move,
): Member | null {
  const targets: Member[] = [];

  for (const member of ordered) {
    if (reachable(member)) {
      targets.push(member);
    }
  }

  if (targets.length === 0) {
    return null;
  }

  if (move === "first") {
    return targets[0];
  }

  if (move === "last") {
    return targets[targets.length - 1];
  }

  if (current === null) {
    return null;
  }

  const start = ordered.indexOf(current);

  if (start === -1) {
    return null;
  }

  let step = 1;

  if (move === "previous") {
    step = -1;
  }

  for (let offset = 1; offset <= ordered.length; offset += 1) {
    const index = (((start + step * offset) % ordered.length) + ordered.length) % ordered.length;
    const candidate = ordered[index];

    if (reachable(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * The members typeahead searches, in DOM order: those that can take focus, a focusable disabled
 * one included, and registered a typeahead text.
 */
export function searchable(ordered: readonly Member[]): Member[] {
  const candidates: Member[] = [];

  for (const member of ordered) {
    if (member.label !== null && reachable(member)) {
      candidates.push(member);
    }
  }

  return candidates;
}
