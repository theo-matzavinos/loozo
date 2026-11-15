import type { ParamCodec, PathCodec } from "./codecs.js";
import type { CatchallName, Segment } from "./path.js";
import type { AnyRoute, CodecMap, EffectiveParams, EffectiveSearch, Route } from "./types.js";

declare const destinationBrand: unique symbol;

/**
 * An inert nominal URL reference, exported as `destination` by a route's
 * `destination.generated.ts`.
 *
 * @remarks
 * Import it to create URLs (`createUrl`), to link or navigate from a route handle
 * (`to`), as a `.redirect` target, or to test the active route (`is`/`contains`).
 * It is not a route: it offers no steps, can't be a `parent` and isn't read by
 * `ParamsOf`, `SearchOf` or `FragmentsOf`; use `TargetOf` to name the schema it
 * references. Only destinations generated in this physical package instance are
 * genuine. Spreads, copies, fakes and routes are not destinations.
 *
 * @typeParam Target - The URL-only schema of the referenced route: its effective
 * params and search, its own fragments and catchall flag.
 * @typeParam Id - The exact generated declaration identity.
 */
export declare class Destination<Target extends AnyRoute, Id extends string = string> {
  // Type-only identity, intentionally not read; object spreads must lose this member.
  // oxlint-disable-next-line no-unused-private-class-members
  readonly #nominal: void;
  /** Type-only nominal brand carrying the reference's identity; not populated at runtime. */
  readonly [destinationBrand]: {
    /** Type-only: the referenced route's URL schema. */
    readonly target: Target;
    /** Type-only: the exact generated declaration identity. */
    readonly id: Id;
  };
}

/**
 * Type-only: the local URL facts a destination was declared with, for `routeOf`'s inference.
 *
 * @internal
 */
export interface LocalFacts<
  P extends string,
  Params extends Record<string, PathCodec>,
  Search extends CodecMap,
  F extends readonly string[],
> {
  readonly path: P;
  readonly params: Params;
  readonly search: Search;
  readonly fragments: F;
}

/**
 * The URL-only route schema a destination references.
 *
 * @internal
 */
export type UrlTarget<
  P extends string,
  Parent extends AnyRoute | undefined,
  Params extends Record<string, PathCodec>,
  Search extends CodecMap,
  F extends readonly string[],
> = Route<
  P,
  EffectiveParams<P, Params, Parent>,
  EffectiveSearch<Search, Parent>,
  {},
  F[number],
  CatchallName<P> extends never ? false : true,
  {},
  undefined
> & {
  // String-keyed like Route's other witnesses, so declaration emit can name it.
  /** Type-only: local facts for routeOf's inference; never a runtime property. */
  readonly __facts?: LocalFacts<P, Params, Search, F>;
};

/**
 * The URL schema a destination references, or `undefined` for anything else:
 * `ParamsOf<TargetOf<typeof item>>` names a destination's params.
 */
export type TargetOf<D> = D extends Destination<infer Target, any> ? Target : undefined;

/**
 * A destination's URL facts: its parent destination, its local and effective path
 * segments and codecs, and its own fragment names.
 *
 * @internal
 */
export interface UrlMetadata {
  readonly parent?: Destination<AnyRoute>;
  readonly localSegments: readonly Segment[];
  readonly segments: readonly Segment[];
  readonly localParams: Readonly<Record<string, ParamCodec<any>>>;
  readonly localSearch: Readonly<Record<string, ParamCodec<any>>>;
  readonly params: Readonly<Record<string, ParamCodec<any>>>;
  readonly search: Readonly<Record<string, ParamCodec<any>>>;
  readonly fragments: readonly string[];
}

/**
 * What a genuine destination references: its generated id, its local authored path
 * and its URL facts.
 *
 * @internal
 */
export interface DestinationRecord {
  readonly id: string;
  readonly path: string;
  readonly url: UrlMetadata;
}

// Written once, when a destination file evaluates; never mutated.
const destinations = new WeakMap<object, DestinationRecord>();

/** Makes a frozen empty object the destination of `record`. Only `defineDestination` calls it. */
export function registerDestination(record: DestinationRecord): Destination<AnyRoute> {
  const destination = Object.freeze({});

  destinations.set(destination, Object.freeze(record));

  return destination as Destination<AnyRoute>;
}

/** The record of a genuine destination from this package instance, or undefined. */
export function findDestination(value: unknown): DestinationRecord | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }

  return destinations.get(value);
}

/**
 * The record of a genuine destination from this package instance.
 *
 * @throws TypeError for anything else: a route, a spread or copy, a fake, or a
 * destination from another physical package instance.
 *
 * @internal
 */
export function destinationRecord(value: unknown): DestinationRecord {
  const record = findDestination(value);

  if (!record) {
    throw new TypeError("Expected a genuine destination");
  }

  return record;
}
