import type {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Route as NativeRoute,
  GuardResult,
  MaybeAsync,
  PartialMatchRouteSnapshot,
  UrlSegment,
  UrlTree,
  RedirectCommand,
} from "@angular/router";
import type { Observable } from "rxjs";
import type { ParamCodec, CodecValue, HasFallback, IsArray } from "./codecs.js";
import type { CatchallName } from "./path.js";

declare const routeBrand: unique symbol;
/**
 * Type-only key of a route's method-free projection; never a runtime property.
 *
 * @internal
 */
export declare const routeSchema: unique symbol;

/**
 * A nominal route declaration created by `defineRoute`, not a native Angular Route.
 *
 * @remarks
 * Prefer inference from `defineRoute` over explicit generic arguments. The
 * optional `__params`, `__search`, `__data` and `__title` members are type witnesses only;
 * they are not populated runtime properties. `path` is the only enumerable runtime
 * property; behavior and parent/codec/effective-path metadata are private. Spreading a
 * declaration does not produce another valid route.
 *
 * @typeParam Path - The local authored path literal, not the effective URL path.
 * @typeParam Params - Effective inherited and local logical path values.
 * @typeParam Search - Effective inherited and local logical search values; keys
 * without a fallback or array codec are optional. URL creation accepts every key as optional.
 * @typeParam Resolvers - Local resolver callbacks; data unwraps Promise/Observable
 * results and excludes Angular RedirectCommand values.
 * @typeParam Fragments - This declaration's own allowed fragment-name union.
 * @typeParam Catchall - Whether the declaration is a terminal catchall leaf.
 * @typeParam Data - Effective resolver data: the ancestors' resolver results, then
 * this declaration's own, a nearer key hiding an ancestor's key of the same name.
 * Defaults to the local results alone.
 * @typeParam Title - `string` when this declaration or an ancestor declares a title,
 * otherwise `undefined`.
 */
export interface Route<
  Path extends string,
  Params,
  Search,
  Resolvers = {},
  Fragments extends string = string,
  Catchall extends boolean = CatchallName<Path> extends never ? false : true,
  Data = LocalData<Resolvers>,
  Title extends string | undefined = undefined,
> {
  /** Type-only: this declaration without step methods or extension witnesses. */
  readonly [routeSchema]: Route<Path, Params, Search, Resolvers, Fragments, Catchall, Data, Title>;
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
  /** Type-only witness for unwrapped effective resolver data, excluding redirects. */
  readonly __data?: Data;
  /** Type-only witness: string when this declaration or an ancestor declares a title. */
  readonly __title?: Title;
}

/** A method-free projection of an authored declaration, for generated consumers. */
export type RouteSchema<Target extends AnyRoute> = Target[typeof routeSchema];

type Unwrap<Value> = Value extends Promise<infer Inner> | Observable<infer Inner>
  ? Unwrap<Inner>
  : Value;
type Resolved<Callback> = Callback extends (...args: any[]) => infer Value
  ? Exclude<Unwrap<Value>, RedirectCommand>
  : never;
export type AnyRoute = Route<string, any, any, any, any, boolean, any, any>;
/** Extracts a declaration's effective inherited and local path-value types. */
export type ParamsOf<Target> =
  Target extends Route<string, infer Params, any, any, any, boolean, any, any> ? Params : {};
/** Extracts effective parsed search-value types; keys without a fallback or array codec are optional. */
export type SearchOf<Target> =
  Target extends Route<string, any, infer Search, any, any, boolean, any, any> ? Search : {};
/**
 * Effective search values accepted by URL creation: every key may be omitted or
 * `undefined`, and a supplied value has the key's codec type.
 */
export type SearchInputOf<Target> = {
  readonly [Key in keyof SearchOf<Target>]?: SearchOf<Target>[Key] | undefined;
};
/** Extracts only the selected declaration's own allowed fragment-name union. */
export type FragmentsOf<Target> =
  Target extends Route<string, any, any, any, infer Fragments, boolean, any, any>
    ? Fragments
    : never;
