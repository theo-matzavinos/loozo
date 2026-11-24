import type {
  ActivatedRouteSnapshot,
  Data,
  ParamMap,
  PartialMatchRouteSnapshot,
  Route,
  UrlSegment,
} from "@angular/router";
import {
  codecFallback,
  destinationRecord,
  isArrayCodec,
  routeMetadata,
  type AnyRoute,
  type Destination,
} from "@loozo/angular-router/_core";
import { recordFacts } from "./record.js";

export interface Parsed {
  readonly params: Readonly<Record<string, unknown>>;
  readonly search: Readonly<Record<string, unknown>>;
}
export interface Job {
  readonly key: string;
  readonly raws: readonly string[];
  readonly array: boolean;
  readonly codec: { parse(raw: string): unknown };
}

/** The destination a generated record carries as its own property, if any. */
export function routeIdentity(
  snapshot: Pick<ActivatedRouteSnapshot, "routeConfig">,
): Destination<AnyRoute> | undefined {
  return recordFacts(snapshot.routeConfig)?.destination;
}

export function hasIdentity(
  snapshot: Pick<ActivatedRouteSnapshot, "routeConfig">,
  destination: Destination<AnyRoute>,
): boolean {
  return routeIdentity(snapshot) === destination;
}

export function assertIdentity(
  snapshot: Pick<ActivatedRouteSnapshot, "routeConfig">,
  destination: Destination<AnyRoute>,
): void {
  if (!hasIdentity(snapshot, destination)) {
    throw new Error(
      `Generated route wiring identity mismatch: ${destinationRecord(destination).id}`,
    );
  }
}

/** A route copy's canonical identity: its own destination, kept by every stage. */
export function destinationOf(route: AnyRoute): Destination<AnyRoute> {
  const destination = routeMetadata(route).destination;

  if (destination === undefined) {
    throw new TypeError("Expected a generated route copy");
  }

  return destination;
}

/**
 * The parts of a snapshot that parsing and handle values read: an ActivatedRouteSnapshot, or
 * the plain stand-in the active-route hydration seed builds for a record before it activates.
 */
export interface SnapshotLike {
  readonly routeConfig: Route | null;
  readonly url: readonly UrlSegment[];
  readonly queryParamMap: ParamMap;
  readonly data: Data;
  readonly title: string | undefined;
  readonly pathFromRoot: readonly SnapshotLike[];
}

export interface Owner {
  readonly destination: Destination<AnyRoute>;
  readonly snapshot: SnapshotLike;
}

/**
 * The destination's chain, root first, each declaration's destination paired with its own
 * record of the snapshot. The destination's own record must carry it. Each parent
 * destination pairs with the nearest proper ancestor record that carries any generated
 * destination, so native wrappers are skipped: ancestry comes from parent links, not from
 * comparing destinations.
 */
export function destinationOwners(
  destination: Destination<AnyRoute>,
  snapshot: SnapshotLike,
): readonly Owner[] {
  assertIdentity(snapshot, destination);

  const chain: Owner[] = [{ destination, snapshot }];
  const records = snapshot.pathFromRoot;
  let index = records.length - 1;
  let parent = destinationRecord(destination).url.parent;

  while (parent) {
    index -= 1;

    while (index >= 0 && routeIdentity(records[index]) === undefined) {
      index -= 1;
    }

    if (index < 0) {
      throw new Error(`Generated route ancestor missing: ${destinationRecord(parent).id}`);
    }

    chain.unshift({ destination: parent, snapshot: records[index] });
    parent = destinationRecord(parent).url.parent;
  }

  return chain;
}

// Private: input errors are Errors with source/key/reason, not an exported class.
class InputError extends Error {
  readonly source = "path";

  constructor(
    readonly key: string,
    readonly reason: "missing" | "repeated" | "invalid",
    cause?: unknown,
  ) {
    super(`Invalid path input ${key}: ${reason}`, { cause });
  }
}

export function validateRaw(
  key: string,
  raws: readonly unknown[],
  array: boolean,
): asserts raws is readonly string[] {
  if (!array && raws.length === 0) {
    throw new InputError(key, "missing");
  }

  if (!array && raws.length > 1) {
    throw new InputError(key, "repeated");
  }

  if (raws.some((raw) => typeof raw !== "string")) {
    throw new InputError(key, "invalid", new TypeError("Raw input must be a decoded string"));
  }
}

