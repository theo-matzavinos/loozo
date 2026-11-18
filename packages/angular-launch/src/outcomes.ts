import { serializeJson } from "./json.js";
import { targetSegments, type TranslateRedirect } from "./redirect-translation.js";

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
 * The rejection of a call whose stage, middleware or handler threw `redirect()`.
 *
 * @remarks
 * Generated callables reject with it for a response that is exactly a redirect frame, and
 * stream iteration throws it. In a guard or resolver, {@link rpcNavigationErrors} turns it
 * into a navigation to {@link RpcRedirect.to}; anywhere else, nothing navigates for you.
 *
 * With `translateSegments` and `provideRedirectTranslation()` installed, `to` is in the
 * page's language, in the browser and while rendering a live request: it equals the page's
 * own `createUrl` for the same destination and values. The wire frame and every
 * `HttpInterceptor` see the canonical URL with its `words`.
 */
export class RpcRedirect extends Error {
  /**
   * Creates a redirect rejection.
   *
   * @param to - The root-relative URL the server redirected to.
   */
  constructor(
    /**
     * The root-relative URL the server redirected to, such as `/sign-in`, in this build's
     * language for a translated app.
     */
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

// Valid `words`: a non-empty array of strictly increasing integer ordinals of `to`'s path
// segments, on a path createUrl writes.
function validWords(words: unknown, to: string): words is readonly number[] {
  if (!Array.isArray(words) || words.length === 0) {
    return false;
  }

  const segments = targetSegments(to);

  if (segments === undefined) {
    return false;
  }

  let previous = -1;

  for (const at of words) {
    if (!Number.isInteger(at) || at <= previous || at >= segments.length) {
      return false;
    }

    previous = at;
  }

  return true;
}

/**
 * Recognizes a response body that is exactly a redirect or not-found frame.
 *
 * @remarks
 * Internal. A redirect is status 303 with exactly `{ redirect: { to } }` or
 * `{ redirect: { to, words } }`, where `to` is root-relative and `words` lists, strictly
 * increasing, the ordinals of its path segments that hold static words, on a path `createUrl`
 * writes (`targetSegments`); not-found is status 404 with exactly
 * `{ notFound: null }`. The body must be strict JSON. A redirect with `words` goes through
 * `translate` when one is given; anything else keeps its `to`.
 *
 * @param value - The parsed response body.
 * @param status - The response's HTTP status.
 * @param translate - Puts a frame's listed words in this build's language.
 * @returns The rejection to use, or `undefined` when the body doesn't match exactly.
 */
export function recognizedOutcome(
  value: unknown,
  status: number,
  translate?: TranslateRedirect,
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

  if (typeof redirect !== "object" || redirect === null || !("to" in redirect)) {
    return undefined;
  }

  const keys = Object.keys(redirect).length;
  const hasWords = "words" in redirect;

  if (keys !== (hasWords ? 2 : 1) || !isRootRelative(redirect.to)) {
    return undefined;
  }

  if (!hasWords) {
    return new RpcRedirect(redirect.to);
  }

  if (!validWords(redirect.words, redirect.to)) {
    return undefined;
  }

  if (!translate) {
    return new RpcRedirect(redirect.to);
  }

  const translated = translate(redirect.to, redirect.words);

  if (!isRootRelative(translated)) {
    return undefined;
  }

  return new RpcRedirect(translated);
}
