import { isRootRelative } from "../outcomes.js";

// Keyed with Symbol.for so the brand survives the duplicate module copies a native SSR
// bundle may load, and non-enumerable so it never reaches JSON.
const outcomeKey = Symbol.for("@loozo/angular-launch/outcome/v1");

/** What a thrown outcome asks the server to answer with. Internal. */
export type Outcome =
  | { readonly kind: "forbidden" }
  | { readonly kind: "notFound" }
  | { readonly kind: "redirect"; readonly to: string };

function outcomeError(message: string, outcome: Outcome): Error {
  const error = new Error(message);

  Object.defineProperty(error, outcomeKey, { value: outcome });

  return error;
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
  return outcomeError("RPC forbidden", { kind: "forbidden" });
}

/**
 * Creates an error that answers the call as not found when thrown from middleware or a
 * handler.
 *
 * @remarks
 * The caller's call rejects with `RpcNotFound` from `@loozo/angular-launch`. In a guard or
 * resolver, `rpcNavigationErrors()` renders the app's not-found page at the requested URL,
 * with status 404 during server rendering. It isn't an error code: use it for a missing
 * resource the page can't show, and a declared error for one the page handles itself.
 *
 * @example
 * ```ts
 * if (chat === null) {
 *   throw notFound();
 * }
 * ```
 *
 * @returns The error to `throw`.
 */
export function notFound(): Error {
  return outcomeError("RPC not found outcome", { kind: "notFound" });
}

/**
 * Creates an error that answers the call with a redirect to `to` when thrown from
 * middleware or a handler.
 *
 * @remarks
 * The caller's call rejects with `RpcRedirect` from `@loozo/angular-launch`. In a guard or
 * resolver, `rpcNavigationErrors()` navigates to `to` instead, which during server
 * rendering answers the page request with a 302. Nothing navigates outside navigation.
 * Only root-relative app URLs, such as `createUrl` builds, are accepted; an external
 * redirect (OAuth, for example) is data the page acts on.
 *
 * @example
 * ```ts
 * if (context.user === null) {
 *   throw redirect(createUrl(signIn, {}));
 * }
 * ```
 *
 * @param to - The root-relative URL to go to, such as `/sign-in?next=%2Ftodos`.
 * @returns The error to `throw`.
 * @throws TypeError when `to` isn't a root-relative URL of the same origin, such as
 * `https://example.com/`, `//example.com/` or `/\example.com/`.
 */
export function redirect(to: `/${string}`): Error {
  if (!isRootRelative(to)) {
    throw new TypeError(`redirect() takes a root-relative URL, not ${JSON.stringify(to)}`);
  }

  return outcomeError("RPC redirect outcome", { kind: "redirect", to });
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