/**
 * Runs one parser. A throw is invalid input; a thenable is a programming error,
 * thrown as a TypeError so it fails the navigation instead of reading as invalid.
 */
export function parse(codec: Job["codec"], raw: string): { value: unknown } | { cause: unknown } {
  let value: unknown;

  try {
    value = codec.parse(raw);
  } catch (cause) {
    return { cause };
  }

  if (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<unknown>).then === "function"
  ) {
    // Observe the stray result so its rejection can't surface as unhandled.
    Promise.resolve(value).catch(() => undefined);

    throw new TypeError("ParamCodec.parse must return its value synchronously, not a Promise");
  }

  return { value };
}

export function pathJobs(
  destination: Destination<AnyRoute>,
  url: readonly { path: string }[],
): Job[] {
  const metadata = destinationRecord(destination).url;
  const local = new Map<string, Job>();

  for (let index = 0; index < metadata.localSegments.length; index += 1) {
    const segment = metadata.localSegments[index];

    if (segment.kind === "static") {
      continue;
    }

    let raws: unknown[] = [];
    const array = segment.kind === "catchall";

    if (array) {
      raws = url.slice(index).map((value) => value.path);
    } else if (index < url.length) {
      raws = [url[index].path];
    }

    validateRaw(segment.name, raws, array);
    // Repeated local scalars intentionally use Angular's last positional occurrence.
    local.set(segment.name, {
      key: segment.name,
      raws,
      array,
      codec: metadata.localParams[segment.name],
    });
  }

  return [...local.values()];
}

/** Parses prechecked path jobs; the first codec failure is an input error. */
export function runPathJobs(jobs: readonly Job[]): Readonly<Record<string, unknown>> {
  const params: Record<string, unknown> = Object.create(null);

  for (const job of jobs) {
    const values: unknown[] = [];

    for (const raw of job.raws) {
      const result = parse(job.codec, raw);

      if ("cause" in result) {
        throw new InputError(job.key, "invalid", result.cause);
      }

      values.push(result.value);
    }

    if (job.array) {
      params[job.key] = Object.freeze(values);
    } else {
      params[job.key] = values[0];
    }
  }

  return Object.freeze(params);
}

/**
 * Parses a declaration's effective search. It never fails on input: a missing,
 * repeated or invalid value reads as the key's fallback, or leaves it absent.
 * An array key reads every value, or `[]` when it is missing or any value is invalid.
 */
export function parseSearch(
  destination: Destination<AnyRoute>,
  snapshot: Pick<ActivatedRouteSnapshot, "queryParamMap">,
): Readonly<Record<string, unknown>> {
  const metadata = destinationRecord(destination).url;
  const search: Record<string, unknown> = Object.create(null);

  for (const key of Object.keys(metadata.search)) {
    const codec = metadata.search[key];
    const raws: unknown[] = snapshot.queryParamMap.getAll(key);

    if (isArrayCodec(codec)) {
      search[key] = parseArray(codec, raws);

      continue;
    }

    if (raws.length === 1 && typeof raws[0] === "string") {
      const result = parse(codec, raws[0]);

      if ("value" in result) {
        search[key] = result.value;

        continue;
      }
    }

    const fallback = codecFallback(codec);

    if (fallback) {
      search[key] = fallback.value;
    }
  }

  return Object.freeze(search);
}

// One invalid value empties the whole list, as an invalid scalar reads as absent.
function parseArray(codec: Job["codec"], raws: readonly unknown[]): readonly unknown[] {
  const values: unknown[] = [];

  for (const raw of raws) {
    if (typeof raw !== "string") {
      return Object.freeze([]);
    }

    const result = parse(codec, raw);

    if ("cause" in result) {
      return Object.freeze([]);
    }

    values.push(result.value);
  }

  return Object.freeze(values);
}

type Outcome<Value> = { readonly value: Value } | { readonly error: unknown };
type Cache<Value> = WeakMap<object, WeakMap<object, Outcome<Value>>>;

const full: Cache<Parsed> = new WeakMap();
const paths: Cache<Readonly<Record<string, unknown>>> = new WeakMap();
const matching: Cache<Parsed | undefined> = new WeakMap();

