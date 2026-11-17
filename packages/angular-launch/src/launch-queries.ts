import { InjectionToken } from "@angular/core";

/**
 * Builds a route's TanStack factories over its client.
 *
 * @remarks
 * Internal. `provideLaunchQueries()` provides it, so the root entry builds `route.queries`
 * without importing `@tanstack/*` itself.
 */
export type CreateQueries = (
  remote: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  namespaces: Readonly<Record<string, Readonly<Record<string, QueriesMethod>>>>,
) => unknown;

/** What a route's TanStack factories need to know about one query or mutation. */
export interface QueriesMethod {
  readonly kind: "query" | "mutation";
  readonly input: boolean;
}

/** Internal: provided by `provideLaunchQueries()`, read by `route.queries`. */
export const launchQueries = new InjectionToken<CreateQueries>("Launch route queries");
