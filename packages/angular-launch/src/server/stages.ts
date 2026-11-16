import type { StageArgs } from "./definitions.js";
import type { ResponseControl } from "./response-effects.js";

/**
 * One route occurrence's `.context()` stage. It receives the context of the stages above it
 * and returns the route's whole context, which replaces it.
 *
 * @remarks
 * Internal; not exported from an entry point. The application binding makes one per
 * authored route that declares a stage, so a stage function shared by two routes still
 * runs once per route.
 */
export interface Stage {
  /** The authored stage function. */
  readonly run: (args: StageArgs<object>) => object | PromiseLike<object>;
  /** The declaring route's file, workspace-relative, for diagnostics. */
  readonly route: string;
}

/**
 * The part of {@link StageArgs} owned by the request scope.
 *
 * @remarks
 * Internal; not exported from an entry point.
 */
export type StageScope = Pick<StageArgs<object>, "request" | "signal">;

/**
 * What running a chain of stages settles to: the last stage's context, or the stage that
 * failed with what it threw.
 *
 * @remarks
 * Internal; not exported from an entry point. Plain data, so it crosses package copies.
 * A propagated failure is the failing stage's own result object, so the stage it names is
 * the one that threw however many chains reuse it.
 */
export type StageResult =
  | {
      /** The context the chain's last stage returned. */
      readonly context: object;
    }
  | {
      /** The stage that threw or rejected. */
      readonly failed: Stage;
      /** What it threw or rejected with, unchanged. */
      readonly error: unknown;
    };

/**
 * Runs `chain` from its first stage for one call and settles to its {@link StageResult}.
 *
 * @remarks
 * Internal; not exported from an entry point.
 * Each stage runs at most once per runner, for the first call that reaches it and with that
 * call's `response`; later chains sharing a stage reuse its memoized result, failures
 * included. A stage must always have the same stages before it. The promise never rejects.
 */
export type StageRunner = (
  chain: readonly [Stage, ...Stage[]],
  response: ResponseControl,
) => Promise<StageResult>;

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
  // Each stage's result: the context it returned, or the first failure up to it.
  const memo = new Map<Stage, Promise<StageResult>>();

  return (chain, response) => {
    let parent: Promise<StageResult> | undefined;

    for (const stage of chain) {
      let entry = memo.get(stage);

      if (entry === undefined) {
        if (parent === undefined) {
          // The first stage is called now, synchronously, and receives `{}`.
          entry = settle(stage, invoke(stage, { ...scope, response, context: {} }));
        } else {
          entry = parent.then((result) => {
            // An ancestor failed: pass its own result on, so it keeps naming that stage.
            if ("failed" in result) {
              return result;
            }

            const { context } = result;

            return settle(stage, invoke(stage, { ...scope, response, context }));
          });
        }

        // Stored before it settles, so a failure is memoized too.
        memo.set(stage, entry);
      }

      parent = entry;
    }

    // A non-empty chain always sets it.
    return parent as Promise<StageResult>;
  };
}

function settle(stage: Stage, own: Promise<object>): Promise<StageResult> {
  return own.then(
    (context) => ({ context }),
    (error: unknown) => ({ failed: stage, error }),
  );
}

function invoke(stage: Stage, args: StageArgs<object>): Promise<object> {
  try {
    return Promise.resolve(stage.run(args));
  } catch (error) {
    return Promise.reject(error);
  }
}
