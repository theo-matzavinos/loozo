import { inject } from "@angular/core";
import { QueryClient, skipToken } from "@tanstack/angular-query";
import type { DefaultError, Query, QueryFunctionContext } from "@tanstack/angular-query";
import { RpcError } from "../client.js";
import { hydrationWindow } from "./hydration.js";

export interface QueriesMethod {
  readonly kind: "query" | "mutation";
  readonly input: boolean;
}

type Callable = (...args: unknown[]) => Promise<unknown>;

// Builds the TanStack factories of a generated injectQueries() over its injectRpc() client.
export function createQueries(
  rpc: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  groups: Readonly<Record<string, Readonly<Record<string, QueriesMethod>>>>,
): unknown {
  const hydration = inject(hydrationWindow, { optional: true });

  if (hydration === null) {
    throw new Error(
      "injectQueries() requires provideLaunchQueries() from @loozo/angular-launch/tanstack-query in the application providers",
    );
  }

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
  // `false` on the server) applies to everything but an RpcError.
  function retryFor(queryKey: readonly unknown[]) {
    return (failures: number, error: DefaultError): boolean => {
      if (error instanceof RpcError) {
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

  const result: Record<string, Record<string, unknown>> = Object.create(null);

  for (const [namespace, methods] of Object.entries(groups)) {
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
              ...overrides,
              queryKey,
              queryFn: skipToken,
            };
          }

          const queryKey = ["launch", namespace, name, input];

          return {
            retry: retryFor(queryKey),
            refetchOnMount,
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
}
