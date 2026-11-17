// SP and HTAB only (RFC 6265bis WSP), as browsers trim; String#trim would also strip U+00A0.
const whitespace = /^[\t ]+|[\t ]+$/g;

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
  const cookies = new Map<string, string>();
  const header = request.headers.get("cookie");

  if (header === null) {
    return cookies;
  }

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const name = pair.slice(0, separator).replace(whitespace, "");

    if (name === "" || cookies.has(name)) {
      continue;
    }

    cookies.set(name, pair.slice(separator + 1).replace(whitespace, ""));
  }

  return cookies;
}
