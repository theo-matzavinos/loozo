import type { Route as NativeRoute, RunGuardsAndResolvers } from "@angular/router";
import type { PathCodec, SyncCodecs } from "./codecs.js";
import type { CatchallName, PathNames, ValidPath } from "./path.js";
import { declareRoute, routeMetadata, reservedStepNames } from "./route.js";
import type {
  ActivationGuard,
  AnyRoute,
  CodecMap,
  EffectiveData,
  EffectiveParams,
  EffectiveSearch,
  EffectiveTitle,
  InvalidParamsHandler,
  LocalParams,
  MatchingGuard,
  ParamsOf,
  Redirect,
  Resolver,
  Route,
  SearchOf,
  TitleOf,
  TitleResolver,
} from "./types.js";

/**
 * URL facts: the only object `defineRoute` takes. Behavior goes in chained steps.
 * Local params/search cannot redeclare keys inherited from the parent.
 */
export type UrlFacts<
  Path extends string,
  Parent extends AnyRoute | undefined,
  Params extends Record<string, PathCodec>,
  Search extends CodecMap,
  Fragments extends readonly string[],
> = {
  /** Genuine authored parent; pathless nodes retain inherited input ownership. */
  parent?: Parent &
    (Parent extends Route<string, any, any, any, any, true, any, any> ? never : unknown);
  /** Local search codecs; a plain key is absent unless present and valid. withFallback and arrayParam keys always read a value. */
  search?: Search &
    Record<Extract<keyof Search, keyof SearchOf<Parent>>, never> &
    SyncCodecs<NoInfer<Search>>;
  /** Local logical anchor names, never inherited; this does not enable scrolling. */
  fragments?: Fragments;
} & (PathNames<Path> extends never
  ? {
      /** Paths without local placeholders cannot declare a params map. */
      params?: never;
    }
  : {
      /** Exactly the local placeholder names; catchall codecs apply per element. */
      params: Params &
        Record<PathNames<Path>, PathCodec> &
        Record<
          Exclude<keyof Params, PathNames<Path>> | Extract<keyof Params, keyof ParamsOf<Parent>>,
          never
        > &
        SyncCodecs<NoInfer<Params>>;
    });

type Guard = "canMatch" | "canActivate" | "canActivateChild" | "canDeactivate";
/** The router's own chained steps. */
export type RouterStep =
  | Guard
  | "resolve"
  | "title"
  | "providers"
  | "data"
  | "runGuardsAndResolvers"
  | "onInvalidParams"
  | "redirect";

/**
 * One contributed step's typing, as a higher-kinded type. The router writes `chain`
 * (root-first records, this route's own record last) and `args` (the inferred
 * argument tuple); the extension reads them.
 *
 * @internal
 */
export interface StepSignature {
  readonly chain: unknown;
  readonly args: unknown;
  /** The step's parameter list as a tuple or array type; callbacks in it are contextually typed. */
  readonly parameters: readonly unknown[];
  /**
   * This route's own-record entry for the step, from `args`: `args[0]` when the step's
   * `arity.max` is 1, otherwise the argument tuple itself.
   */
  readonly own: object;
}
type StepParameters<S extends StepSignature, C> = (S & { readonly chain: C })["parameters"];
type StepOwn<S extends StepSignature, C, A> = (S & { readonly chain: C; readonly args: A })["own"];

/**
 * One manifest entry. `name`, `serverOnly` and `arity` must be literal types.
 *
 * @internal
 */
export interface ExtensionStep {
  readonly name: string;
  readonly type: StepSignature;
  readonly serverOnly: boolean;
  /** Accepted argument counts; `max: null` is unbounded. */
  readonly arity: { readonly min: number; readonly max: number | null };
}

/**
 * A higher-kinded type: the extra callback-input members, from a route's contribution chain (root first).
 *
 * @internal
 */
export interface InputContribution {
  readonly chain: unknown;
  readonly input: object;
}
/**
 * An extension's callback-input members for one contribution chain.
 *
 * @internal
 */
export type Apply<C extends InputContribution, S extends readonly object[]> = (C & {
  readonly chain: S;
})["input"];

/**
 * What a route extension contributes.
 *
 * @internal
 */
export interface ExtensionSpec {
  /** Ordered: each step is optional and used at most once, in this order, before any router step. */
  readonly steps: readonly ExtensionStep[];
  readonly input: InputContribution;
  /** The extension's own unique symbol; keys the route's opaque type witness. */
  readonly witness: symbol;
}
/**
 * The router's own factory: no contributed steps, no extra input, no witness.
 *
 * @internal
 */
export interface NoExtension extends ExtensionSpec {
  readonly steps: readonly [];
  readonly input: { readonly chain: unknown; readonly input: {} };
  readonly witness: never;
}

