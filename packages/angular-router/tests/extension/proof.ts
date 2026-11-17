// Type proof for the route extension seam, compiled by typecheck:consumers against the
// built declarations. Every negative is one expression on its own @ts-expect-error line.
import { defineRoute as router } from "@loozo/angular-router";
import type { ContributionOf, RouteSchema, RuntimeExtension } from "@loozo/angular-router/_core";
import {
  defineRoute,
  witness,
  timing,
  needsUser,
  needsMissing,
  type FixtureSpec,
  type User,
  type Context,
  type Groups,
} from "./index.js";
import { defineRoute as annotated } from "./annotated.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;

const parent = defineRoute("parent", {})
  .context(() => ({ user: null as User | null }))
  .remote(({ query }) => ({
    inherited: {
      status: query(({ context }) => {
        type ParentContext = Assert<Equal<typeof context, { user: User | null }>>;

        return context.user?.name;
      }),
    },
  }));
// A router-made intermediate forwards the chain unchanged.
const intermediate = router("middle", { parent }).title("middle");
type Forwarded = Assert<Equal<ContributionOf<typeof intermediate>, ContributionOf<typeof parent>>>;

export const child = defineRoute("child", { parent: intermediate })
  .context(({ context }) => {
    type Before = Assert<Equal<typeof context, { user: User | null }>>;

    if (!context.user) {
      throw new Error("forbidden");
    }

    return { user: context.user };
  })
  .use(timing, needsUser)
  .remote(({ query }) => ({
    account: {
      me: query(({ context }) => {
        type After = Assert<Equal<typeof context, { user: User }>>;

        return context.user.id;
      }),
      get: query(({ input }: { input: { id: string } }) => ({ id: input.id })),
    },
  }))
  .resolve({
    me: ({ remote }) => {
      type Own = Assert<Equal<ReturnType<typeof remote.account.me>, string>>;
      type Inherited = Assert<
        Equal<ReturnType<typeof remote.inherited.status>, string | undefined>
      >;

      // @ts-expect-error a group no step declared
      remote.missing;
      // @ts-expect-error the procedure's input is { id: string }
      remote.account.get({ id: 1 });

      return remote.account.me();
    },
  })
  .title(({ remote }) => remote.account.me())
  .canActivate([({ remote }) => Boolean(remote.inherited.status() || remote.account.me())])
  .canActivateChild([({ remote }) => Boolean(remote.account.me())])
  .canMatch([({ remote, request }) => Boolean(remote.account.me() || request)]);

type Narrowed = Assert<Equal<Context<ContributionOf<typeof child>>, { user: User }>>;
type ExactGroups = Assert<
  Equal<
    Groups<ContributionOf<typeof child>>,
    {
      inherited: { status: () => string | undefined };
      account: { me: () => string; get: (input: { id: string }) => { id: string } };
    }
  >
>;
type Witness = Assert<Equal<(typeof child)[typeof witness], ContributionOf<typeof child>>>;
type ChainLength = Assert<Equal<ContributionOf<typeof child>["length"], 2>>;
// The storage rule: a variadic step stores its argument tuple.
type StoredUse = Assert<
  Equal<ContributionOf<typeof child>[1]["use"], [typeof timing, typeof needsUser]>
>;

type OwnStage = ContributionOf<typeof child>[1] extends {
  context: infer Fn extends (...args: never[]) => unknown;
}
  ? ReturnType<Fn>
  : never;
type ExactAdded = Assert<Equal<OwnStage, { user: User }>>;
type NotAny = Assert<Equal<IsAny<OwnStage>, false>>;
type OwnGroups = ContributionOf<typeof child>[1] extends {
  remote: infer Fn extends (...args: never[]) => unknown;
}
  ? ReturnType<Fn>
  : never;
type ExactOwnGroups = Assert<
  Equal<
    OwnGroups,
    { account: { me: () => string; get: (input: { id: string }) => { id: string } } }
  >
>;

// A descendant without a context step inherits the narrowed context.
const below = defineRoute("below", { parent: child })
  .use(needsUser)
  .remote(({ query }) => ({ next: { id: query(({ context }) => context.user.id) } }));
type BelowContext = Assert<Equal<Context<ContributionOf<typeof below>>, { user: User }>>;

// Context additions keep inherited keys.
const more = defineRoute("more", { parent: child }).context(() => ({ organization: "org" }));
type MergeContext = Assert<
  Equal<Context<ContributionOf<typeof more>>, { user: User; organization: string }>
>;

// Inline unannotated middleware see the narrowed context.
defineRoute("inline", { parent: child }).use(
  ({ context }) => {
    type InlineContext = Assert<Equal<typeof context, { user: User }>>;
  },
  ({ context }) => context.user.name,
);

