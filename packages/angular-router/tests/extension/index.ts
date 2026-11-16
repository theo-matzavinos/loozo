// A test route extension shaped like Launch's: context, middleware and remote steps before
// the router's own, plus a `remote` callback input and handle member. Every step is
// server-only, so route copies strip them all: a copy's types come from its authored
// declaration, and its runtime `remote` from the copy data generation writes, as Launch's
// do. It imports only the router's `/_core` seam, so its emitted declarations are what a
// published extension ships.
import {
  assertInInjectionContext,
  inject,
  InjectionToken,
  REQUEST,
  runInInjectionContext,
  type Injector,
} from "@angular/core";
import {
  createRouteFactory,
  type ContributionOf,
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
type GroupsRecord<Own> = Own extends { remote: (...args: never[]) => infer Groups } ? Groups : {};
/** The context a chain's context steps add up to, root first. */
export type Context<Chain extends readonly object[], C = {}> = Chain extends readonly [
  infer Head,
  ...infer Rest extends readonly object[],
]
  ? Context<Rest, Merge<C, ContextRecord<Head>>>
  : C;
/** The procedure groups a chain's remote steps add up to, root first. */
export type Groups<Chain extends readonly object[], G = {}> = Chain extends readonly [
  infer Head,
  ...infer Rest extends readonly object[],
]
  ? Groups<Rest, Merge<G, GroupsRecord<Head>>>
  : G;
type ChainContext<C> = C extends readonly object[] ? Context<C> : {};
type GroupsOf<C> = C extends readonly object[] ? Groups<C> : {};
/** A route's own and inherited procedure groups. */
export type RemoteOf<Route> = Groups<ContributionOf<Route>>;
/** A route's context, after its own and its ancestors' context steps. */
export type ContextOf<Route> = Context<ContributionOf<Route>>;

export type Middleware<C> = (args: { context: C }) => void;
export interface Builder<C> {
  query<R>(handler: (args: { context: C }) => R): () => R;
  query<I, R>(handler: (args: { input: I; context: C }) => R): (input: I) => R;
}
type Stage<C> = { context: C };
type UseRecord<A> = { use: A };
type Members<G> = {
  /** Own and inherited procedure groups. */
  remote: G;
  /** The SSR request URL, or null in the browser. */
  request: string | null;
};
type RecordOf<Name extends string, A> = A extends readonly [infer Value]
  ? { [K in Name]: Value }
  : {};

export interface ContextStep extends StepSignature {
  readonly parameters: [stage: (args: Stage<ChainContext<this["chain"]>>) => object];
  readonly own: RecordOf<"context", this["args"]>;
}
export interface UseStep extends StepSignature {
  readonly parameters: readonly Middleware<NoInfer<ChainContext<this["chain"]>>>[];
  readonly own: UseRecord<this["args"]>;
}
export interface RemoteStep extends StepSignature {
  readonly parameters: [
    build: (
      builder: Builder<ChainContext<this["chain"]>>,
    ) => Record<string, Record<string, (...args: never[]) => unknown>>,
  ];
  readonly own: RecordOf<"remote", this["args"]>;
}
export interface Input extends InputContribution {
  readonly input: Members<GroupsOf<this["chain"]>>;
}
export interface FixtureSpec extends ExtensionSpec {
  readonly steps: readonly [
    { name: "context"; type: ContextStep; serverOnly: true; arity: { min: 1; max: 1 } },
    { name: "use"; type: UseStep; serverOnly: true; arity: { min: 0; max: null } },
    { name: "remote"; type: RemoteStep; serverOnly: true; arity: { min: 1; max: 1 } },
  ];
  readonly input: Input;
  readonly witness: typeof witness;
}

/** Counts `input()` calls in the current application (per request under SSR). */
export const inputProbe = new InjectionToken<{ calls: number }>("route extension input probe", {
  providedIn: "root",
  factory: () => ({ calls: 0 }),
});

/**
 * Counts `remote` handle members built, and records the `remoteLabel` each build injected:
 * a route's providers can override the label, so a build shows whose injector it ran in.
 */
export const handleProbe = new InjectionToken<{ builds: number; labels: string[] }>(
  "route extension handle probe",
  { providedIn: "root", factory: () => ({ builds: 0, labels: [] }) },
);
export const remoteLabel = new InjectionToken<string>("route extension remote label", {
  providedIn: "root",
  factory: () => "root",
});

// A copy's generation data: `{ remote: { namespace: ["procedure", …] } }`. Authored records
// hold the builder callback instead, which never runs in the browser.
function client(chain: readonly ContributionRecord[]): Record<string, Record<string, unknown>> {
  const remote: Record<string, Record<string, unknown>> = {};

  for (const record of chain) {
    const data = record.remote;

    if (typeof data !== "object" || data === null) {
      continue;
    }

    for (const [namespace, procedures] of Object.entries(data as Record<string, string[]>)) {
      const methods: Record<string, unknown> = {};

      for (const procedure of procedures) {
        methods[procedure] = (input?: unknown) =>
          `${namespace}.${procedure}(${JSON.stringify(input) ?? ""})`;
      }

      remote[namespace] = methods;
    }
  }

  return remote;
}

function input(chain: readonly ContributionRecord[]): object {
  assertInInjectionContext(input);

  const probe = inject(inputProbe);
  const request = inject(REQUEST, { optional: true });

  probe.calls += 1;

  return { remote: client(chain), request: request?.url ?? null };
}

// A lazy getter: the first read builds the client in the handle creator's injector, whether
// or not that read happens in an injection context.
function handle(chain: readonly ContributionRecord[], injector: Injector): object {
  let built: object | undefined;

  return {
    get remote() {
      if (!built) {
        built = runInInjectionContext(injector, () => {
          const probe = inject(handleProbe);

          probe.builds += 1;
          probe.labels.push(inject(remoteLabel));

          return client(chain);
        });
      }

      return built;
    },
  };
}

export const fixtureRuntime: RuntimeExtension<FixtureSpec> = {
  steps: [
    { name: "context", serverOnly: true, arity: { min: 1, max: 1 } },
    { name: "use", serverOnly: true, arity: { min: 0, max: null } },
    { name: "remote", serverOnly: true, arity: { min: 1, max: 1 } },
  ],
  input,
  handle,
};

export const defineRoute = createRouteFactory<FixtureSpec>(fixtureRuntime);

export const timing: Middleware<{}> = () => {};
export const needsUser: Middleware<{ user: User }> = ({ context }) => {
  context.user.id;
};
export const needsMissing: Middleware<{ missing: number }> = () => {};
