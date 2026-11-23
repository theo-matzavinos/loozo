import {
  destinationRecord,
  isArrayCodec,
  isRetained,
  type AnyRoute,
  type Destination,
  type ParamCodec,
} from "@loozo/angular-router/_core";
import type { NavigationState } from "./base.js";
import { parse } from "./inputs.js";

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

// Search keys are inherited unchanged, so the walk always ends at the declaring ancestor.
function ownerOf(destination: Destination<AnyRoute>, key: string): Destination<AnyRoute> {
  let owner = destination;

  for (;;) {
    const { url } = destinationRecord(owner);

    if (Object.hasOwn(url.localSearch, key) || !url.parent) {
      return owner;
    }

    owner = url.parent;
  }
}

/** A present valid value of one key, parsed by §4's rules, or undefined. */
function presentValue(codec: ParamCodec<any>, raws: readonly string[]): unknown {
  if (isArrayCodec(codec)) {
    if (raws.length === 0) {
      return undefined;
    }

    const values: unknown[] = [];

    for (const raw of raws) {
      const result = parse(codec, raw);

      if ("cause" in result) {
        return undefined;
      }

      values.push(result.value);
    }

    return values;
  }

  if (raws.length !== 1) {
    return undefined;
  }

  const result = parse(codec, raws[0]);

  if ("cause" in result) {
    return undefined;
  }

  return result.value;
}
