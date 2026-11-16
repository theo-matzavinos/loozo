import type { Route } from "@angular/router";
import {
  destinationRecord,
  routeMetadata,
  type AnyRoute,
  type ContributionRecord,
  type Destination,
  type ExtensionSpec,
  type RuntimeExtension,
} from "@loozo/angular-router/_core";

/**
 * Own symbols that generated code stamps onto its native route records. Module-private, so
 * nothing outside this package instance can forge them. Angular's shallow copies of a record
 * (standardization, resetConfig, lazy children) keep own enumerable symbols.
 */
const generatedRoute = Symbol("@loozo/angular-router generated route");
const generatedResolvers = Symbol("@loozo/angular-router generated resolvers");
const generatedExtension = Symbol("@loozo/angular-router generated extension");

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

/** The route extension a generated record's copy was made by, and its contribution chain. */
export interface RecordExtension {
  readonly runtime: RuntimeExtension<ExtensionSpec>;
  readonly chain: readonly ContributionRecord[];
}

/**
 * The extension stamp generated code spreads into the native record of a non-redirect
 * route that a route extension's factory made, so an active handle of that record gets
 * the extension's members.
 *
 * @throws TypeError at module evaluation for a copy no extension factory made.
 */
export function extension(route: AnyRoute): { readonly [generatedExtension]: RecordExtension } {
  const slot = routeMetadata(route).extension;

  if (!slot?.declared) {
    throw new TypeError("Route extension stamp needs an extension route copy");
  }

  return {
    [generatedExtension]: Object.freeze({ runtime: slot.runtime, chain: slot.chain }),
  };
}

/** A native record's own extension stamp, or undefined. */
export function recordExtension(config: Route | null | undefined): RecordExtension | undefined {
  if (!config || !Object.hasOwn(config, generatedExtension)) {
    return undefined;
  }

  return (config as { readonly [generatedExtension]: RecordExtension })[generatedExtension];
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
