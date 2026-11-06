import { serializeJson } from "./json.js";

const base = "http://launch.invalid";

/**
 * Whether `to` is a root-relative URL that stays on the app's origin.
 *
 * @remarks
 * Internal. `//host` and `/\host` start with a slash but name another host, and the URL
 * parser strips tabs and newlines, so the check resolves `to` against an origin instead
 * of reading it.
 */
export function isRootRelative(to: unknown): to is `/${string}` {
  if (typeof to !== "string" || !to.startsWith("/")) {
    return false;
  }

  let resolved: URL;

  try {
    resolved = new URL(to, base);
  } catch {
    return false;
  }

  return resolved.origin === base;
}

/**
 * The rejection of a call whose middleware or handler threw `redirect(to)`.
 *
 * @remarks
 * Generated callables reject with it for a response that is exactly a redirect frame, and
 * stream iteration throws it. In a guard or resolver, {@link rpcNavigationErrors} turns it
 * into a navigation to {@link RpcRedirect.to}; anywhere else, nothing navigates for you.
 */
export class RpcRedirect extends Error {
  /**
   * Creates a redirect rejection.
   *
   * @param to - The root-relative URL the server redirected to.
   */
  constructor(
    /** The root-relative URL the server redirected to, such as `/sign-in`. */
    readonly to: `/${string}`,
  ) {
    super(`RPC redirected to ${to}`);
    this.name = "RpcRedirect";
  }
}

/**
 * The rejection of a call whose middleware or handler threw `notFound()`.
 *
 * @remarks
 * Generated callables reject with it for a response that is exactly a not-found frame, and
 * stream iteration throws it. In a guard or resolver, {@link rpcNavigationErrors} renders
 * the app's not-found page instead; anywhere else, nothing navigates for you. It isn't an
 * `RpcError`: `RPC_NOT_FOUND` is a missing procedure, this is a missing resource.
 */
export class RpcNotFound extends Error {
  /** Creates a not-found rejection. */
  constructor() {
    super("RPC answered not found");
    this.name = "RpcNotFound";
  }
}

/**
 * Recognizes a response body that is exactly a redirect or not-found frame.
 *
 * @remarks
 * Internal. A redirect is status 303 with exactly `{ redirect: { to } }`, where `to` is
 * root-relative; not-found is status 404 with exactly `{ notFound: null }`. The body must
 * be strict JSON.
 *
 * @param value - The parsed response body.
 * @param status - The response's HTTP status.
 * @returns The rejection to use, or `undefined` when the body doesn't match exactly.
 */
export function recognizedOutcome(
  value: unknown,
  status: number,
): RpcRedirect | RpcNotFound | undefined {
  try {
    serializeJson(value);
  } catch {
    return undefined;
  }

  if (typeof value !== "object" || value === null || Object.keys(value).length !== 1) {
    return undefined;
  }

  if (status === 404 && "notFound" in value && value.notFound === null) {
    return new RpcNotFound();
  }

  if (status !== 303 || !("redirect" in value)) {
    return undefined;
  }

  const redirect = value.redirect;

  if (
    typeof redirect !== "object" ||
    redirect === null ||
    !("to" in redirect) ||
    Object.keys(redirect).length !== 1 ||
    !isRootRelative(redirect.to)
  ) {
    return undefined;
  }

  return new RpcRedirect(redirect.to);
}