export type CodecMap = Record<string, ParamCodec<any>>;
export type LocalParams<Path extends string, Codecs> = {
  readonly [Key in keyof Codecs]: Key extends CatchallName<Path>
    ? readonly CodecValue<Codecs[Key]>[]
    : CodecValue<Codecs[Key]>;
};
// An array key reads every value; other keys read one value.
type SearchValue<Codec> =
  IsArray<Codec> extends true ? readonly CodecValue<Codec>[] : CodecValue<Codec>;
// Fallback and array keys always read a value: the fallback, or an array that may be empty.
type AlwaysReads<Codec> = HasFallback<Codec> extends true ? true : IsArray<Codec>;
// A missing, repeated or invalid value leaves a plain key absent.
export type SearchValues<Codecs> = {
  readonly [Key in keyof Codecs as AlwaysReads<Codecs[Key]> extends true
    ? Key
    : never]: SearchValue<Codecs[Key]>;
} & {
  readonly [Key in keyof Codecs as AlwaysReads<Codecs[Key]> extends true
    ? never
    : Key]?: SearchValue<Codecs[Key]>;
};
export type EffectiveParams<Path extends string, Codecs, Parent> = ParamsOf<Parent> &
  LocalParams<Path, Codecs>;
export type EffectiveSearch<Codecs, Parent> = SearchOf<Parent> & SearchValues<Codecs>;
/** Unwrapped results of a declaration's own resolvers, excluding redirects. */
export type LocalData<Resolvers> = { readonly [Key in keyof Resolvers]: Resolved<Resolvers[Key]> };
/**
 * Resolver data of a declaration's whole chain: the parent's effective data with
 * the local results laid over it, so a local key hides an inherited key of the same name.
 */
export type EffectiveData<Resolvers, Parent> = Unshadowed<
  Parent extends { readonly __data?: infer Data } ? Data : {},
  keyof Resolvers
> &
  LocalData<Resolvers>;
/** The title type of a declaration's chain: string when it or an ancestor declares one. */
export type TitleOf<Target> = Target extends { readonly __title?: infer Title } ? Title : undefined;
/** A local title makes the chain's title a string; otherwise the parent's title type carries over. */
export type EffectiveTitle<LocalTitle, Parent> = unknown extends LocalTitle
  ? TitleOf<Parent>
  : [LocalTitle] extends [undefined]
    ? TitleOf<Parent>
    : string;
// JavaScript property identity: a numeric key and its string spelling are one property.
type KeyIdentity<Key> = Key extends number ? `${Key}` : Key;
type Unshadowed<Inherited, Local> = {
  readonly [Key in keyof Inherited as KeyIdentity<Key> extends KeyIdentity<Local>
    ? never
    : Key]: Inherited[Key];
};
/**
 * Shared parsed inputs supplied to typed guards and resolvers.
 * The container and maps are shallow-frozen; nested codec values remain opaque.
 */
