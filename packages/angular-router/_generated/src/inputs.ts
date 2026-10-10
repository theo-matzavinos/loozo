import type { ActivatedRouteSnapshot, PartialMatchRouteSnapshot } from "@angular/router";
import { codecPresence, routeMetadata, type AnyRoute } from "@loozo/angular-router/_core";

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
export interface Operation {
  readonly promise: Promise<Parsed>;
  outcome: { value: Parsed } | { error: Error } | undefined;
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

    if (raws.length === 0 && codecPresence(codec) === "optional") {
      continue;
    }

    validateRaw("search", key, raws, false);
    jobs.push({ source: "search", key, raws, array: false, codec });
  }

  return jobs;
}

export async function runJobs(jobs: readonly Job[]): Promise<Parsed> {
  const params: Record<string, unknown> = Object.create(null);
  const search: Record<string, unknown> = Object.create(null);
  const pending: Promise<void>[] = [];

  for (const job of jobs) {
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
          throw inputError(job.source, job.key, "invalid", cause);
        }
      })(),
    );
  }

  await Promise.all(pending);

  return Object.freeze({ params: Object.freeze(params), search: Object.freeze(search) });
}

const full = new WeakMap<object, WeakMap<object, Operation>>();
const matching = new WeakMap<object, WeakMap<object, Operation>>();

function operation(
  cache: typeof full,
  definition: AnyRoute,
  snapshot: object,
  collect: () => Job[],
): Operation {
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
  const result: Operation = {
    promise: Promise.resolve().then(() => runJobs(collect())),
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

    return jobs;
  });
}

export function parseInputs(
  set: RouteSet,
  id: string,
  snapshot: ActivatedRouteSnapshot,
): Promise<Parsed> {
  return fullOperation(set, id, snapshot).promise;
}

export function matchingInputs(
  set: RouteSet,
  id: string,
  snapshot: PartialMatchRouteSnapshot,
): Promise<Parsed> {
  assertIdentity(snapshot, id);

  const definition = set.records[id].definition();

  return operation(matching, definition, snapshot, () => [
    ...pathJobs(definition, snapshot.url),
    ...searchJobs(definition, snapshot),
  ]).promise;
}
