import { PRIMARY_OUTLET, UrlSegment, UrlSegmentGroup, UrlTree, type Params } from "@angular/router";
import type { Branch, Segment } from "@loozo/angular-router/_core";

/** What typed navigation composes with the current URL: a URL to open, or a branch to close. */
export type Composition =
  | {
      /** A destination's exact URL: primary only, or one named branch below its anchor. */
      readonly open: UrlTree;
    }
  | {
      /** A named-outlet destination's outlet and anchor pattern. */
      readonly close: Branch;
    };

/** A named outlet group hanging below the first `position` primary segments. */
interface NamedGroup {
  readonly position: number;
  readonly outlet: string;
  readonly group: UrlSegmentGroup;
}

interface Flat {
  readonly primary: readonly UrlSegment[];
  readonly named: readonly NamedGroup[];
}

/**
 * The URL typed `link` and `navigate` produce from `base`, the current URL.
 *
 * @remarks
 * Positions count primary URL segments. Comparisons use decoded segment paths and ignore
 * matrix params.
 *
 * - A URL without named groups replaces the primary path, query and fragment, and keeps
 *   each of the base's named groups whose concrete anchor is a prefix of the new path.
 * - A URL with a named group whose anchor is the base's current prefix replaces that
 *   outlet there and keeps everything else, the base's matrix params, query and fragment
 *   included. Off the base's path, its anchor becomes the primary path, with the base's
 *   groups that survive against it and no query or fragment.
 * - A close removes the outlet at the position its anchor pattern matches: a static entry
 *   equals the segment, a scalar takes any one. It reads no value and doesn't compare what
 *   the outlet shows; without a match the result equals the base.
 *
 * Pure: the result shares no group, segment or parameter map with either input.
 */
export function compose(base: UrlTree, input: Composition): UrlTree {
  const current = flatten(base);

  if ("close" in input) {
    const { outlet, anchor } = input.close;
    let named = current.named;

    if (matches(anchor, current.primary)) {
      named = named.filter(
        (group) => !(group.outlet === outlet && group.position === anchor.length),
      );
    }

    return build(current.primary, named, base.queryParams, base.fragment);
  }

  const target = flatten(input.open);

  if (target.named.length === 0) {
    return build(
      target.primary,
      surviving(current.named, current.primary, target.primary),
      input.open.queryParams,
      input.open.fragment,
    );
  }

  let primary = current.primary;
  let named = current.named;
  let queryParams = base.queryParams;
  let fragment = base.fragment;

  if (!prefix(target.primary, current.primary)) {
    primary = target.primary;
    named = surviving(current.named, current.primary, target.primary);
    queryParams = input.open.queryParams;
    fragment = input.open.fragment;
  }

  const replaced = named.filter(
    (group) =>
      !target.named.some(
        (opened) => opened.outlet === group.outlet && opened.position === group.position,
      ),
  );

  return build(primary, [...replaced, ...target.named], queryParams, fragment);
}

function flatten(tree: UrlTree): Flat {
  const primary: UrlSegment[] = [];
  const named: NamedGroup[] = [];

  for (
    let group: UrlSegmentGroup | undefined = tree.root;
    group !== undefined;
    group = group.children[PRIMARY_OUTLET]
  ) {
    primary.push(...group.segments);

    for (const [outlet, child] of Object.entries(group.children)) {
      if (outlet !== PRIMARY_OUTLET) {
        named.push({ position: primary.length, outlet, group: child });
      }
    }
  }

  return { primary, named };
}

// Whether `anchor`'s concrete segments start `path`.
function prefix(anchor: readonly UrlSegment[], path: readonly UrlSegment[]): boolean {
  if (anchor.length > path.length) {
    return false;
  }

  for (let index = 0; index < anchor.length; index += 1) {
    if (anchor[index].path !== path[index].path) {
      return false;
    }
  }

  return true;
}

// The base's groups whose concrete anchor in the base is also the new path's prefix.
function surviving(
  named: readonly NamedGroup[],
  from: readonly UrlSegment[],
  to: readonly UrlSegment[],
): NamedGroup[] {
  const kept: NamedGroup[] = [];

  for (const group of named) {
    if (prefix(from.slice(0, group.position), to)) {
      kept.push(group);
    }
  }

  return kept;
}

function matches(pattern: readonly Segment[], path: readonly UrlSegment[]): boolean {
  if (pattern.length > path.length) {
    return false;
  }

  for (let index = 0; index < pattern.length; index += 1) {
    const entry = pattern[index];

    if (entry.kind === "static" && entry.text !== path[index].path) {
      return false;
    }
  }

  return true;
}

function copySegment(segment: UrlSegment): UrlSegment {
  return new UrlSegment(segment.path, { ...segment.parameters });
}

function copyGroup(group: UrlSegmentGroup): UrlSegmentGroup {
  const children: Record<string, UrlSegmentGroup> = {};

  for (const [outlet, child] of Object.entries(group.children)) {
    children[outlet] = copyGroup(child);
  }

  return new UrlSegmentGroup(group.segments.map(copySegment), children);
}

function copyParams(params: Params): Params {
  const copied: Params = {};

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      copied[key] = [...value];
    } else {
      copied[key] = value;
    }
  }

  return copied;
}

// Splits the primary path into groups at each position that holds a named group.
function build(
  primary: readonly UrlSegment[],
  named: readonly NamedGroup[],
  queryParams: Params,
  fragment: string | null,
): UrlTree {
  function childrenAt(position: number): Record<string, UrlSegmentGroup> {
    const children: Record<string, UrlSegmentGroup> = {};

    for (const group of named) {
      if (group.position === position) {
        children[group.outlet] = copyGroup(group.group);
      }
    }

    if (position < primary.length) {
      let end = primary.length;

      for (const group of named) {
        if (group.position > position && group.position < end) {
          end = group.position;
        }
      }

      children[PRIMARY_OUTLET] = new UrlSegmentGroup(
        primary.slice(position, end).map(copySegment),
        childrenAt(end),
      );
    }

    return children;
  }

  return new UrlTree(new UrlSegmentGroup([], childrenAt(0)), copyParams(queryParams), fragment);
}
