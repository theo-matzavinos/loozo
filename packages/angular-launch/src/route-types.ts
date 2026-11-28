// The types of Launch's route extension. Types only. The root entry re-exports `ChainContext`,
// `RemoteOf` and `ContextOf`. A route's inferred type names `LaunchSpec`, `LaunchStep` and the
// step signatures of the steps it still offers, so the `/_route` entry re-exports those for
// declaration emit (router SPEC §2 "Route extensions"). `LaunchInput` and `ChainNamespaces`
// stay exported from this module only, which Launch's own declarations reference.
import type {
  ContributionOf,
  ExtensionSpec,
  InputContribution,
  StepSignature,
} from "@loozo/angular-router/_core";
import type { Client } from "./client.js";
import type {
  MiddlewareDefinition,
  ProcedureBuilder,
  ProcedureDefinition,
  StageArgs,
} from "./server/definitions.js";

/** Type-only witness of Launch's route extension; absent at runtime. */
export declare const launch: unique symbol;

type Flat<Value> = { [Key in keyof Value]: Value[Key] } & {};

declare const noStage: unique symbol;
type NoStage = typeof noStage;
type StageValue<Own> = Own extends {
  readonly context: (...args: never[]) => infer Value;
}
  ? Awaited<Value>
  : NoStage;
type Last<Chain, Context> = Chain extends readonly [infer Head, ...infer Rest]
  ? Last<Rest, StageValue<Head> extends NoStage ? Context : StageValue<Head>>
  : Context;
/**
 * The context a route chain's `.context()` stages build: what its last stage returns, as
 * it is. Each stage returns the route's whole context, so a stage that merges spreads the
 * context it receives itself. `{}` without a stage.
 *
 * @typeParam Chain - A route's contribution chain.
 */
export type ChainContext<Chain> = Last<Chain, {}>;

type NamespacesOf<Own> = Own extends {
  readonly remote: (...args: never[]) => infer Namespaces;
}
  ? Namespaces
  : {};
type Collect<Chain, Namespaces> = Chain extends readonly [infer Head, ...infer Rest]
  ? Collect<Rest, Namespaces & NamespacesOf<Head>>
  : Namespaces;
/**
 * The `.remote()` namespaces a route chain declares, its own and its ancestors', keyed by
 * namespace.
 *
 * @typeParam Chain - A route's contribution chain.
 */
export type ChainNamespaces<Chain> = Flat<Collect<Chain, {}>>;
type RemoteFor<Chain> = {
  readonly [Namespace in keyof ChainNamespaces<Chain>]: Client<ChainNamespaces<Chain>[Namespace]>;
};

/**
 * A route's client: one {@link Client} per namespace the route can see, its own and its
 * ancestors'. A route copy exports it as `Remote`, and it's the type of `route.remote` and
 * of `remote` in the route's kept callbacks.
 *
 * @typeParam Route - A route made by Launch's `defineRoute`, or its copy.
 */
export type RemoteOf<Route> = RemoteFor<ContributionOf<Route>>;
/**
 * The context a route's procedures receive: what its own and its ancestors' `.context()`
 * stages build. A route copy exports it as `Context`.
 *
 * @typeParam Route - A route made by Launch's `defineRoute`, or its copy.
 */
export type ContextOf<Route> = ChainContext<ContributionOf<Route>>;

// A step's own-record entry: `{ [name]: argument }` for a step that takes one argument.
type OwnEntry<Name extends string, Args> = Args extends readonly [infer Value]
  ? { readonly [Key in Name]: Value }
  : {};

type UseEntry<Args> = { readonly use: Args };
type InputMembers<Chain> = {
  /** The route's client, its own and its ancestors' namespaces. */
  readonly remote: RemoteFor<Chain>;
};

/** The signature of a route's `.context(stage)` step. */
export interface ContextStep extends StepSignature {
  /** One stage, which receives the context of the stages above it. */
  readonly parameters: [
    stage: (args: StageArgs<ChainContext<this["chain"]>>) => object | PromiseLike<object>,
  ];
  /** The route's own record keeps the stage under `context`. */
  readonly own: OwnEntry<"context", this["args"]>;
}
/** The signature of a route's `.use(...middleware)` step. */
export interface UseStep extends StepSignature {
  /**
   * Middleware that each accept the route's context: `middleware()` definitions, or bare
   * functions, which receive it typed.
   */
  readonly parameters: readonly (
    | MiddlewareDefinition<NoInfer<ChainContext<this["chain"]>>>
    | MiddlewareDefinition<NoInfer<ChainContext<this["chain"]>>>["run"]
  )[];
  /** The route's own record keeps the middleware under `use`. */
  readonly own: UseEntry<this["args"]>;
}
/** The signature of a route's `.remote(build)` step. */
export interface RemoteStep extends StepSignature {
  /** A callback returning the route's namespaces, built with the route's context. */
  readonly parameters: [
    build: (
      procedures: ProcedureBuilder<ChainContext<this["chain"]>>,
    ) => Readonly<Record<string, Readonly<Record<string, ProcedureDefinition>>>>,
  ];
  /** The route's own record keeps the callback under `remote`. */
  readonly own: OwnEntry<"remote", this["args"]>;
}
/** What Launch adds to a route's kept router callbacks: `remote`. */
export interface LaunchInput extends InputContribution {
  /** The members kept callbacks receive besides the router's own. */
  readonly input: InputMembers<this["chain"]>;
}
/**
 * One entry of Launch's step manifest.
 *
 * @typeParam Name - The step's method name.
 * @typeParam Type - The step's typing.
 * @typeParam Max - The most arguments it takes: one, or any number (`null`).
 */
export interface LaunchStep<Name extends string, Type extends StepSignature, Max extends 1 | null> {
  /** The step's method name on the route chain. */
  readonly name: Name;
  /** The step's typing. */
  readonly type: Type;
  /** Always `true`: route copies strip the step, and only the server runs it. */
  readonly serverOnly: true;
  /** How many arguments the step takes. */
  readonly arity: {
    /** At least one. */
    readonly min: 1;
    /** One, or any number. */
    readonly max: Max;
  };
}
/** Launch's route extension: `.context()`, `.use()` and `.remote()`, all server-only. */
export interface LaunchSpec extends ExtensionSpec {
  /** The steps, in the order a route may use them, each at most once. */
  readonly steps: readonly [
    LaunchStep<"context", ContextStep, 1>,
    LaunchStep<"use", UseStep, null>,
    LaunchStep<"remote", RemoteStep, 1>,
  ];
  /** What Launch adds to kept router callbacks. */
  readonly input: LaunchInput;
  /** The brand that ties a route's type to Launch's extension. */
  readonly witness: typeof launch;
}
