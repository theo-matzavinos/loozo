import type { ActivatedRouteSnapshot, PartialMatchRouteSnapshot } from "@angular/router";
import {
  codecFallback,
  destinationRecord,
  isArrayCodec,
  routeMetadata,
  type AnyRoute,
  type Destination,
} from "@loozo/angular-router/_core";

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

/** The generated declaration identity carried as the record's own route data, if any. */
export function routeIdentity(snapshot: Pick<ActivatedRouteSnapshot, "routeConfig">): unknown {
  const data = snapshot.routeConfig?.data;

  if (!data || !Object.hasOwn(data, "__loozoAngularRouterRouteId")) {
    return undefined;
  }

  return data.__loozoAngularRouterRouteId;
}

export function hasIdentity(
  snapshot: Pick<ActivatedRouteSnapshot, "routeConfig">,
  id: string,
): boolean {
  return routeIdentity(snapshot) === id;
}

export function assertIdentity(
  snapshot: Pick<ActivatedRouteSnapshot, "routeConfig">,
  id: string,
): void {
  if (!hasIdentity(snapshot, id)) {
    throw new Error(`Generated route wiring identity mismatch: ${id}`);
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

/** The generated declaration identity of a route copy. */
export function routeId(route: AnyRoute): string {
  return destinationRecord(destinationOf(route)).id;
}

export interface Owner {
  readonly route: AnyRoute;
  readonly snapshot: ActivatedRouteSnapshot;
}

/**
 * The route's chain, root first, each route copy paired with its own record of the
 * snapshot. The route's own record must carry its id. Each parent copy pairs with the
 * nearest proper ancestor record that carries any generated identity: ancestry comes
 * from parent links, not from comparing ids.
 */
export function owners(route: AnyRoute, snapshot: ActivatedRouteSnapshot): readonly Owner[] {
  assertIdentity(snapshot, routeId(route));

  const chain: Owner[] = [{ route, snapshot }];
  const records = snapshot.pathFromRoot;
  let index = records.length - 1;
  let parent = routeMetadata(route).parent;

  while (parent) {
    index -= 1;

    while (index >= 0 && routeIdentity(records[index]) === undefined) {
      index -= 1;
    }

    if (index < 0) {
      throw new Error(`Generated route ancestor missing: ${routeId(parent)}`);
    }

    chain.unshift({ route: parent, snapshot: records[index] });
    parent = routeMetadata(parent).parent;
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
function parse(codec: Job["codec"], raw: string): { value: unknown } | { cause: unknown } {
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

export function pathJobs(route: AnyRoute, url: readonly { path: string }[]): Job[] {
  const metadata = routeMetadata(route);
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
  route: AnyRoute,
  snapshot: Pick<ActivatedRouteSnapshot, "queryParamMap">,
): Readonly<Record<string, unknown>> {
  const metadata = routeMetadata(route);
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

// One result or failure per route and snapshot, shared by every reader. Keyed by the
// route's destination, so every stage of a copy shares it.
function memo<Value>(
  cache: Cache<Value>,
  route: AnyRoute,
  snapshot: object,
  run: () => Value,
): Value {
  const destination = destinationOf(route);
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
export function parseInputs(route: AnyRoute, snapshot: ActivatedRouteSnapshot): Parsed {
  assertIdentity(snapshot, routeId(route));

  return memo(full, route, snapshot, () => {
    const jobs: Job[] = [];

    for (const owner of owners(route, snapshot)) {
      // Pathless/static owners contribute no positional input. Effective search belongs
      // to this complete future record; inherited data is never positional authority.
      if (!routeMetadata(owner.route).localSegments.some((segment) => segment.kind !== "static")) {
        continue;
      }

      jobs.push(...pathJobs(owner.route, owner.snapshot.url));
    }

    const params = runPathJobs(jobs);

    return Object.freeze({ params, search: parseSearch(route, snapshot) });
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
  assertIdentity(snapshot, routeId(route));

  try {
    return {
      params: memo(paths, route, snapshot, () => runPathJobs(pathJobs(route, snapshot.url))),
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
  return memo(matching, route, snapshot, () => {
    const path = pathInputs(route, snapshot);

    // Search parses only once the path matches: a candidate the path rules out runs no
    // search codecs.
    if ("error" in path) {
      return undefined;
    }

    return Object.freeze({ params: path.params, search: parseSearch(route, snapshot) });
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

  return memo(cache, route, snapshot, () => {
    const members = extension.runtime.input(extension.chain);

    if (Object.hasOwn(members, "params") || Object.hasOwn(members, "search")) {
      throw new TypeError("Route extension input cannot replace params or search");
    }

    return Object.freeze({ ...base, ...members, params: base.params, search: base.search });
  });
}

/** Activation-phase inputs for authored canActivate, canActivateChild, resolver and title callbacks. */
export function callbackInputs(route: AnyRoute, snapshot: ActivatedRouteSnapshot): Enriched {
  const base = parseInputs(route, snapshot);

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
