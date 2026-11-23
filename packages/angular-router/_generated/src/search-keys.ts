import {
  destinationRecord,
  isArrayCodec,
  type AnyRoute,
  type Destination,
  type ParamCodec,
} from "@loozo/angular-router/_core";
import { parse } from "./inputs.js";

/**
 * The declaration that declares `key` of `destination`'s effective search: the destination
 * itself or an ancestor. Search keys are inherited unchanged, so the walk always ends there.
 */
export function ownerOf(destination: Destination<AnyRoute>, key: string): Destination<AnyRoute> {
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
export function presentValue(codec: ParamCodec<any>, raws: readonly string[]): unknown {
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
