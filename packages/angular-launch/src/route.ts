import { runInInjectionContext, type Injector } from "@angular/core";
import {
  createRouteFactory,
  type ContributionRecord,
  type RouteFactory,
} from "@loozo/angular-router/_core";
import { launchQueries, type QueriesMethod } from "./launch-queries.js";
import { injectClient, type ClientMethod } from "./remote-client.js";
import type { LaunchSpec } from "./route-types.js";

type Namespaces = Record<string, { readonly methods: readonly ClientMethod[] }>;

// A route copy's own record holds generation's data, `{ remote: { [namespace]: { methods } } }`,
// never the authored builder, which only the server's authored routes hold.
function namespacesOf(chain: readonly ContributionRecord[]): Namespaces {
  const namespaces: Namespaces = Object.create(null);

  for (const record of chain) {
    const data = record.remote as Namespaces | undefined;

    if (data === undefined) {
      continue;
    }

    for (const [namespace, entry] of Object.entries(data)) {
      namespaces[namespace] = entry;
    }
  }

  return namespaces;
}

// The queries and mutations, which have TanStack factories; streams and channels don't.
function queryMethodsOf(namespaces: Namespaces): Record<string, Record<string, QueriesMethod>> {
  const result: Record<string, Record<string, QueriesMethod>> = Object.create(null);

  for (const [namespace, { methods }] of Object.entries(namespaces)) {
    const entries: Record<string, QueriesMethod> = Object.create(null);

    for (const { name, kind, input } of methods) {
      if (kind === "query" || kind === "mutation") {
        entries[name] = { kind, input };
      }
    }

    result[namespace] = entries;
  }

  return result;
}

function input(chain: readonly ContributionRecord[]): object {
  return { remote: injectClient(namespacesOf(chain)) };
}

// Lazy getters: a page may read `route.remote` first from an event or after an `await`, so
// each member is built on first read inside the handle creator's injection context.
function handle(chain: readonly ContributionRecord[], injector: Injector): object {
  let remote: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined;
  let queries: unknown;

  function client(): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
    remote ??= runInInjectionContext(
      injector,
      () => injectClient(namespacesOf(chain)) as Record<string, Record<string, unknown>>,
    );

    return remote;
  }

  return {
    get remote() {
      return client();
    },
    get queries() {
      if (queries === undefined) {
        const create = injector.get(launchQueries, null);

        if (create === null) {
          throw new Error(
            "route.queries requires provideLaunchQueries() from @loozo/angular-launch/tanstack-query in the application providers",
          );
        }

        const rpc = client();

        queries = runInInjectionContext(injector, () =>
          create(rpc, queryMethodsOf(namespacesOf(chain))),
        );
      }

      return queries;
    },
  };
}

/**
 * Declares a route, like the router's `defineRoute`, with Launch's server steps offered
 * first: `.context(stage)`, then `.use(...middleware)`, then `.remote(build)`, each at most
 * once and in that order, before any router step.
 *
 * @remarks
 * Import it from `@loozo/angular-launch` in every `route.ts` of a Launch app. Its steps are
 * server-only: generation strips them from the route's browser copy, and the server reads
 * them from `server.generated.ts`.
 *
 * - `.context(stage)` derives the route's context from its ancestors'. The stage receives
 *   `StageArgs` from `@loozo/angular-launch/server` and returns the route's whole context:
 *   spread the context above, `{ ...context, user }`, to keep its keys. It runs at most once
 *   per request scope, only when a call needs it.
 * - `.use(...middleware)` runs around this route's own procedures, after the stages and
 *   before input validation. Each entry is a shared `middleware()` or a bare async function,
 *   which receives the route's context typed. A child route's procedures don't run it.
 * - `.remote(({ query, mutation, stream, channel }) => ({ namespace: { … } }))` declares
 *   procedures in namespaces, each unique across the app and called at
 *   `/_rpc/<namespace>/<procedure>`. The route and its descendants see them as
 *   `injectRoute().remote.<namespace>` and as `remote` in their kept `resolve`, guards and
 *   `title`.
 *
 * Generation reads every step statically: write the chain as a direct default export, and
 * each `.remote()` callback as an arrow function destructuring the builders it uses,
 * returning a parenthesized object literal of namespaces whose procedures are direct
 * builder calls with inline options.
 *
 * @example
 * ```ts
 * import { defineRoute } from "@loozo/angular-launch";
 * import parent from "../route";
 *
 * export default defineRoute("todos", { parent })
 *   .remote(({ query }) => ({
 *     todos: {
 *       list: query({ handler: ({ context }) => context.db.todos.listForUser(context.user.id) }),
 *     },
 *   }))
 *   .resolve({ todos: ({ remote }) => remote.todos.list() });
 * ```
 */
export const defineRoute: RouteFactory<LaunchSpec> = createRouteFactory<LaunchSpec>({
  steps: [
    { name: "context", serverOnly: true, arity: { min: 1, max: 1 } },
    { name: "use", serverOnly: true, arity: { min: 1, max: null } },
    { name: "remote", serverOnly: true, arity: { min: 1, max: 1 } },
  ],
  input,
  handle,
});
