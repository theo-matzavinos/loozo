import type { ResponseControl } from "./response-effects.js";

/**
 * What a stage receives.
 *
 * @remarks
 * Internal; not exported from an entry point.
 */
export interface StageArgs {
  /** The context of the stages before this one; `{}` for the first stage. */
  readonly context: object;
  /** The request scope's bound request. */
  readonly request: Request;
  /** The response effects of the call that runs this stage. */
  readonly response: ResponseControl;
  /** The request scope's signal. */
  readonly signal: AbortSignal;
}

/**
 * One step that derives context. Its value is spread over its parent's context, so a key
 * it returns replaces the parent's.
 *
 * @remarks
 * Internal; not exported from an entry point.
 */
export interface Stage {
  readonly run: (args: StageArgs) => object | PromiseLike<object>;
}

/**
 * The part of {@link StageArgs} owned by the request scope.
 *
 * @remarks
 * Internal; not exported from an entry point.
 */
export type StageScope = Pick<StageArgs, "request" | "signal">;

/**
 * Runs `chain` from its first stage for one call and resolves to the last stage's context.
 *
 * @remarks
 * Internal; not exported from an entry point.
 * Each stage runs at most once per runner, for the first call that reaches it and with that
 * call's `response`; later chains sharing a stage reuse its memoized result, rejections
 * included. A stage must always have the same stages before it.
 */
export type StageRunner = (
  chain: readonly [Stage, ...Stage[]],
  response: ResponseControl,
) => Promise<object>;

/**
 * Creates the stage runner for one request scope.
 *
 * @remarks
 * Internal; not exported from an entry point.
 *
 * @param scope - The request and signal every stage of the scope receives.
 * @returns The scope's stage runner.
 */
export function createStageRunner(scope: StageScope): StageRunner {
  // Each stage's resulting context, cumulative up to and including it.
  const memo = new Map<Stage, Promise<object>>();

  return (chain, response) => {
    let parent: Promise<object> | undefined;

    for (const stage of chain) {
      let entry = memo.get(stage);

      if (entry === undefined) {
        if (parent === undefined) {
          // The first stage is called now, synchronously, and spread over `{}`.
          entry = invoke(stage, { ...scope, response, context: {} }).then((own) => ({ ...own }));
        } else {
          entry = parent.then((context) =>
            invoke(stage, { ...scope, response, context }).then((own) => ({ ...context, ...own })),
          );
        }

        // Stored before it settles, so a rejection is memoized too.
        memo.set(stage, entry);
      }

      parent = entry;
    }

    // A non-empty chain always sets it.
    return parent as Promise<object>;
  };
}

function invoke(stage: Stage, args: StageArgs): Promise<object> {
  try {
    return Promise.resolve(stage.run(args));
  } catch (error) {
    return Promise.reject(error);
  }
}
