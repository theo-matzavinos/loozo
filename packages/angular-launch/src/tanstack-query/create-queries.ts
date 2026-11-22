import { inject } from "@angular/core";
import { QueryClient, skipToken } from "@tanstack/angular-query";
import type { DefaultError, Query, QueryFunctionContext } from "@tanstack/angular-query";
import { RpcError } from "../client.js";
import { RpcNotFound, RpcRedirect } from "../outcomes.js";
import type { CreateQueries } from "../launch-queries.js";
import { hydrationWindow } from "./hydration-window.js";
import { replaceEqualDeep } from "./replace-equal-deep.js";

type Callable = (...args: unknown[]) => Promise<unknown>;

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
