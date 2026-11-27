import type { HandleOptions } from "./dispatch.js";

/**
 * One call's settlement: resolves once `outcome` has, then once every continuation in
 * `continuations` has.
 *
 * @remarks
 * Internal. Continuations are read in order and again as long as more arrive while it waits,
 * so work that middleware started with `next()` and didn't wait for is waited for too. A
 * continuation that rejects doesn't end the wait: `runChain` already reported it, and the
 * settlement never rejects.
 *
 * @param outcome - The call's reply, from `runProcedure`, which never rejects.
 * @param continuations - The call's continuations, which `runProcedure` keeps adding to.
 * @returns The settlement.
 */
export async function callSettlement(
  outcome: Promise<unknown>,
  continuations: readonly Promise<unknown>[],
): Promise<void> {
  await outcome;

  for (let index = 0; index < continuations.length; index += 1) {
    await continuations[index].catch(() => undefined);
  }
}

/**
 * Hands one call's settlement to the host's `waitUntil`, if it has one.
 *
 * @remarks
 * Internal. A `waitUntil` that throws is logged, and the call goes on unheld.
 *
 * @param waitUntil - The host's `waitUntil`, from {@link HandleOptions}.
 * @param settled - The call's settlement, from {@link callSettlement}.
 */
export function holdCall(waitUntil: HandleOptions["waitUntil"], settled: Promise<void>): void {
  if (waitUntil === undefined) {
    return;
  }

  try {
    waitUntil(settled);
  } catch (error) {
    console.error("Launch couldn't hand a call to waitUntil", error);
  }
}
