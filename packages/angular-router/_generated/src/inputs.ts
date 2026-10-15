import type { ActivatedRouteSnapshot, PartialMatchRouteSnapshot } from "@angular/router";
import { codecFallback, routeMetadata, type AnyRoute } from "@loozo/angular-router/_core";

export interface RecordBinding {
  readonly definition: () => AnyRoute;
  readonly owners: readonly string[];
}
export interface RouteSet {
  readonly records: Readonly<Record<string, RecordBinding>>;
  readonly destinations: Readonly<Record<string, () => AnyRoute>>;
  readonly absolute: Readonly<Record<string, string>>;
  readonly relative: Readonly<Record<string, Readonly<Record<string, string>>>>;
}
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

export function hasIdentity(
  snapshot: Pick<ActivatedRouteSnapshot, "routeConfig">,
  id: string,
): boolean {
  const data = snapshot.routeConfig?.data;

  return (
    !!data &&
    Object.hasOwn(data, "__loozoAngularRouterRouteId") &&
    data.__loozoAngularRouterRouteId === id
  );
}

export function assertIdentity(
  snapshot: Pick<ActivatedRouteSnapshot, "routeConfig">,
  id: string,
): void {
  if (!hasIdentity(snapshot, id)) {
    throw new Error(`Generated route wiring identity mismatch: ${id}`);
  }
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

export function pathJobs(definition: AnyRoute, url: readonly { path: string }[]): Job[] {
  const metadata = routeMetadata(definition);
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
 */
export function parseSearch(
  definition: AnyRoute,
  snapshot: Pick<ActivatedRouteSnapshot, "queryParamMap">,
): Readonly<Record<string, unknown>> {
  const metadata = routeMetadata(definition);
  const search: Record<string, unknown> = Object.create(null);

  for (const key of Object.keys(metadata.search)) {
    const codec = metadata.search[key];
    const raws: unknown[] = snapshot.queryParamMap.getAll(key);

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

type Outcome<Value> = { readonly value: Value } | { readonly error: unknown };
type Cache<Value> = WeakMap<object, WeakMap<object, Outcome<Value>>>;

const full: Cache<Parsed> = new WeakMap();
const paths: Cache<Readonly<Record<string, unknown>>> = new WeakMap();
const matching: Cache<Parsed | undefined> = new WeakMap();

// One result or failure per exact declaration and snapshot, shared by every reader.
function memo<Value>(
  cache: Cache<Value>,
  definition: AnyRoute,
  snapshot: object,
  run: () => Value,
): Value {
  let snapshots = cache.get(definition);

  if (!snapshots) {
    snapshots = new WeakMap();
    cache.set(definition, snapshots);
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
export function parseInputs(set: RouteSet, id: string, snapshot: ActivatedRouteSnapshot): Parsed {
  assertIdentity(snapshot, id);

  const binding = set.records[id];

  return memo(full, binding.definition(), snapshot, () => {
    const jobs: Job[] = [];

    for (const ownerId of binding.owners) {
      const definition = set.records[ownerId].definition();

      // Pathless/static owners contribute no positional input. Effective search belongs
      // to this complete future record; inherited data is never positional authority.
      if (!routeMetadata(definition).localSegments.some((segment) => segment.kind !== "static")) {
        continue;
      }

      const owner = [...snapshot.pathFromRoot]
        .reverse()
        .find((record) => hasIdentity(record, ownerId));

      if (!owner) {
        throw new Error(`Generated route ancestor missing: ${ownerId}`);
      }

      assertIdentity(owner, ownerId);
      jobs.push(...pathJobs(definition, owner.url));
    }

    const params = runPathJobs(jobs);

    return Object.freeze({ params, search: parseSearch(binding.definition(), snapshot) });
  });
}

/**
 * Parses a matching candidate's own path params only. Angular passes one partial
 * snapshot to all of a candidate's canMatch guards, so they share this result.
 *
 * @returns An input error when a param is invalid; throws only programming errors.
 */
export function pathInputs(
  set: RouteSet,
  id: string,
  snapshot: PartialMatchRouteSnapshot,
): { params: Readonly<Record<string, unknown>> } | { error: Error } {
  assertIdentity(snapshot, id);

  const definition = set.records[id].definition();

  try {
    return {
      params: memo(paths, definition, snapshot, () =>
        runPathJobs(pathJobs(definition, snapshot.url)),
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
  set: RouteSet,
  id: string,
  snapshot: PartialMatchRouteSnapshot,
): Parsed | undefined {
  const definition = set.records[id].definition();

  return memo(matching, definition, snapshot, () => {
    const path = pathInputs(set, id, snapshot);

    // Search parses only once the path matches: a candidate the path rules out runs no
    // search codecs.
    if ("error" in path) {
      return undefined;
    }

    return Object.freeze({ params: path.params, search: parseSearch(definition, snapshot) });
  });
}