// Each contributed step is optional.
defineRoute("none", {}).title("ok");
defineRoute("context-only", {})
  .context(() => ({ x: 1 }))
  .title("ok");
defineRoute("use-only", {}).use();
defineRoute("use-two", {}).use(timing, timing);
defineRoute("remote-only", {}).remote(({ query }) => ({ x: { one: query(() => 1) } }));
defineRoute("context-remote", {})
  .context(() => ({ x: 1 }))
  .remote(({ query }) => ({ x: { one: query(({ context }) => context.x) } }));
defineRoute("use-remote", {})
  .use(timing)
  .remote(({ query }) => ({ x: { one: query(() => 1) } }));

// The annotated factory types the same chain.
const annotatedChild = annotated("annotated", { parent })
  .context(({ context }) => ({ user: context.user! }))
  .resolve({ status: ({ remote }) => remote.inherited.status() });
type AnnotatedChain = Assert<Equal<ContributionOf<typeof annotatedChild>["length"], 2>>;

// Generated consumers read the method-free projection: no steps, no extension witness.
type ChildSchema = RouteSchema<typeof child>;
type SchemaHasNoSteps = Assert<
  Equal<"resolve" | "title" extends keyof ChildSchema ? true : false, false>
>;
type SchemaHasNoWitness = Assert<
  Equal<typeof witness extends keyof ChildSchema ? true : false, false>
>;
type Flat<T> = { [K in keyof T]: T[K] };
type SchemaData = Assert<Equal<Flat<NonNullable<ChildSchema["__data"]>>, { readonly me: string }>>;

// Negatives: the type rejects each on its own line.
const missing = defineRoute("bad", { parent: child });
// @ts-expect-error middleware context lacks `missing`
missing.use(timing, needsMissing);
// @ts-expect-error the nullable inherited user isn't narrowed
defineRoute("nullable", { parent }).use(needsUser);

const contextDone = defineRoute("repeat", {}).context(() => ({ x: 1 }));
// @ts-expect-error context is used
contextDone.context(() => ({ x: 2 }));

const useDone = defineRoute("use", {}).use(timing, timing);
// @ts-expect-error use is used
useDone.use(timing);
// @ts-expect-error context comes before use
useDone.context(() => ({}));

const remoteDone = defineRoute("remote", {}).remote(({ query }) => ({
  x: { one: query(() => 1) },
}));
// @ts-expect-error remote is used
remoteDone.remote(() => ({}));
// @ts-expect-error use comes before remote
remoteDone.use(timing);
// @ts-expect-error context comes before remote
remoteDone.context(() => ({}));

const late = defineRoute("late", {}).title("late");
// @ts-expect-error contributed steps come before router steps
late.context(() => ({}));

const stage = () => ({});
// @ts-expect-error context takes exactly one argument
defineRoute("arity", {}).context(stage, stage);

// The runtime half must match the spec per position.
const runtimeSteps = [
  { name: "context", serverOnly: true, arity: { min: 1, max: 1 } },
  { name: "use", serverOnly: true, arity: { min: 0, max: null } },
  { name: "remote", serverOnly: true, arity: { min: 1, max: 1 } },
] as const;
const input = () => ({});
const handle = () => ({});
const matching: RuntimeExtension<FixtureSpec> = { steps: runtimeSteps, input, handle };
void matching;
const wrongFlag: RuntimeExtension<FixtureSpec> = {
  // @ts-expect-error serverOnly differs from the spec
  steps: [runtimeSteps[0], { ...runtimeSteps[1], serverOnly: false }, runtimeSteps[2]],
  input,
  handle,
};
const wrongOrder: RuntimeExtension<FixtureSpec> = {
  // @ts-expect-error steps are out of the spec's order
  steps: [runtimeSteps[1], runtimeSteps[0], runtimeSteps[2]],
  input,
  handle,
};
const wrongArity: RuntimeExtension<FixtureSpec> = {
  // @ts-expect-error arity differs from the spec
  steps: [{ ...runtimeSteps[0], arity: { min: 0, max: 1 } }, runtimeSteps[1], runtimeSteps[2]],
  input,
  handle,
};
const missingStep: RuntimeExtension<FixtureSpec> = {
  // @ts-expect-error a step is missing
  steps: [runtimeSteps[0], runtimeSteps[1]],
  input,
  handle,
};
// @ts-expect-error handle is required
const missingHandle: RuntimeExtension<FixtureSpec> = { steps: runtimeSteps, input };
void [wrongFlag, wrongOrder, wrongArity, missingStep, missingHandle];
