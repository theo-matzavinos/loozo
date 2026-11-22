import { inject } from "@angular/core";
import { QueryClient, skipToken } from "@tanstack/angular-query";
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

// query-core 5.104.3's `replaceEqualDeep`, with the same fast paths, depth limit and equality
// rules, reading `a[key]` and `b[key]` once each in the same order, except at a "__proto__" key.
// JSON.parse keeps that key as own data, but upstream copies keys by assignment, so the
// setter makes the value the copy's prototype and the key is lost (TanStack/query#12303,
// closed as not planned). Here the copy defines that key as an own data property, and the old
// side's value counts only if it's an own property of `a`, so the old object's prototype is
// never compared or reused.
function replaceEqualDeep(a: unknown, b: unknown, depth = 0): unknown {
  if (a === b) {
    return a;
  }

  if (depth > 500) {
    return b;
  }

  const array = isPlainArray(a) && isPlainArray(b);

  if (!array && !(isPlainObject(a) && isPlainObject(b))) {
    return b;
  }

  // Both are plain arrays or both plain objects, so both are indexable.
  const previous = a as Record<PropertyKey, unknown>;
  const next = b as Record<PropertyKey, unknown>;
  let aItems: readonly unknown[];
  let bItems: readonly unknown[];
  let copy: Record<PropertyKey, unknown>;

  if (array) {
    aItems = a as unknown[];
    bItems = b as unknown[];
    // Upstream preallocates `new Array(bSize)`; the loop writes every index in order, so an
    // empty array ends up the same.
    copy = [] as unknown as Record<PropertyKey, unknown>;
  } else {
    aItems = Object.keys(previous);
    bItems = Object.keys(next);
    copy = {};
  }

  const aSize = aItems.length;
  const bSize = bItems.length;
  let equalItems = 0;

  for (let i = 0; i < bSize; i += 1) {
    let key: PropertyKey;

    if (array) {
      key = i;
    } else {
      key = bItems[i] as string;
    }

    const isProtoKey = key === "__proto__";
    let aItem: unknown;

    if (!isProtoKey || Object.hasOwn(previous, key)) {
      aItem = previous[key];
    }

    const bItem = next[key];
    let item: unknown;

    if (aItem === bItem) {
      item = aItem;

      // An equal value counts only where the old data has the item, not where both lack it.
      let inOld: boolean;

      if (array) {
        inOld = i < aSize;
      } else {
        inOld = Object.hasOwn(previous, key);
      }

      if (inOld) {
        equalItems += 1;
      }
    } else if (
      aItem === null ||
      bItem === null ||
      typeof aItem !== "object" ||
      typeof bItem !== "object"
    ) {
      item = bItem;
    } else {
      item = replaceEqualDeep(aItem, bItem, depth + 1);

      if (item === aItem) {
        equalItems += 1;
      }
    }

    if (isProtoKey) {
      Object.defineProperty(copy, key, {
        value: item,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else {
      copy[key] = item;
    }
  }

  if (aSize === bSize && equalItems === aSize) {
    return a;
  }

  return copy;
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
  // sharing, through the copy above that keeps a "__proto__" key as data.
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