/**
 * A route's contribution chain: same-extension ancestors' own records, then its own.
 *
 * @internal
 */
export type ContributionOf<T> = T extends { readonly __contribution?: infer S }
  ? S extends readonly object[]
    ? S
    : readonly []
  : readonly [];
// String-keyed like Route's other witnesses, so declaration emit can name it.
type Witness<E extends ExtensionSpec, S> = { readonly [K in E["witness"]]: S } & {
  /** Type-only witness for the route's contribution chain; not populated at runtime. */
  readonly __contribution?: S;
};
// A route that used no contributed step adds no record.
type Chain<Ancestors extends readonly object[], Own extends object> = keyof Own extends never
  ? Ancestors
  : readonly [...Ancestors, Own];
type ChainOf<Parent, Own extends object> = Chain<ContributionOf<Parent>, Own>;
type Merge<A, B> = keyof A extends never ? B : Omit<A, keyof B> & B;
type After<Steps extends readonly ExtensionStep[], Name> = Steps extends readonly [
  infer Head extends ExtensionStep,
  ...infer Tail extends readonly ExtensionStep[],
]
  ? Head["name"] extends Name
    ? Tail
    : After<Tail, Name>
  : readonly [];
// Adds an extension's input members to a callback's first argument.
type Enrich<Fn, Extra> = keyof Extra extends never
  ? Fn
  : Fn extends (input: infer Input, ...rest: infer Rest) => infer Output
    ? (input: Input & Extra, ...rest: Rest) => Output
    : never;
type X<E extends ExtensionSpec, Parent, Own extends object> = Apply<
  E["input"],
  ChainOf<Parent, Own>
>;
type Eff<P extends string, Params, Parent> = EffectiveParams<P, Params, Parent>;
type Srch<Search, Parent> = EffectiveSearch<Search, Parent>;

/** A compact parent witness: its effective types and contribution chain, without its steps. */
export type ParentSchema<Parent> = Parent extends AnyRoute
  ? Route<
      string,
      ParamsOf<Parent>,
      SearchOf<Parent>,
      {},
      never,
      boolean,
      Parent extends { readonly __data?: infer Data } ? Data : {},
      TitleOf<Parent>
    > & { readonly __contribution?: ContributionOf<Parent> }
  : undefined;

/**
 * The router's chained steps. Each is offered at most once; a used step is gone from
 * the returned value.
 */
export interface RouteSteps<
  P extends string,
  Parent extends AnyRoute | undefined,
  Params extends Record<string, PathCodec>,
  Search extends CodecMap,
  R,
  F extends readonly string[],
  T,
  Used extends RouterStep,
  E extends ExtensionSpec,
  Own extends object,
  Remaining extends readonly ExtensionStep[],
