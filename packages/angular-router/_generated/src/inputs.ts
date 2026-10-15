import type { ActivatedRouteSnapshot, PartialMatchRouteSnapshot } from "@angular/router";
import {
  codecFallback,
  codecPresence,
  routeMetadata,
  type AnyRoute,
} from "@loozo/angular-router/_core";

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
  readonly source: "path" | "search";
  readonly key: string;
  readonly raws: readonly string[];
  readonly array: boolean;
  readonly codec: { parse(raw: string): unknown };
}
export interface Operation<Value = Parsed> {
  readonly promise: Promise<Value>;
  outcome: { value: Value } | { error: Error } | undefined;
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

export function inputError(
  source: "path" | "search",
  key: string,
  reason: "missing" | "repeated" | "invalid",
  cause?: unknown,
): Error {
  return Object.assign(new Error(`Invalid ${source} input ${key}: ${reason}`, { cause }), {
    source,
    key,
    reason,
  });
}

export function validateRaw(
  source: "path" | "search",
  key: string,
  raws: readonly unknown[],
  array: boolean,
): asserts raws is readonly string[] {
  if (!array && raws.length === 0) {
    throw inputError(source, key, "missing");
  }

  if (!array && raws.length > 1) {
    throw inputError(source, key, "repeated");
  }

  if (raws.some((raw) => typeof raw !== "string")) {
    throw inputError(source, key, "invalid", new TypeError("Raw input must be a decoded string"));
  }
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

    validateRaw("path", segment.name, raws, array);
    // Repeated local scalars intentionally use Angular's last positional occurrence.
    local.set(segment.name, {
      source: "path",
      key: segment.name,
      raws,
      array,
      codec: metadata.localParams[segment.name],
    });
  }

  return [...local.values()];
}

export function searchJobs(
  definition: AnyRoute,
  snapshot: Pick<ActivatedRouteSnapshot, "queryParamMap">,
): Job[] {
  const metadata = routeMetadata(definition);
  const jobs: Job[] = [];

  for (const key of Object.keys(metadata.search)) {
    const codec = metadata.search[key];
    const raws = snapshot.queryParamMap.getAll(key);

    // Optional keys never fail: runJobs recovers their missing, repeated or invalid values.
    if (codecPresence(codec) !== "optional") {
      validateRaw("search", key, raws, false);
    }

    jobs.push({ source: "search", key, raws, array: false, codec });
  }

  return jobs;
}

export async function runJobs(jobs: readonly Job[]): Promise<Parsed> {
  const params: Record<string, unknown> = Object.create(null);
  const search: Record<string, unknown> = Object.create(null);
  const pending: Promise<void>[] = [];

  // A missing, repeated or invalid optional search value reads as its fallback, or is absent.
  function recover(job: Job): void {
    const fallback = codecFallback(job.codec);

    if (fallback) {
      search[job.key] = fallback.value;
    }
  }

  for (const job of jobs) {
    const optional = job.source === "search" && codecPresence(job.codec) === "optional";

    if (optional && (job.raws.length !== 1 || typeof job.raws[0] !== "string")) {
      recover(job);

      continue;
    }

    // Async boundaries convert every synchronous throw into an observed rejection.
    pending.push(
      (async () => {
        try {
          const elements: Promise<unknown>[] = [];

          for (const raw of job.raws) {
            elements.push((async () => job.codec.parse(raw))());
          }

          const values = await Promise.all(elements);
          let value = values[0];

          if (job.array) {
            value = Object.freeze(values);
          }

          if (job.source === "path") {
            params[job.key] = value;
          } else {
            search[job.key] = value;
          }
        } catch (cause) {
          if (optional) {
            recover(job);

            return;
          }

          throw inputError(job.source, job.key, "invalid", cause);
        }
      })(),
    );
  }

  await Promise.all(pending);

  return Object.freeze({ params: Object.freeze(params), search: Object.freeze(search) });
}

type Cache<Value> = WeakMap<object, WeakMap<object, Operation<Value>>>;

const full: Cache<Parsed> = new WeakMap();
const paths: Cache<Parsed> = new WeakMap();
const matching: Cache<Parsed | undefined> = new WeakMap();

function operation<Value>(
  cache: Cache<Value>,
  definition: AnyRoute,
  snapshot: object,
  run: () => Promise<Value>,
): Operation<Value> {
  let snapshots = cache.get(definition);

  if (!snapshots) {
    snapshots = new WeakMap();
    cache.set(definition, snapshots);
  }

  const existing = snapshots.get(snapshot);

  if (existing) {
    return existing;
  }

  // Insert before application code can run; even synchronous reentry joins the same operation.
  const result: Operation<Value> = {
    promise: Promise.resolve().then(run),
    outcome: undefined,
  };

  snapshots.set(snapshot, result);
  result.promise.then(
    (value) => {
      result.outcome = { value };
    },
    (cause) => {
      let error = cause;

      if (!(error instanceof Error)) {
        error = new Error("Route input failure", { cause });
      }

      result.outcome = { error };
    },
  );

  return result;
}

export function fullOperation(
  set: RouteSet,
  id: string,
  snapshot: ActivatedRouteSnapshot,
): Operation {
  assertIdentity(snapshot, id);

  const binding = set.records[id];

  return operation(full, binding.definition(), snapshot, () => {
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

    jobs.push(...searchJobs(binding.definition(), snapshot));

    return runJobs(jobs);
  });
}

export function parseInputs(
  set: RouteSet,
  id: string,
  snapshot: ActivatedRouteSnapshot,
): Promise<Parsed> {
  return fullOperation(set, id, snapshot).promise;
}

/**
 * Parses a matching candidate's own path params only. Angular passes one partial
 * snapshot to all of a candidate's canMatch guards, so they share this operation.
 */
export function pathOperation(
  set: RouteSet,
  id: string,
  snapshot: PartialMatchRouteSnapshot,
): Operation {
  assertIdentity(snapshot, id);

  const definition = set.records[id].definition();

  return operation(paths, definition, snapshot, () => runJobs(pathJobs(definition, snapshot.url)));
}

/**
 * Local path params plus effective search for a candidate's canMatch callbacks, or
 * undefined when the path params fail: the generated path guard owns that outcome.
 */
export function matchingInputs(
  set: RouteSet,
  id: string,
  snapshot: PartialMatchRouteSnapshot,
): Promise<Parsed | undefined> {
  assertIdentity(snapshot, id);

  const definition = set.records[id].definition();

  return operation(matching, definition, snapshot, async () => {
    let path: Parsed;

    // Search parses only once the path matches: a candidate the path rules out runs no
    // search codecs, and its search failures can't fail the navigation.
    try {
      path = await pathOperation(set, id, snapshot).promise;
    } catch {
      return undefined;
    }

    const search = await runJobs(searchJobs(definition, snapshot));

    return Object.freeze({ params: path.params, search: search.search });
  }).promise;
}
