import type {
  CreateMutationOptions,
  DataTag,
  QueryKeyWithDataTag,
  SkipToken,
  UndefinedInitialDataOptions,
} from "@tanstack/angular-query";
import type { ContributionOf } from "@loozo/angular-router/_core";
import type { ChainNamespaces } from "../route-types.js";
import type { Procedure, Schema } from "../server/definitions.js";

type NamespaceKey<Namespace> = readonly ["launch", Namespace];
type ProcedureKey<Namespace, Name> = readonly ["launch", Namespace, Name];
type InputKey<Namespace, Name, Input> = readonly ["launch", Namespace, Name, Input];

type QueryOverrides<Output, Data, Key extends readonly unknown[]> = Omit<
  UndefinedInitialDataOptions<Output, unknown, Data, Key>,
  "queryKey" | "queryFn"
>;
type QueryOptions<Output, Data, Key extends readonly unknown[]> = UndefinedInitialDataOptions<
  Output,
  unknown,
  Data,
  Key
> &
  QueryKeyWithDataTag<Key, Output, unknown>;

type QueryProcedure<Namespace, Name, Input, Output> =
  Input extends Schema<infer Caller, unknown>
    ? {
        /**
         * Query options for `injectQuery`, `QueryClient.fetchQuery` and the like.
         *
         * @param input - The procedure's input, as you would pass it to the callable.
         * @param overrides - Any other query options; they replace the defaults.
         * @returns Options keyed `["launch", namespace, procedure, input]`, with the key
         * tagged with the procedure's output type.
         */
        queryOptions<Data = Output>(
          input: Caller,
          overrides?: QueryOverrides<Output, Data, InputKey<Namespace, Name, Caller>>,
        ): QueryOptions<Output, Data, InputKey<Namespace, Name, Caller>>;
        /**
         * Query options for `injectQuery`, `QueryClient.fetchQuery` and the like, or
         * disabled options for `skipToken`.
         *
         * @param input - The procedure's input, or `skipToken` to disable the query. A
         * disabled query is keyed `["launch", namespace, procedure]` and never fetches.
         * @param overrides - Any other query options; they replace the defaults.
         * @returns Options keyed `["launch", namespace, procedure, input]`, or
         * `["launch", namespace, procedure]` for `skipToken`, with the key tagged with the
         * procedure's output type.
         */
        queryOptions<Data = Output>(
          input: Caller | SkipToken,
          overrides?: QueryOverrides<
            Output,
            Data,
            InputKey<Namespace, Name, Caller> | ProcedureKey<Namespace, Name>
          >,
        ): QueryOptions<
          Output,
          Data,
          InputKey<Namespace, Name, Caller> | ProcedureKey<Namespace, Name>
        >;
        /**
         * The key of every query of this procedure, whatever its input.
         *
         * @returns `["launch", namespace, procedure]`.
         */
        key(): ProcedureKey<Namespace, Name>;
        /**
         * The key of this procedure's query for one input.
         *
         * @param input - The procedure's input.
         * @returns `["launch", namespace, procedure, input]`, tagged with the procedure's
         * output type.
         */
        key(input: Caller): DataTag<InputKey<Namespace, Name, Caller>, Output, unknown>;
      }
    : {
        /**
         * Query options for `injectQuery`, `QueryClient.fetchQuery` and the like.
         *
         * @param overrides - Any other query options; they replace the defaults.
         * @returns Options keyed `["launch", namespace, procedure]`, with the key tagged
         * with the procedure's output type.
         */
        queryOptions<Data = Output>(
          overrides?: QueryOverrides<Output, Data, ProcedureKey<Namespace, Name>>,
        ): QueryOptions<Output, Data, ProcedureKey<Namespace, Name>>;
        /**
         * The key of this procedure's query.
         *
         * @returns `["launch", namespace, procedure]`, tagged with the procedure's output
         * type.
         */
        key(): DataTag<ProcedureKey<Namespace, Name>, Output, unknown>;
      };

