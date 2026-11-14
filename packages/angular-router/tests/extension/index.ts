// A test route extension shaped like Launch's: context, middleware and procedure steps
// before the router's own, plus an `rpc` callback input. It imports only the router's
// `/_core` seam, so its emitted declarations are what a published extension ships.
import { assertInInjectionContext, inject, InjectionToken, REQUEST } from "@angular/core";
import {
  createRouteFactory,
  type ContributionRecord,
  type ExtensionSpec,
  type InputContribution,
  type RuntimeExtension,
  type StepSignature,
} from "@loozo/angular-router/_core";

export declare const witness: unique symbol;
export interface User {
  id: string;
  name: string;
}

type Flat<T> = { [K in keyof T]: T[K] };
type Merge<A, B> = Flat<Omit<A, keyof B> & B>;
type ContextRecord<Own> = Own extends { context: (...args: never[]) => infer Added } ? Added : {};
type GroupsRecord<Own> = Own extends { procedures: (...args: never[]) => infer Groups }
  ? Groups
  : {};
/** The context a chain's context steps add up to, root first. */
export type Context<Chain extends readonly object[], C = {}> = Chain extends readonly [
  infer Head,
  ...infer Rest extends readonly object[],
]
  ? Context<Rest, Merge<C, ContextRecord<Head>>>
  : C;
/** The procedure groups a chain's procedures steps add up to, root first. */
export type Groups<Chain extends readonly object[], G = {}> = Chain extends readonly [
  infer Head,
  ...infer Rest extends readonly object[],
]
  ? Groups<Rest, Merge<G, GroupsRecord<Head>>>
  : G;
type ContextOf<C> = C extends readonly object[] ? Context<C> : {};
type GroupsOf<C> = C extends readonly object[] ? Groups<C> : {};

export type Middleware<C> = (args: { context: C }) => void;
export interface Builder<C> {
  query<R>(handler: (args: { context: C }) => R): () => R;
}
type Stage<C> = { context: C };
type UseRecord<A> = { use: A };
type Members<G> = {
  /** Own and inherited procedure groups. */
  rpc: G;
  /** The SSR request URL, or null in the browser. */
  request: string | null;
};
type RecordOf<Name extends string, A> = A extends readonly [infer Value]
  ? { [K in Name]: Value }
  : {};

export interface ContextStep extends StepSignature {
  readonly parameters: [stage: (args: Stage<ContextOf<this["chain"]>>) => object];
  readonly own: RecordOf<"context", this["args"]>;
}
export interface UseStep extends StepSignature {
  readonly parameters: readonly Middleware<NoInfer<ContextOf<this["chain"]>>>[];
  readonly own: UseRecord<this["args"]>;
}
export interface ProceduresStep extends StepSignature {
  readonly parameters: [
    build: (
      builder: Builder<ContextOf<this["chain"]>>,
    ) => Record<string, Record<string, (...args: never[]) => unknown>>,
  ];
  readonly own: RecordOf<"procedures", this["args"]>;
}
export interface Input extends InputContribution {
  readonly input: Members<GroupsOf<this["chain"]>>;
}
export interface FixtureSpec extends ExtensionSpec {
  readonly steps: readonly [
    { name: "context"; type: ContextStep; serverOnly: true; arity: { min: 1; max: 1 } },
    { name: "use"; type: UseStep; serverOnly: true; arity: { min: 0; max: null } },
    { name: "procedures"; type: ProceduresStep; serverOnly: true; arity: { min: 1; max: 1 } },
  ];
  readonly input: Input;
  readonly witness: typeof witness;
}

/** Counts `input()` calls in the current application (per request under SSR). */
export const inputProbe = new InjectionToken<{ calls: number }>("route extension input probe", {
  providedIn: "root",
  factory: () => ({ calls: 0 }),
});

// No stage runner: context and middleware are only recorded. Procedure handlers get an
// empty context.
const builder: Builder<never> = {
  query: (handler) => () => handler({ context: {} as never }),
};

function input(chain: readonly ContributionRecord[]): object {
  assertInInjectionContext(input);

  const probe = inject(inputProbe);
  const request = inject(REQUEST, { optional: true });
  const rpc: Record<string, unknown> = {};

  probe.calls += 1;

  for (const record of chain) {
    const build = record.procedures;

    if (typeof build === "function") {
      Object.assign(rpc, build(builder));
    }
  }

  return { rpc, request: request?.url ?? null };
}

export const fixtureRuntime: RuntimeExtension<FixtureSpec> = {
  steps: [
    { name: "context", serverOnly: true, arity: { min: 1, max: 1 } },
    { name: "use", serverOnly: true, arity: { min: 0, max: null } },
    { name: "procedures", serverOnly: true, arity: { min: 1, max: 1 } },
  ],
  input,
};

export const defineRoute = createRouteFactory<FixtureSpec>(fixtureRuntime);

export const timing: Middleware<{}> = () => {};
export const needsUser: Middleware<{ user: User }> = ({ context }) => {
  context.user.id;
};
export const needsMissing: Middleware<{ missing: number }> = () => {};
