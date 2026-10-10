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

export interface Route<
  Path extends string,
  Params,
  Search,
  Resolvers = {},
  Fragments extends string = string,
  Catchall extends boolean = CatchallName<Path> extends never ? false : true,
> {
  readonly [routeBrand]: { readonly fragments: Fragments; readonly catchall: Catchall };
  readonly path: Path;
  readonly __params?: Params;
  readonly __search?: Search;
  readonly __data?: { readonly [Key in keyof Resolvers]: Resolved<Resolvers[Key]> };
  readonly resolve?: Readonly<Resolvers>;
  readonly runGuardsAndResolvers?: RunGuardsAndResolvers;
}

type Unwrap<Value> = Value extends Promise<infer Inner> | Observable<infer Inner>
  ? Unwrap<Inner>
  : Value;
type Resolved<Callback> = Callback extends (...args: any[]) => infer Value
  ? Exclude<Unwrap<Value>, RedirectCommand>
  : never;
export type AnyRoute = Route<string, any, any, any, any, boolean>;
export type ParamsOf<Target> =
  Target extends Route<string, infer Params, any, any, any, boolean> ? Params : {};
export type SearchOf<Target> =
  Target extends Route<string, any, infer Search, any, any, boolean> ? Search : {};
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
export type Inputs<Params, Search> = {
  readonly params: Readonly<Params>;
  readonly search: Readonly<Search>;
};
export type Resolver<Params, Search> = (
  inputs: Inputs<Params, Search>,
  snapshot: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => unknown;
export type ActivationGuard<Params, Search> = (
  inputs: Inputs<Params, Search>,
  snapshot: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => MaybeAsync<GuardResult>;
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
export type UrlValues<
  Target extends AnyRoute,
  SearchKeys extends keyof SearchOf<Target> = keyof SearchOf<Target>,
> = (keyof ParamsOf<Target> extends never ? { params?: never } : { params: ParamsOf<Target> }) &
  (keyof SearchOf<Target> extends never
    ? { search?: never }
    : RequiredKeys<SearchOf<Target>> extends never
      ? { search?: SearchInput<SearchOf<Target>, SearchKeys> }
      : { search: SearchInput<SearchOf<Target>, SearchKeys> }) &
  (FragmentsOf<Target> extends never ? { fragment?: never } : { fragment?: FragmentsOf<Target> });

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
export type Redirect<
  SourceParams,
  SourceSearch,
  Target extends AnyRoute,
  SearchKeys extends keyof SearchOf<Target>,
> = {
  to: Target;
  search:
    | { mode: "replace"; values: SearchInput<SearchOf<NoInfer<Target>>, SearchKeys> }
    | (RequiredKeys<SearchOf<Target>> extends never ? { mode: "drop" } : never)
    | (Preservable<SourceSearch, SearchOf<Target>> extends true ? { mode: "preserve" } : never);
  fragment:
    | { mode: "preserve" | "drop" }
    | (FragmentsOf<Target> extends never ? never : { mode: "replace"; value: FragmentsOf<Target> });
} & (Forwardable<SourceParams, ParamsOf<Target>> extends true
  ? { params?: Mapping<SourceParams, ParamsOf<Target>> }
  : { params: Mapping<SourceParams, ParamsOf<Target>> });

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
  parent?: Parent & (Parent extends Route<string, any, any, any, any, true> ? never : unknown);
  search?: Search & Record<Extract<keyof Search, keyof SearchOf<Parent>>, never>;
  resolve?: Resolvers &
    Record<
      PropertyKey,
      Resolver<EffectiveParams<Path, Params, Parent>, EffectiveSearch<Search, Parent>>
    > & { __loozoAngularRouterRouteId?: never };
  fragments?: Fragments;
  runGuardsAndResolvers?: RunGuardsAndResolvers;
  canActivateChild?: readonly ActivationGuard<
    EffectiveParams<Path, Params, Parent>,
    EffectiveSearch<Search, Parent>
  >[];
  canDeactivate?: NativeRoute["canDeactivate"];
  providers?: NativeRoute["providers"];
  title?: NativeRoute["title"];
  data?: NativeRoute["data"] & { __loozoAngularRouterRouteId?: never };
} & (PathNames<Path> extends never
  ? { params?: never }
  : {
      params: Params &
        Record<PathNames<Path>, PathCodec> &
        Record<
          Exclude<keyof Params, PathNames<Path>> | Extract<keyof Params, keyof ParamsOf<Parent>>,
          never
        >;
    }) &
  (Target extends AnyRoute
    ? {
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
        canActivate?: readonly ActivationGuard<
          EffectiveParams<Path, Params, Parent>,
          EffectiveSearch<Search, Parent>
        >[];
        canMatch?: readonly MatchingGuard<
          LocalParams<Path, Params>,
          EffectiveSearch<Search, Parent>
        >[];
      });
