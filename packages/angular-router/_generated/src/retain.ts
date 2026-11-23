import {
  destinationRecord,
  isRetained,
  type AnyRoute,
  type Destination,
  type ParamCodec,
} from "@loozo/angular-router/_core";
import type { NavigationState } from "./base.js";
import { ownerOf, presentValue } from "./search-keys.js";

/** A retained key a destination inherits or declares, and the declaration that owns it. */
interface RetainedKey {
  readonly key: string;
  readonly codec: ParamCodec<any>;
  readonly owner: Destination<AnyRoute>;
}

const noKeys: readonly RetainedKey[] = Object.freeze([]);
const retainedKeyCache = new WeakMap<Destination<AnyRoute>, readonly RetainedKey[]>();

/**
 * The retained keys of the target that the caller's search omits, each with the value
 * `link` and `navigate` copy from the current URL: those whose owner that URL is inside and
 * that hold a present valid value there. Undefined when none is copied.
 *
 * @remarks
 * Call it with values `createUrl` already accepted for the target. A scalar key needs
 * exactly one value that parses to something other than `undefined`; an array key needs at
 * least one value, each parsing. The copy is the parsed value, which `withSearch` writes as
 * `createUrl` would. An own `search` entry, `undefined` included, is the caller's choice and
 * is never replaced. Branch destinations take params only and retain nothing.
 */
export function retainedSearch(
  target: Destination<AnyRoute>,
  values: Readonly<Record<string, unknown>>,
  current: NavigationState,
): Readonly<Record<string, unknown>> | undefined {
  const keys = retainedKeys(target);

  if (keys.length === 0) {
    return undefined;
  }

  const search = values.search as object | undefined;
  let copied: Record<string, unknown> | undefined;

  for (const { key, codec, owner } of keys) {
    if (search !== undefined && Object.hasOwn(search, key)) {
      continue;
    }

    if (!current.owners.has(owner)) {
      continue;
    }

    const value = presentValue(codec, current.tree.queryParamMap.getAll(key));

    if (value !== undefined) {
      copied ??= Object.create(null) as Record<string, unknown>;
      copied[key] = value;
    }
  }

  return copied;
}

function retainedKeys(target: Destination<AnyRoute>): readonly RetainedKey[] {
  const cached = retainedKeyCache.get(target);

  if (cached) {
    return cached;
  }

  const { url } = destinationRecord(target);
  let keys = noKeys;

  if (!url.branch) {
    const found: RetainedKey[] = [];

    for (const key of Object.keys(url.search)) {
      const codec = url.search[key];

      if (isRetained(codec)) {
        found.push({ key, codec, owner: ownerOf(target, key) });
      }
    }

    if (found.length > 0) {
      keys = Object.freeze(found);
    }
  }

  retainedKeyCache.set(target, keys);

  return keys;
}