// One result or failure per destination and snapshot, shared by every reader: every stage
// of a route copy, and every handle of its record, has the same destination.
function memo<Value>(
  cache: Cache<Value>,
  destination: Destination<AnyRoute>,
  snapshot: object,
  run: () => Value,
): Value {
  let snapshots = cache.get(destination);

  if (!snapshots) {
    snapshots = new WeakMap();
    cache.set(destination, snapshots);
  }

  let outcome = snapshots.get(snapshot);

  if (!outcome) {
    try {
      outcome = { value: run() };
    } catch (error) {
      outcome = { error };
    }

    snapshots.set(snapshot, outcome);
  }

  if ("error" in outcome) {
    throw outcome.error;
  }

  return outcome.value;
}

/** The effective inputs of a complete snapshot, shared by guards, resolvers and handles. */
export function parseInputs(destination: Destination<AnyRoute>, snapshot: SnapshotLike): Parsed {
  assertIdentity(snapshot, destination);

  return memo(full, destination, snapshot, () => {
    const jobs: Job[] = [];

    for (const owner of destinationOwners(destination, snapshot)) {
      const local = destinationRecord(owner.destination).url.localSegments;

      // Pathless/static owners contribute no positional input. Effective search belongs
      // to this complete future record; inherited data is never positional authority.
      if (!local.some((segment) => segment.kind !== "static")) {
        continue;
      }

      jobs.push(...pathJobs(owner.destination, owner.snapshot.url));
    }

    const params = runPathJobs(jobs);

    return Object.freeze({ params, search: parseSearch(destination, snapshot) });
  });
}

/**
 * Parses a matching candidate's own path params only. Angular passes one partial
 * snapshot to all of a candidate's canMatch guards, so they share this result.
 *
 * @returns An input error when a param is invalid; throws only programming errors.
 */
export function pathInputs(
  route: AnyRoute,
  snapshot: PartialMatchRouteSnapshot,
): { params: Readonly<Record<string, unknown>> } | { error: Error } {
  const destination = destinationOf(route);

  assertIdentity(snapshot, destination);

  try {
    return {
      params: memo(paths, destination, snapshot, () =>
        runPathJobs(pathJobs(destination, snapshot.url)),
      ),
    };
  } catch (error) {
    if (error instanceof InputError) {
      return { error };
    }

    throw error;
  }
}

/**
 * Local path params plus effective search for a candidate's canMatch guards, the
 * generated one included, or undefined when the path params fail: the generated
 * guard owns that outcome.
 */
export function matchingInputs(
  route: AnyRoute,
  snapshot: PartialMatchRouteSnapshot,
): Parsed | undefined {
  const destination = destinationOf(route);

  return memo(matching, destination, snapshot, () => {
    const path = pathInputs(route, snapshot);

    // Search parses only once the path matches: a candidate the path rules out runs no
    // search codecs.
    if ("error" in path) {
      return undefined;
    }

    return Object.freeze({ params: path.params, search: parseSearch(destination, snapshot) });
  });
}

/** Base inputs plus an extension's members; for authored callbacks only. */
export type Enriched = Parsed & Readonly<Record<string, unknown>>;

const activationCallbacks: Cache<Enriched> = new WeakMap();
const matchingCallbacks: Cache<Enriched> = new WeakMap();

// Router-only routes and router-made routes return the base container itself. A route
// made by an extension factory gets one frozen container per phase and snapshot, built
// at the first authored callback of that phase, inside Angular's injection context.
function enrich(cache: Cache<Enriched>, route: AnyRoute, snapshot: object, base: Parsed): Enriched {
  const extension = routeMetadata(route).extension;

  if (!extension?.declared) {
    return base as Enriched;
  }

  return memo(cache, destinationOf(route), snapshot, () => {
    const members = extension.runtime.input(extension.chain);

    if (Object.hasOwn(members, "params") || Object.hasOwn(members, "search")) {
      throw new TypeError("Route extension input cannot replace params or search");
    }

    return Object.freeze({ ...base, ...members, params: base.params, search: base.search });
  });
}

/** Activation-phase inputs for authored canActivate, canActivateChild, resolver and title callbacks. */
export function callbackInputs(route: AnyRoute, snapshot: ActivatedRouteSnapshot): Enriched {
  const base = parseInputs(destinationOf(route), snapshot);

  return enrich(activationCallbacks, route, snapshot, base);
}

/** Matching-phase inputs for authored canMatch callbacks; undefined when path params fail. */
export function matchingCallbackInputs(
  route: AnyRoute,
  snapshot: PartialMatchRouteSnapshot,
): Enriched | undefined {
  const base = matchingInputs(route, snapshot);

  if (base === undefined) {
    return undefined;
  }

  return enrich(matchingCallbacks, route, snapshot, base);
}
