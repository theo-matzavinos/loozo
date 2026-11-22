import { inject } from "@angular/core";
import { QueryClient, replaceEqualDeep, skipToken } from "@tanstack/angular-query";
import type { DefaultError, Query, QueryFunctionContext } from "@tanstack/angular-query";
import { RpcError } from "../client.js";
import { RpcNotFound, RpcRedirect } from "../outcomes.js";
import type { CreateQueries } from "../launch-queries.js";
import { hydrationWindow } from "./hydration-window.js";

type Callable = (...args: unknown[]) => Promise<unknown>;

// query-core's `isPlainArray` and `isPlainObject` (5.104.3), which it doesn't export: the
// values whose keys `replaceEqualDeep` copies into a fresh array or object.
function isPlainArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length === Object.keys(value).length;
}

function hasObjectPrototype(value: unknown): boolean {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!hasObjectPrototype(value)) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  const constructor: unknown = (prototype as { constructor?: unknown } | null)?.constructor;

  if (constructor === undefined) {
    return true;
  }

  if (typeof constructor !== "function") {
    return false;
  }

  const constructorPrototype: unknown = constructor.prototype;

  if (!hasObjectPrototype(constructorPrototype)) {
    return false;
  }

  if (!Object.hasOwn(constructorPrototype as object, "isPrototypeOf")) {
    return false;
  }

  return prototype === Object.prototype;
}

// Whether a plain object `replaceEqualDeep` would copy has an own `__proto__` key. JSON.parse
// keeps one as data, but `replaceEqualDeep` copies keys by assignment, so its setter would make
// the value the copy's prototype (TanStack/query#12303, closed as not planned). The value isn't
// only a JSON result: `select` output and placeholder data come here too, and may be cyclic or
// class instances. `replaceEqualDeep` returns anything but a plain array or object as it is,
// so the walk descends only into those. It visits each object once, so it ends on cycles, and
// it's iterative, so deep results can't overflow the stack.
function hasOwnProtoKey(data: unknown): boolean {
  const pending: unknown[] = [data];
  const visited = new WeakSet<object>();

  while (pending.length > 0) {
    const value = pending.pop();

    if (typeof value !== "object" || value === null || visited.has(value)) {
      continue;
    }

    visited.add(value);

    if (isPlainArray(value)) {
      // By index, as `replaceEqualDeep` reads it: an iterator could skip what it copies.
      for (let index = 0; index < value.length; index += 1) {
        pending.push(value[index]);
      }

      continue;
    }

    if (!isPlainObject(value)) {
      continue;
    }

    if (Object.hasOwn(value, "__proto__")) {
      return true;
    }

    for (const key of Object.keys(value)) {
      pending.push(value[key]);
    }
  }

  return false;
}

// Builds a route's `queries` over its `remote` client. `route.queries` calls it in the
// handle creator's injection context, once it checked that `provideLaunchQueries()`, which
// provides both tokens, is there.
export const createQueries: CreateQueries = (rpc, namespaces) => {
  const hydration = inject(hydrationWindow);
  const client = inject(QueryClient);

  // An arrow function keeps the null check's narrowing; a function declaration is hoisted.
  const refetchOnMount = (query: Query): boolean | "always" => {
    if (hydration.open) {
      return false;
    }

    const defaults = {
      ...client.getDefaultOptions().queries,
      ...client.getQueryDefaults(query.queryKey),
    };
    const fallback = defaults.refetchOnMount;

    if (typeof fallback === "function") {
      return fallback(query);
    }

    if (fallback === undefined) {
      return true;
    }

    return fallback;
  };

  // Resolved per call, in query-core's merge order, so the client's default (the adapter's
  // `false` on the server) applies to everything but the server's answers.
  function retryFor(queryKey: readonly unknown[]) {
    return (failures: number, error: DefaultError): boolean => {
      if (
        error instanceof RpcError ||
        error instanceof RpcRedirect ||
        error instanceof RpcNotFound
      ) {
        return false;
      }

      const defaults = {
        ...client.getDefaultOptions().queries,
        ...client.getQueryDefaults(queryKey),
      };
      const fallback = defaults.retry;

      if (typeof fallback === "function") {
        return fallback(failures, error);
      }

      if (typeof fallback === "number") {
        return failures < fallback;
      }

      if (fallback === undefined) {
        return failures < 3;
      }

      return fallback;
    };
  }

  // Resolved per call like `retry`, so the client's default still decides: `false` shares
  // nothing and a function is the consumer's own sharing. Otherwise TanStack's default
  // sharing, except for results it would corrupt: those replace the old data whole.
  function structuralSharingFor(queryKey: readonly unknown[]) {
    return (old: unknown, data: unknown): unknown => {
      const defaults = {
        ...client.getDefaultOptions().queries,
        ...client.getQueryDefaults(queryKey),
      };
      const fallback = defaults.structuralSharing;

      if (fallback === false) {
        return data;
      }

      if (typeof fallback === "function") {
        return fallback(old, data);
      }

      if (hasOwnProtoKey(data)) {
        return data;
      }

      return replaceEqualDeep(old, data);
    };
  }

  const result: Record<string, Record<string, unknown>> = Object.create(null);

  for (const [namespace, methods] of Object.entries(namespaces)) {
    const group: Record<string, unknown> = Object.create(null);

    group["$key"] = () => ["launch", namespace];

    for (const [name, method] of Object.entries(methods)) {
      const callable = rpc[namespace][name] as Callable;
      const procedureKey = () => ["launch", namespace, name];

      if (method.kind === "mutation") {
        let mutationFn: (variables: unknown) => Promise<unknown>;

        if (method.input) {
          mutationFn = (variables) => callable(variables);
        } else {
          mutationFn = () => callable();
        }

        group[name] = {
          key: procedureKey,
          mutationOptions: (overrides: object = {}) => ({
            ...overrides,
            mutationKey: procedureKey(),
            mutationFn,
          }),
        };

        continue;
      }

      if (!method.input) {
        group[name] = {
          key: procedureKey,
          queryOptions: (overrides: object = {}) => {
            const queryKey = procedureKey();

            return {
              retry: retryFor(queryKey),
              refetchOnMount,
              structuralSharing: structuralSharingFor(queryKey),
              ...overrides,
              queryKey,
              queryFn: ({ signal }: QueryFunctionContext) =>
                callable({ signal, transferCache: false }),
            };
          },
        };

        continue;
      }

      group[name] = {
        key: (input?: unknown) => {
          if (input === undefined) {
            return procedureKey();
          }

          return ["launch", namespace, name, input];
        },
        queryOptions: (input: unknown, overrides: object = {}) => {
          if (input === skipToken) {
            const queryKey = procedureKey();

            return {
              retry: retryFor(queryKey),
              refetchOnMount,
              structuralSharing: structuralSharingFor(queryKey),
              ...overrides,
              queryKey,
              queryFn: skipToken,
            };
          }

          const queryKey = ["launch", namespace, name, input];

          return {
            retry: retryFor(queryKey),
            refetchOnMount,
            structuralSharing: structuralSharingFor(queryKey),
            ...overrides,
            queryKey,
            queryFn: ({ signal }: QueryFunctionContext) =>
              callable(input, { signal, transferCache: false }),
          };
        },
      };
    }

    result[namespace] = group;
  }

  return result;
};