> {
  /**
   * Matching guards with local path params and effective search only.
   * After any guard step the route can no longer redirect.
   */
  canMatch(
    guards: readonly Enrich<
      MatchingGuard<LocalParams<P, Params>, Srch<Search, Parent>>,
      X<E, Parent, Own>
    >[],
  ): RouteBuilder<P, Parent, Params, Search, R, F, T, Used | "canMatch", E, Own, Remaining>;
  /** Activation guards with effective inherited and local parsed inputs. */
  canActivate(
    guards: readonly Enrich<
      ActivationGuard<Eff<P, Params, Parent>, Srch<Search, Parent>>,
      X<E, Parent, Own>
    >[],
  ): RouteBuilder<P, Parent, Params, Search, R, F, T, Used | "canActivate", E, Own, Remaining>;
  /** Guards with declaring-parent inputs and Angular's native child snapshot. */
  canActivateChild(
    guards: readonly Enrich<
      ActivationGuard<Eff<P, Params, Parent>, Srch<Search, Parent>>,
      X<E, Parent, Own>
    >[],
  ): RouteBuilder<P, Parent, Params, Search, R, F, T, Used | "canActivateChild", E, Own, Remaining>;
  /** Native component-first guard functions/tokens, without automatic input parsing. */
  canDeactivate(
    guards: NonNullable<NativeRoute["canDeactivate"]>,
  ): RouteBuilder<P, Parent, Params, Search, R, F, T, Used | "canDeactivate", E, Own, Remaining>;
  /** Local parsed-input resolvers; not snapshot-first native ResolveFn callbacks. */
  resolve<New>(
    resolvers: New &
      Record<
        PropertyKey,
        Enrich<Resolver<Eff<P, Params, Parent>, Srch<Search, Parent>>, X<E, Parent, Own>>
      > & { __loozoAngularRouterRouteId?: never },
  ): RouteBuilder<P, Parent, Params, Search, New, F, T, Used | "resolve", E, Own, Remaining>;
  /** A static title, or a parsed-input callback; not a snapshot-first native ResolveFn. */
  title(
    title:
      | string
      | Enrich<TitleResolver<Eff<P, Params, Parent>, Srch<Search, Parent>>, X<E, Parent, Own>>,
  ): RouteBuilder<P, Parent, Params, Search, R, F, string, Used | "title", E, Own, Remaining>;
  /** Native route-scoped providers; provider factories are not run at declaration. */
  providers(
    providers: NonNullable<NativeRoute["providers"]>,
  ): RouteBuilder<P, Parent, Params, Search, R, F, T, Used | "providers", E, Own, Remaining>;
  /** Native static data; cannot set the reserved __loozoAngularRouterRouteId key. */
  data(
    data: NonNullable<NativeRoute["data"]> & { __loozoAngularRouterRouteId?: never },
  ): RouteBuilder<P, Parent, Params, Search, R, F, T, Used | "data", E, Own, Remaining>;
  /** Native rerun policy. Use paramsOrQueryParamsChange for query-dependent data. */
  runGuardsAndResolvers(
    policy: RunGuardsAndResolvers,
  ): RouteBuilder<
    P,
    Parent,
    Params,
    Search,
    R,
    F,
    T,
    Used | "runGuardsAndResolvers",
    E,
    Own,
    Remaining
  >;
  /**
   * Decides what happens when this route's own path params fail to parse; without it
   * the route doesn't match and Angular tries its next candidate. Only offered on
   * paths with local placeholders. After it the route can no longer redirect.
   */
  onInvalidParams(
    handler: InvalidParamsHandler,
  ): RouteBuilder<P, Parent, Params, Search, R, F, T, Used | "onInvalidParams", E, Own, Remaining>;
  /**
   * A typed native redirect. Terminal: no step follows it, and it isn't offered after
   * any guard step or onInvalidParams.
   */
  redirect<Target extends AnyRoute, Keys extends keyof SearchOf<NoInfer<Target>> = never>(
    redirect: Redirect<Eff<P, Params, Parent>, Target, Keys>,
  ): RouteEnd<P, Parent, Params, Search, R, F, T, E, Own>;
}

/** The method-free declaration with its witnesses. */
export type RouteEnd<
  P extends string,
  Parent extends AnyRoute | undefined,
  Params extends Record<string, PathCodec>,
  Search extends CodecMap,
  R,
  F extends readonly string[],
  T,
  E extends ExtensionSpec,
  Own extends object,
> = Route<
  P,
  Eff<P, Params, Parent>,
  Srch<Search, Parent>,
  R,
  F[number],
  CatchallName<P> extends never ? false : true,
  EffectiveData<R, Parent>,
  EffectiveTitle<T, Parent>
> &
  Witness<E, ChainOf<Parent, Own>>;

/** Contributed steps still offered: the manifest suffix after the last one used. */
type ContributedSteps<
  P extends string,
  Parent extends AnyRoute | undefined,
  Params extends Record<string, PathCodec>,
  Search extends CodecMap,
  R,
  F extends readonly string[],
  T,
  E extends ExtensionSpec,
  Own extends object,
  Remaining extends readonly ExtensionStep[],
> = {
  readonly [Entry in Remaining[number] as Entry["name"]]: <
    A extends StepParameters<Entry["type"], ChainOf<Parent, Own>>,
  >(
    ...args: A
  ) => RouteBuilder<
    P,
    Parent,
    Params,
    Search,
    R,
    F,
    T,
    never,
    E,
    Merge<Own, StepOwn<Entry["type"], ChainOf<Parent, Own>, A>>,
    After<Remaining, Entry["name"]>
  >;
};

/** Every chain stage, including the exported chain end. */
export type RouteBuilder<
  P extends string,
  Parent extends AnyRoute | undefined,
  Params extends Record<string, PathCodec>,
  Search extends CodecMap,
  R,
  F extends readonly string[],
  T,
  Used extends RouterStep = never,
  E extends ExtensionSpec = NoExtension,
  Own extends object = {},
  Remaining extends readonly ExtensionStep[] = E["steps"],
> = RouteEnd<P, Parent, Params, Search, R, F, T, E, Own> &
  Pick<
    RouteSteps<P, Parent, Params, Search, R, F, T, Used, E, Own, Remaining>,
    Exclude<
      RouterStep,
      | Used
      | (Extract<Used, Guard | "onInvalidParams"> extends never ? never : "redirect")
      | (PathNames<P> extends never ? "onInvalidParams" : never)
    >
  > &
  ([Used] extends [never]
    ? Remaining extends readonly []
      ? {}
      : ContributedSteps<P, Parent, Params, Search, R, F, T, E, Own, Remaining>
    : {});

/**
 * One route's own contributed record: `{ [step]: stored argument(s) }`.
 *
 * @internal
 */
