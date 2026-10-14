import type {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Route as NativeRoute,
  RunGuardsAndResolvers,
  GuardResult,
  MaybeAsync,
  PartialMatchRouteSnapshot,
  UrlSegment,
  RedirectCommand,
} from "@angular/router";
import type { Observable } from "rxjs";
import type { ParamCodec, PathCodec, CodecValue, IsOptional } from "./codecs.js";
import type { CatchallName, PathNames } from "./path.js";

declare const routeBrand: unique symbol;

/**
 * A nominal route declaration created by `defineRoute`, not a native Angular Route.
 *
 * @remarks
 * Prefer inference from `defineRoute` over explicit generic arguments. The
 * optional `__params`, `__search` and `__data` members are type witnesses only;
 * they are not populated runtime properties. Parent/codec/effective-path metadata
 * is private. Spreading a declaration does not produce another valid route.
 *
 * @typeParam Path - The local authored path literal, not the effective URL path.
 * @typeParam Params - Effective inherited and local logical path values.
 * @typeParam Search - Effective inherited and local logical search values.
 * @typeParam Resolvers - Local resolver callbacks; data unwraps Promise/Observable
 * results and excludes Angular RedirectCommand values.
 * @typeParam Fragments - This declaration's own allowed fragment-name union.
 * @typeParam Catchall - Whether the declaration is a terminal catchall leaf.
 */
export interface Route<
  Path extends string,
  Params,
  Search,
  Resolvers = {},
  Fragments extends string = string,
  Catchall extends boolean = CatchallName<Path> extends never ? false : true,
> {
  /** Type-only nominal brand carrying fragment and catchall metadata; not populated at runtime. */
  readonly [routeBrand]: {
    /** Type-only: this declaration's own allowed fragment-name union. */
    readonly fragments: Fragments;
    /** Type-only: whether this declaration is a terminal catchall leaf. */
    readonly catchall: Catchall;
  };
  /** The exact local authored path supplied to `defineRoute`. */
  readonly path: Path;
  /** Type-only witness for effective path values; not populated at runtime. */
  readonly __params?: Params;
  /** Type-only witness for effective search values; not populated at runtime. */
  readonly __search?: Search;
  /** Type-only witness for unwrapped local resolver data, excluding redirects. */
  readonly __data?: { readonly [Key in keyof Resolvers]: Resolved<Resolvers[Key]> };
  /** The snapshotted local resolver map, retaining original callback identities. */
  readonly resolve?: Readonly<Resolvers>;
  /** The original native rerun policy; omission preserves Angular's default. */
  readonly runGuardsAndResolvers?: RunGuardsAndResolvers;
}

type Unwrap<Value> = Value extends Promise<infer Inner> | Observable<infer Inner>
  ? Unwrap<Inner>
  : Value;
type Resolved<Callback> = Callback extends (...args: any[]) => infer Value
  ? Exclude<Unwrap<Value>, RedirectCommand>
  : never;
export type AnyRoute = Route<string, any, any, any, any, boolean>;
/** Extracts a declaration's effective inherited and local path-value types. */
export type ParamsOf<Target> =
  Target extends Route<string, infer Params, any, any, any, boolean> ? Params : {};
/** Extracts effective search-value types, retaining optional/nullable modifiers. */
export type SearchOf<Target> =
  Target extends Route<string, any, infer Search, any, any, boolean> ? Search : {};
/** Extracts only the selected declaration's own allowed fragment-name union. */
export type FragmentsOf<Target> =
  Target extends Route<string, any, any, any, infer Fragments, boolean> ? Fragments : never;
export type CodecMap = Record<string, ParamCodec<any>>;
export type LocalParams<Path extends string, Codecs> = {
  readonly [Key in keyof Codecs]: Key extends CatchallName<Path>
    ? readonly CodecValue<Codecs[Key]>[]
    : CodecValue<Codecs[Key]>;
};
export type SearchValues<Codecs> = {
  readonly [Key in keyof Codecs as IsOptional<Codecs[Key]> extends true ? never : Key]: CodecValue<
    Codecs[Key]
  >;
} & {
  readonly [Key in keyof Codecs as IsOptional<Codecs[Key]> extends true ? Key : never]?: CodecValue<
    Codecs[Key]
  >;
};
export type EffectiveParams<Path extends string, Codecs, Parent> = ParamsOf<Parent> &
  LocalParams<Path, Codecs>;
export type EffectiveSearch<Codecs, Parent> = SearchOf<Parent> & SearchValues<Codecs>;
/**
 * Shared parsed inputs supplied to typed guards and resolvers.
 * The container and maps are shallow-frozen; nested codec values remain opaque.
 */
export type Inputs<Params, Search> = {
  /** Logical positional path values, not Angular's matrix-merged params. */
  readonly params: Readonly<Params>;
  /** Logical declared search values; absent optional keys are omitted. */
  readonly search: Readonly<Search>;
};
/**
 * A local resolver invoked after successful effective input parsing.
 * Callback entry has Angular's injection context; later awaits do not inherit it.
 * Angular owns first-emission, empty, redirect, error and teardown behavior.
 *
 * @param inputs - Effective inherited and local parsed values.
 * @param snapshot - The declaring route's native snapshot.
 * @param state - The native router state being resolved.
 * @returns A scalar, Promise, Observable or RedirectCommand result.
 */
