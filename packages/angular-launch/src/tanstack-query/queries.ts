import type {
  CreateMutationOptions,
  DataTag,
  QueryKeyWithDataTag,
  SkipToken,
  UndefinedInitialDataOptions,
} from "@tanstack/angular-query";
import type { Group, Procedure, Schema } from "../server/definitions.js";

type GroupKey<Namespace> = readonly ["launch", Namespace];
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
  Value extends Procedure<infer Input, infer Output, infer Kind, infer _Errors>
    ? Kind extends "query"
      ? QueryProcedure<Namespace, Name, Input, Awaited<Output>>
      : MutationProcedure<Namespace, Name, Input, Awaited<Output>>
    : never;

/**
 * The TanStack Query factories for an RPC group: query or mutation options and keys per
 * procedure, plus the group's key.
 *
 * @remarks
 * The type of one namespace of a generated `injectQueries()`, which generation writes
 * when its `tanstackQuery` option is on. Keys are `["launch", namespace]` for the group,
 * `["launch", namespace, procedure]` for a procedure and
 * `["launch", namespace, procedure, input]` for one input, so invalidating a shorter key
 * also invalidates the longer ones under it. Queries call the procedure with the query's
 * `signal` and `transferCache: false`, since TanStack transfers the data itself. Errors are
 * typed `unknown`: narrow them with the callable's `isError`.
 *
 * Query options default `retry` to never for an `RpcError` and to your `QueryClient`
 * default, or three retries, for anything else, and `refetchOnMount` to `false` while the
 * app hydrates and to your `QueryClient` default, or `true`, after. Overrides replace
 * either default.
 *
 * @example
 * ```ts
 * import { injectQueries } from "./rpc.generated";
 *
 * const queries = injectQueries();
 *
 * injectQuery(() => queries.todos.list.queryOptions());
 * injectMutation(() => queries.todos.add.mutationOptions());
 * client.invalidateQueries({ queryKey: queries.todos.$key() });
 * ```
 *
 * @typeParam Value - A group created by `defineRpc`.
 */
export type RpcQueries<Value> =
  Value extends Group<infer Namespace, infer Procedures>
    ? {
        /**
         * The key of every query and mutation of the group.
         *
         * @returns `["launch", namespace]`.
         */
        $key(): GroupKey<Namespace>;
      } & {
        readonly [Name in keyof Procedures]: ProcedureQueries<Namespace, Name, Procedures[Name]>;
      }
    : never;
