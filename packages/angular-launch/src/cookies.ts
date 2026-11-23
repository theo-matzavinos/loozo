// Cookie text shared by the server's response control and request reading and by searchCookies,
// which runs in the browser too.

/**
 * The attributes of a cookie set with `response.setCookie` (`ResponseControl`).
 *
 * @remarks
 * The defaults make a first-party session cookie: `Path=/; HttpOnly; Secure; SameSite=Lax`.
 * Browsers keep `Secure` cookies from `http://localhost` too, so the defaults also work in
 * development; a plain-HTTP deployment on another hostname needs `secure: false`.
 */
export interface CookieOptions {
  /** The cookie's path. Defaults to `/`. */
  readonly path?: string;
  /** The cookie's domain. Defaults to none, so the cookie is host-only. */
  readonly domain?: string;
  /** Seconds until the cookie expires, as an integer. Defaults to none: a session cookie. */
  readonly maxAge?: number;
  /** When the cookie expires. Defaults to none: a session cookie. */
  readonly expires?: Date;
  /** Hides the cookie from page scripts. Defaults to `true`. */
  readonly httpOnly?: boolean;
  /** Sends the cookie over HTTPS only. Defaults to `true`. */
  readonly secure?: boolean;
  /** The cookie's `SameSite` attribute. Defaults to `"lax"`; `"none"` needs `secure`. */
  readonly sameSite?: "lax" | "strict" | "none";
}

// RFC 9110 token.
export const cookieName = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// RFC 6265 cookie-octet.
const cookieValue = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/;
// RFC 6265 path-value and domain: any CHAR except controls and ";".
const attributeValue = /^[\x20-\x3A\x3C-\x7E]+$/;

/** Serializes one `Set-Cookie` value. Internal. */
export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const {
    path = "/",
    domain,
    maxAge,
    expires,
    httpOnly = true,
    secure = true,
    sameSite = "lax",
  } = options;

  if (!cookieName.test(name)) {
    throw new TypeError(`Invalid cookie name ${JSON.stringify(name)}`);
  }

  if (!cookieValue.test(value)) {
    throw new TypeError(`Invalid value for cookie ${name}; encode it first`);
  }

  if (!attributeValue.test(path) || (domain !== undefined && !attributeValue.test(domain))) {
    throw new TypeError(`Invalid path or domain for cookie ${name}`);
  }

  if (maxAge !== undefined && !Number.isInteger(maxAge)) {
    throw new TypeError(`Cookie ${name}'s maxAge must be an integer`);
  }

  if (expires !== undefined && Number.isNaN(expires.getTime())) {
    throw new TypeError(`Cookie ${name}'s expires is an invalid date`);
  }

  if (sameSite === "none" && !secure) {
    throw new TypeError(`Cookie ${name} needs secure for sameSite "none"`);
  }

  let cookie = `${name}=${value}; Path=${path}`;

  if (domain !== undefined) {
    cookie += `; Domain=${domain}`;
  }

  if (maxAge !== undefined) {
    cookie += `; Max-Age=${maxAge}`;
  }

  if (expires !== undefined) {
    cookie += `; Expires=${expires.toUTCString()}`;
  }

  if (httpOnly) {
    cookie += "; HttpOnly";
  }

  if (secure) {
    cookie += "; Secure";
  }

  const sameSiteNames = { lax: "Lax", strict: "Strict", none: "None" } as const;

  return `${cookie}; SameSite=${sameSiteNames[sameSite]}`;
}

// SP and HTAB only (RFC 6265bis WSP), as browsers trim; String#trim would also strip U+00A0.
const whitespace = /^[\t ]+|[\t ]+$/g;

/**
 * Parses a `Cookie` header, or `document.cookie`, into a new map of values by name. Internal.
 *
 * @remarks
 * Pairs split on `;`, each at its first `=`, with spaces and tabs trimmed around name and value;
 * a pair without `=` or with an empty name is skipped, and a repeated name keeps its first
 * occurrence. Values stay as sent.
 */
export function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();

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
