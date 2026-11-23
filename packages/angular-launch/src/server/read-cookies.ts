import { parseCookies } from "../cookies.js";

/**
 * Reads the request's cookies from its `Cookie` header.
 *
 * @remarks
 * Values are returned as sent, without decoding, as `setCookie` doesn't encode. A repeated
 * name keeps its first occurrence in the header. The header doesn't carry the cookies' paths
 * or domains, so which cookie that is depends on the browser's order. Pairs without a name
 * are skipped. During server rendering every call reads the page request, so a cookie set
 * earlier in the render isn't seen.
 *
 * @example
 * ```ts
 * const token = readCookies(request).get("session");
 * ```
 *
 * @param request - The request, such as `request` in a stage, middleware or handler.
 * @returns A new map of cookie values by name.
 */
export function readCookies(request: Request): ReadonlyMap<string, string> {
  return parseCookies(request.headers.get("cookie"));
}