export type Inputs<Params, Search> = {
  /** Logical positional path values, not Angular's matrix-merged params. */
  readonly params: Readonly<Params>;
  /** Logical declared search values; plain keys without a valid value are absent. */
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
 * A title callback, run by Angular as a resolver: entered in Angular's injection context
 * after successful effective input parsing, alongside the route's local resolvers.
 *
 * @param inputs - Effective inherited and local parsed values.
 * @param snapshot - The declaring route's native snapshot.
 * @param state - The native router state being resolved.
 * @returns The page title, synchronously or via Promise/Observable.
 */
export type TitleResolver<Params, Search> = (
  inputs: Inputs<Params, Search>,
  snapshot: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => MaybeAsync<string>;
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
 * Unlike activation callbacks, it has no ancestor positional path values. It isn't
 * entered when the candidate's own path params fail to parse; the route then
 * doesn't match, or its onInvalidParams handler decides.
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

/**
 * The error passed to onInvalidParams: the first of the candidate's own path
 * params that failed to parse. The error class is not exported.
 */
export type PathInputError = Error & {
  /** Always `"path"`: search never takes part in matching. */
  readonly source: "path";
  /** The failed param's name. */
  readonly key: string;
  /** Why the raw value was rejected; the codec failure is the error's `cause`. */
  readonly reason: "missing" | "repeated" | "invalid";
};
/**
 * Decides what a candidate whose own path params fail to parse does instead of
 * not matching. Entered in Angular's injection context; throwing or rejecting
 * fails the navigation.
 *
 * @param error - The path input error, with the codec failure as its cause.
 * @param routeConfig - Angular's native candidate configuration.
 * @param segments - Angular's candidate URL segments.
 * @param partialSnapshot - Angular's native partial matching snapshot.
 * @returns `false` to try Angular's next candidate, or a UrlTree/RedirectCommand
 * to redirect; `true` is rejected because the params are invalid.
 */
export type InvalidParamsHandler = (
  error: PathInputError,
  routeConfig: NativeRoute,
  segments: UrlSegment[],
  partialSnapshot: PartialMatchRouteSnapshot,
) => MaybeAsync<false | UrlTree | RedirectCommand>;

// Infer the supplied keys, then check only those values: absent fields must not
// constrain inherited native Object members. With no supplied keys, the whole
// all-optional schema keeps a callable (String's own `search`) from matching.
type SearchInput<Schema, Keys extends keyof Schema> = keyof Schema extends never
  ? Record<string, never>
  : [Keys] extends [never]
    ? Schema
    : Pick<Schema, Keys>;
/** The `search` field type of URL values for supplied keys; `never` for a searchless destination. */
export type SearchFieldOf<
  Target extends AnyRoute,
  SearchKeys,
> = keyof SearchInputOf<Target> extends never
  ? never
  : SearchInput<SearchInputOf<Target>, SearchKeys & keyof SearchInputOf<Target>>;
/** URL values for a destination without effective path params. */
export type PathlessUrlValues<Search, Fragment> = {
  /** Forbidden: the destination has no effective path params. */
  params?: never;
  /** Any declared search values; absent or undefined values are omitted. `never` when the destination declares no search. */
  search?: Search;
  /** An optional logical name declared by this exact destination, without `#`. `never` when it declares none. */
  fragment?: Fragment;
};
/** URL values for a destination with effective path params. */
export type PathUrlValues<Params, Search, Fragment> = {
  /** All effective path values; catchalls are readonly element-value arrays. */
  params: Params;
  /** Any declared search values; absent or undefined values are omitted. `never` when the destination declares no search. */
  search?: Search;
  /** An optional logical name declared by this exact destination, without `#`. `never` when it declares none. */
  fragment?: Fragment;
};
/**
 * Explicit values for URL creation and generated link/navigation calls.
 * Effective path keys must be present; every search key may be omitted.
 * Paramless/searchless routes forbid those fields. Fragment names come only
 * from the destination's own declaration.
 *
 * @remarks
 * One object type literal, not an intersection: TypeScript relates a string to
 * each member of an intersection without its weak-type check, so String's own
 * `search` method would match the search field. A type literal, unlike an
 * interface, stays assignable to `Record<string, unknown>`.
 *
 * @typeParam Target - The selected route declaration.
 * @typeParam SearchKeys - Supplied search keys inferred by each call to preserve
 * optional-key typing, including keys that coincide with Object members.
 */
export type UrlValues<
  Target extends AnyRoute,
  SearchKeys extends keyof SearchOf<Target> = keyof SearchOf<Target>,
> = keyof ParamsOf<Target> extends never
  ? PathlessUrlValues<SearchFieldOf<Target, SearchKeys>, FragmentsOf<Target>>
  : PathUrlValues<ParamsOf<Target>, SearchFieldOf<Target, SearchKeys>, FragmentsOf<Target>>;

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
/**
 * A typed redirect to a genuine authored declaration, not a concrete URL.
 *
 * @remarks
 * Params map destination keys to compatible effective source path keys. Omission
 * forwards by name only when all target keys are compatible. Search and fragment
 * policies are mandatory. Search preserve retains the original query text, drop
 * removes it, and replace serializes explicit target-typed values (`{}` removes
 * the query). Fragment preserve retains the incoming raw name, whereas replace
 * requires a target-declared name. Angular executes the redirect.
 */
export type Redirect<
  SourceParams,
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
        /** Any target search keys; unknown keys fail. */
        values: SearchInput<
          SearchInputOf<NoInfer<Target>>,
          SearchKeys & keyof SearchInputOf<NoInfer<Target>>
        >;
      }
    | {
        /** Keep the original query text, or remove all incoming query values. */
        mode: "preserve" | "drop";
      };
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