export type Resolver<Params, Search> = (
  inputs: Inputs<Params, Search>,
  snapshot: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => unknown;
/**
 * An activation callback entered in Angular's injection context after parsing.
 * Parse failures prevent entry and propagate as navigation errors, not false.
 *
 * @param inputs - The declaring route's effective parsed params/search.
 * @param snapshot - The native route snapshot, or the child snapshot for
 * canActivateChild (whose inputs still belong to the declaring parent).
 * @param state - The native target router state.
 * @returns A native guard result, synchronously or via Promise/Observable.
 */
export type ActivationGuard<Params, Search> = (
  inputs: Inputs<Params, Search>,
  snapshot: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => MaybeAsync<GuardResult>;
/**
 * A candidate matching callback entered in Angular's injection context after parsing.
 * Unlike activation callbacks, it has no ancestor positional path values.
 *
 * @param inputs - Local positional params plus effective inherited/local search.
 * @param routeConfig - Angular's native candidate configuration.
 * @param segments - Angular's candidate URL segments.
 * @param partialSnapshot - Angular's native partial matching snapshot.
 * @returns A native guard result; false permits Angular's next candidate.
 */
export type MatchingGuard<Params, Search> = (
  inputs: Inputs<Params, Search>,
  routeConfig: NativeRoute,
  segments: UrlSegment[],
  partialSnapshot: PartialMatchRouteSnapshot,
) => MaybeAsync<GuardResult>;

type RequiredKeys<Value> = {
  [Key in keyof Value]-?: Pick<Value, Key> extends Required<Pick<Value, Key>> ? Key : never;
}[keyof Value];
// Infer the supplied keys, then check those values and every required binding.
// Absent optional fields must not constrain inherited native Object members.
type SearchInput<Schema, Keys extends keyof Schema> = keyof Schema extends never
  ? Record<string, never>
  : Pick<Schema, RequiredKeys<Schema> | Keys>;
/**
 * Explicit values for URL creation and generated link/navigation calls.
 * Effective path and required search keys must be present; optional search may
 * be omitted. Paramless/searchless routes forbid those fields. Fragment names
 * come only from the destination's own declaration.
 *
 * @typeParam Target - The selected route declaration.
 * @typeParam SearchKeys - Supplied search keys inferred by each call to preserve
 * optional-key typing, including keys that coincide with Object members.
 */
export type UrlValues<
  Target extends AnyRoute,
  SearchKeys extends keyof SearchOf<Target> = keyof SearchOf<Target>,
> = (keyof ParamsOf<Target> extends never
  ? {
      /** Forbidden when the destination has no effective path params. */
      params?: never;
    }
  : {
      /** All effective path values; catchalls are readonly element-value arrays. */
      params: ParamsOf<Target>;
    }) &
  (keyof SearchOf<Target> extends never
    ? {
        /** Forbidden when the destination has no search declarations. */
        search?: never;
      }
    : RequiredKeys<SearchOf<Target>> extends never
      ? {
          /** Optional-only search; absent or undefined optional values are omitted. */
          search?: SearchInput<SearchOf<Target>, SearchKeys>;
        }
      : {
          /** All required search values plus any supplied optional values. */
          search: SearchInput<SearchOf<Target>, SearchKeys>;
        }) &
  (FragmentsOf<Target> extends never
    ? {
        /** Forbidden when this declaration has no fragment names. */
        fragment?: never;
      }
    : {
        /** An optional logical name declared by this exact destination, without `#`. */
        fragment?: FragmentsOf<Target>;
      });

type CompatibleKeys<Source, Value> = {
  [Key in keyof Source]: Source[Key] extends Value ? Key : never;
}[keyof Source];
type Mapping<Source, Destination> = {
  [Key in keyof Destination]: CompatibleKeys<Source, Destination[Key]>;
};
type Forwardable<Source, Destination> = {
  [Key in keyof Destination]: Key extends keyof Source
    ? Source[Key] extends Destination[Key]
      ? never
      : Key
    : Key;
}[keyof Destination] extends never
  ? true
  : false;
type Preservable<Source, Destination> = {
  [Key in RequiredKeys<Destination>]: Key extends RequiredKeys<Source>
    ? Source[Key & keyof Source] extends Destination[Key]
      ? never
      : Key
    : Key;
}[RequiredKeys<Destination>] extends never
  ? true
  : false;
/**
 * A typed redirect to a genuine authored declaration, not a concrete URL.
 *
 * @remarks
 * Params map destination keys to compatible effective source path keys. Omission
 * forwards by name only when all target keys are compatible. Search and fragment
 * policies are mandatory. Search preserve validates destination-declared values
 * but retains original query text and unknown keys; drop requires no required
 * target search keys; replace uses explicit target-typed values (`{}` is allowed
 * for searchless targets). Fragment preserve retains the incoming raw name,
 * whereas replace requires a target-declared name. Angular executes the redirect.
 */
export type Redirect<
  SourceParams,
  SourceSearch,
  Target extends AnyRoute,
  SearchKeys extends keyof SearchOf<Target>,
> = {
  /** The already constructed target; generation requires a direct default import. */
  to: Target;
  /** Explicit query policy: preserve incoming text, drop it, or replace with values. */
  search:
    | {
        /** Discard incoming queries and serialize explicit target-typed values. */
        mode: "replace";
        /** Required target search keys plus selected optional keys; unknown keys fail. */
        values: SearchInput<SearchOf<NoInfer<Target>>, SearchKeys>;
      }
    | (RequiredKeys<SearchOf<Target>> extends never
        ? {
            /** Remove all incoming query values; target required keys are forbidden. */
            mode: "drop";
          }
        : never)
    | (Preservable<SourceSearch, SearchOf<Target>> extends true
        ? {
            /** Keep original query text, validating destination-declared cardinality/values. */
            mode: "preserve";
          }
        : never);
  /** Explicit hash policy; preserved incoming names need not be declared. */
  fragment:
    | {
        /** Keep the raw incoming hash, or remove it entirely. */
        mode: "preserve" | "drop";
      }
    | (FragmentsOf<Target> extends never
        ? never
        : {
            /** Replace the incoming hash with an explicitly declared target name. */
            mode: "replace";
            /** A logical target fragment name without the `#` delimiter. */
            value: FragmentsOf<Target>;
          });
} & (Forwardable<SourceParams, ParamsOf<Target>> extends true
  ? {
      /** Optional destination-key to source-key mapping; otherwise forward by name. */
      params?: Mapping<SourceParams, ParamsOf<Target>>;
    }
  : {
      /** Required mapping of every destination path key to a compatible source key. */
      params: Mapping<SourceParams, ParamsOf<Target>>;
    });

/**
 * Options inferred by `defineRoute`; Angular's structural route fields are excluded.
 * Local params/search cannot redeclare keys inherited from the parent.
 */
export type RouteConfig<
  Path extends string,
  Parent extends AnyRoute | undefined,
  Params extends Record<string, PathCodec>,
  Search extends CodecMap,
  Resolvers,
  Fragments extends readonly string[],
  Target extends AnyRoute | undefined,
  ReplacementKeys extends keyof SearchOf<Target>,
> = {
  /** Genuine authored parent; pathless nodes retain inherited input ownership. */
  parent?: Parent & (Parent extends Route<string, any, any, any, any, true> ? never : unknown);
  /** Local search codecs; keys are required unless wrapped with optionalSearchParam. */
  search?: Search & Record<Extract<keyof Search, keyof SearchOf<Parent>>, never>;
  /** Local parsed-input resolvers; not snapshot-first native ResolveFn callbacks. */
  resolve?: Resolvers &
    Record<
      PropertyKey,
      Resolver<EffectiveParams<Path, Params, Parent>, EffectiveSearch<Search, Parent>>
    > & { __loozoAngularRouterRouteId?: never };
  /** Local logical anchor names, never inherited; this does not enable scrolling. */
  fragments?: Fragments;
  /** Native rerun policy. Use paramsOrQueryParamsChange for query-dependent data. */
  runGuardsAndResolvers?: RunGuardsAndResolvers;
  /** Guards with declaring-parent inputs and Angular's native child snapshot. */
  canActivateChild?: readonly ActivationGuard<
    EffectiveParams<Path, Params, Parent>,
    EffectiveSearch<Search, Parent>
  >[];
  /** Native component-first guard functions/tokens, without automatic input parsing. */
  canDeactivate?: NativeRoute["canDeactivate"];
  /** Native route-scoped providers; provider factories are not run at declaration. */
  providers?: NativeRoute["providers"];
  /** Native static title or title resolver, not a parsed-input callback. */
  title?: NativeRoute["title"];
  /** Native static data; cannot set the reserved __loozoAngularRouterRouteId key. */
  data?: NativeRoute["data"] & { __loozoAngularRouterRouteId?: never };
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
        >;
    }) &
  (Target extends AnyRoute
    ? {
        /** Typed native redirect, incompatible with own canActivate/canMatch fields. */
        redirect: Redirect<
          EffectiveParams<Path, Params, Parent>,
          EffectiveSearch<Search, Parent>,
          Target,
          ReplacementKeys
        >;
        canActivate?: never;
        canMatch?: never;
      }
    : {
        redirect?: never;
        /** Activation guards with effective inherited and local parsed inputs. */
        canActivate?: readonly ActivationGuard<
          EffectiveParams<Path, Params, Parent>,
          EffectiveSearch<Search, Parent>
        >[];
        /** Matching guards with local path params and effective search only. */
        canMatch?: readonly MatchingGuard<
          LocalParams<Path, Params>,
          EffectiveSearch<Search, Parent>
        >[];
      });
