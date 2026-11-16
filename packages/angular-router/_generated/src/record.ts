import type { Route } from "@angular/router";
import { destinationRecord, type AnyRoute, type Destination } from "@loozo/angular-router/_core";

/**
 * Own symbols that generated code stamps onto its native route records. Module-private, so
 * nothing outside this package instance can forge them. Angular's shallow copies of a record
 * (standardization, resetConfig, lazy children) keep own enumerable symbols.
 */
const generatedRoute = Symbol("@loozo/angular-router generated route");
const generatedResolvers = Symbol("@loozo/angular-router generated resolvers");

/** What a generated record carries about its own declaration. */
export interface RecordFacts {
  /** The declaration's own genuine destination: the record's identity. */
  readonly destination: Destination<AnyRoute>;
  /** The destination of the declaration's `..` target, as generation resolved it. */
  readonly up?: Destination<AnyRoute>;
}

const noKeys: readonly PropertyKey[] = Object.freeze([]);

/**
 * The record facts generated code spreads into each native route record.
 *
 * @throws TypeError at module evaluation when either value isn't a genuine destination.
 */
export function record(
  destination: Destination<AnyRoute>,
  up?: Destination<AnyRoute>,
): { readonly [generatedRoute]: RecordFacts } {
  destinationRecord(destination);

  if (up === undefined) {
    return { [generatedRoute]: Object.freeze({ destination }) };
  }

  destinationRecord(up);

  return { [generatedRoute]: Object.freeze({ destination, up }) };
}

/** A native record's own generated facts, or undefined for a native record. */
export function recordFacts(config: Route | null | undefined): RecordFacts | undefined {
  if (!config || !Object.hasOwn(config, generatedRoute)) {
    return undefined;
  }

  return (config as { readonly [generatedRoute]: RecordFacts })[generatedRoute];
}

/**
 * The authored resolver keys of a route copy, stamped next to the native resolve map.
 * Angular adds its own entries to that map during resolution, so handles read these instead.
 */
export function resolverStamp(keys: readonly PropertyKey[]): {
  readonly [generatedResolvers]: readonly PropertyKey[];
} {
  return { [generatedResolvers]: Object.freeze([...keys]) };
}

/** A native record's stamped authored resolver keys; empty when it declares none. */
export function resolverKeys(config: Route | null | undefined): readonly PropertyKey[] {
  if (!config || !Object.hasOwn(config, generatedResolvers)) {
    return noKeys;
  }

  return (config as { readonly [generatedResolvers]: readonly PropertyKey[] })[generatedResolvers];
}
