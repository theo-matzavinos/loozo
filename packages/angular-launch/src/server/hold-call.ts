import type { HandleOptions } from "./dispatch.js";

/**
 * Hands one call's settlement to the host's `waitUntil`, if it has one.
 *
 * @remarks
 * Internal. The settlement resolves once `outcome` has, then once every continuation in
 * `continuations` has, read in order and again as long as more arrive while it waits, so
 * work that middleware started with `next()` and didn't wait for is waited for too. A
 * continuation that rejects doesn't end the wait: `runChain` already reported it, and the
 * settlement never rejects. A `waitUntil` that throws is logged, and the call goes on unheld.
 *
 * @param waitUntil - The host's `waitUntil`, from {@link HandleOptions}.
 * @param outcome - The call's reply, from `runProcedure`, which never rejects.
 * @param continuations - The call's continuations, which `runProcedure` keeps adding to.
 */
export function holdCall(
  waitUntil: HandleOptions["waitUntil"],
  outcome: Promise<unknown>,
  continuations: readonly Promise<unknown>[],
): void {
  if (waitUntil === undefined) {
    return;
  }

  async function settle(): Promise<void> {
    await outcome;

    for (let index = 0; index < continuations.length; index += 1) {
      await continuations[index].catch(() => undefined);
    }
  }

  try {
    waitUntil(settle());
  } catch (error) {
    console.error("Launch couldn't hand a call to waitUntil", error);
  }
}
