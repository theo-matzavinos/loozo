import { DOCUMENT, isPlatformBrowser } from "@angular/common";
import { PLATFORM_ID, REQUEST, RESPONSE_INIT, inject, isDevMode } from "@angular/core";
import type { SearchStorage } from "@loozo/angular-router";
import { cookieName, parseCookies, serializeCookie, type CookieOptions } from "./cookies.js";

/** Options for {@link searchCookies}. */
export interface SearchCookieOptions {
  /**
   * What each cookie's name starts with, before the remembered key's id: an HTTP token, or
   * `""`. Defaults to `"search."`, so `remembered(codec, "todos.pageSize")` is stored in
   * `search.todos.pageSize`.
   */
  readonly prefix?: string;
  /** Seconds a remembered value is kept, as a positive integer. Defaults to one year. */
  readonly maxAge?: number;
  /**
   * Sends the cookies over HTTPS only. Defaults to `true`; browsers keep `Secure` cookies from
   * `http://localhost` too, so only a plain-HTTP deployment on another hostname needs `false`.
   */
  readonly secure?: boolean;
}

// RFC 6265 §6.1: browsers keep at least 4,096 bytes per cookie, name, value and attributes.
const largestCookie = 4096;
const oneYear = 60 * 60 * 24 * 365;

/**
 * Keeps the router's remembered search values in cookies, so the server's first render uses
 * them too.
 *
 * @remarks
 * Pass the result to `provideSearchStorage()` from `routes.generated.ts`, in the application
 * config the server and the browser share. Each remembered id is one cookie, `search.<id>`,
 * holding the router's text as is, with `Path=/`, `SameSite=Lax`, `Secure` and a one-year
 * `Max-Age`, and without `HttpOnly`, because the browser reads them too: they're visible to
 * page scripts, so a remembered value mustn't be a secret.
 *
 * During server rendering it reads the page request's `Cookie` header once and keeps what
 * the response leaves in the browser: every write and forget updates that, and appends a
 * `Set-Cookie` to `RESPONSE_INIT`'s headers, next to the cookies procedures set. A value
 * equal to what's there already isn't written again, so pages that change nothing send no
 * `Set-Cookie`. A page that uses it gets `Vary: Cookie`, so shared caches keep each visitor's
 * page to that visitor. In the browser it reads and writes `document.cookie` the same way. Without a
 * request, such as while Angular prerenders, it reads nothing, and without `RESPONSE_INIT` it
 * sends nothing. A value whose cookie would pass 4,096 bytes isn't stored: its old value is
 * forgotten, and development builds warn.
 *
 * @example
 * ```ts
 * import { searchCookies } from "@loozo/angular-launch";
 * import { provideSearchStorage } from "../generated/routes.generated";
 *
 * providers: [provideSearchStorage(searchCookies())];
 * ```
 *
 * @param options - The cookies' name prefix, lifetime and `Secure` attribute.
 * @returns The storage factory, which must run in an injection context.
 * @throws TypeError for a prefix that isn't an HTTP token, or a `maxAge` that isn't a
 * positive integer.
 */
export function searchCookies({
  prefix = "search.",
  maxAge = oneYear,
  secure = true,
}: SearchCookieOptions = {}): () => SearchStorage {
  if (prefix !== "" && !cookieName.test(prefix)) {
    throw new TypeError(`Invalid search cookie prefix ${JSON.stringify(prefix)}`);
  }

  if (!Number.isInteger(maxAge) || maxAge <= 0) {
    throw new TypeError("A search cookie's maxAge must be a positive integer");
  }

  const kept: CookieOptions = { maxAge, httpOnly: false, secure, sameSite: "lax" };
  const expired: CookieOptions = { maxAge: 0, expires: new Date(0), httpOnly: false, secure };

  return () => {
    let cookies: Cookies;

    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      cookies = browserCookies(inject(DOCUMENT));
    } else {
      cookies = responseCookies(
        inject(REQUEST, { optional: true }),
        inject(RESPONSE_INIT, { optional: true }),
      );
    }

    return {
      read: (id) => cookies.read(prefix + id),
      write: (id, text) => {
        const name = prefix + id;
        const cookie = serializeCookie(name, text, kept);

        // Cookie text is ASCII, so its length is its size in bytes. Checked before the equality
        // shortcut, so an oversized value is never kept, whatever is stored already.
        if (cookie.length <= largestCookie) {
          if (cookies.read(name) !== text) {
            cookies.set(name, text, cookie);
          }

          return;
        }

        if (isDevMode()) {
          console.warn(
            `@loozo/angular-launch: the remembered value of ${id} isn't stored, because its ` +
              `cookie would pass ${largestCookie} bytes`,
          );
        }

        // A stale value would come back on the next entry instead of the one the user chose.
        if (cookies.read(name) !== undefined) {
          cookies.delete(name, serializeCookie(name, "", expired));
        }
      },
      forget: (id) => {
        const name = prefix + id;

        if (cookies.read(name) !== undefined) {
          cookies.delete(name, serializeCookie(name, "", expired));
        }
      },
    };
  };
}

/** Cookies by name on one platform; `set` and `delete` get the `Set-Cookie` text to send. */
interface Cookies {
  read(name: string): string | undefined;
  set(name: string, value: string, cookie: string): void;
  delete(name: string, cookie: string): void;
}

function browserCookies(document: Document): Cookies {
  return {
    read: (name) => parseCookies(document.cookie).get(name),
    set: (_name, _value, cookie) => {
      document.cookie = cookie;
    },
    delete: (_name, cookie) => {
      document.cookie = cookie;
    },
  };
}

// What this response leaves in the browser: the request's cookies, then every write and forget.
function responseCookies(request: Request | null, response: ResponseInit | null): Cookies {
  const effective = parseCookies(request?.headers.get("cookie") ?? null);
  let varied = false;

  // Angular builds the page response, and its redirects, from these headers. It creates them as
  // Headers; keep that object, as the rendering backend does for procedures' cookies.
  function headers(): Headers | undefined {
    if (response === null) {
      return undefined;
    }

    if (!(response.headers instanceof Headers)) {
      response.headers = new Headers(response.headers);
    }

    return response.headers;
  }

  // A page that uses remembered values answers each visitor's cookies: a redirect, the fallback
  // page or a Set-Cookie. Angular merges this into its redirects' Vary.
  function use(): Map<string, string> {
    if (!varied) {
      varied = true;
      headers()?.append("vary", "Cookie");
    }

    return effective;
  }

  return {
    read: (name) => use().get(name),
    set: (name, value, cookie) => {
      use().set(name, value);
      headers()?.append("set-cookie", cookie);
    },
    delete: (name, cookie) => {
      use().delete(name);
      headers()?.append("set-cookie", cookie);
    },
  };
}
