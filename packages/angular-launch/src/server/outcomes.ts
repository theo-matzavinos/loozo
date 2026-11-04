// Keyed with Symbol.for so the brand survives the duplicate module copies a native SSR
// bundle may load, and non-enumerable so it never reaches JSON.
const outcomeKey = Symbol.for("@loozo/angular-launch/outcome/v1");

/** What a thrown outcome asks the server to answer with. Internal. */
export interface Outcome {
  readonly kind: "forbidden";
}

/**
 * Creates an error that refuses the call with `FORBIDDEN` when thrown from middleware
 * or a handler.
 *
 * @example
 * ```ts
 * if (context.user === null) {
 *   throw forbidden();
 * }
 * ```
 *
 * @returns The error to `throw`.
 */
export function forbidden(): Error {
  const error = new Error("RPC forbidden");
  const outcome: Outcome = { kind: "forbidden" };

  Object.defineProperty(error, outcomeKey, { value: outcome });

  return error;
}

/**
 * Reads the outcome a thrown value carries, if it was created by an outcome factory.
 * Internal.
 *
 * @param error - The thrown value.
 * @returns The outcome, or `undefined` for any other value.
 */
export function outcomeOf(error: unknown): Outcome | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const descriptor = Object.getOwnPropertyDescriptor(error, outcomeKey);

  return descriptor?.value as Outcome | undefined;
}