export type ContributionRecord = Readonly<Record<string, unknown>>;

// Homomorphic over the tuple, so each position keeps its own literal entry.
type RuntimeSteps<Steps extends readonly ExtensionStep[]> = {
  readonly [K in keyof Steps]: Omit<Steps[K], "type">;
};
/**
 * The runtime half of an extension: names, order, flags and arity must match the spec.
 *
 * @internal
 */
export interface RuntimeExtension<E extends ExtensionSpec> {
  readonly steps: RuntimeSteps<E["steps"]>;
  /**
   * Builds the extra callback-input members for one callback phase of one route
   * snapshot. Runs synchronously in Angular's injection context, with the declaring
   * route's environment injector. It may not return `params` or `search`.
   */
  readonly input: (chain: readonly ContributionRecord[]) => object;
}

declare const routeFactory: unique symbol;
// Each factory's validated, frozen runtime; route metadata points at the same object.
const factories = new WeakMap<object, RuntimeExtension<ExtensionSpec>>();
/**
 * A route factory made by `createRouteFactory`: `defineRoute(path, facts)` with the
 * extension's steps offered first.
 *
 * @internal
 */
export interface RouteFactory<E extends ExtensionSpec> {
  /** Type-only brand; not populated at runtime. */
  readonly [routeFactory]: E;
  <
    const P extends string,
    Parent extends AnyRoute | undefined = undefined,
    Params extends Record<string, PathCodec> = {},
    Search extends CodecMap = {},
    const F extends readonly string[] = [],
  >(
    path: P & ValidPath<P>,
    facts: UrlFacts<P, Parent, Params, Search, F>,
  ): RouteBuilder<P, ParentSchema<Parent>, Params, Search, {}, F, unknown, never, E>;
}

/**
 * Creates a route factory whose routes offer the extension's steps before the
 * router's own. Internal seam for Launch; not a supported application API.
 *
 * @throws TypeError for an invalid manifest: a reserved or duplicate step name, a
 * non-boolean `serverOnly`, or an invalid arity.
 *
 * @internal
 */
export function createRouteFactory<const E extends ExtensionSpec>(
  extension: RuntimeExtension<E>,
): RouteFactory<E> {
  const runtime = extension as unknown as RuntimeExtension<ExtensionSpec>;

  if (!Array.isArray(runtime.steps)) {
    throw new TypeError("Route extension steps must be an array");
  }

  if (typeof runtime.input !== "function") {
    throw new TypeError("Route extension input must be a function");
  }

  const names = new Set<string>();
  const steps: Omit<ExtensionStep, "type">[] = [];

  for (const entry of runtime.steps as readonly unknown[]) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError("Route extension step must be an own record");
    }

    const { name, serverOnly, arity } = entry as Record<string, unknown>;

    if (typeof name !== "string") {
      throw new TypeError("Route extension step name must be a string");
    }

    if (reservedStepNames.has(name)) {
      throw new TypeError(`Reserved contributed step name: ${name}`);
    }

    if (names.has(name)) {
      throw new TypeError(`Duplicate contributed step name: ${name}`);
    }

    names.add(name);

    if (typeof serverOnly !== "boolean") {
      throw new TypeError(`serverOnly must be a boolean: ${name}`);
    }

    if (arity === null || typeof arity !== "object") {
      throw new TypeError(`Route extension step arity must be a record: ${name}`);
    }

    const { min, max } = arity as Record<string, unknown>;

    if (typeof min !== "number" || !Number.isInteger(min) || min < 0) {
      throw new TypeError(`arity.min must be a non-negative integer: ${name}`);
    }

    if (
      max !== null &&
      (typeof max !== "number" || !Number.isInteger(max) || max < Math.max(min, 1))
    ) {
      throw new TypeError(`arity.max must be null or an integer >= max(min, 1): ${name}`);
    }

    steps.push(Object.freeze({ name, serverOnly, arity: Object.freeze({ min, max }) }));
  }

  const frozen = Object.freeze({ steps: Object.freeze(steps), input: runtime.input });

  function factory(path: unknown, facts: unknown): AnyRoute {
    return declareRoute(frozen, path, facts);
  }

  factories.set(factory, frozen);

  return factory as unknown as RouteFactory<E>;
}

/**
 * A route's contribution chain for the extension that made `factory`: same-extension
 * ancestors' own records, then the route's own, root first. Undefined for a route
 * outside that extension. The chain and its records are frozen.
 *
 * @internal
 */
export function routeContributions(
  factory: RouteFactory<ExtensionSpec>,
  route: AnyRoute,
): readonly ContributionRecord[] | undefined {
  const slot = routeMetadata(route).extension;

  if (!slot || slot.runtime !== factories.get(factory)) {
    return undefined;
  }

  return slot.chain;
}