type MutationOverrides<Output, Variables, OnMutateResult> = Omit<
  CreateMutationOptions<Output, unknown, Variables, OnMutateResult>,
  "mutationKey" | "mutationFn"
>;

type MutationProcedure<Namespace, Name, Input, Output> = {
  /**
   * Mutation options for `injectMutation`. The mutation's variables are the procedure's
   * input; a procedure without input takes none.
   *
   * @param overrides - Any other mutation options.
   * @returns Options keyed `["launch", namespace, procedure]`.
   */
  mutationOptions<OnMutateResult = unknown>(
    overrides?: MutationOverrides<Output, Variables<Input>, OnMutateResult>,
  ): CreateMutationOptions<Output, unknown, Variables<Input>, OnMutateResult> & {
    /** `["launch", namespace, procedure]`. */
    mutationKey: ProcedureKey<Namespace, Name>;
  };
  /**
   * The key of this procedure's mutations.
   *
   * @returns `["launch", namespace, procedure]`.
   */
  key(): ProcedureKey<Namespace, Name>;
};

type Variables<Input> = Input extends Schema<infer Caller, unknown> ? Caller : void;

type ProcedureQueries<Namespace, Name, Value> =
  Value extends Procedure<infer Input, infer Output, infer Kind, infer _Errors, infer _Message>
    ? Kind extends "query"
      ? QueryProcedure<Namespace, Name, Input, Awaited<Output>>
      : MutationProcedure<Namespace, Name, Input, Awaited<Output>>
    : never;

/**
 * The TanStack Query factories for one `.remote()` namespace: query or mutation options and
 * keys per procedure, plus the namespace's key.
 *
 * @remarks
 * Keys are `["launch", namespace]` for the namespace, `["launch", namespace, procedure]`
 * for a procedure and `["launch", namespace, procedure, input]` for one input, so
 * invalidating a shorter key also invalidates the longer ones under it. Queries call the
 * procedure with the query's `signal` and `transferCache: false`, since TanStack transfers
 * the data itself. Errors are typed `unknown`: narrow them with the callable's `isError`.
 * Streams and channels have no factories.
 *
 * Query options default `retry` to never for an `RpcError`, `RpcRedirect` or
 * `RpcNotFound` and to your `QueryClient` default, or three retries, for anything else,
 * and `refetchOnMount` to `false` while the app hydrates and to your `QueryClient`
 * default, or `true`, after. Overrides replace either default.
 *
 * @typeParam Namespace - The namespace's name.
 * @typeParam Procedures - Its procedures, keyed by name, as `.remote()` returns them.
 */
export type NamespaceQueries<Namespace, Procedures> = {
  /**
   * The key of every query and mutation of the namespace.
   *
   * @returns `["launch", namespace]`.
   */
  $key(): NamespaceKey<Namespace>;
} & {
  readonly [Name in keyof Procedures as Procedures[Name] extends {
    readonly kind: "stream" | "channel";
  }
    ? never
    : Name]: ProcedureQueries<Namespace, Name, Procedures[Name]>;
};

/**
 * A route's TanStack Query factories: one {@link NamespaceQueries} per namespace the route
 * can see, its own and its ancestors'.
 *
 * @remarks
 * The type of `route.queries` and of the `Queries` a route copy exports, which generation
 * writes when its `tanstackQuery` option is on.
 *
 * @example
 * ```ts
 * readonly route = injectRoute();
 * readonly todos = injectQuery(() => this.route.queries.todos.list.queryOptions());
 * readonly add = injectMutation(() => this.route.queries.todos.add.mutationOptions());
 *
 * refresh() {
 *   return this.client.invalidateQueries({ queryKey: this.route.queries.todos.$key() });
 * }
 * ```
 *
 * @typeParam Route - A route made by Launch's `defineRoute`, or its copy.
 */
export type QueriesOf<Route> = {
  readonly [Namespace in keyof ChainNamespaces<ContributionOf<Route>>]: NamespaceQueries<
    Namespace,
    ChainNamespaces<ContributionOf<Route>>[Namespace]
  >;
};
