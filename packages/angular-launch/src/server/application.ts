import {
  routeContributions,
  type AnyRoute,
  type ContributionRecord,
  type ExtensionSpec,
  type RouteFactory,
} from "@loozo/angular-router/_core";
import { defineRoute } from "../route.js";
import { builder, type ErrorDefinitions, type ProcedureKind, type Schema } from "./definitions.js";
import { declaredFailures, type DeclaredFailure } from "./errors.js";
import type { Stage } from "./stages.js";

/**
 * A registered procedure, as the server dispatches it.
 *
 * @remarks
 * Internal; not exported from a public entry point.
 */
export interface RuntimeProcedure {
  readonly kind: ProcedureKind;
  readonly input: Schema | undefined;
  readonly message: Schema | undefined;
  readonly errors: ErrorDefinitions;
  readonly use: readonly ChainMiddleware[];
  readonly [declaredFailures]?: WeakMap<object, DeclaredFailure>;
  readonly handler: (args: object) => unknown;
}

/**
 * The runtime view of a middleware, a `middleware()` definition or a bare function; the
 * dispatcher checks what it returns.
 *
 * @remarks
 * Internal; not exported from a public entry point.
 */
export type ChainMiddleware =
  | { readonly run: (args: never) => Promise<unknown> }
  | ((args: never) => Promise<unknown>);

/**
 * One namespace of a route's `.remote()`, bound to the route that declared it.
 *
 * @remarks
 * Internal; not exported from a public entry point.
 */
export interface BoundNamespace {
  /** The namespace's procedures, keyed by name. */
  readonly procedures: Readonly<Record<string, RuntimeProcedure>>;
  /** The declaring route's `.use()` middleware. */
  readonly use: readonly ChainMiddleware[];
  /** The stages from the root to the declaring route, root first. */
  readonly stages: readonly Stage[];
}

/**
 * The application requests are bound to: its identity and its namespaces.
 *
 * @remarks
 * Internal; not exported from a public entry point. Generation writes it as `application`
 * in `server.generated.ts`.
 */
export interface ApplicationBinding {
  /** The generated application identity. */
  readonly id: string;
  /** Every route's `.remote()` namespaces, keyed by namespace. */
  readonly namespaces: Readonly<Record<string, BoundNamespace>>;
  /**
   * Whether the application was generated with `translateSegments`: its redirect frames then
   * list their static word positions.
   */
  readonly translateSegments?: true;
}

/**
 * A route's Launch contribution chain: the own records of its ancestors that used a Launch
 * step, then its own, root first.
 *
 * @remarks
 * Internal; not exported from a public entry point.
 *
 * @param route - Any route.
 * @returns The chain, or `undefined` for a route Launch's `defineRoute` didn't make and
 * that has no Launch ancestor.
 */
export function launchChain(route: AnyRoute): readonly ContributionRecord[] | undefined {
  // `routeContributions` takes any extension's factory; a spec's step tuple isn't
  // assignable to the general one, so name Launch's factory by the general type.
  const factory = defineRoute as unknown as RouteFactory<ExtensionSpec>;

  return routeContributions(factory, route);
}

/**
 * Binds each namespace of a route's `.remote()` to the route's `.use()` middleware and to
 * `stages`.
 *
 * @remarks
 * Internal; not exported from a public entry point.
 *
 * @param own - The declaring route's own record, which has a `.remote()` callback.
 * @param stages - The stages a call to one of the namespaces runs, root first.
 * @returns The route's namespaces, keyed by namespace.
 */
export function bindNamespaces(
  own: ContributionRecord,
  stages: readonly Stage[],
): Record<string, BoundNamespace> {
  const build = own.remote as (procedures: typeof builder) => Record<string, object>;
  const use = (own.use ?? []) as readonly ChainMiddleware[];
  const namespaces: Record<string, BoundNamespace> = Object.create(null);

  for (const [namespace, procedures] of Object.entries(build(builder))) {
    namespaces[namespace] = {
      procedures: procedures as Record<string, RuntimeProcedure>,
      use,
      stages,
    };
  }

  return namespaces;
}

/**
 * Binds an application's authored routes into the {@link ApplicationBinding} the server
 * dispatches with.
 *
 * @remarks
 * Internal: exported only from `@loozo/angular-launch/_server` for the generated
 * `server.generated.ts`. Each namespace's owner is fixed here, from the route that declared
 * it: a call runs that route's stages and `.use()` middleware, whichever page called it.
 * Every route with a stage that a listed route's chain holds must be listed too, so the
 * stage carries its route's file. Generation lists every route with a server-only step and
 * enforces namespace uniqueness.
 *
 * @param id - The generated application identity.
 * @param routes - Each authored route with a server-only step, with its workspace-relative file.
 * @param options - `translateSegments`: generation wrote the app with translated segments.
 * @returns The application binding.
 * @throws TypeError for a route Launch's `defineRoute` didn't make, or a stage whose route
 * isn't listed.
 */
export function bindApplication(
  id: string,
  routes: readonly (readonly [route: AnyRoute, file: string])[],
  options: { readonly translateSegments?: true } = {},
): ApplicationBinding {
  const chains: (readonly Readonly<Record<string, unknown>>[])[] = [];
  // Keyed by each route's own record, which its descendants' chains share.
  const labels = new Map<object, string>();
  const stages = new Map<object, Stage>();
  const namespaces: Record<string, BoundNamespace> = Object.create(null);

  for (const [route, file] of routes) {
    const chain = launchChain(route);

    if (!chain || chain.length === 0) {
      throw new TypeError(`Launch route has no server steps: ${file}`);
    }

    chains.push(chain);
    labels.set(chain[chain.length - 1], file);
  }

  function stageOf(record: Readonly<Record<string, unknown>>): Stage {
    let stage = stages.get(record);

    if (!stage) {
      const route = labels.get(record);

      if (route === undefined) {
        throw new TypeError("Launch stage belongs to a route the application doesn't list");
      }

      stage = { run: record.context as Stage["run"], route };
      stages.set(record, stage);
    }

    return stage;
  }

  for (const chain of chains) {
    const own = chain[chain.length - 1];

    if (typeof own.remote !== "function") {
      continue;
    }

    const owned: Stage[] = [];

    for (const record of chain) {
      if (typeof record.context === "function") {
        owned.push(stageOf(record));
      }
    }

    Object.assign(namespaces, bindNamespaces(own, owned));
  }

  if (options.translateSegments) {
    return { id, namespaces, translateSegments: true };
  }

  return { id, namespaces };
}
